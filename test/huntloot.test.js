// Tabela de drops por hunt (v3.20.0): a lista de venda nasce com o loot do monstro, antes de cair. Rodar: node test/huntloot.test.js
const { loadCatchModule, assert } = require('./harness');

const MARKERS = { hunts: [
    { slug: 'cerulean', name: 'Cerulean', level: 0, looktype: 1 },
    { slug: 'larvitar', name: 'Larvitar', level: 30, looktype: 246 },
    { slug: 'furious_scyther', name: 'Furious Scyther', level: 150, looktype: 900 },
    { slug: 'rocha_misteriosa', name: 'Rocha Misteriosa', level: 40, looktype: 74 },   // nome não bate: vai pelo looktype
] };
const CREATURES = { creatures: [
    { pokeId: 246, name: 'Larvitar', looktype: 246, loot: [
        { name: 'Small Stone', chance: 95000, minCount: 1, maxCount: 8 },
        { name: 'Earth Ball', chance: 95000, minCount: 1, maxCount: 2 },
        { name: 'Strange Pheromone', chance: 0, minCount: 1, maxCount: 1 },
        { name: 'Item Que Não Existe', chance: 50000, minCount: 1, maxCount: 1 },
    ] },
    { pokeId: 123, name: 'Scyther', looktype: 123, loot: [{ name: 'Bug Antenna', chance: 30000, minCount: 1, maxCount: 1 }] },
    { pokeId: 10506, name: 'Furious Scyther', looktype: 900, loot: [{ name: 'Bug Antenna', chance: 60000, minCount: 1, maxCount: 4 }, { name: 'Bug Antenna', chance: 10000, minCount: 1, maxCount: 1 }] },
    { pokeId: 74, name: 'Geodude', looktype: 74, loot: [{ name: 'Small Stone', chance: 95000, minCount: 1, maxCount: 4 }] },
] };
const ITEMS = new Map([
    [120, { id: 120, name: 'Small Stone', npcPrice: 10 }],
    [39, { id: 39, name: 'Earth Ball', npcPrice: 10 }],
    [44417, { id: 44417, name: 'Strange Pheromone', npcPrice: 0 }],
    [9, { id: 9, name: 'Bug Antenna', npcPrice: 30 }],
]);

(async () => {
    const { api } = loadCatchModule({}, { fetchJson: (url) => (/map-markers/.test(url) ? MARKERS : CREATURES), api: () => Promise.resolve({}) });
    await api.loadHuntCatalog();

    const lar = api.huntLootTable('larvitar', ITEMS);
    assert(JSON.stringify(lar.map(x => x.id)) === JSON.stringify([39, 120, 44417]), 'larvitar: drops com id, mais provável primeiro (empate por nome): ' + JSON.stringify(lar));
    assert(lar[1].chance === 0.95 && lar[1].min === 1 && lar[1].max === 8, 'chance e quantidade: ' + JSON.stringify(lar[1]));
    assert(lar[2].chance === null, 'chance 0 no catálogo = o jogo não publica (drop raro)');
    assert(!lar.some(x => x.name === 'Item Que Não Existe'), 'item fora do items.json fica de fora (sem id não dá para vender)');

    const fs = api.huntLootTable('furious_scyther', ITEMS);
    assert(fs.length === 1 && fs[0].id === 9 && fs[0].chance === 0.6 && fs[0].max === 4, 'hunt especial usa o monstro dela (Furious Scyther), repetido fica com a maior chance: ' + JSON.stringify(fs));

    const rm = api.huntLootTable('rocha_misteriosa', ITEMS);
    assert(rm.length === 1 && rm[0].id === 120, 'nome sem monstro: casa pelo looktype: ' + JSON.stringify(rm));

    assert(api.huntLootTable('cerulean', ITEMS).length === 0 && api.huntLootTable('nao_existe', ITEMS).length === 0, 'cidade e hunt desconhecida: sem tabela');

    console.log('OK huntloot.test — tabela de drops por hunt (nome, especiais, looktype, chance não publicada)');
})().catch(e => { console.error(e); process.exit(1); });
