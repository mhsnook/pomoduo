import type { Clock } from '../../shared/clock'
import type { Member } from '../../shared/schema'
import { type BreakKind, standing } from '../../shared/vote'
import type { CallState } from '../session/call'
import { CallPanel, MicAsk } from './CallPanel'
import { Members } from './Members'
import { PhaseProgress } from './PhaseProgress'
import { VotePanel } from './VotePanel'

/**
 * The live part of the column beside the clock: the call on top while it is
 * open, then the phase's progress, who is here, and the vote.
 */
export function SideColumn({
	clock,
	members,
	you,
	serverNow,
	call,
	onVote,
	onLonger,
	onSetIntention,
	pomoNumber,
}: {
	clock: Clock
	members: Member[]
	you: string
	serverNow: () => number
	call: CallState
	onVote: (kind: BreakKind | null) => void
	onLonger: () => void
	onSetIntention: () => void
	pomoNumber: number
}) {
	const here = members.filter((m) => m.here)
	const vote = standing(
		here.map((m) => m.vote),
		clock.tally,
	)

	return (
		<>
			<CallPanel call={call} you={you} />
			<PhaseProgress
				clock={clock}
				serverNow={serverNow}
				pomoNumber={pomoNumber}
				nextKind={vote.leader}
				onLonger={onLonger}
			>
				{!call.open && <MicAsk call={call} />}
			</PhaseProgress>
			<Members
				members={members}
				you={you}
				phase={clock.phase}
				call={call}
				onSetIntention={onSetIntention}
			/>
			<VotePanel
				clock={clock}
				here={here.length}
				vote={vote}
				mine={members.find((m) => m.id === you)?.vote ?? null}
				onVote={onVote}
			/>
		</>
	)
}
