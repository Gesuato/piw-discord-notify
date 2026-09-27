// Guardar na cidade (v3.18.0): drops que sobraram -> Depot/família; Pokémon não vendidos -> família. Rodar: node test/deposit.test.js
const { loadDepositModule, assert } = require('./harness');

const ITEMS = [
    { id: 120, name: 'Small Stone', category: 'loot' },
    { id: 7, name: 'Feather', category: 'loot' },
    { id: 8, name: 'Super Potion', category: 'heal' },
    { id: 9, name: 'Iron', category: 'misc' },
    { id: 10, name: 'Bottles of Poison', category: 'loot' },
];
// Mochila (GET /api/game/depot → inventory).
const BAG = [
    { id: 120, name: 'Small Stone', quantity: 450, category: 'loot' },
    { id: 7, name: 'Feather', quantity: 30, category: 'loot' },
    { id: 8, name: 'Super Potion', quantity: 10, category: 'heal' },
    { id: 9, name: 'Iron', quantity: 5, category: 'misc' },
    { id: 10, name: 'Bottles of Poison', quantity: 20, category: 'loot' },
];
const DROPS = JSON.stringify([120, 7, 8, 10]);                  // Iron nunca caiu em hunt
function depotApi(bag) {
    return (url, opts) => {
        if (url === '/api/game/depot') return Promise.resolve({ inventory: bag.slice(), depot: [] });
        if (url === '/api/game/depot/move') { const b = JSON.parse(opts.body); const i = bag.findIndex(x => x.id === b.itemId); if (i >= 0) bag.splice(i, 1); return Promise.resolve({ inventory: bag.slice(), depot: [] }); }
        return Promise.reject(new Error('url inesperada ' + url));
    };
}
// Lista `pokes`: só `guardado` deveria ir (os outros têm motivo para ficar).
const POKES = [
    { id: 'lider', name: 'Tyranitar', team: true, leader: true },
    { id: 'ini', name: 'Bulbasaur', starter: true },
    { id: 'sh', name: 'Pidgey', shiny: true, ivTotal: 90 },
    { id: 'lk', name: 'Onix', locked: true, ivTotal: 80 },
    { id: 'novo', name: 'Geodude', ivTotal: 20 },
    { id: 'venda', name: 'Rattata', ivTotal: 10 },
    { id: 'anun', name: 'Zubat', listed: true, ivTotal: 50 },
    { id: 'guardado', name: 'Larvitar', ivTotal: 150 },
];
const sellRule = (p) => (Number(p.ivTotal) < 30 ? null : 'poder alto');   // "vende se poder < 30"

