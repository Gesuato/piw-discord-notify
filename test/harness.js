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

    const state = { sent: [], hooks: [], logs: [], longTimers: [], saved: 0 };
    const ctx = {
        cfg,
        sendGame: (o) => { state.sent.push(o); return true; },
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
    const state = { calls: [], switches: [], hooks: [], logs: [], pokesReqs: 0, longTimers: [] };
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
        setTimeout: (fn, ms) => { if (ms >= 5000) { state.longTimers.push(fn); return 99; } fn(); return 1; },
        clearTimeout: () => {},
        Date: FakeDate,
    };
    const factory = new Function(...Object.keys(ctx), mod + `
        return {
            dailyTick, noteDailyKill, noteHuntChange, dailyStatus, dailyReturnTarget, dailyOnHunt,
            setHunt(slug) { huntSlug = slug; noteHuntChange(slug); },
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
        CITY_SLUGS: ['cerulean', 'pewter', 'viridian', 'cassino', 'arena_pvp'],
        dailyEnabled: () => false,
        dailyOnHunt: () => false,
        requestPokes: () => { state.pokesReqs = (state.pokesReqs || 0) + 1; },
        lastPokesReqAt: 0,
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
            pokeSellIntervalRange, drawPokeSellDelay, restartPokeSellCycle, pokeSellDue, pokeSellStatus, pokeSellTick,
            get lastPokesList() { return lastPokesList; },
            get lastPokeSellAt() { return lastPokeSellAt; },
        };`);
    const api = factory(...Object.values(ctx));
    return { api, state, cfg, clock };
}

module.exports = { loadLevelModule, loadReloadModule, loadDailyModule, loadCatchModule, loadPokeSellModule, team, assert };
