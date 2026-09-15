import { useEffect, useState } from 'react'

import type { Clock as ClockState } from '../../shared/clock'
import { formatClock } from '../lib/format'
import { secondsOf } from '../lib/server-time'

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
