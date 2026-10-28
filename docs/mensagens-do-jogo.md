# Mensagens do jogo (WebSocket) — referência

Levantamento feito em 24/09/2026 a partir do **bundle do cliente** do Poke Idle World, para saber o
que existe antes de planejar uma feature. Complementa a seção "Fatos sobre o jogo" do `CLAUDE.md`,
que tem os formatos já confirmados em log.

## Como refazer este levantamento

O cliente é Next.js; os chunks ficam em `/_next/static/chunks/`. O HTML de `/play` lista só os
chunks iniciais; os de jogo são referenciados de dentro deles. Passos (Git Bash, sem login):

```bash
curl -sL https://poke.idleworld.online/play -o play.html
mkdir chunks && cd chunks
for u in $(grep -oE '/_next/static/chunks/[^"]+\.js' ../play.html | sort -u); do curl -sL "https://poke.idleworld.online$u" -o "$(basename $u)"; done
# repetir 2–3 vezes para pegar os chunks referenciados pelos chunks
for i in 1 2 3; do for u in $(grep -oh 'static/chunks/[A-Za-z0-9_.-]*\.js' *.js | sort -u); do f=$(basename $u); [ -f "$f" ] || curl -sL "https://poke.idleworld.online/_next/$u" -o "$f"; done; done
grep -l "pokes-get" *.js                       # chunk do jogo (≈ 2 arquivos)
grep -oE 'type: ?"[a-z-]+"' *.js | sort | uniq -c   # mensagens que o cliente ENVIA
```

Para ver o contexto de uma mensagem (quem chama, com que campos), use Python com
`re.finditer` e imprima ±400 caracteres em volta (o arquivo é minificado, uma linha só).
Nomes de chunk mudam a cada deploy; o conteúdo, não muito.

## Cliente → servidor (o que o jogo envia)

Confirmados no bundle. Os marcados com ✔ já são usados ou interceptados pelo script.

| Mensagem | Campos | Uso no jogo |
|---|---|---|
| `pokes-get` ✔ | — | pede a lista de Pokémon (`pokes`) |
| `balls-get` ✔ | — | pede o estoque de bolas (`balls`) |
| `inv-get` | — | pede a mochila (`inventory`) |
| `invasion-energy-get` | — | Energia Vermelha da Invasão Rocket (`invasion-energy`; ver "Invasão Rocket") |
| `pending-get` ✔ | — | pede a fila de captura (`pending`) |
| `enter-hunt` ✔ | `slug` | entra numa hunt (slug = nome em minúsculas, ex. `pidgey`) |
| `leave-hunt` ✔ | — | sai da hunt |
| `catch` | `pendingId`, `ballId` | tenta capturar |
| `poke-summon` ✔ | `pokeId` | torna o Pokémon do time o líder (botão ⚔ do painel de time; o HUD bloqueia durante boss) |
| `poke-store` | `pokeId` | manda do time para o box (starter não pode) |
| `poke-withdraw` | `pokeId` | traz do box para o time (máx. 6; recusa se estiver anunciado em trade) |
| `field-get`, `field-revive` | — | estado do campo; reviver após faint (gasta um Revive; botão "Reviver agora" da tela de desmaio) |
| `joy-heal` ✔ | — | cura o time todo na Nurse Joy, de graça (botão da NPC; o cliente não registra resposta — confirmar pelo `hp` no `pokes`) |
| `use-heal`, `use-candy`, `use-berry`, `use-borage`, `use-addon`, `use-tm`, `use-held` | item/poke | usar itens (respondem `*-used`) |
| `set-city`, `sleep-mode` | — | cidade; modo dormir (`sleep-ok`) |
| `autohelper-get`, `autohelper-refresh`, `analyzer-get`, `analyzer-clear`, `boosts-refresh`, `badge-refresh` | — | painéis auxiliares |
| `send`, `dm`, `chat-delete` | `channel`, `body` | chat |
| `trade-*` (`invite`, `respond`, `slot`, `money`, `confirm`, `cancel`, `get`) | vários | troca entre jogadores |
| `pvp-*` (`queue`, `challenge`, `accept`, `decline`, `action`, `leave`, `watch`, `unwatch`, `state`) e `switch { teamIndex }`, `move { moveIndex }`, `forfeit` | vários | PvP (o `switch` é troca de Pokémon **na batalha**, não do líder) |
| `guild-get`, `guild-action`, `guild-history-get` ✔ (só leitura/log) | `guild-get { withList }`; `guild-action { action, ... }` | Guild (patch 1.9, 09/10/2026): ver a seção "Guild" abaixo; o script lê o estado e registra o que a tela envia (v3.30.0) |
| `auto-boss-get`, `auto-boss-start`, `auto-boss-stop` ✔ | `auto-boss-start { bossKey, count }` | Auto Boss do jogo (bundle em 19/10/2026): ver a seção "Auto Boss" abaixo; o script lê o estado e retoma a sessão (v3.43.0) |
| `golden-stars-refresh` | — | Poke Slot Machine: o HUD relê os bônus depois de roll/pick (o estado em si é REST, ver abaixo) |
| `family-get`, `family-action` ✔ | `family-action { action:'poke', dir:'deposit'\|'withdraw', capturedId }`; `{ action:'item', dir, itemId, quantity }`; `create`/`invite`/`respond` | clã/família: depósito compartilhado (limite diário de movimentos `movesUsed/movesCap`; responde `family` ou `error`). As 4 combinações CONFIRMADAS no log em 09/10/2026 13:15Z (conta1, janela Família do jogo, log `familia-envio`): `withdraw` usa exatamente os mesmos campos do `deposit` (`itemId`+`quantity` para item, `capturedId` para Pokémon); o frame `family` chega ~0,3 s depois e cada movimento soma 1 em `movesUsed` |

## Servidor → cliente (handlers registrados no bundle)

`addon-used`, `analyzer`, `auto-boss` ✔ (ver "Auto Boss"), `autohelper`, `balls` ✔, `berry-used`, `borage-used`, `candy-used`,
`catch-cooldown`, `catch-result` ✔, `chat`, `chat-blocked`, `chat-deleted`, `field` ✔ (só para marcar
"hunt viva"), `field-init` ✔, `field-kill` ✔, `field-none`, `field-teleport-city`, `fishing-cooldown`, `fishing-levelup` (ver "Pesca"),
`guild` ✔, `guild-dirty` ✔, `guild-history`, `gym-global`, `heal-used`, `held-replace-confirm`, `held-used`, `history`, `hunt-cooldown`, `hunt-resume`,
`inventory`, `invasion-announce`/`invasion-end`/`invasion-energy`/`invasion-refused`/`invasion-state` ✔ (ver "Invasão Rocket"), `mail-badge`, `pending` ✔, `poke-delta` ✔, `poke-xp` ✔, `pokes` ✔, `profession-gather`,
`profession-photo`, `pvp-*`, `shiny-global`, `sleep-ok`, `tm-replace-confirm`, `tm-used`, `trade-invite`,
`trade-settled`.

Formatos confirmados em log (ver `CLAUDE.md`): `pending`, `catch-result`, `poke-delta`, `pokes`,
`balls`, `field-kill`, `poke-xp`. Vistos só no bundle: `family { family:{ name, movesUsed, movesCap, frozen,
members, isOwner, lockedUntil }, depot:{ items:[{itemId,name,quantity,icon}], pokes:[{id,name,level,ivTotal,quality,shiny}] }, invites, canCreate }`
e `error { message }` (resposta de ação recusada; o script os trata em `handleFamily`/`handleGameError`). Os demais só têm o nome confirmado; antes de usar, logar com
`logEvent` e ler com `tools/read-panel-logs.py`.

