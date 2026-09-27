// Extrai módulos do userscript pelos marcadores `// ---- ...` e os executa com stubs.
// loadLevelModule: "Alerta de nível / troca de líder / rota".
// Não há DOM nem WebSocket: `sendGame`, `postWebhook`, `logEvent`, `saveCfg` e os timers são falsos.
// Timers curtos (< 5 s) rodam na hora; os longos (confirmação de hunt, 30 s) ficam em `longTimers`
// para o teste disparar quando quiser.
const fs = require('fs');
const path = require('path');

const SCRIPT = path.join(__dirname, '..', 'piw-discord-notify.user.js');
const START = '    // ---- Alerta de nível do líder';
const END = '    // ---- Alerta de estoque de bolas';

function loadLevelModule(cfg) {
    const src = fs.readFileSync(SCRIPT, 'utf8');
    const a = src.indexOf(START), b = src.indexOf(END);
    if (a < 0 || b < 0) throw new Error('marcadores do módulo de nível não encontrados no script');
    const mod = src.slice(a, b);

    const state = { sent: [], hooks: [], logs: [], longTimers: [], saved: 0, nudges: [] };
    const ctx = {
        cfg,
        sendGame: (o) => { state.sent.push(o); return true; },
        lastSocket: { dispatchEvent: (ev) => { state.nudges.push(JSON.parse(ev.data)); return true; } },
        MessageEvent: class { constructor(type, init) { this.type = type; this.data = init.data; } },
        huntCatalog: null,
        logEvent: (k, d) => state.logs.push([k, d]),
        postWebhook: (k, p, m) => { state.hooks.push({ kind: k, content: p.content || '', desc: p.embeds?.[0]?.description || '', meta: m }); return Promise.resolve(true); },
        playerName: () => 'Teste',
        saveCfg: () => { state.saved++; },
        setTimeout: (fn, ms) => { if (ms >= 5000) { state.longTimers.push(fn); return 99; } fn(); return 1; },
        clearTimeout: () => {},
        Date,
    };
    const factory = new Function(...Object.keys(ctx), mod + `
        return {
            updateTeam, handlePokeXp, noteLeaderLevel, levelTarget, routeStatus,
            routeNames, uniqueRouteName, activateRoute, createRoute, renameRoute, deleteRoute,
            fieldArrived() { lastFieldAt = Date.now(); },
            get team() { return team; },
            get swapPending() { return swapPending; },
        };`);
    const api = factory(...Object.values(ctx));
    return { api, state, cfg };
}

// Time de teste: níveis em ordem de slot; `leaderIdx` = quem é o líder.
function team(levels, leaderIdx) {
    return levels.map((lv, i) => ({ id: 'p' + i, name: 'Mon' + i, level: lv, team: true, slot: i, leader: i === leaderIdx }));
}

function assert(cond, msg) {
    if (!cond) { console.error('FALHOU:', msg); process.exitCode = 1; throw new Error(msg); }
}

// Extrai o módulo "Recarga automática do painel" e o executa com stubs. `clock.now` controla o Date.now()
// visto pelo módulo; `state.store` é o localStorage falso; `state.switches` recebe as chamadas a switchHunt.
const R_START = '    // ---- Recarga automática do painel';
const R_END = '    // ---- Log persistente';

