// Venda automática de Pokémon fora do time (v3.11.0). Rodar: node test/pokesell.test.js
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
    P({ id: 'c40', name: 'Rattata', ivTotal: 40, quality: 1.0 }),        // Common 40  -> faixa baixa
    P({ id: 'r120', name: 'Abra', ivTotal: 120, quality: 1.3 }),         // Rare 120   -> faixa baixa
    P({ id: 'e99', name: 'Gastly', ivTotal: 99, quality: 1.5 }),         // Epic 99    -> faixa baixa
    P({ id: 'l90', name: 'Dratini', ivTotal: 90, quality: 1.7 }),        // Legendary 90 -> faixa alta
    P({ id: 'm170', name: 'Larvitar', ivTotal: 170, quality: 2.0 }),     // Mythic 170 -> faixa alta
];
const okApi = (sold) => (url, opts) => { const ids = JSON.parse(opts.body).pokeIds; return Promise.resolve({ gold: 9000, goldGained: 100 * (sold ?? ids.length), sold: sold ?? ids.length }); };
const flush = () => new Promise(r => setTimeout(r, 5));

(async () => {
    // 1) regras: abaixo de Legendary vende se poder < 100; Legendary e acima vende se poder < 100
    {
        const cfg = { pokeSellEnabled: true, pokeSellTier: 'legendary', pokeSellIvLow: 100, pokeSellIvHigh: 100 };
        const { api } = loadPokeSellModule(cfg, { api: okApi() });
        const motivos = Object.fromEntries(LISTA.map(p => [p.id, api.pokeSellReason(p, cfg)]));
        assert(motivos.lider === 'no time' && motivos.time2 === 'no time', 'time protegido');
        assert(motivos.starter === 'inicial' && motivos.shiny === 'shiny' && motivos.locked === 'cadeado' && motivos.semvalor === 'sem valor' && motivos.semiv === 'sem IV', 'proteções fixas: ' + JSON.stringify(motivos));
        assert(motivos.c40 === null && motivos.e99 === null, 'faixa baixa abaixo de 100 vende');
        assert(/poder 120/.test(motivos.r120), 'Rare 120 fica');
        assert(motivos.l90 === null && /poder 170/.test(motivos.m170), 'faixa alta: 90 vende, 170 fica');
        assert(api.pokeSellCandidates(cfg, LISTA).map(p => p.id).join(',') === 'c40,e99,l90', 'candidatos');
    }

    // 2) limites 0 desligam a faixa; a fronteira muda com pokeSellTier
    {
        const { api } = loadPokeSellModule({}, { api: okApi() });
        assert(api.pokeSellCandidates({ pokeSellTier: 'legendary', pokeSellIvLow: 100, pokeSellIvHigh: 0 }, LISTA).map(p => p.id).join(',') === 'c40,e99', 'faixa alta com 0 não vende');
        assert(api.pokeSellCandidates({ pokeSellTier: 'legendary', pokeSellIvLow: 0, pokeSellIvHigh: 100 }, LISTA).map(p => p.id).join(',') === 'l90', 'faixa baixa com 0 não vende');
        assert(api.pokeSellCandidates({ pokeSellTier: 'epic', pokeSellIvLow: 100, pokeSellIvHigh: 100 }, LISTA).map(p => p.id).join(',') === 'c40,e99,l90', 'fronteira Epic: Epic 99 vai para a faixa alta (e vende por < 100)');
        assert(api.pokeSellCandidates({ pokeSellTier: 'epic', pokeSellIvLow: 100, pokeSellIvHigh: 0 }, LISTA).map(p => p.id).join(',') === 'c40', 'fronteira Epic: só Common/Rare na faixa baixa');
        assert(api.pokeSellBoundary({ pokeSellTier: 'xyz' }).key === 'legendary', 'raridade inválida cai em Legendary');
    }

    // 3) frame pokes com a venda ligada: vende os candidatos, avisa, respeita o intervalo mínimo
    {
        const cfg = { pokeSellEnabled: true, pokeSellTier: 'legendary', pokeSellIvLow: 100, pokeSellIvHigh: 100 };
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
        const cfg = { pokeSellEnabled: false, pokeSellTier: 'legendary', pokeSellIvLow: 100, pokeSellIvHigh: 0 };
        const { api, state } = loadPokeSellModule(cfg, { api: okApi() });
        api.pokeSellOnPokes(LISTA);
        await flush();
        assert(state.calls.length === 0 && api.lastPokesList.length === LISTA.length, 'desligada não vende');
        const r = await api.runPokeSellCycle(true);
        assert(r.ok && r.vendidos === 2 && state.calls[0].body.pokeIds.join(',') === 'c40,e99', 'manual vende');
    }

    // 5) captura recente protegida; captura aguardando detalhes adia a venda
    {
        const cfg = { pokeSellEnabled: true, pokeSellTier: 'legendary', pokeSellIvLow: 100, pokeSellIvHigh: 100 };
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
        const cfg = { pokeSellEnabled: true, pokeSellTier: 'legendary', pokeSellIvLow: 100, pokeSellIvHigh: 100 };
        const { api, state } = loadPokeSellModule(cfg, { api: okApi(1) });
        api.pokeSellOnPokes(LISTA);
        await flush();
        assert(state.hooks.length === 1 && /venda parcial/.test(state.hooks[0].content) && /só parte do lote/.test(state.hooks[0].desc), 'parcial avisa: ' + state.hooks[0].content);
        const { api: b, state: sb } = loadPokeSellModule(cfg, { api: () => Promise.reject(new Error('HTTP 500')) });
        b.pokeSellOnPokes(LISTA);
        await flush();
        assert(sb.hooks.length === 1 && /falhou/.test(sb.hooks[0].content) && /HTTP 500/.test(sb.hooks[0].desc), 'erro avisa: ' + sb.hooks[0].desc);
    }

    console.log('OK pokesell.test — regras por faixa, proteções, venda automática/manual, parcial e erro');
})().catch(e => { console.error(e); process.exit(1); });
