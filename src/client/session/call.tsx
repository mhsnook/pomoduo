import {
	createAudioSink,
	getMic,
	type MediaDevice,
	PartyTracks,
	type SafePermissionState,
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
import { askForMic, micFailure } from '../lib/mic'
import { secondsOf } from '../lib/server-time'

/** Describes what this device tells the room about where it sits on the call. */
export type VoiceState = {
	onCall: boolean
	listening: boolean
	muted: boolean
	mic: Mic | null
}

/** How long before the end of a break the count to the cut begins. */
const COUNT_FROM = 3

/** How long a call may take to come up before the page says something is wrong. */
const SLOW_MS = 10_000

/**
 * What this device asks of its mic. The SFU carries what comes out, so the
 * browser does the cleaning up rather than anything downstream.
 */
const MIC_CONSTRAINTS = {
	echoCancellation: true,
	noiseSuppression: true,
	autoGainControl: true,
}

const NO_MIC =
	'Your mic has not reached the other side. The call may not be set up on this server.'

/** Describes this device's whole side of the call, for a panel to draw. */
export type CallState = {
	/** Whether the session's call is open, which is the clock's business, not this device's. */
	open: boolean
	/** Whether this device is on it. */
	onCall: boolean
	muted: boolean
	/** On the call, but this device's side of it has not come up yet. */
	waiting: boolean
	/** On the call with no mic going out: this device can hear, and cannot speak. */
	listening: boolean
	/** Something the person needs told, or an empty string. */
	notice: string
	/** Seconds until the call cuts, once there are few enough to count down. */
	countdown: number | null
	/** What the browser has said about this page using the mic. */
	permission: SafePermissionState
	/** Whether an ask for the mic is out, here or in front of the person. */
	asking: boolean
	/** Asks the browser for the mic now, so a break's call opens with one ready. */
	ask: () => void
	pickUp: () => void
	hangUp: () => void
	toggleMute: () => void
	/** The audio, which exists only while this device is on the call. */
	audio: ReactNode
}

/**
 * Holds this device's side of the session's call, and keeps the connection open
 * while this member is on it. Three things decide whether your mic is live, and
 * they do not move each other:
 *
 * - The browser has given the page the mic, or it has not. That is the
 *   browser's to remember; the page only asks, and the answer outlives the call.
 * - You are muted, or you are not. That is yours, and it carries from one call
 *   to the next until you change it.
 * - The call is open, or it is closed. That is the clock's, and it turns on
 *   every mic that is already allowed and not muted.
 *
 * Hanging up is the fourth, and the only one that belongs to a single call: it
 * takes you off this one, and the next one starts without it.
 *
 * A mic that never arrives is not a fifth: hearing the others needs no mic of
 * your own, so the call joins anyway and sends nothing.
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
	// One mic for the page. Holding it costs nothing until something subscribes
	// to its track: permissionState$ only reads the browser's answer, and follows
	// it as it changes, so a break's call can open a mic that is already allowed.
	const mic = useMemo(() => getMic({ constraints: MIC_CONSTRAINTS }), [])
	const told = useObservableAsValue(mic.permissionState$, 'unknown')
	const [muted, setMuted] = useState(false)
	const [asking, setAsking] = useState(false)
	// Firefox has no 'microphone' permission to query, so the browser's answer
	// stays 'unknown' there however many times it has said yes. An ask that came
	// back clean is the same news, and it is the only news those browsers give.
	const [allowed, setAllowed] = useState(false)
	const permission: SafePermissionState = allowed ? 'granted' : told
	const [answered, setAnswered] = useState(false)
	const [hungUp, setHungUp] = useState(false)
	const [notice, setNotice] = useState('')
	const [live, setLive] = useState(false)
	const [listening, setListening] = useState(false)
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
		setListening(false)
		setSlow(false)
	}

	// A break's call opens every mic the browser has already allowed. The call a
	// session opens before work starts is an invitation and waits for a click, so
	// nobody's mic goes live while they are working.
	const joinsOnItsOwn = permission === 'granted' && clock.phase === 'break'
	const onCall = callOpen && !hungUp && (answered || joinsOnItsOwn)

	const waiting = onCall && !live
	useEffect(() => {
		if (!waiting) return
		const id = setTimeout(() => setSlow(true), SLOW_MS)
		return () => clearTimeout(id)
	}, [waiting])

	const seconds = useSecondsLeft(clock, serverNow, onCall)

	// partytracks chooses its input from the devices the browser will name, and a
	// browser names none until the page has been allowed a mic once, so the ask
	// goes through getUserMedia here before the call is mounted. `join` says
	// whether this ask is on the way onto the call: one that is joins either way,
	// listening when no mic came, because the others are audible without one.
	const ask = (join: boolean) => {
		setNotice('')
		setAsking(true)
		void askForMic().then((error) => {
			setAsking(false)
			setAllowed(error === null)
			setListening(error !== null)
			if (error) setNotice(micFailure(error))
			if (join) setAnswered(true)
		})
	}

	const isListening = onCall && listening

	return {
		open: callOpen,
		onCall,
		muted,
		waiting,
		listening: isListening,
		notice: notice || (waiting && slow ? NO_MIC : ''),
		countdown: seconds !== null && seconds > 0 && seconds <= COUNT_FROM ? seconds : null,
		permission,
		asking,
		ask: () => ask(false),
		pickUp: () => {
			setSlow(false)
			setLive(false)
			setHungUp(false)
			// A browser that has already said yes needs no second ask, and going
			// through one would blink the button through `asking` for a turn.
			if (permission === 'granted') {
				setNotice('')
				setListening(false)
				setAnswered(true)
			} else ask(true)
		},
		hangUp: () => setHungUp(true),
		toggleMute: () => setMuted((m) => !m),
		audio: onCall ? (
			<Call
				mic={mic}
				members={members}
				you={you}
				muted={muted}
				listening={listening}
				onVoice={onVoice}
				onLive={setLive}
				onMicFailed={(error) => {
					setListening(true)
					setNotice(micFailure(error))
				}}
			/>
		) : null,
	}
}

/**
 * Holds this device's peer connection to the Cloudflare Realtime SFU: its mic
 * pushed up, and every other member's pulled down. React mounts this only while
 * the member is on the call, so hanging up takes the connection with it.
 *
 * Listening needs none of the push half. Pulling the others is a connection in
 * one direction, so a member with no mic joins with `listening` and hears
 * everyone; the room is told their mic is null, and nobody tries to pull it.
 */
function Call({
	mic,
	members,
	you,
	muted,
	listening,
	onVoice,
	onLive,
	onMicFailed,
}: {
	mic: MediaDevice
	members: Member[]
	you: string
	muted: boolean
	listening: boolean
	onVoice: (state: VoiceState) => void
	onLive: (live: boolean) => void
	onMicFailed: (error: Error) => void
}) {
	const partyTracks = useMemo(() => new PartyTracks({ prefix: VOICE_PREFIX }), [])
	const [mine, setMine] = useState<Mic | null>(null)

	// The others cannot pull a mic they cannot find, so the room hears about it
	// the moment the SFU names it, and again each time the connection is remade.
	// Mute is the person's own answer and is reported as they left it, listening
	// or not; `listening` is what says whether a mic is coming at all.
	useEffect(() => {
		onVoice({ onCall: true, listening, muted, mic: listening ? null : mine })
	}, [listening, muted, mine, onVoice])

	useEffect(
		() => () => onVoice({ onCall: false, listening: false, muted: false, mic: null }),
		[onVoice],
	)

	const theirs = members.filter(
		(member) => member.id !== you && member.here && member.onCall && member.mic,
	)

	// A call that cannot reach the SFU looks exactly like one that can, because
	// partytracks retries quietly and its sessionError$ never fires. What the peer
	// connection says, and whether the SFU has named our track, is the truth. A
	// listener pushes no track and, with nobody yet to pull, asks nothing of the
	// connection either, so it has arrived as soon as it is on the call.
	const peerState = useObservableAsValue(partyTracks.peerConnectionState$, 'new')
	const connected = peerState === 'connected'
	const live = listening ? theirs.length === 0 || connected : connected && mine !== null
	useEffect(() => {
		onLive(live)
	}, [live, onLive])

	return (
		<>
			{!listening && (
				<MyMic
					partyTracks={partyTracks}
					mic={mic}
					muted={muted}
					onMic={setMine}
					onFailed={onMicFailed}
				/>
			)}
			{theirs.map((member) => (
				<RemoteMic key={member.id} partyTracks={partyTracks} mic={member.mic!} />
			))}
		</>
	)
}

/**
 * Pushes this device's mic up to the SFU and reports where it landed.
 *
 * Muting keeps the track flowing with silence rather than stopping it, because
 * the SFU collects a track that has sent nothing for 30 seconds. That is what
 * partytracks' broadcastTrack$ does, so mute goes through it and never through
 * the mic's own source.
 */
function MyMic({
	partyTracks,
	mic,
	muted,
	onMic,
	onFailed,
}: {
	partyTracks: PartyTracks
	mic: MediaDevice
	muted: boolean
	onMic: (mic: Mic | null) => void
	onFailed: (error: Error) => void
}) {
	useObservable(mic.error$, onFailed)

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

	// Keyed on the names rather than the object: push() re-emits an equal one
	// every time the broadcast track is swapped, which every mute toggle does.
	useEffect(() => {
		onMic(sessionId && trackName ? { sessionId, trackName } : null)
	}, [sessionId, trackName, onMic])

	useEffect(() => () => onMic(null), [onMic])

	return null
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
