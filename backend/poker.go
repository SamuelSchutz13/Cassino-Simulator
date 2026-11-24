package main

import (
	"fmt"
	"slices"
)

// Texas Hold'em, no limit, you against three bots. Blinds R$ 0,50 / R$ 1,00.
// Your chips are bought in from the balance and live at the table until you leave.
// Bots estimate their hand by simulation and act by personality; busted bots are
// replaced by new ones. shortcut: fixed blinds and 4 seats; add tables/stakes if wanted.

const (
	smallBlind = 50
	bigBlind   = 100
	minBuyIn   = 20_00
	maxStack   = 200_00
	seats      = 4
)

type Seat struct {
	Name   string `json:"name"`
	Avatar string `json:"avatar"`
	Style  string `json:"style"` // bots: cauteloso, solto, agressivo; "" = you
	Stack  int    `json:"stack"`
	Hole   []int  `json:"hole"`
	Bet    int    `json:"bet"`   // put in on this street
	Total  int    `json:"total"` // put in this hand
	Folded bool   `json:"folded"`
	AllIn  bool   `json:"allIn"`
	Acted  bool   `json:"acted"`
	Last   string `json:"last"` // last action, for the speech bubble
	Won    int    `json:"won"`
	Best   string `json:"best"` // hand name, shown at showdown
}

type Table struct {
	Seats    []*Seat  `json:"seats"` // 0 = you
	Board    []int    `json:"board"`
	Deck     []int    `json:"deck"`
	Dealer   int      `json:"dealer"`
	Street   int      `json:"street"` // 0 preflop, 1 flop, 2 turn, 3 river, 4 over
	ToAct    int      `json:"toAct"`  // -1 = nobody
	CurBet   int      `json:"curBet"`
	MinRaise int      `json:"minRaise"`
	InHand   bool     `json:"inHand"`
	Showdown bool     `json:"showdown"`
	Log      []string `json:"log"`
	Hands    int      `json:"hands"`
}

var botRoster = []struct{ name, avatar, style string }{
	{"Dona Carmem", "👵", "cauteloso"},
	{"Tio Valdir", "🧔", "solto"},
	{"Zé Blefe", "😎", "agressivo"},
	{"Professora", "🎩", "cauteloso"},
	{"Lulu", "💁", "solto"},
	{"Raposa", "🦊", "agressivo"},
	{"Seu Jorge", "👴", "solto"},
	{"Doutora Íris", "🧐", "cauteloso"},
}

// ---------- hand evaluation ----------

var pokerNames = []string{"Carta alta", "Par", "Dois pares", "Trinca", "Sequência", "Flush", "Full house", "Quadra", "Straight flush", "Royal flush"}

const scoreBase = 15 * 15 * 15 * 15 * 15 // hand category = score / scoreBase

func pokerValue(card int) int {
	if r := card % 13; r > 0 {
		return r + 1
	}
	return 14 // ace high
}

// score5 ranks a 5-card hand; a higher score is a better hand.
func score5(cs []int) int {
	var count [15]int
	flush := true
	for _, c := range cs {
		count[pokerValue(c)]++
		flush = flush && c/13 == cs[0]/13
	}
	vals := make([]int, 0, 5)
	for v := 14; v >= 2; v-- {
		if count[v] > 0 {
			vals = append(vals, v)
		}
	}
	// bigger groups first, then higher values: that's also the tiebreak order
	slices.SortStableFunc(vals, func(a, b int) int { return count[b] - count[a] })
	straight := len(vals) == 5 && vals[0]-vals[4] == 4
	if len(vals) == 5 && vals[0] == 14 && vals[1] == 5 { // A-2-3-4-5
		straight, vals = true, []int{5, 4, 3, 2, 1}
	}
	cat := 0
	switch {
	case straight && flush && vals[0] == 14:
		cat = 9
	case straight && flush:
		cat = 8
	case count[vals[0]] == 4:
		cat = 7
	case count[vals[0]] == 3 && count[vals[1]] == 2:
		cat = 6
	case flush:
		cat = 5
	case straight:
		cat = 4
	case count[vals[0]] == 3:
		cat = 3
	case count[vals[0]] == 2 && count[vals[1]] == 2:
		cat = 2
	case count[vals[0]] == 2:
		cat = 1
	}
	s := 0
	for i := range 5 {
		s *= 15
		if i < len(vals) {
			s += vals[i]
		}
	}
	return cat*scoreBase + s
}

