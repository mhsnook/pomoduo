/** One phase's playlist and its YouTube player, lifted from pomodance. */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import type { Phase } from '../../shared/clock'
import { cn } from '../lib/format'
import { parseVideoId, trackAt, trackPos } from '../lib/settings'
import { fetchVideoTitle, loadYouTubeApi, type YTPlayer } from '../lib/youtube'

const PLAYLIST_HEADING: Record<Phase, string> = {
	work: 'Work playlist',
	break: 'Dance playlist',
}

function useVideoTitles(ids: string[]) {
	const [titles, setTitles] = useState<Record<string, string>>({})
	const key = ids.join(',')

	useEffect(() => {
		let cancelled = false
		for (const id of key ? key.split(',') : []) {
			void fetchVideoTitle(id).then((title) => {
				if (title && !cancelled) setTitles((t) => (t[id] ? t : { ...t, [id]: title }))
			})
		}
		return () => {
			cancelled = true
		}
	}, [key])

	return (id: string) => titles[id] ?? id
}

export function PhaseVideo({
	phase,
	active,
	playing,
	videos,
	index,
	startSeconds,
	loadKey,
	onPlaylistChange,
	onSelectTrack,
	onReady,
	onState,
}: {
	phase: Phase
	active: boolean
	playing: boolean
	videos: string[]
	index: number
	startSeconds: number
	/** Changes whenever the track must load again, even at the same index. */
	loadKey: number
	onPlaylistChange: (videos: string[]) => void
	onSelectTrack: (index: number) => void
	onReady: (p: YTPlayer | null) => void
	onState: (state: number) => void
}) {
	const [draft, setDraft] = useState('')
	const [invalid, setInvalid] = useState(false)
	const titleOf = useVideoTitles(videos)

	const pos = trackPos(videos.length, index)
	const videoId = trackAt(videos, index)

	const add = () => {
		const id = parseVideoId(draft)
		if (!id) return setInvalid(true)
		setInvalid(false)
		setDraft('')
		onPlaylistChange([...videos, id])
	}

	const remove = (i: number) => onPlaylistChange(videos.filter((_, n) => n !== i))

	return (
		<div
			data-testid={`${phase}-video`}
			className={cn(
				'flex flex-col gap-2 transition-all',
				active
					? 'pomo-video-main md:col-span-2'
					: 'opacity-60 hover:opacity-100 md:col-span-1',
			)}
		>
			<span className="font-ui text-xs tracking-wide uppercase opacity-70">
				{PLAYLIST_HEADING[phase]}
				{videos.length > 1 && ` · ${pos + 1}/${videos.length}`}
				{active && ' · now playing'}
			</span>
			<div className="aspect-video w-full overflow-hidden rounded-lg bg-black/40">
				{videoId ? (
					<VideoFrame
						videoId={videoId}
						trackKey={`${loadKey}:${index}:${videoId}`}
						startSeconds={startSeconds}
						autoplay={playing}
						onReady={onReady}
						onState={onState}
					/>
				) : (
					<p className="p-4 text-sm opacity-70">
						No videos yet. Paste a youtube link to give this half of the timer a
						soundtrack.
					</p>
				)}
			</div>

			<details
				data-testid={`${phase}-playlist`}
				className="font-ui text-sm opacity-80 open:opacity-100"
			>
				<summary
					id={`${phase}-playlist-toggle`}
					data-testid={`${phase}-playlist-toggle`}
					className="cursor-pointer"
				>
					Playlist ({videos.length})
				</summary>
				<div className="mt-2 flex flex-col gap-2">
					<ol className="flex flex-col gap-1">
						{videos.map((id, i) => (
							<li key={`${id}-${i}`} className="flex items-center gap-2">
								<button
									type="button"
									id={`${phase}-playlist-play-${i}`}
									data-testid={`${phase}-playlist-play-${i}`}
									title="Play this one next"
									aria-label={`Play this one next: ${titleOf(id)}`}
									onClick={() => onSelectTrack(i)}
									className={cn(
										'btn btn-ghost btn-xs',
										i === pos && 'text-[var(--pomo-accent)]',
									)}
								>
									{i === pos ? '▶' : '▷'}
								</button>
								<a
									href={`https://www.youtube.com/watch?v=${id}`}
									target="_blank"
									rel="noreferrer"
									className="link link-hover flex-1 truncate"
								>
									{titleOf(id)}
								</a>
								<button
									type="button"
									id={`${phase}-playlist-remove-${i}`}
									data-testid={`${phase}-playlist-remove-${i}`}
									aria-label={`Remove: ${titleOf(id)}`}
									title="Remove"
									onClick={() => remove(i)}
									className="btn btn-ghost btn-xs"
								>
									✕
								</button>
							</li>
						))}
					</ol>
					<form
						className="flex gap-2"
						onSubmit={(e) => {
							e.preventDefault()
							add()
						}}
					>
						<input
							id={`${phase}-playlist-input`}
							data-testid={`${phase}-playlist-input`}
							value={draft}
							placeholder="Paste a youtube link or id"
							onChange={(e) => {
								setDraft(e.target.value)
								setInvalid(false)
							}}
							className="input input-sm flex-1"
						/>
						<button
							type="submit"
							id={`${phase}-playlist-add`}
							data-testid={`${phase}-playlist-add`}
							className="btn btn-sm"
						>
							Add
						</button>
					</form>
					{invalid && (
						<p className="text-error text-xs">That doesn’t look like a youtube link.</p>
					)}
					<p className="text-xs opacity-60">
						Each switch picks up where this playlist left off, then rolls on to the next
						track.
					</p>
				</div>
			</details>
		</div>
	)
}

