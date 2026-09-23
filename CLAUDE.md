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
- No sucesso também chega `poke-delta` com `poke.{speciesId, xp: 0, ...}` (shape completo ainda não
  confirmado — o script loga o payload em `pgDiscordNotifyLog`, evento `poke-delta`).
- IV e qualidade do indivíduo SÓ existem no frame `pokes` (resposta a `{type:'pokes-get'}`):
  `list[]` com `id, speciesId, name, level, shiny, team, ivTotal (0..192), quality (multiplicador
  1.0/1.3/1.7...), power, xp, stats{hp,atk,def,spAtk,spDef,speed}`. Faixas oficiais de qualidade:
  <1.0 Weak, 1.0 Common, 1.1 Uncommon, 1.3 Rare, 1.5 Epic, 1.7 Legendary, 2.0 Mythic, 3.0 Ancient,
  4.0 Divine (fonte: poke.idleworld.online/pokepedia/systems/quality via piwdex `src/lib/rarity.ts`).
- Fluxo do script para IV/qualidade: `catch-result` ok → espera até 4s por `poke-delta` → se ele não
  trouxer `ivTotal`/`quality`, envia `pokes-get` e casa o recém-capturado na lista `pokes` (por `id`
  do delta ou espécie com `xp === 0`). Sem resposta, notifica sem esses campos.
- Cliente envia `{ type:'catch', pendingId, ballId }` para capturar.
- Referências: https://github.com/edulanzarin/piwdex (`src/lib/robo/motor/sessao.ts`, cases
  `catch-result`/`pending`) e https://github.com/luishferreira/poke-standalone-scripts (`AGENTS.md`).
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
- Semântica de filtro: lista de Pokémon VAZIA = notificar toda captura; lista preenchida =
  só os listados (+ shinys se `notifyShiny`). `cooldownSeconds` (painel) é o intervalo mínimo entre
  avisos do mesmo Pokémon; padrão 0 = avisar todas. Configs anteriores a `cfgVersion: 2` tinham 30s
  fixos e são migradas para 0 no `loadCfg()`.
- Comparações de nome sempre via `normalize()` (minúsculas, sem acento).
- Idioma: comentários, UI e mensagens em pt-BR (o usuário é brasileiro).

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
