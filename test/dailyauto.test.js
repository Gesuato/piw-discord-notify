// Daily sozinha (v3.16.0): escolher a missão, o Pokémon do time, ir para a hunt e voltar. Rodar: node test/dailyauto.test.js
const { loadDailyModule, assert } = require('./harness');

const RESET = 1790000000000;
// Três opções: Pidgey (Normal/Voador), Oddish (Planta/Veneno) e Charmander (Fogo, meta maior).
function estado(s) {
    const base = [
        { name: 'Pidgey', speciesId: 16, type1: 'NORMAL', type2: 'FLYING', qty: 5 },
        { name: 'Oddish', speciesId: 43, type1: 'GRASS', type2: 'POISON', qty: 5 },
        { name: 'Charmander', speciesId: 4, type1: 'FIRE', qty: 10 },
    ];
    const opts = base.map((o, i) => Object.assign({}, o, { have: i === s.pickedIdx ? (s.have || 0) : 0, done: i === s.pickedIdx && (s.have || 0) >= o.qty }));
    return { locked: false, claimed: Boolean(s.claimed), pickedIdx: s.pickedIdx ?? -1, resetAt: s.resetAt ?? RESET, reward: { xp: 900, items: [] }, options: opts };
}
function fakeApi(s) {
    return (url, opts) => {
        if (url.endsWith('/pick')) { s.pickedIdx = JSON.parse(opts.body).idx; return Promise.resolve(estado(s)); }
        if (url.endsWith('/claim')) { s.claimed = true; return Promise.resolve({ state: estado(s), payout: { xp: 900, items: [] } }); }
        return Promise.resolve(estado(s));
    };
}
const CATALOGO = [
    { slug: 'pidgey', name: 'Pidgey', level: 5, area: 'kanto', speciesId: 16, speciesName: 'Pidgey' },
    { slug: 'oddish', name: 'Oddish', level: 10, area: 'kanto', speciesId: 43, speciesName: 'Oddish' },
    { slug: 'charmander', name: 'Charmander', level: 12, area: 'kanto', speciesId: 4, speciesName: 'Charmander' },
];
// v3.37.0: Pidgey só em Orre (bloqueada por padrão) e Oddish em Orre (lv 8) E em Outland (lv 30)
const CATALOGO_ORRE = [
    { slug: 'pidgey_orre', name: 'Pidgey', level: 5, area: 'orre', speciesId: 16, speciesName: 'Pidgey' },
    { slug: 'oddish_orre', name: 'Oddish', level: 8, area: 'orre', speciesId: 43, speciesName: 'Oddish' },
    { slug: 'oddish_out', name: 'Oddish', level: 30, area: 'outland', speciesId: 43, speciesName: 'Oddish' },
    { slug: 'charmander_orre', name: 'Charmander', level: 12, area: 'orre', speciesId: 4, speciesName: 'Charmander' },
];
// Squirtle é o líder; Geodude (Pedra/Terra) bate x2 em Pidgey; Charmander bate x2 em Oddish.
const TIME = () => [
    { id: 'sq', name: 'Squirtle', level: 15, slot: 0, leader: true, t1: 'WATER', t2: '' },
    { id: 'ge', name: 'Geodude', level: 20, slot: 1, leader: false, t1: 'ROCK', t2: 'GROUND' },
    { id: 'ch', name: 'Charmander', level: 15, slot: 2, leader: false, t1: 'FIRE', t2: '' },
];
const lider = (t, id) => t.map(p => Object.assign({}, p, { leader: p.id === id }));
const flush = () => new Promise(r => setTimeout(r, 5));
const cfgBase = () => ({ dailyEnabled: true, dailyClaim: true, dailyAuto: true });

