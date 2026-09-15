import { Mic, MicOff, Phone, PhoneOff } from 'lucide-react'
import { useEffect, useState } from 'react'

import { type Clock, remainingIn } from '../../shared/clock'
import type { Member } from '../../shared/schema'
import { cn } from '../lib/format'
import { hasPickedUp, rememberPickedUp } from '../lib/voice'
import { Call, type CallStatus, type VoiceState } from '../session/call'

/** How long before the end of a break the count to the cut begins. */
const COUNT_FROM = 3

/** How long a call may take to come up before the page says something is wrong. */
const SLOW_MS = 10_000

const listNames = (members: Member[]) =>
	members.map((m) => m.name || 'someone').join(' and ')

/**
 * The session's call: whether it is open, whether you are on it, and your mic.
 * It opens on a yap break and cuts when work starts, and while you are on it
 * this is what holds the connection to the SFU.
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
	const { callOpen } = clock
	/**
	 * Whether this device answers without being asked. A break is a moment the
	 * session chose, so a device that has picked up before joins it with its mic
	 * live. The call a session opens before anyone has started work is not that
	 * moment, and grabbing the mic of whoever opens a fresh link would be rude.
	 */
	const answersItself = () => callOpen && clock.phase === 'break' && hasPickedUp()

	const [onCall, setOnCall] = useState(answersItself)
	const [muted, setMuted] = useState(false)
	const [notice, setNotice] = useState('')
	const [status, setStatus] = useState<CallStatus>('connecting')
	const [slow, setSlow] = useState(false)
	const [wasOpen, setWasOpen] = useState(callOpen)

	// The call opening is a fresh start: nothing from the last one carries over.
	if (wasOpen !== callOpen) {
		setWasOpen(callOpen)
		setMuted(false)
		setNotice('')
		setSlow(false)
		setStatus('connecting')
		setOnCall(answersItself())
	}

	const alsoOn = members.filter((m) => m.id !== you && m.here && m.onCall)
	const seconds = useSecondsLeft(clock, serverNow, onCall)
	const counting = seconds !== null && seconds > 0 && seconds <= COUNT_FROM
	const waiting = onCall && status !== 'live'

	useEffect(() => {
		if (!waiting) return
		const id = setTimeout(() => setSlow(true), SLOW_MS)
		return () => clearTimeout(id)
	}, [waiting])

	const pickUp = () => {
		rememberPickedUp()
		setNotice('')
		setSlow(false)
		setStatus('connecting')
		setOnCall(true)
	}

	return (
		<section data-testid="call" className="font-ui flex flex-col gap-2">
			<h2 className="font-display text-xl">The call</h2>
			<p data-testid="call-state" className="opacity-80">
				{!callOpen
					? 'The call is closed. A yap break opens it.'
					: waiting
						? 'Getting your mic on the call…'
						: !onCall
							? alsoOn.length > 0
								? `The call is open, and ${listNames(alsoOn)} ${alsoOn.length > 1 ? 'are' : 'is'} on it.`
								: 'The call is open. Pick up whenever you like.'
							: alsoOn.length > 0
								? `You’re on the call with ${listNames(alsoOn)}.`
								: 'You’re on the call. Nobody else has picked up.'}
			</p>

			{callOpen && !onCall && (
				<button
					type="button"
					data-testid="pick-up"
					onClick={pickUp}
					className="btn btn-primary"
				>
					<Phone className="size-4" /> Pick up
				</button>
			)}

			{callOpen && onCall && (
				<div className="join w-full">
					<button
						type="button"
						data-testid="mute-button"
						aria-pressed={muted}
						onClick={() => setMuted(!muted)}
						className={cn('btn join-item flex-1', muted ? 'btn-primary' : 'btn-outline')}
					>
						{muted ? <MicOff className="size-4" /> : <Mic className="size-4" />}
						{muted ? 'Muted' : 'Mute'}
					</button>
					<button
						type="button"
						data-testid="hang-up"
						onClick={() => setOnCall(false)}
						className="btn join-item btn-outline flex-1"
					>
						<PhoneOff className="size-4" /> Hang up
					</button>
				</div>
			)}

			{counting && (
				<p data-testid="call-cut" className="font-display text-center text-2xl">
					{seconds}…
				</p>
			)}

			{(notice || (waiting && slow)) && (
				<p data-testid="call-notice" className="text-warning text-xs">
					{notice ||
						'Your mic has not reached the other side. The call may not be set up on this server.'}
				</p>
			)}

			{onCall && (
				<Call
					members={members}
					you={you}
					muted={muted}
					onVoice={onVoice}
					onStatus={setStatus}
					onMicFailed={(error) => {
						setOnCall(false)
						setNotice(
							error.name === 'NotAllowedError'
								? 'Your browser did not let the page use the mic, so you are not on the call.'
								: `The mic did not start: ${error.message}`,
						)
					}}
				/>
			)}
		</section>
	)
}

/**
 * Whole seconds left of the phase while this device is on the call, for the
 * count to the cut. Null when there is nothing to count towards.
 */
function useSecondsLeft(clock: Clock, serverNow: () => number, watching: boolean) {
	const [, tick] = useState(0)
	const left = watching && clock.endsAt !== null ? remainingIn(clock, serverNow()) : null
	// Sleeps until the last seconds rather than re-rendering the whole call four
	// times a second for a whole break. No dependencies: each render schedules
	// the next tick from where the clock stands now.
	useEffect(() => {
		if (left === null) return
		const wait = left > COUNT_FROM * 1000 ? left - COUNT_FROM * 1000 : 200
		const id = setTimeout(() => tick((n) => n + 1), wait)
		return () => clearTimeout(id)
	})
	return left === null ? null : Math.ceil(left / 1000)
}
