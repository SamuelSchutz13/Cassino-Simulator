package main

import "slices"

type achievement struct {
	ID   string `json:"id"`
	Icon string `json:"icon"`
	Name string `json:"name"`
	Desc string `json:"desc"`
}

var achievementList = []achievement{
	{"primeira", "🥇", "Primeira vitória", "Ganhe qualquer aposta"},
	{"cem", "💯", "Frequentador", "Faça 100 apostas"},
	{"jackpot", "🎰", "Jackpot!", "Tire 7·7·7 no caça-níquel"},
	{"natural", "🃏", "Blackjack natural", "Receba um blackjack nas duas primeiras cartas"},
	{"zero", "🟢", "Na mosca", "Acerte o zero na roleta"},
	{"foguete", "🚀", "Astronauta", "Saque com alvo de 10x ou mais no Foguete"},
	{"hilo5", "🔮", "Vidente", "Acerte 5 seguidas no Maior ou Menor"},
	{"pote", "♠️", "Primeiro pote", "Ganhe uma mão de pôquer"},
	{"fullhouse", "🏠", "Mão de respeito", "Vença um showdown de pôquer com full house ou melhor"},
	{"blefe", "😎", "Ninguém pagou", "Leve um pote depois do flop sem mostrar as cartas"},
	{"grande", "💰", "Bolada", "Receba R$ 500 ou mais de uma vez"},
	{"rico", "👑", "Magnata", "Chegue a R$ 1.000 entre saldo e fichas"},
	{"missoes", "🏅", "Dia produtivo", "Resgate as 3 missões do mesmo dia"},
}

// unlock marks an achievement as earned (once). Caller holds c.mu.
func (c *casino) unlock(id string) {
	if !slices.Contains(c.Achievements, id) {
		c.Achievements = append(c.Achievements, id)
	}
}

type achievementView struct {
	achievement
	Unlocked bool `json:"unlocked"`
}

func (c *casino) achievementViews() []achievementView {
	out := make([]achievementView, len(achievementList))
	for i, a := range achievementList {
		out[i] = achievementView{a, slices.Contains(c.Achievements, a.ID)}
	}
	return out
}
