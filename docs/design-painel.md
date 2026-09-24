# Proposta de design — painel 🔔 do piw-discord-notify

Data: 2026-09-24 · Base: `buildUI()` da v3.4.1 · Autor: agente designer (sessão Claude Code)

> **Status: implementado na v3.5.0** (24/09/2026), as 4 fases de uma vez, depois do usuário validar o mockup
> `docs/mockup-painel.html`. Diferenças em relação ao texto abaixo: a reserva de gold foi removida (UI e
> lógica); "Testar canais" salva só os 4 canais antes de enviar; a fase 5 (refino) segue em aberto.

Contexto de uso que guia tudo abaixo:

- O painel roda dentro de um `<webview>` do PokeGrid, em grade 2×2. Na prática cada conta tem
  ~960×540 px (ou menos com a barra do PokeGrid). O painel atual tem 320 px de largura e
  `max-height: 90vh` → ocupa 1/3 da largura e quase toda a altura do webview, e ainda assim
  vira um scroll de ~1600 px.
- O jogador abre o painel para 3 coisas, nesta frequência: (1) ver de relance se "está tudo
  ligado" nesta conta; (2) mexer numa coisa específica (marcar um drop, mudar o nível da rota);
  (3) configurar do zero uma conta nova (raro; usa Importar).
- Config é por painel (localStorage por partição). Não há sincronização automática (decisão
  registrada no CLAUDE.md).
- Restrições: arquivo único, JS vanilla, sem CDN, sem build. Pode injetar um `<style>`.

---

## 1. Crítica do painel atual

### Impressão geral

Funcionalmente completo, visualmente um "formulário infinito": 10 blocos empilhados na mesma
cor, mesmo peso e mesma borda, com 70% do texto sendo ajuda em cinza. Nada diz de relance o
que está ligado. O maior ganho está em **arquitetura de informação e estado visível**, não em
estética.

### Usabilidade

| Achado (específico do HTML atual) | Severidade | Recomendação |
|---|---|---|
| `Salvar` fica no fim de ~1600 px de scroll, e é o único jeito de persistir qualquer campo. Para marcar um drop na venda automática o usuário rola até a metade, marca, rola até o fim, salva. | 🔴 Crítico | Rodapé fixo (sticky) com Salvar sempre visível + indicador "alterações não salvas". |
| Nenhum módulo mostra se está ligado sem ler o campo: "Alerta de nível" ligado é `levelAlertAt > 0`, "Alerta de bolas" é `ballsMin > 0`, venda/recarga/rota são checkboxes no meio do bloco. Com 4 contas, conferir "está tudo certo?" exige abrir e rolar 4 painéis. | 🔴 Crítico | Abas com badge de estado (● ligado / ○ desligado / ⚠ atenção) e o botão 🔔 com um ponto colorido resumindo a conta. |
| Ordem dos blocos segue a ordem em que as features foram criadas, não a lógica do jogador: webhooks → filtro nome → qualidade → bolas → venda → nível+rota → recarga → menção → cooldown → debug. "Menção" e "Cooldown" (que afetam capturas) ficam depois de "Recarga". | 🟡 Moderado | Agrupar por objetivo (Avisos, Bolas, Venda, Treino, Sistema). Ver seção 2. |
| 4 campos de webhook `type=password` idênticos no topo, todos vazios na 1ª abertura. É a coisa mais assustadora e menos frequente do painel, e ocupa a "dobra" inteira. | 🟡 Moderado | Webhooks colapsados por padrão depois de preenchidos ("4 canais configurados · editar"). Mostrar só o principal expandido na conta nova. |
| O texto da regra de qualidade (linha 114) tem 3 orações com "ou", "e", "se preenchido" e parênteses. É uma regra OU/E genuinamente complexa e a ajuda tenta explicar tudo numa frase. | 🟡 Moderado | Mostrar a regra como frase montada dinamicamente a partir dos valores: "Avisa: Legendary+ com poder ≥120, ou qualquer um com poder ≥180." |
| `#pg-dn-msg` é uma linha no fim do painel que some em 2,5 s. Depois de "Salvar" com avisos (rota inválida, compra com limite 0) o texto cresce para 3 linhas e some em 9 s, e o usuário pode nem ver porque estava com o scroll lá em cima ao clicar "Vender agora". | 🟡 Moderado | Barra de status no rodapé fixo, colorida por tipo (ok/aviso/erro); avisos persistem até o próximo clique. |
| Lista de venda: `max-height:160px` com scroll interno **dentro** de um painel que já tem scroll (scroll aninhado). "manter" + input de 56 px por linha empurra nomes longos ("Pheromone of Pidgey") para 2 linhas. | 🟡 Moderado | A aba Venda é dona do scroll; a lista ocupa o que sobrar. Input "manter" só aparece quando o item está marcado. |
| "Testar" reescreve `cfg.webhookUrl` etc. na memória sem salvar (linhas 380–383): se o usuário testar e fechar, o script roda com webhooks diferentes dos persistidos até o reload. Bug de modelo mental, não só de UI. | 🟡 Moderado | Testar usa os valores do campo sem tocar em `cfg`, ou salva explicitamente ("Testar" = salva webhooks + envia). |
| Rota de treino em `<textarea>` "hunt nível" por linha, com validação só ao salvar e erro na msg efêmera. | 🟢 Menor | Manter o textarea (simples e funciona), mas validar ao digitar: linha inválida fica vermelha e a msg lista quais. Status da rota vira lista com a etapa atual destacada. |
| Botão 🔔 no canto inferior esquerdo pisca vermelho sem webhook (`flashButton`) por 3 s e depois nada. | 🟢 Menor | Ponto de estado permanente no botão. |
| Exportar/Importar/Copiar log/Debug têm o mesmo peso visual que Salvar e ficam sempre à vista. | 🟢 Menor | Movem para a aba Sistema. |

