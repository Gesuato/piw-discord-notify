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
| `golden-stars-refresh` | — | Poke Slot Machine: o HUD relê os bônus depois de roll/pick (o estado em si é REST, ver abaixo) |
| `family-get`, `family-action` ✔ | `family-action { action:'poke', dir:'deposit'\|'withdraw', capturedId }`; `{ action:'item', dir, itemId, quantity }`; `create`/`invite`/`respond` | clã/família: depósito compartilhado (limite diário de movimentos `movesUsed/movesCap`; responde `family` ou `error`) |

## Servidor → cliente (handlers registrados no bundle)

`addon-used`, `analyzer`, `autohelper`, `balls` ✔, `berry-used`, `borage-used`, `candy-used`,
`catch-cooldown`, `catch-result` ✔, `chat`, `chat-blocked`, `chat-deleted`, `field` ✔ (só para marcar
"hunt viva"), `field-init` ✔, `field-kill` ✔, `field-none`, `field-teleport-city`, `fishing-levelup`,
`gym-global`, `heal-used`, `held-replace-confirm`, `held-used`, `history`, `hunt-cooldown`, `hunt-resume`,
`inventory`, `mail-badge`, `pending` ✔, `poke-delta` ✔, `poke-xp` ✔, `pokes` ✔, `profession-gather`,
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
  `hasEvolution`, `evolveNeedLevel`, `evolvesToName` por Pokémon.

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

## Ideias que esses nomes destravam

- `field-none` / `hunt-cooldown` / `hunt-resume`: detectar hunt parada e religar (auto-reconnect).
- ~~`joy-heal`: cura quando o time cai~~ feito na v3.22.0 (Cura na Joy). Desmaio: `field { fainted, reviveInMs, noRevive,
  heroHp, heroMaxHp }`; sem Revive, `field-teleport-city` no fim da contagem. `use-heal` (poção na mão) segue sem uso.
- `poke-store` / `poke-withdraw`: rotação de time direto do box (a rota hoje só troca entre os 6 do time).
- `shiny-global`, `gym-global`: alertas globais do servidor.
- `fishing-levelup`, `profession-*`: profissões.
