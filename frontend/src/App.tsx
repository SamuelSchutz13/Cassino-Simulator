import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Blackjack } from "@/components/blackjack"
import { Baccarat } from "@/components/baccarat"
import { Crash } from "@/components/crash"
import { HiLo } from "@/components/hilo"
import { Poker } from "@/components/poker"
import { GAME_ICON, HistoryBoard } from "@/components/board"
import { Dice } from "@/components/dice"
import { AnimatedBalance, BigWin, RulesButton, SessionClock, SideTabs, Ticker } from "@/components/extras"
import { Roulette } from "@/components/roulette"
import { Slots } from "@/components/slots"
import { Button } from "@/components/ui/button"
import { brl, errMsg, type GameId, type GameProps, type Achievement, type HistoryItem, type Mission, post, type State } from "@/lib/api"
import { isMuted, setMuted, sounds } from "@/lib/sound"
import { cn } from "@/lib/utils"

const GAMES: { id: GameId; name: string; desc: string; Screen: (p: GameProps) => React.ReactNode }[] = [
  { id: "slots", name: "Caça-níquel", desc: "Três rolos, até 250x", Screen: Slots },
  { id: "roulette", name: "Roleta", desc: "Europeia, um zero", Screen: Roulette },
  { id: "blackjack", name: "Blackjack", desc: "Chegue a 21", Screen: Blackjack },
  { id: "dice", name: "Dados", desc: "Menor, sete ou maior", Screen: Dice },
  { id: "crash", name: "Foguete", desc: "Saque antes de explodir", Screen: Crash },
  { id: "hilo", name: "Maior ou Menor", desc: "Acerte e multiplique", Screen: HiLo },
  { id: "baccarat", name: "Bacará", desc: "Jogador, banca ou empate", Screen: Baccarat },
  { id: "poker", name: "Pôquer", desc: "Texas Hold'em com 3 bots", Screen: Poker },
]

// "🔥 3" = 3 wins in a row, "❄️ 2" = 2 losses; history only keeps the last few bets, hence "+".
function streak(h: HistoryItem[]) {
  if (!h.length) return "—"
  const won = (x: HistoryItem) => x.payout > x.amount
  const n = h.findIndex((x) => won(x) !== won(h[0]))
  return `${won(h[0]) ? "🔥" : "❄️"} ${n < 0 ? `${h.length}+` : n}`
}

// Loyalty tiers by total wagered (centavos).
const TIERS = [
  { name: "Bronze", from: 0, color: "#b45309" },
  { name: "Prata", from: 500_00, color: "#94a3b8" },
  { name: "Ouro", from: 2_000_00, color: "#eab308" },
  { name: "Platina", from: 10_000_00, color: "#67e8f9" },
  { name: "Diamante", from: 50_000_00, color: "#c084fc" },
]

function ClubCard({ staked }: { staked: number }) {
  const i = TIERS.findLastIndex((t) => staked >= t.from)
  const tier = TIERS[i]
  const next = TIERS[i + 1]
  const pct = next ? ((staked - tier.from) / (next.from - tier.from)) * 100 : 100
  return (
    <section className="club-card" style={{ "--tier": tier.color } as React.CSSProperties} aria-label={`Clube Rubi: nível ${tier.name}`}>
      <div className="flex items-start justify-between">
        <span className="font-serif text-sm font-bold tracking-[0.3em]">CLUBE RUBI</span>
        <span className="club-chipset" aria-hidden />
      </div>
      <p className="mt-5 font-serif text-2xl font-black" style={{ color: tier.color }}>
        {tier.name.toUpperCase()}
      </p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/40" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: tier.color }} />
      </div>
      <p className="mt-1 text-[11px] text-white/70">{next ? `Faltam ${brl(next.from - staked)} apostados para ${next.name}` : "Nível máximo. A casa é sua."}</p>
    </section>
  )
}

