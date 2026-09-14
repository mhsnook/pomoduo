import { useEffect, useState } from 'react'

import { type Clock as ClockState, remainingIn } from '../../shared/clock'
import { formatClock } from '../lib/format'
import { DRIFT_MS } from '../lib/server-time'

/**
 * Whole seconds left, as the face shows them. Devices within DRIFT_MS of each
 * other count as in step, so the face ignores that much: otherwise a device a
 * few ms behind would show 25:01 at the top of a 25 minute phase.
 */
const secondsOf = (clock: ClockState, now: number) =>
	Math.ceil(Math.max(0, remainingIn(clock, now) - DRIFT_MS) / 1000)

/** The big countdown, lifted from pomodance. It reads server time, never the wall clock. */
export function Clock({
	clock,
	serverNow,
	isBreak,
}: {
	clock: ClockState
	serverNow: () => number
	isBreak: boolean
}) {
	const [seconds, setSeconds] = useState(() => secondsOf(clock, serverNow()))

	useEffect(() => {
		const tick = () => setSeconds(secondsOf(clock, serverNow()))
		tick()
		if (clock.endsAt === null) return
		const id = setInterval(tick, 250)
		return () => clearInterval(id)
	}, [clock, serverNow])

	const text = formatClock(seconds)
	useEffect(() => {
		document.title = `${text} ${isBreak ? '💃' : '🍅'} pomoduo`
	}, [text, isBreak])

	return (
		<div
			data-testid="clock"
			className="pomo-clock font-display text-[clamp(4rem,min(20vw,24vh),11rem)] leading-none font-bold tabular-nums"
			aria-live="polite"
		>
			{text}
		</div>
	)
}
