import { routePartykitRequest } from 'partyserver'
import { routePartyTracksRequest } from 'partytracks/server'

import { VOICE_PREFIX } from '../shared/schema'

// Exported so the Durable Object class ships with the Worker bundle.
export { Session } from './session'

export default {
	/**
	 * `/partytracks/*` is the call: partytracks on the device talks to the
	 * Cloudflare Realtime SFU through here, because only the Worker holds the
	 * app's token. `/parties/session/<id>/...` goes to that session's Durable
	 * Object: party-db's socket and writes, and the room's own endpoints. Every
	 * other path is the app. In production the edge serves assets before the
	 * Worker runs, so the fallback here only answers in local dev and tests.
	 */
	async fetch(request, env) {
		if (new URL(request.url).pathname.startsWith(VOICE_PREFIX)) {
			if (!env.SFU_APP_ID || !env.SFU_APP_TOKEN)
				return Response.json(
					{ error: 'This deployment has no Cloudflare Realtime app, so voice is off.' },
					{ status: 503 },
				)
			return routePartyTracksRequest({
				appId: env.SFU_APP_ID,
				token: env.SFU_APP_TOKEN,
				turnServerAppId: env.TURN_SERVER_APP_ID || undefined,
				turnServerAppToken: env.TURN_SERVER_APP_TOKEN || undefined,
				prefix: VOICE_PREFIX,
				request,
			})
		}
		return (await routePartykitRequest(request, env)) ?? env.ASSETS.fetch(request)
	},
} satisfies ExportedHandler<Env>
