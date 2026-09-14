/**
 * What a session room stores and what crosses the wire. The Durable Object and
 * the client share these schemas, and party-db reads the row schemas to know
 * which columns it may write.
 */
import { z } from 'zod'

const phase = z.enum(['work', 'break'])
const perPhase = z.object({ work: z.number(), break: z.number() })

export const commandSchema = z.discriminatedUnion('type', [
	z.object({ type: z.literal('start') }),
	z.object({ type: z.literal('pause') }),
	z.object({ type: z.literal('nudge'), deltaMs: z.number() }),
	z.object({ type: z.literal('stretch'), deltaMs: z.number() }),
	z.object({ type: z.literal('skip') }),
	z.object({ type: z.literal('reset') }),
	z.object({
		type: z.literal('durations'),
		durations: z.object({ work: z.number().positive(), break: z.number().positive() }),
	}),
])

/** A command as a device sends it. The id lets the device know its own command when it comes back. */
export const commandRequestSchema = z.object({
	id: z.string().min(1).max(64),
	actor: z.string().max(40),
	command: commandSchema,
})
export type CommandRequest = z.infer<typeof commandRequestSchema>

/** The session's one clock row, and the last change made to it. */
export const clockRowSchema = z.object({
	id: z.string(),
	phase,
	endsAt: z.number().nullable(),
	remainingMs: z.number(),
	durations: perPhase,
	playlist: perPhase,
	/** Counts changes, so a device can ignore a row older than the one it has. */
	revision: z.number(),
	/** Who made the last change: a member's name, or "the clock" for a rollover. */
	actor: z.string(),
	/** Server time of the last change. */
	stampedAt: z.number(),
	command: z.string(),
	deltaMs: z.number(),
	/** The id of the command that made the last change; null for a rollover. */
	commandId: z.string().nullable(),
})
export type ClockRow = z.infer<typeof clockRowSchema>

export const CLOCK_ROW_ID = 'clock'

/** A video's length, learned by whichever device played it first. */
export const trackSchema = z.object({
	id: z.string(),
	durationMs: z.number(),
})
export type Track = z.infer<typeof trackSchema>

/** A member of the session: who they are, what they are working on, and whether they are here. */
export const memberSchema = z.object({
	id: z.string(),
	name: z.string(),
	intention: z.string(),
	/** Whether this member has a device connected to the session right now. */
	here: z.boolean(),
	/** Server time when this member last connected, left, or changed their details. */
	seenAt: z.number(),
})
export type Member = z.infer<typeof memberSchema>

/** What a device sends to set its member's name and intention. */
export const memberUpdateSchema = z.object({
	id: z.string().min(1).max(64),
	name: z.string().max(40),
	intention: z.string().max(500),
})

/** The cookie that carries a device's member id on the socket upgrade. */
export const MEMBER_COOKIE = 'pomoduo-member'

/** What the command endpoint answers: server time, and the row the command made, if any. */
export type CommandResponse = { serverAt: number; row: ClockRow | null }
