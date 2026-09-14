/** Small shared controls, lifted from pomodance. */
import { type ReactNode, useEffect } from 'react'

import { cn } from '../lib/format'

/**
 * One of the round controls under the clock. `className` carries the size, which
 * is also the hit box: daisyUI's own min-height would otherwise win over it.
 */
export function TransportButton({
	id,
	testId,
	label,
	title,
	onClick,
	className,
	children,
}: {
	id: string
	testId: string
	label: string
	title?: string
	onClick: () => void
	className?: string
	children: ReactNode
}) {
	return (
		<button
			type="button"
			id={id}
			data-testid={testId}
			aria-label={label}
			title={title ?? label}
			onClick={onClick}
			className={cn('btn btn-circle btn-ghost min-h-0 p-0', className)}
		>
			{children}
		</button>
	)
}

export function clampMinutes(v: string, fallback: number) {
	const n = Number.parseInt(v, 10)
	return Number.isFinite(n) && n > 0 ? Math.min(n, 180) : fallback
}

export function SettingInput({
	testId,
	label,
	value,
	onChange,
	onEnter,
	type = 'text',
	placeholder,
	className,
}: {
	testId: string
	label: string
	value: string
	onChange: (v: string) => void
	onEnter?: () => void
	type?: 'text' | 'number' | 'date' | 'datetime-local'
	placeholder?: string
	className?: string
}) {
	return (
		<label className={cn('font-ui flex flex-col gap-1 text-sm', className)}>
			<span className="opacity-70">{label}</span>
			<input
				id={testId}
				data-testid={testId}
				type={type}
				min={type === 'number' ? 1 : undefined}
				value={value}
				placeholder={placeholder}
				onChange={(e) => onChange(e.target.value)}
				onKeyDown={(e) => e.key === 'Enter' && onEnter?.()}
				className="input w-full"
			/>
		</label>
	)
}

export function Toggle({
	testId,
	label,
	hint,
	checked,
	onChange,
}: {
	testId: string
	label: string
	hint?: string
	checked: boolean
	onChange: (v: boolean) => void
}) {
	return (
		<label className="font-ui flex cursor-pointer items-start gap-3 text-sm">
			<input
				id={testId}
				data-testid={testId}
				type="checkbox"
				checked={checked}
				onChange={(e) => onChange(e.target.checked)}
				className="toggle toggle-primary"
			/>
			<span className="flex flex-col">
				<span>{label}</span>
				{hint && <span className="opacity-60">{hint}</span>}
			</span>
		</label>
	)
}

export function Modal({
	testId,
	onDismiss,
	children,
}: {
	testId: string
	onDismiss: () => void
	children: ReactNode
}) {
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onDismiss()
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	}, [onDismiss])
	return (
		<div data-testid={testId} className="modal modal-open" role="dialog">
			<div className="modal-box flex flex-col gap-4">
				<button
					type="button"
					onClick={onDismiss}
					aria-label="Dismiss"
					className="btn btn-circle btn-ghost btn-sm absolute top-2 right-2"
				>
					✕
				</button>
				{children}
			</div>
			<button
				type="button"
				aria-label="Dismiss"
				className="modal-backdrop"
				onClick={onDismiss}
			/>
		</div>
	)
}
