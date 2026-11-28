/**
 * What a video player's own state change means for the session. The page tells
 * each player to play or pause as the clock moves, and the player reports back
 * every change, including the ones the page asked for. Only a change that goes
 * against what the page last told it is a click on the video, and a click is a
 * command. The rules are in tree/rules.md, "A video moves once per command".
 */

/**
 * A player that reports a change this soon after being told something counts
 * as having done what it was told. Players report the page's own requests a
 * little late.
 */
export const TOLD_GRACE_MS = 800

/** The player states the page reacts to. */
export type PlayerReport = 'playing' | 'paused' | 'ended' | 'other'

/** What the page last asked of a player, and when. */
export type Told = { want: 'play' | 'pause'; at: number } | null

export type PlayerReaction =
	/** The track ran out: move this playlist on to its next one. */
	| { type: 'next-track' }
	/** A click on the current phase's video, for everyone. */
	| { type: 'command'; command: 'start' | 'pause' }
	/**
	 * The other phase's video was played: stop it, and switch to that phase.
	 * A running clock asks first.
	 */
	| { type: 'switch-phase'; ask: boolean }

export function reactionTo(
	report: PlayerReport,
	player: {
		/** Whether this player belongs to the phase the clock is in. */
		current: boolean
		told: Told
		/** Whether this player has ever actually played, counting this report. */
		hasPlayed: boolean
	},
	running: boolean,
	now: number,
): PlayerReaction | null {
	if (report === 'ended') return { type: 'next-track' }
	const { current, told, hasPlayed } = player
	const recent = told !== null && now - told.at < TOLD_GRACE_MS
	if (!current) {
		if (report !== 'playing' || (recent && told.want === 'play')) return null
		return { type: 'switch-phase', ask: running }
	}
	if (recent) return null
	if (report === 'playing' && !running && told?.want !== 'play')
		return { type: 'command', command: 'start' }
	if (report === 'paused' && running && hasPlayed && told?.want !== 'pause')
		return { type: 'command', command: 'pause' }
	return null
}
