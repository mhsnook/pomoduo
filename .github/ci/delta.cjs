'use strict'

// Differential engine for base-vs-head CI reports: pure functions over two
// lists of tool output, plus the helpers that render them.

const fs = require('fs')
const path = require('path')

const DEFAULT_PROXIMITY = 10

// How many issues to print before collapsing to "… and N more".
const CAP = 50

// Each parser turns one raw output line into a comparable record. `rest` holds
// everything that identifies the issue APART from its line number, so a pure
// line shift can be recognised and discounted.
const parsers = {
	// tsc: src/foo.ts(12,5): error TS2339: Property 'x' does not exist.
	tsc: (raw) => {
		const m = raw.match(/^(.+?)\((\d+),(\d+)\):\s*(error\s+TS\d+:\s*.*)$/)
		return m
			? { file: m[1], line: +m[2], col: +m[3], rest: m[4], raw }
			: { file: '', line: 0, col: 0, rest: raw, raw }
	},

	// oxlint -f unix: src/foo.ts:12:5: message [rule]
	unix: (raw) => {
		const m = raw.match(/^([^:]+):(\d+):(\d+):\s*(.*)$/)
		return m
			? { file: m[1], line: +m[2], col: +m[3], rest: m[4], raw }
			: { file: '', line: 0, col: 0, rest: raw, raw }
	},

	// A bare file path, for formatter drift: the unit of change is the whole
	// file and there is no line number to shift.
	file: (raw) => ({ file: raw, line: 0, col: 0, rest: raw, raw }),
}

/**
 * Compare two sorted line lists and classify every difference.
 *
 * Set `proximity` to 0 to skip shift-pairing and get a plain set difference,
 * which is what you want when the unit is a file rather than a line.
 *
 * @returns {{base:number, head:number, added:Array, resolved:Array, moved:Array}}
 */
function differential(baseLines, headLines, parse, proximity = DEFAULT_PROXIMITY) {
	const baseSet = new Set(baseLines)
	const headSet = new Set(headLines)
	const appeared = headLines.filter((l) => !baseSet.has(l)).map(parse)
	const disappeared = baseLines.filter((l) => !headSet.has(l)).map(parse)
	const counts = { base: baseLines.length, head: headLines.length }

	if (!proximity) {
		return { ...counts, added: appeared, resolved: disappeared, moved: [] }
	}

	// An unrelated edit above an issue bumps its line number, which would
	// otherwise report as one resolved plus one new. Pair those instead: same
	// file, same column, same message, within ±proximity lines. A changed
	// column means the code itself moved, so that stays a real new issue.
	const pool = [...disappeared]
	const added = []
	const moved = []
	for (const item of appeared) {
		const i = pool.findIndex(
			(r) =>
				r.file === item.file &&
				r.col === item.col &&
				r.rest === item.rest &&
				Math.abs(r.line - item.line) <= proximity,
		)
		if (i >= 0) {
			moved.push({ from: pool[i], to: item })
			pool.splice(i, 1)
		} else {
			added.push(item)
		}
	}
	return { ...counts, added, resolved: pool, moved }
}

const readText = (p) => {
	try {
		return fs.readFileSync(p, 'utf8')
	} catch {
		return ''
	}
}

const readLines = (p) => readText(p).trim().split('\n').filter(Boolean)

const readJson = (p) => {
	const raw = readText(p)
	return raw ? JSON.parse(raw) : null
}

/** One report section: the markdown a reader sees, and the sidecar the gate reads. */
function writeFragment(out, name, markdown, sidecar) {
	fs.mkdirSync(out, { recursive: true })
	if (markdown !== null) fs.writeFileSync(path.join(out, `${name}.md`), markdown)
	fs.writeFileSync(path.join(out, `${name}.json`), JSON.stringify(sidecar, null, 2))
}

/** The fragment for a check whose input never arrived. `gate.cjs` blocks on `missing`. */
function writeMissingFragment(out, name, { check, title, reason, ...sidecar }) {
	writeFragment(out, name, `#### ${title}\n\n⚠️ ${reason} Check the job log.`, {
		check,
		missing: true,
		...sidecar,
	})
}

/** Every `<order>-<name>.<ext>` fragment in a directory, in section order. */
const fragmentFiles = (dir, ext) =>
	fs.existsSync(dir)
		? fs
				.readdirSync(dir, { recursive: true })
				.filter((f) => typeof f === 'string' && f.endsWith(ext))
				.sort()
		: []

const trend = (head, base) => (head < base ? '🟢' : head > base ? '🔺' : '➖')

const movedNote = (moved) =>
	moved.length
		? ` (${moved.length} shifted within ±${DEFAULT_PROXIMITY} lines, not counted)`
		: ''

/** "**Before:** 4 error(s) → **After:** 6 error(s) (+2 new, −0 resolved)" */
function countSummary(d, noun, { showTrend = false } = {}) {
	const prefix = showTrend ? `${trend(d.head, d.base)} ` : ''
	const change =
		d.added.length || d.resolved.length
			? ` (+${d.added.length} new, −${d.resolved.length} resolved)`
			: ' (no change)'
	return `${prefix}**Before:** ${d.base} ${noun} → **After:** ${d.head} ${noun}${change}${movedNote(d.moved)}`
}

/**
 * A fenced list, capped so one bad commit cannot blow the comment size limit.
 * Returns null when there is nothing to show, so callers can drop the section
 * with `.filter((l) => l !== null)` without also dropping their blank lines.
 */
function listBlock(title, items, { join = '\n' } = {}) {
	if (!items.length) return null
	const shown = items.slice(0, CAP).map((e) => e.raw ?? e)
	const more = items.length > CAP ? `${join}… and ${items.length - CAP} more` : ''
	return `\n**${title} (${items.length}):**\n\`\`\`\n${shown.join(join)}${more}\n\`\`\``
}

/** Group file paths by extension: 80 .json files read differently from 80 .tsx. */
function byExtension(files) {
	const counts = {}
	for (const f of files) {
		const name = f.slice(f.lastIndexOf('/') + 1)
		const dot = name.lastIndexOf('.')
		const ext = dot > 0 ? name.slice(dot) : '(no ext)'
		counts[ext] = (counts[ext] || 0) + 1
	}
	return Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
}

const formatBytes = (n) => (n / 1024).toFixed(2) + ' kB'

function deltaLabel(head, base) {
	const d = head - base
	const pct = base ? ((d / base) * 100).toFixed(2) : '0.00'
	const sign = d > 0 ? '+' : ''
	return `${trend(head, base)} ${sign}${formatBytes(d)} (${sign}${pct}%)`
}

function sizeTable(headRaw, headGz, baseRaw, baseGz) {
	return [
		'|         | Base | Head | Δ |',
		'|---------|------|------|---|',
		`| Raw | ${formatBytes(baseRaw)} | ${formatBytes(headRaw)} | ${deltaLabel(headRaw, baseRaw)} |`,
		`| Gzipped | ${formatBytes(baseGz)} | ${formatBytes(headGz)} | ${deltaLabel(headGz, baseGz)} |`,
	].join('\n')
}

module.exports = {
	parsers,
	differential,
	readText,
	readLines,
	readJson,
	writeFragment,
	writeMissingFragment,
	fragmentFiles,
	countSummary,
	listBlock,
	byExtension,
	formatBytes,
	deltaLabel,
	sizeTable,
}
