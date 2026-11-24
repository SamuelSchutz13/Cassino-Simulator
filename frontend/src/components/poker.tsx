import { useEffect, useState } from "react"
import { Card } from "@/components/blackjack"
import { BetControl, Chip } from "@/components/chips"
import { brl, errMsg, type GameProps, post, type Seat, type State } from "@/lib/api"
import { sounds } from "@/lib/sound"
import { cn } from "@/lib/utils"

// seat 0 (you) at the bottom, then clockwise: left, top, right
const SPOT = ["bottom-2 left-1/2 -translate-x-1/2", "left-2 top-1/2 -translate-y-1/2", "top-2 left-1/2 -translate-x-1/2", "right-2 top-1/2 -translate-y-1/2"]
const STYLE_LABEL: Record<string, string> = { cauteloso: "cautelosa(o)", solto: "solta(o)", agressivo: "agressiva(o)" }

function SeatBox({ seat, i, dealer, acting, over }: { seat: Seat; i: number; dealer: boolean; acting: boolean; over: boolean }) {
  const winner = over && seat.won > 0
  return (
    <div className={cn("absolute z-10 flex w-[6.5rem] flex-col items-center gap-1 sm:w-44", SPOT[i])}>
      {seat.last && <span className={cn("poker-bubble", seat.folded && "opacity-60")}>{seat.last}</span>}
      <div className={cn("flex items-center", seat.folded && "opacity-30")}>
        {(seat.hole ?? []).map((c, k) => (
          <div key={`${k}:${c}`} className={cn("-mx-0.5", i === 0 ? "[zoom:0.75] sm:[zoom:1]" : "[zoom:0.5] sm:[zoom:0.7]")}>
            <Card card={c} delay={k * 0.1} />
          </div>
        ))}
      </div>
      <div className={cn("seat-plate", acting && "seat-acting", winner && "seat-winner")}>
        <span className="text-xl sm:text-2xl" aria-hidden>
          {seat.avatar}
        </span>
        <span className="min-w-0 text-left leading-tight">
          <span className="block truncate text-sm font-bold">
            {seat.name}
            {dealer && <span className="dealer-btn" aria-label="botão do dealer">D</span>}
          </span>
          <span className="block font-mono text-xs text-amber-300">{brl(seat.stack)}</span>
          {seat.style && <span className="hidden text-[10px] text-white/50 sm:block">{STYLE_LABEL[seat.style]}</span>}
        </span>
      </div>
      {seat.bet > 0 && !over && (
        <span className="bet-pill">
          <Chip value={seat.bet} small /> {brl(seat.bet)}
        </span>
      )}
      {winner && <span className="text-xs font-black text-emerald-300">+{brl(seat.won)}{seat.best && ` · ${seat.best}`}</span>}
      {!winner && over && seat.best && !seat.folded && <span className="text-xs text-white/60">{seat.best}</span>}
    </div>
  )
}

