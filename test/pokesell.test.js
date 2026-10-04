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
    P({ id: 'listed', name: 'Growlithe', listed: true, ivTotal: 10, quality: 1.0 }),
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
        assert(motivos.starter === 'inicial' && motivos.shiny === 'shiny' && motivos.locked === 'cadeado' && motivos.semvalor === 'sem valor' && motivos.semiv === 'sem IV' && motivos.listed === 'anunciado no mercado', 'proteções fixas: ' + JSON.stringify(motivos));
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

    // 3) frame pokes só atualiza a lista e a prévia (desde a v3.15.0 a venda vai na viagem à cidade); a venda em si funciona
    {
        const cfg = { pokeSellEnabled: true, pokeSellLimits: REGRAS };
        const { api, state } = loadPokeSellModule(cfg, { api: okApi() });
        api.pokeSellOnPokes(LISTA);
        assert(state.calls.length === 0 && !state.trips && api.lastPokesList.length === LISTA.length, 'frame pokes: nem vende nem pede viagem');
        await api.runPokeSellCycle(true);                      // a viagem executa na cidade
        assert(state.calls.length === 1 && state.calls[0].url.endsWith('/pokemon/sell') && state.calls[0].body.pokeIds.join(',') === 'c40,e99,l90', 'POST com os 3 ids: ' + JSON.stringify(state.calls));
        assert(state.hooks.length === 1 && /vendeu \*\*3 Pokémon\*\* por 300 gold/.test(state.hooks[0].content), 'aviso: ' + state.hooks[0].content);
        assert(/Rattata lv5 Common 40\/192/.test(state.hooks[0].desc) && /Gold agora: 9000/.test(state.hooks[0].desc), 'embed lista os vendidos: ' + state.hooks[0].desc);
        assert(state.pokesReqs === 1, 'pede a lista nova');
        assert(api.lastPokesList.length === LISTA.length - 3, 'vendidos saem da lista local');
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
        api.pokeSellOnPokes(LISTA);
        state.awaiting.push({});
        const r = await api.runPokeSellCycle(true);
        assert(!r.ok && /aguardando/.test(r.motivo), 'manual também espera');
    }

    // 5b) lista fresca antes de vender (v3.24.7): o jogo responde ao pokes-get com c40 já no time -> não vende c40
    {
        const cfg = { pokeSellEnabled: true, pokeSellLimits: REGRAS };
        const fresca = LISTA.map(p => p.id === 'c40' ? P({ id: 'c40', name: 'Rattata', team: true, slot: 2, ivTotal: 40, quality: 1.0 }) : p);
        const { api, state } = loadPokeSellModule(cfg, { api: okApi(), freshPokes: fresca });
        api.pokeSellOnPokes(LISTA);   // frame velho: c40 fora do time
        const r = await api.runPokeSellCycle(true);
        assert(state.sent.some(m => m.type === 'pokes-get'), 'pediu a lista antes de vender');
        assert(r.ok && state.calls[0].body.pokeIds.join(',') === 'e99,l90', 'vendeu pela lista fresca (sem c40): ' + JSON.stringify(state.calls[0].body));
        assert(state.logs.some(l => l[0] === 'venda-pokes-lista' && l[1].fresca === true), 'log da lista fresca');
    }

    // 5c) jogo mudo ao pokes-get: espera 5 s e vende com a última lista
    {
        const cfg = { pokeSellEnabled: true, pokeSellLimits: REGRAS };
        const { api, state, clock } = loadPokeSellModule(cfg, { api: okApi() });
        api.pokeSellOnPokes(LISTA);
        const t0 = clock.now;
        const r = await api.runPokeSellCycle(true);
        assert(clock.now - t0 >= 5000 && r.ok && r.vendidos === 3, 'sem resposta: esperou 5 s e vendeu com a lista antiga: ' + JSON.stringify(r));
        assert(state.logs.some(l => l[0] === 'venda-pokes-lista' && l[1].fresca === false), 'log fresca=false');
    }

    // 6) venda parcial e erro
    {
        const cfg = { pokeSellEnabled: true, pokeSellLimits: REGRAS };
        const { api, state } = loadPokeSellModule(cfg, { api: okApi(1) });
        api.pokeSellOnPokes(LISTA);
        await api.runPokeSellCycle(true);
        assert(state.hooks.length === 1 && /venda parcial/.test(state.hooks[0].content) && /só parte do lote/.test(state.hooks[0].desc), 'parcial avisa: ' + state.hooks[0].content);
        const { api: b, state: sb } = loadPokeSellModule(cfg, { api: () => Promise.reject(new Error('HTTP 500')) });
        b.pokeSellOnPokes(LISTA);
        await b.runPokeSellCycle(true);
        assert(sb.hooks.length === 1 && /falhou/.test(sb.hooks[0].content) && /HTTP 500/.test(sb.hooks[0].desc), 'erro avisa: ' + sb.hooks[0].desc);
    }

    // 7) lote recusado pelo jogo (um Pokémon não vendável): vende um por um, marca o recusado e não o tenta de novo
    {
        const cfg = { pokeSellEnabled: false, pokeSellLimits: REGRAS }; // desligada: a lista entra sem vender sozinha; vende no manual
        const ruim = 'e99';
        const api = (url, opts) => {
            const ids = JSON.parse(opts.body).pokeIds;
            if (ids.includes(ruim)) return Promise.reject(new Error('Selecione Pokémon vendáveis que NÃO estão na equipe (shiny e anunciados no mercado não podem ser vendidos aqui).'));
            return Promise.resolve({ gold: 9000, goldGained: 100 * ids.length, sold: ids.length });
        };
        const { api: m, state } = loadPokeSellModule(cfg, { api });
        m.pokeSellOnPokes(LISTA);
        const r = await m.runPokeSellCycle(true);
        assert(state.calls.length === 4 && state.calls[0].body.pokeIds.length === 3, 'lote de 3 recusado, depois 3 chamadas de 1: ' + state.calls.map(c => c.body.pokeIds.join('+')).join(','));
        assert(r.vendidos === 2 && r.ganho === 200 && /1 recusado\(s\) pelo jogo/.test(r.motivo), 'vendeu os 2 bons: ' + JSON.stringify(r));
        assert(state.logs.some(l => l[0] === 'venda-pokes-recusado' && l[1].id === ruim && l[1].chaves.includes('ivTotal')), 'recusado logado com os campos');
        assert(/recusado pelo jogo/.test(m.pokeSellReason(LISTA.find(p => p.id === ruim), cfg)), 'recusado não volta a ser candidato');
        assert(/venda parcial/.test(state.hooks[0].content) && /1 recusado/.test(state.hooks[0].desc), 'aviso diz que foi parcial: ' + state.hooks[0].desc);
        state.calls.length = 0;
        const r2 = await m.runPokeSellCycle(true);
        assert(!r2.ok && /nenhum Pokémon/.test(r2.motivo) && state.calls.length === 0, 'nada sobrou para vender');
    }

    // 8) guarda de venda do PokeGrid: desligada só durante o POST (pelo interruptor `window.__pgSellGuardOn`) e
    //    religada depois; sem guarda (Tampermonkey) nada é tocado
    {
        const cfg = { pokeSellEnabled: false, pokeSellLimits: REGRAS };
        const win = { __pgSellGuard: true, __pgSellGuardOn: true };
        const vistos = [];
        const api = (url, opts) => { vistos.push(win.__pgSellGuardOn); return okApi()(url, opts); };
        const { api: m, state } = loadPokeSellModule(cfg, { api, window: win });
        m.pokeSellOnPokes(LISTA);
        const r = await m.runPokeSellCycle(true);
        assert(r.vendidos === 3 && vistos.length === 1 && vistos[0] === false, 'guarda desligada durante a venda: ' + JSON.stringify(vistos));
        assert(win.__pgSellGuardOn === true, 'guarda volta a ligada depois da venda');
        assert(state.logs.some(l => l[0] === 'venda-pokes' && l[1].guardaPokeGrid === true), 'log registra que havia guarda');
        // guarda existente mas já desligada pelo usuário: fica desligada
        const win2 = { __pgSellGuard: true, __pgSellGuardOn: false };
        const { api: m2 } = loadPokeSellModule(cfg, { api: okApi(), window: win2 });
        m2.pokeSellOnPokes(LISTA);
        await m2.runPokeSellCycle(true);
        assert(win2.__pgSellGuardOn === false, 'guarda já desligada continua desligada');
        // erro no POST também religa
        const win3 = { __pgSellGuard: true, __pgSellGuardOn: true };
        const { api: m3 } = loadPokeSellModule(cfg, { api: () => Promise.reject(new Error('HTTP 500')), window: win3 });
        m3.pokeSellOnPokes(LISTA);
        await m3.runPokeSellCycle(true);
        assert(win3.__pgSellGuardOn === true, 'guarda religada mesmo com erro');
        // sem PokeGrid: window intocada
        const win4 = {};
        const { api: m4 } = loadPokeSellModule(cfg, { api: okApi(), window: win4 });
        m4.pokeSellOnPokes(LISTA);
        await m4.runPokeSellCycle(true);
        assert(!('__pgSellGuardOn' in win4), 'sem guarda nada é criado em window');
    }

    // v3.28.0: box e plano B
    // a) estimativa do box = frame + capturas − vendidas; acima do limite pede viagem e avisa 1x/h
    {
        const cfg = { pokeSellEnabled: true, pokeSellLimits: REGRAS, boxAlertAt: 15 };
        const { api, state, clock } = loadPokeSellModule(cfg, { api: okApi() });
        api.pokeSellOnPokes(LISTA);                                   // 13 na conta
        assert(api.boxEstimate() === 13 && !state.hooks.length && !(state.trips || []).length, 'box 13 abaixo do limite');
        api.boxNoteCapture({ id: 'n1', speciesId: 19, name: 'Rattata', level: 1, xp: 0, shiny: false, sellValue: 100, ivTotal: 30, quality: 1.0 });
        api.boxNoteCapture({ id: 'n2', speciesId: 19, name: 'Rattata', level: 1, xp: 0, shiny: false, sellValue: 100, ivTotal: 30, quality: 1.0 });
        assert(api.boxEstimate() === 15 && state.trips.length === 1 && state.trips[0].key === 'pokes' && /box com ~15/.test(state.trips[0].motivo), 'no limite: viagem pedida: ' + JSON.stringify(state.trips));
        assert(state.hooks.length === 1 && /box com \*\*~15 Pokémon\*\*/.test(state.hooks[0].content) && state.hooks[0].meta.evento === 'box-alerta', 'alerta do box: ' + (state.hooks[0] || {}).content);
        api.boxNoteCapture({ id: 'n3', speciesId: 19, name: 'Rattata', level: 1, xp: 0, shiny: false, sellValue: 100, ivTotal: 30, quality: 1.0 });
        assert(state.hooks.length === 1, 'segundo alerta só depois de 1 h');
        assert(JSON.parse(state.store.pgDiscordNotifyBox).length === 3, 'fila persistida: ' + state.store.pgDiscordNotifyBox);
    }
    // b) plano B: lista muda (sem frame nesta carga) -> vende pela fila com as mesmas regras; recentes, shiny e travados ficam
    {
        const cfg = { pokeSellEnabled: true, pokeSellLimits: REGRAS, boxAlertAt: 0 };
        const fila = [
            { id: 'q1', speciesId: 19, name: 'Rattata', level: 1, shiny: false, starter: false, sellValue: 100, ivTotal: 40, quality: 1.0, at: Date.now() - 10 * 60 * 1000 },
            { id: 'q2', speciesId: 19, name: 'Rattata', level: 1, shiny: true, starter: false, sellValue: 100, ivTotal: 40, quality: 1.0, at: Date.now() - 10 * 60 * 1000 },
            { id: 'q3', speciesId: 19, name: 'Rattata', level: 1, shiny: false, starter: false, sellValue: 100, ivTotal: 40, quality: 1.0, at: Date.now() - 10 * 60 * 1000, locked: true },
            { id: 'q4', speciesId: 19, name: 'Rattata', level: 1, shiny: false, starter: false, sellValue: 100, ivTotal: 150, quality: 1.0, at: Date.now() - 10 * 60 * 1000 },
            { id: 'q5', speciesId: 19, name: 'Rattata', level: 1, shiny: false, starter: false, sellValue: 100, ivTotal: 40, quality: 1.0, at: Date.now() - 30 * 1000 },
        ];
        const { api, state } = loadPokeSellModule(cfg, { api: okApi(), store: { pgDiscordNotifyBox: JSON.stringify(fila) } });
        assert(api.captureQueue.length === 5, 'fila carregada do localStorage');
        assert(api.pokeSellQueueCandidates(cfg).map(p => p.id).join(',') === 'q1', 'só q1 vende (shiny, cadeado, poder alto e recente ficam): ' + api.pokeSellQueueCandidates(cfg).map(p => p.id));
        const r = await api.runPokeSellCycle(true);
        assert(r.ok && r.vendidos === 1 && state.calls[0].body.pokeIds.join(',') === 'q1', 'vendeu pela fila sem lista: ' + JSON.stringify(r) + ' ' + JSON.stringify(state.calls));
        assert(api.captureQueue.length === 4 && !api.captureQueue.some(p => p.id === 'q1'), 'q1 saiu da fila');
        const lg = state.logs.find(l => l[0] === 'venda-pokes-lista');
        assert(lg && lg[1].fresca === false && lg[1].planoB === 1, 'log diz plano B: ' + JSON.stringify(lg));
        // frame chega: a fila fica só com quem o frame mostra como vendável (q5 presente e livre; q3 travado no frame; q2/q4 sumiram)
        api.pokeSellOnPokes([P({ id: 'q5', ivTotal: 40 }), P({ id: 'q3', locked: true })]);
        assert(api.captureQueue.map(p => p.id).join(',') === 'q5', 'fila podada pelo frame: ' + api.captureQueue.map(p => p.id));
        // lista fresca: plano B não entra (a lista manda)
        const { api: a2, state: s2 } = loadPokeSellModule(cfg, { api: okApi(), freshPokes: LISTA, store: { pgDiscordNotifyBox: JSON.stringify(fila) } });
        a2.pokeSellOnPokes(LISTA);
        const r2 = await a2.runPokeSellCycle(true);
        assert(r2.vendidos === 3 && !s2.calls[0].body.pokeIds.includes('q1'), 'com lista fresca vende só pela lista: ' + JSON.stringify(s2.calls[0].body));
    }
    // c) 2 pedidos seguidos mudos na cidade = alerta (1x/h); resposta zera
    {
        const cfg = { pokeSellEnabled: true, pokeSellLimits: REGRAS, boxAlertAt: 0 };
        const { api, state } = loadPokeSellModule(cfg, { api: okApi() });
        api.pokesNoteSilent(false);
        assert(!state.hooks.length, '1º mudo: sem alerta');
        api.pokesNoteSilent(false);
        assert(state.hooks.length === 1 && /não responde a lista/.test(state.hooks[0].content) && state.hooks[0].meta.evento === 'pokes-mudo', 'alerta no 2º mudo: ' + (state.hooks[0] || {}).content);
        api.pokesNoteSilent(false);
        assert(state.hooks.length === 1, 'não repete dentro de 1 h');
        api.pokesNoteSilent(true);
        assert(state.logs.filter(l => l[0] === 'pokes-mudo').length === 3, 'log pokes-mudo por pedido mudo');
    }

    console.log('OK pokesell.test — limite por raridade, proteções, lista fresca antes de vender, venda automática/manual, parcial, erro, lote recusado, guarda do PokeGrid, box e plano B');
})().catch(e => { console.error(e); process.exit(1); });
