import { describe, expect, it } from 'vitest'

import { formatClock, formatLeft, initialOf } from './format'

describe('formatClock', () => {
	it('pads minutes and seconds', () => {
		expect(formatClock(1500)).toBe('25:00')
		expect(formatClock(61)).toBe('01:01')
		expect(formatClock(-5)).toBe('00:00')
	})
})

describe('formatLeft', () => {
	it('pads the seconds and not the minutes', () => {
		expect(formatLeft(126)).toBe('2:06')
		expect(formatLeft(1500)).toBe('25:00')
	})
})

describe('initialOf', () => {
	it('takes the first letter, capitalised', () => {
		expect(initialOf('primo')).toBe('P')
		expect(initialOf('  em')).toBe('E')
	})

	it('falls back to the name a nameless member is shown as', () => {
		expect(initialOf('')).toBe('S')
	})

	it('keeps an emoji whole', () => {
		expect(initialOf('🐙 octo')).toBe('🐙')
	})
})
