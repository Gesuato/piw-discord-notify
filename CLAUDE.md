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
- `catch-result` → `{ type:'catch-result', success, speciesName, shiny, ballName, pendingId?, auto? }` (desde 18/10/2026 vem também
  `row`, `col` — posição no grid; o script não usa).
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
- Fluxo do script para IV/qualidade (módulo `// ---- IV e qualidade do indivíduo capturado`, teste
  `node test/details.test.js` via `loadDetailsModule`): `catch-result` ok → espera até 20 s
  (`DETAILS_TIMEOUT_MS`) por `poke-delta`, que normalmente chega no mesmo segundo, MAS em 02/10/2026 o
  jogo lento mandou 5–8 s depois e, com a espera antiga de 4 s, o aviso saía "sem dados de qualidade"
  (sem filtro) — não voltar a encurtar. Plano B: sem delta em 4 s (`DETAILS_POKES_MS`) ou delta sem
  `ivTotal`/`quality`, envia `pokes-get` e casa o recém-capturado na lista `pokes` pelo `id` do delta ou,
  senão, pelo ÚNICO indivíduo novo da espécie (`xp === 0`, sem delta visto em `seenDeltaIds`, ausente do
  frame `pokes` anterior à captura); 0 ou 2+ candidatos = segue esperando (nunca chuta o IV de outro
  exemplar). Delta de líder/time (`xp > 0`) não fecha a fila. Estourou: com filtro de qualidade ligado NÃO avisa
  (v3.24.6, pedido do usuário; fica no log `decisao`); sem filtro nenhum, avisa sem os campos com ⚠ no embed
  (`info.detailsTimeout`). v3.24.4: o jogo também manda o `poke-delta` ANTES do `catch-result` (mesmo
  ms, visto em 02/10/2026 16:50Z): delta novo sem captura esperando fica em `pendingDeltas` por 3 s
  (`DETAILS_PRE_MS`) e a captura que chegar o pega na hora (log `poke-delta-antes`). Não existe "órfã" (delta
  depois do timeout ia para a captura encerrada): nesse cenário ela roubava o delta da captura seguinte.
  v3.24.5: o delta de UMA captura pode nunca vir (17:34:11Z); o par delta↔captura é pelo TEMPO (captura mais nova
  com menos de `DETAILS_PAIR_MS` 1,5 s), e só sem captura recente o delta é tratado como atrasado e vai para a mais
  antiga. Com FIFO puro, um delta perdido deslocava todos os seguintes para a captura errada. Hoje o servidor também
  NÃO responde ao `pokes-get` durante a hunt (15 pedidos sem frame `pokes`); o plano B só vale quando responde. Na hunt o
  frame `pokes` só chega por conta do servidor quando o líder sobe de nível (log `time` a cada level up nas contas 1–3,
  04/10/2026); na cidade o `pokes-get` é respondido (`venda-pokes-lista { fresca: true }`). v3.27.1: com venda de Pokémon
  ligada e lista nunca lida (`pokeSellListUnread`), `tripAugment` leva a tarefa `pokes` só para ler a lista na cidade —
  antes a conta4 (líder parado de nível na hunt de Phanpy) ficava "Time ainda não lido" e sem vender para sempre.
  v3.27.2: sem venda mas com outro módulo usando a lista (`pokesListUsed`, mesmo gate do `requestPokes`), a viagem leva a
  tarefa `time` (só `pokeSellRefreshList`, nunca vende); `set-city` mandado pela mão do usuário (fora da viagem) pede a lista
  3 s depois (`pokesOnSetCity`); o frame `pokes` entra no log como `pokes-frame { total, time, hunt }` e todo `pokes-get`
  tem `motivo` (botão, cidade, delta atrasado). Conta4 em 04/10/2026: líder Golem lv 346 com 396 XP/abate — nunca sobe.
  CAUSA REAL (confirmada em 04/10/2026): o servidor NÃO manda o frame `pokes` quando o box está grande demais (conta4 com
  centenas de Phanpy sem vender): nem ao carregar, nem ao `pokes-get` na cidade, sem frame `error`; os outros painéis recebem
  em < 0,5 s. Depois que o usuário vendeu os Pokémon na mão, a lista voltou a chegar. Não há REST para a lista (a tela do
  jogo usa o mesmo `pokes-get`). Sintoma: "Time ainda não lido" + `pokes-get` com `enviado: true` e nenhum `pokes-frame`.
  DEFESAS (v3.28.0, módulo `// ---- Box` dentro da venda de Pokémon, aba Venda → "Avisar com box acima de", `cfg.boxAlertAt`
  padrão 200, 0 = desligado): (1) `boxEstimate()` = total do último frame + capturas (`boxNoteCapture`, chamado em
  `handlePokeDelta` para xp 0) − vendidas; no limite `boxCheck` pede `tripRequest('pokes')` e avisa 1x/h (`box-alerta`);
  `boxMaxSeen` = maior lista lida (log `box`). (2) `pokesNoteSilent` conta pedidos na cidade sem frame (refresh da viagem e
  chegada manual); 2 seguidos = alerta `pokes-mudo` 1x/h. (3) Plano B: `captureQueue` (dados do `poke-delta`, chave
  `localStorage.pgDiscordNotifyBox`, máx. 3000) — `runPokeSellCycle` sem lista fresca soma `pokeSellQueueCandidates`
  (mesmas regras, ≥ 2 min pelo `at`, nunca quem `lockPokemon` travou via `boxNoteLocked`); o frame poda a fila para quem
  ele mostra como vendável; a venda tira da fila. Nunca exportar a fila (é da conta). Teste: `node test/pokesell.test.js`.
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
  módulos que trocam de hunt checam `healBusy()` (com `typeof`, por causa dos harness). SEMPRE volta para a hunt: a
  proteção "3 quedas em 30 min = fica na cidade" foi REMOVIDA na v3.24.3 a pedido do usuário (raiumundo ficou parado em
  magneton); `healDeaths` só conta para o log `cura` e para avisar 1x por janela. Não reintroduzir sem pedido.
- Parada na cidade (v3.23.0, aba Compras → 🏙️ Parada na cidade, `cfg.cityIdleEnabled` LIGADO por padrão, `cityIdleMin` 10;
  módulo `// ---- Volta da cidade` entre a Cura na Joy e a Lógica principal): pedido do usuário, "mais de 10 min na cidade = a
  conta bugou". Parada = hunt do script nula/cidade sem `field`/`field-kill` no período, ou hunt pedida sem frame nenhum
  (`idleSinceAt`). `idleGoBack`: (`leave-hunt` + `set-city` se era hunt morta) → `joy-heal` → `pokes-get` confere o hp →
  `switchHunt(slug, 1, 'cidade')`. Destino: alvo do clã > etapa da rota > `lastRealHunt` (desde a v3.24.3 as quedas da
  cura não excluem a hunt).
  Espera viagem/cura/troca/venda/recarga; a rota de captura tem volta própria. 3 voltas em 1 h sem frame = desiste e avisa.
  v3.33.1: "parada" TAMBÉM é hunt preenchida no script sem nenhum frame (`field`/`field-init`/`field-kill`/`poke-xp`) há
  `cityIdleMin` — antes um único frame depois da entrada fazia `idleSinceAt` devolver 0 para sempre, e a conta que o servidor
  tirou da hunt sem a tela mandar `leave-hunt` (reconexão que caiu na cidade) ficava parada sem `cidade-parada` no log
  (10/10/2026). Status/aviso dizem onde parou ("em <hunt> sem abates" / "fora de hunt"); o log `inicio` traz `ultimoFrame`.
  v3.36.0: `cfg.cityIdleHunt` (painel "Hunt padrão", nome ou slug via `huntSlugFromName`; `idleDefaultSlug(d)`) é o destino
  de ÚLTIMO recurso da parada na cidade, da volta da viagem (`tripReturnSlug`) e da cura (`healStart`), depois de clã > rota
  > última hunt. Pedido do usuário em 11/10/2026: "o personagem nunca deve ficar parado; NÃO PODEMOS PERDER TEMPO PARADO".
  Sintoma sem ela (visto na 3.35.0 no outro PC, 11/10/2026): conta recém-atualizada parada na cidade, sem hunt lembrada,
  status "não sei de que hunt veio" para sempre.
