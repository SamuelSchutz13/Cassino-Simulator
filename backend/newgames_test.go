package main

import "testing"

// cd builds a card from a poker value (2–14) and suit (0–3).
func cd(v, suit int) int { return suit*13 + (v-1)%13 }

func TestPokerRanking(t *testing.T) {
	hands := [][]int{ // best first
		{cd(14, 0), cd(13, 0), cd(12, 0), cd(11, 0), cd(10, 0)}, // royal
		{cd(9, 1), cd(8, 1), cd(7, 1), cd(6, 1), cd(5, 1)},      // straight flush
		{cd(4, 0), cd(4, 1), cd(4, 2), cd(4, 3), cd(2, 0)},      // quads
		{cd(3, 0), cd(3, 1), cd(3, 2), cd(2, 3), cd(2, 0)},      // full house
		{cd(2, 2), cd(5, 2), cd(9, 2), cd(11, 2), cd(13, 2)},    // flush
		{cd(6, 0), cd(5, 1), cd(4, 2), cd(3, 3), cd(2, 0)},      // 6-high straight
		{cd(14, 0), cd(2, 1), cd(3, 2), cd(4, 3), cd(5, 0)},     // wheel
		{cd(7, 0), cd(7, 1), cd(7, 2), cd(13, 3), cd(2, 0)},     // trips
		{cd(9, 0), cd(9, 1), cd(5, 2), cd(5, 3), cd(14, 0)},     // two pair
		{cd(14, 0), cd(14, 1), cd(9, 2), cd(5, 3), cd(3, 0)},    // pair of aces, 9 kicker
		{cd(14, 2), cd(14, 3), cd(8, 2), cd(5, 1), cd(3, 1)},    // pair of aces, 8 kicker
		{cd(14, 0), cd(12, 1), cd(9, 2), cd(5, 3), cd(3, 0)},    // high card
	}
	for i := 1; i < len(hands); i++ {
		if score5(hands[i-1]) <= score5(hands[i]) {
			t.Errorf("hand %d should beat hand %d", i-1, i)
		}
	}
	seven := append([]int{cd(2, 3), cd(7, 2)}, hands[0]...)
	if best7(seven) != score5(hands[0]) {
		t.Error("best7 missed the royal")
	}
	if best7([]int{cd(2, 0), cd(3, 1), cd(14, 2), cd(14, 3), cd(9, 0), cd(9, 1)}) != score5([]int{cd(3, 1), cd(14, 2), cd(14, 3), cd(9, 0), cd(9, 1)}) {
		t.Error("best7 with 6 cards wrong")
	}
}

func chips(tb *Table) (n int) {
	for _, s := range tb.Seats {
		n += s.Stack
	}
	return n + tb.pot()
}

// Plays many hands with a random player and checks no chip is created or lost.
func TestPokerTableConservesChips(t *testing.T) {
	c := testCasino()
	c.Balance = 1 << 30
	if _, msg := c.tableSit(amountReq{Amount: 100_00}); msg != "" {
		t.Fatal(msg)
	}
	if _, msg := c.tableSit(amountReq{Amount: 100_00}); msg == "" {
		t.Fatal("sat twice")
	}
	tb := c.Table
	for hand := range 300 {
		if tb.Seats[0].Stack < bigBlind {
			c.tableRebuy(amountReq{Amount: 50_00})
		}
		if _, msg := c.tableDeal(); msg != "" {
			t.Fatal(msg)
		}
		inv := chips(tb)
		if !tb.InHand { // bots all folded inside deal: already paid
			inv -= tb.pot()
		}
		for steps := 0; tb.InHand; steps++ {
			if steps > 50 || tb.ToAct != 0 {
				t.Fatalf("hand %d stuck: toAct %d", hand, tb.ToAct)
			}
			pub := tb.public()
			if pub.Seats[1].Hole[0] != -1 || pub.Deck != nil {
				t.Fatal("bot cards or deck leaked mid-hand")
			}
			switch r := c.rng.IntN(10); {
			case r == 0:
				c.tableAct(actReq{Action: "fold"})
			case r < 3 && pub.CanRaise:
				if _, msg := c.tableAct(actReq{Action: "raise", Amount: pub.MinRaiseTo}); msg != "" {
					t.Fatalf("min raise refused: %s", msg)
				}
			default:
				c.tableAct(actReq{Action: "call"})
			}
			if tb.InHand && chips(tb) != inv {
				t.Fatalf("hand %d: chips %d, want %d", hand, chips(tb), inv)
			}
		}
		if chips(tb)-tb.pot() != inv || tb.pot() != func() (w int) {
			for _, s := range tb.Seats {
				w += s.Won
			}
			return
		}() {
			for _, s := range tb.Seats {
				t.Logf("%s stack %d total %d won %d folded %v allin %v best %s", s.Name, s.Stack, s.Total, s.Won, s.Folded, s.AllIn, s.Best)
			}
			t.Fatalf("hand %d paid out wrong: chips %d inv %d pot %d", hand, chips(tb)-tb.pot(), inv, tb.pot())
		}
	}
	stack := tb.Seats[0].Stack
	before := c.Balance
	c.tableLeave()
	if c.Table != nil || c.Balance != before+stack {
		t.Fatal("leaving didn't cash the chips")
	}
}

