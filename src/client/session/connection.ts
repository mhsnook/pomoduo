import type { Collection } from '@tanstack/db'
import { createPartyDb, definePartyCollection, partyTransport } from 'party-db/client'

import {
	apply,
	type Clock,
	clockOf,
	type Command,
	freshClock,
	type MemberCommand,
	type VideoEffect,
	videoEffect,
} from '../../shared/clock'
import {
	CLOCK_ROW_ID,
	type ClockRow,
	clockRowSchema,
	type CommandRequest,
	type CommandResponse,
	type Member,
	memberSchema,
	type Track,
	trackSchema,
} from '../../shared/schema'
import type { Vote } from '../../shared/vote'
import { displayName } from '../lib/format'
import { memberId } from '../lib/member'
import { firstSync, resync, type ServerTime, serverNowOf } from '../lib/server-time'
import type { VoiceState } from './call'

/** Something the page should react to, beyond re-rendering. */
export type SessionEvent =
	/** The clock changed: from a press here, a command from someone else, or a rollover. */
	| { type: 'change'; before: Clock; after: Clock; command: Command['type'] }
	/** What the change asks of this device's video. Sent once per command. */
	| { type: 'video'; effect: VideoEffect }
	/** This device just joined: put both playlists where the clock says. */
	| { type: 'join'; clock: Clock; now: number }

export type SessionState = {
	status: 'connecting' | 'live'
	/** What this device shows: the room's clock, or this device's own prediction. */
	clock: Clock
	/** Everyone who has been in this session, and whether they are here now. */
	members: Member[]
	/** Who made the room's last change, for the byline under the clock. */
	lastChange: Pick<ClockRow, 'actor' | 'command' | 'deltaMs' | 'stampedAt'> | null
}

const commandOf = (row: ClockRow) =>
	({ type: row.command, deltaMs: row.deltaMs }) as Command

/**
 * This device's connection to one session.
 *
 * It shows the room's clock, with two exceptions from tree/rules.md: your own
 * press shows at once, and your timer keeps that prediction until every press
 * you made is answered. Each command reaches the video exactly once. The device
 * also flips the phase itself when its own timer reaches zero.
 */
export class SessionConnection {
	private readonly base: string
	private readonly party: ReturnType<typeof createPartyDb>
	private readonly clocks: Collection<ClockRow, string>
	private readonly tracks: Collection<Track, string>
	private readonly members: Collection<Member, string>
	readonly memberId: string

	private time: ServerTime = { offset: Date.now() - performance.now(), rtt: 0 }
	private row: ClockRow | null = null
	private state: SessionState = {
		status: 'connecting',
		clock: freshClock(),
		members: [],
		lastChange: null,
	}
	/** Every command this device sent, so it knows its own when one comes back. */
	private readonly own = new Set<string>()
	/** This device's commands the room has not answered yet. */
	private readonly pending = new Set<string>()
	/** Video lengths this device has already sent to the room. */
	private readonly shared = new Set<string>()

	private readonly listeners = new Set<() => void>()
	private readonly eventListeners = new Set<(event: SessionEvent) => void>()
	private rolloverTimer: ReturnType<typeof setTimeout> | undefined
	private unsubscribe: (() => void) | undefined
	private closed = false

	constructor(
		readonly sessionId: string,
		private readonly actor: () => string,
	) {
		this.base = `/parties/session/${encodeURIComponent(sessionId)}`
		// set before the socket opens: its upgrade carries the member cookie
		this.memberId = memberId()
		this.party = createPartyDb(
			partyTransport({ host: location.host, party: 'session', room: sessionId }),
			[
				definePartyCollection({ name: 'clock', key: 'id', schema: clockRowSchema }),
				definePartyCollection({ name: 'members', key: 'id', schema: memberSchema }),
				definePartyCollection({ name: 'tracks', key: 'id', schema: trackSchema }),
			],
		)
		this.clocks = this.party.db.clock as unknown as Collection<ClockRow, string>
		this.tracks = this.party.db.tracks as unknown as Collection<Track, string>
		this.members = this.party.db.members as unknown as Collection<Member, string>
		void this.open()
	}

	private async open() {
		const sentAt = performance.now()
		const { serverAt } = (await fetch(`${this.base}/time`).then((r) => r.json())) as {
			serverAt: number
		}
		this.time = firstSync(sentAt, serverAt, performance.now())
		// The video lengths have to be here before the first cue, or it lands in the wrong track.
		const [rows] = await Promise.all([
			this.clocks.toArrayWhenReady(),
			this.tracks.toArrayWhenReady(),
			this.members.toArrayWhenReady(),
		])
		if (this.closed) return
		const row = rows.find((r) => r.id === CLOCK_ROW_ID) ?? null
		if (row) {
			this.row = row
			this.setState({ clock: clockOf(row), lastChange: row })
		}
		this.setState({ status: 'live', members: [...this.members.values()] })
		const memberChanges = this.members.subscribeChanges(() =>
			this.setState({ members: [...this.members.values()] }),
		)
		this.emit({ type: 'join', clock: this.state.clock, now: this.serverNow() })
		const subscription = this.clocks.subscribeChanges((changes) => {
			const receivedAt = performance.now()
			for (const change of changes) {
				if (change.type === 'delete') continue
				this.receive(change.value, { serverAt: change.value.stampedAt, receivedAt })
			}
		})
		this.unsubscribe = () => {
			subscription.unsubscribe()
			memberChanges.unsubscribe()
		}
		this.armRollover()
	}

