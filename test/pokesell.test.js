// Venda automática de Pokémon fora do time (v3.11.0; um limite por raridade desde a v3.12.0). Rodar: node test/pokesell.test.js
const { loadPokeSellModule, assert } = require('./harness');

const P = (o) => Object.assign({ id: 'x', name: 'Rattata', level: 5, team: false, starter: false, shiny: false, locked: false, sellValue: 100, ivTotal: 50, quality: 1.0 }, o);
const LISTA = [
    P({ id: 'lider', name: 'Larvitar', team: true, leader: true, ivTotal: 10, quality: 1.0 }),
    P({ id: 'time2', name: 'Pidgey', team: true, ivTotal: 10, quality: 1.0 }),
    P({ id: 'starter', name: 'Charmander', starter: true, ivTotal: 10, quality: 1.0 }),
    P({ id: 'shiny', name: 'Rattata', shiny: true, ivTotal: 10, quality: 1.0 }),
    P({ id: 'locked', name: 'Dratini', locked: true, ivTotal: 10, quality: 1.7 }),
    P({ id: 'semvalor', name: 'Magikarp', sellValue: 0, ivTotal: 10, quality: 1.0 }),
    P({ id: 'semiv', name: 'Zubat', ivTotal: undefined, quality: undefined }),
    P({ id: 'c40', name: 'Rattata', ivTotal: 40, quality: 1.0 }),        // Common 40
    P({ id: 'r120', name: 'Abra', ivTotal: 120, quality: 1.3 }),         // Rare 120
    P({ id: 'e99', name: 'Gastly', ivTotal: 99, quality: 1.5 }),         // Epic 99
    P({ id: 'l90', name: 'Dratini', ivTotal: 90, quality: 1.7 }),        // Legendary 90
    P({ id: 'm170', name: 'Larvitar', ivTotal: 170, quality: 2.0 }),     // Mythic 170
];
// Limites: Common < 100, Rare < 100, Epic < 100, Legendary < 100 (Mythic e os demais sem limite = não vende)
const REGRAS = { common: 100, rare: 100, epic: 100, legendary: 100 };
const okApi = (sold) => (url, opts) => { const ids = JSON.parse(opts.body).pokeIds; return Promise.resolve({ gold: 9000, goldGained: 100 * (sold ?? ids.length), sold: sold ?? ids.length }); };
const flush = () => new Promise(r => setTimeout(r, 5));

