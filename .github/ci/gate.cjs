'use strict'

const path = require('path')
const { readJson, fragmentFiles } = require('./delta.cjs')

// Strictness per check.
//   'report-only'    never fails
//   'no-new'         fails when this PR adds any issue of this kind
//   'touched-clean'  fails on any issue in a file this PR touched, new or
//                    pre-existing; issues in untouched files never fail
const POLICY = {
	build: 'no-new',
	typecheck: 'no-new',
	lint: 'no-new',
	format: 'touched-clean',
	tests: 'no-new',
	bundle: 'report-only',
}

function verdict(check, data) {
	const rule = POLICY[check] ?? 'report-only'
	if (rule === 'report-only') return null

	// A step that produced no measurement did not pass — it crashed. Treat the
	// absence as a failure, or a broken build reads as "no change" and merges
	// clean.
	if (data.missing) return 'the step produced no measurement (crashed or was skipped)'

	// Scoped to the PR's own footprint rather than to the delta: a repo-wide
	// reformat that dirties files nobody edited is not this PR's problem, and a
	// file this PR edited is, even if it was already dirty before.
	if (rule === 'touched-clean') {
		return data.touched > 0
			? `${data.touched} touched file(s) still have issues — run the formatter on the files you edited`
			: null
	}

	if (check === 'build') {
		if (data.headOk) return null
		return data.baseOk
			? 'this PR breaks the build'
			: 'neither this PR nor the base branch builds — repair the base branch first'
	}

	if (check === 'tests') {
		return data.failed > 0 ? `${data.failed} failing test(s)` : null
	}

	return data.new > 0 ? `${data.new} new issue(s)` : null
}

function main(dir) {
	const sidecars = fragmentFiles(dir, '.json')
	if (!sidecars.length) {
		console.error(`No fragments at ${dir} — every check job failed before reporting.`)
		process.exit(1)
	}

	const failures = []
	const seen = new Set()
	for (const f of sidecars) {
		const data = readJson(path.join(dir, f))
		seen.add(data.check)
		const reason = verdict(data.check, data)
		if (reason) failures.push(`${data.check}: ${reason}`)
		else if ((POLICY[data.check] ?? 'report-only') === 'report-only')
			console.log(`➖ ${data.check} (report only, not gated)`)
		else console.log(`✅ ${data.check}`)
	}

	// Every check writes a sidecar on every path, including the ones that
	// report "I could not measure this". A check with no sidecar at all means
	// its renderer never ran, so nothing here can speak for it.
	for (const [check, rule] of Object.entries(POLICY)) {
		if (rule !== 'report-only' && !seen.has(check)) {
			failures.push(`${check}: no report was produced at all`)
		}
	}

	if (!failures.length) {
		console.log('\nAll gated checks passed.')
		return
	}
	console.error('\nBlocking:')
	for (const f of failures) console.error(`  ❌ ${f}`)
	console.error('\nSee the "### PR checks" comment on the pull request for detail.')
	process.exit(1)
}

if (require.main === module) main(process.argv[2] ?? '/tmp/fragments')
