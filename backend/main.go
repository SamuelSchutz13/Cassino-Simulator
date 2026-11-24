package main

import (
	"cmp"
	"encoding/json"
	"errors"
	"io"
	"io/fs"
	"log"
	"math"
	"math/rand/v2"
	"net/http"
	"os"
	"sync"
	"time"
)

// shortcut: one player saved to a JSON file; add users and a database for multiplayer.
const (
	startBalance = 100_00 // R$ 100,00 — all money is in centavos
	saveFile     = "save.json"
	historySize  = 30
	jackpotSeed  = 500_00 // progressive jackpot restarts here after it's hit
)

type HistoryItem struct {
	Game    string `json:"game"` // slots, roulette, blackjack, dice, crash, hilo, baccarat or poker
	Bet     string `json:"bet"`  // human description of the bet
	Amount  int    `json:"amount"`
	Payout  int    `json:"payout"`
	Balance int    `json:"balance"` // balance right after this bet, for the chart
}

type Stats struct {
	Bets     int           `json:"bets"`
	Wins     int           `json:"wins"`
	Staked   int           `json:"staked"`
	Returned int           `json:"returned"`
	BestWin  int           `json:"bestWin"`
	History  []HistoryItem `json:"history"`
}

// saved is what survives a server restart, including a blackjack hand in progress.
type saved struct {
	Balance      int        `json:"balance"`
	Stats        Stats      `json:"stats"`
	LastBonus    string     `json:"lastBonus"` // day ("2006-01-02", server local time) the bonus was claimed
	Hand         *Hand      `json:"hand,omitempty"`
	Jackpot      int        `json:"jackpot"`
	HiLo         *HiLo      `json:"hilo,omitempty"`
	Table        *Table     `json:"table,omitempty"` // poker table you're sitting at
	Achievements []string   `json:"achievements"`
	Missions     missionDay `json:"missions"`
}

type casino struct {
	mu       sync.Mutex
	rng      *rand.Rand
	savePath string // empty = no persistence (tests)
	saved
}

func (c *casino) state() map[string]any {
	return map[string]any{
		"balance": c.Balance, "stats": c.Stats, "hand": c.Hand.public(),
		"bonusAvailable": c.LastBonus != today(), "jackpot": c.Jackpot,
		"hilo": c.HiLo, "table": c.Table.public(), "missions": c.missionViews(), "achievements": c.achievementViews(),
	}
}

func today() string { return time.Now().Format("2006-01-02") }

// take debits a stake after checking it. Caller holds c.mu.
func (c *casino) take(amount int) string {
	if amount <= 0 || amount > c.Balance {
		return "valor de aposta inválido"
	}
	c.Balance -= amount
	return ""
}

// settle pays a finished bet (stake already taken) and records it. Caller holds c.mu.
func (c *casino) settle(game, bet string, amount, payout int) {
	c.Balance += payout
	c.record(game, bet, amount, payout)
}

// record adds a finished bet to stats, history, missions and achievements without touching
// the balance (poker chips stay at the table). Caller holds c.mu.
func (c *casino) record(game, bet string, amount, payout int) {
	total := c.Balance // balance plus chips at the poker table
	if c.Table != nil {
		total += c.Table.Seats[0].Stack
	}
	s := &c.Stats
	s.Bets++
	s.Staked += amount
	s.Returned += payout
	if payout > amount {
		s.Wins++
		s.BestWin = max(s.BestWin, payout)
	}
	s.History = append([]HistoryItem{{game, bet, amount, payout, total}}, s.History...)
	s.History = s.History[:min(len(s.History), historySize)]
	c.trackMissions(game, amount, payout)
	if payout > amount {
		c.unlock("primeira")
	}
	if s.Bets >= 100 {
		c.unlock("cem")
	}
	if payout >= 500_00 {
		c.unlock("grande")
	}
	if total >= 1000_00 {
		c.unlock("rico")
	}
}

// Daily mystery gift, once per calendar day. Expected value ≈ R$ 33.
var (
	giftPrize  = []int{10_00, 20_00, 50_00, 100_00, 500_00}
	giftWeight = []int{40, 30, 20, 9, 1} // out of 100
)

func (c *casino) claimBonus(day string) (int, string) {
	if c.LastBonus == day {
		return 0, "presente de hoje já foi aberto"
	}
	n := c.rng.IntN(100)
	prize := giftPrize[len(giftPrize)-1]
	for i, w := range giftWeight {
		if n < w {
			prize = giftPrize[i]
			break
		}
		n -= w
	}
	c.LastBonus = day
	c.Balance += prize
	return prize, ""
}

