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
estoque volta acima do limite ou ao Salvar.

---

## ✅ 2b. Venda automática de drops da hunt atual (v2.7.0)

**O que faz:** vende ao NPC, periodicamente, o excedente dos itens que o usuário marcou entre os que
caem na hunt onde ele está agora.

**Mensagens/REST:** `enter-hunt`/`leave-hunt` (enviados pelo cliente) dão a hunt atual; `field-kill.loot[]`
dá os itens que caem nela; `GET /game/items.json` (público) traz categoria, `npcPrice` e `rare`;
`GET /api/game/depot` a mochila; `GET /api/game/item/lock` os cadeados; `POST /api/game/shop/sell
{ items:[{itemId, qty}] }` vende.

**Regras fixas:** só categoria `loot`; nunca `rare: true`, nome com Pheromone/Stone, preço 0 ou item com
cadeado. Lista BRANCA (`sellItems: { id: { keep } }`) + reserva por item. Cadeados ilegíveis = venda
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

## ⬜ 8. Exportar / importar config

**O que faz:** copiar a config de um painel e colar em outro (o `localStorage` é por painel).

**Lógica:** botão "Exportar" copia `JSON.stringify(cfg)` (com o mesmo fallback de clipboard do
"Copiar log"); botão "Importar" abre um `<textarea>` no painel (não usar `prompt()`: o PokeGrid
não suporta) e faz `saveCfg(JSON.parse(texto))` com validação básica.

**Config/UI:** dois botões na linha de Salvar/Testar.

**Pendências:** nenhuma. Atenção: a config exportada contém os webhooks; avisar o usuário para não
colar em lugar público.

---

## ⬜ 9. Nível / evolução

**O que faz:** avisa quando um Pokémon da lista (ou o líder) atinge o nível de evolução.

**Mensagem do jogo:** `poke-xp` (por abate) e `pokes` (`level`, `hasEvolution`,
`evolveNeedLevel`, `evolvesToName`, vistos no `poke-delta`).

**Pendências:** formato de `poke-xp` não confirmado (logar primeiro). Baixa prioridade.
