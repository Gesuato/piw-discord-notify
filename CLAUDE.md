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
- `balls` → `{ type:'balls', counts:{ '<ballId>': qty } }`, resposta a `{ type:'balls-get' }`. O frame OMITE as bolas
  zeradas (CONFIRMADO em 26/09/2026: a Ultra Ball some de `counts` ao acabar); use `ballQty(id)` (ausente = 0 depois
  do 1º frame), nunca `ballCounts[id]` direto — a compra automática ficou muda por isso até a v3.13.6. IDs:
  Poke Ball 1, Great Ball 2, Super Ball 3, Ultra Ball 4, Idle Ball 6. O `catch-result` traz `ballId`
  e `ballName` da bola em uso (o script usa isso como bola "automática" do alerta de estoque).
- Refil de poções e revives (v3.21.0, aba Compras, módulo `// ---- Refil de poções e revives` entre a compra de bolas e a
  venda de drops): mochila pelo frame `inventory` (`supplyOnInventory`, ausente = 0 depois do 1º frame), compra na viagem
  (tarefa `suprimentos`, `supplyCityWork`) com `POST /api/game/shop/buy { itemId, qty }` via `buyFromShop('item', ...)`
  (confirmado no bundle em 29/09/2026; bolas usam `buyFromShop('ball', ...)` com `{ ballId }`). Ids: poções 200–204,
  Revive 205, Max Revive 206. Limite 0 = compra quando acabar. Uma viagem pedida por episódio (`supplyAttempted`).
- Cura na Joy (v3.22.0, aba Compras → 💊 Nurse Joy, `cfg.healJoyEnabled`, módulo `// ---- Cura na Joy` antes da Lógica
  principal; bundle em 29/09/2026, campos ainda não vistos no log): `field` traz `fainted`, `reviveInMs`, `noRevive` (time
  inteiro), `heroHp`; sem Revive o servidor manda `field-teleport-city` (a tela vai a Cerulean e envia `set-city`, mas NÃO
  `leave-hunt`: `healOnTeleport` zera a hunt). Cura = `{ type:'joy-heal' }` (grátis, sem resposta; conferir pelo `hp` do líder
  no `pokes`). Líder em hp 0 = a tela recusa viajar para hunt. Fluxo `healStart` → `healFlow` → `switchHunt(slug, 1, 'cura')`;
  módulos que trocam de hunt checam `healBusy()` (com `typeof`, por causa dos harness). 3 quedas na mesma hunt em 30 min =
  fica na cidade e avisa.
- Parada na cidade (v3.23.0, aba Compras → 🏙️ Parada na cidade, `cfg.cityIdleEnabled` LIGADO por padrão, `cityIdleMin` 10;
  módulo `// ---- Volta da cidade` entre a Cura na Joy e a Lógica principal): pedido do usuário, "mais de 10 min na cidade = a
  conta bugou". Parada = hunt do script nula/cidade sem `field`/`field-kill` no período, ou hunt pedida sem frame nenhum
  (`idleSinceAt`). `idleGoBack`: (`leave-hunt` + `set-city` se era hunt morta) → `joy-heal` → `pokes-get` confere o hp →
  `switchHunt(slug, 1, 'cidade')`. Destino: alvo do clã > etapa da rota > `lastRealHunt`; pula hunt com 3 quedas da cura.
  Espera viagem/cura/troca/venda/recarga; a rota de captura tem volta própria. 3 voltas em 1 h sem frame = desiste e avisa.
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
- **REGRA DO JOGO (anúncio de 26/09/2026): não comprar/vender no NPC Mark, vender Pokémon, usar o Mercado Global nem o
  Depot DURANTE a hunt.** Toda venda/compra do script passa pela viagem à cidade (módulo "Viagem à cidade", v3.14.0):
  `tripRequest(key, dados, motivo)` acumula, `tripTick` faz uma viagem só (`cityTrip`), com carona (`tripAugment`).
  Ida = `leave-hunt` + `field-teleport-city` sintético (a tela viaja e manda `set-city`; `tripOnSetCity` confirma) ou
  `set-city` manual após 10 s; volta = `switchHunt(slug, 1, 'viagem')`. `runSellCycle(manual, wantedIds, huntName)`
  recebe a lista congelada (na cidade `huntSlug` é null e `huntLoot` zera). NUNCA chamar `runSellCycle`,
  `runPokeSellCycle` ou `autoBuyBalls` direto de dentro da hunt de novo. Cidades: `CITY_SLUGS` (lista `o4` do bundle).
  Relógio ÚNICO (v3.15.0): `tripEveryMin`/`tripEveryMaxMin` (`drawTripDelay`/`restartTripCycle`/`tripDueAt`); vencido,
  `tripTick` leva tudo que `tripAugment` achar, ou só sorteia o próximo horário. Não existem mais intervalos próprios de
  venda de itens/Pokémon. A faixa `#pg-dn-trip` é um elemento só, movido para a aba ativa (Compras/Venda) em `showTab`;
  `tripStatus(d)` devolve `{ busy, pct, title, sub }` para ela. Venda = blocos `.dn-blk` (um aberto por vez).
  Chamadas por aba: `docs/chamadas-por-aba.md`.
