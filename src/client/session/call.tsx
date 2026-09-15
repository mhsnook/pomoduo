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
import { hasPickedUp, rememberPickedUp } from '../lib/voice'

/** What this device tells the room about where it sits on the call. */
export type VoiceState = { onCall: boolean; muted: boolean; mic: Mic | null }

/** How long before the end of a break the count to the cut begins. */
const COUNT_FROM = 3

/** How long a call may take to come up before the page says something is wrong. */
const SLOW_MS = 10_000

const NO_MIC =
	'Your mic has not reached the other side. The call may not be set up on this server.'

/** This device's whole side of the call, for a panel to draw. */
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
 * This device on the session's call. The clock says whether the call is open;
 * this says whether you are on it, and holds the connection while you are.
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
	const [live, setLive] = useState(false)
	const [slow, setSlow] = useState(false)
	const [wasOpen, setWasOpen] = useState(callOpen)

	// The call opening is a fresh start: nothing from the last one carries over.
	if (wasOpen !== callOpen) {
		setWasOpen(callOpen)
		setMuted(false)
		setNotice('')
		setLive(false)
		setSlow(false)
		setOnCall(answersItself())
	}

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
			rememberPickedUp()
			setNotice('')
			setSlow(false)
			setLive(false)
			setOnCall(true)
		},
		hangUp: () => setOnCall(false),
		toggleMute: () => setMuted((m) => !m),
		audio: onCall ? (
			<Call
				members={members}
				you={you}
				muted={muted}
				onVoice={onVoice}
				onLive={setLive}
				onMicFailed={(error) => {
					setOnCall(false)
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
 * The connection itself: this device's mic goes up to the Cloudflare Realtime
 * SFU, and every other member's comes back down. Mounted only while this member
 * is on the call, so hanging up takes the peer connection and the mic with it.
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

/** One other member's mic, pulled from the SFU into an element of its own. */
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

	// an element, not an AudioContext: iOS suspends a context in a background tab
	return <audio ref={element} autoPlay />
}

/**
 * Whole seconds left of the phase while this device is on the call, for the
 * count to the cut. Sleeps until the last seconds rather than re-rendering the
 * call four times a second for a whole break. No dependencies: each render
 * schedules the next tick from where the clock stands now.
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
