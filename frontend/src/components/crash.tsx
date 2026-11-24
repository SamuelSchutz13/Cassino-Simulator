import { useState } from "react"
import { BetControl, useBet } from "@/components/chips"
import { brl, errMsg, type GameProps, post } from "@/lib/api"
import { sounds } from "@/lib/sound"
import { cn } from "@/lib/utils"

type CrashResult = { crash: number; payout: number } // crash in hundredths (250 = 2,50x)

const TARGETS = [1.5, 2, 3, 5, 10, 50]
const clampTarget = (t: number) => Math.min(100, Math.max(1.01, Math.round(t * 100) / 100 || 1.01))
const fmt =(m: number) => m.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "x"

export function Crash({ state, busy, setBusy, onResult, onError }: GameProps) {
  const [amount, setAmount] = useBet("crash", 5_00)
  const [target, setTarget] = useState(2)
  const [mult, setMult] = useState(1)
  const [flying, setFlying] = useState(false)
  const [result, setResult] = useState<CrashResult | null>(null)
  const [cashed, setCashed] = useState(false)

  async function launch() {
    if (busy || amount <= 0) return
    const goal = clampTarget(target)
    setTarget(goal)
    setBusy(true)
    setResult(null)
    setCashed(false)
    const t = Math.round(goal * 100)
    const data = await post<CrashResult>("/api/crash", { amount, target: t }).catch((e) => void onError(errMsg(e)))
    if (!data) return setBusy(false)
    const crash = data.result.crash / 100
    // the server already decided; animate 1x → crash, slower climbs for bigger multipliers
    const dur = 1200 + 3800 * Math.min(1, Math.log(crash) / Math.log(100))
    setFlying(true)
    const start = performance.now()
    let lastTick = 1
    await new Promise<void>((done) => {
      const frame = (now: number) => {
        const p = Math.min(1, (now - start) / dur)
        const m = crash ** p
        setMult(m)
        if (m >= goal) setCashed(true)
        if (m - lastTick >= 0.1) (sounds.tick(), (lastTick = m))
        if (p < 1) requestAnimationFrame(frame)
        else done()
      }
      requestAnimationFrame(frame)
    })
    setFlying(false)
    sounds.lever() // boom
    setResult(data.result)
    onResult(data.state, amount, data.result.payout)
    setBusy(false)
  }

  // rocket height on a log scale up to 100x
  const height = Math.min(1, Math.log(mult) / Math.log(100))
  const exploded = result !== null
  const shown = clampTarget(target) // target may be mid-typing

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="crash-sky relative h-72 w-full max-w-3xl overflow-hidden rounded-3xl" aria-live="polite">
        <div className="crash-target" style={{ bottom: `${8 + 72 * Math.min(1, Math.log(shown) / Math.log(100))}%` }}>
          <span>alvo {fmt(shown)}</span>
        </div>
        {/* exhaust trail from the launch pad to the rocket */}
        <span className="crash-trail" style={{ height: `${72 * height}%`, opacity: exploded ? 0.25 : 1 }} aria-hidden />
        <span
          className={cn("absolute left-1/2 -translate-x-1/2 text-5xl transition-none", exploded ? "crash-boom" : flying && "crash-flame")}
          style={{ bottom: `${8 + 72 * height}%` }}
          aria-hidden
        >
          {exploded ? "💥" : "🚀"}
        </span>
        <p className={cn("absolute top-4 left-1/2 -translate-x-1/2 font-mono text-5xl font-black", exploded ? "text-rose-400" : cashed ? "text-emerald-300" : "text-white")}>
          {fmt(mult)}
        </p>
        <div className="absolute inset-x-0 top-20 text-center">
          {result ? (
            <p className={cn("outcome-banner text-xl font-black", result.payout > 0 ? "text-emerald-300" : "text-rose-300")}>
              Explodiu em {fmt(result.crash / 100)}! {result.payout > 0 ? `Sacou ${brl(result.payout)}` : "Não chegou no alvo"}
            </p>
          ) : (
            <p className="text-lg font-bold text-sky-200/80">{flying ? (cashed ? `Sacou em ${fmt(target)}!` : "Subindo...") : "Escolha o alvo e lance"}</p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2" role="group" aria-label="Alvo">
        {TARGETS.map((t) => (
          <button key={t} className="dice-zone px-3 py-1.5 font-mono font-black" aria-pressed={target === t} disabled={busy} onClick={() => (sounds.chip(), setTarget(t))}>
            {fmt(t)}
          </button>
        ))}
        <label className="flex items-center gap-1 text-sm">
          ou
          <input
            type="number"
            min={1.01}
            max={100}
            step={0.01}
            value={target}
            disabled={busy}
            onChange={(e) => setTarget(Number(e.target.value))}
            onBlur={() => setTarget(clampTarget(target))}
            className="w-20 rounded-md border border-amber-400/40 bg-black/50 px-2 py-1 font-mono"
            aria-label="Alvo personalizado"
          />
          x
        </label>
      </div>
      <p className="-mt-3 text-xs text-muted-foreground">Chance de chegar: {Math.round((96 / shown) * 10) / 10}% · paga {fmt(shown)}</p>

      <BetControl amount={amount} setAmount={setAmount} max={state.balance} disabled={busy} />
      <button
        onClick={launch}
        data-play
        disabled={busy || amount <= 0 || amount > state.balance}
        className="rounded-full bg-gradient-to-b from-amber-300 to-amber-600 px-10 py-3 text-lg font-black text-amber-950 shadow-lg shadow-amber-900/50 hover:brightness-110 disabled:opacity-40"
      >
        LANÇAR FOGUETE · {brl(amount)}
      </button>
    </div>
  )
}