// best7 is the best score of any 5 of the 5–7 cards.
func best7(cs []int) int {
	n := len(cs)
	if n <= 5 {
		return score5(cs)
	}
	best, hand := 0, make([]int, 0, 5)
	for i := 0; i < n; i++ {
		for j := i + 1; j <= n; j++ { // drop cards i and j; j == n drops only i (6 cards)
			if (n == 7) == (j == n) {
				continue
			}
			hand = hand[:0]
			for k, c := range cs {
				if k != i && k != j {
					hand = append(hand, c)
				}
			}
			best = max(best, score5(hand))
		}
	}
	return best
}

func handName(cards []int) string { return pokerNames[best7(cards)/scoreBase] }

// ---------- table ----------

func (t *Table) pot() int {
	p := 0
	for _, s := range t.Seats {
		p += s.Total
	}
	return p
}

func (t *Table) log(format string, a ...any) {
	t.Log = append(t.Log, fmt.Sprintf(format, a...))
	if len(t.Log) > 40 {
		t.Log = t.Log[len(t.Log)-40:]
	}
}

// nextToAct is the next seat after i that can still bet, or -1.
func (t *Table) nextToAct(i int) int {
	for k := 1; k <= seats; k++ {
		if s := t.Seats[(i+k)%seats]; !s.Folded && !s.AllIn {
			return (i + k) % seats
		}
	}
	return -1
}

func (t *Table) live() (n int) {
	for _, s := range t.Seats {
		if !s.Folded {
			n++
		}
	}
	return
}

func (t *Table) roundComplete() bool {
	var can []*Seat
	for _, s := range t.Seats {
		if !s.Folded && !s.AllIn {
			can = append(can, s)
		}
	}
	if len(can) == 0 || (len(can) == 1 && can[0].Bet >= t.CurBet) {
		return true
	}
	for _, s := range can {
		if !s.Acted || s.Bet != t.CurBet {
			return false
		}
	}
	return true
}

func (t *Table) put(s *Seat, amount int) {
	amount = min(amount, s.Stack)
	s.Stack -= amount
	s.Bet += amount
	s.Total += amount
	if s.Stack == 0 {
		s.AllIn = true
	}
}

func (c *casino) newBot(t *Table) *Seat {
	for _, i := range c.rng.Perm(len(botRoster)) {
		b := botRoster[i]
		if !slices.ContainsFunc(t.Seats, func(s *Seat) bool { return s != nil && s.Name == b.name }) {
			return &Seat{Name: b.name, Avatar: b.avatar, Style: b.style, Stack: 50_00 + c.rng.IntN(101)*1_00}
		}
	}
	panic("roster smaller than table")
}

func (c *casino) tableSit(req amountReq) (any, string) {
	if c.Table != nil {
		return nil, "você já está na mesa"
	}
	if req.Amount < minBuyIn || req.Amount > maxStack {
		return nil, "compre de R$ 20 a R$ 200 em fichas"
	}
	if msg := c.take(req.Amount); msg != "" {
		return nil, msg
	}
	t := &Table{Seats: make([]*Seat, seats), Dealer: c.rng.IntN(seats), ToAct: -1}
	t.Seats[0] = &Seat{Name: "Você", Avatar: "🙂", Stack: req.Amount}
	for i := 1; i < seats; i++ {
		t.Seats[i] = c.newBot(t)
	}
	c.Table = t
	return nil, ""
}

func (c *casino) tableIdle() (*Table, string) {
	if c.Table == nil {
		return nil, "sente-se à mesa primeiro"
	}
	if c.Table.InHand {
		return nil, "termine a mão atual primeiro"
	}
	return c.Table, ""
}

func (c *casino) tableRebuy(req amountReq) (any, string) {
	t, msg := c.tableIdle()
	if msg != "" {
		return nil, msg
	}
	if req.Amount <= 0 || t.Seats[0].Stack+req.Amount > maxStack {
		return nil, "a mesa aceita até R$ 200 em fichas"
	}
	if msg := c.take(req.Amount); msg != "" {
		return nil, msg
	}
	t.Seats[0].Stack += req.Amount
	return nil, ""
}

