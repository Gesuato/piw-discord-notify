---
description: Lê do disco a config e o log dos painéis do PokeGrid e resume o que o script viu
---

Diagnostique o que o script viu nos painéis do PokeGrid usando o log persistente, sem pedir ao
usuário para abrir console. Argumentos opcionais: "$ARGUMENTS" (número do painel e/ou kinds, ex.:
`4`, `4 nivel,troca,rota`, `compra`).

Passos:

1. Rode `python tools/read-panel-logs.py` (com `--panel N` e/ou `--kinds a,b,c` se o usuário
   indicou). O script já redige os webhooks; mesmo assim, NUNCA copie uma URL de webhook nem o
   token do socket para a resposta ou para arquivos do repo.
2. Lembre que o log guarda só os últimos 40 eventos por painel e que `catch-result` + `balls`
   dominam o volume: se o evento procurado não aparece, ele pode ter sido rotacionado, não
   necessariamente não aconteceu. Nesse caso, diga isso e peça para o usuário reproduzir.
3. Cruze o log com a config (`CFG:`): um alerta que "não saiu" quase sempre é config (limite 0,
   caixa desmarcada, rota ativa sobrepondo o campo de nível, etc.). Veja o histórico de bugs no
   `ROADMAP.md` (itens 2, 9 e 11) para os padrões já vistos.
4. Responda em pt-BR: o que aconteceu (com horários), a causa provável e o que fazer. Se for bug
   do script, corrija seguindo o fluxo de release do `CLAUDE.md` (bump de versão, commit, push).