## REST que o cliente usa (além da loja/depot de itens do CLAUDE.md)

- `POST /api/game/shop/buy` (loja do Mark, aba Comprar): bola = `{ ballId, qty }`, item = `{ itemId, qty }` (qty 1..10000)
  → `{ bought, gold }`. `GET /api/game/shop` → `items:[{ id, name, category, description, icon, priceGold }]` (poções `heal`,
  revives `revive`). Usado no refil de poções e revives (v3.21.0). Usar item: `use-heal { itemId }` (socket) para `heal`
  e `revive` (inventário do jogo).

- `POST /api/game/pokemon/lock { id, locked }` — cadeado do Pokémon (loja e mercado mostram 🔒; a venda em lote
  da loja exclui os travados). Usado pelo script em `lockPokemon`.
- `POST /api/game/pokemon/sell { pokeIds:[...] }` → `{ gold, goldGained, sold }` — venda em lote da aba "Pokémon"
  da loja; a lista vem do frame `pokes` filtrado por `!team && !starter && !shiny && sellValue > 0 && !locked`.
- `GET /api/game/depot` → `{ inventory (mochila), depot }`, `POST /api/game/depot/move { itemId, dir:'store'|'withdraw' }`
  (pilha inteira) / `{ all:true }` — depósito comum de ITENS (NPC Depot); usado pelo "Guardar na cidade" (v3.18.0). Pokémon no depósito comum = `poke-store`/`poke-withdraw` pelo socket (é o "box").
- Dailys (menu "Quests, Tasks & Dailys", levantado em 25/09/2026; nada passa pelo socket, a janela repete o GET a
  cada 5 s): `GET /api/game/daily-kill` → `{ locked, minLevel, tierLabel, claimed, pickedIdx (-1 = não escolheu),
  resetAt, reward:{ xp, items:[{ itemId, qty, name, icon }] }, options:[{ name, speciesId, looktype, type1, type2,
  have, qty, done, xp }], cards, rerollCost, rerollMax, rerolls }`; `POST /api/game/daily-kill/pick { idx }`;
  `POST /api/game/daily-kill/reroll {}` → estado novo; `POST /api/game/daily-kill/claim {}` → `{ state, payout:{ xp,
  totalXp, level, leveledUp, items:[{ label }] } }`. Usado pelo script em `dailyTick`/`handleDailyState` (v3.8.0); `/pick` pela daily sozinha (`dailyAutoPick`, v3.16.0).
  `GET /api/game/daily-catch` (Daily Catch: capturas premiadas por faixa, `tiers[]`) e `GET /api/game/dailys-summary`
  → `{ tasks:{ ready }, kill:{ locked, claimed, picked, qty, have }, catch:{ used, total } }` existem, não usados.
  `GET /api/game/daily` é o Daily Gift (calendário de 28 dias), outra coisa — ver abaixo.
- Daily Gift (🎁 do menu; levantado em 30/09/2026; usado pelo módulo Daily Gift, v3.24.0): `GET /api/game/daily` → `{ canClaim,
  claimedToday, blockedByVip, nextDay, total, rewards:[{ day, label, qty, icon, tag, claimed, current, locked }] }`;
  `POST /api/game/daily {}` → o mesmo estado + `claimed:{ label }`. O presente NÃO vai para a mochila: cai no Gift Center (janela
  de mensagens/correio, `GET /api/game/gifts` → `{ gifts:[{ id, label, icon, grantedBy }] }`) e precisa de
  `POST /api/game/gifts/{id}/claim {}` → `{ granted }` (texto) para chegar à conta; a tela dispara `pw:boosts-changed`, ou seja,
  presentes podem ser boosts (começam a contar no claim). A janela repete o GET do Gift Center a cada 8 s enquanto aberta.
- Clãs (janela "Clãs", levantado em 27/09/2026; usado pelo módulo Clã, v3.17.0): `GET /api/game/clans` → `{ clan,
  clanRank, level, diamonds, canJoin, joinLevel, nextTask:{ rank, name, level, levelOk, items:[{ itemId, name, icon, have,
  need }], caught:[{ speciesId, name, have, need }], kills:[{ type, have, need }], rewardXp, ok, goldOk, goldCost } | null }`;
  `POST /api/game/clans/rankup {}`, `POST /api/game/clans/skip {}` (paga gold), `POST /api/game/clans/change { clan,
  targetRank }` (entrar: targetRank 1, grátis na 1ª vez; trocar: 40/60/80 💎 para rank 1/3/5). Conversão da mochila:
  `POST /api/game/convert { baseItemId, packs }` → `{ converted, toName }` (100 base = 1 item de clã; mapa `aj` do bundle).
  `inv-get` → frame `inventory { items:[{ itemId, quantity }] }`. Elementos: `CLAN_ELEMENTS` (orebound = GROUND/ROCK).
- Pokédex e mapa (v3.10.0): `GET /api/game/map-markers` (SEM auth) → `{ map:{ w, h }, hunts:[{ slug, name, level,
  area:'kanto'|'orre'|'outland'|'nightmare', looktype, pixel, range }] }` (454 hunts, level 0 = cidades);
  `GET /game/creatures.json` (público) → `{ creatures:[{ pokeId, name, looktype, type1, type2, rarity, huntLevel,
  evolvesToId, evolveLevel, priceNpc, loot:[...], attacks:[...] }] }` (647; pokeId < 10000 são as 410 espécies da
  Pokédex; ≥ 10000 = Brave/Furious/Nightmare/Outland); `GET /api/game/pokedex` → `{ unlockKills, species:[{ id, kills,
  unlocked, claimed, caught, canClaim, captureBonus }] }` e `POST /api/game/pokedex/claim { speciesId }` (bônus +25% XP);
  `GET /api/game/professions` → `{ profession:'prestige'|'botanist'|..., professions:[{ key, ... }], rankKey,
  speciesCount, pictures, herbs, nextStep:{ toRankKey, species:{ have, need }, pictures:{...}, ... } }`;
  `POST /api/game/professions/choose { profession }`, `/rankup`, `/craft`, `/talent`. `GET /api/game/capture-log`
  é o histórico de capturas do perfil (não usado). Handlers vistos: `field-init { slug, ... }`, `field-none { slug }`,
  `catch-cooldown { leftMs }`, `catch-result` também traz `pendingId`, `cooldownMs`, `row`, `col`, `ballId`;
  `hunt-cooldown { ms }` (o cliente reenvia `enter-hunt` depois de `ms`).

- Evolução (v3.25.0, levantado em 02/10/2026 na janela "Evolve" do HUD do time): `GET /api/game/evolve?capturedId=<id>[&destId]`
  → `{ name, level, needLevel, canEvolve, hasStones, keepLevel, destName, destId?, itemOnly, stones[{ itemId, name, need, have,
  icon }], branches[{ destId, destName, needLevel, canEvolve, hasStones, stones }] }`; `POST /api/game/evolve { capturedId,
  useStone, destId? }` → `{ name }` (useStone:true gasta pedras e mantém o nível; false = grátis, volta ao Lv.1). Só em
  Cerulean (prop `inCerulean`/`canEvolveHere` do HUD). O cliente manda `pokes-get` depois. O frame `pokes` traz
  `hasEvolution`, `evolveNeedLevel`, `evolvesToName` por Pokémon. v3.39.0: pedra que falta é buscada no Depot comum
  (`GET /api/game/depot` → `depot[]`, `POST /api/game/depot/move { itemId, dir:'withdraw' }`) e na família (`family-action item
  withdraw`); formato de `depot[]` ainda não visto no log (o script aceita `id` ou `itemId` + `quantity`).