export function Poker({ state, busy, setBusy, onResult, onError }: GameProps) {
  const [buyIn, setBuyIn] = useState(50_00)
  const t = state.table
  const myTurn = t?.inHand && t.toAct === 0
  const [raiseTo, setRaiseTo] = useState(0)
  useEffect(() => setRaiseTo(t?.minRaiseTo ?? 0), [t?.minRaiseTo, t?.hands, t?.street])

  async function act(path: string, body: object = {}) {
    if (busy) return
    setBusy(true)
    const data = await post(`/api/poker/${path}`, body).catch((e) => void onError(errMsg(e)))
    setBusy(false)
    if (!data) return
    const nt = (data.state as State).table
    const me = nt?.seats[0]
    sounds.card()
    // a hand you put money in just finished
    if (nt && !nt.inHand && me && (path === "act" || path === "deal") && (me.total > 0 || me.won > 0)) onResult(data.state, me.total, me.won)
    else onResult(data.state)
  }

  if (!t) {
    return (
      <div className="flex flex-col items-center gap-6">
        <div className="poker-felt flex w-full max-w-3xl flex-col items-center gap-4 px-6 py-12 text-center">
          <p className="font-serif text-2xl font-black tracking-[0.3em] text-amber-200">TEXAS HOLD'EM</p>
          <p className="max-w-md text-sm text-emerald-50/80">
            Mesa sem limite com 3 jogadores da casa, cada um com seu estilo. Blinds R$ 0,50 / R$ 1,00. Compre fichas com o seu saldo e leve de volta quando sair da mesa.
          </p>
          <div className="flex gap-3 text-4xl" aria-hidden>
            👵 🧔 😎 🦊
          </div>
        </div>
        <BetControl amount={buyIn} setAmount={setBuyIn} max={Math.min(state.balance, 200_00)} disabled={busy} />
        <button
          onClick={() => act("sit", { amount: buyIn })}
          data-play
          disabled={busy || buyIn < 20_00 || buyIn > state.balance}
          className="rounded-full bg-gradient-to-b from-amber-300 to-amber-600 px-10 py-3 text-lg font-black text-amber-950 shadow-lg shadow-amber-900/50 hover:brightness-110 disabled:opacity-40"
        >
          SENTAR COM {brl(buyIn)}
        </button>
        <p className="-mt-3 text-xs text-muted-foreground">De R$ 20 a R$ 200 em fichas.</p>
      </div>
    )
  }

  const me = t.seats[0]
  const over = !t.inHand && t.hands > 0
  const board = [...(t.board ?? []), ...Array(5 - (t.board?.length ?? 0)).fill(null)]
  const pot = t.pot
  const quick = [
    ["Mín", t.minRaiseTo],
    ["½ pote", t.curBet + Math.round(pot / 2 / 50) * 50],
    ["Pote", t.curBet + pot],
    ["All-in", t.maxRaiseTo],
  ] as const

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="poker-felt relative h-[460px] w-full max-w-3xl sm:h-[440px]">
        {t.seats.map((s, i) => (
          <SeatBox key={i} seat={s} i={i} dealer={t.dealer === i} acting={t.inHand && t.toAct === i} over={over} />
        ))}
        <div className="absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2">
          <div className="flex gap-1">
            {board.map((c, k) =>
              c === null ? (
                <div key={k} className="card-slot [zoom:0.55] sm:[zoom:0.9]" />
              ) : (
                <div key={`${k}:${c}`} className="[zoom:0.55] sm:[zoom:0.9]">
                  <Card card={c} delay={0} />
                </div>
              ),
            )}
          </div>
          <span className="rounded-full bg-black/50 px-3 py-0.5 font-mono text-sm font-bold text-amber-300" aria-live="polite">
            Pote {brl(pot)}
          </span>
        </div>
      </div>

      {myTurn ? (
        <div className="flex w-full max-w-2xl flex-col items-center gap-3">
          <p className="text-sm text-muted-foreground">
            Sua vez{t.myHand && ` · você tem ${t.myHand}`}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <button onClick={() => act("act", { action: "fold" })} data-key="f" disabled={busy} className="poker-btn bg-gradient-to-b from-rose-500 to-rose-800">
              DESISTIR <kbd className="kbd">F</kbd>
            </button>
            <button onClick={() => act("act", { action: t.toCall ? "call" : "check" })} data-key="c" disabled={busy} className="poker-btn bg-gradient-to-b from-emerald-400 to-emerald-700">
              {t.toCall ? `PAGAR ${brl(t.toCall)}` : "MESA"} <kbd className="kbd">C</kbd>
            </button>
            <button onClick={() => act("act", { action: "raise", amount: raiseTo })} data-key="r" disabled={busy || !t.canRaise} className="poker-btn bg-gradient-to-b from-amber-300 to-amber-600 text-amber-950">
              {raiseTo >= t.maxRaiseTo ? "ALL-IN" : t.curBet ? "AUMENTAR P/" : "APOSTAR"} {brl(raiseTo)} <kbd className="kbd">R</kbd>
            </button>
          </div>
          {t.canRaise && (
            <div className="flex w-full flex-wrap items-center justify-center gap-2">
              {quick.map(([label, v]) => (
                <button
                  key={label}
                  className="rounded bg-white/10 px-2 py-1 text-xs font-bold hover:bg-white/20"
                  onClick={() => (sounds.chip(), setRaiseTo(Math.min(t.maxRaiseTo, Math.max(t.minRaiseTo, v))))}
                >
                  {label}
                </button>
              ))}
              <input
                type="range"
                min={t.minRaiseTo}
                max={t.maxRaiseTo}
                step={50}
                value={raiseTo}
                onChange={(e) => setRaiseTo(Number(e.target.value))}
                className="w-48 accent-amber-400"
                aria-label="Valor do aumento"
              />
            </div>
          )}
        </div>
      ) : t.inHand ? (
        <p className="text-sm text-muted-foreground">Aguardando os outros jogadores...</p>
      ) : (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            onClick={() => act("deal")}
            data-play
            disabled={busy || me.stack < 100}
            className="rounded-full bg-gradient-to-b from-amber-300 to-amber-600 px-8 py-3 text-lg font-black text-amber-950 shadow-lg shadow-amber-900/50 hover:brightness-110 disabled:opacity-40"
          >
            {t.hands ? "PRÓXIMA MÃO" : "DISTRIBUIR"}
          </button>
          {[20_00, 50_00].map((v) => (
            <button
              key={v}
              onClick={() => act("rebuy", { amount: v })}
              disabled={busy || v > state.balance || me.stack + v > 200_00}
              className="rounded-full bg-white/10 px-4 py-2 text-sm font-bold hover:bg-white/20 disabled:opacity-40"
            >
              + {brl(v)} em fichas
            </button>
          ))}
          <button onClick={() => act("leave")} disabled={busy} className="rounded-full bg-white/10 px-4 py-2 text-sm font-bold hover:bg-white/20 disabled:opacity-40">
            Sair da mesa ({brl(me.stack)})
          </button>
        </div>
      )}

      <section className="w-full max-w-2xl rounded-lg border border-white/10 bg-black/40 p-3" aria-label="Histórico da mesa">
        <h3 className="mb-1 text-xs font-bold tracking-widest text-amber-300">MESA</h3>
        <ul className="max-h-32 space-y-0.5 overflow-y-auto font-mono text-xs text-white/80">
          {(t.log ?? []).slice(-12).reverse().map((l, i) => (
            <li key={i} className={cn(l.startsWith("—") && "pt-1 text-amber-200/70", l.includes("ganhou") && "text-emerald-300")}>
              {l}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
