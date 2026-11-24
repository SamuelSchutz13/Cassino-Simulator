import { useEffect, useState } from "react"
import { brl } from "@/lib/api"
import { sounds } from "@/lib/sound"
import { cn } from "@/lib/utils"

// Bet amount that each game remembers between visits.
export function useBet(game: string, initial: number) {
  const key = `bet:${game}`
  const [amount, setAmount] = useState(() => Number(localStorage.getItem(key)) || initial)
  useEffect(() => localStorage.setItem(key, String(amount)), [key, amount])
  return [amount, setAmount] as const
}

// chip values in centavos
export const CHIPS = [
  { value: 1_00, color: "#2563eb", label: "1" },
  { value: 5_00, color: "#dc2626", label: "5" },
  { value: 10_00, color: "#16a34a", label: "10" },
  { value: 25_00, color: "#7c3aed", label: "25" },
  { value: 100_00, color: "#18181b", label: "100" },
]

export function Chip({ value, small }: { value: number; small?: boolean }) {
  const c = [...CHIPS].reverse().find((x) => value >= x.value) ?? CHIPS[0]
  return (
    <span className={cn("chip", small && "chip-sm")} style={{ background: c.color }} aria-hidden>
      {small ? "" : c.label}
    </span>
  )
}

// Stake builder: each chip adds to the bet; also clear, double and all-in.
export function BetControl({ amount, setAmount, max, disabled }: { amount: number; setAmount: (n: number) => void; max: number; disabled?: boolean }) {
  const set = (n: number) => {
    sounds.chip()
    setAmount(Math.max(0, Math.min(n, max)))
  }
  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      <div className="flex gap-2" role="group" aria-label="Fichas">
        {CHIPS.map((c) => (
          <button
            key={c.value}
            className="chip"
            style={{ background: c.color }}
            disabled={disabled || amount + c.value > max}
            onClick={() => set(amount + c.value)}
            aria-label={`Adicionar ${brl(c.value)}`}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <span className="min-w-28 rounded-md border border-amber-400/40 bg-black/50 px-3 py-1.5 text-center font-mono text-lg font-black text-amber-300" aria-live="polite">
          {brl(amount)}
        </span>
        <div className="flex flex-col gap-1 text-xs font-bold">
          <button className="rounded bg-white/10 px-2 py-0.5 hover:bg-white/20 disabled:opacity-40" disabled={disabled || amount === 0} onClick={() => set(0)}>
            Limpar
          </button>
          <button className="rounded bg-white/10 px-2 py-0.5 hover:bg-white/20 disabled:opacity-40" disabled={disabled || amount === 0 || amount * 2 > max} onClick={() => set(amount * 2)}>
            Dobrar
          </button>
          <button className="rounded bg-amber-500/80 px-2 py-0.5 text-amber-950 hover:bg-amber-400 disabled:opacity-40" disabled={disabled || max === 0} onClick={() => set(max)}>
            Tudo
          </button>
        </div>
      </div>
    </div>
  )
}

// Picks which chip a click on the table places (roulette).
export function ChipPicker({ selected, onSelect, disabled }: { selected: number; onSelect: (v: number) => void; disabled?: boolean }) {
  return (
    <div className="flex gap-2" role="group" aria-label="Escolha a ficha">
      {CHIPS.map((c) => (
        <button
          key={c.value}
          className="chip"
          style={{ background: c.color }}
          aria-pressed={selected === c.value}
          aria-label={`Ficha de ${brl(c.value)}`}
          disabled={disabled}
          onClick={() => {
            sounds.chip()
            onSelect(c.value)
          }}
        >
          {c.label}
        </button>
      ))}
    </div>
  )
}
