/** Today's pomos, and the days before, lifted from pomodance. */
import { memo, type ReactNode, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { cn } from '../lib/format'
import { dayLabel, dayTotals, formatDuration, pastDays, type Pomo } from '../lib/ledger'
import { fmtTime, workedMinutes } from './time'

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
		<aside
			data-testid="ledger"
			className="flex flex-col gap-3 text-sm lg:border-l lg:border-current/20 lg:pl-6"
		>
			{!browsing && (
				<>
					<LedgerHeading
						title={dayLabel(day)}
						pomos={today}
						action={
							<button
								type="button"
								id="pomo-history"
								data-testid="history-button"
								aria-label="Past days"
								title="Past days"
								onClick={() => setBrowsing(true)}
								className="btn btn-ghost btn-sm shrink-0"
							>
								🕘 History
							</button>
						}
					/>
					{today.length === 0 && <p className="opacity-60">No pomos yet today.</p>}
					<PomoList pomos={today} onEdit={onEdit} />
				</>
			)}

			{browsing && !viewing && (
				<>
					<LedgerHeading title="Past days" action={<CloseHistory onClick={close} />} />
					{past.length === 0 && <p className="opacity-60">No earlier days yet.</p>}
					<ol className="flex flex-col gap-2">
						{past.map((entry) => (
							<li key={entry.day}>
								<button
									type="button"
									id={`history-day-${entry.day}`}
									data-testid="history-day"
									onClick={() => setOpenDay(entry.day)}
									className="font-ui flex w-full flex-col items-start gap-0.5 rounded-lg bg-white/10 px-3 py-2 text-left hover:bg-white/20"
								>
									<span>{dayLabel(entry.day)}</span>
									<span className="text-xs opacity-70">{summarize(entry.pomos)}</span>
								</button>
							</li>
						))}
					</ol>
				</>
			)}

			{browsing && viewing && (
				<>
					<LedgerHeading
						title={dayLabel(viewing.day)}
						pomos={viewing.pomos}
						back={
							<button
								type="button"
								id="history-back"
								data-testid="history-back"
								aria-label="Back to the list of past days"
								title="All past days"
								onClick={() => setOpenDay(null)}
								className="btn btn-circle btn-ghost btn-sm shrink-0"
							>
								‹
							</button>
						}
						action={<CloseHistory onClick={close} />}
					/>
					{viewing.pomos.length === 0 && (
						<p className="opacity-60">Nothing left on this day.</p>
					)}
					<PomoList pomos={viewing.pomos} onEdit={onEdit} />
				</>
			)}
		</aside>
	)
})

const summarize = (pomos: Pomo[]) => {
	const { count, minutes } = dayTotals(pomos)
	return `${count} ${count === 1 ? 'pomo' : 'pomos'} · ${formatDuration(minutes)}`
}

function LedgerHeading({
	title,
	pomos,
	back,
	action,
}: {
	title: string
	pomos?: Pomo[]
	back?: ReactNode
	action: ReactNode
}) {
	return (
		<div className="flex items-start justify-between gap-2">
			{back}
			<div className="mr-auto flex min-w-0 flex-col">
				<h2 className="font-display text-xl">{title}</h2>
				{pomos && pomos.length > 0 && (
					<span className="font-ui text-xs opacity-70">{summarize(pomos)}</span>
				)}
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
			className="btn btn-circle btn-ghost btn-sm shrink-0"
		>
			✕
		</button>
	)
}

function PomoList({ pomos, onEdit }: { pomos: Pomo[]; onEdit: (pomo: Pomo) => void }) {
	return (
		<ol className="flex flex-col gap-2">
			{pomos.map((p) => (
				<li
					key={p.id}
					data-testid="ledger-entry"
					className={cn(
						'flex flex-col gap-1 rounded-lg bg-white/10 px-3 py-2',
						!p.end && 'ring-1 ring-[var(--pomo-accent)]',
					)}
				>
					<div className="font-ui flex justify-between gap-2 text-xs tabular-nums opacity-70">
						<span>
							{fmtTime(p.start)} – {p.end ? fmtTime(p.end) : 'now'}
							{p.end && ` · ${workedMinutes(p)}m`}
						</span>
						<span className="flex items-center gap-1">
							<span
								title={p.confirmed ? 'confirmed' : p.end ? 'unconfirmed' : 'in progress'}
							>
								{p.confirmed ? '✅' : p.end ? '◌' : '⏳'}
							</span>
							<button
								type="button"
								data-testid="ledger-edit"
								id={`ledger-edit-${p.id}`}
								aria-label={`Edit the pomo that started at ${fmtTime(p.start)}`}
								title="Edit"
								onClick={() => onEdit(p)}
								className="btn btn-ghost btn-xs"
							>
								✎
							</button>
						</span>
					</div>
					<div
						className={cn(
							'prose prose-sm prose-invert max-w-none',
							!p.confirmed && 'italic',
						)}
					>
						<ReactMarkdown remarkPlugins={[remarkGfm]}>
							{(p.end ? p.note || p.intention : p.intention) || '_(no intention)_'}
						</ReactMarkdown>
					</div>
				</li>
			))}
		</ol>
	)
}
