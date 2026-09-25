// Rota de captura (aba Profissão, v3.10.0). Rodar: node test/catch.test.js
const { loadCatchModule, assert } = require('./harness');

// Catálogo falso: 2 hunts lv1, 2 lv10, 1 orre, 1 cidade, 1 Nightmare (espécie >= 10000), 1 sem criatura.
const HUNTS = [
    { slug: 'cerulean', name: 'Cerulean', level: 0, area: 'kanto', looktype: 1309 },
    { slug: 'rattata', name: 'Rattata', level: 1, area: 'kanto', looktype: 19 },
    { slug: 'pidgey', name: 'Pidgey', level: 1, area: 'kanto', looktype: 16 },
    { slug: 'abra', name: 'Abra', level: 10, area: 'kanto', looktype: 63 },
    { slug: 'nidoranfe', name: 'Nidoranfe', level: 10, area: 'kanto', looktype: 70 },
    { slug: 'treecko', name: 'Treecko', level: 520, area: 'orre', looktype: 252 },
    { slug: 'nightmare_pidgeot', name: 'Nightmare Pidgeot', level: 3000, area: 'nightmare', looktype: 999 },
    { slug: 'mistery', name: 'Mistery', level: 5, area: 'kanto', looktype: 4242 },
];
const CREATURES = [
    { pokeId: 16, name: 'Pidgey', looktype: 16 }, { pokeId: 50016, name: 'Nightmare Pidgey', looktype: 16 },
    { pokeId: 19, name: 'Rattata', looktype: 19 }, { pokeId: 63, name: 'Abra', looktype: 63 },
    { pokeId: 29, name: 'Nidoran Female', looktype: 70 }, { pokeId: 252, name: 'Treecko', looktype: 252 },
    { pokeId: 50018, name: 'Nightmare Pidgeot', looktype: 999 },
];
function ambiente(caught, opts) {
    opts = opts || {};
    const fetchJson = (url) => url.includes('map-markers') ? { map: {}, hunts: HUNTS } : { creatures: CREATURES };
    const api = (url) => {
        if (url.includes('pokedex')) return { unlockKills: 100, species: CREATURES.map(c => ({ id: c.pokeId, caught: caught.includes(c.pokeId) })) };
        if (url.includes('professions')) return { profession: 'prestige', rankKey: 'C', speciesCount: caught.length, nextStep: { toRankKey: 'B', species: { have: caught.length, need: 40 } } };
        throw new Error('url inesperada ' + url);
    };
    return Object.assign({ fetchJson, api }, opts);
}
const flush = () => new Promise(r => setTimeout(r, 5));

