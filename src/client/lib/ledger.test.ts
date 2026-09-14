import { describe, expect, it } from 'vitest'

import {
	byStart,
	closeAbandoned,
	dayTotals,
	draftError,
	draftOf,
	formatDuration,
	isThrowaway,
	pastDays,
	pauseWork,
	type Pomo,
	pomoFromDraft,
	resolveDay,
	resumeWork,
	straddlesRollover,
	toLocalInput,
	workDayOf,
	workedOf,
} from './ledger'

// Lifted from pomodance.

const WORK_MS = 25 * 60_000

const pomoAt = (
	start: number,
	lengthMs: number | null,
	extra: Partial<Pomo> = {},
): Pomo => ({
	id: String(start),
	day: workDayOf(new Date(start)),
	start: new Date(start).toISOString(),
	end: lengthMs === null ? null : new Date(start + lengthMs).toISOString(),
	intention: 'ship the thing',
	note: '',
	confirmed: false,
	...extra,
})

describe('workDayOf', () => {
	it('rolls the day over at 4am local time', () => {
		expect(workDayOf(new Date(2026, 8, 8, 3, 59))).toBe('2026-09-07')
		expect(workDayOf(new Date(2026, 8, 8, 4, 0))).toBe('2026-09-08')
	})
})

describe('straddlesRollover', () => {
	const pomo = (day: string, end: Date): Pomo => ({
		id: '1',
		day,
		start: new Date(end.getTime() - 25 * 60_000).toISOString(),
		end: end.toISOString(),
		intention: '',
		note: '',
		confirmed: false,
	})
	const fiveAm = new Date(2026, 8, 8, 5, 0)

	it('asks when the last pomo on the old day was recent', () => {
		const pomos = [pomo('2026-09-07', new Date(2026, 8, 8, 3, 30))]
		expect(straddlesRollover('2026-09-07', pomos, fiveAm.getTime())).toBe(true)
	})
	it('does not ask after a long gap or when the day already matches', () => {
		const stale = [pomo('2026-09-07', new Date(2026, 8, 7, 22, 0))]
		expect(straddlesRollover('2026-09-07', stale, fiveAm.getTime())).toBe(false)
		expect(straddlesRollover('2026-09-08', [], fiveAm.getTime())).toBe(false)
		expect(straddlesRollover(null, [], fiveAm.getTime())).toBe(false)
	})
})

describe('resolveDay', () => {
	const pomo = (day: string, end: Date): Pomo => ({
		id: '1',
		day,
		start: new Date(end.getTime() - 25 * 60_000).toISOString(),
		end: end.toISOString(),
		intention: '',
		note: '',
		confirmed: false,
	})
	const fiveAm = new Date(2026, 8, 8, 5, 0).getTime()

	it('starts a new day when the saved one is behind', () => {
		const yesterday = [pomo('2026-09-07', new Date(2026, 8, 7, 22, 0))]
		expect(resolveDay('2026-09-07', yesterday, fiveAm)).toBe('2026-09-08')
		expect(resolveDay(null, [], fiveAm)).toBe('2026-09-08')
	})
	it('keeps the saved day while a late-night session is still going', () => {
		const stillUp = [pomo('2026-09-07', new Date(2026, 8, 8, 3, 30))]
		expect(resolveDay('2026-09-07', stillUp, fiveAm)).toBe('2026-09-07')
	})
})

describe('pastDays and dayTotals', () => {
	const pomo = (id: string, day: string, hour: number, minutes: number | null): Pomo => ({
		id,
		day,
		start: new Date(`${day}T${String(hour).padStart(2, '0')}:00:00.000Z`).toISOString(),
		end:
			minutes === null
				? null
				: new Date(
						Date.parse(`${day}T${String(hour).padStart(2, '0')}:00:00.000Z`) +
							minutes * 60_000,
					).toISOString(),
		intention: '',
		note: '',
		confirmed: false,
	})

	it('groups the other days newest first, each in start order', () => {
		const pomos = [
			pomo('a', '2026-09-06', 11, 25),
			pomo('b', '2026-09-08', 9, 25),
			pomo('c', '2026-09-07', 14, 25),
			pomo('d', '2026-09-06', 9, 25),
		]
		expect(pastDays(pomos, '2026-09-08').map((d) => d.day)).toEqual([
			'2026-09-07',
			'2026-09-06',
		])
		expect(pastDays(pomos, '2026-09-08')[1].pomos.map((p) => p.id)).toEqual(['d', 'a'])
	})
	it('leaves out the day being worked on, and every day when that is the only one', () => {
		expect(pastDays([pomo('a', '2026-09-08', 9, 25)], '2026-09-08')).toEqual([])
	})
	it('counts every pomo but only totals the finished ones', () => {
		const pomos = [pomo('a', '2026-09-06', 9, 25), pomo('b', '2026-09-06', 10, null)]
		expect(dayTotals(pomos)).toEqual({ count: 2, minutes: 25 })
		expect(dayTotals([])).toEqual({ count: 0, minutes: 0 })
	})
})

describe('formatDuration', () => {
	it('reads out hours only once there are some', () => {
		expect(formatDuration(0)).toBe('0m')
		expect(formatDuration(45)).toBe('45m')
		expect(formatDuration(60)).toBe('1h')
		expect(formatDuration(125)).toBe('2h 05m')
	})
})

