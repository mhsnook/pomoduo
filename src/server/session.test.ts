import { runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test'
import { env, exports } from 'cloudflare:workers'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { freshClock, type MemberCommand } from '../shared/clock'
import {
	CLOCK_ROW_ID,
	type ClockRow,
	clockRowSchema,
	MEMBER_COOKIE,
	type Member,
	memberSchema,
	type Voice,
} from '../shared/schema'

// The room runs in this isolate, so the faked Date is its clock too. It starts
// far ahead of the real time, so no alarm comes due on its own: each one runs
// only when a test runs it.
const T = Date.UTC(2100, 0, 1)
const MIN = 60_000
const MIC = { sessionId: 'sfu-session', trackName: 'mic' }

let room: string
let sockets: WebSocket[]

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'] })
	vi.setSystemTime(T)
	// storage is shared by the tests in a file, so each test gets its own room
	room = crypto.randomUUID()
	sockets = []
})

afterEach(async () => {
	await Promise.all(sockets.map(leave))
	vi.useRealTimers()
})

const at = (ms: number) => vi.setSystemTime(T + ms)

const url = (path = '') => `https://pomoduo.test/parties/session/${room}${path}`

/** Opens a party-db socket, as a device does, carrying the member's cookie if given. */
async function connect(memberId?: string) {
	const headers: Record<string, string> = { Upgrade: 'websocket' }
	if (memberId) headers.Cookie = `${MEMBER_COOKIE}=${memberId}`
	const response = await exports.default.fetch(url('?proto=party-db'), { headers })
	const socket = response.webSocket!
	socket.accept()
	sockets.push(socket)
	return socket
}

/** Closes a socket and waits until the room has handled it going. */
async function leave(socket: WebSocket) {
	sockets = sockets.filter((s) => s !== socket)
	const answered = new Promise((resolve) => socket.addEventListener('close', resolve))
	// partyserver closes its end once `onClose` has finished, and only for a
	// close that carries a code, so the answer marks the room as done with it.
	socket.close(1000)
	await answered
}

const post = (action: string, body: unknown) =>
	exports.default.fetch(url(`/${action}`), { method: 'POST', body: JSON.stringify(body) })

const join = (id: string) => post('member', { id, name: id, intention: '' })

const command = (command: MemberCommand) =>
	post('command', { id: crypto.randomUUID(), actor: 'Ana', command })

const voice = (id: string, place: Partial<Omit<Voice, 'id'>>) =>
	post('voice', {
		id,
		onCall: false,
		listening: false,
		muted: false,
		mic: null,
		...place,
	})

const inRoom = <R>(read: (state: DurableObjectState) => R | Promise<R>) =>
	runInDurableObject(env.Session.getByName(room), (_, state) => read(state))

async function members(): Promise<Member[]> {
	const rows = await inRoom((state) =>
		state.storage.sql.exec('SELECT * FROM members ORDER BY id').toArray(),
	)
	return rows.map((raw) =>
		memberSchema.parse({
			...raw,
			here: Boolean(raw.here),
			onCall: Boolean(raw.onCall),
			listening: Boolean(raw.listening),
			muted: Boolean(raw.muted),
			mic: raw.mic ? JSON.parse(String(raw.mic)) : null,
		}),
	)
}

const member = async (id: string) => (await members()).find((m) => m.id === id)

async function clock(): Promise<ClockRow | null> {
	const [raw] = await inRoom((state) =>
		state.storage.sql.exec('SELECT * FROM clock').toArray(),
	)
	if (!raw) return null
	return clockRowSchema.parse({
		...raw,
		durations: JSON.parse(String(raw.durations)),
		playlist: JSON.parse(String(raw.playlist)),
		tally: JSON.parse(String(raw.tally)),
		callOpen: Boolean(raw.callOpen),
	})
}

const alarm = () => inRoom((state) => state.storage.getAlarm())

const emptySince = () => inRoom((state) => state.storage.get<number>('emptySince'))

/** Moves the clock to the moment the alarm is set for, and runs it. */
async function runAlarm() {
	const time = await alarm()
	expect(time).not.toBeNull()
	vi.setSystemTime(time!)
	expect(await runDurableObjectAlarm(env.Session.getByName(room))).toBe(true)
}

