import { describe, expect, it } from 'vitest'

import { firstSync, resync } from './server-time'

// Server time is 5,000,000 when the device's steady timer reads 0, and each
// message takes 300 ms each way.
const OFFSET = 5_000_000
const arrivesAt = (serverAt: number, latency: number, lostMs = 0) =>
	serverAt + latency - OFFSET - lostMs

describe('server time', () => {
	const time = firstSync(0, OFFSET + 300, 600)

	it('measures the offset from one round trip', () => {
		expect(time).toEqual({ offset: OFFSET, rtt: 600 })
	})

	it('leaves the offset alone for messages that arrive on time, early, or late', () => {
		for (const latency of [300, 20, 2_000]) {
			expect(
				resync(time, {
					serverAt: OFFSET + 10_000,
					receivedAt: arrivesAt(OFFSET + 10_000, latency),
				}),
			).toBe(time)
		}
	})

	it('corrects from any message once the device has fallen more than 100 ms behind', () => {
		const behind = resync(time, {
			serverAt: OFFSET + 10_000,
			receivedAt: arrivesAt(OFFSET + 10_000, 300, 2_000),
		})
		expect(behind.offset - time.offset).toBe(2_000)
		const slightly = resync(time, {
			serverAt: OFFSET + 10_000,
			receivedAt: arrivesAt(OFFSET + 10_000, 300, 80),
		})
		expect(slightly).toBe(time)
	})

	it('corrects from a round trip in either direction', () => {
		const receivedAt = arrivesAt(OFFSET + 10_000, 300, 2_000)
		const fixed = resync(time, {
			serverAt: OFFSET + 10_000,
			receivedAt,
			sentAt: receivedAt - 600,
		})
		expect(fixed.offset - time.offset).toBe(2_000)
	})
})
