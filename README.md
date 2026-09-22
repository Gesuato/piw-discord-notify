# PIW Discord Capture Notify

Userscript para o [PokeGrid](https://github.com/soufoka/PokeGrid) que envia uma notificação
para um webhook do Discord quando você captura um Pokémon específico (ou shiny) no Poke Idle World.

## Instalação (PokeGrid)

1. Abra o PokeGrid → **🧩 Scripts / Extras**
2. Cole este link e adicione:
   `https://github.com/Gesuato/piw-discord-notify/blob/main/piw-discord-notify.user.js`
3. No painel do jogo, clique no botão **🔔** (canto inferior esquerdo)
4. Cole a URL do seu webhook do Discord, liste os Pokémon desejados e clique em **Salvar**
5. Use **Testar** para conferir se a mensagem chega no Discord

O webhook e a lista ficam salvos no próprio painel (localStorage) — configure em cada painel/conta que for usar.

## Como funciona

Intercepta o WebSocket do jogo (mesma técnica do PIW-QOL) e observa mensagens de captura
(`catch-result`). Nunca envia sua senha ou dados da conta — só o nome do Pokémon capturado
para o SEU webhook.