- Esperar na cidade (v3.44.0, aba Sistema → "⏸ Esperar na cidade", botão imediato fora do Salvar; módulo `// ---- Esperar na
  cidade` entre a Lógica principal e a Interceptação do WebSocket, fora de todo recorte dos harness): pedido do usuário em
  21/10/2026 ("peguei emprestado o Pokémon em outra conta e gostaria que ele ficasse esperando na cidade"). Estado `holdRun`
  em `localStorage.pgDiscordNotifyHold` (FORA do cfg: é da conta, não entra no Exportar/Importar; sobrevive à recarga —
  `holdLoad()` roda antes de `loadResume()`). `holdActive()`/`holdReason()` (sempre com `typeof`, por causa dos harness):
  `switchHunt` recusa toda entrada e devolve `false` (log `espera-cidade { fase:'bloqueou' }`, 1x por origem a cada 5 min),
  `idleBusyReason` devolve o motivo, as rotas (captura/daily sozinha/farm/guild/clã) esperam, `healStart` é pulada, `armResume`
  não volta, a viagem zera `volta` quando recusada. `holdOnHuntChange` (em `setHunt`): a tela religou a hunt → `leave-hunt`
  de novo 2 s depois (1x/30 s; arena `*_boss` não conta). Desligar = `joy-heal` + `switchHunt(idleTarget().slug, 1, 'cidade')`.
  Badge ⚠ na aba Sistema enquanto ligado. Teste: `node test/hold.test.js` (`loadHoldModule`), caso 9 do `idle.test.js`.
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
  `set-city` manual após 10 s; volta = `switchHunt(slug, 1, 'viagem')`. v3.36.3: a tela pode mandar `enter-hunt` NO MEIO da viagem
  (conta2, 12/10/2026 23:12Z: o usuário foi à cidade na mão, a viagem começou já na cidade e 5 s depois a tela voltou à hunt; a retirada
  da comida do breeding na família falhou com "não está disponível durante a hunt"): antes de cada tarefa `tripInHunt()` = `tripLeaveHunt()`
  de novo (log `viagem-hunt-no-meio`); falha do breeding "durante a hunt" tenta em 3 min (`BREED_HUNT_RETRY_MS`), não em 30. No harness da
  viagem `leave-hunt` zera a hunt e `switchHunt` a preenche, como no script. `runSellCycle(manual, wantedIds, huntName)`
  recebe a lista congelada (na cidade `huntSlug` é null e `huntLoot` zera). NUNCA chamar `runSellCycle`,
  `runPokeSellCycle` ou `autoBuyBalls` direto de dentro da hunt de novo. Cidades: `CITY_SLUGS` (lista `o4` do bundle).
  Relógio ÚNICO (v3.15.0): `tripEveryMin`/`tripEveryMaxMin` (`drawTripDelay`/`restartTripCycle`/`tripDueAt`); vencido,
  `tripTick` leva tudo que `tripAugment` achar, ou só sorteia o próximo horário. Não existem mais intervalos próprios de
  venda de itens/Pokémon. A faixa `#pg-dn-trip` é um elemento só, movido para a aba ativa (Compras/Venda) em `showTab`;
  `tripStatus(d)` devolve `{ busy, pct, title, sub }` para ela. Venda = blocos `.dn-blk` (um aberto por vez).
  Chamadas por aba: `docs/chamadas-por-aba.md`. v3.45.1: pedido urgente que não sai (cura, Auto Boss, troca de hunt/líder, captura esperando
  detalhes, intervalo mínimo) vira log `viagem-espera { tarefas, motivo, pedidoHa }` 1x/5 min (`tripBlockedReason`) e aparece no título da
  faixa de viagem — "pedi a viagem e nada acontece" se lê direto no log.
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
  `migrateCfg` roda ANTES de `TIERS` existir (TDZ), por isso não usa `tierByKey`. v3.34.0: `cfg.pokeSellKeepQuality`
  (painel "Guardar com qualidade a partir de", ex.: 1.79; `pokeSellKeepQ(d)`, aceita vírgula) = `quality` ≥ piso NUNCA vende,
  antes de qualquer regra por raridade (pedido do usuário em 10/10/2026). Intervalo sorteado em
  `pokeSellEveryMin`–`pokeSellEveryMaxMin` (v3.13.0, padrão 10–15 min; `restartPokeSellCycle` na carga, no Salvar e
  após cada venda; `pokeSellTick` pede `pokes-get` quando vence). Lote recusado pelo jogo (ex.: "anunciados no mercado",
  flag `listed` na lista) é retentado um por um; recusados ficam em `pokeSellRejected` na sessão (log `venda-pokes-recusado`
  com os campos; `pokes-campos` registra as chaves do frame na 1ª leitura). Nunca vende time/líder, inicial, shiny, nível > 1 (v3.38.0, regra fixa, pedido em 16/10/2026), `locked`, `listed`, `sellValue` 0, sem IV ou
  capturado há < 2 min (`recentCaptureIds`, alimentado pelo `poke-delta`). Usa o frame `pokes` (por isso
  `requestPokes` roda mesmo sem alvo de nível quando `pokeSellEnabled`) e `POST /api/game/pokemon/sell { pokeIds }`.
  v3.24.7: `runPokeSellCycle` pede `pokes-get` e espera a lista fresca até 5 s (`pokeSellRefreshList`, log
  `venda-pokes-lista { fresca }`) antes de decidir, porque o último frame pode ser velho (Pokémon posto no time na mão).
  Sem resposta segue com a última lista. Harness: `init.freshPokes` responde ao `pokes-get`; timers avançam o relógio.
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
  v3.35.0 (pedido do usuário em 11/10/2026: "após atualizar a página no PokeGrid ele não volta para a hunt e fica parado"):
  o registro de retomada também é gravado em `pagehide`/`beforeunload` (`saveResume('tela')`), então a recarga MANUAL
  (⟳ do PokeGrid, F5) volta para a hunt como a automática — antes só o `location.reload()` do script gravava, e a conta
  nascia em Cerulean sem `resumeHunt` nem `lastRealHunt`. Recarga no meio de viagem/cura/volta da cidade guarda a hunt de
  volta (`resumeSlugNow`); parado na cidade por vontade própria = sem hunt. `loadResume()` arma um fallback de 45 s
  (`RESUME_FALLBACK_MS`): sem socket nem `set-city`, `resumeHunt` ficava pendurado e a parada na cidade esperava "volta da
  recarga pendente" para sempre. A última hunt também fica em `localStorage.pgDiscordNotifyLastHunt` (`saveLastHunt` em
  `noteHuntChange`, `loadLastHunt` até 24 h, log `hunt-lembrada`): com o registro velho (PokeGrid fechado por horas) a
  parada na cidade ainda tem destino em vez de "não sei de que hunt veio". Logs `recarga-retomada { origem }`,
  `recarga-hunt { enviando | jaNaHunt | cura | trocando }`. Teste: `node test/reload.test.js` (casos 8–12) e `daily.test.js`.
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
  v3.37.0 (pedido do usuário em 12/10/2026: "bloquear os monstros da daily em Orre, só Outland ou Kanto"): `cfg.dailyAreas`
  (painel "Regiões aceitas" na Daily Kill; padrão kanto + outland; vazio = padrão) — `dailyHuntFor` só devolve hunt dessas
  regiões (`dailyHuntsFor` lista todas as hunts da espécie; a de menor nível permitida ganha). Missão sem hunt permitida não é
  escolhida; escolhida na mão, a ida não acontece e o status diz "fica em orre (região bloqueada)". Mudar as regiões no Salvar
  zera `dailyPickTried`. Hunt sem `area` (catálogo de teste) passa. Casos 5–8 do `test/dailyauto.test.js`.
