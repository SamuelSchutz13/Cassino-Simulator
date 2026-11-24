import { useState } from "react"
import { BetControl, useBet } from "@/components/chips"
import { brl, errMsg, type GameProps, post } from "@/lib/api"
import { sounds, wait } from "@/lib/sound"
import { cn } from "@/lib/utils"

// pip positions in a 3×3 grid for faces 1–6
const PIPS = [[], [4], [0, 8], [0, 4, 8], [0, 2, 6, 8], [0, 2, 4, 6, 8], [0, 2, 3, 5, 6, 8]]
const PICKS = [
  { id: "menor", title: "MENOR", sub: "soma de 2 a 6", mult: "2,3x" },
  { id: "sete", title: "SETE", sub: "soma exata 7", mult: "5,8x" },
  { id: "maior", title: "MAIOR", sub: "soma de 8 a 12", mult: "2,3x" },
]

type DiceResult = { dice: number[]; payout: number }

function Die({ value, red, rolling, alt }: { value: number; red?: boolean; rolling: boolean; alt?: boolean }) {
  return (
    <div key={rolling ? "r" : `v${value}`} className={cn("die", red && "die-red", rolling ? cn("rolling", alt && "rolling-b") : "landed")} role="img" aria-label={`Dado: ${value}`}>
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className={PIPS[value].includes(i) ? "pip" : ""} />
      ))}
    </div>
  )
}

export function Dice({ state, busy, setBusy, onResult, onError }: GameProps) {
  const [amount, setAmount] = useBet("dice", 5_00)
  const [pick, setPick] = useState("maior")
  const [dice, setDice] = useState([3, 4])
  const [rolling, setRolling] = useState(false)
  const [result, setResult] = useState<DiceResult | null>(null)

  async function roll() {
    if (busy || amount <= 0) return
    setBusy(true)
    setResult(null)
    const data = await post<DiceResult>("/api/dice", { amount, pick }).catch((e) => void onError(errMsg(e)))
    if (!data) return setBusy(false)
    setRolling(true)
    sounds.dice()
    const timer = setInterval(() => setDice([1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)]), 90)
    await wait(1100)
    clearInterval(timer)
    setDice(data.result.dice)
    setRolling(false)
    setResult(data.result)
    onResult(data.state, amount, data.result.payout)
    setBusy(false)
  }

  const sum = dice[0] + dice[1]

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="felt-blue flex w-full max-w-3xl flex-col items-center gap-6 rounded-3xl p-6">
        <div className="flex items-center gap-6 py-4" aria-live="polite">
          <Die value={dice[0]} rolling={rolling} />
          <Die value={dice[1]} rolling={rolling} red alt />
        </div>
        <div className="h-8 text-center">
          {result ? (
            <p className={cn("outcome-banner text-xl font-black", result.payout > 0 ? "text-emerald-300" : "text-rose-300")}>
              Deu {sum}! {result.payout > 0 ? `Ganhou ${brl(result.payout)}` : "Não foi dessa vez"}
            </p>
          ) : (
            <p className="text-lg font-bold text-indigo-200/80">{rolling ? "Rolando..." : "Escolha onde apostar"}</p>
          )}
        </div>

        <div className="grid w-full grid-cols-3 gap-3" role="group" aria-label="Aposta">
          {PICKS.map((p) => (
            <button key={p.id} className="dice-zone flex flex-col items-center gap-1 px-2 py-4" aria-pressed={pick === p.id} disabled={busy} onClick={() => (sounds.chip(), setPick(p.id))}>
              <span className="text-xl font-black tracking-widest sm:text-2xl">{p.title}</span>
              <span className="text-xs text-indigo-100/70">{p.sub}</span>
              <span className="mt-1 rounded-full bg-amber-400 px-2 py-0.5 font-mono text-sm font-black text-amber-950">paga {p.mult}</span>
            </button>
          ))}
        </div>
      </div>

      <BetControl amount={amount} setAmount={setAmount} max={state.balance} disabled={busy} />
      <button
        onClick={roll}
        data-play
        disabled={busy || amount <= 0 || amount > state.balance}
        className="rounded-full bg-gradient-to-b from-amber-300 to-amber-600 px-10 py-3 text-lg font-black text-amber-950 shadow-lg shadow-amber-900/50 hover:brightness-110 disabled:opacity-40"
      >
        LANÇAR DADOS · {brl(amount)}
      </button>
    </div>
  )
}