// Sparkline of the balance after each of the recent bets (oldest left).
function BalanceChart({ history }: { history: HistoryItem[] }) {
  const pts = history.filter((h) => h.balance !== undefined).map((h) => h.balance!).reverse()
  if (pts.length < 2) return null
  const lo = Math.min(...pts)
  const hi = Math.max(...pts)
  const x = (i: number) => (i / (pts.length - 1)) * 260
  const y = (v: number) => 70 - ((v - lo) / (hi - lo || 1)) * 60
  const line = pts.map((v, i) => `${x(i)},${y(v)}`).join(" ")
  const up = pts.at(-1)! >= pts[0]
  const color = up ? "#34d399" : "#fb7185"
  return (
    <section className="rounded-xl border border-amber-400/25 bg-black/40 p-4" aria-label={`Saldo nas últimas ${pts.length} apostas: de ${brl(pts[0])} para ${brl(pts.at(-1)!)}`}>
      <h2 className="mb-2 text-center text-sm font-bold tracking-[0.25em] text-amber-300">SALDO</h2>
      <svg viewBox="0 0 260 80" className="w-full" aria-hidden>
        <polygon points={`0,80 ${line} 260,80`} fill={color} opacity="0.15" />
        <polyline points={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
        <circle cx={x(pts.length - 1)} cy={y(pts.at(-1)!)} r="3.5" fill={color} />
      </svg>
      <div className="mt-1 flex justify-between font-mono text-[11px] text-muted-foreground">
        <span>mín {brl(lo)}</span>
        <span>máx {brl(hi)}</span>
      </div>
    </section>
  )
}

// The game with a round in progress (stake already on the table), if any.
function unfinished(s: State): GameId | null {
  if (s.hand && !s.hand.done) return "blackjack"
  if (s.hilo && !s.hilo.done) return "hilo"
  if (s.table?.inHand) return "poker"
  return null
}

function AchievementBoard({ list }: { list: Achievement[] }) {
  const got = list.filter((a) => a.unlocked).length
  return (
    <section className="rounded-xl border border-amber-400/25 bg-black/40 p-4" aria-label={`Conquistas: ${got} de ${list.length}`}>
      <h2 className="mb-3 text-center text-sm font-bold tracking-[0.25em] text-amber-300">
        CONQUISTAS <span className="font-mono text-xs text-muted-foreground">{got}/{list.length}</span>
      </h2>
      <ul className="grid grid-cols-5 gap-2">
        {list.map((a) => (
          <li key={a.id} className={cn("achv", a.unlocked && "achv-on")} title={`${a.name}: ${a.desc}`} aria-label={`${a.name}: ${a.desc}${a.unlocked ? " (conquistada)" : ""}`}>
            <span aria-hidden>{a.unlocked ? a.icon : "🔒"}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function MissionBoard({ missions, onClaim }: { missions: Mission[]; onClaim: (i: number) => void }) {
  return (
    <section className="rounded-xl border border-amber-400/25 bg-black/40 p-4" aria-label="Missões do dia">
      <h2 className="mb-3 text-center text-sm font-bold tracking-[0.25em] text-amber-300">MISSÕES DO DIA</h2>
      <ul className="space-y-3">
        {missions.map((m, i) => {
          const done = m.progress >= m.goal
          return (
            <li key={i} className={cn("rounded-lg bg-white/5 p-2.5", m.claimed && "opacity-50")}>
              <div className="flex items-start justify-between gap-2 text-sm">
                <span>
                  {m.game && <span aria-hidden>{GAME_ICON[m.game as GameId]} </span>}
                  {m.text}
                </span>
                <span className="shrink-0 font-mono text-xs font-bold text-amber-300">+{brl(m.reward)}</span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/50" role="progressbar" aria-valuenow={m.progress} aria-valuemin={0} aria-valuemax={m.goal} aria-label={m.text}>
                  <div className={cn("h-full rounded-full", done ? "bg-emerald-400" : "bg-amber-400")} style={{ width: `${(m.progress / m.goal) * 100}%` }} />
                </div>
                {m.claimed ? (
                  <span className="text-xs font-bold text-emerald-300">✓ resgatada</span>
                ) : done ? (
                  <button onClick={() => onClaim(i)} className="rounded bg-emerald-500 px-2 py-0.5 text-xs font-black text-emerald-950 hover:bg-emerald-400">
                    Resgatar
                  </button>
                ) : (
                  <span className="font-mono text-xs text-muted-foreground">
                    {m.progress}/{m.goal}
                  </span>
                )}
              </div>
            </li>
          )
        })}
      </ul>
      <p className="mt-2 text-center text-[11px] text-muted-foreground">Novas missões todo dia à meia-noite.</p>
    </section>
  )
}

const confettiColors = ["#f59e0b", "#10b981", "#3b82f6", "#ef4444", "#a855f7", "#fde047"]

function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 80 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.6,
        duration: 2 + Math.random() * 1.5,
        color: confettiColors[i % confettiColors.length],
        drift: (Math.random() - 0.5) * 200,
      })),
    [],
  )
  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden" aria-hidden>
      {pieces.map((p, i) => (
        <span
          key={i}
          className="confetti"
          style={{ left: `${p.left}%`, background: p.color, animationDelay: `${p.delay}s`, animationDuration: `${p.duration}s`, "--drift": `${p.drift}px` } as React.CSSProperties}
        />
      ))}
    </div>
  )
}