- Daily Gift (v3.24.0, aba Treino → 🎁 Daily Gift, `cfg.giftEnabled` + `cfg.giftCenterMode` 'daily'|'all'|''; módulo
  `// ---- Daily Gift` entre a Daily Kill e o Clã; bundle em 30/09/2026, campos ainda não vistos no log): calendário de 28 dias
  por REST: `GET /api/game/daily` → `{ canClaim, claimedToday, blockedByVip, nextDay, total, rewards[{ day, label, qty, tag,
  claimed, current, locked }] }`; `POST /api/game/daily {}` → estado + `claimed:{ label }`. O presente cai no Gift Center
  (correio): `GET /api/game/gifts` → `{ gifts[{ id, label, icon, grantedBy }] }` e `POST /api/game/gifts/{id}/claim {}` →
  `{ granted }`. `giftTick` a cada 1 min relê a cada 30 min (5 min enquanto não liberou), resgata e entrega pelo Gift Center
  o do dia (mesmo `label`) ou tudo; '' = deixa no correio (boosts começam a contar na entrega). Aviso em `alert`;
  logs `gift`, `gift-resgate`, `gift-center`, `gift-erro`. Teste: `node test/gift.test.js` (`loadGiftModule`).
- Evolução automática (v3.25.0, aba Treino → 🧬 Evolução, `cfg.evolveEnabled`; módulo `// ---- Evolução automática` antes do
  Daily Gift; bundle em 02/10/2026, formatos ainda não vistos no log): `GET /api/game/evolve?capturedId=<id>[&destId]` →
  `{ name, level, needLevel, canEvolve, hasStones, keepLevel, destName, destId?, itemOnly, stones[{ itemId, name, need, have,
  icon }], branches[{ destId, destName, needLevel, canEvolve, hasStones, stones }] }`; `POST /api/game/evolve { capturedId,
  useStone, destId? }` → `{ name }`. `useStone:true` gasta as pedras e mantém o nível; `false` é grátis mas volta ao Lv.1 —
  o script SÓ usa pedra (pedido do usuário). O jogo só deixa evoluir em Cerulean: é tarefa da viagem (`evoluir`, pedida
  por `evolveOnPokes` quando um Pokémon do TIME tem `level >= evolveNeedLevel`, uma vez por Pokémon por episódio em
  `evolveAttempted`; carona via `evolveWanted`). Com `tripCity` ≠ cerulean manda `set-city cerulean` antes. Linha ramificada
  só evolui com pedra para UM destino. Sem pedra: aviso 1x por motivo (`evolveFailed`), tenta nas próximas viagens.
  Logs `evolucao { campos }`, `evolucao-cidade`. Teste: `node test/evolve.test.js` (`loadEvolveModule`).
  v3.39.0 (pedido do usuário em 16/10/2026: "ir buscar no depot pessoal ou família as pedras necessárias"): pedra que falta
  na mochila é buscada NA CIDADE, nessa ordem, no Depot comum (`GET /api/game/depot` → `depot[]`; `POST /api/game/depot/move
  { itemId, dir:'withdraw' }` traz a PILHA inteira; `cfg.evolveFromDepot`, padrão ligado) e no depósito da família (`family-get`
  → `depot.items`; `familyItemWithdraw` com a quantidade exata; `cfg.evolveFromFamily`, padrão ligado). Só busca com `canEvolve`
  (nível ok) e quando as duas fontes JUNTAS completam a conta (nunca tira pedra à toa); linha ramificada só se completam UM
  destino; depois relê a janela e só evolui com `hasStones`. Helpers `familyDepotItems()`/`familyDepotAt()` ao lado de
  `lastFamilyDepot` (o harness da evolução não enxerga as variáveis). Log `evolucao-pedras { item, doDepot, daFamilia }`;
  `evolucao` traz `buscouPedras`. Casos 7–12 do `test/evolve.test.js`.
- Poke Slot Machine (v3.26.0, aba Treino → Poke Slot Machine, `cfg.slotEnabled` + `cfg.slotWanted` lista por vírgula em ordem de
  preferência; módulo `// ---- Poke Slot Machine` entre a Evolução e o Daily Gift; bundle em 02/10/2026, formato CONFIRMADO no log em
  03/10/2026 03:44Z: raiz traz também `now, gold, diamonds, level`, cada slot traz `rolls`; 1º giro real na conta4 às 03:47Z, viagem a
  Cerulean → `set-city shopping` → roll/pick em 14 s, o servidor aceitou): NPC `pokeslot` da cidade `shopping`; por dentro o jogo chama de "golden stars". `GET /api/game/golden-stars` → `{ cards, slots[{
  slot, unlocked, vipLocked, freeReady, freeRollAt, active{ name, speciesId, pct, bonusType, rarity, startedAt, expiresAt }, candidates[{
  speciesId, name }] }], config{ freeRollCooldownMs, candidates } }`; `POST .../roll { slot }` → `{ state, candidates }` (grátis só com
  `freeReady`; o script NUNCA gasta cards); `POST .../pick { slot, speciesId }` → `{ active, state }`. Bônus vale só contra a espécie
  escolhida (exp/loot/catch/damage/defense/critChance/critDamage/shiny). Texto "Como funciona" do jogo (colado pelo usuário em
  02/10/2026): roll grátis a cada 12 h por slot, depois 1 card; escolha direta 5 cards; faixas Comum +5–10%, Incomum +10–15%, Raro
  +15–20%, Épico +20–25%, Lendário +25–35%; o bônus dura ~2 h (usuário). Slot pronto = liberado, sem trava VIP, com sorteio pendente ou
  roll grátis sem estrela ativa de um pedido → `tripRequest('slot')` + carona (`slotWanted`); `slotCityWork` manda `set-city shopping`
  se `tripCity()` for outra, gira e escolhe o 1º pedido sorteado, senão um qualquer (pedido do usuário). Nomes comparados por `slotKey`
  (v3.26.1: espaço, `_` e `-` equivalentes, porque os outros campos do painel viram slug `ancient_pinsir`). Erro = 15 min por slot
  (`slotTriedAt`). Logs `slot-campos`, `slot`, `slot-roll`, `slot-erro`, `slot-cidade`. Teste: `node test/slot.test.js` (`loadSlotModule`).
