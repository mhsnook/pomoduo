import { describe, expect, it } from 'vitest'

import { apply, type Clock, freshClock, placeIn, remainingIn, videoEffect } from './clock'

const durations = { work: 60_000, break: 20_000 }
const T = 1_000_000

const running = (): Clock => apply(freshClock(durations), { type: 'start' }, T)!

describe('a jump inside the phase', () => {
	it('moves the end time by exactly the jump, whenever it is applied', () => {
		const pressed = apply(running(), { type: 'nudge', deltaMs: -10_000 }, T + 20_000)!
		const arrived = apply(running(), { type: 'nudge', deltaMs: -10_000 }, T + 21_500)!
		expect(pressed.endsAt).toBe(arrived.endsAt)
		expect(pressed.endsAt! - running().endsAt!).toBe(10_000)
	})

	it('moves the video by the jump', () => {
		const after = apply(running(), { type: 'nudge', deltaMs: -10_000 }, T + 20_000)!
		expect(videoEffect(running(), after, { type: 'nudge', deltaMs: -10_000 }, T)).toEqual(
			{
				moveBy: -10_000,
				playing: true,
			},
		)
	})
})

describe('a jump forward past the end', () => {
	const near = T + 56_000 // 4 s of work left

	it('starts the next phase fresh, the same as a skip', () => {
		const after = apply(running(), { type: 'nudge', deltaMs: 10_000 }, near)!
		expect(after.phase).toBe('break')
		expect(remainingIn(after, near)).toBe(20_000)
		expect(after).toEqual(apply(running(), { type: 'skip' }, near))
	})

	it('keeps the place this playlist reached and cues the next at its own', () => {
		const clock = { ...running(), playlist: { work: 30_000, break: 5_000 } }
		const after = apply(clock, { type: 'nudge', deltaMs: 10_000 }, near)!
		expect(after.playlist.work).toBe(86_000)
		expect(
			videoEffect(clock, after, { type: 'nudge', deltaMs: 10_000 }, near).cueAt,
		).toBe(5_000)
	})
})

describe('a jump back past the start', () => {
	it('carries into the previous phase and rewinds its playlist with the clock', () => {
		const clock = { ...running(), playlist: { work: 0, break: 40_000 } }
		const after = apply(clock, { type: 'nudge', deltaMs: -10_000 }, T + 4_000)!
		expect(after.phase).toBe('break')
		expect(remainingIn(after, T + 4_000)).toBe(6_000)
		// 6 s before the end of a break that ran from 20 s to 40 s of its playlist
		expect(
			videoEffect(clock, after, { type: 'nudge', deltaMs: -10_000 }, T + 4_000).cueAt,
		).toBe(34_000)
	})
})

describe('a jump back into a phase that ended early', () => {
	it('brings the video back to where it stopped, not to where a full phase would have reached', () => {
		// work was skipped 11 minutes in: its playlist stopped at 11:00
		const lengths = { work: 25 * 60_000, break: 5 * 60_000 }
		const started = apply(freshClock(lengths), { type: 'start' }, T)!
		const inBreak = apply(started, { type: 'skip' }, T + 11 * 60_000)!
		expect(inBreak.playlist.work).toBe(11 * 60_000)
		const now = T + 11 * 60_000 + 3_000
		const back = apply(inBreak, { type: 'nudge', deltaMs: -60_000 }, now)!
		expect(back.phase).toBe('work')
		expect(remainingIn(back, now)).toBe(57_000)
		const effect = videoEffect(inBreak, back, { type: 'nudge', deltaMs: -60_000 }, now)
		expect(effect.cueAt).toBe(11 * 60_000 - 57_000)
	})
})

