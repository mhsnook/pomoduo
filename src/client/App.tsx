import { useEffect, useState } from 'react'

import { SessionPage } from './SessionPage'

/** A session lives at /s/<id>. The address is the invite. */
const sessionIdOf = (path: string) => /^\/s\/([\w-]{1,64})\/?$/.exec(path)?.[1] ?? null

const newSessionId = () => crypto.randomUUID().replaceAll('-', '').slice(0, 10)

export function App() {
	const [path, setPath] = useState(location.pathname)

	useEffect(() => {
		const onPop = () => setPath(location.pathname)
		window.addEventListener('popstate', onPop)
		return () => window.removeEventListener('popstate', onPop)
	}, [])

	const sessionId = sessionIdOf(path)
	if (sessionId) return <SessionPage key={sessionId} sessionId={sessionId} />

	const start = () => {
		const next = `/s/${newSessionId()}`
		history.pushState(null, '', next)
		setPath(next)
	}

	return (
		<main
			data-theme="emju-dark"
			className="pomo flex min-h-screen flex-col items-center justify-center gap-6 p-6 text-center"
		>
			<h1 className="font-display text-5xl">🍅 pomoduo</h1>
			<p className="font-ui max-w-md opacity-80">
				A pomodoro timer for coworking with a friend. Start a session, send your friend
				the link, and work to the same clock. Then dance on the break.
			</p>
			<button
				type="button"
				data-testid="start-session"
				onClick={start}
				className="btn btn-primary btn-lg"
			>
				Start a session
			</button>
			<p className="font-ui text-xs opacity-60">
				Works alone too. Keep the link to come back to it.
			</p>
		</main>
	)
}
