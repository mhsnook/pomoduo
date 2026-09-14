import {
	FastForward,
	Link as LinkIcon,
	Minus,
	Pause,
	Play,
	Plus,
	Rewind,
	RotateCcw,
	SkipForward,
} from 'lucide-react'
import { useEffect, useEffectEvent, useRef, useState, useSyncExternalStore } from 'react'

import {
	isFresh,
	type MemberCommand,
	otherPhase,
	type Phase,
	PHASES,
	placeIn,
} from '../shared/clock'
import type { ClockRow } from '../shared/schema'
import { Clock } from './components/Clock'
import { Ledger } from './components/Ledger'
import { Members } from './components/Members'
import { PhaseVideo } from './components/PhaseVideo'
import { EditPomoDialog, ReviewDialog } from './components/PomoDialogs'
import {
	clampMinutes,
	Modal,
	SettingInput,
	Toggle,
	TransportButton,
} from './components/ui'
import { cn } from './lib/format'
import {
	byStart,
	closeAbandoned,
	dayLabel,
	isThrowaway,
	lastUnreviewed,
	loadDay,
	loadIntention,
	pauseWork,
	type Pomo,
	readPomos,
	resolveDay,
	resumeWork,
	saveDay,
	saveIntention,
	savePomos,
	straddlesRollover,
	workDayOf,
} from './lib/ledger'
import { placeToTrack } from './lib/playlist'
import { loadSettings, type Settings, saveSettings } from './lib/settings'
import { sounds } from './lib/sounds'
import type { YTPlayer } from './lib/youtube'
import { SessionConnection, type SessionEvent } from './session/connection'

/** One press of the jump controls moves the clock and the video this far. */
const JUMP_MS = 60_000
/** One press of the longer and shorter controls changes the phase by this much. */
const STRETCH_MS = 60_000
/** Long enough for a player told to play to have reached playing or buffering. */
const PLAYBACK_CHECK_MS = 1_500
/**
 * A player's own play or pause counts as a click on the video only when it
 * contradicts what the page last told that player, and not this soon after.
 * Players report the page's own requests a little late.
 */
const TOLD_GRACE_MS = 800
/** How long the intention waits for typing to stop before the session hears it. */
const MEMBER_UPDATE_MS = 400

const MINUTES_LABEL: Record<Phase, string> = {
	work: 'Work minutes',
	break: 'Break minutes',
}

const weekday = (day: string) => dayLabel(day).split(',')[0]

/** Whether sound is on its way out of this player, rather than waiting on a click. */
function playbackUnderway(player: YTPlayer) {
	const YT = window.YT
	if (!YT) return false
	try {
		const state = player.getPlayerState()
		return state === YT.PlayerState.PLAYING || state === YT.PlayerState.BUFFERING
	} catch {
		return true
	}
}

/** The byline under the clock: who made the last change. */
function describe(change: Pick<ClockRow, 'actor' | 'command' | 'deltaMs'>) {
	const seconds = Math.abs(change.deltaMs) / 1000
	const minutes = Math.round(Math.abs(change.deltaMs) / 60_000)
	switch (change.command) {
		case 'start':
			return `${change.actor} started the clock`
		case 'pause':
			return `${change.actor} paused`
		case 'nudge':
			return `${change.actor} jumped ${change.deltaMs < 0 ? 'back' : 'forward'} ${seconds >= 60 ? `${minutes}m` : `${seconds}s`}`
		case 'stretch':
			return `${change.actor} made this ${minutes}m ${change.deltaMs < 0 ? 'shorter' : 'longer'}`
		case 'skip':
			return `${change.actor} skipped ahead`
		case 'reset':
			return `${change.actor} started this one over`
		case 'durations':
			return `${change.actor} changed the lengths`
		case 'end':
			return 'Everyone left, so the session ended'
		default:
			return ''
	}
}

