import { type Pomo, workedOf } from '../lib/ledger'

const timeFormat = new Intl.DateTimeFormat([], { hour: '2-digit', minute: '2-digit' })

export const fmtTime = (iso: string) => timeFormat.format(new Date(iso))

/** How long the clock ran for a pomo, in whole minutes. Pauses do not count. */
export const workedMinutes = (pomo: Pomo) => Math.round(workedOf(pomo) / 60_000)
