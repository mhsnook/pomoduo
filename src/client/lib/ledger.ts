/**
 * The ledger: a person's own pomos, filed under work days. Lifted from
 * pomodance. It stays on this device until the general room exists
 * (tree/architecture.md, "The general room").
 */
import { read, write } from './storage'

export type Pomo = {
	id: string
	/** work-day key (yyyy-mm-dd) the pomo is filed under; days roll over at 4am */
	day: string
	start: string
	end: string | null
	intention: string
	note: string
	confirmed: boolean
	/**
	 * How long the work clock ran for this pomo, not counting pauses. Missing on
	 * pomos filed before it was kept, and on pomos whose times were edited by
	 * hand: those count from start to end.
	 */
	workedMs?: number
	/** Wall time the clock last started running for this pomo, while it runs. */
	runningSince?: number | null
}

/** The clock started running for this pomo. */
export const resumeWork = (pomo: Pomo, now: number): Pomo =>
	pomo.runningSince ? pomo : { ...pomo, workedMs: pomo.workedMs ?? 0, runningSince: now }

/** The clock stopped: bank the time it ran. */
export const pauseWork = (pomo: Pomo, now: number): Pomo =>
	pomo.runningSince
		? {
				...pomo,
				workedMs: (pomo.workedMs ?? 0) + Math.max(0, now - pomo.runningSince),
				runningSince: null,
			}
		: pomo

/** How long the clock ran for this pomo, up to `now` if it still runs. */
export function workedOf(pomo: Pomo, now = Date.now()) {
	if (pomo.workedMs === undefined)
		return (pomo.end ? Date.parse(pomo.end) : now) - Date.parse(pomo.start)
	return pomo.workedMs + (pomo.runningSince ? Math.max(0, now - pomo.runningSince) : 0)
}

const POMOS_KEY = 'pomos'
const INTENTION_KEY = 'intention'
const DAY_KEY = 'day'

/** Pomos shorter than this are discarded rather than filed. */
export const MIN_POMO_MS = 60_000
const DAY_ROLLOVER_HOURS = 4
/** Past this gap since the last pomo, a new day starts without asking. */
const LATE_NIGHT_GAP_MS = 3 * 3_600_000

export const readPomos = () => read<Pomo[]>(POMOS_KEY, [])
export const savePomos = (pomos: Pomo[]) => write(POMOS_KEY, pomos)

/**
 * Ends anything a closed tab left open, at the earlier of now or its full
 * length. The pomo the session's clock is still counting down is left alone:
 * `keepLastOpen` says the work phase survived the reload.
 */
export function closeAbandoned(
	pomos: Pomo[],
	workMs: number,
	keepLastOpen: boolean,
	now: number,
): Pomo[] {
	const open = pomos.filter((p) => p.end === null)
	const carried = keepLastOpen ? open.at(-1) : undefined
	return pomos.map((p) => {
		if (p.end !== null || p === carried) return p
		const end = Math.min(now, Date.parse(p.start) + workMs)
		return { ...pauseWork(p, end), end: new Date(end).toISOString() }
	})
}

/** The pomo a session can pick back up: the last one, if it is finished, filed
 * under the day being worked on, and has not been reviewed. */
export function lastUnreviewed(pomos: Pomo[], day: string): Pomo | null {
	const last = pomos.at(-1)
	return last?.end && !last.confirmed && last.day === day ? last : null
}

/**
 * The pomo a fresh start should offer to pick up rather than replace: one that

/** The fields of a pomo as its edit form holds them, all as plain input strings. */
export type PomoDraft = {
	day: string
	start: string
	end: string
	intention: string
	note: string
	confirmed: boolean
}

/** `datetime-local` has no timezone, so both directions go through the local clock. */
export function toLocalInput(iso: string) {
	const d = new Date(iso)
	const pad = (n: number) => String(n).padStart(2, '0')
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export const draftOf = (pomo: Pomo): PomoDraft => ({
	day: pomo.day,
	start: toLocalInput(pomo.start),
	end: pomo.end ? toLocalInput(pomo.end) : '',
	intention: pomo.intention,
	note: pomo.note,
	confirmed: pomo.confirmed,
})

/**
 * What is wrong with the draft, or null when it can be filed. An empty end
 * reopens the pomo, which only one of them may be at a time: `otherOpen` is
 * whether a different pomo is already in progress.
 */
export function draftError(draft: PomoDraft, otherOpen = false): string | null {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.day)) return 'The work day needs to be a date.'
	const start = Date.parse(draft.start)
	if (Number.isNaN(start)) return 'That start time is not a time.'
	if (!draft.end)
		return otherOpen ? 'Another pomo is already in progress. Stop that one first.' : null
	const end = Date.parse(draft.end)
	if (Number.isNaN(end)) return 'That end time is not a time.'
	return end < start ? 'That pomo would end before it started.' : null
}

