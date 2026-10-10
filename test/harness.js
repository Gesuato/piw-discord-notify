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
            dailyTick, noteDailyKill, noteHuntChange, dailyStatus, dailyReturnTarget, dailyOnHunt, dailyHoldsLeader, dailyWantsHunt, dailyGoFailed,
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
            loadHuntCatalog, huntLootTable,
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
    const state = { calls: [], hooks: [], logs: [], sent: [], pokesReqs: 0, awaiting: init.awaiting || [], window: init.window || {}, onPokesGet: null };
    const TIERS = [[4.0, 'Divine'], [3.0, 'Ancient'], [2.0, 'Mythic'], [1.7, 'Legendary'], [1.5, 'Epic'], [1.3, 'Rare'], [1.1, 'Uncommon'], [1.0, 'Common'], [-Infinity, 'Weak']]
        .map(([min, name], i, arr) => ({ min, name, key: name.toLowerCase(), rank: arr.length - 1 - i }));
    const ctx = {
        cfg,
        gameApi: (url, opts) => { state.calls.push({ url, body: JSON.parse(opts?.body || 'null') }); return Promise.resolve().then(() => init.api(url, opts)); },
        logEvent: (k, d) => state.logs.push([k, d]),
        postWebhook: (k, p, m) => { state.hooks.push({ kind: k, content: p.content || '', desc: p.embeds?.[0]?.description || '', meta: m }); return Promise.resolve(true); },
        requestPokes: () => { state.pokesReqs++; },
        breedKeepsPoke: init.breedKeepsPoke,   // v3.29.0: proteção do breeding (ausente = sem breeding)
        // `pokes-get` antes de vender: `init.freshPokes` é a lista que o jogo devolve na hora (ausente = jogo mudo, a
        // espera de 5 s passa com o relógio falso e a venda segue com a lista antiga).
        sendGame: (m) => { state.sent.push(m); if (m.type === 'pokes-get' && init.freshPokes && state.onPokesGet) state.onPokesGet(init.freshPokes); return true; },
        lastPokesReqAt: 0,
        tripRequest: (key, dados, motivo) => { state.trips = state.trips || []; state.trips.push({ key, motivo }); },
        localStorage: { getItem: (k) => (k in (state.store = state.store || (init.store || {})) ? state.store[k] : null), setItem: (k, v) => { state.store[k] = String(v); }, removeItem: (k) => { delete state.store[k]; } },
        playerName: () => 'Teste',
        fmtNum: (n) => String(n),
        qualityTier: (q) => (typeof q === 'number' && Number.isFinite(q)) ? TIERS.find(t => q >= t.min) : null,
        tierByKey: (key) => TIERS.find(t => t.key === String(key || '').toLowerCase()) || null,
        IV_MAX: 192,
        awaitingDetails: state.awaiting,
        TIERS,
        window: state.window,
        setTimeout: (fn, ms) => { clock.now += ms || 0; fn(); return 1; },
        clearTimeout: () => {},
        Date: FakeDate,
    };
    const factory = new Function(...Object.keys(ctx), mod + `
        return {
            pokeSellReason, pokeSellCandidates, runPokeSellCycle, pokeSellOnPokes, noteRecentCapture, pokeSellLimit, pokeSellHasRules, pokeLabel,
            boxNoteCapture, boxNoteLocked, boxEstimate, pokeSellQueueCandidates, pokesNoteSilent,
            get captureQueue() { return captureQueue; },
            get lastPokesList() { return lastPokesList; },
            get lastPokeSellAt() { return lastPokeSellAt; },
        };`);
    const api = factory(...Object.values(ctx));
    state.onPokesGet = (list) => api.pokeSellOnPokes(list);
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
        pokeSellListUnread: () => Boolean(init.pokesUnread),
        pokesListWanted: () => Boolean(init.pokesWanted),
        pokeSellRefreshList: () => { state.tasks.push(['time', {}]); return Promise.resolve(init.pokesReply !== false); },
        ballName: (id) => ({ 1: 'Poke Ball', 4: 'Ultra Ball' }[id] || `Ball ${id}`),
        watchedBallId: () => (init.ballId != null ? init.ballId : null),
        ballQty: () => (init.ballQty != null ? init.ballQty : null),
        effectiveBallsMin: () => init.ballsMin || 0,
        runSellCycle: (manual, wanted, hunt) => { state.tasks.push(['itens', { manual, wanted, hunt }]); return Promise.resolve(init.itens || { ok: true, total: 3, ganho: 90 }); },
        runPokeSellCycle: (manual) => { state.tasks.push(['pokes', { manual }]); return Promise.resolve(init.pokes || { ok: true, vendidos: 2, ganho: 200 }); },
        autoBuyBalls: (id, qty, min) => { state.tasks.push(['bolas', { id, qty, min }]); return Promise.resolve(init.bolas || { ok: true, bought: 100 }); },
        supplyLow: () => init.supplyLow || [],
        supplyCityWork: () => { state.tasks.push(['suprimentos', {}]); return Promise.resolve(init.suprimentos || { ok: true, compras: [] }); },
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
        dailyWantsHunt: () => Boolean(init.dailyOnHunt),
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
            get clanTarget() { return clanTarget; }, get clanFrom() { return clanFrom; }, get clanState() { return clanState; }, get clanWait() { return clanWait; },
        };`);
    const api = factory(...Object.values(ctx));
    state.hook = (items) => api.clanOnInventory(items);
    return { api, state, cfg, clock };
}

// Extrai o módulo "Guardar na cidade" (v3.18.0). `init.api(url, opts)` responde depot/move; `init.family` é o frame da
// família devolvido ao `family-get` (null = sem família); `init.pokes` a lista do `pokes-get`; `init.familyResp(payload)`
// decide o resultado de cada family-action (padrão ok); `init.familyReply: false` = o jogo nunca responde ao family-get.
const G_START = '    // ---- Guardar na cidade';
const G_END = '    // ---- Viagem à cidade';

function loadDepositModule(cfg, init) {
    init = init || {};
    const src = fs.readFileSync(SCRIPT, 'utf8');
    const a = src.indexOf(G_START), b = src.indexOf(G_END);
    if (a < 0 || b < 0) throw new Error('marcadores do módulo de guardar não encontrados no script');
    const mod = src.slice(a, b);
    const clock = { now: Date.now() };
    const FakeDate = new Proxy(Date, { get(t, k) { return k === 'now' ? () => clock.now : t[k]; } });
    const state = { calls: [], sent: [], hooks: [], logs: [], family: [], store: Object.assign({}, init.store || {}), set: null };
    const ctx = {
        cfg,
        gameApi: (url, opts) => { state.calls.push({ url, opts }); return Promise.resolve().then(() => init.api(url, opts)); },
        sendGame: (m) => {
            state.sent.push(m);
            if (m.type === 'family-get' && state.set && init.familyReply !== false) state.set.family(init.family === undefined ? { movesUsed: 0, movesCap: 50, frozen: false } : init.family);
            if (m.type === 'pokes-get' && state.set) state.set.pokes(init.pokes || []);
            return true;
        },
        familyDeposit: (pokeId, name) => { state.family.push({ kind: 'poke', pokeId, name }); return Promise.resolve(init.familyResp ? init.familyResp({ kind: 'poke', pokeId }) : { ok: true }); },
        familyItemDeposit: (itemId, qty, name) => { state.family.push({ kind: 'item', itemId, qty, name }); return Promise.resolve(init.familyResp ? init.familyResp({ kind: 'item', itemId }) : { ok: true }); },
        logEvent: (k, d) => state.logs.push([k, d]),
        postWebhook: (k, p, m) => { state.hooks.push({ kind: k, content: p.content || '', desc: p.embeds?.[0]?.description || '', meta: m }); return Promise.resolve(true); },
        playerName: () => 'Teste',
        normalize: (v) => String(v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim(),
        loadItemsCatalog: () => Promise.resolve(new Map((init.items || []).map(i => [i.id, i]))),
        DEPOT_URL: '/api/game/depot',
        recentCaptureIds: new Map(init.recent || []),
        POKE_SELL_RECENT_MS: 2 * 60 * 1000,
        pokeSellReason: init.pokeSellReason || (() => 'sem regra'),
        pokeLabel: (p) => `${p.name} ${p.ivTotal}`,
        clanKeepsItem: init.clanKeepsItem || (() => false),
        clanKeepsSpecies: () => false,
        localStorage: { getItem: (k) => (k in state.store ? state.store[k] : null), setItem: (k, v) => { state.store[k] = String(v); }, removeItem: (k) => { delete state.store[k]; } },
        setTimeout: (fn, ms) => { clock.now += ms; fn(); return 1; },
        Date: FakeDate,
    };
    const factory = new Function(...Object.keys(ctx), 'let lastFamily = null, lastFamilyAt = 0, lastPokesList = [], lastPokesAt = 0;\n' + mod + `
        return {
            depositCityWork, depositPokeCandidates, depositItemReason, depositWanted, depositStatus, noteDepositDrop,
            _set: { family(f) { lastFamily = f; lastFamilyAt++; }, pokes(l) { lastPokesList = l; lastPokesAt++; } },
            get droppedIds() { return droppedIds; },
        };`);
    const api = factory(...Object.values(ctx));
    state.set = api._set;
    return { api, state, cfg, clock };
}

// Extrai o módulo "Refil de poções e revives" (v3.21.0). `init.api(url, opts)` responde a mochila (GET /api/game/depot);
// `init.buy(kind, id, qty)` faz o papel de buyFromShop (padrão: compra tudo). Timers rodam na hora.
const S_START = '    // ---- Refil de poções e revives';
const S_END = '    // ---- Venda automática de drops';

function loadSupplyModule(cfg, init) {
    init = init || {};
    const src = fs.readFileSync(SCRIPT, 'utf8');
    const a = src.indexOf(S_START), b = src.indexOf(S_END);
    if (a < 0 || b < 0) throw new Error('marcadores do módulo de refil não encontrados no script');
    const mod = src.slice(a, b);
    const state = { sent: [], hooks: [], logs: [], trips: [], buys: [], calls: [] };
    const ctx = {
        cfg,
        BUY_MAX_QTY: 10000,
        sendGame: (o) => { state.sent.push(o); return true; },
        gameApi: (url, opts) => { state.calls.push({ url, opts }); return Promise.resolve().then(() => (init.api ? init.api(url, opts) : {})); },
        buyFromShop: (kind, id, qty) => { state.buys.push({ kind, id, qty }); return Promise.resolve(init.buy ? init.buy(kind, id, qty) : { ok: true, bought: qty, spent: qty * 10, gold: 5000, name: null }); },
        tripRequest: (key, dados, motivo) => state.trips.push({ key, dados, motivo }),
        logEvent: (k, d) => state.logs.push([k, d]),
        postWebhook: (k, p, m) => { state.hooks.push({ kind: k, content: p.content || '', desc: p.embeds?.[0]?.description || '', meta: m }); return Promise.resolve(true); },
        playerName: () => 'Teste',
        setTimeout: (fn) => { fn(); return 1; },
        Date,
    };
    const factory = new Function(...Object.keys(ctx), mod + `
        return {
            supplySlots, supplyOn, supplyQty, supplyLow, supplyOnInventory, checkSupplyStock, supplyCityWork, requestSupplies, supplyItemName,
            get supplyAttempted() { return supplyAttempted; },
        };`);
    const api = factory(...Object.values(ctx));
    return { api, state, cfg };
}

// Extrai o módulo "Cura na Joy" (v3.22.0) e o executa com stubs. Timers rodam na hora avançando o relógio falso (a espera
// pelo set-city vira 20 voltas de 500 ms; `state.onSleep` roda a cada espera, o teste usa para simular a tela). O
// `pokes-get` responde na hora com o hp do líder tirado de `init.pokesHp` (vazio = sem resposta; null = frame sem hp).
const H_START = '    // ---- Cura na Joy';
const H_END = '    // ---- Volta da cidade';

function loadHealModule(cfg, init) {
    init = init || {};
    const src = fs.readFileSync(SCRIPT, 'utf8');
    const a = src.indexOf(H_START), b = src.indexOf(H_END);
    if (a < 0 || b < 0) throw new Error('marcadores do módulo da cura não encontrados no script');
    const mod = src.slice(a, b);
    const clock = { now: Date.now() };
    const FakeDate = new Proxy(Date, { get(t, k) { return k === 'now' ? () => clock.now : t[k]; } });
    const state = { sent: [], switches: [], logs: [], hooks: [], hunts: [], onSleep: null, cityDone: false };
    const hpQueue = Array.isArray(init.pokesHp) ? init.pokesHp.slice() : [];
    const box = {};
    const ctx = {
        cfg,
        sendGame: (o) => {
            state.sent.push(o);
            if (o.type === 'pokes-get' && hpQueue.length) {
                const hp = hpQueue.shift();
                box.api.onPokes([{ id: 'a', team: true, leader: true, slot: 0, hp: hp == null ? undefined : hp }]);
            }
            return true;
        },
        switchHunt: (slug, tentativa, origem) => state.switches.push({ slug, tentativa, origem }),
        setHunt: (slug) => { state.hunts.push(slug); box.setSlug(slug); },
        logEvent: (k, d) => state.logs.push([k, d]),
        postWebhook: (k, p, m) => { state.hooks.push({ kind: k, content: p.content || '', title: p.embeds?.[0]?.title || '', meta: m }); return Promise.resolve(true); },
        playerName: () => 'Teste',
        normalize: (v) => String(v || '').toLowerCase().trim(),
        CITY_SLUGS: ['cerulean', 'pewter', 'viridian', 'cassino', 'arena_pvp', 'goldenrod', 'shopping'],
        huntSlug: init.huntSlug != null ? init.huntSlug : null,
        lastRealHunt: init.lastRealHunt || null,
        tripRunning: Boolean(init.tripRunning),
        setTimeout: (fn, ms) => { clock.now += ms || 0; if (state.onSleep) state.onSleep(); fn(); return 1; },
        Date: FakeDate,
    };
    const factory = new Function(...Object.keys(ctx), mod + `
        return {
            api: {
                onField: healOnField, onTeleport: healOnTeleport, onLeave: healOnLeave, onSetCity: healOnSetCity, onPokes: healOnPokes,
                busy: healBusy, status: healStatus, start: healStart,
                setHunt(slug) { huntSlug = slug; if (slug) lastRealHunt = slug; },
                flush: () => new Promise(r => setImmediate(r)),
            },
            setSlug(slug) { huntSlug = slug; },
        };`);
    const out = factory(...Object.values(ctx));
    box.api = out.api; box.setSlug = out.setSlug;
    return { api: out.api, state, cfg, clock };
}

// Volta da cidade (v3.23.0): `// ---- Volta da cidade` até `// ---- Lógica principal`. `init.env` sobrescreve o estado
// dos outros módulos (tripRunning, huntSwitch, clanTarget, route...); `api.set(nome, valor)` muda huntSlug/lastRealHunt etc.
const I_START = '    // ---- Volta da cidade';
const I_END = '    // ---- Lógica principal';

