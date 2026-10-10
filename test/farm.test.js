// Farm por lista (v3.33.0): dropar N de cada item na hunt do monstro, um de cada vez. Rodar: node test/farm.test.js
const { loadFarmModule, assert } = require('./harness');

const CREATURES = [
    { pokeId: 129, name: 'Magikarp', loot: [{ name: 'Magikarp Fin', chance: 60000, minCount: 1, maxCount: 2 }] },
    { pokeId: 253, name: 'Grovyle', loot: [{ name: 'Seed', chance: 50000, minCount: 1, maxCount: 1 }] },
    { pokeId: 16, name: 'Pidgey', loot: [{ name: 'Feather', chance: 90000, minCount: 1, maxCount: 3 }] },
    { pokeId: 17, name: 'Pidgeotto', loot: [{ name: 'Feather', chance: 100000, minCount: 2, maxCount: 4 }] },
];
const CATALOGO = [
    { slug: 'magikarp', name: 'Magikarp', level: 5, speciesId: 129, speciesName: 'Magikarp' },
    { slug: 'grovyle', name: 'Grovyle', level: 120, speciesId: 253, speciesName: 'Grovyle' },
    { slug: 'pidgey', name: 'Pidgey', level: 5, speciesId: 16, speciesName: 'Pidgey' },
    { slug: 'pidgeotto', name: 'Pidgeotto', level: 40, speciesId: 17, speciesName: 'Pidgeotto' },
    { slug: 'ancient_pidgey', name: 'Ancient Pidgey', level: 300, speciesId: 16, speciesName: 'Pidgey' },
];
const ITEMS = [{ id: 81, name: 'Magikarp Fin' }, { id: 82, name: 'Seed' }, { id: 83, name: 'Feather' }];
const TIME = [{ id: 'a', name: 'Golem', level: 50, leader: true }];
const kill = (name, qty) => ({ type: 'field-kill', speciesName: 'x', loot: [{ itemId: 0, name, qty }] });
const flush = () => new Promise(r => setImmediate(r));
const base = (extra) => Object.assign({ farmEnabled: true, farmList: [] }, extra || {});
const mk = (cfg, init) => loadFarmModule(cfg, Object.assign({ creatures: CREATURES, huntCatalog: CATALOGO, items: ITEMS, team: TIME, huntSlug: 'geodude' }, init || {}));