(async () => {
    // 1) drops -> Depot comum: só Feather (Small Stone é do clã, poção é suprimento, Iron não caiu, Bottles marcado)
    {
        const bag = BAG.map(x => Object.assign({}, x));
        const cfg = { depositItems: 'depot', sellEnabled: true, sellItems: { 10: { keep: 0 } } };
        const { api, state } = loadDepositModule(cfg, { api: depotApi(bag), items: ITEMS, store: { pgDiscordNotifyDrops: DROPS }, clanKeepsItem: (id) => id === 120 });
        const r = await api.depositCityWork();
        const moves = state.calls.filter(c => c.url === '/api/game/depot/move').map(c => JSON.parse(c.opts.body));
        assert(moves.length === 1 && moves[0].itemId === 7 && moves[0].dir === 'store', 'só Feather foi para o Depot: ' + JSON.stringify(moves));
        assert(r.ok && r.itens.length === 1 && /30x Feather/.test(r.itens[0]), 'resultado: ' + JSON.stringify(r));
        assert(!state.sent.some(m => m.type === 'family-get'), 'sem família no caminho, não pergunta à família');
        assert(state.hooks.length === 1 && /guardou \*\*1 item\*\* no Depot/.test(state.hooks[0].content), 'aviso: ' + JSON.stringify(state.hooks));
    }

    // 2) Pokémon -> família: só o que a venda não vende e não tem motivo para ficar
    {
        const cfg = { depositPokes: 'family', pokeSellEnabled: true };
        const { api, state } = loadDepositModule(cfg, { api: depotApi([]), pokes: POKES, recent: [['novo', Date.now()]], pokeSellReason: sellRule });
        const r = await api.depositCityWork();
        assert(state.sent.some(m => m.type === 'family-get') && state.sent.some(m => m.type === 'pokes-get'), 'leu família e Pokémon');
        const ids = state.family.map(f => f.pokeId);
        assert(ids.length === 1 && ids[0] === 'guardado', 'só Larvitar foi: ' + JSON.stringify(ids));
        assert(r.pokes.length === 1 && !state.calls.length, 'itens desligados: não leu a mochila');
    }

    // 3) com "shiny e 🔒": eles também vão
    {
        const cfg = { depositPokes: 'family', depositPokesRare: true, pokeSellEnabled: true };
        const { api, state } = loadDepositModule(cfg, { api: depotApi([]), pokes: POKES, pokeSellReason: sellRule });
        await api.depositCityWork();
        const ids = state.family.map(f => f.pokeId).sort();
        assert(JSON.stringify(ids) === JSON.stringify(['guardado', 'lk', 'sh']), 'shiny e 🔒 incluídos (Geodude poder 20 é vendido): ' + JSON.stringify(ids));
        assert(!ids.includes('venda') && !ids.includes('ini') && !ids.includes('anun') && !ids.includes('lider'), 'nunca: vendido, inicial, anunciado, time');
    }

    // 4) limite de movimentos: 49/50 -> um movimento só (Pokémon primeiro, itens ficam)
    {
        const bag = BAG.map(x => Object.assign({}, x));
        const cfg = { depositPokes: 'family', depositItems: 'family', pokeSellEnabled: false };
        const { api, state } = loadDepositModule(cfg, { api: depotApi(bag), items: ITEMS, store: { pgDiscordNotifyDrops: DROPS }, pokes: [POKES[7], { id: 'x2', name: 'Pupitar', ivTotal: 120 }], family: { movesUsed: 49, movesCap: 50, frozen: false } });
        const r = await api.depositCityWork();
        assert(state.family.length === 1 && state.family[0].kind === 'poke', 'um movimento só: ' + JSON.stringify(state.family));
        assert(r.pokes.length === 1 && r.itens.length === 0, 'itens não foram (sem movimento)');
    }

    // 5) drops -> família com quantidade; sem família = erro e nada move
    {
        const bag = BAG.map(x => Object.assign({}, x));
        const cfg = { depositItems: 'family' };
        const { api, state } = loadDepositModule(cfg, { api: depotApi(bag), items: ITEMS, store: { pgDiscordNotifyDrops: DROPS } });
        await api.depositCityWork();
        const it = state.family.filter(f => f.kind === 'item').map(f => [f.itemId, f.qty]);
        assert(JSON.stringify(it) === JSON.stringify([[120, 450], [7, 30], [10, 20]]), 'itens da família com quantidade: ' + JSON.stringify(it));

        const { api: a2, state: s2 } = loadDepositModule({ depositItems: 'family' }, { api: depotApi(BAG.slice()), items: ITEMS, store: { pgDiscordNotifyDrops: DROPS }, family: null });
        const r2 = await a2.depositCityWork();
        assert(!s2.family.length && /família/.test(r2.motivo) && /não conseguiu guardar/.test(s2.hooks[0].content), 'sem família: ' + JSON.stringify(r2));
    }

    // 6) drops vistos em field-kill ficam guardados no localStorage; desligado não faz nada
    {
        const { api, state } = loadDepositModule({}, { api: depotApi([]) });
        api.noteDepositDrop({ loot: [{ itemId: 7, qty: 2 }, { itemId: 120, qty: 5 }] });
        assert(JSON.parse(state.store.pgDiscordNotifyDrops).sort().join() === '120,7', 'drops persistidos: ' + state.store.pgDiscordNotifyDrops);
        const r = await api.depositCityWork();
        assert(!r.ok && r.motivo === 'desligado' && !state.sent.length && !state.calls.length, 'desligado não age');
    }

    console.log('OK deposit.test — drops para Depot/família, Pokémon não vendidos para a família, limite de movimentos e sem família');
})().catch(e => { console.error(e); process.exit(1); });