func (c *casino) tableLeave() (any, string) {
	t, msg := c.tableIdle()
	if msg != "" {
		return nil, msg
	}
	c.Balance += t.Seats[0].Stack
	c.Table = nil
	return nil, ""
}

func (c *casino) tableDeal() (any, string) {
	t, msg := c.tableIdle()
	if msg != "" {
		return nil, msg
	}
	if t.Seats[0].Stack < bigBlind {
		return nil, "compre mais fichas para jogar"
	}
	for i := 1; i < seats; i++ {
		if t.Seats[i].Stack < bigBlind {
			t.Seats[i] = c.newBot(t)
			t.log("%s %s sentou-se à mesa", t.Seats[i].Avatar, t.Seats[i].Name)
		}
	}
	t.Hands++
	t.Dealer = (t.Dealer + 1) % seats
	deck := c.rng.Perm(52)
	for i, s := range t.Seats {
		*s = Seat{Name: s.Name, Avatar: s.Avatar, Style: s.Style, Stack: s.Stack, Hole: deck[2*i : 2*i+2 : 2*i+2]}
	}
	t.Deck, t.Board, t.Street, t.InHand, t.Showdown = deck[2*seats:], nil, 0, true, false
	t.log("— Mão #%d —", t.Hands)
	sb, bb := (t.Dealer+1)%seats, (t.Dealer+2)%seats
	t.put(t.Seats[sb], smallBlind)
	t.put(t.Seats[bb], bigBlind)
	t.Seats[sb].Last, t.Seats[bb].Last = "Small blind", "Big blind"
	t.CurBet, t.MinRaise = bigBlind, bigBlind
	t.ToAct = t.nextToAct(bb)
	c.runTable()
	return nil, ""
}

type actReq struct {
	Action string `json:"action"` // fold, check, call, raise
	Amount int    `json:"amount"` // raise: total bet on this street ("raise to")
}

func (c *casino) tableAct(req actReq) (any, string) {
	t := c.Table
	if t == nil || !t.InHand || t.ToAct != 0 {
		return nil, "não é a sua vez"
	}
	if msg := t.apply(0, req.Action, req.Amount); msg != "" {
		return nil, msg
	}
	c.runTable()
	return nil, ""
}

// apply performs a seat's action.
func (t *Table) apply(i int, action string, amount int) string {
	s := t.Seats[i]
	toCall := t.CurBet - s.Bet
	switch action {
	case "fold":
		s.Folded, s.Last = true, "Desistiu"
	case "check":
		if toCall > 0 {
			return "há uma aposta para pagar"
		}
		s.Last = "Mesa"
	case "call":
		if toCall <= 0 {
			s.Last = "Mesa"
			break
		}
		t.put(s, toCall)
		s.Last = "Pagou " + brlText(s.Bet)
	case "raise":
		allIn := amount == s.Bet+s.Stack
		if amount <= t.CurBet || amount > s.Bet+s.Stack || (amount < t.CurBet+t.MinRaise && !allIn) {
			return fmt.Sprintf("aumento inválido: de %s a %s", brlText(min(t.CurBet+t.MinRaise, s.Bet+s.Stack)), brlText(s.Bet+s.Stack))
		}
		if amount-t.CurBet >= t.MinRaise { // a full raise reopens the betting
			t.MinRaise = amount - t.CurBet
			for _, o := range t.Seats {
				o.Acted = false
			}
		}
		t.CurBet = amount
		t.put(s, amount-s.Bet)
		s.Last = "Aumentou p/ " + brlText(amount)
	default:
		return "ação inválida"
	}
	if s.AllIn && action != "fold" {
		s.Last = "ALL-IN " + brlText(s.Bet)
	}
	s.Acted = true
	t.log("%s %s: %s", s.Avatar, s.Name, s.Last)
	t.ToAct = t.nextToAct(i)
	return ""
}

func brlText(cents int) string {
	return fmt.Sprintf("R$ %d,%02d", cents/100, cents%100)
}

