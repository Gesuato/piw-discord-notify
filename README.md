# PIW Discord Capture Notify 🔔

Userscript para o [Poke Idle World](https://poke.idleworld.online) que envia uma notificação
para um webhook do Discord quando você captura um Pokémon. Feito para rodar no injetor de
scripts do [PokeGrid](https://github.com/soufoka/PokeGrid), mas também funciona no
Tampermonkey/Violentmonkey no navegador.

> Deixe o jogo farmando e receba no Discord: **"🎉 Golem capturou Dratini (nível 12)! ✨ SHINY ✨"**

## Recursos

- ✅ Notifica capturas de Pokémon específicos (lista configurável)
- ✅ Lista vazia = notifica **todas** as capturas
- ✅ Aviso opcional para **qualquer shiny**, mesmo fora da lista
- ✅ Menção opcional (`@você`) na mensagem do Discord
- ✅ Mostra qual conta/painel capturou (útil com múltiplos painéis do PokeGrid)
- ✅ Anti-spam: cooldown de 30s entre avisos do mesmo Pokémon
- ✅ Painel de configurações dentro do jogo (botão 🔔) — nada de editar código
- ✅ Somente observa o jogo: não automatiza nada, não envia senha nem dados da conta

## Instalação

### No PokeGrid (recomendado)

1. Abra o PokeGrid → **🧩 Scripts / Extras**
2. Cole este link e adicione:
   ```
   https://github.com/Gesuato/piw-discord-notify/blob/main/piw-discord-notify.user.js
   ```
3. No painel do jogo, clique no botão **🔔** no canto inferior esquerdo
4. Configure:
   - **URL do webhook**: crie em Discord → Configurações do canal → Integrações → Webhooks → Novo Webhook → Copiar URL
   - **Pokémon**: nomes separados por vírgula (ex.: `dratini, larvitar`) — ou deixe vazio para avisar toda captura
   - **Avisar todo shiny**: marca para receber aviso de qualquer shiny
5. Clique em **Salvar** e depois em **Testar** — deve chegar uma mensagem no Discord

A configuração fica salva no armazenamento de cada painel — configure em cada painel/conta que for usar.
Para atualizar o script depois, use o botão **Atualizar** na lista de scripts do PokeGrid.

### No navegador (Tampermonkey)

1. Instale o [Tampermonkey](https://www.tampermonkey.net/)
2. Crie um novo script e cole o conteúdo de [`piw-discord-notify.user.js`](piw-discord-notify.user.js)
3. Abra o jogo e configure pelo botão 🔔

## Como funciona

O jogo se comunica com o servidor por WebSocket, com mensagens JSON. O script intercepta esse
tráfego (mesma técnica do [PIW-QOL](https://github.com/JulianoCLI/PIW-QOL)) em duas frentes:

1. **Patch no construtor `WebSocket`** — captura conexões criadas depois da injeção (reconexões);
2. **Patch no `WebSocket.prototype.send`** — descobre a conexão que **já estava aberta** quando o
   script foi injetado (o PokeGrid injeta userscripts no `dom-ready`, depois do jogo conectar).

Quando chega uma mensagem de captura (`catch-result`), o script extrai o nome/nível/shiny do
Pokémon, aplica os filtros configurados e faz um `POST` no webhook do Discord.

## Segurança

- **Nunca coloque a URL do seu webhook no código** se for publicar em repositório público — o
  Discord detecta webhooks vazados no GitHub e os desativa. Por isso a configuração fica no
  `localStorage`, fora do código.
- O script não lê nem envia credenciais. O PokeGrid, por design, nem injeta userscripts nas
  telas de login.

## Solução de problemas

| Problema | O que fazer |
|---|---|
| Botão 🔔 não aparece | Confirme que o script está ligado em Scripts/Extras e recarregue o painel |
| Teste funciona, captura real não | Marque **Debug** no painel 🔔, capture algo e veja o console — o payload logado mostra o formato real da mensagem |
| Notificação sem nome da conta | O jogo ainda não carregou `/api/characters/me`; aparece na próxima |
| Webhook parou de funcionar | Ele pode ter vazado e sido desativado — crie outro no Discord |

## Licença

MIT — use, modifique e compartilhe à vontade.
