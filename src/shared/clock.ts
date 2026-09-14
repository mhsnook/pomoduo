/**
 * The shared clock: what a session's clock is, and what each command does to it.
 *
 * The session's Durable Object runs `apply` when a command arrives, and the
 * device that pressed the button runs the same function at the press, so both
 * reach the same clock. The rules live in tree/rules.md under "The clock".
 */

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
	 * where it stopped.
	 */
	playlist: Record<Phase, number>
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

/** The commands a member can send. A rollover only ever comes from the clock itself. */
export type MemberCommand = Exclude<Command, { type: 'rollover' }>

export const DEFAULT_DURATIONS: Durations = { work: 25 * 60_000, break: 5 * 60_000 }

export const otherPhase = (phase: Phase): Phase => (phase === 'work' ? 'break' : 'work')

export const freshClock = (durations: Durations = DEFAULT_DURATIONS): Clock => ({
	phase: 'work',
	endsAt: null,
	remainingMs: durations.work,
	durations,
	playlist: { work: 0, break: 0 },
})

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

/** The next phase from the top. This phase's playlist keeps the place it reached. */
function nextPhase(clock: Clock, now: number, running: boolean): Clock {
	const next = otherPhase(clock.phase)
	const playlist = {
		...clock.playlist,
		[clock.phase]: clock.playlist[clock.phase] + elapsedIn(clock, now),
	}
	return { ...at(clock, next, clock.durations[next], running, now), playlist }
}

/**
 * A jump of ±deltaMs. Inside the phase it moves the end time by exactly the
 * jump, whenever it is applied, so the presser and the DO agree on it. Forward
 * past the end starts the next phase fresh. Back past the start carries into
 * the previous phase and rewinds that playlist with the clock, as pomodance's
 * scrub does.
 */
function nudge(clock: Clock, deltaMs: number, now: number): Clock {
	const duration = clock.durations[clock.phase]
	const running = clock.endsAt !== null
	const target = elapsedIn(clock, now) + deltaMs
	if (target >= duration) return nextPhase(clock, now, running)
	if (target >= 0) return at(clock, clock.phase, duration - target, running, now)
	const prev = otherPhase(clock.phase)
	const prevDuration = clock.durations[prev]
	const playlist = {
		...clock.playlist,
		[prev]: Math.max(0, clock.playlist[prev] - prevDuration),
	}
	return { ...at(clock, prev, Math.min(-target, prevDuration), running, now), playlist }
}

/** One command applied at `now`. Returns null when the command changes nothing. */
export function apply(clock: Clock, command: Command, now: number): Clock | null {
	const running = clock.endsAt !== null
	switch (command.type) {
		case 'start':
			return running ? null : { ...clock, endsAt: now + clock.remainingMs }
		case 'pause':
			return running
				? { ...clock, endsAt: null, remainingMs: remainingIn(clock, now) }
				: null
		case 'nudge':
			return nudge(clock, command.deltaMs, now)
		case 'stretch': {
			const remaining = remainingIn(clock, now) + command.deltaMs
			if (remaining <= 0) return nextPhase(clock, now, running)
			return at(clock, clock.phase, remaining, running, now)
		}
		case 'skip':
			return nextPhase(clock, now, true)
		case 'reset': {
			const playlist = {
				...clock.playlist,
				[clock.phase]: clock.playlist[clock.phase] + elapsedIn(clock, now),
			}
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
		case 'rollover': {
			// Chained from the exact end, so every device and the DO land on the same next end.
			if (clock.endsAt === null || clock.endsAt > now) return null
			const next = otherPhase(clock.phase)
			const playlist = {
				...clock.playlist,
				[clock.phase]: clock.playlist[clock.phase] + clock.durations[clock.phase],
			}
			return {
				...clock,
				phase: next,
				remainingMs: clock.durations[next],
				endsAt: clock.endsAt + clock.durations[next],
				playlist,
			}
		}
	}
}

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
	const playing = after.endsAt !== null
	if (after.phase !== before.phase)
		return { cueAt: after.playlist[after.phase] + elapsedIn(after, now), playing }
	if (command.type === 'nudge') return { moveBy: command.deltaMs, playing }
	return { playing }
}

/** Joining: the video starts where the shared clock is. */
export const joinEffect = (clock: Clock, now: number): VideoEffect => ({
	cueAt: clock.playlist[clock.phase] + elapsedIn(clock, now),
	playing: clock.endsAt !== null,
})
