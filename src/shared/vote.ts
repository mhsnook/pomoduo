/**
 * The break vote: what kind of break a pomo ends in. The rules are in
 * tree/rules.md, "The break vote and its bank".
 */

export type BreakKind = 'dance' | 'yap'

export const BREAK_KINDS: BreakKind[] = ['dance', 'yap']

/** The kind a session starts on, and the winner of a tie nobody has lost yet. */
export const FIRST_KIND: BreakKind = 'dance'

/** One member's say in the vote: the kind they picked, or nothing. */
export type Vote = BreakKind | null

/**
 * What a room that said nothing at all gets. Alone there is nobody to yap
 * with, so quiet is a dance; from two people up, quiet is talking.
 */
export const defaultKind = (here: number): BreakKind => (here > 1 ? 'yap' : 'dance')

export const otherKind = (kind: BreakKind): BreakKind =>
	kind === 'dance' ? 'yap' : 'dance'

/** What the vote remembers from one break to the next. */
export type Tally = {
	/** Votes a kind cast and lost with, waiting to count again. */
	bank: Record<BreakKind, number>
	/** The kind that lost the last vote, which wins a tie. */
	lastLoser: BreakKind | null
}

export const freshTally = (): Tally => ({ bank: { dance: 0, yap: 0 }, lastLoser: null })

/** Each kind's votes now, and with its bank added. Not picking is not a vote. */
export function standing(votes: Vote[], tally: Tally) {
	const cast = {
		dance: votes.filter((v) => v === 'dance').length,
		yap: votes.filter((v) => v === 'yap').length,
	}
	const total = { dance: cast.dance + tally.bank.dance, yap: cast.yap + tally.bank.yap }
	// Level totals of nothing are a quiet room, not a tie: nobody has cast a
	// vote or banked one, so there is no disagreement to take turns over.
	const leader: BreakKind =
		total.dance > total.yap
			? 'dance'
			: total.yap > total.dance
				? 'yap'
				: total.dance === 0
					? defaultKind(votes.length)
					: (tally.lastLoser ?? FIRST_KIND)
	return { cast, total, leader }
}

/**
 * The vote at the end of a pomo. The kind with more votes, bank included,
 * wins; a tie goes to the kind that lost last time, and a room where nobody
 * voted gets the kind that suits its size. The winner spends its bank. The
 * loser banks the votes it just cast, so a side that keeps losing gets its way
 * eventually. A member who did not pick has cast nothing, so they bank nothing
 * and they stand in nobody's way.
 */
export function decide(votes: Vote[], tally: Tally): { kind: BreakKind; tally: Tally } {
	const { cast, leader: kind } = standing(votes, tally)
	const loser = otherKind(kind)
	const bank = { [kind]: 0, [loser]: tally.bank[loser] + cast[loser] } as Tally['bank']
	return { kind, tally: { bank, lastLoser: loser } }
}
