'use strict'

// Diff two bundle measurements and render one fragment.
//
// Takes the JSON summaries written by measure-bundle.cjs, not the built
// directories — the report job never has either tree checked out.

const {
	readJson,
	writeFragment,
	writeMissingFragment,
	formatBytes,
	deltaLabel,
	sizeTable,
} = require('./delta.cjs')

// Two builds of the same commit differ by a few bytes per chunk. Below this,
// call it unchanged rather than teaching people that the number is noise.
const NOISE_FLOOR = 512

const formatMB = (n) => (n / 1048576).toFixed(2) + ' MB'

function workerSection(base, head) {
	const limit = head.worker.limit
	const pct = (head.worker.gz / limit) * 100
	const icon = pct >= 90 ? '🔴' : pct >= 75 ? '🟠' : '🟢'
	return [
		`${icon} **${formatBytes(head.worker.gz)} gzipped — ${pct.toFixed(1)}% of Cloudflare's ${formatMB(limit)} deploy limit.**`,
		'',
		sizeTable(head.worker.raw, head.worker.gz, base.worker.raw, base.worker.gz),
	].join('\n')
}

function chunkSection(base, head) {
	const names = [
		...new Set([...Object.keys(base.eagerChunks), ...Object.keys(head.eagerChunks)]),
	].sort()
	if (!names.length) return '_No chunks in the eager set._'

	const changed = []
	let cachedRaw = 0
	let cachedGz = 0
	let cachedCount = 0

	for (const n of names) {
		const b = base.eagerChunks[n]
		const h = head.eagerChunks[n]
		if (b && h && b.file === h.file) {
			cachedCount++
			cachedRaw += h.raw
			cachedGz += h.gz
		} else {
			changed.push({ n, b, h })
		}
	}

	if (!changed.length) {
		return (
			`✅ **Every eager chunk keeps its hash** — ${cachedCount} chunk(s) totalling ` +
			`${formatBytes(cachedRaw)} raw (${formatBytes(cachedGz)} gzipped), still cached for repeat visitors.`
		)
	}

	const rows = changed.map(({ n, b, h }) => {
		if (!b)
			return `- 🆕 \`${n}\` added — ${formatBytes(h.raw)} raw (${formatBytes(h.gz)} gz)`
		if (!h) return `- ❌ \`${n}\` removed — was ${formatBytes(b.raw)} raw`
		// deltaLabel supplies the direction emoji: a chunk that shrank must not
		// render as growth.
		return `- \`${n}\` — ${formatBytes(b.raw)} → ${formatBytes(h.raw)} raw, ${deltaLabel(h.raw, b.raw)}`
	})
	const stable = cachedCount
		? `\n\n${cachedCount} other chunk(s) keep their hash — ${formatBytes(cachedRaw)} raw (${formatBytes(cachedGz)} gz), still cached.`
		: ''
	return `**Chunks that changed — repeat visitors re-download these in full:**\n${rows.join('\n')}${stable}`
}

module.exports = function render({ head, base, out }) {
	const h = readJson(head)
	const b = readJson(base)

	// An EMPTY measurement is a failed build wearing a disguise: a build that
	// exits zero and writes nothing would otherwise report a triumphant −100%.
	const empty = (m) => !m || !m.fileCount || !m.worker
	if (empty(h) || empty(b)) {
		const which =
			empty(h) && empty(b)
				? 'Neither build'
				: empty(h)
					? 'The PR build'
					: 'The base build'
		writeMissingFragment(out, '40-bundle', {
			check: 'bundle',
			title: 'Bundle size',
			reason: `${which} produced a measurable bundle, so there is nothing to compare.`,
		})
		return
	}

	const markdown = [
		'#### Bundle size',
		'',
		'**Worker** — the script Cloudflare runs, from `dist/`',
		'',
		workerSection(b, h),
		'',
		'**Client eager load** — the entry chunk plus every asset `index.html` names (what a first paint downloads)',
		'',
		sizeTable(h.js.raw, h.js.gz, b.js.raw, b.js.gz),
		'',
		'**Entry chunk** — your own code, re-downloaded on every deploy',
		'',
		sizeTable(h.entry.raw, h.entry.gz, b.entry.raw, b.entry.gz),
		'',
		'**CSS** — render-blocking on first paint',
		'',
		sizeTable(h.css.raw, h.css.gz, b.css.raw, b.css.gz),
		'',
		`**Lazy chunks** — ${h.lazy.count} file(s), ${formatBytes(h.lazy.gz)} gzipped · ` +
			`${deltaLabel(h.lazy.gz, b.lazy.gz)}. Fetched on demand, so this is context rather than first-paint cost.`,
		'',
		chunkSection(b, h),
	].join('\n')

	const floor = (n) => (Math.abs(n) < NOISE_FLOOR ? 0 : n)
	writeFragment(out, '40-bundle', markdown, {
		check: 'bundle',
		eagerRawDelta: h.js.raw - b.js.raw,
		eagerGzDelta: floor(h.js.gz - b.js.gz),
		eagerGzBase: b.js.gz,
		entryGzDelta: h.entry.gz - b.entry.gz,
		cssGzDelta: h.css.gz - b.css.gz,
		lazyGzDelta: h.lazy.gz - b.lazy.gz,
		workerGz: h.worker.gz,
		workerGzLimit: h.worker.limit,
		workerGzDelta: floor(h.worker.gz - b.worker.gz),
	})
}
