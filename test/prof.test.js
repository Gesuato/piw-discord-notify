// Profissão (v3.52.0): ler os requisitos, buscar as Rare Pokémon Picture no Depot/família, subir de rank na viagem e caçar os
// tipos que faltam. Rodar: node test/prof.test.js
const { loadProfModule, assert } = require('./harness');

const PIC = 59195;
const CREATURES = [
    { pokeId: 1, name: 'Bulbasaur', type1: 'GRASS', type2: 'POISON' },
    { pokeId: 4, name: 'Charmander', type1: 'FIRE', type2: '' },
    { pokeId: 37, name: 'Vulpix', type1: 'FIRE', type2: '' },
    { pokeId: 43, name: 'Oddish', type1: 'GRASS', type2: 'POISON' },
    { pokeId: 16, name: 'Pidgey', type1: 'NORMAL', type2: 'FLYING' },
];
const CATALOGO = [
    { slug: 'bulbasaur', name: 'Bulbasaur', level: 5, speciesId: 1, speciesName: 'Bulbasaur' },
    { slug: 'charmander', name: 'Charmander', level: 5, speciesId: 4, speciesName: 'Charmander' },
    { slug: 'vulpix', name: 'Vulpix', level: 10, speciesId: 37, speciesName: 'Vulpix' },
    { slug: 'oddish', name: 'Oddish', level: 50, speciesId: 43, speciesName: 'Oddish' },
    { slug: 'pidgey', name: 'Pidgey', level: 1, speciesId: 16, speciesName: 'Pidgey' },
];
const TIME = [{ id: 'a', name: 'Sandslash', level: 40, leader: true }];
const NEXT = { E: 'D', D: 'C', C: 'B', B: 'A', A: 'S' };
// Estado do jogo: rank atual, espécies, pictures na mochila (`bag`) e no Depot (`depot`), abates por tipo.
function estado(o) {
    return Object.assign({ rank: 'D', especies: 150, especiesNeed: 150, bag: 2, picNeed: 5, depot: 0, kills: [] }, o);
}
function fakeApi(s) {
    const prof = () => {
        const ok = s.especies >= s.especiesNeed && s.bag >= s.picNeed && s.kills.every(k => k.have >= k.need);
        return {
            profession: 'prestige', professions: [{ key: 'prestige', enabled: true }, { key: 'botanist', enabled: true }], rankKey: s.rank, speciesCount: s.especies, pictures: s.bag, herbs: 0,
            nextStep: s.rank === 'S' ? null : { toRankKey: NEXT[s.rank], species: { have: s.especies, need: s.especiesNeed }, pictures: { have: s.bag, need: s.picNeed }, kills: s.kills.map(k => Object.assign({}, k)), ok },
        };
    };
    return (url, opts) => {
        if (url === '/api/game/professions') return Promise.resolve(prof());
        if (url === '/api/game/professions/rankup') {
            if (!prof().nextStep?.ok) return Promise.reject(new Error('Complete os requisitos primeiro'));
            s.bag -= s.picNeed; s.rank = NEXT[s.rank]; s.rankups = (s.rankups || 0) + 1;
            return Promise.resolve(prof());
        }
        if (url === '/api/game/depot') return Promise.resolve({ inventory: [], depot: s.depot ? [{ id: PIC, name: 'Rare Pokémon Picture', quantity: s.depot }] : [] });
        if (url === '/api/game/depot/move') { const b = JSON.parse(opts.body); assert(b.itemId === PIC && b.dir === 'withdraw', 'retirada do Depot: ' + opts.body); s.bag += s.depot; s.depot = 0; return Promise.resolve({ ok: true }); }
        return Promise.reject(new Error('url inesperada ' + url));
    };
}
const flush = () => new Promise(r => setImmediate(r));
const cfgBase = (o) => Object.assign({ profRankupEnabled: true, profFromDepot: true, profFromFamily: true, profRoute: false }, o || {});
const base = (s, extra) => Object.assign({ api: fakeApi(s), creatures: CREATURES, huntCatalog: CATALOGO, team: TIME, huntSlug: 'larvitar' }, extra || {});

