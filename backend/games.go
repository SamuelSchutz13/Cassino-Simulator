package main

import (
	"fmt"
	"slices"
)

// ---------- Caça-níquel ----------
// Symbols, rarest last: cereja, limão, sino, estrela, diamante, sete.
// Three equal pay triplePay; the first two equal pay pairPay. Return to player ≈ 95.3% (see slotsRTP test).
var (
	symbolWeight = []int{6, 5, 4, 3, 2, 1}
	triplePay    = []float64{8, 10, 20, 40, 100, 250}
	pairPay      = []float64{1, 1, 2, 3, 4, 8}
)

type amountReq struct {
	Amount int `json:"amount"`
}

type slotsResult struct {
	Reels   [3]int  `json:"reels"`
	Mult    float64 `json:"mult"`
	Payout  int     `json:"payout"`
	Jackpot int     `json:"jackpot"` // progressive pot won (included in payout), 0 if none
}

// jackpotFor feeds 2% of every spin into the pot and pays the whole pot on 7-7-7. Caller holds c.mu.
func (c *casino) jackpotFor(r [3]int, amount int) int {
	c.Jackpot = max(c.Jackpot, jackpotSeed) + amount/50
	if r != [3]int{5, 5, 5} {
		return 0
	}
	won := c.Jackpot
	c.Jackpot = jackpotSeed
	return won
}

func slotsMult(r [3]int) float64 {
	switch {
	case r[0] == r[1] && r[1] == r[2]:
		return triplePay[r[0]]
	case r[0] == r[1]:
		return pairPay[r[0]]
	}
	return 0
}

func (c *casino) spinReel() int {
	n := c.rng.IntN(21) // sum of symbolWeight
	for i, w := range symbolWeight {
		if n < w {
			return i
		}
		n -= w
	}
	panic("unreachable")
}

func (c *casino) playSlots(req amountReq) (any, string) {
	if msg := c.take(req.Amount); msg != "" {
		return nil, msg
	}
	res := slotsResult{Reels: [3]int{c.spinReel(), c.spinReel(), c.spinReel()}}
	res.Mult = slotsMult(res.Reels)
	res.Jackpot = c.jackpotFor(res.Reels, req.Amount)
	res.Payout = payout(req.Amount, res.Mult) + res.Jackpot
	if res.Jackpot > 0 {
		c.unlock("jackpot")
	}
	c.settle("slots", "Giro", req.Amount, res.Payout)
	return res, ""
}

// ---------- Roleta (europeia, um zero) ----------
var redNumbers = []int{1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36}

type rouletteBet struct {
	Kind   string `json:"kind"`   // numero, vermelho, preto, par, impar, baixo, alto, duzia
	Number int    `json:"number"` // the number (numero) or 1–3 (duzia)
	Amount int    `json:"amount"`
}

type rouletteReq struct {
	Bets []rouletteBet `json:"bets"`
}

type rouletteResult struct {
	Number int    `json:"number"`
	Payout int    `json:"payout"`
	Won    []bool `json:"won"` // per bet, same order as the request
}

// returned per unit staked when the bet wins (stake included)
var rouletteMult = map[string]float64{"numero": 36, "vermelho": 2, "preto": 2, "par": 2, "impar": 2, "baixo": 2, "alto": 2, "duzia": 3}

func rouletteWins(b rouletteBet, n int) bool {
	if n == 0 {
		return b.Kind == "numero" && b.Number == 0
	}
	switch b.Kind {
	case "numero":
		return b.Number == n
	case "vermelho":
		return slices.Contains(redNumbers, n)
	case "preto":
		return !slices.Contains(redNumbers, n)
	case "par":
		return n%2 == 0
	case "impar":
		return n%2 == 1
	case "baixo":
		return n <= 18
	case "alto":
		return n >= 19
	case "duzia":
		return (n-1)/12+1 == b.Number
	}
	return false
}

