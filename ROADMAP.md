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
vivo. Se o `poke-delta` atrasar mais de 20 s (v3.24.1; era 4 s), avisa sem guardar (registrado no log).

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
Entrar na hunt sozinho: ver #21 (v3.16.0).

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
nível do treinador (hoje a falha só pula). Não escolhe a profissão nem sobe de rank. Visto ao vivo (v3.13.3): a tela
do jogo reenvia `enter-hunt` da última hunt escolhida na mão a cada reconexão do socket, por isso a rota agora
reassume a hunt do alvo 8 s depois de qualquer entrada em outra hunt (`catchOnHuntChange`); a tela pode seguir
mostrando a hunt antiga.

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

**Config/UI (v3.12.0, formato escolhido no mock `docs/mockup-venda-pokemon.html`, alternativa B):** `pokeSellEnabled`
e `pokeSellLimits: { weak..divine: limite }` — um campo "poder <" por raridade (etiqueta colorida), vazio = essa
raridade não vende. Config da v3.11.x (duas faixas `pokeSellTier`/`pokeSellIvLow`/`pokeSellIvHigh`) é migrada em
`migrateCfg` para um limite por raridade. Prévia em tabela (Pokémon, raridade, poder, decisão: "✔ vende", "poder 130 ≥
100", "cadeado", "Mythic sem limite"…) calculada com os campos da tela, gold estimado no resumo, botão "Vender N agora"
(salva só os limites) e "Atualizar lista". Intervalo (v3.13.0): `pokeSellEveryMin`/`pokeSellEveryMaxMin` (padrão
10–15 min, sorteado a cada ciclo como a venda de itens); o ciclo conta a partir da carga/ativação e da última venda,
`pokeSellTick` (30 s) pede a lista ao jogo quando vence e o frame `pokes` vende; sem candidatos o ciclo recomeça.
O início do ciclo sobrevive à recarga automática (`lastPokeSellAt` no registro). Teste: `node test/pokesell.test.js`.

**Pendências:** confirmar no log que o frame `pokes` traz `starter`/`locked`/`sellValue` (levantado do bundle, v3.6.0);
sem esses campos o script só confia em `team`/`shiny`/IV.

---

## ✅ 19. Viagem à cidade para vender e comprar (regra nova do jogo, v3.14.0)

**Por quê:** anúncio do jogo em 26/09/2026: não é mais permitido comprar/vender itens no NPC Mark, vender Pokémon,
usar o Mercado Global nem o Depot durante a hunt. Até a v3.13.6 o script fazia tudo isso por REST de dentro da hunt.

**O que faz:** toda venda de itens, venda de Pokémon e compra de bolas vira uma viagem: `leave-hunt` + `field-teleport-city`
sintético no socket (a tela viaja para a cidade e manda `set-city` sozinha; sem `set-city` em 10 s o script manda),
pausa "andar até o NPC" (4–9 s), tarefas em sequência com 2–5 s entre elas, pausa (3–8 s) e volta por
`switchHunt(slug, 1, 'viagem')` (`enter-hunt` + `hunt-resume` sintético). Quem pede a viagem: `sellTick` (lista de itens
congelada na hunt, porque `huntLoot` zera ao sair), `pokeSellOnPokes` e `checkBallStock`; os pedidos acumulam em
`tripNeeds` e `tripTick` (30 s) faz UMA viagem com tudo, levando de carona quem já tem o que fazer (`tripAugment`).
Intervalo mínimo entre viagens `tripMinGapMin` (3). Sem hunt para voltar (já na cidade), só faz as tarefas. Durante a
viagem a rota de captura não reassume a hunt e a recarga espera.

**Config/UI:** `tripCity` (cerulean/pewter/viridian/goldenrod), `tripMinGapMin`; seção "Viagem à cidade" na aba
Sistema com status (pendentes, próxima, última) e "Ir à cidade agora"; os botões "Vender agora" das abas viram viagem.
Levantamento de chamadas por aba em `docs/chamadas-por-aba.md`. Teste: `node test/trip.test.js`.

**Pendências:** confirmar ao vivo que o servidor aceita as vendas/compras depois do `set-city` (o log `viagem` diz
se a tela viajou); Mercado Global entre jogadores (anunciar itens) segue fora do escopo.

---

## ✅ 20. Compras e Venda simples: faixa de viagem, relógio único, blocos recolhíveis (v3.15.0)

**O que faz (mock aprovado em `docs/mockup-viagem-venda.html`):** as abas Compras e Venda ganham a MESMA faixa no
topo (um elemento só, movido para a aba ativa em `showTab`): "Próxima viagem à cidade em N min (hh:mm)", "Vai levar:
3 drops, 2 Pokémon, comprar 100 Ultra Ball", botão "Ir agora" e a faixa "A cada 10 a 15 min". Durante a viagem vira
barra de progresso com a fase. Um relógio só (`tripEveryMin`/`tripEveryMaxMin`, sorteado a cada ciclo): vencido, uma
viagem leva tudo que houver (`tripAugment`); sem nada, só sorteia o próximo horário sem sair da hunt. Bola zerada é
urgente (`tripRequest`) e não espera o relógio, só `tripMinGapMin` (3). Compras vira "Bola / Quando ficar abaixo de X
comprar Y" com "Comprar sozinho" no título. Venda vira dois blocos recolhíveis (`.dn-blk`, um aberto por vez, lembrado
em `pgDiscordNotifyUi.vendaOpen`) com resumo de uma linha fechados. Sistema só guarda a cidade e o histórico.