- Poke Slot Machine (v3.26.0, levantado em 02/10/2026; NPC `pokeslot` da cidade `shopping`, sistema "golden stars" por dentro):
  `GET /api/game/golden-stars` → `{ cards, cardIcon, cardItemId, isVip, slots[{ slot, unlocked, unlockedPerm, unlockedUntil, vipLocked,
  freeReady, freeRollAt, active{ speciesId, name, looktype, pct, bonusType, rarity, startedAt, expiresAt }, expired, candidates[{ speciesId,
  name, looktype }], unlockPerm, unlockTemp }], config{ rarities[{ key, color, min, max }], bonuses[{ type, icon }], candidates,
  freeRollCooldownMs, rollCostCards, rerollCostCards, rerollBonusCards, pickSpeciesCards } }`; `POST .../roll { slot }` → `{ state,
  candidates }` (grátis com `freeReady`, senão cards); `POST .../pick { slot, speciesId }` → `{ active, state }`; `POST .../reroll-bonus
  { slot }`; `GET .../species?slot=` + `POST .../species { slot, speciesId }` (escolha direta, 5 cards); `POST .../unlock { slot, mode }`;
  `GET .../history?limit=`. Depois de mudar, o cliente manda `golden-stars-refresh` pelo socket. O script só usa GET, roll e pick.

### Breeding Center (bundle em 08/10/2026; `center`, `quote`, `breed` e `hatch` CONFIRMADOS no log em 09/10/2026, contas 2 e 3; farejador removido na v3.29.1)

Janela "Breeding" do menu superior (abre em qualquer lugar). Tudo por REST em `/api/game/breeding`, mesmo `gameApi` da loja.
Textos pt-BR do jogo (i18n `window.breeding`): dois pais da MESMA espécie, do box (fora do time, não inicial, não Ditto), são
CONSUMIDOS e viram um ovo (confirmado: o frame `pokes` caiu de 9 para 7 logo após o `breed`); quality do filho = melhor pai + Δ;
IV copiado de um dos pais (`ivPreview.donorId`); breed normal exige diferença de quality ≤ 0,15; um pai shiny = filho sempre shiny,
sem trava de diferença, mas feromônio obrigatório; dois normais nunca geram shiny. Caminho "Feromônios" (Strange Pheromone, item
44417) dá Δ +0,15 a +0,30; caminho "Grátis" (`free=1`) dá Δ 0,005–0,04 (esperado 0,01) e só existe sem pai shiny. **O Grátis NÃO
dispensa gold nem stones**: no log a taxa foi `goldFee` 2.000.000 (gold 5.280.331 → 3.280.331) + 20 Earth Stone (40 com `double`).
"Dobrar stones" (`double`) gasta 2× e dá 5% de +1 IV num stat (`ivPreview.bump`). O ovo choca com abates em hunt (`killsDone/
killsRequired`, 3000 para um Donphan rank N); "chocar agora" e slot extra custam diamante (o script nunca usa). Libera no nível 60.

- `GET ?action=center` → `{ unlocked, unlockLevel: 60, level, slots: 2, maxSlots: 6, usedSlots, nextSlotCost, gold, diamonds,
  pheromones, pheromoneItemId: 44417, instantHatchCost, shinyPartner{ min, hardCap, grades{ E..S{ floor, breedMax } } },
  eggs[{ id, speciesId, speciesName, rank, shinyChild, killsDone, killsRequired, ready }] }` (a tela relê a cada 20 s; não há
  evento de socket para o progresso do ovo). CONFIRMADO; a tela chamou tanto na hunt quanto na cidade.
- `GET ?action=quote&parent1=ID&parent2=ID&free=0|1` → `{ childSpeciesId, childSpeciesName, childTypes[], stones{ base[{ itemId,
  name, icon, need, have }], double[...], baseOk, doubleOk }, rank, free, freeAllowed, goldFee, pheromoneCost (0 com free=1),
  pheromonesHave, killsRequired, shinyChild, partnerExcess, delta{ table[{ delta, pct }], baseQuality, minQuality, maxQuality,
  expectedDelta, cap }, ivPreview{ growth{hp..speed}, ivTotal, donor: 'pai', shinyRef, bump{ chance, possible, maxTotal }, donorId },
  parents{ a{ id, shiny, ivTotal, quality, bqs }, b{...} } }`. CONFIRMADO (chamada feita na hunt). `stones[].have` conta a mochila
  do personagem (subiu 8 → 28 → 40 conforme o usuário tirava da família). **A ordem dos slots NÃO decide quem doa o IV** (confirmado em 09/10/2026 03:29Z,
  conta2, Chansey): com `parent1` Q 1,054 / IV 51 e `parent2` Q 1,098 / IV 114 o `donorId` foi o `parent2` (`donor: 'mae'`);
  na conta3 (`parent1` Q 1,466 / IV 126 × `parent2` Q 1,345 / IV 104) foi o `parent1` (`donor: 'pai'`). Nos dois casos o doador
  é o pai de MAIOR quality (que também tinha o maior IV; o texto do jogo diz que é pela quality). `delta.baseQuality` = maior
  quality dos dois. O script confere `donorId === tronco` na cotação antes de todo `breed`, independente da ordem.
- `POST { action:'breed', parent1, parent2, free, double }` → `center` novo (o ovo aparece em `eggs`, `usedSlots` sobe, `gold` já
  descontado). CONFIRMADO 2x com `free: true, double: true`, ambos feitos na cidade (não se sabe se o servidor aceita na hunt).
- `POST { action:'hatch', eggId }` → `{ ok: true, child{ speciesId, shiny, quality, delta, growth{ hp, atk, def, spAtk, spDef, speed },
  ivTotal, bqs } }`. CONFIRMADO em 09/10/2026 12:37–12:38Z (conta2 Chansey: Q 1,098 → 1,118, `delta` 0,02, IV 114; conta3 Donphan:
  Q 1,466 → 1,471, `delta` 0,005, IV 126 — o `growth` é o mesmo da cotação, sem o +1 do dobrar nos dois). A resposta NÃO traz o id
  do filho: o script o acha no frame `pokes` pela quality e IV exatos. A tela chama `center` de novo logo depois (`eggs` vazio,
  `usedSlots` 0). Feito na hunt nas duas contas. `{ action:'hatch-now', eggId }` (diamante) segue só no bundle; o script nunca usa.
- `POST { action:'buy-slot' }` → `center` novo (bundle; o script nunca usa).
- O box da tela é o frame `pokes` filtrado por `!team && !starter`; cada item traz `isDitto`.
- Depósito da família (`familia-campos`, 09/10/2026): `depot.pokes[]` traz `{ id, speciesId, name, level, looktype, shiny, isDitto,
  tms[], type1, type2, stats{...}, ivTotal, quality, power }` e `depot.items[]` traz `{ itemId, quantity, name, icon }`; `family`
  tem `{ id, name, isOwner, frozen, movesUsed, movesCap, lockedUntil, leaveCost, members, pendingInvites }`. Ou seja, dá para
  escolher comida na família por quality/IV sem tirar antes.
