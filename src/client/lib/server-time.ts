/**
 * A device's view of server time, kept without reading its wall clock.
 *
 * `steadyNow` is `performance.now()`, which never jumps when the device
 * corrects its wall clock. The rules are in tree/rules.md, "Keeping clocks in
 * step".
 */

/** An offset only moves when it is off by more than this. */
export const DRIFT_MS = 100

export type ServerTime = {
	/** Add to a steady time to get server time. */
	offset: number
	/** The last round trip, used to guess how long a one-way message took. */
	rtt: number
}

export const serverNowOf = (time: ServerTime, steadyNow: number) =>
	steadyNow + time.offset

/** One round trip gives the first offset. */
export function firstSync(
	sentAt: number,
	serverAt: number,
	receivedAt: number,
): ServerTime {
	const rtt = receivedAt - sentAt
	return { offset: serverAt + rtt / 2 - receivedAt, rtt }
}

/**
 * Every message from the session carries server time. A reply to something
 * this device sent is a fresh round trip. Any other message can only show that
 * this device has fallen behind, because the session stamped it before it
 * arrived. Either way the offset moves only when it is off by more than DRIFT_MS.
 */
export function resync(
	time: ServerTime,
	sample: { serverAt: number; receivedAt: number; sentAt?: number },
): ServerTime {
	const { serverAt, receivedAt, sentAt } = sample
	let rtt = time.rtt
	if (sentAt !== undefined) rtt = receivedAt - sentAt
	else if (serverAt - (receivedAt + time.offset) <= DRIFT_MS) return time
	const measured = serverAt + rtt / 2 - receivedAt
	if (Math.abs(measured - time.offset) <= DRIFT_MS)
		return rtt === time.rtt ? time : { ...time, rtt }
	return { offset: measured, rtt }
}