/** Opens the connection to one session, and closes it when the page leaves. */
export function SessionPage({ sessionId }: { sessionId: string }) {
	const [settings, setSettings] = useState<Settings>(loadSettings)
	const [connection, setConnection] = useState<SessionConnection | null>(null)
	// the connection asks for the name each time it sends, so it always sends the latest
	const name = useRef(settings.name)
	useEffect(() => {
		name.current = settings.name
	}, [settings.name])

	useEffect(() => {
		const opened = new SessionConnection(sessionId, () => name.current)
		setConnection(opened)
		return () => opened.close()
	}, [sessionId])

	const updateSettings = (patch: Partial<Settings>) => {
		const next = { ...settings, ...patch }
		setSettings(next)
		saveSettings(next)
	}

	if (!connection) return null
	return (
		<Session
			connection={connection}
			settings={settings}
			updateSettings={updateSettings}
		/>
	)
}

function Session({
	connection,
	settings,
	updateSettings,
}: {
	connection: SessionConnection
	settings: Settings
	updateSettings: (patch: Partial<Settings>) => void
}) {
	const { status, clock, lastChange, members } = useSyncExternalStore(
		connection.subscribe,
		connection.getState,
	)
	const { phase } = clock
	const running = clock.endsAt !== null
	const isBreak = phase === 'break'
	const idle = isFresh(clock)

	const [pomos, setPomos] = useState(readPomos)
	const [day, setDay] = useState(() => resolveDay(loadDay(), pomos, Date.now()))
	// the saved intention belongs to the saved day; a new day starts blank
	const [intention, setIntention] = useState(() =>
		day === loadDay() ? loadIntention() : '',
	)
	const current = pomos.find((p) => p.end === null) ?? null

	// the session hears this member's name and intention once typing stops
	useEffect(() => {
		if (status !== 'live') return
		const id = setTimeout(
			() => connection.updateMember({ name: settings.name, intention }),
			MEMBER_UPDATE_MS,
		)
		return () => clearTimeout(id)
	}, [connection, status, settings.name, intention])

	const [review, setReview] = useState<Pomo | null>(null)
	const [editing, setEditing] = useState<Pomo | null>(null)
	const [askRollover, setAskRollover] = useState(false)
	const [showSettings, setShowSettings] = useState(false)
	const [askName, setAskName] = useState(!settings.name)
	const [copied, setCopied] = useState(false)

	const [tracks, setTracks] = useState<
		Record<Phase, { index: number; startMs: number; loadKey: number }>
	>({
		work: { index: 0, startMs: 0, loadKey: 0 },
		break: { index: 0, startMs: 0, loadKey: 0 },
	})
	const players = useRef<Record<Phase, YTPlayer | null>>({ work: null, break: null })
	/** What the page last asked of each player, and when. */
	const told = useRef<Record<Phase, { want: 'play' | 'pause'; at: number } | null>>({
		work: null,
		break: null,
	})
	/** Whether each player has ever actually played: only one that has may stop the clock. */
	const played = useRef<Record<Phase, boolean>>({ work: false, break: false })
	const [confirmSwitch, setConfirmSwitch] = useState<Phase | null>(null)
	const [playersReady, setPlayersReady] = useState(0)
	const [musicBlocked, setMusicBlocked] = useState(false)

	// the tab icon follows the phase
	useEffect(() => {
		const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
		if (link) link.href = isBreak ? '/icon-break.png' : '/icon-work.png'
	}, [isBreak])

	useEffect(() => savePomos(pomos), [pomos])
	useEffect(() => saveDay(day), [day])
	useEffect(() => saveIntention(intention), [intention])

	const newPomo = (now: number, running: boolean): Pomo => ({
		id: crypto.randomUUID(),
		day,
		start: new Date(now).toISOString(),
		end: null,
		intention,
		note: '',
		confirmed: false,
		workedMs: 0,
		runningSince: running ? now : null,
	})

	// Once the session's clock is known: end any pomo a closed tab left open,
	// unless the clock is still in the work phase it belongs to; bring the worked
	// time up to date; and open a pomo if the clock is already running work.
	const joined = useRef(false)
	const onLive = useEffectEvent(() => {
		const now = Date.now()
		const inWork = clock.phase === 'work' && !isFresh(clock)
		const tidy = closeAbandoned(pomos, clock.durations.work, inWork, now)
		const open = tidy.find((p) => p.end === null)
		if (open) {
			const since = Math.min(now, lastChange?.stampedAt ?? now)
			const caughtUp = running ? resumeWork(open, now) : pauseWork(open, since)
			setPomos(tidy.map((p) => (p === open ? caughtUp : p)))
		} else if (clock.phase === 'work' && running) {
			setPomos([...tidy, newPomo(now, true)])
		} else {
			setPomos(tidy)
		}
	})
	useEffect(() => {
		if (status !== 'live' || joined.current) return
		joined.current = true
		onLive()
	}, [status])

	// The ledger and the video react to the clock, whoever moved it.
	const patchPomo = (id: string, patch: Partial<Pomo>) =>
		setPomos((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)))

	// what a pomo opened or closed in this same event has done to `current`
	const opened = useRef<Pomo | null | undefined>(undefined)

	const openPomo = (now: number) => {
		if ((opened.current === undefined ? current : opened.current) !== null) return
		if (straddlesRollover(day, pomos, now)) setAskRollover(true)
		const pomo = newPomo(now, true)
		opened.current = pomo
		setPomos((ps) => [...ps, pomo])
	}

	const closePomo = (now: number) => {
		if (!current) return
		opened.current = null
		if (isThrowaway(current, now)) {
			setPomos((ps) => ps.filter((p) => p.id !== current.id))
			return
		}
		const closed = { ...pauseWork(current, now), end: new Date(now).toISOString() }
		patchPomo(current.id, closed)
		setReview(closed)
	}

	const onChange = useEffectEvent(
		({ before, after, command }: Extract<SessionEvent, { type: 'change' }>) => {
			const now = Date.now()
			opened.current = undefined
			if (after.phase !== before.phase) sounds.ring()
			else if (command === 'start') sounds.beep()
			else sounds.click()

			const wasRunning = before.endsAt !== null
			const isRunning = after.endsAt !== null
			if (before.phase === 'work' && after.phase === 'break') closePomo(now)
			if (before.phase === 'break' && after.phase === 'work' && command === 'nudge') {
				// jumping back out of a break takes back the pomo that break ended
				const last = lastUnreviewed(pomos, day)
				if (last) {
					const reopened = isRunning
						? resumeWork({ ...last, end: null }, now)
						: { ...last, end: null }
					patchPomo(last.id, reopened)
					opened.current = reopened
					setReview((r) => (r?.id === last.id ? null : r))
				}
			}
			// the worked time follows the clock's pauses and starts within work
			if (before.phase === 'work' && after.phase === 'work' && current) {
				if (wasRunning && !isRunning) patchPomo(current.id, pauseWork(current, now))
				if (!wasRunning && isRunning) patchPomo(current.id, resumeWork(current, now))
			}
			if (after.phase === 'work' && isRunning) openPomo(now)
		},
	)

	/** Play or pause a player, remembering that the page asked for it. */
	const tell = (p: Phase, want: 'play' | 'pause') => {
		const player = players.current[p]
		if (!player) return
		told.current[p] = { want, at: Date.now() }
		try {
			if (want === 'play') player.playVideo()
			else player.pauseVideo()
		} catch {
			/* player went away */
		}
	}

	/** Seek a player. seekTo starts a cued player, so a stopped one is told to stop again. */
	const seek = (p: Phase, seconds: number, playing: boolean) => {
		const player = players.current[p]
		if (!player) return
		try {
			player.seekTo(Math.max(0, seconds), true)
		} catch {
			/* player went away mid-seek */
		}
		if (!playing) tell(p, 'pause')
	}

	/** Put a phase's playlist at a place, in ms from its start. */
	const cue = (p: Phase, placeMs: number, playing: boolean) => {
		const spot = placeToTrack(settings.videos[p], connection.lengthOf, placeMs)
		if (!spot) return
		if (players.current[p] && spot.index === tracks[p].index) {
			seek(p, spot.offsetMs / 1000, playing)
		} else {
			setTracks((t) => ({
				...t,
				[p]: { index: spot.index, startMs: spot.offsetMs, loadKey: t[p].loadKey + 1 },
			}))
		}
	}

	/** Each command reaches the video once. Nothing else moves it. */
	const onVideo = useEffectEvent(
		(effect: Extract<SessionEvent, { type: 'video' }>['effect']) => {
			const p = connection.getState().clock.phase
			if (effect.cueAt !== undefined) cue(p, effect.cueAt, effect.playing)
			const player = players.current[p]
			if (effect.moveBy !== undefined && player) {
				try {
					seek(p, player.getCurrentTime() + effect.moveBy / 1000, effect.playing)
				} catch {
					/* player went away mid-seek */
				}
			}
		},
	)

	/** Joining: both playlists go where the shared clock says, once. */
	const onJoin = useEffectEvent(
		({ clock: joinedAt, now }: Extract<SessionEvent, { type: 'join' }>) => {
			const other = otherPhase(joinedAt.phase)
			cue(joinedAt.phase, placeIn(joinedAt, now), joinedAt.endsAt !== null)
			cue(other, Math.max(0, joinedAt.playlist[other]), false)
		},
	)

	useEffect(
		() =>
			connection.onEvent((event) => {
				if (event.type === 'change') onChange(event)
				else if (event.type === 'video') onVideo(event.effect)
				else onJoin(event)
			}),
		[connection],
	)

	// the players follow the clock; only the current phase's player plays
	useEffect(() => {
		let check: ReturnType<typeof setTimeout> | undefined
		for (const p of PHASES) {
			const player = players.current[p]
			if (!player) continue
			if (p === phase && running) {
				tell(p, 'play')
				// a page that has not been clicked yet is not allowed to start audio,
				// and the refusal is silent: ask the player afterwards whether it took
				check = setTimeout(
					() => setMusicBlocked(!playbackUnderway(player)),
					PLAYBACK_CHECK_MS,
				)
			} else {
				tell(p, 'pause')
			}
		}
		return () => clearTimeout(check)
	}, [phase, running, playersReady])

	// the click that dismisses the notice is a user gesture wherever it lands
	const showMusicBlocked = musicBlocked && running
	useEffect(() => {
		if (!showMusicBlocked) return
		const retry = () => tell(phase, 'play')
		window.addEventListener('pointerdown', retry)
		window.addEventListener('keydown', retry)
		return () => {
			window.removeEventListener('pointerdown', retry)
			window.removeEventListener('keydown', retry)
		}
	}, [showMusicBlocked, phase])

	const press = (command: MemberCommand) => connection.press(command)

	const setTrack = (p: Phase, index: number) =>
		setTracks((t) => ({ ...t, [p]: { index, startMs: 0, loadKey: t[p].loadKey + 1 } }))

	const onPlayerState = useEffectEvent((p: Phase, state: number) => {
		const YT = window.YT!
		const player = players.current[p]
		if (!player) return
		if (state === YT.PlayerState.PLAYING || state === YT.PlayerState.CUED) {
			const videoId = settings.videos[p][tracks[p].index % settings.videos[p].length]
			if (videoId) connection.learnLength(videoId, player.getDuration() * 1000)
		}
		if (state === YT.PlayerState.PLAYING) {
			played.current[p] = true
			if (p === phase) setMusicBlocked(false)
		}
		if (state === YT.PlayerState.ENDED) {
			setTrack(p, (tracks[p].index + 1) % settings.videos[p].length)
			return
		}
		// The video's own play and pause drive the clock, but only when they go
		// against what the page last told the player: those are clicks on the video.
		const last = told.current[p]
		const recent = last !== null && Date.now() - last.at < TOLD_GRACE_MS
		if (p !== phase) {
			if (state !== YT.PlayerState.PLAYING || (recent && last.want === 'play')) return
			// playing the other phase's video asks to switch to that phase
			tell(p, 'pause')
			if (running) setConfirmSwitch(p)
			else press({ type: 'skip' })
			return
		}
		if (recent) return
		if (state === YT.PlayerState.PLAYING && !running && last?.want !== 'play') {
			press({ type: 'start' })
		} else if (
			state === YT.PlayerState.PAUSED &&
			running &&
			played.current[p] &&
			last?.want !== 'pause'
		) {
			press({ type: 'pause' })
		}
	})

	const registerPlayer = (p: Phase, player: YTPlayer | null) => {
		players.current[p] = player
		setPlayersReady((n) => n + 1)
	}

	const updateIntention = (value: string) => {
		setIntention(value)
		if (current)
			setPomos((ps) =>
				ps.map((p) => (p.id === current.id ? { ...p, intention: value } : p)),
			)
	}

	const finishReview = (note: string, confirmed: boolean, clearIntention: boolean) => {
		if (review)
			setPomos((ps) =>
				ps.map((p) => (p.id === review.id ? { ...p, note, confirmed } : p)),
			)
		if (clearIntention) updateIntention('')
		setReview(null)
	}

	const copyInvite = async () => {
		await navigator.clipboard.writeText(location.href)
		setCopied(true)
		setTimeout(() => setCopied(false), 2000)
	}

	const today = workDayOf(new Date())
	// enter puts you back to work, but will not start a break you stopped on purpose
	const enterStarts = !running && (idle || phase === 'work')

	return (
		<div
			data-testid="session-page"
			data-theme="emju-dark"
			className={cn(
				'pomo flex min-h-screen flex-col',
				isBreak && 'is-break',
				settings.lessMotion && 'is-calm',
			)}
		>
			<div
				className={cn(
					'grid flex-1 gap-6 p-6',
					settings.showLedger && 'lg:grid-cols-[1fr_20rem]',
				)}
			>
				<div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
					<header className="flex items-start justify-between gap-4">
						<div className="flex flex-col gap-1">
							<h1 className="font-display text-3xl">
								{isBreak ? '💃 break time 🕺' : '🍅 pomoduo'}
							</h1>
							<p className="font-ui text-sm opacity-70">
								{status === 'connecting'
									? 'Joining the session…'
									: 'A pomodoro timer for coworking with a friend.'}
							</p>
						</div>
						<div className="flex shrink-0 items-center gap-2">
							<button
								type="button"
								data-testid="invite-button"
								onClick={copyInvite}
								className="btn btn-ghost btn-sm font-ui"
								title="Copy a link to this session"
							>
								<LinkIcon className="size-4" />
								{copied ? 'Link copied' : 'Invite'}
							</button>
							<button
								type="button"
								data-testid="settings-button"
								aria-label="Settings"
								title="Settings"
								onClick={() => setShowSettings(true)}
								className="btn btn-circle btn-ghost text-xl"
							>
								⚙
							</button>
						</div>
					</header>

					{isBreak && (
						<div className="pomo-dancers" aria-hidden>
							{['💃', '🪩', '🕺', '✨', '💃', '🪩', '🕺'].map((d, i) => (
								<span key={i}>{d}</span>
							))}
						</div>
					)}

					<div
						data-testid="timer-controls"
						className="pomo-controls flex flex-col items-center gap-4 pt-3 pb-8"
					>
						<div className="flex items-center justify-center gap-4">
							<Clock clock={clock} serverNow={connection.serverNow} isBreak={isBreak} />
							<div className="flex flex-col gap-2">
								<TransportButton
									id="pomo-longer"
									testId="longer-button"
									label="Longer"
									title="Make this a minute longer"
									onClick={() => press({ type: 'stretch', deltaMs: STRETCH_MS })}
									className="size-8 border border-current/30"
								>
									<Plus className="size-5" />
								</TransportButton>
								<TransportButton
									id="pomo-shorter"
									testId="shorter-button"
									label="Shorter"
									title="Make this a minute shorter"
									onClick={() => press({ type: 'stretch', deltaMs: -STRETCH_MS })}
									className="size-8 border border-current/30"
								>
									<Minus className="size-5" />
								</TransportButton>
							</div>
						</div>
						<div className="flex items-center justify-center gap-3">
							<TransportButton
								id="pomo-reset"
								testId="reset-button"
								label="Start over"
								onClick={() => press({ type: 'reset' })}
								className="size-11"
							>
								<RotateCcw className="size-5" />
							</TransportButton>
							<TransportButton
								id="pomo-back"
								testId="back-button"
								label="Back a minute"
								title="Back a minute, music and all"
								onClick={() => press({ type: 'nudge', deltaMs: -JUMP_MS })}
								className="size-11"
							>
								<Rewind className="size-5" />
							</TransportButton>
							<TransportButton
								id="pomo-start"
								testId="start-button"
								label={running ? 'Pause' : 'Start'}
								title={running ? 'Pause' : idle ? 'Start' : 'Resume'}
								onClick={() => press({ type: running ? 'pause' : 'start' })}
								className="size-16 border-0 bg-[var(--pomo-accent)] text-black hover:scale-105 hover:bg-[var(--pomo-accent)]"
							>
								{running ? (
									<Pause className="size-7 fill-current" />
								) : (
									<Play className="size-7 fill-current" />
								)}
							</TransportButton>
							<TransportButton
								id="pomo-forward"
								testId="forward-button"
								label="Forward a minute"
								title="Forward a minute, music and all"
								onClick={() => press({ type: 'nudge', deltaMs: JUMP_MS })}
								className="size-11"
							>
								<FastForward className="size-5" />
							</TransportButton>
							<TransportButton
								id="pomo-switch"
								testId="switch-button"
								label={isBreak ? 'Back to work' : 'Skip to break'}
								onClick={() => press({ type: 'skip' })}
								className="size-11"
							>
								<SkipForward className="size-5" />
							</TransportButton>
						</div>
						<p data-testid="last-change" className="font-ui min-h-5 text-xs opacity-60">
							{lastChange ? describe(lastChange) : ''}
						</p>
					</div>

					<Members members={members} you={connection.memberId} />

					<SettingInput
						testId="intention-input"
						className="mx-auto w-full max-w-xl"
						label={`Intention for this pomo${enterStarts ? (idle ? ' — enter to start' : ' — enter to resume') : ''}`}
						value={intention}
						onChange={updateIntention}
						onEnter={enterStarts ? () => press({ type: 'start' }) : undefined}
						placeholder="what are you going to do?"
					/>

					{showMusicBlocked && (
						<div
							data-testid="music-blocked"
							className="flex flex-col items-center gap-1 text-center"
						>
							<button
								type="button"
								data-testid="resume-music"
								onClick={() => tell(phase, 'play')}
								className="btn btn-outline rounded-full"
							>
								▶ Bring the music back
							</button>
							<p className="font-ui text-xs opacity-70">
								Browsers don’t let a page start audio on its own, so the soundtrack needs
								one click after a reload.
							</p>
						</div>
					)}

					<section className="grid items-start gap-4 md:grid-cols-3">
						{PHASES.map((p) => (
							<PhaseVideo
								key={p}
								phase={p}
								active={phase === p}
								playing={phase === p && running}
								videos={settings.videos[p]}
								index={tracks[p].index}
								startSeconds={tracks[p].startMs / 1000}
								loadKey={tracks[p].loadKey}
								onPlaylistChange={(videos) =>
									updateSettings({ videos: { ...settings.videos, [p]: videos } })
								}
								onSelectTrack={(i) => setTrack(p, i)}
								onReady={(player) => registerPlayer(p, player)}
								onState={(s) => onPlayerState(p, s)}
							/>
						))}
					</section>
				</div>

				{settings.showLedger && <Ledger pomos={pomos} day={day} onEdit={setEditing} />}
			</div>

			<footer className="font-ui px-6 pb-6 text-center text-xs opacity-60">
				pomoduo, grown from{' '}
				<a href="https://emju.in/pomodance" className="underline underline-offset-2">
					pomodance
				</a>
			</footer>

			{askName && (
				<Modal testId="name-dialog" onDismiss={() => setAskName(false)}>
					<h2 className="font-display text-2xl">What should your friend see you as?</h2>
					<p className="text-sm opacity-75">
						Your name shows next to the changes you make to the clock.
					</p>
					<form
						className="flex flex-col gap-4"
						onSubmit={(e) => {
							e.preventDefault()
							setAskName(false)
						}}
					>
						<SettingInput
							testId="name-input"
							label="Your name"
							value={settings.name}
							onChange={(v) => updateSettings({ name: v.slice(0, 40) })}
						/>
						<div className="modal-action">
							<button type="submit" data-testid="name-done" className="btn btn-primary">
								Done
							</button>
						</div>
					</form>
				</Modal>
			)}

			{showSettings && (
				<Modal testId="settings-dialog" onDismiss={() => setShowSettings(false)}>
					<h2 className="font-display text-2xl">Settings</h2>
					<SettingInput
						testId="settings-name-input"
						label="Your name"
						value={settings.name}
						onChange={(v) => updateSettings({ name: v.slice(0, 40) })}
					/>
					<div className="grid gap-3 sm:grid-cols-2">
						{PHASES.map((p) => (
							<SettingInput
								key={p}
								testId={`${p}-minutes-input`}
								label={`${MINUTES_LABEL[p]} (for everyone here)`}
								type="number"
								value={String(Math.round(clock.durations[p] / 60_000))}
								onChange={(v) =>
									press({
										type: 'durations',
										durations: {
											...clock.durations,
											[p]:
												clampMinutes(v, Math.round(clock.durations[p] / 60_000)) * 60_000,
										},
									})
								}
							/>
						))}
					</div>
					<Toggle
						testId="ledger-toggle"
						label="Show the ledger"
						checked={settings.showLedger}
						onChange={(v) => updateSettings({ showLedger: v })}
					/>
					<Toggle
						testId="less-motion-toggle"
						label="Less motion"
						hint="Calmer colours and no wobbling while the dance music plays."
						checked={settings.lessMotion}
						onChange={(v) => updateSettings({ lessMotion: v })}
					/>
					<div className="modal-action">
						<button
							type="button"
							data-testid="settings-done"
							className="btn btn-primary"
							onClick={() => setShowSettings(false)}
						>
							Done
						</button>
					</div>
				</Modal>
			)}

			{review && (
				<ReviewDialog
					pomo={review}
					onDismiss={() =>
						finishReview(review.note || review.intention, review.confirmed, false)
					}
					onSave={(note, clearIntention) => finishReview(note, true, clearIntention)}
				/>
			)}

			{editing && (
				<EditPomoDialog
					pomo={editing}
					otherInProgress={current !== null && current.id !== editing.id}
					onDismiss={() => setEditing(null)}
					onSave={(edited) => {
						setPomos((ps) =>
							ps.map((p) => (p.id === edited.id ? edited : p)).sort(byStart),
						)
						setEditing(null)
					}}
					onDelete={() => {
						setPomos((ps) => ps.filter((p) => p.id !== editing.id))
						setEditing(null)
					}}
				/>
			)}

			{confirmSwitch && (
				<Modal testId="confirm-switch-dialog" onDismiss={() => setConfirmSwitch(null)}>
					<h2 className="font-display text-2xl">
						{confirmSwitch === 'break'
							? 'End the pomo and start the break?'
							: 'End the break and get back to work?'}
					</h2>
					<p className="text-sm opacity-75">This switches the clock for everyone here.</p>
					<div className="modal-action">
						<button
							type="button"
							className="btn btn-outline"
							onClick={() => setConfirmSwitch(null)}
						>
							No, stay
						</button>
						<button
							type="button"
							data-testid="confirm-switch-yes"
							className="btn btn-primary"
							onClick={() => {
								if (phase !== confirmSwitch) press({ type: 'skip' })
								setConfirmSwitch(null)
							}}
						>
							Yes, switch
						</button>
					</div>
				</Modal>
			)}

			{askRollover && (
				<Modal testId="rollover-dialog" onDismiss={() => setAskRollover(false)}>
					<h2 className="font-display text-2xl">It’s past 4am</h2>
					<p>
						Still working late on {dayLabel(day)}, or is this {dayLabel(today)} now?
					</p>
					<div className="modal-action">
						<button
							type="button"
							className="btn btn-outline"
							onClick={() => setAskRollover(false)}
						>
							Still {weekday(day)}
						</button>
						<button
							type="button"
							className="btn btn-primary"
							onClick={() => {
								setDay(today)
								if (current)
									setPomos((ps) =>
										ps.map((p) => (p.id === current.id ? { ...p, day: today } : p)),
									)
								setAskRollover(false)
							}}
						>
							Switch to {weekday(today)}
						</button>
					</div>
				</Modal>
			)}
		</div>
	)
}