- Regra de venda (ver `protectedReason` e `sellWarning`): desde a v3.1.0, a pedido do usuário, só preço 0
  (NPC não compra) e cadeado do jogo bloqueiam; categoria fora de `loot`, `rare` e nome com Pheromone/Stone
  viram aviso ⚠️ na lista, mas podem ser marcados. Lista branca por item em `cfg.sellItems`. Não voltar a
  bloquear sem o usuário pedir.
- `cfg.sellItems` é a lista ATIVA; `cfg.sellProfiles[slug]` guarda a lista de cada hunt e sobrescreve a ativa em
  `setHunt()` (ver `loadHuntProfile`/`saveHuntProfile`). Desde a v3.20.0 a lista do painel nasce com a tabela de drops do
  monstro (`huntLootTable`, `creatures.json`) e o campo "Hunt" edita o perfil de outra hunt (`readForm` devolve
  `sellItems` + `sellProfiles`; rascunhos por hunt em `sellDrafts`). Desde a v3.15.0 os perfis não têm mais intervalo próprio.
- Referências: https://github.com/edulanzarin/piwdex (`src/lib/robo/motor/sessao.ts`, cases
  `catch-result`/`pending`) e https://github.com/luishferreira/poke-standalone-scripts (`AGENTS.md`).
- Venda de Pokémon (v3.11.0, aba Venda → "Pokémon fora do time"): desde a v3.12.0 UM limite por raridade em
  `cfg.pokeSellLimits[tierKey]` (vende se ivTotal < limite; ausente = não vende; escolhido pelo usuário no mock
  `docs/mockup-venda-pokemon.html`, alternativa B; `migrateCfg` converte as duas faixas antigas). Ver `pokeSellReason`;
  `migrateCfg` roda ANTES de `TIERS` existir (TDZ), por isso não usa `tierByKey`. Intervalo sorteado em
  `pokeSellEveryMin`–`pokeSellEveryMaxMin` (v3.13.0, padrão 10–15 min; `restartPokeSellCycle` na carga, no Salvar e
  após cada venda; `pokeSellTick` pede `pokes-get` quando vence). Lote recusado pelo jogo (ex.: "anunciados no mercado",
  flag `listed` na lista) é retentado um por um; recusados ficam em `pokeSellRejected` na sessão (log `venda-pokes-recusado`
  com os campos; `pokes-campos` registra as chaves do frame na 1ª leitura). Nunca vende time/líder, inicial, shiny, `locked`, `listed`, `sellValue` 0, sem IV ou
  capturado há < 2 min (`recentCaptureIds`, alimentado pelo `poke-delta`). Usa o frame `pokes` (por isso
  `requestPokes` roda mesmo sem alvo de nível quando `pokeSellEnabled`) e `POST /api/game/pokemon/sell { pokeIds }`.
  A aba de id `bolas` chama-se "🛒 Compras" desde a v3.11.0 (id mantido por causa do `pgDiscordNotifyUi`).
