import type { ReactNode } from 'react'

import { type Clock, elapsedIn, isFresh } from '../../shared/clock'
import type { BreakKind } from '../../shared/vote'
import { formatLeft } from '../lib/format'
import { useClockSeconds } from './Clock'
import { SideHeading, SideLink } from './ui'

function leftOf(clock: Clock, seconds: number) {
	if (clock.endsAt !== null) return `${formatLeft(seconds)} left`
	if (isFresh(clock)) return `${formatLeft(seconds)} to go`
	return `${formatLeft(seconds)} left, paused`
}

/** Where the current phase stands, in one line and a bar, and what comes after it. */
export function PhaseProgress({
	clock,
	serverNow,
	pomoNumber,
	nextKind,
	onLonger,
	children,
}: {
	clock: Clock
	serverNow: () => number
	/** Which of the day's pomos this work phase is. */
	pomoNumber: number
	/** The kind of break the vote would give if work ended now. */
	nextKind: BreakKind
	onLonger: () => void
	children?: ReactNode
}) {
	const left = leftOf(clock, useClockSeconds(clock, serverNow))
	const inBreak = clock.phase === 'break'
	const done = elapsedIn(clock, serverNow()) / clock.durations[clock.phase]

	return (
		<section data-testid="phase-progress" className="flex flex-col gap-2.5">
			{inBreak ? (
				<div className="flex items-baseline justify-between gap-2">
					<SideHeading testId="break-kind">
						{clock.breakKind} break · {left}
					</SideHeading>
					<SideLink
						testId="side-longer"
						title="Make this break a minute longer"
						onClick={onLonger}
					>
						＋1 min
					</SideLink>
				</div>
			) : (
				<div className="flex items-baseline justify-between gap-2">
					<SideHeading className="text-side-link">Work · pomo {pomoNumber}</SideHeading>
					<span className="text-side-strong text-[15px] font-medium tabular-nums">
						{left}
					</span>
				</div>
			)}
			<progress
				className="progress text-side-bar h-1"
				value={done}
				max={1}
				aria-label={`${Math.round(done * 100)}% of this ${inBreak ? 'break' : 'pomo'} gone`}
			/>
			<p className="text-side-muted flex items-center gap-2 text-[13px]">
				{inBreak ? (
					'Work starts again when this runs out.'
				) : (
					<>
						<span aria-hidden className="bg-side-edge size-1.5 shrink-0 rounded-full" />
						Next up: {nextKind} break{nextKind === 'yap' && ' · the call opens then'}
					</>
				)}
			</p>
			{children}
		</section>
	)
}
