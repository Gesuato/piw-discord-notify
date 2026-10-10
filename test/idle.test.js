// Volta da cidade: conta parada fora de hunt -> cura na Joy e volta (v3.23.0). Rodar: node test/idle.test.js
const { loadIdleModule, assert } = require('./harness');

const MIN = 60 * 1000;
const cfgOn = () => ({ cityIdleEnabled: true, cityIdleMin: 10 });

(async () => {
    // 1) saiu da hunt para a cidade e ficou 10 min: Joy, confere o hp, volta para a última hunt e avisa
    {
        const { api, state, clock } = loadIdleModule(cfgOn(), { env: { lastRealHunt: 'pidgey' }, pokesHp: [100] });
        api.onAlive(); api.onHuntChange(null);                // estava farmando e foi para a cidade
        clock.now += 9 * MIN; await api.tick();
        assert(state.switches.length === 0, '9 min: ainda não volta');
        assert(/volta em 1 min/.test(api.status()), 'status conta o tempo: ' + api.status());
        clock.now += 1 * MIN; await api.tick();
        assert(state.sent.some(o => o.type === 'joy-heal'), 'curou na Joy: ' + JSON.stringify(state.sent));
        assert(!state.sent.some(o => o.type === 'leave-hunt'), 'já na cidade: sem leave-hunt');
        assert(state.switches.length === 1 && state.switches[0].slug === 'pidgey' && state.switches[0].origem === 'cidade', 'voltou: ' + JSON.stringify(state.switches));
        assert(state.hooks.length === 1 && /curei na Nurse Joy e estou voltando para \*\*pidgey\*\*/.test(state.hooks[0].content), 'avisa: ' + state.hooks[0]?.content);
        assert(!api.running(), 'fluxo terminou');
    }

    // 2) frames chegando (servidor farma com a tela na cidade): não é parada
    {
        const { api, state, clock } = loadIdleModule(cfgOn(), { env: { lastRealHunt: 'pidgey' } });
        for (let i = 0; i < 30; i++) { clock.now += 30 * 1000; api.onAlive(); await api.tick(); }
        assert(state.switches.length === 0 && api.since() === 0, 'farmando: nada acontece');
    }

    // 3) hunt pedida sem nenhum frame em 10 min: leave-hunt + set-city, Joy e volta para a mesma
    {
        const { api, state, clock } = loadIdleModule(cfgOn(), { env: { huntSlug: 'rattata', lastRealHunt: 'rattata' }, pokesHp: [100] });
        api.onHuntChange('rattata');
        clock.now += 11 * MIN; await api.tick();
        const tipos = state.sent.map(o => o.type);
        assert(tipos[0] === 'leave-hunt' && tipos[1] === 'set-city' && tipos.includes('joy-heal'), 'sai da hunt morta e cura: ' + tipos.join(','));
        assert(state.switches[0]?.slug === 'rattata', 'volta para rattata');
    }

    // 4) a Joy não curou (hp 0): não volta e avisa a falha
    {
        const { api, state, clock } = loadIdleModule(cfgOn(), { env: { lastRealHunt: 'pidgey' }, pokesHp: [0] });
        api.onHuntChange(null);
        clock.now += 10 * MIN; await api.tick();
        assert(state.switches.length === 0, 'hp 0: não volta');
        assert(/não voltei: a Joy não curou/.test(state.hooks[0]?.content || ''), 'avisa a falha: ' + state.hooks[0]?.content);
    }

    // 5) destino: rota do clã > etapa da rota de treino > última hunt; hunt que a cura largou não serve
    {
        let r = loadIdleModule(cfgOn(), { env: { lastRealHunt: 'pidgey', route: { slug: 'Onix_Cave' }, clanRoute: true, clanTarget: { slug: 'geodude' } } });
        r.api.onHuntChange(null); r.clock.now += 10 * MIN; await r.api.tick();
        assert(r.state.switches[0]?.slug === 'geodude', 'clã primeiro: ' + JSON.stringify(r.state.switches));
        r = loadIdleModule(cfgOn(), { env: { lastRealHunt: 'pidgey', route: { slug: 'Onix_Cave' } } });
        r.api.onHuntChange(null); r.clock.now += 10 * MIN; await r.api.tick();
        assert(r.state.switches[0]?.slug === 'onix_cave', 'etapa da rota: ' + JSON.stringify(r.state.switches));
        r = loadIdleModule(cfgOn(), { env: { lastRealHunt: 'onix' } });
        r.env.healDeaths = [1, 2, 3].map(i => ({ slug: 'onix', at: r.clock.now - i * MIN }));
        r.api.onHuntChange(null); r.clock.now += 10 * MIN; await r.api.tick();
        assert(r.state.switches[0]?.slug === 'onix', 'v3.24.3: quedas da cura não impedem a volta: ' + JSON.stringify(r.state.switches));
        r = loadIdleModule(cfgOn(), {});
        r.api.onHuntChange(null); r.clock.now += 10 * MIN; await r.api.tick();
        assert(r.state.switches.length === 0 && /não sei de que hunt/.test(r.api.status()), 'sem destino: ' + r.api.status());
    }

    // 6) espera o que estiver em andamento; rota de captura cuida da própria volta; desligada não faz nada
    {
        for (const [k, v, txt] of [['tripRunning', true, 'viagem'], ['heal', true, 'cura'], ['huntSwitch', { slug: 'x' }, 'troca para x'], ['resumeHunt', 'x', 'recarga'], ['catchRoute', true, 'rota de captura']]) {
            const { api, state, clock } = loadIdleModule(cfgOn(), { env: { lastRealHunt: 'pidgey', [k]: v } });
            api.onHuntChange(null); clock.now += 15 * MIN; await api.tick();
            assert(state.switches.length === 0 && api.status().includes(txt), `${k}: ` + api.status());
            assert(state.logs.some(l => l[0] === 'cidade-parada-espera'), `${k}: loga a espera`);
        }
        const { api, state, clock } = loadIdleModule({ cityIdleEnabled: false, cityIdleMin: 10 }, { env: { lastRealHunt: 'pidgey' } });
        api.onHuntChange(null); clock.now += 60 * MIN; await api.tick();
        assert(state.switches.length === 0 && api.status() === 'desligada', 'desligada');
    }

    // 7) 3 voltas em 1 h sem a hunt pegar: desiste e avisa; rearma quando a conta volta a farmar
    {
        const { api, state, clock, env } = loadIdleModule(cfgOn(), { env: { lastRealHunt: 'pidgey' }, pokesHp: [100, 100, 100, 100] });
        api.onHuntChange(null);
        for (let i = 0; i < 4; i++) {
            clock.now += 10 * MIN; await api.tick();
            env.huntSlug = 'pidgey'; api.onHuntChange('pidgey');       // o enter-hunt saiu, mas nenhum frame chega
        }
        assert(state.switches.length === 3, '3 voltas: ' + state.switches.length);
        assert(/desisti/.test(state.hooks[state.hooks.length - 1].title) && /parei/.test(api.status()), 'desistiu: ' + api.status());
        api.onAlive();
        assert(api.since() === 0 && !/parei/.test(api.status()), 'rearmou ao farmar: ' + api.status());
    }

    // 8) v3.33.1: estava farmando e os frames pararam (servidor tirou da hunt sem a tela mandar leave-hunt): 10 min depois sai, cura e volta
    {
        const { api, state, clock, env } = loadIdleModule(cfgOn(), { env: { huntSlug: 'rattata', lastRealHunt: 'rattata' }, pokesHp: [100] });
        api.onHuntChange('rattata');
        for (let i = 0; i < 10; i++) { clock.now += 30 * 1000; api.onAlive(); await api.tick(); }
        assert(api.since() === 0 && /^farmando/.test(api.status()), 'farmando: ' + api.status());
        clock.now += 9 * MIN; await api.tick();
        assert(state.switches.length === 0 && /parada em rattata sem abates há 9 min/.test(api.status()), '9 min sem frame: espera: ' + api.status());
        clock.now += 1 * MIN; await api.tick();
        const tipos = state.sent.map(o => o.type);
        assert(tipos[0] === 'leave-hunt' && tipos[1] === 'set-city' && tipos.includes('joy-heal'), 'sai da hunt morta e cura: ' + tipos.join(','));
        assert(state.switches[0]?.slug === 'rattata' && state.switches[0]?.origem === 'cidade', 'volta para rattata: ' + JSON.stringify(state.switches));
        assert(/parada em rattata sem abates há 10 min/.test(state.hooks[0]?.content || ''), 'avisa onde parou: ' + state.hooks[0]?.content);
        const ini = state.logs.find(l => l[0] === 'cidade-parada' && l[1].fase === 'inicio');
        assert(ini && ini[1].hunt === 'rattata' && ini[1].ultimoFrame, 'log traz a hunt e o último frame: ' + JSON.stringify(ini));
        env.huntSlug = 'rattata'; api.onHuntChange('rattata'); api.onAlive();
        assert(api.since() === 0, 'voltou a farmar');
    }

    console.log('OK idle.test — parada 10 min, Joy + volta, frames = farmando, hunt sem frame, falha da Joy, destinos, esperas, desligada, proteção de 3 voltas e frames que param no meio da hunt');
})().catch(err => { console.error(err); process.exit(1); });