(async () => {
    // 1) sem missão: escolhe Pidgey (Geodude x2 lv 20 / 5 abates), põe Geodude de líder e vai; na meta, devolve e volta
    let guardado;
    {
        const s = { pickedIdx: -1 };
        const { api, state, clock } = loadDailyModule(cfgBase(), { api: fakeApi(s), team: TIME(), huntCatalog: CATALOGO });
        api.setHunt('larvitar');
        await flush(); await flush();
        const pick = state.calls.find(c => c.url.endsWith('/pick'));
        assert(pick && JSON.parse(pick.opts.body).idx === 0, 'escolheu Pidgey (idx 0): ' + JSON.stringify(state.calls.map(c => c.url)));
        assert(state.sent.some(m => m.type === 'poke-summon' && m.pokeId === 'ge'), 'summon do Geodude: ' + JSON.stringify(state.sent));
        const ida = state.switches.find(x => x.origem === 'daily-ida');
        assert(ida && ida.slug === 'pidgey', 'foi para pidgey: ' + JSON.stringify(state.switches));
        assert(api.dailyRun && api.dailyRun.from === 'larvitar' && api.dailyRun.leaderId === 'sq', 'guardou origem e líder');
        assert(state.hooks.length === 1 && /Daily Kill/.test(state.hooks[0].content) && /Geodude/.test(state.hooks[0].content), 'avisou a ida');
        assert(state.store.pgDiscordNotifyDaily, 'ida persistida no localStorage');

        // chegou: Geodude é o líder; a troca do treino fica parada
        api.setTeam(lider(TIME(), 'ge'));
        api.setHunt('pidgey');
        await flush();
        assert(api.dailyOnHunt(), 'na hunt da daily');
        assert(api.dailyHoldsLeader(), 'daily segura o líder');
        assert(/com Geodude \(x2\)/.test(api.dailyStatus()) && /volta para larvitar/.test(api.dailyStatus()), 'status: ' + api.dailyStatus());
        const idas = state.switches.length;
        clock.now += 10 * 60 * 1000;
        await api.dailyTick(true); await flush();
        assert(state.switches.length === idas, 'na hunt da daily não vai de novo');

        // meta batida: resgata, devolve Squirtle e volta para larvitar
        guardado = Object.assign({}, state.store);
        s.have = 5;
        await api.dailyTick(true); await flush();
        assert(state.calls.some(c => c.url.endsWith('/claim')), 'resgatou');
        assert(state.sent.some(m => m.type === 'poke-summon' && m.pokeId === 'sq'), 'devolveu o Squirtle');
        const volta = state.switches[state.switches.length - 1];
        assert(volta.slug === 'larvitar' && volta.origem === 'daily', 'voltou para larvitar: ' + JSON.stringify(volta));
        assert(api.dailyRun.over && !api.dailyHoldsLeader(), 'ida encerrada');
        assert(/Líder devolvido: Squirtle/.test(state.hooks[state.hooks.length - 1].desc), 'aviso cita o líder devolvido');
    }

    // 2) missão escolhida pelo usuário (Oddish): não chama /pick, vai com Charmander (x2)
    {
        const s = { pickedIdx: 1 };
        const { api, state } = loadDailyModule(cfgBase(), { api: fakeApi(s), team: TIME(), huntCatalog: CATALOGO });
        api.setHunt('larvitar');
        await flush(); await flush();
        assert(!state.calls.some(c => c.url.endsWith('/pick')), 'não mexe na missão escolhida');
        assert(state.sent.some(m => m.type === 'poke-summon' && m.pokeId === 'ch'), 'Charmander de líder');
        assert(state.switches.some(x => x.slug === 'oddish' && x.origem === 'daily-ida'), 'foi para oddish');

        // a entrada falhou: devolve o líder, volta e não tenta mais hoje
        api.setTeam(lider(TIME(), 'ch'));
        api.dailyGoFailed('oddish');
        assert(state.sent.filter(m => m.type === 'poke-summon').pop().pokeId === 'sq', 'devolveu o líder na falha');
        assert(state.switches[state.switches.length - 1].slug === 'larvitar', 'voltou na falha');
        const n = state.switches.length;
        await api.dailyTick(true); await flush();
        assert(state.switches.length === n, 'depois da falha não tenta de novo');
        assert(/falhou/.test(api.dailyStatus()), 'status explica: ' + api.dailyStatus());
    }

    // 3) recarga no meio: a ida volta do localStorage e a volta ainda devolve o líder
    {
        const s = { pickedIdx: 0, have: 5 };
        const { api, state } = loadDailyModule(cfgBase(), { api: fakeApi(s), team: lider(TIME(), 'ge'), huntCatalog: CATALOGO, store: guardado });
        assert(api.dailyRun && api.dailyRun.from === 'larvitar', 'ida carregada do disco');
        api.setHunt('pidgey');
        await flush(); await flush();
        assert(state.sent.some(m => m.type === 'poke-summon' && m.pokeId === 'sq'), 'devolveu o líder depois da recarga');
        assert(state.switches.some(x => x.slug === 'larvitar' && x.origem === 'daily'), 'voltou depois da recarga');
    }

    // 4) desligada: nem escolhe nem vai
    {
        const s = { pickedIdx: -1 };
        const cfg = Object.assign(cfgBase(), { dailyAuto: false });
        const { api, state } = loadDailyModule(cfg, { api: fakeApi(s), team: TIME(), huntCatalog: CATALOGO });
        api.setHunt('larvitar');
        await flush(); await flush();
        assert(!state.calls.some(c => c.url.endsWith('/pick')) && state.switches.length === 0 && state.sent.length === 0, 'sem a opção não age');
    }

    // 5) regiões (v3.37.0): Pidgey e Charmander só em Orre → escolhe Oddish e vai para a hunt de Outland, não a de Orre
    {
        const s = { pickedIdx: -1 };
        const { api, state } = loadDailyModule(cfgBase(), { api: fakeApi(s), team: TIME(), huntCatalog: CATALOGO_ORRE });
        api.setHunt('larvitar');
        await flush(); await flush();
        const pick = state.calls.find(c => c.url.endsWith('/pick'));
        assert(pick && JSON.parse(pick.opts.body).idx === 1, 'escolheu Oddish (idx 1), a única fora de Orre: ' + JSON.stringify(state.calls.map(c => c.url)));
        const ida = state.switches.find(x => x.origem === 'daily-ida');
        assert(ida && ida.slug === 'oddish_out', 'foi para a hunt de Outland: ' + JSON.stringify(state.switches));
        const esc = state.logs.find(l => l[0] === 'daily-auto-escolha');
        assert(esc && esc[1].regiao === 'outland' && esc[1].regioes.join('+') === 'kanto+outland', 'log com a região: ' + JSON.stringify(esc && esc[1]));
    }

    // 6) todas as opções em Orre: não escolhe e explica
    {
        const s = { pickedIdx: -1 };
        const soOrre = CATALOGO_ORRE.filter(h => h.area === 'orre');
        const { api, state } = loadDailyModule(cfgBase(), { api: fakeApi(s), team: TIME(), huntCatalog: soOrre });
        api.setHunt('larvitar');
        await flush(); await flush();
        assert(!state.calls.some(c => c.url.endsWith('/pick')) && state.switches.length === 0, 'não escolheu nem foi');
        assert(/região bloqueada \(orre\)/.test(api.dailyStatus()), 'status explica: ' + api.dailyStatus());
        const esp = state.logs.find(l => l[0] === 'daily-auto-espera');
        assert(esp && esp[1].bloqueadas.length === 3 && esp[1].bloqueadas[0].regioes[0] === 'orre', 'log lista as bloqueadas: ' + JSON.stringify(esp && esp[1]));
    }

    // 7) missão escolhida pelo usuário com hunt só em Orre: não vai; liberando orre no cfg, vai
    {
        const s = { pickedIdx: 2 };
        const cfg = cfgBase();
        const { api, state } = loadDailyModule(cfg, { api: fakeApi(s), team: TIME(), huntCatalog: CATALOGO_ORRE });
        api.setHunt('larvitar');
        await flush(); await flush();
        assert(state.switches.length === 0 && state.sent.length === 0, 'não foi para Orre: ' + JSON.stringify(state.switches));
        assert(/Charmander fica em orre/.test(api.dailyStatus()), 'status explica: ' + api.dailyStatus());
        cfg.dailyAreas = ['kanto', 'outland', 'orre'];
        await api.dailyTick(true); await flush();
        assert(state.switches.some(x => x.slug === 'charmander_orre' && x.origem === 'daily-ida'), 'com orre liberada, foi: ' + JSON.stringify(state.switches));
    }

    // 8) cfg sem a chave (config antiga) ou lista vazia = padrão kanto + outland
    {
        const s = { pickedIdx: -1 };
        const cfg = Object.assign(cfgBase(), { dailyAreas: [] });
        const { api, state } = loadDailyModule(cfg, { api: fakeApi(s), team: TIME(), huntCatalog: CATALOGO_ORRE });
        api.setHunt('larvitar');
        await flush(); await flush();
        const pick = state.calls.find(c => c.url.endsWith('/pick'));
        assert(pick && JSON.parse(pick.opts.body).idx === 1, 'lista vazia usa o padrão e escolhe Oddish');
    }

    console.log('OK dailyauto.test — escolha da missão e do Pokémon, ida, volta com o líder, falha, recarga e regiões (orre bloqueada)');
})().catch(e => { console.error(e); process.exit(1); });
