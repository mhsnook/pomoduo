export function formatClock(seconds: number) {
	const total = Math.max(0, seconds)
	const m = Math.floor(total / 60)
	const s = total % 60
	return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

/** Keeps the old value when a re-read turns up the same thing, so React skips the render. */
export const keepIfSame = <T>(prev: T, next: T) =>
	JSON.stringify(prev) === JSON.stringify(next) ? prev : next

/** What a member is called before they have said. */
export const displayName = (name: string) => name || 'someone'

export function cn(...parts: Array<string | false | null | undefined>) {
	return parts.filter(Boolean).join(' ')
}
