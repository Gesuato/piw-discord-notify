// ==UserScript==
// @name         PIW Discord Capture Notify
// @namespace    piw-discord-notify
// @version      2.1.0
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
        webhookUrl: '',
        watchList: [],          // nomes em minúsculas, ex.: ['dratini', 'larvitar']
        notifyEveryCapture: false,
        notifyShiny: true,
        mentionUserId: '',      // seu ID de usuário do Discord, opcional
        cooldownSeconds: 30,    // intervalo mínimo entre avisos do mesmo pokémon
        debug: false,
    };

    function loadCfg() {
        try { return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(LS_KEY) || '{}')); }
        catch { return Object.assign({}, DEFAULTS); }
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

    function sendDiscordNotification(info, isTest) {
        if (!cfg.webhookUrl) {
            console.warn(TAG, 'Webhook não configurado. Clique no 🔔 para configurar.');
            flashButton();
            return;
        }

        if (!isTest) {
            const key = normalize(info.name) + (info.shiny ? ':shiny' : '');
            const now = Date.now();
            if (now - (lastNotifyAt.get(key) || 0) < cfg.cooldownSeconds * 1000) {
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
        const who = playerName();

        const payload = {
            content: `${mention}🎉 ${who ? `**${who}** capturou` : 'Você capturou'} **${info.name}**${levelTxt}!${shinyTag}`,
            username: 'Poke Idle World',
            embeds: [{
                title: `${isTest ? 'Teste: ' : 'Captura: '}${info.name}${shinyTag}`,
                description: (who ? `Conta: ${who}\n` : '') + `Em ${new Date().toLocaleString('pt-BR')}` + ballTxt + autoTxt,
                color: info.shiny ? 0xffd700 : 0x57f287,
            }],
        };

        fetch(cfg.webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        }).then(res => {
            if (!res.ok) { console.warn(TAG, 'Discord respondeu com erro:', res.status); logEvent('webhook-erro', { status: res.status, name: info.name }); }
            else logEvent('webhook-ok', { name: info.name, test: Boolean(isTest) });
        }).catch(err => { console.warn(TAG, 'Falha ao enviar webhook:', err); logEvent('webhook-falha', { erro: String(err), name: info.name }); });
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

        if (message.type !== 'catch-result') return;

        logEvent('catch-result', message);
        if (message.success !== true) return;

        const info = extractPokemonInfo(message);
        if (!info) {
            logEvent('sem-nome', message);
            return;
        }

        const name = normalize(info.name);
        // lista vazia = notificar qualquer captura
        const inWatchList = cfg.watchList.length === 0 ||
            cfg.watchList.map(normalize).includes(name);
        const shouldNotify =
            cfg.notifyEveryCapture ||
            inWatchList ||
            (cfg.notifyShiny && info.shiny);

        logEvent('decisao', { name: info.name, shiny: info.shiny, level: info.level, notificar: shouldNotify });
        if (shouldNotify) sendDiscordNotification(info, false);
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
        logEvent('socket', { url: ws.url });
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
            + 'width:300px;padding:12px;border-radius:10px;border:1px solid #444;'
            + 'background:#2b2d31;color:#eee;font:13px/1.5 sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.5);';
        panel.innerHTML = `
            <b>🔔 Discord Capture Notify</b>
            <div style="margin-top:8px">URL do webhook:
                <input id="pg-dn-hook" type="password" placeholder="https://discord.com/api/webhooks/..."
                    style="width:100%;box-sizing:border-box;margin-top:2px;background:#1e1f22;color:#eee;border:1px solid #555;border-radius:4px;padding:4px"></div>
            <div style="margin-top:6px">Pokémon (separados por vírgula; vazio = avisar TODAS as capturas):
                <input id="pg-dn-list" type="text" placeholder="dratini, larvitar (vazio = todas)"
                    style="width:100%;box-sizing:border-box;margin-top:2px;background:#1e1f22;color:#eee;border:1px solid #555;border-radius:4px;padding:4px"></div>
            <label style="display:block;margin-top:6px"><input id="pg-dn-shiny" type="checkbox"> Avisar todo shiny</label>
            <label style="display:block"><input id="pg-dn-all" type="checkbox"> Avisar TODA captura</label>
            <div style="margin-top:6px">Mencionar (ID do Discord, opcional):
                <input id="pg-dn-mention" type="text" placeholder="123456789012345678"
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
            $('#pg-dn-list').value = cfg.watchList.join(', ');
            $('#pg-dn-shiny').checked = cfg.notifyShiny;
            $('#pg-dn-all').checked = cfg.notifyEveryCapture;
            $('#pg-dn-mention').value = cfg.mentionUserId;
            $('#pg-dn-debug').checked = cfg.debug;
        }

        btn.onclick = () => {
            const aberto = panel.style.display !== 'none';
            panel.style.display = aberto ? 'none' : 'block';
            if (!aberto) fill();
        };

        $('#pg-dn-save').onclick = () => {
            cfg.webhookUrl = $('#pg-dn-hook').value.trim();
            cfg.watchList = $('#pg-dn-list').value.split(',').map(normalize).filter(Boolean);
            cfg.notifyShiny = $('#pg-dn-shiny').checked;
            cfg.notifyEveryCapture = $('#pg-dn-all').checked;
            cfg.mentionUserId = $('#pg-dn-mention').value.trim();
            cfg.debug = $('#pg-dn-debug').checked;
            saveCfg(cfg);
            $('#pg-dn-msg').textContent = '✔ Salvo!';
            setTimeout(() => { $('#pg-dn-msg').textContent = ''; }, 2500);
        };

        $('#pg-dn-test').onclick = () => {
            cfg.webhookUrl = $('#pg-dn-hook').value.trim();
            sendDiscordNotification({ name: 'Dratini (teste)', shiny: false, level: 5 }, true);
            $('#pg-dn-msg').textContent = cfg.webhookUrl ? '📤 Teste enviado, veja o Discord.' : '⚠ Preencha o webhook primeiro.';
            setTimeout(() => { $('#pg-dn-msg').textContent = ''; }, 4000);
        };

        $('#pg-dn-log').onclick = () => {
            const txt = localStorage.getItem(LOG_KEY) || '[]';
            const done = () => { $('#pg-dn-msg').textContent = '📋 Log copiado (cole para quem for diagnosticar).'; };
            const fail = () => { console.log(TAG, 'LOG:', txt); $('#pg-dn-msg').textContent = '⚠ Não copiou; o log foi impresso no console.'; };
            (navigator.clipboard?.writeText(txt) || Promise.reject()).then(done, fail);
            setTimeout(() => { $('#pg-dn-msg').textContent = ''; }, 4000);
        };

        // sem webhook configurado ainda: chama atenção pro botão
        if (!cfg.webhookUrl) flashButton();
    }

    buildUI();

    console.log(TAG, 'v2.1.0 ativo. Watch list:', cfg.watchList.join(', ') || '(vazia)',
        '| toda captura:', cfg.notifyEveryCapture, '| shiny:', cfg.notifyShiny);
})();
