package main

import (
	"math"
	"math/rand/v2"
	"path/filepath"
	"testing"
)

func testCasino() *casino {
	return &casino{rng: rand.New(rand.NewPCG(1, 2)), saved: saved{Balance: startBalance, Jackpot: jackpotSeed}}
}

func TestSlotsRTP(t *testing.T) {
	total := 0
	for _, w := range symbolWeight {
		total += w
	}
	if total != 21 {
		t.Fatalf("spinReel assumes weights sum to 21, got %d", total)
	}
	rtp := 0.0
	for a := range 6 {
		for b := range 6 {
			for c := range 6 {
				p := float64(symbolWeight[a]*symbolWeight[b]*symbolWeight[c]) / math.Pow(21, 3)
				rtp += p * slotsMult([3]int{a, b, c})
			}
		}
	}
	if rtp < 0.93 || rtp > 0.97 {
		t.Fatalf("slots RTP = %.4f, want 93–97%%", rtp)
	}
}

func TestSlotsMult(t *testing.T) {
	for _, tc := range []struct {
		r    [3]int
		want float64
	}{{[3]int{5, 5, 5}, 250}, {[3]int{0, 0, 3}, 1}, {[3]int{2, 2, 1}, 2}, {[3]int{1, 0, 0}, 0}, {[3]int{0, 1, 2}, 0}} {
		if got := slotsMult(tc.r); got != tc.want {
			t.Errorf("slotsMult(%v) = %v, want %v", tc.r, got, tc.want)
		}
	}
}

func TestSlotsSettlesBalance(t *testing.T) {
	c := testCasino()
	r, msg := c.playSlots(amountReq{Amount: 10_00})
	if msg != "" {
		t.Fatal(msg)
	}
	res := r.(slotsResult)
	if c.Balance != startBalance-10_00+res.Payout || c.Stats.Bets != 1 {
		t.Fatalf("balance %d after payout %d", c.Balance, res.Payout)
	}
	for _, bad := range []int{0, -5, startBalance + 1} {
		if _, msg := c.playSlots(amountReq{Amount: bad}); msg == "" {
			t.Errorf("amount %d accepted", bad)
		}
	}
}

func TestRouletteWins(t *testing.T) {
	cases := []struct {
		b    rouletteBet
		n    int
		want bool
	}{
		{rouletteBet{Kind: "numero", Number: 17}, 17, true},
		{rouletteBet{Kind: "numero", Number: 0}, 0, true},
		{rouletteBet{Kind: "vermelho"}, 0, false},
		{rouletteBet{Kind: "par"}, 0, false},
		{rouletteBet{Kind: "vermelho"}, 1, true},
		{rouletteBet{Kind: "preto"}, 2, true},
		{rouletteBet{Kind: "baixo"}, 18, true},
		{rouletteBet{Kind: "alto"}, 18, false},
		{rouletteBet{Kind: "duzia", Number: 3}, 36, true},
		{rouletteBet{Kind: "duzia", Number: 1}, 13, false},
	}
	for _, tc := range cases {
		if got := rouletteWins(tc.b, tc.n); got != tc.want {
			t.Errorf("%+v on %d = %v, want %v", tc.b, tc.n, got, tc.want)
		}
	}
}

func TestRouletteValidation(t *testing.T) {
	c := testCasino()
	for _, bets := range [][]rouletteBet{
		nil,
		{{Kind: "numero", Number: 37, Amount: 1}},
		{{Kind: "duzia", Number: 0, Amount: 1}},
		{{Kind: "cavalo", Amount: 1}},
		{{Kind: "par", Amount: 60_00}, {Kind: "impar", Amount: 60_00}}, // total over balance
	} {
		if _, msg := c.playRoulette(rouletteReq{bets}); msg == "" {
			t.Errorf("%+v accepted", bets)
		}
	}
	if c.Balance != startBalance {
		t.Fatalf("rejected bets changed balance to %d", c.Balance)
	}
	// Covering every number straight up always returns 36 of the 37 units staked.
	var all []rouletteBet
	for n := range 37 {
		all = append(all, rouletteBet{Kind: "numero", Number: n, Amount: 1_00})
	}
	if _, msg := c.playRoulette(rouletteReq{all}); msg != "" {
		t.Fatal(msg)
	}
	if c.Balance != startBalance-1_00 {
		t.Fatalf("balance %d, want %d", c.Balance, startBalance-1_00)
	}
}

