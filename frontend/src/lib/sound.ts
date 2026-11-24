// Tiny synthesized sound effects (Web Audio), so the project ships no audio files.
let ctx: AudioContext | null = null
let muted = localStorage.getItem("muted") === "1"

export const isMuted = () => muted
export function setMuted(m: boolean) {
  muted = m
  localStorage.setItem("muted", m ? "1" : "0")
}

function audio() {
  ctx ??= new AudioContext()
  void ctx.resume() // browsers start audio suspended until a user gesture
  return ctx
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = "sine", vol = 0.15) {
  if (muted) return
  const c = audio()
  const t = c.currentTime + start
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = type
  osc.frequency.value = freq
  gain.gain.setValueAtTime(vol, t)
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur)
  osc.connect(gain).connect(c.destination)
  osc.start(t)
  osc.stop(t + dur)
}

// Band-passed white noise: card swish, dice rattle, ball clicks.
let noiseBuf: AudioBuffer | null = null
function noise(start: number, dur: number, freq: number, q: number, vol: number) {
  if (muted) return
  const c = audio()
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate)
    const d = noiseBuf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  }
  const t = c.currentTime + start
  const src = c.createBufferSource()
  const filter = c.createBiquadFilter()
  const gain = c.createGain()
  src.buffer = noiseBuf
  src.loop = true
  filter.type = "bandpass"
  filter.frequency.value = freq
  filter.Q.value = q
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(vol, t + 0.005)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  src.connect(filter).connect(gain).connect(c.destination)
  src.start(t)
  src.stop(t + dur + 0.05)
}

export const sounds = {
  chip: () => noise(0, 0.05, 3500, 4, 0.25),
  tick: () => tone(1800, 0, 0.03, "square", 0.03),
  lever: () => noise(0, 0.25, 300, 1, 0.3),
  reelStop: () => tone(180, 0, 0.12, "square", 0.08),
  card: () => noise(0, 0.12, 2500, 0.8, 0.25),
  dice: () => [0, 0.08, 0.15, 0.27, 0.36].forEach((s) => noise(s, 0.05, 1800 + Math.random() * 800, 3, 0.35)),
  // Roulette ball clicks slowing down over the spin (quadratic spacing).
  ball: (secs: number) => Array.from({ length: 34 }, (_, i) => noise(secs * (i / 34) ** 2 * 0.95, 0.03, 4200, 6, 0.18)),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.35, "triangle")),
  jackpot: () => [523, 659, 784, 1047, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, i * 0.1, 0.4, "triangle", 0.18)),
  lose: () => [392, 330, 262].forEach((f, i) => tone(f, i * 0.18, 0.35, "sawtooth", 0.05)),
  coin: () => [988, 1319].forEach((f, i) => tone(f, i * 0.09, 0.3, "square", 0.07)),
}

export const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
