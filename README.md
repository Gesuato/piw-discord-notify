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
- ✅ Poder (X/192) e qualidade (Common, Rare, Epic, Legendary...) do Pokémon capturado, com a cor do embed pela faixa
- ✅ Filtro por **raridade mínima** (Legendary ou superior, por exemplo) e/ou **poder mínimo**
- ✅ Alerta de **bolas acabando** (limite por bola, checado após cada captura e a cada 5 min)
- ✅ **Compra automática** de bolas na loja quando o estoque cai (quantidade e reserva de gold configuráveis)
- ✅ **Venda automática** dos drops da hunt atual que você marcar (lista branca, reserva por item, raros bloqueados)
- ✅ Webhooks separados por tipo de evento: capturas, shinys e alertas (cada um pode ir para um canal)
- ✅ Anti-spam opcional: intervalo mínimo entre avisos do mesmo Pokémon (padrão 0 = avisa todas)
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
   - **Webhook de capturas**: crie em Discord → Configurações do canal → Integrações → Webhooks → Novo Webhook → Copiar URL
   - **Webhook de shinys** (opcional): outro canal só para capturas shiny. Vazio = usa o de capturas
   - **Webhook de alertas** (opcional): canal para os alertas do [ROADMAP](ROADMAP.md) (shiny na fila, estoque, quedas). Vazio = usa o de capturas
   - **Pokémon**: nomes separados por vírgula (ex.: `dratini, larvitar`) — ou deixe vazio para avisar toda captura
   - **Avisar todo shiny**: marca para receber aviso de qualquer shiny
   - **Filtro de qualidade** (opcional): escolha uma **raridade mínima** (ex.: Legendary) e/ou um
     **poder mínimo** (0–192). Avisa se a raridade for ≥ a escolhida **ou** o poder ≥ o mínimo.
     Nada marcado = avisa tudo. Shiny sempre avisa se a opção estiver marcada.
   - **Alerta de bolas** (opcional): escolha a bola (ou "Automática", a do último catch) e um limite.
     Quando o estoque ficar abaixo dele chega um aviso no webhook de alertas (ou no principal, se vazio).
     Avisa uma vez e só repete depois de repor. O estoque é checado após cada captura e a cada 5 min.
   - **Comprar automaticamente** (opcional, dentro do alerta de bolas): em vez de só avisar, compra a
     quantidade escolhida na loja do NPC com o gold da conta, respeitando a reserva de gold. Avisa no
     webhook de alertas o que comprou (ou por que falhou). Uma tentativa por episódio de estoque baixo.
   - **Venda automática** (opcional): entre numa hunt e cace um pouco; os drops que caírem aparecem no
     painel com preço do NPC. Marque só o que pode ser vendido (lista branca) e, se quiser, um "manter"
     de reserva. A cada N minutos o script vende o excedente dos marcados e avisa no webhook de alertas.
     Poções, bolas, pedras, feromônios, itens raros e itens com cadeado no jogo nunca são vendidos.
     O botão **Vender agora** vende os marcados na hora.
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

O jogo manda duas mensagens relevantes:

- `pending` — a fila de Pokémon capturáveis (`list[]` com `id`, `name`, `level`, `shiny`), a cada abate;
- `catch-result` — o resultado da captura (`success`, `speciesName`, `shiny`, `ballName`, `pendingId`;
  `auto: true` quando foi o autocatch VIP).

O script guarda a última fila `pending`, e quando chega um `catch-result` com `success: true` cruza o
`pendingId` para descobrir o nível, aplica os filtros configurados e faz um `POST` no webhook do Discord.

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
| Teste funciona, captura real não | Capture algo e clique em **Copiar log** no painel 🔔: ele copia os últimos eventos (mensagens `catch-result`, decisão dos filtros, resposta do webhook). Marque **Debug** para ver o mesmo no console |
| Notificação sem nome da conta | O jogo ainda não carregou `/api/characters/me`; aparece na próxima |
| Webhook parou de funcionar | Ele pode ter vazado e sido desativado — crie outro no Discord |

## Próximas features

As ideias planejadas estão em [ROADMAP.md](ROADMAP.md).

## Licença

MIT — use, modifique e compartilhe à vontade.
