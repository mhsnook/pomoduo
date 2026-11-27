export function formatClock(seconds: number) {
	const total = Math.max(0, seconds)
	const m = Math.floor(total / 60)
	const s = total % 60
	return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

/** Time left as it reads in a sentence: `2:06`, with no padding on the minutes. */
export function formatLeft(seconds: number) {
	const total = Math.max(0, seconds)
	return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, '0')}`
}

/** The letter on a member's avatar. */
export const initialOf = (name: string) =>
	(Array.from(displayName(name.trim()))[0] ?? '?').toUpperCase()

/** Keeps the old value when a re-read turns up the same thing, so React skips the render. */
export const keepIfSame = <T>(prev: T, next: T) =>
	JSON.stringify(prev) === JSON.stringify(next) ? prev : next

/** Names a member who has not told the session what to call them. */
export const displayName = (name: string) => name || 'someone'

export function cn(...parts: Array<string | false | null | undefined>) {
	return parts.filter(Boolean).join(' ')
}
