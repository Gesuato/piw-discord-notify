// Mercado Global (v3.53.0): comprar um item quando alguém anuncia por até X gold. Rodar: node test/market.test.js
const { loadMarketModule, assert } = require('./harness');

const ITEMS = [
    { id: 300, name: 'Rare Candy', category: 'misc', npcPrice: 100 },
    { id: 301, name: 'Fire Stone', category: 'stone', npcPrice: 1000 },
    { id: 59195, name: 'Rare Pokémon Picture', category: 'misc', npcPrice: 0 },
];
const base = () => ({ marketEnabled: true, marketEveryMin: 3, marketKeepGold: 0, mentionUserId: '', marketList: [{ item: 'Rare Candy', qty: 100, max: 5000, got: 0 }] });

(async () => {
    // 1) linhas do painel: quantidade item até preço (5.000 / 5k / 1,5m / <= / x); inválidas; got conservado por item+preço
    {
        const { api } = loadMarketModule(base(), { items: ITEMS });
        assert(JSON.stringify(api.parseMarketLine('100 Rare Candy até 5000')) === JSON.stringify({ item: 'Rare Candy', qty: 100, max: 5000 }), 'linha simples');
        assert(api.parseMarketLine('50x Ultra Ball <= 1.200').max === 1200 && api.parseMarketLine('50x Ultra Ball <= 1.200').item === 'Ultra Ball', 'x e ponto de milhar');
        assert(api.parseMarketLine('10 Fire Stone ate 50k gold').max === 50000, 'k + gold');
        assert(api.parseMarketLine('3 Water Stone até 1,5m').max === 1500000 && api.parseMarketLine('2 Thunder Stone até 1.5k').max === 1500, 'vírgula/ponto decimal com sufixo');
        assert(api.parseMarketLine('abc') === null && api.parseMarketLine('100 Rare Candy') === null && api.parseMarketLine('0 Rare Candy até 10') === null && api.parseMarketLine('5 Rare Candy até 0') === null, 'inválidas');
        assert(api.marketParsePrice('5,000') === 5000 && api.marketParsePrice('5.000') === 5000, 'milhar');
        const { list, ruins } = api.parseMarketText('100 Rare Candy até 5000\nabc\n\n5 Ultra Ball até 2k\n100 Rare Candy até 5000', [{ item: 'rare candy', qty: 50, max: 5000, got: 30 }]);
        assert(list.length === 3 && ruins.length === 1 && list[0].got === 30 && list[2].got === 0 && list[1].item === 'Ultra Ball', 'parseMarketText: got pelo item+preço, repetida não herda: ' + JSON.stringify(list));
        assert(api.marketLineText(list[1]) === '5 Ultra Ball até 2000', 'texto de volta');
    }

    // 2) desligado ou sem pedido: o tique não lê nada; resolver nomes (item do catálogo e bola) e proteção da venda
    {
        const cfg = base(); cfg.marketEnabled = false;
        const { api, state } = loadMarketModule(cfg, { items: ITEMS });
        api.marketTick();
        assert(!api.marketOn() && state.calls.length === 0, 'desligado não lê');
        assert(api.marketKeepsItem(300) === false, 'desligado não protege');
        cfg.marketEnabled = true;
        assert(api.marketKeepsItem(300) && !api.marketKeepsItem(301), 'ligado protege o item da lista');
        const r = api.marketResolve({ item: 'ultra ball' });
        assert(r && r.kind === 'ball' && r.refId === 4, 'bola pelo nome: ' + JSON.stringify(r));
        assert(api.marketResolve({ item: 'Rare pokemon picture' }).refId === 59195, 'sem acento resolve');
        assert(api.marketResolve({ item: 'Coisa Inexistente' }) === null, 'desconhecido');
        cfg.marketList = [];
        api.marketTick();
        assert(state.calls.length === 0 && !api.marketOn(), 'lista vazia não lê');
    }

    // 3) leitura: compra o mais barato dentro do preço, pula diamonds e acima do preço, completa com o próximo anúncio; aviso + got salvo
    {
        const cfg = base();
        const listings = [
            { id: 'L1', kind: 'item', refId: 300, name: 'Rare Candy', price: 6000, currency: 'GOLD', quantity: 500 },
            { id: 'L2', kind: 'item', refId: 300, name: 'Rare Candy', price: 4500, currency: 'GOLD', quantity: 100, ids: ['L2', 'L2b'] },
            { id: 'L3', kind: 'item', refId: 300, name: 'Rare Candy', price: 4000, currency: 'GOLD', quantity: 30 },
            { id: 'L4', kind: 'item', refId: 300, name: 'Rare Candy', price: 1, currency: 'DIAMONDS', quantity: 10 },
            { id: 'L5', kind: 'item', refId: 301, name: 'Fire Stone', price: 10, currency: 'GOLD', quantity: 10 },
            { id: 'L6', kind: 'pokemon', refId: 300, name: 'Pikachu', price: 10, currency: 'GOLD', quantity: 1 },
        ];
        const { api, state } = loadMarketModule(cfg, { items: ITEMS, api: (url) => (url.startsWith('/api/game/market?') ? { listings, mine: [], gold: 1000000 } : { ok: true }) });
        api.marketTick();
        await new Promise(r => setImmediate(r)); await new Promise(r => setImmediate(r));
        const posts = state.calls.filter(c => c.url === '/api/game/market/action');
        assert(posts.length === 2, 'dois anúncios comprados: ' + JSON.stringify(posts.map(p => p.body)));
        assert(posts[0].body.action === 'buy-stack' && posts[0].body.price === 4000 && posts[0].body.quantity === 30 && JSON.stringify(posts[0].body.ids) === '["L3"]' && posts[0].body.kind === 'item' && posts[0].body.refId === 300 && posts[0].body.currency === 'GOLD', '1º: o mais barato inteiro: ' + JSON.stringify(posts[0].body));
        assert(posts[1].body.price === 4500 && posts[1].body.quantity === 70 && JSON.stringify(posts[1].body.ids) === '["L2","L2b"]', '2º: completa os 70 no próximo (ids agrupados): ' + JSON.stringify(posts[1].body));
        assert(cfg.marketList[0].got === 100 && api.marketEntryDone(cfg.marketList[0]) && state.saves === 1, 'got 100 salvo');
        assert(api.marketGold === 1000000 - 30 * 4000 - 70 * 4500, 'gold estimado descontado: ' + api.marketGold);
        assert(state.hooks.length === 1 && state.hooks[0].kind === 'alert' && /comprou no Mercado Global \*\*30 Rare Candy\*\* e \*\*70 Rare Candy\*\*/.test(state.hooks[0].content) && /pedido concluído/.test(state.hooks[0].desc), 'aviso: ' + state.hooks[0].content + ' | ' + state.hooks[0].desc);
        assert(state.logs.some(([k]) => k === 'mercado-campos') && state.logs.filter(([k]) => k === 'mercado-compra').length === 2 && state.logs.some(([k, d]) => k === 'mercado' && d.ofertas['rare candy|5000'].menor === 4000 && d.ofertas['rare candy|5000'].dentro === 130), 'logs: ' + JSON.stringify(state.logs.map(l => l[0])));
        assert(api.marketNextAt > Date.now() && api.marketNextAt <= Date.now() + 3 * 60 * 1000 + 50, 'próxima leitura no intervalo');
        state.calls.length = 0;
        api.marketTick();
        assert(state.calls.length === 0, 'pedido fechado: não lê mais');
        assert(/1 pedido\(s\) concluído\(s\)/.test(api.marketStatus(cfg)) && /lido às/.test(api.marketStatus(cfg)), 'status: ' + api.marketStatus(cfg));
    }

    // 4) reserva de gold (gold vem do frame `balls`), próprio anúncio nunca, anúncio parcialmente meu, compra só até a reserva
    {
        const cfg = base(); cfg.marketKeepGold = 50000;
        const listings = [
            { id: 'M1', kind: 'item', refId: 300, name: 'Rare Candy', price: 3000, currency: 'GOLD', quantity: 40 },
            { id: 'M2', kind: 'item', refId: 300, name: 'Rare Candy', price: 3500, currency: 'GOLD', quantity: 20, ids: ['M2', 'M2b'] },
            { id: 'M3', kind: 'item', refId: 300, name: 'Rare Candy', price: 4000, currency: 'GOLD', quantity: 10 },
        ];
        const { api, state } = loadMarketModule(cfg, { items: ITEMS, api: (url) => (url.startsWith('/api/game/market?') ? { listings, mine: [{ id: 'M1', quantity: 40 }, { id: 'M2b', quantity: 15 }] } : {}) });
        api.marketOnBalls({ type: 'balls', counts: {}, gold: 80000 });
        assert(api.marketGold === 80000, 'gold do frame balls');
        await api.marketScan('teste');
        const posts = state.calls.filter(c => c.url === '/api/game/market/action');
        // 80.000 − reserva 50.000 = 30.000 para gastar: 5 × 3.500 (o que não é meu do M2) = 17.500; sobram 12.500 = 3 × 4.000 do M3
        assert(posts.length === 2 && posts[0].body.price === 3500 && posts[0].body.quantity === 5 && posts[1].body.price === 4000 && posts[1].body.quantity === 3, 'pula o meu (M1), compra só o que não é meu do M2 (5) e do M3 só o que cabe na reserva (3): ' + JSON.stringify(posts.map(p => p.body)));
        assert(cfg.marketList[0].got === 8 && api.marketGold === 80000 - 5 * 3500 - 3 * 4000, 'got 8, gold 50.500: ' + api.marketGold);
        const of = api.marketLast.ofertas['rare candy|5000'];
        assert(of.total === 2 && of.menor === 3500 && of.dentro === 15, 'ofertas sem o meu anúncio: ' + JSON.stringify(of));
        // próxima leitura: gold 50.500 − reserva = 500 < 4.000 → nada cabe: marca "sem gold"
        state.calls.length = 0;
        await api.marketScan('teste');
        assert(state.calls.filter(c => c.url === '/api/game/market/action').length === 0 && api.marketLast.ofertas['rare candy|5000'].semGold === true && cfg.marketList[0].got === 8, 'na reserva: não compra e marca sem gold');
        assert(/reserva 50\.000/.test(api.marketStatus(cfg)), 'status mostra a reserva: ' + api.marketStatus(cfg));
    }

    // 5) 429 na lista: espera 10 min (o tique respeita); erro comum: só o intervalo; resposta ok:false não conta; bought parcial conta
    {
        const cfg = base();
        let fase = '429';
        const listings = [{ id: 'R1', kind: 'item', refId: 300, name: 'Rare Candy', price: 1000, currency: 'GOLD', quantity: 50 }];
        const { api, state, clock } = loadMarketModule(cfg, {
            items: ITEMS,
            api: (url) => {
                if (url.startsWith('/api/game/market?')) { if (fase === '429') throw new Error('HTTP 429'); if (fase === 'erro') throw new Error('Internal'); return { listings, mine: [] }; }
                return fase === 'recusa' ? { ok: false, message: 'Anúncio já vendido' } : fase === 'parcial' ? { ok: true, bought: 20, gold: 123456 } : { ok: true };
            },
        });
        await api.marketScan('teste');
        assert(api.marketNextAt >= clock.now + 10 * 60 * 1000 - 50 && state.logs.some(([k, d]) => k === 'mercado-erro' && d.limite === true), '429 = espera 10 min');
        state.calls.length = 0;
        api.marketTick();
        assert(state.calls.length === 0, 'tique respeita a espera');
        clock.now += 10 * 60 * 1000 + 1;
        fase = 'erro';
        api.marketTick();
        await new Promise(r => setImmediate(r)); await new Promise(r => setImmediate(r));
        assert(state.calls.length === 1 && api.marketNextAt <= clock.now + 3 * 60 * 1000 + 50 && /Internal/.test(api.marketStatus(cfg)), 'erro comum: intervalo normal e status com o erro: ' + api.marketStatus(cfg));
        clock.now += 4 * 60 * 1000;
        fase = 'recusa';
        await api.marketScan('teste');
        assert(cfg.marketList[0].got === 0 && state.saves === 0 && state.hooks.length === 1 && /não conseguiu comprar/.test(state.hooks[0].content), 'ok:false não conta nem salva; avisa a falha: ' + (state.hooks[0] || {}).content);
        fase = 'parcial';
        await api.marketScan('teste');
        assert(cfg.marketList[0].got === 20 && api.marketGold === 123456 && state.saves === 1, 'bought 20 de 50 conta 20 e pega o gold da resposta: ' + JSON.stringify([cfg.marketList[0].got, api.marketGold]));
        assert(state.logs.some(([k, d]) => k === 'mercado-compra' && d.resposta && d.resposta.bought === 20 && d.resposta.chaves.includes('gold')), 'resposta resumida no log');
    }

    // 6) item fora do catálogo: não compra, motivo nas ofertas; bola compra como kind 'ball'; botão "Conferir agora" e "Zerar contagem"
    {
        const cfg = base(); cfg.marketEnabled = false;
        cfg.marketList = [{ item: 'Coisa Inexistente', qty: 5, max: 100, got: 0 }, { item: 'Ultra Ball', qty: 10, max: 900, got: 0 }];
        const listings = [{ id: 'B1', kind: 'ball', refId: 4, name: 'Ultra Ball', price: 800, currency: 'GOLD', quantity: 100 }, { id: 'B2', kind: 'item', refId: 4, name: 'Outra', price: 1, currency: 'GOLD', quantity: 100 }];
        const { api, state } = loadMarketModule(cfg, { items: ITEMS, api: (url) => (url.startsWith('/api/game/market?') ? { listings, mine: [] } : { ok: true }) });
        api.marketTick();
        assert(state.calls.length === 0, 'desligado: o tique não lê');
        const r = await api.marketNow();
        assert(r.ok && /comprou 10 Ultra Ball a 800/.test(r.msg), 'botão lê mesmo desligado: ' + r.msg);
        const posts = state.calls.filter(c => c.url === '/api/game/market/action');
        assert(posts.length === 1 && posts[0].body.kind === 'ball' && posts[0].body.refId === 4 && posts[0].body.quantity === 10, 'bola comprada como ball (não confunde com item refId 4): ' + JSON.stringify(posts.map(p => p.body)));
        assert(/catálogo/.test(api.marketLast.ofertas['coisa inexistente|100'].erro), 'motivo do item desconhecido');
        const r2 = await api.marketNow();
        assert(r2.ok && /nada a comprar/.test(r2.msg), 'segunda vez: só o desconhecido pendente, nada a comprar: ' + r2.msg);
        api.marketReset();
        assert(cfg.marketList[1].got === 0 && api.marketPending().length === 2 && state.logs.some(([k]) => k === 'mercado-zerado'), 'zerar contagem');
    }

    // 7) sem catálogo carregado: só bolas resolvem; o scan tenta carregar antes (loadItemsCatalog) — aqui continua null
    {
        const cfg = base(); cfg.marketList = [{ item: 'Rare Candy', qty: 1, max: 10, got: 0 }, { item: 'Great Ball', qty: 2, max: 500, got: 0 }];
        const { api, state } = loadMarketModule(cfg, { items: null, api: (url) => (url.startsWith('/api/game/market?') ? { listings: [{ id: 'G', kind: 'ball', refId: 2, name: 'Great Ball', price: 400, currency: 'GOLD', quantity: 9 }], mine: [] } : { ok: true }) });
        assert(api.marketResolve({ item: 'Rare Candy' }) === null && api.marketResolve({ item: 'Great Ball' }).kind === 'ball', 'sem catálogo');
        await api.marketScan('teste');
        const posts = state.calls.filter(c => c.url === '/api/game/market/action');
        assert(posts.length === 1 && posts[0].body.refId === 2 && posts[0].body.quantity === 2 && cfg.marketList[1].got === 2, 'comprou a bola: ' + JSON.stringify(posts.map(p => p.body)));
    }

    console.log('market.test.js OK');
})().catch(e => { console.error(e); process.exit(1); });
