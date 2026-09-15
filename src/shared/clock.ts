/**
 * The shared clock: what a session's clock is, and what each command does to it.
 *
 * The session's Durable Object runs `apply` when a command arrives, and the
 * device that pressed the button runs the same function at the press, so both
 * reach the same clock. The rules live in tree/rules.md under "The clock".
 */

import type { ClockRow } from './schema'
import { type BreakKind, decide, FIRST_KIND, freshTally, type Tally } from './vote'

export type Phase = 'work' | 'break'

export const PHASES: Phase[] = ['work', 'break']

export type Durations = Record<Phase, number>

export type Clock = {
	phase: Phase
	/** Set while the clock runs. Server time, in ms. */
	endsAt: number | null
	/** What is left while the clock is stopped. Ignored while it runs. */
	remainingMs: number
	/** How long each phase is. Shared by everyone in the session. */
	durations: Durations
	/**
	 * Each playlist's place, in ms from the start of the playlist. For the
	 * current phase, where it stood when the phase began; for the other phase,
	 * where it stopped. A phase entered by jumping back into it can begin
	 * before the playlist's start, so the current phase's place can be negative.
	 */
	playlist: Record<Phase, number>
	/** The kind of the current break, or of the last one while working. */
	breakKind: BreakKind
	/** What the break vote remembers between breaks. */
	tally: Tally
	/**
	 * Whether the session's call is open. Only the commands below change it: a
	 * session starts with it open, starting work closes it, and entering a break
	 * opens it for a yap break and closes it for a dance one.
	 */
	callOpen: boolean
}

export type Command =
	| { type: 'start' }
	| { type: 'pause' }
	/** Jump the clock and the video together. Forward past the end starts the next phase fresh. */
	| { type: 'nudge'; deltaMs: number }
	/** Make this phase longer or shorter. The video stays where it is. */
	| { type: 'stretch'; deltaMs: number }
	/** Start the next phase fresh, running. */
	| { type: 'skip' }
	/** Put this phase back to its full length, stopped. */
	| { type: 'reset' }
	| { type: 'durations'; durations: Durations }
	/** The end time passed. Every device and the DO run this on their own. */
	| { type: 'rollover' }
	/** Everyone left and the grace window passed: back to the top of work, stopped. */
	| { type: 'end' }

/** The commands a member can send. A rollover or an end only ever comes from the room itself. */
export type MemberCommand = Exclude<Command, { type: 'rollover' | 'end' }>

export const DEFAULT_DURATIONS: Durations = { work: 25 * 60_000, break: 5 * 60_000 }

export const otherPhase = (phase: Phase): Phase => (phase === 'work' ? 'break' : 'work')

export const freshClock = (durations: Durations = DEFAULT_DURATIONS): Clock => ({
	phase: 'work',
	endsAt: null,
	remainingMs: durations.work,
	durations,
	playlist: { work: 0, break: 0 },
	breakKind: FIRST_KIND,
	tally: freshTally(),
	// a session starts with the call open, and starting work closes it
	callOpen: true,
})

/** Tells a yap break from the other kinds: no music plays, and the call is open. */
export const isYapBreak = (clock: Clock) =>
	clock.phase === 'break' && clock.breakKind === 'yap'

/** Whether the current phase has music: while it runs, unless it is a yap break. */
export const musicPlays = (clock: Clock) => clock.endsAt !== null && !isYapBreak(clock)

/**
 * The playlists with the current phase's moved on by `ms`. A yap break plays
 * no music, so its playlist stays where it was.
 */
const advanced = (clock: Clock, ms: number) =>
	isYapBreak(clock)
		? clock.playlist
		: { ...clock.playlist, [clock.phase]: clock.playlist[clock.phase] + ms }

/**
 * Settles a phase the clock has just moved into. A break starting fresh takes
 * the vote, which picks its kind; pass null for `votes` when a jump back has
 * returned to a break, because it keeps the kind it already had. Either way the
 * phase decides the call, and this is the only place that rule is written.
 */
function enterPhase(clock: Clock, votes: BreakKind[] | null): Clock {
	const voted = clock.phase === 'break' && votes ? decide(votes, clock.tally) : null
	const settled = voted ? { ...clock, breakKind: voted.kind, tally: voted.tally } : clock
	return { ...settled, callOpen: isYapBreak(settled) }
}

/** What is left on the clock, whether it runs or not. */
export const remainingIn = (clock: Clock, now: number) =>
	Math.max(0, clock.endsAt === null ? clock.remainingMs : clock.endsAt - now)

/** How far into the current phase the clock is. A stretched phase stays at 0 until it catches up. */
export const elapsedIn = (clock: Clock, now: number) =>
	Math.max(0, clock.durations[clock.phase] - remainingIn(clock, now))

/** Whether the clock sits at the top of its phase, untouched. */
export const isFresh = (clock: Clock) =>
	clock.endsAt === null && clock.remainingMs === clock.durations[clock.phase]

const at = (
	clock: Clock,
	phase: Phase,
	remainingMs: number,
	running: boolean,
	now: number,
) => ({
	...clock,
	phase,
	remainingMs,
	endsAt: running ? now + remainingMs : null,
})

/**
 * The next phase from the top. This phase's playlist keeps the place it
 * reached, and a break that starts this way is put to the vote.
 */