function loadReloadModule(cfg, init) {
    init = init || {};
    const src = fs.readFileSync(SCRIPT, 'utf8');
    const a = src.indexOf(R_START), b = src.indexOf(R_END);
    if (a < 0 || b < 0) throw new Error('marcadores do módulo de recarga não encontrados no script');
    const mod = src.slice(a, b);

    const clock = { now: Date.now() };
    const FakeDate = new Proxy(Date, { get(t, k) { return k === 'now' ? () => clock.now : t[k]; } });
    const store = init.store || {};
    const state = { logs: [], reloads: 0, switches: [], longTimers: [], store };
    const ctx = {
        cfg,
        logEvent: (k, d) => state.logs.push([k, d]),
        normalize: (s) => String(s || '').toLowerCase().trim(),
        switchHunt: (slug, tentativa, origem) => state.switches.push({ slug, tentativa, origem }),
        localStorage: {
            getItem: (k) => (k in store ? store[k] : null),
            setItem: (k, v) => { store[k] = String(v); },
            removeItem: (k) => { delete store[k]; },
        },
        location: { reload: () => { state.reloads++; } },
        huntSlug: init.huntSlug != null ? init.huntSlug : null,
        sellRunning: Boolean(init.sellRunning),
        lastSellAt: init.lastSellAt || 0,
        lastPokeSellAt: init.lastPokeSellAt || 0,
        lastTripAt: 0,
        nextTripDelayMs: 0,
        tripRunning: false,
        huntSwitch: null,
        swapPending: null,
        awaitingDetails: init.awaitingDetails || [],
        ballAlerted: init.ballAlerted || {},
        autoBuyAttempted: {},
        levelAlerted: new Set(),
        lastFieldAt: init.lastFieldAt || 0,
        prevHuntSlug: init.prevHuntSlug || null,
        setTimeout: (fn, ms) => { if (ms >= 5000) { state.longTimers.push(fn); return 99; } fn(); return 1; },
        clearTimeout: () => {},
        Date: FakeDate,
    };
    const factory = new Function(...Object.keys(ctx), mod + `
        return {
            reloadIntervalRange, scheduleReload, reloadTick, reloadStatus, doReload, loadResume, armResume,
            fieldArrived() { lastFieldAt = Date.now(); },
            get nextReloadAt() { return nextReloadAt; },
            get resumeHunt() { return resumeHunt; },
            get lastSellAt() { return lastSellAt; },
            get levelAlerted() { return levelAlerted; },
            get prevHuntSlug() { return prevHuntSlug; },
        };`);
    const api = factory(...Object.values(ctx));
    return { api, state, cfg, clock };
}

// Extrai o módulo "Daily Kill" e o executa com stubs. `init.api(url, opts)` responde o REST do jogo
// (GET /api/game/daily-kill e POST .../claim); `state.calls` guarda as chamadas, `state.switches` os switchHunt.
const D_START = '    // ---- Daily Kill';
const D_END = '    // ---- Recarga automática do painel';

function loadDailyModule(cfg, init) {
    init = init || {};
    const src = fs.readFileSync(SCRIPT, 'utf8');
    const a = src.indexOf(D_START), b = src.indexOf(D_END);
    if (a < 0 || b < 0) throw new Error('marcadores do módulo da daily não encontrados no script');
    const mod = src.slice(a, b);

    const clock = { now: Date.now() };
    const FakeDate = new Proxy(Date, { get(t, k) { return k === 'now' ? () => clock.now : t[k]; } });
    const state = { calls: [], switches: [], hooks: [], logs: [], pokesReqs: 0, longTimers: [], sent: [], store: Object.assign({}, init.store || {}) };
    const normalize = (v) => String(v || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    const ctx = {
        cfg,
        gameApi: (url, opts) => { state.calls.push({ url, opts }); return Promise.resolve().then(() => init.api(url, opts)); },
        logEvent: (k, d) => state.logs.push([k, d]),
        postWebhook: (k, p, m) => { state.hooks.push({ kind: k, content: p.content || '', desc: p.embeds?.[0]?.description || '', meta: m }); return Promise.resolve(true); },
        switchHunt: (slug, tentativa, origem) => state.switches.push({ slug, tentativa, origem }),
        requestPokes: () => { state.pokesReqs++; },
        playerName: () => 'Teste',
        normalize,
        huntSlugFromName: (name) => normalize(name).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''),
        fmtNum: (n) => String(n),
        routeStep: () => init.routeStep || null,
        catchRouteActive: () => Boolean(init.catchTarget),
        catchTarget: init.catchTarget || null,
        huntSlug: init.huntSlug != null ? init.huntSlug : null,
        CITY_SLUGS: ['cerulean', 'pewter', 'viridian', 'cassino', 'arena_pvp'],
        // daily sozinha (v3.16.0): time, catálogo de hunts, socket e localStorage falsos
        sendGame: (m) => { state.sent.push(m); return true; },
        team: init.team || [],
        huntCatalog: init.huntCatalog || null,
        loadHuntCatalog: () => Promise.resolve(init.huntCatalog || null),
        creatureTypes: new Map(),
        huntSwitch: null,
        swapPending: null,
        localStorage: { getItem: (k) => (k in state.store ? state.store[k] : null), setItem: (k, v) => { state.store[k] = String(v); }, removeItem: (k) => { delete state.store[k]; } },
        setTimeout: (fn, ms) => { if (ms >= 5000) { state.longTimers.push(fn); return 99; } fn(); return 1; },
        clearTimeout: () => {},
        Date: FakeDate,
    };
    const factory = new Function(...Object.keys(ctx), 'function teamLeader() { return team.find(p => p.leader) || team[0] || null; }\n' + mod + `
        return {
            dailyTick, noteDailyKill, noteHuntChange, dailyStatus, dailyReturnTarget, dailyOnHunt, dailyHoldsLeader, dailyGoFailed,
            setHunt(slug) { huntSlug = slug; noteHuntChange(slug); },
            setTeam(t) { team = t; },
            get dailyRun() { return dailyRun; },
            get daily() { return daily; },
            get prevHuntSlug() { return prevHuntSlug; },
            get dailyHandledReset() { return dailyHandledReset; },
        };`);
    const api = factory(...Object.values(ctx));
    return { api, state, cfg, clock };
}