### Hierarquia visual

- **O que puxa o olho primeiro**: os 4 inputs de senha (fundo escuro em bloco). Errado: são o
  campo menos mexido depois do setup.
- **Fluxo de leitura**: linear de cima a baixo, sem âncoras. Os blocos com borda (`padding:8px;
  border:1px solid #444`) têm exatamente o mesmo peso que os campos soltos entre eles, então o
  olho não distingue "seção" de "campo".
- **Ênfase**: só existe um nível de destaque (`<b>` no título do bloco) e um de rebaixamento
  (`color:#aaa`). Toda ajuda tem o mesmo tamanho do rótulo (13 px vs 12 px, quase igual). Não há
  ênfase para "estado atual" (hunt atual, time, status da rota): são `<div>` cinza iguais à ajuda.

### Consistência

| Elemento | Problema | Recomendação |
|---|---|---|
| Estilo inline repetido | A mesma string de 130 chars de estilo de input aparece 14 vezes; inputs de 52 px e 56 px inline com `padding:2px 4px` vs `4px`. | `<style>` injetado com classes `.dn-*`. |
| Espaçamento | `margin-top` varia 2/4/6/8/10 sem regra. | Escala 4/8/12/16. |
| Botões secundários | "Atualizar time", "Vender agora", "Recarregar agora", "Reiniciar rota" são todos `#3a3c42` de largura total; "Reiniciar rota" é destrutivo (zera progresso) e parece igual. | Primário / secundário / perigo (borda vermelha). |
| Checkbox nativo | Liga/desliga módulos inteiros (venda, recarga, rota, compra) com o mesmo checkbox de "Debug". | Toggle (switch) para ligar módulo; checkbox só para itens de lista. |
| Ajuda | Ajuda em `<span>` inline no título, em `<div>` abaixo do campo e em `title=` — três formas. | Uma forma: `.dn-help` abaixo do campo; `title=` só como reforço. |
| Emojis de estado | 🔒 e ⚠️ na venda; ★ no time; ✔/⚠/📤/📋/💰/⏳/⟳/📥/↩ na msg. | Manter (funcionam sem ícone externo), mas padronizar: ✔ ok, ⚠ aviso, ✖ erro, ● ligado. |

### Acessibilidade

- **Contraste**: `#aaa` sobre `#2b2d31` ≈ 6,3:1 (ok); `#777` sobre `#2b2d31` (itens protegidos
  e "nenhum drop") ≈ 3,1:1 — **falha** para texto de 12 px. `#8f9` da msg ≈ 12:1 ok.
- **Alvos de clique**: inputs de 52 px × ~22 px e checkboxes nativos de 13 px são pequenos para
  um webview que muitas vezes está com zoom < 100%. Mínimo 28 px de altura.
- **Legibilidade**: 12 px para 70% do texto. Reduzir a *quantidade* de ajuda é melhor que
  aumentar o tamanho.
- **Foco/teclado**: não há `for=`/`id` nos rótulos de texto (só os checkboxes estão dentro de
  `<label>`), então clicar no rótulo não foca o campo.

### O que funciona bem

- Paleta já é a do Discord (`#2b2d31`, `#1e1f22`, `#5865f2`): reconhecível e coerente com o
  destino das notificações.
- Todos os estados dinâmicos já existem no código (`renderTeam`, `renderSellList`,
  `renderReload`, `routeStatus`) com callbacks `on*Change` — o redesign é rearranjo, não
  lógica nova.
- Exportar/Importar com "manter webhooks" resolve bem o caso 4 contas sem sync.
- Botões "agora" (vender, recarregar, atualizar time) agem na hora e dão feedback.

### Recomendações prioritárias

1. **Abas + rodapé fixo com Salvar** — resolve o scroll e o "onde está o Salvar" de uma vez, e
   é o que dá mais retorno para o cenário 2×2.
2. **Estado visível** — badge por aba e ponto no 🔔. Responde "está tudo ligado?" sem abrir.
3. **Cortar copy pela metade** e mover regras complexas para frases geradas dos valores.

---

## 2. Arquitetura de informação

### Agrupamento por objetivo do jogador

```
🔔 Notify · v3.x                              [● Avisos ● Bolas ○ Venda ● Treino]  ✕
┌──────────┬──────────┬──────────┬──────────┬──────────┐
│ 🔔 Avisos│ 🎯 Bolas │ 💰 Venda │ ⚔ Treino │ ⚙ Sistema│   ← barra de abas (sticky)
└──────────┴──────────┴──────────┴──────────┴──────────┘
│                                                      │
│   conteúdo da aba (único scroll)                     │
│                                                      │
├──────────────────────────────────────────────────────┤
│ ✔ Salvo!                          [ Testar ] [Salvar]│   ← rodapé (sticky)
└──────────────────────────────────────────────────────┘
```

