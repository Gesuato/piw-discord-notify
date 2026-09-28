// Clã (v3.17.0): entrar, guardar drops, capturar a espécie, converter, subir de rank e voltar. Rodar: node test/clan.test.js
const { loadClanModule, assert } = require('./harness');

const ITEMS = [
    { id: 120, name: 'Small Stone', category: 'loot', npcPrice: 10 },
    { id: 39, name: 'Earth Ball', category: 'loot', npcPrice: 10 },
    { id: 5310, name: 'Big Stone', category: 'clan', npcPrice: 100 },
    { id: 5309, name: 'Solid Earth Piece', category: 'clan', npcPrice: 100 },
    { id: 7, name: 'Feather', category: 'loot', npcPrice: 5 },
];
const pedra = (max) => ({ name: 'Small Stone', chance: 95000, minCount: 1, maxCount: max });
const terra = (max) => ({ name: 'Earth Ball', chance: 95000, minCount: 1, maxCount: max });
const CREATURES = [
    { pokeId: 74, name: 'Geodude', type1: 'ROCK', type2: 'GROUND', loot: [pedra(4), terra(4)] },
    { pokeId: 95, name: 'Onix', type1: 'ROCK', type2: 'GROUND', loot: [pedra(13), terra(13)] },
    { pokeId: 76, name: 'Golem', type1: 'ROCK', type2: 'GROUND', loot: [pedra(18), terra(18)] },
    { pokeId: 16, name: 'Pidgey', type1: 'NORMAL', type2: 'FLYING', loot: [{ name: 'Feather', chance: 90000, minCount: 1, maxCount: 3 }] },
];
const CATALOGO = [
    { slug: 'geodude', name: 'Geodude', level: 1, speciesId: 74, speciesName: 'Geodude' },
    { slug: 'pidgey', name: 'Pidgey', level: 5, speciesId: 16, speciesName: 'Pidgey' },
    { slug: 'onix', name: 'Onix', level: 60, speciesId: 95, speciesName: 'Onix' },
    { slug: 'golem', name: 'Golem', level: 80, speciesId: 76, speciesName: 'Golem' },
];
const TIME = [{ id: 'a', name: 'Sandslash', level: 70, leader: true }];
// Tarefa do rank 4 da Orebound (formato do bundle): entregar Big Stone e Solid Earth Piece, capturar Onix, derrotar Pedra/Terra.
function tarefa(s) {
    const items = [{ itemId: 5310, name: 'Big Stone', have: s.big ?? 2, need: 10 }, { itemId: 5309, name: 'Solid Earth Piece', have: 10, need: 10 }];
    const caught = [{ speciesId: 95, name: 'Onix', have: s.onix ?? 0, need: 1 }];
    const kills = [{ type: 'ROCK', have: s.rock ?? 100, need: 500 }, { type: 'GROUND', have: 500, need: 500 }];
    const ok = items.every(i => i.have >= i.need) && caught.every(c => c.have >= c.need) && kills.every(k => k.have >= k.need);
    return { rank: 4, name: 'Hardskin', level: 110, levelOk: true, items, caught, kills, rewardXp: 840000, ok, goldOk: true, goldCost: 4500000 };
}
function fakeApi(s) {
    return (url, opts) => {
        if (url === '/api/game/clans/change') { s.clan = 'orebound'; s.rank = 1; return Promise.resolve({ ok: true }); }
        if (url === '/api/game/convert') { const b = JSON.parse(opts.body); s.big = (s.big ?? 2) + b.packs; return Promise.resolve({ converted: b.packs, toName: 'Big Stone' }); }
        if (url === '/api/game/clans/rankup') { s.rank = 4; s.max = true; return Promise.resolve({ clanRank: 4 }); }
        return Promise.resolve({ clan: 'clan' in s ? s.clan : 'orebound', clanRank: s.rank ?? 3, level: 115, canJoin: true, joinLevel: 80, nextTask: s.max ? null : (s.clan === null ? null : tarefa(s)) });
    };
}
const flush = () => new Promise(r => setImmediate(r));
const cfgBase = () => ({ clanEnabled: true, clanKey: 'orebound', clanRankup: true, clanRoute: true });

