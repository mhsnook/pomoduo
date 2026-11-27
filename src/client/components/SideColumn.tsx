import type { Clock } from '../../shared/clock'
import type { Member } from '../../shared/schema'
import { type BreakKind, standing } from '../../shared/vote'
import type { Pomo } from '../lib/ledger'
import { useCall, type VoiceState } from '../session/call'
import { CallPanel, MicAsk } from './CallPanel'
import { Ledger } from './Ledger'
import { Members } from './Members'
import { PhaseProgress } from './PhaseProgress'
import { VotePanel } from './VotePanel'

/**
 * The column beside the clock. Its top slot holds whatever is live: the call
 * while it is open, the phase's progress otherwise. The ledger sits at the
 * bottom, as a record rather than a control.
 */
export function SideColumn({
	clock,
	members,
	you,
	serverNow,
	onVoice,
	onVote,
	onLonger,
	onSetIntention,
	pomos,
	day,
	pomoNumber,
	showLedger,
	onEditPomo,
}: {
	clock: Clock
	members: Member[]
	you: string
	serverNow: () => number
	onVoice: (state: VoiceState) => void
	onVote: (kind: BreakKind | null) => void
	onLonger: () => void
	onSetIntention?: () => void
	pomos: Pomo[]
	day: string
	pomoNumber: number
	showLedger: boolean
	onEditPomo: (pomo: Pomo) => void
}) {
	const call = useCall({ clock, members, you, serverNow, onVoice })
	const { leader } = standing(
		members.filter((m) => m.here).map((m) => m.vote),
		clock.tally,
	)

	return (
		<>
			<CallPanel call={call} members={members} you={you} />
			<PhaseProgress
				clock={clock}
				serverNow={serverNow}
				pomoNumber={pomoNumber}
				nextKind={leader}
				onLonger={onLonger}
			>
				{!call.open && <MicAsk call={call} />}
			</PhaseProgress>
			<Members
				members={members}
				you={you}
				phase={clock.phase}
				callOpen={call.open}
				onSetIntention={onSetIntention}
			/>
			<VotePanel clock={clock} members={members} you={you} onVote={onVote} />
			{showLedger && <Ledger pomos={pomos} day={day} onEdit={onEditPomo} />}
			{call.audio}
		</>
	)
}
