import { routePartykitRequest } from 'partyserver'

// Exported so the Durable Object class ships with the Worker bundle.
export { Session } from './session'

export default {
	/**
	 * `/parties/session/<id>/...` goes to that session's Durable Object: party-db's
	 * socket and writes, and the room's own `time` and `command` endpoints. Every
	 * other path is the app. In production the edge serves assets before the
	 * Worker runs, so the fallback here only answers in local dev and tests.
	 */
	async fetch(request, env) {
		return (await routePartykitRequest(request, env)) ?? env.ASSETS.fetch(request)
	},
} satisfies ExportedHandler<Env>
