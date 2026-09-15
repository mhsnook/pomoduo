import { describe, expect, it } from 'vitest'

import { type BreakKind, decide, freshTally, type Tally, type Vote } from './vote'

/** The kinds that win when the same votes are cast at the end of every pomo. */
function run(votes: Vote[], pomos: number) {
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

describe('saying nothing', () => {
	it('is not a vote, so one pick decides it', () => {
		expect(decide(['dance', null], freshTally()).kind).toBe('dance')
		expect(decide(['yap', null], freshTally()).kind).toBe('yap')
	})

	it('banks nothing, because nothing was cast', () => {
		expect(decide(['dance', null], freshTally()).tally.bank).toEqual({
			dance: 0,
			yap: 0,
		})
	})

	it('leaves a room that says nothing with the kind that suits its size', () => {
		expect(decide([null], freshTally()).kind).toBe('dance')
		expect(decide([null, null], freshTally()).kind).toBe('yap')
	})

	it('does not take turns, because a quiet room is not a tie', () => {
		expect(run([null, null], 4)).toEqual(['yap', 'yap', 'yap', 'yap'])
	})

	it('still lets a banked side through a quiet room', () => {
		const banked: Tally = { bank: { dance: 2, yap: 0 }, lastLoser: 'dance' }
		expect(decide([null, null], banked).kind).toBe('dance')
	})

	it('does not stop the people who did vote from taking turns', () => {
		expect(run(['dance', 'yap', null], 4)).toEqual(['dance', 'yap', 'dance', 'yap'])
	})
})
