/**
 * The Cloudflare Realtime credentials, which `wrangler types` cannot see: they
 * are secrets, set with `wrangler secret put` for a deployment and in
 * `.dev.vars` locally. Empty in a deployment that has no Realtime app, and the
 * Worker answers the call's requests with 503 when they are.
 */
interface Env {
	/** The Realtime SFU app that carries the voice. */
	SFU_APP_ID: string
	SFU_APP_TOKEN: string
	/** A TURN app, for members whose network will not carry the audio directly. */
	TURN_SERVER_APP_ID: string
	TURN_SERVER_APP_TOKEN: string
}
