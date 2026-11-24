import { type ReactNode, useEffect, useRef, useState } from "react"
import { brl, type GameId, type State } from "@/lib/api"
import { cn } from "@/lib/utils"

// ---------- balance that counts up/down, with a floating +/- delta ----------
export function AnimatedBalance({ value }: { value: number }) {
  const [shown, setShown] = useState(value)
  const [delta, setDelta] = useState<{ id: number; v: number } | null>(null)
  const prev = useRef(value)
  useEffect(() => {
    const from = prev.current
    prev.current = value
    if (from === value) return
    setDelta({ id: Date.now(), v: value - from })
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return setShown(value)
    const start = performance.now()
    let raf = 0
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / 600)
      setShown(Math.round(from + (value - from) * (1 - (1 - p) ** 3)))
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [value])
  return (
    <span className="relative">
      {brl(shown)}
      {delta && (
        <span key={delta.id} className={cn("balance-delta", delta.v > 0 ? "text-emerald-300" : "text-rose-300")} aria-hidden>
          {delta.v > 0 ? "+" : "−"}
          {brl(Math.abs(delta.v))}
        </span>
      )}
    </span>
  )
}

// ---------- full-screen celebration for big wins ----------
export function BigWin({ amount, mult, onClose }: { amount: number; mult: number; onClose: () => void }) {
  const [shown, setShown] = useState(0)
  useEffect(() => {
    const start = performance.now()
    let raf = 0
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / 1400)
      setShown(Math.round(amount * (1 - (1 - p) ** 3)))
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    const t = setTimeout(onClose, 3800)
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    addEventListener("keydown", esc)
    return () => (cancelAnimationFrame(raf), clearTimeout(t), removeEventListener("keydown", esc))
  }, [amount, onClose])
  const title = mult >= 50 ? "MEGA VITÓRIA" : mult >= 25 ? "SUPER VITÓRIA" : "GRANDE VITÓRIA"
  return (
    <div className="bigwin" role="alert" onClick={onClose}>
      <div className="bigwin-rays" aria-hidden />
      <p className="bigwin-title">{title}</p>
      <p className="bigwin-amount">{brl(shown)}</p>
      <p className="mt-2 font-mono text-lg font-bold text-amber-200">{mult.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}x a aposta</p>
      <p className="mt-6 text-xs text-white/60">clique para continuar</p>
    </div>
  )
}

