# CLAUDE.md

Orientações para o Claude Code ao trabalhar neste repositório.

## O que é este projeto

Userscript único (`piw-discord-notify.user.js`) que notifica um webhook do Discord quando o
jogador captura um Pokémon no Poke Idle World (https://poke.idleworld.online/play). O alvo
principal é o injetor de scripts do **PokeGrid** (app Electron, https://github.com/soufoka/PokeGrid),
com compatibilidade secundária com Tampermonkey. Não há build, dependências nem testes
automatizados — é um arquivo JS vanilla, IIFE, sem módulos.

## Restrições do ambiente de injeção (PokeGrid) — IMPORTANTES

Estas regras vêm do código-fonte do PokeGrid (`index.html`, funções `injectScripts`/`runUS`):

- **Injeção acontece no `dom-ready` do webview**, NUNCA em `document-start`. O cabeçalho
  `@run-at` é ignorado (só `@name`, `@version` e `@author` são lidos do bloco `==UserScript==`).
  Consequência: o WebSocket do jogo pode já estar aberto quando o script roda. Por isso o
  script intercepta TANTO o construtor `WebSocket` quanto `WebSocket.prototype.send` (este
  último descobre sockets pré-existentes). Não remover nenhuma das duas frentes.
- O código é embrulhado em `(async function(){ ... })()` pelo PokeGrid — `return`/`await` no
  topo funcionam, mas nada fica no escopo global a menos que se atribua a `window`.
- **Uma execução por documento** (marcada em `window.__pgUS`) — reinjeções por navegação SPA
  não rodam o script de novo no mesmo documento.
- Scripts nunca são injetados em telas de login/cadastro.
- O download por URL só aceita `github.com` e `raw.githubusercontent.com` (Gist NÃO funciona).
  O link de instalação é o blob do GitHub: o PokeGrid converte para raw sozinho.
- Cada painel do PokeGrid é um `<webview>` com partição própria (`persist:conta1..4`) —
  `localStorage` é **por painel**; a config do usuário não é compartilhada entre painéis.

## Fatos sobre o jogo (confirmados via piwdex e poke-standalone-scripts, set/2026)

- Comunicação por WebSocket (URL contém `/ws`) com mensagens JSON puras `{type, ...}` — não é
  socket.io, não há prefixo numérico.
- `pending` → `{ type:'pending', list:[{ id, pokeId, name, level, shiny, at }] }`. Fila de Pokémon
  capturáveis, chega a cada abate e SUBSTITUI a anterior. `pokeId` é a espécie; `id` é o pendingId.
- `catch-result` → `{ type:'catch-result', success, speciesName, shiny, ballName, pendingId?, auto? }`.
  Não traz nível — o script cruza com a última fila `pending`. `auto: true` = autocatch VIP
  (também conta como captura). Falha vem com `success: false`; cooldown vem como `catch-cooldown`.
- No sucesso também chega `poke-delta` (CONFIRMADO no log em 23/09/2026) com o indivíduo completo:
  `poke.{ id, speciesId, name, level, shiny, team, slot, leader, starter, sellValue, looktype, xp: 0,
  hp, maxHp, type1, type2, stats{hp,atk,def,spAtk,spDef,speed}, quality, ivTotal, power,
  hasEvolution, evolveNeedLevel, evolvesToName }`. É a fonte primária de IV/qualidade do script.
- Nomenclatura na mensagem: o jogo exibe `ivTotal` como **"Poder X/192"** (o usuário confirmou); o
  campo `power` do payload é outra coisa (sistema "Power" da pokepedia) e NÃO é mostrado, para não
  confundir. A pokepedia chama o valor por atributo de "Growth".
- IV e qualidade do indivíduo SÓ existem no frame `pokes` (resposta a `{type:'pokes-get'}`):
  `list[]` com `id, speciesId, name, level, shiny, team, ivTotal (0..192), quality (multiplicador
  1.0/1.3/1.7...), power, xp, stats{hp,atk,def,spAtk,spDef,speed}`. Faixas oficiais de qualidade:
  <1.0 Weak, 1.0 Common, 1.1 Uncommon, 1.3 Rare, 1.5 Epic, 1.7 Legendary, 2.0 Mythic, 3.0 Ancient,
  4.0 Divine (fonte: poke.idleworld.online/pokepedia/systems/quality via piwdex `src/lib/rarity.ts`).
- Fluxo do script para IV/qualidade: `catch-result` ok → espera até 4s por `poke-delta` (que na prática
  chega no mesmo segundo). Plano B: se o delta vier sem `ivTotal`/`quality`, envia `pokes-get` e casa o
  recém-capturado na lista `pokes` (por `id` do delta ou espécie com `xp === 0`). Sem resposta,
  notifica sem esses campos.
- Cliente envia `{ type:'catch', pendingId, ballId }` para capturar.
- `balls` → `{ type:'balls', counts:{ '<ballId>': qty } }`, resposta a `{ type:'balls-get' }`. IDs:
  Poke Ball 1, Great Ball 2, Super Ball 3, Ultra Ball 4, Idle Ball 6. O `catch-result` traz `ballId`
  e `ballName` da bola em uso (o script usa isso como bola "automática" do alerta de estoque).
- REST do jogo (usado pela compra automática; confirmado no auto-refill de referência e no piwdex):
  tokens em `sessionStorage['pokeweb:tokens']` (`{accessToken, refreshToken}`), header
  `Authorization: Bearer`, renovação em `POST /api/auth/refresh {refreshToken}` quando vier 401.
  `GET /api/game/shop` → `{ gold, balls:[{id,name,priceGold,catchRate,iconUrl}], items:[...] }`;
  `POST /api/game/shop/buy {ballId, qty}` → `{ ok?, bought, gold }`, máx. 1000 por request.
  NUNCA logar tokens nem gravá-los no `pgDiscordNotifyLog`.
- Venda: `GET /api/game/depot` → `{ inventory:[{id,name,quantity,npcPrice,category}] }`;
  `GET /api/game/item/lock` → `{ locked:[id] }`; `POST /api/game/shop/sell {items:[{itemId,qty}]}` →
  `{ ok, soldCount, goldGained, gold }`. Catálogo público `GET /game/items.json` → `{ items:[{id,name,
  category,npcPrice,rare,icon}] }` (667 itens; categorias: loot, stone, heal, revive, clan, misc, card,
  addon, tm, berry, held). `field-kill` → `{ speciesName, shiny, xpGained, level, loot:[{itemId,name,qty}] }`.
  Cliente envia `enter-hunt {slug}` / `leave-hunt`.
- Regra de venda (ver `protectedReason` e `sellWarning`): desde a v3.1.0, a pedido do usuário, só preço 0
  (NPC não compra) e cadeado do jogo bloqueiam; categoria fora de `loot`, `rare` e nome com Pheromone/Stone
  viram aviso ⚠️ na lista, mas podem ser marcados. Lista branca por item em `cfg.sellItems`. Não voltar a
  bloquear sem o usuário pedir.
- `cfg.sellItems`/`sellEveryMin`/`sellEveryMaxMin` são os valores ATIVOS; `cfg.sellProfiles[slug]` guarda o
  perfil de cada hunt e sobrescreve os ativos em `setHunt()` (ver `loadHuntProfile`/`saveHuntProfile`).
- Referências: https://github.com/edulanzarin/piwdex (`src/lib/robo/motor/sessao.ts`, cases
  `catch-result`/`pending`) e https://github.com/luishferreira/poke-standalone-scripts (`AGENTS.md`).
- Time e líder (v3.2.0): `pokes.list[]` traz `team`, `slot` (0-based), `leader`, `level`, `id` (cuid string).
  Líder = `leader: true` ou o 1º por slot. `poke-xp { id, speciesId, xpGained, xp, level, leveledUp }` chega a
  cada abate (CONFIRMADO 24/09/2026; `id`/`level` são do líder); `field-kill` também traz `level` e `leveledUp`.
  Trocar o líder: `{ type:'poke-summon', pokeId }` — é o que o botão "⚔ summon" do time do próprio jogo
  envia (bundle do cliente); o HUD bloqueia durante boss. Confirmar com `pokes-get` (piwdex `trocarLider`). Mover box↔time: `poke-store` /
  `poke-withdraw { pokeId }`. O script só decide pelo frame `pokes`, nunca direto pelo `poke-xp`.
- Trocar de hunt (rota, v3.3.0): `leave-hunt` → ~600 ms → `enter-hunt { slug }` + `pending-get`; confirmar
  pela chegada de `field`/`field-init` (piwdex `cacar()`, auto-reconnect). O script guarda `lastFieldAt`.
  Com `routeEnabled`, `levelTarget()` devolve o nível da etapa atual (`cfg.route[cfg.routeStage]`), não
  `levelAlertAt`, e `swapEnabled()` é true. Sempre usar essas duas funções, não os campos diretos.
- Nome do personagem: `window.__poke.api['/api/characters/me'].character.name` (mesmo caminho
  que o PokeGrid usa para nomear abas). NÃO usar `.phud-name` — é o Pokémon ativo, não a conta.

## Diagnóstico sem console

- O script guarda os últimos 40 eventos em `localStorage.pgDiscordNotifyLog` (socket rastreado,
  `catch-result` recebidos, decisão dos filtros, cooldown, resposta do webhook). A URL do socket é
  gravada SEM a query string (ela carrega o JWT da sessão). O botão
  **Copiar log** do painel copia esse JSON.
- O localStorage de cada painel do PokeGrid fica em disco em
  `%APPDATA%\pokegrid\Partitions\conta{1..4}\Local Storage\leveldb\*.log|*.ldb` (LevelDB;
  valores em Latin-1 ou UTF-16LE). Dá para ler `pgDiscordNotifyCfg` e `pgDiscordNotifyLog` de lá
  com um script Python simples, sem abrir o PokeGrid. Ao fazer isso, NUNCA copiar a URL do webhook
  para a conversa ou para arquivos do repo.

## Regras do projeto

- **NUNCA commitar URLs de webhook do Discord** (nem em exemplos com IDs reais). O repo é
  público e o Discord desativa webhooks vazados. Toda config do usuário vive no `localStorage`
  (chave `pgDiscordNotifyCfg`), editada pelo painel 🔔 que o próprio script cria.
- Webhooks por tipo de evento: `webhookUrl` (capturas, principal), `webhookShiny`, `webhookAlerts`,
  `webhookLevel`. Todo envio passa por `postWebhook(kind, payload, meta)` com `kind` em
  `capture|shiny|alert|level`; `webhookFor(kind)` cai no principal quando o específico está vazio
  (`level` cai primeiro no de alertas). Eventos novos (ROADMAP)
  devem usar `postWebhook('alert', ...)`, nunca `fetch` direto.
- Semântica de filtro (duas etapas, ver `handleGameMessage` e `passesQualityFilter`):
  1. Nome: lista VAZIA ou `notifyEveryCapture` = qualquer Pokémon; lista preenchida = só os listados.
     Shiny com `notifyShiny` passa direto pelas duas etapas.
  2. Qualidade (decidida DEPOIS do `poke-delta`): `minTier` ('' = sem filtro; chave em minúsculas,
     ex. `legendary`) e `minIv` (0 = sem filtro; compara com `ivTotal` 0..192). Passa se raridade ≥
     mínima OU poder ≥ mínimo. Nenhum configurado = passa tudo. Sem dados (timeout do delta) = passa,
     para não perder um raro. `cooldownSeconds` (painel) é o intervalo mínimo entre
  avisos do mesmo Pokémon; padrão 0 = avisar todas. Configs anteriores a `cfgVersion: 2` tinham 30s
  fixos e são migradas para 0 no `loadCfg()`.
- Comparações de nome sempre via `normalize()` (minúsculas, sem acento).
- Idioma: comentários, UI e mensagens em pt-BR (o usuário é brasileiro).

## Decisão: sem config compartilhada automática

O usuário descartou (set/2026) a sincronização de config entre painéis via sync-server local
(v3.0.0, revertida na v3.0.1) por ser complicada demais. Config é por painel; para copiar entre
contas existe Exportar/Importar no painel. Não reintroduzir sem pedido explícito.

## Roadmap e comando /feature

As features planejadas estão em `ROADMAP.md`, cada uma com mensagens do jogo envolvidas, config,
UI e pendências. O usuário invoca `/feature <número ou nome>` (comando em `.claude/commands/feature.md`)
para implementar uma delas. Ao concluir, marcar o status no ROADMAP e seguir o fluxo de release.

## Fluxo de release

1. Editar `piw-discord-notify.user.js` e **bumpar `@version`** no cabeçalho (e a string
   `vX.Y.Z ativo` no `console.log` final).
2. Commit + push para `main`. O usuário atualiza pelo botão "Atualizar" do PokeGrid, que
   rebaixa o arquivo do GitHub e pede reload dos painéis (a config em localStorage sobrevive).
3. Sem tags/releases por enquanto — o PokeGrid sempre baixa o `main`.

## Como testar

Não há testes automatizados. Verificação manual: instalar no PokeGrid (ou colar no console de
um navegador logado no jogo), usar o botão **Testar** do painel 🔔 (envia mensagem de teste ao
webhook sem passar pelos filtros) e, para capturas reais, ligar o checkbox **Debug** que loga
no console toda mensagem de captura detectada com o payload completo.
