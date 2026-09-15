import { describe, expect, it } from 'vitest'

import { type BreakKind, decide, freshTally, type Tally, votesOf } from './vote'

/** The kinds that win when the same votes are cast at the end of every pomo. */
function run(votes: BreakKind[], pomos: number) {
	let tally: Tally = freshTally()
	const kinds: BreakKind[] = []
	for (let i = 0; i < pomos; i++) {
		const result = decide(votes, tally)
		kinds.push(result.kind)
		tally = result.tally
	}
	return kinds
}

describe('the break vote', () => {
	it('gives a unanimous room its way every time', () => {
		expect(run(['yap', 'yap'], 4)).toEqual(['yap', 'yap', 'yap', 'yap'])
	})

	it('flips a 50-50 duo back and forth, starting with dance', () => {
		expect(run(['dance', 'yap'], 4)).toEqual(['dance', 'yap', 'dance', 'yap'])
	})

	it('gives the one in a 2-1 room their way every other time', () => {
		expect(run(['dance', 'dance', 'yap'], 4)).toEqual(['dance', 'yap', 'dance', 'yap'])
	})

	it('gives the one in a 4-1 room their way eventually, not never', () => {
		const kinds = run(['dance', 'dance', 'dance', 'dance', 'yap'], 8)
		expect(kinds).toEqual([
			'dance',
			'dance',
			'dance',
			'yap',
			'dance',
			'dance',
			'dance',
			'yap',
		])
	})

	it('spends the winner’s bank and banks the loser’s votes', () => {
		const first = decide(['dance', 'dance', 'yap'], freshTally())
		expect(first).toEqual({
			kind: 'dance',
			tally: { bank: { dance: 0, yap: 1 }, lastLoser: 'yap' },
		})
		const second = decide(['dance', 'dance', 'yap'], first.tally)
		expect(second).toEqual({
			kind: 'yap',
			tally: { bank: { dance: 2, yap: 0 }, lastLoser: 'dance' },
		})
	})

	it('goes to dance when nobody has voted and nothing is banked', () => {
		expect(decide([], freshTally()).kind).toBe('dance')
	})
})

describe('what silence counts as', () => {
	it('is a dance on your own', () => {
		expect(votesOf([null])).toEqual(['dance'])
	})

	it('is a yap once there is someone to yap with', () => {
		expect(votesOf([null, null])).toEqual(['yap', 'yap'])
		expect(decide(votesOf([null, null]), freshTally()).kind).toBe('yap')
	})

	it('leaves the picks people did make alone', () => {
		expect(votesOf(['dance', null, 'yap'])).toEqual(['dance', 'yap', 'yap'])
	})

	it('still gives the first tie to dance, so one pick beats one silence', () => {
		expect(decide(votesOf(['dance', null]), freshTally()).kind).toBe('dance')
	})
})
