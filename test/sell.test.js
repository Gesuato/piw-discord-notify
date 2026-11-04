// Venda automática de drops (v3.55.0: a mochila inteira — regra "todo drop comum" + marcados + exceções; v3.54.0: drops comuns no
// Mark, pedras de evolução no Stone Researcher). Rodar: node test/sell.test.js
const fs = require('fs');
const path = require('path');
const { loadSellModule, assert } = require('./harness');

const ITEMS = [
    { id: 16, name: 'Bug Wing', category: 'loot', npcPrice: 30 },
    { id: 23, name: 'Cocoon Stone', category: 'stone', rare: true, npcPrice: 5000 },
    { id: 40, name: 'Earth Stone', category: 'stone', rare: true, npcPrice: 5000 },
    { id: 44417, name: 'Strange Pheromone', category: 'loot', npcPrice: 1000000 },   // loot NÃO raro a 1.000.000: a regra nunca cobre
    { id: 97, name: 'Pinsir Horn', category: 'loot', rare: true, npcPrice: 500 },
    { id: 11560, name: 'Lizard Tail', category: 'loot', rare: null, npcPrice: 450 },
    { id: 2380, name: 'Ice Bra', category: 'loot', npcPrice: 1000 },
    { id: 14876, name: 'Data UFO', category: 'loot', npcPrice: 0 },
    { id: 13115, name: 'Devoted Token', category: 'loot', rare: true, npcPrice: 0 },
    { id: 201, name: 'Great Potion', category: 'heal', npcPrice: 10 },
    { id: 70000, name: 'Bronze Boss Token', category: 'loot', rare: true, npcPrice: 250000 },
];
const byId = (id) => ITEMS.find(i => i.id === id);
const INVENTORY = () => [
    { id: 16, name: 'Bug Wing', quantity: 100, npcPrice: 30, category: 'loot' },
    { id: 23, name: 'Cocoon Stone', quantity: 50, npcPrice: 5000, category: 'stone' },
    { id: 40, name: 'Earth Stone', quantity: 7, npcPrice: 5000, category: 'stone' },
    { id: 44417, name: 'Strange Pheromone', quantity: 2, npcPrice: 1000000, category: 'loot' },
    { id: 11560, name: 'Lizard Tail', quantity: 10, npcPrice: 450, category: 'loot' },
    { id: 97, name: 'Pinsir Horn', quantity: 3, npcPrice: 500, category: 'loot' },
    { id: 2380, name: 'Ice Bra', quantity: 4, npcPrice: 1000, category: 'loot' },
];
// cfg no formato novo: `rule` liga a regra (padrão do script: ligada), `items` = marcados na mão, `never` = exceções.
const base = (items, extra) => Object.assign({ sellEnabled: true, sellRule: false, sellRuleMaxPrice: 500, sellItems: items || {}, sellNever: [] }, extra || {});
const bag = (api, list) => api.sellOnInventory(list.map(([itemId, quantity]) => ({ itemId, quantity })));

function apiFor(opts) {
    opts = opts || {};
    return (url, o) => {
        if (url === '/api/game/depot') return { inventory: opts.inventory || INVENTORY() };
        if (url === '/api/game/item/lock') return { locked: opts.locked || [] };
        if (url === '/api/game/shop/sell') { const b = JSON.parse(o.body); return { ok: true, soldCount: b.items.reduce((a, i) => a + i.qty, 0), goldGained: b.items.reduce((a, i) => a + i.qty * (byId(i.itemId)?.npcPrice || 0), 0), gold: 1003000 }; }
        if (url === '/api/game/flint') return { gold: 1003000, gemQty: 0, stones: opts.stones || [{ id: 23, name: 'Cocoon Stone', icon: 'cocoon_stone.gif', quantity: 50, unitPrice: 5000 }, { id: 40, name: 'Earth Stone', icon: 'earth_stone.gif', quantity: 7, unitPrice: 5000 }], catalog: [] };
        if (url === '/api/game/flint/sell') { const b = JSON.parse(o.body); return { sold: b.qty, item: byId(b.itemId).name, goldGained: b.qty * 5000 }; }
        throw new Error('url inesperada ' + url);
    };
}
// migrateCfg vive no bloco de configuração do script (fora dos módulos): recorta a função e a roda isolada.
function migrate(cfg) {
    const src = fs.readFileSync(path.join(__dirname, '..', 'piw-discord-notify.user.js'), 'utf8');
    const a = src.indexOf('    function migrateCfg(cfg) {'), b = src.indexOf('    function saveCfg(cfg) {');
    if (a < 0 || b < 0) throw new Error('migrateCfg não encontrada');
    return new Function(src.slice(a, b) + '\n return migrateCfg;')()(cfg);
}