function loadIdleModule(cfg, init) {
    init = init || {};
    const src = fs.readFileSync(SCRIPT, 'utf8');
    const a = src.indexOf(I_START), b = src.indexOf(I_END);
    if (a < 0 || b < 0) throw new Error('marcadores do módulo da volta da cidade não encontrados no script');
    const mod = src.slice(a, b);
    const clock = { now: init.now || 1_000_000_000_000 };
    const FakeDate = new Proxy(Date, { get(t, k) { return k === 'now' ? () => clock.now : t[k]; } });
    const state = { switches: [], logs: [], hooks: [], sent: [] };
    const hpQueue = Array.isArray(init.pokesHp) ? init.pokesHp.slice() : [];
    const box = {};
    const env = Object.assign({
        huntSlug: null, lastRealHunt: null, tripRunning: false, heal: false, huntSwitch: null, swapPending: null,
        sellRunning: false, resumeHunt: null, dailyAutoBusy: false, clanRoute: false, clanTarget: null, route: null,
        catchRoute: false, healDeaths: [],
    }, init.env || {});
    const ctx = {
        cfg, env,
        sendGame: (o) => {
            state.sent.push(o);
            if (o.type === 'leave-hunt') env.huntSlug = null;
            if (o.type === 'pokes-get' && hpQueue.length) { const hp = hpQueue.shift(); box.api.onPokes([{ id: 'a', team: true, leader: true, hp: hp == null ? undefined : hp }]); }
            return true;
        },
        setTimeout: (fn, ms) => { clock.now += ms || 0; fn(); return 1; },
        switchHunt: (slug, tentativa, origem) => state.switches.push({ slug, tentativa, origem }),
        logEvent: (k, d) => state.logs.push([k, d]),
        postWebhook: (k, p, m) => { state.hooks.push({ kind: k, content: p.content || '', title: p.embeds?.[0]?.title || '', meta: m }); return Promise.resolve(true); },
        playerName: () => 'Teste',
        normalize: (v) => String(v || '').toLowerCase().trim(),
        CITY_SLUGS: ['cerulean', 'pewter', 'viridian', 'cassino', 'arena_pvp', 'goldenrod', 'shopping'],
        healBusy: () => env.heal,
        healLeader: (list) => list.find(p => p.team && p.leader) || null,
        clanRouteOn: () => env.clanRoute,
        routeStep: () => env.route,
        catchRouteActive: () => env.catchRoute,
        HEAL_DEATH_WINDOW_MS: 30 * 60 * 1000,
        Date: FakeDate,
    };
    // Os nomes que o módulo lê como variáveis soltas viram getters sobre `env` (via `with`).
    const scope = new Proxy({}, {
        has: (t, k) => ['huntSlug', 'lastRealHunt', 'tripRunning', 'huntSwitch', 'swapPending', 'sellRunning', 'resumeHunt', 'dailyAutoBusy', 'clanTarget', 'healDeaths'].includes(k),
        get: (t, k) => env[k],
        set: (t, k, v) => { env[k] = v; return true; },
    });
    const factory = new Function('scope', ...Object.keys(ctx), `with (scope) { ${mod}
        return {
            tick: idleTick, running: () => idleRunning, onHuntChange: idleOnHuntChange, onAlive: idleOnAlive, onPokes: idleOnPokes, status: idleStatus, since: idleSinceAt,
            set(k, v) { env[k] = v; },
        }; }`);
    const api = factory(scope, ...Object.values(ctx));
    box.api = api;
    return { api, state, cfg, clock, env };
}

