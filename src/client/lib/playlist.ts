/**
 * Where a playlist's place, in ms from its start, falls among its tracks.
 *
 * The session only knows places. Track lengths come from whichever member's
 * player loaded the track first, so the mapping only needs lengths of tracks
 * someone has already played. A place past the last known length lands in the
 * first unknown track, which is the best guess available.
 */
export function placeToTrack(
	videos: string[],
	lengthOf: (id: string) => number | undefined,
	placeMs: number,
): { index: number; offsetMs: number } | null {
	if (videos.length === 0) return null
	const lengths = videos.map(lengthOf)
	let left = Math.max(0, placeMs)
	if (lengths.every((l) => l !== undefined && l > 0)) {
		const total = (lengths as number[]).reduce((a, b) => a + b, 0)
		left %= total
	}
	for (let index = 0; ; index = (index + 1) % videos.length) {
		const length = lengths[index]
		if (length === undefined || length <= 0 || left < length)
			return { index, offsetMs: left }
		left -= length
	}
}
