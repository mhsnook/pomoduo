import {
	createAudioSink,
	getMic,
	PartyTracks,
	type TrackMetadata,
} from 'partytracks/client'
import {
	useObservable,
	useObservableAsValue,
	useValueAsObservable,
} from 'partytracks/react'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'

import type { Clock } from '../../shared/clock'
import { type Member, type Mic, VOICE_PREFIX } from '../../shared/schema'
import { secondsOf } from '../lib/server-time'

/** Describes what this device tells the room about where it sits on the call. */
export type VoiceState = { onCall: boolean; muted: boolean; mic: Mic | null }

/** How long before the end of a break the count to the cut begins. */
const COUNT_FROM = 3

/** How long a call may take to come up before the page says something is wrong. */
const SLOW_MS = 10_000

const NO_MIC =
	'Your mic has not reached the other side. The call may not be set up on this server.'

/** Describes this device's whole side of the call, for a panel to draw. */
export type CallState = {
	/** Whether the session's call is open, which is the clock's business, not this device's. */
	open: boolean
	/** Whether this device is on it. */
	onCall: boolean
	muted: boolean
	/** On the call, but this device's mic has not got through yet. */
	waiting: boolean
	/** Something the person needs told, or an empty string. */
	notice: string
	/** Seconds until the call cuts, once there are few enough to count down. */
	countdown: number | null
	pickUp: () => void
	hangUp: () => void
	toggleMute: () => void
	/** The audio, which exists only while this device is on the call. */
	audio: ReactNode
}

/**
/**
 * Holds this device's side of the session's call, and keeps the connection open
 * while this member is on it. Three things decide whether your mic is live, and
 * they do not move each other:
 *
 * - The browser has given the page the mic, or it has not. That is the
 *   browser's to remember, and the call never changes it.
 * - You are muted, or you are not. That is yours, and it carries from one call
 *   to the next until you change it.
 * - The call is open, or it is closed. That is the clock's, and it turns on
 *   every mic that is already allowed and not muted.
 *
 * Hanging up is the fourth, and the only one that belongs to a single call: it
 * takes you off this one, and the next one starts without it.
 */
export function useCall({
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
}): CallState {
	const { callOpen } = clock
	const allowed = useMicAllowed()
	const [muted, setMuted] = useState(false)
	const [answered, setAnswered] = useState(false)
	const [hungUp, setHungUp] = useState(false)
	const [notice, setNotice] = useState('')
	const [live, setLive] = useState(false)
	const [slow, setSlow] = useState(false)
	const [wasOpen, setWasOpen] = useState(callOpen)

	// A call opening or closing clears what belonged to the last one. Your mute
	// is not one of those things, and neither is the browser's answer about the
	// mic: both carry across, so neither is touched here.
	if (wasOpen !== callOpen) {
		setWasOpen(callOpen)
		setAnswered(false)
		setHungUp(false)
		setNotice('')
		setLive(false)
		setSlow(false)
	}

	// A break's call opens every mic the browser has already allowed. The call a
	// session opens before work starts is an invitation and waits for a click, so
	// nobody's mic goes live while they are working.
	const joinsOnItsOwn = allowed && clock.phase === 'break'
	const onCall = callOpen && !hungUp && (answered || joinsOnItsOwn)

	const waiting = onCall && !live
	useEffect(() => {
		if (!waiting) return
		const id = setTimeout(() => setSlow(true), SLOW_MS)
		return () => clearTimeout(id)
	}, [waiting])

	const seconds = useSecondsLeft(clock, serverNow, onCall)

	return {
		open: callOpen,
		onCall,
		muted,
		waiting,
		notice: notice || (waiting && slow ? NO_MIC : ''),
		countdown: seconds !== null && seconds > 0 && seconds <= COUNT_FROM ? seconds : null,
		pickUp: () => {
			setNotice('')
			setSlow(false)
			setLive(false)
			setHungUp(false)
			setAnswered(true)
		},
		hangUp: () => setHungUp(true),
		toggleMute: () => setMuted((m) => !m),
		audio: onCall ? (
			<Call
				members={members}
				you={you}
				muted={muted}
				onVoice={onVoice}
				onLive={setLive}
				onMicFailed={(error) => {
					setHungUp(true)
					setNotice(
						error.name === 'NotAllowedError'
							? 'Your browser did not let the page use the mic, so you are not on the call.'
							: `The mic did not start: ${error.message}`,
					)
				}}
			/>
		) : null,
	}
}

/**
 * Reports whether the browser has already given this page the mic, and follows
 * that answer as it changes. Asking never prompts, so a break's call can open a
 * mic that is allowed and leave one that is not to the pick-up button.
 */