(async () => {
    // 1) leitura: campos e requisitos no log e no status; faltando espécies, nem carona nem viagem; a picture fica fora da venda
    {
        const s = estado({ especies: 120, kills: [{ type: 'GRASS', have: 200, need: 200 }] });
        const { api, state } = loadProfModule(cfgBase(), base(s));
        await api.profTick(); await flush();
        assert(state.logs.some(([k, d]) => k === 'profissao-campos' && d.nextStep.includes('pictures')), 'campos do 1º frame no log');
        assert(state.logs.some(([k, d]) => k === 'profissao' && d.proximo.rank === 'C' && d.proximo.especies === '120/150'), 'leitura no log: ' + JSON.stringify(state.logs));
        const st = api.profStatus();
        assert(/prestige · rank D \(Aventureiro\)/.test(st.head) && /→ C \(Especialista\)/.test(st.head), 'cabeçalho: ' + st.head);
        assert(st.reqs.length === 3 && /• Espécies diferentes capturadas 120\/150/.test(st.reqs[0]) && /• Entregar Rare Pokémon Picture 2\/5/.test(st.reqs[1]) && /✔ Derrotar GRASS 200\/200/.test(st.reqs[2]), 'requisitos: ' + JSON.stringify(st.reqs));
        assert(!state.trips.length && !api.profWantsCity() && !api.profReadyForCity(), 'faltando espécies: sem viagem');
        assert(api.profKeepsItem(PIC) && !api.profKeepsItem(1), 'picture fora da venda/guardar');
        assert(api.profReqsLeft().join(',') === 'espécies 120/150,Rare Pokémon Picture 2/5', 'o que falta: ' + api.profReqsLeft());
    }

    // 2) só faltam pictures e a família tem: viagem urgente; na cidade busca Depot (pilha) + família (quantidade exata), relê e sobe
    {
        const s = estado({ depot: 1 });
        const { api, state } = loadProfModule(cfgBase(), base(s, { family: [{ itemId: PIC, quantity: 4 }], familyResp: (id, qty) => { s.bag += qty; return { ok: true }; } }));
        state.familyAt = Date.now();
        await api.profTick(); await flush();
        assert(state.trips.length === 1 && state.trips[0].k === 'profissao' && /família tem/.test(state.trips[0].m), 'viagem urgente pelas pictures: ' + JSON.stringify(state.trips));
        await api.profTick(); await flush();
        assert(state.trips.length === 1, 'não repete o pedido antes de 5 min');
        assert(api.profWantsCity(), 'carona também');
        const r = await api.profCityWork();
        assert(state.calls.some(c => c.url === '/api/game/depot/move'), 'tirou a pilha do Depot');
        assert(state.family.length === 1 && state.family[0].itemId === PIC && state.family[0].quantity === 2, 'tirou da família só o que faltava (3 − 1 do Depot): ' + JSON.stringify(state.family));
        assert(r.ok && r.subiu && r.subiu.de === 'D' && r.subiu.para === 'C', 'subiu: ' + JSON.stringify(r));
        assert(s.rank === 'C' && api.profState.rank === 'C', 'estado novo lido da resposta do rankup');
        assert(state.hooks.some(h => h.kind === 'alert' && /rank \*\*C \(Especialista\)\*\*/.test(h.content) && /Rare Pokémon Picture: 3 buscadas/.test(h.desc)), 'aviso: ' + JSON.stringify(state.hooks));
        assert(state.logs.some(([k, d]) => k === 'profissao-pictures' && d.ok && d.doDepot === 1 && d.daFamilia === 2), 'log das pictures');
        assert(state.logs.some(([k, d]) => k === 'profissao-rank' && d.para === 'C'), 'log do rank');
        assert(/última viagem .*subiu para C/.test(api.profStatus().head), 'status com a última viagem: ' + api.profStatus().head);
    }

    // 3) Depot + família não completam a conta: não tira nada, loga o motivo e só confere de novo depois de 30 min
    {
        const s = estado({ depot: 0 });
        const { api, state, clock } = loadProfModule(cfgBase(), base(s, { family: [{ itemId: PIC, quantity: 1 }] }));
        await api.profTick(); await flush();
        assert(!state.trips.length && !api.profReadyForCity(), 'família não cobre: sem viagem urgente');
        assert(api.profWantsCity(), 'mas vale a carona (confere o Depot na cidade)');
        const r = await api.profCityWork();
        assert(!r.ok && /só há 0 no Depot e 1 na família/.test(r.pictures), 'não busca à toa: ' + JSON.stringify(r));
        assert(!state.family.length && !state.calls.some(c => c.url === '/api/game/depot/move'), 'nenhuma retirada');
        assert(state.logs.some(([k, d]) => k === 'profissao-pictures' && d.motivo === 'não completam a conta'), 'log do motivo');
        assert(!api.profWantsCity(), 'conferido há pouco e sem nada: não pega carona de novo');
        state.familyItems[0].quantity = 3;
        assert(api.profWantsCity() && api.profReadyForCity(), 'a família ganhou pictures: viagem de novo');
        state.familyItems[0].quantity = 1;
        clock.now += 31 * 60 * 1000;
        assert(api.profWantsCity(), 'passaram 30 min: confere de novo');
        assert(/família 1 · Depot 0/.test(api.profStatus().reqs[1]), 'status mostra família e Depot: ' + api.profStatus().reqs[1]);
    }

    // 4) requisitos fechados (`ok`): até 3 viagens urgentes por rank, 5 min entre elas; depois só a carona
    {
        const s = estado({ bag: 5 });
        const { api, state, clock } = loadProfModule(cfgBase(), base(s));
        for (let i = 0; i < 5; i++) { await api.profTick(); await flush(); clock.now += 5 * 60 * 1000 + 1; }
        assert(state.trips.length === 3 && state.trips.every(t => /pronta: subir para o rank C/.test(t.m)), '3 pedidos: ' + JSON.stringify(state.trips));
        assert(state.logs.some(([k, d]) => k === 'profissao-espera' && /só na carona/.test(d.motivo)), 'avisou no log que parou de pedir');
        assert(api.profWantsCity() && /pronto para subir \(na próxima viagem\)/.test(api.profStatus().head), 'carona segue: ' + api.profStatus().head);
        const r = await api.profCityWork();
        assert(r.ok && s.rank === 'C' && !state.calls.some(c => c.url === '/api/game/depot'), 'subiu sem mexer no Depot (nada faltava)');
        // rank novo: os pedidos recomeçam
        s.bag = 5; state.trips.length = 0; clock.now += 5 * 60 * 1000 + 1;
        await api.profTick(); await flush();
        assert(state.trips.length === 1 && /rank B/.test(state.trips[0].m), 'rank novo pronto: pede de novo: ' + JSON.stringify(state.trips));
    }

    // 5) conta parada na cidade (Esperar na cidade): sobe na hora, sem viagem; botão "Subir agora" na hunt pede a viagem
    {
        const s = estado({ bag: 5 });
        const { api, state } = loadProfModule(cfgBase(), base(s, { env: { hold: true, inHunt: false }, huntSlug: 'cerulean' }));
        await api.profTick(); await flush();
        assert(!state.trips.length && s.rank === 'C' && state.logs.some(([k, d]) => k === 'profissao-cidade' && d.direto), 'subiu direto na cidade');
        s.bag = 5; state.env.hold = false; state.env.inHunt = true;
        const r = await api.profNow();
        assert(r.ok && state.trips.length === 1 && /Subir agora/.test(state.trips[0].m), 'botão na hunt pede a viagem: ' + JSON.stringify(r));
        state.env.inHunt = false;
        const r2 = await api.profNow();
        assert(r2.ok && r2.subiu && s.rank === 'B', 'botão na cidade sobe na hora: ' + JSON.stringify(r2));
        // módulo desligado: o botão ainda funciona, o tique não
        const s2 = estado({ bag: 5 });
        const m2 = loadProfModule(cfgBase({ profRankupEnabled: false }), base(s2, { env: { inHunt: false } }));
        await m2.api.profTick(); await flush();
        assert(!m2.state.calls.length, 'desligado: o tique não lê');
        const r3 = await m2.api.profNow();
        assert(r3.ok && s2.rank === 'C', 'desligado: o botão sobe assim mesmo');
    }

    // 6) rota: tipo quase fechado primeiro, hunt acima do nível do time fora, abates contados localmente, volta para a hunt de antes
    {
        const s = estado({ bag: 5, kills: [{ type: 'GRASS', have: 150, need: 200 }, { type: 'FIRE', have: 199, need: 200 }] });
        const { api, state, clock } = loadProfModule(cfgBase({ profRoute: true }), base(s));
        await api.profTick(); await flush();
        assert(!state.trips.length, 'faltam abates: sem viagem');
        const plano = api.profPlan();
        assert(plano[0].hunt.slug === 'charmander' && plano[1].hunt.slug === 'vulpix' && plano[2].hunt.slug === 'bulbasaur' && !plano.some(p => p.hunt.slug === 'oddish' || p.hunt.slug === 'pidgey'), 'plano: ' + plano.map(p => p.hunt.slug));
        assert(api.profTarget?.slug === 'charmander' && state.switches.length === 1 && state.switches[0].slug === 'charmander' && state.switches[0].origem === 'profissao', 'foi para o FIRE quase fechado: ' + JSON.stringify(state.switches));
        assert(api.profFrom === 'larvitar' && JSON.parse(state.store.pgDiscordNotifyProf).from === 'larvitar', 'origem guardada: ' + JSON.stringify(state.store));
        assert(/▶ charmander lv5 \(derrotar FIRE\) · volta para larvitar/.test(api.profStatus().rota), 'rota no status: ' + api.profStatus().rota);
        api.setHunt('charmander');
        api.noteProfKill({ speciesName: 'Charmander' });
        assert(api.profState.next.kills[1].have === 200, 'abate contado localmente');
        s.kills[1].have = 200; clock.now += 61 * 1000;   // a leitura seguinte (1 min com a rota) confirma
        await api.profTick(); await flush();
        assert(api.profTarget?.slug === 'bulbasaur' && state.switches[1].slug === 'bulbasaur', 'FIRE fechou: vai para o GRASS: ' + JSON.stringify(state.switches));
        api.setHunt('bulbasaur');
        s.kills[0].have = 200; clock.now += 61 * 1000;
        await api.profTick(); await flush();
        assert(state.switches[2].slug === 'larvitar' && api.profTarget === null && !('pgDiscordNotifyProf' in state.store), 'fechou tudo: volta para larvitar e esquece a origem: ' + JSON.stringify(state.switches));
        assert(state.logs.some(([k, d]) => k === 'profissao-volta' && d.volta === 'larvitar' && d.motivo === 'requisitos fechados'), 'log da volta');
        assert(state.trips.length === 1 && /pronta/.test(state.trips[0].m), 'e pede a viagem para subir');
    }

    // 7) origem lembrada da recarga (localStorage) e hunt padrão como último recurso; Daily segura a rota
    {
        const s = estado({ bag: 5, kills: [{ type: 'GRASS', have: 200, need: 200 }] });
        const { api, state } = loadProfModule(cfgBase({ profRoute: true }), base(s, { huntSlug: 'bulbasaur', store: { pgDiscordNotifyProf: JSON.stringify({ from: 'rhyhorn', at: Date.now() }) } }));
        await api.profTick(); await flush();
        assert(state.logs.some(([k]) => k === 'profissao-origem-lembrada') && api.profFrom === null && state.switches[0]?.slug === 'rhyhorn', 'sem nada a caçar: volta para a origem lembrada: ' + JSON.stringify(state.switches));
        const s2 = estado({ bag: 5, kills: [{ type: 'GRASS', have: 100, need: 200 }] });
        const m2 = loadProfModule(cfgBase({ profRoute: true }), base(s2, { huntSlug: 'cerulean', defaultSlug: 'geodude', env: { daily: true } }));
        await m2.api.profTick(); await flush();
        assert(!m2.state.switches.length && /Daily Kill/.test(m2.api.profWait), 'Daily segura: ' + m2.api.profWait);
        m2.state.env.daily = false;
        await m2.api.profTick(); await flush();
        assert(m2.state.switches[0]?.slug === 'bulbasaur' && m2.api.profFrom === null && /volta para geodude/.test(m2.api.profStatus().rota), 'saiu da cidade: sem origem, a volta é a hunt padrão: ' + m2.api.profStatus().rota);
        m2.api.setHunt('bulbasaur'); s2.kills[0].have = 200; m2.clock.now += 61 * 1000;
        await m2.api.profTick(); await flush();
        assert(m2.state.switches[1]?.slug === 'geodude', 'voltou para a hunt padrão: ' + JSON.stringify(m2.state.switches));
    }

    // 8) rank máximo e profissão não escolhida
    {
        const s = estado({ rank: 'S' });
        const { api } = loadProfModule(cfgBase({ profRoute: true }), base(s));
        await api.profTick(); await flush();
        assert(/rank máximo ⭐/.test(api.profStatus().head) && !api.profWantsCity() && !(await api.profCityWork()).motivo.includes('faltam'), 'rank máximo: ' + api.profStatus().head);
        const m2 = loadProfModule(cfgBase(), { api: () => Promise.resolve({ profession: null, professions: [{ key: 'prestige' }], rankKey: null, speciesCount: 0, nextStep: null }), huntSlug: 'larvitar' });
        await m2.api.profTick(); await flush();
        assert(/sem profissão escolhida/.test(m2.api.profStatus().head) && !m2.state.trips.length, 'sem profissão: ' + m2.api.profStatus().head);
        const r = await m2.api.profNow();
        assert(!r.ok && /não escolhida/.test(r.motivo), 'botão sem profissão: ' + JSON.stringify(r));
    }

    console.log('prof.test.js: ok');
})().catch(err => { console.error(err); process.exit(1); });