| Aba | Config (persistida) | Status ao vivo | Ações imediatas | Avançado (colapsado) |
|---|---|---|---|---|
| **🔔 Avisos** | Quais capturas avisar: lista de nomes, "toda captura", "todo shiny"; filtro de qualidade (raridade mín. + poder da raridade + poder global); cooldown; menção | Frase-resumo da regra ("Avisa: Dratini, Larvitar · Legendary+ ≥120 · shiny sempre") | — | Webhooks (4 canais + regra de fallback), colapsado quando o principal já está preenchido |
| **🎯 Bolas** | Bola monitorada; limite de alerta; compra automática (toggle, qtd; a reserva de gold foi removida a pedido do usuário) | Estoque atual da bola monitorada (já chega em `balls`), última compra/alerta | — | — |
| **💰 Venda** | Toggle; intervalo min–max; lista de drops da hunt atual (checkbox + manter) | Hunt atual + "perfil salvo/sem perfil"; próxima venda em X min; último resultado | Vender agora | — |
| **⚔ Treino** | Nível alvo; troca de líder (toggle); rota (textarea) + seguir rota (toggle) | Time com líder (★) e níveis; etapa atual da rota destacada; hunt atual | Atualizar time · Reiniciar rota (perigo) | — |
| **⚙ Sistema** | Recarga automática (toggle, min–max); Debug | Próxima recarga em X min · versão · socket rastreado sim/não | Recarregar agora · Copiar log · Exportar · Importar | Caixa de importar (aparece ao clicar) |

Justificativas:

- **Menção e cooldown vão para Avisos**: são propriedades da notificação de captura, não do
  sistema. Hoje ficam soltos depois de "Recarga".
- **Webhooks viram "avançado" dentro de Avisos**: são a única coisa que a aba realmente
  precisa para funcionar, mas depois do setup nunca mais são tocados. Regra: se `webhookUrl`
  está vazio, o bloco abre expandido e a aba recebe ⚠; senão, fica colapsado com resumo
  "Canais: principal ✔ · shiny ✔ · alertas — · nível —".
- **Rota fica com Nível em Treino**: já são o mesmo módulo no código (`levelTarget()` depende
  de `routeEnabled`). Quando "Seguir rota" está ligado, o campo "nível alvo" é substituído por
  "Nível: da etapa atual (10, pidgey)" em modo leitura, para não parecer que os dois competem.
- **Recarga vai para Sistema**: não é sobre o jogo, é sobre o painel do PokeGrid. Junto de
  Debug, log, exportar/importar.

### Abas, não acordeão

- Altura útil do webview em 2×2 ≈ 500 px. Acordeão com 5 seções ainda empilha 5 cabeçalhos
  (~180 px) antes do conteúdo, e abrir duas seções já estoura. Abas dão 100% da altura para
  uma seção.
- Abas permitem badge de estado no próprio rótulo, que é a resposta ao problema crítico 2.
- O usuário mexe em **uma** coisa por vez (marcar drop, mudar nível). Não há fluxo que precise
  ver duas seções ao mesmo tempo.
- Aba ativa lembrada em `localStorage` (`pgDiscordNotifyUi.tab`) para reabrir onde parou.
- Salvar continua global (ver seção 3), então trocar de aba não perde edição.

### Destaque vs. escondido

- **Destaque (visível ao abrir a aba)**: toggle do módulo, o campo principal (nível, limite,
  intervalo), o status ao vivo.
- **Rebaixado**: ajuda de uma linha abaixo do campo; detalhes longos (como a recarga volta pra
  hunt, como a checagem de estoque funciona) viram `title=` no ícone ⓘ ou uma linha "ⓘ Como
  funciona" que expande.
- **Escondido**: webhooks preenchidos, caixa de importar, debug.

---

## 3. Modelo de interação

### Salvar: global, no rodapé fixo, com estado "sujo"

Manter **um** Salvar global. Motivos:

- Salvar hoje tem efeitos colaterais que cruzam módulos (`requestPokes`, `drawSellDelay`,
  `scheduleReload`, `saveHuntProfile`, limpar `ballAlerted`). Salvar por seção obrigaria a
  fatiar isso e é onde bugs de "salvei ali e desligou aqui" nasceriam.
- Testes e ids (`#pg-dn-save`) continuam válidos.
- O problema real não era "global", era "no fim do scroll". O rodapé fixo resolve.

Complementos:

- **Indicador de não salvo**: ao editar qualquer campo, o rodapé mostra "● Alterações não
  salvas" e Salvar fica com o azul cheio; sem alterações, Salvar fica em estado neutro. Trocar
  de aba mantém. Fechar o painel com alterações pendentes: o 🔔 ganha ponto amarelo e o
  tooltip diz "alterações não salvas"; reabrir mantém os valores (não chamar `fill()` se
  estiver sujo).
