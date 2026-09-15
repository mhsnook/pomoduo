import { Mic, MicOff } from 'lucide-react'

import type { Member } from '../../shared/schema'
import { cn, displayName } from '../lib/format'

/** Who is in the session, and what each of them is working on. */
export function Members({ members, you }: { members: Member[]; you: string }) {
	if (members.length === 0) return null
	// everyone else first, the ones here before the ones away; you come last
	const sorted = [...members].sort(
		(a, b) =>
			Number(a.id === you) - Number(b.id === you) ||
			Number(b.here) - Number(a.here) ||
			b.seenAt - a.seenAt,
	)
	return (
		<section data-testid="members" className="flex flex-col gap-2">
			<h2 className="font-display text-xl">In this session</h2>
			<ul className="flex flex-col gap-2">
				{sorted.map((member) => (
					<li
						key={member.id}
						data-testid="member"
						className={cn(
							'font-ui flex flex-col gap-0.5 rounded-lg bg-white/10 px-3 py-2',
							!member.here && 'opacity-50',
						)}
					>
						<span className="flex items-center gap-2">
							<span
								aria-hidden
								className={cn(
									'size-2 shrink-0 rounded-full',
									member.here ? 'bg-success' : 'bg-current/40',
								)}
							/>
							<span className="font-bold">{displayName(member.name)}</span>
							{member.id === you && <span className="opacity-60">you</span>}
							<span className="ml-auto flex items-center gap-1.5">
								{member.vote && (
									<span title={`picked ${member.vote} for this break`}>
										{member.vote === 'dance' ? '💃' : '💬'}
									</span>
								)}
								{member.onCall &&
									member.mic &&
									(member.muted ? (
										<MicOff
											className="size-4 opacity-60"
											aria-label="on the call, muted"
										/>
									) : (
										<Mic className="size-4" aria-label="on the call" />
									))}
							</span>
							{!member.here && <span className="opacity-60">away</span>}
						</span>
						<span className="truncate opacity-80" title={member.intention}>
							{member.intention || 'no intention yet'}
						</span>
					</li>
				))}
			</ul>
		</section>
	)
}