- **Breeding Box** (bundle em 26/10/2026; mudança do jogo vista primeiro no painel do usuário: cotação e `breed` falhando com
  "Os dois pais precisam estar na Breeding Box — separe-os na aba Breeding Box do Depósito."): o Depósito (NPC da cidade, "📦 Abrir
  Depósito") ganhou a aba 🥚 Breeding Box (i18n `window.depot.tabBreedingBox`/`bbHint`: "Só os Pokémon da Breeding Box aparecem no
  Centro de Breeding. Lá eles não vão pro Mark, Mercado, troca, baú nem time"; `bbEmpty`: "os filhotes também nascem aqui"; inicial e
  Ditto não entram). A lista do centro é o frame `pokes` filtrado por `breedingBox && !team && !starter`; a venda no Mark, o Mercado,
  a troca e a família filtram `!breedingBox`. Pelo **socket**: a tela manda `breedbox-move { dir: 'in' | 'out', pokeIds: [até 200] }`
  (botões "Separar filtrados"/"Devolver filtrados" mandam a lista inteira de uma vez) e o servidor responde `breedbox-moved { moved,
  skipped }` ou `error { message }` (a tela só mostra o erro que chega em até 4 s). Não se sabe se o servidor aceita o movimento na
  hunt (o Depósito é da cidade): o script move na viagem, antes da cotação (`breedBoxMove`, log `breeding-box`; `breedbox-envio` e
  `breedbox-moved` registram o que a tela e o jogo mandam). CONFIRMADO em 26/10/2026 (v3.49.0, relato do usuário: o movimento na
  viagem foi aceito e o ovo foi criado); o formato exato do `breedbox-moved` ainda não foi lido do log.

### Guild (bundle em 09/10/2026, patch 1.9 do mesmo dia; frame `guild` CONFIRMADO no log em 10/10/2026 01:25Z)

Janela "Guild" do menu (`/assets/topmenu/guild.png`), canal `guild` no chat (tag `[TAG]` ao lado do nome, `guildTag` nas mensagens
de `chat`/`history`) e aba "Guilds" no Rankings. A pokepedia (`/pokepedia/systems/guild`) ainda diz "This system hasn't been
documented yet"; o patch note completo (números dos bônus, requisitos de tier, regras de entrada/saída) está só no Discord do jogo.
Tudo pelo **socket**, não há REST (`grep '/api/.*guild'` no bundle não acha nada).

Texto do jogo (strings pt-BR do bundle): "Uma guild reúne até 11 treinadores e paga +{{pct}}% de XP por membro — para TODOS
(+0,5% por membro). As Caçadas do dia contam os kills de qualquer membro, de qualquer mundo, e cada vaga nova é conquistada com
pontos e gold doado." Fundar custa gold (`createCost`), sem requisito de nível, começa com 5 vagas e o fundador é Presidente; quem
sai só entra em outra depois de um cooldown em horas. Ranks fixos 0 Presidente · 1 Oficial · 2 Membro (títulos renomeáveis).
"Dia perfeito" = 3 caçadas concluídas (+1 ponto). O bônus de XP aparece como parte `guild` do `xpParts` do `field-kill`.

**Cliente → servidor**

- `guild-get { withList }` — estado completo; `withList: true` traz também `list` (todas as guilds do servidor). A tela manda
  `withList: true` ao abrir e, em cada `guild-dirty`, relê com `withList` = aba "Lista" aberta.
- `guild-action { action, ... }` — uma mensagem para tudo; resposta = frame `guild` novo (com `flash` de texto) ou `error { message }`
  (a tela só mostra o `error` que chega até 4 s depois do envio):
  - `create { name (3–20), tag (2–3, A–Z0–9), crest{ shape, color, gem, text, bg } }` · `dissolve { confirm: nome exato }` · `leave`
  - `invite { name }` (nome do personagem; Presidente ou `canInvite`) · `respond { inviteId, accept }` · `kick { targetId }` ·
    `rank { targetId, rank }` (▲ = rank−1, ▼ = rank+1) · `rename-rank { rank, title }` · `motd { text }` · `crest { crest }`
  - **`donate { amount }`** — gold para a próxima vaga; teto diário por membro (`me.donateCap`, usado `me.donatedToday`).
  - **`tribute { amount }`** — deposita o item do dia (`tribute.itemId`) da mochila (`tribute.mine` = quantos tenho); itens são
    consumidos; meta `tribute.goal` (2.000–4.000, muda às 10h); fechar dá `tribute.points` pontos e 15 min de +50% XP/Loot/Captura
    (sorteado) para quem está online.
  - `talent { key }` — só o Presidente; gasta `points.available`; keys `xp` (Instinto de Batalha, +pp de XP), `loot` (Olho de
    Colecionador), `catch` (Mestre das Pokébolas), `egg` (Calor do Ninho, choco), `buff` (Eco do Tributo, +min no buff).
- `guild-history-get` — chat: relê as mensagens do canal `guild` (resposta `guild-history { guild[], guildTag }`).

**Servidor → cliente**

- `guild-dirty` — sem campos; o servidor avisa que algo mudou (a janela refaz `guild-get`, o chat refaz `guild-history-get`).
  Não se sabe ainda se chega a todo membro ou só com a janela aberta.
- `guild { ... }` — campos lidos pela tela (nomes exatos do bundle):
  - raiz: `guild` (null = sem guild), `me`, `members[]`, `rankTitles{ 0,1,2 }`, `hunts[]`, `huntsEndAt` (ms), `dailies[]`,
    `dailyRegions[{ region, active }]`, `tribute`, `tributeEndAt` (ms), `talents[]`, `points{ available }`, `dex{ caught, total,
    recent[{ dex, name, shiny, by }] }`, `history[]`, `invites[{ id, guildName, fromName, tag, crest }]`, `list[]`, `canCreate`,
    `createCost`, `myGold`, `flash`.
  - `guild{ id, name, tag, crest, motd, tier (1–5, mostrado I–V), points, members (n), slots, maxSlots, nextSlot{ points, gold } | null,
    goldDonated, bonusPct, online }`.
  - `me{ rank, isPresident, canInvite, gold, donatedToday, donateCap, buff{ kind: 'xp'|'loot'|'catch', pct } | null }`.
  - `members[{ characterId, name, level, rank, online, lastSeenMs, isMe, clan, clanRank, weekKills, weekGold, team[{ slot, dex,
    level, shiny }] }]`.
  - **Caçadas** `hunts[{ id, kind, tier, species[{ dex, name }], progress, goal, done, mine, cap }]` — 3 por dia (`huntsEndAt` = reinício);
    `mine` = a parte deste personagem e `cap` = teto por membro (bundle em 16/10/2026: "Sua parte: {{n}}/{{cap}} — o resto precisa vir de
    outros membros" / "Cada membro conta no máximo {{pct}}% da meta — ninguém fecha um objetivo sozinho"; `pct = cap/goal`, 40%: Sunflora
    24.000 → 9.600; a tela só mostra com `cap` truthy e `!done`). Visto no log das 4 contas em 16–17/10/2026: Derrotar Sunflora parado em
    19.200/24.000 por horas = 2 membros no teto;
    `kind` em kill (texto "Derrotar A & B", com `species`), catch, fish, berry, evolve, egg, boss, orre, nightmare, photo (fotos de
    shiny). `tier` = até que tier da guild a caçada vale ("caça até o tier X"). Concluir = `history` kind `hunt` (+pontos).
  - **Dailies** `dailies[{ id, region: 'kanto'|'outland'|'orre'|'nightmare', verb: 'kill'|'catch', progress, goal, points, done }]` —
    "Missões diárias por mundo: derrote e capture em cada região. Fechar uma daily paga Guild Tokens a quem ajudou e XP para a
    guild"; o progresso de todos soma, sem limite individual; região com `active: false` = "Em breve".
  - **Tributo** `tribute{ itemId, itemName, progress, goal, points, mine, done } | null`.
  - `talents[{ key, level, max, per, value, next (custo em pontos; null = máximo) }]`.
  - `history[{ kind, actor, at, payload }]` com kind em joined, left, kicked{ target }, donated{ gold }, hunt{ species[], points },
    daily{ region, verb, points, paid }, tribute{ n, kind }, tribute-deposit{ amount }, perfect, tier{ tier }, slot{ n }, crown{ name },
    crown-idle{ from, to }, promote, demote, rename{ title }, motd, created{ name }, crest, talent{ key, level }.
  - `list[{ id, name, tag, crest, tier, leader, members, slots, points, bonusPct }]`.