	serverNow = () => serverNowOf(this.time, performance.now())

	/** Apply a command here at once, then send it to the room. */
	press(command: MemberCommand) {
		const now = this.serverNow()
		const before = this.state.clock
		const after = apply(before, command, now, this.votes())
		const id = crypto.randomUUID()
		this.own.add(id)
		this.pending.add(id)
		if (after) this.change(before, after, command)
		void this.send({ id, actor: displayName(this.actor()), command })
	}

	private async send(request: CommandRequest) {
		const sentAt = performance.now()
		try {
			const response = await fetch(`${this.base}/command`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(request),
			})
			if (!response.ok)
				throw new Error(`The room refused the command: ${response.status}`)
			const { serverAt, row } = (await response.json()) as CommandResponse
			const sample = { serverAt, receivedAt: performance.now(), sentAt }
			if (row) return this.receive(row, sample)
			this.time = resync(this.time, sample)
		} catch (error) {
			console.error(error)
		}
		// Nothing changed in the room, or the command never got there: drop the prediction.
		this.settle(request.id)
	}

	/** A row from the room, over the socket or as the answer to this device's own command. */
	private receive(
		row: ClockRow,
		sample: { serverAt: number; receivedAt: number; sentAt?: number },
	) {
		this.time = resync(this.time, sample)
		if (this.row && row.revision <= this.row.revision) return
		this.row = row
		this.setState({ lastChange: row })
		const shown = this.state.clock
		const next = clockOf(row)
		if (row.commandId && this.own.has(row.commandId)) {
			// Our own command, answered. The video already moved at the press.
			this.settle(row.commandId)
			return
		}
		if (
			row.command === 'rollover' &&
			shown.phase === next.phase &&
			shown.endsAt === next.endsAt
		) {
			// This device already rolled over on its own, to the same place.
			this.setState({ clock: next })
			return
		}
		this.change(shown, next, commandOf(row))
	}

	/** One of our commands is done. Once none are left, show the room's clock. */
	private settle(commandId: string) {
		this.pending.delete(commandId)
		if (this.pending.size > 0) return
		this.setState({ clock: this.row ? clockOf(this.row) : this.state.clock })
		this.armRollover()
	}

	private change(before: Clock, after: Clock, command: Command) {
		this.setState({ clock: after })
		this.emit({ type: 'change', before, after, command: command.type })
		this.emit({
			type: 'video',
			effect: videoEffect(before, after, command, this.serverNow()),
		})
		this.armRollover()
	}

	/** Flip the phase when this device's own timer reaches zero, without waiting for the room. */
	private armRollover() {
		clearTimeout(this.rolloverTimer)
		const { endsAt } = this.state.clock
		if (endsAt === null || this.closed) return
		this.rolloverTimer = setTimeout(
			() => {
				const before = this.state.clock
				const after = apply(before, { type: 'rollover' }, this.serverNow(), this.votes())
				if (after) this.change(before, after, { type: 'rollover' })
				else this.armRollover()
			},
			Math.max(0, endsAt - this.serverNow()),
		)
	}

	/** Tell the session this member's name and what they are working on. */
	/** One entry for each member who is here, as the room will count them. */
	private votes(): Vote[] {
		return this.state.members.filter((m) => m.here).map((m) => m.vote)
	}

	/** Tell the room something about this member, and don't wait to hear back. */
	private tell(action: string, body: object) {
		void fetch(`${this.base}/${action}`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ id: this.memberId, ...body }),
		}).catch((error) => console.error(error))
	}

	/** Pick a kind of break for the end of this pomo, or take the pick back with null. */
	vote(kind: Vote) {
		this.tell('vote', { vote: kind })
	}

	/** Say how this device sits on the call, and where the others can pull its mic. */
	voice = (state: VoiceState) => {
		this.tell('voice', state)
	}

	updateMember(details: { name: string; intention: string }) {
		this.tell('member', details)
	}

	/** A video's length, if any member's player has loaded it. */
	lengthOf = (videoId: string) => this.tracks.get(videoId)?.durationMs

	/** Share a video's length with the room, the first time anyone learns it. */
	learnLength(videoId: string, durationMs: number) {
		if (this.tracks.has(videoId) || this.shared.has(videoId) || !(durationMs > 0)) return
		this.shared.add(videoId)
		this.tell('track', { id: videoId, durationMs })
	}

	getState = () => this.state

	subscribe = (listener: () => void) => {
		this.listeners.add(listener)
		return () => {
			this.listeners.delete(listener)
		}
	}

	onEvent(listener: (event: SessionEvent) => void) {
		this.eventListeners.add(listener)
		return () => {
			this.eventListeners.delete(listener)
		}
	}

	close() {
		this.closed = true
		clearTimeout(this.rolloverTimer)
		this.unsubscribe?.()
		this.party.close()
	}

	private setState(patch: Partial<SessionState>) {
		this.state = { ...this.state, ...patch }
		for (const listener of this.listeners) listener()
	}

	private emit(event: SessionEvent) {
		for (const listener of this.eventListeners) listener(event)
	}
}
