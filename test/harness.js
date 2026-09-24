// Extrai o módulo "Alerta de nível / troca de líder / rota" do userscript e o executa com stubs.
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

module.exports = { loadLevelModule, team, assert };