// Extrai o módulo "Rota de captura" e o executa com stubs. `init.fetchJson(url)` responde os arquivos públicos
// (map-markers, creatures) e `init.api(url)` o REST autenticado (pokedex, professions).
const C_START = '    // ---- Rota de captura';
const C_END = '    // ---- Daily Kill';

function loadCatchModule(cfg, init) {
    init = init || {};
    const src = fs.readFileSync(SCRIPT, 'utf8');
    const a = src.indexOf(C_START), b = src.indexOf(C_END);
    if (a < 0 || b < 0) throw new Error('marcadores do módulo de captura não encontrados no script');
    const mod = src.slice(a, b);

    const clock = { now: Date.now() };
    const FakeDate = new Proxy(Date, { get(t, k) { return k === 'now' ? () => clock.now : t[k]; } });
    const state = { calls: [], sent: [], switches: [], hooks: [], logs: [], saved: 0, longTimers: [] };
    const normalize = (v) => String(v || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    const ctx = {
        cfg,
        fetch: (url) => Promise.resolve().then(() => ({ ok: true, json: () => Promise.resolve(init.fetchJson(url)) })),
        gameApi: (url, opts) => { state.calls.push({ url, opts }); return Promise.resolve().then(() => init.api(url, opts)); },
        sendGame: (o) => { state.sent.push(o); return true; },
        logEvent: (k, d) => state.logs.push([k, d]),
        postWebhook: (k, p, m) => { state.hooks.push({ kind: k, content: p.content || '', desc: p.embeds?.[0]?.description || '', meta: m }); return Promise.resolve(true); },
        switchHunt: (slug, tentativa, origem) => state.switches.push({ slug, tentativa, origem }),
        saveCfg: () => { state.saved++; },
        playerName: () => 'Teste',
        normalize,
        huntSlugFromName: (name) => normalize(name).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''),
        fmtNum: (n) => String(n),
        huntSlug: init.huntSlug != null ? init.huntSlug : null,
        huntSwitch: null,
        lastFieldAt: init.lastFieldAt || 0,
        lastBallId: init.lastBallId || null,
        ballCounts: init.ballCounts || {},
        ballQty: (id) => (init.ballCounts ? (init.ballCounts[id] ?? 0) : null),
        CITY_SLUGS: ['cerulean', 'pewter', 'viridian', 'cassino', 'arena_pvp'],
        dailyEnabled: () => false,
        dailyOnHunt: () => false,
        requestPokes: () => { state.pokesReqs = (state.pokesReqs || 0) + 1; },
        lastPokesReqAt: 0,
        tripRunning: false,
        setTimeout: (fn, ms) => { if (ms >= 5000) { state.longTimers.push(fn); return 99; } fn(); return 1; },
        clearTimeout: () => {},
        Date: FakeDate,
    };
    const factory = new Function(...Object.keys(ctx), mod + `
        return {
            startCatchRoute, catchNext, catchTick, catchOnPending, catchOnResult, catchOnCooldown, catchHuntFailed, skipCatchTarget, catchOnPokes, catchOnFamily, speciesDone, speciesSource, catchOnHuntChange,
            catchPlan, catchScope, catchProgress, catchStatus, refreshPokedex, refreshProfession,
            setHunt(slug) { huntSlug = slug; catchOnHuntChange(slug); },
            get catchTarget() { return catchTarget; },
            get dexCaught() { return dexCaught; },
            get profession() { return profession; },
        };`);
    const api = factory(...Object.values(ctx));
    return { api, state, cfg, clock };
}

// Extrai o módulo "Venda automática de Pokémon" e o executa com stubs. `init.api(url, opts)` responde o POST de venda.
const P_START = '    // ---- Venda automática de Pokémon';
const P_END = '    // ---- Rota de captura';

