import { useState } from "react"
import { Chip, ChipPicker } from "@/components/chips"
import { brl, errMsg, type GameProps, post } from "@/lib/api"
import { sounds, wait } from "@/lib/sound"
import { cn } from "@/lib/utils"

// European wheel order, clockwise from the zero.
const WHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26]
const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36])
const STEP = 360 / 37
const SPIN_MS = 5000

const colorOf = (n: number) => (n === 0 ? "rt-zero" : RED.has(n) ? "rt-red" : "rt-black")
const fill = (n: number) => (n === 0 ? "#15803d" : RED.has(n) ? "#b91c1c" : "#18181b")

type Bet = { kind: string; number: number; amount: number }
type RouletteResult = { number: number; payout: number; won: boolean[] }
const key = (b: { kind: string; number: number }) => `${b.kind}:${b.number}`

// point on a circle, angle in degrees clockwise from 12 o'clock
const pt = (r: number, deg: number) => [r * Math.sin((deg * Math.PI) / 180), -r * Math.cos((deg * Math.PI) / 180)]

function Wheel({ rot, ballRot }: { rot: number; ballRot: number }) {
  const wedge = (i: number) => {
    const [a, b] = [i * STEP - STEP / 2, i * STEP + STEP / 2]
    const [x1, y1] = pt(98, a), [x2, y2] = pt(98, b), [x3, y3] = pt(66, b), [x4, y4] = pt(66, a)
    return `M${x1} ${y1} A98 98 0 0 1 ${x2} ${y2} L${x3} ${y3} A66 66 0 0 0 ${x4} ${y4}Z`
  }
  return (
    <svg viewBox="-112 -112 224 224" className="wheel-rim size-[min(80vw,300px)]" role="img" aria-label="Roda da roleta">
      <defs>
        <radialGradient id="wood" cx="50%" cy="40%">
          <stop offset="0" stopColor="#b45309" />
          <stop offset="1" stopColor="#451a03" />
        </radialGradient>
        <radialGradient id="cone" cx="45%" cy="40%">
          <stop offset="0" stopColor="#fde68a" />
          <stop offset="0.5" stopColor="#a16207" />
          <stop offset="1" stopColor="#422006" />
        </radialGradient>
      </defs>
      <circle r="111" fill="url(#wood)" stroke="#fbbf24" strokeWidth="2" />
      <circle r="101" fill="#1c1917" />
      <g className="wheel-spin" style={{ transform: `rotate(${rot}deg)` }}>
        {WHEEL.map((n, i) => {
          const [tx, ty] = pt(88, i * STEP)
          return (
            <g key={n}>
              <path d={wedge(i)} fill={fill(n)} stroke="#d4af37" strokeWidth="0.6" />
              <text x={tx} y={ty} fill="#fff" fontSize="8" fontWeight="800" textAnchor="middle" dominantBaseline="central" transform={`rotate(${i * STEP} ${tx} ${ty})`}>
                {n}
              </text>
            </g>
          )
        })}
        <circle r="66" fill="url(#cone)" stroke="#d4af37" strokeWidth="1.5" />
        <circle r="44" fill="none" stroke="#fde68a" strokeOpacity="0.4" />
        {/* turret */}
        {[0, 90, 180, 270].map((a) => (
          <rect key={a} x="-3" y="-38" width="6" height="34" rx="3" fill="#fef3c7" stroke="#92400e" transform={`rotate(${a})`} />
        ))}
        <circle r="10" fill="#fef3c7" stroke="#92400e" strokeWidth="2" />
      </g>
      {/* ball orbits the other way and lands at 12 o'clock */}
      <g className="wheel-spin" style={{ transform: `rotate(${ballRot}deg)` }}>
        <circle cx="0" cy="-74" r="5" fill="#fafafa" stroke="#a1a1aa" />
      </g>
      <path d="M-6 -112 L6 -112 L0 -101Z" fill="#fbbf24" />
    </svg>
  )
}

