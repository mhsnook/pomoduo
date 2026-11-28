import { describe, expect, it } from 'vitest'

import { reactionTo, TOLD_GRACE_MS, type Told } from './player'

const now = 100_000
const longAgo = (want: 'play' | 'pause'): Told => ({ want, at: now - TOLD_GRACE_MS })
const justNow = (want: 'play' | 'pause'): Told => ({ want, at: now - TOLD_GRACE_MS + 1 })
const current = (told: Told, hasPlayed = true) => ({ current: true, told, hasPlayed })
const other = (told: Told) => ({ current: false, told, hasPlayed: true })

describe('the end of a track', () => {
	it('moves either playlist on to its next track', () => {
		expect(reactionTo('ended', current(null), true, now)).toEqual({ type: 'next-track' })
		expect(reactionTo('ended', other(justNow('pause')), false, now)).toEqual({
			type: 'next-track',
		})
	})
})

describe('a click on the current video', () => {
	it('starts a stopped clock when the video plays', () => {
		expect(reactionTo('playing', current(longAgo('pause')), false, now)).toEqual({
			type: 'command',
			command: 'start',
		})
		expect(reactionTo('playing', current(null), false, now)).toEqual({
			type: 'command',
			command: 'start',
		})
	})

	it('pauses a running clock when the video pauses', () => {
		expect(reactionTo('paused', current(longAgo('play')), true, now)).toEqual({
			type: 'command',
			command: 'pause',
		})
	})

	it('is not a click when the player is doing what it was told', () => {
		expect(reactionTo('playing', current(longAgo('play')), false, now)).toBeNull()
		expect(reactionTo('paused', current(longAgo('pause')), true, now)).toBeNull()
	})

	it('is not a click inside the grace after being told anything', () => {
		expect(reactionTo('playing', current(justNow('pause')), false, now)).toBeNull()
		expect(reactionTo('paused', current(justNow('play')), true, now)).toBeNull()
	})

	it('does not pause the clock for a player that has never played', () => {
		expect(reactionTo('paused', current(longAgo('play'), false), true, now)).toBeNull()
	})

	it('changes nothing when the clock already agrees', () => {
		expect(reactionTo('playing', current(longAgo('pause')), true, now)).toBeNull()
		expect(reactionTo('paused', current(longAgo('play')), false, now)).toBeNull()
	})

	it('ignores every other player state', () => {
		expect(reactionTo('other', current(null), true, now)).toBeNull()
	})
})

describe('playing the other phase’s video', () => {
	it('switches at once while the clock is stopped', () => {
		expect(reactionTo('playing', other(longAgo('pause')), false, now)).toEqual({
			type: 'switch-phase',
			ask: false,
		})
	})

	it('asks first while the clock runs', () => {
		expect(reactionTo('playing', other(justNow('pause')), true, now)).toEqual({
			type: 'switch-phase',
			ask: true,
		})
	})

	it('is not a switch when the page just told it to play', () => {
		expect(reactionTo('playing', other(justNow('play')), true, now)).toBeNull()
	})

	it('only reacts to playing', () => {
		expect(reactionTo('paused', other(longAgo('play')), true, now)).toBeNull()
	})
})