(async () => {
    // 1) parser das linhas do painel: "1000 Item @ monstro", "1000x Item @ Monstro Com Espaço", "200 Item" (sem monstro); linha ruim
    {
        const { api } = mk(base());
        assert(JSON.stringify(api.parseFarmLine('1000 Magikarp Fin @ magikarp')) === JSON.stringify({ item: 'Magikarp Fin', qty: 1000, hunt: 'magikarp' }), 'linha simples');
        assert(JSON.stringify(api.parseFarmLine(' 500x Seed @ Ancient Pidgey ')) === JSON.stringify({ item: 'Seed', qty: 500, hunt: 'ancient_pidgey' }), 'com x e monstro com espaço vira slug');
        assert(JSON.stringify(api.parseFarmLine('200 Feather')) === JSON.stringify({ item: 'Feather', qty: 200, hunt: '' }), 'sem monstro');
        assert(api.parseFarmLine('Feather 200') === null && api.parseFarmLine('0 Feather') === null && api.parseFarmLine('') === null, 'linhas inválidas');
        const r = api.parseFarmText('1000 Magikarp Fin @ magikarp\nabc\n\n200 Feather', [{ item: 'magikarp fin', qty: 50, hunt: 'magikarp', got: 30 }, { item: 'Feather', qty: 200, hunt: '', got: 7 }]);
        assert(r.ruins.length === 1 && r.ruins[0] === 'abc', 'linha ruim vai para ruins');
        assert(r.list.length === 2 && r.list[0].got === 30 && r.list[1].got === 7, 'progresso conservado por item+monstro (sem diferenciar maiúsculas): ' + JSON.stringify(r.list));
        const r2 = api.parseFarmText('100 Seed @ grovyle\n100 Seed @ grovyle', [{ item: 'Seed', qty: 100, hunt: 'grovyle', got: 40 }]);
        assert(r2.list[0].got === 40 && r2.list[1].got === 0, 'linha repetida não herda o progresso');
    }

    // 2) vai para a hunt do monstro, conta drops, fecha a etapa (aviso com a próxima), passa para a seguinte e volta no fim
    {
        const cfg = base({ farmList: [{ item: 'Magikarp Fin', qty: 3, hunt: 'magikarp', got: 0 }, { item: 'Seed', qty: 2, hunt: 'grovyle', got: 0 }] });
        const { api, state } = mk(cfg);
        await api.farmTick();
        assert(api.farmTarget && api.farmTarget.slug === 'magikarp' && api.farmFrom === 'geodude', 'alvo = magikarp, volta = geodude: ' + JSON.stringify(api.farmTarget));
        assert(state.switches.length === 1 && state.switches[0].slug === 'magikarp' && state.switches[0].origem === 'farm', 'trocou para magikarp');
        api.setHunt('magikarp');
        api.farmOnKill(kill('Magikarp Fin', 2));
        assert(cfg.farmList[0].got === 2 && state.saves === 0 && state.timers.length === 1, 'contou 2 e agendou a gravação (10 s)');
        api.farmOnKill(kill('Seed', 5));
        assert(cfg.farmList[0].got === 2, 'drop de outro item não conta na etapa atual');
        api.farmOnKill(kill('Magikarp Fin', 1));
        await flush();
        assert(cfg.farmList[0].got === 3 && state.saves === 1 && state.timers.length === 0, 'fechou a etapa: gravou na hora e cancelou o timer');
        assert(state.hooks.length === 1 && /3× Magikarp Fin\*\* concluído · próximo: 2× Seed/.test(state.hooks[0].content), 'avisou a etapa com a próxima: ' + state.hooks[0]?.content);
        assert(api.farmTarget && api.farmTarget.slug === 'grovyle' && state.switches.length === 2 && state.switches[1].slug === 'grovyle', 'passou para grovyle (acima do nível do time, mas o monstro foi escolhido pelo usuário)');
        assert(api.farmFrom === 'geodude', 'volta segue sendo a hunt de antes da lista');
        api.setHunt('grovyle');
        api.farmOnKill(kill('Seed', 2));
        await flush();
        assert(state.hooks.length === 2 && /lista concluída/.test(state.hooks[1].content), 'avisou a lista concluída: ' + state.hooks[1]?.content);
        assert(!api.farmTarget && !api.farmFrom && state.switches.length === 3 && state.switches[2].slug === 'geodude', 'voltou para geodude');
        assert(/lista concluída/.test(api.farmWait) && /lista concluída/.test(api.farmLine()), 'painel: lista concluída');
        await api.farmTick();
        assert(state.switches.length === 3 && state.hooks.length === 2, 'tique seguinte não troca nem avisa de novo');
        api.farmOnKill(kill('Seed', 1));
        assert(cfg.farmList[1].got === 2, 'com a lista fechada não conta mais');
    }

    // 3) sem monstro: a hunt que mais dropa o item até o nível do time (pidgeotto lv40 dá mais Feather que pidgey; ancient_pidgey lv300 fica fora)
    {
        const { api } = mk(base({ farmList: [{ item: 'Feather', qty: 10, hunt: '', got: 0 }] }));
        await api.farmTick();
        assert(api.farmTarget && api.farmTarget.slug === 'pidgeotto', 'melhor hunt ao alcance: ' + JSON.stringify(api.farmTarget));
        const { api: a2 } = mk(base({ farmList: [{ item: 'Feather', qty: 10, hunt: '', got: 0 }] }), { team: [{ level: 10 }] });
        await a2.farmTick();
        assert(a2.farmTarget && a2.farmTarget.slug === 'pidgey', 'time lv10: só pidgey');
        // monstro pelo nome da espécie com 2 hunts: a de menor nível ao alcance; slug exato ganha
        const { api: a3 } = mk(base({ farmList: [{ item: 'Feather', qty: 10, hunt: 'Pidgey', got: 0 }] }));
        await a3.farmTick();
        assert(a3.farmTarget.slug === 'pidgey', 'nome da espécie: pidgey lv5');
        const { api: a4 } = mk(base({ farmList: [{ item: 'Feather', qty: 10, hunt: 'ancient_pidgey', got: 0 }] }));
        await a4.farmTick();
        assert(a4.farmTarget.slug === 'ancient_pidgey', 'slug exato ganha mesmo acima do nível');
    }

    // 4) hunt inexistente = etapa pulada com aviso e a lista segue; item que a hunt não dropa = vai mesmo assim (log farm-aviso)
    {
        const cfg = base({ farmList: [{ item: 'Seed', qty: 5, hunt: 'naoexiste', got: 0 }, { item: 'Seed', qty: 5, hunt: 'magikarp', got: 0 }] });
        const { api, state } = mk(cfg);
        await api.farmTick();
        assert(api.farmSkipped.size === 1 && state.hooks.length === 1 && /pulado/.test(state.hooks[0].content), 'pulou a 1ª com aviso: ' + state.hooks[0]?.content);
        assert(api.farmTarget && api.farmTarget.slug === 'magikarp' && state.logs.some(([k, d]) => k === 'farm-aviso' && d.slug === 'magikarp'), 'seguiu para a 2ª (magikarp não dropa Seed: só avisa no log)');
        assert(/item fora da tabela de drops/.test(api.farmLine()), 'painel avisa que o item não está na tabela');
        // Salvar: farmReset esquece o pulo; a 1ª volta a ser tentada (e pulada de novo)
        api.farmReset();
        assert(api.farmSkipped.size === 0 && !api.farmTarget, 'reset limpou pulos e alvo');
        await api.farmTick();
        assert(api.farmSkipped.size === 1 && state.hooks.length === 2, 'tentou de novo e pulou de novo');
    }

    // 5) entrada que não confirma: tenta outra hunt do mesmo monstro; sem outra, pula a etapa
    {
        const cfg = base({ farmList: [{ item: 'Feather', qty: 5, hunt: 'Pidgey', got: 0 }] });
        const { api, state } = mk(cfg);
        await api.farmTick();
        assert(api.farmTarget.slug === 'pidgey', 'pidgey primeiro');
        api.farmHuntFailed('pidgey');
        await api.farmTick();
        assert(api.farmTarget && api.farmTarget.slug === 'ancient_pidgey', 'outra hunt da espécie: ' + JSON.stringify(api.farmTarget));
        api.farmHuntFailed('ancient_pidgey');
        await api.farmTick();
        assert(!api.farmTarget && api.farmSkipped.size === 1 && state.hooks.some(h => /pulado/.test(h.content)), 'sem hunt possível: pulada');
    }

    // 6) esperas: viagem, cura, troca, líder e Daily Kill seguram a rota; o alvo é escolhido quando liberam
    {
        const { api, state } = mk(base({ farmList: [{ item: 'Seed', qty: 5, hunt: 'grovyle', got: 0 }] }), { env: { tripRunning: true } });
        await api.farmTick();
        assert(!api.farmTarget && /viagem/.test(api.farmWait) && state.switches.length === 0, 'viagem segura: ' + api.farmWait);
        state.env.tripRunning = false; state.env.healBusy = true;
        await api.farmTick();
        assert(/Nurse Joy/.test(api.farmWait), 'cura segura');
        state.env.healBusy = false; state.env.huntSwitch = { slug: 'x' };
        await api.farmTick();
        assert(/troca para x/.test(api.farmWait), 'troca segura');
        state.env.huntSwitch = null; state.env.swapPending = {};
        await api.farmTick();
        assert(/líder/.test(api.farmWait), 'líder segura');
        state.env.swapPending = null; state.env.dailyOnHunt = true;
        await api.farmTick();
        assert(/Daily Kill/.test(api.farmWait), 'daily segura');
        state.env.dailyOnHunt = false;
        await api.farmTick();
        assert(api.farmTarget && api.farmTarget.slug === 'grovyle' && api.farmWait === '' && state.switches.length === 1, 'liberou: foi');
        // drops contam mesmo durante a espera (o jogo pode já estar na hunt certa)
    }

    // 7) a tela entrou em outra hunt: reentra no alvo 8 s depois; na cidade/viagem não
    {
        const { api, state } = mk(base({ farmList: [{ item: 'Seed', qty: 5, hunt: 'grovyle', got: 0 }] }));
        await api.farmTick();
        api.setHunt('grovyle');
        api.setHunt('pidgey'); api.farmOnHuntChange('pidgey');
        assert(state.timers.length === 1, 'reentrada agendada');
        state.fire(8000);
        assert(state.switches.length === 2 && state.switches[1].slug === 'grovyle' && state.logs.some(([k]) => k === 'farm-reentrada'), 'reentrou em grovyle');
        api.setHunt('cerulean'); api.farmOnHuntChange('cerulean');
        assert(state.timers.length === 0, 'cidade não agenda reentrada');
    }

    // 8) desligar / lista vazia: volta para a hunt de antes; itens da lista ficam fora da venda enquanto ligado
    {
        const cfg = base({ farmList: [{ item: 'Seed', qty: 5, hunt: 'grovyle', got: 0 }] });
        const { api, state } = mk(cfg);
        await api.farmTick();
        assert(api.farmKeepsItem(82) && !api.farmKeepsItem(81), 'Seed (82) protegido, Magikarp Fin (81) não');
        api.setHunt('grovyle');
        cfg.farmEnabled = false;
        await api.farmTick();
        assert(!api.farmTarget && !api.farmFrom && state.switches.length === 2 && state.switches[1].slug === 'geodude', 'desligado: voltou');
        assert(!api.farmKeepsItem(82), 'desligado: nada protegido');
        assert(api.farmLine() === 'Farm desligado', 'linha do painel');
    }

    // 9) carga com a lista já concluída: não avisa nem troca de hunt (só fica "lista concluída")
    {
        const { api, state } = mk(base({ farmList: [{ item: 'Seed', qty: 5, hunt: 'grovyle', got: 5 }] }));
        await api.farmTick();
        assert(state.hooks.length === 0 && state.switches.length === 0 && /lista concluída/.test(api.farmWait), 'concluída na carga: quieto');
    }

    console.log('OK farm.test — parser, hunt do monstro/melhor hunt, contagem e etapas, pulos, esperas, reentrada, desligar');
})().catch(err => { console.error(err); process.exit(1); });