(async () => {
    // 1) desligada: nada
    {
        const { api, state } = loadCatchModule({ catchRouteEnabled: false }, ambiente([]));
        await api.startCatchRoute('t');
        assert(state.calls.length === 0 && state.switches.length === 0 && api.catchStatus() === 'desligada', 'desligada não faz nada');
    }

    // 2) plano: kanto, por nível, sem capturadas, sem Nightmare (espécie >= 10000), sem hunt sem criatura; entra no 1º alvo
    {
        const { api, state } = loadCatchModule({ catchRouteEnabled: true, catchRouteAreas: ['kanto'] }, ambiente([19]));
        await api.startCatchRoute('t');
        assert(api.catchPlan().map(h => h.slug).join(',') === 'pidgey,abra,nidoranfe', 'plano: ' + api.catchPlan().map(h => h.slug));
        assert(api.catchScope().length === 4, 'escopo 4 (rattata já capturada conta)');
        assert(api.catchTarget.slug === 'pidgey' && api.catchTarget.speciesId === 16, 'alvo pidgey, espécie 16 (não a Nightmare)');
        assert(api.catchPlan().find(h => h.slug === 'nidoranfe').speciesId === 29, 'nidoranfe casa por looktype');
        assert(state.switches.length === 1 && state.switches[0].slug === 'pidgey' && state.switches[0].origem === 'captura', 'entrou em pidgey');
        assert(/alvo Pidgey \(lv 1, kanto\) · entrando…|você está em cidade/.test(api.catchStatus()) || /alvo Pidgey/.test(api.catchStatus()), 'status: ' + api.catchStatus());
        await flush();
        assert(api.profession && api.profession.speciesCount === 1 && api.profession.next.need === 40, 'profissão lida');
        assert(state.logs.some(l => l[0] === 'captura-catalogo' && l[1].semEspecie === 1), 'catálogo logou a hunt sem criatura');
    }

    // 3) áreas + nível máximo
    {
        const { api } = loadCatchModule({ catchRouteEnabled: true, catchRouteAreas: ['kanto', 'orre'], catchRouteMaxLevel: 10 }, ambiente([]));
        await api.startCatchRoute('t');
        assert(api.catchPlan().map(h => h.slug).join(',') === 'pidgey,rattata,abra,nidoranfe', 'orre acima do nível fica de fora');
        const { api: b } = loadCatchModule({ catchRouteEnabled: true, catchRouteAreas: ['orre'] }, ambiente([]));
        await b.startCatchRoute('t');
        assert(b.catchPlan().map(h => h.slug).join(',') === 'treecko', 'só orre');
    }

    // 4) fluxo principal: na hunt, bola automática na fila, captura -> marca, avisa e vai para a próxima
    {
        const cfg = { catchRouteEnabled: true, catchRouteAreas: ['kanto'], catchRouteAuto: true, catchRouteBall: 'auto', mentionUserId: '7' };
        const { api, state } = loadCatchModule(cfg, ambiente([], { lastBallId: 4, ballCounts: { 4: 50 } }));
        await api.startCatchRoute('t');
        api.setHunt('pidgey');
        api.catchOnPending([{ id: 'p1', pokeId: 19, name: 'Rattata' }, { id: 'p2', pokeId: 16, name: 'Pidgey', shiny: false }]);
        assert(state.sent.length === 1 && state.sent[0].type === 'catch' && state.sent[0].pendingId === 'p2' && state.sent[0].ballId === 4, 'jogou Ultra Ball no Pidgey: ' + JSON.stringify(state.sent));
        api.catchOnPending([{ id: 'p2', pokeId: 16, name: 'Pidgey' }]);
        assert(state.sent.length === 1, 'não repete a bola no mesmo pendingId');
        api.catchOnResult({ name: 'Pidgey', shiny: false }, { success: true, speciesName: 'Pidgey', pendingId: 'p2', cooldownMs: 800 });
        assert(api.dexCaught.has(16) && cfg.catchRouteDone.includes(16) && state.saved >= 1, 'Pidgey marcado como capturado');
        assert(api.catchTarget.slug === 'rattata', 'próximo alvo rattata');
        assert(state.switches.length === 2 && state.switches[1].slug === 'rattata', 'trocou para rattata');
        assert(state.hooks.length === 1 && /<@7> 📖 \*\*Teste\*\* capturou \*\*Pidgey\*\* \(1\/4\) — próximo: \*\*Rattata\*\* \(lv 1\)/.test(state.hooks[0].content), 'aviso: ' + state.hooks[0].content);
        api.catchOnPending([{ id: 'p3', pokeId: 19, name: 'Rattata' }]);
        assert(state.sent.length === 1, 'em cooldown (cooldownMs do catch-result) não joga');
    }

    // 5) captura manual de espécie que não é o alvo mas está no plano: marca, não troca de hunt
    {
        const { api, state } = loadCatchModule({ catchRouteEnabled: true, catchRouteAreas: ['kanto'] }, ambiente([]));
        await api.startCatchRoute('t');
        api.catchOnResult({ name: 'Abra' }, { success: true, speciesName: 'Abra' });
        assert(api.dexCaught.has(63) && api.catchTarget.slug === 'pidgey' && state.switches.length === 1, 'Abra marcado, alvo segue pidgey');
        assert(api.catchPlan().every(h => h.slug !== 'abra'), 'abra saiu do plano');
        api.catchOnResult({ name: 'Abra' }, { success: true, speciesName: 'Abra' });
        assert(state.hooks.length === 1, 'repetida não avisa de novo');
    }

    // 6) entrada falhou -> pula nesta sessão; pular no painel persiste; limpar puladas
    {
        const cfg = { catchRouteEnabled: true, catchRouteAreas: ['kanto'] };
        const { api, state } = loadCatchModule(cfg, ambiente([]));
        await api.startCatchRoute('t');
        api.catchHuntFailed('pidgey', 'Requer nível 5');
        assert(api.catchTarget.slug === 'rattata' && state.logs.some(l => l[0] === 'captura-pulou' && /Requer/.test(l[1].erro)), 'falha pula para rattata');
        assert(api.skipCatchTarget() === 'rattata' && cfg.catchRouteSkipped.includes('rattata') && api.catchTarget.slug === 'abra', 'pular no painel: abra');
        api.catchHuntFailed('zzz');
        assert(api.catchTarget.slug === 'abra', 'falha de outra hunt não afeta o alvo');
    }

    // 7) última capturada -> rota concluída: avisa e desliga
    {
        const cfg = { catchRouteEnabled: true, catchRouteAreas: ['kanto'] };
        const { api, state } = loadCatchModule(cfg, ambiente([19, 63, 29]));
        await api.startCatchRoute('t');
        assert(api.catchTarget.slug === 'pidgey', 'só pidgey falta');
        api.catchOnResult({ name: 'pidgey' }, { success: true, speciesName: 'Pidgey', auto: true });
        assert(cfg.catchRouteEnabled === false && api.catchTarget === null, 'concluída desliga');
        assert(state.hooks.length === 2 && /🏁 .*4\/4 espécies/.test(state.hooks[1].content), 'aviso de conclusão: ' + state.hooks[1].content);
        assert(/Auto-Catch/.test(state.hooks[0].desc), 'marca captura pelo Auto-Catch');
    }

    // 8) tique: parado fora de hunt há 2 min volta para o alvo; em hunt não mexe
    {
        const { api, state, clock } = loadCatchModule({ catchRouteEnabled: true, catchRouteAreas: ['kanto'] }, ambiente([], { lastFieldAt: Date.now() })); // combate recente
        await api.startCatchRoute('t');
        state.switches.length = 0;
        api.setHunt('abra');                 // usuário foi para outra hunt na mão
        api.catchTick();
        assert(state.switches.length === 0, 'em outra hunt não mexe');
        api.setHunt(null);
        api.catchTick();
        assert(state.switches.length === 0, 'fora de hunt há pouco tempo: espera');
        clock.now += 3 * 60 * 1000;
        api.catchTick();
        assert(state.switches.length === 1 && state.switches[0].slug === 'pidgey', 'parado 3 min: volta para pidgey');
    }

    // 9) Pokédex com erro: rota não começa, log explica
    {
        const env = ambiente([]); env.api = () => { throw new Error('HTTP 500'); };
        const { api, state } = loadCatchModule({ catchRouteEnabled: true }, env);
        await api.startCatchRoute('t');
        assert(api.catchTarget === null && state.logs.some(l => l[0] === 'captura-erro'), 'erro logado, sem alvo');
    }

    console.log('OK catch.test — catálogo, plano por nível/área, bola automática, avanço, pulos e conclusão');
})().catch(e => { console.error(e); process.exit(1); });