(async () => {
    // 1) decisão por item: regra cobre só loot comum até o teto; raro, pedra, feromônio, preço 0, acima do teto e fora do catálogo não
    {
        const { api } = loadSellModule(base({}, { sellRule: true }), { items: ITEMS });
        await api.loadItemsCatalog();
        const d = base({}, { sellRule: true });
        assert(api.sellRuleCovers(byId(16), d) && api.sellRuleCovers(byId(11560), d), 'loot comum até 500 entra (rare null conta como não raro)');
        assert(!api.sellRuleCovers(byId(97), d) && !api.sellRuleCovers(byId(23), d), 'raro e pedra não entram pela regra');
        assert(!api.sellRuleCovers(byId(44417), d) && !api.sellRuleCovers(byId(14876), d) && !api.sellRuleCovers(byId(201), d) && !api.sellRuleCovers(null, d), 'feromônio, preço 0, outra categoria e fora do catálogo não entram');
        assert(!api.sellRuleCovers(byId(2380), d) && api.sellRuleCovers(byId(2380), base({}, { sellRule: true, sellRuleMaxPrice: 0 })) && api.sellRuleCovers(byId(2380), base({}, { sellRule: true, sellRuleMaxPrice: 1000 })), 'teto: 1000 fica fora de 500, entra com 0 (sem teto) e com 1000');
        assert(api.sellRuleMaxPrice({}) === 500 && api.sellRuleMaxPrice({ sellRuleMaxPrice: 'x' }) === 500 && api.sellRuleMaxPrice({ sellRuleMaxPrice: 0 }) === 0, 'teto padrão 500; 0 = sem teto');
        let r = api.sellDecision(16, byId(16), d);
        assert(r.sells && r.tag === 'regra' && r.keep === 0, 'Bug Wing vende pela regra: ' + JSON.stringify(r));
        r = api.sellDecision(16, byId(16), base({}, { sellRule: true, sellNever: [16] }));
        assert(!r.sells && r.tag === 'exceção' && !r.locked, 'exceção: a regra cobriria, o usuário tirou: ' + JSON.stringify(r));
        r = api.sellDecision(97, byId(97), base({ 97: { keep: 2 } }, { sellRule: true }));
        assert(r.sells && r.tag === 'marcado' && r.keep === 2, 'raro marcado na mão vende, com a reserva: ' + JSON.stringify(r));
        r = api.sellDecision(97, byId(97), d);
        assert(!r.sells && r.tag === null && !r.locked, 'raro sem marcação não vende (nem é exceção)');
        r = api.sellDecision(16, byId(16), base({}, { sellRule: false }));
        assert(!r.sells && r.tag === null, 'regra desligada: só os marcados');
        r = api.sellDecision(14876, byId(14876), base({ 14876: { keep: 0 } }, { sellRule: true }));
        assert(!r.sells && r.locked && r.why === 'NPC não compra', 'preço 0 nunca, mesmo marcado: ' + JSON.stringify(r));
        assert(api.sellWouldSell(16, d, byId(16)) && !api.sellWouldSell(16, base({}, { sellRule: true, sellEnabled: false }), byId(16)), 'sellWouldSell respeita o liga/desliga');
    }
    // 1a) v3.55.1: trava FIXA — Strange Pheromone e Bronze Boss Token nunca vendem sozinhos, nem marcados, nem por lista de ids, nem pelo nome
    {
        const { api, state } = loadSellModule(base({ 44417: { keep: 0 }, 70000: { keep: 0 }, 16: { keep: 0 } }, { sellRule: true }), { items: ITEMS, api: apiFor({ inventory: INVENTORY().concat([{ id: 70000, name: 'Bronze Boss Token', quantity: 97, npcPrice: 250000, category: 'loot' }, { id: 99001, name: 'strange pheromone', quantity: 1, npcPrice: 5, category: 'loot' }, { id: 99002, name: 'Silver Boss Token', quantity: 1, npcPrice: 5, category: 'loot' }]) }) });
        for (const id of [44417, 70000]) { const r = api.sellDecision(id, byId(id)); assert(!r.sells && r.locked && /trava fixa/.test(r.why), `${byId(id).name} marcado continua travado: ` + JSON.stringify(r)); }
        assert(!api.sellDecision(99001, { id: 99001, name: 'strange pheromone', category: 'loot', npcPrice: 5 }).sells && !api.sellDecision(99002, { id: 99002, name: 'Silver Boss Token', category: 'loot', npcPrice: 5 }).sells, 'pelo nome também (id desconhecido, outra grafia)');
        assert(!api.sellWouldSell(70000, base({ 70000: { keep: 0 } }), byId(70000)), 'sellWouldSell respeita a trava');
        const r = await api.runSellCycle(true, [44417, 70000, 16, 99001, 99002], 'magmar');
        const mark = state.calls.find(c => c.url === '/api/game/shop/sell');
        assert(mark && JSON.stringify(mark.body.items) === JSON.stringify([{ itemId: 16, qty: 100 }]), 'na cidade, mesmo pedidos por id, só o Bug Wing vai ao Mark: ' + JSON.stringify(mark && mark.body));
        assert(r.ok && r.total === 100, 'resultado só com o Bug Wing: ' + JSON.stringify(r));
    }
    // 1b) família e módulos seguram o item acima de qualquer marcação
    {
        const { api } = loadSellModule(base({ 16: { keep: 0 }, 23: { keep: 0 } }, { sellRule: true }), { items: ITEMS, familyListEntry: (id) => (id === 23 ? { id: 23 } : null), clanKeepsItem: (id) => id === 16 });
        let r = api.sellDecision(23, byId(23));
        assert(!r.sells && r.locked && r.why === 'lista da família', 'lista da família vence a marcação: ' + JSON.stringify(r));
        r = api.sellDecision(16, byId(16));
        assert(!r.sells && r.locked && /clã/.test(r.why), 'tarefa do clã segura o item: ' + JSON.stringify(r));
        assert(api.sellHoldReason(11560, byId(11560)) === null, 'item livre: sem motivo');
    }

    // 2) migração: perfis por hunt viram UMA lista (união, maior reserva), regra nasce ligada, exceções vazias
    {
        const c = migrate({ sellItems: { 39: { keep: 0 }, 7: { keep: 3 } }, sellProfiles: { larvitar: { items: { 39: { keep: 0 }, 7: { keep: 3 } } }, geodude: { items: { 120: { keep: 10 }, 7: { keep: 9 } } }, omanyte: { items: { 7: { keep: 0 } } } } });
        assert(!('sellProfiles' in c), 'perfis apagados');
        assert(JSON.stringify(Object.entries(c.sellItems).sort()) === JSON.stringify([['120', { keep: 10 }], ['39', { keep: 0 }], ['7', { keep: 9 }]]), 'união com a maior reserva: ' + JSON.stringify(c.sellItems));
        assert(c.sellRule === true && Array.isArray(c.sellNever) && !c.sellNever.length, 'regra ligada e exceções vazias');
        const c2 = migrate({ sellItems: { 1: { keep: 0 } }, sellRule: false, sellNever: [5] });
        assert(c2.sellRule === false && JSON.stringify(c2.sellNever) === '[5]' && c2.sellItems[1], 'config nova passa intacta');
        const c3 = migrate({ sellItems: [], sellProfiles: null });
        assert(JSON.stringify(c3.sellItems) === '{}' && c3.sellRule === true, 'lixo vira lista vazia');
    }

    // 3) mochila: frame `inventory` alimenta a carga da viagem (regra + marcados − reserva); drops somam até o próximo frame; "novo"
    {
        const { api, state, clock, cfg } = loadSellModule(base({ 97: { keep: 1 }, 16: { keep: 150 } }, { sellRule: true, sellNever: [11560] }), { items: ITEMS, store: { pgDiscordNotifyBagSeen: '[16,97]' } });
        await api.loadItemsCatalog();
        assert(api.sellCandidates().length === 0 && !api.sellBagAt, 'sem frame: nada');
        bag(api, [[16, 100], [97, 3], [11560, 10], [2380, 4], [23, 5], [44417, 1], [9999, 2]]);
        const c = api.sellCandidates().map(x => `${x.itemId}:${x.qty}`).join(',');
        assert(c === '97:2', 'só Pinsir Horn (marcado, 3 − 1); Bug Wing abaixo da reserva, Lizard Tail exceção, Ice Bra acima do teto, pedra/feromônio/desconhecido fora: ' + c);
        assert(JSON.stringify([...api.sellBagNew].sort()) === JSON.stringify([11560, 23, 2380, 44417, 9999].sort()), 'novos = quem não estava em pgDiscordNotifyBagSeen: ' + [...api.sellBagNew]);
        assert(/9999/.test(state.store.pgDiscordNotifyBagSeen), 'ids vistos persistidos');
        api.handleFieldKill({ loot: [{ itemId: 16, name: 'Bug Wing', qty: 60 }, { itemId: 101, name: 'Poison Sting', qty: 1 }] });
        assert(api.sellBag.get(16) === 160 && api.sellBag.get(101) === 1 && api.sellBagNew.has(101), 'drop soma na mochila lida e id novo vira "novo"');
        assert(api.sellWantedNow().join(',') === '16,97', 'agora Bug Wing passa da reserva (160 − 150): ' + api.sellWantedNow());
        // relógio da mochila: pede inv-get só com a venda ligada e a mochila velha; intervalo mínimo entre pedidos
        state.sent.length = 0;
        api.sellBagTick();
        assert(state.sent.length === 0, 'mochila fresca: não pede');
        clock.now += 6 * 60 * 1000;
        api.sellBagTick();
        assert(state.sent.length === 1 && state.sent[0].type === 'inv-get', 'mochila velha (> 5 min): pede inv-get');
        assert(api.sellRequestBag(true) === false, 'pedido de novo dentro de 20 s: segurado');
        clock.now += 21 * 1000;
        assert(api.sellRequestBag(true) === true && state.sent.length === 2, 'passou o intervalo: pede');
        cfg.sellEnabled = false; clock.now += 10 * 60 * 1000;
        api.sellBagTick();
        assert(state.sent.length === 2, 'venda desligada: o relógio não pede');
    }

    // 4) viagem (sem lista congelada): a cidade decide pela mochila real — regra vende Bug Wing e Lizard Tail, marcado vende a Cocoon
    //    Stone (Stone Researcher), exceção/raro sem marcação/feromônio/acima do teto/cadeado ficam; mochila lida é corrigida na hora
    {
        const { api, state } = loadSellModule(base({ 23: { keep: 0 } }, { sellRule: true, sellNever: [2380] }), { items: ITEMS, api: apiFor({ locked: [97] }) });
        bag(api, [[16, 100], [23, 50], [11560, 10]]);
        api.setHunt('magmar');
        const r = await api.runSellCycle(true, null, 'magmar');
        const mark = state.calls.find(c => c.url === '/api/game/shop/sell');
        assert(mark && JSON.stringify(mark.body.items) === JSON.stringify([{ itemId: 16, qty: 100 }, { itemId: 11560, qty: 10 }]), 'Mark: Bug Wing e Lizard Tail pela regra; Strange Pheromone (feromônio), Ice Bra (exceção), Pinsir Horn (raro sem marcação, e travado) e Earth Stone (pedra sem marcação) ficam: ' + JSON.stringify(mark && mark.body));
        const flint = state.calls.filter(c => c.url === '/api/game/flint/sell').map(c => c.body);
        assert(JSON.stringify(flint) === JSON.stringify([{ itemId: 23, qty: 50 }]), 'só a Cocoon Stone marcada vai ao Stone Researcher: ' + JSON.stringify(flint));
        assert(r.ok && r.total === 160 && r.ganho === 100 * 30 + 10 * 450 + 50 * 5000, 'total/ganho: ' + JSON.stringify(r));
        assert(!api.sellBag.has(16) && !api.sellBag.has(23) && !api.sellBag.has(11560), 'mochila lida baixa o que vendeu: ' + JSON.stringify([...api.sellBag]));
        assert(state.sent.some(m => m.type === 'inv-get'), 'relê a mochila depois');
        assert(/magmar/.test(state.hooks[0].desc) || /magmar/.test(state.logs.find(l => l[0] === 'venda')[1].hunt), 'hunt no log/aviso');
    }
    // 4b) regra desligada e nada marcado = não vai ao jogo; lista de ids restringe (compatibilidade)
    {
        const { api, state } = loadSellModule(base({}, { sellRule: false }), { items: ITEMS, api: apiFor() });
        const r = await api.runSellCycle(true, null, 'magmar');
        assert(!r.ok && /regra está desligada/.test(r.motivo) && !state.calls.length, 'sem regra e sem marcados: nem lê o depot: ' + JSON.stringify(r));
        const { api: b, state: sb } = loadSellModule(base({ 16: { keep: 0 }, 11560: { keep: 0 } }, { sellRule: true }), { items: ITEMS, api: apiFor() });
        await b.runSellCycle(true, [16], 'magmar');
        const mark = sb.calls.find(c => c.url === '/api/game/shop/sell');
        assert(mark && JSON.stringify(mark.body.items) === JSON.stringify([{ itemId: 16, qty: 100 }]), 'lista de ids restringe ao que foi pedido: ' + JSON.stringify(mark && mark.body));
    }

    // 5) lista: pedra é aviso (vai para o Stone Researcher), não bloqueio; preço 0 segue protegido
    {
        const { api } = loadSellModule(base({}), { items: ITEMS });
        assert(api.isStoneItem(byId(23)) && !api.isStoneItem(byId(16)) && !api.isStoneItem(null), 'isStoneItem pela categoria');
        assert(api.protectedReason(byId(23)) === null, 'pedra pode ser marcada');
        assert(/Stone Researcher/.test(api.sellWarning(byId(23))), 'aviso da pedra diz onde vende: ' + api.sellWarning(byId(23)));
        assert(api.sellWarning(byId(16)) === null && /categoria heal/.test(api.sellWarning(byId(201))) && /raro/.test(api.sellWarning(byId(97))), 'drop comum sem aviso; outra categoria e raro avisam');
        assert(api.protectedReason({ id: 9, name: 'X', npcPrice: 0 }) === 'NPC não compra', 'preço 0 protegido');
    }

    // 6) viagem a Cerulean: drops no Mark, pedras no Stone Researcher (set-city shopping antes, um POST por pedra, inv-get depois)
    {
        const { api, state } = loadSellModule(base({ 16: { keep: 0 }, 23: { keep: 0 }, 40: { keep: 2 } }), { items: ITEMS, api: apiFor() });
        api.setHunt('ancient_pinsir');
        const r = await api.runSellCycle(true, [16, 23, 40], 'ancient_pinsir');
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

    // 7) só pedras marcadas: nada vai ao Mark; viagem já em Shopping não manda set-city
    {
        const { api, state } = loadSellModule(base({ 23: { keep: 0 } }), { items: ITEMS, api: apiFor(), city: 'shopping' });
        api.setHunt('ancient_pinsir');
        const r = await api.runSellCycle(true, [23], 'ancient_pinsir');
        assert(!state.calls.some(c => c.url === '/api/game/shop/sell'), 'Mark não é chamado sem drop comum');
        assert(!state.sent.some(m => m.type === 'set-city'), 'já em Shopping: sem set-city');
        assert(r.ok && r.total === 50 && r.ganho === 250000, 'só pedras: ' + JSON.stringify(r));
        assert(!state.logs.some(([k]) => k === 'venda'), 'sem log venda do Mark');
    }

    // 8) pedra marcada que o NPC não lista (ou já saiu da mochila): avisa, o resto vende; erro no NPC não derruba a venda do Mark
    {
        const { api, state } = loadSellModule(base({ 16: { keep: 0 }, 23: { keep: 0 }, 40: { keep: 0 } }), { items: ITEMS, api: apiFor({ stones: [{ id: 23, name: 'Cocoon Stone', quantity: 50, unitPrice: 5000 }] }) });
        api.setHunt('ancient_pinsir');
        const r = await api.runSellCycle(true, [16, 23, 40], 'ancient_pinsir');
        assert(!r.ok && /Earth Stone/.test(r.motivo) && r.total === 150, 'Earth Stone faltou, o resto vendeu: ' + JSON.stringify(r));
        assert(state.hooks[0].color === 0xfee75c && /⚠ .*Earth Stone/.test(state.hooks[0].desc), 'aviso amarelo com a pedra que faltou');
    }
    {
        const boom = apiFor();
        const { api, state } = loadSellModule(base({ 16: { keep: 0 }, 23: { keep: 0 } }), { items: ITEMS, api: (url, o) => { if (url === '/api/game/flint') throw new Error('HTTP 500'); return boom(url, o); } });
        api.setHunt('ancient_pinsir');
        const r = await api.runSellCycle(true, [16, 23], 'ancient_pinsir');
        assert(!r.ok && r.total === 100 && r.ganho === 3000 && /HTTP 500/.test(r.motivo), 'Mark vendeu, Stone Researcher falhou: ' + JSON.stringify(r));
        assert(state.logs.some(([k]) => k === 'venda-pedras-erro') && !state.logs.some(([k]) => k === 'venda-erro'), 'erro das pedras tem log próprio');
    }

    // 9) cadeado e reserva valem para a pedra também; nada acima da reserva = venda-nada
    {
        const { api, state } = loadSellModule(base({ 23: { keep: 0 }, 40: { keep: 10 } }), { items: ITEMS, api: apiFor({ locked: [23] }) });
        api.setHunt('ancient_pinsir');
        const r = await api.runSellCycle(true, [23, 40], 'ancient_pinsir');
        assert(!r.ok && r.motivo === 'nada acima da reserva para vender' && state.logs.some(([k]) => k === 'venda-nada'), 'travada e abaixo da reserva: ' + JSON.stringify(r));
        assert(!state.calls.some(c => c.url === '/api/game/flint'), 'não vai ao Stone Researcher à toa');
    }

    console.log('sell.test.js: ok');
})().catch(err => { console.error(err); process.exit(1); });