describe('closeAbandoned', () => {
	const now = Date.now()

	it('ends an open pomo at the earlier of now and its full length', () => {
		const [short, long] = closeAbandoned(
			[pomoAt(now - 5 * 60_000, null), pomoAt(now - 90 * 60_000, null)],
			WORK_MS,
			false,
			now,
		)
		expect(short.end).toBe(new Date(now).toISOString())
		expect(long.end).toBe(new Date(now - 90 * 60_000 + 25 * 60_000).toISOString())
	})
	it('leaves the last open pomo running when the timer survived the reload', () => {
		const pomos = closeAbandoned(
			[pomoAt(now - 3 * 3_600_000, null), pomoAt(now - 5 * 60_000, null)],
			WORK_MS,
			true,
			now,
		)
		expect(pomos[0].end).not.toBe(null)
		expect(pomos[1].end).toBe(null)
	})
})

describe('editing a filed pomo', () => {
	const noon = new Date(2026, 8, 7, 12, 0).getTime()
	const pomo = pomoAt(noon, 25 * 60_000, { note: 'wrote the tests' })

	it('round-trips through the form without changing anything', () => {
		expect(pomoFromDraft(pomo, draftOf(pomo))).toEqual(pomo)
	})
	it('reads and writes the local clock, to the minute', () => {
		expect(toLocalInput(pomo.start)).toBe('2026-09-07T12:00')
		const moved = pomoFromDraft(pomo, { ...draftOf(pomo), start: '2026-09-07T09:30' })
		expect(toLocalInput(moved.start)).toBe('2026-09-07T09:30')
	})
	it('puts a pomo back in progress when the end is cleared', () => {
		expect(pomoFromDraft(pomo, { ...draftOf(pomo), end: '' }).end).toBe(null)
	})
	it('refuses a draft it cannot file', () => {
		expect(draftError(draftOf(pomo))).toBe(null)
		expect(draftError({ ...draftOf(pomo), day: 'yesterday' })).toMatch(/work day/)
		expect(draftError({ ...draftOf(pomo), start: '' })).toMatch(/start time/)
		expect(draftError({ ...draftOf(pomo), end: 'noon' })).toMatch(/end time/)
		expect(draftError({ ...draftOf(pomo), end: '2026-09-07T11:00' })).toMatch(
			/before it started/,
		)
	})
	it('will not reopen a pomo while another one is in progress', () => {
		const reopened = { ...draftOf(pomo), end: '' }
		expect(draftError(reopened)).toBe(null)
		expect(draftError(reopened, true)).toMatch(/already in progress/)
		// an edit that leaves the pomo finished is unaffected by the open one
		expect(draftError(draftOf(pomo), true)).toBe(null)
	})
	it('sorts a moved pomo back into the ledger by when it started', () => {
		const earlier = pomoAt(noon - 3 * 3_600_000, 25 * 60_000)
		expect([pomo, earlier].sort(byStart).map((p) => p.id)).toEqual([earlier.id, pomo.id])
	})
})

describe('isThrowaway', () => {
	const now = Date.now()

	it('drops a pomo that barely ran', () => {
		expect(isThrowaway(pomoAt(now - 20_000, null), now)).toBe(true)
		expect(isThrowaway(pomoAt(now - 5 * 60_000, null), now)).toBe(false)
	})
	it('keeps one that has been reviewed, however short it ran', () => {
		expect(isThrowaway(pomoAt(now - 20_000, null, { confirmed: true }), now)).toBe(false)
	})
})

describe('worked time', () => {
	const t0 = Date.parse('2026-09-14T20:00:00Z')

	it('counts only while the clock runs', () => {
		let pomo = resumeWork(pomoAt(t0, null), t0)
		pomo = pauseWork(pomo, t0 + 10 * 60_000)
		pomo = resumeWork(pomo, t0 + 15 * 60_000)
		expect(workedOf(pomo, t0 + 20 * 60_000)).toBe(15 * 60_000)
		pomo = pauseWork(pomo, t0 + 20 * 60_000)
		expect(workedOf(pomo, t0 + 99 * 60_000)).toBe(15 * 60_000)
	})

	it('falls back to start and end for a pomo without it', () => {
		expect(workedOf(pomoAt(t0, 25 * 60_000))).toBe(25 * 60_000)
	})

	it('banks what ran when a closed tab left the pomo open', () => {
		const open = resumeWork(pomoAt(t0, null), t0 + 60_000)
		const [closed] = closeAbandoned([open], WORK_MS, false, t0 + 90 * 60_000)
		expect(closed.end).toBe(new Date(t0 + WORK_MS).toISOString())
		expect(workedOf(closed)).toBe(WORK_MS - 60_000)
	})

	it('keeps the worked time through an edit that leaves the times alone', () => {
		const pomo = { ...pomoAt(t0, 30 * 60_000), workedMs: 20 * 60_000, runningSince: null }
		expect(workedOf(pomoFromDraft(pomo, { ...draftOf(pomo), note: 'done' }))).toBe(
			20 * 60_000,
		)
		const later = toLocalInput(new Date(t0 + 40 * 60_000).toISOString())
		expect(workedOf(pomoFromDraft(pomo, { ...draftOf(pomo), end: later }))).toBe(
			40 * 60_000,
		)
	})

	it('drops a pomo that ran under a minute, however long it sat paused', () => {
		const paused = pauseWork(resumeWork(pomoAt(t0, null), t0), t0 + 30_000)
		expect(isThrowaway(paused, t0 + 20 * 60_000)).toBe(true)
	})
})
