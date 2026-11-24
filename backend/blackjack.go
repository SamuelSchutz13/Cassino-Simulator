package main

import "fmt"

// Blackjack: one fresh 52-card deck per hand, dealer stands on all 17s, blackjack pays 3:2,
// double down on the first two cards. shortcut: no split or insurance; add them if players ask.

// Cards are 0–51: rank = card % 13 (0 = A, 1–9 = 2–10, 10–12 = J Q K), suit = card / 13.
type Hand struct {
	Bet     int    `json:"bet"`
	Player  []int  `json:"player"`
	Dealer  []int  `json:"dealer"`
	Deck    []int  `json:"deck"`
	Done    bool   `json:"done"`
	Outcome string `json:"outcome"` // blackjack, win, push, lose, bust (when Done)
	Payout  int    `json:"payout"`
}

// publicHand is what the browser sees: no deck, and the dealer's hole card hidden (-1) until the end.
type publicHand struct {
	Bet         int    `json:"bet"`
	Player      []int  `json:"player"`
	Dealer      []int  `json:"dealer"`
	PlayerTotal int    `json:"playerTotal"`
	DealerTotal int    `json:"dealerTotal"` // visible cards only
	Done        bool   `json:"done"`
	Outcome     string `json:"outcome"`
	Payout      int    `json:"payout"`
	CanDouble   bool   `json:"canDouble"`
}

func (h *Hand) public() *publicHand {
	if h == nil {
		return nil
	}
	p := &publicHand{Bet: h.Bet, Player: h.Player, Dealer: h.Dealer, Done: h.Done, Outcome: h.Outcome, Payout: h.Payout, CanDouble: len(h.Player) == 2 && !h.Done}
	if !h.Done {
		p.Dealer = []int{h.Dealer[0], -1}
	}
	p.PlayerTotal, _ = handValue(h.Player)
	p.DealerTotal, _ = handValue(p.Dealer)
	return p
}

// handValue counts aces as 11 when that doesn't bust; soft reports an ace still counted as 11. -1 cards are skipped.
func handValue(cards []int) (total int, soft bool) {
	aces := 0
	for _, c := range cards {
		if c < 0 {
			continue
		}
		switch r := c % 13; {
		case r == 0:
			aces++
			total++
		case r >= 9:
			total += 10
		default:
			total += r + 1
		}
	}
	if aces > 0 && total+10 <= 21 {
		return total + 10, true
	}
	return total, false
}

func isBlackjack(cards []int) bool { t, _ := handValue(cards); return len(cards) == 2 && t == 21 }

func (h *Hand) draw() int {
	card := h.Deck[0]
	h.Deck = h.Deck[1:]
	return card
}

func (c *casino) deal(req amountReq) (any, string) {
	if c.Hand != nil && !c.Hand.Done {
		return nil, "termine a mão atual primeiro"
	}
	if msg := c.take(req.Amount); msg != "" {
		return nil, msg
	}
	h := &Hand{Bet: req.Amount, Deck: c.rng.Perm(52)}
	h.Player = []int{h.draw(), h.draw()}
	h.Dealer = []int{h.draw(), h.draw()}
	c.Hand = h
	if isBlackjack(h.Player) || isBlackjack(h.Dealer) {
		c.finishHand()
	}
	return nil, ""
}

func (c *casino) activeHand() (*Hand, string) {
	if c.Hand == nil || c.Hand.Done {
		return nil, "nenhuma mão em jogo"
	}
	return c.Hand, ""
}

func (c *casino) hit() (any, string) {
	h, msg := c.activeHand()
	if msg != "" {
		return nil, msg
	}
	h.Player = append(h.Player, h.draw())
	if t, _ := handValue(h.Player); t >= 21 {
		c.finishHand()
	}
	return nil, ""
}

func (c *casino) stand() (any, string) {
	if _, msg := c.activeHand(); msg != "" {
		return nil, msg
	}
	c.finishHand()
	return nil, ""
}

func (c *casino) double() (any, string) {
	h, msg := c.activeHand()
	if msg != "" {
		return nil, msg
	}
	if len(h.Player) != 2 {
		return nil, "só dá pra dobrar nas duas primeiras cartas"
	}
	if msg := c.take(h.Bet); msg != "" {
		return nil, "saldo insuficiente para dobrar"
	}
	h.Bet *= 2
	h.Player = append(h.Player, h.draw())
	c.finishHand()
	return nil, ""
}

// finishHand plays the dealer (unless the player busted or someone has blackjack) and pays. Caller holds c.mu.
func (c *casino) finishHand() {
	h := c.Hand
	pt, _ := handValue(h.Player)
	pbj, dbj := isBlackjack(h.Player), isBlackjack(h.Dealer)
	if pt <= 21 && !pbj && !dbj {
		for t, _ := handValue(h.Dealer); t < 17; t, _ = handValue(h.Dealer) {
			h.Dealer = append(h.Dealer, h.draw())
		}
	}
	dt, _ := handValue(h.Dealer)
	mult := 0.0
	switch {
	case pt > 21:
		h.Outcome = "bust"
	case pbj && dbj:
		h.Outcome, mult = "push", 1
	case pbj:
		h.Outcome, mult = "blackjack", 2.5
	case dbj:
		h.Outcome = "lose"
	case dt > 21 || pt > dt:
		h.Outcome, mult = "win", 2
	case pt == dt:
		h.Outcome, mult = "push", 1
	default:
		h.Outcome = "lose"
	}
	h.Done = true
	if h.Outcome == "blackjack" {
		c.unlock("natural")
	}
	h.Payout = payout(h.Bet, mult)
	h.Deck = nil
	c.settle("blackjack", map[string]string{"bust": "Estourou", "push": "Empate", "blackjack": "Blackjack!", "lose": "Perdeu", "win": "Venceu"}[h.Outcome]+fmt.Sprintf(" · %d x %d", pt, dt), h.Bet, h.Payout)
}
