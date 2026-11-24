import { Card } from "@/components/blackjack"
import { BetControl, useBet } from "@/components/chips"
import { brl, errMsg, type GameProps, post } from "@/lib/api"
import { sounds } from "@/lib/sound"
import { cn } from "@/lib/utils"

const RANK_NAMES = ["Ás", "2", "3", "4", "5", "6", "7", "8", "9", "10", "Valete", "Dama", "Rei"]
const x = (m: number) => m.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "x"

// Same formulas as the server (cards.go): A low, K high, same rank loses.
const chance = (card: number, pick: "maior" | "menor") => (pick === "maior" ? 12 - (card % 13) : card % 13) / 13

export function HiLo({ state, busy, setBusy, onResult, onError }: GameProps) {
  const [amount, setAmount] = useBet("hilo", 5_00)
  const round = state.hilo
  const playing = round && !round.done
  const last = round?.cards.at(-1) ?? -1

  async function act(path: string, body: object = {}) {
    if (busy) return
    setBusy(true)
    sounds.card()
    const data = await post(`/api/hilo/${path}`, body).catch((e) => void onError(errMsg(e)))
    setBusy(false)
    if (!data) return
    const h = data.state.hilo
    if (h?.done) onResult(data.state, h.bet, h.payout)
    else onResult(data.state)
  }

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="felt-green flex w-full max-w-3xl flex-col items-center gap-5 rounded-3xl px-4 py-6">
        <p className="text-xs font-bold tracking-[0.35em] text-emerald-100/80">MAIOR OU MENOR · Ás É O MENOR, REI O MAIOR</p>
        <div className="flex min-h-[94px] flex-wrap justify-center gap-2" aria-live="polite">
          {round ? (
            round.cards.slice(-7).map((c, i, arr) => (
              <div key={`${round.cards.length - arr.length + i}:${c}`} className={cn(i < arr.length - 1 && "opacity-50")}>
                <Card card={c} delay={0} />
              </div>
            ))
          ) : (
            <Card card={-1} delay={0} />
          )}
        </div>
        <div className="h-14 text-center">
          {round?.done ? (
            <p className={cn("outcome-banner text-xl font-black", round.payout > 0 ? "text-emerald-300" : "text-rose-300")}>
              {round.payout > 0 ? `Sacou ${brl(round.payout)}!` : `Errou! Saiu ${RANK_NAMES[last % 13]}.`}
            </p>
          ) : playing ? (
            <>
              <p className="font-mono text-3xl font-black text-amber-300">{x(round.mult)}</p>
              <p className="text-sm text-emerald-100/80">{round.cards.length > 1 ? `Sacar agora: ${brl(Math.round(round.bet * round.mult))}` : "Acerte a primeira para poder sacar"}</p>
            </>
          ) : (
            <p className="text-lg font-bold text-emerald-100/80">Aposte e adivinhe a próxima carta</p>
          )}
        </div>
      </div>

      {playing ? (
        <div className="flex flex-wrap justify-center gap-3">
          {(["maior", "menor"] as const).map((pick) => {
            const p = chance(last, pick)
            return (
              <button
                key={pick}
                onClick={() => act("guess", { pick })}
                data-key={pick === "maior" ? "m" : "n"}
                disabled={busy || p === 0}
                className={cn(
                  "flex flex-col items-center rounded-2xl bg-gradient-to-b px-7 py-2 font-black text-white shadow-lg hover:brightness-110 disabled:opacity-40",
                  pick === "maior" ? "from-emerald-400 to-emerald-700" : "from-sky-400 to-sky-700",
                )}
              >
                <span className="text-lg">
                  {pick === "maior" ? "▲ MAIOR" : "▼ MENOR"} <kbd className="kbd">{pick === "maior" ? "M" : "N"}</kbd>
                </span>
                <span className="text-xs font-bold opacity-90">{p ? `${Math.round(p * 100)}% · ${x(0.97 / p)}` : "impossível"}</span>
              </button>
            )
          })}
          <button
            onClick={() => act("cashout")}
            data-key="c"
            disabled={busy || round.cards.length < 2}
            className="rounded-2xl bg-gradient-to-b from-amber-300 to-amber-600 px-7 py-2 text-lg font-black text-amber-950 shadow-lg hover:brightness-110 disabled:opacity-40"
          >
            SACAR <kbd className="kbd">C</kbd>
          </button>
        </div>
      ) : (
        <>
          <BetControl amount={amount} setAmount={setAmount} max={state.balance} disabled={busy} />
          <button
            onClick={() => act("start", { amount })}
            data-play
            disabled={busy || amount <= 0 || amount > state.balance}
            className="rounded-full bg-gradient-to-b from-amber-300 to-amber-600 px-10 py-3 text-lg font-black text-amber-950 shadow-lg shadow-amber-900/50 hover:brightness-110 disabled:opacity-40"
          >
            COMEÇAR · {brl(amount)}
          </button>
        </>
      )}
    </div>
  )
}