**Removido:** `sellEveryMin`/`sellEveryMaxMin`, `pokeSellEveryMin`/`pokeSellEveryMaxMin` (migrados para o relógio da
viagem em `migrateCfg`; `everyMin` dos perfis por hunt é ignorado), `sellTick`, `pokeSellTick`, os botões "Vender agora"
por bloco (o "Ir agora" da faixa leva tudo) e o "Ir à cidade agora" de Sistema. `lastTripAt`/`nextTripDelayMs` vão no
registro da recarga. Testes: `trip.test.js` (relógio, vazio, urgente), `pokesell.test.js`, smoke.

---

## ✅ 21. Daily Kill sozinha: escolher missão e Pokémon, ir e voltar (v3.16.0)

**O que faz:** com "Fazer a daily sozinho" (aba Treino → Daily Kill, `cfg.dailyAuto`, exige a Daily ligada): se não há
missão escolhida, o script escolhe uma das 3 (`POST /api/game/daily-kill/pick { idx }`); com a missão aberta e a conta
fora da hunt dela, põe de líder o Pokémon do TIME com mais vantagem contra a espécie (`poke-summon`), entra na hunt
(`switchHunt` origem `daily-ida`) e, na meta, resgata, devolve o líder de antes e volta para a hunt de onde saiu.

**Escolha:** efetividade = melhor multiplicador entre os tipos do Pokémon contra `options[].type1/type2` (tabela de
tipos do jogo, a mesma `CHART` do Tierlist do PokeGrid; o Tierlist roda no app, fora do painel, então o script tem a
cópia `TYPE_CHART`). Nota do Pokémon = efetividade × nível × (nível/nível da hunt)² quando está abaixo da hunt.
Missão = maior nota do melhor Pokémon ÷ abates que faltam. Hunt da espécie = a de menor nível no `map-markers`
(`dailyHuntFor`, por `speciesId`). Tipos do time vêm do frame `pokes` (`type1/type2`) ou do `creatures.json`.

**Estado:** `localStorage.pgDiscordNotifyDaily` = `{ resetAt, slug, from, leaderId, leaderName, pokeId, eff, goes,
lastGoAt, over }` (sobrevive à recarga). Enquanto a ida vale, `dailyHoldsLeader()` pausa a troca de líder do treino
(`checkLeaderLevel`) e a rota de captura já respeita `dailyOnHunt()`. Saiu da hunt da daily (na mão): tenta de novo
depois de 5 min, no máx. 3 idas por missão. Entrada não confirmada: devolve o líder, volta e não tenta mais no dia.
Virou o dia no meio: desfaz e larga. Aviso no canal de Alertas na ida e na volta. Teste: `node test/dailyauto.test.js`.

**Pendências:** confirmar no log que `pokes.list[]` traz `type1/type2` e que `/pick` aceita `{ idx }` (bundle).
Só o time entra na conta (o box não). Não usa `/reroll`.

---

## ✅ 22. Clã sozinho: Orebound (e os outros), do rank 1 ao 5 (v3.17.0)

