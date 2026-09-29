// Refil de poções e revives (v3.21.0). Rodar: node test/supply.test.js
const { loadSupplyModule, assert } = require('./harness');

(async () => {
    // 1) desligado: não pede mochila, não pede viagem
    {
        const { api, state } = loadSupplyModule({ healBuy: false, reviveBuy: false });
        api.requestSupplies();
        api.supplyOnInventory([{ itemId: 201, quantity: 0 }]);
        assert(!api.supplyOn() && state.sent.length === 0 && state.trips.length === 0, 'desligado não faz nada');
    }

    // 2) antes do 1º frame `inventory` nada é decidido; depois, item ausente = 0 e pede viagem UMA vez por episódio
    {
        const { api, state } = loadSupplyModule({ healBuy: true, healItemId: 202, healMin: 50, healQty: 200, reviveBuy: true, reviveItemId: 205, reviveMin: 0, reviveQty: 20 });
        api.checkSupplyStock();
        assert(state.trips.length === 0 && api.supplyQty(202) === null, 'sem frame: nada decidido');
        api.supplyOnInventory([{ itemId: 202, quantity: 80 }, { itemId: 205, quantity: 3 }]);
        assert(state.trips.length === 0 && api.supplyLow().length === 0, 'acima do limite (revive com limite 0 vira 1): não viaja');
        api.supplyOnInventory([{ itemId: 202, quantity: 49 }]);
        assert(state.trips.length === 1 && state.trips[0].key === 'suprimentos', 'poção abaixo e revive zerado: pede viagem');
        assert(/Ultra Potion com 49/.test(state.trips[0].motivo) && /Revive com 0/.test(state.trips[0].motivo), 'motivo: ' + state.trips[0].motivo);
        assert(api.supplyLow().map(s => s.key).join() === 'heal,revive', 'os dois aparecem em supplyLow (carona)');
        api.supplyOnInventory([{ itemId: 202, quantity: 40 }]);
        assert(state.trips.length === 1, 'mesmo episódio: não repete o pedido');
        api.supplyOnInventory([{ itemId: 202, quantity: 250 }, { itemId: 205, quantity: 20 }]);
        api.supplyOnInventory([{ itemId: 202, quantity: 10 }, { itemId: 205, quantity: 20 }]);
        assert(state.trips.length === 2 && !/Revive/.test(state.trips[1].motivo), 'repôs e caiu de novo: pede de novo (só a poção)');
    }

    // 3) na cidade: confere pela REST e compra só o que está abaixo; aviso no canal de alertas
    {
        const { api, state } = loadSupplyModule({ healBuy: true, healItemId: 201, healMin: 50, healQty: 200, reviveBuy: true, reviveItemId: 206, reviveMin: 5, reviveQty: 10 }, {
            api: (url) => (url === '/api/game/depot' ? { inventory: [{ id: 201, name: 'Great Potion', quantity: 12 }, { id: 206, name: 'Max Revive', quantity: 9 }] } : {}),
            buy: (kind, id, qty) => ({ ok: true, bought: qty, spent: qty * 10, gold: 7000, name: 'Great Potion' }),
        });
        const r = await api.supplyCityWork();
        assert(r.ok && state.buys.length === 1 && state.buys[0].kind === 'item' && state.buys[0].id === 201 && state.buys[0].qty === 200, 'comprou só a poção: ' + JSON.stringify(state.buys));
        assert(state.hooks.length === 1 && state.hooks[0].kind === 'alert' && /repôs \*\*200 Great Potion\*\*/.test(state.hooks[0].content), 'aviso: ' + (state.hooks[0] || {}).content);
        assert(state.sent.some(m => m.type === 'inv-get'), 'relê a mochila depois');
        assert(state.logs.some(([k, d]) => k === 'refil' && d.pelaRest), 'log refil');
    }

    // 4) estoque já reposto (ex.: comprou na mão): não compra nem avisa
    {
        const { api, state } = loadSupplyModule({ healBuy: true, healItemId: 201, healMin: 50, healQty: 200 }, {
            api: () => ({ inventory: [{ id: 201, quantity: 300 }] }),
        });
        const r = await api.supplyCityWork();
        assert(r.ok && r.motivo === 'estoque ok' && state.buys.length === 0 && state.hooks.length === 0, 'estoque ok não compra');
    }

    // 5) sem gold: falha avisada, tarefa não-ok; REST fora do ar usa o último frame
    {
        const { api, state } = loadSupplyModule({ reviveBuy: true, reviveItemId: 205, reviveMin: 10, reviveQty: 50 }, {
            api: () => { throw new Error('HTTP 500'); },
            buy: () => ({ ok: false, bought: 0, spent: 0, gold: 100, motivo: 'gold insuficiente' }),
        });
        api.supplyOnInventory([{ itemId: 205, quantity: 2 }]);
        const r = await api.supplyCityWork();
        assert(!r.ok && /gold insuficiente/.test(r.motivo), 'falha: ' + r.motivo);
        assert(state.hooks.length === 1 && /compra falhou/.test(state.hooks[0].content) && /falhou \(tinha 2, limite 10\)/.test(state.hooks[0].desc), 'aviso de falha: ' + JSON.stringify(state.hooks[0]));
        assert(state.logs.some(([k]) => k === 'refil-mochila-erro'), 'loga o erro da REST');
    }

    console.log('supply.test.js: ok');
})().catch(err => { console.error(err); process.exit(1); });