- Time e líder (v3.2.0): `pokes.list[]` traz `team`, `slot` (0-based), `leader`, `level`, `id` (cuid string).
  Líder = `leader: true` ou o 1º por slot. `poke-xp { id, speciesId, xpGained, xp, level, leveledUp }` chega a
  cada abate (CONFIRMADO 24/09/2026; `id`/`level` são do líder); `field-kill` também traz `level` e `leveledUp`.
  Trocar o líder: `{ type:'poke-summon', pokeId }` — é o que o botão "⚔ summon" do time do próprio jogo
  envia (bundle do cliente); o HUD bloqueia durante boss. Confirmar com `pokes-get` (piwdex `trocarLider`). Mover box↔time: `poke-store` /
  `poke-withdraw { pokeId }`. O script só decide pelo frame `pokes`, nunca direto pelo `poke-xp`.
- A TELA do jogo reafirma a hunt escolhida na mão (`field-none` da antiga e reconexões religam a antiga). Desde a
  v3.13.5 `switchHunt` injeta no socket um `hunt-resume { slug, name, synthetic: true }` (evento `message` sintético;
  `nudgeClientToHunt`) logo após o `enter-hunt`: é o handler que o cliente usa para seguir a hunt do servidor
  (viaja no mapa e reenvia `enter-hunt`). `handleGameMessage` ignora mensagens com `synthetic`.
- Trocar de hunt (rota, v3.3.0): `leave-hunt` → ~600 ms → `enter-hunt { slug }` + `pending-get`; confirmar
  pela chegada de `field`/`field-init` (piwdex `cacar()`, auto-reconnect). O script guarda `lastFieldAt`.
  Com `routeEnabled`, `levelTarget()` devolve o nível da etapa atual (`cfg.route[cfg.routeStage]`), não
  `levelAlertAt`, e `swapEnabled()` é true. Sempre usar essas duas funções, não os campos diretos.
- Rotas salvas (v3.9.0): `cfg.routes[nome] = { route, stage }` e `cfg.routeName`; `cfg.route`/`cfg.routeStage` seguem
  sendo a rota ATIVA (padrão de `sellItems`/`sellProfiles`). `saveCfg()` espelha a ativa em `routes[routeName]`;
  `migrateCfg()` (loadCfg e Importar config) transforma config antiga em "Rota 1". Trocar/criar/renomear/excluir
  pelo menu da aba Treino é imediato (`activateRoute`/`createRoute`/`renameRoute`/`deleteRoute`, módulo de nível);
  só o texto das etapas passa pelo Salvar. Não voltar a tratar `route` como única fonte.
- Recarga do painel (v3.4.0): o "⟳ Atualizar tudo" do PokeGrid é só `webview.reloadIgnoringCache()` por painel.
  Quem tira a conta da hunt no reload é a SPA do jogo: ela nasce em Cerulean e envia `set-city` ao montar; o
  servidor volta a farmar ao receber `enter-hunt { slug }` de novo (o PokeGrid tem um "↩ Voltar pra hunt"
  experimental que faz isso 12 s depois, no máx. 3 vezes; a tela pode seguir mostrando a cidade). O script
  guarda `localStorage.pgDiscordNotifyResume` antes do `location.reload()` e, na carga nova, `loadResume()` +
  `armResume()` reenviam `enter-hunt` via `switchHunt(slug, 1, 'recarga')` 3 s após o `set-city`. Slugs de cidade
  (`cerulean`, `pewter`, `viridian`, `cassino`, `arena_pvp`) nunca são reenviados.
- Guardar o Pokémon avisado (v3.6.0, levantado no bundle em 24/09/2026): a aba "Pokémon" da loja do NPC vende
  os Pokémon FORA do time (`!team && !starter && !shiny && sellValue > 0`) que não estejam `locked`, via
  `POST /api/game/pokemon/sell { pokeIds }`. O cadeado é `POST /api/game/pokemon/lock { id, locked }` (mesmo
  `gameApi` da compra). `poke-store` só tira do time para o box comum e NÃO protege da venda. O depósito da
  FAMÍLIA é outro lugar: `family-action { action:'poke', dir:'deposit'|'withdraw', capturedId }` pelo socket,
  resposta no frame `family { family:{ name, movesUsed, movesCap, frozen, members }, depot:{ items, pokes } }`
  ou `error { message }`; limite diário de movimentos, líder/starter não vão, o que entra vira da família.
  `cfg.lockNotified`/`cfg.familyNotified` aplicam isso (`keepNotified`) a quem passa nos filtros, ANTES do
  aviso; o id vem do `poke-delta` (`info.pokeId`). Sem id, avisa sem guardar (log `guardar`).