function useMicAllowed() {
	const [allowed, setAllowed] = useState(false)
	useEffect(() => {
		let status: PermissionStatus | undefined
		const read = () => setAllowed(status?.state === 'granted')
		navigator.permissions
			// 'microphone' is a real permission name that the DOM types leave out
			.query({ name: 'microphone' as PermissionName })
			.then((result) => {
				status = result
				status.addEventListener('change', read)
				read()
			})
			.catch(() => setAllowed(false))
		return () => status?.removeEventListener('change', read)
	}, [])
	return allowed
}

/**
 * Pushes this device's mic up to the Cloudflare Realtime SFU and pulls every
 * other member's back down. React mounts this only while the member is on the
 * call, so hanging up takes the peer connection and the mic with it.
 *
 * Muting keeps the track flowing with silence rather than stopping it, because
 * the SFU collects a track that has sent nothing for 30 seconds. That is what
 * partytracks' broadcastTrack$ does, so mute goes through it and never through
 * the mic's own source.
 */
function Call({
	members,
	you,
	muted,
	onVoice,
	onLive,
	onMicFailed,
}: {
	members: Member[]
	you: string
	muted: boolean
	onVoice: (state: VoiceState) => void
	onLive: (live: boolean) => void
	onMicFailed: (error: Error) => void
}) {
	const partyTracks = useMemo(() => new PartyTracks({ prefix: VOICE_PREFIX }), [])
	const mic = useMemo(
		() =>
			getMic({
				constraints: {
					echoCancellation: true,
					noiseSuppression: true,
					autoGainControl: true,
				},
			}),
		[],
	)
	useObservable(mic.error$, onMicFailed)

	useEffect(() => {
		if (muted) mic.stopBroadcasting()
		else mic.startBroadcasting()
	}, [mic, muted])

	const metadata$ = useMemo(
		() => partyTracks.push(mic.broadcastTrack$),
		[partyTracks, mic],
	)
	const metadata = useObservableAsValue(metadata$)
	const { sessionId, trackName } = metadata ?? {}

	// The others cannot pull a mic they cannot find, so the room hears about it
	// the moment the SFU names it, and again each time the connection is remade.
	// Keyed on the names rather than the object: push() re-emits an equal one
	// every time the broadcast track is swapped, which every mute toggle does.
	useEffect(() => {
		onVoice({
			onCall: true,
			muted,
			mic: sessionId && trackName ? { sessionId, trackName } : null,
		})
	}, [sessionId, trackName, muted, onVoice])

	useEffect(() => () => onVoice({ onCall: false, muted: false, mic: null }), [onVoice])

	// A call that cannot reach the SFU looks exactly like one that can, because
	// partytracks retries quietly and its sessionError$ never fires. What the peer
	// connection says, and whether the SFU has named our track, is the truth.
	const peerState = useObservableAsValue(partyTracks.peerConnectionState$, 'new')
	const live = peerState === 'connected' && metadata !== undefined
	useEffect(() => {
		onLive(live)
	}, [live, onLive])

	return (
		<>
			{members.map((member) =>
				member.id !== you && member.here && member.onCall && member.mic ? (
					<RemoteMic key={member.id} partyTracks={partyTracks} mic={member.mic} />
				) : null,
			)}
		</>
	)
}

/** Plays one other member's mic, pulled from the SFU into an element of its own. */
function RemoteMic({ partyTracks, mic }: { partyTracks: PartyTracks; mic: Mic }) {
	const element = useRef<HTMLAudioElement>(null)
	const metadata = useMemo<TrackMetadata>(
		() => ({ location: 'remote', sessionId: mic.sessionId, trackName: mic.trackName }),
		[mic.sessionId, mic.trackName],
	)
	const metadata$ = useValueAsObservable(metadata)
	const track$ = useMemo(() => partyTracks.pull(metadata$), [partyTracks, metadata$])

	useEffect(() => {
		const audioElement = element.current
		if (!audioElement) return
		const sink = createAudioSink({ audioElement })
		const attached = sink.attach(track$)
		return () => {
			attached.unsubscribe()
			sink.cleanup()
		}
	}, [track$])

	return <audio ref={element} autoPlay />
}

/**
 * Counts the whole seconds left of the phase while this device is on the call,
 * for the count to the cut. It sleeps until the last seconds rather than
 * re-rendering the call four times a second for a whole break. The effect takes
 * no dependencies: each render schedules the next tick from where the clock
 * stands now.
 */
function useSecondsLeft(clock: Clock, serverNow: () => number, watching: boolean) {
	const [, tick] = useState(0)
	const seconds = watching && clock.endsAt !== null ? secondsOf(clock, serverNow()) : null
	useEffect(() => {
		if (seconds === null) return
		const wait = seconds > COUNT_FROM ? (seconds - COUNT_FROM) * 1_000 : 200
		const id = setTimeout(() => tick((n) => n + 1), wait)
		return () => clearTimeout(id)
	})
	return seconds
}