describe('presence', () => {
	it('puts nobody on the roster for a socket alone', async () => {
		await connect('ana')
		expect(await members()).toEqual([])
	})

	it('puts a member on the roster with their first details, here while a socket is open', async () => {
		await connect('ana')
		expect((await join('ana')).status).toBe(204)
		expect(await member('ana')).toMatchObject({ name: 'ana', here: true, seenAt: T })
	})

	it('puts a member on the roster with a pick or a place on the call too, away without a socket', async () => {
		await connect('ana')
		await post('vote', { id: 'ana', vote: 'yap' })
		await voice('ben', { muted: true })
		expect(await member('ana')).toMatchObject({ here: true, vote: 'yap' })
		expect(await member('ben')).toMatchObject({ here: false, muted: true })
	})

	it('keeps a member here while any of their sockets is open, and marks them away when the last closes', async () => {
		const phone = await connect('ana')
		const laptop = await connect('ana')
		await join('ana')
		at(1 * MIN)
		await leave(phone)
		expect(await member('ana')).toMatchObject({ here: true, seenAt: T })
		at(2 * MIN)
		await leave(laptop)
		expect(await member('ana')).toMatchObject({ here: false, seenAt: T + 2 * MIN })
	})

	it('marks a member here again when a socket opens', async () => {
		await join('ana')
		at(1 * MIN)
		await connect('ana')
		expect(await member('ana')).toMatchObject({ here: true, seenAt: T + 1 * MIN })
	})

	it('takes a member who goes away off the call, and keeps their mute', async () => {
		const ana = await connect('ana')
		const ben = await connect('ben')
		await voice('ana', { onCall: true, muted: true, mic: MIC })
		await voice('ben', { onCall: true, listening: true })
		await leave(ana)
		await leave(ben)
		const off = { here: false, onCall: false, listening: false, mic: null }
		expect(await member('ana')).toMatchObject({ ...off, muted: true })
		expect(await member('ben')).toMatchObject({ ...off, muted: false })
	})

	it('drops an away member once ten minutes pass and the alarm runs', async () => {
		const ana = await connect('ana')
		await connect('ben')
		await join('ana')
		await join('ben')
		at(1 * MIN)
		await leave(ana)
		expect(await alarm()).toBe(T + 11 * MIN)

		// an alarm that runs before the ten minutes are up keeps her
		at(5 * MIN)
		await runDurableObjectAlarm(env.Session.getByName(room))
		expect(await member('ana')).toBeDefined()
		expect(await alarm()).toBe(T + 11 * MIN)

		await runAlarm()
		expect((await members()).map((m) => m.id)).toEqual(['ben'])
		expect(await alarm()).toBeNull()
	})
})

describe('an empty session', () => {
	it('notes when the last socket closes', async () => {
		const ana = await connect('ana')
		const stranger = await connect()
		at(1 * MIN)
		await leave(ana)
		expect(await emptySince()).toBeUndefined()
		at(2 * MIN)
		await leave(stranger)
		expect(await emptySince()).toBe(T + 2 * MIN)
	})

	it('forgets it when a socket opens again, and goes on', async () => {
		await command({ type: 'durations', durations: { work: 5 * MIN, break: 1 * MIN } })
		await leave(await connect())
		expect(await emptySince()).toBe(T)
		expect(await alarm()).toBe(T + 6 * MIN)

		at(3 * MIN)
		await connect()
		expect(await emptySince()).toBeUndefined()
		expect(await alarm()).toBeNull()
		expect(await clock()).toMatchObject({ command: 'durations' })
	})

	it('ends when nobody is back within one work phase plus one break', async () => {
		await command({ type: 'durations', durations: { work: 5 * MIN, break: 1 * MIN } })
		const ana = await connect('ana')
		await join('ana')
		await command({ type: 'start' })
		await command({ type: 'skip' })
		await leave(ana)
		expect(await emptySince()).toBe(T)

		// the break ends first, and the room carries on into work
		await runAlarm()
		expect(await clock()).toMatchObject({ phase: 'work', command: 'rollover' })
		expect(await member('ana')).toBeDefined()

		await runAlarm()
		expect(Date.now()).toBe(T + 6 * MIN)
		expect(await clock()).toMatchObject({
			phase: 'work',
			endsAt: null,
			remainingMs: 5 * MIN,
			actor: 'the clock',
			command: 'end',
		})
		expect(await members()).toEqual([])
		expect(await emptySince()).toBeUndefined()
		expect(await alarm()).toBeNull()
	})
})

