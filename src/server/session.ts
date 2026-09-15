import { definePartyCollection, isPartyDbRequest, PartyDbServer } from 'party-db/server'
import type { Connection, ConnectionContext } from 'partyserver'
import type { ZodType } from 'zod'

import {
	apply,
	type Clock,
	clockOf,
	type Command,
	freshClock,
	startsBreak,
} from '../shared/clock'
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
	type Voice,
	voiceSchema,
	voteSchema,
} from '../shared/schema'
import { type BreakKind, DEFAULT_KIND, freshTally } from '../shared/vote'

type SocketState = { memberId: string | null }

/** Storage key: when the last device left, while nobody has come back. */
const EMPTY_SINCE = 'emptySince'

/** Parses a member row out of SQLite, where booleans are integers and the mic is JSON. */
const parseMember = (raw: Record<string, unknown>): Member =>
	memberSchema.parse({
		...raw,
		here: Boolean(raw.here),
		onCall: Boolean(raw.onCall),
		muted: Boolean(raw.muted),
		mic: raw.mic ? JSON.parse(String(raw.mic)) : null,
	})

/** Builds a member the room has heard of but holds no details for yet. */
const blankMember = (id: string, here: boolean): Member => ({
	id,
	name: '',
	intention: '',
	here,
	seenAt: Date.now(),
	vote: null,
	onCall: false,
	muted: false,
	mic: null,
})

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
 * - `POST .../voice` sets a member's place on the call and where their mic is.
 * - `POST .../track` records a video's length, the first time anyone learns it.
 * - `GET .../time` answers with server time, for a device's first sync.
 *
 * The room keeps members' presence itself, from their sockets. It flips the
 * phase itself when the end time passes, takes the break vote when work ends,
 * takes everyone off the call when the call closes, and ends the session when
 * the last device has been gone for a full work phase plus a break.
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
		this.addColumns('clock', {
			breakKind: `TEXT NOT NULL DEFAULT '${DEFAULT_KIND}'`,
			tally: `TEXT NOT NULL DEFAULT '${JSON.stringify(freshTally())}'`,
			callOpen: 'INTEGER NOT NULL DEFAULT 1',
		})
		this.addColumns('members', {
			vote: 'TEXT',
			onCall: 'INTEGER NOT NULL DEFAULT 0',
			muted: 'INTEGER NOT NULL DEFAULT 0',
			mic: 'TEXT',
		})
		return super.onStart()
	}

	private addColumns(table: string, columns: Record<string, string>) {
		const sql = this.ctx.storage.sql
		const have = new Set(
			sql
				.exec(`PRAGMA table_info(${table})`)
				.toArray()
				.map((c) => c.name),
		)
		for (const [column, definition] of Object.entries(columns))
			if (!have.has(column))
				sql.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
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
		if (req.method === 'POST' && action === 'member')
			return this.accept(req, memberUpdateSchema, (v) => this.updateMember(v))
		if (req.method === 'POST' && action === 'vote')
			return this.accept(req, voteSchema, (v) => this.vote(v))
		if (req.method === 'POST' && action === 'voice')
			return this.accept(req, voiceSchema, (v) => this.setVoice(v))
		if (req.method === 'POST' && action === 'track')
			return this.accept(req, trackSchema, (v) => this.learn(v))
		return new Response('Not found', { status: 404 })
	}

	/** Reads one write from a member, checks it, and queues it behind the others. */
	private async accept<T>(
		req: Request,
		schema: ZodType<T>,
		run: (value: T) => Promise<void>,
	) {
		const parsed = schema.safeParse(await req.json().catch(() => null))
		if (!parsed.success)
			return Response.json({ error: parsed.error.message }, { status: 400 })
		await this.serially(() => run(parsed.data))
		return new Response(null, { status: 204 })
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
		const row = await this.settle(before, next, current?.row ?? null, {
			actor,
			command,
			commandId: id,
			stampedAt: serverAt,
		})
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
		await this.settle(current.clock, next, current.row, {
			actor: 'the clock',
			command,
			commandId: null,
			stampedAt: now,
		})
	}

	/** Everyone left and stayed away for a full work phase plus a break: the session is over. */
	private async endIfEmpty() {
		const emptySince = await this.ctx.storage.get<number>(EMPTY_SINCE)
		const current = this.readClock()
		if (emptySince === undefined || !current || this.openSockets().length > 0) return
		const now = Date.now()
		if (now < emptySince + graceOf(current.clock)) return
		await this.ctx.storage.delete(EMPTY_SINCE)
		const command: Command = { type: 'end' }
		const next = apply(current.clock, command, now)
		if (!next) return
		await this.settle(current.clock, next, current.row, {
			actor: 'the clock',
			command,
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
			callOpen: Boolean(raw.callOpen),
		})
		return { row, clock: clockOf(row) }
	}

	/**
	 * Writes one clock change and does what that change calls for: it clears the
	 * votes when a break starts, and takes everyone off the call when the call
	 * closes. Every command that changes the clock calls this, so a new
	 * consequence goes here rather than into each command.
	 */
	private async settle(
		before: Clock,
		next: Clock,
		previous: ClockRow | null,
		change: {
			actor: string
			command: Command
			commandId: string | null
			stampedAt: number
		},
	): Promise<ClockRow> {
		const row = await this.writeClock(previous, next, change)
		if (startsBreak(before, next, change.command))
			await this.patchMembers('vote IS NOT NULL', { vote: null })
		if (before.callOpen && !next.callOpen)
			await this.patchMembers('onCall = 1', { onCall: false, mic: null })
		return row
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

	/** A member is here while any of their devices has a socket open. */
	private isHere(memberId: string, closingId?: string) {
		return this.openSockets(closingId).some((c) => c.state?.memberId === memberId)
	}

	/** Makes the same change to every member the query finds, in one commit. */
	private async patchMembers(where: string, patch: Partial<Member>) {
		const found = this.ctx.storage.sql
			.exec(`SELECT * FROM members WHERE ${where}`)
			.toArray()
			.map(parseMember)
		if (found.length === 0) return
		await this.commit([
			{
				channel: 'members',
				ops: found.map((member) => ({
					type: 'update',
					value: { ...member, ...patch },
				})),
			},
		])
	}

	private readMember(id: string): Member | null {
		const [raw] = this.ctx.storage.sql
			.exec('SELECT * FROM members WHERE id = ?', id)
			.toArray()
		return raw ? parseMember(raw) : null
	}

	private async writeMember(previous: Member | null, member: Member) {
		await this.commit([
			{
				channel: 'members',
				ops: [{ type: previous ? 'update' : 'insert', value: member }],
			},
		])
	}

	private async markPresence(memberId: string, closingId?: string) {
		const member = this.readMember(memberId)
		if (!member) return // their first details will arrive through POST .../member
		const here = this.isHere(memberId, closingId)
		if (here === member.here) return
		const seenAt = Date.now()
		// A member who has gone comes off the call with them: their mic has stopped,
		// and anyone still pulling it would sit on a track that never speaks again.
		await this.writeMember(
			member,
			here
				? { ...member, here, seenAt }
				: { ...member, here, seenAt, onCall: false, mic: null },
		)
	}

	private async updateMember(update: { id: string; name: string; intention: string }) {
		const member = this.readMember(update.id)
		const here = this.isHere(update.id)
		if (member && member.name === update.name && member.intention === update.intention)
			return
		const base = member ?? blankMember(update.id, here)
		await this.writeMember(member, { ...base, ...update, here, seenAt: Date.now() })
	}

	// ---- the break vote ----

	private async vote({ id, vote }: { id: string; vote: BreakKind | null }) {
		const member = this.readMember(id)
		if (member?.vote === vote) return
		const base = member ?? blankMember(id, this.isHere(id))
		await this.writeMember(member, { ...base, vote })
	}

	/** One vote for each member who is here: their pick, or the default. */
	private votes(): BreakKind[] {
		return this.ctx.storage.sql
			.exec('SELECT vote FROM members WHERE here = 1')
			.toArray()
			.map((r) => (r.vote === 'dance' || r.vote === 'yap' ? r.vote : DEFAULT_KIND))
	}

	// ---- the call ----

	/** Records how one member sits on the call, and where the others pull their mic from. */
	private async setVoice({ id, onCall, muted, mic }: Voice) {
		const member = this.readMember(id)
		if (
			member &&
			member.onCall === onCall &&
			member.muted === muted &&
			JSON.stringify(member.mic) === JSON.stringify(mic)
		)
			return
		const base = member ?? blankMember(id, this.isHere(id))
		await this.writeMember(member, { ...base, onCall, muted, mic, seenAt: Date.now() })
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
