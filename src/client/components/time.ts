const timeFormat = new Intl.DateTimeFormat([], { hour: '2-digit', minute: '2-digit' })

export const fmtTime = (iso: string) => timeFormat.format(new Date(iso))

export const minutesBetween = (a: string, b: string) =>
	Math.round((Date.parse(b) - Date.parse(a)) / 60_000)
