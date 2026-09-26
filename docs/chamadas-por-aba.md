# O que o script pede ao jogo, por aba

Levantado em 26/09/2026 (v3.14.0) para responder "quantas chamadas cada funcionalidade faz e quando".
`socket` = mensagem pelo WebSocket do jogo (barata, o próprio cliente faz o tempo todo); `REST` = chamada
HTTP à API do jogo com o token da conta; `público` = arquivo estático sem token.

Regra do jogo desde 26/09/2026 (anúncio colado pelo usuário): **não** comprar/vender no NPC Mark, vender
Pokémon, usar o Mercado Global nem o Depot **durante a hunt**. Por isso toda venda/compra é uma
**viagem à cidade** (aba Sistema): sair da hunt → cidade → tarefas → voltar.

## Sempre ligado (qualquer aba)

| O quê | Como | Quando |
|---|---|---|
| Estoque de bolas | `balls-get` (socket) | a cada 5 min e 1,5 s após cada captura (só com alerta/compra de bolas ligado) |
| Lista de Pokémon (time, IV, box) | `pokes-get` (socket) | a cada 5 min e após cada captura (nível/rota, venda de Pokémon ou rota de captura ligadas) |
| Aviso no Discord | webhook (fora do jogo) | por evento |

## 🔔 Avisos

| O quê | Como | Quando |
|---|---|---|
| Detalhes da captura (IV/qualidade) | chega sozinho no `poke-delta`; `pokes-get` só se o delta vier incompleto | por captura |
| Cadeado no avisado | `POST /api/game/pokemon/lock` (REST) | por captura que passou nos filtros, se ligado |
| Depósito da família | `family-action` (socket) | idem, se ligado |

## 🛒 Compras

| O quê | Como | Quando |
|---|---|---|
| Compra de bolas | viagem à cidade → `GET /api/game/shop` + `POST /api/game/shop/buy` (REST) | uma vez por episódio de estoque abaixo do limite (bola zerada some do frame `balls`; vale 0) |

## 💰 Venda

| O quê | Como | Quando |
|---|---|---|
| Itens (drops marcados) | viagem → `GET /api/game/depot` + `GET /api/game/item/lock` + `POST /api/game/shop/sell` | vencido o intervalo (10–15 min sorteado, configurável) |
| Pokémon fora do time | viagem → `POST /api/game/pokemon/sell` (lotes de 50; lote recusado vira um por um) | vencido o intervalo (10–15 min sorteado, configurável) |
| Catálogo de itens | `GET /game/items.json` (público) | uma vez por carga |

Uma viagem faz tudo que estiver pendente; quem já tem o que vender/comprar vai junto ("carona"), mesmo
sem ter vencido o próprio intervalo. Intervalo mínimo entre viagens: 3 min (configurável).

## ⚔ Treino

| O quê | Como | Quando |
|---|---|---|
| Troca de líder | `poke-summon` (socket) + `pokes-get` para confirmar | quando o líder chega ao nível |
| Troca de hunt da rota | `leave-hunt` + `enter-hunt` + `pending-get` (socket) + `hunt-resume` sintético só para a tela | quando o time chega ao nível da etapa |

## 📖 Profissão (rota de captura)

| O quê | Como | Quando |
|---|---|---|
| Hunts e espécies | `GET /api/game/map-markers` + `GET /game/creatures.json` (públicos) | uma vez por carga |
| Pokédex (capturadas) | `GET /api/game/pokedex` (REST) | ao ligar e após cada captura (mín. 30 s) |
| Profissão (rank) | `GET /api/game/professions` (REST) | ao ligar e no "Atualizar Pokédex" |
| Troca de hunt | `leave-hunt` + `enter-hunt` + `pending-get` (socket) | a cada espécie capturada |
| Bola automática | `catch` (socket) | quando a espécie da vez entra na fila, se ligada |

É a aba que mais gera tráfego enquanto está ligada: cada captura vira uma troca de hunt e uma leitura
da Pokédex. Fora disso, nada.

## ⚙ Sistema

| O quê | Como | Quando |
|---|---|---|
| Daily Kill | `GET /api/game/daily-kill` (REST); `POST .../claim` na meta | a cada 30 s na hunt da missão, 2 min fora dela; só com a Daily ligada |
| Recarga do painel | reload da página + `enter-hunt` na volta | intervalo configurável |
| Viagem à cidade | `leave-hunt`, `field-teleport-city` sintético (tela), `set-city` se a tela não viajar, tarefas, `enter-hunt` + `hunt-resume` sintético | quando há venda/compra pendente |

## Ideias para pedir ainda menos (não feitas)

- Sortear os timers de 5 min por conta, para os 4 painéis não baterem juntos.
- Juntar `balls-get`/`pokes-get` pós-captura numa leitura a cada 10 s durante a rota de captura.
- Daily: ler só depois de um abate da espécie da missão, com mínimo de 1 min.
- Pausa de descanso sorteada (5–15 min a cada 1–2 h) e janela de sono.
