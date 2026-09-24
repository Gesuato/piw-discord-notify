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
- ✅ **Venda automática** dos drops da hunt atual que você marcar (lista branca, reserva por item; itens raros e de outras categorias ganham aviso ⚠️ mas podem ser marcados)
- ✅ **Alerta de nível**: avisa quando o líder do time chega ao nível escolhido, em webhook próprio
- ✅ **Troca automática de líder**: ao atingir o nível, passa a vez para o próximo do time que ainda está abaixo
- ✅ **Rota de treino**: etapas "hunt + nível"; quando todos do time chegam ao nível, troca de hunt sozinho
- ✅ **Recarga automática**: recarrega o painel sozinho a cada X–Y minutos (sorteado), como o "⟳ Atualizar tudo" do PokeGrid, e volta para a hunt em que estava
- ✅ **Exportar / importar** a configuração entre contas e painéis
- ✅ Webhooks separados por tipo de evento: capturas, shinys, alertas e nível (cada um pode ir para um canal)
- ✅ Anti-spam opcional: intervalo mínimo entre avisos do mesmo Pokémon (padrão 0 = avisa todas)
- ✅ Painel de configurações dentro do jogo (botão 🔔) — nada de editar código
- ✅ Não envia senha nem dados da conta; as automações (compra, venda, troca de líder, rota) usam as mesmas mensagens que o próprio cliente do jogo

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
   - **Filtro de qualidade** (opcional): escolha uma **raridade mínima** (ex.: Legendary), opcionalmente
     um **poder mínimo para essa raridade** (ex.: Legendary só com 120+) e/ou um **poder mínimo para
     qualquer raridade** (0–192). Avisa se a raridade for ≥ a escolhida (com o poder exigido, se houver)
     **ou** o poder ≥ o mínimo geral. Nada marcado = avisa tudo. Shiny sempre avisa se a opção estiver marcada.
   - **Alerta de bolas** (opcional): escolha a bola (ou "Automática", a do último catch) e um limite.
     Quando o estoque ficar abaixo dele chega um aviso no webhook de alertas (ou no principal, se vazio).
     Avisa uma vez e só repete depois de repor. O estoque é checado após cada captura e a cada 5 min.
   - **Comprar automaticamente** (opcional, dentro do alerta de bolas): em vez de só avisar, compra a
     quantidade escolhida na loja do NPC com o gold da conta, respeitando a reserva de gold. Avisa no
     webhook de alertas o que comprou (ou por que falhou). Uma tentativa por episódio de estoque baixo.
   - **Venda automática** (opcional): entre numa hunt e cace um pouco; os drops que caírem aparecem no
     painel com preço do NPC. Marque só o que pode ser vendido (lista branca) e, se quiser, um "manter"
     de reserva. A cada N minutos (ou num intervalo sorteado entre X e Y minutos, se você preencher os
     dois campos) o script vende o excedente dos marcados e avisa no webhook de alertas.
     Só itens com cadeado no jogo ou que o NPC não compra ficam de fora; raros, pedras e feromônios
     aparecem com ⚠️ para você conferir antes de marcar.
     O botão **Vender agora** vende os marcados na hora. As marcações e a faixa de tempo são salvas como
     **perfil da hunt**: ao voltar para a mesma hunt, o perfil é carregado sozinho.
   - **Alerta de nível** (opcional): informe o nível e, se quiser, marque **trocar o líder** — quando o
     líder chega ao nível, o script avisa (webhook de nível; vazio = alertas) e passa a liderança para o
     próximo do time abaixo do nível. Se você devolver na mão um Pokémon acima do nível, ele troca de novo;
     para manter um líder acima do nível, desmarque a troca. O painel mostra o time atual.
   - **Rota de treino** (opcional): uma etapa por linha, `hunt nível` (ex.: `pidgey 10` e `ledyba 15`; o
     nome da hunt é o que aparece em "Hunt atual"). Marque **Seguir a rota**: o nível da etapa vira o alvo,
     a troca de líder fica ligada e, quando todos do time chegam ao nível, o script sai da hunt e entra na
     próxima. Comece na hunt da 1ª etapa. O progresso fica salvo; editar a rota ou **Reiniciar rota** volta
     para a 1ª etapa.
5. Clique em **Salvar** e depois em **Testar** — deve chegar uma mensagem no Discord (o Testar só envia
   mensagens de teste; quem aplica a config e dispara as checagens é o Salvar)

A configuração fica salva no armazenamento de cada painel. Para copiar entre contas, use **Exportar config**
num painel e **Importar config** no outro (a config exportada inclui os webhooks; há uma opção para manter
os webhooks do painel de destino e importar só o resto).
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
| Quer ver o log sem abrir o jogo | `python tools/read-panel-logs.py --panel N` lê a config e o log de cada painel do PokeGrid direto do disco (webhooks redigidos) |
| Compra automática não comprou | Confira o limite de bolas: com limite 0 ela só compra quando a bola acabar; defina um limite para comprar antes |

## Para desenvolver

- `node test/level.test.js`, `node test/route.test.js` e `node test/reload.test.js`: testes isolados do alerta de nível, troca de líder, rota e recarga automática.
- `docs/mensagens-do-jogo.md`: todas as mensagens do WebSocket conhecidas (levantadas do cliente do jogo).
- `tools/read-panel-logs.py`: leitor do log dos painéis direto do disco.

## Próximas features

As ideias planejadas estão em [ROADMAP.md](ROADMAP.md).

## Licença

MIT — use, modifique e compartilhe à vontade.