function loadPokeSellModule(cfg, init) {
    init = init || {};
    const src = fs.readFileSync(SCRIPT, 'utf8');
    const a = src.indexOf(P_START), b = src.indexOf(P_END);
    if (a < 0 || b < 0) throw new Error('marcadores do módulo de venda de Pokémon não encontrados no script');
    // O helper da guarda de venda do PokeGrid mora junto do gameApi (fora do módulo): entra inteiro, para o teste
    // cobrir o liga/desliga real de `window.__pgSellGuardOn`.
    const g = src.indexOf('    // Guarda de venda do PokeGrid');
    const gEnd = src.indexOf('\n    }\n', src.indexOf('async function withoutPokeGridSellGuard', g)) + 7;
    if (g < 0 || gEnd < 7) throw new Error('helper withoutPokeGridSellGuard não encontrado no script');
    const mod = src.slice(g, gEnd) + src.slice(a, b);

    const clock = { now: Date.now() };
    const FakeDate = new Proxy(Date, { get(t, k) { return k === 'now' ? () => clock.now : t[k]; } });
    const state = { calls: [], hooks: [], logs: [], pokesReqs: 0, awaiting: init.awaiting || [], window: init.window || {} };
    const TIERS = [[4.0, 'Divine'], [3.0, 'Ancient'], [2.0, 'Mythic'], [1.7, 'Legendary'], [1.5, 'Epic'], [1.3, 'Rare'], [1.1, 'Uncommon'], [1.0, 'Common'], [-Infinity, 'Weak']]
        .map(([min, name], i, arr) => ({ min, name, key: name.toLowerCase(), rank: arr.length - 1 - i }));
    const ctx = {
        cfg,
        gameApi: (url, opts) => { state.calls.push({ url, body: JSON.parse(opts?.body || 'null') }); return Promise.resolve().then(() => init.api(url, opts)); },
        logEvent: (k, d) => state.logs.push([k, d]),
        postWebhook: (k, p, m) => { state.hooks.push({ kind: k, content: p.content || '', desc: p.embeds?.[0]?.description || '', meta: m }); return Promise.resolve(true); },
        requestPokes: () => { state.pokesReqs++; },
        lastPokesReqAt: 0,
        tripRequest: (key, dados, motivo) => { state.trips = state.trips || []; state.trips.push({ key, motivo }); },
        playerName: () => 'Teste',
        fmtNum: (n) => String(n),
        qualityTier: (q) => (typeof q === 'number' && Number.isFinite(q)) ? TIERS.find(t => q >= t.min) : null,
        tierByKey: (key) => TIERS.find(t => t.key === String(key || '').toLowerCase()) || null,
        IV_MAX: 192,
        awaitingDetails: state.awaiting,
        TIERS,
        window: state.window,
        setTimeout: (fn, ms) => { fn(); return 1; },
        clearTimeout: () => {},
        Date: FakeDate,
    };
    const factory = new Function(...Object.keys(ctx), mod + `
        return {
            pokeSellReason, pokeSellCandidates, runPokeSellCycle, pokeSellOnPokes, noteRecentCapture, pokeSellLimit, pokeSellHasRules, pokeLabel,
            get lastPokesList() { return lastPokesList; },
            get lastPokeSellAt() { return lastPokeSellAt; },
        };`);
    const api = factory(...Object.values(ctx));
    return { api, state, cfg, clock };
}

// Extrai o módulo "Alerta de estoque de bolas" + a função checkBallStock (que fica na seção de venda) e roda com stubs.
const B_START = '    // ---- Alerta de estoque de bolas';
const B_END = '    // ---- Compra automática (REST';

function loadBallsModule(cfg, init) {
    init = init || {};
    const src = fs.readFileSync(SCRIPT, 'utf8');
    const a = src.indexOf(B_START), b = src.indexOf(B_END);
    const c = src.indexOf('    function checkBallStock() {');
    const d = src.indexOf('\n    }\n', c) + 7;
    if (a < 0 || b < 0 || c < 0) throw new Error('marcadores do módulo de bolas não encontrados no script');
    const mod = src.slice(a, b) + src.slice(c, d);

    const state = { sent: [], hooks: [], logs: [], buys: [] };
    const ctx = {
        cfg,
        sendGame: (o) => { state.sent.push(o); return true; },
        logEvent: (k, dd) => state.logs.push([k, dd]),
        postWebhook: (k, p, m) => { state.hooks.push({ kind: k, content: p.content || '', desc: p.embeds?.[0]?.description || '', meta: m }); return Promise.resolve(true); },
        autoBuyBalls: (id, qty, min) => { state.buys.push({ id, qty, min }); },
        tripRequest: (key, dados, motivo) => { state.buys.push({ id: dados.id, qty: dados.qty, min: dados.min, viagem: key, motivo }); },
        autoBuyAttempted: {},
        playerName: () => 'Teste',
        setTimeout: (fn) => { fn(); return 1; },
        clearTimeout: () => {},
        Date,
    };
    const factory = new Function(...Object.keys(ctx), mod + `
        return {
            handleBalls, checkBallStock, ballQty, effectiveBallsMin, watchedBallId,
            setLastBall(id) { lastBallId = id; },
            get ballCounts() { return ballCounts; },
            get ballAlerted() { return ballAlerted; },
        };`);
    const api = factory(...Object.values(ctx));
    return { api, state, cfg };
}

