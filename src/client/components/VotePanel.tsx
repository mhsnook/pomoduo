import type { Clock } from '../../shared/clock'
import type { Member } from '../../shared/schema'
import { BREAK_KINDS, type BreakKind, defaultKind, standing } from '../../shared/vote'
import { cn } from '../lib/format'
import { SideHeading } from './ui'

const KIND_NAME: Record<BreakKind, string> = { dance: 'Dance', yap: 'Yap' }

const picks = (n: number) => `${n} ${n === 1 ? 'pick' : 'picks'}`

/** How the vote stands, in one line: what wins if work ends now, and why. */
function standingLine(
	total: Record<BreakKind, number>,
	leader: BreakKind,
	clock: Clock,
	here: number,
) {
	if (total.dance === 0 && total.yap === 0)
		return `Nobody has picked, so it defaults to a ${defaultKind(here)} break.`
	if (total.dance === total.yap)
		return clock.tally.lastLoser
			? `Tied, so ${KIND_NAME[leader]} wins: it lost last time.`
			: `Tied, so ${KIND_NAME[leader]} goes first.`
	const banked = clock.tally.bank[leader]
	return `${KIND_NAME[leader]} is winning with ${picks(total[leader])}${banked > 0 ? `, ${banked} of them banked` : ''}.`
}

/**
 * The break vote: pick the kind of break this pomo ends in, and see how it
 * stands. Not picking is not a vote; a room that picks nothing gets a yap. A
 * pick stands until its member changes it. Alone there is nothing to vote
 * about, so there is no panel.
 */
export function VotePanel({
	clock,
	members,
	you,
	onVote,
}: {
	clock: Clock
	members: Member[]
	you: string
	onVote: (kind: BreakKind | null) => void
}) {
	const here = members.filter((m) => m.here)
	const { total, leader } = standing(
		here.map((m) => m.vote),
		clock.tally,
	)
	const mine = members.find((m) => m.id === you)?.vote ?? null
	if (here.length < 2) return null

	return (
		<section data-testid="vote" className="flex flex-col gap-2.5">
			<div className="flex items-baseline justify-between gap-2">
				<SideHeading>
					{clock.phase === 'break' ? 'Next break will be' : 'This break will be'}
				</SideHeading>
				<details className="dropdown dropdown-end">
					<summary
						data-testid="vote-rules"
						aria-label="How the vote works"
						title="How the vote works"
						className="border-side-edge text-side-muted flex size-4 cursor-pointer list-none items-center justify-center rounded-full border text-[10px]"
					>
						?
					</summary>
					<div className="dropdown-content bg-side-pop border-side-edge text-side-text z-20 mt-2 flex w-64 flex-col gap-2 rounded-lg border p-3 text-xs shadow-lg">
						<p>Saying nothing is not a vote. With nobody picking it is a yap break.</p>
						<p>Your pick stays until you change it. Press it again to take it back.</p>
						<p>
							A side that loses keeps its votes for next time, so everyone gets their way
							eventually.
						</p>
					</div>
				</details>
			</div>
			<div className="flex gap-2">
				{BREAK_KINDS.map((kind) => {
					const yours = mine === kind
					return (
						<button
							key={kind}
							type="button"
							data-testid={`vote-${kind}`}
							aria-pressed={yours}
							onClick={() => onVote(yours ? null : kind)}
							className={cn(
								'flex flex-1 flex-col items-center gap-0.5 rounded-[9px] border pt-[11px] pb-[9px]',
								yours
									? 'border-side-link bg-side-row-on'
									: 'border-side-edge bg-side-row',
							)}
						>
							<span className="text-side-strong text-[15px] font-medium">
								{KIND_NAME[kind]}
							</span>
							<span
								className={cn(
									'text-xs tabular-nums',
									yours ? 'text-side-link' : 'text-side-muted',
								)}
							>
								{yours ? `${total[kind]} · yours` : picks(total[kind])}
							</span>
						</button>
					)
				})}
			</div>
			<p data-testid="vote-standing" className="text-side-muted text-[13px] text-pretty">
				{standingLine(total, leader, clock, here.length)}
			</p>
		</section>
	)
}