**CONFIRMADO no log em 10/10/2026 01:25Z (4 contas, guild Cocorico, `guild-campos`):** o frame tem exatamente os campos acima, mais
`members[].lifetimeGold`, `dailies[].kind`, `tribute.id` e `tribute.buffKind`, `points{ total, spent, available }` e `nextSlot.slot`
(número da vaga). Valores vistos: `donateCap` 500.000; `nextSlot { slot: 6, points: 50, gold: 3.000.000 }`; caçadas kill Grovyle 0/20000,
fish 0/750, catch 45/45; dailies kill/catch para kanto (20000/30), outland (12500/15) e orre (7500/10), nightmare `active: false`;
tributo Magikarp Fin 0/3770 (+2 pontos); `huntsEndAt` 07:00Z e `tributeEndAt` 17:00Z. `guild-envio { action:'donate', amount:500000 }`
pela tela → `error "Você já doou o máximo de hoje (500.000 gold)."` em ~150 ms; acima do teto → `error "Você só pode doar até 500.000
gold por dia."`; sobra menor que o pedido → `error "Você só pode doar mais 499.000 gold hoje."`. **Teto POR MEMBRO, confirmado em
01:39Z:** com a conta1 no teto, a conta2 doou 1.000 e recebeu o frame `guild` 170 ms depois (`me.donatedToday` 1.000, `me.gold` −1.000,
`guild.goldDonated` +1.000, `flash: null`); outros membros doaram 500k em seguida. **`guild-dirty` chega a todo membro com a janela
fechada** (convite enviado na conta1 às 01:28:11 → contas 2–4 releram às 01:28:13). O estado chega a cada `guild-get` sem a janela aberta.
Ainda não visto: resposta de um `tribute` que deu certo.

**O que o script faz (v3.30.0 farejador, v3.31.0 aba 🛡 Guild):** `guild-get` 6 s após o socket, a cada 30 min e até 30 s depois de um `guild-dirty`;
log `guild-campos` (chaves reais de cada bloco, 1x por carga), `guild` (resumo: guild, eu, tributo, caçadas, dailies, talentos) e
`guild-envio` (todo `guild-action` que a tela do jogo mandar — doe gold / deposite tributo na mão uma vez para confirmar os campos).

### Pesca (bundle em 10/10/2026; CONFIRMADO no log em 10/10/2026 01:55Z, conta1)

NPC **Pescador** (`kind:"fishing"`, "Treine a habilidade de Pesca") abre a janela 🎣 (`window.fishing.*`): "Escolha o que pescar.
Faixas com skill maior que a sua ficam trancadas 🔒"; faixa "atual" = a da sua skill (progresso cheio); faixa menor = "progresso de
skill reduzido (50%)"; "{{inLevel}}/{{forNext}} peixes para o próximo nível".

- `GET /api/game/fishing-tier` → `{ skill, inLevel, forNext, selected, cooldownMs, tiers[{ id, unlocked, natural, minSkill,
  mobLevel:[min, max], names[], fish[{ dex, name, looktype }] }] }`.
- `POST /api/game/fishing-tier { tierId }` (botão "🎣 Pescar"; erro vem como `{ message }`) e em seguida a tela viaja para o mapa
  **`pesca`** — ou seja, pescar é **`enter-hunt { slug:'pesca' }`**, uma hunt comum de slug fixo (constante `dd="pesca"` no
  bundle; o treinador troca para o outfit de pescador 6753/6754; cada peixe leva ~12 s com a barra "Pescando…"). Os peixes
  são os mobs da faixa escolhida; o abate deve chegar como `field-kill` normal (a confirmar: `pesca-abate` no log).
- Servidor → cliente: `fishing-cooldown { ms }` (a tela reenvia `enter-hunt` ms + 100 ms depois, igual ao `hunt-cooldown`) e
  `fishing-levelup { level }` (HUD "🎣 Sua Pesca subiu para o nível N"). O perfil traz `fishInLevel`/`fishForNext`; o Rankings tem a aba
  "Top Pesca". A pokepedia não documenta (`/pokepedia/systems/fishing` = "not documented yet").
- **Confirmado (`pesca-campos`, `pesca-abate`, `pesca-nivel`):** `GET fishing-tier` → `{ skill: 0, inLevel: 2, forNext: 12, selected: 0,
  cooldownMs: 0, tiers[{ id, minSkill, species, names, fish, mobLevel, unlocked, natural }] }` com 10 faixas: 0 Magikarp (lv 5–10, skill 0),
  1 Poliwag/Goldeen/Horsea (10), 2 Tentacool/Staryu/Krabby/Shellder (20), 3 Seel (30), 4 Poliwhirl/Seadra/Seaking (40), 5 Kingler/Starmie (50),
  6 Dewgong (60), 7 Dratini/Dragonair (70), 8 Cloyster/Golduck (80), 9 Gyarados/Lapras/Mantine/Kingdra/Tentacruel (90). A tela entrou
  na hunt `pesca` (log `hunt { slug:'pesca' }`) e o 1º Magikarp chegou 12 s depois como `field-kill` comum (`xpGained` 3, `loot: []`,
  mesmos campos de qualquer abate); `fishing-levelup { level: 1 }` 1 min depois. Ainda não visto: `fishing-cooldown` e o POST feito
  pelo script fora da cidade do Pescador (v3.32.0 faz o POST antes do `switchHunt('pesca')`; se o jogo recusar, log `pesca-erro`).
- Para a guild (v3.32.0, `guildFishEnabled`): a Caçada kind `fish` ("Pescar peixes", meta vista: 750) conta os peixes de qualquer
  membro; o script marca a faixa natural liberada (senão a mais alta liberada), entra em `pesca`, reentra depois de `fishing-cooldown
  { ms }` e volta quando a caçada fecha.

### Verificação humana (Cloudflare Turnstile; bundle em 18/10/2026 — formatos ainda NÃO vistos no log; farejador na v3.40.0)

O jogo passou a exigir, de vez em quando, a prova "sou humano" da Cloudflare (Turnstile, sitekey no chunk 535482, `appearance:
"interaction-only"`: na maioria das vezes passa sozinho; quando não passa, aparece a caixa de UM clique no canto da tela). i18n
`hud.world.humanCheck.*`: "🧑 Confirme que você é humano" / "Verificação rápida da Cloudflare — na maioria das vezes ela passa sozinha,
sem clique." / "Se aparecer um desafio no canto da tela, complete-o. Depois o jogo volta sozinho." / botão "✅ Verificar agora" /
toast "Verificação humana necessária — confirme no aviso para continuar."

- `GET /api/auth/human` (Bearer) → `{ mode, until, renewBeforeMs }`; `mode:'off'` = verificação desligada. A tela consulta 3 s depois
  de montar o provider do socket e a cada 20 min (`tV()`): faltando menos de `renewBeforeMs` para `until`, renderiza o Turnstile em
  `div#pw-turnstile-host.turnstile-host` (classe `on` enquanto renderiza; 90 s de timeout), pega o token e faz
  `POST /api/auth/human { token }` → `{ until }`.
- O servidor **exige** de duas formas: (1) fecha o WebSocket com o código **4011** — a tela marca `humanRequired`, abre a janela
  "Confirme que você é humano" (`.win-overlay > .win-window`, zIndex 400), roda `verifyHuman()` sozinha e, se falhar, mostra "Não deu
  certo…" com o botão; NÃO reconecta até verificar (depois religa o socket via `p.current()`); (2) responde **403 `{ code:'human-check' }`**
  a um REST — a camada REST da tela (`apiGet`/`apiPostAuth`) dispara `window.dispatchEvent(new CustomEvent('pw:human-check'))` e o
  provider marca `humanRequired` do mesmo jeito.
