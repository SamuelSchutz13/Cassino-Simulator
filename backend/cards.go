package main

import "fmt"

// Cards everywhere are 0–51 like blackjack: rank = card % 13 (0 = A … 12 = K), suit = card / 13.

// ---------- Maior ou Menor (Hi-Lo) ----------
// A card is shown; guess if the next is higher or lower (A low, K high, same rank loses).
// Each right guess multiplies the prize by 0.97/chance; cash out any time after the first.
// Each draw is a fresh random card (infinite deck), so the chances shown are exact.
type HiLo struct {
	Bet    int     `json:"bet"`
	Cards  []int   `json:"cards"`
	Mult   float64 `json:"mult"`
	Done   bool    `json:"done"`
	Payout int     `json:"payout"`
}

const hiloMaxMult = 1000 // auto cash-out here

type pickReq struct {
	Pick string `json:"pick"`
}

func hiloChance(card int, pick string) float64 {
	if pick == "maior" {
		return float64(12-card%13) / 13
	}
	return float64(card%13) / 13
}

func (c *casino) hiloStart(req amountReq) (any, string) {
	if c.HiLo != nil && !c.HiLo.Done {
		return nil, "termine a rodada atual primeiro"
	}
	if msg := c.take(req.Amount); msg != "" {
		return nil, msg
	}
	c.HiLo = &HiLo{Bet: req.Amount, Cards: []int{c.rng.IntN(52)}, Mult: 1}
	return nil, ""
}

func (c *casino) hiloActive() (*HiLo, string) {
	if c.HiLo == nil || c.HiLo.Done {
		return nil, "nenhuma rodada em jogo"
	}
	return c.HiLo, ""
}

func (c *casino) hiloGuess(req pickReq) (any, string) {
	h, msg := c.hiloActive()
	if msg != "" {
		return nil, msg
	}
	if req.Pick != "maior" && req.Pick != "menor" {
		return nil, "aposta inválida"
	}
	last := h.Cards[len(h.Cards)-1]
	p := hiloChance(last, req.Pick)
	if p == 0 {
		return nil, "impossível: escolha o outro lado"
	}
	next := c.rng.IntN(52)
	h.Cards = append(h.Cards, next)
	if (req.Pick == "maior" && next%13 > last%13) || (req.Pick == "menor" && next%13 < last%13) {
		h.Mult *= 0.97 / p
		if len(h.Cards) > 5 {
			c.unlock("hilo5")
		}
		if h.Mult >= hiloMaxMult {
			c.finishHiLo(len(h.Cards) - 1)
		}
		return nil, ""
	}
	h.Mult = 0
	c.finishHiLo(len(h.Cards) - 2)
	return nil, ""
}

func (c *casino) hiloCashout() (any, string) {
	h, msg := c.hiloActive()
	if msg != "" {
		return nil, msg
	}
	if len(h.Cards) < 2 {
		return nil, "acerte pelo menos uma vez antes de sacar"
	}
	c.finishHiLo(len(h.Cards) - 1)
	return nil, ""
}

// finishHiLo pays Bet×Mult (Mult is 0 after a miss). Caller holds c.mu.
func (c *casino) finishHiLo(hits int) {
	h := c.HiLo
	h.Done = true
	h.Payout = payout(h.Bet, h.Mult)
	c.settle("hilo", fmt.Sprintf("%d acerto(s) · %.2fx", hits, h.Mult), h.Bet, h.Payout)
}

// ---------- Bacará (Punto Banco) ----------
// One fresh deck per coup, standard drawing tableau. Player 1:1, banker 0.95:1, tie 8:1;
// a tie returns player/banker bets.
var baccaratMult = map[string]float64{"jogador": 2, "banca": 1.95, "empate": 9}

type baccaratResult struct {
	Player      []int  `json:"player"`
	Banker      []int  `json:"banker"`
	PlayerTotal int    `json:"playerTotal"`
	BankerTotal int    `json:"bankerTotal"`
	Winner      string `json:"winner"` // jogador, banca or empate
	Payout      int    `json:"payout"`
}

func bacValue(card int) int {
	if r := card % 13; r < 9 {
		return r + 1
	}
	return 0
}

func bacTotal(cards []int) int {
	t := 0
	for _, c := range cards {
		t += bacValue(c)
	}
	return t % 10
}

func bacDeal(deck []int) (player, banker []int) {
	player, banker, deck = []int{deck[0], deck[2]}, []int{deck[1], deck[3]}, deck[4:]
	pt, bt := bacTotal(player), bacTotal(banker)
	if pt >= 8 || bt >= 8 { // natural
		return
	}
	draws := bt <= 5 // banker's rule when the player stood
	if pt <= 5 {
		player, deck = append(player, deck[0]), deck[1:]
		v := bacValue(player[2])
		switch bt {
		case 3:
			draws = v != 8
		case 4:
			draws = v >= 2 && v <= 7
		case 5:
			draws = v >= 4 && v <= 7
		case 6:
			draws = v == 6 || v == 7
		default:
			draws = bt <= 2
		}
	}
	if draws {
		banker = append(banker, deck[0])
	}
	return
}

func (c *casino) playBaccarat(req diceReq) (any, string) {
	mult, ok := baccaratMult[req.Pick]
	if !ok {
		return nil, "aposta inválida"
	}
	if msg := c.take(req.Amount); msg != "" {
		return nil, msg
	}
	res := baccaratResult{}
	res.Player, res.Banker = bacDeal(c.rng.Perm(52))
	res.PlayerTotal, res.BankerTotal = bacTotal(res.Player), bacTotal(res.Banker)
	switch {
	case res.PlayerTotal > res.BankerTotal:
		res.Winner = "jogador"
	case res.BankerTotal > res.PlayerTotal:
		res.Winner = "banca"
	default:
		res.Winner = "empate"
	}
	if res.Winner == req.Pick {
		res.Payout = payout(req.Amount, mult)
	} else if res.Winner == "empate" {
		res.Payout = req.Amount
	}
	label := map[string]string{"jogador": "Jogador", "banca": "Banca", "empate": "Empate"}[req.Pick]
	c.settle("baccarat", fmt.Sprintf("%s · %d x %d", label, res.PlayerTotal, res.BankerTotal), req.Amount, res.Payout)
	return res, ""
}