// runTable lets the bots play until it's your turn or the hand ends. Caller holds c.mu.
func (c *casino) runTable() {
	t := c.Table
	for t.InHand {
		switch {
		case t.live() == 1:
			c.endHand()
		case t.roundComplete():
			for _, s := range t.Seats {
				s.Bet, s.Acted = 0, false
			}
			t.CurBet, t.MinRaise = 0, bigBlind
			t.Street++
			switch t.Street {
			case 1:
				t.Board, t.Deck = append(t.Board, t.Deck[:3]...), t.Deck[3:]
				t.log("Flop")
			case 2, 3:
				t.Board, t.Deck = append(t.Board, t.Deck[0]), t.Deck[1:]
				t.log("%s", map[int]string{2: "Turn", 3: "River"}[t.Street])
			default:
				c.endHand()
				continue
			}
			for _, s := range t.Seats {
				if !s.Folded && !s.AllIn {
					s.Last = ""
				}
			}
			t.ToAct = t.nextToAct(t.Dealer)
		case t.ToAct == 0:
			return // your turn
		default:
			c.botAct(t.ToAct)
		}
	}
}

// endHand pays the pots (side pots included) and records your result. Caller holds c.mu.
func (c *casino) endHand() {
	t := c.Table
	street := t.Street
	t.InHand, t.ToAct, t.Street = false, -1, 4
	var live []int
	for i, s := range t.Seats {
		if !s.Folded {
			live = append(live, i)
		}
	}
	score := make([]int, seats)
	if len(live) == 1 {
		t.Seats[live[0]].Won = t.pot()
	} else {
		t.Showdown = true
		for len(t.Board) < 5 { // all-in before the river: run it out
			t.Board, t.Deck = append(t.Board, t.Deck[0]), t.Deck[1:]
		}
		for _, i := range live {
			cards := append(slices.Clone(t.Seats[i].Hole), t.Board...)
			score[i] = best7(cards)
			t.Seats[i].Best = pokerNames[score[i]/scoreBase]
		}
		// side pots: slice the contributions into levels; each level goes to the best eligible hand
		levels := []int{}
		for _, s := range t.Seats {
			if s.Total > 0 && !slices.Contains(levels, s.Total) {
				levels = append(levels, s.Total)
			}
		}
		slices.Sort(levels)
		prev := 0
		for _, lv := range levels {
			part := 0
			for _, s := range t.Seats {
				part += min(s.Total, lv) - min(s.Total, prev)
			}
			var winners []int
			for _, i := range live {
				if t.Seats[i].Total < lv {
					continue
				}
				if len(winners) == 0 || score[i] > score[winners[0]] {
					winners = []int{i}
				} else if score[i] == score[winners[0]] {
					winners = append(winners, i)
				}
			}
			if len(winners) == 0 { // only folded players reached this level: the uncalled bet goes back
				for i, s := range t.Seats {
					if s.Total >= lv {
						winners = []int{i}
					}
				}
			}
			for k, w := range winners {
				share := part / len(winners)
				if k == 0 {
					share += part % len(winners)
				}
				t.Seats[w].Won += share
			}
			prev = lv
		}
	}
	for _, s := range t.Seats {
		s.Stack += s.Won
		if s.Won > 0 {
			t.log("%s %s ganhou %s%s", s.Avatar, s.Name, brlText(s.Won), map[bool]string{true: " com " + s.Best, false: ""}[t.Showdown && s.Best != ""])
		}
	}
	me := t.Seats[0]
	if me.Total > 0 || me.Won > 0 {
		label := "Desistiu"
		switch {
		case me.Won > me.Total && t.Showdown:
			label = "Venceu com " + me.Best
		case me.Won > me.Total:
			label = "Todos correram"
		case me.Won > 0:
			label = "Dividiu o pote"
		case !me.Folded:
			label = "Perdeu com " + me.Best
		}
		c.record("poker", label, me.Total, me.Won)
		if me.Won > me.Total {
			c.unlock("pote")
			if t.Showdown && score[0]/scoreBase >= 6 {
				c.unlock("fullhouse")
			}
			if !t.Showdown && street > 0 {
				c.unlock("blefe")
			}
		}
	}
}

// ---------- bots ----------

