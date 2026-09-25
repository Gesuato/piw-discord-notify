# Roadmap

Ideias planejadas para o PIW Discord Notify. Para implementar uma delas, use no Claude Code:

```
/feature 1          # pelo número
/feature bolas      # ou por uma palavra do título
```

Cada item traz o que o jogo manda pelo WebSocket, a config e a UI previstas e o que ainda
precisa ser confirmado. Status: ⬜ pendente · 🔧 em andamento · ✅ feita.

Referências de protocolo: `CLAUDE.md` (seção "Fatos sobre o jogo"),
[piwdex](https://github.com/edulanzarin/piwdex) (`src/lib/robo/motor/sessao.ts`) e
[poke-standalone-scripts](https://github.com/luishferreira/poke-standalone-scripts) (`AGENTS.md`).

---

## ✅ 0. Webhook por evento (v2.4.0)

Três webhooks no painel: capturas (principal), shinys e alertas. Os opcionais caem no principal
quando vazios. Todo envio passa por `postWebhook(kind, payload, meta)` com `kind` em
`capture | shiny | alert`. Os itens abaixo que são "alertas" devem usar `kind: 'alert'`.

---

## ⬜ 1. Shiny apareceu na fila

**O que faz:** avisa assim que um shiny entra na fila de captura, antes de qualquer tentativa.
Dá tempo de capturar na mão se o autocatch falhar ou estiver sem bola.

**Mensagem do jogo:** `pending` → `{ type:'pending', list:[{ id, pokeId, name, level, shiny, at }] }`.
Chega a cada abate e substitui a fila anterior. Formato confirmado.

**Lógica:** guardar os `id` já avisados (Set, limpa quando o `id` some da fila). Para cada item
com `shiny: true` e `id` novo → `postWebhook('alert', ...)` com nome, nível e conta.
Não repetir enquanto o mesmo `id` continuar na fila.

**Config/UI:** checkbox "Avisar shiny na fila" (`alertShinyPending`, padrão ligado).

**Pendências:** nenhuma; formato já confirmado.

---

## ✅ 2. Bolas acabando (v2.5.0)

**O que faz:** avisa quando o estoque de uma bola cai abaixo de um limite. Evita descobrir horas
depois que o autocatch parou por falta de bola.

**Mensagem do jogo:** `balls` → `{ type:'balls', counts:{ <ballId>: qty, ... } }`. O cliente pede
com `{ type:'balls-get' }`. IDs conhecidos: Poke Ball 1, Great Ball 2, Super Ball 3, Ultra Ball 4,
Idle Ball 6. O `catch-result` também traz `ballId`/`ballName` da bola que está sendo usada.

**Lógica:** ao receber `balls`, comparar `counts[ballId]` com o limite. Avisar uma vez ao cruzar
para baixo (guardar "já avisei" por bola; resetar quando o estoque subir acima do limite de novo).
Opcional: pedir `balls-get` a cada N minutos com `sendGame({ type:'balls-get' })`, já que o jogo só
manda `balls` quando algo muda.

**Config/UI:** campo "Avisar quando a bola do autocatch ficar abaixo de: N" (`ballsMin`, padrão 0 =
desligado). Usar a bola do último `catch-result` como "a bola em uso", ou um select de bola.

**Implementado em v2.5.0:** `handleBalls` / `checkBallStock` / `requestBalls` no script. Select
de bola (`ballsWatch`, 'auto' = bola do último `catch-result`) + limite (`ballsMin`). Pede
`balls-get` 3s após rastrear o socket, 1,5s após cada captura e a cada 5 min. O parse aceita
`counts` com chaves string ou número. O frame `balls` é gravado no log (`kind: 'balls'`) — conferir
no disco se o jogo também o emite sozinho; se sim, dá para reduzir os pedidos.

**Compra automática (v2.6.0):** `autoBuy`, `autoBuyQty`, `autoBuyGoldReserve`. Quando o estoque cruza o
limite e `autoBuy` está ligado, `autoBuyBalls` compra via REST (`GET /api/game/shop` para gold/preço,
`POST /api/game/shop/buy { ballId, qty }` em lotes de 1000, token de `sessionStorage['pokeweb:tokens']`
com refresh em 401) e avisa o resultado no canal de alertas. Uma tentativa por episódio; rearma quando o
estoque volta acima do limite ou ao Salvar. **v3.1.1:** com `autoBuy` ligado e `ballsMin` 0, o limite efetivo
vira 1 (`effectiveBallsMin`) — antes essa combinação desligava a checagem e a conta ficava sem bola sem aviso.

---

## ✅ 2b. Venda automática de drops da hunt atual (v2.7.0)

**O que faz:** vende ao NPC, periodicamente, o excedente dos itens que o usuário marcou entre os que
caem na hunt onde ele está agora.

**Mensagens/REST:** `enter-hunt`/`leave-hunt` (enviados pelo cliente) dão a hunt atual; `field-kill.loot[]`
dá os itens que caem nela; `GET /game/items.json` (público) traz categoria, `npcPrice` e `rare`;
`GET /api/game/depot` a mochila; `GET /api/game/item/lock` os cadeados; `POST /api/game/shop/sell
{ items:[{itemId, qty}] }` vende.

**Regras fixas:** nunca preço 0 nem item com cadeado do jogo. Desde a v3.1.0 (pedido do usuário) categoria
fora de `loot`, `rare: true` e nome com Pheromone/Stone só mostram aviso ⚠️ e podem ser marcados. Lista
BRANCA (`sellItems: { id: { keep } }`) + reserva por item. Intervalo `sellEveryMin` a
`sellEveryMaxMin` (v2.8.0): sorteado a cada ciclo; máximo 0 ou ≤ mínimo = fixo. Perfis por hunt em
`sellProfiles[slug] = { items, everyMin, everyMaxMin }`: carregados em `setHunt`, gravados em Salvar/Vender agora. Cadeados ilegíveis = venda
cancelada (o jogo recusa o lote inteiro se um travado entrar).

**Pendências:** o frame `inventory` do WebSocket não é usado (a mochila é lida por REST na hora de
vender). O shape de `field-kill.loot` veio do piwdex; o script loga `hunt` e `venda` para conferir.

---

## ⬜ 3. Desconectou / reconectou

**O que faz:** avisa quando o socket do jogo cai e não volta em X minutos, e quando volta.

**Mensagem do jogo:** eventos `close`/`open` do próprio WebSocket (o script já rastreia os
sockets em `trackSocket`). Códigos de fechamento observados no piwdex: `4001 unauthorized`,
`4003 wrong-shard`, `4004`, `4006 ip-limit`.

**Lógica:** em `close`, iniciar timer de `disconnectGraceMin` minutos; se nenhum socket novo abrir
até lá → alerta "conta X caiu (código N)". Quando um novo socket abrir depois de um alerta →
alerta "conta X voltou". Ignorar quedas curtas (o jogo reconecta sozinho).

**Config/UI:** campo "Avisar se ficar desconectado por mais de N min" (`disconnectGraceMin`,
padrão 0 = desligado).

**Pendências:** o PokeGrid recarrega o painel em alguns casos; o script roda uma vez por documento,
então o alerta de "voltou" pode não sair se o reload acontecer. Aceitável.

---

## ⬜ 4. Boss derrotado ou perdido

**O que faz:** avisa o resultado de boss com o loot.

**Mensagem do jogo:** `field` → `field.bossOutcome`, `field.bossLoot`, `field.fainted`,
`field.mobs` (nomes observados no AGENTS.md do poke-standalone-scripts, usados pelo auto-boss).

**Lógica:** ao receber `field` com `bossOutcome` definido e diferente do último visto →
`postWebhook('alert', ...)` com resultado e itens do loot.

**Config/UI:** checkbox "Avisar resultado de boss" (`alertBoss`, padrão ligado).

**Pendências:** formato exato de `bossOutcome` e `bossLoot` NÃO confirmado. Primeiro passo:
logar `field` quando tiver `bossOutcome` (evento no `pgDiscordNotifyLog`), rodar um boss e ler o
log do disco. Ver `src/auto-boss.js` no poke-standalone-scripts para o que já é lido.

---

## ⬜ 5. Box cheio

**O que faz:** avisa quando a conta está perto do limite de Pokémon (o jogo para de capturar).

**Mensagem do jogo:** `pokes` → `{ type:'pokes', list:[ ... ] }` (resposta a `pokes-get`).
`list.length` é o total de Pokémon. O limite do box NÃO vem nessa mensagem.

**Lógica:** ao receber `pokes`, se `list.length >= boxAlertAt` → alerta uma vez (resetar quando
cair abaixo). Como o jogo só manda `pokes` sob pedido, pedir `pokes-get` periodicamente (o
piwdex faz isso a cada `POKES_MS`).

**Config/UI:** campo "Avisar quando o box tiver N ou mais Pokémon" (`boxAlertAt`, padrão 0 =
desligado).

**Pendências:** descobrir de onde vem o limite do box (talvez `/api/characters/me` em
`window.__poke.api`). Se não achar, o usuário informa o limite no campo.

---

## ⬜ 6. Sprite do Pokémon no embed

**O que faz:** miniatura do Pokémon capturado na mensagem do Discord.

**Mensagem do jogo:** `poke-delta.poke.looktype` (ex.: 400 para Larvitar) e `speciesId`.

**Lógica:** montar a URL do sprite e colocar em `embeds[0].thumbnail.url`. O Discord baixa a
imagem, então a URL precisa ser pública.

**Pendências:** descobrir a URL do sprite. Abrir o jogo, inspecionar a `<img>` de um Pokémon na
box e ver o padrão (algo como `/sprites/<looktype>.png` ou `/pokemon/<speciesId>.gif`). Testar se
o Discord consegue baixar (sem cookie/token).

---

## ⬜ 7. Resumo diário

**O que faz:** uma mensagem por dia por conta: total de capturas, quantos por raridade, melhor
poder, shinys. Útil para quem não quer aviso por captura.

**Lógica:** acumular contadores em `localStorage` (por dia, chave `pgDiscordNotifyStats`).
Enviar quando virar o dia (comparar a data do último envio ao receber qualquer mensagem) ou num
horário configurado. Como o script só roda com o painel aberto, o resumo sai na primeira
oportunidade após o horário.

**Config/UI:** checkbox "Enviar resumo diário" + campo de horário (`dailySummary`, `dailyAt`).
Deve continuar funcionando mesmo com o filtro de qualidade ligado (conta tudo, avisa só o resumo).

**Pendências:** nenhuma no protocolo; decidir se o resumo vai no canal de capturas ou de alertas.

---

## ✅ 8. Exportar / importar config (v2.9.0)

**O que faz:** copiar a config de um painel e colar em outro (o `localStorage` é por painel).

**Lógica:** botão "Exportar" copia `JSON.stringify(cfg)` (com o mesmo fallback de clipboard do
"Copiar log"); botão "Importar" abre um `<textarea>` no painel (não usar `prompt()`: o PokeGrid
não suporta) e faz `saveCfg(JSON.parse(texto))` com validação básica.

**Config/UI:** dois botões na linha de Salvar/Testar.

**Implementado em v2.9.0:** botões Exportar config (copia o JSON de `cfg` com marcador `_piwDiscordNotify`)
e Importar config (textarea no painel + "Aplicar"; valida JSON e a presença de `webhookUrl`; opção de manter os
webhooks do painel de destino). A config exportada contém os webhooks — não colar em lugar público.

---

## ✅ 11. Rota de treino (v3.3.0)

**O que faz:** lista de etapas `hunt nível` (ex.: `pidgey 10` / `larvitar 15`). Com "Seguir a rota", o nível
da etapa atual vira o alvo do alerta de nível e a troca de líder fica ligada. Quando TODOS do time chegam ao
nível da etapa, o script avisa (webhook de nível), sai da hunt e entra na próxima, e avança a etapa. No fim,
avisa "Rota concluída" e para.

**Mensagens do jogo:** `leave-hunt` → 600 ms → `enter-hunt { slug }` + `pending-get` (mesma sequência do
piwdex `cacar()` e do auto-reconnect). Entrada confirmada por `field`/`field-init` em até 30 s; sem frame,
tenta de novo uma vez e depois avisa "não consegui entrar". O slug é o mesmo que aparece em "Hunt atual".

**Config:** `route: [{ slug, level }]`, `routeEnabled`, `routeStage` (persistido: sobrevive a reload; editar a
rota volta para 0; botão "Reiniciar rota"). Funções: `routeActive`/`routeStep`/`levelTarget`/`swapEnabled`/
`advanceRoute`/`switchHunt`/`confirmHuntSwitch`.

**Pendências:** se a etapa seguinte tiver nível ≤ atual, avança em cadeia (esperado). Não verifica se a conta
tem acesso à hunt; a falha aparece como "entrada não confirmou".

---

## ✅ 12. Recarga automática do painel (v3.4.0)

**O que faz:** recarrega a página deste painel sozinho, a cada X–Y minutos sorteados (mesma faixa da venda
automática), como o botão "⟳ Atualizar tudo" do PokeGrid — só que por painel, cada um no seu horário.

**Como o PokeGrid faz:** `reloadAll` chama `webview.reloadIgnoringCache()` em cada painel ligado. Quem tira a
conta da hunt no reload é a SPA do jogo, que nasce em Cerulean e manda `set-city` ao montar; o servidor
continua farmando se receber `enter-hunt` de novo (comentário do "↩ Voltar pra hunt" experimental do app).

**Lógica:** `reloadTick` a cada 30 s; vencido o horário, guarda `{ at, slug, lastSellAt, ballAlerted,
autoBuyAttempted, levelAlerted }` em `localStorage.pgDiscordNotifyResume` e faz `location.reload()`. Na carga
seguinte, `loadResume()` (válido por 5 min) restaura esses estados e `armResume()` manda `enter-hunt` +
`pending-get` via `switchHunt(slug, 1, 'recarga')` 3 s depois do `set-city` da montagem (fallback: 12 s do
socket), só se nenhum `field`/`field-init` chegou. Não recarrega com venda, troca de hunt/líder ou captura
aguardando `poke-delta` (adia até 10 min). Falha em voltar avisa no webhook de alertas.

**Config/UI:** `reloadEnabled`, `reloadEveryMin` (60), `reloadEveryMaxMin` (0 = fixo); bloco "Recarga
automática" no painel com status "próxima em N min" e botão "Recarregar agora". Teste: `node test/reload.test.js`.

**Pendências:** validar ao vivo que a volta pela mensagem `enter-hunt` mantém o farm (o PokeGrid avisa que a
TELA pode seguir mostrando a cidade enquanto o servidor farma).

---

## ✅ 13. Guardar o Pokémon avisado: cadeado e depósito da família (v3.6.0)

**O que faz:** dois toggles na aba Avisos ("Guardar o Pokémon avisado"): 🔒 **Travar no jogo** e 📦 **Mandar
para o depósito da família**. Todo Pokémon que passa nos filtros (nome + qualidade, ou shiny) é guardado ANTES
do aviso, e o aviso diz o resultado ("🔒 Travado no jogo", "📦 Guardado no depósito da família" ou o motivo
da falha).

**Mensagens do jogo:** cadeado = `POST /api/game/pokemon/lock { id, locked:true }` (mesmo da loja/mercado; a
venda em lote da loja exclui travados). Família = `family-action { action:'poke', dir:'deposit', capturedId }`
pelo socket; confirmação quando o frame `family` seguinte traz o id em `depot.pokes`, falha em `error { message }`,
sem família, depósito congelado ou limite diário (`movesUsed/movesCap`). O id do indivíduo vem do `poke-delta`.
`poke-store` NÃO serve: só tira do time para o box comum, que é justamente de onde a loja vende.

**Config/UI:** `lockNotified`, `familyNotified` (padrão desligados). Log: `poke-lock`, `poke-familia`,
`familia`, `erro-jogo`, `guardar`. Teste: parte final de `node test/ui.smoke.js`.

**Pendências:** formato do frame `family` visto só no bundle; confirmar no log na primeira vez que rodar ao
vivo. Se o `poke-delta` atrasar mais de 4 s, avisa sem guardar (registrado no log).

---

## ✅ 14. Importar rota de treino do PIW Tools (v3.7.0)

**O que faz:** na aba Treino, "Importar do PIW Tools" abre uma caixa onde o usuário cola o texto da aba
"Rota otimizada" de https://piwtools.com.br/hunt (selecionar as etapas na página e Ctrl+C). O script lê os
blocos "De / Até / Hunt desta etapa", converte cada um em `hunt nível` (nível = "De" da etapa seguinte; na
última, o "Até"), preenche a rota e avisa as evoluções previstas pelo site (o script não evolui o Pokémon).
"Copiar link do PIW Tools" copia a URL do gerador já com o líder e o nível atuais.

**Por que texto colado:** o site calcula tudo no navegador com simulador próprio e dados públicos
(`/creatures.json`, `/map-markers.json`); não há API e o "Copiar link" do site não inclui as etapas geradas.
Reimplementar o cálculo seria copiar conteúdo autoral (aviso no próprio site). Créditos: Rakupo / bar (gcanivel).

**Config/UI:** sem chave nova (escreve em `cfg.route` via o textarea; precisa Salvar). Log: `rota-import`.
Teste: `node test/ui.smoke.js` (bloco "importar rota do PIW Tools").

**Pendências:** o texto copiado depende do layout do site; se mudarem os rótulos "De/Até/Hunt desta etapa", o
parser precisa acompanhar.

---

## ✅ 15. Daily Kill: voltar para a hunt quando a missão do dia terminar (v3.8.0)

**O que faz:** a "Daily Kill" (menu Quests, Tasks & Dailys) pede para derrotar N de um Pokémon escolhido entre 3.
O usuário escolhe a missão e entra na hunt do Pokémon na mão; quando a meta bate, o script resgata a recompensa
(opcional), sai da hunt e volta para a hunt de antes. Aviso no canal de Alertas com XP/itens e o destino.

**Como o jogo faz (bundle do cliente, 25/09/2026):** não passa pelo socket. `GET /api/game/daily-kill` →
`{ locked, minLevel, claimed, pickedIdx (-1 = não escolheu), resetAt, reward:{ xp, items }, options:[{ name,
speciesId, have, qty, done, xp, type1 }], cards, rerollCost, rerollMax, rerolls }`; `POST /api/game/daily-kill/claim`
→ `{ state, payout:{ xp, totalXp, level, leveledUp, items:[{ label }] } }`; `/pick { idx }` e `/reroll` existem, mas
o script não escolhe missão. A janela do jogo repete o GET a cada 5 s. `GET /api/game/dailys-summary` traz o resumo
(`kill:{ locked, claimed, picked, qty, have }`, `catch:{ used, total }`, `tasks:{ ready }`); a Daily Catch é outra
missão (capturas premiadas), fora do escopo.

**Lógica (`dailyTick`, módulo "Daily Kill"):** consulta a cada 30 s na hunt da daily (2 min fora dela) e a cada
`field-kill` da espécie da missão conta o abate, antecipando a consulta quando a meta parece batida. "Na hunt da
daily" = slug da hunt igual ao nome da missão OU abates da espécie vistos na hunt atual. Destino da volta:
`dailyReturnSlug` > etapa atual da rota > hunt anterior (`prevHuntSlug`, guardado em `setHunt` e no registro da
recarga). Troca via `switchHunt(slug, 1, 'daily')` (leave-hunt → enter-hunt, confirmação por `field`). Um tratamento
por missão (`resetAt`); missão já resgatada quando o script a viu pela primeira vez não gera volta.

**Config/UI:** `dailyEnabled`, `dailyClaim` (padrão ligado), `dailyReturnSlug`; seção "Daily Kill" na aba Treino com
status ("Pidgey 3/5 · na hunt da daily · volta para larvitar"). Teste: `node test/daily.test.js`.

**Pendências:** confirmar ao vivo o formato de `options[].done`/`have` e o payout do claim (levantados só no bundle).
Não entra na hunt da daily sozinho (o usuário escolhe a missão e entra).

---

## ✅ 16. Rotas salvas com menu de troca (v3.9.0)

**O que faz:** várias rotas de treino guardadas por nome (ex.: uma por Pokémon que está upando), com um menu
na aba Treino para trocar a ativa na hora. Cada rota lembra a própria etapa: sair da rota "Dratini" na etapa 3 e
voltar depois continua da etapa 3.

**UI (seção "Rota de treino"):** barra `[ menu de rotas ▾ ] [＋ Nova] [✎] [🗑]` acima do texto das etapas. O menu
mostra `nome · etapa i/n: hunt` (ou `vazia`/`concluída`). Trocar no menu, criar, renomear e excluir agem NA HORA
(salvam a config, como o "Reiniciar rota"); só o texto das etapas continua passando pelo Salvar. Se havia edição
pendente, a troca/criação/exclusão salva antes (o que está na tela pertence à rota atual). "＋ Nova" e "✎" abrem
uma caixa de nome inline (Enter confirma, Esc cancela); "🗑" pede 2 cliques. Na linha de status aparece
"→ ir para <hunt>" quando a conta não está na hunt da etapa atual (manda `switchHunt(slug, 1, 'painel')`).

**Config:** `routes: { nome: { route, stage } }` e `routeName`; `route`/`routeStage` continuam sendo a rota ATIVA
(mesmo padrão de `sellItems`/`sellProfiles`). `saveCfg` espelha a ativa em `routes[routeName]`; `migrateCfg` (usado
no `loadCfg` e no Importar config) transforma config antiga (só `route`) na rota "Rota 1"; Salvar com etapas e sem
nome cria "Rota 1" sozinho. Funções no módulo de nível: `routeNames`/`uniqueRouteName`/`storeActiveRoute`/
`activateRoute`/`createRoute`/`renameRoute`/`deleteRoute`. Testes: `node test/route.test.js` (bloco "rotas
nomeadas") e o smoke do painel.

---

## ✅ 17. Rota de captura — aba Profissão (v3.10.0)

**O que faz:** captura todas as espécies, hunt por hunt, da de menor nível à de maior, pulando as que a conta já
tem na Pokédex. Entra na hunt da espécie da vez; quando um `catch-result` de sucesso dela chega (captura manual,
Auto-Catch VIP ou a bola que o próprio script joga), marca, avisa no canal de Alertas ("capturou X (12/137) —
próximo: Y (lv 10)") e vai para a próxima. Sem espécie faltando: avisa "rota concluída" e desliga.

**Fontes (bundle + arquivos públicos, 25/09/2026):** `GET /api/game/map-markers` (público) → `hunts[{ slug, name,
level, area, looktype }]` (454 hunts; level 0 = cidade; áreas kanto/orre/outland/nightmare); `GET /game/creatures.json`
(público) → `creatures[{ pokeId, name, looktype, huntLevel, rarity }]` (pokeId < 10000 = espécie normal, as que a
Pokédex lista); `GET /api/game/pokedex` (auth) → `species[{ id, caught, kills, unlocked, claimed }]`;
`GET /api/game/professions` (auth) → `{ profession, rankKey, speciesCount, nextStep:{ toRankKey, species:{ have,
need } } }` (só para o status). Espécie da hunt = criatura com o mesmo `looktype` (pokeId < 10000; empate = nome
igual, senão o menor id; "nidoranfe" → Nidoran Female). `field-init { slug }` agora também define a hunt atual
quando o script carregou depois do `enter-hunt`.

**Lógica (módulo "Rota de captura"):** `catchScope()` = hunts das áreas marcadas até `catchRouteMaxLevel`, uma por
espécie, ordem nível → nome; `catchPlan()` = escopo menos capturadas (Pokédex + `catchRouteDone`), `catchRouteSkipped`
e falhas de entrada da sessão. `catchNext()` pega a 1ª e chama `switchHunt(slug, 1, 'captura')`; entrada não confirmada
ou `error` do jogo durante a entrada pula a hunt. `catchOnPending()` joga `{ type:'catch', pendingId, ballId }` na
espécie da vez (respeita `catch-cooldown`/`cooldownMs`, 1,5 s entre bolas, estoque 0 não joga). `catchOnResult()`
marca qualquer espécie do escopo capturada (avança se era o alvo). `catchTick` (60 s) volta para a hunt do alvo se
a conta está parada fora de hunt há 2 min. Excludente com "Seguir a rota" (Salvar desliga a outra). A Daily volta
para a hunt do alvo quando a rota de captura está ligada.

**Config/UI:** `catchRouteEnabled`, `catchRouteAreas` (padrão kanto), `catchRouteMaxLevel`, `catchRouteAuto`,
`catchRouteBall` ('auto' = última usada), `catchRouteSkipped`, `catchRouteDone`. Aba **📖 Profissão**: liga/desliga,
áreas, nível máximo, bola automática, status ("alvo Pidgey (lv 1, kanto) · na hunt · 12/137 feitas, faltam 125 ·
Pokédex 88/410"), próximas 8, botões Pular esta / Atualizar Pokédex / Limpar puladas, e a profissão (rank, espécies
capturadas, próximo rank). Teste: `node test/catch.test.js`.

**Pendências:** confirmar ao vivo `field-init.slug`, o `error` de hunt recusada e se hunts de nível alto exigem
nível do treinador (hoje a falha só pula). Não escolhe a profissão nem sobe de rank.

---

## ✅ 18. Venda automática de Pokémon fora do time + abas Compras/Venda (v3.11.0)

**O que faz:** vende os Pokémon que NÃO estão no time por duas faixas de raridade: abaixo de uma raridade (padrão
Legendary) vende se o poder (ivTotal) for menor que X; nessa raridade e acima, vende se for menor que Y (0 = não
vende a faixa). Nunca vende: no time/líder, inicial, shiny, com cadeado 🔒 (inclui os "guardados" pelo aviso), sem
valor de venda, sem IV na lista, ou capturado nos últimos 2 min. A aba "🎯 Bolas" virou "🛒 Compras" (estoque +
compra automática) e a aba "💰 Venda" tem duas seções: "Itens: venda automática dos drops" e "Pokémon fora do time".

**Mensagens/REST:** frame `pokes` (resposta a `pokes-get`, a cada 5 min e após capturas; `requestPokes` agora também
roda com a venda de Pokémon ligada, sem alvo de nível) → `list[{ id, name, level, team, leader, starter, shiny,
locked, sellValue, ivTotal, quality }]`; `POST /api/game/pokemon/sell { pokeIds }` → `{ gold, goldGained, sold }`
(lotes de 50). `poke-delta` marca a captura recente (`noteRecentCapture`).

**Lógica (módulo "Venda automática de Pokémon"):** `pokeSellReason(p, d)` devolve o motivo de não vender (ou null);
`pokeSellCandidates(d, list)`; `pokeSellOnPokes(list)` guarda a lista (prévia do painel) e vende no máximo uma vez
por 60 s, nunca com captura aguardando `poke-delta`; `runPokeSellCycle(manual)` faz o POST, avisa no canal de
Alertas (lista até 15 vendidos, gold), pede `pokes-get` de novo. Venda parcial/erro também avisa.

**Config/UI:** `pokeSellEnabled`, `pokeSellTier` ('legendary'), `pokeSellIvLow`, `pokeSellIvHigh`. Seção com o
seletor da raridade-fronteira, os dois limites, a prévia "N fora do time · M dentro das regras: Rattata lv5 Common
40/192 · …" calculada com o que está na tela, botões "Vender Pokémon agora" (salva só as regras) e "Atualizar
lista". Teste: `node test/pokesell.test.js`.

**Pendências:** confirmar no log que o frame `pokes` traz `starter`/`locked`/`sellValue` (levantado do bundle, v3.6.0);
sem esses campos o script só confia em `team`/`shiny`/IV.

---

## ❌ 10. Config compartilhada entre painéis (descartada)

Tentada na v3.0.0 e revertida na v3.0.1 a pedido do usuário: como o PokeGrid isola cada painel
(partição `persist:contaN`) e não tem ponte entre eles, a única solução era um mini-servidor local
(`sync-server.js`) rodando no PC, o que foi considerado complicado demais. O caminho oficial para
copiar config entre contas é **Exportar / importar config** (item 8). Não propor de novo sem o
usuário pedir. O código está no histórico do git (commit `25174b0`) caso volte a interessar.

---

## ✅ 9. Nível alvo do líder + troca automática de líder (v3.2.0)

**O que faz:** avisa (em webhook próprio, `webhookLevel`, que cai no de alertas e depois no principal)
quando o líder do time chega ao nível configurado (`levelAlertAt`, 0 = desligado). Com `levelSwap`
ligado, troca o líder pelo próximo do time (ordem de slot) que ainda está abaixo do nível, e confirma a
troca. Quando todos estão no nível, avisa que acabou.

**Mensagens do jogo (piwdex `sessao.ts`):** `pokes` (resposta a `pokes-get`) traz `list[]` com `team`,
`slot`, `leader`, `level`, `id`; `poke-xp { level }` a cada abate com o nível do líder; `field-kill` também
traz `level` e `leveledUp`; o cliente troca o líder com `poke-summon { pokeId }` pelo mesmo socket.

**Lógica:** `poke-xp`/`field-kill` só disparam um `pokes-get` (com gap mínimo de 3 s); quem decide é o
frame `pokes` (`updateTeam` → `checkLeaderLevel`). Um alerta por líder (`levelAlerted` por id; zera ao
mudar o alvo). Troca: `poke-summon` → `pokes-get` 0,8 s depois → `checkSwapConfirm` (sucesso, ou
"não confirmou" após 15 s). Também pede `pokes-get` 4 s após rastrear o socket, ao Salvar e a cada 5 min.

**UI:** campo "Webhook de nível", bloco "Alerta de nível" com nível alvo, checkbox de troca, lista do time
(★ líder, ✔ já no nível) e botão "Atualizar time".

**v3.2.1:** `poke-xp` confirmado como `{ id, speciesId, xpGained, xp, level, leveledUp }`; mudar o alvo OU a
caixa de troca no Salvar reavalia o time (antes, ligar a troca depois do aviso não fazia nada). `poke-summon`
confirmado no bundle do cliente (botão summon do time); bloqueado durante boss. Evolução continua fora.
**v3.2.2:** quem deixa de ser líder sai de `levelAlerted`; se voltar a ser líder acima do alvo (troca manual),
avisa e troca de novo. Para manter um líder acima do alvo, desligue a troca.