func TestDice(t *testing.T) {
	if !diceWins("sete", 7) || diceWins("menor", 7) || !diceWins("maior", 12) || !diceWins("menor", 2) {
		t.Fatal("diceWins wrong")
	}
	for pick, mult := range diceMult {
		n := 0
		for a := 1; a <= 6; a++ {
			for b := 1; b <= 6; b++ {
				if diceWins(pick, a+b) {
					n++
				}
			}
		}
		if rtp := float64(n) / 36 * mult; rtp < 0.94 || rtp > 0.98 {
			t.Errorf("%s RTP %.3f", pick, rtp)
		}
	}
	if _, msg := testCasino().playDice(diceReq{Amount: 1_00, Pick: "dois"}); msg == "" {
		t.Error("unknown pick accepted")
	}
}

// card builds a card of rank r (0 = A … 12 = K) in the first suit.
func card(r int) int { return r }

func TestHandValue(t *testing.T) {
	for _, tc := range []struct {
		cards []int
		total int
		soft  bool
	}{
		{[]int{card(0), card(12)}, 21, true},
		{[]int{card(0), card(0), card(8)}, 21, true},  // A A 9
		{[]int{card(0), card(5), card(9)}, 17, false}, // A 6 10
		{[]int{card(9), card(10), card(11)}, 30, false},
		{[]int{card(4), -1}, 5, false},
	} {
		if total, soft := handValue(tc.cards); total != tc.total || soft != tc.soft {
			t.Errorf("handValue(%v) = %d,%v want %d,%v", tc.cards, total, soft, tc.total, tc.soft)
		}
	}
}

// stacked starts a hand whose deck yields the given cards: player 1, player 2, dealer 1, dealer 2, then draws.
func stacked(c *casino, bet int, cards ...int) {
	c.Balance -= bet
	h := &Hand{Bet: bet, Deck: append(cards, card(1), card(1), card(1), card(1))}
	h.Player = []int{h.draw(), h.draw()}
	h.Dealer = []int{h.draw(), h.draw()}
	c.Hand = h
}

func TestBlackjackOutcomes(t *testing.T) {
	c := testCasino()
	// Player 10+9 stands; dealer 10+6 draws a 2 → 18. Player wins 2×.
	stacked(c, 10_00, card(9), card(8), card(9), card(5), card(1))
	if pub := c.Hand.public(); pub.Dealer[1] != -1 || pub.DealerTotal != 10 {
		t.Fatalf("hole card not hidden: %+v", pub)
	}
	c.stand()
	if c.Hand.Outcome != "win" || c.Balance != startBalance+10_00 {
		t.Fatalf("outcome %s balance %d", c.Hand.Outcome, c.Balance)
	}
	if c.Hand.public().Dealer[1] == -1 {
		t.Fatal("hole card still hidden after the hand")
	}

	// Double: player 5+6 doubles, draws 10 → 21; dealer 10+7 stands → player wins on 2× the bet.
	c = testCasino()
	stacked(c, 10_00, card(4), card(5), card(9), card(6), card(9))
	if _, msg := c.double(); msg != "" {
		t.Fatal(msg)
	}
	if c.Hand.Outcome != "win" || c.Hand.Bet != 20_00 || c.Balance != startBalance+20_00 {
		t.Fatalf("double: %s bet %d balance %d", c.Hand.Outcome, c.Hand.Bet, c.Balance)
	}

	// Bust: player 10+6 hits a 10.
	c = testCasino()
	stacked(c, 10_00, card(9), card(5), card(9), card(6), card(9))
	c.hit()
	if c.Hand.Outcome != "bust" || c.Balance != startBalance-10_00 {
		t.Fatalf("bust: %s balance %d", c.Hand.Outcome, c.Balance)
	}
	if _, msg := c.hit(); msg == "" {
		t.Fatal("hit allowed after the hand ended")
	}
}