// equity estimates the chance that hole beats `opps` random hands, by simulation.
func (c *casino) equity(hole, board []int, opps int) float64 {
	const sims = 150
	known := append(slices.Clone(hole), board...)
	rest := make([]int, 0, 52)
	for card := range 52 {
		if !slices.Contains(known, card) {
			rest = append(rest, card)
		}
	}
	win := 0.0
	full := make([]int, 0, 7)
	for range sims {
		c.rng.Shuffle(len(rest), func(a, b int) { rest[a], rest[b] = rest[b], rest[a] })
		need := 5 - len(board)
		b := append(slices.Clone(board), rest[:need]...)
		full = append(append(full[:0], hole...), b...)
		mine := best7(full)
		best, ties := 0, 0
		for o := range opps {
			full = append(append(full[:0], rest[need+2*o:need+2*o+2]...), b...)
			s := best7(full)
			if s > best {
				best, ties = s, 0
			}
			if s == best {
				ties++
			}
		}
		switch {
		case mine > best:
			win++
		case mine == best:
			win += 1 / float64(ties+1)
		}
	}
	return win / sims
}

var styles = map[string]struct{ loose, aggro, bluff float64 }{
	"cauteloso": {-0.05, 0.25, 0.02},
	"solto":     {0.08, 0.35, 0.05},
	"agressivo": {0.03, 0.65, 0.14},
}

func (c *casino) botAct(i int) {
	t := c.Table
	s := t.Seats[i]
	st := styles[s.Style]
	opps := t.live() - 1
	eq := c.equity(s.Hole, t.Board, opps) + (c.rng.Float64()-0.5)*0.08
	strength := eq * float64(opps+1) // 1 = average hand at this table
	toCall := t.CurBet - s.Bet
	pot := t.pot()
	odds := float64(toCall) / float64(pot+toCall)
	r := c.rng.Float64()

	raise := func(frac float64) {
		to := t.CurBet + max(t.MinRaise, int(float64(pot)*frac)/50*50)
		if t.Street == 0 && t.CurBet == bigBlind {
			to = bigBlind * (3 + c.rng.IntN(2))
		}
		to = min(to, s.Bet+s.Stack)
		if to <= t.CurBet { // can't raise: just call
			t.apply(i, "call", 0)
			return
		}
		if msg := t.apply(i, "raise", to); msg != "" {
			t.apply(i, "call", 0)
		}
	}
	switch {
	case strength > 1.7 && r < st.aggro+0.35:
		raise(0.6 + c.rng.Float64()*0.6)
	case strength > 1.3 && r < st.aggro:
		raise(0.4 + c.rng.Float64()*0.4)
	case r < st.bluff && t.Street > 0:
		raise(0.5 + c.rng.Float64()*0.5)
	case toCall == 0:
		t.apply(i, "check", 0)
	case eq+st.loose >= odds && (toCall < s.Stack/2 || strength > 1.2):
		t.apply(i, "call", 0)
	default:
		t.apply(i, "fold", 0)
	}
}

// ---------- what the browser sees ----------

type publicTable struct {
	*Table
	Deck       []int  `json:"deck,omitempty"`
	Pot        int    `json:"pot"`
	ToCall     int    `json:"toCall"`
	MinRaiseTo int    `json:"minRaiseTo"`
	MaxRaiseTo int    `json:"maxRaiseTo"`
	CanRaise   bool   `json:"canRaise"`
	MyHand     string `json:"myHand"`
}

// public hides the deck and the bots' cards (shown only at showdown for hands still in).
func (t *Table) public() *publicTable {
	if t == nil {
		return nil
	}
	v := *t
	v.Seats = make([]*Seat, seats)
	for i, s := range t.Seats {
		cp := *s
		if i > 0 && len(cp.Hole) > 0 && !(t.Showdown && !s.Folded) {
			cp.Hole = []int{-1, -1}
		}
		v.Seats[i] = &cp
	}
	me := t.Seats[0]
	p := &publicTable{Table: &v, Pot: t.pot()}
	if t.InHand && t.ToAct == 0 {
		p.ToCall = min(t.CurBet-me.Bet, me.Stack)
		p.MaxRaiseTo = me.Bet + me.Stack
		p.MinRaiseTo = min(t.CurBet+t.MinRaise, p.MaxRaiseTo)
		p.CanRaise = p.MaxRaiseTo > t.CurBet
	}
	if len(me.Hole) > 0 && len(t.Board) >= 3 {
		p.MyHand = handName(append(slices.Clone(me.Hole), t.Board...))
	}
	return p
}