// ---------- session clock with gentle break reminders ----------
export function SessionClock({ onRemind }: { onRemind: (minutes: number) => void }) {
  const start = useRef(Number(sessionStorage.getItem("sessionStart")) || Date.now())
  const [mins, setMins] = useState(0)
  const remind = useRef(onRemind)
  remind.current = onRemind
  const reminded = useRef(0)
  useEffect(() => {
    sessionStorage.setItem("sessionStart", String(start.current))
    const tick = () => {
      const m = Math.floor((Date.now() - start.current) / 60000)
      setMins(m)
      if (m > 0 && m % 30 === 0 && reminded.current !== m) {
        reminded.current = m
        remind.current(m)
      }
    }
    tick()
    const id = setInterval(tick, 15000)
    return () => clearInterval(id)
  }, [])
  const text = mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, "0")}`
  return (
    <span className="hidden items-center gap-1 rounded-full bg-black/40 px-3 py-1 font-mono text-xs text-white/70 md:inline-flex" title="Tempo nesta sessão">
      ⏱ {text}
    </span>
  )
}

// ---------- scrolling marquee under the header ----------
const TIPS = [
  "💡 Espaço faz a jogada principal em qualquer mesa",
  "💡 No Foguete, alvos baixos acertam mais e pagam menos",
  "💡 No bacará, a Banca ganha um pouco mais vezes que o Jogador",
  "💡 No pôquer, posição importa: quem age por último sabe mais",
  "💡 Missões novas todo dia à meia-noite",
  "🍀 Jogue por diversão. A casa sempre tem vantagem",
]

export function Ticker({ state }: { state: State }) {
  const claimable = state.missions.filter((m) => m.progress >= m.goal && !m.claimed).length
  const items = [
    `🎰 Jackpot 7·7·7: ${brl(state.jackpot)}`,
    state.bonusAvailable ? "🎁 Seu presente do dia está esperando" : "",
    claimable ? `🏅 ${claimable} missão(ões) pronta(s) para resgatar` : "",
    `🏆 Conquistas: ${state.achievements.filter((a) => a.unlocked).length}/${state.achievements.length}`,
    ...TIPS,
  ].filter(Boolean)
  const row = items.map((t, i) => (
    <span key={i} className="px-6">
      {t}
    </span>
  ))
  return (
    <div className="ticker" aria-label="Avisos do cassino">
      <div className="ticker-track">
        <span>{row}</span>
        <span aria-hidden>{row}</span>
      </div>
    </div>
  )
}

// ---------- "how to play" dialog ----------
const RULES: Record<GameId, string[]> = {
  slots: ["Escolha o valor e puxe a alavanca (ou Espaço).", "Três símbolos iguais pagam de 8x a 250x; par nos dois primeiros rolos paga de 1x a 8x.", "7·7·7 também leva o jackpot progressivo inteiro.", "Retorno teórico ≈ 95%."],
  roulette: ["Escolha a ficha e clique na mesa para apostar; pode espalhar várias fichas.", "Número paga 35:1, dúzia 2:1, cor/par/ímpar/metades 1:1.", "O zero (verde) faz perder as apostas externas.", "Desfazer, limpar e repetir ficam embaixo da mesa."],
  blackjack: ["Chegue mais perto de 21 que a banca sem passar.", "Figuras valem 10, Ás vale 1 ou 11.", "Pedir (P), parar (S) ou dobrar (D) nas duas primeiras cartas.", "Blackjack paga 3:2. A banca para em 17."],
  dice: ["Aposte se a soma de dois dados será menor que 7, exatamente 7 ou maior que 7.", "Menor e maior pagam 2,3x; sete paga 5,8x."],
  crash: ["Escolha um alvo de 1,01x a 100x e lance o foguete.", "Se ele passar do alvo antes de explodir, você ganha aposta × alvo.", "Quanto maior o alvo, menor a chance. Retorno de 96% em qualquer alvo."],
  hilo: ["Aparece uma carta: a próxima será maior ou menor? Ás é a menor, Rei a maior.", "Carta igual perde.", "Cada acerto multiplica o prêmio (mostrado no botão). Saque quando quiser (C)."],
  baccarat: ["Aposte em Jogador, Banca ou Empate. Ganha quem chega mais perto de 9.", "Figuras e 10 valem 0; só conta o último dígito da soma.", "Jogador paga 1:1, Banca 0,95:1, Empate 8:1. No empate, Jogador e Banca são devolvidos."],
  poker: [
    "Texas Hold'em sem limite contra 3 jogadores da casa. Blinds R$ 0,50 / R$ 1.",
    "Cada um recebe 2 cartas; a mesa abre 3 (flop), 1 (turn) e 1 (river). Vale a melhor mão de 5 cartas.",
    "Na sua vez: desistir (F), mesa ou pagar (C), aumentar (R).",
    "Ordem das mãos: carta alta, par, dois pares, trinca, sequência, flush, full house, quadra, straight flush, royal flush.",
    "Compre fichas com o saldo; elas voltam ao sair da mesa.",
  ],
}

export function RulesButton({ game, title }: { game: GameId; title: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "?" && !(e.target as HTMLElement).closest("input, textarea")) ref.current?.showModal()
    }
    addEventListener("keydown", onKey)
    return () => removeEventListener("keydown", onKey)
  }, [])
  return (
    <>
      <button onClick={() => ref.current?.showModal()} className="rounded-full border border-amber-400/40 px-3 py-1 text-xs font-bold text-amber-200 hover:bg-amber-400/10">
        ? Como jogar
      </button>
      <dialog ref={ref} className="rules-dialog" onClick={(e) => e.target === ref.current && ref.current.close()}>
        <h2 className="mb-3 font-serif text-xl font-black text-amber-300">{title}</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm">
          {RULES[game].map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        <form method="dialog" className="mt-5 text-right">
          <button className="rounded-full bg-amber-400 px-5 py-1.5 text-sm font-black text-amber-950">Entendi</button>
        </form>
      </dialog>
    </>
  )
}

// ---------- tabbed sidebar ----------
export function SideTabs({ tabs }: { tabs: { id: string; label: string; badge?: number; content: ReactNode }[] }) {
  const [sel, setSel] = useState(() => localStorage.getItem("tab") ?? tabs[0].id)
  const cur = tabs.find((t) => t.id === sel) ?? tabs[0]
  const pick = (id: string) => (setSel(id), localStorage.setItem("tab", id))
  return (
    <div>
      <div className="side-tabs" role="tablist" aria-label="Painel">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={t.id === cur.id} onClick={() => pick(t.id)}>
            {t.label}
            {!!t.badge && <span className="tab-badge">{t.badge}</span>}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="mt-4 space-y-6">
        {cur.content}
      </div>
    </div>
  )
}
