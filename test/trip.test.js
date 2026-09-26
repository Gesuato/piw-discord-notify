// Viagem à cidade para vender/comprar (v3.14.0). Rodar: node test/trip.test.js
const { loadTripModule, assert } = require('./harness');

const MIN = 60 * 1000;

(async () => {
    // 1) pedidos acumulam; o tique faz UMA viagem com tudo: sai da hunt, a tela viaja (set-city), tarefas em ordem, volta
    {
        const { api, state } = loadTripModule({ tripCity: 'cerulean', tripMinGapMin: 3 }, { huntSlug: 'pidgey' });
        state.onTeleport = () => api.tripOnSetCity();           // a tela viajou e mandou set-city
        api.tripRequest('itens', { wanted: [39, 120], hunt: 'pidgey' }, 'intervalo');
        api.tripRequest('pokes', null, 'intervalo');
        api.tripRequest('bolas', { id: 4, qty: 0, min: 1 }, 'acabou');
        api.tripRequest('itens', { wanted: [39, 120], hunt: 'pidgey' }, 'de novo');
        assert(api.tripNeeds.size === 3 && /sai no próximo minuto/.test(api.tripStatus().title), 'pedidos acumulados: ' + api.tripStatus().title);
        await api.tripTick();
        assert(state.sent.length === 1 && state.sent[0].type === 'leave-hunt', 'saiu da hunt (só leave-hunt; set-city foi a tela)');
        assert(state.nudges.length === 1 && state.nudges[0].type === 'field-teleport-city' && state.nudges[0].synthetic, 'teleporte sintético para a tela');
        assert(state.tasks.map(t => t[0]).join(',') === 'itens,pokes,bolas', 'tarefas na ordem: ' + state.tasks.map(t => t[0]));
        assert(state.tasks[0][1].manual === true && state.tasks[0][1].wanted.join(',') === '39,120' && state.tasks[0][1].hunt === 'pidgey', 'venda de itens com a lista congelada da hunt');
        assert(state.tasks[2][1].id === 4 && state.tasks[2][1].qty === 0, 'compra de bolas com os dados do pedido');
        assert(state.switches.length === 1 && state.switches[0].slug === 'pidgey' && state.switches[0].origem === 'viagem', 'voltou para pidgey via switchHunt viagem');
        assert(!api.tripRunning && api.tripNeeds.size === 0 && api.lastTripInfo.tarefas.every(t => t.ok), 'viagem concluída: ' + JSON.stringify(api.lastTripInfo));
        assert(state.logs.some(l => l[0] === 'viagem' && l[1].fase === 'cidade' && l[1].pelaTela === true) && state.logs.some(l => l[0] === 'viagem' && l[1].fase === 'fim'), 'log da ida e do fim');
        assert(/Última .*drops ✔ · Pokémon ✔ · bolas ✔/.test(api.tripStatus().sub), 'status depois: ' + api.tripStatus().sub);
    }

    // 2) a tela não viajou em 10 s: o script manda set-city sozinho
    {
        const { api, state, clock } = loadTripModule({ tripCity: 'pewter' }, { huntSlug: 'pidgey' });
        const t0 = clock.now;
        api.tripRequest('pokes');
        await api.tripTick();
        assert(state.sent.map(o => o.type).join(',') === 'leave-hunt,set-city' && state.sent[1].slug === 'pewter', 'set-city manual na cidade escolhida: ' + JSON.stringify(state.sent));
        assert(clock.now - t0 >= 10 * 1000, 'esperou os 10 s antes');
        assert(state.logs.some(l => l[0] === 'viagem' && l[1].fase === 'cidade' && l[1].pelaTela === false), 'log diz que a tela não viajou');
    }

    // 3) intervalo mínimo entre viagens; e nada crítico em andamento
    {
        const { api, state, clock } = loadTripModule({ tripMinGapMin: 3 }, { huntSlug: 'pidgey' });
        api.tripRequest('pokes'); await api.tripTick();
        assert(state.switches.length === 1, '1ª viagem');
        api.tripRequest('itens', { wanted: [1], hunt: 'pidgey' });
        await api.tripTick();
        assert(state.switches.length === 1 && api.tripNeeds.size === 1, 'dentro de 3 min não viaja (pedido urgente espera o intervalo mínimo)');
        clock.now += 3 * MIN + 1000;
        await api.tripTick();
        assert(state.switches.length === 2 && api.tripNeeds.size === 0, 'passado o intervalo viaja');
    }
    {
        const { api, state } = loadTripModule({}, { huntSlug: 'pidgey', huntSwitch: { slug: 'x' } });
        api.tripRequest('pokes'); await api.tripTick();
        assert(state.switches.length === 0 && api.tripNeeds.size === 1, 'troca de hunt em andamento: espera');
    }

    // 4) já na cidade (ou sem hunt): faz as tarefas sem sair nem voltar
    {
        const { api, state } = loadTripModule({}, { huntSlug: 'cerulean' });
        api.tripRequest('pokes'); await api.tripTick();
        assert(state.sent.length === 0 && state.nudges.length === 0 && state.tasks.length === 1 && state.switches.length === 0, 'na cidade: só as tarefas');
        assert(api.lastTripInfo.volta === null, 'sem hunt para voltar');
    }

    // 5) para onde voltar: hunt atual > alvo da rota de captura > etapa da rota > última hunt vista
    {
        const { api } = loadTripModule({}, { huntSlug: 'cerulean', catchTarget: { slug: 'abra' }, routeStep: { slug: 'dratini' }, lastRealHunt: 'larvitar' });
        assert(api.tripReturnSlug() === 'abra', 'alvo da captura');
        const { api: b } = loadTripModule({}, { huntSlug: null, routeStep: { slug: 'dratini' }, lastRealHunt: 'larvitar' });
        assert(b.tripReturnSlug() === 'dratini', 'etapa da rota');
        const { api: c } = loadTripModule({}, { huntSlug: null, lastRealHunt: 'larvitar' });
        assert(c.tripReturnSlug() === 'larvitar', 'última hunt vista');
    }

    // 6) tarefa que falha não impede as outras nem a volta; o resultado mostra quem falhou
    {
        const { api, state } = loadTripModule({}, { huntSlug: 'pidgey', itens: { ok: false, motivo: 'nada acima da reserva para vender' } });
        state.onTeleport = () => api.tripOnSetCity();
        const r = await api.cityTrip('manual: itens+pokes', api.tripTasksFor([['itens', { dados: { wanted: [1], hunt: 'pidgey' } }], ['pokes', {}]]));
        assert(!r.ok && r.tarefas[0].ok === false && /reserva/.test(r.tarefas[0].motivo) && r.tarefas[1].ok === true, 'resultado por tarefa: ' + JSON.stringify(r.tarefas));
        assert(state.switches.length === 1 && r.volta === 'pidgey', 'voltou mesmo assim');
        assert(api.tripCity() === 'cerulean', 'cidade padrão');
    }

    // 7) carona: viagem pedida pelos Pokémon leva os itens marcados e as bolas baixas junto
    {
        const { api, state } = loadTripModule({ sellEnabled: true, pokeSellEnabled: true, autoBuy: true }, { huntSlug: 'pidgey', wantedNow: [39], ballId: 4, ballQty: 0, ballsMin: 1 });
        api.tripRequest('pokes'); await api.tripTick();
        assert(state.tasks.map(t => t[0]).sort().join(',') === 'bolas,itens,pokes', 'carona levou itens e bolas: ' + state.tasks.map(t => t[0]));
        assert(state.tasks.find(t => t[0] === 'itens')[1].wanted.join(',') === '39', 'itens com a lista atual');
    }

    // 8) relógio único: sem nada a fazer no horário, só sorteia o próximo; com drops marcados, viaja; bola zerada é urgente
    {
        const init = { huntSlug: 'pidgey', wantedNow: [] };
        const { api, state, clock, cfg } = loadTripModule({ sellEnabled: true, tripEveryMin: 10, tripEveryMaxMin: 15 }, init);
        state.onTeleport = () => api.tripOnSetCity();
        for (let i = 0; i < 30; i++) { const ms = api.drawTripDelay(); assert(ms >= 10 * MIN && ms <= 15 * MIN, 'sorteio fora da faixa: ' + ms); }
        api.restartTripCycle();
        await api.tripTick();
        assert(state.switches.length === 0 && state.sent.length === 0, 'antes da hora: nada');
        assert(/Próxima viagem à cidade em 1[0-5] min/.test(api.tripStatus().title) && /Nada para levar/.test(api.tripStatus().sub), 'faixa: ' + JSON.stringify(api.tripStatus()));
        clock.now += 16 * MIN;
        const t1 = api.lastTripAt;
        await api.tripTick();
        assert(state.switches.length === 0 && api.lastTripAt > t1 && state.logs.some(l => l[0] === 'viagem-vazia'), 'na hora sem nada: só sorteia o próximo, não sai da hunt');
        init.wantedNow = [39, 120];
        cfg.sellItems = { 39: { keep: 0 }, 120: { keep: 0 } }; state.huntLoot.set(39, { name: 'a', qty: 1 }); state.huntLoot.set(120, { name: 'b', qty: 1 });
        assert(/Vai levar: 2 drops/.test(api.tripStatus().sub), 'faixa mostra o que vai levar: ' + api.tripStatus().sub);
        clock.now += 16 * MIN;
        await api.tripTick();
        assert(state.switches.length === 1 && state.tasks.map(t => t[0]).join(',') === 'itens', 'na hora com drops: viajou e vendeu');
        assert(state.logs.some(l => l[0] === 'viagem' && l[1].fase === 'fim' && /relógio/.test(l[1].motivo)), 'motivo relógio');
        // bola zerada: urgente, não espera o relógio (só o intervalo mínimo de 3 min)
        clock.now += 1 * MIN;
        api.tripRequest('bolas', { id: 4, qty: 0, min: 1 }, 'acabou');
        await api.tripTick();
        assert(state.switches.length === 1, 'urgente dentro de 3 min da última viagem: espera');
        clock.now += 3 * MIN;
        await api.tripTick();
        assert(state.switches.length === 2 && state.tasks.slice(1).map(t => t[0]).sort().join(',') === 'bolas,itens', 'urgente foi antes do relógio e levou os drops de carona');
    }

    console.log('OK trip.test — pedidos juntos numa viagem, ida pela tela ou manual, intervalo, cidade, volta e falhas');
})().catch(e => { console.error(e); process.exit(1); });
