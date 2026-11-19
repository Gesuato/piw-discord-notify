// Raid Mundial (v3.64.0): Darkrai em Cerulean. Entrada sozinha quando o `raid-state` diz que a Raid abriu, acompanhamento pelos frames
// `field` (HUD `raid`), fim pelo `raid-end` (volta para a hunt, ou reentrada quando o time caiu), dia esgotado ("Volte amanhã"),
// recusa do jogo, enter-hunt duplicado da tela barrado no socket, recompensa (`raid-loot`), entrada na mão e recarga no meio.
// Formatos levantados do bundle em 18/11/2026 (ainda não vistos no log).
// Rodar: node test/raid.test.js
const { loadRaidModule, assert: check } = require('./harness');
const nodeAssert = require('assert');
const assert = Object.assign((c, m) => check(c, m), { strictEqual: nodeAssert.strictEqual, deepStrictEqual: nodeAssert.deepStrictEqual });

const MIN = 60e3;
const RAID = 'raid_cerulean';
const logsOf = (st, k) => st.logs.filter(l => l[0] === k).map(l => l[1]);
const types = (st) => st.sent.map(m => m.type);
const openState = (clock, extra) => Object.assign({ type: 'raid-state', active: true, bossName: 'Darkrai', bossLevel: 1000, hpLeft: 8e8, hpMax: 1e9, endsAt: clock.now + 120 * MIN, startedAt: clock.now }, extra || {});
const hud = (clock) => ({ type: 'field', raid: { bossName: 'Darkrai', bossLevel: 1000, hpLeft: 7e8, hpMax: 1e9, endsAt: clock.now + 30 * MIN, raidEndsAt: clock.now + 120 * MIN } });

async function enter(t, extra) {
    const { api, state, clock } = t;
    api.onMessage(openState(clock, extra));
    api.tick();                           // acabou de abrir: espera os 20 s
    assert(!api.run(), 'não entra no mesmo instante em que a Raid abriu');
    await state.drain(api.RAID_ENTER_DELAY_MS);
    api.tick();
    await state.drain(10e3);              // leave-hunt → tela vai à cidade → joy-heal → hunt-resume → a tela manda o enter-hunt
    api.onField(hud(clock));
}

