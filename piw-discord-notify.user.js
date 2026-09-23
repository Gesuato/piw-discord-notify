// ==UserScript==
// @name         PIW Discord Capture Notify
// @namespace    piw-discord-notify
// @version      2.4.0
// @author       Gesuato
// @description  Notifica um webhook do Discord quando você captura um Pokémon (todos, uma lista ou shinys) no Poke Idle World. Feito para o injetor de scripts do PokeGrid.
// @match        https://poke.idleworld.online/play
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const TAG = '[PIW-DiscordNotify]';
    const LS_KEY = 'pgDiscordNotifyCfg';

    // ---- Configuração (persistida no localStorage do painel) --------
    // Clique no botão 🔔 no canto inferior esquerdo do jogo para
    // configurar webhook, lista de Pokémon, shiny etc.

    const DEFAULTS = {
        webhookUrl: '',         // canal principal (capturas); os outros caem nele se vazios
        webhookShiny: '',       // canal só para capturas shiny (opcional)
        webhookAlerts: '',      // canal para alertas: shiny na fila, estoque, quedas... (opcional)
        watchList: [],          // nomes em minúsculas, ex.: ['dratini', 'larvitar']
        notifyEveryCapture: false,
        notifyShiny: true,
        minTier: '',            // raridade mínima ('' = sem filtro): weak, common, ... divine
        minIv: 0,               // poder mínimo (ivTotal 0..192); 0 = sem filtro
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

    // Filtro de raridade/poder (cfg.minTier / cfg.minIv). Regra:
    //   - nenhum dos dois configurado           -> passa tudo;
    //   - raridade >= mínima                    -> passa (independe do poder);
    //   - senão, poder (ivTotal) >= mínimo      -> passa;
    //   - sem dados de qualidade (timeout)      -> passa, para não perder um raro.
    function passesQualityFilter(info) {
        const minTier = tierByKey(cfg.minTier);
        const minIv = Number(cfg.minIv) || 0;
        if (!minTier && minIv <= 0) return { ok: true, motivo: 'sem filtro de qualidade' };
        const tier = qualityTier(info.quality);
        if (tier == null && info.ivTotal == null) return { ok: true, motivo: 'sem dados de qualidade' };
        if (minTier && tier && tier.rank >= minTier.rank) return { ok: true, motivo: `raridade ${tier.name} >= ${minTier.name}` };
        if (minIv > 0 && info.ivTotal != null && info.ivTotal >= minIv) return { ok: true, motivo: `poder ${info.ivTotal} >= ${minIv}` };
        return { ok: false, motivo: `abaixo do mínimo (raridade ${tier ? tier.name : '?'}, poder ${info.ivTotal ?? '?'})` };
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
    //   alert   -> webhookAlerts (vazio: webhookUrl)  [eventos futuros, ver ROADMAP.md]
    const WEBHOOK_KINDS = {
        capture: { key: 'webhookUrl', label: 'capturas' },
        shiny: { key: 'webhookShiny', label: 'shinys' },
        alert: { key: 'webhookAlerts', label: 'alertas' },
    };
    function webhookFor(kind) {
        const k = WEBHOOK_KINDS[kind] || WEBHOOK_KINDS.capture;
        return (cfg[k.key] || '').trim() || (cfg.webhookUrl || '').trim();
    }

    function postWebhook(kind, payload, meta) {
        const url = webhookFor(kind);
        if (!url) {
            console.warn(TAG, 'Webhook não configurado. Clique no 🔔 para configurar.');
            flashButton();
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
        if (message.type === 'pokes' && Array.isArray(message.list)) { handlePokesList(message.list); return; }

        if (message.type !== 'catch-result') return;

        logEvent('catch-result', message);
        if (message.success !== true) return;

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
        return nativeSend.call(this, data);
    };

    // ---- Painel de configurações (botão 🔔) --------------------------

    let btn;
    function flashButton() {
        if (!btn) return;
        btn.style.boxShadow = '0 0 12px 4px #f04747';
        setTimeout(() => { btn.style.boxShadow = ''; }, 3000);
    }

    function buildUI() {
        if (document.getElementById('pg-dn-btn')) return;
        if (!document.body) { setTimeout(buildUI, 500); return; }

        btn = document.createElement('button');
        btn.id = 'pg-dn-btn';
        btn.textContent = '🔔';
        btn.title = 'Notificações no Discord — configurar';
        btn.style.cssText = 'position:fixed;bottom:12px;left:12px;z-index:99999;'
            + 'width:38px;height:38px;border-radius:50%;border:1px solid #444;'
            + 'background:#2b2d31;color:#fff;font-size:18px;cursor:pointer;opacity:.85;';

        const panel = document.createElement('div');
        panel.id = 'pg-dn-panel';
        panel.style.cssText = 'position:fixed;bottom:58px;left:12px;z-index:99999;display:none;'
            + 'width:320px;max-height:90vh;overflow:auto;padding:12px;border-radius:10px;border:1px solid #444;'
            + 'background:#2b2d31;color:#eee;font:13px/1.5 sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.5);';
        panel.innerHTML = `
            <b>🔔 Discord Capture Notify</b>
            <div style="margin-top:8px">Webhook de capturas (principal):
                <input id="pg-dn-hook" type="password" placeholder="https://discord.com/api/webhooks/..."
                    style="width:100%;box-sizing:border-box;margin-top:2px;background:#1e1f22;color:#eee;border:1px solid #555;border-radius:4px;padding:4px"></div>
            <div style="margin-top:6px">Webhook de shinys <span style="color:#aaa">(opcional; vazio = usa o principal)</span>:
                <input id="pg-dn-hook-shiny" type="password" placeholder="https://discord.com/api/webhooks/..."
                    style="width:100%;box-sizing:border-box;margin-top:2px;background:#1e1f22;color:#eee;border:1px solid #555;border-radius:4px;padding:4px"></div>
            <div style="margin-top:6px">Webhook de alertas <span style="color:#aaa">(opcional; shiny na fila, estoque, quedas — em breve)</span>:
                <input id="pg-dn-hook-alerts" type="password" placeholder="https://discord.com/api/webhooks/..."
                    style="width:100%;box-sizing:border-box;margin-top:2px;background:#1e1f22;color:#eee;border:1px solid #555;border-radius:4px;padding:4px"></div>
            <div style="margin-top:6px">Pokémon (separados por vírgula; vazio = avisar TODAS as capturas):
                <input id="pg-dn-list" type="text" placeholder="dratini, larvitar (vazio = todas)"
                    style="width:100%;box-sizing:border-box;margin-top:2px;background:#1e1f22;color:#eee;border:1px solid #555;border-radius:4px;padding:4px"></div>
            <label style="display:block;margin-top:6px"><input id="pg-dn-shiny" type="checkbox"> Avisar todo shiny</label>
            <label style="display:block"><input id="pg-dn-all" type="checkbox"> Avisar TODA captura</label>
            <div style="margin-top:8px;padding:8px;border:1px solid #444;border-radius:6px">
                <b>Filtro de qualidade</b> <span style="color:#aaa">(nada marcado = avisa tudo)</span>
                <div style="margin-top:4px">Raridade mínima:
                    <select id="pg-dn-tier" style="width:100%;box-sizing:border-box;margin-top:2px;background:#1e1f22;color:#eee;border:1px solid #555;border-radius:4px;padding:4px">
                        <option value="">(qualquer)</option>
                        ${TIERS_ASC.map(t => `<option value="${t.key}">${t.name} (${t.min === -Infinity ? '< 1.0' : t.min.toFixed(1) + '+'})</option>`).join('')}
                    </select></div>
                <div style="margin-top:4px">Poder mínimo (0–${IV_MAX}; 0 = desligado):
                    <input id="pg-dn-miniv" type="number" min="0" max="${IV_MAX}" step="1"
                        style="width:100%;box-sizing:border-box;margin-top:2px;background:#1e1f22;color:#eee;border:1px solid #555;border-radius:4px;padding:4px"></div>
                <div style="margin-top:4px;color:#aaa;font-size:12px">Avisa se a raridade for ≥ a escolhida <b>ou</b> o poder for ≥ o mínimo. Shiny sempre avisa se a opção acima estiver marcada.</div>
            </div>
            <div style="margin-top:6px">Mencionar (ID do Discord, opcional):
                <input id="pg-dn-mention" type="text" placeholder="123456789012345678"
                    style="width:100%;box-sizing:border-box;margin-top:2px;background:#1e1f22;color:#eee;border:1px solid #555;border-radius:4px;padding:4px"></div>
            <div style="margin-top:6px">Intervalo mínimo entre avisos do mesmo Pokémon (segundos; 0 = avisar todas):
                <input id="pg-dn-cooldown" type="number" min="0" step="1"
                    style="width:100%;box-sizing:border-box;margin-top:2px;background:#1e1f22;color:#eee;border:1px solid #555;border-radius:4px;padding:4px"></div>
            <label style="display:block;margin-top:6px"><input id="pg-dn-debug" type="checkbox"> Debug (log no console)</label>
            <div style="margin-top:10px;display:flex;gap:6px">
                <button id="pg-dn-save" style="flex:1;background:#5865f2;color:#fff;border:0;border-radius:4px;padding:6px;cursor:pointer">Salvar</button>
                <button id="pg-dn-test" style="flex:1;background:#3a3c42;color:#fff;border:0;border-radius:4px;padding:6px;cursor:pointer">Testar</button>
                <button id="pg-dn-log" title="Copia os últimos eventos (para diagnóstico)" style="flex:1;background:#3a3c42;color:#fff;border:0;border-radius:4px;padding:6px;cursor:pointer">Copiar log</button>
            </div>
            <div id="pg-dn-msg" style="margin-top:6px;color:#8f9;min-height:16px"></div>`;

        document.body.appendChild(btn);
        document.body.appendChild(panel);

        const $ = (id) => panel.querySelector(id);
        function fill() {
            $('#pg-dn-hook').value = cfg.webhookUrl;
            $('#pg-dn-hook-shiny').value = cfg.webhookShiny || '';
            $('#pg-dn-hook-alerts').value = cfg.webhookAlerts || '';
            $('#pg-dn-list').value = cfg.watchList.join(', ');
            $('#pg-dn-shiny').checked = cfg.notifyShiny;
            $('#pg-dn-all').checked = cfg.notifyEveryCapture;
            $('#pg-dn-tier').value = tierByKey(cfg.minTier) ? tierByKey(cfg.minTier).key : '';
            $('#pg-dn-miniv').value = cfg.minIv || 0;
            $('#pg-dn-mention').value = cfg.mentionUserId;
            $('#pg-dn-cooldown').value = cfg.cooldownSeconds;
            $('#pg-dn-debug').checked = cfg.debug;
        }

        btn.onclick = () => {
            const aberto = panel.style.display !== 'none';
            panel.style.display = aberto ? 'none' : 'block';
            if (!aberto) fill();
        };

        $('#pg-dn-save').onclick = () => {
            cfg.webhookUrl = $('#pg-dn-hook').value.trim();
            cfg.webhookShiny = $('#pg-dn-hook-shiny').value.trim();
            cfg.webhookAlerts = $('#pg-dn-hook-alerts').value.trim();
            cfg.watchList = $('#pg-dn-list').value.split(',').map(normalize).filter(Boolean);
            cfg.notifyShiny = $('#pg-dn-shiny').checked;
            cfg.notifyEveryCapture = $('#pg-dn-all').checked;
            cfg.minTier = $('#pg-dn-tier').value;
            cfg.minIv = Math.min(IV_MAX, Math.max(0, parseInt($('#pg-dn-miniv').value, 10) || 0));
            cfg.mentionUserId = $('#pg-dn-mention').value.trim();
            cfg.cooldownSeconds = Math.max(0, parseInt($('#pg-dn-cooldown').value, 10) || 0);
            cfg.cfgVersion = 2;
            cfg.debug = $('#pg-dn-debug').checked;
            saveCfg(cfg);
            $('#pg-dn-msg').textContent = '✔ Salvo!';
            setTimeout(() => { $('#pg-dn-msg').textContent = ''; }, 2500);
        };

        $('#pg-dn-test').onclick = () => {
            cfg.webhookUrl = $('#pg-dn-hook').value.trim();
            cfg.webhookShiny = $('#pg-dn-hook-shiny').value.trim();
            cfg.webhookAlerts = $('#pg-dn-hook-alerts').value.trim();
            if (!cfg.webhookUrl) {
                $('#pg-dn-msg').textContent = '⚠ Preencha o webhook principal primeiro.';
                setTimeout(() => { $('#pg-dn-msg').textContent = ''; }, 4000);
                return;
            }
            // capturas: sempre; shinys/alertas: só se tiverem webhook próprio
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
                    embeds: [{ title: 'Teste: canal de alertas', description: 'Aqui chegarão shiny na fila, estoque de bolas, quedas de conexão etc.', color: 0xfee75c }],
                }, { test: true });
            }
            $('#pg-dn-msg').textContent = `📤 Teste enviado para: ${canais.join(', ')}.`;
            setTimeout(() => { $('#pg-dn-msg').textContent = ''; }, 4000);
        };

        $('#pg-dn-log').onclick = () => {
            const txt = localStorage.getItem(LOG_KEY) || '[]';
            const done = () => { $('#pg-dn-msg').textContent = '📋 Log copiado (cole para quem for diagnosticar).'; };
            const fail = () => { console.log(TAG, 'LOG:', txt); $('#pg-dn-msg').textContent = '⚠ Não copiou; o log foi impresso no console.'; };
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
            clip.then(done, () => (legacyCopy() ? done() : fail()));
            setTimeout(() => { $('#pg-dn-msg').textContent = ''; }, 4000);
        };

        // sem webhook configurado ainda: chama atenção pro botão
        if (!cfg.webhookUrl) flashButton();
    }

    buildUI();

    console.log(TAG, 'v2.4.0 ativo. Watch list:', cfg.watchList.join(', ') || '(vazia)',
        '| toda captura:', cfg.notifyEveryCapture, '| shiny:', cfg.notifyShiny,
        '| raridade mín.:', cfg.minTier || '(nenhuma)', '| poder mín.:', cfg.minIv || 0);
})();
