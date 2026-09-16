'use strict'

// Measure a Vite + Cloudflare build into a small JSON summary.
//
//   node measure-bundle.cjs dist /tmp/out/bundle.json
//
// Runs in the build job, next to the dist/ it reads. The report job then diffs
// two summaries, so it never needs either tree — which is what lets the head
// and base builds happen once each, in parallel, on separate runners.
//
// `vite build` with @cloudflare/vite-plugin writes a split output, and the two
// halves move for different reasons, so they get separate axes:
//
//   dist/client/    the SPA. index.html names the eager set — the files a first
//                   paint must download. Everything else the build emitted is
//                   lazy, and stays on its own line.
//   dist/<worker>/  the Worker bundle Cloudflare runs. Named after `name` in
//                   wrangler.jsonc, so it is discovered rather than hardcoded.
//                   Its GZIPPED size is a hard deploy limit, not a preference.

const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

// Cloudflare's limit on a deployed Worker, gzipped, on the Workers Paid plan.
// Exceed it and `wrangler deploy` fails, so this is a budget rather than a trend.
const WORKER_GZ_LIMIT = 10 * 1024 * 1024

// Rolldown emits `name-HASH.ext` with 8 characters of hash. Strip it so the same
// logical chunk is comparable across two builds, and keep the real filename
// alongside — an unchanged hash means returning visitors still have the chunk.
//
// Each accepted length is exact, and that is load-bearing. A range like {8,20}
// matches from the FIRST dash in `client-entry-a1b2c3d4.js`, because
// `entry-a1b2c3d4` is itself inside the range — the key becomes `client.js`,
// and every chunk whose name contains a dash collapses onto a neighbour's key.
// The identity comparison would then call two different files one unchanged
// chunk. The 16- and 20-digit alternatives cover Webpack, in case the bundler
// ever changes under this app.
const STRIP_HASH = /[-.](?:[A-Za-z0-9_-]{8}|[A-Za-z0-9]{16}|[a-f0-9]{20})(\.[a-z0-9]+)$/

const sizeOf = (file) => {
	const buf = fs.readFileSync(file)
	return { raw: buf.length, gz: zlib.gzipSync(buf).length }
}

const add = (total, one) => ({ raw: total.raw + one.raw, gz: total.gz + one.gz })

/** Every file under a directory, recursively. Empty when the directory is absent. */
function walk(dir) {
	if (!fs.existsSync(dir)) return []
	const out = []
	for (const entry of fs.readdirSync(dir, { withFileTypes: true, recursive: true })) {
		if (entry.isFile()) out.push(path.join(entry.parentPath ?? entry.path, entry.name))
	}
	return out
}

/** Total raw and gzipped bytes across a list of files. */
function total(files) {
	let sum = { raw: 0, gz: 0 }
	for (const f of files) sum = add(sum, sizeOf(f))
	return sum
}

/**
 * Find the Worker output directory.
 *
 * The plugin names it after `name` in wrangler.jsonc, so hardcoding `pomoduo`
 * would break silently the day the Worker is renamed — the measurement would
 * report zero bytes and every PR would show the Worker vanishing. Take the one
 * top-level directory under dist/ that is not `client` instead.
 */
function findWorkerDir(dist) {
	const dirs = fs
		.readdirSync(dist, { withFileTypes: true })
		.filter((e) => e.isDirectory() && e.name !== 'client')
		.map((e) => path.join(dist, e.name))
	if (dirs.length !== 1) {
		throw new Error(
			`expected exactly one Worker output directory beside ${dist}/client, found ${dirs.length}`,
		)
	}
	return dirs[0]
}

