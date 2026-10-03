// Evolução automática (v3.25.0): quem do time chega ao nível pede viagem; na cidade evolui com pedra (GET/POST
// /api/game/evolve), mantém o nível, avisa; sem pedra avisa uma vez; linha ramificada só com um destino pronto.
// Rodar: node test/evolve.test.js
const { loadEvolveModule, assert } = require('./harness');

const P = (o) => Object.assign({ id: 'x', name: 'Mon', level: 10, team: true, hasEvolution: true, evolveNeedLevel: 16, evolvesToName: 'Dest' }, o);
const TIME = [
    P({ id: 'char', name: 'Charmander', level: 16, evolveNeedLevel: 16, evolvesToName: 'Charmeleon' }),       // pronto
    P({ id: 'pidg', name: 'Pidgey', level: 12, evolveNeedLevel: 18, evolvesToName: 'Pidgeotto' }),           // abaixo
    P({ id: 'box', name: 'Bulbasaur', level: 40, team: false, evolveNeedLevel: 16, evolvesToName: 'Ivysaur' }), // no box: não conta
    P({ id: 'final', name: 'Raichu', level: 50, hasEvolution: false, evolveNeedLevel: null, evolvesToName: null }), // estágio final
];
const evoApi = (resp, posts) => (url, opts) => {
    if (opts?.method === 'POST') { const b = JSON.parse(opts.body); posts.push(b); const r = resp[b.capturedId]; return { name: (b.destId != null && r?.branches?.find(x => x.destId === b.destId)?.destName) || r?.destName || 'Evoluido' }; }
    const id = decodeURIComponent(url.split('capturedId=')[1].split('&')[0]);
    return resp[id] || { canEvolve: false };
};