- **Enter num input de texto/número = Salvar** (comodidade, custo zero).
- **Ações imediatas** (Vender agora, Recarregar agora, Atualizar time, Reiniciar rota,
  Testar) continuam agindo na hora, mas as que dependem de campos editados (Vender agora usa a
  lista marcada) primeiro salvam explicitamente e dizem isso: "💰 Salvo e vendendo…".
- **Reiniciar rota** é destrutivo: botão em estilo perigo e confirmação leve (2º clique em 3 s:
  "Clique de novo para confirmar").

### Feedback: barra de status no rodapé, por tipo

Substitui `#pg-dn-msg` solto (mantém o id, muda o lugar e o estilo).

| Tipo | Cor | Some? | Exemplo |
|---|---|---|---|
| ok | verde | 2,5 s | ✔ Salvo · 📤 Teste enviado: capturas, shinys |
| info | neutro | 4 s | 📥 Pedi o time ao jogo… |
| aviso | amarelo | fica até o próximo clique | ⚠ 2 linhas da rota ignoradas: "pidgey", "10 larvitar" |
| erro | vermelho | fica | ✖ Não vendeu: socket não rastreado |

Sem toasts flutuantes: o webview é pequeno, toasts cobririam o jogo e o painel já tem um
rodapé fixo. Mensagem com mais de 1 linha vira `title=` completo + reticências, com clique
para expandir.

### Estados vazios (um por aba, com a ação que resolve)

| Situação | Onde | Texto | Ação |
|---|---|---|---|
| Sem webhook principal | Aba Avisos (aberta por padrão) + ⚠ na aba + ponto vermelho no 🔔 | "Cole o webhook do canal do Discord para começar." | campo já em foco |
| Fora de hunt | Venda, Treino | "Fora de hunt. Entre numa hunt e cace um pouco: os drops aparecem aqui." | — |
| Em hunt, sem drops ainda | Venda | "Nenhum drop visto em *pidgey* ainda." | — |
| Time não lido | Treino | "Time ainda não lido." | [Atualizar time] inline |
| Socket não rastreado | Rodapé (ícone) + Sistema | "○ Sem socket do jogo: recarregue o painel." | [Recarregar agora] |
| Rota vazia com "seguir rota" marcado | Treino | "Sem etapas: a rota fica desligada." (e o toggle desmarca ao salvar, como hoje) | — |

### Estado de relance

**Badge por aba** (à direita do rótulo, 8 px):

- ● verde = módulo ligado (Avisos: webhook ok; Bolas: `ballsMin>0` ou autoBuy; Venda:
  `sellEnabled`; Treino: `levelEnabled()` ou `routeActive()`; Sistema: `reloadEnabled`).
- ○ cinza = desligado.
- ⚠ amarelo = ligado mas precisa de atenção (compra automática com limite 0; venda ligada com
  0 itens marcados; rota ligada mas concluída; alertas sem webhook de alertas quando o
  principal também está vazio).

**Botão 🔔**: ganha um ponto no canto (10 px):

- vermelho pulsando = sem webhook principal (substitui `flashButton`);
- amarelo = alguma aba em ⚠ ou alterações não salvas;
- verde = tudo ok com pelo menos um módulo ligado;
- sem ponto = só notificação básica ligada.
- `title=` do botão vira o resumo que hoje vai para o `console.log` final: "Avisos: lista (2) ·
  Bolas: Ultra <50 + compra · Venda: 3 itens/10–15 min · Treino: rota 2/4 · Recarga: 60–90 min".

**Cabeçalho do painel**: título curto + versão + os 5 pontos (mini-réplica dos badges) + ✕.
Assim, mesmo com a aba Venda aberta, o usuário vê que Treino está ⚠.

---

## 4. Mini sistema visual

### Tokens (CSS custom properties no `<style>` injetado, prefixo `--dn-`)

```css
#pg-dn-panel, #pg-dn-btn {
  --dn-bg-0: #1e1f22;   /* inputs, cabeçalho/rodapé */
  --dn-bg-1: #2b2d31;   /* painel */
  --dn-bg-2: #313338;   /* linha de item hover, aba ativa */
  --dn-bg-3: #3a3c42;   /* botão secundário */
  --dn-border: #3f4147;
  --dn-text: #dbdee1;
  --dn-muted: #949ba4;  /* ajuda — 5,9:1 sobre bg-1, passa AA */
  --dn-dim: #80848e;    /* protegido/desabilitado — 4,6:1, passa AA para 12px bold ou 13px */
  --dn-accent: #5865f2; /* primário (blurple) */
  --dn-ok: #23a559;
  --dn-warn: #f0b232;
  --dn-danger: #da373c;
  --dn-shiny: #fee75c;  /* só para ⚠ de item raro e shiny */
  --dn-radius: 6px;
  --dn-radius-sm: 4px;
}
```

Semântica fixa: verde = ligado/ok; amarelo = atenção/aviso; vermelho = erro/perigo/sem
webhook; cinza `dim` = protegido, desligado, sem dados; azul = ação primária e aba ativa.

### Tipografia

