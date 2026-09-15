import { useEffect, useState } from 'react'

import { SettingInput } from './components/ui'
import { SessionPage } from './SessionPage'

/** A session lives at /s/<id>. The address is the invite. */
const sessionIdOf = (path: string) => /^\/s\/([\w-]{1,64})\/?$/.exec(path)?.[1] ?? null

const newSessionId = () => crypto.randomUUID().replaceAll('-', '').slice(0, 10)

export function App() {
	const [path, setPath] = useState(location.pathname)
	const [intention, setIntention] = useState('')
	/** The session this visit opened, and the intention it opened with. */
	const [opened, setOpened] = useState<{ id: string; intention: string } | null>(null)

	useEffect(() => {
		const onPop = () => setPath(location.pathname)
		window.addEventListener('popstate', onPop)
		return () => window.removeEventListener('popstate', onPop)
	}, [])

	const sessionId = sessionIdOf(path)
	if (sessionId)
		return (
			<SessionPage
				key={sessionId}
				sessionId={sessionId}
				startWith={opened?.id === sessionId ? opened.intention : undefined}
			/>
		)

	const start = () => {
		const id = newSessionId()
		setOpened({ id, intention: intention.trim() })
		const next = `/s/${id}`
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
				A pomodoro timer for coworking with a friend. Say what you are about to work on
				and the clock starts. Send your friend the link, and you work to the same clock.
				Then dance on the break.
			</p>
			<form
				className="flex w-full max-w-md flex-col gap-4 text-left"
				onSubmit={(event) => {
					event.preventDefault()
					start()
				}}
			>
				<SettingInput
					testId="intention-input"
					autoFocus
					label="What are you working on?"
					value={intention}
					onChange={setIntention}
					placeholder="one line about what you'll do"
				/>
				<button
					type="submit"
					data-testid="start-session"
					className="btn btn-primary btn-lg"
				>
					Start working
				</button>
			</form>
			<p className="font-ui text-xs opacity-60">
				Works alone too. Keep the link to come back to it.
			</p>
		</main>
	)
}