func TestPokerSidePots(t *testing.T) {
	c := testCasino()
	board := []int{cd(2, 0), cd(7, 1), cd(9, 2), cd(11, 3), cd(13, 0)}
	mk := func(total int, hole []int, folded bool) *Seat {
		return &Seat{Name: "x", Total: total, Hole: hole, Folded: folded, AllIn: true}
	}
	c.Table = &Table{Board: board, InHand: true, Seats: []*Seat{
		mk(10_00, []int{cd(14, 0), cd(14, 1)}, false), // short all-in, best hand (aces)
		mk(30_00, []int{cd(12, 1), cd(12, 2)}, false), // second best (queens)
		mk(30_00, []int{cd(3, 1), cd(4, 2)}, false),   // worst
		mk(5_00, []int{cd(5, 1), cd(6, 2)}, true),     // folded
	}}
	c.endHand()
	s := c.Table.Seats
	// main pot 10+10+10+5 = 35 → aces; side pot 20+20 = 40 → queens
	if s[0].Won != 35_00 || s[1].Won != 40_00 || s[2].Won != 0 || s[3].Won != 0 {
		t.Fatalf("won %d %d %d %d", s[0].Won, s[1].Won, s[2].Won, s[3].Won)
	}
}

func TestBaccarat(t *testing.T) {
	if p, b := bacDeal([]int{cd(9, 0), cd(2, 0), cd(13, 0), cd(3, 0), 5, 6}); len(p) != 2 || len(b) != 2 {
		t.Fatal("natural 9 must stop the drawing")
	}
	c := testCasino()
	c.Balance = 1 << 40
	for pick, lo := range map[string]float64{"jogador": 0.97, "banca": 0.97, "empate": 0.8} {
		staked, returned := 0, 0
		for range 100_000 {
			r, msg := c.playBaccarat(diceReq{Amount: 100, Pick: pick})
			if msg != "" {
				t.Fatal(msg)
			}
			staked += 100
			returned += r.(baccaratResult).Payout
		}
		if rtp := float64(returned) / float64(staked); rtp < lo || rtp > 1.0 {
			t.Errorf("%s RTP %.3f", pick, rtp)
		}
	}
}

func TestHiLo(t *testing.T) {
	if hiloChance(cd(13, 0), "maior") != 0 || hiloChance(cd(14, 0), "menor") != 0 || hiloChance(cd(7, 0), "maior") != 6.0/13 {
		t.Fatal("hiloChance wrong")
	}
	c := testCasino()
	c.hiloStart(amountReq{Amount: 10_00})
	if _, msg := c.hiloCashout(); msg == "" {
		t.Fatal("cash-out before any guess accepted")
	}
	for c.HiLo.Done == false {
		last := c.HiLo.Cards[len(c.HiLo.Cards)-1]
		pick := "maior"
		if hiloChance(last, "menor") > hiloChance(last, "maior") {
			pick = "menor"
		}
		c.hiloGuess(pickReq{Pick: pick})
		if !c.HiLo.Done && len(c.HiLo.Cards) >= 3 {
			c.hiloCashout()
		}
	}
	if h := c.HiLo; c.Balance != startBalance-10_00+h.Payout || (h.Payout > 0) != (h.Mult > 1) {
		t.Fatalf("hilo settled wrong: balance %d, %+v", c.Balance, h)
	}
}

func TestMissions(t *testing.T) {
	c := testCasino()
	m := c.dailyMissions()
	m.Picks = [3]int{0, 3, 6} // 10 bets anywhere, 15 slots spins, 3 dice wins
	for range 10 {
		c.settle("slots", "", 1_00, 0)
	}
	if m.Progress != [3]int{10, 10, 0} {
		t.Fatalf("progress %v", m.Progress)
	}
	before := c.Balance
	if _, msg := c.claimMission(indexReq{0}); msg != "" || c.Balance != before+missionPool[0].Reward {
		t.Fatal("finished mission not paid")
	}
	if _, msg := c.claimMission(indexReq{0}); msg == "" {
		t.Fatal("mission paid twice")
	}
	if _, msg := c.claimMission(indexReq{1}); msg == "" {
		t.Fatal("unfinished mission paid")
	}
}

func TestAchievements(t *testing.T) {
	c := testCasino()
	c.settle("dice", "", 1_00, 2_30)
	c.unlock("primeira")
	if len(c.Achievements) != 1 || !c.achievementViews()[0].Unlocked {
		t.Fatalf("achievements %v", c.Achievements)
	}
}
