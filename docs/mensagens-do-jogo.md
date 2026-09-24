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
| `field-get`, `field-revive` | — | estado do campo; reviver após faint |
| `joy-heal` | — | cura na Joy (responde `joy-healed`) |
| `use-heal`, `use-candy`, `use-berry`, `use-borage`, `use-addon`, `use-tm`, `use-held` | item/poke | usar itens (respondem `*-used`) |
| `set-city`, `sleep-mode` | — | cidade; modo dormir (`sleep-ok`) |
| `autohelper-get`, `autohelper-refresh`, `analyzer-get`, `analyzer-clear`, `boosts-refresh`, `badge-refresh` | — | painéis auxiliares |
| `send`, `dm`, `chat-delete` | `channel`, `body` | chat |
| `trade-*` (`invite`, `respond`, `slot`, `money`, `confirm`, `cancel`, `get`) | vários | troca entre jogadores |
| `pvp-*` (`queue`, `challenge`, `accept`, `decline`, `action`, `leave`, `watch`, `unwatch`, `state`) e `switch { teamIndex }`, `move { moveIndex }`, `forfeit` | vários | PvP (o `switch` é troca de Pokémon **na batalha**, não do líder) |
| `family-get`, `family-action` | — | clã/família |

## Servidor → cliente (handlers registrados no bundle)

`addon-used`, `analyzer`, `autohelper`, `balls` ✔, `berry-used`, `borage-used`, `candy-used`,
`catch-cooldown`, `catch-result` ✔, `chat`, `chat-blocked`, `chat-deleted`, `field` ✔ (só para marcar
"hunt viva"), `field-init` ✔, `field-kill` ✔, `field-none`, `field-teleport-city`, `fishing-levelup`,
`gym-global`, `heal-used`, `held-replace-confirm`, `held-used`, `history`, `hunt-cooldown`, `hunt-resume`,
`inventory`, `mail-badge`, `pending` ✔, `poke-delta` ✔, `poke-xp` ✔, `pokes` ✔, `profession-gather`,
`profession-photo`, `pvp-*`, `shiny-global`, `sleep-ok`, `tm-replace-confirm`, `tm-used`, `trade-invite`,
`trade-settled`.

Formatos confirmados em log (ver `CLAUDE.md`): `pending`, `catch-result`, `poke-delta`, `pokes`,
`balls`, `field-kill`, `poke-xp`. Os demais só têm o nome confirmado; antes de usar, logar com
`logEvent` e ler com `tools/read-panel-logs.py`.

## Ideias que esses nomes destravam

- `field-none` / `hunt-cooldown` / `hunt-resume`: detectar hunt parada e religar (auto-reconnect).
- `field-revive`, `joy-heal`, `use-heal`: cura/revive automático quando o líder desmaia.
- `poke-store` / `poke-withdraw`: rotação de time direto do box (a rota hoje só troca entre os 6 do time).
- `shiny-global`, `gym-global`: alertas globais do servidor.
- `fishing-levelup`, `profession-*`: profissões.