describe('the call', () => {
	/** Two members here, in a yap break: the call is open. */
	async function inYapBreak() {
		await command({ type: 'durations', durations: { work: 5 * MIN, break: 1 * MIN } })
		await connect('ana')
		await connect('ben')
		await join('ana')
		await join('ben')
		await command({ type: 'start' })
		await command({ type: 'skip' })
		expect(await clock()).toMatchObject({ breakKind: 'yap', callOpen: true })
	}

	it('takes everyone off it when starting work closes it, and keeps their mute', async () => {
		await connect('ana')
		await connect('ben')
		await connect('cat')
		await voice('ana', { onCall: true, muted: true, mic: MIC })
		await voice('ben', { onCall: true, listening: true })
		await voice('cat', { muted: true })

		await command({ type: 'start' })

		expect(await clock()).toMatchObject({ phase: 'work', callOpen: false })
		const off = { onCall: false, listening: false, mic: null }
		expect(await member('ana')).toMatchObject({ ...off, muted: true })
		expect(await member('ben')).toMatchObject({ ...off, muted: false })
		expect(await member('cat')).toMatchObject({ ...off, muted: true })
	})

	it('takes everyone off it when a yap break rolls over to work, and keeps their mute', async () => {
		await inYapBreak()
		await voice('ana', { onCall: true, muted: true, mic: MIC })
		await voice('ben', { onCall: true, listening: true })

		await runAlarm()

		expect(await clock()).toMatchObject({ phase: 'work', callOpen: false })
		const off = { onCall: false, listening: false, mic: null }
		expect(await member('ana')).toMatchObject({ ...off, muted: true })
		expect(await member('ben')).toMatchObject({ ...off, muted: false })
	})

	it('leaves everyone on it through a change that keeps it open', async () => {
		await inYapBreak()
		await voice('ana', { onCall: true, muted: true, mic: MIC })

		await command({ type: 'pause' })

		expect(await clock()).toMatchObject({ endsAt: null, callOpen: true })
		expect(await member('ana')).toMatchObject({ onCall: true, muted: true, mic: MIC })
	})
})

describe('the alarm', () => {
	it('wakes for the end of a running phase when that comes first', async () => {
		await command({ type: 'durations', durations: { work: 5 * MIN, break: 1 * MIN } })
		const ana = await connect('ana')
		await join('ana')
		await command({ type: 'start' })
		at(2 * MIN)
		// ana comes off the roster at 12 minutes, and the empty session ends at 8
		await leave(ana)
		expect(await alarm()).toBe(T + 5 * MIN)
	})

	it('wakes for the member away longest when they come off first', async () => {
		const ana = await connect('ana')
		const ben = await connect('ben')
		await connect('cat')
		await join('ana')
		await join('ben')
		await command({ type: 'start' })
		at(1 * MIN)
		await leave(ana)
		at(3 * MIN)
		await leave(ben)
		// ana comes off the roster at 11 minutes, ben at 13, and work ends at 25
		expect(await alarm()).toBe(T + 11 * MIN)
	})

	it('wakes for the end of an empty session when that comes first', async () => {
		await command({ type: 'durations', durations: { work: 5 * MIN, break: 1 * MIN } })
		const ana = await connect('ana')
		await join('ana')
		at(1 * MIN)
		// ana comes off the roster at 11 minutes
		await leave(ana)
		expect(await alarm()).toBe(T + 7 * MIN)
	})

	it('is deleted when there is nothing left to wake for', async () => {
		await command({ type: 'start' })
		expect(await alarm()).toBe(T + 25 * MIN)
		at(1 * MIN)
		await command({ type: 'pause' })
		expect(await alarm()).toBeNull()
	})
})

describe('the rollover', () => {
	it('flips the phase at the end time and takes the break vote from the members who are here', async () => {
		await command({ type: 'durations', durations: { work: 5 * MIN, break: 1 * MIN } })
		await connect('ana')
		await connect('ben')
		const cat = await connect('cat')
		const dan = await connect('dan')
		for (const id of ['ana', 'ben', 'cat', 'dan']) await join(id)
		await post('vote', { id: 'ana', vote: 'dance' })
		await post('vote', { id: 'cat', vote: 'yap' })
		await post('vote', { id: 'dan', vote: 'yap' })
		await command({ type: 'start' })
		at(1 * MIN)
		await leave(cat)
		await leave(dan)

		await runAlarm()

		// counting cat and dan, who are away, would have made it a yap break
		expect(await clock()).toMatchObject({
			phase: 'break',
			endsAt: T + 6 * MIN,
			breakKind: 'dance',
			tally: { bank: { dance: 0, yap: 0 }, lastLoser: 'yap' },
			callOpen: false,
			actor: 'the clock',
			command: 'rollover',
			commandId: null,
			revision: 3,
		})
		expect(await alarm()).toBe(T + 6 * MIN)
	})
})

describe('requests', () => {
	it('answers the time with server time', async () => {
		const response = await exports.default.fetch(url('/time'))
		expect(await response.json()).toEqual({ serverAt: T })
	})

	it("refuses party-db's own write path", async () => {
		const row: ClockRow = {
			id: CLOCK_ROW_ID,
			...freshClock(),
			revision: 1,
			actor: 'Ana',
			stampedAt: T,
			command: 'start',
			deltaMs: 0,
			commandId: null,
		}
		const response = await exports.default.fetch(url('?proto=party-db'), {
			method: 'POST',
			body: JSON.stringify([{ channel: 'clock', ops: [{ type: 'insert', value: row }] }]),
		})
		expect(response.status).toBe(403)
		expect(await clock()).toBeNull()
	})
})
