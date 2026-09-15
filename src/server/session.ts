import { definePartyCollection, isPartyDbRequest, PartyDbServer } from 'party-db/server'
import type { Connection, ConnectionContext } from 'partyserver'

import { apply, type Clock, type Command, freshClock, startsBreak } from '../shared/clock'
import {
	CLOCK_ROW_ID,
	type ClockRow,
	clockRowSchema,
	type CommandRequest,
	commandRequestSchema,
	type CommandResponse,
	MEMBER_COOKIE,
	type Member,
	memberSchema,
	memberUpdateSchema,
	type Track,
	trackSchema,
	voteSchema,
} from '../shared/schema'
import { type BreakKind, FIRST_KIND, freshTally, votesOf } from '../shared/vote'

type SocketState = { memberId: string | null }

/** Storage key: when the last device left, while nobody has come back. */
const EMPTY_SINCE = 'emptySince'

const memberIdOf = (request: Request) => {
	const cookie = request.headers.get('cookie') ?? ''
	const match = new RegExp(`(?:^|;\\s*)${MEMBER_COOKIE}=([\\w-]{1,64})`).exec(cookie)
	return match?.[1] ?? null
}

/**
 * One session: the shared clock, its members, and the video lengths its
 * members have learned.
 *
 * Members read all three through party-db, and change them only through this
 * room's own endpoints, never party-db's write path:
 *
 * - `POST .../command` changes the clock. The room applies commands in arrival
 *   order and commits the resulting row, which party-db fans out to everyone.
 * - `POST .../member` sets a member's name and intention.
 * - `POST .../vote` sets a member's pick for the break vote.
 * - `POST .../track` records a video's length, the first time anyone learns it.
 * - `GET .../time` answers with server time, for a device's first sync.
 *
 * The room keeps members' presence itself, from their sockets. It flips the
 * phase itself when the end time passes, takes the break vote when work ends,
 * and ends the session when the last device has been gone for a full work
 * phase plus a break.
 */
export class Session extends PartyDbServer<Env> {
	collections = [
		definePartyCollection({ name: 'clock', key: 'id', schema: clockRowSchema }),
		definePartyCollection({ name: 'members', key: 'id', schema: memberSchema }),
		definePartyCollection({ name: 'tracks', key: 'id', schema: trackSchema }),
	]

