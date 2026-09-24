// ==UserScript==
// @name         PIW Discord Capture Notify
// @namespace    piw-discord-notify
// @version      3.5.1
// @author       Gesuato
// @description  Notifica um webhook do Discord quando você captura um Pokémon (todos, uma lista ou shinys) no Poke Idle World. Feito para o injetor de scripts do PokeGrid.
// @match        https://poke.idleworld.online/play
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const TAG = '[PIW-DiscordNotify]';
    const VERSION = '3.5.1';        // manter igual ao @version do cabeçalho
    const LS_KEY = 'pgDiscordNotifyCfg';

    // ---- Configuração (persistida no localStorage do painel) --------
    // Clique no botão 🔔 no canto inferior esquerdo do jogo para
    // configurar webhook, lista de Pokémon, shiny etc.

    const DEFAULTS = {
        webhookUrl: '',         // canal principal (capturas); os outros caem nele se vazios
        webhookShiny: '',       // canal só para capturas shiny (opcional)
        webhookAlerts: '',      // canal para alertas: shiny na fila, estoque, quedas... (opcional)
        webhookLevel: '',       // canal para alertas de nível (vazio: alertas; vazio: principal)
        watchList: [],          // nomes em minúsculas, ex.: ['dratini', 'larvitar']
        notifyEveryCapture: false,
        notifyShiny: true,
        minTier: '',            // raridade mínima ('' = sem filtro): weak, common, ... divine
        minIv: 0,               // poder mínimo (ivTotal 0..192); 0 = sem filtro
        minTierIv: 0,           // poder mínimo exigido TAMBÉM de quem passa pela raridade; 0 = qualquer poder
        ballsMin: 0,            // alerta quando a bola monitorada ficar abaixo disto; 0 = desligado
        ballsWatch: 'auto',     // 'auto' = bola do último catch-result, ou o id da bola ('4')
        autoBuy: false,         // comprar a bola monitorada quando ficar abaixo do limite
        autoBuyQty: 100,        // quantas comprar por vez (1..10000)
        sellEnabled: false,     // vender drops marcados da hunt atual periodicamente
        sellEveryMin: 10,       // intervalo mínimo da venda automática (minutos)
        sellEveryMaxMin: 0,     // intervalo máximo; 0 ou <= mínimo = intervalo fixo. Entre os dois é sorteado
        sellItems: {},          // lista BRANCA: itemId -> { keep: N } (manter pelo menos N)
        sellProfiles: {},       // por hunt: slug -> { items, everyMin, everyMaxMin } (carregado ao entrar)
        levelAlertAt: 0,        // avisar quando o líder chegar a este nível; 0 = desligado
        levelSwap: false,       // ao atingir, trocar o líder pelo próximo do time abaixo do nível
        routeEnabled: false,    // seguir a rota de treino (etapas hunt + nível); implica levelSwap
        route: [],              // [{ slug, level }] em ordem
        routeStage: 0,          // índice da etapa atual (persistido; >= route.length = concluída)
        reloadEnabled: false,   // recarregar este painel sozinho (igual ao "⟳ Atualizar tudo" do PokeGrid)
        reloadEveryMin: 60,     // intervalo mínimo da recarga (minutos)
        reloadEveryMaxMin: 0,   // intervalo máximo; 0 ou <= mínimo = fixo. Entre os dois é sorteado
        mentionUserId: '',      // seu ID de usuário do Discord, opcional
        cooldownSeconds: 0,     // intervalo mínimo (s) entre avisos do mesmo pokémon; 0 = avisar todas
        cfgVersion: 2,
        debug: false,
    };

    function loadCfg() {
        let saved = {};
        try { saved = JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {}; } catch { saved = {}; }
        // Até a v2.1.0 o cooldown era fixo em 30s e não aparecia no painel; ao migrar,
        // descarta esse valor herdado para valer o novo padrão (0 = avisar todas).
        if (!saved.cfgVersion || saved.cfgVersion < 2) delete saved.cooldownSeconds;
        delete saved.autoBuyGoldReserve; // reserva de gold removida na v3.5.0 (a pedido do usuário)
        return Object.assign({}, DEFAULTS, saved);
    }
    function saveCfg(cfg) {
        localStorage.setItem(LS_KEY, JSON.stringify(cfg));
    }
    let cfg = loadCfg();

    const lastNotifyAt = new Map(); // nome -> timestamp

    // ---- Utilidades -------------------------------------------------

    function normalize(name) {
        return String(name || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '')
            .trim();
    }

    function playerName() {
        // mesmo caminho que o PokeGrid usa para nomear as abas
        try { return (window.__poke?.api?.['/api/characters/me']?.character?.name || '').trim(); }
        catch { return ''; }
    }

    // ---- Formato das mensagens do jogo (confirmado) ------------------
    //
    //   pending      -> { type:'pending', list:[{ id, pokeId, name, level, shiny, at }] }
    //                   fila de Pokémon capturáveis; chega a cada abate.
    //   catch-result -> { type:'catch-result', success, speciesName, shiny, ballName,
    //                     pendingId?, auto? }   (auto:true = autocatch VIP)
    //
    // O catch-result NÃO traz o nível; por isso guardamos a última fila
    // `pending` e cruzamos pelo pendingId (ou pelo nome) para completar.

    const pendingById = new Map();   // pendingId -> { name, level, shiny }
    const pendingByName = new Map(); // nome normalizado -> { name, level, shiny }

    function rememberPending(list) {
        pendingById.clear();
        pendingByName.clear();
        for (const p of list) {
            if (!p || typeof p !== 'object') continue;
            const entry = { name: p.name, level: p.level ?? null, shiny: Boolean(p.shiny) };
            if (p.id != null) pendingById.set(String(p.id), entry);
            if (p.name) pendingByName.set(normalize(p.name), entry);
        }
    }

    function extractPokemonInfo(message) {
        const name = message.speciesName || message.name || message.pokemon?.name || message.poke?.name;
        if (!name || typeof name !== 'string') return null;
        const fromPending =
            (message.pendingId != null && pendingById.get(String(message.pendingId))) ||
            pendingByName.get(normalize(name)) || null;
        return {
            name,
            shiny: Boolean(message.shiny || fromPending?.shiny),
            level: message.level ?? fromPending?.level ?? null,
            ball: message.ballName || null,
            auto: message.auto === true,
        };
    }

    // ---- IV e qualidade do indivíduo capturado -----------------------
    //
    // O catch-result não traz IV/qualidade. Logo após a captura o jogo manda
    // `poke-delta` com o indivíduo completo (confirmado em 23/09/2026):
    //   { type:'poke-delta', poke:{ id, speciesId, name, level, shiny, xp:0,
    //     ivTotal (0..192), quality, power, stats{...}, type1, type2, ... } }
    // Estratégia: ao capturar, esperamos até DETAILS_TIMEOUT_MS pelo
    // poke-delta. Como plano B (caso o delta venha sem ivTotal/quality),
    // pedimos `pokes-get` e procuramos o recém-capturado na lista `pokes`.
    // Se nada chegar a tempo, a notificação sai sem esses campos.
    //
    // Tabela oficial de faixas (poke.idleworld.online/pokepedia/systems/quality):
    //   <1.0 Weak · 1.0 Common · 1.1 Uncommon · 1.3 Rare · 1.5 Epic
    //   1.7 Legendary · 2.0 Mythic · 3.0 Ancient · 4.0 Divine

    const IV_MAX = 192; // 32 por atributo, 6 atributos
    const DETAILS_TIMEOUT_MS = 4000;
    // Do mais raro ao mais fraco; `rank` cresce com a raridade.
    const TIERS = [
        [4.0, 'Divine', 0xf1f5f9], [3.0, 'Ancient', 0xfb923c], [2.0, 'Mythic', 0xe879f9],
        [1.7, 'Legendary', 0xfbbf24], [1.5, 'Epic', 0xf472b6], [1.3, 'Rare', 0xa78bfa],
        [1.1, 'Uncommon', 0x38bdf8], [1.0, 'Common', 0x4ade80], [-Infinity, 'Weak', 0x9aa4b2],
    ].map(([min, name, color], i, arr) => ({ min, name, key: name.toLowerCase(), color, rank: arr.length - 1 - i }));
    const TIERS_ASC = [...TIERS].reverse(); // Weak .. Divine (ordem do <select>)

    function qualityTier(q) {
        if (typeof q !== 'number' || !Number.isFinite(q)) return null;
        return TIERS.find(t => q >= t.min);
    }
    function tierByKey(key) {
        return TIERS.find(t => t.key === String(key || '').toLowerCase()) || null;
    }

    // Filtro de raridade/poder (cfg.minTier / cfg.minTierIv / cfg.minIv). Regra:
    //   - nenhum configurado                                  -> passa tudo;
    //   - raridade >= mínima E poder >= minTierIv (0 = qualquer) -> passa (v3.4.1: antes bastava a raridade);
    //   - senão, poder (ivTotal) >= minIv                     -> passa;
    //   - sem dados de qualidade (timeout)                    -> passa, para não perder um raro.
    function passesQualityFilter(info) {
        const minTier = tierByKey(cfg.minTier);
        const minIv = Number(cfg.minIv) || 0;
        if (!minTier && minIv <= 0) return { ok: true, motivo: 'sem filtro de qualidade' };
        const tier = qualityTier(info.quality);
        if (tier == null && info.ivTotal == null) return { ok: true, motivo: 'sem dados de qualidade' };
        const tierIv = Number(cfg.minTierIv) || 0;
        if (minTier && tier && tier.rank >= minTier.rank) {
            if (tierIv <= 0 || info.ivTotal == null || info.ivTotal >= tierIv) return { ok: true, motivo: `raridade ${tier.name} >= ${minTier.name}${tierIv > 0 ? ` com poder ${info.ivTotal ?? '?'} >= ${tierIv}` : ''}` };
            // raridade ok mas poder abaixo do exigido para ela: ainda pode passar pelo poder geral (minIv)
        }
        if (minIv > 0 && info.ivTotal != null && info.ivTotal >= minIv) return { ok: true, motivo: `poder ${info.ivTotal} >= ${minIv}` };
        return { ok: false, motivo: `abaixo do mínimo (raridade ${tier ? tier.name : '?'}, poder ${info.ivTotal ?? '?'}${minTier && tier && tier.rank >= minTier.rank ? ` < ${tierIv} exigido para ${minTier.name}+` : ''})` };
    }

    let lastSocket = null;          // socket mais recente do jogo (para pokes-get)
    const awaitingDetails = [];     // capturas esperando poke-delta / pokes

    function num(v) { return (typeof v === 'number' && Number.isFinite(v)) ? v : null; }

    function applyPokeDetails(entry, p) {
        if (!p || typeof p !== 'object') return false;
        const info = entry.info;
        if (num(p.ivTotal) != null) info.ivTotal = p.ivTotal;
        if (num(p.quality) != null) info.quality = p.quality;
        if (num(p.level) != null && info.level == null) info.level = p.level;
        if (p.id != null) entry.pokeId = String(p.id);
        return info.ivTotal != null || info.quality != null;
    }

    function finishDetails(entry) {
        clearTimeout(entry.timer);
        const i = awaitingDetails.indexOf(entry);
        if (i >= 0) awaitingDetails.splice(i, 1);
        entry.resolve(entry.info);
    }

    function sendGame(obj) {
        try {
            if (lastSocket && lastSocket.readyState === 1) {
                lastSocket.send(JSON.stringify(obj));
                return true;
            }
        } catch (err) { console.warn(TAG, 'Falha ao enviar ao jogo:', err); }
        return false;
    }

    function requestPokesOnce(entry) {
        if (entry.askedPokes) return;
        entry.askedPokes = true;
        logEvent('pokes-get', { name: entry.info.name, enviado: sendGame({ type: 'pokes-get' }) });
    }

    // Devolve uma Promise com `info` completado (ou não) com ivTotal/quality.
    function withDetails(info) {
        return new Promise((resolve) => {
            const entry = { info, resolve, pokeId: null, askedPokes: false, timer: null };
            entry.timer = setTimeout(() => {
                logEvent('detalhes-timeout', { name: info.name });
                finishDetails(entry);
            }, DETAILS_TIMEOUT_MS);
            awaitingDetails.push(entry);
        });
    }

    function sameSpecies(entry, p) {
        const n = p?.name || p?.speciesName;
        return !n || normalize(n) === normalize(entry.info.name);
    }

    function handlePokeDelta(message) {
        const poke = message.poke || message;
        logEvent('poke-delta', message);
        const entry = awaitingDetails.find(e => sameSpecies(e, poke)) || awaitingDetails[0];
        if (!entry) return;
        if (applyPokeDetails(entry, poke)) finishDetails(entry);
        else requestPokesOnce(entry);
    }

    function handlePokesList(list) {
        if (!awaitingDetails.length) return;
        for (const entry of [...awaitingDetails]) {
            let match = entry.pokeId != null ? list.find(p => String(p?.id) === entry.pokeId) : null;
            if (!match) {
                const same = list.filter(p => p && sameSpecies(entry, p) && p.name);
                match = same.find(p => p.xp === 0) || same.find(p => p.xp == null) || null;
            }
            logEvent('pokes', { name: entry.info.name, total: list.length, achou: match ? { id: match.id, ivTotal: match.ivTotal, quality: match.quality, level: match.level } : null });
            if (match) applyPokeDetails(entry, match);
            finishDetails(entry);
        }
    }

    // ---- Alerta de nível do líder + troca automática de líder --------------
    //   pokes       -> { type:'pokes', list:[{ id, name, level, team, slot, leader, shiny, ... }] }
    //                  (resposta a pokes-get). Time = team:true ordenado por slot; líder = leader:true
    //                  (ou o 1º do time). Fonte: piwdex sessao.ts (case 'pokes').
    //   poke-xp     -> { type:'poke-xp', id, speciesId, xpGained, xp, level, leveledUp } a cada abate
    //                  (CONFIRMADO no log em 24/09/2026): `id` e `level` são do líder que ganhou o XP.
    //   field-kill  -> também traz `level` (líder) e `leveledUp` (piwdex).
    //   poke-summon -> { type:'poke-summon', pokeId } é o que o botão "⚔ summon" do painel de time do
    //                  próprio jogo envia (visto no bundle do cliente); o HUD bloqueia durante boss.
    //                  Confirmar com pokes-get ~500 ms depois (piwdex `trocarLider`).
    // Regra: poke-xp/field-kill só DISPARAM uma conferência (pokes-get); quem decide é o frame
    // `pokes` (nível do líder vindo da lista). Evita agir sobre um `level` mal interpretado.
    // Rota de treino (v3.3.0): cfg.route = [{ slug, level }]. Com routeEnabled, o alvo é o nível da etapa
    // atual (cfg.routeStage) e a troca de líder fica implícita. Quando TODOS do time estão no nível da
    // etapa, o script manda `leave-hunt`, depois `enter-hunt { slug }` + `pending-get` (como o piwdex
    // `cacar()` e o auto-reconnect) e avança a etapa (persistida). Entrada confirmada por `field`/
    // `field-init`; sem frame em 30 s tenta de novo uma vez e depois avisa.
    // Um alerta por líder (id) por nível alvo; o Set zera quando o alvo muda no Salvar. Quando um
    // Pokémon DEIXA de ser líder ele sai do Set: se voltar a ser líder (troca manual) acima do alvo,
    // avisa e troca de novo (v3.2.2). Quem quiser um líder acima do alvo desliga a troca.

    const POKES_POLL_MS = 5 * 60 * 1000;
    const POKES_AFTER_SOCKET_MS = 4000;
    const POKES_MIN_GAP_MS = 3000;
    const SWAP_CONFIRM_MS = 800;
    const SWAP_TIMEOUT_MS = 15000;
    const HUNT_ENTER_DELAY_MS = 600;
    const HUNT_CONFIRM_MS = 30000;

    let team = [];                  // [{ id, name, level, slot, leader, shiny }] ordenado por slot
    let teamSig = '';               // assinatura do último time logado (evita log repetido)
    let leaderLevelSeen = null;     // último nível do líder visto em poke-xp/field-kill
    let pokeXpLogged = 0;
    let lastPokesReqAt = 0;
    let pokesRequestTimer = null;
    const levelAlerted = new Set(); // ids de líderes já avisados para o alvo atual
    let swapPending = null;         // { fromId, toId, toName, at } aguardando confirmação no `pokes`
    let lastLeaderId = null;        // líder do último `pokes` (para rearmar quem deixou de ser líder)
    let lastFieldAt = 0;            // último frame field/field-init (prova de que a hunt está viva)
    let huntSwitch = null;          // { slug, at, tries, timer } troca de hunt aguardando confirmação
    let onTeamChange = null;        // callback do painel para redesenhar o time

    function routeList() { return Array.isArray(cfg.route) ? cfg.route.filter(r => r && r.slug && Number(r.level) > 0) : []; }
    function routeActive() { return Boolean(cfg.routeEnabled) && routeList().length > 0 && (Number(cfg.routeStage) || 0) < routeList().length; }
    function routeStep() { return routeActive() ? routeList()[Number(cfg.routeStage) || 0] : null; }
    function levelTarget() {
        const st = routeStep();
        if (st) return Math.max(0, Number(st.level) || 0);
        return Math.max(0, Number(cfg.levelAlertAt) || 0);
    }
    function levelEnabled() { return levelTarget() > 0; }
    function swapEnabled() { return Boolean(cfg.levelSwap) || routeActive(); }
    function routeStatus() {
        const lista = routeList();
        if (!lista.length) return 'Sem rota.';
        const i = Number(cfg.routeStage) || 0;
        if (i >= lista.length) return `Rota concluída (${lista.length} etapas). "Reiniciar rota" para começar de novo.`;
        return `${cfg.routeEnabled ? 'Etapa' : 'Rota desligada — etapa'} ${i + 1}/${lista.length}: ${lista[i].slug} até lv ${lista[i].level}`;
    }

    function requestPokes(delayMs) {
        if (!levelEnabled()) return;
        clearTimeout(pokesRequestTimer);
        pokesRequestTimer = setTimeout(() => {
            pokesRequestTimer = null;
            if (Date.now() - lastPokesReqAt < POKES_MIN_GAP_MS) return;
            lastPokesReqAt = Date.now();
            sendGame({ type: 'pokes-get' });
        }, delayMs || 0);
    }

    function teamLeader() { return team.find(p => p.leader) || team[0] || null; }

    function teamLine() {
        const alvo = levelTarget();
        return team.map(p => `${p.leader ? '★ ' : ''}${p.shiny ? '✨' : ''}${p.name} lv ${p.level}${alvo && p.level >= alvo ? ' ✔' : ''}`).join('\n') || '(time vazio)';
    }

    // Sinal de nível vindo de poke-xp/field-kill: só dispara a conferência pelo `pokes`.
    function noteLeaderLevel(level, fonte, leveledUp, pokeId) {
        if (!Number.isFinite(level)) return;
        const antes = leaderLevelSeen;
        leaderLevelSeen = level;
        if (!levelEnabled()) return;
        const lider = teamLeader();
        if (pokeId && lider && lider.id && pokeId !== lider.id) { requestPokes(0); return; } // time desatualizado
        if (lider && lider.id && levelAlerted.has(lider.id)) return;
        if (level >= levelTarget() || leveledUp || (antes != null && level > antes)) requestPokes(0);
    }

    function updateTeam(list) {
        const novo = list
            .filter(p => p && typeof p === 'object' && p.team)
            .map(p => ({ id: String(p.id ?? ''), name: String(p.name || p.speciesName || '?'), level: Number(p.level) || 0, slot: Number(p.slot) || 0, leader: Boolean(p.leader), shiny: Boolean(p.shiny) }))
            .sort((a, b) => a.slot - b.slot);
        team = novo;
        const sig = novo.map(p => `${p.id}:${p.level}:${p.leader ? 1 : 0}`).join('|');
        if (sig !== teamSig) { teamSig = sig; logEvent('time', { time: novo.map(p => ({ name: p.name, level: p.level, slot: p.slot, leader: p.leader })) }); }
        if (onTeamChange) { try { onTeamChange(); } catch { /* painel fechado */ } }
        const liderId = teamLeader()?.id || null;
        if (lastLeaderId && liderId !== lastLeaderId) levelAlerted.delete(lastLeaderId); // deixou de ser líder: rearma
        lastLeaderId = liderId;
        checkSwapConfirm();
        checkLeaderLevel();
    }

    function checkSwapConfirm() {
        if (!swapPending) return;
        const lider = teamLeader();
        const who = playerName();
        if (lider && lider.id === swapPending.toId) {
            logEvent('troca-ok', { para: lider.name, level: lider.level });
            postWebhook('level', {
                content: `🔁 ${who ? `**${who}**` : 'Sua conta'}: agora o líder é **${lider.name}** (lv ${lider.level})`,
                username: 'Poke Idle World',
                embeds: [{ title: `Troca confirmada: ${lider.name}`, description: (who ? `Conta: ${who}\n` : '') + `Time:\n${teamLine()}\nEm ${new Date().toLocaleString('pt-BR')}`, color: 0x57f287 }],
            }, { evento: 'troca-ok', para: lider.id });
            swapPending = null;
        } else if (Date.now() - swapPending.at > SWAP_TIMEOUT_MS) {
            logEvent('troca-falhou', { para: swapPending.toName, liderAtual: lider?.name });
            postWebhook('level', {
                content: `⚠️ ${who ? `**${who}**` : 'Sua conta'}: a troca para **${swapPending.toName}** não confirmou (líder ainda é ${lider?.name || '?'})`,
                username: 'Poke Idle World',
                embeds: [{ title: 'Troca de líder não confirmada', description: (who ? `Conta: ${who}\n` : '') + 'O jogo não mudou o líder após poke-summon. Troque na mão e confira o log.', color: 0xed4245 }],
            }, { evento: 'troca-falhou' });
            swapPending = null;
        } else {
            requestPokes(SWAP_CONFIRM_MS); // ainda esperando: confere de novo
        }
    }

    function checkLeaderLevel() {
        if (!levelEnabled() || swapPending) return;
        const alvo = levelTarget();
        const lider = teamLeader();
        if (!lider || !lider.id || lider.level < alvo || levelAlerted.has(lider.id)) return;
        levelAlerted.add(lider.id);
        const who = playerName();
        const mention = cfg.mentionUserId ? `<@${cfg.mentionUserId}> ` : '';
        const conta = who ? `Conta: ${who}\n` : '';
        const swap = swapEnabled();
        const proximo = swap ? team.find(p => p.id !== lider.id && p.level < alvo) || null : null;
        const faltam = team.filter(p => p.id !== lider.id && p.level < alvo).length;
        const etapa = routeStep();
        const proxEtapa = etapa ? routeList()[(Number(cfg.routeStage) || 0) + 1] || null : null;
        let acao;
        if (!swap) acao = faltam ? `Troca automática desligada; ${faltam} do time ainda abaixo de ${alvo}.` : 'Todos do time já estão no nível.';
        else if (proximo) acao = `Trocando o líder para **${proximo.name}** (lv ${proximo.level})...`;
        else if (etapa && proxEtapa) acao = `🏁 Etapa ${(Number(cfg.routeStage) || 0) + 1} concluída (${etapa.slug}, lv ${etapa.level}). Indo para **${proxEtapa.slug}** até lv ${proxEtapa.level}...`;
        else if (etapa) acao = `🏁 Rota concluída: todos do time no nível ${alvo} (última etapa: ${etapa.slug}).`;
        else acao = `🏁 Todos do time já estão no nível ${alvo}. Nada mais para trocar.`;
        logEvent('nivel', { lider: lider.name, level: lider.level, alvo, proximo: proximo?.name || null, swap, etapa: etapa ? (Number(cfg.routeStage) || 0) + 1 : null });
        postWebhook('level', {
            content: `${mention}🎯 ${who ? `**${who}**` : 'Sua conta'}: **${lider.name}** chegou ao nível **${lider.level}**${lider.level > alvo ? ` (alvo ${alvo})` : ''}`,
            username: 'Poke Idle World',
            embeds: [{
                title: `Nível ${alvo} atingido: ${lider.name}`,
                description: conta + acao + `\n\nTime:\n${teamLine()}\nEm ${new Date().toLocaleString('pt-BR')}`,
                color: proximo ? 0x5865f2 : 0x57f287,
            }],
        }, { evento: 'nivel', lider: lider.id, level: lider.level });
        if (proximo) {
            const enviado = sendGame({ type: 'poke-summon', pokeId: proximo.id });
            logEvent('troca', { de: lider.name, para: proximo.name, enviado });
            if (enviado) { swapPending = { fromId: lider.id, toId: proximo.id, toName: proximo.name, at: Date.now() }; requestPokes(SWAP_CONFIRM_MS); }
        } else if (etapa) {
            advanceRoute();
        }
    }

    // Todos do time no nível da etapa: avança (persistido) e troca de hunt se houver próxima etapa.
    function advanceRoute() {
        const lista = routeList();
        const i = Number(cfg.routeStage) || 0;
        const proxima = lista[i + 1] || null;
        cfg.routeStage = i + 1;
        saveCfg(cfg);
        levelAlerted.clear();
        swapPending = null;
        logEvent('rota', { etapaConcluida: i + 1, proxima: proxima ? proxima.slug : null });
        if (onTeamChange) { try { onTeamChange(); } catch { /* painel fechado */ } }
        if (proxima) switchHunt(proxima.slug, 1);
        else requestPokes(POKES_MIN_GAP_MS); // rota acabou: só atualiza o painel
    }

    // origem: 'rota' (padrão) ou 'recarga' (volta para a hunt depois da recarga automática; a conta
    // já está na cidade, então não manda leave-hunt e o aviso de falha vai para o webhook de alertas).
    function switchHunt(slug, tentativa, origem) {
        origem = origem || 'rota';
        if (huntSwitch?.timer) clearTimeout(huntSwitch.timer);
        if (origem !== 'recarga') sendGame({ type: 'leave-hunt' });
        huntSwitch = { slug, at: 0, tries: tentativa, timer: null, origem };
        huntSwitch.timer = setTimeout(() => {
            if (!huntSwitch || huntSwitch.slug !== slug) return;
            huntSwitch.at = Date.now();
            const ok = sendGame({ type: 'enter-hunt', slug }) && sendGame({ type: 'pending-get' });
            logEvent('hunt-troca', { slug, tentativa, origem, enviado: ok });
            huntSwitch.timer = setTimeout(() => confirmHuntSwitch(slug), HUNT_CONFIRM_MS);
        }, HUNT_ENTER_DELAY_MS);
    }

    function confirmHuntSwitch(slug) {
        if (!huntSwitch || huntSwitch.slug !== slug) return;
        const who = playerName();
        if (lastFieldAt >= huntSwitch.at) {
            logEvent('hunt-ok', { slug });
            huntSwitch = null;
            requestPokes(0);
            return;
        }
        const origem = huntSwitch.origem || 'rota';
        if (huntSwitch.tries < 2) { switchHunt(slug, huntSwitch.tries + 1, origem); return; }
        logEvent('hunt-falhou', { slug, origem });
        huntSwitch = null;
        const recarga = origem === 'recarga';
        postWebhook(recarga ? 'alert' : 'level', {
            content: `⚠️ ${who ? `**${who}**` : 'Sua conta'}: não consegui ${recarga ? 'voltar para a' : 'entrar na'} hunt **${slug}** (${recarga ? 'depois da recarga automática' : 'rota'})`,
            username: 'Poke Idle World',
            embeds: [{
                title: recarga ? `Recarga: volta para ${slug} não confirmou` : `Rota: entrada em ${slug} não confirmou`,
                description: (who ? `Conta: ${who}\n` : '') + (recarga
                    ? 'Nenhum frame de combate chegou em 30 s após duas tentativas. A conta deve estar na cidade: entre na hunt na mão.'
                    : 'Nenhum frame de combate chegou em 30 s após duas tentativas. Confira o nome da hunt (é o mesmo que aparece em "Hunt atual") e entre na mão; a rota continua da etapa atual.'),
                color: 0xed4245,
            }],
        }, { evento: 'hunt-falhou', slug, origem });
    }

    function handlePokeXp(message) {
        if (pokeXpLogged < 3) { pokeXpLogged++; logEvent('poke-xp', message); }
        noteLeaderLevel(Number(message.level), 'poke-xp', Boolean(message.leveledUp), message.id != null ? String(message.id) : null);
    }

    // ---- Alerta de estoque de bolas -------------------------------------
    //
    //   balls     -> { type:'balls', counts:{ '<ballId>': qty, ... } }   (resposta a balls-get)
    //   balls-get -> pedido do cliente. O jogo não garante mandar `balls` sozinho,
    //                então pedimos: ao rastrear o socket, logo após cada captura e
    //                a cada BALLS_POLL_MS.
    // Avisa UMA vez quando a quantidade cruza para baixo de cfg.ballsMin e rearma
    // quando volta a ficar >= (compra/refil). ballsMin = 0 desliga o alerta, MAS se a
    // compra automática estiver ligada o limite efetivo vira 1 (compra quando acabar):
    // antes da v3.1.1 essa combinação desligava tudo em silêncio e a conta ficava sem bola.

    const BALL_NAMES = { 1: 'Poke Ball', 2: 'Great Ball', 3: 'Super Ball', 4: 'Ultra Ball', 6: 'Idle Ball' };
    const BALLS_POLL_MS = 5 * 60 * 1000;
    const BALLS_AFTER_CATCH_MS = 1500;
    const BALLS_AFTER_SOCKET_MS = 3000;

    let lastBallId = null;          // bola usada no último catch-result
    let ballCounts = {};            // ballId -> qty (último frame `balls`)
    const ballAlerted = {};         // ballId -> true enquanto estiver abaixo do limite
    let ballsRequestTimer = null;
    let onBallsChange = null;       // callback do painel para redesenhar o estoque

    function ballName(id) { return BALL_NAMES[id] || `Ball ${id}`; }
    // Limite efetivo: o configurado, ou 1 quando só a compra automática está ligada.
    function effectiveBallsMin() {
        const min = Number(cfg.ballsMin) || 0;
        if (min > 0) return min;
        return cfg.autoBuy ? 1 : 0;
    }
    function ballsEnabled() { return effectiveBallsMin() > 0; }

    function watchedBallId() {
        if (cfg.ballsWatch && cfg.ballsWatch !== 'auto') return Number(cfg.ballsWatch) || null;
        return lastBallId;
    }

    function requestBalls(delayMs) {
        if (!ballsEnabled()) return;
        clearTimeout(ballsRequestTimer);
        ballsRequestTimer = setTimeout(() => {
            ballsRequestTimer = null;
            sendGame({ type: 'balls-get' });
        }, delayMs || 0);
    }

    function handleBalls(message) {
        const counts = {};
        for (const [rawId, rawQty] of Object.entries(message.counts || {})) {
            const id = Number(rawId);
            if (Number.isInteger(id) && id > 0) counts[id] = Math.max(0, Number(rawQty) || 0);
        }
        ballCounts = counts;
        const id = watchedBallId();
        logEvent('balls', { counts, monitorando: id, limite: effectiveBallsMin(), autoBuy: Boolean(cfg.autoBuy) });
        checkBallStock();
        if (onBallsChange) { try { onBallsChange(); } catch { /* painel fechado */ } }
    }

    // ---- Compra automática (REST, mesma API que o jogo usa) --------------
    //   tokens : sessionStorage['pokeweb:tokens'] = { accessToken, refreshToken }
    //   loja   : GET  /api/game/shop      -> { gold, balls:[{ id, name, priceGold }], items:[...] }
    //   compra : POST /api/game/shop/buy  { ballId, qty } -> { ok?, bought, gold }
    //   401    : POST /api/auth/refresh   { refreshToken } -> tokens novos
    // Lotes de no máximo 1000 por request. Uma tentativa por episódio de estoque
    // baixo; rearma quando o estoque volta acima do limite (ou ao Salvar).
    // NUNCA logar os tokens.

    const GAME_TOKENS_KEY = 'pokeweb:tokens';
    const SHOP_URL = '/api/game/shop';
    const SHOP_BUY_URL = '/api/game/shop/buy';
    const AUTH_REFRESH_URL = '/api/auth/refresh';
    const BUY_MAX_QTY = 10000;
    const BUY_BATCH_QTY = 1000;

    const autoBuyAttempted = {};    // ballId -> true após tentar comprar neste episódio
    let autoBuyRunning = false;

    function getGameTokens() {
        try { return JSON.parse(sessionStorage.getItem(GAME_TOKENS_KEY) || 'null'); }
        catch { return null; }
    }

    async function refreshGameToken() {
        const tokens = getGameTokens();
        if (!tokens?.refreshToken) return null;
        const res = await fetch(AUTH_REFRESH_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken: tokens.refreshToken }),
        });
        if (!res.ok) return null;
        const novo = await res.json().catch(() => null);
        if (!novo?.accessToken) return null;
        try { sessionStorage.setItem(GAME_TOKENS_KEY, JSON.stringify(novo)); } catch { /* ignora */ }
        return novo.accessToken;
    }

    async function gameApi(url, options) {
        const opts = options || {};
        const send = (token) => fetch(url, Object.assign({}, opts, {
            headers: Object.assign(
                {},
                opts.body ? { 'Content-Type': 'application/json' } : {},
                token ? { Authorization: `Bearer ${token}` } : {},
                opts.headers || {},
            ),
        }));
        let res = await send(getGameTokens()?.accessToken);
        if (res.status === 401) {
            const token = await refreshGameToken();
            if (token) res = await send(token);
        }
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body?.message || `HTTP ${res.status}`);
        return body;
    }

    // Compra `qty` da bola `id`. Devolve { ok, bought, spent, gold, motivo }.
    async function buyBalls(id, qty) {
        const shop = await gameApi(SHOP_URL);
        const product = (Array.isArray(shop?.balls) ? shop.balls : []).find(b => Number(b?.id) === Number(id));
        const price = Number(product?.priceGold);
        let gold = Number(shop?.gold);
        if (!product || !Number.isFinite(price) || price <= 0) return { ok: false, bought: 0, spent: 0, gold, motivo: 'bola não está à venda na loja' };
        if (!Number.isFinite(gold)) return { ok: false, bought: 0, spent: 0, gold: null, motivo: 'loja não informou o gold' };
        if (product.name) BALL_NAMES[Number(id)] = product.name;

        let remaining = Math.min(BUY_MAX_QTY, Math.max(1, Math.floor(Number(qty) || 0)));
        let bought = 0, spent = 0, motivo = null;
        while (remaining > 0) {
            const batch = Math.min(BUY_BATCH_QTY, remaining);
            if (gold < price * batch) {
                motivo = `gold insuficiente (tem ${gold.toLocaleString('pt-BR')}, precisa ${(price * batch).toLocaleString('pt-BR')})`;
                break;
            }
            let r;
            try { r = await gameApi(SHOP_BUY_URL, { method: 'POST', body: JSON.stringify({ ballId: Number(id), qty: batch }) }); }
            catch (err) { motivo = `erro na compra: ${err?.message || err}`; break; }
            const got = Math.max(0, Math.floor(Number(r?.bought) || 0));
            bought += Math.min(batch, got);
            spent += price * Math.min(batch, got);
            if (Number.isFinite(Number(r?.gold))) gold = Number(r.gold);
            if (r?.ok === false || got !== batch) { motivo = 'o jogo confirmou só parte do lote'; break; }
            remaining -= batch;
        }
        return { ok: remaining === 0, bought, spent, gold, motivo };
    }

    async function autoBuyBalls(id, qty, min) {
        if (autoBuyRunning) return;
        autoBuyRunning = true;
        const who = playerName();
        const mention = cfg.mentionUserId ? `<@${cfg.mentionUserId}> ` : '';
        const conta = who ? `Conta: ${who}\n` : '';
        let r;
        try { r = await buyBalls(id, cfg.autoBuyQty); }
        catch (err) { r = { ok: false, bought: 0, spent: 0, gold: null, motivo: `erro: ${err?.message || err}` }; }
        finally { autoBuyRunning = false; }
        logEvent('compra', { ballId: id, qtyAntes: qty, pedido: cfg.autoBuyQty, comprado: r.bought, gasto: r.spent, gold: r.gold, motivo: r.motivo });
        const goldTxt = r.gold != null ? `\nGold agora: ${Number(r.gold).toLocaleString('pt-BR')}` : '';
        if (r.bought > 0) {
            postWebhook('alert', {
                content: `${mention}🛒 ${who ? `**${who}**` : 'Sua conta'} comprou **${r.bought} ${ballName(id)}** (estava com ${qty})${r.ok ? '' : ' — compra parcial'}`,
                username: 'Poke Idle World',
                embeds: [{
                    title: `${r.ok ? 'Compra automática: ' : 'Compra parcial: '}${r.bought} ${ballName(id)}`,
                    description: conta + `Gasto: ${r.spent.toLocaleString('pt-BR')} gold` + goldTxt + (r.motivo ? `\nObs.: ${r.motivo}` : '') + `\nEm ${new Date().toLocaleString('pt-BR')}`,
                    color: r.ok ? 0x57f287 : 0xfee75c,
                }],
            }, { evento: 'compra', ballId: id, bought: r.bought });
        } else {
            postWebhook('alert', {
                content: `${mention}⚠️ ${who ? `**${who}**` : 'Sua conta'} está com pouca **${ballName(id)}** (${qty}) e a compra automática falhou`,
                username: 'Poke Idle World',
                embeds: [{
                    title: `Compra falhou: ${ballName(id)}`,
                    description: conta + `Restam ${qty} (limite ${min})\nMotivo: ${r.motivo || 'desconhecido'}` + goldTxt + `\nEm ${new Date().toLocaleString('pt-BR')}`,
                    color: 0xed4245,
                }],
            }, { evento: 'compra-falhou', ballId: id, qty });
        }
        requestBalls(1000); // confirma o estoque novo
    }

    // ---- Venda automática de drops da hunt atual ------------------------
    //   catálogo : GET /game/items.json (público) -> { items:[{ id, name, category, npcPrice, rare }] }
    //   mochila  : GET /api/game/depot            -> { inventory:[{ id, name, quantity, npcPrice, category }] }
    //   cadeados : GET /api/game/item/lock        -> { locked:[itemId, ...] }  (o jogo recusa o lote inteiro
    //                                                 se um item travado entrar nele)
    //   venda    : POST /api/game/shop/sell { items:[{ itemId, qty }] } -> { ok, soldCount, goldGained, gold }
    //   hunt     : `enter-hunt { slug }` / `leave-hunt` enviados pelo cliente; `field-kill` traz
    //              loot:[{ itemId, name, qty }] — é daí que sai a lista "o que cai nesta hunt".
    // Regras fixas (não configuráveis): nunca preço 0 (o NPC não compra) e nunca item com cadeado
    // do jogo (o lote inteiro seria recusado). Todo o resto é lista BRANCA por item + reserva: o
    // usuário escolhe; itens de outra categoria, raros ou com nome sensível só ganham um aviso ⚠️
    // na lista (a pedido do usuário, v3.1.0 — antes ficavam com 🔒 e não podiam ser marcados).

    const ITEMS_CATALOG_URL = '/game/items.json';
    const DEPOT_URL = '/api/game/depot';
    const LOCK_URL = '/api/game/item/lock';
    const SHOP_SELL_URL = '/api/game/shop/sell';
    const SELL_CHECK_MS = 60 * 1000;
    const PROTECTED_NAME = /pherom|feromon|stone|pedra/i;

    let huntSlug = null;
    const huntLoot = new Map();     // itemId -> { name, qty } (acumulado na hunt atual)
    let itemsCatalog = null;        // Map id -> item do catálogo
    let sellRunning = false;
    let lastSellAt = 0;
    let nextSellDelayMs = 0;        // sorteado a cada ciclo dentro de [sellEveryMin, sellEveryMaxMin]

    function sellIntervalRange() {
        const min = Math.max(1, Number(cfg.sellEveryMin) || 10);
        const max = Math.max(min, Number(cfg.sellEveryMaxMin) || 0);
        return { min, max };
    }
    function drawSellDelay() {
        const { min, max } = sellIntervalRange();
        const minutos = min + Math.random() * (max - min);
        nextSellDelayMs = Math.round(minutos * 60 * 1000);
        return nextSellDelayMs;
    }
    let onHuntLootChange = null;    // callback do painel para redesenhar a lista

    function loadItemsCatalog() {
        if (itemsCatalog) return Promise.resolve(itemsCatalog);
        return fetch(ITEMS_CATALOG_URL).then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
            .then(data => {
                const list = Array.isArray(data) ? data : data?.items;
                itemsCatalog = new Map((Array.isArray(list) ? list : []).map(i => [Number(i.id), i]));
                return itemsCatalog;
            })
            .catch(err => { logEvent('catalogo-erro', { erro: String(err?.message || err) }); return new Map(); });
    }

    // Motivo pelo qual um item NÃO pode ser vendido de jeito nenhum, ou null se pode.
    function protectedReason(item) {
        if (!item) return null;                       // fora do catálogo: a mochila ainda traz npcPrice
        if (!(Number(item.npcPrice) > 0)) return 'NPC não compra';
        return null;
    }

    // Aviso (não bloqueia) para itens que merecem atenção antes de marcar para venda.
    function sellWarning(item) {
        if (!item) return 'fora do catálogo';
        if (item.category && item.category !== 'loot') return `categoria ${item.category}`;
        if (item.rare === true) return 'raro';
        if (PROTECTED_NAME.test(String(item.name || ''))) return 'pedra/feromônio';
        return null;
    }

    // Perfil por hunt: ao entrar numa hunt com perfil salvo, os itens marcados e a faixa de
    // tempo daquela hunt viram os ativos. Salvar/Vender agora gravam o perfil da hunt atual.
    function hasHuntProfile() { return Boolean(huntSlug && cfg.sellProfiles && cfg.sellProfiles[huntSlug]); }

    function loadHuntProfile() {
        if (!huntSlug) return;
        const prof = cfg.sellProfiles?.[huntSlug];
        if (!prof) { logEvent('perfil', { slug: huntSlug, salvo: false }); return; }
        cfg.sellItems = Object.assign({}, prof.items || {});
        if (prof.everyMin) cfg.sellEveryMin = Math.max(1, Number(prof.everyMin) || 10);
        cfg.sellEveryMaxMin = Math.max(0, Number(prof.everyMaxMin) || 0);
        drawSellDelay();
        saveCfg(cfg);
        logEvent('perfil', { slug: huntSlug, salvo: true, itens: Object.keys(cfg.sellItems).length, faixa: [cfg.sellEveryMin, cfg.sellEveryMaxMin] });
    }

    function saveHuntProfile() {
        if (!huntSlug) return;
        if (!cfg.sellProfiles || typeof cfg.sellProfiles !== 'object') cfg.sellProfiles = {};
        cfg.sellProfiles[huntSlug] = {
            items: Object.assign({}, cfg.sellItems || {}),
            everyMin: cfg.sellEveryMin,
            everyMaxMin: cfg.sellEveryMaxMin || 0,
        };
    }

    function setHunt(slug) {
        const novo = slug ? String(slug) : null;
        if (novo === huntSlug) return;
        huntSlug = novo;
        huntLoot.clear();
        loadHuntProfile();
        logEvent('hunt', { slug: huntSlug });
        if (onHuntLootChange) onHuntLootChange();
    }

    function handleOutgoing(data) {
        if (typeof data !== 'string' || data[0] !== '{') return;
        let m;
        try { m = JSON.parse(data); } catch { return; }
        if (m?.type === 'enter-hunt') setHunt(m.slug);
        else if (m?.type === 'leave-hunt') setHunt(null);
        else if (m?.type === 'set-city') armResume(RESUME_AFTER_CITY_MS); // SPA montou na cidade: hora de voltar pra hunt
    }

    function handleFieldKill(message) {
        if (!Array.isArray(message.loot)) return;
        let novo = false;
        for (const l of message.loot) {
            const id = Number(l?.itemId);
            if (!Number.isInteger(id) || id <= 0) continue;
            const cur = huntLoot.get(id);
            if (cur) cur.qty += Number(l.qty) || 0;
            else { huntLoot.set(id, { name: String(l.name || `Item ${id}`), qty: Number(l.qty) || 0 }); novo = true; }
        }
        if (novo) { loadItemsCatalog(); if (onHuntLootChange) onHuntLootChange(); }
    }

    // Vende o excedente dos itens marcados que caem na hunt atual. `manual` ignora sellEnabled.
    async function runSellCycle(manual) {
        if (sellRunning) return { ok: false, motivo: 'venda já em andamento' };
        if (!manual && !cfg.sellEnabled) return { ok: false, motivo: 'desligada' };
        const wanted = Object.keys(cfg.sellItems || {}).map(Number).filter(id => huntLoot.has(id));
        if (!wanted.length) return { ok: false, motivo: huntSlug ? 'nenhum item marcado caiu nesta hunt' : 'fora de hunt' };
        sellRunning = true;
        lastSellAt = Date.now();
        drawSellDelay();
        const who = playerName();
        const conta = who ? `Conta: ${who}\n` : '';
        try {
            const catalog = await loadItemsCatalog();
            const depot = await gameApi(DEPOT_URL);
            const inventory = Array.isArray(depot?.inventory) ? depot.inventory : [];
            let locked = new Set();
            try { const lk = await gameApi(LOCK_URL); locked = new Set((Array.isArray(lk?.locked) ? lk.locked : []).map(Number)); }
            catch (err) { logEvent('cadeado-erro', { erro: String(err?.message || err) }); return { ok: false, motivo: 'não consegui ler os cadeados; venda cancelada por segurança' }; }

            const lote = [];
            for (const inv of inventory) {
                const id = Number(inv?.id);
                if (!wanted.includes(id)) continue;
                if (locked.has(id)) continue;
                const item = catalog.get(id) || inv;
                if (protectedReason(item)) continue;
                const keep = Math.max(0, Number(cfg.sellItems[id]?.keep) || 0);
                const qty = Math.floor(Number(inv.quantity) || 0) - keep;
                if (qty <= 0) continue;
                lote.push({ itemId: id, qty, name: inv.name || item.name || `Item ${id}`, price: Number(inv.npcPrice ?? item.npcPrice) || 0 });
            }
            if (!lote.length) { logEvent('venda-nada', { hunt: huntSlug, marcados: wanted }); return { ok: false, motivo: 'nada acima da reserva para vender' }; }

            const r = await gameApi(SHOP_SELL_URL, { method: 'POST', body: JSON.stringify({ items: lote.map(({ itemId, qty }) => ({ itemId, qty })) }) });
            const ok = r?.ok !== false;
            const ganho = Number.isFinite(Number(r?.goldGained)) ? Number(r.goldGained) : lote.reduce((a, i) => a + i.qty * i.price, 0);
            const gold = Number.isFinite(Number(r?.gold)) ? Number(r.gold) : null;
            const total = lote.reduce((a, i) => a + i.qty, 0);
            const lista = lote.map(i => `${i.qty}x ${i.name}`).join(', ');
            logEvent('venda', { hunt: huntSlug, itens: lote.map(i => ({ id: i.itemId, qty: i.qty })), ok, ganho, gold });
            postWebhook('alert', {
                content: `💰 ${who ? `**${who}**` : 'Sua conta'} vendeu **${total} ${total === 1 ? 'item' : 'itens'}** por **${ganho.toLocaleString('pt-BR')} gold**`,
                username: 'Poke Idle World',
                embeds: [{
                    title: `Venda automática${huntSlug ? ` (${huntSlug})` : ''}`,
                    description: conta + lista + (gold != null ? `\nGold agora: ${gold.toLocaleString('pt-BR')}` : '') + `\nEm ${new Date().toLocaleString('pt-BR')}`,
                    color: ok ? 0x57f287 : 0xfee75c,
                }],
            }, { evento: 'venda', total, ganho });
            return { ok, motivo: ok ? null : 'o jogo não confirmou a venda', total, ganho };
        } catch (err) {
            const motivo = String(err?.message || err);
            logEvent('venda-erro', { hunt: huntSlug, erro: motivo });
            postWebhook('alert', {
                content: `⚠️ ${who ? `**${who}**` : 'Sua conta'}: a venda automática falhou`,
                username: 'Poke Idle World',
                embeds: [{ title: 'Venda falhou', description: conta + `Motivo: ${motivo}\nEm ${new Date().toLocaleString('pt-BR')}`, color: 0xed4245 }],
            }, { evento: 'venda-falhou' });
            return { ok: false, motivo };
        } finally {
            sellRunning = false;
        }
    }

    function sellTick() {
        if (!cfg.sellEnabled) return;
        if (!nextSellDelayMs) drawSellDelay();
        if (Date.now() - lastSellAt < nextSellDelayMs) return;
        runSellCycle(false);
    }

    function checkBallStock() {
        if (!ballsEnabled()) return;
        const id = watchedBallId();
        if (id == null) return;                 // ainda não sabemos qual bola o autocatch usa
        const qty = ballCounts[id];
        if (qty == null) return;                // o jogo não listou essa bola
        const min = effectiveBallsMin();
        if (qty >= min) { ballAlerted[id] = false; autoBuyAttempted[id] = false; return; }
        if (cfg.autoBuy) {
            if (autoBuyAttempted[id]) return;   // uma tentativa por episódio
            autoBuyAttempted[id] = true;
            autoBuyBalls(id, qty, min);
            return;
        }
        if (ballAlerted[id]) return;            // já avisado; espera repor
        ballAlerted[id] = true;
        const who = playerName();
        const mention = cfg.mentionUserId ? `<@${cfg.mentionUserId}> ` : '';
        const acabou = qty === 0;
        postWebhook('alert', {
            content: `${mention}${acabou ? '🚫' : '⚠️'} ${who ? `**${who}**` : 'Sua conta'} ${acabou ? 'ficou SEM' : 'está com pouca'} **${ballName(id)}**${acabou ? '' : ` (${qty})`}`,
            username: 'Poke Idle World',
            embeds: [{
                title: `${acabou ? 'Acabou: ' : 'Estoque baixo: '}${ballName(id)}`,
                description: (who ? `Conta: ${who}\n` : '') + `Restam ${qty} (limite ${min})\nEm ${new Date().toLocaleString('pt-BR')}`,
                color: acabou ? 0xed4245 : 0xfee75c,
            }],
        }, { evento: 'bolas', ballId: id, qty });
    }

    // ---- Recarga automática do painel -------------------------------------
    // Faz o que o botão "⟳ Atualizar tudo" do PokeGrid faz (reload do webview), mas só neste painel e em
    // intervalo sorteado dentro de [reloadEveryMin, reloadEveryMaxMin] minutos. O PokeGrid injeta o script
    // de novo no dom-ready da carga nova, então o que importa é guardado em localStorage[RESUME_KEY] logo
    // antes do reload e lido na carga seguinte (só vale por RESUME_MAX_AGE_MS):
    //   - hunt atual: quem tira a conta da hunt no reload é a SPA do jogo, que nasce em Cerulean e manda
    //     `set-city` ao montar (comentário do "Voltar pra hunt" experimental do PokeGrid). O script espera
    //     esse `set-city` sair (ou 12 s do socket, se não vier) e, se nenhum `field`/`field-init` chegou,
    //     manda `enter-hunt { slug }` + `pending-get` pelo mesmo caminho da rota (switchHunt, origem
    //     'recarga'). Efeito conhecido: a tela pode seguir mostrando a cidade enquanto o servidor farma.
    //   - lastSellAt, avisos de bola e de nível já dados: para não vender/avisar de novo a cada recarga.
    // Não recarrega com venda, troca de hunt ou de líder em andamento nem com captura esperando poke-delta
    // (adia e tenta no tique seguinte; depois de RELOAD_POSTPONE_MAX_MS recarrega mesmo assim).

    const RESUME_KEY = 'pgDiscordNotifyResume';
    const RELOAD_CHECK_MS = 30 * 1000;
    const RELOAD_POSTPONE_MAX_MS = 10 * 60 * 1000;
    const RESUME_MAX_AGE_MS = 5 * 60 * 1000;
    const RESUME_AFTER_CITY_MS = 3000;
    const RESUME_AFTER_SOCKET_MS = 12000;
    const CITY_SLUGS = ['cerulean', 'pewter', 'viridian', 'cassino', 'arena_pvp'];

    let nextReloadAt = 0;           // quando recarregar (ms); 0 = ainda não sorteado
    let reloadDueSince = 0;         // desde quando a recarga está adiada por algo em andamento
    let resumeHunt = null;          // hunt guardada pela carga anterior, até ser reenviada
    let resumeTimer = null;
    let onReloadChange = null;      // callback do painel para redesenhar o status

    function reloadIntervalRange() {
        const min = Math.max(1, Number(cfg.reloadEveryMin) || 60);
        const max = Math.max(min, Number(cfg.reloadEveryMaxMin) || 0);
        return { min, max };
    }
    function scheduleReload() {
        reloadDueSince = 0;
        if (!cfg.reloadEnabled) { nextReloadAt = 0; return 0; }
        const { min, max } = reloadIntervalRange();
        const minutos = min + Math.random() * (max - min);
        nextReloadAt = Date.now() + Math.round(minutos * 60 * 1000);
        logEvent('recarga-agendada', { emMin: Math.round(minutos * 10) / 10 });
        if (onReloadChange) { try { onReloadChange(); } catch { /* painel fechado */ } }
        return nextReloadAt;
    }
    function reloadBusyReason() {
        if (sellRunning) return 'venda em andamento';
        if (huntSwitch) return 'troca de hunt em andamento';
        if (swapPending) return 'troca de líder em andamento';
        if (awaitingDetails.length) return 'captura aguardando detalhes';
        return null;
    }
    function reloadStatus() {
        if (!cfg.reloadEnabled) return 'desligada';
        if (!nextReloadAt) return 'agendando...';
        if (reloadDueSince) return `adiada (${reloadBusyReason() || 'aguardando'})`;
        const min = Math.max(0, Math.round((nextReloadAt - Date.now()) / 60000));
        const hora = new Date(nextReloadAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        return `próxima em ${min} min (${hora})`;
    }
    function doReload(motivo) {
        const rec = {
            at: Date.now(),
            slug: huntSlug,
            lastSellAt,
            ballAlerted: Object.assign({}, ballAlerted),
            autoBuyAttempted: Object.assign({}, autoBuyAttempted),
            levelAlerted: Array.from(levelAlerted),
        };
        try { localStorage.setItem(RESUME_KEY, JSON.stringify(rec)); } catch { /* sem espaço: recarrega mesmo assim */ }
        logEvent('recarga', { motivo, hunt: huntSlug, adiadaMin: reloadDueSince ? Math.round((Date.now() - reloadDueSince) / 60000) : 0 });
        location.reload();
    }
    function reloadTick() {
        if (!cfg.reloadEnabled) return;
        if (!nextReloadAt) { scheduleReload(); return; }
        if (Date.now() < nextReloadAt) return;
        const busy = reloadBusyReason();
        if (busy && (!reloadDueSince || Date.now() - reloadDueSince < RELOAD_POSTPONE_MAX_MS)) {
            if (!reloadDueSince) { reloadDueSince = Date.now(); logEvent('recarga-adiada', { motivo: busy }); }
            if (onReloadChange) { try { onReloadChange(); } catch { /* painel fechado */ } }
            return;
        }
        doReload('agendada');
    }

    // Carga nova: restaura o que a carga anterior guardou (se foi há pouco).
    function loadResume() {
        let rec = null;
        try { rec = JSON.parse(localStorage.getItem(RESUME_KEY) || 'null'); localStorage.removeItem(RESUME_KEY); } catch { rec = null; }
        if (!rec || typeof rec !== 'object') return;
        const idade = Date.now() - (Number(rec.at) || 0);
        if (idade < 0 || idade > RESUME_MAX_AGE_MS) { logEvent('recarga-ignorada', { idadeMin: Math.round(idade / 60000) }); return; }
        if (Number(rec.lastSellAt) > 0) lastSellAt = Number(rec.lastSellAt);
        Object.assign(ballAlerted, rec.ballAlerted || {});
        Object.assign(autoBuyAttempted, rec.autoBuyAttempted || {});
        for (const id of (Array.isArray(rec.levelAlerted) ? rec.levelAlerted : [])) levelAlerted.add(String(id));
        const slug = rec.slug ? normalize(rec.slug) : null;
        resumeHunt = slug && !CITY_SLUGS.includes(slug) ? slug : null;
        logEvent('recarga-retomada', { hunt: resumeHunt, idadeS: Math.round(idade / 1000) });
    }
    // Arma a volta para a hunt: chamado ao rastrear o socket (fallback) e quando a SPA manda `set-city`.
    function armResume(delayMs) {
        if (!resumeHunt) return;
        if (resumeTimer) clearTimeout(resumeTimer);
        resumeTimer = setTimeout(() => {
            resumeTimer = null;
            const slug = resumeHunt;
            if (!slug) return;
            resumeHunt = null;
            if (lastFieldAt > 0) { logEvent('recarga-hunt', { slug, jaNaHunt: true }); return; }
            switchHunt(slug, 1, 'recarga');
        }, delayMs);
    }

    // ---- Log persistente (para diagnóstico sem abrir o console) --------
    // Guarda os últimos eventos relevantes em localStorage[LOG_KEY]; o botão
    // "Copiar log" do painel copia tudo como JSON.

    const LOG_KEY = 'pgDiscordNotifyLog';
    const LOG_MAX = 40;

    function logEvent(kind, data) {
        if (cfg.debug) console.log(TAG, kind, data);
        try {
            const arr = JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
            arr.push({ t: new Date().toISOString(), kind, data });
            while (arr.length > LOG_MAX) arr.shift();
            localStorage.setItem(LOG_KEY, JSON.stringify(arr));
        } catch { /* localStorage indisponível: ignora */ }
    }

    // ---- Discord ----------------------------------------------------

    // ---- Roteamento de webhooks por tipo de evento ----------------------
    //   capture -> webhookUrl
    //   shiny   -> webhookShiny  (vazio: webhookUrl)
    //   alert   -> webhookAlerts (vazio: NÃO envia)
    //   level   -> webhookLevel  (vazio: NÃO envia)
    // Desde a v3.5.1 (a pedido do usuário) alertas e nível NÃO caem no principal: com o canal vazio o
    // evento é só registrado no log. Shiny é uma captura, por isso continua caindo em Capturas.
    const WEBHOOK_KINDS = {
        capture: { key: 'webhookUrl', label: 'capturas' },
        shiny: { key: 'webhookShiny', label: 'shinys', fallback: 'webhookUrl' },
        alert: { key: 'webhookAlerts', label: 'alertas' },
        level: { key: 'webhookLevel', label: 'nível' },
    };
    function webhookFor(kind) {
        const k = WEBHOOK_KINDS[kind] || WEBHOOK_KINDS.capture;
        return (cfg[k.key] || '').trim() || (k.fallback && (cfg[k.fallback] || '').trim()) || '';
    }

    const webhookMissingWarned = {};
    function postWebhook(kind, payload, meta) {
        const url = webhookFor(kind);
        if (!url) {
            const k = WEBHOOK_KINDS[kind] || WEBHOOK_KINDS.capture;
            logEvent('webhook-sem-canal', Object.assign({ kind, canal: k.label }, meta));
            if (!webhookMissingWarned[kind]) {
                webhookMissingWarned[kind] = true;
                console.warn(TAG, `Canal de ${k.label} vazio: esse aviso não foi enviado. Preencha no 🔔 › Avisos › Canais do Discord.`);
            }
            if (kind === 'capture' || kind === 'shiny') flashButton();
            return Promise.resolve(false);
        }
        return fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        }).then(res => {
            if (!res.ok) { console.warn(TAG, 'Discord respondeu com erro:', res.status); logEvent('webhook-erro', Object.assign({ kind, status: res.status }, meta)); return false; }
            logEvent('webhook-ok', Object.assign({ kind }, meta));
            return true;
        }).catch(err => { console.warn(TAG, 'Falha ao enviar webhook:', err); logEvent('webhook-falha', Object.assign({ kind, erro: String(err) }, meta)); return false; });
    }

    function sendDiscordNotification(info, isTest) {
        if (!cfg.webhookUrl) {
            console.warn(TAG, 'Webhook não configurado. Clique no 🔔 para configurar.');
            flashButton();
            return;
        }

        if (!isTest) {
            const key = normalize(info.name) + (info.shiny ? ':shiny' : '');
            const now = Date.now();
            if (cfg.cooldownSeconds > 0 && now - (lastNotifyAt.get(key) || 0) < cfg.cooldownSeconds * 1000) {
                logEvent('cooldown', { key });
                return;
            }
            lastNotifyAt.set(key, now);
        }

        const mention = cfg.mentionUserId ? `<@${cfg.mentionUserId}> ` : '';
        const shinyTag = info.shiny ? ' ✨ SHINY ✨' : '';
        const levelTxt = info.level != null ? ` (nível ${info.level})` : '';
        const ballTxt = info.ball ? `\nBola: ${info.ball}` : '';
        const autoTxt = info.auto ? '\nCaptura automática (VIP)' : '';
        const tier = qualityTier(info.quality);
        // O jogo mostra o ivTotal (0..192) como "Poder X/192"; usamos o mesmo rótulo.
        const ivTxt = info.ivTotal != null ? `\nPoder: ${info.ivTotal}/${IV_MAX} (${Math.round(info.ivTotal / IV_MAX * 100)}%)` : '';
        const qualTxt = info.quality != null ? `\nQualidade: ${info.quality.toFixed(3)}${tier ? ` · ${tier.name}` : ''}` : '';
        const who = playerName();

        const payload = {
            content: `${mention}🎉 ${who ? `**${who}** capturou` : 'Você capturou'} **${info.name}**${levelTxt}!${shinyTag}`,
            username: 'Poke Idle World',
            embeds: [{
                title: `${isTest ? 'Teste: ' : 'Captura: '}${info.name}${shinyTag}${tier ? ` [${tier.name}]` : ''}`,
                description: (who ? `Conta: ${who}\n` : '') + `Em ${new Date().toLocaleString('pt-BR')}` + ivTxt + qualTxt + ballTxt + autoTxt,
                color: info.shiny ? 0xffd700 : (tier ? tier.color : 0x57f287),
            }],
        };

        return postWebhook(info.shiny ? 'shiny' : 'capture', payload, { name: info.name, test: Boolean(isTest) });
    }

    // ---- Lógica principal -------------------------------------------

    function handleGameMessage(rawData) {
        let message;
        try { message = JSON.parse(rawData); }
        catch { return; }
        if (!message || typeof message !== 'object') return;

        if (message.type === 'pending' && Array.isArray(message.list)) {
            rememberPending(message.list);
            if (cfg.debug) console.log(TAG, 'Fila pending:', message.list);
            return;
        }

        if (message.type === 'poke-delta') { handlePokeDelta(message); return; }
        if (message.type === 'poke-xp') { handlePokeXp(message); return; }
        if (message.type === 'field' || message.type === 'field-init') { lastFieldAt = Date.now(); return; }
        if (message.type === 'field-kill') { noteLeaderLevel(Number(message.level), 'field-kill', Boolean(message.leveledUp)); handleFieldKill(message); return; }
        if (message.type === 'balls' && message.counts && typeof message.counts === 'object') { handleBalls(message); return; }
        if (message.type === 'pokes' && Array.isArray(message.list)) { updateTeam(message.list); handlePokesList(message.list); return; }

        if (message.type !== 'catch-result') return;

        logEvent('catch-result', message);
        if (message.ballId != null) {
            lastBallId = Number(message.ballId) || null;
            if (message.ballName && lastBallId) BALL_NAMES[lastBallId] = message.ballName;
        }
        if (message.success !== true) return;
        requestBalls(BALLS_AFTER_CATCH_MS); // a captura consumiu uma bola: atualiza o estoque

        const info = extractPokemonInfo(message);
        if (!info) {
            logEvent('sem-nome', message);
            return;
        }

        const name = normalize(info.name);
        // lista vazia = qualquer Pokémon
        const inWatchList = cfg.watchList.length === 0 ||
            cfg.watchList.map(normalize).includes(name);
        const passesName = cfg.notifyEveryCapture || inWatchList;
        const isShinyPass = cfg.notifyShiny && info.shiny;

        if (!passesName && !isShinyPass) {
            logEvent('decisao', { name: info.name, shiny: info.shiny, notificar: false, motivo: 'fora da lista' });
            return;
        }

        // Raridade/poder só chegam no poke-delta: decide depois dos detalhes.
        withDetails(info).then(full => {
            const q = isShinyPass ? { ok: true, motivo: 'shiny' } : passesQualityFilter(full);
            logEvent('decisao', { name: full.name, shiny: full.shiny, level: full.level, quality: full.quality ?? null, ivTotal: full.ivTotal ?? null, notificar: q.ok, motivo: q.motivo });
            if (q.ok) sendDiscordNotification(full, false);
        });
    }

    // ---- Interceptação do WebSocket (mesmo estilo do PIW-QOL) -------
    //
    // O PokeGrid injeta os userscripts no dom-ready, ou seja, o jogo pode
    // JÁ ter aberto o WebSocket antes de nós rodarmos. Por isso, duas frentes:
    //   1) patch no construtor       -> pega sockets criados DEPOIS (reconexões);
    //   2) patch no prototype.send   -> descobre o socket que já existia,
    //      na primeira vez que o jogo enviar qualquer coisa por ele.

    const trackedSockets = new WeakSet();

    function trackSocket(ws) {
        if (!ws || trackedSockets.has(ws)) return;
        trackedSockets.add(ws);
        ws.addEventListener('message', (event) => {
            try {
                if (typeof event.data === 'string') handleGameMessage(event.data);
            } catch (err) {
                console.warn(TAG, 'Erro ao processar mensagem:', err);
            }
        });
        lastSocket = ws;
        logEvent('socket', { url: String(ws.url || '').split('?')[0] });
        requestBalls(BALLS_AFTER_SOCKET_MS);
        requestPokes(POKES_AFTER_SOCKET_MS);
        armResume(RESUME_AFTER_SOCKET_MS);
    }

    const NativeWebSocket = window.WebSocket;

    function TrackedWebSocket(url, protocols) {
        const ws = protocols !== undefined
            ? new NativeWebSocket(url, protocols)
            : new NativeWebSocket(url);
        trackSocket(ws);
        return ws;
    }
    TrackedWebSocket.prototype = NativeWebSocket.prototype;
    Object.setPrototypeOf(TrackedWebSocket, NativeWebSocket);
    ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'].forEach(k => {
        TrackedWebSocket[k] = NativeWebSocket[k];
    });
    window.WebSocket = TrackedWebSocket;

    const nativeSend = NativeWebSocket.prototype.send;
    NativeWebSocket.prototype.send = function (data) {
        trackSocket(this);
        lastSocket = this;
        try { handleOutgoing(data); } catch (err) { console.warn(TAG, 'Erro ao ler envio:', err); }
        return nativeSend.call(this, data);
    };

    // ---- Painel de configurações (botão 🔔) --------------------------
    //
    // Estrutura (v3.5.0, proposta em docs/design-painel.md): 5 abas por objetivo (Avisos, Bolas,
    // Venda, Treino, Sistema), cabeçalho e rodapé fixos, Salvar GLOBAL sempre visível com indicador
    // de "não salvo", badge de estado por aba e ponto de estado no botão 🔔. Os ids `#pg-dn-*` e as
    // chaves de `cfg` são as mesmas de antes. Preferências só de UI (aba ativa) ficam em UI_KEY,
    // fora de `cfg`, para não entrarem no Exportar/Importar.

    const UI_KEY = 'pgDiscordNotifyUi';
    const PANEL_CSS = `
#pg-dn-btn,#pg-dn-panel{--dn-bg-0:#1e1f22;--dn-bg-1:#2b2d31;--dn-bg-2:#313338;--dn-bg-3:#3a3c42;--dn-border:#3f4147;--dn-text:#dbdee1;--dn-muted:#949ba4;--dn-dim:#80848e;--dn-accent:#5865f2;--dn-ok:#23a559;--dn-ok-t:#57d38a;--dn-warn:#f0b232;--dn-danger:#da373c;--dn-danger-t:#ff7a7e;--dn-shiny:#fee75c;--dn-radius:6px;--dn-radius-sm:4px;font:13px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--dn-text);box-sizing:border-box}
#pg-dn-panel *,#pg-dn-panel *::before,#pg-dn-panel *::after{box-sizing:border-box}
#pg-dn-panel[hidden],#pg-dn-panel [hidden]{display:none!important}
#pg-dn-btn{position:fixed;bottom:12px;left:12px;z-index:99999;width:38px;height:38px;border-radius:50%;border:1px solid var(--dn-border);background:var(--dn-bg-1);font-size:18px;line-height:1;cursor:pointer;opacity:.95;padding:0}
#pg-dn-btn .dn-dot{position:absolute;right:-1px;top:-1px;width:11px;height:11px;border-radius:50%;border:2px solid #111;background:transparent}
#pg-dn-btn .dn-dot[data-state="ok"]{background:var(--dn-ok)}
#pg-dn-btn .dn-dot[data-state="warn"]{background:var(--dn-warn)}
#pg-dn-btn .dn-dot[data-state="danger"]{background:var(--dn-danger);animation:dn-pulse 1.4s ease-in-out infinite}
@keyframes dn-pulse{0%,100%{box-shadow:0 0 0 0 rgba(218,55,60,.6)}50%{box-shadow:0 0 0 5px rgba(218,55,60,0)}}
#pg-dn-panel{position:fixed;bottom:58px;left:12px;z-index:99999;width:min(380px,calc(100vw - 24px));height:min(520px,calc(100vh - 70px));display:flex;flex-direction:column;background:var(--dn-bg-1);border:1px solid var(--dn-border);border-radius:var(--dn-radius);box-shadow:0 8px 24px rgba(0,0,0,.5);overflow:hidden;text-align:left}
#pg-dn-panel .dn-head{display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--dn-bg-0);border-bottom:1px solid var(--dn-border)}
#pg-dn-panel .dn-head .t{font-weight:600;font-size:14px}
#pg-dn-panel .dn-head .v{color:var(--dn-muted);font-size:12px}
#pg-dn-panel .dn-dots{margin-left:auto;display:flex;gap:4px}
#pg-dn-panel .dn-dots i{width:8px;height:8px;border-radius:50%;background:var(--dn-dim);display:block}
#pg-dn-panel .dn-dots i[data-state="on"],#pg-dn-panel .dn-tab .b[data-state="on"]{background:var(--dn-ok)}
#pg-dn-panel .dn-dots i[data-state="warn"],#pg-dn-panel .dn-tab .b[data-state="warn"]{background:var(--dn-warn)}
#pg-dn-panel .dn-dots i[data-state="danger"],#pg-dn-panel .dn-tab .b[data-state="danger"]{background:var(--dn-danger)}
#pg-dn-panel .dn-tabs{display:flex;background:var(--dn-bg-0);border-bottom:1px solid var(--dn-border)}
#pg-dn-panel .dn-tab{flex:1;background:transparent;border:0;border-bottom:2px solid transparent;color:var(--dn-muted);font:inherit;font-size:12px;font-weight:600;padding:7px 2px 6px;cursor:pointer;white-space:nowrap;border-radius:0}
#pg-dn-panel .dn-tab[aria-selected="true"]{color:var(--dn-text);border-bottom-color:var(--dn-accent);background:var(--dn-bg-1)}
#pg-dn-panel .dn-tab .b{display:inline-block;width:7px;height:7px;border-radius:50%;margin-left:3px;background:var(--dn-dim);vertical-align:1px}
#pg-dn-panel .dn-body{flex:1;overflow:auto;padding:12px;display:flex;flex-direction:column;gap:8px}
#pg-dn-panel .dn-pane{display:flex;flex-direction:column;gap:8px}
#pg-dn-panel .dn-section{display:flex;flex-direction:column;gap:8px}
#pg-dn-panel .dn-section+.dn-section{border-top:1px solid var(--dn-border);padding-top:12px;margin-top:4px}
#pg-dn-panel .dn-section>h3{margin:0;font-size:13px;font-weight:600;display:flex;align-items:center;gap:8px;color:var(--dn-text)}
#pg-dn-panel .dn-section>h3 .spacer{flex:1}
#pg-dn-panel .dn-field{display:flex;flex-direction:column;gap:2px;margin:0}
#pg-dn-panel .dn-field>span{font-size:13px}
#pg-dn-panel .dn-row{display:flex;gap:8px;align-items:flex-start;flex-wrap:wrap}
#pg-dn-panel .dn-row .dn-field{flex:1;min-width:120px}
#pg-dn-panel .dn-input,#pg-dn-panel .dn-select,#pg-dn-panel .dn-textarea{width:100%;min-height:28px;background:var(--dn-bg-0);color:var(--dn-text);border:1px solid var(--dn-border);border-radius:var(--dn-radius-sm);padding:4px 8px;font:inherit;margin:0}
#pg-dn-panel .dn-input:focus,#pg-dn-panel .dn-select:focus,#pg-dn-panel .dn-textarea:focus,#pg-dn-panel .dn-btn:focus-visible,#pg-dn-panel .dn-tab:focus-visible{outline:2px solid var(--dn-accent);outline-offset:1px}
#pg-dn-panel .dn-input:disabled{color:var(--dn-dim);background:var(--dn-bg-1)}
#pg-dn-panel .dn-input--sm{width:64px;min-width:64px}
#pg-dn-panel .dn-textarea{font:12px/1.4 ui-monospace,Consolas,monospace;resize:vertical}
#pg-dn-panel .dn-help{display:block;font-size:12px;color:var(--dn-muted);line-height:1.4;margin:0}
#pg-dn-panel .dn-hint{font-size:12px;color:var(--dn-muted);font-weight:400}
#pg-dn-panel .dn-help.warn{color:var(--dn-warn)}
#pg-dn-panel .dn-help.err{color:var(--dn-danger-t)}
#pg-dn-panel .dn-inline{display:flex;align-items:center;gap:6px;font-size:13px}
#pg-dn-panel .dn-status{display:flex;align-items:center;gap:8px;font-size:12px;background:var(--dn-bg-0);border-radius:var(--dn-radius-sm);padding:6px 8px;font-variant-numeric:tabular-nums}
#pg-dn-panel .dn-status .k{color:var(--dn-muted)}
#pg-dn-panel .dn-status .r{margin-left:auto}
#pg-dn-panel .dn-status.col{flex-direction:column;align-items:stretch;gap:4px}
#pg-dn-panel .dn-summary{font-size:12px;background:var(--dn-bg-0);border-left:2px solid var(--dn-accent);padding:6px 8px;border-radius:0 var(--dn-radius-sm) var(--dn-radius-sm) 0}
#pg-dn-panel .dn-toggle{display:inline-flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;position:relative;margin:0}
#pg-dn-panel .dn-toggle input{position:absolute;opacity:0;width:0;height:0;margin:0}
#pg-dn-panel .dn-toggle .sw{width:32px;height:18px;border-radius:9px;background:var(--dn-bg-3);position:relative;flex:none;transition:background .15s}
#pg-dn-panel .dn-toggle .sw::after{content:"";position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:#fff;transition:left .15s}
#pg-dn-panel .dn-toggle input:checked+.sw{background:var(--dn-ok)}
#pg-dn-panel .dn-toggle input:checked+.sw::after{left:16px}
#pg-dn-panel .dn-toggle input:focus-visible+.sw{outline:2px solid var(--dn-accent);outline-offset:1px}
#pg-dn-panel .dn-btn{min-height:28px;border-radius:var(--dn-radius-sm);border:1px solid transparent;font:inherit;font-size:13px;font-weight:600;padding:4px 12px;cursor:pointer;background:var(--dn-bg-3);color:var(--dn-text);margin:0}
#pg-dn-panel .dn-btn--primary{background:var(--dn-accent);color:#fff}
#pg-dn-panel .dn-btn--primary.idle{background:var(--dn-bg-3);color:var(--dn-text)}
#pg-dn-panel .dn-btn--danger{background:transparent;border-color:var(--dn-danger);color:var(--dn-danger-t)}
#pg-dn-panel .dn-btn--danger:hover{background:var(--dn-danger);color:#fff}
#pg-dn-panel .dn-btn--ghost{background:transparent;color:var(--dn-muted);font-weight:400;padding:2px 6px}
#pg-dn-panel .dn-btn--ghost:hover{color:var(--dn-text)}
#pg-dn-panel .dn-btn--sm{min-height:24px;padding:2px 8px;font-size:12px}
#pg-dn-panel .dn-actions{display:flex;gap:8px;flex-wrap:wrap}
#pg-dn-panel .dn-actions .dn-btn{flex:1}
#pg-dn-panel .dn-badge{font-size:11px;font-weight:600;padding:1px 7px;border-radius:10px;background:var(--dn-bg-3);color:var(--dn-muted)}
#pg-dn-panel .dn-badge[data-state="on"]{background:rgba(35,165,89,.18);color:var(--dn-ok-t)}
#pg-dn-panel .dn-badge[data-state="warn"]{background:rgba(240,178,50,.18);color:var(--dn-warn)}
#pg-dn-panel .dn-chan-summary{display:flex;gap:8px;align-items:center;font-size:12px;color:var(--dn-muted);flex-wrap:wrap}
#pg-dn-panel .dn-chan-summary b{color:var(--dn-text);font-weight:500}
#pg-dn-panel .dn-items{display:flex;flex-direction:column}
#pg-dn-panel .dn-item{display:grid;grid-template-columns:auto 1fr auto;gap:8px;align-items:center;padding:4px 6px;border-radius:var(--dn-radius-sm);font-size:12px;cursor:pointer;margin:0}
#pg-dn-panel .dn-item:hover{background:var(--dn-bg-2)}
#pg-dn-panel .dn-item input[type="checkbox"]{width:16px;height:16px;margin:0;accent-color:var(--dn-accent);position:static;opacity:1}
#pg-dn-panel .dn-item .nm{display:flex;gap:6px;align-items:baseline;flex-wrap:wrap}
#pg-dn-panel .dn-item .q{color:var(--dn-muted);font-variant-numeric:tabular-nums}
#pg-dn-panel .dn-item .w{color:var(--dn-shiny)}
#pg-dn-panel .dn-item .keep{display:none;align-items:center;gap:4px;color:var(--dn-muted)}
#pg-dn-panel .dn-item.on .keep{display:inline-flex}
#pg-dn-panel .dn-item .keep input{width:52px;min-height:24px;padding:2px 6px}
#pg-dn-panel .dn-item.locked{color:var(--dn-dim);cursor:default}
#pg-dn-panel .dn-item.locked:hover{background:transparent}
#pg-dn-panel .dn-route{list-style:none;margin:0;padding:0;font-size:12px;display:flex;flex-direction:column;gap:2px;font-variant-numeric:tabular-nums}
#pg-dn-panel .dn-route li{display:flex;gap:8px;padding:2px 6px;border-radius:var(--dn-radius-sm)}
#pg-dn-panel .dn-route li .m{width:14px;text-align:center;color:var(--dn-muted);flex:none}
#pg-dn-panel .dn-route li.done{color:var(--dn-muted)}
#pg-dn-panel .dn-route li.cur{background:var(--dn-bg-1)}
#pg-dn-panel .dn-route li.cur .m{color:var(--dn-accent)}
#pg-dn-panel .dn-route li.bad,#pg-dn-panel .dn-route li.bad .m{color:var(--dn-danger-t)}
#pg-dn-panel .dn-route li .hint{margin-left:auto;color:var(--dn-muted)}
#pg-dn-panel .dn-foot{display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--dn-bg-0);border-top:1px solid var(--dn-border)}
#pg-dn-panel .dn-msg{flex:1;min-width:0;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--dn-muted);cursor:default}
#pg-dn-panel .dn-msg.wrap{white-space:normal}
#pg-dn-panel .dn-msg[data-kind="ok"]{color:var(--dn-ok-t)}
#pg-dn-panel .dn-msg[data-kind="warn"],#pg-dn-panel .dn-msg[data-kind="dirty"]{color:var(--dn-warn)}
#pg-dn-panel .dn-msg[data-kind="error"]{color:var(--dn-danger-t)}
#pg-dn-panel .dn-ok-t{color:var(--dn-ok-t)}
#pg-dn-panel .dn-err-t{color:var(--dn-danger-t)}
@media (prefers-reduced-motion:reduce){#pg-dn-btn .dn-dot[data-state="danger"]{animation:none}}
`;

    let btn;
    function flashButton() {
        if (!btn) return;
        btn.style.boxShadow = '0 0 12px 4px #f04747';
        setTimeout(() => { btn.style.boxShadow = ''; }, 3000);
    }

    function loadUi() {
        try { return JSON.parse(localStorage.getItem(UI_KEY) || '{}') || {}; } catch { return {}; }
    }
    function saveUi(patch) {
        try { localStorage.setItem(UI_KEY, JSON.stringify(Object.assign(loadUi(), patch))); } catch { /* sem localStorage */ }
    }
    function escHtml(t) { return String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
    function fmtNum(n) { return Number(n).toLocaleString('pt-BR'); }

    const TABS = [
        { id: 'avisos', label: '🔔 Avisos' },
        { id: 'bolas', label: '🎯 Bolas' },
        { id: 'venda', label: '💰 Venda' },
        { id: 'treino', label: '⚔ Treino' },
        { id: 'sistema', label: '⚙ Sistema' },
    ];

    // Estado de cada módulo para os badges: 'on' | 'off' | 'warn' | 'danger'. Recebe um objeto no
    // formato do cfg (o próprio cfg com o painel fechado; o rascunho do formulário com ele aberto).
    function moduleState(tab, d) {
        const rota = Array.isArray(d.route) ? d.route.filter(r => r && r.slug && Number(r.level) > 0) : [];
        const temAlertas = Boolean((d.webhookAlerts || '').trim()); // true = canal de Alertas preenchido
        switch (tab) {
            case 'avisos': return (d.webhookUrl || '').trim() ? 'on' : 'danger';
            case 'bolas': {
                const min = Number(d.ballsMin) || 0;
                if (!(min > 0 || d.autoBuy)) return 'off';
                if ((d.autoBuy && !min) || !temAlertas) return 'warn';
                return 'on';
            }
            case 'venda':
                if (!d.sellEnabled) return 'off';
                return (Object.keys(d.sellItems || {}).length && temAlertas) ? 'on' : 'warn';
            case 'treino':
                if (!(d.routeEnabled || (Number(d.levelAlertAt) || 0) > 0)) return 'off';
                if (d.routeEnabled && (!rota.length || (Number(cfg.routeStage) || 0) >= rota.length)) return 'warn';
                if (!(d.webhookLevel || '').trim()) return 'warn';
                if (d.routeEnabled && !temAlertas) return 'warn'; // troca de hunt avisa em Alertas
                return 'on';
            case 'sistema': return d.reloadEnabled ? 'on' : 'off';
        }
        return 'off';
    }
    function stateSummary(d) {
        const rota = Array.isArray(d.route) ? d.route.filter(r => r && r.slug && Number(r.level) > 0) : [];
        const st = Number(cfg.routeStage) || 0;
        return [
            `Avisos: ${d.notifyEveryCapture ? 'toda captura' : (d.watchList && d.watchList.length ? `lista (${d.watchList.length})` : 'todas')}${d.notifyShiny ? ' + shiny' : ''}`,
            `Bolas: ${moduleState('bolas', d) === 'off' ? 'desligado' : `${d.ballsWatch && d.ballsWatch !== 'auto' ? ballName(Number(d.ballsWatch)) : 'em uso'} < ${Number(d.ballsMin) || (d.autoBuy ? 1 : 0)}${d.autoBuy ? ' + compra' : ''}`}`,
            `Venda: ${d.sellEnabled ? `${Object.keys(d.sellItems || {}).length} itens / ${d.sellEveryMin}${d.sellEveryMaxMin > d.sellEveryMin ? `–${d.sellEveryMaxMin}` : ''} min` : 'desligada'}`,
            `Treino: ${d.routeEnabled && rota.length ? (st >= rota.length ? 'rota concluída' : `rota ${st + 1}/${rota.length}`) : ((Number(d.levelAlertAt) || 0) ? `nível ${d.levelAlertAt}${d.levelSwap ? ' + troca' : ''}` : 'desligado')}`,
            `Recarga: ${d.reloadEnabled ? `${d.reloadEveryMin}${d.reloadEveryMaxMin > d.reloadEveryMin ? `–${d.reloadEveryMaxMin}` : ''} min` : 'desligada'}`,
        ].join(' · ');
    }

    const TIER_LABEL = (t) => `${t.name} (${t.min === -Infinity ? '< 1.0' : t.min.toFixed(1) + '+'})`;

    function buildUI() {
        if (document.getElementById('pg-dn-btn')) return;
        if (!document.body) { setTimeout(buildUI, 500); return; }

        const style = document.createElement('style');
        style.id = 'pg-dn-style';
        style.textContent = PANEL_CSS;
        document.head.appendChild(style);

        btn = document.createElement('button');
        btn.id = 'pg-dn-btn';
        btn.type = 'button';
        btn.innerHTML = '<span>🔔</span><span class="dn-dot" id="pg-dn-dot"></span>';
        btn.title = 'Notificações no Discord — configurar';

        const panel = document.createElement('div');
        panel.id = 'pg-dn-panel';
        panel.hidden = true;
        const hookInput = (id, help) => `<label class="dn-field"><span>${id === 'hook' ? 'Capturas' : id === 'hook-shiny' ? 'Shinys' : id === 'hook-alerts' ? 'Alertas' : 'Nível'}</span>
                <input id="pg-dn-${id}" class="dn-input" type="password" placeholder="https://discord.com/api/webhooks/…" autocomplete="off"><span class="dn-help">${help}</span></label>`;
        panel.innerHTML = `
            <div class="dn-head">
                <span class="t">🔔 Notify</span><span class="v">v${VERSION}</span>
                <div class="dn-dots" id="pg-dn-dots">${TABS.map(t => `<i data-tab="${t.id}"></i>`).join('')}</div>
                <button type="button" class="dn-btn dn-btn--ghost" id="pg-dn-close" title="Fechar (Esc)">✕</button>
            </div>
            <div class="dn-tabs" role="tablist">${TABS.map(t => `<button type="button" class="dn-tab" role="tab" data-tab="${t.id}" aria-selected="false">${t.label}<span class="b"></span></button>`).join('')}</div>
            <div class="dn-body">
                <section class="dn-pane" data-pane="avisos" hidden>
                    <div class="dn-section">
                        <h3>Canais do Discord <span class="spacer"></span><button type="button" class="dn-btn dn-btn--ghost dn-btn--sm" id="pg-dn-chan-toggle">editar</button></h3>
                        <div class="dn-chan-summary" id="pg-dn-chan-summary"></div>
                        <div id="pg-dn-chan-box" class="dn-section" hidden>
                            ${hookInput('hook', 'Obrigatório. Recebe as capturas e tudo que não tiver canal próprio.')}
                            ${hookInput('hook-shiny', 'Vazio = shinys vão para Capturas.')}
                            ${hookInput('hook-alerts', 'Estoque, compra, venda e troca de hunt. Vazio = esses avisos NÃO são enviados.')}
                            ${hookInput('hook-level', 'Nível atingido e troca de líder. Vazio = esses avisos NÃO são enviados.')}
                        </div>
                    </div>
                    <div class="dn-section">
                        <h3>Quais capturas avisar</h3>
                        <label class="dn-field"><span>Pokémon</span><input id="pg-dn-list" class="dn-input" type="text" placeholder="dratini, larvitar"><span class="dn-help">Separados por vírgula. Vazio = todas.</span></label>
                        <label class="dn-toggle"><input id="pg-dn-shiny" type="checkbox"><span class="sw"></span>Todo shiny <span class="dn-hint">(avisa sempre, mesmo fora da lista)</span></label>
                        <label class="dn-toggle"><input id="pg-dn-all" type="checkbox"><span class="sw"></span>Toda captura <span class="dn-hint">(ignora a lista)</span></label>
                    </div>
                    <div class="dn-section">
                        <h3>Filtro de qualidade</h3>
                        <div class="dn-summary" id="pg-dn-q-summary"></div>
                        <label class="dn-field"><span>Raridade mínima</span>
                            <select id="pg-dn-tier" class="dn-select"><option value="">Qualquer</option>${TIERS_ASC.map(t => `<option value="${t.key}">${TIER_LABEL(t)}</option>`).join('')}</select></label>
                        <div class="dn-row">
                            <label class="dn-field"><span>Poder mínimo dessa raridade</span><input id="pg-dn-tier-iv" class="dn-input" type="number" min="0" max="${IV_MAX}" step="1" placeholder="0 = qualquer"></label>
                            <label class="dn-field"><span>Poder mínimo, qualquer raridade</span><input id="pg-dn-miniv" class="dn-input" type="number" min="0" max="${IV_MAX}" step="1" placeholder="0 = desligado"></label>
                        </div>
                        <p class="dn-help">Poder é o X/${IV_MAX} que o jogo mostra.</p>
                    </div>
                    <div class="dn-section">
                        <h3>Mensagem</h3>
                        <div class="dn-row">
                            <label class="dn-field"><span>Mencionar (ID do Discord)</span><input id="pg-dn-mention" class="dn-input" type="text" placeholder="123456789012345678 (opcional)"></label>
                            <label class="dn-field"><span>Intervalo, mesmo Pokémon</span><span class="dn-inline"><input id="pg-dn-cooldown" class="dn-input dn-input--sm" type="number" min="0" step="1" placeholder="0">s</span><span class="dn-help">0 = avisa todas.</span></label>
                        </div>
                    </div>
                </section>
                <section class="dn-pane" data-pane="bolas" hidden>
                    <div class="dn-section">
                        <h3>Estoque de bolas</h3>
                        <div class="dn-status" id="pg-dn-balls-status"></div>
                        <label class="dn-field"><span>Bola</span>
                            <select id="pg-dn-ball" class="dn-select"><option value="auto">A que estiver em uso (último catch)</option>${Object.entries(BALL_NAMES).map(([id, n]) => `<option value="${id}">${n}</option>`).join('')}</select></label>
                        <label class="dn-field"><span>Avisar abaixo de</span><input id="pg-dn-ballsmin" class="dn-input" type="number" min="0" step="1" placeholder="0 = desligado"><span class="dn-help">Checa após cada captura e a cada 5 min. Avisa uma vez; rearma ao repor. Vai para o canal de Alertas.</span></label>
                    </div>
                    <div class="dn-section">
                        <h3>Compra automática</h3>
                        <label class="dn-toggle"><input id="pg-dn-autobuy" type="checkbox"><span class="sw"></span>Comprar automaticamente</label>
                        <p class="dn-help">Compra na loja do NPC com o gold da conta quando ficar abaixo do limite.</p>
                        <p class="dn-help warn" id="pg-dn-autobuy-warn" hidden>⚠ Limite 0: compra só quando a bola acabar.</p>
                        <label class="dn-field"><span>Quantidade por compra</span><input id="pg-dn-autobuy-qty" class="dn-input" type="number" min="1" max="${BUY_MAX_QTY}" step="1" placeholder="100"></label>
                        <p class="dn-help">Uma tentativa por vez; se faltar gold, avisa e espera repor ou salvar.</p>
                    </div>
                </section>
                <section class="dn-pane" data-pane="venda" hidden>
                    <div class="dn-section">
                        <h3>Venda automática</h3>
                        <label class="dn-toggle"><input id="pg-dn-sell" type="checkbox"><span class="sw"></span>Vender automaticamente</label>
                        <div class="dn-inline">A cada <input id="pg-dn-sell-min" class="dn-input dn-input--sm" type="number" min="1" step="1"> a <input id="pg-dn-sell-max" class="dn-input dn-input--sm" type="number" min="0" step="1"> min</div>
                        <p class="dn-help">Sorteado na faixa. Segundo vazio = fixo. Aviso no canal de Alertas.</p>
                        <div class="dn-status" id="pg-dn-sell-hunt"></div>
                    </div>
                    <div class="dn-section">
                        <h3>Drops desta hunt <span class="spacer"></span><span class="dn-badge" id="pg-dn-sell-count"></span></h3>
                        <div class="dn-items" id="pg-dn-sell-list"></div>
                        <p class="dn-help">Marcado = vendido. ⚠ = raro, pedra/feromônio ou outra categoria: confira. 🔒 = o jogo não deixa vender. "Manter" = quantidade que fica na mochila.</p>
                        <div class="dn-actions"><button type="button" class="dn-btn" id="pg-dn-sell-now" title="Salva a lista e vende os marcados.">Vender agora</button></div>
                    </div>
                </section>
                <section class="dn-pane" data-pane="treino" hidden>
                    <div class="dn-section">
                        <h3>Nível do líder</h3>
                        <label class="dn-field"><span>Avisar no nível</span><input id="pg-dn-level" class="dn-input" type="number" min="0" step="1" placeholder="0 = desligado"><span class="dn-help" id="pg-dn-level-help"></span></label>
                        <label class="dn-toggle"><input id="pg-dn-level-swap" type="checkbox"><span class="sw"></span>Trocar de líder ao atingir</label>
                        <p class="dn-help">Põe como líder o próximo do time abaixo do nível. Um aviso por Pokémon, no canal de Nível.</p>
                        <div class="dn-status"><span>★</span><span id="pg-dn-team"></span><button type="button" class="dn-btn dn-btn--ghost dn-btn--sm r" id="pg-dn-team-refresh">Atualizar time</button></div>
                    </div>
                    <div class="dn-section">
                        <h3>Rota de treino</h3>
                        <textarea id="pg-dn-route" class="dn-textarea" rows="3" placeholder="pidgey 10&#10;larvitar 15" spellcheck="false"></textarea>
                        <p class="dn-help">Uma etapa por linha: <b>hunt nível</b> (a hunt é o nome que aparece em "Hunt"). Quando todo o time chega ao nível, troca para a próxima hunt.</p>
                        <label class="dn-toggle"><input id="pg-dn-route-on" type="checkbox"><span class="sw"></span>Seguir a rota <span class="dn-hint">(liga a troca de líder)</span></label>
                        <div class="dn-status col"><div id="pg-dn-route-status"></div><ol class="dn-route" id="pg-dn-route-list"></ol></div>
                        <div class="dn-actions"><button type="button" class="dn-btn dn-btn--danger" id="pg-dn-route-reset" title="Volta à 1ª etapa.">Reiniciar rota</button></div>
                    </div>
                </section>
                <section class="dn-pane" data-pane="sistema" hidden>
                    <div class="dn-section">
                        <h3>Recarga do painel</h3>
                        <label class="dn-toggle"><input id="pg-dn-reload" type="checkbox"><span class="sw"></span>Recarregar automaticamente</label>
                        <div class="dn-inline">A cada <input id="pg-dn-reload-min" class="dn-input dn-input--sm" type="number" min="1" step="1"> a <input id="pg-dn-reload-max" class="dn-input dn-input--sm" type="number" min="0" step="1"> min</div>
                        <p class="dn-help">Guarda a hunt e volta pra ela após recarregar. Espera venda, troca e captura terminarem. <span title="O mesmo que o ⟳ Atualizar tudo do PokeGrid, só neste painel. A tela pode seguir mostrando a cidade enquanto o servidor farma. Cada painel sorteia o próprio horário." style="cursor:help">ⓘ</span></p>
                        <div class="dn-status"><span>⟳</span><span id="pg-dn-reload-status"></span></div>
                        <div class="dn-actions"><button type="button" class="dn-btn" id="pg-dn-reload-now" title="Guarda a hunt e volta.">Recarregar agora</button></div>
                    </div>
                    <div class="dn-section">
                        <h3>Ferramentas</h3>
                        <div class="dn-actions">
                            <button type="button" class="dn-btn" id="pg-dn-log" title="Últimos 40 eventos, sem canais. Cole para quem for diagnosticar.">Copiar log</button>
                            <button type="button" class="dn-btn" id="pg-dn-export" title="Copia a config inteira, com os canais.">Exportar config</button>
                            <button type="button" class="dn-btn" id="pg-dn-import" title="Cola uma config exportada de outro painel.">Importar config</button>
                        </div>
                        <div id="pg-dn-import-box" class="dn-section" hidden>
                            <textarea id="pg-dn-import-text" class="dn-textarea" rows="3" placeholder="Cole a config exportada"></textarea>
                            <label class="dn-toggle"><input id="pg-dn-import-keephooks" type="checkbox"><span class="sw"></span>Manter os canais deste painel</label>
                            <div class="dn-actions"><button type="button" class="dn-btn dn-btn--primary" id="pg-dn-import-apply">Aplicar</button></div>
                        </div>
                        <label class="dn-toggle"><input id="pg-dn-debug" type="checkbox"><span class="sw"></span>Debug no console</label>
                        <div class="dn-status"><span class="k">v${VERSION}</span><span class="r" id="pg-dn-socket"></span></div>
                    </div>
                </section>
            </div>
            <div class="dn-foot">
                <div class="dn-msg" id="pg-dn-msg" data-kind=""></div>
                <button type="button" class="dn-btn" id="pg-dn-test" title="Salva os canais e envia uma mensagem de teste a cada um preenchido.">Testar canais</button>
                <button type="button" class="dn-btn dn-btn--primary idle" id="pg-dn-save">Salvar</button>
            </div>`;

        document.body.appendChild(btn);
        document.body.appendChild(panel);

        const $ = (id) => panel.querySelector(id);
        let dirty = false;          // algum campo editado desde o último Salvar
        let msgTimer = null;
        let resetArmed = null;      // timer da confirmação em 2 cliques do Reiniciar rota

        // ---- abas ----
        function showTab(name) {
            if (!TABS.some(t => t.id === name)) name = 'avisos';
            for (const t of panel.querySelectorAll('.dn-tab')) t.setAttribute('aria-selected', String(t.dataset.tab === name));
            for (const p of panel.querySelectorAll('.dn-pane')) p.hidden = p.dataset.pane !== name;
            saveUi({ tab: name });
        }
        for (const t of panel.querySelectorAll('.dn-tab')) t.onclick = () => showTab(t.dataset.tab);

        // ---- rodapé: mensagens por tipo e indicador de não salvo ----
        function renderDirty() {
            const m = $('#pg-dn-msg');
            m.classList.remove('wrap');
            if (dirty) { m.textContent = '● Alterações não salvas'; m.dataset.kind = 'dirty'; }
            else { m.textContent = ''; m.dataset.kind = ''; }
            m.title = '';
            $('#pg-dn-save').classList.toggle('idle', !dirty);
            renderState();
        }
        // kind: ok (some em 2,5 s) | info (4 s) | warn/error (fica até o próximo clique)
        function flash(msg, kind, ms) {
            const m = $('#pg-dn-msg');
            clearTimeout(msgTimer);
            m.textContent = msg; m.title = msg; m.dataset.kind = kind || 'info';
            m.classList.remove('wrap');
            const dur = ms || (kind === 'ok' ? 2500 : (kind === 'warn' || kind === 'error') ? 0 : 4000);
            if (dur) msgTimer = setTimeout(() => { if (m.textContent === msg) renderDirty(); }, dur);
        }
        $('#pg-dn-msg').onclick = () => $('#pg-dn-msg').classList.toggle('wrap');
        // aviso/erro persistente some no próximo clique em qualquer botão
        panel.addEventListener('click', (e) => {
            const m = $('#pg-dn-msg');
            if (e.target.closest('button') && (m.dataset.kind === 'warn' || m.dataset.kind === 'error') && e.target.id !== 'pg-dn-msg') renderDirty();
        }, true);

        // ---- leitura do formulário (rascunho no formato do cfg) ----
        function readSellList(base) {
            const out = Object.assign({}, base || cfg.sellItems || {});
            for (const row of panel.querySelectorAll('[data-item-id]')) {
                const id = Number(row.getAttribute('data-item-id'));
                const checked = row.querySelector('.pg-dn-sell-chk')?.checked;
                const keep = Math.max(0, parseInt(row.querySelector('.pg-dn-sell-keep')?.value, 10) || 0);
                if (checked) out[id] = { keep }; else delete out[id];
            }
            return out;
        }
        function readRoute() {
            const linhasRuins = [];
            const route = $('#pg-dn-route').value.split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => {
                const m = l.match(/^(\S+)\s+(\d+)$/);
                if (!m) { linhasRuins.push(l); return null; }
                return { slug: normalize(m[1]), level: parseInt(m[2], 10) };
            }).filter(r => r && r.level > 0);
            return { route, linhasRuins };
        }
        function readForm() {
            const { route, linhasRuins } = readRoute();
            const lv = $('#pg-dn-level');
            const draft = {
                webhookUrl: $('#pg-dn-hook').value.trim(),
                webhookShiny: $('#pg-dn-hook-shiny').value.trim(),
                webhookAlerts: $('#pg-dn-hook-alerts').value.trim(),
                webhookLevel: $('#pg-dn-hook-level').value.trim(),
                // com a rota ligada o campo mostra o nível da etapa (desabilitado); o valor do usuário fica em dataset.own
                levelAlertAt: Math.max(0, parseInt(lv.disabled ? lv.dataset.own : lv.value, 10) || 0),
                levelSwap: $('#pg-dn-level-swap').checked,
                route,
                routeEnabled: $('#pg-dn-route-on').checked && route.length > 0,
                watchList: $('#pg-dn-list').value.split(',').map(normalize).filter(Boolean),
                notifyShiny: $('#pg-dn-shiny').checked,
                notifyEveryCapture: $('#pg-dn-all').checked,
                minTier: $('#pg-dn-tier').value,
                minIv: Math.min(IV_MAX, Math.max(0, parseInt($('#pg-dn-miniv').value, 10) || 0)),
                minTierIv: Math.min(IV_MAX, Math.max(0, parseInt($('#pg-dn-tier-iv').value, 10) || 0)),
                ballsWatch: $('#pg-dn-ball').value || 'auto',
                ballsMin: Math.max(0, parseInt($('#pg-dn-ballsmin').value, 10) || 0),
                autoBuy: $('#pg-dn-autobuy').checked,
                autoBuyQty: Math.min(BUY_MAX_QTY, Math.max(1, parseInt($('#pg-dn-autobuy-qty').value, 10) || 100)),
                mentionUserId: $('#pg-dn-mention').value.trim(),
                cooldownSeconds: Math.max(0, parseInt($('#pg-dn-cooldown').value, 10) || 0),
                debug: $('#pg-dn-debug').checked,
                sellEnabled: $('#pg-dn-sell').checked,
                sellEveryMin: Math.max(1, parseInt($('#pg-dn-sell-min').value, 10) || 10),
                sellEveryMaxMin: Math.max(0, parseInt($('#pg-dn-sell-max').value, 10) || 0),
                sellItems: readSellList(),
                reloadEnabled: $('#pg-dn-reload').checked,
                reloadEveryMin: Math.max(1, parseInt($('#pg-dn-reload-min').value, 10) || 60),
                reloadEveryMaxMin: Math.max(0, parseInt($('#pg-dn-reload-max').value, 10) || 0),
            };
            return { draft, linhasRuins };
        }
        // Com o painel aberto os badges refletem o que está na tela; fechado, o que está salvo.
        function current() { return panel.hidden ? cfg : readForm().draft; }

        // ---- estado de relance: badges das abas, pontos do cabeçalho, ponto do 🔔 ----
        function renderState() {
            const d = current();
            const states = {};
            for (const t of TABS) {
                states[t.id] = moduleState(t.id, d);
                panel.querySelector(`.dn-tab[data-tab="${t.id}"] .b`).dataset.state = states[t.id];
                panel.querySelector(`.dn-dots i[data-tab="${t.id}"]`).dataset.state = states[t.id];
            }
            const vals = Object.values(states);
            const dot = document.getElementById('pg-dn-dot');
            dot.dataset.state = vals.includes('danger') ? 'danger' : (vals.includes('warn') || dirty) ? 'warn' : vals.includes('on') ? 'ok' : '';
            const resumo = stateSummary(d) + (dirty ? ' · ● alterações não salvas' : '') + (states.avisos === 'danger' ? ' · ⚠ sem canal de Capturas' : '');
            btn.title = resumo;
            $('#pg-dn-dots').title = resumo;
        }

        // ---- Avisos ----
        function setChanOpen(open) {
            $('#pg-dn-chan-box').hidden = !open;
            $('#pg-dn-chan-toggle').textContent = open ? 'recolher' : 'editar';
        }
        $('#pg-dn-chan-toggle').onclick = () => setChanOpen($('#pg-dn-chan-box').hidden);
        function renderChannels() {
            const has = (id) => Boolean($('#pg-dn-' + id).value.trim());
            const el = $('#pg-dn-chan-summary');
            if (!has('hook')) { el.innerHTML = '<span class="dn-err-t">⚠ Cole o webhook do canal de Capturas para começar.</span>'; return; }
            el.innerHTML = [['hook', 'Capturas'], ['hook-shiny', 'Shinys'], ['hook-alerts', 'Alertas'], ['hook-level', 'Nível']]
                .map(([id, n]) => `<span><b>${n}</b> ${has(id) ? '✔' : '—'}</span>`).join('');
        }
        function renderQuality() {
            const tier = tierByKey($('#pg-dn-tier').value);
            const tierIv = parseInt($('#pg-dn-tier-iv').value, 10) || 0;
            const minIv = parseInt($('#pg-dn-miniv').value, 10) || 0;
            const parts = [];
            if (tier) parts.push(`${tier.name}+${tierIv ? ` com poder ≥ ${tierIv}` : ''}`);
            if (minIv) parts.push(`qualquer raridade com poder ≥ ${minIv}`);
            let txt = parts.length ? `Avisa: ${parts.join(', ou ')}.` : 'Avisa: tudo que passar pela lista de nomes.';
            if ($('#pg-dn-shiny').checked) txt += ' Shiny avisa sempre.';
            $('#pg-dn-q-summary').textContent = txt;
        }

        // ---- Bolas ----
        function renderBalls() {
            const d = current();
            const min = Number(d.ballsMin) || 0;
            $('#pg-dn-autobuy-warn').hidden = !(d.autoBuy && !min);
            const el = $('#pg-dn-balls-status');
            const id = d.ballsWatch && d.ballsWatch !== 'auto' ? Number(d.ballsWatch) : lastBallId;
            const qty = id != null ? ballCounts[id] : null;
            if (!(min > 0 || d.autoBuy)) el.innerHTML = '<span>🎯</span><span class="k">Alerta desligado.</span>';
            else if (id == null) el.innerHTML = '<span>🎯</span><span class="k">Bola em uso ainda não vista: capture algo.</span>';
            else if (qty == null) el.innerHTML = `<span>🎯</span><span><span class="k">${escHtml(ballName(id))}:</span> estoque ainda não lido</span>`;
            else el.innerHTML = `<span>🎯</span><span><span class="k">${escHtml(ballName(id))}:</span> ${fmtNum(qty)} em estoque</span>${qty < (min || 1) ? '<span class="r" style="color:var(--dn-warn)">abaixo do limite</span>' : ''}`;
        }
        onBallsChange = () => { if (!panel.hidden) renderBalls(); };

        // ---- Venda ----
        function renderSellList(sel) {
            const box = $('#pg-dn-sell-list');
            const info = $('#pg-dn-sell-hunt');
            sel = sel || cfg.sellItems || {};
            let proxima = '';
            if (cfg.sellEnabled) {
                if (!lastSellAt || !nextSellDelayMs) proxima = 'próxima venda na próxima checagem';
                else proxima = `próxima venda em ${Math.max(0, Math.round((lastSellAt + nextSellDelayMs - Date.now()) / 60000))} min`;
            }
            info.innerHTML = huntSlug
                ? `<span>💰</span><span><span class="k">Hunt:</span> ${escHtml(huntSlug)} · ${hasHuntProfile() ? 'perfil salvo' : 'sem perfil (Salvar cria)'}</span>${proxima ? `<span class="k r">${proxima}</span>` : ''}`
                : '<span>💰</span><span class="k">Fora de hunt. Entre numa hunt e cace: os drops aparecem aqui.</span>';
            const ids = [...huntLoot.keys()];
            if (!ids.length) {
                box.innerHTML = `<p class="dn-help">${huntSlug ? `Nenhum drop visto em ${escHtml(huntSlug)} ainda.` : 'Nenhum drop visto ainda.'}</p>`;
                renderSellCount();
                return;
            }
            box.innerHTML = ids.map(id => {
                const loot = huntLoot.get(id);
                const item = itemsCatalog?.get(id) || null;
                const motivo = protectedReason(item);
                const aviso = sellWarning(item);
                const s = sel[id];
                const price = item ? Number(item.npcPrice) || 0 : null;
                if (motivo) {
                    return `<div class="dn-item locked" title="Protegido: ${escHtml(motivo)}"><span>🔒</span><span class="nm">${escHtml(loot.name)} <span class="q">×${loot.qty}</span></span><span class="q">${escHtml(motivo)}</span></div>`;
                }
                return `<label class="dn-item${s ? ' on' : ''}" data-item-id="${id}">
                    <input type="checkbox" class="pg-dn-sell-chk" ${s ? 'checked' : ''}>
                    <span class="nm">${escHtml(loot.name)} <span class="q">×${loot.qty}${price != null ? ` · ${fmtNum(price)} gold` : ''}</span>${aviso ? ` <span class="w" title="Atenção: ${escHtml(aviso)}">⚠ ${escHtml(aviso)}</span>` : ''}</span>
                    <span class="keep" title="Quantidade que fica na mochila">manter <input type="number" class="dn-input pg-dn-sell-keep" min="0" step="1" value="${s ? (Number(s.keep) || 0) : 0}"></span>
                </label>`;
            }).join('');
            for (const chk of box.querySelectorAll('.pg-dn-sell-chk')) chk.addEventListener('change', () => chk.closest('.dn-item').classList.toggle('on', chk.checked));
            renderSellCount();
        }
        function renderSellCount() {
            const n = panel.querySelectorAll('.pg-dn-sell-chk:checked').length;
            const b = $('#pg-dn-sell-count');
            b.textContent = n ? `${n} marcados` : 'nenhum marcado';
            b.dataset.state = n ? 'on' : ($('#pg-dn-sell').checked ? 'warn' : '');
        }
        // Drop novo chega com o painel aberto: redesenha sem perder o que o usuário marcou e ainda não salvou.
        onHuntLootChange = () => { if (!panel.hidden) renderSellList(dirty ? readSellList() : null); };

        // ---- Treino ----
        function renderLevelField() {
            const lv = $('#pg-dn-level');
            const { route } = readRoute();
            const on = $('#pg-dn-route-on').checked && route.length > 0;
            const st = Math.min(Number(cfg.routeStage) || 0, route.length - 1);
            if (on) {
                if (!lv.disabled) lv.dataset.own = lv.value;
                lv.disabled = true;
                lv.value = route[Math.max(0, st)].level;
                $('#pg-dn-level-help').textContent = 'Vem da etapa atual da rota. Desligue "Seguir a rota" para editar.';
            } else {
                if (lv.disabled) { lv.disabled = false; lv.value = lv.dataset.own || 0; }
                $('#pg-dn-level-help').textContent = 'Se o líder já estiver no nível ao salvar, avisa e troca na hora.';
            }
        }
        function renderTeam() {
            const alvo = levelTarget();
            $('#pg-dn-team').innerHTML = team.length
                ? `<span class="k">Time:</span> ${team.map(p => `${p.leader ? '★ ' : ''}${p.shiny ? '✨' : ''}${escHtml(p.name)} ${p.level}${alvo && p.level >= alvo ? ' ✔' : ''}`).join(' · ')}`
                : '<span class="k">Time ainda não lido.</span>';
        }
        function renderRoute() {
            const lines = $('#pg-dn-route').value.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
            const valid = lines.filter(l => /^(\S+)\s+(\d+)$/.test(l));
            const saved = JSON.stringify(readRoute().route) === JSON.stringify(routeList());
            const cur = saved ? (Number(cfg.routeStage) || 0) : 0; // rota editada recomeça da 1ª etapa ao salvar
            const list = $('#pg-dn-route-list');
            let vi = 0;
            list.innerHTML = lines.map(l => {
                const m = l.match(/^(\S+)\s+(\d+)$/);
                if (!m) return `<li class="bad"><span class="m">✖</span><span>${escHtml(l)}</span><span class="hint">use "hunt nível"</span></li>`;
                const i = vi++;
                const cls = i < cur ? 'done' : i === cur ? 'cur' : '';
                const mark = i < cur ? '✔' : i === cur ? '▶' : '';
                const hint = i === cur ? `<span class="hint">atual${huntSlug ? ` · hunt: ${escHtml(huntSlug)}` : ''}</span>` : '';
                return `<li class="${cls}"><span class="m">${mark}</span><span>${escHtml(m[1])} → nível ${m[2]}</span>${hint}</li>`;
            }).join('');
            const on = $('#pg-dn-route-on').checked;
            let st;
            if (!valid.length) st = on ? '<span class="dn-err-t">Sem etapas: a rota fica desligada.</span>' : '<span class="k">Sem rota.</span>';
            else if (cur >= valid.length) st = `<span class="k">Rota ·</span> concluída (${valid.length} etapas). Reiniciar para começar de novo.`;
            else st = `<span class="k">Rota${on ? '' : ' (desligada)'} ·</span> etapa ${cur + 1} de ${valid.length}${!saved ? ' <span class="k">(recomeça ao salvar)</span>' : ''}`;
            $('#pg-dn-route-status').innerHTML = st;
            renderLevelField();
        }
        onTeamChange = () => { if (!panel.hidden) { renderTeam(); renderRoute(); } };
        $('#pg-dn-team-refresh').onclick = () => {
            lastPokesReqAt = 0;
            const ok = sendGame({ type: 'pokes-get' });
            if (ok) flash('📥 Pedi o time ao jogo…', 'info', 3000);
            else flash('✖ Sem socket do jogo ainda. Recarregue o painel.', 'error');
        };
        $('#pg-dn-route-reset').onclick = () => {
            const b = $('#pg-dn-route-reset');
            if (!routeList().length) { flash('⚠ Nenhuma rota salva.', 'warn'); return; }
            if (!resetArmed) {
                b.textContent = 'Clique de novo para confirmar';
                flash(`⚠ Reiniciar volta à 1ª etapa (${routeList()[0].slug} ${routeList()[0].level}).`, 'warn');
                resetArmed = setTimeout(() => { resetArmed = null; b.textContent = 'Reiniciar rota'; renderDirty(); }, 3000);
                return;
            }
            clearTimeout(resetArmed); resetArmed = null; b.textContent = 'Reiniciar rota';
            cfg.routeStage = 0;
            saveCfg(cfg);
            levelAlerted.clear(); swapPending = null;
            renderTeam(); renderRoute();
            lastPokesReqAt = 0; requestPokes(0);
            flash(`✔ Rota reiniciada · etapa 1 de ${routeList().length} (${routeList()[0].slug} ${routeList()[0].level})`, 'ok', 5000);
        };

        // ---- Sistema ----
        function renderReload() {
            $('#pg-dn-reload-status').textContent = cfg.reloadEnabled ? `Recarga ${reloadStatus()}` : 'Recarga desligada';
            $('#pg-dn-socket').innerHTML = lastSocket && lastSocket.readyState === 1
                ? 'socket do jogo <span class="dn-ok-t">● rastreado</span>'
                : 'socket do jogo <span class="dn-err-t">○ não rastreado</span>';
        }
        onReloadChange = () => { if (!panel.hidden) renderReload(); };
        $('#pg-dn-reload-now').onclick = () => {
            flash(`⟳ Recarregando${huntSlug ? ` (volto para ${huntSlug})` : ''}…`, 'info', 10000);
            setTimeout(() => doReload('manual'), 300);
        };

        // ---- preencher e redesenhar tudo ----
        function renderLive() {
            renderChannels(); renderQuality(); renderBalls(); renderSellCount(); renderRoute(); renderState();
        }
        function fill() {
            $('#pg-dn-hook').value = cfg.webhookUrl;
            $('#pg-dn-hook-shiny').value = cfg.webhookShiny || '';
            $('#pg-dn-hook-alerts').value = cfg.webhookAlerts || '';
            $('#pg-dn-hook-level').value = cfg.webhookLevel || '';
            setChanOpen(!cfg.webhookUrl);
            $('#pg-dn-list').value = cfg.watchList.join(', ');
            $('#pg-dn-shiny').checked = cfg.notifyShiny;
            $('#pg-dn-all').checked = cfg.notifyEveryCapture;
            $('#pg-dn-tier').value = tierByKey(cfg.minTier) ? tierByKey(cfg.minTier).key : '';
            $('#pg-dn-miniv').value = cfg.minIv || 0;
            $('#pg-dn-tier-iv').value = cfg.minTierIv || 0;
            $('#pg-dn-mention').value = cfg.mentionUserId;
            $('#pg-dn-cooldown').value = cfg.cooldownSeconds;
            $('#pg-dn-ball').value = cfg.ballsWatch || 'auto';
            $('#pg-dn-ballsmin').value = cfg.ballsMin || 0;
            $('#pg-dn-autobuy').checked = Boolean(cfg.autoBuy);
            $('#pg-dn-autobuy-qty').value = cfg.autoBuyQty || 100;
            $('#pg-dn-sell').checked = Boolean(cfg.sellEnabled);
            $('#pg-dn-sell-min').value = cfg.sellEveryMin || 10;
            $('#pg-dn-sell-max').value = cfg.sellEveryMaxMin || '';
            loadItemsCatalog().then(() => { if (!panel.hidden) renderSellList(dirty ? readSellList() : null); });
            renderSellList();
            const lv = $('#pg-dn-level');
            lv.disabled = false; lv.value = cfg.levelAlertAt || 0; lv.dataset.own = String(cfg.levelAlertAt || 0);
            $('#pg-dn-level-swap').checked = Boolean(cfg.levelSwap);
            $('#pg-dn-route').value = routeList().map(r => `${r.slug} ${r.level}`).join('\n');
            $('#pg-dn-route-on').checked = Boolean(cfg.routeEnabled);
            renderTeam();
            $('#pg-dn-reload').checked = Boolean(cfg.reloadEnabled);
            $('#pg-dn-reload-min').value = cfg.reloadEveryMin || 60;
            $('#pg-dn-reload-max').value = cfg.reloadEveryMaxMin || '';
            renderReload();
            $('#pg-dn-debug').checked = cfg.debug;
            $('#pg-dn-import-box').hidden = true;
            renderLive();
        }

        // qualquer edição marca "não salvo" e recalcula resumos e badges
        const onEdit = (e) => {
            if (e.target.closest('#pg-dn-import-box')) return;
            if (!e.target.matches('input, select, textarea')) return;
            dirty = true;
            renderDirty();
            renderLive();
        };
        panel.querySelector('.dn-body').addEventListener('input', onEdit);
        panel.querySelector('.dn-body').addEventListener('change', onEdit);
        panel.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') { e.stopPropagation(); togglePanel(false); return; }
            if (e.key === 'Enter' && e.target.matches('input:not([type=checkbox])')) { e.preventDefault(); $('#pg-dn-save').click(); }
        });

        function togglePanel(force) {
            const open = typeof force === 'boolean' ? force : panel.hidden;
            if (open && !dirty) fill();     // com edição pendente, reabrir mantém o que estava na tela
            panel.hidden = !open;
            if (open) {
                showTab(cfg.webhookUrl ? (loadUi().tab || 'avisos') : 'avisos');
                renderLive();
                if (!cfg.webhookUrl) $('#pg-dn-hook').focus();
            }
            renderState();
        }
        btn.onclick = () => togglePanel();
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) togglePanel(false); });
        $('#pg-dn-close').onclick = () => togglePanel(false);

        // ---- Salvar (global; mantém os efeitos colaterais de antes) ----
        $('#pg-dn-save').onclick = () => {
            const { draft, linhasRuins } = readForm();
            const alvoAntes = levelTarget(), swapAntes = swapEnabled();
            const rotaAntes = JSON.stringify(routeList());
            const recargaAntes = JSON.stringify([cfg.reloadEnabled, cfg.reloadEveryMin, cfg.reloadEveryMaxMin]);
            Object.assign(cfg, draft);
            if (JSON.stringify(routeList()) !== rotaAntes) cfg.routeStage = 0; // rota editada: recomeça
            // Alvo ou troca mudaram: reavalia o time inteiro (antes, ligar a troca depois do aviso não fazia nada).
            if (levelTarget() !== alvoAntes || swapEnabled() !== swapAntes) { levelAlerted.clear(); swapPending = null; }
            lastPokesReqAt = 0; requestPokes(0);
            for (const k of Object.keys(ballAlerted)) delete ballAlerted[k]; // limite mudou: rearma
            for (const k of Object.keys(autoBuyAttempted)) delete autoBuyAttempted[k];
            requestBalls(0);
            drawSellDelay(); // faixa mudou: sorteia de novo
            saveHuntProfile();
            if (JSON.stringify([cfg.reloadEnabled, cfg.reloadEveryMin, cfg.reloadEveryMaxMin]) !== recargaAntes) scheduleReload(); // faixa mudou: sorteia de novo
            cfg.cfgVersion = 2;
            saveCfg(cfg);
            dirty = false;
            fill();
            const avisos = [];
            if (cfg.autoBuy && !cfg.ballsMin) avisos.push('⚠ Compra com limite 0: só compra quando a bola acabar.');
            if (linhasRuins.length) avisos.push(`⚠ Rota: ${linhasRuins.length} linha(s) ignorada(s) (formato "hunt nível"): ${linhasRuins.map(l => `"${l}"`).join(', ')}`);
            if (!cfg.webhookUrl) avisos.push('⚠ Sem canal de Capturas: capturas não serão enviadas.');
            const usaAlertas = [effectiveBallsMin() > 0 && 'bolas', cfg.sellEnabled && 'venda', routeActive() && 'troca de hunt'].filter(Boolean);
            if (usaAlertas.length && !cfg.webhookAlerts) avisos.push(`⚠ Sem canal de Alertas: avisos de ${usaAlertas.join(', ')} não serão enviados.`);
            if (levelEnabled() && !cfg.webhookLevel) avisos.push('⚠ Sem canal de Nível: avisos de nível/troca de líder não serão enviados.');
            const nivel = levelEnabled() ? ` · conferindo o time para o nível ${levelTarget()}${swapEnabled() ? ' (com troca)' : ''}…` : '';
            if (avisos.length) flash('✔ Salvo · ' + avisos.join(' '), 'warn');
            else flash('✔ Salvo' + nivel, 'ok', nivel ? 4000 : 2500);
        };

        // ---- Testar canais: salva SÓ os canais (o resto do formulário segue como rascunho) e envia um teste a cada um ----
        $('#pg-dn-test').onclick = () => {
            cfg.webhookUrl = $('#pg-dn-hook').value.trim();
            cfg.webhookShiny = $('#pg-dn-hook-shiny').value.trim();
            cfg.webhookAlerts = $('#pg-dn-hook-alerts').value.trim();
            cfg.webhookLevel = $('#pg-dn-hook-level').value.trim();
            saveCfg(cfg);
            if (!cfg.webhookUrl) {
                flash('⚠ Preencha o canal de Capturas primeiro.', 'warn');
                showTab('avisos'); setChanOpen(true); $('#pg-dn-hook').focus();
                return;
            }
            // capturas: sempre; shinys/alertas/nível: só se tiverem canal próprio
            sendDiscordNotification({ name: 'Dratini (teste)', shiny: false, level: 5, ivTotal: 150, quality: 1.35, ball: 'Ultra Ball' }, true);
            const canais = ['capturas'];
            if (cfg.webhookShiny) {
                canais.push('shinys');
                sendDiscordNotification({ name: 'Dratini (teste)', shiny: true, level: 5, ivTotal: 180, quality: 1.72, ball: 'Idle Ball' }, true);
            }
            if (cfg.webhookAlerts) {
                canais.push('alertas');
                postWebhook('alert', {
                    username: 'Poke Idle World',
                    embeds: [{ title: 'Teste: canal de alertas', description: 'Aqui chegarão estoque de bolas, compras, vendas e trocas de hunt.', color: 0xfee75c }],
                }, { test: true });
            }
            if (cfg.webhookLevel) {
                canais.push('nível');
                postWebhook('level', {
                    username: 'Poke Idle World',
                    embeds: [{ title: 'Teste: canal de nível', description: 'Aqui chegarão os avisos de nível atingido e troca de líder.', color: 0x5865f2 }],
                }, { test: true });
            }
            renderChannels(); renderState();
            flash(`✔ Canais salvos · teste enviado: ${canais.join(', ')}`, 'ok', 4000);
        };

        // Copia texto com fallback (o webview do PokeGrid às vezes nega navigator.clipboard).
        function copyText(txt) {
            const legacyCopy = () => {
                try {
                    const ta = document.createElement('textarea');
                    ta.value = txt;
                    ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
                    document.body.appendChild(ta);
                    ta.select();
                    const ok = document.execCommand('copy');
                    ta.remove();
                    return ok;
                } catch { return false; }
            };
            const clip = navigator.clipboard?.writeText ? navigator.clipboard.writeText(txt) : Promise.reject();
            return clip.then(() => true, () => legacyCopy());
        }

        $('#pg-dn-log').onclick = () => {
            const txt = localStorage.getItem(LOG_KEY) || '[]';
            copyText(txt).then(ok => {
                if (ok) flash('✔ Log copiado. Cole para quem for diagnosticar.', 'ok', 4000);
                else { console.log(TAG, 'LOG:', txt); flash('⚠ Não copiou; o log foi impresso no console.', 'warn'); }
            });
        };

        // ---- Exportar / importar configuração (para copiar entre contas/painéis) ----
        $('#pg-dn-export').onclick = () => {
            const txt = JSON.stringify(Object.assign({ _piwDiscordNotify: cfg.cfgVersion || 2 }, cfg));
            copyText(txt).then(ok => {
                if (ok) flash('✔ Config copiada (inclui os canais). Na outra conta: Sistema → Importar config.', 'ok', 7000);
                else { $('#pg-dn-import-box').hidden = false; $('#pg-dn-import-text').value = txt; flash('⚠ Não copiou; a config apareceu na caixa abaixo — copie de lá.', 'warn'); }
            });
        };
        $('#pg-dn-import').onclick = () => {
            const box = $('#pg-dn-import-box');
            box.hidden = !box.hidden;
            if (!box.hidden) { $('#pg-dn-import-text').value = ''; $('#pg-dn-import-text').focus(); }
        };
        $('#pg-dn-import-apply').onclick = () => {
            let data;
            try { data = JSON.parse($('#pg-dn-import-text').value.trim()); }
            catch { flash('✖ Não é uma config válida.', 'error'); return; }
            if (!data || typeof data !== 'object' || Array.isArray(data) || !('webhookUrl' in data)) { flash('✖ Isso não parece uma config deste script.', 'error'); return; }
            delete data._piwDiscordNotify;
            const keepHooks = $('#pg-dn-import-keephooks').checked;
            const mine = { webhookUrl: cfg.webhookUrl, webhookShiny: cfg.webhookShiny, webhookAlerts: cfg.webhookAlerts, webhookLevel: cfg.webhookLevel };
            cfg = Object.assign({}, DEFAULTS, data);
            if (keepHooks) Object.assign(cfg, mine);
            cfg.cfgVersion = 2;
            saveCfg(cfg);
            for (const k of Object.keys(ballAlerted)) delete ballAlerted[k];
            for (const k of Object.keys(autoBuyAttempted)) delete autoBuyAttempted[k];
            drawSellDelay();
            scheduleReload();
            loadHuntProfile();
            dirty = false;
            fill();
            flash('✔ Config importada e salva.', 'ok', 4000);
        };

        $('#pg-dn-sell-now').onclick = () => {
            cfg.sellItems = readSellList();
            saveHuntProfile();
            saveCfg(cfg);
            flash('⏳ Lista salva. Vendendo…', 'info', 30000);
            runSellCycle(true).then(r => {
                if (r.ok) flash(`✔ Vendeu ${r.total} itens · +${fmtNum(r.ganho)} gold`, 'ok', 6000);
                else flash(`✖ Não vendeu: ${r.motivo}`, 'error');
                renderSellList(dirty ? readSellList() : null);
            });
        };

        renderState();
    }

    loadResume(); // antes do painel e dos timers: restaura o que a carga anterior guardou
    if (cfg.reloadEnabled) scheduleReload();
    buildUI();
    setInterval(() => requestBalls(0), BALLS_POLL_MS);
    setInterval(() => requestPokes(0), POKES_POLL_MS);
    setInterval(sellTick, SELL_CHECK_MS);
    setInterval(reloadTick, RELOAD_CHECK_MS);

    console.log(TAG, `v${VERSION} ativo.`, 'Watch list:', cfg.watchList.join(', ') || '(vazia)',
        '| toda captura:', cfg.notifyEveryCapture, '| shiny:', cfg.notifyShiny,
        '| raridade mín.:', cfg.minTier ? `${cfg.minTier}${cfg.minTierIv ? ` com poder ${cfg.minTierIv}+` : ''}` : '(nenhuma)', '| poder mín.:', cfg.minIv || 0,
        '| alerta bolas:', effectiveBallsMin() ? `${cfg.ballsWatch} < ${effectiveBallsMin()}` : 'desligado',
        '| compra auto:', cfg.autoBuy ? `${cfg.autoBuyQty} un.` : 'não',
        '| nível:', levelEnabled() ? `${levelTarget()}${swapEnabled() ? ' + troca' : ''}` : 'não',
        '| rota:', routeActive() ? routeStatus() : 'não',
        '| venda auto:', cfg.sellEnabled ? `${Object.keys(cfg.sellItems || {}).length} itens / ${cfg.sellEveryMin}${cfg.sellEveryMaxMin > cfg.sellEveryMin ? `–${cfg.sellEveryMaxMin}` : ''} min` : 'não',
        '| recarga auto:', cfg.reloadEnabled ? `${cfg.reloadEveryMin}${cfg.reloadEveryMaxMin > cfg.reloadEveryMin ? `–${cfg.reloadEveryMaxMin}` : ''} min` : 'não');
})();
