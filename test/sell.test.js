// Venda automática de drops (v3.54.0): drops comuns no Mark, pedras de evolução no Stone Researcher (Shopping). Rodar: node test/sell.test.js
const { loadSellModule, assert } = require('./harness');

const ITEMS = [
    { id: 16, name: 'Bug Wing', category: 'loot', npcPrice: 30 },
    { id: 23, name: 'Cocoon Stone', category: 'stone', rare: true, npcPrice: 5000 },
    { id: 40, name: 'Earth Stone', category: 'stone', rare: true, npcPrice: 5000 },
    { id: 44417, name: 'Strange Pheromone', category: 'misc', npcPrice: 10 },
];
const INVENTORY = () => [
    { id: 16, name: 'Bug Wing', quantity: 100, npcPrice: 30, category: 'loot' },
    { id: 23, name: 'Cocoon Stone', quantity: 50, npcPrice: 5000, category: 'stone' },
    { id: 40, name: 'Earth Stone', quantity: 7, npcPrice: 5000, category: 'stone' },
];
const base = (items) => ({ sellEnabled: true, sellItems: items, sellProfiles: {} });
const kill = (api) => api.handleFieldKill({ loot: [{ itemId: 16, name: 'Bug Wing', qty: 2 }, { itemId: 23, name: 'Cocoon Stone', qty: 1 }, { itemId: 40, name: 'Earth Stone', qty: 1 }] });

function apiFor(opts) {
    opts = opts || {};
    return (url, o) => {
        if (url === '/api/game/depot') return { inventory: opts.inventory || INVENTORY() };
        if (url === '/api/game/item/lock') return { locked: opts.locked || [] };
        if (url === '/api/game/shop/sell') return { ok: true, soldCount: 100, goldGained: 3000, gold: 1003000 };
        if (url === '/api/game/flint') return { gold: 1003000, gemQty: 0, stones: opts.stones || [{ id: 23, name: 'Cocoon Stone', icon: 'cocoon_stone.gif', quantity: 50, unitPrice: 5000 }, { id: 40, name: 'Earth Stone', icon: 'earth_stone.gif', quantity: 7, unitPrice: 5000 }], catalog: [] };
        if (url === '/api/game/flint/sell') { const b = JSON.parse(o.body); return { sold: b.qty, item: ITEMS.find(i => i.id === b.itemId).name, goldGained: b.qty * 5000 }; }
        throw new Error('url inesperada ' + url);
    };
}

