import { describe, expect, it } from 'vitest'

import { micFailure } from './mic'

describe('micFailure', () => {
	it('names the browser refusing the page', () => {
		expect(micFailure({ name: 'NotAllowedError', message: '' })).toMatch(
			/not letting the page/,
		)
	})

	it('never leaves the sentence hanging when the error has no message', () => {
		// partytracks raises this one with no message, which is what a browser that
		// has not been asked for the mic yet leaves it nothing to try.
		expect(micFailure({ name: 'DevicesExhaustedError', message: '' })).toMatch(
			/No mic reached the page/,
		)
		expect(micFailure({ name: 'WeirdError', message: '' })).toBe('The mic did not start.')
	})

	it('passes on a message it has no sentence for', () => {
		expect(micFailure({ name: 'WeirdError', message: 'the mic exploded' })).toBe(
			'The mic did not start: the mic exploded',
		)
	})
})