// Extrai o módulo "Daily Gift" (v3.24.0) e o executa com stubs. `init.api(url, opts)` responde o REST (GET/POST
// /api/game/daily, GET /api/game/gifts, POST /api/game/gifts/{id}/claim). Timers curtos rodam na hora; `clock.now` é o relógio.
const F_START = '    // ---- Daily Gift';
const F_END = '    // ---- Breeding automático';

function loadGiftModule(cfg, init) {
    init = init || {};
    const src = fs.readFileSync(SCRIPT, 'utf8');
    const a = src.indexOf(F_START), b = src.indexOf(F_END);
    if (a < 0 || b < 0) throw new Error('marcadores do módulo do Daily Gift não encontrados no script');
    const mod = src.slice(a, b);
    const clock = { now: Date.now() };
    const FakeDate = new Proxy(Date, { get(t, k) { return k === 'now' ? () => clock.now : t[k]; } });
    const state = { calls: [], hooks: [], logs: [], longTimers: [] };
    const normalize = (v) => String(v || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    const ctx = {
        cfg,
        gameApi: (url, opts) => { state.calls.push({ url, opts }); return Promise.resolve().then(() => init.api(url, opts)); },
        logEvent: (k, d) => state.logs.push([k, d]),
        postWebhook: (k, p, m) => { state.hooks.push({ kind: k, content: p.content || '', desc: p.embeds?.[0]?.description || '', meta: m }); return Promise.resolve(true); },
        playerName: () => 'Teste',
        normalize,
        fmtNum: (n) => String(n),
        setTimeout: (fn, ms) => { if (ms >= 5000) { state.longTimers.push(fn); return 99; } fn(); return 1; },
        clearTimeout: () => {},
        Date: FakeDate,
    };
    const factory = new Function(...Object.keys(ctx), mod + `
        return {
            giftTick, giftStatus, giftCenterMode, scheduleGiftCheck, parseGift,
            get gift() { return gift; },
            get giftLast() { return giftLast; },
            get giftFailedAt() { return giftFailedAt; },
            get giftCenterCount() { return giftCenterCount; },
        };`);
    const api = factory(...Object.values(ctx));
    return { api, state, cfg, clock };
}

// Extrai o módulo "IV e qualidade do indivíduo capturado" (espera pelo poke-delta / plano B pokes-get). Timers ficam em
// `state.timers` ({ fn, ms, id }); `state.fire(ms)` dispara os pendentes com esse prazo; `clock.now` controla o Date.now().
const DT_START = '    // ---- IV e qualidade do indivíduo capturado';
const DT_END = '    // ---- Alerta de nível do líder';

function loadDetailsModule(cfg, init) {
    init = init || {};
    const src = fs.readFileSync(SCRIPT, 'utf8');
    const a = src.indexOf(DT_START), b = src.indexOf(DT_END);
    if (a < 0 || b < 0) throw new Error('marcadores do módulo de detalhes não encontrados no script');
    const mod = src.slice(a, b);

    const clock = { now: 1_000_000 };
    const state = { sent: [], logs: [], timers: [], recent: [], clock };
    let nextId = 1;
    state.fire = (ms) => {
        const due = state.timers.filter(t => t.ms === ms);
        state.timers = state.timers.filter(t => t.ms !== ms);
        clock.now += ms;
        for (const t of due) t.fn();
    };
    const FakeDate = class extends Date {
        constructor(...args) { super(...(args.length ? args : [clock.now])); }
        static now() { return clock.now; }
    };
    const ctx = {
        cfg,
        TAG: '[teste]',
        logEvent: (k, dd) => state.logs.push([k, dd]),
        normalize: (sx) => String(sx || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim(),
        noteRecentCapture: (id) => state.recent.push(id),
        setTimeout: (fn, ms) => { const id = nextId++; state.timers.push({ fn, ms, id }); return id; },
        clearTimeout: (id) => { state.timers = state.timers.filter(t => t.id !== id); },
        Date: FakeDate,
    };
    const factory = new Function(...Object.keys(ctx), mod + `
        return {
            withDetails, handlePokeDelta, handlePokesList, passesQualityFilter, qualityTier,
            get awaiting() { return awaitingDetails.length; },
            get pendentes() { return pendingDeltas.length; },
            DETAILS_TIMEOUT_MS, DETAILS_POKES_MS, DETAILS_PRE_MS, DETAILS_PAIR_MS,
            setSocket(ws) { lastSocket = ws; },
        };`);
    const api = factory(...Object.values(ctx));
    return { api, state, cfg, clock };
}

// Extrai o módulo "Evolução automática" (v3.25.0). `init.api(url, opts)` responde GET/POST /api/game/evolve; `init.city` é
// a cidade da viagem (padrão cerulean). Timers rodam na hora.
const E_START = '    // ---- Evolução automática';
const E_END = '    // ---- Poke Slot Machine';

function loadEvolveModule(cfg, init) {
    init = init || {};
    const src = fs.readFileSync(SCRIPT, 'utf8');
    const a = src.indexOf(E_START), b = src.indexOf(E_END);
    if (a < 0 || b < 0) throw new Error('marcadores do módulo de evolução não encontrados no script');
    const mod = src.slice(a, b);
    const state = { sent: [], hooks: [], logs: [], trips: [], calls: [], pokesReqs: 0 };
    const ctx = {
        cfg,
        sendGame: (o) => { state.sent.push(o); return true; },
        gameApi: (url, opts) => { state.calls.push({ url, method: opts?.method || 'GET', body: opts?.body ? JSON.parse(opts.body) : null }); return Promise.resolve().then(() => (init.api ? init.api(url, opts) : {})); },
        tripRequest: (key, dados, motivo) => state.trips.push({ key, dados, motivo }),
        requestPokes: () => { state.pokesReqs++; },
        tripCity: () => init.city || 'cerulean',
        logEvent: (k, d) => state.logs.push([k, d]),
        postWebhook: (k, p, m) => { state.hooks.push({ kind: k, content: p.content || '', desc: p.embeds?.[0]?.description || '', meta: m }); return Promise.resolve(true); },
        playerName: () => 'Teste',
        setTimeout: (fn) => { fn(); return 1; },
        Date,
    };
    const factory = new Function(...Object.keys(ctx), mod + `
        return {
            evolveOnPokes, evolveOnPokeXp, evolveCityWork, evolveCandidates, evolveWanted, evolveStatus,
            get evolveAttempted() { return evolveAttempted; },
            get evolveTeam() { return evolveTeam; },
        };`);
    const api = factory(...Object.values(ctx));
    return { api, state, cfg };
}

// Extrai o módulo "Poke Slot Machine" (v3.26.0). `init.api(url, opts)` responde GET /api/game/golden-stars e POST .../roll,
// .../pick; `init.city` é a cidade da viagem (padrão cerulean); `clock.now` é o relógio e `clock.rnd` o Math.random (0..1).
// Timers rodam na hora (as esperas "humanas" não contam).
const SM_START = '    // ---- Poke Slot Machine';
const SM_END = '    // ---- Daily Gift';

function loadSlotModule(cfg, init) {
    init = init || {};
    const src = fs.readFileSync(SCRIPT, 'utf8');
    const a = src.indexOf(SM_START), b = src.indexOf(SM_END);
    if (a < 0 || b < 0) throw new Error('marcadores do módulo da slot machine não encontrados no script');
    const mod = src.slice(a, b);
    const clock = { now: Date.UTC(2026, 9, 2, 12, 0, 0), rnd: 0 };
    const FakeDate = new Proxy(Date, { get(t, k) { return k === 'now' ? () => clock.now : t[k]; } });
    const FakeMath = new Proxy(Math, { get(t, k) { return k === 'random' ? () => clock.rnd : t[k]; } });
    const state = { sent: [], hooks: [], logs: [], trips: [], calls: [] };
    const normalize = (v) => String(v || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    const ctx = {
        cfg,
        sendGame: (o) => { state.sent.push(o); return true; },
        gameApi: (url, opts) => { state.calls.push({ url, method: opts?.method || 'GET', body: opts?.body ? JSON.parse(opts.body) : null }); return Promise.resolve().then(() => (init.api ? init.api(url, opts) : {})); },
        tripRequest: (key, dados, motivo) => state.trips.push({ key, dados, motivo }),
        tripCity: () => init.city || 'cerulean',
        logEvent: (k, d) => state.logs.push([k, d]),
        postWebhook: (k, p, m) => { state.hooks.push({ kind: k, content: p.content || '', desc: p.embeds?.[0]?.description || '', color: p.embeds?.[0]?.color, meta: m }); return Promise.resolve(true); },
        playerName: () => 'Teste',
        normalize,
        fmtNum: (n) => String(n),
        setTimeout: (fn) => { fn(); return 1; },
        Date: FakeDate,
        Math: FakeMath,
    };
    const factory = new Function(...Object.keys(ctx), mod + `
        return {
            slotTick, slotRead, slotCityWork, slotStatus, slotWanted, slotReadySlots, slotPending, slotWantedList, parseSlotState, slotNextEventAt,
            SLOT_POLL_MS, SLOT_RETRY_MS, SLOT_CITY,
            get slotState() { return slotState; },
            get slotLast() { return slotLast; },
            get slotFailedAt() { return slotFailedAt; },
            get slotTriedAt() { return slotTriedAt; },
            get slotFetchedAt() { return slotFetchedAt; },
        };`);
    const api = factory(...Object.values(ctx));
    return { api, state, cfg, clock };
}

// Extrai o módulo "Breeding automático" (v3.29.0). `init.api(url, opts)` responde GET center/quote e POST breed/hatch;
// `init.pokes` é a lista `pokes` inicial (o módulo lê `state.pokes`, mutável); `init.freshPokes(n)` devolve a lista que o jogo
// manda ao n-ésimo `pokes-get`; `init.family` = { pokes, items } do depot; `init.familyAction(payload)` responde às retiradas
// ({ ok, motivo }); `clock.now` é o relógio (as esperas avançam o relógio); `clock.rnd` o Math.random.
const BR_START = '    // ---- Breeding automático';
const BR_END = '    // ---- Clã: subir de rank';

function loadBreedModule(cfg, init) {
    init = init || {};
    const src = fs.readFileSync(SCRIPT, 'utf8');
    const a = src.indexOf(BR_START), b = src.indexOf(BR_END);
    if (a < 0 || b < 0) throw new Error('marcadores do módulo de breeding não encontrados no script');
    const mod = src.slice(a, b);
    const clock = { now: Date.UTC(2026, 9, 9, 12, 0, 0), rnd: 0 };
    const FakeDate = new Proxy(Date, { get(t, k) { return k === 'now' ? () => clock.now : t[k]; } });
    const FakeMath = new Proxy(Math, { get(t, k) { return k === 'random' ? () => clock.rnd : t[k]; } });
    const state = { sent: [], hooks: [], logs: [], trips: [], calls: [], familyActions: [], saves: 0, pokes: Array.isArray(init.pokes) ? init.pokes.slice() : [], family: init.family || { pokes: [], items: [] }, pokesGets: 0, onPokes: null, onFamily: null };
    const normalize = (v) => String(v || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    const ctx = {
        cfg,
        IV_MAX: 192,
        normalize,
        fmtNum: (n) => String(n),
        lastPokesList: state.pokes,
        lastFamilyDepot: state.family,
        tripRunning: false,
        sendGame: (m) => {
            state.sent.push(m);
            if (m.type === 'pokes-get' && init.freshPokes) { const l = init.freshPokes(++state.pokesGets); if (l && state.onPokes) { state.pokes.splice(0, state.pokes.length, ...l); state.onPokes(state.pokes); } }
            if (m.type === 'family-get' && init.familyReply !== false && state.onFamily) state.onFamily();
            return true;
        },
        gameApi: (url, opts) => { state.calls.push({ url, method: opts?.method || 'GET', body: opts?.body ? JSON.parse(opts.body) : null }); return Promise.resolve().then(() => (init.api ? init.api(url, opts) : {})); },
        familyAction: (payload, evento, dados, check) => { state.familyActions.push(payload); const r = init.familyAction ? init.familyAction(payload, check) : { ok: true }; state.logs.push([evento, Object.assign({}, dados, { ok: r.ok })]); return Promise.resolve(r); },
        tripRequest: (key, dados, motivo) => state.trips.push({ key, dados, motivo }),
        logEvent: (k, d) => state.logs.push([k, d]),
        postWebhook: (k, p, m) => { state.hooks.push({ kind: k, content: p.content || '', desc: p.embeds?.[0]?.description || '', color: p.embeds?.[0]?.color, meta: m }); return Promise.resolve(true); },
        playerName: () => 'Teste',
        saveCfg: () => { state.saves++; },
        setTimeout: (fn, ms) => { clock.now += ms || 0; fn(); return 1; },
        Date: FakeDate,
        Math: FakeMath,
    };
    const factory = new Function(...Object.keys(ctx), mod + `
        return {
            breedTick, breedCycle, breedPlan, breedCityWork, breedHatch, breedOnPokes, breedOnFamily, breedKeepsPoke, breedFoodReason, breedFoodList, breedFoodPick,
            breedCheckQuote, breedStoneNeeds, parseBreedCenter, breedTrunk, breedLines, breedActiveLines, breedStatus, breedFoodStatus, breedWanted, breedReset,
            BREED_POLL_MS, BREED_RETRY_MS,
            get breedPlanned() { return breedPlanned; },
            get breedWait() { return breedWait; },
            get breedCenter() { return breedCenter; },
            get breedLast() { return breedLast; },
        };`);
    const api = factory(...Object.values(ctx));
    state.onPokes = (l) => api.breedOnPokes(l);
    state.onFamily = () => api.breedOnFamily();
    return { api, state, cfg, clock };
}


// Extrai o módulo da Guild (v3.30.0+) junto com o da Pesca (`// ---- Guild` até `// ---- Clã`). `init.guild` = frame `guild`
// entregue por `api.handleGuild`; `init.api(url, opts)` responde o REST da pesca; `init.huntCatalog`/`init.creatures` como no clã;
// timers >= 1 s ficam em `state.timers` e `state.fire(ms)` dispara os desse prazo; `state.switches` = trocas de hunt pedidas.
const GU_START = '    // ---- Guild (v3.30.0)';
const GU_END = '    // ---- Clã: subir de rank sozinho';

function loadGuildModule(cfg, init) {
    init = init || {};
    const src = fs.readFileSync(SCRIPT, 'utf8');
    const a = src.indexOf(GU_START), b = src.indexOf(GU_END);
    if (a < 0 || b < 0) throw new Error('marcadores do módulo da guild não encontrados no script');
    const mod = src.slice(a, b);
    const clock = { now: Date.now() };
    const FakeDate = new Proxy(Date, { get(t, k) { return k === 'now' ? () => clock.now : t[k]; } });
    const state = { calls: [], sent: [], switches: [], hooks: [], logs: [], timers: [], fire: null };
    const normalize = (v) => String(v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
    const cr = init.creatures || [];
    const creatureLoot = new Map(cr.map(c => [c.pokeId, c.loot || []]));
    let tid = 0;
    const ctx = {
        cfg,
        TAG: '[teste]',
        gameApi: (url, opts) => { state.calls.push({ url, opts }); return Promise.resolve().then(() => init.api ? init.api(url, opts) : {}); },
        sendGame: (m) => { state.sent.push(m); return true; },
        logEvent: (k, d) => state.logs.push([k, d]),
        postWebhook: (k, p, m) => { state.hooks.push({ kind: k, content: p.content || '', desc: p.embeds?.[0]?.description || '', meta: m }); return Promise.resolve(true); },
        playerName: () => 'Teste',
        normalize,
        huntSlugFromName: (name) => normalize(name).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''),
        switchHunt: (slug, tentativa, origem) => { state.switches.push({ slug, tentativa, origem }); },
        huntSlug: init.huntSlug != null ? init.huntSlug : null,
        CITY_SLUGS: ['cerulean', 'pewter', 'viridian', 'cassino', 'arena_pvp', 'goldenrod', 'shopping'],
        team: init.team || [],
        huntCatalog: init.huntCatalog || null,
        loadHuntCatalog: () => Promise.resolve(init.huntCatalog || null),
        loadItemsCatalog: () => Promise.resolve(),
        creatureLoot,
        lootPerKill: (speciesId, itemName) => (creatureLoot.get(Number(speciesId)) || []).filter(l => normalize(l?.name) === normalize(itemName)).reduce((a, l) => a + (Number(l.chance) || 0) / 100000 * ((Number(l.minCount) || 1) + (Number(l.maxCount) || Number(l.minCount) || 1)) / 2, 0),
        tripRunning: false, huntSwitch: null, swapPending: null,
        dailyWantsHunt: () => Boolean(init.dailyOnHunt),
        healBusy: () => false,
        setTimeout: (fn, ms) => { const id = ++tid; if (ms >= 1000) state.timers.push({ id, fn, ms }); else fn(); return id; },
        clearTimeout: (id) => { const i = state.timers.findIndex(t => t.id === id); if (i >= 0) state.timers.splice(i, 1); },
        Date: FakeDate,
        console,
    };
    state.fire = (ms) => { const due = state.timers.filter(t => t.ms <= ms); state.timers = state.timers.filter(t => t.ms > ms); clock.now += ms; for (const t of due) t.fn(); };
    const factory = new Function(...Object.keys(ctx), mod + `
        return {
            handleGuild, guildRouteTick, guildPlan, guildStatus, guildRouteLine, guildKeepsItem, guildOnHuntChange, guildOnFishingCooldown, guildActionDone, guildOnError, fishOnMessage,
            setHunt(slug) { huntSlug = slug; },
            get guildTarget() { return guildTarget; }, get guildFrom() { return guildFrom; }, get guildWait() { return guildWait; }, get guildPending() { return guildPending; }, get guildLast() { return guildLast; },
        };`);
    const api = factory(...Object.values(ctx));
    return { api, state, cfg, clock };
}

// Farm por lista (v3.33.0): `// ---- Farm por lista` até `// ---- Guild (v3.30.0)`. `init.huntCatalog` (map-markers já resolvido),
// `init.creatures` (loot por speciesId), `init.items` (catálogo público id -> { name }), `init.huntSlug`, `init.team`, `init.env`
// ({ tripRunning, huntSwitch, swapPending, dailyOnHunt, healBusy }, mutável em `state.env`). Timers >= 1 s ficam em `state.timers`;
// `state.fire(ms)` dispara os desse prazo e avança o relógio; `state.saves` conta os saveCfg.
const FM_START = '    // ---- Farm por lista';
const FM_END = '    // ---- Guild (v3.30.0)';
function loadFarmModule(cfg, init) {
    init = init || {};
    const src = fs.readFileSync(SCRIPT, 'utf8');
    const a = src.indexOf(FM_START), b = src.indexOf(FM_END);
    if (a < 0 || b < 0) throw new Error('marcadores do módulo do farm não encontrados no script');
    const mod = src.slice(a, b);
    const clock = { now: Date.now() };
    const FakeDate = new Proxy(Date, { get(t, k) { return k === 'now' ? () => clock.now : t[k]; } });
    const env = Object.assign({ tripRunning: false, huntSwitch: null, swapPending: null, dailyOnHunt: false, healBusy: false }, init.env || {});
    const state = { sent: [], switches: [], hooks: [], logs: [], timers: [], saves: 0, env, fire: null };
    const normalize = (v) => String(v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
    const cr = init.creatures || [];
    const creatureLoot = new Map(cr.map(c => [c.pokeId, c.loot || []]));
    const itemsCatalog = new Map((init.items || []).map(i => [Number(i.id), i]));
    let tid = 0;
    const ctx = {
        cfg,
        TAG: '[teste]',
        logEvent: (k, d) => state.logs.push([k, d]),
        postWebhook: (k, p, m) => { state.hooks.push({ kind: k, content: p.content || '', desc: p.embeds?.[0]?.description || '', meta: m }); return Promise.resolve(true); },
        playerName: () => 'Teste',
        saveCfg: () => { state.saves++; },
        normalize,
        huntSlugFromName: (name) => normalize(name).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''),
        switchHunt: (slug, tentativa, origem) => { state.switches.push({ slug, tentativa, origem }); },
        huntSlug: init.huntSlug != null ? init.huntSlug : null,
        CITY_SLUGS: ['cerulean', 'pewter', 'viridian', 'cassino', 'arena_pvp', 'goldenrod', 'shopping'],
        team: init.team || [],
        clanLevelCap: () => { const t = init.team || []; return t.length ? Math.max(...t.map(p => Number(p.level) || 0)) : 9999; },
        huntCatalog: init.huntCatalog || null,
        loadHuntCatalog: () => Promise.resolve(init.huntCatalog || null),
        loadItemsCatalog: () => Promise.resolve(itemsCatalog),
        itemsCatalog,
        huntLoot: new Map(),
        lootPerKill: (speciesId, itemName) => (creatureLoot.get(Number(speciesId)) || []).filter(l => normalize(l?.name) === normalize(itemName)).reduce((a, l) => a + (Number(l.chance) || 0) / 100000 * ((Number(l.minCount) || 1) + (Number(l.maxCount) || Number(l.minCount) || 1)) / 2, 0),
        get tripRunning() { return env.tripRunning; }, get huntSwitch() { return env.huntSwitch; }, get swapPending() { return env.swapPending; },
        dailyWantsHunt: () => Boolean(env.dailyOnHunt),
        healBusy: () => Boolean(env.healBusy),
        setTimeout: (fn, ms) => { const id = ++tid; if (ms >= 1000) state.timers.push({ id, fn, ms }); else fn(); return id; },
        clearTimeout: (id) => { const i = state.timers.findIndex(t => t.id === id); if (i >= 0) state.timers.splice(i, 1); },
        Date: FakeDate,
        console,
    };
    state.fire = (ms) => { const due = state.timers.filter(t => t.ms <= ms); state.timers = state.timers.filter(t => t.ms > ms); clock.now += ms; for (const t of due) t.fn(); };
    // getters do ctx viram parâmetros simples da Function: o módulo lê `tripRunning` etc. como variáveis, então passamos funções
    // de leitura por meio de um objeto `__env` e reescrevemos as referências no recorte.
    const modEnv = mod.replace(/\btripRunning\b/g, '__env.tripRunning').replace(/\bhuntSwitch\b/g, '__env.huntSwitch').replace(/\bswapPending\b/g, '__env.swapPending');
    const names = Object.keys(ctx).filter(k => !['tripRunning', 'huntSwitch', 'swapPending'].includes(k)).concat('__env');
    const values = names.map(k => (k === '__env' ? env : ctx[k]));
    const factory = new Function(...names, modEnv + `
        return {
            farmTick, farmOnKill, farmOnHuntChange, farmHuntFailed, farmReset, farmLine, farmKeepsItem, farmCurrent, parseFarmLine, parseFarmText, farmHuntFor, farmList, farmOn,
            setHunt(slug) { huntSlug = slug; },
            get farmTarget() { return farmTarget; }, get farmFrom() { return farmFrom; }, get farmWait() { return farmWait; }, get farmSkipped() { return farmSkipped; },
        };`);
    const api = factory(...values);
    return { api, state, cfg, clock };
}

module.exports = { loadFarmModule, loadGuildModule, loadBreedModule, loadSlotModule, loadEvolveModule, loadDetailsModule, loadGiftModule, loadIdleModule, loadHealModule, loadSupplyModule, loadDepositModule, loadClanModule, loadLevelModule, loadReloadModule, loadDailyModule, loadCatchModule, loadPokeSellModule, loadBallsModule, loadTripModule, team, assert };