(async () => {
    // 1) lista: pedra é aviso (vai para o Stone Researcher), não bloqueio; preço 0 segue protegido
    {
        const { api } = loadSellModule(base({}), { items: ITEMS });
        assert(api.isStoneItem(ITEMS[1]) && !api.isStoneItem(ITEMS[0]) && !api.isStoneItem(null), 'isStoneItem pela categoria');
        assert(api.protectedReason(ITEMS[1]) === null, 'pedra pode ser marcada');
        assert(/Stone Researcher/.test(api.sellWarning(ITEMS[1])), 'aviso da pedra diz onde vende: ' + api.sellWarning(ITEMS[1]));
        assert(api.sellWarning(ITEMS[0]) === null && /categoria misc/.test(api.sellWarning(ITEMS[3])), 'drop comum sem aviso; outra categoria avisa');
        assert(api.protectedReason({ id: 9, name: 'X', npcPrice: 0 }) === 'NPC não compra', 'preço 0 protegido');
    }

    // 2) viagem a Cerulean: drops no Mark, pedras no Stone Researcher (set-city shopping antes, um POST por pedra, inv-get depois)
    {
        const { api, state } = loadSellModule(base({ 16: { keep: 0 }, 23: { keep: 0 }, 40: { keep: 2 } }), { items: ITEMS, api: apiFor() });
        api.setHunt('ancient_pinsir'); kill(api);
        assert(JSON.stringify(api.sellWantedNow()) === JSON.stringify([16, 23, 40]), 'marcados que caíram na hunt');
        const r = await api.runSellCycle(true, api.sellWantedNow(), 'ancient_pinsir');
        const mark = state.calls.find(c => c.url === '/api/game/shop/sell');
        assert(mark && JSON.stringify(mark.body) === JSON.stringify({ items: [{ itemId: 16, qty: 100 }] }), 'Mark recebe só os drops comuns: ' + JSON.stringify(mark && mark.body));
        const flint = state.calls.filter(c => c.url === '/api/game/flint/sell').map(c => c.body);
        assert(JSON.stringify(flint) === JSON.stringify([{ itemId: 23, qty: 50 }, { itemId: 40, qty: 5 }]), 'um POST por pedra, respeitando a reserva: ' + JSON.stringify(flint));
        const iMark = state.calls.findIndex(c => c.url === '/api/game/shop/sell'), iFlint = state.calls.findIndex(c => c.url === '/api/game/flint');
        assert(iMark < iFlint, 'Mark antes do Stone Researcher');
        assert(state.sent.some(m => m.type === 'set-city' && m.slug === 'shopping'), 'foi para Shopping antes de vender as pedras');
        assert(state.sent.some(m => m.type === 'inv-get'), 'relê a mochila depois');
        assert(r.ok && r.total === 155 && r.ganho === 3000 + 55 * 5000, 'total e ganho somam as duas lojas: ' + JSON.stringify(r));
        assert(state.logs.some(([k]) => k === 'venda') && state.logs.some(([k]) => k === 'venda-pedras') && state.logs.some(([k]) => k === 'venda-pedras-campos') && state.logs.some(([k]) => k === 'venda-pedras-cidade'), 'logs das duas vendas: ' + state.logs.map(l => l[0]).join(','));
        const vp = state.logs.find(([k]) => k === 'venda-pedras')[1];
        assert(vp.ganho === 275000 && vp.itens.length === 2 && vp.faltou.length === 0, 'log venda-pedras: ' + JSON.stringify(vp));
        assert(state.hooks.length === 1 && /155 itens/.test(state.hooks[0].content) && /278\.000 gold/.test(state.hooks[0].content) && /Stone Researcher/.test(state.hooks[0].desc) && state.hooks[0].color === 0x57f287, 'um aviso só, com as duas lojas: ' + JSON.stringify(state.hooks[0]));
    }

    // 3) só pedras marcadas: nada vai ao Mark; viagem já em Shopping não manda set-city
    {
        const { api, state } = loadSellModule(base({ 23: { keep: 0 } }), { items: ITEMS, api: apiFor(), city: 'shopping' });
        api.setHunt('ancient_pinsir'); kill(api);
        const r = await api.runSellCycle(true, [23], 'ancient_pinsir');
        assert(!state.calls.some(c => c.url === '/api/game/shop/sell'), 'Mark não é chamado sem drop comum');
        assert(!state.sent.some(m => m.type === 'set-city'), 'já em Shopping: sem set-city');
        assert(r.ok && r.total === 50 && r.ganho === 250000, 'só pedras: ' + JSON.stringify(r));
        assert(!state.logs.some(([k]) => k === 'venda'), 'sem log venda do Mark');
    }

    // 4) pedra marcada que o NPC não lista (ou já saiu da mochila): avisa, o resto vende; erro no NPC não derruba a venda do Mark
    {
        const { api, state } = loadSellModule(base({ 16: { keep: 0 }, 23: { keep: 0 }, 40: { keep: 0 } }), { items: ITEMS, api: apiFor({ stones: [{ id: 23, name: 'Cocoon Stone', quantity: 50, unitPrice: 5000 }] }) });
        api.setHunt('ancient_pinsir'); kill(api);
        const r = await api.runSellCycle(true, [16, 23, 40], 'ancient_pinsir');
        assert(!r.ok && /Earth Stone/.test(r.motivo) && r.total === 150, 'Earth Stone faltou, o resto vendeu: ' + JSON.stringify(r));
        assert(state.hooks[0].color === 0xfee75c && /⚠ .*Earth Stone/.test(state.hooks[0].desc), 'aviso amarelo com a pedra que faltou');
    }
    {
        const boom = apiFor();
        const { api, state } = loadSellModule(base({ 16: { keep: 0 }, 23: { keep: 0 } }), { items: ITEMS, api: (url, o) => { if (url === '/api/game/flint') throw new Error('HTTP 500'); return boom(url, o); } });
        api.setHunt('ancient_pinsir'); kill(api);
        const r = await api.runSellCycle(true, [16, 23], 'ancient_pinsir');
        assert(!r.ok && r.total === 100 && r.ganho === 3000 && /HTTP 500/.test(r.motivo), 'Mark vendeu, Stone Researcher falhou: ' + JSON.stringify(r));
        assert(state.logs.some(([k]) => k === 'venda-pedras-erro') && !state.logs.some(([k]) => k === 'venda-erro'), 'erro das pedras tem log próprio');
    }

    // 5) cadeado e reserva valem para a pedra também; nada acima da reserva = venda-nada
    {
        const { api, state } = loadSellModule(base({ 23: { keep: 0 }, 40: { keep: 10 } }), { items: ITEMS, api: apiFor({ locked: [23] }) });
        api.setHunt('ancient_pinsir'); kill(api);
        const r = await api.runSellCycle(true, [23, 40], 'ancient_pinsir');
        assert(!r.ok && r.motivo === 'nada acima da reserva para vender' && state.logs.some(([k]) => k === 'venda-nada'), 'travada e abaixo da reserva: ' + JSON.stringify(r));
        assert(!state.calls.some(c => c.url === '/api/game/flint'), 'não vai ao Stone Researcher à toa');
    }

    console.log('sell.test.js: ok');
})().catch(err => { console.error(err); process.exit(1); });
