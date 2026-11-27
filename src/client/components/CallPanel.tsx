import { Mic, MicOff, Phone, PhoneOff } from 'lucide-react'
import type { ReactNode } from 'react'

import type { Member } from '../../shared/schema'
import { cn, displayName } from '../lib/format'
import { MIC_DENIED } from '../lib/mic'
import type { CallState } from '../session/call'
import { Avatar } from './Members'

const listNames = (names: string[]) =>
	names.length < 3
		? names.join(' and ')
		: `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`

/**
 * Offers the mic to the browser, ahead of the call that will want it. Joining
 * asks too, so this stays out of the way while that button is there to press.
 */
export function MicAsk({ call }: { call: CallState }) {
	if (call.permission === 'granted' || (call.open && !call.listening)) return null
	// An open call has already said this through the notice, in the same words.
	if (call.permission === 'denied')
		return call.open ? null : (
			<p data-testid="mic-ask" className="text-side-muted text-xs">
				{MIC_DENIED}
			</p>
		)
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
			{call.listening
				? 'and your mic joins the call too.'
				: 'now, and it will be ready when a break opens the call.'}
		</p>
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

function Title({ children, dot }: { children: ReactNode; dot: string }) {
	return (
		<p className="flex items-center gap-2 text-[13px] font-bold tracking-[0.12em] uppercase">
			<span aria-hidden className={cn('size-2 shrink-0 rounded-full', dot)} />
			{children}
		</p>
	)
}

/**
 * The call, while it is open: who is on it and who it is waiting on, and your
 * way on or off. It is the only part of the side column that ever moves, and
 * only while somebody else is on it and you are not.
 */
export function CallPanel({
	call,
	members,
	you,
}: {
	call: CallState
	members: Member[]
	you: string
}) {
	if (!call.open) return null
	const here = members.filter((m) => m.here)
	const others = here.filter((m) => m.id !== you && m.onCall)
	const onCount = here.filter((m) => m.onCall).length

	if (call.onCall)
		return (
			<section
				data-testid="call"
				className="border-on-call bg-on-call-ground flex flex-col gap-3.5 rounded-[11px] border p-4"
			>
				<div className="flex items-center justify-between gap-2">
					<Title dot="bg-on-call">
						<span className="text-on-call-title">On the call</span>
					</Title>
					<span className="text-side-label text-[13px]">
						{onCount} of {here.length}
					</span>
				</div>
				{(call.waiting || call.listening) && (
					<p data-testid="call-state" className="text-side-text text-[13px] text-pretty">
						{call.waiting
							? call.listening
								? 'Joining the call…'
								: 'Getting your mic on the call…'
							: 'You’re listening in. Nothing of yours is going out.'}
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
				<MicAsk call={call} />
				{call.countdown !== null && (
					<p data-testid="call-cut" className="font-display text-center text-2xl">
						{call.countdown}…
					</p>
				)}
				{call.notice && <Notice tone="calm">{call.notice}</Notice>}
			</section>
		)

	const ringing = others.length > 0
	const waitingOn = here
		.filter((m) => !m.onCall)
		.sort((a, b) => Number(b.id === you) - Number(a.id === you))
		.map((m) => (m.id === you ? 'you' : displayName(m.name)))

	return (
		<section
			data-testid="call"
			className={cn(
				'flex flex-col gap-3.5 rounded-[11px] border p-4',
				ringing
					? 'pomo-ringing bg-call-ground border-call-edge'
					: 'bg-side-row border-side-edge',
			)}
		>
			<Title dot={ringing ? 'bg-call pomo-breathe' : 'bg-side-label'}>
				<span className={ringing ? 'text-call-title' : 'text-side-label'}>
					The call is open
				</span>
			</Title>
			{ringing ? (
				<div className="flex items-center gap-2.5">
					<Avatar member={others[0]} large />
					<div className="flex min-w-0 flex-col gap-px">
						<p data-testid="call-state" className="text-call-text text-base font-medium">
							{listNames(others.map((m) => displayName(m.name)))}{' '}
							{others.length > 1 ? 'are' : 'is'} on it
						</p>
						<span className="text-call-soft text-[13px]">
							waiting on {listNames(waitingOn)}
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
					ringing
						? 'bg-call text-call-ink border-transparent'
						: 'border-side-edge text-side-strong bg-transparent',
				)}
			>
				<Phone className="size-4" />
				{call.asking ? 'Asking for the mic…' : 'Join the call'}
			</button>
			{call.notice && <Notice tone={ringing ? 'call' : 'calm'}>{call.notice}</Notice>}
		</section>
	)
}
