package main

import (
	"hash/fnv"
	"math/rand/v2"
)

// Daily missions: three per day from the pool, the same three all day.
type mission struct {
	Text   string
	Game   string // "" = any game
	Kind   string // bets: place N bets · wins: win N bets · big: one payout ≥ 5× its stake
	Goal   int
	Reward int
}

var missionPool = []mission{
	{"Faça 10 apostas em qualquer jogo", "", "bets", 10, 15_00},
	{"Ganhe 8 apostas em qualquer jogo", "", "wins", 8, 25_00},
	{"Ganhe um prêmio de 5x ou mais", "", "big", 1, 30_00},
	{"Gire o caça-níquel 15 vezes", "slots", "bets", 15, 15_00},
	{"Acerte 2 giros de roleta", "roulette", "wins", 2, 20_00},
	{"Ganhe 2 mãos de blackjack", "blackjack", "wins", 2, 20_00},
	{"Ganhe 3 vezes nos dados", "dice", "wins", 3, 20_00},
	{"Faça o foguete pagar 3 vezes", "crash", "wins", 3, 20_00},
	{"Saque 2 vezes no Maior ou Menor", "hilo", "wins", 2, 20_00},
	{"Jogue 5 rodadas de bacará", "baccarat", "bets", 5, 15_00},
	{"Ganhe 2 mãos de pôquer", "poker", "wins", 2, 25_00},
}

type missionDay struct {
	Day      string  `json:"day"`
	Picks    [3]int  `json:"picks"`
	Progress [3]int  `json:"progress"`
	Claimed  [3]bool `json:"claimed"`
}

// dailyMissions rolls the missions over when the date changes. Caller holds c.mu.
func (c *casino) dailyMissions() *missionDay {
	if d := today(); c.Missions.Day != d {
		h := fnv.New64a()
		h.Write([]byte(d))
		perm := rand.New(rand.NewPCG(h.Sum64(), 7)).Perm(len(missionPool))
		c.Missions = missionDay{Day: d, Picks: [3]int(perm[:3])}
	}
	return &c.Missions
}

// trackMissions counts a settled bet toward today's missions. Caller holds c.mu.
func (c *casino) trackMissions(game string, amount, payout int) {
	m := c.dailyMissions()
	for i, p := range m.Picks {
		ms := missionPool[p]
		if ms.Game != "" && ms.Game != game {
			continue
		}
		if ms.Kind == "bets" || (ms.Kind == "wins" && payout > amount) || (ms.Kind == "big" && payout >= 5*amount) {
			m.Progress[i] = min(m.Progress[i]+1, ms.Goal)
		}
	}
}

type missionView struct {
	Text     string `json:"text"`
	Game     string `json:"game"`
	Goal     int    `json:"goal"`
	Progress int    `json:"progress"`
	Reward   int    `json:"reward"`
	Claimed  bool   `json:"claimed"`
}

func (c *casino) missionViews() []missionView {
	m := c.dailyMissions()
	out := make([]missionView, 3)
	for i, p := range m.Picks {
		ms := missionPool[p]
		out[i] = missionView{ms.Text, ms.Game, ms.Goal, m.Progress[i], ms.Reward, m.Claimed[i]}
	}
	return out
}

type indexReq struct {
	Index int `json:"index"`
}

func (c *casino) claimMission(req indexReq) (any, string) {
	m := c.dailyMissions()
	if req.Index < 0 || req.Index > 2 {
		return nil, "missão inválida"
	}
	ms := missionPool[m.Picks[req.Index]]
	if m.Claimed[req.Index] || m.Progress[req.Index] < ms.Goal {
		return nil, "missão ainda não concluída"
	}
	m.Claimed[req.Index] = true
	c.Balance += ms.Reward
	if m.Claimed == [3]bool{true, true, true} {
		c.unlock("missoes")
	}
	return ms.Reward, ""
}