| Uso | Tamanho / peso | Cor |
|---|---|---|
| Título do painel | 14 px / 600 | text |
| Rótulo de aba | 12 px / 600 | muted; ativa = text |
| Título de seção dentro da aba | 13 px / 600, caixa normal | text |
| Rótulo de campo | 13 px / 400 | text |
| Valor de input | 13 px | text |
| Ajuda | 12 px / 400, `line-height 1.4` | muted |
| Status ao vivo | 12 px, `font-variant-numeric: tabular-nums` | text (não muted: é informação, não ajuda) |
| Badge | 11 px / 600 | conforme estado |
| Textarea/monospace (rota, importar) | 12 px `ui-monospace, Consolas, monospace` | text |

Fonte: `system-ui, -apple-system, "Segoe UI", sans-serif` (o webview é Chromium no Windows;
`sans-serif` genérico hoje cai em Arial).

### Espaçamento

Escala de 4: `4 / 8 / 12 / 16`. Regras:

- Entre campos: 8. Entre seções na mesma aba: 16 com divisor de 1 px.
- Padding do painel: 12. Padding de input: `6px 8px`. Altura mínima de input/botão: 28 px.
- Gap entre botões: 8.

### Dimensões e posição do painel

- Largura **380 px** (cabe 5 abas com emoji + rótulo curto; 320 ficava justo).
- Altura: `height: min(520px, calc(100vh - 70px))`, **fixa, não `max-height`**: assim o painel
  não "pula" de tamanho ao trocar de aba, e o rodapé fica sempre no mesmo lugar.
- Posição: mantém `bottom: 58px; left: 12px` (o 🔔 continua no canto inferior esquerdo). Em
  webview mais baixo que 380 px, o painel vira `top: 8px; bottom: 58px` (altura líquida).
- Cabeçalho, barra de abas e rodapé `position: sticky` dentro de um contêiner com
  `display: flex; flex-direction: column`; só a área de conteúdo tem `overflow: auto`.
- Fechar: ✕ no cabeçalho, `Esc`, e clique no 🔔 (como hoje).

### Componentes

```
.dn-tabs        barra: 5 botões flex:1, borda inferior 2px accent na ativa, badge no canto
.dn-tab         [🔔 Avisos ●]
.dn-section     título 13/600 + divisor acima (exceto o primeiro)
.dn-field       <label class="dn-field"><span>Rótulo</span><input class="dn-input"></label>
                (label envolve input: clique no rótulo foca; sem for/id)
.dn-help        12px muted, abaixo do campo, máx. 2 linhas
.dn-input       bg-0, borda border, radius-sm, altura 28, foco: borda accent
.dn-input--sm   largura 64px inline (intervalos "10 a 15 min")
.dn-select      = .dn-input com seta
.dn-toggle      checkbox visual switch 32×18, verde quando ligado; label à direita.
                Usado para: Toda captura, Todo shiny, Compra automática, Vender automaticamente,
                Trocar líder, Seguir rota, Recarregar automaticamente, Debug.
.dn-check       checkbox normal 16px (só para itens da lista de venda)
.dn-badge       11px pill; --ok/--off/--warn; texto "ligado"/"desligado"/"atenção" ou só o ponto
.dn-btn         28px, radius-sm, 13px/600
.dn-btn--primary   bg accent, texto branco (Salvar, Aplicar config)
.dn-btn--secondary bg-3, texto text (Testar, Vender agora, Atualizar time, Exportar...)
.dn-btn--danger    fundo transparente, borda+texto danger; hover preenche (Reiniciar rota)
.dn-btn--ghost     sem fundo, texto muted (✕, "ⓘ como funciona")
.dn-status      linha de status ao vivo: ícone + texto 12px text, fundo bg-0, radius-sm, padding 6 8
.dn-summary     frase-resumo gerada (Avisos): 12px, fundo bg-0, borda esquerda 2px accent
.dn-item        linha de venda (ver abaixo)
.dn-footer      sticky; [msg à esquerda, flex:1] [Testar] [Salvar]
```

Linha de item de venda (`.dn-item`), 3 estados:

```
[✓] Pheromone of Pidgey     ×12 · 250 g   ⚠ feromônio   manter [ 5 ]
[ ] Pidgey Feather          ×40 · 10 g
🔒 Rare Candy               ×1            cadeado no jogo
```

- Nome em `text`, quantidade e preço em `muted` com `tabular-nums`, alinhados à direita do
  nome via grid `auto 1fr auto auto`.
- "manter [N]" só renderiza quando marcado (reduz ruído e largura).
- ⚠ em `shiny` (amarelo), com `title=` explicando; 🔒 com a linha inteira em `dim`.
- Hover: fundo bg-2. Linha inteira clicável para marcar (exceto o input).

Status da rota (Treino):

```
Rota · etapa 2 de 4                        [Reiniciar rota]
  ✔ pidgey → nível 10
  ▶ larvitar → nível 15   ← atual (hunt atual: larvitar)
    dratini → nível 20
    bagon → nível 25
Time (★ líder): ★ Larvitar 12 · Pidgey 10 · Dratini 8
```

---

## 5. Copy (pt-BR)