- Breeding automático (v3.29.0, aba 🥚 Breeding, `cfg.breedEnabled`, `breedLines` (até 2 linhagens), `breedFoodIvMax`, `breedFamily`,
  `breedDouble`; módulo `// ---- Breeding automático` entre o Daily Gift e o Clã; REST `center`/`quote`/`breed`/`hatch` CONFIRMADOS no
  log em 09/10/2026 nas contas 2 e 3; formatos em `docs/mensagens-do-jogo.md` → "Breeding Center"; o farejador `rest-breeding` da
  v3.28.1 saiu na v3.29.1): os 2 pais são
  CONSUMIDOS; o filho nasce com o IV e a distribuição por stat do pai de MAIOR quality (`ivPreview.donorId`/`growth`) e quality =
  maior + Δ (Grátis 0,005–0,04); **a ordem dos slots NÃO decide o doador** (conta2: fraco no slot 1, `donorId` = slot 2). O que sobe é
  a LINHAGEM: "quem sobe" vira o ovo e o filho vira quem sobe (geração +1). Regras fixas do usuário ("SUPER IMPORTANTE"): quem sobe
  sempre em `parent1`; comida da mesma espécie com quality E IV menores (até 0,15 abaixo, IV < teto), nunca shiny/time/inicial/Ditto/
  travado; antes de todo breed a cotação (free=1) tem de dar `donorId` = quem sobe, `growth` somando o IV dele e `baseQuality` = Q
  dele (`breedCheckQuote`), senão NÃO cruza e avisa; quem sobe e, da espécie dele, quem ainda pode servir de comida ou é tão bom
  quanto ele (quality ≥ referência − 0,15; `breedLineQ` = quem sobe no box > `pendingChild` > `lastQ`) ficam fora da venda de Pokémon
  e do depósito na família (`breedKeepsPoke` em `pokeSellReason`/`depositPokeReason`); sem quality conhecida, protege. v3.36.1: antes
  a espécie INTEIRA era protegida e a conta1 (12/10/2026) juntou 312 Rhyhorn de Q 0,9–1,3 no box → 313 ≥ 200 → o servidor calou o
  frame `pokes` (40 `pokes-mudo` seguidos) → filho chocado nunca identificado ("filho não identificado — escolha abaixo") e venda
  sem lista: ciclo fechado. Status da linhagem diz quando a lista nunca veio. v3.47.0 (relato de 26/10/2026: quem sobe de Q baixa
  protegia quase toda captura e, sem stones, o box enchia sem parar): a proteção tem TETO por linhagem (`cfg.breedKeepMax`, painel
  "Fora da venda … até N da espécie", padrão 20, 0 = sem teto) — `breedKept(l, ref, max)` ranqueia box fora do time + `captureQueue`
  (comida que serve hoje primeiro, maior quality primeiro, depois quem é tão bom quanto quem sobe) e só os N primeiros passam em
  `breedKeepsPoke`; o resto vende pelas regras da aba Venda; desconhecido só é protegido com vaga. Caso 13 do teste.
  v3.48.0 (pedido do usuário em 26/10/2026: "quando o Pokémon chega a 1,96 já não dá para continuar subindo com Pokémon dropados;
  precisamos breedar a comida"): **comida em criação** (`cfg.breedFoodBreed`, painel "Criar comida quando nenhuma servir", padrão
  desligado). Quem sobe em Q 1,96 só come Q 1,81–1,96 e captura nunca chega lá. Sem NENHUMA comida que sirva, a linhagem ganha a
  sub-linhagem `line.food` (mesmo formato de uma linhagem; `breedUnits()` = linhagens + comidas em criação, usado em proteção, ovos,
  filho, hatch e cidade; `breedUnitInfo(u)` diz de quem é). `breedFoodTrunkPick(trunk)` escolhe quem VIRA comida: da espécie, ABAIXO
  da faixa de 0,15 (quem está na faixa já serve ou tem IV demais, e cruzar não baixa IV), IV (+1 de margem se dobrar) abaixo do de
  quem sobe e do teto, com comida própria que sirva (`breedFoodPick` dele); maior quality primeiro (menos gerações, `breedFoodGens`,
  Δ esperado 0,01). `breedPlanFood` cota (mesmo checklist, `donorId` = quem vira comida) e pede a viagem; o filho vira a comida em
  criação (geração +1) e repete até a quality entrar na faixa; aí `breedFoodReason` deixa a comida em criação da PRÓPRIA linhagem
  ser comida de quem sobe (as outras unidades nunca) e, consumida, `line.food = null`. Só cruza comida enquanto quem sobe está parado
  sem comida (usa o slot que ele não usa); quem vira comida pode estar na família (`food.familia`, retirado na viagem antes da cotação).
  Logs `breeding-comida { fase: escolhida | sumiu | consumida }`; `breeding-cotacao`/`breeding-cruzou` trazem `criacao: true`. Caso 14 do teste.
  v3.49.0 (mudança do JOGO, 26/10/2026, vista no outro PC: "Comida em criação … porém não tem nada sendo incubado" — cotação e última
  viagem falhando com "Os dois pais precisam estar na Breeding Box — separe-os na aba Breeding Box do Depósito"): o Depósito ganhou a
  aba 🥚 **Breeding Box** e só quem está nela cota/cruza no centro (`docs/mensagens-do-jogo.md` → "Breeding Box"). `pokes[].breedingBox`
  = está lá; socket `breedbox-move { dir, pokeIds }` → `breedbox-moved { moved, skipped }` | `error`. Na hunt a cotação que falha com
  esse texto NÃO para a linhagem (planeja sem cotar, log `breeding-box { fase:'cotacao-na-viagem' }`); na viagem `breedBoxMove([quem
  sobe, comida], 'in')` separa quem falta antes da cotação e confere pela lista nova (espera o frame `pokes` que o servidor manda, senão
  `pokes-get`; log `breeding-box { ok, moved, skipped, faltam }`). Lá dentro o jogo não vende nem deposita na família: `pokeSellReason`/
  `depositPokeReason` devolvem 'na Breeding Box'. Os filhotes nascem lá: `breedAdoptChild` prefere candidatos com `breedingBox`. Caso 15
  do teste. v3.36.2: cruzamento feito NA MÃO é adotado em
  `breedSyncLines` — linhagem com filho por identificar (ou quem sobe sumido de uma lista lida) + UM ovo livre da espécie no centro =
  o ovo é dela (`breeding-ovo-adotado`, geração +1 com Q/IV do `hatch`); 0 ou 2+ ovos livres = segue pendente. Grátis cobra 2.000.000 de gold + 20 stones (40 com dobrar);
  3000 abates para chocar. Fluxo: `breedTick` (1 min) lê o centro a cada 2 min, choca o `ready` (POST hatch → `{ ok, child{ quality,
  delta, ivTotal, growth, bqs } }` SEM id; o filho é achado no frame `pokes` por id novo, senão pela quality+IV do `child` (dica guardada
  em `pendingChild` para os frames seguintes), senão pelo IV igual/+1), planeja (comida mais fraca primeiro, cota se ela está no box) e
  `tripRequest('breeding')`;
  `breedCityWork` na viagem: tira stones/comida da família (`family-action … dir:'withdraw'`, CONFIRMADO no log em 09/10/2026 13:15Z,
  conta1: mesmos campos do depósito, `itemId`+`quantity` / `capturedId`; v3.29.2: todo `family-action` enviado pela tela ou pelo script
  vira log `familia-envio { action, dir, itemId, quantity, capturedId, campos }` em `handleOutgoing`), cota de novo, checklist e POST breed. Sem material: `breedWaitSet` avisa 1x por motivo e tenta a cada 30 min. Nunca
  usa cadeado do jogo em quem sobe (não se sabe se o servidor cruza Pokémon travado). Logs `breeding-centro`, `breeding-cotacao`,
  `breeding-cruzou`, `breeding-falhou`, `breeding-choca`, `breeding-filho`, `breeding-parado`. Teste: `node test/breeding.test.js`
  (`loadBreedModule`: do marcador até `// ---- Clã: subir de rank`; o Daily Gift agora termina no marcador do breeding).
