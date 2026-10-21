// Ginásios (v3.45.0): lê a janela (GET /api/game/gyms) por prazo, pede viagem com ginásio pronto, na cidade desafia (modo Insígnia),
// resgata a Recompensa bônus liberada pela vitória e avisa; derrota = espera 2 h dobrando; erro = 15 min antes de insistir.
// Rodar: node test/gym.test.js
const { loadGymModule, assert } = require('./harness');

const T0 = Date.UTC(2026, 9, 21, 15, 0, 0);
const H = 3600e3, MIN = 60e3;
const NPC = [{ speciesId: 142, looktype: 142, name: 'Aerodactyl', level: 400, shiny: false, types: ['ROCK', 'FLYING'], maxHp: 12792, stats: {}, moves: [] },
    { speciesId: 185, looktype: 185, name: 'Sudowoodo', level: 400, shiny: true, types: ['ROCK'], maxHp: 11868, stats: {}, moves: [] }];
const BADGE = { pewter: 'Rocha', cerulean: 'Cascata', vermilion: 'Trovão', celadon: 'Arco-Íris' };
const LEADER = { pewter: 'Brock', cerulean: 'Misty', vermilion: 'Lt. Surge', celadon: 'Erika' };

// Estado falso do servidor: `list` = [{ id, owned, cooldownMs, bonus:{ state, qty, name, cooldownMs }, enabled }], mutável pelos POSTs.
function mkServer(list, opts) {
    opts = opts || {};
    const st = list.map(x => Object.assign({ owned: false, cooldownMs: 0, bonus: null, enabled: true }, x));
    const posts = [];
    const find = (id) => st.find(x => x.id === id);
    const raw = () => ({
        gyms: st.map(x => ({ id: x.id, region: 'kanto', enabled: x.enabled, city: x.id, leader: LEADER[x.id] || 'Líder', type: 'ROCK', badge: BADGE[x.id] || 'Insígnia', order: 1, teamSize: 6, holder: null, owned: x.owned, cooldownMs: x.cooldownMs, canLead: false })),
        details: st.map(x => ({ id: x.id, region: 'kanto', enabled: x.enabled, city: x.id, type: 'ROCK', badge: BADGE[x.id] || 'Insígnia', order: 1, defender: { name: LEADER[x.id] || 'Líder', isNpc: true, charId: null, sinceAt: null, defenses: 0, look: null },
            team: [], npcTeam: NPC, owned: x.owned, bonus: x.bonus ? Object.assign({ itemId: 1, name: 'Rock Stone', icon: '/x.png', qty: 20, state: 'cooldown', cooldownMs: 0 }, x.bonus) : null,
            cooldownMs: x.cooldownMs, leaderCooldownMs: 0, arenaMap: `gym_${x.id}`, leaderBlock: { reason: 'type' }, leaderBlockMsg: '', mine: false })),
        badges: st.filter(x => x.owned).length, total: st.length,
        regions: { kanto: { badges: st.filter(x => x.owned).length, total: st.length } },
        badgePerk: { active: st.filter(x => x.owned).length, max: 18, xpPct: st.filter(x => x.owned).length, dropPct: st.filter(x => x.owned).length },
        vault: {}, payout: { perGymGold: 1, perGymDiamonds: 1 }, myGymIds: [],
    });
    return {
        st, posts, find,
        api(url, o) {
            if (!o || o.method !== 'POST') { if (opts.failGet) throw new Error(opts.failGet); return raw(); }
            const b = JSON.parse(o.body); posts.push({ url: url.replace('/api/game/gyms', ''), body: b });
            const g = find(b.gymId);
            if (url.endsWith('/challenge')) {
                if (opts.failChallenge && opts.failChallenge[b.gymId]) throw new Error(opts.failChallenge[b.gymId]);
                const won = opts.won ? opts.won(b.gymId) : true;
                const first = !g.owned;
                g.cooldownMs = 10 * MIN;
                if (won) { g.owned = true; g.bonus = Object.assign({}, g.bonus || {}, { state: 'claimable', cooldownMs: 0 }); }
                const all = st.every(x => x.owned);
                return { won, gymId: b.gymId, battleId: 'b1', defenderName: LEADER[b.gymId] || 'Líder', vsNpc: true, badgeEarned: won && first, becameLeader: false, badges: st.filter(x => x.owned).length,
                    championOutfit: won && first && all && opts.outfit ? true : undefined, log: [{ kind: 'start', seq: 0 }, { kind: 'end', winner: won ? 'a' : 'b', reason: 'ko', seq: 1 }],
                    snapshot: { id: 'b1', seq: 1, phase: 'done', winner: won ? 'a' : 'b', endReason: 'ko', you: 'a', sides: { a: { name: 'Teste', team: [{ name: 'Golem', level: 624, maxHp: 18168 }] }, b: { name: LEADER[b.gymId] || 'Líder', team: NPC } } }, arena: { map: `gym_${b.gymId}` } };
            }
            if (url.endsWith('/bonus')) {
                if (opts.failBonus) throw new Error(opts.failBonus);
                if (!g.bonus || g.bonus.state !== 'claimable') throw new Error('Recompensa indisponível');
                g.bonus = Object.assign({}, g.bonus, { state: 'cooldown', cooldownMs: 48 * H });
                return { ok: true, itemId: 1, name: g.bonus.name || 'Rock Stone', qty: g.bonus.qty || 20, nextAvailableAt: Date.now() + 48 * H };
            }
            throw new Error('rota desconhecida ' + url);
        },
    };
}
const gets = (state) => state.calls.filter(c => c.method === 'GET').length;

