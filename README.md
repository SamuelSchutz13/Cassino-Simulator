<div align="center">

<img src="frontend/public/favicon.svg" width="96" alt="Ficha do Rubi Royale" />

# Rubi Royale · Gran Cassino

**Oito jogos de cassino, cada um com a sua mesa: caça-níquel, roleta, blackjack, dados, foguete, maior ou menor, bacará e pôquer.**

![Go](https://img.shields.io/badge/Go-1.27-00ADD8?logo=go&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-7-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)

</div>

> [!NOTE]
> Projeto de estudo, irmão do [Hipódromo Virtual](https://github.com/SamuelSchutz13/Hipodromo-Simulator). Todo o dinheiro do jogo é fictício.

## ✨ Jogos

| | Jogo | Como funciona |
| --- | --- | --- |
| 🎰 | **Caça-níquel "Super 7"** | Gabinete com luzes, alavanca e 3 rolos. Trinca paga até **250x**, e 7·7·7 ainda leva o **jackpot progressivo** (começa em R$ 500 e cresce 2% de cada giro); par nos dois primeiros rolos paga até 8x. Retorno teórico de ~95%. |
| 🎡 | **Roleta europeia** | Roda com os 37 números na ordem real, bola girando ao contrário e mesa de apostas com fichas: número (35:1), dúzia (2:1), cor, par/ímpar e metades (1:1). Desfazer, limpar e repetir aposta. |
| 🃏 | **Blackjack** | Mesa de feltro, cartas distribuídas do sapato, carta da banca virada até o fim. Pedir, parar e dobrar. Blackjack paga 3:2, a banca para em 17. |
| 🎲 | **Dados** | Dois dados rolando no feltro azul. Aposte se a soma vai ser menor que 7 (2,3x), exatamente 7 (5,8x) ou maior que 7 (2,3x). |
| 🚀 | **Foguete** | Escolha um alvo (1,01x a 100x) e lance: se o foguete passar do alvo antes de explodir, você ganha aposta × alvo. Retorno de 96% em qualquer alvo. |
| 🔼 | **Maior ou Menor** | Adivinhe se a próxima carta é maior ou menor. Cada acerto multiplica o prêmio (0,97 ÷ chance); saque quando quiser. |
| 🎴 | **Bacará** | Punto Banco com a tabela oficial de terceira carta. Jogador 1:1, Banca 0,95:1, Empate 8:1. |
| ♠️ | **Pôquer (Texas Hold'em)** | Mesa sem limite com 3 bots de personalidades diferentes (cautelosa, solta, agressiva) que avaliam a mão por simulação. Blinds R$ 0,50/R$ 1, desistir, mesa, pagar, aumentar e all-in, side pots e showdown. Você compra fichas (R$ 20 a R$ 200) e leva de volta ao sair. |

E mais: saldo numa cédula do "Banco Rubi Royale", **presente diário surpresa** (R$ 10 a R$ 500), cartão do **Clube Rubi** que sobe de nível (Bronze → Diamante) conforme você aposta, estatísticas da noite (com taxa de acerto e sequência), **missões diárias** (3 por dia, com prêmio), **13 conquistas** para desbloquear, painel lateral em abas (Noite, Missões, Jogadas, Troféus), letreiro com jackpot e dicas, saldo animado, tela de **grande vitória** (10x ou mais), guia **"Como jogar"** em cada jogo (tecla `?`), relógio da sessão com lembrete de pausa a cada 30 min, **gráfico do saldo** nas últimas 30 apostas, **atalhos de teclado** (1–8 trocam de jogo, Espaço joga, `?` abre as regras, e cada jogo tem as suas), valor da aposta lembrado por jogo, **instalável como app** no celular, **quadro-negro** com as últimas jogadas, confete nos prêmios grandes e **sons 100% sintetizados** (sem arquivos de áudio).

🎲 **O servidor decide tudo.** O navegador só anima o resultado que já veio pronto, então não dá pra trapacear pelo console.

## 🚀 Como rodar

Você precisa de **Go 1.27+** e **Node.js 22+**.

```sh
cd frontend
npm install
npm run build

cd ../backend
go run .
```

Abra **http://localhost:8081**. A porta é a 8081 para poder rodar junto com o Hipódromo (que usa a 8080); dá pra trocar com a variável `PORT`. Dá pra abrir direto num jogo: `/#slots`, `/#roulette`, `/#blackjack`, `/#dice`, `/#crash`.

**Desenvolvendo o front:** deixe o `go run .` ligado e rode `npm run dev` em `frontend/`. O Vite repassa `/api` para a porta 8081.

## 🧠 API

| Método | Rota | Corpo |
| --- | --- | --- |
| `GET` | `/api/state` | Saldo, estatísticas, mão de blackjack em andamento e bônus |
| `POST` | `/api/slots` | `{ amount }` |
| `POST` | `/api/roulette` | `{ bets: [{ kind, number, amount }] }`, `kind` = `numero`, `duzia`, `vermelho`, `preto`, `par`, `impar`, `baixo`, `alto` |
| `POST` | `/api/dice` | `{ amount, pick }`, `pick` = `menor`, `sete` ou `maior` |
| `POST` | `/api/crash` | `{ amount, target }`, `target` em centésimos (`250` = 2,50x) |
| `POST` | `/api/blackjack/deal` | `{ amount }` |
| `POST` | `/api/blackjack/hit` · `stand` · `double` | — |
| `POST` | `/api/baccarat` | `{ amount, pick }`, `pick` = `jogador`, `banca` ou `empate` |
| `POST` | `/api/hilo/start` · `guess` · `cashout` | `{ amount }` · `{ pick: "maior" \| "menor" }` · — |
| `POST` | `/api/poker/sit` · `rebuy` | `{ amount }` (fichas) |
| `POST` | `/api/poker/deal` · `leave` | — |
| `POST` | `/api/poker/act` | `{ action, amount }`, `action` = `fold`, `check`, `call` ou `raise` (`amount` = total da aposta na rodada) |
| `POST` | `/api/missions/claim` | `{ index }` (0 a 2) |
| `POST` | `/api/bonus` · `/api/reset` | — |

Valores em **centavos**. Toda resposta de jogada é `{ result, state }`.

## 📁 Estrutura

```
backend/
  main.go        servidor, saldo, histórico, bônus, salvamento
  games.go       caça-níquel, roleta, dados e foguete
  cards.go       maior ou menor e bacará
  poker.go       texas hold'em: mesa, bots, side pots
  achievements.go conquistas
  missions.go    missões diárias
  blackjack.go   blackjack
  casino_test.go testes (retorno do caça-níquel e dos dados, pagamentos, regras do blackjack, save)
frontend/src/
  App.tsx        lobby, cabeçalho, estatísticas
  components/    slots, roulette, blackjack, dice, crash, hilo, baccarat, poker, chips, board
  casino.css     visual de cada mesa
  lib/           api e sons
```

## 🧪 Testes

```sh
cd backend
go test ./...
```

## 💾 Salvamento

Saldo, estatísticas e a mão de blackjack em andamento ficam em `backend/save.json`. Apague para recomeçar.
