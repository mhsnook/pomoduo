import { describe, expect, it } from 'vitest'

import {
	DEFAULT_SETTINGS,
	normalizeSettings,
	parseVideoId,
	trackAt,
	trackPos,
} from './settings'

// Lifted from pomodance.

describe('normalizeSettings', () => {
	it('falls back to the defaults for anything a save is missing', () => {
		expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS)
		expect(normalizeSettings({ name: 'Em' })).toEqual({ ...DEFAULT_SETTINGS, name: 'Em' })
	})
	it('reduces playlist entries to ids and drops the unplayable ones', () => {
		const s = normalizeSettings({
			videos: {
				work: ['https://www.youtube.com/watch?v=jfKfPfyJRdk', 'nope', 42],
				break: [],
			},
		})
		expect(s.videos.work).toEqual(['jfKfPfyJRdk'])
		expect(s.videos.break).toEqual([])
	})
})

describe('parseVideoId', () => {
	it('accepts bare ids and the usual url shapes', () => {
		expect(parseVideoId('jfKfPfyJRdk')).toBe('jfKfPfyJRdk')
		expect(parseVideoId('https://www.youtube.com/watch?v=jfKfPfyJRdk&t=10')).toBe(
			'jfKfPfyJRdk',
		)
		expect(parseVideoId('https://youtu.be/jfKfPfyJRdk')).toBe('jfKfPfyJRdk')
		expect(parseVideoId('https://www.youtube.com/embed/jfKfPfyJRdk')).toBe('jfKfPfyJRdk')
		expect(parseVideoId('https://www.youtube.com/live/jfKfPfyJRdk?si=x')).toBe(
			'jfKfPfyJRdk',
		)
	})
	it('returns empty for junk', () => {
		expect(parseVideoId('')).toBe('')
		expect(parseVideoId('not a url')).toBe('')
	})
})

describe('trackPos', () => {
	it('wraps back to the start of the playlist', () => {
		expect(trackPos(3, 0)).toBe(0)
		expect(trackPos(3, 4)).toBe(1)
		expect(trackPos(1, 7)).toBe(0)
		expect(trackPos(0, 2)).toBe(-1)
	})
	it('reads a track out of the list, or nothing from an empty one', () => {
		expect(trackAt(['a', 'b', 'c'], 4)).toBe('b')
		expect(trackAt([], 0)).toBe('')
	})
})