// Extrai o módulo "Viagem à cidade" e roda com stubs. Timers avançam o relógio falso e rodam na hora; o socket falso
// registra as mensagens sintéticas e chama `state.onTeleport` (o teste usa para simular o set-city da tela).
const T_START = '    // ---- Viagem à cidade';
const T_END = '    // ---- Recarga automática do painel';

function loadTripModule(cfg, init) {
    init = init || {};
    const src = fs.readFileSync(SCRIPT, 'utf8');
    const a = src.indexOf(T_START), b = src.indexOf(T_END);
    if (a < 0 || b < 0) throw new Error('marcadores do módulo de viagem não encontrados no script');
    const mod = src.slice(a, b);

    const clock = { now: Date.now() };
    const FakeDate = new Proxy(Date, { get(t, k) { return k === 'now' ? () => clock.now : t[k]; } });
    const state = { sent: [], switches: [], logs: [], nudges: [], tasks: [], onTeleport: null };
    const ctx = {
        cfg,
        sendGame: (o) => { state.sent.push(o); return true; },
        logEvent: (k, d) => state.logs.push([k, d]),
        switchHunt: (slug, tentativa, origem) => state.switches.push({ slug, tentativa, origem }),
        normalize: (v) => String(v || '').toLowerCase().trim(),
        CITY_SLUGS: ['cerulean', 'pewter', 'viridian', 'cassino', 'arena_pvp', 'goldenrod', 'shopping'],
        huntSlug: init.huntSlug != null ? init.huntSlug : null,
        catchRouteActive: () => Boolean(init.catchTarget),
        catchTarget: init.catchTarget || null,
        routeStep: () => init.routeStep || null,
        lastRealHunt: init.lastRealHunt || null,
        huntSwitch: init.huntSwitch || null,
        swapPending: null,
        awaitingDetails: init.awaiting || [],
        lastSocket: { dispatchEvent: (ev) => { state.nudges.push(JSON.parse(ev.data)); if (state.onTeleport) state.onTeleport(); return true; } },
        MessageEvent: class { constructor(type, i) { this.type = type; this.data = i.data; } },
        sellWantedNow: () => init.wantedNow || [],
        huntLoot: new Map((init.wantedNow || []).map(id => [id, { name: 'x', qty: 1 }])),
        pokeSellCandidates: () => init.pokeCands || [],
        ballName: (id) => ({ 1: 'Poke Ball', 4: 'Ultra Ball' }[id] || `Ball ${id}`),
        watchedBallId: () => (init.ballId != null ? init.ballId : null),
        ballQty: () => (init.ballQty != null ? init.ballQty : null),
        effectiveBallsMin: () => init.ballsMin || 0,
        runSellCycle: (manual, wanted, hunt) => { state.tasks.push(['itens', { manual, wanted, hunt }]); return Promise.resolve(init.itens || { ok: true, total: 3, ganho: 90 }); },
        runPokeSellCycle: (manual) => { state.tasks.push(['pokes', { manual }]); return Promise.resolve(init.pokes || { ok: true, vendidos: 2, ganho: 200 }); },
        autoBuyBalls: (id, qty, min) => { state.tasks.push(['bolas', { id, qty, min }]); return Promise.resolve(init.bolas || { ok: true, bought: 100 }); },
        setTimeout: (fn, ms) => { clock.now += ms; fn(); return 1; },
        Date: FakeDate,
    };
    const factory = new Function(...Object.keys(ctx), mod + `
        return {
            tripRequest, tripTick, cityTrip, tripTasksFor, tripStatus, tripReturnSlug, tripOnSetCity, tripCity,
            tripIntervalRange, drawTripDelay, restartTripCycle, tripDueAt, tripLoad, tripLoadText,
            get lastTripAt() { return lastTripAt; },
            setHunt(slug) { huntSlug = slug; },
            get tripRunning() { return tripRunning; },
            get tripNeeds() { return tripNeeds; },
            get lastTripInfo() { return lastTripInfo; },
        };`);
    const api = factory(...Object.values(ctx));
    state.huntLoot = ctx.huntLoot;
    return { api, state, cfg, clock };
}

