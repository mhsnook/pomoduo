import { Mic, MicOff, Phone, PhoneOff } from 'lucide-react'

import type { Clock } from '../../shared/clock'
import type { Member } from '../../shared/schema'
import { cn, displayName } from '../lib/format'
import { MIC_DENIED } from '../lib/mic'
import { type CallState, useCall, type VoiceState } from '../session/call'

const listNames = (members: Member[]) =>
	members.map((m) => displayName(m.name)).join(' and ')

/** Says what the call is doing, in a sentence. */
function stateLine(call: CallState, alsoOn: Member[]) {
	const others = alsoOn.length > 0 ? listNames(alsoOn) : null
	if (!call.open) return 'The call is closed. A yap break opens it.'
	if (call.waiting)
		return call.listening ? 'Joining the call…' : 'Getting your mic on the call…'
	if (call.listening)
		return others
			? `You’re listening in to ${others}. Nothing of yours is going out.`
			: 'You’re listening in. Nothing of yours is going out, and nobody else has picked up.'
	if (call.onCall)
		return others
			? `You’re on the call with ${others}.`
			: 'You’re on the call. Nobody else has picked up.'
	return others
		? `The call is open, and ${others} ${alsoOn.length > 1 ? 'are' : 'is'} on it.`
		: 'The call is open. Pick up whenever you like.'
}

/**
 * Offers the mic to the browser, ahead of the call that will want it. Pick up
 * asks too, so this stays out of the way while that button is there to press.
 */
function MicAsk({ call }: { call: CallState }) {
	if (call.permission === 'granted' || (call.open && !call.listening)) return null
	// An open call has already said this through the notice, in the same words.
	if (call.permission === 'denied')
		return call.open ? null : (
			<p data-testid="mic-ask" className="text-xs opacity-70">
				{MIC_DENIED}
			</p>
		)
	return (
		<div data-testid="mic-ask" className="flex flex-col gap-1">
			<button
				type="button"
				data-testid="allow-mic"
				onClick={call.ask}
				disabled={call.asking}
				className="btn btn-outline btn-sm"
			>
				<Mic className="size-4" />
				{call.asking ? 'Asking…' : 'Allow the mic'}
			</button>
			<p className="text-xs opacity-70">
				{call.listening
					? 'Say yes and your mic joins the call too.'
					: 'Breaks open the call, so say yes to the mic now and it will be ready when one starts.'}
			</p>
		</div>
	)
}

/**
 * Draws the session's call: whether it is open, whether you are on it, and your
 * mic. The call opens on a yap break and cuts when work starts.
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
					disabled={call.asking}
					className="btn btn-primary"
				>
					<Phone className="size-4" /> {call.asking ? 'Asking for the mic…' : 'Pick up'}
				</button>
			)}

			<MicAsk call={call} />

			{call.onCall && (
				<div className="join w-full">
					{!call.listening && (
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
					)}
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