/** An empty end puts the pomo back in progress, which is how two get merged by hand. */
/**
 * The pomo as the form left it. Times the form did not change keep their
 * seconds and the worked time. Times it did change are what the ledger counts
 * from then on.
 */
export function pomoFromDraft(pomo: Pomo, draft: PomoDraft): Pomo {
	const same = draftOf(pomo)
	const edited = {
		...pomo,
		day: draft.day,
		intention: draft.intention,
		note: draft.note,
		confirmed: draft.confirmed,
	}
	if (draft.start === same.start && draft.end === same.end) return edited
	const { workedMs: _worked, runningSince: _since, ...byHand } = edited
	return {
		...byHand,
		start: new Date(draft.start).toISOString(),
		end: draft.end ? new Date(draft.end).toISOString() : null,
	}
}

/** Edited times can land anywhere, and the ledger reads the list in order. */
export const byStart = (a: Pomo, b: Pomo) => Date.parse(a.start) - Date.parse(b.start)

/**
 * Whether a pomo is dropped rather than filed when it ends. Too short to be
 * worth a ledger entry — unless it has been reviewed, which is someone saying
 * this one counts however long it ran.
 */
export const isThrowaway = (pomo: Pomo, now: number) =>
	!pomo.confirmed && workedOf(pomo, now) < MIN_POMO_MS

export const loadIntention = () => read<string>(INTENTION_KEY, '')
export const saveIntention = (v: string) => write(INTENTION_KEY, v)

export const loadDay = () => read<string | null>(DAY_KEY, null)
export const saveDay = (day: string) => write(DAY_KEY, day)

export function workDayOf(date: Date): string {
	const shifted = new Date(date.getTime() - DAY_ROLLOVER_HOURS * 3_600_000)
	const y = shifted.getFullYear()
	const m = String(shifted.getMonth() + 1).padStart(2, '0')
	const d = String(shifted.getDate()).padStart(2, '0')
	return `${y}-${m}-${d}`
}

export function dayLabel(day: string) {
	return new Date(`${day}T12:00:00`).toLocaleDateString([], {
		weekday: 'long',
		month: 'short',
		day: 'numeric',
	})
}

/**
 * Whether starting a pomo now sits on the far side of 4am from the day the
 * user was working on, close enough to the last pomo that it's plausibly the
 * same late-night session and worth asking about.
 */
export function straddlesRollover(currentDay: string | null, pomos: Pomo[], now: number) {
	if (!currentDay || currentDay === workDayOf(new Date(now))) return false
	const last = pomos.filter((p) => p.day === currentDay).at(-1)
	return !!last && now - Date.parse(last.end ?? last.start) < LATE_NIGHT_GAP_MS
}

/**
 * The day a visit files its pomos under. A saved day that is no longer today's
 * only survives while the late-night session that made it is still going; every
 * other visit starts on a fresh day.
 */
export function resolveDay(stored: string | null, pomos: Pomo[], now: number): string {
	return stored && straddlesRollover(stored, pomos, now)
		? stored
		: workDayOf(new Date(now))
}

/** The days behind the one being worked on, newest first, for the history. */
export function pastDays(pomos: Pomo[], day: string): { day: string; pomos: Pomo[] }[] {
	const days = new Map<string, Pomo[]>()
	for (const pomo of pomos) {
		if (pomo.day === day) continue
		days.set(pomo.day, [...(days.get(pomo.day) ?? []), pomo])
	}
	return [...days.entries()]
		.sort(([a], [b]) => b.localeCompare(a))
		.map(([key, filed]) => ({ day: key, pomos: [...filed].sort(byStart) }))
}

/** What a day came to: how many pomos, and how long the finished ones ran. */
export function dayTotals(pomos: Pomo[]) {
	const ms = pomos.reduce((total, p) => total + (p.end ? workedOf(p) : 0), 0)
	return { count: pomos.length, minutes: Math.round(ms / 60_000) }
}

/** Minutes as a spoken duration: `45m`, `1h`, `2h 05m`. */
export function formatDuration(minutes: number) {
	const hours = Math.floor(minutes / 60)
	const rest = minutes % 60
	if (!hours) return `${rest}m`
	return rest ? `${hours}h ${String(rest).padStart(2, '0')}m` : `${hours}h`
}