- Outros códigos de fechamento vistos no mesmo trecho: 4001 token expirado (refresh), 4002 reconectar (reload 1x/min), 4003 manutenção
  (`/?maintenance=1`), 4005 conta aberta em outro lugar (`sessionReplaced`), 4006 limite de contas na rede (4 por IP), 4007 limite de
  contas na máquina (`cmid`), 4008 `/namelock`, 4009 `/trocar-senha`.
- O script (v3.40.0, módulo `// ---- Verificação humana` antes da Cura na Joy) **não resolve** o desafio: registra `socket-fechado
  { code, motivo }`, `humano-campos` (GET na carga), `humano-pendente { origem }`, `humano-desafio { aberto, seg }`, `humano-aviso`,
  `humano-ok { origem, aposSeg }`; avisa no canal de alertas 20 s depois (repete a cada 15 min, avisa ao resolver), segura a volta da
  cidade e, num 403 dos próprios REST, dispara `pw:human-check` para a tela abrir a janela. Teste: `node test/human.test.js`.

### Auto Boss (bundle em 19/10/2026; frame `auto-boss` CONFIRMADO no log em 20/10/2026 01:36Z, conta1; módulo `// ---- Auto Boss` na v3.43.0)

O jogo tem, na janela Bosses (`button[data-guide="dock-bosses"]`), o botão "⟳ Auto Boss" (`.boss-autobtn`, só para boss com
`arena` no catálogo): "lutas automáticas em sequência". Texto do jogo (i18n `window.bosses.auto.*`): "A luta se renova sozinha até
acabar a fila ou os tokens", "Se o time cair, o token daquela luta é perdido e o Auto Boss para", "Só funciona fora de hunt — ative
estando numa cidade". Tudo pelo **socket**:

