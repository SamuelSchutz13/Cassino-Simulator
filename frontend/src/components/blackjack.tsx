import { BetControl, useBet } from "@/components/chips"
import { brl, errMsg, type GameProps, type Hand, post } from "@/lib/api"
import { sounds } from "@/lib/sound"
import { cn } from "@/lib/utils"

const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"]
const SUITS = ["♠", "♥", "♦", "♣"]
const SUIT_NAMES = ["espadas", "copas", "ouros", "paus"]

const OUTCOME: Record<Hand["outcome"], { text: string; color: string }> = {
  "": { text: "", color: "" },
  blackjack: { text: "BLACKJACK!", color: "from-amber-300 to-amber-600 text-amber-950" },
  win: { text: "VOCÊ VENCEU", color: "from-emerald-400 to-emerald-700 text-white" },
  push: { text: "EMPATE", color: "from-zinc-300 to-zinc-500 text-zinc-900" },
  lose: { text: "A BANCA VENCEU", color: "from-rose-500 to-rose-800 text-white" },
  bust: { text: "ESTOUROU!", color: "from-rose-500 to-rose-800 text-white" },
}

export function Card({ card, delay }: { card: number; delay: number }) {
  const style = { animationDelay: `${delay}s` }
  if (card < 0) return <div className="playing-card card-back deal-in" style={style} aria-label="Carta virada" />
  const rank = RANKS[card % 13]
  const suit = Math.floor(card / 13)
  const red = suit === 1 || suit === 2
  return (
    <div className={cn("playing-card deal-in", red ? "text-red-600" : "text-zinc-900")} style={style} aria-label={`${rank} de ${SUIT_NAMES[suit]}`}>
      <span className="absolute top-1 left-1.5 text-center text-sm leading-none font-bold">
        {rank}
        <br />
        {SUITS[suit]}
      </span>
      <span className="absolute inset-0 flex items-center justify-center text-4xl">{SUITS[suit]}</span>
      <span className="absolute right-1.5 bottom-1 rotate-180 text-center text-sm leading-none font-bold">
        {rank}
        <br />
        {SUITS[suit]}
      </span>
    </div>
  )
}

function Row({ label, cards, total }: { label: string; cards: number[]; total: number }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex items-center gap-2 text-sm font-bold tracking-widest text-emerald-50/80">
        {label}
        {cards.length > 0 && <span className="total-tag rounded-full px-2.5 py-0.5 font-mono text-white">{total}</span>}
      </div>
      <div className="flex min-h-[94px] -space-x-6">
        {cards.length === 0 ? (
          <div className="flex gap-2">
            <div className="card-slot" />
            <div className="card-slot" />
          </div>
        ) : (
          cards.map((c, i) => <Card key={`${i}:${c}`} card={c} delay={i * 0.12} />)
        )}
      </div>
    </div>
  )
}

export function Blackjack({ state, busy, setBusy, onResult, onError }: GameProps) {
  const [amount, setAmount] = useBet("blackjack", 10_00)
  const hand = state.hand
  const playing = hand && !hand.done

  async function act(path: string, body: object = {}) {
    if (busy) return
    setBusy(true)
    sounds.card()
    const data = await post(`/api/blackjack/${path}`, body).catch((e) => void onError(errMsg(e)))
    setBusy(false)
    if (!data) return
    const h = data.state.hand
    if (h?.done) onResult(data.state, h.bet, h.payout)
    else onResult(data.state)
  }

  const outcome = hand?.done ? OUTCOME[hand.outcome] : null // non-null only with a finished hand

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="felt-teal bj-table relative flex w-full max-w-3xl flex-col items-center gap-6 px-4 pt-6 pb-16">
        {/* shoe */}
        <div className="absolute top-4 right-5 hidden h-16 w-12 rounded-md bg-gradient-to-b from-zinc-700 to-zinc-900 shadow-lg sm:block" aria-hidden>
          <div className="card-back absolute inset-x-1 top-1 h-10 rounded-sm" />
        </div>
        <Row label="BANCA" cards={hand?.dealer ?? []} total={hand?.dealerTotal ?? 0} />

        <div className={cn("bj-arc text-center text-xs sm:text-sm", outcome && "invisible")}>
          BLACKJACK PAGA 3 PARA 2
          <div className="mt-0.5 text-[10px] text-amber-200/70 sm:text-xs">A BANCA PARA EM 17</div>
        </div>

        {outcome && (
          <div className={cn("outcome-banner absolute top-1/2 z-10 -translate-y-1/2 rounded-xl bg-gradient-to-b px-6 py-3 text-center shadow-2xl", outcome.color)} aria-live="polite">
            <div className="text-2xl font-black tracking-wider">{outcome.text}</div>
            {hand!.payout > 0 && <div className="font-mono font-bold">{brl(hand!.payout)}</div>}
          </div>
        )}

        <Row label="VOCÊ" cards={hand?.player ?? []} total={hand?.playerTotal ?? 0} />
        {hand && (
          <div className="absolute bottom-6 flex items-center gap-2 rounded-full bg-black/40 px-3 py-1 text-sm font-bold">
            Aposta <span className="font-mono text-amber-300">{brl(hand.bet)}</span>
          </div>
        )}
      </div>

      {playing ? (
        <div className="flex flex-wrap justify-center gap-3">
          <button onClick={() => act("hit")} data-key="p" disabled={busy} className="rounded-full bg-gradient-to-b from-emerald-400 to-emerald-700 px-8 py-3 text-lg font-black text-white shadow-lg hover:brightness-110 disabled:opacity-40">
            PEDIR <kbd className="kbd">P</kbd>
          </button>
          <button onClick={() => act("stand")} data-key="s" disabled={busy} className="rounded-full bg-gradient-to-b from-rose-500 to-rose-800 px-8 py-3 text-lg font-black text-white shadow-lg hover:brightness-110 disabled:opacity-40">
            PARAR <kbd className="kbd">S</kbd>
          </button>
          <button
            onClick={() => act("double")}
            data-key="d"
            disabled={busy || !hand.canDouble || hand.bet > state.balance}
            className="rounded-full bg-gradient-to-b from-amber-300 to-amber-600 px-8 py-3 text-lg font-black text-amber-950 shadow-lg hover:brightness-110 disabled:opacity-40"
          >
            DOBRAR <kbd className="kbd">D</kbd>
          </button>
        </div>
      ) : (
        <>
          <BetControl amount={amount} setAmount={setAmount} max={state.balance} disabled={busy} />
          <button
            onClick={() => act("deal", { amount })}
            data-play
            disabled={busy || amount <= 0 || amount > state.balance}
            className="rounded-full bg-gradient-to-b from-amber-300 to-amber-600 px-10 py-3 text-lg font-black text-amber-950 shadow-lg shadow-amber-900/50 hover:brightness-110 disabled:opacity-40"
          >
            {hand ? "NOVA MÃO" : "DISTRIBUIR"} · {brl(amount)}
          </button>
        </>
      )}
    </div>
  )
}