- Rota do PIW Tools (v3.7.0): https://piwtools.com.br/hunt (aba "Rota otimizada", de Rakupo / bar) calcula a rota
  NO NAVEGADOR (React + `/creatures.json`, `/map-markers.json`, simulador de batalha próprio); não há API, e o
  "Copiar link" do site não carrega as etapas (só `routeChoices`/`routeBreaks` quando editadas à mão). Por isso
  o script importa o TEXTO copiado da página: blocos "<Pokémon> / De / n / Até / n / Hunt desta etapa / <hunt>"
  (`parsePiwToolsRoute` na aba Treino → "Importar do PIW Tools"). Nível da nossa etapa = "De" da etapa seguinte
  (última: "Até"); slug da hunt = nome normalizado com `_` (confere nas 347 hunts do `map-markers.json`).
  "Copiar link do PIW Tools" monta a URL com o líder atual. Não reimplementar o cálculo do site (é autoral).
- Daily Kill (v3.8.0, bundle em 25/09/2026): missão diária "derrote N de X" (1 de 3 opções), só por REST:
  `GET /api/game/daily-kill` → `{ locked, claimed, pickedIdx, resetAt, reward:{xp,items}, options:[{ name, speciesId,
  have, qty, done, xp }] }`; `POST /api/game/daily-kill/claim` → `{ state, payout:{ xp, level, leveledUp, items:[{label}] } }`.
  Sem `dailyAuto` o script NÃO escolhe missão; `/reroll` nunca é usado. Com `dailyEnabled`, `dailyTick` consulta (30 s na
  hunt da daily, 2 min fora), conta `field-kill` da espécie e, na meta, resgata (`dailyClaim`) e volta via
  `switchHunt(slug, 1, 'daily')` para `dailyReturnSlug` > etapa da rota > `prevHuntSlug` (hunt anterior, guardada em
  `setHunt`/`noteHuntChange` e no registro da recarga). Slug de hunt a partir de nome: `huntSlugFromName()` (global).
  Daily sozinha (v3.16.0, `cfg.dailyAuto`, ROADMAP #21): escolhe a missão (`POST /pick { idx }`) só se o usuário não
  escolheu, põe de líder o Pokémon do TIME com melhor efetividade (`TYPE_CHART` = `CHART` do Tierlist do PokeGrid) ×
  nível e entra via `switchHunt(slug, 1, 'daily-ida')`; origem e líder em `localStorage.pgDiscordNotifyDaily`
  (`dailyRun`); na meta devolve o líder (`dailyRestoreLeader`) e volta para `dailyRun.from`. `dailyHoldsLeader()` pausa
  `checkLeaderLevel` enquanto a ida vale (guardado com `typeof`, porque o harness do nível não tem o módulo da daily).
- Daily Gift (v3.24.0, aba Treino → 🎁 Daily Gift, `cfg.giftEnabled` + `cfg.giftCenterMode` 'daily'|'all'|''; módulo
  `// ---- Daily Gift` entre a Daily Kill e o Clã; bundle em 30/09/2026, campos ainda não vistos no log): calendário de 28 dias
  por REST: `GET /api/game/daily` → `{ canClaim, claimedToday, blockedByVip, nextDay, total, rewards[{ day, label, qty, tag,
  claimed, current, locked }] }`; `POST /api/game/daily {}` → estado + `claimed:{ label }`. O presente cai no Gift Center
  (correio): `GET /api/game/gifts` → `{ gifts[{ id, label, icon, grantedBy }] }` e `POST /api/game/gifts/{id}/claim {}` →
  `{ granted }`. `giftTick` a cada 1 min relê a cada 30 min (5 min enquanto não liberou), resgata e entrega pelo Gift Center
  o do dia (mesmo `label`) ou tudo; '' = deixa no correio (boosts começam a contar na entrega). Aviso em `alert`;
  logs `gift`, `gift-resgate`, `gift-center`, `gift-erro`. Teste: `node test/gift.test.js` (`loadGiftModule`).
- Guardar na cidade (v3.18.0, aba Venda, ROADMAP #23, módulo `// ---- Guardar na cidade` antes da Viagem): tarefa
  `guardar` no fim de toda viagem; drops → Depot (`POST /api/game/depot/move { itemId, dir:'store' }`, pilha inteira) ou
  família (`family-action item`); Pokémon não vendidos → só família (o box JÁ é o Depot comum de Pokémon). Lista escolhida
  `depositFamilyList [{ id, name, keep }]` (v3.19.0) vai primeiro, de qualquer origem; o guardar NUNCA gera viagem própria. Família via
  `familyAction(payload, evento, dados, check)`; limite diário em `lastFamily.movesCap`. O que entra na família é DELA.
- Clã (v3.17.0, aba Profissão, ROADMAP #22, módulo `// ---- Clã` antes da Viagem): `GET /api/game/clans` (tarefa em
  `nextTask`: items/caught/kills), `POST /clans/rankup`, `/clans/change { clan, targetRank }` (só a 1ª entrada, grátis;
  NUNCA trocar de clã, custa diamante), `POST /api/game/convert { baseItemId, packs }` (100 base = 1 item de clã, mapa
  `CLAN_CONVERT`), mochila pelo frame `inventory` do `inv-get`. Converter e subir de rank só na viagem (tarefa `cla`); a
  venda de itens e de Pokémon respeita `clanKeepsItem`/`clanKeepsSpecies`. `clanRoute` é a 3ª rota excludente do Salvar.
  v3.20.5: a rota do clã só espera a Daily enquanto ela está em andamento (`dailyWantsHunt`; feita/resgatada não segura);
  item pedido que já é drop vira `base.direto` (sem conversão); toda espera tem motivo em `clanWait` (painel "parado: …",
  log `cla-espera`), nunca mais "escolhendo a hunt…" mudo.
  v3.20.6: viagem urgente para subir de rank (`clanAskTrip`) confirma com o jogo antes e é refeita a cada 5 min enquanto
  a tarefa seguir pronta (máx. 3 por rank; antes era 1 por rank e a subida caía na viagem do relógio). `refreshClan(true)`
  com leitura em andamento espera e lê de novo. Na cidade, log `cla-cidade { ok, nivelOk, convertido, falta }`.
- Rota de captura / Pokédex (v3.10.0, aba Profissão): hunts em `GET /api/game/map-markers` (público, `hunts[{ slug,
  name, level, area, looktype }]`, level 0 = cidade), espécies em `GET /game/creatures.json` (público, `creatures[{
  pokeId, name, looktype }]`, pokeId < 10000 = normal), capturadas em `GET /api/game/pokedex` (auth, `species[{ id,
  caught }]`), profissão em `GET /api/game/professions` (`speciesCount`, `nextStep.species{have,need}`). Espécie da
  hunt = mesmo `looktype`. Espécie "feita" (v3.13.2) = `caught` na Pokédex OU exemplar na conta (frame `pokes`, `catchOnPokes`)
  OU no depósito da família (`catchOnFamily`, por nome): a Pokédex só registra capturas feitas por ela, e o usuário não
  quer repetir o que já tem (ver `speciesDone`). A rota MANDA na hunt (v3.13.3): a SPA reenvia `enter-hunt` da
  última hunt escolhida na tela a cada reconexão; `catchOnHuntChange` (chamado por `setHunt`) volta para a hunt do
  alvo 8 s depois de qualquer entrada em outra hunt, exceto a da Daily. O script joga bola com `{ type:'catch', pendingId, ballId }` só com `catchRouteAuto`;
  respeita `catch-cooldown { leftMs }` e `catch-result.cooldownMs`. `field-init { slug }` define a hunt atual se o
  script não viu o `enter-hunt`. Rota de captura e rota de treino são excludentes (Salvar desliga a outra).
- Guarda de venda do PokeGrid (v3.13.4): o `index.html` do PokeGrid injeta `SELLGUARD`, que embrulha o `fetch` do
  painel e abre `window.confirm` ("PokeGrid: voce esta vendendo coisas valiosas") em `POST /api/game/pokemon/sell` com
  shiny ou qualidade ≥ 1.7 e em `POST /api/game/shop/sell` com item travado (Strange Pheromone, Rare Pokémon Picture e
  os da engrenagem). O confirm nativo trava a página. O script desliga a guarda SÓ durante os POSTs de venda via
  `withoutPokeGridSellGuard()` (interruptor oficial `window.__pgSellGuardOn`, restaurado no `finally`); nas vendas
  do script quem manda são as regras do painel. Marcador de presença: `window.__pgSellGuard`.
- Nome do personagem: `window.__poke.api['/api/characters/me'].character.name` (mesmo caminho
  que o PokeGrid usa para nomear abas). NÃO usar `.phud-name` — é o Pokémon ativo, não a conta.

## Diagnóstico sem console

- O script guarda até 200 eventos em `localStorage.pgDiscordNotifyLog` (v3.20.2: tipos barulhentos com cota própria em
  `LOG_NOISY`, ex. `catch-result` 25, para import/viagem/clã durarem horas; `script-carregado { versao }` a cada carga;
  `balls` no máximo 1x/min; socket rastreado,
  `catch-result` recebidos, decisão dos filtros, cooldown, resposta do webhook). A URL do socket é
  gravada SEM a query string (ela carrega o JWT da sessão). O botão
  **Copiar log** do painel copia esse JSON.
- O localStorage de cada painel do PokeGrid fica em disco em
  `%APPDATA%\pokegrid\Partitions\conta{1..4}\Local Storage\leveldb\`. Use
  **`python tools/read-panel-logs.py`** (ou o comando `/log`): é um leitor de LevelDB em Python puro
  (`.log` = write-ahead sem compressão, `.ldb` = blocos Snappy; a última gravação vence) que imprime a
  config e o log de cada painel com os webhooks redigidos. Não tente ler os arquivos "por texto": os
  `.ldb` são comprimidos e o JSON aparece picado. Ao usar, NUNCA copiar a URL do webhook para a
  conversa ou para arquivos do repo.
- Referência de TODAS as mensagens do WebSocket (cliente→servidor e servidor→cliente) levantadas do
  bundle do jogo, com o passo a passo para refazer: `docs/mensagens-do-jogo.md`. Consultar antes de
  planejar feature nova; formatos só valem como confirmados depois de vistos no log.

## Regras do projeto

- **NUNCA commitar URLs de webhook do Discord** (nem em exemplos com IDs reais). O repo é
  público e o Discord desativa webhooks vazados. Toda config do usuário vive no `localStorage`
  (chave `pgDiscordNotifyCfg`), editada pelo painel 🔔 que o próprio script cria.
- **Painel 🔔 (v3.5.0, proposta em `docs/design-painel.md`, mockup em `docs/mockup-painel.html`)**: 5 abas
  por objetivo (Avisos, Bolas, Venda, Treino, Sistema), cabeçalho com 5 pontos de estado, rodapé fixo com
  `#pg-dn-msg` (tipos ok/info/warn/error; warn/error ficam até o próximo clique) + **Testar canais** +
  **Salvar**. CSS em `PANEL_CSS` (`<style id="pg-dn-style">`, tokens `--dn-*`, classes `.dn-*`), sem estilo
  inline. `readForm()` devolve o rascunho no formato do `cfg` e é a ÚNICA leitura do formulário: Salvar
  (global, com os mesmos efeitos colaterais de sempre) faz `Object.assign(cfg, draft)`; `moduleState(tab, d)`
  calcula o badge ('on'|'off'|'warn'|'danger') a partir do rascunho com o painel aberto e do `cfg` fechado.
  Edição marca `dirty` ("● Alterações não salvas"; reabrir o painel não chama `fill()` enquanto sujo).
  Aba ativa em `localStorage.pgDiscordNotifyUi` (fora do `cfg`, não entra no Exportar/Importar). Os ids
  `#pg-dn-*` e as chaves de `cfg` são os mesmos de antes; ao criar campo novo, adicionar em `fill()`,
  `readForm()` e, se for liga/desliga de módulo, em `moduleState`/`stateSummary`. A versão vem da const
  `VERSION` (manter igual ao `@version`). Reserva de gold (`autoBuyGoldReserve`) foi removida na v3.5.0.
- Webhooks por tipo de evento: `webhookUrl` (capturas, principal), `webhookShiny`, `webhookAlerts`,
  `webhookLevel`. Todo envio passa por `postWebhook(kind, payload, meta)` com `kind` em
  `capture|shiny|alert|level`. **Sem fallback desde a v3.5.1** (pedido do usuário: só enviar se o canal
  estiver preenchido): `alert` e `level` com canal vazio NÃO são enviados (ficam só no log como
  `webhook-sem-canal`); a única exceção é `shiny`, que cai em `webhookUrl` por ser uma captura. Os badges
  do painel ficam ⚠ quando um módulo está ligado sem o canal dele, e o Salvar avisa. Eventos novos (ROADMAP)
  devem usar `postWebhook('alert', ...)`, nunca `fetch` direto.
- Semântica de filtro (duas etapas, ver `handleGameMessage` e `passesQualityFilter`):
  1. Nome: lista VAZIA ou `notifyEveryCapture` = qualquer Pokémon; lista preenchida = só os listados.
     Shiny com `notifyShiny` passa direto pelas duas etapas.
  2. Qualidade (decidida DEPOIS do `poke-delta`): `minTier` ('' = sem filtro; chave em minúsculas,
     ex. `legendary`), `minTierIv` (v3.4.1: poder mínimo exigido de quem passa pela raridade; 0 = qualquer)
     e `minIv` (0 = sem filtro; compara com `ivTotal` 0..192). Passa se (raridade ≥ mínima E poder ≥
     `minTierIv`) OU poder ≥ `minIv`. Nenhum configurado = passa tudo. Sem dados (timeout do delta) = passa,
     para não perder um raro. `cooldownSeconds` (painel) é o intervalo mínimo entre
  avisos do mesmo Pokémon; padrão 0 = avisar todas. Configs anteriores a `cfgVersion: 2` tinham 30s
  fixos e são migradas para 0 no `loadCfg()`.
- Comparações de nome sempre via `normalize()` (minúsculas, sem acento).
- Exportar/Importar (v3.20.1): o PokeGrid LIBERA a escrita na área de transferência (`clipboard-sanitized-write` no
  `main.js`) e NEGA a leitura: Exportar copia, mas o Importar só funciona com Ctrl+V na caixa. Exportar leva o que está
  na tela (rascunho se houver alteração não salva) + `_drops` (ids de `pgDiscordNotifyDrops`); Importar registra
  `config-importada`/`config-import-falhou` no log e avisa quando a config veio de versão mais nova que a do painel
  (painel não recarregado). `test/config.roundtrip.js` exige que o fixture cubra TODA chave do cfg: feature nova com
  campo novo precisa entrar lá. v3.20.3: `sellProfiles` SOMAM no import (a que veio ganha na mesma hunt);
  `test/config.live.js` importa num painel vivo (em hunt, com perfis próprios). Cada PC tem a própria cópia do script no
  PokeGrid: "não importou" em outro PC costuma ser painel sem Atualizar/⟳ (a versão aparece no topo do 🔔).
- Colar com o botão direito (v3.15.1): o webview do PokeGrid não tem menu de contexto e o jogo captura teclas, então
  `pasteInto(el)` (contextmenu em qualquer input de texto/textarea do painel, e o botão "📋 Colar" do Importar) tenta
  `navigator.clipboard.readText()`, depois `execCommand('paste')`, senão avisa. Exportar carimba `_versao/_exportadoEm/
  _conta`; Importar apaga toda chave `_*`, e o `flash` resume o que entrou (round-trip testado em jsdom: sem perdas).
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

1. Editar `piw-discord-notify.user.js` e **bumpar `@version`** no cabeçalho e a const `VERSION`
   (usada no `console.log` final e no cabeçalho do painel).
2. Commit + push para `main`. O usuário atualiza pelo botão "Atualizar" do PokeGrid, que
   rebaixa o arquivo do GitHub e pede reload dos painéis (a config em localStorage sobrevive).
3. Sem tags/releases por enquanto — o PokeGrid sempre baixa o `main`.

## Como testar

- **Testes isolados em Node** (sem DOM): `node test/level.test.js`, `node test/route.test.js`,
  `node test/reload.test.js`, `node test/daily.test.js`, `node test/catch.test.js`, `node test/pokesell.test.js` e
  `node test/huntloot.test.js` (tabela de drops por hunt, via `loadCatchModule`),
  `node test/deposit.test.js` (`loadDepositModule`: `// ---- Guardar na cidade` até `// ---- Viagem à cidade`),
  `node test/clan.test.js` (`loadClanModule`: `// ---- Clã: subir de rank` até `// ---- Viagem à cidade`),
  `node test/dailyauto.test.js` (daily sozinha, mesmo `loadDailyModule` com `init.team`/`init.huntCatalog`/`init.store`) e
  `node test/balls.test.js` (`loadBallsModule`: módulo de bolas + `checkBallStock`), `node test/supply.test.js`
  (`loadSupplyModule`: `// ---- Refil de poções e revives` até `// ---- Venda automática de drops`), `node test/heal.test.js`
  (`loadHealModule`: `// ---- Cura na Joy` até `// ---- Volta da cidade`), `node test/gift.test.js` (`loadGiftModule`:
  `// ---- Daily Gift` até `// ---- Clã: subir de rank`), `node test/idle.test.js` (`loadIdleModule`:
  `// ---- Volta da cidade` até `// ---- Lógica principal`; estado dos outros módulos em `init.env`) e `node test/trip.test.js`
  (`loadTripModule`: `// ---- Viagem à cidade` até `// ---- Recarga automática do painel`; timers avançam o relógio falso).
  `test/harness.js` recorta módulos do userscript pelos marcadores (`loadLevelModule`: `// ---- Alerta de nível do
  líder` até `// ---- Alerta de estoque de bolas`; `loadPokeSellModule`: `// ---- Venda automática de Pokémon` até
  `// ---- Rota de captura`; `loadCatchModule`: `// ---- Rota de captura` até `// ---- Daily Kill`, com `init.fetchJson(url)` para os
  arquivos públicos e `init.api(url)` para o REST; `loadDailyModule`: `// ---- Daily Kill` até `// ---- Recarga
  automática do painel`, com `init.api(url, opts)`; `loadReloadModule`: `// ---- Recarga automática do painel` até
  `// ---- Log persistente`) e os roda com stubs de `sendGame`, `gameApi`, `fetch`, `postWebhook`, `logEvent`,
  `saveCfg`, `localStorage`, `location` e timers (curtos rodam na hora; >= 5 s ficam em `state.longTimers`;
  `clock.now` controla o `Date.now()`). Ao mexer num módulo, rode os seis; ao criar módulo novo, siga o mesmo
  padrão (marcadores + stubs).
- **Painel (DOM)**: `node test/ui.smoke.js` carrega o userscript inteiro no jsdom com WebSocket/fetch
  falsos, abre o painel, percorre as abas, edita, salva, testa canais, importa e simula hunt/drops/time/estoque
  chegando pelo socket; falha em qualquer erro de runtime. Precisa do jsdom (`npm i -g jsdom` + `NODE_PATH`
  apontando para o `node_modules` global, ou `npm i jsdom` numa pasta temporária e `NODE_PATH` para o
  `node_modules` dela); sem ele o teste é pulado. Rodar sempre que mexer em `buildUI`.
  Chrome headless não funciona neste ambiente (sai sem output); use o jsdom.
- Sempre `node --check piw-discord-notify.user.js` antes do commit.
- Verificação manual: instalar no PokeGrid (ou colar no console de um navegador logado no jogo), usar
  o botão **Testar canais** do painel 🔔 (salva SÓ os 4 canais e envia mensagem de teste a cada um preenchido,
  sem passar pelos filtros; não salva o resto do formulário nem dispara checagens) e, para capturas reais,
  ligar **Debug** na aba Sistema. Depois, ler o que o
  script viu com `python tools/read-panel-logs.py --panel N` (ver "Diagnóstico sem console").