	/** Every change runs one at a time, so each reads what the last one wrote. */
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
		sql.exec(`CREATE TABLE IF NOT EXISTS members (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			intention TEXT NOT NULL,
			here INTEGER NOT NULL,
			seenAt REAL NOT NULL
		)`)
		sql.exec(`CREATE TABLE IF NOT EXISTS tracks (
			id TEXT PRIMARY KEY,
			durationMs REAL NOT NULL
		)`)
		// columns added after the tables first shipped
		this.addColumn('clock', 'breakKind', `TEXT NOT NULL DEFAULT '${FIRST_KIND}'`)
		this.addColumn(
			'clock',
			'tally',
			`TEXT NOT NULL DEFAULT '${JSON.stringify(freshTally())}'`,
		)
		this.addColumn('members', 'vote', 'TEXT')
		return super.onStart()
	}

	private addColumn(table: string, column: string, definition: string) {
		const columns = this.ctx.storage.sql.exec(`PRAGMA table_info(${table})`).toArray()
		if (columns.some((c) => c.name === column)) return
		this.ctx.storage.sql.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
	}

	async onConnect(conn: Connection, ctx: ConnectionContext) {
		const memberId = isPartyDbRequest(ctx.request) ? memberIdOf(ctx.request) : null
		conn.setState({ memberId } satisfies SocketState)
		await super.onConnect(conn, ctx)
		await this.serially(async () => {
			await this.ctx.storage.delete(EMPTY_SINCE)
			if (memberId) await this.markPresence(memberId)
			await this.schedule()
		})
	}

	async onClose(conn: Connection) {
		const { memberId } = (conn.state ?? { memberId: null }) as SocketState
		await this.serially(async () => {
			if (memberId) await this.markPresence(memberId, conn.id)
			if (this.openSockets(conn.id).length === 0)
				await this.ctx.storage.put(EMPTY_SINCE, Date.now())
			await this.schedule()
		})
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
		if (req.method === 'POST' && action === 'member') {
			const parsed = memberUpdateSchema.safeParse(await req.json().catch(() => null))
			if (!parsed.success)
				return Response.json({ error: parsed.error.message }, { status: 400 })
			await this.serially(() => this.updateMember(parsed.data))
			return new Response(null, { status: 204 })
		}
		if (req.method === 'POST' && action === 'vote') {
			const parsed = voteSchema.safeParse(await req.json().catch(() => null))
			if (!parsed.success)
				return Response.json({ error: parsed.error.message }, { status: 400 })
			await this.serially(() => this.vote(parsed.data))
			return new Response(null, { status: 204 })
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
		await this.serially(async () => {
			await this.rollOver()
			await this.endIfEmpty()
			await this.schedule()
		})
	}

	private serially<T>(task: () => Promise<T>): Promise<T> {
		const next = this.queue.then(task, task)
		this.queue = next.catch(() => undefined)
		return next
	}

	// ---- the clock ----

	private async run({ id, actor, command }: CommandRequest): Promise<CommandResponse> {
		const serverAt = Date.now()
		const current = this.readClock()
		const before = current?.clock ?? freshClock()
		const next = apply(before, command, serverAt, this.votes())
		if (!next) return { serverAt, row: null }
		const row = await this.writeClock(current?.row ?? null, next, {
			actor,
			command,
			commandId: id,
			stampedAt: serverAt,
		})
		if (startsBreak(before, next, command)) await this.clearVotes()
		await this.schedule()
		return { serverAt, row }
	}

	private async rollOver() {
		const now = Date.now()
		const current = this.readClock()
		if (!current) return
		const command: Command = { type: 'rollover' }
		const next = apply(current.clock, command, now, this.votes())
		if (!next) return
		await this.writeClock(current.row, next, {
			actor: 'the clock',
			command,
			commandId: null,
			stampedAt: now,
		})
		if (startsBreak(current.clock, next, command)) await this.clearVotes()
	}

	/** Everyone left and stayed away for a full work phase plus a break: the session is over. */
	private async endIfEmpty() {
		const emptySince = await this.ctx.storage.get<number>(EMPTY_SINCE)
		const current = this.readClock()
		if (emptySince === undefined || !current || this.openSockets().length > 0) return
		const now = Date.now()
		if (now < emptySince + graceOf(current.clock)) return
		await this.ctx.storage.delete(EMPTY_SINCE)
		const next = apply(current.clock, { type: 'end' }, now)
		if (!next) return
		await this.writeClock(current.row, next, {
			actor: 'the clock',
			command: { type: 'end' },
			commandId: null,
			stampedAt: now,
		})
	}

	/** One alarm covers both jobs: the end of a running phase, and the end of an empty session. */
	private async schedule() {
		const clock = this.readClock()?.clock
		const emptySince = await this.ctx.storage.get<number>(EMPTY_SINCE)
		const times = [
			clock?.endsAt ?? null,
			emptySince !== undefined && clock ? emptySince + graceOf(clock) : null,
		].filter((t): t is number => t !== null)
		if (times.length === 0) await this.ctx.storage.deleteAlarm()
		else await this.ctx.storage.setAlarm(Math.min(...times))
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
			tally: JSON.parse(String(raw.tally)),
		})
		const { phase, endsAt, remainingMs, durations, playlist, breakKind, tally } = row
		return {
			row,
			clock: { phase, endsAt, remainingMs, durations, playlist, breakKind, tally },
		}
	}

	private async writeClock(
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
		return row
	}

	// ---- members ----

	/** The sockets still open, leaving out one that is closing right now. */
	private openSockets(closingId?: string) {
		return [...this.getConnections<SocketState>()].filter((c) => c.id !== closingId)
	}

	private readMember(id: string): Member | null {
		const [raw] = this.ctx.storage.sql
			.exec('SELECT * FROM members WHERE id = ?', id)
			.toArray()
		return raw ? memberSchema.parse({ ...raw, here: Boolean(raw.here) }) : null
	}

	private async writeMember(previous: Member | null, member: Member) {
		await this.commit([
			{
				channel: 'members',
				ops: [{ type: previous ? 'update' : 'insert', value: member }],
			},
		])
	}

	/** A member is here while any of their devices has a socket open. */
	private async markPresence(memberId: string, closingId?: string) {
		const member = this.readMember(memberId)
		if (!member) return // their first details will arrive through POST .../member
		const here = this.openSockets(closingId).some((c) => c.state?.memberId === memberId)
		if (here === member.here) return
		await this.writeMember(member, { ...member, here, seenAt: Date.now() })
	}

	private async updateMember(update: { id: string; name: string; intention: string }) {
		const member = this.readMember(update.id)
		const here = this.openSockets().some((c) => c.state?.memberId === update.id)
		if (member && member.name === update.name && member.intention === update.intention)
			return
		const vote = member?.vote ?? null
		await this.writeMember(member, { ...update, here, vote, seenAt: Date.now() })
	}

	// ---- the break vote ----

	private async vote({ id, vote }: { id: string; vote: BreakKind | null }) {
		const member = this.readMember(id)
		if (member?.vote === vote) return
		const here = this.openSockets().some((c) => c.state?.memberId === id)
		const base = member ?? { id, name: '', intention: '', here, seenAt: Date.now() }
		await this.writeMember(member, { ...base, vote })
	}

	/** One vote for each member who is here: their pick, or what silence counts as. */
	private votes(): BreakKind[] {
		const picks = this.ctx.storage.sql
			.exec('SELECT vote FROM members WHERE here = 1')
			.toArray()
			.map((r) => (r.vote === 'dance' || r.vote === 'yap' ? r.vote : null))
		return votesOf(picks)
	}

	/** A vote lasts one pomo: once the break starts, everyone's pick clears. */
	private async clearVotes() {
		const voted = this.ctx.storage.sql
			.exec('SELECT * FROM members WHERE vote IS NOT NULL')
			.toArray()
			.map((raw) => memberSchema.parse({ ...raw, here: Boolean(raw.here) }))
		if (voted.length === 0) return
		await this.commit([
			{
				channel: 'members',
				ops: voted.map((member) => ({
					type: 'update',
					value: { ...member, vote: null },
				})),
			},
		])
	}

	// ---- tracks ----

	private async learn(track: Track) {
		const [known] = this.ctx.storage.sql
			.exec('SELECT id FROM tracks WHERE id = ?', track.id)
			.toArray()
		if (known || !(track.durationMs > 0)) return
		await this.commit([{ channel: 'tracks', ops: [{ type: 'insert', value: track }] }])
	}
}

/** How long an empty session keeps going: one full work phase plus one break. */
const graceOf = (clock: Clock) => clock.durations.work + clock.durations.break