- Farm por lista (v3.33.0, aba 🎒 Farm, `cfg.farmEnabled` + `cfg.farmList` `[{ item, qty, hunt, got }]`; módulo `// ---- Farm por
  lista` entre o Breeding e a Guild): pedido do usuário em 10/10/2026 ("coloco 1000 x item x e o nome do monstro; quando acabar vai para
  o próximo"). Linha do painel `quantidade item @ monstro` (`parseFarmLine`; monstro = slug da hunt ou nome da espécie, vazio = a hunt
  que mais dropa o item até o nível do time, `farmHuntFor`). `got` = drops do item contados no `field-kill` (`farmOnKill`, pelo NOME
  do loot, de qualquer hunt; NÃO é a mochila), persistido no cfg (gravação no máximo a cada 10 s, na hora ao fechar); `readForm`
  conserva o `got` por item+monstro (`parseFarmText`). Etapa atual = 1ª com `got < qty` não pulada; fechou → aviso em `alert` com a
  próxima e `farmTick` na hora; lista toda fechada → volta para `farmFrom`. 5ª rota excludente do Salvar (`farmOn`); espera viagem,
  cura, troca, líder e Daily Kill como a guild; `farmOnHuntChange` reentra 8 s depois; hunt inexistente ou `farmHuntFailed` sem outra
  hunt da espécie = etapa pulada na sessão (`farmSkipped`, aviso) e o Salvar/"Zerar contagem" (`farmReset`) tenta de novo. Itens da
  lista ficam fora da venda de drops e do guardar (`farmKeepsItem`, por nome no `items.json`/`huntLoot`). Botões "Pular item atual"
  (got = qty, persistido) e "Zerar contagem". Logs `farm-alvo`, `farm-espera`, `farm-etapa`, `farm-pulada`, `farm-volta`,
  `farm-reentrada`, `farm-hunt-falhou`, `farm-aviso`, `farm-zerado`. Teste: `node test/farm.test.js` (`loadFarmModule`).