func TestBlackjackDealPaysNatural(t *testing.T) {
	// Deal until the player gets a natural, checking each finished hand's payout matches its outcome.
	c := testCasino()
	c.Balance = 1_000_000_00
	want := map[string]float64{"blackjack": 2.5, "push": 1, "win": 2, "lose": 0, "bust": 0}
	sawBJ := false
	for range 500 {
		if _, msg := c.deal(amountReq{Amount: 2_00}); msg != "" {
			t.Fatal(msg)
		}
		if !c.Hand.Done {
			if _, msg := c.deal(amountReq{Amount: 2_00}); msg == "" {
				t.Fatal("second deal allowed during a hand")
			}
			c.stand()
		}
		if c.Hand.Payout != payout(c.Hand.Bet, want[c.Hand.Outcome]) {
			t.Fatalf("%s paid %d on %d", c.Hand.Outcome, c.Hand.Payout, c.Hand.Bet)
		}
		sawBJ = sawBJ || c.Hand.Outcome == "blackjack"
	}
	if !sawBJ {
		t.Fatal("no blackjack in 500 hands")
	}
}

func TestBonusAndSave(t *testing.T) {
	path := filepath.Join(t.TempDir(), "save.json")
	c := newCasino(path)
	if prize, msg := c.claimBonus("2026-01-01"); msg != "" || prize < 10_00 || c.Balance != startBalance+prize {
		t.Fatal("bonus not paid")
	}
	if _, msg := c.claimBonus("2026-01-01"); msg == "" {
		t.Fatal("bonus paid twice")
	}
	c.deal(amountReq{Amount: 5_00})
	c.save()
	d := newCasino(path)
	if d.Balance != c.Balance || d.LastBonus != "2026-01-01" || (d.Hand == nil) != (c.Hand == nil) {
		t.Fatalf("save round trip lost data: %+v", d.saved)
	}
}

func TestCrash(t *testing.T) {
	c := testCasino()
	c.Balance = 1 << 40
	const n = 200_000
	for _, target := range []int{101, 200, 1000} {
		returned := 0
		for range n {
			r, msg := c.playCrash(crashReq{Amount: 100, Target: target})
			if msg != "" {
				t.Fatal(msg)
			}
			returned += r.(crashResult).Payout
		}
		if rtp := float64(returned) / (100 * n); rtp < 0.93 || rtp > 0.99 {
			t.Errorf("target %d RTP %.3f", target, rtp)
		}
	}
	for _, bad := range []int{100, 10_001} {
		if _, msg := c.playCrash(crashReq{Amount: 100, Target: bad}); msg == "" {
			t.Errorf("target %d accepted", bad)
		}
	}
}

func TestJackpot(t *testing.T) {
	c := testCasino()
	if got := c.jackpotFor([3]int{0, 1, 2}, 10_00); got != 0 || c.Jackpot != jackpotSeed+20 {
		t.Fatalf("pot %d after a losing spin", c.Jackpot)
	}
	if got := c.jackpotFor([3]int{5, 5, 5}, 10_00); got != jackpotSeed+40 || c.Jackpot != jackpotSeed {
		t.Fatalf("777 paid %d, pot left %d", got, c.Jackpot)
	}
	c.playSlots(amountReq{Amount: 1_00})
	if h := c.Stats.History[0]; h.Balance != c.Balance {
		t.Fatalf("history balance %d, want %d", h.Balance, c.Balance)
	}
}