function nextPhase(
	clock: Clock,
	now: number,
	running: boolean,
	votes: BreakKind[],
): Clock {
	const next = otherPhase(clock.phase)
	const playlist = advanced(clock, elapsedIn(clock, now))
	const moved = { ...at(clock, next, clock.durations[next], running, now), playlist }
	return enterPhase(moved, votes)
}

/**
 * A jump of ±deltaMs. Inside the phase it moves the end time by exactly the
 * jump, whenever it is applied, so the presser and the DO agree on it. Forward
 * past the end starts the next phase fresh. Back past the start carries into
 * the previous phase and rewinds that playlist with the clock, as pomodance's
 * scrub does. A break come back to this way keeps the kind it already had.
 */
function nudge(clock: Clock, deltaMs: number, now: number, votes: BreakKind[]): Clock {
	const duration = clock.durations[clock.phase]
	const running = clock.endsAt !== null
	const target = elapsedIn(clock, now) + deltaMs
	if (target >= duration) return nextPhase(clock, now, running, votes)
	if (target >= 0) return at(clock, clock.phase, duration - target, running, now)
	// The previous phase comes back with `under` left, and its video comes back
	// to where it stopped, minus the same amount. That phase may have ended
	// early, so where it began is wherever makes those two agree.
	const prev = otherPhase(clock.phase)
	const prevDuration = clock.durations[prev]
	const under = Math.min(-target, prevDuration)
	const playlist = { ...clock.playlist, [prev]: clock.playlist[prev] - prevDuration }
	return enterPhase({ ...at(clock, prev, under, running, now), playlist }, null)
}

/**
 * One command applied at `now`. Returns null when the command changes nothing.
 *
 * `votes` holds one break kind for each member who is here, their pick or the
 * default. It only counts when the command ends work and starts a break.
 */
export function apply(
	clock: Clock,
	command: Command,
	now: number,
	votes: BreakKind[] = [],
): Clock | null {
	const running = clock.endsAt !== null
	switch (command.type) {
		case 'start':
			return running
				? null
				: {
						...clock,
						endsAt: now + clock.remainingMs,
						callOpen: clock.phase === 'work' ? false : clock.callOpen,
					}
		case 'pause':
			return running
				? { ...clock, endsAt: null, remainingMs: remainingIn(clock, now) }
				: null
		case 'nudge':
			return nudge(clock, command.deltaMs, now, votes)
		case 'stretch': {
			const remaining = remainingIn(clock, now) + command.deltaMs
			if (remaining <= 0) return nextPhase(clock, now, running, votes)
			return at(clock, clock.phase, remaining, running, now)
		}
		case 'skip':
			return nextPhase(clock, now, true, votes)
		case 'reset': {
			const playlist = advanced(clock, elapsedIn(clock, now))
			return {
				...at(clock, clock.phase, clock.durations[clock.phase], false, now),
				playlist,
			}
		}
		case 'durations': {
			const next = { ...clock, durations: command.durations }
			return isFresh(clock)
				? { ...next, remainingMs: command.durations[clock.phase] }
				: next
		}
		case 'end': {
			// a new session starts with nothing banked
			const playlist = advanced(clock, elapsedIn(clock, now))
			return { ...freshClock(clock.durations), playlist }
		}
		case 'rollover': {
			// Chained from the exact end, so every device and the DO land on the same next end.
			if (clock.endsAt === null || clock.endsAt > now) return null
			const next = otherPhase(clock.phase)
			const moved = {
				...clock,
				phase: next,
				remainingMs: clock.durations[next],
				endsAt: clock.endsAt + clock.durations[next],
				playlist: advanced(clock, clock.durations[clock.phase]),
			}
			return enterPhase(moved, votes)
		}
	}
}

/**
 * Whether this change ended work and started a break, which is when the vote
 * is taken. A jump back into the last break returns to it without a vote.
 */
export const startsBreak = (before: Clock, after: Clock, command: Command) =>
	before.phase === 'work' &&
	after.phase === 'break' &&
	!(command.type === 'nudge' && command.deltaMs < 0)

/** Takes the clock out of a row, leaving behind the record of the change that made it. */
export const clockOf = (row: ClockRow): Clock => ({
	phase: row.phase,
	endsAt: row.endsAt,
	remainingMs: row.remainingMs,
	durations: row.durations,
	playlist: row.playlist,
	breakKind: row.breakKind,
	tally: row.tally,
	callOpen: row.callOpen,
})

/** What a command asks of a device's video. */
export type VideoEffect = {
	/** Start the current phase's playlist here, in ms from its start. */
	cueAt?: number
	/** Move the current video by this much. */
	moveBy?: number
	playing: boolean
}

/**
 * What a command does to a device's video. Each device applies this once per
 * command: the presser at the press, everyone else when the command reaches
 * them. Nothing corrects the video afterwards; it lines up again at the next
 * phase.
 */
export function videoEffect(
	before: Clock,
	after: Clock,
	command: Command,
	now: number,
): VideoEffect {
	const playing = musicPlays(after)
	if (after.phase !== before.phase) return { cueAt: placeIn(after, now), playing }
	if (command.type === 'nudge') return { moveBy: command.deltaMs, playing }
	return { playing }
}

/** Where the current phase's playlist is now, in ms from its start. */
export const placeIn = (clock: Clock, now: number) =>
	Math.max(0, clock.playlist[clock.phase] + elapsedIn(clock, now))
