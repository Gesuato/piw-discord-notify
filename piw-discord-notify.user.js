// ==UserScript==
// @name         PIW Discord Capture Notify
// @namespace    piw-discord-notify
// @version      2.0.0
// @author       Gesuato
// @description  Notifica um webhook do Discord quando você captura um Pokémon específico (ou shiny) no Poke Idle World. Feito para o injetor de scripts do PokeGrid.
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
        try { return (document.querySelector('.phud-name')?.textContent || '').trim(); }
        catch { return ''; }
    }

    // O payload exato pode variar entre versões do jogo, então procuramos
    // o nome/flags em vários caminhos comuns.
    function extractPokemonInfo(message) {
        const candidates = [
            message?.pokemon,
            message?.poke,
            message?.data?.pokemon,
            message?.data?.poke,
            message?.data,
            message?.result,
            message,
        ];
        for (const obj of candidates) {
            if (!obj || typeof obj !== 'object') continue;
            const name = obj.name || obj.pokemonName || obj.slug || obj.species;
            if (name && typeof name === 'string') {
                return {
                    name,
                    shiny: Boolean(obj.shiny || obj.isShiny || message?.shiny),
                    level: obj.level ?? obj.lvl ?? null,
                };
            }
        }
        return null;
    }

    function looksLikeCaptureMessage(message) {
        const type = normalize(message?.type);
        if (!type) return false;
        // 'catch-result' é o tipo conhecido; os demais padrões cobrem variações.
        return /catch|capture|caught/.test(type);
    }

    // Se o payload tiver um campo indicando sucesso/falha, respeitamos.
    function captureSucceeded(message) {
        const flags = [
            message?.success, message?.caught, message?.captured,
            message?.data?.success, message?.data?.caught,
            message?.result?.success, message?.result?.caught,
        ];
        for (const f of flags) {
            if (f === false) return false;
            if (f === true) return true;
        }
        return true; // sem campo explícito, assume sucesso
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
                if (cfg.debug) console.log(TAG, 'Cooldown ativo, aviso suprimido:', key);
                return;
            }
            lastNotifyAt.set(key, now);
        }

        const mention = cfg.mentionUserId ? `<@${cfg.mentionUserId}> ` : '';
        const shinyTag = info.shiny ? ' ✨ SHINY ✨' : '';
        const levelTxt = info.level != null ? ` (nível ${info.level})` : '';
        const who = playerName();

        const payload = {
            content: `${mention}🎉 ${who ? `**${who}** capturou` : 'Você capturou'} **${info.name}**${levelTxt}!${shinyTag}`,
            username: 'Poke Idle World',
            embeds: [{
                title: `${isTest ? 'Teste: ' : 'Captura: '}${info.name}${shinyTag}`,
                description: (who ? `Conta: ${who}\n` : '') + `Em ${new Date().toLocaleString('pt-BR')}`,
                color: info.shiny ? 0xffd700 : 0x57f287,
            }],
        };

        fetch(cfg.webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        }).then(res => {
            if (!res.ok) console.warn(TAG, 'Discord respondeu com erro:', res.status);
            else if (cfg.debug || isTest) console.log(TAG, 'Notificação enviada:', info.name);
        }).catch(err => console.warn(TAG, 'Falha ao enviar webhook:', err));
    }

    // ---- Lógica principal -------------------------------------------

    function handleGameMessage(rawData) {
        let message;
        try { message = JSON.parse(rawData); }
        catch { return; }
        if (!looksLikeCaptureMessage(message)) return;

        if (cfg.debug) console.log(TAG, 'Mensagem de captura detectada:', message);
        if (!captureSucceeded(message)) return;

        const info = extractPokemonInfo(message);
        if (!info) {
            if (cfg.debug) console.warn(TAG, 'Não consegui extrair o nome do pokémon:', message);
            return;
        }

        const name = normalize(info.name);
        const inWatchList = cfg.watchList.map(normalize).includes(name);
        const shouldNotify =
            cfg.notifyEveryCapture ||
            inWatchList ||
            (cfg.notifyShiny && info.shiny);

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
        if (cfg.debug) console.log(TAG, 'Socket do jogo rastreado:', ws.url);
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
            <div style="margin-top:6px">Pokémon (separados por vírgula):
                <input id="pg-dn-list" type="text" placeholder="dratini, larvitar, beldum"
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

        // sem webhook configurado ainda: chama atenção pro botão
        if (!cfg.webhookUrl) flashButton();
    }

    buildUI();

    console.log(TAG, 'v2.0.0 ativo. Watch list:', cfg.watchList.join(', ') || '(vazia)',
        '| toda captura:', cfg.notifyEveryCapture, '| shiny:', cfg.notifyShiny);
})();