(async () => {
    // 1) sem clã: entra na Orebound (1ª entrada) e avisa
    {
        const s = { clan: null };
        const { api, state } = loadClanModule(cfgBase(), { api: fakeApi(s), items: ITEMS, creatures: CREATURES, huntCatalog: CATALOGO, team: TIME });
        await api.clanTick(); await flush();
        const ch = state.calls.find(c => c.url === '/api/game/clans/change');
        assert(ch && JSON.parse(ch.opts.body).clan === 'orebound' && JSON.parse(ch.opts.body).targetRank === 1, 'entrou na Orebound: ' + JSON.stringify(state.calls.map(c => c.url)));
        assert(state.hooks.some(h => /Orebound/.test(h.content)), 'avisou a entrada');
    }

    // 2) rank 3 → 4: guarda drops, vai capturar o Onix primeiro (lá também caem os dois itens base), joga a bola
    const s = {};
    const { api, state } = loadClanModule(cfgBase(), { api: fakeApi(s), items: ITEMS, creatures: CREATURES, huntCatalog: CATALOGO, team: TIME, huntSlug: 'larvitar', bag: [{ itemId: 120, quantity: 450 }] });
    await api.clanTick(); await flush();
    assert(api.clanState.task.rank === 4, 'tarefa lida');
    assert(api.clanKeepsItem(120) && api.clanKeepsItem(5310), 'não vende Small Stone nem Big Stone');
    assert(!api.clanKeepsItem(39) && !api.clanKeepsItem(7), 'Earth Ball (já completo) e Feather podem ser vendidos');
    assert(api.clanKeepsSpecies(95), 'não vende Onix');
    const m = api.clanMissing();
    assert(m.items.length === 1 && m.items[0].base.have === 450 && m.items[0].base.falta === 350, 'faltam 350 Small Stone: ' + JSON.stringify(m.items));
    assert(api.clanPlan()[0].hunt.slug === 'onix', 'captura primeiro: ' + JSON.stringify(api.clanPlan().map(x => x.hunt.slug)));
    assert(!api.clanPlan().some(x => x.hunt.slug === 'golem'), 'golem lv80 fica fora (time lv70)');
    assert(state.switches.length === 1 && state.switches[0].slug === 'onix' && state.switches[0].origem === 'cla', 'foi para onix: ' + JSON.stringify(state.switches));
    assert(api.clanFrom === 'larvitar', 'guardou a hunt de antes');
    const st = api.clanStatus();
    assert(/Orebound rank 3 \(Solid\) → 4/.test(st.head) && st.reqs.some(r => /Capturar Onix 0\/1/.test(r)), 'status: ' + JSON.stringify(st));
    assert(st.dicas.some(d => /Small Stone: onix lv60/.test(d)), 'onde cai: ' + JSON.stringify(st.dicas));

    api.setHunt('onix');
    api.clanOnPending([{ id: 'p9', pokeId: 16, name: 'Pidgey' }, { id: 'p1', pokeId: 95, name: 'Onix' }]);
    const bola = state.sent.find(x => x.type === 'catch');
    assert(bola && bola.pendingId === 'p1' && bola.ballId === 4, 'jogou a bola no Onix: ' + JSON.stringify(state.sent));

    // 3) Onix capturado: continua em onix (melhor drop ao alcance) e a viagem converte 4 pacotes
    s.onix = 1;
    await api.refreshClan(true); await flush();
    assert(api.clanPlan()[0].hunt.slug === 'onix', 'onix segue sendo a melhor para Small Stone');
    assert(api.clanWantsCity(), 'mochila com 450 Small Stone: a viagem tem o que fazer');
    let r = await api.clanCityWork();
    const conv = state.calls.find(c => c.url === '/api/game/convert');
    assert(conv && JSON.parse(conv.opts.body).baseItemId === 120 && JSON.parse(conv.opts.body).packs === 4, 'converteu 4 pacotes: ' + JSON.stringify(conv));
    assert(r.ok && !r.subiu, 'ainda não sobe (faltam abates e Big Stone)');

    // 4) tarefa fechada: pede viagem urgente; na cidade sobe de rank e avisa; rank máximo → volta para larvitar
    s.big = 10; s.rock = 500;
    await api.refreshClan(true); await flush();
    const antes = state.trips.length;
    await api.clanTick(); await flush();
    assert(state.trips.length === antes + 1 && state.trips[state.trips.length - 1].k === 'cla', 'pediu viagem urgente');
    r = await api.clanCityWork();
    assert(state.calls.some(c => c.url === '/api/game/clans/rankup') && r.subiu && r.subiu.para === 4, 'subiu de rank');
    assert(state.hooks.some(h => /rank \*\*4 \(Hardskin\)\*\*/.test(h.content)), 'aviso do rank: ' + JSON.stringify(state.hooks.map(h => h.content)));
    await api.clanTick(); await flush();
    const volta = state.switches[state.switches.length - 1];
    assert(volta.slug === 'larvitar' && volta.origem === 'cla', 'voltou para larvitar: ' + JSON.stringify(state.switches));

    // 5) Daily na hunt dela: a rota do clã espera
    {
        const s2 = {};
        const { api: a2, state: st2 } = loadClanModule(cfgBase(), { api: fakeApi(s2), items: ITEMS, creatures: CREATURES, huntCatalog: CATALOGO, team: TIME, huntSlug: 'pidgey', dailyOnHunt: true });
        await a2.clanTick(); await flush();
        assert(st2.switches.length === 0, 'não tira da hunt da daily');
        assert(/Daily Kill/.test(a2.clanWait) && /parado: a Daily Kill/.test(a2.clanStatus().rota), 'painel diz por que espera: ' + a2.clanStatus().rota);
        assert(st2.logs.some(l => l[0] === 'cla-espera'), 'log cla-espera');
    }

    // 5b) tarefa pede o próprio drop (Earth Ball, sem conversão): ainda acha a hunt
    {
        const api5 = (url) => Promise.resolve({ clan: 'orebound', clanRank: 1, level: 95, canJoin: true, nextTask: { rank: 2, name: 'Rock', level: 90, levelOk: true, items: [{ itemId: 39, name: 'Earth Ball', have: 20, need: 300 }], caught: [], kills: [], rewardXp: 1, ok: false } });
        const { api: a5, state: st5 } = loadClanModule(cfgBase(), { api: api5, items: ITEMS, creatures: CREATURES, huntCatalog: CATALOGO, team: TIME, huntSlug: 'pidgey', bag: [] });
        await a5.clanTick(); await flush();
        assert(st5.switches.length === 1 && st5.switches[0].slug === 'onix', 'foi dropar Earth Ball em onix: ' + JSON.stringify(st5.switches) + ' ' + a5.clanWait);
        assert(a5.clanKeepsItem(39), 'não vende a Earth Ball pedida');
        const r5 = await a5.clanCityWork();
        assert(!st5.calls.some(c => c.url === '/api/game/convert'), 'não tenta converter o que já é o item pedido');
    }

    // 5c) nenhuma hunt ao alcance: diz no painel em vez de "escolhendo a hunt"
    {
        const { api: a6 } = loadClanModule(cfgBase(), { api: fakeApi({ onix: 1, rock: 500 }), items: ITEMS, creatures: CREATURES, huntCatalog: CATALOGO.filter(h => h.slug === 'pidgey'), team: TIME, huntSlug: 'pidgey', bag: [] });
        await a6.clanTick(); await flush();
        assert(/nenhuma hunt até lv 70 dá Small Stone/.test(a6.clanStatus().rota), 'motivo no painel: ' + a6.clanStatus().rota);
    }

    // 6) desligado: não lê nada
    {
        const { api: a3, state: st3 } = loadClanModule({ clanEnabled: false }, { api: fakeApi({}) });
        await a3.clanTick();
        assert(st3.calls.length === 0 && !a3.clanKeepsItem(120), 'desligado não age nem protege');
    }

    console.log('OK clan.test — entrar, guardar drops, capturar Onix, converter, subir de rank e voltar');
})().catch(e => { console.error(e); process.exit(1); });