export default function App() {
  const [state, setState] = useState<State | null>(null)
  const [game, setGame] = useState<GameId>(() => (location.hash.slice(1) || localStorage.getItem("game") || "slots") as GameId) // #roulette links straight to a game
  const [busy, setBusy] = useState(false)
  const [muted, setMutedState] = useState(isMuted())
  const [confetti, setConfetti] = useState(0) // bump to fire a new burst
  const [notices, setNotices] = useState<{ id: number; text: string; bad?: boolean }[]>([])
  const [offline, setOffline] = useState(false)
  const [bigWin, setBigWin] = useState<{ amount: number; mult: number } | null>(null)
  const closeBigWin = useCallback(() => setBigWin(null), [])
  const seen = useRef<Set<string> | null>(null) // achievements already unlocked when we last looked

  useEffect(() => {
    fetch("/api/state")
      .then((r) => r.json())
      .then((s: State) => {
        setState(s)
        const open = unfinished(s)
        if (open) setGame(open) // back to the unfinished round
      })
      .catch(() => setOffline(true))
  }, [])

  // Space = main play button of the open game; letters = buttons marked data-key (blackjack P/S/D).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // a focused button already handles Space itself; typing in a field shouldn't trigger anything
      const t = e.target as HTMLElement
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || t.closest("input, textarea, select") || (e.key === " " && t.closest("button"))) return
      if (/^[1-8]$/.test(e.key)) { // number keys pick a game in the lobby
        document.querySelectorAll<HTMLButtonElement>('nav[aria-label="Jogos"] button')[Number(e.key) - 1]?.click()
        return
      }
      const sel = e.key === " " ? "[data-play]" : `[data-key="${e.key.toLowerCase().replace(/[^a-z]/g, "")}"]`
      const btn = document.querySelector<HTMLButtonElement>(`${sel}:not(:disabled)`)
      if (btn) (e.preventDefault(), btn.click())
    }
    addEventListener("keydown", onKey)
    return () => removeEventListener("keydown", onKey)
  }, [])

  // announce achievements unlocked since the last state (not the ones loaded at startup)
  useEffect(() => {
    if (!state) return
    const now = new Set(state.achievements.filter((a) => a.unlocked).map((a) => a.id))
    if (seen.current) {
      const fresh = state.achievements.filter((a) => now.has(a.id) && !seen.current!.has(a.id))
      fresh.forEach((a) => notify(`🏆 Conquista: ${a.icon} ${a.name}!`))
      if (fresh.length) sounds.jackpot()
    }
    seen.current = now
  }, [state])

  function notify(text: string, bad = false) {
    const id = Date.now() + Math.random()
    setNotices((n) => [...n, { id, text, bad }])
    setTimeout(() => setNotices((n) => n.filter((x) => x.id !== id)), 4000)
  }

  function onResult(s: State, amount?: number, payout?: number) {
    setState(s)
    if (amount === undefined || payout === undefined) return
    if (payout > amount) {
      if (payout >= amount * 10 && payout >= 10_00) {
        sounds.jackpot()
        setConfetti((c) => c + 1)
        setBigWin({ amount: payout, mult: payout / amount })
      } else sounds.win()
    } else if (payout < amount) sounds.lose()
  }

  async function simple(path: string, msg: string) {
    try {
      const { state } = await post(path)
      setState(state)
      sounds.coin()
      notify(msg)
    } catch (e) {
      notify(errMsg(e), true)
    }
  }

  async function openGift() {
    try {
      const { result, state } = await post<number>("/api/bonus")
      setState(state)
      if (result >= 50_00) (sounds.jackpot(), setConfetti((c) => c + 1))
      else sounds.coin()
      notify(`🎁 Presente do dia: +${brl(result)}!`)
    } catch (e) {
      notify(errMsg(e), true)
    }
  }

  async function claimMission(index: number) {
    try {
      const { result, state } = await post<number>("/api/missions/claim", { index })
      setState(state)
      sounds.coin()
      notify(`🏅 Missão concluída: +${brl(result)}!`)
    } catch (e) {
      notify(errMsg(e), true)
    }
  }

  function choose(id: GameId) {
    setGame(id)
    localStorage.setItem("game", id)
  }

  const current = GAMES.find((g) => g.id === game) ?? GAMES[0]
  const stats = state?.stats
  const profit = stats ? stats.returned - stats.staked : 0
  // a blackjack hand in progress keeps you at the table
  const locked = busy || (state != null && unfinished(state) !== null)

  return (
    <div className="mx-auto max-w-6xl px-3 pb-10 sm:px-5">
      {confetti > 0 && <Confetti key={confetti} />}
      {bigWin && <BigWin amount={bigWin.amount} mult={bigWin.mult} onClose={closeBigWin} />}

      <div className="fixed right-4 bottom-4 z-50 space-y-2" aria-live="polite">
        {notices.map((n) => (
          <div key={n.id} className={`animate-in slide-in-from-right fade-in rounded-lg border bg-card p-3 font-semibold shadow-xl ${n.bad ? "border-rose-500/60" : "border-amber-400/60"}`}>
            {n.text}
          </div>
        ))}
      </div>

      <header className="top-bar flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3 sm:sticky sm:top-0 sm:z-40">
        <div>
          <h1 className="flex items-center gap-3">
            <img src="/favicon.svg" alt="" className="size-10 motion-safe:animate-[spin_12s_linear_infinite] sm:size-12" />
            <span>
              <span className="neon block font-serif text-3xl sm:text-4xl">RUBI ROYALE</span>
              <span className="block text-[10px] tracking-[0.5em] text-amber-300/80">GRAN CASSINO · EST. 1958</span>
            </span>
          </h1>
          <div className="deco-line mt-1" />
        </div>
        <div className="flex items-center gap-3">
          <SessionClock onRemind={(m) => notify(`⏱ Você está jogando há ${m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? String(m % 60).padStart(2, "0") : ""}` : `${m} min`}. Que tal uma pausa para uma água?`)} />
          <button
            onClick={() => {
              setMuted(!muted)
              setMutedState(!muted)
            }}
            className="sound-btn"
            aria-label={muted ? "Ligar som" : "Desligar som"}
            aria-pressed={!muted}
          >
            <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
              <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
              {muted ? (
                <path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              ) : (
                <path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              )}
            </svg>
          </button>
          {state?.bonusAvailable && !busy && (
            <button onClick={openGift} className="gift-btn" aria-label="Abrir presente do dia">
              🎁 <span className="hidden sm:inline">Presente do dia</span>
            </button>
          )}
          <div className="banknote" aria-label={`Saldo: ${state ? brl(state.balance) : "carregando"}`}>
            <span className="banknote-seal" aria-hidden>
              💰
            </span>
            <span className="banknote-value">{state ? <AnimatedBalance value={state.balance} /> : "—"}</span>
          </div>
          {state && state.balance < 1_00 && !locked && (
            <Button size="sm" variant="outline" onClick={() => simple("/api/reset", "Saldo recarregado para R$ 100,00")}>
              Recarregar
            </Button>
          )}
        </div>
      </header>

      {state && <Ticker state={state} />}

      {/* lobby: a swipeable strip on phones, a grid from tablets up */}
      <nav className="-mx-3 mt-4 flex snap-x gap-2 overflow-x-auto px-3 pb-2 sm:mx-0 sm:grid sm:grid-cols-4 sm:gap-3 sm:overflow-visible sm:px-0" aria-label="Jogos">
        {GAMES.map((g) => (
          <button key={g.id} className={`game-tile tile-${g.id} min-w-[42%] shrink-0 snap-start sm:min-w-0`} aria-pressed={g.id === game} disabled={locked && g.id !== game} onClick={() => choose(g.id)}>
            <span className="absolute -right-1 -bottom-3 text-5xl opacity-25" aria-hidden>
              {GAME_ICON[g.id]}
            </span>
            <span className="flex items-center gap-2 font-black tracking-wide">
              <span className="text-xl" aria-hidden>
                {GAME_ICON[g.id]}
              </span>
              {g.name}
            </span>
            <span className="mt-0.5 block text-xs text-white/70">{g.desc}</span>
            <kbd className="kbd absolute top-2 right-2 hidden opacity-60 sm:inline-block" aria-hidden>
              {GAMES.indexOf(g) + 1}
            </kbd>
          </button>
        ))}
      </nav>
      <p className="mt-2 hidden text-center text-xs text-muted-foreground sm:block">
        Atalhos: <kbd className="kbd">1</kbd>–<kbd className="kbd">8</kbd> trocam de jogo · <kbd className="kbd">Espaço</kbd> joga · <kbd className="kbd">?</kbd> regras · as outras teclas aparecem nos botões
      </p>

      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_300px]">
        <main className="min-w-0">
          <div className="mb-4 flex items-center justify-between gap-3 border-b border-amber-400/15 pb-2">
            <h2 className="flex items-center gap-2 font-serif text-xl font-black tracking-wide text-amber-100">
              <span aria-hidden>{GAME_ICON[current.id]}</span>
              {current.name}
            </h2>
            <RulesButton game={current.id} title={`${GAME_ICON[current.id]} ${current.name}`} />
          </div>
          {offline ? (
            <p className="rounded-lg border border-rose-500/50 bg-rose-950/40 p-6 text-center">
              Servidor fora do ar. Rode <code className="font-mono">go run .</code> na pasta <code className="font-mono">backend</code>.
            </p>
          ) : !state ? (
            <p className="p-6 text-center text-muted-foreground">Abrindo as portas...</p>
          ) : (
            <current.Screen key={current.id} state={state} busy={busy} setBusy={setBusy} onResult={onResult} onError={(m) => notify(m, true)} />
          )}
        </main>

        <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          {state && stats && (
            <SideTabs
              tabs={[
                {
                  id: "noite",
                  label: "Noite",
                  content: (
                    <>
                      <ClubCard staked={stats.staked} />
                      <section className="rounded-xl border border-amber-400/25 bg-black/40 p-4" aria-label="Estatísticas">
                        <dl className="grid grid-cols-2 gap-3 text-center">
                          {[
                            ["Apostas", String(stats.bets)],
                            ["Vitórias", String(stats.wins)],
                            ["Acerto", stats.bets ? `${Math.round((stats.wins / stats.bets) * 100)}%` : "—"],
                            ["Sequência", streak(stats.history ?? [])],
                            ["Maior prêmio", brl(stats.bestWin)],
                            ["Lucro", (profit > 0 ? "+" : "") + brl(profit)],
                          ].map(([k, v]) => (
                            <div key={k} className="rounded-lg bg-white/5 p-2">
                              <dt className="text-xs text-muted-foreground">{k}</dt>
                              <dd className={`font-mono font-bold ${k === "Lucro" ? (profit >= 0 ? "text-emerald-400" : "text-rose-400") : ""}`}>{v}</dd>
                            </div>
                          ))}
                        </dl>
                      </section>
                      <BalanceChart history={stats.history ?? []} />
                    </>
                  ),
                },
                {
                  id: "missoes",
                  label: "Missões",
                  badge: state.missions.filter((m) => m.progress >= m.goal && !m.claimed).length,
                  content: <MissionBoard missions={state.missions} onClaim={claimMission} />,
                },
                { id: "historico", label: "Jogadas", content: <HistoryBoard history={stats.history ?? []} /> },
                {
                  id: "conquistas",
                  label: "Troféus",
                  content: <AchievementBoard list={state.achievements} />,
                },
              ]}
            />
          )}
        </aside>
      </div>
    </div>
  )
}
