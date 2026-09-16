'use strict'

// Single-branch: a test either passes on head or it does not, so there is
// nothing to diff against base.

const fs = require('fs')
const { writeFragment, writeMissingFragment, listBlock } = require('./delta.cjs')

/**
 * `vitest run --reporter=json` writes the Jest shape: counts at the top level,
 * one entry per file in `testResults`.
 */
function parse(raw) {
	const r = JSON.parse(raw)
	const failures = []
	for (const file of r.testResults ?? []) {
		for (const t of file.assertionResults ?? []) {
			if (t.status !== 'failed') continue
			failures.push(
				`✗ ${[...(t.ancestorTitles ?? []), t.title].join(' › ')}\n` +
					`  ${file.name?.replace(process.cwd() + '/', '') ?? ''}\n` +
					`  ${(t.failureMessages ?? []).join('\n').split('\n')[0] ?? ''}`.trimEnd(),
			)
		}
	}
	return {
		total: r.numTotalTests ?? 0,
		passed: r.numPassedTests ?? 0,
		failed: r.numFailedTests ?? failures.length,
		skipped: r.numPendingTests ?? 0,
		failures,
	}
}

module.exports = function render({ results, out }) {
	if (!fs.existsSync(results)) {
		// A missing report is a failure, not a pass. `failed: 1` says so even
		// though no individual test can be named.
		writeMissingFragment(out, '50-tests', {
			check: 'tests',
			title: 'Tests',
			reason:
				'No results file was produced — the runner probably crashed before writing output.',
			failed: 1,
		})
		return
	}

	const s = parse(fs.readFileSync(results, 'utf8'))
	writeFragment(
		out,
		'50-tests',
		[
			'#### Tests',
			'',
			`${s.failed ? '❌' : '✅'} ${s.passed}/${s.total} passed` +
				(s.failed ? ` · **${s.failed} failed**` : '') +
				(s.skipped ? ` · ${s.skipped} skipped` : ''),
			listBlock('Failed', s.failures, { join: '\n\n' }),
		]
			.filter((l) => l !== null)
			.join('\n'),
		{ check: 'tests', failed: s.failed, total: s.total },
	)
}
