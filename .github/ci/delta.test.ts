import { describe, expect, it } from 'vitest'

import { differential, parsers } from './delta.cjs'

const unix = parsers.unix

describe('the differential engine', () => {
	it('pairs a pure line shift instead of double-counting it', () => {
		const d = differential(
			['a.ts:10:5: no-explicit-any'],
			['a.ts:14:5: no-explicit-any'],
			unix,
		)
		expect(d.added).toHaveLength(0)
		expect(d.resolved).toHaveLength(0)
		expect(d.moved).toHaveLength(1)
	})

	it('counts a shift beyond the tolerance as a genuine change', () => {
		const d = differential(
			['a.ts:10:5: no-explicit-any'],
			['a.ts:99:5: no-explicit-any'],
			unix,
		)
		expect(d.added).toHaveLength(1)
		expect(d.resolved).toHaveLength(1)
	})

	it('counts a changed column as new even when the line barely moved', () => {
		const d = differential(
			['a.ts:10:5: no-explicit-any'],
			['a.ts:11:9: no-explicit-any'],
			unix,
		)
		expect(d.added).toHaveLength(1)
	})

	it('is a plain set difference at proximity 0', () => {
		const d = differential(['x.ts'], ['y.ts'], parsers.file, 0)
		expect(d.added).toHaveLength(1)
		expect(d.resolved).toHaveLength(1)
		expect(d.moved).toHaveLength(0)
	})

	it('reports nothing for identical input', () => {
		const d = differential(['a.ts:1:1: x'], ['a.ts:1:1: x'], unix)
		expect(d.added.length + d.resolved.length + d.moved.length).toBe(0)
	})
})

describe('the parsers', () => {
	it('splits a tsc line into its parts', () => {
		const t = parsers.tsc("src/foo.ts(12,5): error TS2339: Property 'x' does not exist.")
		expect(t).toMatchObject({ file: 'src/foo.ts', line: 12, col: 5 })
	})

	it('round-trips an unparseable line instead of dropping it', () => {
		expect(parsers.tsc('some unstructured warning').raw).toBe('some unstructured warning')
	})
})
