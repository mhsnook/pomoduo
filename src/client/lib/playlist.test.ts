import { describe, expect, it } from 'vitest'

import { placeToTrack } from './playlist'

const lengths: Record<string, number> = { a: 60_000, b: 30_000 }
const lengthOf = (id: string) => lengths[id]

describe('placeToTrack', () => {
	it('finds the track and the offset inside it', () => {
		expect(placeToTrack(['a', 'b'], lengthOf, 75_000)).toEqual({
			index: 1,
			offsetMs: 15_000,
		})
	})

	it('wraps around when every length is known', () => {
		expect(placeToTrack(['a', 'b'], lengthOf, 95_000)).toEqual({
			index: 0,
			offsetMs: 5_000,
		})
	})

	it('stops in the first track whose length nobody has learned yet', () => {
		expect(placeToTrack(['a', 'c', 'b'], lengthOf, 200_000)).toEqual({
			index: 1,
			offsetMs: 140_000,
		})
	})

	it('has nothing to play from an empty playlist', () => {
		expect(placeToTrack([], lengthOf, 0)).toBeNull()
	})
})
