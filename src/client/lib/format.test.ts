import { describe, expect, it } from 'vitest'

import { formatClock } from './format'

describe('formatClock', () => {
	it('pads minutes and seconds', () => {
		expect(formatClock(1500)).toBe('25:00')
		expect(formatClock(61)).toBe('01:01')
		expect(formatClock(-5)).toBe('00:00')
	})
})