(async () => {
    // 1) frame `pokes`: só o do time no nível pede viagem, uma vez por episódio; desligado não pede
    {
        const { api, state } = loadEvolveModule({ evolveEnabled: true });
        api.evolveOnPokes(TIME);
        assert(api.evolveTeam.length === 2 && api.evolveCandidates().map(p => p.id).join() === 'char', 'time com evolução: 2; pronto: char');
        assert(state.trips.length === 1 && state.trips[0].key === 'evoluir' && /Charmander lv 16 → Charmeleon/.test(state.trips[0].motivo), 'pediu viagem: ' + JSON.stringify(state.trips));
        api.evolveOnPokes(TIME);
        assert(state.trips.length === 1, 'não pede de novo no mesmo episódio');
        assert(api.evolveWanted() === true, 'carona: quer evoluir');
        assert(/Charmander 16\/16 → Charmeleon ✔ viagem pedida/.test(api.evolveStatus()) && /Pidgey 12\/18/.test(api.evolveStatus()), 'status: ' + api.evolveStatus());

        const off = loadEvolveModule({ evolveEnabled: false });
        off.api.evolveOnPokes(TIME);
        assert(off.state.trips.length === 0 && off.api.evolveWanted() === false, 'desligado não pede viagem');
        off.api.evolveOnPokeXp({ leveledUp: true });
        assert(off.state.pokesReqs === 0, 'desligado não confere o time');
        api.evolveOnPokeXp({ leveledUp: true }); api.evolveOnPokeXp({ leveledUp: false });
        assert(state.pokesReqs === 1, 'leveledUp confere o time (pokes-get) uma vez');
    }

    // 2) na cidade: GET diz que pode e tem pedra -> POST useStone:true, aviso, pokes-get; o frame novo rearma
    {
        const posts = [];
        const resp = { char: { name: 'Charmander', level: 16, needLevel: 16, canEvolve: true, hasStones: true, keepLevel: 16, destName: 'Charmeleon', stones: [{ itemId: 300, name: 'Fire Stone', need: 2, have: 5 }] } };
        const { api, state } = loadEvolveModule({ evolveEnabled: true }, { api: evoApi(resp, posts) });
        api.evolveOnPokes(TIME);
        const r = await api.evolveCityWork();
        assert(posts.length === 1 && posts[0].capturedId === 'char' && posts[0].useStone === true && !('destId' in posts[0]), 'POST com pedra: ' + JSON.stringify(posts));
        assert(r.ok && r.feitos === 1 && r.falhas === 0, 'resultado: ' + JSON.stringify(r));
        assert(state.hooks.length === 1 && /evoluiu \*\*Charmander\*\* em \*\*Charmeleon\*\*/.test(state.hooks[0].content) && /lv 16 mantido, gastou 2x Fire Stone/.test(state.hooks[0].desc), 'aviso: ' + state.hooks[0].content + ' | ' + state.hooks[0].desc);
        assert(state.sent.some(m => m.type === 'pokes-get') && !state.sent.some(m => m.type === 'set-city'), 'relê o time; já estava em Cerulean');
        const log = state.logs.find(l => l[0] === 'evolucao');
        assert(log && log[1].ok === true && log[1].para === 'Charmeleon' && Array.isArray(log[1].campos), 'log evolucao: ' + JSON.stringify(log));
        // time novo: Charmeleon (precisa 36) -> candidato some, episódio rearmado
        api.evolveOnPokes([P({ id: 'char', name: 'Charmeleon', level: 16, evolveNeedLevel: 36, evolvesToName: 'Charizard' })]);
        assert(api.evolveCandidates().length === 0 && !api.evolveAttempted.char, 'estágio novo abaixo do nível: rearmado');
        assert(/última viagem: evoluiu Charmeleon/.test(api.evolveStatus()), 'status com a última viagem: ' + api.evolveStatus());
    }

    // 3) sem pedra: não evolui (nunca a grátis), avisa uma vez; na viagem seguinte com o mesmo motivo não repete o aviso
    {
        const posts = [];
        const resp = { char: { name: 'Charmander', level: 16, needLevel: 16, canEvolve: true, hasStones: false, destName: 'Charmeleon', stones: [{ itemId: 300, name: 'Fire Stone', need: 2, have: 0 }] } };
        const { api, state } = loadEvolveModule({ evolveEnabled: true }, { api: evoApi(resp, posts) });
        api.evolveOnPokes(TIME);
        const r = await api.evolveCityWork();
        assert(posts.length === 0 && !r.ok && /faltam pedras \(2x Fire Stone \(tem 0\)\)/.test(r.motivo), 'sem pedra não evolui: ' + JSON.stringify(r));
        assert(state.hooks.length === 1 && /não conseguiu evoluir \*\*Charmander\*\*/.test(state.hooks[0].content), 'avisou a falha: ' + state.hooks[0].content);
        await api.evolveCityWork();
        assert(state.hooks.length === 1 && state.calls.filter(c => c.method === 'GET').length === 2, '2ª viagem: tenta de novo, não repete o aviso');
        assert(api.evolveWanted() === true, 'segue querendo (carona nas próximas viagens)');
    }

    // 4) linha ramificada: com pedra para um destino só -> POST com destId; com dois prontos -> não escolhe
    {
        const posts = [];
        const ramos = [
            { destId: 134, destName: 'Vaporeon', needLevel: 20, canEvolve: true, hasStones: true, stones: [{ itemId: 301, name: 'Water Stone', need: 1, have: 1 }] },
            { destId: 135, destName: 'Jolteon', needLevel: 20, canEvolve: true, hasStones: false, stones: [{ itemId: 302, name: 'Thunder Stone', need: 1, have: 0 }] },
        ];
        const resp = { eevee: { name: 'Eevee', level: 20, needLevel: 20, canEvolve: true, hasStones: false, destName: '???', stones: [], branches: ramos } };
        const { api, state } = loadEvolveModule({ evolveEnabled: true }, { api: evoApi(resp, posts) });
        api.evolveOnPokes([P({ id: 'eevee', name: 'Eevee', level: 20, evolveNeedLevel: 20, evolvesToName: null })]);
        const r = await api.evolveCityWork();
        assert(posts.length === 1 && posts[0].destId === 134 && posts[0].useStone === true && r.feitos === 1, 'ramo único com pedra: ' + JSON.stringify(posts));
        assert(/Eevee → \*\*Vaporeon\*\*/.test(state.hooks[0].desc), 'aviso do ramo: ' + state.hooks[0].desc);

        ramos[1].hasStones = true;
        const posts2 = [];
        const b = loadEvolveModule({ evolveEnabled: true }, { api: evoApi(resp, posts2) });
        b.api.evolveOnPokes([P({ id: 'eevee', name: 'Eevee', level: 20, evolveNeedLevel: 20, evolvesToName: null })]);
        const r2 = await b.api.evolveCityWork();
        assert(posts2.length === 0 && !r2.ok && /ramificada com pedra para Vaporeon e Jolteon/.test(r2.motivo), 'dois ramos prontos: escolha no jogo: ' + JSON.stringify(r2));
    }

    // 5) cidade da viagem não é Cerulean: manda set-city cerulean antes; erro do POST vira falha com motivo
    {
        const posts = [];
        const resp = { char: { name: 'Charmander', level: 16, needLevel: 16, canEvolve: true, hasStones: true, destName: 'Charmeleon', stones: [] } };
        const api1 = (url, opts) => { if (opts?.method === 'POST') throw new Error('Evolution is only allowed in Cerulean'); return evoApi(resp, posts)(url, opts); };
        const { api, state } = loadEvolveModule({ evolveEnabled: true }, { api: api1, city: 'pewter' });
        api.evolveOnPokes(TIME);
        const r = await api.evolveCityWork();
        assert(state.sent[0]?.type === 'set-city' && state.sent[0].slug === 'cerulean', 'foi para Cerulean antes: ' + JSON.stringify(state.sent));
        assert(!r.ok && /erro: Evolution is only allowed in Cerulean/.test(r.motivo) && state.hooks.length === 1, 'erro do jogo vira falha avisada: ' + JSON.stringify(r));
    }

    // 6) ninguém no nível: tarefa não faz nada; `canEvolve:false` do jogo (nível) também não evolui
    {
        const posts = [];
        const resp = { char: { name: 'Charmander', level: 15, needLevel: 16, canEvolve: false, hasStones: true, destName: 'Charmeleon', stones: [] } };
        const { api, state } = loadEvolveModule({ evolveEnabled: true }, { api: evoApi(resp, posts) });
        let r = await api.evolveCityWork();
        assert(r.ok && /ninguém/.test(r.motivo) && state.calls.length === 0, 'sem candidato não chama a API');
        api.evolveOnPokes(TIME);
        r = await api.evolveCityWork();
        assert(posts.length === 0 && !r.ok && /ainda não pode \(nível 15, precisa 16\)/.test(r.motivo), 'jogo recusa pelo nível: ' + JSON.stringify(r));
    }

    console.log('OK evolve.test — pedido de viagem no nível, evolução com pedra (mantém o nível), sem pedra avisa uma vez, linha ramificada, Cerulean e recusas');
})().catch(e => { console.error(e); process.exit(1); });
