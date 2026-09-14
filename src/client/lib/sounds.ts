/** The beeps. Lifted from pomodance. */

let ctx: AudioContext | null = null
function audio() {
	if (typeof window === 'undefined') return null
	ctx ??= new AudioContext()
	if (ctx.state === 'suspended') void ctx.resume()
	return ctx
}

function tone(
	freq: number,
	start: number,
	duration: number,
	gain = 0.15,
	type: OscillatorType = 'sine',
) {
	const ac = audio()
	if (!ac) return
	const osc = ac.createOscillator()
	const g = ac.createGain()
	osc.type = type
	osc.frequency.value = freq
	const t0 = ac.currentTime + start
	g.gain.setValueAtTime(0, t0)
	g.gain.linearRampToValueAtTime(gain, t0 + 0.01)
	g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration)
	osc.connect(g).connect(ac.destination)
	osc.start(t0)
	osc.stop(t0 + duration + 0.05)
}

export const sounds = {
	beep: () => tone(880, 0, 0.12),
	click: () => tone(220, 0, 0.05, 0.1, 'square'),
	ring: () => {
		tone(1046, 0, 0.5)
		tone(1318, 0.15, 0.5)
		tone(1568, 0.3, 0.8)
	},
}
