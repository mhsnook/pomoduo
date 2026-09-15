import type { Clock } from '../../shared/clock'
import type { Member } from '../../shared/schema'
import { BREAK_KINDS, type BreakKind, defaultKind, standing } from '../../shared/vote'
import { cn } from '../lib/format'

export const KIND_LABEL: Record<BreakKind, string> = { dance: '💃 Dance', yap: '💬 Yap' }

/**
 * The break vote: pick the kind of break this pomo ends in, and see how it
 * stands. Not picking is not a vote; a room that picks nothing gets a yap in
 * company, a dance alone.
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
	const votes = here.map((m) => m.vote)
	const { total, leader } = standing(votes, clock.tally)
	const mine = members.find((m) => m.id === you)?.vote ?? null
	const inBreak = clock.phase === 'break'

	return (
		<section data-testid="vote" className="font-ui flex flex-col gap-2">
			<h2 className="font-display text-xl">Break vote</h2>
			<p data-testid="break-kind" className="opacity-80">
				{inBreak
					? `This is a ${clock.breakKind} break. Picks now count for the next one.`
					: 'Pick what this pomo’s break should be.'}
			</p>
			<div className="join w-full">
				{BREAK_KINDS.map((kind) => (
					<button
						key={kind}
						type="button"
						data-testid={`vote-${kind}`}
						aria-pressed={mine === kind}
						onClick={() => onVote(mine === kind ? null : kind)}
						className={cn(
							'btn join-item flex-1',
							mine === kind ? 'btn-primary' : 'btn-outline',
						)}
					>
						{KIND_LABEL[kind]}
					</button>
				))}
			</div>
			<p data-testid="vote-standing" className="text-xs opacity-70">
				{BREAK_KINDS.map((kind) => `${KIND_LABEL[kind]} ${total[kind]}`).join(' · ')}
				{BREAK_KINDS.some((kind) => clock.tally.bank[kind] > 0) &&
					` (banked: ${BREAK_KINDS.filter((kind) => clock.tally.bank[kind] > 0)
						.map((kind) => `${kind} ${clock.tally.bank[kind]}`)
						.join(', ')})`}
				. {leader === 'dance' ? 'Dance' : 'Yap'} wins if work ends now.
			</p>
			<p className="text-xs opacity-60">
				Saying nothing is not a vote. With nobody picking it is a{' '}
				{defaultKind(here.length)} break, and a side that loses keeps its votes for next
				time.
			</p>
		</section>
	)
}
