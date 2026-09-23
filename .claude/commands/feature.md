---
description: Implementa uma feature do ROADMAP.md (por número ou palavra do título)
---

Implemente a feature "$ARGUMENTS" do arquivo `ROADMAP.md` deste repositório.

Passos:

1. Leia `CLAUDE.md` e `ROADMAP.md`. Localize a feature pelo número ou por uma palavra do título.
   Se houver ambiguidade, pergunte antes de começar.
2. Se a seção "Pendências" da feature diz que o formato de alguma mensagem do jogo NÃO está
   confirmado, primeiro publique uma versão que apenas registra essa mensagem no log persistente
   (`logEvent`), peça ao usuário para provocar o evento no jogo, leia o log do disco
   (`%APPDATA%\pokegrid\Partitions\conta{1..4}\Local Storage\leveldb`, ver CLAUDE.md) e só então
   implemente. Nunca copie a URL do webhook nem o token do socket para a conversa ou para o repo.
3. Implemente em `piw-discord-notify.user.js` seguindo as regras do CLAUDE.md: alertas usam
   `postWebhook('alert', ...)`, config nova entra em `DEFAULTS` + `fill()` + `Salvar` do painel,
   textos em pt-BR, nomes comparados via `normalize()`.
4. Valide com `node --check` e com uma simulação em Node (mock de `window`, `localStorage`,
   `fetch` e `WebSocket`, como nas sessões anteriores) cobrindo o caminho feliz e o caso em que o
   evento não deve avisar.
5. Bumpe `@version` e a string `vX.Y.Z ativo`, atualize README.md (lista de features e
   configuração), marque a feature como ✅ no ROADMAP.md com a versão, e faça commit + push para
   `main`.
6. No fim, explique ao usuário o que mudou, como configurar no painel 🔔 e o que ele precisa
   testar no jogo.