**O que faz (aba Profissão → Clã, `cfg.clanEnabled`):** sem clã, entra no escolhido (`clanKey`, padrão `orebound`; a 1ª
entrada é grátis, trocar custa diamante e o script nunca troca). Lê a tarefa do próximo rank, não vende o item base nem o
item de clã que ela pede (`clanKeepsItem` no `runSellCycle`) nem o Pokémon da espécie a capturar (`clanKeepsSpecies` em
`pokeSellReason`), e na viagem à cidade (tarefa `cla`, `clanCityWork`) converte 100 do item base em 1 item de clã e sobe de
rank (`clanRankup`). Tarefa pronta = viagem urgente. Com `clanRoute` ("Caçar o que falta"): vai para a hunt da espécie a
capturar (joga a bola da rota de captura quando ela entra na fila) e depois para a de maior fração da tarefa por abate
(itens base esperados pelo loot do `creatures.json` + tipos que faltam derrotar; só hunts até o nível do melhor do time;
fica na atual enquanto render ≥ 80% da melhor). Acabou (rank máximo ou nada ao alcance): volta para a hunt de antes.
Excludente com a rota de treino e a de captura; a Daily tem prioridade.

**Como o jogo faz (bundle, 27/09/2026):** `GET /api/game/clans` → `{ clan, clanRank, level, diamonds, canJoin, joinLevel,
nextTask:{ rank, name, level, levelOk, items:[{ itemId, name, have, need }], caught:[{ speciesId, name, have, need }],
kills:[{ type, have, need }], rewardXp, ok, goldOk, goldCost } }`; `POST /api/game/clans/rankup {}`; `POST /clans/skip {}`
(não usado); `POST /clans/change { clan, targetRank }`; `POST /api/game/convert { baseItemId, packs }` → `{ converted,
toName }` (mapa base→clã do inventário: Small Stone→Big Stone, Earth Ball→Solid Earth Piece, ...); mochila por `inv-get`
→ frame `inventory { items:[{ itemId, quantity }] }`. Pokepedia: entra no nível 80; ranks 2..5 pedem 90/100/110/120.

**Pendências:** confirmar no log (`cla`, `cla-converteu`, `cla-rank`) o formato real da tarefa e da resposta do convert;
não troca o líder para a hunt do clã (dá para reaproveitar a escolha por tipo da daily). Teste: `node test/clan.test.js`.

---

## ✅ 23. Guardar na cidade: drops que sobraram e Pokémon não vendidos (v3.18.0)

**O que faz (aba Venda → bloco "Guardar na cidade"):** última tarefa de toda viagem à cidade (`guardar`, anexada em
`tripTasksFor` quando há outra tarefa; sozinha não gera viagem). `depositItems` = '' | 'depot' | 'family': os drops que
sobraram (ids vistos em `field-kill`, em `localStorage.pgDiscordNotifyDrops`) vão para o Depot comum (`POST
/api/game/depot/move { itemId, dir:'store' }`, pilha inteira) ou para a família (`family-action { action:'item',
dir:'deposit', itemId, quantity }`); ficam na mochila os consumíveis (`DEPOSIT_SKIP_CATS`: heal, revive, ball, berry, held, tm, addon, pokecard, vitamin,
energy; v3.18.1), os marcados para venda e o que o clã pede.
`depositPokes` = '' | 'family': Pokémon fora do time que a venda NÃO vende vão para a família (`family-action poke`);
nunca time, inicial, anunciado, capturado há < 2 min, da tarefa do clã e, sem `depositPokesRare`, shiny e 🔒. Pokémon
no "Depot comum" = o box (já estão lá), por isso não há essa opção para eles.

**Família:** `family-get` antes (estado em `lastFamily`), respeita `movesCap` (50 + 50 por VIP, máx. 250), Pokémon
primeiro, para no limite/congelado/sem família. `familyAction` (genérica) substitui o corpo de `familyDeposit`.
Aviso "📦 guardou…" no canal de Alertas. Teste: `node test/deposit.test.js` (+ passo no smoke).

**Lista da família (v3.19.0):** `depositFamilyList: [{ id, name, keep }]` — itens escolhidos no painel (autocompletar
do `items.json` sem consumíveis; ex.: Devoted Token, Bronze Dimensional Key, Strange Pheromone, algumas stones) vão
SEMPRE para a família na viagem, de qualquer origem (drop, daily, boss), menos a reserva `keep`; vão antes dos Pokémon e
dos drops. Casa por id ou nome. Consumível listado continua na mochila. Não gera viagem (pedido do usuário: guarda
quando a conta já foi vender/comprar).