(async () => {
    // 1. Raid abre → sai da hunt, cura, a tela entra; fim por tempo → volta para a hunt e não tenta mais hoje
    {
        const t = loadRaidModule({}, { huntSlug: 'rhyhorn' });
        const { api, state, clock } = t;
        await enter(t);
        const tp = types(state);
        assert(tp.indexOf('leave-hunt') < tp.indexOf('joy-heal'), 'saiu da hunt antes de curar');
        assert.deepStrictEqual(state.huntNudges, [RAID], 'hunt-resume sintético para a Raid');
        assert.strictEqual(state.sent.filter(m => m.type === 'enter-hunt' && m.slug === RAID).length, 1, 'um único enter-hunt da Raid (o da tela)');
        assert.strictEqual(api.run().fase, 'dentro');
        assert(api.run().fieldSeen && api.run().hud.hpMax === 1e9, 'HUD do boss lido do field');
        assert(/Raid do Darkrai em andamento \(70% de vida\)/.test(api.busyReason()), api.busyReason());
        // a tela reenvia o enter-hunt: barrado
        assert.strictEqual(api.telaEnter(), false, 'reenvio da tela barrado');
        assert.strictEqual(state.blocked.length, 1);
        api.onMessage({ type: 'raid-end', reason: 'time', bossName: 'Darkrai', damage: 1234567, totalDamage: 5e8, hpLeft: 5e8, hpMax: 1e9, rank: 7, participants: 25, stayedMs: 30 * MIN });
        await state.drain(15e3);
        assert.deepStrictEqual(state.switches, [{ slug: 'rhyhorn', tentativa: 1, origem: 'raid-volta' }], 'voltou para a hunt de origem');
        assert(!api.run(), 'participação encerrada');
        assert.strictEqual(api.doneDay(), api.day(clock.now), 'dia marcado como esgotado');
        const h = state.hooks.find(x => x.meta?.evento === 'raid-fim');
        assert(h && /1\.234\.567/.test(h.content) && /#7 de 25/.test(h.content), h && h.content);
        assert(/tempo na arena acabou/.test(h.title), h.title);
        // próximo tique: não entra de novo hoje
        const antes = state.sent.length;
        await state.drain(api.RAID_TICK_MS); api.tick(); await state.drain(10e3);
        assert(!api.run() && state.sent.length === antes, 'não entra de novo com o dia esgotado');
        assert(/esgotado/.test(api.status()), api.status());
        // persistido: carga nova também sabe
        const t2 = loadRaidModule({}, { huntSlug: 'rhyhorn', store: state.store, now: clock.now });
        t2.api.load();
        assert.strictEqual(t2.api.doneDay(), api.day(clock.now), 'dia esgotado sobrevive à recarga');
        console.log('ok 1 - entrada, fim por tempo, volta e dia esgotado');
    }

    // 2. Time caiu → cura e reentra até o limite; depois volta para a hunt
    {
        const t = loadRaidModule({ raidReenterMax: 1 }, { huntSlug: 'rhyhorn' });
        const { api, state, clock } = t;
        await enter(t);
        api.onMessage({ type: 'raid-end', reason: 'wipe', damage: 1000, hpLeft: 9e8, hpMax: 1e9, stayedMs: 2 * MIN });
        await state.drain(10e3);
        assert(!api.run(), 'participação 1 acabou');
        assert.strictEqual(state.switches.length, 0, 'não voltou para a hunt: vai reentrar');
        assert(logsOf(state, 'raid-volta').some(l => l.reentra), 'log de reentrada');
        assert(types(state).filter(x => x === 'joy-heal').length >= 2, 'curou depois da queda');
        await state.drain(api.RAID_REENTER_DELAY_MS); api.tick(); await state.drain(10e3);
        api.onField(hud(clock));
        assert(api.run() && api.run().fase === 'dentro', 'reentrou');
        assert.strictEqual(api.tried()[Object.keys(api.tried())[0]].entries, 2);
        api.onMessage({ type: 'raid-end', reason: 'wipe', damage: 900, hpLeft: 9e8, hpMax: 1e9, stayedMs: MIN });
        await state.drain(10e3);
        assert.deepStrictEqual(state.switches.map(s => s.slug), ['rhyhorn'], 'limite de reentradas: volta para a hunt de origem (não para a Raid)');
        await state.drain(api.RAID_TICK_MS); api.tick(); await state.drain(10e3);
        assert(!api.run(), 'não entra mais nesta Raid');
        console.log('ok 2 - reentrada depois da queda até o limite');
    }

    // 3. Recusa do jogo → aviso, volta, tenta em 5 min; 3 falhas = desiste desta Raid
    {
        const t = loadRaidModule({}, { huntSlug: 'rhyhorn', autoHunt: false });
        const { api, state, clock } = t;
        api.onMessage(openState(clock));
        await state.drain(api.RAID_ENTER_DELAY_MS); api.tick(); await state.drain(3e3);
        assert(api.run(), 'entrada em andamento');
        for (let i = 1; i <= 3; i++) {
            api.onMessage({ type: 'raid-refused', message: 'A instância está cheia.' });
            assert(!api.run(), `recusa ${i} encerrou a tentativa`);
            await state.drain(3e3);
            if (i < 3) { await state.drain(api.RAID_REFUSED_RETRY_MS); api.tick(); await state.drain(3e3); assert(api.run(), `tentou de novo depois de 5 min (${i})`); }
        }
        const k = Object.keys(api.tried())[0];
        assert(api.tried()[k].done && /falharam/.test(api.tried()[k].done), 'desistiu desta Raid');
        assert.strictEqual(state.hooks.filter(h => h.meta?.evento === 'raid-entrada-falhou').length, 3, 'avisou cada falha');
        assert(state.switches.every(s => s.slug === 'rhyhorn' && s.origem === 'raid-volta'), 'voltou para a hunt');
        console.log('ok 3 - recusa, nova tentativa e desistência');
    }

    // 4. Recusa "volte amanhã" marca o dia sem alerta de falha
    {
        const t = loadRaidModule({}, { huntSlug: 'rhyhorn', autoHunt: false });
        const { api, state, clock } = t;
        api.onMessage(openState(clock));
        await state.drain(api.RAID_ENTER_DELAY_MS); api.tick(); await state.drain(3e3);
        api.onMessage({ type: 'raid-refused', message: 'Seu tempo na arena acabou. Volte amanhã!' });
        assert.strictEqual(api.doneDay(), api.day(clock.now), 'dia esgotado pela recusa');
        assert.strictEqual(state.hooks.length, 0, 'sem alerta de falha');
        console.log('ok 4 - recusa por tempo do dia');
    }

    // 5. Bloqueios: invasão/espera/viagem seguram a entrada; Raid fechada ou acabando não entra
    {
        const t = loadRaidModule({}, { huntSlug: 'rhyhorn' });
        const { api, state, clock } = t;
        api.onMessage(openState(clock));
        await state.drain(api.RAID_ENTER_DELAY_MS);
        state.env.inv = true; api.tick();
        assert(!api.run() && /Invasão/.test(api.status()), api.status());
        state.env.inv = false; state.env.hold = true; api.tick();
        assert(!api.run(), 'espera na cidade segura');
        state.env.hold = false; state.env.tripRunning = true; api.tick();
        assert(!api.run(), 'viagem segura');
        state.env.tripRunning = false;
        api.onMessage(openState(clock, { endsAt: clock.now + MIN }));
        await state.drain(api.RAID_ENTER_DELAY_MS); api.tick();
        assert(!api.run(), 'menos de 2 min de Raid: não entra');
        api.onMessage({ type: 'raid-state', active: false });
        api.tick();
        assert(!api.run() && /nenhuma Raid/.test(api.status()), api.status());
        const off = loadRaidModule({ raidEnabled: false }, { huntSlug: 'rhyhorn' });
        off.api.onMessage(openState(off.clock));
        await off.state.drain(off.api.RAID_ENTER_DELAY_MS); off.api.tick();
        assert(!off.api.run(), 'desligada não entra');
        console.log('ok 5 - bloqueios e Raid fechada');
    }

    // 6. Recompensa e boss derrotado
    {
        const t = loadRaidModule({}, { huntSlug: 'rhyhorn' });
        const { api, state, clock } = t;
        await enter(t);
        api.onMessage({ type: 'raid-end', reason: 'defeated', damage: 5e6, hpLeft: 0, hpMax: 1e9, rank: 2, participants: 30, stayedMs: 12 * MIN });
        await state.drain(10e3);
        assert.deepStrictEqual(state.switches.map(s => s.slug), ['rhyhorn'], 'derrotado: volta');
        api.onMessage({ type: 'raid-loot', boss: 'Darkrai', items: [{ itemId: 901, item: 'Nightmare Gem', qty: 3, rare: true }], buff: { pct: 10, hours: 24 } });
        const h = state.hooks.find(x => x.meta?.evento === 'raid-loot');
        assert(h && /3× Nightmare Gem/.test(h.content) && /\+10% de XP/.test(h.desc), h && (h.content + h.desc));
        assert(/Nightmare Gem/.test(api.lastLine()), api.lastLine());
        await state.drain(api.RAID_TICK_MS); api.tick();
        assert(!api.run(), 'boss derrotado: não entra de novo');
        console.log('ok 6 - boss derrotado e recompensa');
    }

    // 7. Entrada na mão pelo botão RAID da tela: acompanhada e volta para a hunt de antes
    {
        const t = loadRaidModule({ raidEnabled: false }, { huntSlug: 'rhyhorn', lastRealHunt: 'rhyhorn' });   // no script, setHunt já trocou a hunt: a origem vem da última hunt
        const { api, state, clock } = t;
        api.onMessage(openState(clock));
        assert.strictEqual(api.telaEnter(), true, 'clique do jogador passa');
        api.onField(hud(clock));
        assert(api.run() && api.run().origem === 'tela' && api.run().from === 'rhyhorn');
        api.onMessage({ type: 'raid-end', reason: 'left', damage: 10, hpLeft: 9e8, hpMax: 1e9 });
        await state.drain(10e3);
        assert.deepStrictEqual(state.switches.map(s => s.slug), ['rhyhorn']);
        console.log('ok 7 - entrada na mão');
    }

    // 8. Recarga no meio: lembrada; a conta nasceu na cidade → volta (ou reentra) em vez de ficar parada
    {
        const t = loadRaidModule({ raidReenterMax: 0 }, { huntSlug: 'rhyhorn' });
        await enter(t);
        const t2 = loadRaidModule({ raidReenterMax: 0 }, { huntSlug: null, store: t.state.store, now: t.clock.now + 30e3 });
        t2.api.load();
        assert(t2.api.run() && t2.api.run().origem === 'lembrado', 'participação lembrada');
        await t2.state.drain(20e3); t2.api.tick(); await t2.state.drain(10e3);
        assert(logsOf(t2.state, 'raid-fim').some(l => l.semFrame), 'fim sem frame registrado');
        assert.deepStrictEqual(t2.state.switches.map(s => s.slug), ['rhyhorn'], 'voltou para a hunt de antes');
        console.log('ok 8 - recarga no meio');
    }

    // 9. Entrada sem nenhum frame em 60 s = falhou; janela de resultado fechada pelo script
    {
        const t = loadRaidModule({}, { huntSlug: 'rhyhorn' });
        const { api, state, clock } = t;
        api.onMessage(openState(clock));
        await state.drain(api.RAID_ENTER_DELAY_MS); api.tick(); await state.drain(10e3);
        assert(api.run() && !api.run().fieldSeen);
        await state.drain(api.RAID_CONFIRM_MS); api.tick();
        assert(!api.run() && logsOf(state, 'raid-entrada').some(l => l.fase === 'falhou'), 'sem frame: falhou');
        let clicked = false, open = true;
        const dom = { querySelector: (sel) => (sel === '.rdw-window' && open ? { querySelector: () => ({ click: () => { clicked = true; open = false; } }) } : null) };
        const t3 = loadRaidModule({}, { huntSlug: 'rhyhorn', dom });
        await enter(t3);
        t3.api.onMessage({ type: 'raid-end', reason: 'ended', damage: 1, hpLeft: 1, hpMax: 2 });
        await t3.state.drain(10e3);
        assert(clicked, 'apertou o Continuar da janela de resultado');
        assert(logsOf(t3.state, 'raid-resultado').some(l => l.fechada), 'log da janela fechada');
        console.log('ok 9 - entrada sem frame e janela de resultado');
    }

    // 10. (conta1, 19/11/2026 02:15Z) recarga com a participação lembrada: não segura a cura nem barra o enter-hunt da tela nova
    {
        const t = loadRaidModule({ raidEnabled: false }, { huntSlug: 'banette', lastRealHunt: 'banette' });
        t.api.onMessage(openState(t.clock));
        t.api.telaEnter(); t.api.onField(hud(t.clock));
        const t2 = loadRaidModule({ raidEnabled: false }, { huntSlug: null, lastRealHunt: 'banette', store: t.state.store, now: t.clock.now + 60e3 });
        t2.api.load();
        assert(t2.api.run() && t2.api.run().origem === 'lembrado', 'lembrada');
        assert(!t2.api.busy() && !t2.api.busyReason(), 'lembrada sem frame não segura cura/rotas');
        assert.strictEqual(t2.api.telaEnter(), true, 'enter-hunt da tela nova passa');
        assert.strictEqual(t2.state.blocked.length, 0);
        t2.api.onField(hud(t2.clock));
        assert(t2.api.busy(), 'com frame da Raid volta a segurar');
        assert.strictEqual(t2.api.telaEnter(), false, 'reenvio depois do frame é barrado');
        // sem a tela entrar: 15 s depois volta para a hunt (curando antes)
        const t3 = loadRaidModule({ raidEnabled: false }, { huntSlug: null, lastRealHunt: 'banette', store: t.state.store, now: t.clock.now + 60e3 });
        t3.api.load();
        await t3.state.drain(20e3); t3.api.tick(); await t3.state.drain(10e3);
        assert(t3.state.sent.some(m => m.type === 'joy-heal'), 'curou');
        assert.deepStrictEqual(t3.state.switches.map(s => s.slug), ['banette'], 'voltou para banette');
        console.log('ok 10 - recarga com participação lembrada');
    }

    console.log('raid.test: tudo ok');
})().catch(e => { console.error(e); process.exit(1); });
