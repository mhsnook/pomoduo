/** Everything this app keeps on the device lives under this prefix. */
export const STORAGE_PREFIX = 'pomoduo:'

export function read<T>(key: string, fallback: T): T {
	if (typeof localStorage === 'undefined') return fallback
	try {
		const raw = localStorage.getItem(STORAGE_PREFIX + key)
		return raw ? (JSON.parse(raw) as T) : fallback
	} catch {
		return fallback
	}
}

export function write(key: string, value: unknown) {
	localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value))
}