export function Roulette({ state, busy, setBusy, onResult, onError }: GameProps) {
  const [chip, setChip] = useState(1_00)
  const [bets, setBets] = useState<Bet[]>([]) // one entry per click, so "undo" pops the last chip
  const [lastBets, setLastBets] = useState<Bet[]>([])
  const [rot, setRot] = useState(0)
  const [ballRot, setBallRot] = useState(0)
  const [result, setResult] = useState<RouletteResult | null>(null)
  const [recent, setRecent] = useState<number[]>([])

  const total = bets.reduce((s, b) => s + b.amount, 0)
  const onSpot = (k: string) => bets.filter((b) => key(b) === k).reduce((s, b) => s + b.amount, 0)

  function place(kind: string, number = 0) {
    if (busy) return
    if (total + chip > state.balance) return onError("Saldo insuficiente para essa ficha.")
    sounds.chip()
    setResult(null)
    setBets((b) => [...b, { kind, number, amount: chip }])
  }

  async function spin() {
    if (busy || bets.length === 0) return
    // merge clicks on the same spot into one bet
    const merged = Object.values(
      bets.reduce<Record<string, Bet>>((m, b) => {
        const k = key(b)
        m[k] = { ...b, amount: (m[k]?.amount ?? 0) + b.amount }
        return m
      }, {}),
    )
    setBusy(true)
    setResult(null)
    const data = await post<RouletteResult>("/api/roulette", { bets: merged }).catch((e) => void onError(errMsg(e)))
    if (!data) return setBusy(false)
    const idx = WHEEL.indexOf(data.result.number)
    // whole turns plus the angle that brings this pocket under the pointer
    setRot((r) => Math.ceil(r / 360) * 360 + 360 * 5 + (360 - idx * STEP))
    setBallRot((r) => Math.floor(r / 360) * 360 - 360 * 8)
    sounds.ball(SPIN_MS / 1000)
    await wait(SPIN_MS + 200)
    setResult(data.result)
    setRecent((r) => [data.result.number, ...r].slice(0, 12))
    setLastBets(bets)
    setBets([])
    onResult(data.state, total, data.result.payout)
    setBusy(false)
  }

  const hit = (kind: string, number = 0) => result && wonBy({ kind, number }, result.number)

  const cell = (kind: string, number: number, label: React.ReactNode, className?: string) => {
    const amt = onSpot(key({ kind, number }))
    return (
      <button
        key={key({ kind, number })}
        className={cn("rt-cell", className, hit(kind, number) && "rt-hit")}
        onClick={() => place(kind, number)}
        disabled={busy}
        aria-label={`Apostar em ${typeof label === "string" || typeof label === "number" ? label : kind}${amt ? `, já tem ${brl(amt)}` : ""}`}
      >
        {label}
        {amt > 0 && (
          <span className="rt-chip">
            <Chip value={amt} small />
          </span>
        )}
      </button>
    )
  }

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="flex flex-col items-center gap-4 md:flex-row md:items-start md:gap-8">
        <Wheel rot={rot} ballRot={ballRot} />
        <div className="flex flex-col items-center gap-3 md:items-start md:pt-6">
          <div
            className={cn(
              "flex size-24 items-center justify-center rounded-full border-4 border-amber-400 text-4xl font-black text-white shadow-xl",
              result ? colorOf(result.number) : "bg-black/50",
              result && "outcome-banner",
            )}
            aria-live="polite"
          >
            {busy ? "…" : result ? result.number : "?"}
          </div>
          {result && (
            <p className={cn("outcome-banner text-lg font-black", result.payout > 0 ? "text-emerald-400" : "text-rose-400")}>
              {result.payout > 0 ? `Ganhou ${brl(result.payout)}!` : "A banca levou."}
            </p>
          )}
          <div className="flex max-w-56 flex-wrap gap-1" aria-label="Últimos números">
            {recent.map((n, i) => (
              <span key={i} className={cn("flex size-7 items-center justify-center rounded-full text-xs font-bold text-white", colorOf(n))}>
                {n}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* betting layout: 0 | 3 rows × 12 columns, then dozens and outside bets */}
      <div className="felt-green w-full max-w-3xl overflow-x-auto rounded-2xl p-4">
        <div className="grid min-w-[560px] grid-cols-[repeat(13,minmax(0,1fr))]">
          {cell("numero", 0, "0", "rt-zero row-span-3 rounded-l-full")}
          {[3, 2, 1].map((row) => Array.from({ length: 12 }, (_, c) => c * 3 + row).map((n) => cell("numero", n, n, colorOf(n))))}
          <span />
          {[1, 2, 3].map((d) => (
            cell("duzia", d, `${d}ª dúzia`, "col-span-4")
          ))}
          <span />
          {cell("baixo", 0, "1 a 18", "col-span-2")}
          {cell("par", 0, "PAR", "col-span-2")}
          {cell("vermelho", 0, <span className="inline-block size-5 rotate-45 bg-red-700 ring-1 ring-white" />, "col-span-2")}
          {cell("preto", 0, <span className="inline-block size-5 rotate-45 bg-zinc-900 ring-1 ring-white" />, "col-span-2")}
          {cell("impar", 0, "ÍMPAR", "col-span-2")}
          {cell("alto", 0, "19 a 36", "col-span-2")}
        </div>
        <p className="mt-2 text-center text-xs text-emerald-100/70">Número paga 35 por 1 · Dúzia 2 por 1 · Cor, par/ímpar e metades 1 por 1</p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-4">
        <ChipPicker selected={chip} onSelect={setChip} disabled={busy} />
        <span className="rounded-md border border-amber-400/40 bg-black/50 px-3 py-1.5 font-mono text-lg font-black text-amber-300">Mesa: {brl(total)}</span>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <button className="rounded-full bg-white/10 px-4 py-2 text-sm font-bold hover:bg-white/20 disabled:opacity-40" disabled={busy || !bets.length} onClick={() => setBets((b) => b.slice(0, -1))}>
          Desfazer
        </button>
        <button className="rounded-full bg-white/10 px-4 py-2 text-sm font-bold hover:bg-white/20 disabled:opacity-40" disabled={busy || !bets.length} onClick={() => setBets([])}>
          Limpar mesa
        </button>
        <button
          className="rounded-full bg-white/10 px-4 py-2 text-sm font-bold hover:bg-white/20 disabled:opacity-40"
          disabled={busy || bets.length > 0 || !lastBets.length || lastBets.reduce((s, b) => s + b.amount, 0) > state.balance}
          onClick={() => setBets(lastBets)}
        >
          Repetir aposta
        </button>
        <button
          onClick={spin}
          data-play
          disabled={busy || !bets.length}
          className="rounded-full bg-gradient-to-b from-amber-300 to-amber-600 px-8 py-2 text-lg font-black text-amber-950 shadow-lg shadow-amber-900/50 hover:brightness-110 disabled:opacity-40"
        >
          {busy ? "Girando..." : "GIRAR"}
        </button>
      </div>
    </div>
  )
}

// mirrors the server's rule, only to highlight the winning spots
function wonBy(b: { kind: string; number: number }, n: number) {
  if (n === 0) return b.kind === "numero" && b.number === 0
  switch (b.kind) {
    case "numero":
      return b.number === n
    case "vermelho":
      return RED.has(n)
    case "preto":
      return !RED.has(n)
    case "par":
      return n % 2 === 0
    case "impar":
      return n % 2 === 1
    case "baixo":
      return n <= 18
    case "alto":
      return n >= 19
    case "duzia":
      return Math.floor((n - 1) / 12) + 1 === b.number
  }
  return false
}
