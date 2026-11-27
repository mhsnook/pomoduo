import type { ReactNode } from 'react'

import { type Clock, isFresh } from '../../shared/clock'
import type { BreakKind } from '../../shared/vote'
import { formatLeft } from '../lib/format'
import { useClockSeconds } from './Clock'

/**
 * Where the current phase stands, in one line and a bar, and what comes after
 * it. It tops the side column whenever the call is not open.
 */
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
	/** Which of today's pomos this work phase is. */
	pomoNumber: number
	/** The kind of break the vote would give if work ended now. */
	nextKind: BreakKind
	onLonger: () => void
	children?: ReactNode
}) {
	const seconds = useClockSeconds(clock, serverNow)
	const inBreak = clock.phase === 'break'
	const done = Math.min(
		1,
		Math.max(0, 1 - (seconds * 1000) / clock.durations[clock.phase]),
	)
	const state = clock.endsAt !== null ? 'left' : isFresh(clock) ? 'to go' : 'left, paused'

	return (
		<section data-testid="phase-progress" className="flex flex-col gap-2.5">
			<div className="flex items-baseline justify-between gap-2">
				{inBreak ? (
					<h2
						data-testid="break-kind"
						className="text-side-label text-xs font-bold tracking-[0.14em] uppercase"
					>
						{clock.breakKind} break · {formatLeft(seconds)} {state}
					</h2>
				) : (
					<h2 className="text-side-link text-xs font-bold tracking-[0.14em] uppercase">
						Work · pomo {pomoNumber}
					</h2>
				)}
				{inBreak ? (
					<button
						type="button"
						data-testid="side-longer"
						title="Make this break a minute longer"
						onClick={onLonger}
						className="text-side-link text-[13px] hover:underline"
					>
						＋1 min
					</button>
				) : (
					<span className="text-side-strong text-[15px] font-medium tabular-nums">
						{formatLeft(seconds)} {state}
					</span>
				)}
			</div>
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
