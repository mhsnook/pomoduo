/**
 * The break vote: what kind of break a pomo ends in. The rules are in
 * tree/rules.md, "The break vote and its bank".
 */

export type BreakKind = 'dance' | 'yap'

export const BREAK_KINDS: BreakKind[] = ['dance', 'yap']

/** What a member who has not picked counts as. */
export const DEFAULT_KIND: BreakKind = 'dance'

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

/** Each kind's votes now, and with its bank added. */
export function standing(votes: BreakKind[], tally: Tally) {
	const cast = {
		dance: votes.filter((v) => v === 'dance').length,
		yap: votes.filter((v) => v === 'yap').length,
	}
	const total = { dance: cast.dance + tally.bank.dance, yap: cast.yap + tally.bank.yap }
	const leader: BreakKind =
		total.dance > total.yap
			? 'dance'
			: total.yap > total.dance
				? 'yap'
				: (tally.lastLoser ?? DEFAULT_KIND)
	return { cast, total, leader }
}

/**
 * The vote at the end of a pomo. The kind with more votes, bank included,
 * wins; a tie goes to the kind that lost last time. The winner spends its
 * bank. The loser banks the votes it just cast, so a side that keeps losing
 * gets its way eventually.
 */
export function decide(
	votes: BreakKind[],
	tally: Tally,
): { kind: BreakKind; tally: Tally } {
	const { cast, leader: kind } = standing(votes, tally)
	const loser = otherKind(kind)
	const bank = { [kind]: 0, [loser]: tally.bank[loser] + cast[loser] } as Tally['bank']
	return { kind, tally: { bank, lastLoser: loser } }
}