function measure(dist) {
	const clientDir = path.join(dist, 'client')
	const indexPath = path.join(clientDir, 'index.html')
	if (!fs.existsSync(indexPath)) {
		throw new Error(`no index.html in ${clientDir} — did the client build run?`)
	}

	// The eager set: every asset index.html references directly. Lazy chunks are
	// part of the app a user may never download, so folding them into one total
	// would hide the number that matters.
	const html = fs.readFileSync(indexPath, 'utf8')
	const eager = [
		...new Set(
			[...html.matchAll(/assets\/[A-Za-z0-9._-]+\.(?:js|css)/g)].map((m) => m[0]),
		),
	]
	const isEager = new Set(eager.map((rel) => path.join(clientDir, rel)))

	const result = {
		js: { raw: 0, gz: 0 },
		css: { raw: 0, gz: 0 },
		entry: { raw: 0, gz: 0 },
		lazy: { raw: 0, gz: 0, count: 0 },
		// Every eager chunk, keyed by its hash-stripped name. Identity matters as
		// much as size: a chunk whose hash is unchanged is still in returning
		// visitors' caches.
		eagerChunks: {},
		fileCount: 0,
		// Where the eager set came from. This app has a real index.html, so the
		// set is exact. A build that ever lost it would have to fall back to a
		// walk, whose "eager" total is really everything the build emitted.
		eagerSource: 'index.html',
	}

	for (const rel of eager) {
		const file = path.join(clientDir, rel)
		const one = sizeOf(file)
		const name = path.basename(rel)
		result.fileCount++

		if (name.endsWith('.css')) {
			// Render-blocking on first paint, so part of the eager cost — but on its
			// own axis, because it moves when the design changes, not the logic.
			result.css = add(result.css, one)
		} else {
			result.js = add(result.js, one)
			if (/^index[-.]/.test(name)) result.entry = one
		}
		result.eagerChunks[name.replace(STRIP_HASH, '$1')] = { file: name, ...one }
	}

	// Lazy chunks: everything else under dist/client a browser could fetch.
	// Fonts and images are excluded — they are cached hard and do not belong in
	// the number watched per PR.
	for (const file of walk(clientDir)) {
		if (isEager.has(file)) continue
		if (!/\.(js|css)$/.test(file)) continue
		result.lazy = add(result.lazy, sizeOf(file))
		result.lazy.count++
		result.fileCount++
	}

	// The Worker half. Only the `.js` the plugin emitted counts against the
	// deploy limit: `wrangler.json` and `.vite/manifest.json` sit beside it as
	// deploy metadata, and static assets are uploaded separately and are not
	// part of the script.
	const workerDir = findWorkerDir(dist)
	const workerFiles = walk(workerDir).filter((f) => f.endsWith('.js'))
	if (!workerFiles.length)
		throw new Error(`no .js in ${workerDir} — did the Worker build run?`)
	result.fileCount += workerFiles.length
	result.worker = {
		...total(workerFiles),
		limit: WORKER_GZ_LIMIT,
		count: workerFiles.length,
	}

	return result
}

module.exports = {
	measure,
	walk,
	sizeOf,
	total,
	findWorkerDir,
	STRIP_HASH,
	WORKER_GZ_LIMIT,
}

if (require.main === module) {
	const [dist, out] = process.argv.slice(2)
	if (!dist || !out) {
		console.error('usage: measure-bundle.cjs <dist-dir> <output.json>')
		process.exit(2)
	}
	const r = measure(dist)
	fs.mkdirSync(path.dirname(out), { recursive: true })
	fs.writeFileSync(out, JSON.stringify(r, null, 2))
	const pct = ((r.worker.gz / WORKER_GZ_LIMIT) * 100).toFixed(1)
	console.log(
		`client eager ${(r.js.gz / 1024).toFixed(2)} kB JS + ${(r.css.gz / 1024).toFixed(2)} kB CSS gzipped ` +
			`(${Object.keys(r.eagerChunks).length} eager chunk(s), ${r.lazy.count} lazy) · ` +
			`worker ${(r.worker.gz / 1024).toFixed(2)} kB gzipped (${pct}% of the 10 MB limit)`,
	)
}
