import { Mic, MicOff, Phone, PhoneOff } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn, displayName } from '../lib/format'
import { MIC_DENIED } from '../lib/mic'
import type { CallState } from '../session/call'
import { Avatar } from './Members'

const listNames = (names: string[]) =>
	names.length < 3
		? names.join(' and ')
		: `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`

/** Asks the browser for the mic, followed by what saying yes is for. */
function AllowMic({ call, children }: { call: CallState; children: ReactNode }) {
	return (
		<p data-testid="mic-ask" className="text-side-muted text-[13px]">
			<button
				type="button"
				data-testid="allow-mic"
				onClick={call.ask}
				disabled={call.asking}
				className="text-side-link inline-flex items-center gap-1 font-medium hover:underline disabled:opacity-60"
			>
				<Mic className="size-3.5" />
				{call.asking ? 'Asking…' : 'Allow the mic'}
			</button>{' '}
			{children}
		</p>
	)
}

/** While the call is closed, offers the mic ahead of the break that will want it. */
export function MicAsk({ call }: { call: CallState }) {
	if (call.permission === 'granted') return null
	if (call.permission === 'denied')
		return (
			<p data-testid="mic-ask" className="text-side-muted text-xs">
				{MIC_DENIED}
			</p>
		)
	return (
		<AllowMic call={call}>
			now, and it will be ready when a break opens the call.
		</AllowMic>
	)
}

function Notice({ tone, children }: { tone: 'call' | 'calm'; children: ReactNode }) {
	return (
		<p
			data-testid="call-notice"
			className={cn(
				'rounded-lg border px-3 py-2 text-[13px] text-pretty',
				tone === 'call'
					? 'bg-call-notice border-call-notice-edge text-call-notice-text'
					: 'border-side-edge bg-side-row text-warning',
			)}
		>
			{children}
		</p>
	)
}

/** What to say about your own side of the call while it comes up, or while you only listen. */
function stateLine(call: CallState) {
	if (call.waiting)
		return call.listening ? 'Joining the call…' : 'Getting your mic on the call…'
	if (call.listening) return 'You’re listening in. Nothing of yours is going out.'
	return null
}

/** Your way off the call, and your mic while you are on it. */
function OnCallControls({ call }: { call: CallState }) {
	const line = stateLine(call)
	return (
		<>
			<div className="flex items-center justify-between gap-2">
				<Title dot="bg-on-call" className="text-on-call-title">
					On the call
				</Title>
				<span className="text-side-label text-[13px]">
					{call.onCount} of {call.onCount + call.waitingOn.length}
				</span>
			</div>
			{line && (
				<p data-testid="call-state" className="text-side-text text-[13px] text-pretty">
					{line}
				</p>
			)}
			<div className="flex items-center gap-2.5">
				{!call.listening && (
					<button
						type="button"
						data-testid="mute-button"
						aria-pressed={call.muted}
						onClick={call.toggleMute}
						className={cn(
							'btn h-auto flex-1 rounded-[9px] py-3 text-[15px] font-bold',
							call.muted
								? 'border-on-call text-on-call-title bg-transparent'
								: 'bg-on-call text-on-call-ink border-transparent',
						)}
					>
						{call.muted ? <MicOff className="size-4" /> : <Mic className="size-4" />}
						{call.muted ? 'Unmute' : 'Mute'}
					</button>
				)}
				<button
					type="button"
					data-testid="hang-up"
					onClick={call.hangUp}
					className={cn(
						'btn border-side-edge text-side-text h-auto rounded-[9px] bg-transparent py-3 text-[15px] font-medium',
						call.listening ? 'flex-1' : 'flex-none px-4',
					)}
				>
					<PhoneOff className="size-4" /> Hang up
				</button>
			</div>
			{/* a denied mic has already said so through the notice */}
			{call.listening &&
				call.permission !== 'denied' &&
				call.permission !== 'granted' && (
					<AllowMic call={call}>and your mic joins the call too.</AllowMic>
				)}
			{call.countdown !== null && (
				<p data-testid="call-cut" className="font-display text-center text-2xl">
					{call.countdown}…
				</p>
			)}
		</>
	)
}

/** Who is on the call and who it is waiting on, and your way on. */
function JoinControls({ call, you }: { call: CallState; you: string }) {
	return (
		<>
			<Title
				dot={call.ringing ? 'bg-call pomo-breathe' : 'bg-side-label'}
				className={call.ringing ? 'text-call-title' : 'text-side-label'}
			>
				The call is open
			</Title>
			{call.ringing ? (
				<div className="flex items-center gap-2.5">
					<Avatar member={call.others[0]} large />
					<div className="flex min-w-0 flex-col gap-px">
						<p data-testid="call-state" className="text-call-text text-base font-medium">
							{listNames(call.others.map((m) => displayName(m.name)))}{' '}
							{call.others.length > 1 ? 'are' : 'is'} on it
						</p>
						<span className="text-call-soft text-[13px]">
							waiting on{' '}
							{listNames(
								call.waitingOn.map((m) => (m.id === you ? 'you' : displayName(m.name))),
							)}
						</span>
					</div>
				</div>
			) : (
				<p data-testid="call-state" className="text-side-text text-[13px]">
					Nobody is on it yet. Join whenever you like.
				</p>
			)}
			<button
				type="button"
				data-testid="pick-up"
				onClick={call.pickUp}
				disabled={call.asking}
				className={cn(
					'btn h-auto rounded-[9px] py-3.5 text-base font-bold',
					call.ringing
						? 'bg-call text-call-ink border-transparent'
						: 'border-side-edge text-side-strong bg-transparent',
				)}
			>
				<Phone className="size-4" />
				{call.asking ? 'Asking for the mic…' : 'Join the call'}
			</button>
		</>
	)
}

function Title({
	children,
	dot,
	className,
}: {
	children: ReactNode
	dot: string
	className: string
}) {
	return (
		<p
			className={cn(
				'flex items-center gap-2 text-[13px] font-bold tracking-[0.12em] uppercase',
				className,
			)}
		>
			<span aria-hidden className={cn('size-2 shrink-0 rounded-full', dot)} />
			{children}
		</p>
	)
}

/**
 * The call, while it is open. It is the only part of the side column that ever
 * moves, and only while it rings.
 */
export function CallPanel({ call, you }: { call: CallState; you: string }) {
	if (!call.open) return null
	return (
		<section
			data-testid="call"
			className={cn(
				'flex flex-col gap-3.5 rounded-[11px] border p-4',
				call.onCall
					? 'border-on-call bg-on-call-ground'
					: call.ringing
						? 'pomo-ringing bg-call-ground border-call-edge'
						: 'bg-side-row border-side-edge',
			)}
		>
			{call.onCall ? (
				<OnCallControls call={call} />
			) : (
				<JoinControls call={call} you={you} />
			)}
			{call.notice && (
				<Notice tone={call.ringing ? 'call' : 'calm'}>{call.notice}</Notice>
			)}
		</section>
	)
}