// handle decodes a JSON request, runs play under the lock and answers { result, state }.
func handle[T any](c *casino, play func(T) (any, string)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req T
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&req); err != nil && !errors.Is(err, io.EOF) {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "pedido inválido"})
			return
		}
		c.mu.Lock()
		defer c.mu.Unlock()
		res, msg := play(req)
		if msg != "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": msg})
			return
		}
		c.save()
		writeJSON(w, http.StatusOK, map[string]any{"result": res, "state": c.state()})
	}
}

// save writes atomically (temp file + rename) so a crash never leaves a half-written save. Caller holds c.mu.
func (c *casino) save() {
	if c.savePath == "" {
		return
	}
	data, _ := json.Marshal(c.saved)
	tmp := c.savePath + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		log.Println("erro ao salvar:", err)
		return
	}
	if err := os.Rename(tmp, c.savePath); err != nil {
		log.Println("erro ao salvar:", err)
	}
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func newCasino(savePath string) *casino {
	c := &casino{rng: rand.New(rand.NewPCG(rand.Uint64(), rand.Uint64())), savePath: savePath, saved: saved{Balance: startBalance, Jackpot: jackpotSeed}}
	if savePath != "" {
		data, err := os.ReadFile(savePath)
		if err == nil {
			err = json.Unmarshal(data, &c.saved)
		}
		if err != nil && !errors.Is(err, fs.ErrNotExist) {
			log.Fatalf("save corrompido (%s): %v — apague o arquivo para recomeçar", savePath, err)
		}
	}
	return c
}

type empty struct{}

func main() {
	c := newCasino(saveFile)
	http.HandleFunc("GET /api/state", func(w http.ResponseWriter, r *http.Request) {
		c.mu.Lock()
		defer c.mu.Unlock()
		writeJSON(w, http.StatusOK, c.state())
	})
	http.HandleFunc("POST /api/slots", handle(c, c.playSlots))
	http.HandleFunc("POST /api/roulette", handle(c, c.playRoulette))
	http.HandleFunc("POST /api/dice", handle(c, c.playDice))
	http.HandleFunc("POST /api/crash", handle(c, c.playCrash))
	http.HandleFunc("POST /api/baccarat", handle(c, c.playBaccarat))
	http.HandleFunc("POST /api/hilo/start", handle(c, c.hiloStart))
	http.HandleFunc("POST /api/hilo/guess", handle(c, c.hiloGuess))
	http.HandleFunc("POST /api/hilo/cashout", handle(c, func(empty) (any, string) { return c.hiloCashout() }))
	http.HandleFunc("POST /api/poker/sit", handle(c, c.tableSit))
	http.HandleFunc("POST /api/poker/rebuy", handle(c, c.tableRebuy))
	http.HandleFunc("POST /api/poker/leave", handle(c, func(empty) (any, string) { return c.tableLeave() }))
	http.HandleFunc("POST /api/poker/deal", handle(c, func(empty) (any, string) { return c.tableDeal() }))
	http.HandleFunc("POST /api/poker/act", handle(c, c.tableAct))
	http.HandleFunc("POST /api/missions/claim", handle(c, c.claimMission))
	http.HandleFunc("POST /api/blackjack/deal", handle(c, c.deal))
	http.HandleFunc("POST /api/blackjack/hit", handle(c, func(empty) (any, string) { return c.hit() }))
	http.HandleFunc("POST /api/blackjack/stand", handle(c, func(empty) (any, string) { return c.stand() }))
	http.HandleFunc("POST /api/blackjack/double", handle(c, func(empty) (any, string) { return c.double() }))
	http.HandleFunc("POST /api/bonus", handle(c, func(empty) (any, string) { return c.claimBonus(today()) }))
	http.HandleFunc("POST /api/reset", handle(c, func(empty) (any, string) {
		c.Balance, c.Hand, c.HiLo = startBalance, nil, nil // unfinished rounds' stakes are forfeited; poker chips stay at the table
		return nil, ""
	}))
	http.Handle("/", http.FileServer(http.Dir("../frontend/dist"))) // serves the built front-end
	port := cmp.Or(os.Getenv("PORT"), "8081")                       // 8081 so it runs next to the Hipódromo (8080)
	log.Println("Rubi Royale aberto em http://localhost:" + port)
	log.Fatal(http.ListenAndServe(":"+port, nil))
}

// payout in centavos, rounded to the nearest centavo (float multipliers like 2.3 aren't exact).
func payout(amount int, mult float64) int { return int(math.Round(float64(amount) * mult)) }