Princípios: rótulo = substantivo curto; regra de valor especial ("0 = desligado") vai no
`placeholder` ou na ajuda, nunca no rótulo; ajuda ≤ 1 linha; regras complexas viram frase
gerada dos valores; "webhook" → "canal" na UI (o campo continua sendo uma URL de webhook, mas
o jogador pensa em canal do Discord).

### Cabeçalho, abas, rodapé

| Atual | Novo | Ajuda nova |
|---|---|---|
| 🔔 Discord Capture Notify | 🔔 Notify · v3.x | — |
| — | Abas: 🔔 Avisos · 🎯 Bolas · 💰 Venda · ⚔ Treino · ⚙ Sistema | — |
| Salvar | Salvar | rodapé: "● Alterações não salvas" quando sujo |
| Testar | Testar canais | "Envia uma mensagem de teste a cada canal preenchido." |

### Aba Avisos

| Atual | Novo | Ajuda nova |
|---|---|---|
| Webhook de capturas (principal): | **Canais do Discord** (bloco colapsável) → Capturas | "Obrigatório. Recebe as capturas e tudo que não tiver canal próprio." |
| Webhook de shinys (opcional; vazio = usa o principal): | Shinys | "Vazio = vai para Capturas." |
| Webhook de alertas (opcional; shiny na fila, estoque, quedas — em breve): | Alertas | "Bolas, venda, hunt. Vazio = vai para Capturas." |
| Webhook de nível (opcional; vazio = usa o de alertas): | Nível | "Nível atingido e troca de líder. Vazio = vai para Alertas." |
| Pokémon (separados por vírgula; vazio = avisar TODAS as capturas): | **Quais capturas avisar** → Pokémon | placeholder "dratini, larvitar" · ajuda "Vazio = todas." |
| Avisar todo shiny | Todo shiny (toggle) | "Shiny avisa sempre, mesmo fora da lista e do filtro." |
| Avisar TODA captura | Toda captura (toggle) | "Ignora a lista de nomes." |
| Filtro de qualidade (nada marcado = avisa tudo) | **Filtro de qualidade** | frase gerada: "Avisa: tudo." / "Avisa: Legendary+ com poder ≥ 120, ou qualquer raridade com poder ≥ 180." |
| Raridade mínima: | Raridade mínima | select: "Qualquer" em vez de "(qualquer)" |
| Poder mínimo para essa raridade (0–192; 0 = qualquer poder): | Poder mínimo dessa raridade | placeholder "0 = qualquer" · ajuda "Poder é o X/192 do jogo." |
| Poder mínimo para qualquer raridade (0–192; 0 = desligado): | Poder mínimo, qualquer raridade | placeholder "0 = desligado" |
| (parágrafo de 3 linhas da regra) | removido → frase gerada acima | — |
| Mencionar (ID do Discord, opcional): | **Mensagem** → Mencionar (ID do Discord) | placeholder "123456789012345678 (opcional)" |
| Intervalo mínimo entre avisos do mesmo Pokémon (segundos; 0 = avisar todas): | Intervalo entre avisos do mesmo Pokémon | sufixo "s" · placeholder "0 = avisa todas" |

### Aba Bolas

| Atual | Novo | Ajuda nova |
|---|---|---|
| Alerta de bolas (vai para o webhook de alertas) | **Estoque de bolas** | status: "Ultra Ball: 1.240 em estoque" (quando `balls` já chegou) |
| Bola monitorada: | Bola | opção "Automática (a do último catch)" → "A que estiver em uso" |
| Avisar quando restarem menos de (0 = desligado; com compra automática, 0 = comprar quando acabar): | Avisar abaixo de | placeholder "0 = desligado" · ajuda "Checa após cada captura e a cada 5 min. Avisa uma vez; rearma ao repor." |
| Comprar automaticamente na loja em vez de só avisar | Comprar automaticamente (toggle) | "Compra na loja do NPC com o gold da conta quando ficar abaixo do limite." + aviso ⚠ quando limite = 0: "Limite 0: compra só quando acabar." |
| Quantidade por compra: | Quantidade | placeholder "100" |
| Reserva de gold: | **removido** (decisão do usuário, 24/09/2026) | a chave `autoBuyGoldReserve` some do painel; na implementação, deixar de ler/gravar o campo (config antiga continua carregando sem erro) |
| (parágrafo: uma tentativa por vez...) | ajuda de 1 linha | "Uma tentativa por vez; se faltar gold, avisa e espera repor ou salvar." |

### Aba Venda

| Atual | Novo | Ajuda nova |
|---|---|---|
| Venda automática (drops da hunt atual → NPC; aviso no webhook de alertas) | **Venda automática** | status: "Hunt: pidgey · perfil salvo · próxima venda em 7 min" |
| Vender automaticamente a cada [ ] a [ ] min (sorteado na faixa; deixe o 2º vazio para fixo) | Vender automaticamente (toggle) · A cada [10] a [15] min | "Sorteado na faixa. Segundo vazio = fixo." |
| Hunt atual: X — perfil salvo (carregado ao entrar) | Hunt: X · perfil salvo | — |
| ...sem perfil ainda; Salvar cria um para esta hunt | Hunt: X · sem perfil (Salvar cria) | — |
| Fora de hunt — entre numa hunt e cace um pouco... | Fora de hunt. Entre numa hunt e cace: os drops aparecem aqui. | — |
| (nenhum drop visto nesta hunt ainda) | Nenhum drop visto em *X* ainda. | — |
| Marque só o que pode ir embora: tudo que está marcado é vendido. ⚠️ = ... | "Marcado = vendido. ⚠ = raro, pedra/feromônio ou outra categoria: confira. 🔒 = o jogo não deixa vender." | — |
| manter [ ] | manter [ ] (só quando marcado) | `title="Quantidade que fica na mochila"` |
| Vender agora (só os marcados) | Vender agora | "Salva a lista e vende os marcados." |