**Pendências:** confirmar no log (`guardar-cidade`, `item-familia`) se cada depósito de item gasta 1 movimento e o
formato de `family.depot.items`.

---

## ✅ 24. Venda por hunt com a tabela de drops desde o começo (v3.20.0)

**O que faz (aba Venda → Drops da hunt):** a lista mostra TODOS os drops do monstro da hunt, como a wiki: loot do
`creatures.json` (`huntLootTable(slug, itemsCatalog)`: id pelo nome no `items.json`, chance/100000, min–max por abate,
chance 0 = "drop raro", o jogo não publica), mesmo os que ainda não caíram ("ainda não caiu"). O monstro da hunt sai do
nome (445 de 451 hunts, inclusive Furious/Ancient/Brave/Psy) ou do looktype (as 6 restantes), em `huntLootBySlug`
montado no `loadHuntCatalog`. Campo "Hunt" (datalist com as hunts do `map-markers`) escolhe outra hunt: o Salvar grava
`cfg.sellProfiles[slug]` sem mexer na lista ativa; `loadHuntProfile` aplica quando a conta entra lá. Marcações não
salvas de cada hunt ficam em `sellDrafts` (trocar de hunt na lista não perde nada). A venda continua vendendo só o que
caiu na hunt atual (`sellWantedNow`). Teste: `node test/huntloot.test.js` + passo no smoke.

---

## ✅ 25. Refil de poções e revives (v3.21.0)

**O que faz (aba Compras → Poção / Revive):** mantém um estoque mínimo de uma poção e de um revive, como a compra de
bolas. Mochila pelo frame `inventory` (`inv-get` a cada 5 min, 4 s após o socket e no Salvar; item zerado some da lista =
0). Abaixo do limite (0 = quando acabar) pede viagem à cidade (`tripRequest('suprimentos')`, uma vez por episódio) e vai
de carona em toda viagem (`tripAugment`). Na cidade, `supplyCityWork` relê a mochila por `GET /api/game/depot` e compra
com `POST /api/game/shop/buy { itemId, qty }` (bundle do cliente, 29/09/2026: o mesmo endpoint das bolas, corpo com
`itemId`; `buyFromShop('item', ...)`). Aviso da compra/falha no canal de Alertas. Config: `healBuy`/`healItemId`/`healMin`/
`healQty` e `reviveBuy`/`reviveItemId`/`reviveMin`/`reviveQty`. Itens da loja (items.json): 200 Small, 201 Great, 202 Ultra,
203 Hyper, 204 Ultimate Potion; 205 Revive, 206 Max Revive (207 Medicine não é vendida). Teste: `node test/supply.test.js`,
caso novo no `trip.test.js` e passo no smoke.

---

## ✅ 26. Cura na Nurse Joy quando o time cai (v3.22.0)

**O que faz (aba Compras → 💊 Nurse Joy, `cfg.healJoyEnabled`):** quando o líder desmaia sem Revive (ou o time inteiro
cai) e o jogo manda a conta para a cidade, o script cura o time na Nurse Joy e volta para a hunt em que caiu.

