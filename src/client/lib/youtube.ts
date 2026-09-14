/** The YouTube iframe API, and video titles for the playlist. Lifted from pomodance. */

type VideoRequest = { videoId: string; startSeconds?: number }

export type YTPlayer = {
	playVideo(): void
	pauseVideo(): void
	loadVideoById(request: VideoRequest): void
	cueVideoById(request: VideoRequest): void
	seekTo(seconds: number, allowSeekAhead: boolean): void
	getCurrentTime(): number
	getPlayerState(): number
	getDuration(): number
	destroy(): void
}

type YTNamespace = {
	Player: new (
		el: HTMLElement,
		opts: {
			videoId: string
			playerVars?: Record<string, string | number>
			events?: {
				onReady?: () => void
				onStateChange?: (e: { data: number }) => void
			}
		},
	) => YTPlayer
	PlayerState: {
		UNSTARTED: number
		ENDED: number
		PLAYING: number
		PAUSED: number
		BUFFERING: number
		CUED: number
	}
}

declare global {
	interface Window {
		YT?: YTNamespace
		onYouTubeIframeAPIReady?: () => void
	}
}

let ytReady: Promise<YTNamespace> | null = null

export function loadYouTubeApi(): Promise<YTNamespace> {
	ytReady ??= new Promise((resolve) => {
		if (window.YT?.Player) return resolve(window.YT)
		const prev = window.onYouTubeIframeAPIReady
		window.onYouTubeIframeAPIReady = () => {
			prev?.()
			resolve(window.YT!)
		}
		const script = document.createElement('script')
		script.src = 'https://www.youtube.com/iframe_api'
		document.head.appendChild(script)
	})
	return ytReady
}

// ---- video titles ----

const titles = new Map<string, Promise<string | null>>()

async function requestTitle(id: string): Promise<string | null> {
	try {
		const res = await fetch(
			`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(
				`https://www.youtube.com/watch?v=${id}`,
			)}`,
		)
		if (!res.ok) return null
		const { title } = (await res.json()) as { title?: string }
		return title ?? null
	} catch {
		return null
	}
}

/** Caches the promise, not the title, so a miss is not retried on every edit. */
export function fetchVideoTitle(id: string): Promise<string | null> {
	const pending = titles.get(id) ?? requestTitle(id)
	titles.set(id, pending)
	return pending
}

/** Keeps the old value when a re-read from storage turns up the same thing. */
