import { useRef, useState } from "react"
import { BetControl, useBet } from "@/components/chips"
import { brl, errMsg, type GameProps, post } from "@/lib/api"
import { sounds, wait } from "@/lib/sound"
import { cn } from "@/lib/utils"

// Same order as the server's symbols (rarest last).
const SYMBOLS = ["🍒", "🍋", "🔔", "⭐", "💎", "7"]
const NAMES = ["Cereja", "Limão", "Sino", "Estrela", "Diamante", "Sete"]
const TRIPLE = [8, 10, 20, 40, 100, 250]
const PAIR = [1, 1, 2, 3, 4, 8]

type SlotsResult = { reels: number[]; mult: number; payout: number; jackpot: number }

function Sym({ i, className }: { i: number; className?: string }) {
  return <span className={cn("block leading-none", i === 5 && "seven", className)}>{SYMBOLS[i]}</span>
}

const rnd = () => Math.floor(Math.random() * SYMBOLS.length)

export function Slots({ state, busy, setBusy, onResult, onError }: GameProps) {
  const [amount, setAmount] = useBet("slots", 5_00)
  const [reels, setReels] = useState([5, 5, 5])
  const [spinning, setSpinning] = useState([false, false, false])
  const [pulled, setPulled] = useState(false)
  const [result, setResult] = useState<SlotsResult | null>(null)
  const stopped = useRef([true, true, true])

  async function spin() {
    if (busy || amount <= 0) return
    setBusy(true)
    setResult(null)
    setPulled(true)
    sounds.lever()
    setTimeout(() => setPulled(false), 350)
    const data = await post<SlotsResult>("/api/slots", { amount }).catch((e) => void onError(errMsg(e)))
    if (!data) return setBusy(false)
    stopped.current = [false, false, false]
    setSpinning([true, true, true])
    const timer = setInterval(() => {
      setReels((r) => r.map((x, k) => (stopped.current[k] ? x : rnd())))
      sounds.tick()
    }, 70)
    for (let k = 0; k < 3; k++) {
      await wait(k === 0 ? 700 : 450)
      stopped.current[k] = true
      setReels((r) => r.with(k, data.result.reels[k]))
      setSpinning((s) => s.with(k, false))
      sounds.reelStop()
    }
    clearInterval(timer)
    setResult(data.result)
    onResult(data.state, amount, data.result.payout)
    setBusy(false)
  }

  const win = result && result.payout > 0
  const triple = result && result.reels[0] === result.reels[1] && result.reels[1] === result.reels[2]
  const lit = (k: number) => win && (triple || k < 2)

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="flex items-end gap-2">
        <div className="slot-cabinet w-[min(92vw,440px)] p-4 pt-3">
          <div className={cn("bulbs", busy && "bulbs-fast")} />
          <h2 className="neon-gold my-1 text-center text-2xl font-black tracking-widest sm:text-3xl">SUPER 7</h2>
          <div className={cn("bulbs bulbs-alt", busy && "bulbs-fast")} />
          <div className="jackpot-led mt-2" aria-label={`Jackpot progressivo: ${brl(state.jackpot)}`}>
            <span className="text-[10px] tracking-[0.4em] text-amber-200/80">JACKPOT 7·7·7</span>
            <span className="font-mono text-2xl font-black">{brl(state.jackpot)}</span>
          </div>

          {/* reels: the middle row is the pay line */}
          <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-black/50 p-2" aria-live="polite" aria-label={`Rolos: ${reels.map((r) => NAMES[r]).join(", ")}`}>
            {reels.map((r, k) => (
              <div key={k} className={cn("reel-window flex h-36 flex-col items-center justify-between overflow-hidden py-1 sm:h-40", lit(k) && "win-line")}>
                <Sym i={(r + 5) % 6} className={cn("text-3xl opacity-35", spinning[k] && "reel-spin")} />
                <Sym key={spinning[k] ? "s" : `f${r}`} i={r} className={cn("text-5xl sm:text-6xl", spinning[k] ? "reel-spin" : "reel-stop")} />
                <Sym i={(r + 1) % 6} className={cn("text-3xl opacity-35", spinning[k] && "reel-spin")} />
              </div>
            ))}
          </div>

          {/* LED display */}
          <div className="mt-3 rounded-md border border-amber-500/40 bg-black/80 px-3 py-2 text-center font-mono text-lg font-black tracking-wider">
            {busy ? (
              <span className="text-amber-300">GIRANDO...</span>
            ) : win ? (
              <span className="text-emerald-400">
                {result.jackpot > 0 ? `JACKPOT ${brl(result.jackpot)}! ` : triple ? "TRINCA! " : "PAR! "}
                {result.mult}x · {brl(result.payout)}
              </span>
            ) : result ? (
              <span className="text-rose-400">NÃO FOI DESSA VEZ</span>
            ) : (
              <span className="text-amber-300">PUXE A ALAVANCA</span>
            )}
          </div>
        </div>

        {/* lever */}
        <button onClick={spin} disabled={busy} className={cn("mb-24 flex flex-col items-center disabled:cursor-not-allowed", pulled && "lever-pulled")} aria-label="Puxar a alavanca e girar">
          <span className="lever-ball" />
          <span className="lever-stick h-24" />
          <span className="h-5 w-7 rounded-md bg-gradient-to-b from-zinc-300 to-zinc-600" />
        </button>
      </div>

      <BetControl amount={amount} setAmount={setAmount} max={state.balance} disabled={busy} />
      <button
        onClick={spin}
        data-play
        disabled={busy || amount <= 0 || amount > state.balance}
        className="rounded-full bg-gradient-to-b from-amber-300 to-amber-600 px-10 py-3 text-lg font-black text-amber-950 shadow-lg shadow-amber-900/50 transition hover:brightness-110 disabled:opacity-40"
      >
        GIRAR {brl(amount)}
      </button>

      <div className="paytable w-full max-w-md rounded-lg p-3">
        <h3 className="mb-2 text-center text-sm font-bold tracking-widest text-amber-300">TABELA DE PRÊMIOS</h3>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
          {SYMBOLS.map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-2">
              <span className="flex gap-0.5 text-lg">
                <Sym i={i} />
                <Sym i={i} />
                <Sym i={i} />
              </span>
              <span className="font-mono text-amber-200">{TRIPLE[i]}x</span>
              <span className="flex gap-0.5 text-sm opacity-80">
                <Sym i={i} />
                <Sym i={i} />
              </span>
              <span className="font-mono text-amber-200/80">{PAIR[i]}x</span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-center text-xs text-muted-foreground">Par vale nos dois primeiros rolos. Retorno teórico de ~95%. 2% de cada giro vai para o jackpot, que sai inteiro no 7·7·7.</p>
      </div>
    </div>
  )
}