- Tela → servidor: `auto-boss-get` (o HUD manda ao ficar online), `auto-boss-start { bossKey, count }` (a tela espera até 8 s por um
  frame `auto-boss` com `active` ou `reason`; sem resposta mostra "O servidor não respondeu") e `auto-boss-stop` ("Encerrando após
  esta luta…"). `bossKey` é a chave do `GET /game/bossCatalog.json` (87 bosses: `{ key, name, img, icon?, category, level }`); só os
  com arena na tabela `og` do bundle aceitam Auto Boss: `cruel` (Giant Cruel, mapa `cruel_boss`) e `aerodactyl2` (Ancient Aero, mapa
  `aero_boss`), ambos com `entryFee { itemId: 70000, name: 'Bronze Boss Token', qty: 1 }` e `teamLevel` 300. `count` = lutas (=
  tokens); o painel do jogo limita a `min(100, floor(tokens / qty))`.
- Servidor → tela: `auto-boss { active, phase: 'starting'|'fighting'|'cooldown', bossKey, bossName, started, total, wins, losses,
  loot[{ itemId, name, qty }], last{ outcome: 'won'|'lost', durationMs, loot }, fee{ itemId, name, qty }, spent, elapsedMs, fightMs,
  inMs, stopping, reason }`. `reason` só com `active:false`: `done` (fila completa), `lost` (time caiu; token perdido), `no-token`,
  `stopped` (o jogador parou), `error` ("A próxima luta não pôde começar (time, líder desmaiado ou arena)"), `left` ("Auto Boss
  encerrado — você saiu da arena": qualquer `leave-hunt`/`enter-hunt` encerra) e `hunting` (start recusado: conta em hunt). Frame
  inativo SEM `reason` = "nada rodando" (resposta ao get). A tela mostra a janela-resumo (`.abs-window`) quando `started > 0`.
- Ao aceitar o start, a TELA viaja para o mapa da arena (`nT` → `nS(t.arena)` → `nb(arena.map)` no bundle; antes confere líder com hp > 0
  e time sem espécie repetida) e o componente da hunt manda `enter-hunt { slug:'cruel_boss' }` ao montar (e a cada 2,5 s sem `field` por
  10 s); o script vê a hunt `cruel_boss`/`aero_boss` (`field`/`field-kill` chegam como numa hunt). **O servidor só começa a luta com o
  personagem na arena**: start aceito sem ninguém viajar = 30 s em `phase:'starting'` e `auto-boss { active:false, reason:'error' }`
  (conta1, 20/10/2026 02:02–02:10Z, 10 vezes seguidas com o start do script). Com a luta anterior ainda fechando, o start responde
  `error { message:"Sua luta de boss anterior ainda está terminando — aguarde alguns segundos." }` + frame `error`; start com sessão
  ativa: `error { message:"O Auto Boss já está ativo." }`. Visto na conta1 em 20/10/2026 01:00Z; a sessão sumiu após uma queda do socket
  (1006): o `auto-boss-get` da reconexão respondeu `active:false` sem `reason` e sem `bossKey`.
- Frame real (20/10/2026 01:36Z): chaves `active, bossKey, bossName, phase, total, started, wins, losses, loot, fee, spent, elapsedMs,
  last`; `fee { itemId, name, qty }`; `loot`/`last` nulos no começo.
- Histórico e lutas manuais são REST: `GET /api/game/boss` → `{ bosses[keys liberados], penalties{ key:{ strength, mult } },
  arenas{ key: arena }, state }`; `POST /api/game/boss/action { action:'start'|'round'|'abandon', bossKey?, count? }`. Não usados.
- O script (v3.43.0): guarda a intenção do `auto-boss-start` da tela (`localStorage.pgDiscordNotifyBoss`), registra `auto-boss-campos`
  (1º frame), `auto-boss` (mudanças), `auto-boss-envio`, `auto-boss-get`, `auto-boss-parado`, `auto-boss-retomada { fase }`,
  `auto-boss-fim`, `auto-boss-desisti`, `auto-boss-recusado`, `auto-boss-lembrado`; retoma com `leave-hunt` + `set-city` (se em hunt),
  `joy-heal`, `inv-get` (tokens) e `auto-boss-start` com `total − wins − losses` lutas (teto: tokens). v3.43.1: aceito o start, injeta o
  `hunt-resume { slug:'cruel_boss' }` sintético para a tela viajar (como `switchHunt`) e, sem a hunt da arena em 4 s, manda o
  `enter-hunt` ele mesmo (log `auto-boss-arena { slug, tela, chegou, direto }`). Teste: `node test/boss.test.js`.

### Ginásio (bundle em 21/10/2026; CONFIRMADO no log em 21/10/2026 15:04Z, conta3; feature na v3.45.0)

Janela **Ginásios** (ícone `topmenu/icon_gym.png`; abas "Ginásios" e "Recompensas"; modos **Insígnia** e **Liderança**). "Derrote os
líderes para conquistar as insígnias. Fechar as 18 rende a Gym Champion Outfit. Time livre." Liderança: "só depois de todas as
insígnias da região do ginásio; e o time precisa ser inteiro do tipo do ginásio". 18 ginásios, todos abertos em 21/10/2026: Kanto
pewter (ROCK, Brock, Rocha), cerulean (WATER, Misty, Cascata), vermilion (ELECTRIC, Lt. Surge, Trovão), celadon (GRASS, Erika,
Arco-Íris), fuchsia (POISON, Koga, Alma), saffron (PSYCHIC, Sabrina, Lama), cinnabar (FIRE, Blaine, Vulcão), viridian (GROUND,
Giovanni, Terra); Johto violet (FLYING, Falkner, Zephyr), azalea (BUG, Bugsy, Colmeia), goldenrod (NORMAL, Whitney, Planície),
ecruteak (GHOST, Morty, Névoa), cianwood (FIGHTING, Chuck, Tempestade), olivine (STEEL, Jasmine, Mineral), mahogany (ICE, Pryce,
Geleira), blackthorn (DRAGON, Clair, Nascente), spikemuth (DARK, Piers, Sombria), laverre (FAIRY, Valerie, Fada). Tudo por REST; a
luta é resolvida na hora pelo servidor e o HUD da arena (o mesmo do PvP) só anima o `log`.

- `GET /api/game/gyms` → `{ gyms[{ id, region:'kanto'|'johto', enabled, city, leader (NPC), type, badge, order, teamSize, holder{ name }|null,
  owned, cooldownMs, canLead }], details[{ id, region, enabled, city, type, badge, order, defender{ name, isNpc, charId, sinceAt, defenses,
  look }, team[] (build do líder-jogador), npcTeam[{ speciesId, looktype, name, level:400, shiny, types[], maxHp, stats{ atk, def, spAtk,
  spDef, speed }, moves[{ name, type, power, category }] }] (6 Pokémon), owned, bonus{ itemId, name, icon, qty, state:'claimable'|'cooldown'|
  'needWin', cooldownMs }|null, cooldownMs, leaderCooldownMs, arenaMap ('gym_<id>'; cinnabar usa 'arena_pvp'), leaderBlock{ reason:'self'|
  'type'|'duplicate' }|null, leaderBlockMsg, mine }], badges, total, regions{ kanto{ badges, total:8 }, johto{ badges, total:10 } },
  badgePerk{ active, max:18, xpPct, dropPct } (+1% XP e +1% drop por insígnia), vault, payout{ nextAt, basisDay, gold, diamonds,
  perGymGold, perGymDiamonds } (rateio diário às 10h BRT entre os líderes), myGymIds[] }`. A tela lê ao abrir e relê depois de todo POST.
- `POST /api/game/gyms/challenge { gymId, mode:'badge'|'leader' }` (botão "Desafiar líder" / "Duelar pelo posto"; desabilitado com
  `cooldownMs > 0` = "Aguarde N min") → `{ won, gymId, battleId, defenderName, vsNpc, log[{ kind:'start'|'move'|'faint'|'switch'|'end',
  side:'a'|'b', monName, move, moveType, dmg, eff, stab, targetHp, targetMaxHp, teamIndex, winner, reason, seq }] (70–140 lances),
  snapshot{ id, seq, phase, winner, endReason:'ko'|'timeout'|'forfeit'|'maxturns', you:'a', sides{ a{ charId, name, look, active, teamSize,
  team[{ name, level, maxHp, … }] } (o SEU time atual — na conta3 4 Pokémon lv 334–629 venceram os 6 lv 400 de todo líder), b{…} } },
  badgeEarned, becameLeader, badges, arena{ map, floor, trainerA, trainerB, monA, monB } }`. Resposta em ~300 ms, já decidida: o HUD só
  anima (evento `pw:gym-battle-start { battleId, log, snapshot, arena, rewards{ badgeEarned, badgeName, badgeIcon, becameLeader,
  championOutfit } }` na janela; antes dele a tela dispara `pw:gym-challenge-pending`; o HUD manda `pvp-state` pelo socket e recebe
  `pvp-state { battle:null, incoming[], outgoing[], ranked{ queued, tickets, ticketsMax } }`). O usuário recarrega a página para pular a
  animação; o script faz o POST direto e nada é animado. Depois do desafio o ginásio fica com `cooldownMs` ≈ 600 000 (10 min; visto 599 675
  ms logo após a vitória). Feito com a conta na cidade (`hunt: null`); de dentro da hunt não foi testado. Erro = `{ message }`.
- `POST /api/game/gyms/bonus { gymId }` → `{ ok, itemId, name, qty, nextAvailableAt }` ("Recompensa bônus": 20x Rock/Water/Thunder/Leaf/
  Venom/Enigma/Fire/Earth/Feather/Cocoon/Heart/Darkness/Punch/Ice Stone ou 2x Metal/Ancient/Crystal Stone; "Disponível novamente a cada 48
  horas" = `bonus.cooldownMs` ≈ 172 800 000; depois `needWin` = "Vença o ginásio de novo"; antes da 1ª vitória `state:'locked'`, visto no log).
- `POST /api/game/gyms/abandon { gymId }` → deixa a liderança (perde o tempo de reinado; o script nunca usa).
- Servidor → cliente: `gym-global` (anúncio global "assumiu/derrotou o ginásio de …", `hud.gymAnnounce.*`; o HUD segura 15 s depois
  de `pw:gym-challenge-pending`; log `ginasio-global`, ainda não visto). Histórico de diamantes tem a origem `GYM_PAYOUT`.
- Script (v3.45.0, módulo `// ---- Ginásio`): lê a janela a cada 30 min ou quando um prazo vence; ginásio aberto sem insígnia (ou com
  bônus `needWin`, com `gymRedo`) fora do cooldown → tarefa `ginasio` da viagem à cidade: `POST /challenge { mode:'badge' }` um a um, relê,
  `POST /bonus` nos `claimable` (com `gymBonus`), avisa em Alertas. Logs `ginasio-campos`, `ginasio`, `ginasio-desafio`, `ginasio-bonus`,
  `ginasio-erro`. Teste: `node test/gym.test.js`.

### Invasão Rocket (bundle em 27/10/2026, patch do mesmo dia; frames `invasion-*` CONFIRMADOS no log em 28/10/2026 01:00Z, conta1, janela das 22h BRT; feature na v3.50.0, entrada corrigida na v3.50.1)

Anúncio (colado pelo usuário): "A cada 2 horas, nas horas pares (horário de Brasília), a invasão começa. Você tem 10 minutos pra entrar e
30 minutos de invasão." Botão **INVASÃO** em Cerulean (acima de "Ir ao Mercado"), 1 Energia Vermelha por entrada (2/dia, acumula 10,
15 💎 na Loja de Diamantes — item `rocketenergy`), uma entrada por invasão; waves de 20 duplas (Grunt + Pokémon), sem vantagem de tipo;
dificuldade pelo nível do Pokémon mais forte do time (Kanto 1…100, Outland, Outland+, Orre 520/600, Nightmare 2000/3000); acaba quando o
time cai, a invasão fecha, 3 min sem abate ou o jogador sai. Rocket Plans (item **240**) só na Officer Jenny (Shopping). Levantado no
chunk compartilhado (módulo `tD`: `ROCKET_SLUG:"rocket_cerulean"`, `INVASION_EVERY_MS:72e5`, `ENTRY_WINDOW_MS:6e5`, `RAID_DURATION_MS:18e5`,
`STALL_MS:18e4`, `PAIRS_PER_WAVE:20`, `ENERGY_MAX:10`, `ENERGY_PER_DAY:2`, `ENERGY_PRICE_DIAMONDS:15`, `REWARD_ITEM_ID:240`,
`MILESTONES:[100,250,500,1000]`, `INTRO_HOLD_MS:1e4`, `invasionStartAt` = hora par em BRT (deslocamento fixo −108e5), `scheduledWindow`,
`invasionTierForLevel`) e no HUD (`hh`/`hp`/`hu`/`hx`/`tW`, botão `ii`, janela `lK` da Jenny).

- **Entrar** = a tela viaja para o mapa `rocket_cerulean` (`n2(tD.ROCKET_SLUG, "Invasão Rocket")`; desenho de `cerulean_novo`) e o componente
  da hunt manda `enter-hunt { slug:'rocket_cerulean', resume }` — a invasão É uma hunt de slug fixo, como `*_boss` e `pesca`. A tela só
  mostra o botão com `entryOpen` e recusa com o líder em hp 0 ("faintedNoTravel"). Sair = `leave-hunt` (encerra a rodada; o ganho fica).
- **Servidor lento na virada do dia (CONFIRMADO em 28/10/2026 03:00Z, janela da meia-noite, conta1):** o `invasion-state` chegou às contas 1 e 2
  20 s depois do das contas 3 e 4 (03:00:20 vs 03:00:00); o `enter-hunt` da conta1 (03:00:42) ficou 19 s sem resposta, o componente da hunt da
  tela reenviou (10 s sem `field`), e aí vieram `invasion-refused` "Você já participou dessa invasão" (03:01:01, para o reenvio) e a energia
  5→4 (03:01:03, a 1ª entrada registrada). As contas 3 e 4 entraram em 4 s. v3.51.1: o script barra no `send` todo `enter-hunt rocket_cerulean`
  depois do primeiro da rodada (`invOutgoingBlocked`; log `invasao-enter-hunt-barrado`), espera 60 s pelo 1º frame e, com "já participou"
  antes do 1º frame, espera 15 s por um frame antes de desistir (`invasao-recusa-ignorada` se ele vier).
- **Dois `enter-hunt rocket_cerulean` = expulso (CONFIRMADO em 28/10/2026 01:00Z, conta1):** o script mandou `enter-hunt` (a conta ENTROU:
  `invasion-energy` 4→3 chegou sozinho 1,9 s depois, `field { wave:1 }` 2,2 s depois) e o `hunt-resume` sintético do `switchHunt` fez a tela
  viajar e mandar OUTRO `enter-hunt` 4,5 s depois → `error { message:"Você já participou dessa invasão. Espere a próxima!" }` +
  `invasion-refused { message }` (mesmo texto) + `invasion-end { reason:'left', wave:1, kills:0 }` 200 ms depois; a tela saiu da hunt
  (`leave-hunt`) e a energia ficou gasta. O componente da hunt também reenvia `enter-hunt { slug, resume }` sozinho em `field-lost` (1 s),
  em `hunt-cooldown`/`fishing-cooldown` e quando fica 10 s sem `field` (checagem a cada 2,5 s); o handler `hunt-resume` com `slug` igual ao
  mapa atual manda `enter-hunt { slug, resume:true }`, senão viaja (`onResume`) e o componente manda o dele. Regra: deixar a TELA mandar o
  único `enter-hunt` (é o que o botão faz); o script só injeta o `hunt-resume` sintético.
- Servidor → cliente: `invasion-state { live, entryOpen, entryUntil, endsAt }` (a todos, na abertura/fechamento), `invasion-announce { text,
  until }` ("ATENÇÃO A CIDADE DE CERULEAN ESTÁ SENDO INVADIDA … {nome}!"; `until` ≈ 10 s), `invasion-energy { energy, max, live, entryOpen,
  entryUntil, endsAt }` (✔ `max: 10`; o servidor também o manda SOZINHO ao entrar, com a energia descontada)
  (resposta a `invasion-energy-get`; a tela pede ao montar e 0–3 s depois de cada `invasion-state` com `entryOpen`; a Loja de Diamantes
  dispara `pw:invasion-energy` com a energia nova), `invasion-refused { message }` (entrada negada), `invasion-end { wave, bestWave,
  reason:'wipe'|'time'|'stall'|'left'|'restart', kills, xp, totalXp, tier, level, levelBefore, reward{ itemId, qty, icon, name },
  milestone, milestones[], outfitReward{ items[{ looktype, gender, milestone }], equipped } }` (✔ chaves vistas em 28/10/2026: `reason, wave,
  kills, xp, tier, level, totalXp, bestWave, milestone, milestones, outfitReward, levelBefore, reward`; janela "Resultado da Invasão
  Rocket": "Wave alcançada", "Rockets derrotados", "XP na invasão", "Dificuldade", "Nível de Invasão", "Recompensa"). Dentro da hunt os
  frames `field` trazem `wave` (✔ chaves: `seq, serverNow, heroLooktype, heroName, bossTeam, bossActiveIdx, hero, trainer, mobs, corpses,
  targetSlot, fighting, heroHp, heroMaxHp, fainted, reviveInMs, allMobsDead, waveRespawnAt, wave, hits`); cada Rocket derrubado é um
  `field-kill` normal. `invasion-state`/`invasion-announce` chegam juntos na abertura (01:00:04Z para a janela das 22h BRT).
- Officer Jenny (NPC `officer_jenny` do `shopping`, ação `openJenny` "Trade Rocket Plans"): `GET /api/game/officer-jenny` → `{ balance,
  token{ name, icon }, offers[{ key, name, qty, cost, icon, description, owned, looktype, kind }] }`; `POST /api/game/officer-jenny/exchange
  { offer: key }` → `{ prize{ kind, name, qty, icon, looktype } }`; a tela manda `inv-get` depois. Erros: "Not enough Plans"/"Already owned"
  (i18n `shop.officerJenny.*`). Preços do anúncio: 100 Idle Balls 200 · Bronze Boss Token 1.500 · outfits 5.000/10.000 · Police Bravery
  Medal 15.000 (+2 IV, uma por Pokémon, nunca em Pokémon do mercado/troca/família nem em filho de medalhado).
- Ranking: aba `rocket` (`/assets/invasion/rocket_r.png`). Pokédex: página "Invasão Rocket" (i18n `systems.rocket.*`).
- Script (v3.50.0, aba 🚀 Invasão, módulo `// ---- Invasão Rocket`): `invTick` (30 s) entra pela janela do relógio corrigida pelo
  `invasion-state`, com `invasion-energy-get` antes (energia > reserva), horas aceitas e nada em andamento; sai da hunt (tela → cidade,
  `set-city` se ela não for), injeta o `hunt-resume` sintético e a TELA manda o único `enter-hunt` (v3.50.1; sem a hunt em 5 s manda
  direto; 30 s sem frame = aviso e volta); acompanha `field.wave`/`field-kill`; `invasion-end` → aviso e
  volta (`set-city`, `joy-heal` se `wipe`, `switchHunt(from, 1, 'invasao-volta')`); silêncio (1 min fora da hunt, janela + 90 s) também
  encerra. `invBusy()` segura viagem/parada/recarga/rotas/líder/cura. Jenny = tarefa `jenny` da viagem (`set-city shopping` + exchange).
  Logs `invasao-campos`, `invasao-janela`, `invasao-energia(-pedida)`, `invasao-anuncio`, `invasao-pulada`, `invasao-espera`,
  `invasao-entrada { fase }`, `invasao-wave`, `invasao-abate`, `invasao-recusada`, `invasao-fim`, `invasao-volta`, `invasao-lembrada`,
  `jenny-campos`, `jenny`, `jenny-cidade`, `jenny-troca`, `jenny-erro`. Teste: `node test/invasion.test.js`.

## Ideias que esses nomes destravam

- `field-none` / `hunt-cooldown` / `hunt-resume`: detectar hunt parada e religar (auto-reconnect).
- ~~`joy-heal`: cura quando o time cai~~ feito na v3.22.0 (Cura na Joy). Desmaio: `field { fainted, reviveInMs, noRevive,
  heroHp, heroMaxHp }`; sem Revive, `field-teleport-city` no fim da contagem. `use-heal` (poção na mão) segue sem uso.
- `poke-store` / `poke-withdraw`: rotação de time direto do box (a rota hoje só troca entre os 6 do time).
- `shiny-global`: alerta global do servidor. ~~`gym-global`~~ ver a seção "Ginásio" (feature na v3.45.0, ROADMAP #35).
- `fishing-levelup`, `profession-*`: profissões.
