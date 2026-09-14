/** The review and edit dialogs for a pomo, lifted from pomodance. */
import { useState } from 'react'

import {
	draftError,
	draftOf,
	type Pomo,
	type PomoDraft,
	pomoFromDraft,
} from '../lib/ledger'
import { fmtTime, minutesBetween } from './time'
import { Modal, SettingInput, Toggle } from './ui'

export function ReviewDialog({
	pomo,
	onDismiss,
	onSave,
}: {
	pomo: Pomo
	onDismiss: () => void
	onSave: (note: string, clearIntention: boolean) => void
}) {
	const [text, setText] = useState(pomo.note || pomo.intention)
	return (
		<Modal testId="review-dialog" onDismiss={onDismiss}>
			<form
				onSubmit={(e) => {
					e.preventDefault()
					onSave(text, false)
				}}
				className="flex flex-col gap-4"
			>
				<h2 className="font-display text-2xl">
					Pomo done: {minutesBetween(pomo.start, pomo.end!)}m, started{' '}
					{fmtTime(pomo.start)}
				</h2>
				<p className="text-sm opacity-75">
					{pomo.intention
						? 'Here was your intention. Is that what you worked on, or do you want to put something else?'
						: 'No intention was set. What did you work on?'}
				</p>
				<textarea
					data-testid="review-note"
					autoFocus
					value={text}
					onChange={(e) => setText(e.target.value)}
					rows={3}
					placeholder="- a bullet or two of markdown"
					className="textarea w-full font-mono text-sm"
				/>
				<div className="modal-action">
					<button
						type="button"
						data-testid="review-done"
						className="btn btn-outline"
						onClick={() => onSave(text, true)}
					>
						Yep, and I’m done with it
					</button>
					<button type="submit" data-testid="review-keep" className="btn btn-primary">
						Yep, keep it as my intention
					</button>
				</div>
			</form>
		</Modal>
	)
}

export function EditPomoDialog({
	pomo,
	otherInProgress,
	onSave,
	onDelete,
	onDismiss,
}: {
	pomo: Pomo
	otherInProgress: boolean
	onSave: (pomo: Pomo) => void
	onDelete: () => void
	onDismiss: () => void
}) {
	const [draft, setDraft] = useState<PomoDraft>(() => draftOf(pomo))
	const set = (patch: Partial<PomoDraft>) => setDraft((d) => ({ ...d, ...patch }))
	const error = draftError(draft, otherInProgress)
	const inProgress = pomo.end === null

	return (
		<Modal testId="edit-dialog" onDismiss={onDismiss}>
			<h2 className="font-display text-2xl">Edit this pomo</h2>
			<div className="grid gap-3 sm:grid-cols-3">
				<SettingInput
					testId="edit-day"
					label="Filed under"
					type="date"
					value={draft.day}
					onChange={(v) => set({ day: v })}
				/>
				<SettingInput
					testId="edit-start"
					label="Started"
					type="datetime-local"
					value={draft.start}
					onChange={(v) => set({ start: v })}
				/>
				<SettingInput
					testId="edit-end"
					label="Ended (empty = still going)"
					type="datetime-local"
					value={draft.end}
					onChange={(v) => set({ end: v })}
				/>
			</div>
			<SettingInput
				testId="edit-intention"
				label="Intention"
				value={draft.intention}
				onChange={(v) => set({ intention: v })}
			/>
			<label className="font-ui flex flex-col gap-1 text-sm">
				<span className="opacity-70">Note</span>
				<textarea
					id="edit-note"
					data-testid="edit-note"
					value={draft.note}
					onChange={(e) => set({ note: e.target.value })}
					rows={3}
					placeholder="- a bullet or two of markdown"
					className="textarea w-full font-mono text-sm"
				/>
			</label>
			<Toggle
				testId="edit-confirmed"
				label="Reviewed"
				checked={draft.confirmed}
				onChange={(v) => set({ confirmed: v })}
			/>
			{error && (
				<p data-testid="edit-error" className="text-error text-sm">
					{error}
				</p>
			)}
			<div className="modal-action justify-between">
				{inProgress ? (
					<p data-testid="edit-delete-blocked" className="max-w-2xs text-xs opacity-70">
						This one is still going. Stop the timer, then delete the finished entry.
					</p>
				) : (
					<button
						type="button"
						data-testid="edit-delete"
						id="edit-delete"
						className="btn btn-outline btn-error"
						onClick={onDelete}
					>
						Delete it
					</button>
				)}
				<div className="flex gap-2">
					<button
						type="button"
						id="edit-cancel"
						className="btn btn-ghost"
						onClick={onDismiss}
					>
						Cancel
					</button>
					<button
						type="button"
						data-testid="edit-save"
						id="edit-save"
						disabled={error !== null}
						className="btn btn-primary"
						onClick={() => onSave(pomoFromDraft(pomo, draft))}
					>
						Save
					</button>
				</div>
			</div>
		</Modal>
	)
}