describe('pause and start', () => {
	it('depend on when they land, so the presser settles by the one-way delay', () => {
		const pressed = apply(running(), { type: 'pause' }, T + 20_000)!
		const arrived = apply(running(), { type: 'pause' }, T + 21_500)!
		expect(arrived.remainingMs - pressed.remainingMs).toBe(-1_500)
	})

	it('only stop and start the video', () => {
		const after = apply(running(), { type: 'pause' }, T + 20_000)!
		expect(videoEffect(running(), after, { type: 'pause' }, T + 20_000)).toEqual({
			playing: false,
		})
	})

	it('change nothing when the clock is already that way', () => {
		expect(apply(running(), { type: 'start' }, T)).toBeNull()
		expect(apply(freshClock(durations), { type: 'pause' }, T)).toBeNull()
	})
})

describe('a skip that reaches a device late', () => {
	it('starts the break with less than its full length, where the clock is', () => {
		const after = apply(running(), { type: 'skip' }, T + 20_000)!
		expect(remainingIn(after, T + 21_500)).toBe(18_500)
		expect(videoEffect(running(), after, { type: 'skip' }, T + 21_500).cueAt).toBe(1_500)
	})

	it('always leaves the clock running', () => {
		const after = apply(freshClock(durations), { type: 'skip' }, T)!
		expect(after.endsAt).toBe(T + 20_000)
	})
})

describe('stretch', () => {
	it('changes what is left without moving the video', () => {
		const after = apply(running(), { type: 'stretch', deltaMs: 60_000 }, T)!
		expect(remainingIn(after, T)).toBe(120_000)
		expect(
			videoEffect(running(), after, { type: 'stretch', deltaMs: 60_000 }, T),
		).toEqual({ playing: true })
	})

	it('finishes the phase when it takes off more than is left', () => {
		const after = apply(running(), { type: 'stretch', deltaMs: -60_000 }, T + 30_000)!
		expect(after.phase).toBe('break')
	})
})

describe('rollover', () => {
	it('lands everyone on the same next end, however late it runs', () => {
		const end = running().endsAt!
		const early = apply(running(), { type: 'rollover' }, end + 30)!
		const late = apply(running(), { type: 'rollover' }, end + 900)!
		expect(early).toEqual(late)
		expect(early.endsAt).toBe(end + 20_000)
		expect(early.playlist.work).toBe(60_000)
	})

	it('does nothing before the end', () => {
		expect(apply(running(), { type: 'rollover' }, running().endsAt! - 1)).toBeNull()
	})
})

describe('reset and durations', () => {
	it('puts the phase back to its full length, stopped, and keeps the playlist place', () => {
		const after = apply(running(), { type: 'reset' }, T + 15_000)!
		expect(after).toMatchObject({ endsAt: null, remainingMs: 60_000 })
		expect(after.playlist.work).toBe(15_000)
	})

	it('changes a fresh clock at once and a running one from the next phase', () => {
		const fresh = apply(
			freshClock(durations),
			{ type: 'durations', durations: { work: 5_000, break: 1_000 } },
			T,
		)!
		expect(fresh.remainingMs).toBe(5_000)
		const mid = apply(
			running(),
			{ type: 'durations', durations: { work: 5_000, break: 1_000 } },
			T,
		)!
		expect(mid.endsAt).toBe(running().endsAt)
		expect(mid.durations.break).toBe(1_000)
	})
})

describe('placeIn', () => {
	it('is where the current playlist is now, for a device that joins', () => {
		const clock = { ...running(), playlist: { work: 90_000, break: 0 } }
		expect(placeIn(clock, T + 12_000)).toBe(102_000)
	})

	it('never points before the start of the playlist', () => {
		const clock = { ...running(), playlist: { work: -50_000, break: 0 } }
		expect(placeIn(clock, T + 12_000)).toBe(0)
	})
})

describe('end', () => {
	it('puts the session back at the top of work, stopped, and keeps each playlist place', () => {
		const inBreak = apply(running(), { type: 'skip' }, T + 30_000)!
		const ended = apply(inBreak, { type: 'end' }, T + 35_000)!
		expect(ended).toMatchObject({ phase: 'work', endsAt: null, remainingMs: 60_000 })
		expect(ended.playlist).toEqual({ work: 30_000, break: 5_000 })
	})
})
