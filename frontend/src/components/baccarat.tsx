import { useState } from "react"
import { Card } from "@/components/blackjack"
import { BetControl, useBet } from "@/components/chips"
import { brl, errMsg, type GameProps, post } from "@/lib/api"
import { sounds, wait } from "@/lib/sound"
import { cn } from "@/lib/utils"

type BaccaratResult = { player: number[]; banker: number[]; playerTotal: number; bankerTotal: number; winner: string; payout: number }

const PICKS = [
  { id: "jogador", title: "JOGADOR", pays: "paga 1:1", color: "border-sky-300" },
  { id: "empate", title: "EMPATE", pays: "paga 8:1", color: "border-emerald-300" },
  { id: "banca", title: "BANCA", pays: "paga 0,95:1", color: "border-rose-300" },
]
const WINNER: Record<string, string> = { jogador: "Jogador vence", banca: "Banca vence", empate: "Empate" }

// Shows the cards of a side; `shown` is how many are face up so far.
function Side({ label, cards, shown, total }: { label: string; cards: number[]; shown: number; total: number | null }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex items-center gap-2 text-sm font-bold tracking-widest text-white/80">
        {label}
        {total !== null && <span className="total-tag rounded-full px-2.5 py-0.5 font-mono text-white">{total}</span>}
      </div>
      <div className="flex min-h-[94px] -space-x-6">
        {shown === 0 ? (
          <div className="flex gap-2">
            <div className="card-slot" />
            <div className="card-slot" />
          </div>
        ) : (
          cards.slice(0, shown).map((c, i) => <Card key={`${i}:${c}`} card={c} delay={0} />)
        )}
      </div>
    </div>
  )
}

export function Baccarat({ state, busy, setBusy, onResult, onError }: GameProps) {
  const [amount, setAmount] = useBet("baccarat", 10_00)
  const [pick, setPick] = useState("banca")
  const [res, setRes] = useState<BaccaratResult | null>(null)
  const [shown, setShown] = useState(0) // cards revealed, dealt alternately like a real croupier
  const [done, setDone] = useState(false)

  async function play() {
    if (busy || amount <= 0) return
    setBusy(true)
    setDone(false)
    const data = await post<BaccaratResult>("/api/baccarat", { amount, pick }).catch((e) => void onError(errMsg(e)))
    if (!data) return setBusy(false)
    setRes(data.result)
    const total = data.result.player.length + data.result.banker.length
    for (let n = 1; n <= total; n++) {
      setShown(n)
      sounds.card()
      await wait(450)
    }
    setDone(true)
    onResult(data.state, amount, data.result.payout)
    setBusy(false)
  }

  // deal order: P, B, P, B, then third cards (player's first)
  const order = res ? [...res.player.slice(0, 2).flatMap((c, i) => [["p", c], ["b", res.banker[i]]]), ...res.player.slice(2).map((c) => ["p", c]), ...res.banker.slice(2).map((c) => ["b", c])] : []
  const upTo = order.slice(0, shown)
  const pShown = upTo.filter((o) => o[0] === "p").length
  const bShown = upTo.filter((o) => o[0] === "b").length

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="felt-green flex w-full max-w-3xl flex-col items-center gap-5 rounded-3xl px-4 py-6">
        <p className="font-serif text-sm font-bold tracking-[0.4em] text-amber-200/90">BACARÁ · PUNTO BANCO</p>
        <div className="flex flex-wrap justify-center gap-10" aria-live="polite">
          <Side label="JOGADOR" cards={res?.player ?? []} shown={pShown} total={done && res ? res.playerTotal : null} />
          <Side label="BANCA" cards={res?.banker ?? []} shown={bShown} total={done && res ? res.bankerTotal : null} />
        </div>
        <div className="h-8 text-center">
          {done && res ? (
            <p className={cn("outcome-banner text-xl font-black", res.payout > amount ? "text-emerald-300" : res.payout === amount ? "text-zinc-200" : "text-rose-300")}>
              {WINNER[res.winner]}! {res.payout > amount ? `Ganhou ${brl(res.payout)}` : res.payout === amount ? "Aposta devolvida" : "Não foi dessa vez"}
            </p>
          ) : (
            <p className="text-lg font-bold text-emerald-100/80">{busy ? "Distribuindo..." : "Quem chega mais perto de 9?"}</p>
          )}
        </div>
        <div className="grid w-full grid-cols-3 gap-3" role="group" aria-label="Aposta">
          {PICKS.map((p) => (
            <button key={p.id} className={cn("dice-zone flex flex-col items-center gap-1 px-2 py-3", p.color)} aria-pressed={pick === p.id} disabled={busy} onClick={() => (sounds.chip(), setPick(p.id))}>
              <span className="text-lg font-black tracking-widest sm:text-xl">{p.title}</span>
              <span className="rounded-full bg-amber-400 px-2 py-0.5 font-mono text-xs font-black text-amber-950">{p.pays}</span>
            </button>
          ))}
        </div>
        <p className="text-center text-xs text-emerald-100/60">Figuras e 10 valem 0. Vale só o último dígito da soma. No empate, apostas em Jogador ou Banca são devolvidas.</p>
      </div>

      <BetControl amount={amount} setAmount={setAmount} max={state.balance} disabled={busy} />
      <button
        onClick={play}
        data-play
        disabled={busy || amount <= 0 || amount > state.balance}
        className="rounded-full bg-gradient-to-b from-amber-300 to-amber-600 px-10 py-3 text-lg font-black text-amber-950 shadow-lg shadow-amber-900/50 hover:brightness-110 disabled:opacity-40"
      >
        DISTRIBUIR · {brl(amount)}
      </button>
    </div>
  )
}