func (c *casino) playRoulette(req rouletteReq) (any, string) {
	if len(req.Bets) == 0 || len(req.Bets) > 60 {
		return nil, "faça de 1 a 60 apostas"
	}
	total := 0
	for _, b := range req.Bets {
		if _, ok := rouletteMult[b.Kind]; !ok {
			return nil, "aposta inválida"
		}
		if (b.Kind == "numero" && (b.Number < 0 || b.Number > 36)) || (b.Kind == "duzia" && (b.Number < 1 || b.Number > 3)) {
			return nil, "número inválido"
		}
		if b.Amount <= 0 || b.Amount > c.Balance {
			return nil, "valor de aposta inválido"
		}
		total += b.Amount
	}
	if msg := c.take(total); msg != "" {
		return nil, msg
	}
	res := rouletteResult{Number: c.rng.IntN(37)}
	for _, b := range req.Bets {
		won := rouletteWins(b, res.Number)
		res.Won = append(res.Won, won)
		if won {
			res.Payout += payout(b.Amount, rouletteMult[b.Kind])
			if b.Kind == "numero" && b.Number == 0 {
				c.unlock("zero")
			}
		}
	}
	c.settle("roulette", fmt.Sprintf("Caiu %d · %d ficha(s)", res.Number, len(req.Bets)), total, res.Payout)
	return res, ""
}

// ---------- Dados ----------
// Two dice; bet the sum is under 7, exactly 7 or over 7. Multipliers ≈ 0.96 / probability.
var diceMult = map[string]float64{"menor": 2.3, "sete": 5.8, "maior": 2.3}
var diceLabel = map[string]string{"menor": "Menor que 7", "sete": "Sete", "maior": "Maior que 7"}

type diceReq struct {
	Amount int    `json:"amount"`
	Pick   string `json:"pick"`
}

type diceResult struct {
	Dice   [2]int `json:"dice"`
	Payout int    `json:"payout"`
}

func diceWins(pick string, sum int) bool {
	return (pick == "menor" && sum < 7) || (pick == "sete" && sum == 7) || (pick == "maior" && sum > 7)
}

func (c *casino) playDice(req diceReq) (any, string) {
	mult, ok := diceMult[req.Pick]
	if !ok {
		return nil, "aposta inválida"
	}
	if msg := c.take(req.Amount); msg != "" {
		return nil, msg
	}
	res := diceResult{Dice: [2]int{c.rng.IntN(6) + 1, c.rng.IntN(6) + 1}}
	if diceWins(req.Pick, res.Dice[0]+res.Dice[1]) {
		res.Payout = payout(req.Amount, mult)
	}
	c.settle("dice", fmt.Sprintf("%s · deu %d", diceLabel[req.Pick], res.Dice[0]+res.Dice[1]), req.Amount, res.Payout)
	return res, ""
}

// ---------- Foguete (crash) ----------
// The rocket climbs until it explodes at a random multiplier; the player picks a target beforehand
// and wins amount×target if the rocket reaches it. P(crash ≥ t) = 0.96/t, so every target returns 96%.
// Multipliers are in hundredths (250 = 2,50x).
type crashReq struct {
	Amount int `json:"amount"`
	Target int `json:"target"`
}

type crashResult struct {
	Crash  int `json:"crash"`
	Payout int `json:"payout"`
}

func (c *casino) crashPoint() int {
	u := 1 - c.rng.Float64() // (0, 1]
	return min(max(int(96/u), 100), 1_000_000)
}

func (c *casino) playCrash(req crashReq) (any, string) {
	if req.Target < 101 || req.Target > 10_000 {
		return nil, "alvo deve ser de 1,01x a 100x"
	}
	if msg := c.take(req.Amount); msg != "" {
		return nil, msg
	}
	res := crashResult{Crash: c.crashPoint()}
	if res.Crash >= req.Target {
		res.Payout = payout(req.Amount, float64(req.Target)/100)
		if req.Target >= 1000 {
			c.unlock("foguete")
		}
	}
	c.settle("crash", fmt.Sprintf("Alvo %.2fx · explodiu %.2fx", float64(req.Target)/100, float64(res.Crash)/100), req.Amount, res.Payout)
	return res, ""
}
