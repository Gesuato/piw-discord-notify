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

## Ideias que esses nomes destravam

- `field-none` / `hunt-cooldown` / `hunt-resume`: detectar hunt parada e religar (auto-reconnect).
- ~~`joy-heal`: cura quando o time cai~~ feito na v3.22.0 (Cura na Joy). Desmaio: `field { fainted, reviveInMs, noRevive,
  heroHp, heroMaxHp }`; sem Revive, `field-teleport-city` no fim da contagem. `use-heal` (poção na mão) segue sem uso.
- `poke-store` / `poke-withdraw`: rotação de time direto do box (a rota hoje só troca entre os 6 do time).
- `shiny-global`, `gym-global`: alertas globais do servidor.
- `fishing-levelup`, `profession-*`: profissões.