function VideoFrame({
	videoId,
	trackKey,
	startSeconds,
	autoplay,
	onReady,
	onState,
}: {
	videoId: string
	trackKey: string
	startSeconds: number
	autoplay: boolean
	onReady: (p: YTPlayer | null) => void
	onState: (state: number) => void
}) {
	const mount = useRef<HTMLDivElement>(null)
	const [player, setPlayer] = useState<YTPlayer | null>(null)
	const loaded = useRef<string | null>(null)

	const latest = useRef({ videoId, trackKey, startSeconds, autoplay, onReady, onState })
	useLayoutEffect(() => {
		latest.current = { videoId, trackKey, startSeconds, autoplay, onReady, onState }
	})

	// One player per phase for the life of the page; tracks are swapped into it
	// below, because tearing the iframe down between songs loses the API handle.
	useEffect(() => {
		if (!mount.current) return
		const { videoId: id, startSeconds: at, trackKey: key } = latest.current
		let created: YTPlayer | null = null
		let cancelled = false
		const host = document.createElement('div')
		mount.current.replaceChildren(host)
		loaded.current = key
		void loadYouTubeApi().then((YT) => {
			if (cancelled) return
			created = new YT.Player(host, {
				videoId: id,
				playerVars: { rel: 0, playsinline: 1, start: Math.floor(at) },
				events: {
					onReady: () => {
						setPlayer(created)
						latest.current.onReady(created)
					},
					onStateChange: (e) => latest.current.onState(e.data),
				},
			})
		})
		return () => {
			cancelled = true
			loaded.current = null
			setPlayer(null)
			latest.current.onReady(null)
			created?.destroy()
		}
	}, [])

	useEffect(() => {
		if (!player || loaded.current === trackKey) return
		loaded.current = trackKey
		const { videoId: id, startSeconds: at, autoplay: play } = latest.current
		if (!id) return
		const request = { videoId: id, startSeconds: Math.floor(at) }
		if (play) player.loadVideoById(request)
		else player.cueVideoById(request)
	}, [trackKey, player])

	return <div ref={mount} className="h-full w-full [&>iframe]:h-full [&>iframe]:w-full" />
}
