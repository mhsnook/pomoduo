import { definePartyCollection, isPartyDbRequest, PartyDbServer } from 'party-db/server'

import { apply, type Clock, type Command, freshClock } from '../shared/clock'
import {
	CLOCK_ROW_ID,
	type ClockRow,
	clockRowSchema,
	type CommandRequest,
	commandRequestSchema,
	type CommandResponse,
	type Track,
	trackSchema,
} from '../shared/schema'

/**
 * One session: the shared clock, and the video lengths its members have learned.
 *
 * Members read both through party-db, and change them only through this room's
 * own endpoints, never party-db's write path:
 *
 * - `POST .../command` changes the clock. The room applies commands in arrival
 *   order and commits the resulting row, which party-db fans out to everyone.
 * - `POST .../track` records a video's length, the first time anyone learns it.
 * - `GET .../time` answers with server time, for a device's first sync.
 *
 * The room also flips the phase itself, from an alarm, when the end time passes.
 */
export class Session extends PartyDbServer<Env> {
	collections = [
		definePartyCollection({ name: 'clock', key: 'id', schema: clockRowSchema }),
		definePartyCollection({ name: 'tracks', key: 'id', schema: trackSchema }),
	]

	/** Commands and alarms run one at a time, so each reads the row the last one wrote. */
	private queue: Promise<unknown> = Promise.resolve()

	async onStart() {
		const sql = this.ctx.storage.sql
		sql.exec(`CREATE TABLE IF NOT EXISTS clock (
			id TEXT PRIMARY KEY,
			phase TEXT NOT NULL,
			endsAt REAL,
			remainingMs REAL NOT NULL,
			durations TEXT NOT NULL,
			playlist TEXT NOT NULL,
			revision INTEGER NOT NULL,
			actor TEXT NOT NULL,
			stampedAt REAL NOT NULL,
			command TEXT NOT NULL,
			deltaMs REAL NOT NULL,
			commandId TEXT
		)`)
		sql.exec(`CREATE TABLE IF NOT EXISTS tracks (
			id TEXT PRIMARY KEY,
			durationMs REAL NOT NULL
		)`)
		return super.onStart()
	}

	async onRequest(req: Request): Promise<Response> {
		if (isPartyDbRequest(req)) {
			if (req.method === 'POST')
				return Response.json(
					{ error: 'This room only changes through its own endpoints.' },
					{ status: 403 },
				)
			return super.onRequest(req)
		}
		const action = new URL(req.url).pathname.split('/').at(-1)
		if (req.method === 'GET' && action === 'time') {
			return Response.json({ serverAt: Date.now() })
		}
		if (req.method === 'POST' && action === 'command') {
			const parsed = commandRequestSchema.safeParse(await req.json().catch(() => null))
			if (!parsed.success)
				return Response.json({ error: parsed.error.message }, { status: 400 })
			const response = await this.serially(() => this.run(parsed.data))
			return Response.json(response)
		}
		if (req.method === 'POST' && action === 'track') {
			const parsed = trackSchema.safeParse(await req.json().catch(() => null))
			if (!parsed.success)
				return Response.json({ error: parsed.error.message }, { status: 400 })
			await this.serially(() => this.learn(parsed.data))
			return new Response(null, { status: 204 })
		}
		return new Response('Not found', { status: 404 })
	}

	async onAlarm() {
		await this.serially(() => this.rollOver())
	}

	private serially<T>(task: () => Promise<T>): Promise<T> {
		const next = this.queue.then(task, task)
		this.queue = next.catch(() => undefined)
		return next
	}

	private async run({ id, actor, command }: CommandRequest): Promise<CommandResponse> {
		const serverAt = Date.now()
		const current = this.readClock()
		const next = apply(current?.clock ?? freshClock(), command, serverAt)
		if (!next) return { serverAt, row: null }
		const row = await this.write(current?.row ?? null, next, {
			actor,
			command,
			commandId: id,
			stampedAt: serverAt,
		})
		return { serverAt, row }
	}

	private async learn(track: Track) {
		const [known] = this.ctx.storage.sql
			.exec('SELECT id FROM tracks WHERE id = ?', track.id)
			.toArray()
		if (known || !(track.durationMs > 0)) return
		await this.commit([{ channel: 'tracks', ops: [{ type: 'insert', value: track }] }])
	}

	private async rollOver() {
		const now = Date.now()
		const current = this.readClock()
		if (!current) return
		const next = apply(current.clock, { type: 'rollover' }, now)
		if (!next) return this.schedule(current.clock)
		await this.write(current.row, next, {
			actor: 'the clock',
			command: { type: 'rollover' },
			commandId: null,
			stampedAt: now,
		})
	}

	private readClock(): { row: ClockRow; clock: Clock } | null {
		const [raw] = this.ctx.storage.sql
			.exec('SELECT * FROM clock WHERE id = ?', CLOCK_ROW_ID)
			.toArray()
		if (!raw) return null
		const row = clockRowSchema.parse({
			...raw,
			durations: JSON.parse(String(raw.durations)),
			playlist: JSON.parse(String(raw.playlist)),
		})
		const { phase, endsAt, remainingMs, durations, playlist } = row
		return { row, clock: { phase, endsAt, remainingMs, durations, playlist } }
	}

	private async write(
		previous: ClockRow | null,
		clock: Clock,
		change: {
			actor: string
			command: Command
			commandId: string | null
			stampedAt: number
		},
	): Promise<ClockRow> {
		const row: ClockRow = {
			id: CLOCK_ROW_ID,
			...clock,
			revision: (previous?.revision ?? 0) + 1,
			actor: change.actor,
			stampedAt: change.stampedAt,
			command: change.command.type,
			deltaMs: 'deltaMs' in change.command ? change.command.deltaMs : 0,
			commandId: change.commandId,
		}
		await this.commit([
			{ channel: 'clock', ops: [{ type: previous ? 'update' : 'insert', value: row }] },
		])
		await this.schedule(clock)
		return row
	}

	/** The alarm fires at the end of a running phase; a stopped clock needs none. */
	private async schedule(clock: Clock) {
		if (clock.endsAt === null) await this.ctx.storage.deleteAlarm()
		else await this.ctx.storage.setAlarm(clock.endsAt)
	}
}
