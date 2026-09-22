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

## Fatos sobre o jogo (deduzidos do PIW-QOL, não confirmados 100%)

- Comunicação por WebSocket com mensagens JSON `{type, ...}`.
- Captura chega como `type: 'catch-result'`. O shape exato do payload NÃO foi confirmado —
  `extractPokemonInfo()` tenta vários caminhos (`pokemon.name`, `poke.name`, `slug`, etc.) e
  `captureSucceeded()` assume sucesso se não houver flag explícita. Se o usuário reportar o
  payload real (via modo Debug), simplifique essas funções para o formato confirmado.
- Nome do personagem: `window.__poke.api['/api/characters/me'].character.name` (mesmo caminho
  que o PokeGrid usa para nomear abas). NÃO usar `.phud-name` — é o Pokémon ativo, não a conta.

## Regras do projeto

- **NUNCA commitar URLs de webhook do Discord** (nem em exemplos com IDs reais). O repo é
  público e o Discord desativa webhooks vazados. Toda config do usuário vive no `localStorage`
  (chave `pgDiscordNotifyCfg`), editada pelo painel 🔔 que o próprio script cria.
- Semântica de filtro: lista de Pokémon VAZIA = notificar toda captura; lista preenchida =
  só os listados (+ shinys se `notifyShiny`). Cooldown por nome de Pokémon evita spam.
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
