'use strict'

// Check 0: reads `build.outcome` and `build.log` from both trees' artifacts and
// says whether this PR broke the build or inherited a broken base branch.

const path = require('path')
const { readText, writeFragment, writeMissingFragment } = require('./delta.cjs')

// How many log lines to quote. Enough to carry one error plus its import trace.
const EXCERPT = 40

// The first line of an error in `vite build` output. The excerpt anchors on
// this rather than on the tail of the log, because vite prints the failing
// plugin, a stack, and pnpm's `[ELIFECYCLE]` line after the part a reader needs.
//
// `[plugin ...]` is deliberately not an anchor: a SUCCESSFUL client build emits
// `[plugin builtin:vite-reporter]` with the chunk-size warning, and anchoring
// on it would start the excerpt at a warning rather than at the failure.
const ERROR_HEADING = /^\s*(error|ERROR|Error:|\[vite[:\]]|x \[ERROR\]|✘|×|✗|failed to)/

// '' when the job never reached the recording step; otherwise the step outcome.
// Only `success` counts as built — `skipped` and `cancelled` mean the tree was
// never measured, which is not the same as a clean build.
const outcome = (dir) => readText(path.join(dir, 'build.outcome')).trim()

// The ESC control character is the point here, so `no-control-regex` is off for
// this line only.
// oxlint-disable-next-line no-control-regex
const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*m/g, '')

/**
 * Quote the part of the log a reader needs: from the first error heading, or
 * from the tail when no heading matches.
 */
function excerpt(log) {
	const lines = stripAnsi(log)
		.split('\n')
		.filter((l) => l.trim() !== '')
	if (!lines.length) return '_The build produced no output._'

	let start = lines.findIndex((l) => ERROR_HEADING.test(l))
	if (start === -1) start = Math.max(0, lines.length - EXCERPT)

	const shown = lines.slice(start, start + EXCERPT)
	const dropped = lines.length - start - shown.length
	return (
		'```\n' +
		shown.join('\n') +
		(dropped > 0 ? `\n… ${dropped} more line(s) in the job log` : '') +
		'\n```'
	)
}

module.exports = function render({ head, base, out }) {
	const headOutcome = outcome(head)
	const baseOutcome = outcome(base)
	const headOk = headOutcome === 'success'
	const baseOk = baseOutcome === 'success'

	// Neither job recorded an outcome, so neither tree was measured. Saying
	// "neither tree builds" here would blame a base branch nobody tested.
	if (!headOutcome && !baseOutcome) {
		writeMissingFragment(out, '05-build', {
			check: 'build',
			title: 'Build',
			reason: 'Neither job recorded a build outcome, so the build was never measured.',
			headOk,
			baseOk,
		})
		return
	}

	// A green build on both trees writes no markdown: a bot that says "the
	// build works" on every green PR is scroll cost. The sidecar is still
	// written, because `gate.cjs` blocks when a check reports nothing at all.
	const markdown =
		headOk && baseOk
			? null
			: [
					'#### Build',
					'',
					headOk
						? `✅ **This PR fixes the build.** The base branch does not build (\`${baseOutcome || 'no result'}\`); this tree does.`
						: baseOk
							? '❌ **This PR breaks the build.** The base branch builds and this tree does not.'
							: '❌ **Neither tree builds.** The base branch is already broken, so this PR is probably not the cause — repair the base branch first.',
					...(headOk ? [] : ['', excerpt(readText(path.join(head, 'build.log')))]),
				].join('\n')

	writeFragment(out, '05-build', markdown, { check: 'build', headOk, baseOk })
}
