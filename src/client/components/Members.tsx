import type { Phase } from '../../shared/clock'
import type { Member } from '../../shared/schema'
import { cn, displayName, initialOf } from '../lib/format'
import type { CallState } from '../session/call'
import { SideHeading } from './ui'

/** Avatar grounds and letters, picked by member id so a person keeps theirs. */
const AVATAR_COLOURS = [
	['#23485c', '#b9d7e8'],
	['#2c4a3f', '#b7ddcb'],
	['#3d3a52', '#cdc6e4'],
	['#4a3b2c', '#e6d2bd'],
] as const

const colourOf = (id: string) =>
	AVATAR_COLOURS[
		Array.from(id).reduce((sum, c) => sum + c.charCodeAt(0), 0) % AVATAR_COLOURS.length
	]

export function Avatar({ member, large }: { member: Member; large?: boolean }) {
	const [ground, letter] = colourOf(member.id)
	return (
		<span
			aria-hidden
			style={{ background: ground, color: letter }}
			className={cn(
				'flex flex-none items-center justify-center rounded-full font-bold',
				large ? 'ring-on-call size-[34px] text-sm ring-2' : 'size-[26px] text-xs',
			)}
		>
			{initialOf(member.name)}
		</span>
	)
}

/**
 * Where a member sits on the call, while it is open. `mic` is where the others
 * pull them from, so a member with none who is not listening is a moment away
 * from being heard. Coral on your own row means the same as the ringing call.
 */
function micOf(member: Member) {
	if (member.listening) return 'listening'
	if (member.muted) return 'muted'
	if (!member.mic) return 'connecting'
	return 'mic live'
}

function CallLine({
	member,
	isYou,
	ringing,
}: {
	member: Member
	isYou: boolean
	ringing: boolean
}) {
	if (!member.onCall)
		return (
			<span
				className={cn('text-[13px]', isYou && ringing ? 'text-call' : 'text-side-muted')}
			>
				{isYou ? 'not on the call yet' : 'not on the call'}
			</span>
		)
	return (
		<span className={cn('text-[13px]', isYou ? 'text-side-text' : 'text-on-call')}>
			on the call · {micOf(member)}
		</span>
	)
}

/**
 * What a member is working on. Your own is set in the big box over the clock,
 * which this jumps to. While the call is open an empty one says nothing, so
 * the call line has the row.
 */
function IntentionLine({
	member,
	isYou,
	callOpen,
	inWork,
	onSetIntention,
}: {
	member: Member
	isYou: boolean
	callOpen: boolean
	inWork: boolean
	onSetIntention: () => void
}) {
	if (member.intention)
		return (
			<span
				className={cn(
					'text-pretty',
					callOpen ? 'text-side-muted text-[13px]' : 'text-side-text text-sm',
				)}
			>
				{member.intention}
			</span>
		)
	if (callOpen) return null
	if (isYou && inWork)
		return (
			<button
				type="button"
				data-testid="set-intention"
				onClick={onSetIntention}
				className="text-side-link border-side-link/50 self-start border-b border-dashed pb-px text-sm"
			>
				＋ set your intention
			</button>
		)
	return <span className="text-side-muted text-sm italic">no intention</span>
}

/**
 * Who is in the session: each member's intention and pick, and while the call
 * is open, where they sit on it.
 */
export function Members({
	members,
	you,
	phase,
	call,
	onSetIntention,
}: {
	members: Member[]
	you: string
	phase: Phase
	call: CallState
	onSetIntention: () => void
}) {
	if (members.length === 0) return null
	const callOpen = call.open
	const here = call.onCount + call.waitingOn.length
	// a room of one holds no vote, so a pick left over from company is not shown
	const voting = here > 1
	// everyone else first, the ones here before the ones away; you come last
	const sorted = [...members].sort(
		(a, b) =>
			Number(a.id === you) - Number(b.id === you) ||
			Number(b.here) - Number(a.here) ||
			b.seenAt - a.seenAt,
	)
	const doing = phase === 'break' ? 'On break' : voting ? 'Working together' : 'Working'
	const count = callOpen ? `${call.onCount} of ${here} on the call` : String(here)

	return (
		<section data-testid="members" className="flex flex-col gap-2.5">
			<SideHeading>
				{doing} · {count}
			</SideHeading>
			<ul className="flex flex-col gap-2.5">
				{sorted.map((member) => {
					const isYou = member.id === you
					const lit = callOpen && member.onCall
					return (
						<li
							key={member.id}
							data-testid="member"
							className={cn(
								'flex items-start gap-3 rounded-[9px] px-3 py-[11px]',
								lit
									? 'bg-side-row-on shadow-[inset_2px_0_0_var(--color-on-call)]'
									: 'bg-side-row',
								!member.here && 'opacity-50',
							)}
						>
							<Avatar member={member} />
							<div className="flex min-w-0 flex-1 flex-col gap-0.5">
								<span className="flex items-baseline gap-2">
									<span className="text-side-strong truncate text-[15px] font-medium">
										{displayName(member.name)}
									</span>
									{isYou && <span className="text-side-muted text-xs">you</span>}
									{!member.here && <span className="text-side-muted text-xs">away</span>}
									{voting && member.vote && (
										<span
											data-testid="member-pick"
											className="text-side-muted ml-auto text-xs"
										>
											picked {member.vote}
										</span>
									)}
								</span>
								<IntentionLine
									member={member}
									isYou={isYou}
									callOpen={callOpen}
									inWork={phase === 'work'}
									onSetIntention={onSetIntention}
								/>
								{callOpen && (
									<CallLine member={member} isYou={isYou} ringing={call.ringing} />
								)}
							</div>
						</li>
					)
				})}
			</ul>
		</section>
	)
}
