export type GameId = "slots" | "roulette" | "blackjack" | "dice" | "crash" | "hilo" | "baccarat" | "poker"
export type HistoryItem = { game: GameId; bet: string; amount: number; payout: number; balance?: number } // balance missing on old saves
export type Stats = { bets: number; wins: number; staked: number; returned: number; bestWin: number; history: HistoryItem[] | null }
export type Hand = {
  bet: number
  player: number[]
  dealer: number[] // -1 = hole card face down
  playerTotal: number
  dealerTotal: number
  done: boolean
  outcome: "" | "blackjack" | "win" | "push" | "lose" | "bust"
  payout: number
  canDouble: boolean
}
export type State = { balance: number; stats: Stats; hand: Hand | null; bonusAvailable: boolean; jackpot: number
  hilo: HiLo | null
  table: Table | null
  missions: Mission[]
  achievements: Achievement[]
}
export type HiLo = { bet: number; cards: number[]; mult: number; done: boolean; payout: number }
export type Seat = {
  name: string
  avatar: string
  style: string // bots: cauteloso, solto, agressivo; "" = you
  stack: number
  hole: number[] | null // -1 = face down
  bet: number
  total: number
  folded: boolean
  allIn: boolean
  last: string
  won: number
  best: string
}
export type Table = {
  seats: Seat[] // 0 = you
  board: number[] | null
  dealer: number
  street: number
  toAct: number
  curBet: number
  inHand: boolean
  showdown: boolean
  log: string[] | null
  hands: number
  pot: number
  toCall: number
  minRaiseTo: number
  maxRaiseTo: number
  canRaise: boolean
  myHand: string
}
export type Achievement = { id: string; icon: string; name: string; desc: string; unlocked: boolean }
export type Mission = { text: string; game: string; goal: number; progress: number; reward: number; claimed: boolean }

// What every game screen receives from the App.
export type GameProps = {
  state: State
  busy: boolean
  setBusy: (b: boolean) => void
  onResult: (s: State, amount?: number, payout?: number) => void // amount/payout only when a bet was settled
  onError: (msg: string) => void
}

export const brl = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })

// POSTs to the server, which decides every outcome. Throws Error with a message ready to show.
export async function post<T = null>(path: string, body: object = {}): Promise<{ result: T; state: State }> {
  let res: Response
  try {
    res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  } catch {
    throw new Error("Servidor fora do ar.")
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? "Erro inesperado.")
  return data
}

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))
