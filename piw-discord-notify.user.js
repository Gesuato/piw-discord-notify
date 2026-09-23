// ==UserScript==
// @name         PIW Discord Capture Notify
// @namespace    piw-discord-notify
// @version      3.0.1
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
        ballsMin: 0,            // alerta quando a bola monitorada ficar abaixo disto; 0 = desligado
        ballsWatch: 'auto',     // 'auto' = bola do último catch-result, ou o id da bola ('4')
        autoBuy: false,         // comprar a bola monitorada quando ficar abaixo do limite
        autoBuyQty: 100,        // quantas comprar por vez (1..10000)
        autoBuyGoldReserve: 0,  // nunca deixar o gold abaixo disto
        sellEnabled: false,     // vender drops marcados da hunt atual periodicamente
        sellEveryMin: 10,       // intervalo mínimo da venda automática (minutos)
        sellEveryMaxMin: 0,     // intervalo máximo; 0 ou <= mínimo = intervalo fixo. Entre os dois é sorteado
        sellItems: {},          // lista BRANCA: itemId -> { keep: N } (manter pelo menos N)
        sellProfiles: {},       // por hunt: slug -> { items, everyMin, everyMaxMin } (carregado ao entrar)
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

    // ---- Alerta de estoque de bolas -------------------------------------
    //
    //   balls     -> { type:'balls', counts:{ '<ballId>': qty, ... } }   (resposta a balls-get)
    //   balls-get -> pedido do cliente. O jogo não garante mandar `balls` sozinho,
    //                então pedimos: ao rastrear o socket, logo após cada captura e
    //                a cada BALLS_POLL_MS.
    // Avisa UMA vez quando a quantidade cruza para baixo de cfg.ballsMin e rearma
    // quando volta a ficar >= (compra/refil). Tudo desligado se ballsMin = 0.

    const BALL_NAMES = { 1: 'Poke Ball', 2: 'Great Ball', 3: 'Super Ball', 4: 'Ultra Ball', 6: 'Idle Ball' };
    const BALLS_POLL_MS = 5 * 60 * 1000;
    const BALLS_AFTER_CATCH_MS = 1500;
    const BALLS_AFTER_SOCKET_MS = 3000;

    let lastBallId = null;          // bola usada no último catch-result
    let ballCounts = {};            // ballId -> qty (último frame `balls`)
    const ballAlerted = {};         // ballId -> true enquanto estiver abaixo do limite
    let ballsRequestTimer = null;

    function ballName(id) { return BALL_NAMES[id] || `Ball ${id}`; }
    function ballsEnabled() { return (Number(cfg.ballsMin) || 0) > 0; }

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
        logEvent('balls', { counts, monitorando: id, limite: cfg.ballsMin || 0 });
        checkBallStock();
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

        const reserve = Math.max(0, Number(cfg.autoBuyGoldReserve) || 0);
        let remaining = Math.min(BUY_MAX_QTY, Math.max(1, Math.floor(Number(qty) || 0)));
        let bought = 0, spent = 0, motivo = null;
        while (remaining > 0) {
            const batch = Math.min(BUY_BATCH_QTY, remaining);
            if (gold - price * batch < reserve) {
                motivo = `gold insuficiente (tem ${gold.toLocaleString('pt-BR')}, precisa ${(price * batch + reserve).toLocaleString('pt-BR')})`;
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
    // Regras fixas (não configuráveis): só categoria `loot`; nunca `rare: true`, nunca nome com
    // "Pheromone"/"Stone", nunca preço 0, nunca item com cadeado. Lista BRANCA por item + reserva.

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

    // Motivo pelo qual um item NÃO pode ser vendido, ou null se pode.
    function protectedReason(item) {
        if (!item) return 'desconhecido no catálogo';
        if (item.category && item.category !== 'loot') return `categoria ${item.category}`;
        if (item.rare === true) return 'raro';
        if (PROTECTED_NAME.test(String(item.name || ''))) return 'nome protegido';
        if (!(Number(item.npcPrice) > 0)) return 'NPC não compra';
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
        const min = Number(cfg.ballsMin) || 0;
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
        if (message.type === 'field-kill') { handleFieldKill(message); return; }
        if (message.type === 'balls' && message.counts && typeof message.counts === 'object') { handleBalls(message); return; }
        if (message.type === 'pokes' && Array.isArray(message.list)) { handlePokesList(message.list); return; }

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
            <div style="margin-top:8px;padding:8px;border:1px solid #444;border-radius:6px">
                <b>Alerta de bolas</b> <span style="color:#aaa">(vai para o webhook de alertas)</span>
                <div style="margin-top:4px">Bola monitorada:
                    <select id="pg-dn-ball" style="width:100%;box-sizing:border-box;margin-top:2px;background:#1e1f22;color:#eee;border:1px solid #555;border-radius:4px;padding:4px">
                        <option value="auto">Automática (a do último catch)</option>
                        ${Object.entries(BALL_NAMES).map(([id, n]) => `<option value="${id}">${n}</option>`).join('')}
                    </select></div>
                <div style="margin-top:4px">Avisar quando restarem menos de (0 = desligado):
                    <input id="pg-dn-ballsmin" type="number" min="0" step="1"
                        style="width:100%;box-sizing:border-box;margin-top:2px;background:#1e1f22;color:#eee;border:1px solid #555;border-radius:4px;padding:4px"></div>
                <div style="margin-top:4px;color:#aaa;font-size:12px">Avisa uma vez ao ficar abaixo do limite e de novo só depois de repor. O estoque é checado após cada captura e a cada 5 min.</div>
                <label style="display:block;margin-top:6px"><input id="pg-dn-autobuy" type="checkbox"> Comprar automaticamente na loja em vez de só avisar</label>
                <div style="display:flex;gap:6px;margin-top:4px">
                    <div style="flex:1">Quantidade por compra:
                        <input id="pg-dn-autobuy-qty" type="number" min="1" max="${BUY_MAX_QTY}" step="1"
                            style="width:100%;box-sizing:border-box;margin-top:2px;background:#1e1f22;color:#eee;border:1px solid #555;border-radius:4px;padding:4px"></div>
                    <div style="flex:1">Reserva de gold:
                        <input id="pg-dn-autobuy-reserve" type="number" min="0" step="1000"
                            style="width:100%;box-sizing:border-box;margin-top:2px;background:#1e1f22;color:#eee;border:1px solid #555;border-radius:4px;padding:4px"></div>
                </div>
                <div style="margin-top:4px;color:#aaa;font-size:12px">Compra com o gold da conta (mesma loja do NPC). Uma tentativa por vez; se faltar gold ou der erro, avisa e só tenta de novo depois de repor ou salvar.</div>
            </div>
            <div style="margin-top:8px;padding:8px;border:1px solid #444;border-radius:6px">
                <b>Venda automática</b> <span style="color:#aaa">(drops da hunt atual → NPC; aviso no webhook de alertas)</span>
                <label style="display:block;margin-top:4px"><input id="pg-dn-sell" type="checkbox"> Vender automaticamente a cada
                    <input id="pg-dn-sell-min" type="number" min="1" step="1" style="width:52px;background:#1e1f22;color:#eee;border:1px solid #555;border-radius:4px;padding:2px 4px"> a
                    <input id="pg-dn-sell-max" type="number" min="0" step="1" style="width:52px;background:#1e1f22;color:#eee;border:1px solid #555;border-radius:4px;padding:2px 4px"> min
                    <span style="color:#aaa;font-size:12px">(sorteado na faixa; deixe o 2º vazio para fixo)</span></label>
                <div id="pg-dn-sell-hunt" style="margin-top:4px;color:#aaa;font-size:12px"></div>
                <div id="pg-dn-sell-list" style="margin-top:4px;max-height:160px;overflow:auto"></div>
                <div style="margin-top:4px;color:#aaa;font-size:12px">Marque só o que pode ir embora. Poções, bolas, pedras, feromônios, itens raros e itens com cadeado nunca são vendidos. "Manter" = reserva que fica na mochila.</div>
                <button id="pg-dn-sell-now" style="margin-top:6px;width:100%;background:#3a3c42;color:#fff;border:0;border-radius:4px;padding:6px;cursor:pointer">Vender agora (só os marcados)</button>
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
            <div style="margin-top:6px;display:flex;gap:6px">
                <button id="pg-dn-export" title="Copia toda a configuração deste painel como texto" style="flex:1;background:#3a3c42;color:#fff;border:0;border-radius:4px;padding:6px;cursor:pointer">Exportar config</button>
                <button id="pg-dn-import" title="Cola uma configuração exportada de outro painel" style="flex:1;background:#3a3c42;color:#fff;border:0;border-radius:4px;padding:6px;cursor:pointer">Importar config</button>
            </div>
            <div id="pg-dn-import-box" style="display:none;margin-top:6px">
                <textarea id="pg-dn-import-text" rows="4" placeholder="Cole aqui a config exportada"
                    style="width:100%;box-sizing:border-box;background:#1e1f22;color:#eee;border:1px solid #555;border-radius:4px;padding:4px;font:12px monospace"></textarea>
                <label style="display:block;margin-top:2px;font-size:12px"><input id="pg-dn-import-keephooks" type="checkbox"> Manter os webhooks deste painel (importar só o resto)</label>
                <button id="pg-dn-import-apply" style="margin-top:4px;width:100%;background:#5865f2;color:#fff;border:0;border-radius:4px;padding:6px;cursor:pointer">Aplicar config importada</button>
            </div>
            <div id="pg-dn-msg" style="margin-top:6px;color:#8f9;min-height:16px"></div>`;

        document.body.appendChild(btn);
        document.body.appendChild(panel);

        const $ = (id) => panel.querySelector(id);
        function renderSellList() {
            const box = $('#pg-dn-sell-list');
            const info = $('#pg-dn-sell-hunt');
            if (!box || !info) return;
            info.textContent = huntSlug
                ? `Hunt atual: ${huntSlug} — ${hasHuntProfile() ? 'perfil salvo (carregado ao entrar)' : 'sem perfil ainda; Salvar cria um para esta hunt'}`
                : 'Fora de hunt — entre numa hunt e cace um pouco; os itens que caírem aparecem aqui.';
            const ids = [...huntLoot.keys()];
            if (!ids.length) { box.innerHTML = '<div style="color:#777;font-size:12px">(nenhum drop visto nesta hunt ainda)</div>'; return; }
            const inp = 'background:#1e1f22;color:#eee;border:1px solid #555;border-radius:4px;padding:2px 4px';
            box.innerHTML = ids.map(id => {
                const loot = huntLoot.get(id);
                const item = itemsCatalog?.get(id) || null;
                const motivo = item ? protectedReason(item) : null;
                const sel = cfg.sellItems?.[id];
                const price = item ? Number(item.npcPrice) || 0 : null;
                const esc = (t) => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
                if (motivo) {
                    return `<div style="display:flex;gap:6px;align-items:center;color:#777;font-size:12px" title="Protegido: ${esc(motivo)}">🔒 ${esc(loot.name)} <span style="margin-left:auto">(${esc(motivo)})</span></div>`;
                }
                return `<div data-item-id="${id}" style="display:flex;gap:6px;align-items:center;font-size:12px;margin-top:2px">
                    <input type="checkbox" class="pg-dn-sell-chk" ${sel ? 'checked' : ''}>
                    <span style="flex:1">${esc(loot.name)} <span style="color:#aaa">· caiu ${loot.qty}${price != null ? ` · ${price.toLocaleString('pt-BR')} gold` : ''}</span></span>
                    <span style="color:#aaa">manter</span><input type="number" class="pg-dn-sell-keep" min="0" step="1" value="${sel ? (Number(sel.keep) || 0) : 0}" style="width:56px;${inp}">
                </div>`;
            }).join('');
        }
        onHuntLootChange = () => { if (panel.style.display !== 'none') renderSellList(); };

        function readSellList() {
            const out = Object.assign({}, cfg.sellItems || {});
            for (const row of panel.querySelectorAll('[data-item-id]')) {
                const id = Number(row.getAttribute('data-item-id'));
                const checked = row.querySelector('.pg-dn-sell-chk')?.checked;
                const keep = Math.max(0, parseInt(row.querySelector('.pg-dn-sell-keep')?.value, 10) || 0);
                if (checked) out[id] = { keep }; else delete out[id];
            }
            return out;
        }

        function fill() {
            $('#pg-dn-sell').checked = Boolean(cfg.sellEnabled);
            $('#pg-dn-sell-min').value = cfg.sellEveryMin || 10;
            $('#pg-dn-sell-max').value = cfg.sellEveryMaxMin || '';
            loadItemsCatalog().then(() => renderSellList());
            renderSellList();
            $('#pg-dn-hook').value = cfg.webhookUrl;
            $('#pg-dn-hook-shiny').value = cfg.webhookShiny || '';
            $('#pg-dn-hook-alerts').value = cfg.webhookAlerts || '';
            $('#pg-dn-list').value = cfg.watchList.join(', ');
            $('#pg-dn-shiny').checked = cfg.notifyShiny;
            $('#pg-dn-all').checked = cfg.notifyEveryCapture;
            $('#pg-dn-tier').value = tierByKey(cfg.minTier) ? tierByKey(cfg.minTier).key : '';
            $('#pg-dn-miniv').value = cfg.minIv || 0;
            $('#pg-dn-ball').value = cfg.ballsWatch || 'auto';
            $('#pg-dn-ballsmin').value = cfg.ballsMin || 0;
            $('#pg-dn-autobuy').checked = Boolean(cfg.autoBuy);
            $('#pg-dn-autobuy-qty').value = cfg.autoBuyQty || 100;
            $('#pg-dn-autobuy-reserve').value = cfg.autoBuyGoldReserve || 0;
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
            cfg.ballsWatch = $('#pg-dn-ball').value || 'auto';
            cfg.ballsMin = Math.max(0, parseInt($('#pg-dn-ballsmin').value, 10) || 0);
            cfg.autoBuy = $('#pg-dn-autobuy').checked;
            cfg.autoBuyQty = Math.min(BUY_MAX_QTY, Math.max(1, parseInt($('#pg-dn-autobuy-qty').value, 10) || 100));
            cfg.autoBuyGoldReserve = Math.max(0, parseInt($('#pg-dn-autobuy-reserve').value, 10) || 0);
            for (const k of Object.keys(ballAlerted)) delete ballAlerted[k]; // limite mudou: rearma
            for (const k of Object.keys(autoBuyAttempted)) delete autoBuyAttempted[k];
            requestBalls(0);
            cfg.mentionUserId = $('#pg-dn-mention').value.trim();
            cfg.cooldownSeconds = Math.max(0, parseInt($('#pg-dn-cooldown').value, 10) || 0);
            cfg.cfgVersion = 2;
            cfg.debug = $('#pg-dn-debug').checked;
            cfg.sellEnabled = $('#pg-dn-sell').checked;
            cfg.sellEveryMin = Math.max(1, parseInt($('#pg-dn-sell-min').value, 10) || 10);
            cfg.sellEveryMaxMin = Math.max(0, parseInt($('#pg-dn-sell-max').value, 10) || 0);
            drawSellDelay(); // faixa mudou: sorteia de novo
            cfg.sellItems = readSellList();
            saveHuntProfile();
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
        function flash(msg, ms) {
            $('#pg-dn-msg').textContent = msg;
            setTimeout(() => { if ($('#pg-dn-msg').textContent === msg) $('#pg-dn-msg').textContent = ''; }, ms || 4000);
        }

        $('#pg-dn-log').onclick = () => {
            const txt = localStorage.getItem(LOG_KEY) || '[]';
            copyText(txt).then(ok => {
                if (ok) flash('📋 Log copiado (cole para quem for diagnosticar).');
                else { console.log(TAG, 'LOG:', txt); flash('⚠ Não copiou; o log foi impresso no console.'); }
            });
        };

        // ---- Exportar / importar configuração (para copiar entre contas/painéis) ----
        $('#pg-dn-export').onclick = () => {
            const txt = JSON.stringify(Object.assign({ _piwDiscordNotify: cfg.cfgVersion || 2 }, cfg));
            copyText(txt).then(ok => {
                if (ok) flash('📤 Config copiada. Abra o 🔔 na outra conta, clique em Importar e cole. Atenção: inclui os webhooks.', 7000);
                else { $('#pg-dn-import-box').style.display = 'block'; $('#pg-dn-import-text').value = txt; flash('⚠ Não copiou; a config apareceu na caixa abaixo — copie de lá.', 7000); }
            });
        };
        $('#pg-dn-import').onclick = () => {
            const box = $('#pg-dn-import-box');
            box.style.display = box.style.display === 'none' ? 'block' : 'none';
            if (box.style.display === 'block') { $('#pg-dn-import-text').value = ''; $('#pg-dn-import-text').focus(); }
        };
        $('#pg-dn-import-apply').onclick = () => {
            let data;
            try { data = JSON.parse($('#pg-dn-import-text').value.trim()); }
            catch { flash('⚠ Isso não é uma config válida (JSON inválido).'); return; }
            if (!data || typeof data !== 'object' || Array.isArray(data) || !('webhookUrl' in data)) { flash('⚠ Isso não parece uma config deste script.'); return; }
            delete data._piwDiscordNotify;
            const keepHooks = $('#pg-dn-import-keephooks').checked;
            const mine = { webhookUrl: cfg.webhookUrl, webhookShiny: cfg.webhookShiny, webhookAlerts: cfg.webhookAlerts };
            cfg = Object.assign({}, DEFAULTS, data);
            if (keepHooks) Object.assign(cfg, mine);
            cfg.cfgVersion = 2;
            saveCfg(cfg);
            for (const k of Object.keys(ballAlerted)) delete ballAlerted[k];
            for (const k of Object.keys(autoBuyAttempted)) delete autoBuyAttempted[k];
            drawSellDelay();
            loadHuntProfile();
            fill();
            $('#pg-dn-import-box').style.display = 'none';
            flash('✔ Config importada e salva.');
        };

        $('#pg-dn-sell-now').onclick = () => {
            cfg.sellItems = readSellList();
            saveHuntProfile();
            saveCfg(cfg);
            $('#pg-dn-msg').textContent = '⏳ Vendendo...';
            runSellCycle(true).then(r => {
                $('#pg-dn-msg').textContent = r.ok
                    ? `💰 Vendeu ${r.total} itens por ${Number(r.ganho).toLocaleString('pt-BR')} gold.`
                    : `⚠ Não vendeu: ${r.motivo}`;
                setTimeout(() => { $('#pg-dn-msg').textContent = ''; }, 6000);
            });
        };

        // sem webhook configurado ainda: chama atenção pro botão
        if (!cfg.webhookUrl) flashButton();
    }

    buildUI();
    setInterval(() => requestBalls(0), BALLS_POLL_MS);
    setInterval(sellTick, SELL_CHECK_MS);

    console.log(TAG, 'v3.0.1 ativo. Watch list:', cfg.watchList.join(', ') || '(vazia)',
        '| toda captura:', cfg.notifyEveryCapture, '| shiny:', cfg.notifyShiny,
        '| raridade mín.:', cfg.minTier || '(nenhuma)', '| poder mín.:', cfg.minIv || 0,
        '| alerta bolas:', cfg.ballsMin ? `${cfg.ballsWatch} < ${cfg.ballsMin}` : 'desligado',
        '| compra auto:', cfg.autoBuy ? `${cfg.autoBuyQty} un.` : 'não',
        '| venda auto:', cfg.sellEnabled ? `${Object.keys(cfg.sellItems || {}).length} itens / ${cfg.sellEveryMin}${cfg.sellEveryMaxMin > cfg.sellEveryMin ? `–${cfg.sellEveryMaxMin}` : ''} min` : 'não');
})();