**Mensagens do jogo (bundle do cliente, 29/09/2026; formato ainda não visto no log):** o frame `field` traz `fainted`,
`reviveInMs`, `noRevive` (time inteiro; na Nightmare World não há Revive), `heroHp`, `heroMaxHp`. Com `fainted` a tela mostra
"💀 <líder> desmaiou!" com contagem regressiva, "Reviver agora" (`field-revive`, gasta um Revive; o Auto-Revive faz sozinho)
e "Voltar para a cidade" (`leave-hunt` + viagem para Cerulean). No fim da contagem o servidor manda `field-teleport-city`
(a tela vai para Cerulean e envia `set-city`). A Joy é `{ type:'joy-heal' }` (botão "Curar a equipe" da NPC, de graça,
time todo); o cliente não espera resposta. Com o líder em hp 0 a tela recusa viajar para hunt ("Cure-o com a Nurse Joy ou
use um Revive antes de ir caçar"); o `hp` do líder vem no frame `pokes`.

**Lógica (módulo `// ---- Cura na Joy`, antes da Lógica principal):** `healOnField` guarda a queda (`faintSeen`, log
`desmaio`/`desmaio-levantou`). Gatilhos: `field-teleport-city` real (o sintético da viagem é filtrado; também zera a hunt
atual, porque a tela não manda `leave-hunt`), `leave-hunt` com o líder desmaiado ("Voltar para a cidade") ou líder com hp 0
no `pokes` fora de hunt (ex.: recarga no meio da contagem). Fluxo: espera o `set-city` da tela (10 s; senão manda
`set-city cerulean`) → 3–7 s → `joy-heal` → 1,5 s → `pokes-get` confere o hp do líder (2 tentativas; frame sem `hp` segue)
→ 2–5 s → `switchHunt(slug, 1, 'cura')` (sem `leave-hunt`). Enquanto `healBusy()`, viagem, rota de captura, daily sozinha,
rota do clã e recarga não trocam de hunt. Volta SEMPRE (a proteção de 3 quedas em 30 min foi removida na v3.24.3 a
pedido do usuário). Webhook de alertas na 1ª queda da janela de 30 min e em toda falha/parada. Log `cura { fase: inicio|joy|fim }`.

**Pendente:** confirmar no log (`desmaio`, `cura`) os campos do `field` e se o servidor exige estar perto da Joy ou numa
cidade específica para o `joy-heal`. Teste: `node test/heal.test.js` e passo no smoke.

---

## ✅ 27. Parada na cidade: curar e voltar para a hunt (v3.23.0)

**O que faz (aba Compras → 🏙️ Parada na cidade, `cfg.cityIdleEnabled`, ligado por padrão, `cityIdleMin` = 10):** conta fora
de hunt há mais de 10 min está bugada (pedido do usuário): o script cura o time na Nurse Joy e volta para a hunt.

**Lógica (módulo `// ---- Volta da cidade`, antes da Lógica principal):** parada = hunt do script nula ou cidade e nenhum
`field`/`field-init`/`field-kill` no período (o servidor manda esses frames enquanto farma, mesmo com a tela na cidade), ou
hunt pedida que nunca mandou frame. Tique de 30 s; espera viagem, cura, troca de hunt/líder, venda, volta da recarga e a
daily sozinha (motivo no painel e no log `cidade-parada-espera`); com a rota de captura ligada quem volta é o `catchTick`.
Fluxo `idleGoBack`: hunt morta → `leave-hunt` + `set-city cerulean`; 3–7 s → `joy-heal` → `pokes-get` confere o hp do líder
(hp 0 = não volta e avisa) → 2–5 s → `switchHunt(slug, 1, 'cidade')` sem `leave-hunt`. Destino: alvo da rota do clã > etapa
da rota de treino > última hunt (desde a v3.24.3 as quedas da cura não excluem a hunt). 3 voltas em 1 h sem a hunt
confirmar = desiste e avisa; rearma no próximo frame de hunt. Webhook de alertas a cada volta. Log `cidade-parada`.

**Pendente:** confirmar no log se o `joy-heal` funciona fora de Cerulean. Teste: `node test/idle.test.js` e passo no smoke.

---

## ✅ 28. Daily Gift: resgatar o presente do dia e entregar pelo Gift Center (v3.24.0)

**O que faz (aba Treino → 🎁 Daily Gift, `cfg.giftEnabled`, `cfg.giftCenterMode`):** pedido do usuário ("recuperar os daily
gift"). O 🎁 do menu do jogo é um calendário de 28 dias com um presente por dia; resgatado, o presente cai no Gift Center
(correio) e precisa de um segundo resgate. O script faz os dois.

**Mensagens (REST, levantadas no bundle em 30/09/2026):** `GET /api/game/daily` → `{ canClaim, claimedToday, blockedByVip,
nextDay, total, rewards[{ day, label, qty, icon, tag, claimed, current, locked }] }`; `POST /api/game/daily {}` → estado +
`claimed:{ label }`; `GET /api/game/gifts` → `{ gifts[{ id, label, icon, grantedBy }] }`; `POST /api/game/gifts/{id}/claim {}`
→ `{ granted }`.

**Lógica (módulo `// ---- Daily Gift`, entre a Daily Kill e o Clã):** tique de 1 min; relê o calendário a cada 30 min (5 min
enquanto não resgatou hoje e o jogo não disse por quê); `canClaim` → `POST /daily`; depois, no Gift Center, entrega o presente
com o mesmo rótulo (padrão), tudo que houver (`'all'`, a cada leitura) ou nada (`''`, o usuário resgata no correio). Boosts
começam a contar na entrega — por isso o padrão é só o do dia. Resgate que falhou tenta de novo em 30 min. Webhook de
alertas por resgate (presente, dia N/28, o que o Gift Center entregou). Logs `gift`, `gift-resgate`, `gift-center`,
`gift-erro`. Status no painel (dia, presente do dia, resgatado hoje, só VIP, concluído, quantos sobraram no Gift Center).

**Pendente:** confirmar no log o texto de `granted` e se o rótulo do Gift Center bate com o do calendário (senão o log
`gift-center` mostra `esperado` × `la`). Teste: `node test/gift.test.js` e passo no smoke.

---

## ✅ 29. Evolução automática com pedras (v3.25.0)

**O que faz (aba Treino → 🧬 Evolução, `cfg.evolveEnabled`):** pedido do usuário em 02/10/2026 ("quando o Pokémon pegar o
level da evolução, ele volta para a cidade e evolui caso tenha as stones no inventário"). Quando um Pokémon do TIME chega ao
nível de evolução (`evolveNeedLevel` do frame `pokes`), o script pede uma viagem à cidade, evolui gastando as pedras (mantém o
nível) e volta para a hunt. Sem pedra NÃO evolui (a grátis volta ao Lv.1) e avisa uma vez.

**Mensagens (REST, levantadas no bundle em 02/10/2026):** `GET /api/game/evolve?capturedId=<id>[&destId]` → `{ name, level,
needLevel, canEvolve, hasStones, keepLevel, destName, destId?, itemOnly, stones[{ itemId, name, need, have, icon }],
branches[{ destId, destName, needLevel, canEvolve, hasStones, stones }] }`; `POST /api/game/evolve { capturedId, useStone,
destId? }` → `{ name }`. O botão do HUD só funciona em Cerulean ("Evolution is only allowed in Cerulean").

**Lógica (módulo `// ---- Evolução automática`, antes do Daily Gift):** `evolveOnPokes` guarda quem do time evolui por nível e,
no nível, `tripRequest('evoluir')` uma vez por Pokémon por episódio (rearma no Salvar, quando evolui/sai do time ou no estágio
novo abaixo do nível); `poke-xp` com `leveledUp` pede `pokes-get`. Na cidade (`evolveCityWork`, com `set-city cerulean` se a
viagem foi para outra cidade): GET por candidato; linha ramificada só com pedra para UM destino (`destId`); `hasStones` →
`POST useStone:true`; depois `pokes-get`. Aviso no canal de Alertas (evoluiu / falha nova); falha repetida com o mesmo motivo
não avisa de novo, mas tenta a cada viagem (carona). Logs `evolucao { campos }`, `evolucao-cidade`. Status no painel.

**Pendente:** confirmar no log `evolucao` os campos reais da resposta (`campos`) e se o servidor exige Cerulean também no POST.
Teste: `node test/evolve.test.js`.

---

## ✅ 30. Poke Slot Machine: roll grátis e bônus no Pokémon pedido (v3.26.0)

**O que faz (aba Treino → Poke Slot Machine, `cfg.slotEnabled` + `cfg.slotWanted`):** quando um slot da máquina estiver com
o roll grátis pronto, o script pede viagem à cidade, vai ao shopping (cidade do NPC `pokeslot`), gira e escolhe o 1º
Pokémon da lista pedida que saiu entre os 9 sorteados; nenhum saiu = escolhe um qualquer (pedido do usuário). Nunca gasta
Poke Slot Cards. Uma estrela ativa de um Pokémon pedido não é trocada antes de expirar.

**REST (bundle do cliente, 02/10/2026; o jogo chama o sistema de "golden stars"; formatos ainda não vistos no log):**
`GET /api/game/golden-stars` → `{ cards, isVip, slots[{ slot, unlocked, vipLocked, freeReady, freeRollAt, active{ speciesId,
name, pct, bonusType, rarity, startedAt, expiresAt }, candidates[{ speciesId, name }] }], config{ freeRollCooldownMs,
candidates, rollCostCards, ... } }`; `POST .../roll { slot }` → `{ state, candidates }`; `POST .../pick { slot, speciesId }` →
`{ active, state }`. Bônus: exp, loot, catch, damage, defense, critChance, critDamage, shiny; raridades common…legendary.
Texto "Como funciona" do jogo (02/10/2026): roll grátis a cada **12 h** por slot (depois 1 Poke Slot Card), escolha direta 5 cards,
faixas Comum +5–10% · Incomum +10–15% · Raro +15–20% · Épico +20–25% · Lendário +25–35%.

**Lógica (módulo `// ---- Poke Slot Machine`, entre a Evolução e o Daily Gift):** `slotTick` a cada 1 min lê o estado quando um
prazo vence (roll grátis ou estrela expirando) ou a cada 30 min; slot pronto → `tripRequest('slot')` (+ carona em toda viagem
via `slotWanted`); `slotCityWork` na viagem: `set-city shopping` se a viagem foi para outra cidade, roll + pick por slot, aviso
no canal de Alertas (amarelo quando caiu no aleatório). Erro = 15 min antes de insistir no slot (`slotTriedAt`). Logs
`slot-campos`, `slot`, `slot-roll`, `slot-erro`, `slot-cidade`.

**Confirmado em 03/10/2026 (log da conta4):** formato igual ao do bundle (raiz traz ainda `now, gold, diamonds, level`; slot traz
`rolls`); viagem a Cerulean → `set-city shopping` → roll → pick funcionou em 14 s (Machamp +14% Loot, aleatório porque Phanpy não
saiu). Teste: `node test/slot.test.js` e passo no smoke.

---

## ✅ 31. Breeding automático: subir a quality de um Pokémon de IV alto (v3.29.0)

**O que faz (aba 🥚 Breeding, `cfg.breedEnabled`, `breedLines` até 2 linhagens, `breedFoodIvMax`, `breedFamily`, `breedDouble`):** o
usuário escolhe "quem sobe" (até 2, um por slot da incubadora); o script escolhe a comida (mesma espécie, quality E IV menores,
quality até 0,15 abaixo, IV abaixo do teto; box ou depot da família), pede a cotação Grátis e só cruza se ela disser que o IV vem de
quem sobe, pede a viagem à cidade, tira da família o que falta (stones e comida), cruza (`parent1` = quem sobe, `free`, `double`),
volta para a hunt, choca o ovo quando o centro diz `ready` e o filho vira quem sobe da geração seguinte. Sem comida/stone/gold: para,
avisa 1x por motivo no canal de Alertas e tenta de novo a cada 30 min (a família abastece). Quem sobe e toda a espécie dele ficam fora
da venda automática e do depósito na família, sempre.

**Fatos (log de 09/10/2026, contas 2 e 3, farejador `rest-breeding` da v3.28.1 + 3 guias do Discord):** os 2 pais são consumidos; o
filho copia o IV (e a distribuição por stat) do pai de MAIOR quality, não do slot 1 (conta2: fraco no slot 1, doador = slot 2); Grátis
cobra 2.000.000 de gold + 20 stones (40 com dobrar, 5% de +1 IV) e dá Δ 0,005–0,04; 3000 abates para chocar; depot da família traz
quality/ivTotal. Mock: `docs/mockup-breeding.html`. Formatos: `docs/mensagens-do-jogo.md` → "Breeding Center".

**v3.29.1:** `POST hatch` CONFIRMADO (09/10/2026 12:37Z, contas 2 e 3): `{ ok, child{ speciesId, shiny, quality, delta, growth, ivTotal,
bqs } }`, sem id do filho — o módulo acha o filho no frame `pokes` pela quality+IV exatos (dica em `pendingChild`); o aviso mostra Q, IV e Δ
mesmo quando a lista demora. Farejador `rest-breeding` removido.

**v3.29.2:** `family-action … dir:'withdraw'` CONFIRMADO (09/10/2026 13:15Z, conta1, pela janela Família): mesmos campos do depósito.

**Pendente:** se o `breed` funciona na hunt
(o script sempre cruza na viagem). Teste: `node test/breeding.test.js`, caso novo no `pokesell.test.js`, passo no smoke e fixture no
round-trip.

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