// Extrai o módulo "Clã" (v3.17.0) e o executa com stubs. `init.api(url, opts)` responde o REST (clans, convert, rankup,
// change); `init.bag` é a mochila devolvida ao `inv-get`; `init.huntCatalog`/`init.creatures` fazem o papel do catálogo.
const K_START = '    // ---- Clã: subir de rank';
const K_END = '    // ---- Viagem à cidade';

function loadClanModule(cfg, init) {
    init = init || {};
    const src = fs.readFileSync(SCRIPT, 'utf8');
    const a = src.indexOf(K_START), b = src.indexOf(K_END);
    if (a < 0 || b < 0) throw new Error('marcadores do módulo do clã não encontrados no script');
    const mod = src.slice(a, b);
    const clock = { now: Date.now() };
    const FakeDate = new Proxy(Date, { get(t, k) { return k === 'now' ? () => clock.now : t[k]; } });
    const state = { calls: [], sent: [], switches: [], hooks: [], logs: [], trips: [], hook: null };
    const normalize = (v) => String(v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
    const cr = init.creatures || [];
    const ctx = {
        cfg,
        gameApi: (url, opts) => { state.calls.push({ url, opts }); return Promise.resolve().then(() => init.api(url, opts)); },
        sendGame: (m) => { state.sent.push(m); if (m.type === 'inv-get' && init.bag && state.hook) state.hook(init.bag); return true; },
        logEvent: (k, d) => state.logs.push([k, d]),
        postWebhook: (k, p, m) => { state.hooks.push({ kind: k, content: p.content || '', desc: p.embeds?.[0]?.description || '', meta: m }); return Promise.resolve(true); },
        playerName: () => 'Teste',
        normalize,
        fmtNum: (n) => String(n),
        switchHunt: (slug, tentativa, origem) => state.switches.push({ slug, tentativa, origem }),
        huntSlug: init.huntSlug != null ? init.huntSlug : null,
        CITY_SLUGS: ['cerulean', 'pewter', 'viridian', 'cassino', 'arena_pvp', 'goldenrod', 'shopping'],
        team: init.team || [],
        huntCatalog: init.huntCatalog || null,
        loadHuntCatalog: () => Promise.resolve(init.huntCatalog || null),
        itemsCatalog: new Map((init.items || []).map(i => [i.id, i])),
        loadItemsCatalog: () => Promise.resolve(),
        creatureTypes: new Map(cr.map(c => [c.pokeId, [c.type1 || '', c.type2 || '']])),
        creatureLoot: new Map(cr.map(c => [c.pokeId, c.loot || []])),
        creatureIdByName: new Map(cr.map(c => [normalize(c.name), c.pokeId])),
        tripRunning: false, huntSwitch: null, swapPending: null,
        dailyEnabled: () => Boolean(init.dailyOnHunt),
        dailyOnHunt: () => Boolean(init.dailyOnHunt),
        dailyHoldsLeader: () => false,
        tripRequest: (k, d, m) => state.trips.push({ k, m }),
        catchRouteActive: () => false,
        catchCooldownUntil: 0, catchSentAt: 0, catchSentFor: null, CATCH_SEND_GAP_MS: 3000,
        catchBallId: () => 4,
        ballQty: () => 50,
        setTimeout: (fn, ms) => { clock.now += ms; fn(); return 1; },
        Date: FakeDate,
    };
    const factory = new Function(...Object.keys(ctx), mod + `
        return {
            clanTick, clanCityWork, clanPlan, clanMissing, clanKeepsItem, clanKeepsSpecies, clanWantsCity, clanOnPending,
            clanOnInventory, clanStatus, noteClanKill, refreshClan,
            setHunt(slug) { huntSlug = slug; },
            get clanTarget() { return clanTarget; }, get clanFrom() { return clanFrom; }, get clanState() { return clanState; },
        };`);
    const api = factory(...Object.values(ctx));
    state.hook = (items) => api.clanOnInventory(items);
    return { api, state, cfg, clock };
}

module.exports = { loadClanModule, loadLevelModule, loadReloadModule, loadDailyModule, loadCatchModule, loadPokeSellModule, loadBallsModule, loadTripModule, team, assert };
