'use strict'

const fs = require('fs')
const {
	parsers,
	differential,
	readLines,
	writeFragment,
	writeMissingFragment,
	countSummary,
	listBlock,
	byExtension,
} = require('./delta.cjs')

// The two line-oriented checks. Both diff one tool's output against the same
// tool on base, so they differ only in their parser and their nouns.
const LINE_CHECKS = [
	{
		name: '10-typecheck',
		check: 'typecheck',
		title: 'Type errors',
		noun: 'error(s)',
		parse: parsers.tsc,
	},
	{
		name: '20-lint',
		check: 'lint',
		title: 'Lint',
		noun: 'issue(s)',
		parse: parsers.unix,
	},
]

const FORMAT = { name: '30-format', check: 'format', title: 'Formatter drift' }

// What `collect-static.sh` writes, plus the `touched.txt` the workflow writes
// beside it. A tree counts as measured only when every one of them is present.
// The DIRECTORY is not enough: a job that dies midway can leave an empty one,
// and empty inputs diff to "no change" — the most dangerous thing this report
// can say.
const STATIC_FILES = ['typecheck.txt', 'lint.txt', 'format.txt']

const measured = (dir, files) => files.every((f) => fs.existsSync(`${dir}/${f}`))

module.exports = function render({ head, base, out }) {
	const missingTree = !measured(head, [...STATIC_FILES, 'touched.txt'])
		? 'The PR'
		: !measured(base, STATIC_FILES)
			? 'The base branch'
			: null
	if (missingTree) {
		for (const { name, check, title } of [...LINE_CHECKS, FORMAT]) {
			writeMissingFragment(out, name, {
				check,
				title,
				reason: `${missingTree} job produced no measurement, so there is nothing to compare.`,
			})
		}
		return
	}

	for (const { name, check, title, noun, parse } of LINE_CHECKS) {
		const d = differential(
			readLines(`${base}/${check}.txt`),
			readLines(`${head}/${check}.txt`),
			parse,
		)
		writeFragment(
			out,
			name,
			[
				`#### ${title}`,
				'',
				countSummary(d, noun),
				listBlock('New', d.added),
				listBlock('Resolved', d.resolved),
			]
				.filter((l) => l !== null)
				.join('\n'),
			{ check, new: d.added.length, resolved: d.resolved.length, total: d.head },
		)
	}

	// The unit is the file, not the line, so shift-pairing is switched off.
	const headFiles = readLines(`${head}/format.txt`)
	const fmt = differential(readLines(`${base}/format.txt`), headFiles, parsers.file, 0)
	const ext = byExtension(headFiles)

	// Both lists are repo-root-relative and sorted, so a plain Set intersection
	// is enough.
	const touched = new Set(readLines(`${head}/touched.txt`))
	const dirtyTouched = headFiles.filter((f) => touched.has(f))
	const elsewhere = fmt.added.filter((e) => !touched.has(e.file))

	writeFragment(
		out,
		FORMAT.name,
		[
			`#### ${FORMAT.title}`,
			'',
			dirtyTouched.length
				? `❌ **${dirtyTouched.length} file(s) this PR touches are not formatted.** Run the formatter and commit — a file you edited ships clean, no exceptions.`
				: '✅ Every file this PR touches is formatted.',
			listBlock('Touched and unformatted', dirtyTouched),
			'',
			'Repo-wide drift below is **context, not a gate** — debt to drive toward **0** by reformatting legacy files as you touch them.',
			'',
			countSummary(fmt, 'file(s)', { showTrend: true }),
			ext.length
				? '\n**By type:** ' + ext.map(([e, n]) => `\`${e}\` ${n}`).join(' · ')
				: null,
			listBlock('Newly unformatted elsewhere', elsewhere),
			listBlock('Reformatted', fmt.resolved),
		]
			.filter((l) => l !== null)
			.join('\n'),
		{
			check: FORMAT.check,
			new: fmt.added.length,
			resolved: fmt.resolved.length,
			total: fmt.head,
			touched: dirtyTouched.length,
		},
	)
}