- Guild (patch 1.9 do jogo, 09/10/2026; v3.30.0 = farejador, ROADMAP #32; protocolo completo em `docs/mensagens-do-jogo.md` →
  "Guild"): tudo pelo socket, sem REST. `guild-get { withList }` → frame `guild { guild, me{ gold, donatedToday, donateCap, buff },
  members, hunts (3 Caçadas do dia: kind kill/catch/fish/berry/evolve/egg/boss/orre/nightmare/photo), dailies (por região kanto/
  outland/orre/nightmare, verb kill/catch), tribute{ itemId, itemName, progress, goal, mine, done }, talents, history, invites, list }`;
  `guild-dirty` = releia; `guild-action { action, ... }` com donate{ amount } (gold, teto diário por membro), tribute{ amount } (item
  do dia, consumido), talent{ key } (só Presidente) etc. Módulo `// ---- Guild` antes do Clã: lê 6 s após o socket, a cada 30 min e
  30 s após `guild-dirty`; logs `guild-campos`, `guild`, `guild-get` e `guild-envio` (o que a tela manda). Frame CONFIRMADO no log em
  10/10/2026 01:25Z (4 contas; extras `lifetimeGold`, `daily.kind`, `tribute.id`/`buffKind`, `points{total,spent,available}`,
  `nextSlot.slot`); `donateCap` 500.000 POR MEMBRO (conta2 doou com a conta1 no teto; frame `guild` 170 ms depois, `flash` null);
  erros: "Você já doou o máximo de hoje (500.000 gold)." (v3.31.2: segura até `huntsEndAt`), "Você só pode doar mais N gold hoje."
  (refaz 1x com N), "Você só pode doar até 500.000 gold por dia."; `guild-dirty` chega a todo membro com a janela fechada. v3.31.0 (aba 🛡 Guild,
  ROADMAP #32 etapa 2): `guildDonateGold`/`guildDonateKeep` (doa min(quer − doado, teto − doado, gold − reserva) ao ler o frame),
  `guildTributeEnabled`/`guildTributeKeep` (deposita min(mine − guardar, meta − progresso); `guildKeepsItem` tira o item do dia da
  venda e do guardar), `guildAlerts` (transições entre frames; ligar em UM painel). Toda ação fica em `guildPending` até o frame
  `guild`/`error` (4 s; senão `guild-get` para conferir) e é conferida por `donatedToday`/`tribute.progress`; erro = 1 h sem insistir
  (`guildTriedAt`). Logs `guild-acao`, `guild-doacao`, `guild-tributo`, `guild-aviso`. Nunca automatizar talentos, convites, cargos,
  brasão ou dissolver. v3.32.0 (rota da guild, `// ---- rota da guild` dentro do módulo): `guildFarmTribute` (hunt que mais dropa o item
  do tributo, `lootPerKill`) → `guildHuntEnabled` (hunt da espécie do "Derrotar", até o nível do time) → `guildFishEnabled` (`GET/POST
  /api/game/fishing-tier` na faixa natural + `switchHunt('pesca', 1, 'guild')`, reentra após `fishing-cooldown`); 4ª rota excludente do
  Salvar (treino/captura/clã); espera viagem/cura/troca/Daily; `guildFrom` = volta; `guildOnHuntChange` reentra 8 s depois; falha de
  entrada = `guildFailed` na sessão. Teste: `node test/guild.test.js` (`loadGuildModule`: `// ---- Guild` até `// ---- Clã`, inclui a Pesca).
  v3.42.0: a ordem tributo → Derrotar → pesca NÃO é mais fixa: `cfg.guildRouteOrder` (select "Prioridade" da aba Guild, lista de
  `tributo`/`fish`/`kill`; `guildRouteOrder(d)` normaliza texto/lista e completa com o padrão `GUILD_ORDER_DEFAULT` = tributo → pesca →
  "Derrotar", pedido do usuário em 19/10/2026). `guildPlan` monta as partes e ordena por ela; objetivo `done` ou com a parte no teto sai
  do plano e o próximo entra. Caso 7 do `test/guild.test.js`.
  v3.46.0 (relato do usuário em 24/10/2026, outro PC com 4 contas dedicadas às tarefas: "quando acaba de matar os monstros
  necessários ele não volta pra hunt de caçar"): `guildFrom` só era anotado na troca feita pelo script e vivia em memória — conta
  recarregada já dentro da hunt da guild (`recarga-retomada`) ou que começou na cidade fechava o objetivo com `guildFrom` nulo e
  `guildReturn` não ia a lugar nenhum (`guild-volta { volta: null }`). Agora a origem fica em `localStorage.pgDiscordNotifyGuild`
  (24 h, `guildSaveFrom`/`guildLoadFrom` no 1º `guildRouteTick`, log `guild-origem-lembrada`; é da conta, fora do Exportar/Importar) e
  `guildReturnTarget()` = origem > hunt padrão do painel (`cityIdleHunt`, `idleDefaultSlug`, aba Compras → Parada na cidade), o MESMO
  campo da parada na cidade/viagem/cura (sem campo novo na aba Guild). Plano vazio com origem lembrada também volta. Toda volta por
  objetivo fechado avisa em Alertas por conta (`guild-volta`, independe de `guildAlerts`: este é o aviso da guild inteira, só sai
  com o frame `guild` — 30 min ou `guild-dirty` — e deve ficar ligado em UM painel). Sem destino: fica, avisa o motivo, badge ⚠ e
  linha da rota "no fim volta para …". Caso 8 do `test/guild.test.js` (harness com `localStorage`/`idleDefaultSlug`, `init.store`).
  v3.39.1 (pedido em 16/10/2026: "cada personagem só pode matar 9600 e fica nessa quest"): cada caçada traz `mine` (parte do personagem)
  e `cap` (teto por membro, 40% da meta; bundle "Sua parte: n/cap — o resto precisa vir de outros membros"). `guildHuntCapped(h)` =
  `mine >= cap` com `done: false` → a caçada sai do plano desta conta (motivo `sua parte da caçada "…" fechou`), a rota segue para o
  próximo objetivo ou volta para `guildFrom`. `guildCountKill` soma os `field-kill` na hunt alvo e, na estimativa do teto, pede
  `guild-get` (motivo `parte da caçada no teto`, 1x/2 min) — quem decide é o frame. Aviso `◐ Sua parte … fechou` com `guildAlerts`;
  log `guild` traz `minha`/`teto`. Frame sem `cap` segue como antes. Caso 6 do `test/guild.test.js`.
- Pesca (v3.31.1, farejador; bundle em 10/10/2026, `docs/mensagens-do-jogo.md` → "Pesca"): NPC Pescador → `GET /api/game/fishing-tier`
  `{ skill, inLevel, forNext, selected, cooldownMs, tiers[{ id, unlocked, natural, minSkill, mobLevel, names, fish }] }`;
  `POST /api/game/fishing-tier { tierId }` e depois a tela faz `enter-hunt { slug:'pesca' }` (a pesca É uma hunt de slug fixo
  `pesca`, `FISH_SLUG`); `fishing-cooldown { ms }` = reentrar depois de ms; `fishing-levelup { level }`. Módulo `// ---- Pesca` antes
  do Clã só registra (`pesca-campos` 12 s após a carga, `pesca-cooldown`, `pesca-nivel`, `pesca-abate` = 1º `field-kill` em `pesca`).
  Caçada da guild kind `fish` conta peixes. CONFIRMADO no log em 10/10/2026 01:55Z (conta1): 10 faixas, hunt `pesca`, peixe = `field-kill`
  comum (xp 3, sem loot), `fishing-levelup { level }`. `fishing-cooldown` ainda não visto.
- Verificação humana (v3.40.0, Cloudflare Turnstile; bundle em 18/10/2026, `docs/mensagens-do-jogo.md` → "Verificação humana";
  campos ainda NÃO vistos no log; módulo `// ---- Verificação humana` antes da Cura na Joy, sem config): o jogo pede de vez em quando a
  prova "sou humano" (um clique). `GET /api/auth/human` → `{ mode, until, renewBeforeMs }`; a tela renova sozinha a cada 20 min
  (`POST /api/auth/human { token }`). O servidor exige fechando o socket com o código 4011 (a tela não reconecta até verificar) ou com
  403 `{ code:'human-check' }` no REST (evento `pw:human-check` na janela); janela "🧑 Confirme que você é humano" (`.win-window`),
  widget em `#pw-turnstile-host.on`. O script NÃO resolve o desafio (pedido de "auto resolve" em 18/10/2026 foi recusado: é burlar a
  prova de humano): `trackSocket` ouve o `close` (`humanOnSocketClose`, log `socket-fechado`), `gameApi` chama `humanOnRestForbidden`
  no 403 (e dispara `pw:human-check` para a tela abrir a janela), `humanWatchTick` (2 s) vigia janela/widget (widget `on` por 15 s =
  pendente). Pendente (`humanPending()`, segura `idleBusyReason`) → aviso no canal Captcha (`postWebhook('human')`, vazio = Alertas) em 20 s (`HUMAN_ALERT_DELAY_MS`), repete
  a cada 15 min, avisa ao resolver; resolve por socket religado (4011), `until` renovado no GET (`humanPoll` 20 s; 1º GET sem prazo
  anterior só guarda), janela/widget fechados ou `mode:'off'`. Status na linha do socket da aba Sistema. Logs `humano-campos`,
  `humano-pendente`, `humano-aviso`, `humano-ok`, `humano-desafio`, `humano-erro`. Teste: `node test/human.test.js` (`loadHumanModule`).
- Auto Boss (v3.43.0, aba Treino → Auto Boss, `cfg.bossResumeEnabled` LIGADO por padrão, `bossResumeOnLoss`, `bossAlerts`; módulo
  `// ---- Auto Boss` antes da Verificação humana; bundle em 19/10/2026, `docs/mensagens-do-jogo.md` → "Auto Boss"; frame `auto-boss`
  CONFIRMADO no log em 20/10/2026): o JOGO tem o Auto Boss (Bosses → ⟳, só numa cidade; 1 token por luta, ex. Bronze Boss Token 70000 para Giant Cruel
  `cruel`/Ancient Aero `aerodactyl2`). Socket: tela manda `auto-boss-get`/`auto-boss-start { bossKey, count }`/`auto-boss-stop`;
  servidor manda `auto-boss { active, phase, started, total, wins, losses, loot, fee, spent, reason }` com `reason` só inativo: `done`,
  `lost` (token perdido, PARA), `no-token`, `stopped`, `error`, `left` (qualquer `leave-hunt`/`enter-hunt` encerra) e `hunting`. Pedido do
  usuário em 19/10/2026 ("às vezes para e não continua; retomar o boss caso ele pare"): o script guarda a INTENÇÃO do start da tela
  (`localStorage.pgDiscordNotifyBoss`, 12 h) e, parado sem terminar (`error`/`left`/`hunting`/sem motivo depois de sessão ativa, ex.
  reconexão), sai da hunt, `joy-heal`, confere tokens (`inv-get`) e manda `auto-boss-start` com `total − wins − losses` (teto: tokens);
  4 tentativas por parada (10/20/40/60 s), 10 retomadas por sessão, depois desiste e avisa. `done`/`no-token`/`stopped` encerram; `lost` só
  retoma com `bossResumeOnLoss` (senão encerra e chama `healStart`). Recusa logo após o start na mão (sessão nunca ativa) não é retomada.
  `bossBusy()` (sessão ativa ou retomada pendente) segura viagem, parada na cidade, recarga, rotas (captura/guild/farm/clã/daily sozinha),
  troca de líder e cura — sair da arena mata a sessão. `bossIsArena(slug)` (= termina em `_boss`) tira a arena de `noteHuntChange`
  (`lastRealHunt`) e de `resumeSlugNow`. Logs `auto-boss-campos`, `auto-boss`, `auto-boss-envio`, `auto-boss-get`, `auto-boss-parado`,
  `auto-boss-retomada`, `auto-boss-fim`, `auto-boss-desisti`, `auto-boss-recusado`, `auto-boss-lembrado`. Teste: `node test/boss.test.js`.
  v3.43.1 (conta1, 20/10/2026 02:02–02:10Z: 10 retomadas aceitas, nenhuma luta): o servidor SÓ começa a luta com o personagem dentro da
  arena — no start manual é a TELA que viaja (`nS` → `nb(arena.map)`) e o componente da hunt manda `enter-hunt { slug:'cruel_boss' }`;
  o start do script não fazia a tela viajar (hunt nula, 30 s em `starting`, `error`). Aceito o start, `bossEnterArena` injeta o
  `hunt-resume` sintético (`nudgeClientToHunt`, como `switchHunt`) e, sem a hunt da arena em 4 s (`BOSS_ARENA_WAIT_MS`), manda o
  `enter-hunt` (arena = hunt `*_boss` vista na sessão ou `BOSS_ARENAS[bossKey]`; log `auto-boss-arena`). 3 retomadas seguidas sem a luta
  começar (`fought`/`noFight`, `BOSS_MAX_NO_FIGHT`) desistem antes das 10. `bossOnError` guarda o texto do `error` do jogo para o log
  ("Sua luta de boss anterior ainda está terminando"). `bossKeepsItem` tira o token (fee, 70000) da venda e do guardar na cidade com boss
  pendente/rodando e por 2 h depois de desistir — às 02:11Z a viagem depositou os 97 tokens na família. Casos 9–10 do teste.
- Ginásios (v3.45.0, aba própria 🏟 Ginásio (`TABS` id `ginasio`), `cfg.gymEnabled`/`gymBonus`/`gymRedo`/`gymAlerts`; módulo `// ---- Ginásio` antes do
  Auto Boss; protocolo CONFIRMADO no log em 21/10/2026 na conta3, `docs/mensagens-do-jogo.md` → "Ginásio"): 18 ginásios (8 Kanto + 10
  Johto), tudo por REST — `GET /api/game/gyms` (`details[].owned/cooldownMs/bonus.state/npcTeam`, `badges/total`, `badgePerk` = +1% XP
  e +1% drop por insígnia), `POST /api/game/gyms/challenge { gymId, mode:'badge' }` com a luta JÁ RESOLVIDA pelo servidor com o time
  atual (`won`, `badgeEarned`, `log`, `snapshot`; cooldown de 10 min depois), `POST /api/game/gyms/bonus { gymId }` → `{ ok, itemId,
  name, qty, nextAvailableAt }` (pedras de evolução, a cada 48 h; `bonus.state` locked → claimable → cooldown → needWin). Pedido do usuário em 21/10/2026: coletar as
  insígnias que faltam e resgatar a recompensa depois de ganhar. É tarefa da VIAGEM (`ginasio` em `tripTasksFor`/`tripAugment`, pedida
  por `gymAsk` quando `gymPlan()` tem algo): o POST só foi visto com a conta na cidade. v3.45.4: conta JÁ na cidade (parada, "Esperar
  na cidade" pelo botão) = `gymAsk` roda `gymCityWork` na hora (`gymInCity`, log `ginasio-cidade`) em vez de esperar a viagem — relato do
  usuário: "travado em → viagem, o personagem já está parado na cidade"; botão "⚔ Desafiar agora" (`gymNow`) na aba. Derrota = `gymLoss[id]` com espera 2 h dobrando
  (máx. 24 h); nunca usa `mode:'leader'` nem `/abandon`. O farejador da v3.43.2 (`ginasio-rest` etc.) saiu. Logs `ginasio-campos`,
  `ginasio`, `ginasio-desafio`, `ginasio-bonus-estado` (v3.45.2: estado do bônus de cada vitória, com releitura extra de 3 s; v3.45.3: o bônus é
  resgatado LOGO depois de cada vitória — a recarga da página no meio da viagem matava a passada final de resgates),
  `ginasio-bonus`, `ginasio-erro`, `ginasio-global`. Teste: `node test/gym.test.js` (`loadGymModule`:
  `// ---- Ginásio (v3.45.0)` até `// ---- Auto Boss (v3.43.0)`; `init.api` responde GET/POST; `clock.now`).
- Invasão Rocket (v3.50.0, aba própria 🚀 Invasão (`TABS` id `invasao`), `cfg.invEnabled`/`invHours`/`invKeepEnergy`/`invAlerts` +
  `invJennyEnabled`/`invJennyOffer`/`invJennyKeep`; módulo `// ---- Invasão Rocket` antes do Ginásio; patch notes e bundle de 27/10/2026,
  `docs/mensagens-do-jogo.md` → "Invasão Rocket"; frames `invasion-*`/`field.wave` CONFIRMADOS no log em 28/10/2026 01:00Z (conta1);
  Officer Jenny ainda não vista — `jenny-campos` registra as chaves): evento do jogo a cada 2 h nas horas PARES de Brasília (10 min de entrada, 30 min de invasão, 1 Energia Vermelha
  por entrada — 2/dia, acumula 10; o script NUNCA compra energia com diamantes). A invasão é a hunt de slug fixo `rocket_cerulean`
  (o botão INVASÃO da tela só viaja e manda `enter-hunt`); `invIsRaid(slug)` a tira de `lastRealHunt`/retomada/espera, como
  `bossIsArena`. Fluxo: `invTick` (30 s) → janela pelo relógio (`invWindowAt`, corrigida pelo `invasion-state`) → `invasion-energy-get`
  → hora aceita + energia > reserva + `invBlockedReason()` nulo → `invEnterFlow` (guarda a hunt de volta em
  `localStorage.pgDiscordNotifyInvasion`, sai da hunt pela tela ou `set-city` e, v3.50.1, injeta o `hunt-resume` sintético para a TELA
  mandar o ÚNICO `enter-hunt` — sem a hunt da invasão em 5 s (`INV_TELA_WAIT_MS`) manda o `enter-hunt` direto). NUNCA mandar dois
  `enter-hunt rocket_cerulean`: na 1ª rodada real (conta1, 28/10/2026 01:00Z) o `switchHunt` mandava o nosso E o `hunt-resume` fazia a tela
  mandar outro 4 s depois → "Você já participou dessa invasão. Espere a próxima!" + `invasion-end { reason:'left' }`, energia gasta à toa.
  Dentro: `field.wave` e `field-kill` contam (`fieldSeen`); `invasion-end` → log `invasao-fim`, aviso em
  Alertas (wave, recorde, Rockets, XP, Plans, Nível de Invasão) e `invReturnFlow` (`set-city`, `joy-heal` se `wipe`, volta por
  `switchHunt(from, 1, 'invasao-volta')`). Sem `invasion-end`: 1 min fora da hunt ou janela + 90 s = encerra e volta (`semFrame`).
  Recusa (`invasion-refused`) ANTES do 1º frame ou `enter-hunt` sem frame em 30 s (`INV_CONFIRM_MS`, no tique) = `invAbort` (aviso + volta);
  recusa DEPOIS do 1º frame (enter-hunt duplicado) só loga `jaDentro` — o servidor encerra com `invasion-end`. Entrada feita NA MÃO pelo botão da tela também é
  acompanhada (`invOnHuntChange`, origem `tela`) e volta para `idleTarget()`. `invBusy()`/`invBusyReason()` entram nos mesmos gates do
  `bossBusy` (viagem, parada na cidade, recarga, rotas, troca de líder, cura — a queda do time ENCERRA a rodada, quem cura é a volta).
  Rocket Plans = item 240 (`invKeepsItem`: fora da venda e do guardar). Officer Jenny (Shopping): `invJennyRead` a cada 2 h e após
  cada rodada; `invJennyAffordable()` = (saldo − reserva) ÷ custo da oferta escolhida (chave `key` da janela; nome também vale);
  tarefa `jenny` da viagem (`invJennyCityWork`: `set-city shopping`, exchange em série, outfit 1x, `inv-get` + `balls-get`). O select
  do painel lista as ofertas lidas (`renderInvOffers`). A medalha o script no máximo compra; usar é do jogador. Botões "Entrar agora"
  (`invNow`, ignora horas/reserva) e "Trocar agora" (`invJennyNow`). Horas no status são no fuso do PC; a lista `invHours` é em Brasília.
  Teste: `node test/invasion.test.js` (`loadInvasionModule`: `// ---- Invasão Rocket` até `// ---- Ginásio (v3.45.0)`).
- Guardar na cidade (v3.18.0, aba Venda, ROADMAP #23, módulo `// ---- Guardar na cidade` antes da Viagem): tarefa
  `guardar` no fim de toda viagem; drops → Depot (`POST /api/game/depot/move { itemId, dir:'store' }`, pilha inteira) ou
  família (`family-action item`); Pokémon não vendidos → só família (o box JÁ é o Depot comum de Pokémon). Lista escolhida
  `depositFamilyList [{ id, name, keep }]` (v3.19.0) vai primeiro, de qualquer origem; o guardar NUNCA gera viagem própria. Família via
  `familyAction(payload, evento, dados, check)`; limite diário em `lastFamily.movesCap`. O que entra na família é DELA.
  v3.24.2: sem resposta ao `family-get` em 5 s o guardar pede de novo (mais 15 s) e, ainda mudo, erra com "o jogo não
  respondeu" — antes `lastFamily` null virava "a conta não está numa família" (bobosky, 02/10/2026, jogo lento). O log
  `familia` traz `chaves` do frame quando vem sem `family`. Harness: `init.familyReply: false` = jogo mudo.
  v3.37.1: `familyAction` sem frame em 5 s (`KEEP_TIMEOUT_MS`) NÃO falha na hora: manda `family-get` (log `familia-confere`) e
  espera mais 10 s (`KEEP_CONFIRM_MS`); qualquer frame `family` passa pelo mesmo `check`, e o log da ação sai com `conferido: true`.
  Causa (14/10/2026, 4 contas, "Transaction API error: Unable to start a transaction in the given time."): a retirada/depósito
  respondeu 12–56 s depois e TINHA acontecido, mas o breeding desistia e esperava 30 min. No breeding, "sem resposta do jogo" é
  falha transitória como "durante a hunt" (retry em `BREED_HUNT_RETRY_MS` 3 min). Caso 12 do `test/breeding.test.js`.
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
  `webhookLevel` e `webhookHuman` (v3.41.0, canal "Captcha": verificação humana pendente/resolvida; vazio = cai em Alertas, pedido
  do usuário em 18/10/2026). Todo envio passa por `postWebhook(kind, payload, meta)` com `kind` em
  `capture|shiny|alert|level|human`. **Sem fallback desde a v3.5.1** (pedido do usuário: só enviar se o canal
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
     `minTierIv`) OU poder ≥ `minIv`. Nenhum configurado = passa tudo (inclusive sem dados). Sem dados (timeout do
     delta, 20 s) com algum filtro = NÃO passa (v3.24.6, "eu não quero receber notificação sem o IV"; até a v3.24.5
     passava para não perder um raro). Não voltar a passar sem pedido. `cooldownSeconds` (painel) é o intervalo mínimo entre
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
  `// ---- Volta da cidade` até `// ---- Lógica principal`; estado dos outros módulos em `init.env`), `node test/trip.test.js`
  (`loadTripModule`: `// ---- Viagem à cidade` até `// ---- Recarga automática do painel`; timers avançam o relógio falso) e
  `node test/details.test.js` (`loadDetailsModule`: `// ---- IV e qualidade do indivíduo capturado` até `// ---- Alerta de
  nível do líder`; timers ficam em `state.timers` e `state.fire(ms)` dispara os desse prazo) e `node test/evolve.test.js`
  (`loadEvolveModule`: `// ---- Evolução automática` até `// ---- Poke Slot Machine`; `init.api` responde GET/POST /evolve, `init.city`) e
  `node test/slot.test.js` (`loadSlotModule`: `// ---- Poke Slot Machine` até `// ---- Daily Gift`; `init.api` responde GET golden-stars e
  POST roll/pick, `init.city`; `clock.now` relógio, `clock.rnd` o Math.random) e `node test/breeding.test.js` (`loadBreedModule`:
  `// ---- Breeding automático` até `// ---- Clã: subir de rank`; `init.api` responde center/quote/breed/hatch, `init.pokes` lista do box
  mutável em `state.pokes`, `init.freshPokes(n)` resposta ao n-ésimo `pokes-get`, `init.family` depot, `init.familyAction(payload)`).
  `node test/farm.test.js` (`loadFarmModule`: `// ---- Farm por lista` até `// ---- Guild (v3.30.0)`; `init.huntCatalog`, `init.creatures`,
  `init.items`, `init.team`, `init.env` mutável em `state.env` para viagem/cura/troca/líder/daily).
  `node test/gym.test.js` (`loadGymModule`: `// ---- Ginásio (v3.45.0)` até `// ---- Auto Boss (v3.43.0)`; `init.api` responde GET
  /api/game/gyms e POST challenge/bonus; `state.calls`/`state.trips`/`state.hooks`; `clock.now`).
  `node test/boss.test.js` (`loadBossModule`: `// ---- Auto Boss` até `// ---- Verificação humana`; `state.sent` = enviados ao jogo,
  `state.onSend` reinjeta em `api.onOutgoing` como o `handleOutgoing`, `state.heals` = chamadas a `healStart`, `state.fire(ms)` timers).
  `node test/human.test.js` (`loadHumanModule`: `// ---- Verificação humana` até `// ---- Cura na Joy`; `state.api` responde ao GET
  /api/auth/human, `state.dom` simula janela/widget, `state.fire(ms)` dispara os timers do prazo, `state.events` guarda os `dispatchEvent`).
  `node test/invasion.test.js` (`loadInvasionModule`: `// ---- Invasão Rocket` até `// ---- Ginásio (v3.45.0)`; `state.switches` = chamadas a
  `switchHunt` (com `init.autoHunt !== false` a troca confirma na hora), `state.env` liga os bloqueios (tripRunning, hold, human, boss, heal),
  `init.api` responde GET/POST da Officer Jenny, `init.lastRealHunt` alimenta o `idleTarget` falso, `state.fire(ms)` dispara os timers).
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
