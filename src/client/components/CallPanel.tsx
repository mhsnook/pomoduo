import { Mic, MicOff, Phone, PhoneOff } from 'lucide-react'

import type { Clock } from '../../shared/clock'
import type { Member } from '../../shared/schema'
import { cn, displayName } from '../lib/format'
import { type CallState, useCall, type VoiceState } from '../session/call'

const listNames = (members: Member[]) =>
	members.map((m) => displayName(m.name)).join(' and ')

/** What the call is doing, in a sentence. */
function stateLine(call: CallState, alsoOn: Member[]) {
	if (!call.open) return 'The call is closed. A yap break opens it.'
	if (call.waiting) return 'Getting your mic on the call…'
	if (call.onCall)
		return alsoOn.length > 0
			? `You’re on the call with ${listNames(alsoOn)}.`
			: 'You’re on the call. Nobody else has picked up.'
	return alsoOn.length > 0
		? `The call is open, and ${listNames(alsoOn)} ${alsoOn.length > 1 ? 'are' : 'is'} on it.`
		: 'The call is open. Pick up whenever you like.'
}

/**
 * The session's call: whether it is open, whether you are on it, and your mic.
 * It opens on a yap break and cuts when work starts.
 */
export function CallPanel({
	clock,
	members,
	you,
	serverNow,
	onVoice,
}: {
	clock: Clock
	members: Member[]
	you: string
	serverNow: () => number
	onVoice: (state: VoiceState) => void
}) {
	const call = useCall({ clock, members, you, serverNow, onVoice })
	const alsoOn = members.filter((m) => m.id !== you && m.here && m.onCall)

	return (
		<section data-testid="call" className="font-ui flex flex-col gap-2">
			<h2 className="font-display text-xl">The call</h2>
			<p data-testid="call-state" className="opacity-80">
				{stateLine(call, alsoOn)}
			</p>

			{call.open && !call.onCall && (
				<button
					type="button"
					data-testid="pick-up"
					onClick={call.pickUp}
					className="btn btn-primary"
				>
					<Phone className="size-4" /> Pick up
				</button>
			)}

			{call.onCall && (
				<div className="join w-full">
					<button
						type="button"
						data-testid="mute-button"
						aria-pressed={call.muted}
						onClick={call.toggleMute}
						className={cn(
							'btn join-item flex-1',
							call.muted ? 'btn-primary' : 'btn-outline',
						)}
					>
						{call.muted ? <MicOff className="size-4" /> : <Mic className="size-4" />}
						{call.muted ? 'Muted' : 'Mute'}
					</button>
					<button
						type="button"
						data-testid="hang-up"
						onClick={call.hangUp}
						className="btn join-item btn-outline flex-1"
					>
						<PhoneOff className="size-4" /> Hang up
					</button>
				</div>
			)}

			{call.countdown !== null && (
				<p data-testid="call-cut" className="font-display text-center text-2xl">
					{call.countdown}…
				</p>
			)}

			{call.notice && (
				<p data-testid="call-notice" className="text-warning text-xs">
					{call.notice}
				</p>
			)}

			{call.audio}
		</section>
	)
}