### Aba Treino

| Atual | Novo | Ajuda nova |
|---|---|---|
| Alerta de nível (vai para o webhook de nível) | **Nível do líder** | — |
| Avisar quando o líder chegar ao nível (0 = desligado): | Avisar no nível | placeholder "0 = desligado" · quando rota ligada: campo desabilitado com valor "da etapa atual (10)" |
| Ao atingir, trocar o líder pelo próximo do time abaixo do nível | Trocar de líder ao atingir (toggle) | "Põe como líder o próximo do time abaixo do nível. Um aviso por Pokémon." |
| (parágrafo: confere pelo time que o jogo manda...) | ajuda de 1 linha | "Se o líder já estiver no nível ao salvar, avisa e troca na hora." |
| Time (★ líder): ... | Time · ★ líder | inline: "★ Larvitar 12 · Pidgey 10" |
| (time ainda não lido — entre numa hunt ou clique em Atualizar time) | Time ainda não lido. [Atualizar time] | — |
| Atualizar time | Atualizar time | — |
| Rota de treino / Uma etapa por linha: hunt nível... | **Rota de treino** | "Uma etapa por linha: `hunt nível` (ex.: pidgey 10). Quando todo o time chega ao nível, troca para a próxima hunt." |
| Seguir a rota (o nível da etapa vira o alvo e a troca de líder fica ligada) | Seguir a rota (toggle) | "Liga a troca de líder e usa o nível da etapa atual." |
| (status da rota) | lista de etapas com ✔ / ▶ / vazio | — |
| Reiniciar rota (voltar à 1ª etapa) | Reiniciar rota (perigo, confirma no 2º clique) | "Volta à 1ª etapa." |

### Aba Sistema

| Atual | Novo | Ajuda nova |
|---|---|---|
| Recarga automática (o "⟳ Atualizar tudo" do PokeGrid, só neste painel) | **Recarga do painel** | status: "Próxima recarga em 43 min" / "Desligada" |
| Recarregar a página a cada [ ] a [ ] min (sorteado na faixa...) | Recarregar automaticamente (toggle) · A cada [60] a [90] min | "Sorteado na faixa. Segundo vazio = fixo." |
| (parágrafo de 4 linhas) | 1 linha + ⓘ | "Guarda a hunt e volta pra ela após recarregar. Espera venda, troca e captura terminarem." · ⓘ title com o resto (tela pode seguir mostrando a cidade) |
| Recarregar agora (guarda a hunt e volta) | Recarregar agora | — |
| Copiar log | Copiar log | "Últimos 40 eventos, sem webhooks. Cole para quem for diagnosticar." |
| Exportar config | Exportar config | "Copia a config inteira, com os canais." |
| Importar config | Importar config | — |
| Cole aqui a config exportada | Cole a config exportada | — |
| Manter os webhooks deste painel (importar só o resto) | Manter os canais deste painel | — |
| Aplicar config importada | Aplicar | — |
| Debug (log no console) | Debug no console (toggle) | — |
| — | linha: "v3.x · socket do jogo ● rastreado / ○ não" | — |

### Mensagens de feedback (rodapé)

| Atual | Novo |
|---|---|
| ✔ Salvo! | ✔ Salvo |
| ✔ Salvo! Compra automática com limite 0: compra só quando a bola ACABAR; defina um limite para comprar antes. | ✔ Salvo · ⚠ Compra com limite 0: só compra quando a bola acabar. |
| ✔ Salvo! Conferindo o time para o nível 15 (com troca) — etapa 2/4... | ✔ Salvo · conferindo o time para o nível 15… |
| ⚠ Linhas ignoradas na rota (use "hunt nível"): ... | ⚠ Rota: 2 linhas ignoradas (formato `hunt nível`): "pidgey", "10 larvitar" |
| ⚠ Preencha o webhook principal primeiro. | ⚠ Preencha o canal de Capturas primeiro. |
| 📤 Teste enviado para: capturas, shinys. | ✔ Teste enviado: capturas, shinys |
| 📋 Log copiado (cole para quem for diagnosticar). | ✔ Log copiado |
| 📤 Config copiada. Abra o 🔔 na outra conta, clique em Importar e cole. Atenção: inclui os webhooks. | ✔ Config copiada (inclui os canais). Na outra conta: Sistema → Importar. |
| ⚠ Isso não é uma config válida (JSON inválido). | ✖ Não é uma config válida. |
| 💰 Vendeu 12 itens por 3.000 gold. | ✔ Vendeu 12 itens · +3.000 gold |
| ⚠ Não vendeu: motivo | ✖ Não vendeu: motivo |
| ⚠ Socket do jogo ainda não rastreado. | ✖ Sem socket do jogo ainda. Recarregue o painel. |
| ↩ Rota reiniciada: ... | ✔ Rota reiniciada · etapa 1 de 4 (pidgey 10) |

