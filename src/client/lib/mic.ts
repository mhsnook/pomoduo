/**
 * What to tell someone whose browser is holding the mic back from the page.
 * A browser that has refused once does not ask again, so this says where to go.
 */
export const MIC_DENIED =
	'Your browser is not letting the page use the mic. Let it through in the site settings beside the address bar, then reload.'

/**
 * Asks the browser for the mic, then lets it go again. partytracks picks its
 * input out of `enumerateDevices()`, which names nothing until the page has
 * been allowed a mic once, so the asking has to happen before it looks.
 */
export async function askForMic(): Promise<Error | null> {
	try {
		const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
		for (const track of stream.getTracks()) track.stop()
		return null
	} catch (error) {
		return error instanceof Error ? error : new Error(String(error))
	}
}

/**
 * Says what went wrong with the mic, in a sentence. It says nothing about the
 * call: hearing the others needs no mic, so a failure here never decides
 * whether you are on it. partytracks raises
 * `DevicesExhaustedError` with no message of its own, so every case that
 * reaches a person is named here rather than passed through.
 */
export function micFailure(error: Pick<Error, 'name' | 'message'>): string {
	switch (error.name) {
		case 'NotAllowedError':
		case 'SecurityError':
			return MIC_DENIED
		case 'DevicesExhaustedError':
		case 'NotFoundError':
		case 'OverconstrainedError':
			return 'No mic reached the page. Check that one is plugged in, and that this browser and this machine let the page have it.'
		case 'NotReadableError':
			return 'Something else on this machine is holding the mic.'
		default:
			return error.message
				? `The mic did not start: ${error.message}`
				: 'The mic did not start.'
	}
}
