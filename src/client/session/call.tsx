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
import { useEffect, useMemo, useRef } from 'react'

import { type Mic, type Member, VOICE_PREFIX } from '../../shared/schema'

/** What this device tells the room about where it sits on the call. */
export type VoiceState = { onCall: boolean; muted: boolean; mic: Mic | null }

/** Whether this device's own mic has reached the call yet. */
export type CallStatus = 'connecting' | 'live'

/**
 * This device on the session's call: its mic goes up to the Cloudflare Realtime
 * SFU, and every other member's comes back down. Mounted only while this member
 * is on the call, so hanging up takes the peer connection and the mic with it.
 *
 * Muting keeps the track flowing with silence rather than stopping it, because
 * the SFU collects a track that has sent nothing for 30 seconds. That is what
 * partytracks' broadcastTrack$ does, so mute goes through it and never through
 * the mic's own source.
 */
export function Call({
	members,
	you,
	muted,
	onVoice,
	onStatus,
	onMicFailed,
}: {
	members: Member[]
	you: string
	muted: boolean
	onVoice: (state: VoiceState) => void
	onStatus: (status: CallStatus) => void
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

	// the others cannot pull a mic they cannot find, so the room hears about it
	// the moment the SFU names it, and again each time the connection is remade
	useEffect(() => {
		const { sessionId, trackName } = metadata ?? {}
		onVoice({
			onCall: true,
			muted,
			mic: sessionId && trackName ? { sessionId, trackName } : null,
		})
	}, [metadata, muted, onVoice])

	useEffect(() => () => onVoice({ onCall: false, muted: false, mic: null }), [onVoice])

	// A call that cannot reach the SFU looks exactly like one that can, because
	// partytracks retries quietly and its sessionError$ never fires. What the peer
	// connection says, and whether the SFU has named our track, is the truth.
	const peerState = useObservableAsValue(partyTracks.peerConnectionState$, 'new')
	const live = peerState === 'connected' && metadata !== undefined
	useEffect(() => {
		onStatus(live ? 'live' : 'connecting')
	}, [live, onStatus])

	const others = members.flatMap((member) =>
		member.id !== you && member.here && member.onCall && member.mic
			? [{ id: member.id, mic: member.mic }]
			: [],
	)
	return (
		<>
			{others.map((other) => (
				<RemoteMic key={other.id} partyTracks={partyTracks} mic={other.mic} />
			))}
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