(async () => {
    // 1) regras por raridade e proteções fixas
    {
        const cfg = { pokeSellEnabled: true, pokeSellLimits: REGRAS };
        const { api } = loadPokeSellModule(cfg, { api: okApi() });
        const motivos = Object.fromEntries(LISTA.map(p => [p.id, api.pokeSellReason(p, cfg)]));
        assert(motivos.lider === 'no time' && motivos.time2 === 'no time', 'time protegido');
        assert(motivos.starter === 'inicial' && motivos.shiny === 'shiny' && motivos.locked === 'cadeado' && motivos.semvalor === 'sem valor' && motivos.semiv === 'sem IV', 'proteções fixas: ' + JSON.stringify(motivos));
        assert(motivos.c40 === null && motivos.e99 === null && motivos.l90 === null, 'abaixo do limite da raridade vende');
        assert(/poder 120/.test(motivos.r120), 'Rare 120 fica');
        assert(motivos.m170 === 'Mythic sem limite', 'raridade sem limite não vende: ' + motivos.m170);
        assert(api.pokeSellCandidates(cfg, LISTA).map(p => p.id).join(',') === 'c40,e99,l90', 'candidatos');
        assert(api.pokeSellHasRules(cfg) && !api.pokeSellHasRules({ pokeSellLimits: {} }) && !api.pokeSellHasRules({}), 'hasRules');
    }

    // 2) limites independentes por raridade; valores inválidos viram 0; acima de 192 corta em 192
    {
        const { api } = loadPokeSellModule({}, { api: okApi() });
        assert(api.pokeSellCandidates({ pokeSellLimits: { epic: 100 } }, LISTA).map(p => p.id).join(',') === 'e99', 'só Epic');
        assert(api.pokeSellCandidates({ pokeSellLimits: { common: 41, mythic: 171 } }, LISTA).map(p => p.id).join(',') === 'c40,m170', 'Common 41 e Mythic 171');
        assert(api.pokeSellCandidates({ pokeSellLimits: { common: 'abc', rare: -5 } }, LISTA).length === 0, 'limites inválidos não vendem');
        assert(api.pokeSellLimit({ pokeSellLimits: { common: 999 } }, 'common') === 192, 'limite corta em 192');
    }

    // 3) frame pokes com a venda ligada: vende os candidatos, avisa, respeita o intervalo mínimo
    {
        const cfg = { pokeSellEnabled: true, pokeSellLimits: REGRAS };
        const { api, state, clock } = loadPokeSellModule(cfg, { api: okApi() });
        api.pokeSellOnPokes(LISTA);
        await flush();
        assert(state.calls.length === 1 && state.calls[0].url.endsWith('/pokemon/sell') && state.calls[0].body.pokeIds.join(',') === 'c40,e99,l90', 'POST com os 3 ids: ' + JSON.stringify(state.calls));
        assert(state.hooks.length === 1 && /vendeu \*\*3 Pokémon\*\* por 300 gold/.test(state.hooks[0].content), 'aviso: ' + state.hooks[0].content);
        assert(/Rattata lv5 Common 40\/192/.test(state.hooks[0].desc) && /Gold agora: 9000/.test(state.hooks[0].desc), 'embed lista os vendidos: ' + state.hooks[0].desc);
        assert(state.pokesReqs === 1, 'pede a lista nova');
        assert(api.lastPokesList.length === LISTA.length - 3, 'vendidos saem da lista local');
        api.pokeSellOnPokes(LISTA);
        await flush();
        assert(state.calls.length === 1, 'dentro de 60 s não vende de novo');
        clock.now += 61 * 1000;
        api.pokeSellOnPokes(LISTA);
        await flush();
        assert(state.calls.length === 2, 'passado o intervalo vende de novo');
    }

    // 4) desligada: só guarda a lista; manual vende mesmo desligada
    {
        const cfg = { pokeSellEnabled: false, pokeSellLimits: { common: 100, epic: 100 } };
        const { api, state } = loadPokeSellModule(cfg, { api: okApi() });
        api.pokeSellOnPokes(LISTA);
        await flush();
        assert(state.calls.length === 0 && api.lastPokesList.length === LISTA.length, 'desligada não vende');
        const r = await api.runPokeSellCycle(true);
        assert(r.ok && r.vendidos === 2 && state.calls[0].body.pokeIds.join(',') === 'c40,e99', 'manual vende');
    }

    // 5) captura recente protegida; captura aguardando detalhes adia a venda
    {
        const cfg = { pokeSellEnabled: true, pokeSellLimits: REGRAS };
        const { api, state, clock } = loadPokeSellModule(cfg, { api: okApi() });
        api.noteRecentCapture('c40');
        assert(api.pokeSellReason(LISTA.find(p => p.id === 'c40'), cfg) === 'capturado agora', 'recém-capturado protegido');
        clock.now += 3 * 60 * 1000;
        assert(api.pokeSellReason(LISTA.find(p => p.id === 'c40'), cfg) === null, 'depois de 2 min volta a valer a regra');
        state.awaiting.push({});
        api.pokeSellOnPokes(LISTA);
        await flush();
        assert(state.calls.length === 0, 'captura aguardando detalhes: não vende');
        const r = await api.runPokeSellCycle(true);
        assert(!r.ok && /aguardando/.test(r.motivo), 'manual também espera');
    }

    // 6) venda parcial e erro
    {
        const cfg = { pokeSellEnabled: true, pokeSellLimits: REGRAS };
        const { api, state } = loadPokeSellModule(cfg, { api: okApi(1) });
        api.pokeSellOnPokes(LISTA);
        await flush();
        assert(state.hooks.length === 1 && /venda parcial/.test(state.hooks[0].content) && /só parte do lote/.test(state.hooks[0].desc), 'parcial avisa: ' + state.hooks[0].content);
        const { api: b, state: sb } = loadPokeSellModule(cfg, { api: () => Promise.reject(new Error('HTTP 500')) });
        b.pokeSellOnPokes(LISTA);
        await flush();
        assert(sb.hooks.length === 1 && /falhou/.test(sb.hooks[0].content) && /HTTP 500/.test(sb.hooks[0].desc), 'erro avisa: ' + sb.hooks[0].desc);
    }

    console.log('OK pokesell.test — limite por raridade, proteções, venda automática/manual, parcial e erro');
})().catch(e => { console.error(e); process.exit(1); });