---

## 6. Plano de implementação (uma versão publicável por fase)

Invariantes em todas as fases: **nenhum id `#pg-dn-*` muda**, `DEFAULTS`/chaves de `cfg` não
mudam, `fill()`/`save` continuam lendo os mesmos elementos, `node --check` + os 3 testes
passam, `@version` bumpa. A nova chave `pgDiscordNotifyUi` (aba ativa, estado colapsado dos
canais) fica separada de `pgDiscordNotifyCfg` para não entrar no Exportar/Importar.

### Fase 1 — v3.5.0 · Fundação visual (esforço baixo, impacto médio)

- Injetar `<style id="pg-dn-style">` com os tokens e as classes `.dn-*`; trocar os estilos
  inline por classes (o HTML fica ~40% menor).
- Painel com largura 380, altura fixa `min(520px, 100vh - 70px)`, contêiner flex com
  cabeçalho (título + ✕) e rodapé sticky contendo `#pg-dn-msg` + Testar + Salvar.
- Escala de espaçamento e altura mínima 28 px em inputs/botões; `#777` → `--dn-dim`.
- Estilo `--danger` em "Reiniciar rota"; `Esc` fecha.
- Sem mudar ordem nem texto: risco quase zero, e já resolve "Salvar no fim do scroll".

### Fase 2 — v3.6.0 · Abas e reagrupamento (esforço médio, impacto alto)

- Barra de abas; mover os blocos existentes para as 5 abas conforme a seção 2 (menção e
  cooldown → Avisos; recarga, debug, log, exportar/importar → Sistema).
- Aba ativa lembrada em `pgDiscordNotifyUi.tab`; aba Avisos por padrão sem webhook.
- Cabeçalho ganha os 5 pontos de estado; badge por aba calculado de `cfg` + estado ao vivo
  (função `moduleState(tab) → 'on'|'off'|'warn'`), recalculado em `fill()`, no Salvar e nos
  `on*Change`.
- Botão 🔔 com ponto de estado e `title=` resumo (substitui `flashButton`; manter a função
  como no-op ou para o ponto vermelho pulsante).

### Fase 3 — v3.7.0 · Copy, estados vazios e feedback (esforço baixo, impacto médio)

- Aplicar a tabela da seção 5 (rótulos, placeholders, ajudas de 1 linha, `.dn-help`).
- Frase gerada do filtro de qualidade (`qualityRuleText(cfg)`), atualizada ao mudar select/inputs.
- Estados vazios com a ação inline (Atualizar time dentro da mensagem de "time não lido").
- Rodapé de status por tipo (ok/info/aviso/erro) via `flash(msg, {kind})`; aviso/erro
  persistem até o próximo clique. Mensagens reescritas.
- Bloco "Canais do Discord" colapsável (aberto quando `webhookUrl` vazio).

### Fase 4 — v3.8.0 · Controles (esforço médio, impacto médio)

- Toggles (`.dn-toggle`) nos 8 liga/desliga; checkbox só na lista de venda.
- Linha de item de venda em grid, "manter" só quando marcado, linha clicável, hover.
- Lista de etapas da rota com ✔/▶ e validação ao digitar (linha inválida em vermelho).
- Campo "Avisar no nível" desabilitado com valor da etapa quando a rota está ligada.
- Indicador "● Alterações não salvas" + ponto amarelo no 🔔 + não chamar `fill()` ao reabrir sujo;
  Enter = Salvar; confirmação em 2 cliques no Reiniciar rota.
- Corrigir "Testar" para não alterar `cfg` sem salvar.
- **Remover a reserva de gold (decisão do usuário, 24/09/2026), UI e lógica juntas**: tirar
  `autoBuyGoldReserve` de `DEFAULTS`, o input `#pg-dn-autobuy-reserve` e suas linhas em `fill()`/Salvar;
  em `buyBalls()` apagar `reserve` e trocar a checagem por `gold < price * batch` (a mensagem de
  "gold insuficiente" passa a citar só o custo do lote). Configs antigas com a chave seguem carregando;
  opcionalmente `delete saved.autoBuyGoldReserve` em `loadCfg()`. Pode entrar já na fase 1 ou 2, na
  primeira versão que tocar a aba Bolas.

### Fase 5 — v3.9.0 · Refino (opcional, esforço baixo)

- Status ao vivo extra: estoque atual da bola em Bolas, "próxima venda em X min",
  "socket rastreado" em Sistema.
- Atalho `Ctrl+Shift+N` para abrir/fechar o painel (útil com 4 webviews).
- Painel "minimizado": cabeçalho só com os 5 pontos, para deixar visível sem cobrir o jogo.

Ordem sugerida: 1 → 2 → 3 → 4. A fase 1 é preparação para a 2; a 3 pode vir antes da 2 se o
usuário quiser só aliviar a leitura sem ainda mudar a estrutura.
