/**
 * This device's settings: its playlists, and how the page looks. The phase
 * lengths are not here, because the session's clock holds them for everyone.
 */
import type { Phase } from '../../shared/clock'
import { read, write } from './storage'

export type Settings = {
	videos: Record<Phase, string[]>
	showLedger: boolean
	lessMotion: boolean
	/** The name the other members see next to your changes. */
	name: string
}

const SETTINGS_KEY = 'settings'

export const DEFAULT_SETTINGS: Settings = {
	videos: {
		work: ['uNw_a7HFwvg', 'CFGLoQIhmow'],
		break: ['zjiU2YAlYKY', 'NF-kLy44Hls'],
	},
	showLedger: true,
	lessMotion: false,
	name: '',
}

/**
 * Fills in the defaults for anything a save is missing, and reduces every
 * playlist entry to a bare video id so a position in the list and a playable
 * track are the same thing.
 */
export function normalizeSettings(stored: unknown): Settings {
	const s = (stored ?? {}) as Partial<Settings>
	const videos = (p: Phase): string[] =>
		Array.isArray(s.videos?.[p])
			? s.videos[p]
					.filter((v) => typeof v === 'string')
					.map(parseVideoId)
					.filter(Boolean)
			: DEFAULT_SETTINGS.videos[p]
	return {
		videos: { work: videos('work'), break: videos('break') },
		showLedger: s.showLedger ?? DEFAULT_SETTINGS.showLedger,
		lessMotion: s.lessMotion ?? DEFAULT_SETTINGS.lessMotion,
		name: typeof s.name === 'string' ? s.name : DEFAULT_SETTINGS.name,
	}
}

export const loadSettings = () => normalizeSettings(read(SETTINGS_KEY, {}))
export const saveSettings = (settings: Settings) => write(SETTINGS_KEY, settings)

/** Accepts a bare video id or any of the usual youtube URL shapes. */
export function parseVideoId(input: string): string {
	const s = input.trim()
	if (/^[\w-]{11}$/.test(s)) return s
	try {
		const url = new URL(s)
		if (url.hostname === 'youtu.be') return url.pathname.slice(1, 12)
		const v = url.searchParams.get('v')
		if (v) return v.slice(0, 11)
		const m = url.pathname.match(/\/(?:embed|shorts|live)\/([\w-]{11})/)
		if (m) return m[1]
	} catch {
		/* not a url */
	}
	return ''
}

/**
 * A cursor index counts tracks played rather than position in the list, so that
 * advancing past the end of a one-track playlist still reads as a change.
 */
export const trackPos = (length: number, index: number) =>
	length > 0 ? ((index % length) + length) % length : -1

export const trackAt = (ids: string[], index: number) =>
	ids[trackPos(ids.length, index)] ?? ''