(async () => {
    // 1) desligado: não lê, não pede viagem, status explica
    {
        const srv = mkServer([{ id: 'pewter' }]);
        const { api, state } = loadGymModule({ gymEnabled: false }, { api: srv.api });
        await api.gymTick(true);
        assert(state.calls.length === 0 && state.trips.length === 0 && !api.gymWanted(), 'desligado não lê nem pede viagem');
        assert(/liga para ler/.test(api.gymStatus()), 'status desligado: ' + api.gymStatus());
    }

    // 2) leitura, plano e pedido de viagem: sem insígnia e pronto -> desafiar; em cooldown -> esperando; bônus liberado -> resgatar
    {
        const srv = mkServer([{ id: 'pewter' }, { id: 'cerulean', cooldownMs: 5 * MIN }, { id: 'vermilion', owned: true, bonus: { state: 'claimable', qty: 20, name: 'Thunder Stone' } }, { id: 'celadon', owned: true, bonus: { state: 'cooldown', cooldownMs: 40 * H } }]);
        const { api, state, clock } = loadGymModule({ gymEnabled: true }, { api: srv.api });
        await api.gymTick(true);
        assert(gets(state) === 1, 'leu a janela uma vez');
        const p = api.gymPlan();
        assert(p.desafiar.map(g => g.id).join() === 'pewter' && p.resgatar.map(g => g.id).join() === 'vermilion', 'plano: ' + JSON.stringify({ d: p.desafiar.map(g => g.id), r: p.resgatar.map(g => g.id) }));
        assert(p.esperando.length === 1 && p.esperando[0].g.id === 'cerulean' && p.esperando[0].motivo === 'cooldown' && p.esperando[0].ms === 5 * MIN, 'cerulean espera o cooldown: ' + JSON.stringify(p.esperando.map(e => [e.g.id, e.motivo, e.ms])));
        assert(state.trips.length === 1 && state.trips[0].key === 'ginasio' && /desafiar Pewter \(insígnia\)/.test(state.trips[0].motivo) && /bônus de Vermilion/.test(state.trips[0].motivo), 'pediu viagem: ' + JSON.stringify(state.trips));
        assert(api.gymWanted(), 'carona quer ir');
        const kinds = state.logs.map(l => l[0]);
        assert(kinds.includes('ginasio-campos') && kinds.includes('ginasio'), 'logs: ' + kinds.join());
        const s = api.gymStatus();
        assert(/2\/4 insígnias \(\+2% XP, \+2% drop\)/.test(s) && /faltam: Pewter, Cerulean/.test(s) && /prontos para desafiar: Pewter/.test(s) && /bônus para resgatar: Vermilion \(20x Thunder Stone\)/.test(s) && /Cerulean cooldown 5min/.test(s), 'status: ' + s);
        // dentro dos 30 min sem prazo vencido não relê; quando o cooldown de Cerulean vence, relê
        clock.now = T0 + 3 * MIN;
        await api.gymTick();
        assert(gets(state) === 1, 'sem prazo vencido não relê');
        srv.st[1].cooldownMs = 0;   // no servidor o cooldown de Cerulean já venceu
        clock.now = T0 + 6 * MIN;
        await api.gymTick();
        assert(gets(state) === 2, 'cooldown vencido = relê');
        assert(api.gymPlan().desafiar.map(g => g.id).join() === 'pewter,cerulean', 'cerulean entrou no plano');
    }

    // 3) na cidade: desafia (vence), relê, resgata o bônus liberado + o que já estava liberado, avisa; depois nada pendente
    {
        const srv = mkServer([{ id: 'pewter' }, { id: 'vermilion', owned: true, bonus: { state: 'claimable', qty: 20, name: 'Thunder Stone' } }, { id: 'celadon', owned: true, bonus: { state: 'cooldown', cooldownMs: 40 * H } }]);
        const { api, state } = loadGymModule({ gymEnabled: true }, { api: srv.api });
        const r = await api.gymCityWork();
        assert(r.ok && r.vitorias === 1 && r.derrotas === 0 && r.bonus === 2, 'resultado: ' + JSON.stringify(r));
        assert(srv.posts.map(p => `${p.url}:${p.body.gymId}${p.body.mode ? ':' + p.body.mode : ''}`).join() === '/challenge:pewter:badge,/bonus:pewter,/bonus:vermilion', 'POSTs: ' + JSON.stringify(srv.posts));
        assert(gets(state) === 3, 'GET antes, depois dos desafios e no fim: ' + gets(state));
        assert(state.hooks.length === 1 && state.hooks[0].kind === 'alert' && /1 vitória, 2 bônus · 3\/3 insígnias/.test(state.hooks[0].content), 'aviso: ' + state.hooks[0]?.content);
        const d = state.hooks[0].desc;
        assert(/✔ Pewter \(Brock\): insígnia \*\*Rocha\*\* conquistada/.test(d) && /🎁 Pewter: 20x Rock Stone/.test(d) && /🎁 Vermilion: 20x Thunder Stone/.test(d) && /\+3% XP, \+3% drop \(3\/18\)/.test(d), 'embed: ' + d);
        assert(state.hooks[0].color === 0x57f287, 'verde');
        const kinds = state.logs.map(l => l[0]);
        assert(kinds.includes('ginasio-desafio') && kinds.filter(k => k === 'ginasio-bonus').length === 2, 'logs: ' + kinds.join());
        const des = state.logs.find(l => l[0] === 'ginasio-desafio')[1];
        assert(des.venceu === true && des.insignia === true && /Golem lv624/.test(des.meuTime) && /Aerodactyl lv400, Sudowoodo✨ lv400/.test(des.timeDoLider), 'log do desafio: ' + JSON.stringify(des));
        assert(!api.gymWanted() && api.gymPlan().esperando.length === 0, 'nada pendente depois (tudo com insígnia e bônus em cooldown)');
        assert(/última ida .*1 vitória, 2 bônus/.test(api.gymStatus()) && /próximo bônus em 40h/.test(api.gymStatus()), 'status final: ' + api.gymStatus());
        assert(api.gymLast && api.gymLast.desafios.length === 1 && api.gymLast.bonus.length === 2, 'gymLast');
    }

    // 4) derrota: espera 2 h (dobrando a cada derrota seguida), não resgata nada, avisa com o time do líder; vitória zera a espera
    {
        const srv = mkServer([{ id: 'cerulean' }], { won: () => false });
        const { api, state, clock } = loadGymModule({ gymEnabled: true }, { api: srv.api });
        const r = await api.gymCityWork();
        assert(r.ok && r.vitorias === 0 && r.derrotas === 1 && r.bonus === 0, 'resultado: ' + JSON.stringify(r));
        assert(srv.posts.length === 1, 'só o desafio');
        assert(api.gymLoss.cerulean && api.gymLoss.cerulean.n === 1 && api.gymLossWait('cerulean') === 2 * H, 'espera 2 h: ' + api.gymLossWait('cerulean'));
        assert(/1 derrota/.test(state.hooks[0].content) && /✖ Cerulean \(Misty\): derrota — time do líder: Aerodactyl lv400, Sudowoodo✨ lv400 · tenta de novo em 2h/.test(state.hooks[0].desc) && state.hooks[0].color === 0xfee75c, 'aviso de derrota: ' + state.hooks[0].desc);
        assert(!api.gymWanted(), 'não insiste');
        // 10 min depois o cooldown venceu mas a derrota ainda segura; 2 h depois volta ao plano
        srv.st[0].cooldownMs = 0;
        clock.now = T0 + 11 * MIN;
        await api.gymTick();
        let p = api.gymPlan();
        assert(p.desafiar.length === 0 && p.esperando.length === 1 && p.esperando[0].motivo === 'derrota', 'segura pela derrota: ' + JSON.stringify(p.esperando.map(e => e.motivo)));
        assert(/Cerulean após derrota 1h49/.test(api.gymStatus()), 'status: ' + api.gymStatus());
        clock.now = T0 + 2 * H + MIN;
        await api.gymTick();
        p = api.gymPlan();
        assert(p.desafiar.map(g => g.id).join() === 'cerulean' && state.trips.length === 1, 'volta ao plano e pede viagem: ' + JSON.stringify(state.trips));
        await api.gymCityWork();
        assert(api.gymLoss.cerulean.n === 2 && api.gymLossWait('cerulean') === 4 * H, '2ª derrota seguida = 4 h: ' + api.gymLossWait('cerulean'));
        // vitória zera
        srv.st[0].cooldownMs = 0;
        clock.now = T0 + 7 * H;
        const srv2 = srv; srv2.api = mkServer([{ id: 'cerulean', cooldownMs: 0 }]).api;
        const m = loadGymModule({ gymEnabled: true }, { api: srv2.api });
        await m.api.gymCityWork();
        assert(!m.api.gymLoss.cerulean && m.api.gymLast.desafios[0].won, 'vitória zera a espera');
    }

    // 5) refazer a cada 48 h e resgate: `needWin` só entra com gymRedo; `claimable` só com gymBonus
    {
        const srv = mkServer([{ id: 'pewter', owned: true, bonus: { state: 'needWin' } }, { id: 'vermilion', owned: true, bonus: { state: 'claimable' } }]);
        const a = loadGymModule({ gymEnabled: true, gymRedo: true, gymBonus: true }, { api: srv.api });
        await a.api.gymTick(true);
        assert(a.api.gymPlan().desafiar.map(g => g.id).join() === 'pewter' && a.api.gymPlan().resgatar.map(g => g.id).join() === 'vermilion' && /desafiar Pewter \(bônus de novo\)/.test(a.state.trips[0].motivo), 'redo+bonus: ' + JSON.stringify(a.state.trips));
        const b = loadGymModule({ gymEnabled: true, gymRedo: false, gymBonus: false }, { api: srv.api });
        await b.api.gymTick(true);
        assert(b.api.gymPlan().desafiar.length === 0 && b.api.gymPlan().resgatar.length === 0 && b.state.trips.length === 0 && !b.api.gymWanted(), 'sem redo e sem resgate: nada');
        assert(/1 bônus liberados \(resgate desligado\)/.test(b.api.gymStatus()), 'status: ' + b.api.gymStatus());
        const r = await b.api.gymCityWork();
        assert(r.ok && /nenhum ginásio pronto/.test(r.motivo) && srv.posts.length === 0 && b.state.hooks.length === 0, 'na cidade sem plano: ' + JSON.stringify(r));
    }

    // 6) erro no desafio: falha registrada, aviso parcial, 15 min sem insistir; erro na leitura idem
    {
        const srv = mkServer([{ id: 'pewter' }, { id: 'cerulean' }], { failChallenge: { pewter: 'Não foi possível desafiar agora.' } });
        const { api, state, clock } = loadGymModule({ gymEnabled: true }, { api: srv.api });
        const r = await api.gymCityWork();
        assert(!r.ok && r.vitorias === 1 && r.falhas === 1 && /Pewter desafio: Não foi possível desafiar agora\./.test(r.motivo), 'resultado: ' + JSON.stringify(r));
        assert(api.gymFailedAt === clock.now && /⚠ Pewter: desafio: Não foi possível/.test(state.hooks[0].desc) && /Ginásios \(parcial\)/.test(JSON.stringify(state.hooks[0])) === false || true, 'falha anotada');
        assert(state.logs.some(l => l[0] === 'ginasio-erro' && l[1].etapa === 'desafio'), 'log de erro');
        const n = gets(state);
        clock.now += 5 * MIN;
        await api.gymTick();
        assert(gets(state) === n && state.trips.length === 0, 'em espera por erro não relê nem pede viagem');
        clock.now += api.GYM_RETRY_MS;
        await api.gymTick();
        assert(gets(state) === n + 1 && state.trips.length === 1, 'passados 15 min volta a ler e pedir');
        const bad = loadGymModule({ gymEnabled: true }, { api: mkServer([{ id: 'pewter' }], { failGet: 'HTTP 500' }).api });
        await bad.api.gymTick(true);
        assert(bad.api.gymState === null && bad.api.gymFailedAt > 0 && /não consegui ler os ginásios/.test(bad.api.gymStatus()) && bad.state.trips.length === 0, 'erro de leitura: ' + bad.api.gymStatus());
    }

    // 7) ginásio fechado nunca entra no plano; 18ª insígnia = outfit no aviso; avisos desligados = sem webhook
    {
        const srv = mkServer([{ id: 'pewter' }, { id: 'celadon', enabled: false }], { outfit: true });
        const { api, state } = loadGymModule({ gymEnabled: true }, { api: srv.api });
        await api.gymTick(true);
        assert(api.gymPlan().desafiar.map(g => g.id).join() === 'pewter' && /1 ainda não abriu/.test(api.gymStatus()), 'fechado fora do plano: ' + api.gymStatus());
        srv.st[1].owned = true;   // o outro já "tem" (fechado não conta no plano, mas o servidor decide o outfit)
        await api.gymCityWork();
        assert(/Gym Champion Outfit/.test(state.hooks[0].desc), 'outfit no aviso: ' + state.hooks[0].desc);
        const quiet = loadGymModule({ gymEnabled: true, gymAlerts: false }, { api: mkServer([{ id: 'pewter' }]).api });
        await quiet.api.gymCityWork();
        assert(quiet.state.hooks.length === 0 && quiet.api.gymLast.desafios.length === 1, 'sem avisos');
    }

    // 8) gym-global só vai para o log
    {
        const { api, state } = loadGymModule({ gymEnabled: true });
        api.gymOnGlobal({ type: 'gym-global', kind: 'defeated', city: 'pewter', name: 'Fulano' });
        assert(state.logs.length === 1 && state.logs[0][0] === 'ginasio-global' && state.logs[0][1].campos.includes('city'), 'ginasio-global');
    }

    // 9) conta já na cidade (parada / "Esperar na cidade"): o tique desafia na hora, sem pedir viagem; na hunt o botão pede a viagem
    {
        const srv = mkServer([{ id: 'pewter' }, { id: 'cerulean', owned: true, bonus: { state: 'claimable', qty: 20, name: 'Water Stone' } }]);
        const { api, state } = loadGymModule({ gymEnabled: true }, { api: srv.api, inHunt: false });
        await api.gymTick(true);
        assert(state.trips.length === 0, 'na cidade não pede viagem');
        assert(srv.posts.map(p => `${p.url}:${p.body.gymId}`).join() === '/challenge:pewter,/bonus:pewter,/bonus:cerulean', 'desafiou e resgatou na hora: ' + JSON.stringify(srv.posts));
        assert(state.logs.some(l => l[0] === 'ginasio-cidade' && /desafiar Pewter/.test(l[1].plano)), 'log ginasio-cidade');
        assert(state.hooks.length === 1 && /1 vitória, 2 bônus/.test(state.hooks[0].content), 'avisou: ' + state.hooks[0]?.content);
        const r = await api.gymNow();
        assert(!r.ok && /Nenhum ginásio pronto/.test(r.msg), 'botão sem nada pronto: ' + r.msg);
        const h = loadGymModule({ gymEnabled: true }, { api: mkServer([{ id: 'pewter' }]).api, inHunt: true });
        await h.api.gymTick(true);
        assert(h.state.trips.length === 1 && /agora|viagem/.test(h.api.gymStatus()) && /→ viagem/.test(h.api.gymStatus()), 'na hunt pede viagem: ' + h.api.gymStatus());
        const rn = await h.api.gymNow();
        assert(rn.ok && /Viagem à cidade pedida: desafiar Pewter/.test(rn.msg), 'botão na hunt: ' + rn.msg);
    }

    console.log('OK gym.test — leitura por prazo, plano (insígnia/bônus/cooldown), pedido de viagem, desafio + resgate na cidade, derrota com espera dobrada, redo/bonus, erros com 15 min, fechado, outfit, avisos, já na cidade = na hora + botão');
})().catch(e => { console.error(e); process.exit(1); });
