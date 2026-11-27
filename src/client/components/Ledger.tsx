/** Today's pomos, and the days before, lifted from pomodance. */
import { memo, type ReactNode, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { cn } from '../lib/format'
import {
	dayLabel,
	dayTotals,
	formatDuration,
	pastDays,
	type Pomo,
	workDayOf,
} from '../lib/ledger'
import { fmtTime, workedMinutes } from './time'
import { SideHeading } from './ui'

/** What a note keeps on one line: its emphasis, not its blocks or its links. */
const INLINE = ['p', 'strong', 'em', 'del', 'code']

export const Ledger = memo(function Ledger({
	pomos,
	day,
	onEdit,
}: {
	pomos: Pomo[]
	day: string
	onEdit: (pomo: Pomo) => void
}) {
	const [browsing, setBrowsing] = useState(false)
	const [openDay, setOpenDay] = useState<string | null>(null)
	const today = pomos.filter((p) => p.day === day)
	const past = pastDays(pomos, day)
	// the day being read can lose its last pomo to an edit while it is open
	const viewing = openDay && {
		day: openDay,
		pomos: past.find((d) => d.day === openDay)?.pomos ?? [],
	}

	const close = () => {
		setOpenDay(null)
		setBrowsing(false)
	}

	return (
		<section data-testid="ledger" className="mt-auto flex flex-col gap-2.5">
			{!browsing && (
				<>
					<LedgerHeading
						title={`${day === workDayOf(new Date()) ? 'Today' : dayLabel(day)} · ${summarize(today)}`}
						action={
							<button
								type="button"
								id="pomo-history"
								data-testid="history-button"
								title="Past days"
								onClick={() => setBrowsing(true)}
								className="text-side-link shrink-0 text-[13px] hover:underline"
							>
								History
							</button>
						}
					/>
					<PomoList pomos={today} onEdit={onEdit} />
				</>
			)}

			{browsing && !viewing && (
				<>
					<LedgerHeading title="Past days" action={<CloseHistory onClick={close} />} />
					{past.length === 0 && (
						<p className="text-side-muted text-[13px]">No earlier days yet.</p>
					)}
					<ol className="flex flex-col">
						{past.map((entry) => (
							<li key={entry.day} className="border-side-rule border-t">
								<button
									type="button"
									id={`history-day-${entry.day}`}
									data-testid="history-day"
									onClick={() => setOpenDay(entry.day)}
									className="hover:bg-side-row flex w-full items-baseline justify-between gap-2 px-0.5 py-2 text-left"
								>
									<span className="text-side-text text-sm">{dayLabel(entry.day)}</span>
									<span className="text-side-muted text-xs">
										{summarize(entry.pomos)}
									</span>
								</button>
							</li>
						))}
					</ol>
				</>
			)}

			{browsing && viewing && (
				<>
					<LedgerHeading
						title={`${dayLabel(viewing.day)} · ${summarize(viewing.pomos)}`}
						back={
							<button
								type="button"
								id="history-back"
								data-testid="history-back"
								aria-label="Back to the list of past days"
								title="All past days"
								onClick={() => setOpenDay(null)}
								className="text-side-link shrink-0 text-[13px]"
							>
								‹
							</button>
						}
						action={<CloseHistory onClick={close} />}
					/>
					<PomoList pomos={viewing.pomos} onEdit={onEdit} />
				</>
			)}
		</section>
	)
})

const summarize = (pomos: Pomo[]) => {
	const { count, minutes } = dayTotals(pomos)
	if (count === 0) return 'no pomos yet'
	return `${count} ${count === 1 ? 'pomo' : 'pomos'} · ${formatDuration(minutes)}`
}

function LedgerHeading({
	title,
	back,
	action,
}: {
	title: string
	back?: ReactNode
	action: ReactNode
}) {
	return (
		<div className="flex items-baseline justify-between gap-2">
			{back}
			<div className="mr-auto min-w-0">
				<SideHeading>{title}</SideHeading>
			</div>
			{action}
		</div>
	)
}

function CloseHistory({ onClick }: { onClick: () => void }) {
	return (
		<button
			type="button"
			id="history-close"
			data-testid="history-close"
			aria-label="Close the history and go back to today"
			title="Back to today"
			onClick={onClick}
			className="text-side-link shrink-0 text-[13px] hover:underline"
		>
			Today
		</button>
	)
}

function status(p: Pomo) {
	if (!p.end) return { word: 'now', className: 'text-side-link' }
	if (p.confirmed) return { word: 'done', className: 'text-side-done' }
	return { word: 'unreviewed', className: 'text-side-muted' }
}

/** One line per pomo. The whole line opens it for editing; the times are on hover. */
function PomoList({ pomos, onEdit }: { pomos: Pomo[]; onEdit: (pomo: Pomo) => void }) {
	return (
		<ol className="flex flex-col">
			{pomos.map((p) => {
				const text = (p.end ? p.note || p.intention : p.intention).replace(
					/\s*\n\s*/g,
					' ',
				)
				const { word, className } = status(p)
				return (
					<li key={p.id} data-testid="ledger-entry" className="border-side-rule border-t">
						<button
							type="button"
							data-testid="ledger-edit"
							id={`ledger-edit-${p.id}`}
							title={`${fmtTime(p.start)} – ${p.end ? `${fmtTime(p.end)} · ${workedMinutes(p)}m` : 'now'}`}
							onClick={() => onEdit(p)}
							className="hover:bg-side-row flex w-full items-center gap-2.5 px-0.5 py-2 text-left"
						>
							<span className="sr-only">Edit the pomo: </span>
							<span
								className={cn(
									'min-w-[42px] flex-none text-[12.5px] whitespace-nowrap tabular-nums',
									p.end ? 'text-side-muted' : 'text-side-link',
								)}
							>
								{fmtTime(p.start)}
							</span>
							<span
								className={cn(
									'min-w-0 flex-1 truncate text-sm',
									text ? 'text-side-text' : 'text-side-muted italic',
								)}
							>
								{text ? (
									<ReactMarkdown
										remarkPlugins={[remarkGfm]}
										allowedElements={INLINE}
										unwrapDisallowed
										components={{ p: ({ children }) => <>{children}</> }}
									>
										{text}
									</ReactMarkdown>
								) : (
									'no intention'
								)}
							</span>
							{p.end && (
								<span className="text-side-muted flex-none text-xs tabular-nums">
									{workedMinutes(p)}m
								</span>
							)}
							<span className={cn('flex-none text-xs', className)}>{word}</span>
						</button>
					</li>
				)
			})}
		</ol>
	)
}
