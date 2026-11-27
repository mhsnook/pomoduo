import type { Phase } from '../../shared/clock'
import type { Member } from '../../shared/schema'
import { cn, displayName, initialOf } from '../lib/format'
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
 * How one member sits on the call. `mic` is where the others pull them from, so
 * a member with none who is not listening is a moment away from being heard.
 */
function callLine(member: Member) {
	if (member.listening) return 'on the call · listening'
	if (member.muted) return 'on the call · muted'
	if (!member.mic) return 'on the call · connecting'
	return 'on the call · mic live'
}

/** Your own intention is set in the big box over the clock, which this jumps to. */
function MemberLine({
	member,
	isYou,
	callOpen,
	othersOnCall,
	onSetIntention,
}: {
	member: Member
	isYou: boolean
	callOpen: boolean
	othersOnCall: boolean
	onSetIntention?: () => void
}) {
	if (callOpen && member.onCall)
		return (
			<span className={cn('text-[13px]', isYou ? 'text-side-text' : 'text-on-call')}>
				{callLine(member)}
			</span>
		)
	if (callOpen)
		return (
			<span
				className={cn(
					'text-[13px]',
					isYou && othersOnCall ? 'text-call' : 'text-side-muted',
				)}
			>
				{isYou ? 'not on the call yet' : 'not on the call'}
			</span>
		)
	if (member.intention)
		return (
			<span className="text-side-text text-sm text-pretty" title={member.intention}>
				{member.intention}
			</span>
		)
	if (isYou && onSetIntention)
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
 * Who is in the session. While working, each row carries that member's
 * intention; while the call is open, where they sit on it.
 */
export function Members({
	members,
	you,
	phase,
	callOpen,
	onSetIntention,
}: {
	members: Member[]
	you: string
	phase: Phase
	callOpen: boolean
	onSetIntention?: () => void
}) {
	if (members.length === 0) return null
	const here = members.filter((m) => m.here)
	const onCall = here.filter((m) => m.onCall)
	const othersOnCall = onCall.some((m) => m.id !== you)
	// everyone else first, the ones here before the ones away; you come last
	const sorted = [...members].sort(
		(a, b) =>
			Number(a.id === you) - Number(b.id === you) ||
			Number(b.here) - Number(a.here) ||
			b.seenAt - a.seenAt,
	)
	const doing =
		phase === 'break' ? 'On break' : here.length > 1 ? 'Working together' : 'Working'
	const count = callOpen
		? `${onCall.length} of ${here.length} on the call`
		: String(here.length)

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
								</span>
								<MemberLine
									member={member}
									isYou={isYou}
									callOpen={callOpen}
									othersOnCall={othersOnCall}
									onSetIntention={onSetIntention}
								/>
							</div>
						</li>
					)
				})}
			</ul>
		</section>
	)
}
