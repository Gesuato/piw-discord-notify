// Poke Slot Machine (v3.26.0): lê a máquina (GET golden-stars) quando um prazo vence, pede viagem com slot pronto, na cidade
// faz o roll grátis e escolhe o 1º Pokémon pedido que saiu (senão um qualquer), avisa; erro = 15 min antes de insistir.
// Rodar: node test/slot.test.js
const { loadSlotModule, assert } = require('./harness');

const T0 = Date.UTC(2026, 9, 2, 12, 0, 0);
const H = 3600e3, MIN = 60e3;
const CANDS = ['Pidgey', 'Rattata', 'Larvitar', 'Abra', 'Geodude', 'Zubat', 'Machop', 'Bagon', 'Onix'].map((n, i) => ({ speciesId: 100 + i, name: n, looktype: 0 }));
const CANDS2 = ['Dratini', 'Caterpie', 'Weedle', 'Ekans', 'Sandshrew', 'Nidoran', 'Clefairy', 'Vulpix', 'Oddish'].map((n, i) => ({ speciesId: 200 + i, name: n, looktype: 0 }));
const slotRaw = (o) => Object.assign({ slot: 0, unlocked: true, unlockedPerm: true, vipLocked: false, freeReady: true, freeRollAt: 0, active: null, expired: null, candidates: null }, o);
const stateRaw = (slots, extra) => Object.assign({ cards: 3, cardIcon: '/x.png', cardItemId: 1, isVip: false, slots, config: { freeRollCooldownMs: 4 * H, candidates: 9, rollCostCards: 1, rerollCostCards: 1, rerollBonusCards: 1, pickSpeciesCards: 5, rarities: [], bonuses: [] } }, extra);
const star = (name, id, o) => Object.assign({ speciesId: id, name, looktype: 0, pct: 12, bonusType: 'exp', rarity: 'rare', startedAt: T0, expiresAt: T0 + 2 * H }, o);

// API falsa: `st` é o estado devolvido pelo GET (objeto ou função); `roll[slot]` os candidatos do roll; `fail` derruba uma etapa.
function mkApi(st, opts) {
    opts = opts || {};
    const posts = [];
    const get = () => (typeof st === 'function' ? st() : st);
    return {
        posts,
        api(url, o) {
            if (!o || o.method !== 'POST') return get();
            const b = JSON.parse(o.body); posts.push({ url: url.replace('/api/game/golden-stars', ''), body: b });
            if (url.endsWith('/roll')) {
                if (opts.failRoll) throw new Error(opts.failRoll);
                const cands = (opts.roll && opts.roll[b.slot]) || CANDS;
                return { state: get(), candidates: cands };
            }
            if (url.endsWith('/pick')) {
                if (opts.failPick) throw new Error(opts.failPick);
                const all = CANDS.concat(CANDS2);
                const c = all.find(x => x.speciesId === b.speciesId);
                const now = Date.now();
                return { active: star(c ? c.name : '?', b.speciesId, { startedAt: now, expiresAt: now + 2 * H }), state: get() };
            }
            throw new Error('rota desconhecida ' + url);
        },
    };
}

(async () => {
    // 1) lista de pedidos: vírgula/ponto e vírgula/linha, normalizada, sem repetição; desligado não lê nem pede viagem
    {
        const { api, state } = loadSlotModule({ slotEnabled: false, slotWanted: ' Dratini; larvitar,  Bagon\nDRATINI ' });
        assert(api.slotWantedList().join() === 'dratini,larvitar,bagon', 'lista de pedidos: ' + api.slotWantedList());
        await api.slotTick();
        assert(state.calls.length === 0 && state.trips.length === 0, 'desligado não faz nada');
        assert(/liga para ler/.test(api.slotStatus()), 'status desligado: ' + api.slotStatus());
    }

    // 2) ligado: lê uma vez (log slot-campos + slot), slot 1 com roll grátis -> pede viagem; não relê antes de 30 min; relê aos 30 min
    {
        const m = mkApi(stateRaw([slotRaw({ slot: 0 }), slotRaw({ slot: 1, unlocked: false, freeReady: false })]));
        const { api, state, clock } = loadSlotModule({ slotEnabled: true, slotWanted: 'Dratini' }, { api: m.api });
        await api.slotTick();
        assert(state.calls.length === 1 && state.calls[0].method === 'GET', 'leu a máquina uma vez: ' + JSON.stringify(state.calls));
        const campos = state.logs.find(l => l[0] === 'slot-campos'), lido = state.logs.find(l => l[0] === 'slot');
        assert(campos && campos[1].chaves.includes('slots') && campos[1].slot.includes('freeReady') && campos[1].config.includes('freeRollCooldownMs'), 'log slot-campos: ' + JSON.stringify(campos));
        assert(lido && lido[1].cards === 3 && lido[1].gratisACada === '4h' && lido[1].slots[0].gratis === true && lido[1].slots[1].liberado === false, 'log slot: ' + JSON.stringify(lido));
        assert(state.trips.length === 1 && state.trips[0].key === 'slot' && /slot 1 \(roll grátis\)/.test(state.trips[0].motivo), 'pediu viagem: ' + JSON.stringify(state.trips));
        assert(api.slotWanted() === true && api.slotPending().length === 1, 'carona: quer ir');
        assert(/Slot 1: sem estrela · roll grátis pronto → viagem/.test(api.slotStatus()) && /Slot 2: bloqueado/.test(api.slotStatus()) && /3 cards · roll grátis a cada 4h/.test(api.slotStatus()), 'status: ' + api.slotStatus());
        clock.now = T0 + 20 * MIN;
        await api.slotTick();
        assert(state.calls.length === 1, 'não relê antes do prazo (20 min)');
        assert(state.trips.length === 2, 'mas insiste no pedido de viagem (idempotente no tripRequest real)');
        clock.now = T0 + 30 * MIN;
        await api.slotTick();
        assert(state.calls.length === 2, 'relê aos 30 min');
        assert(state.logs.filter(l => l[0] === 'slot').length === 1, 'estado igual não repete o log slot');
    }

    // 3) sem roll grátis: não pede viagem; relê quando o freeRollAt vence (antes dos 30 min) e aí pede
    {
        let free = false;
        const m = mkApi(() => stateRaw([slotRaw({ slot: 0, freeReady: free, freeRollAt: T0 + 10 * MIN })]));
        const { api, state, clock } = loadSlotModule({ slotEnabled: true, slotWanted: '' }, { api: m.api });
        await api.slotTick();
        assert(state.trips.length === 0 && /grátis em 10min/.test(api.slotStatus()), 'sem roll grátis não pede viagem: ' + api.slotStatus());
        assert(api.slotNextEventAt() === T0 + 10 * MIN, 'próximo prazo = freeRollAt');
        clock.now = T0 + 5 * MIN;
        await api.slotTick();
        assert(state.calls.length === 1, 'antes do prazo não relê');
        free = true; clock.now = T0 + 10 * MIN;
        await api.slotTick();
        assert(state.calls.length === 2 && state.trips.length === 1, 'no prazo relê e pede viagem: ' + JSON.stringify(state.trips));
    }

    // 4) estrela ativa de um pedido + roll grátis pronto: segura até expirar; expirou -> pronto sem reler, e o tique relê e pede
    {
        const m = mkApi(stateRaw([slotRaw({ slot: 0, freeReady: true, active: star('Dratini', 147, { expiresAt: T0 + H }) })]));
        const { api, state, clock } = loadSlotModule({ slotEnabled: true, slotWanted: 'Dratini, Larvitar' }, { api: m.api });
        await api.slotTick();
        assert(state.trips.length === 0 && api.slotReadySlots().length === 0, 'estrela do pedido ativa: não gira');
        assert(/★ Dratini \+12% EXP \(Raro\) até /.test(api.slotStatus()) && /segura o pedido/.test(api.slotStatus()), 'status segurando: ' + api.slotStatus());
        clock.now = T0 + H + 1;
        assert(api.slotReadySlots().length === 1, 'expirou: pronto sem reler');
        await api.slotTick();
        assert(state.calls.length === 2 && state.trips.length === 1, 'tique relê (estrela venceu) e pede viagem');
        // estrela ativa de OUTRO Pokémon não segura
        const n = mkApi(stateRaw([slotRaw({ slot: 0, freeReady: true, active: star('Pidgey', 16) })]));
        const b = loadSlotModule({ slotEnabled: true, slotWanted: 'Dratini' }, { api: n.api });
        await b.api.slotTick();
        assert(b.state.trips.length === 1, 'estrela de outro Pokémon: gira de novo');
    }

    // 5) na cidade (viagem já no shopping): roll grátis, Dratini não saiu, Larvitar sim -> escolhe Larvitar; aviso verde; log; status
    {
        const m = mkApi(stateRaw([slotRaw({ slot: 0 })]));
        const { api, state } = loadSlotModule({ slotEnabled: true, slotWanted: 'Dratini, Larvitar' }, { api: m.api, city: 'shopping' });
        const r = await api.slotCityWork();
        assert(r.ok && r.feitos === 1 && r.falhas === 0, 'resultado: ' + JSON.stringify(r));
        assert(m.posts.length === 2 && m.posts[0].url === '/roll' && m.posts[0].body.slot === 0 && m.posts[1].url === '/pick' && m.posts[1].body.slot === 0 && m.posts[1].body.speciesId === 102, 'roll + pick Larvitar: ' + JSON.stringify(m.posts));
        assert(!state.sent.some(x => x.type === 'set-city'), 'já estava no shopping: sem set-city');
        assert(state.hooks.length === 1 && /girou a Poke Slot Machine: \*\*Larvitar\*\* \+12% EXP/.test(state.hooks[0].content) && /Slot 1: \*\*Larvitar \+12% EXP \(Raro\)\*\* até /.test(state.hooks[0].desc) && /Pedidos: dratini, larvitar/.test(state.hooks[0].desc) && state.hooks[0].color === 0x57f287, 'aviso: ' + state.hooks[0].content + ' | ' + state.hooks[0].desc);
        const log = state.logs.find(l => l[0] === 'slot-roll');
        assert(log && log[1].escolhido === 'Larvitar' && log[1].aleatorio === false && log[1].candidatos.length === 9 && log[1].pedidos.join() === 'dratini,larvitar' && log[1].campos.includes('expiresAt'), 'log slot-roll: ' + JSON.stringify(log));
        assert(api.slotLast.feitos[0].name === 'Larvitar' && /última ida \d\d:\d\d: Larvitar/.test(api.slotStatus()), 'status com a última ida: ' + api.slotStatus());
        assert(api.slotTriedAt[0] === Date.UTC(2026, 9, 2, 12, 0, 0) && api.slotPending().length === 0, 'slot marcado como girado: não insiste');
        assert(state.calls.filter(c => c.method === 'GET').length === 2, 'releu a máquina antes e depois');
    }

    // 6) nenhum pedido saiu: escolhe um dos 9 ao acaso (Math.random controlado), aviso amarelo explica
    {
        const m = mkApi(stateRaw([slotRaw({ slot: 0 })]));
        const { api, state, clock } = loadSlotModule({ slotEnabled: true, slotWanted: 'Dratini' }, { api: m.api, city: 'shopping' });
        clock.rnd = 0.5;   // floor(0.5 * 9) = 4 -> Geodude
        const r = await api.slotCityWork();
        assert(r.ok && m.posts[1].body.speciesId === 104, 'aleatório = Geodude: ' + JSON.stringify(m.posts));
        assert(/\*\*Geodude\*\*/.test(state.hooks[0].content) && /nenhum dos pedidos saiu \(sorteados: Pidgey, Rattata, Larvitar/.test(state.hooks[0].desc) && state.hooks[0].color === 0xfee75c, 'aviso aleatório: ' + state.hooks[0].desc);
        assert(state.logs.find(l => l[0] === 'slot-roll')[1].aleatorio === true && /Geodude \(aleatório\)/.test(api.slotStatus()), 'log/status aleatório: ' + api.slotStatus());
        // sem lista nenhuma: aleatório sem a frase de "pedidos"
        const n = mkApi(stateRaw([slotRaw({ slot: 0 })]));
        const b = loadSlotModule({ slotEnabled: true, slotWanted: '' }, { api: n.api, city: 'shopping' });
        await b.api.slotCityWork();
        assert(n.posts.length === 2 && !/nenhum dos pedidos/.test(b.state.hooks[0].desc) && !/Pedidos:/.test(b.state.hooks[0].desc), 'sem lista: escolhe e não fala de pedidos: ' + b.state.hooks[0].desc);
    }

    // 7) sorteio já feito esperando escolha (alguém rolou na mão): não rola de novo, só escolhe; viagem em outra cidade -> set-city shopping
    {
        const m = mkApi(stateRaw([slotRaw({ slot: 0, freeReady: false, freeRollAt: T0 + 3 * H, candidates: CANDS2 })]));
        const { api, state } = loadSlotModule({ slotEnabled: true, slotWanted: 'Dratini' }, { api: m.api, city: 'cerulean' });
        await api.slotTick();
        assert(state.trips.length === 1 && /sorteio esperando escolha/.test(state.trips[0].motivo) && /9 sorteados esperando escolha/.test(api.slotStatus()), 'pendente pede viagem: ' + api.slotStatus());
        const r = await api.slotCityWork();
        assert(r.ok && m.posts.length === 1 && m.posts[0].url === '/pick' && m.posts[0].body.speciesId === 200, 'só pick, Dratini: ' + JSON.stringify(m.posts));
        assert(state.sent[0]?.type === 'set-city' && state.sent[0].slug === 'shopping' && state.logs.some(l => l[0] === 'slot-cidade' && l[1].para === 'shopping'), 'foi ao shopping antes: ' + JSON.stringify(state.sent));
    }

    // 8) dois slots prontos: cada um escolhe o melhor pedido que saiu (Larvitar no 1, Dratini no 2); bloqueado e VIP ficam de fora
    {
        const m = mkApi(stateRaw([slotRaw({ slot: 0 }), slotRaw({ slot: 1 }), slotRaw({ slot: 2, unlocked: false }), slotRaw({ slot: 3, vipLocked: true })]), { roll: { 0: CANDS, 1: CANDS2 } });
        const { api, state } = loadSlotModule({ slotEnabled: true, slotWanted: 'Dratini, Larvitar' }, { api: m.api, city: 'shopping' });
        await api.slotTick();
        assert(/slot 1 \(roll grátis\), slot 2 \(roll grátis\)/.test(state.trips[0].motivo) && /Slot 3: bloqueado · Slot 4: só VIP/.test(api.slotStatus()), 'dois prontos, dois fora: ' + api.slotStatus());
        const r = await api.slotCityWork();
        assert(r.ok && r.feitos === 2 && m.posts.length === 4 && m.posts[1].body.speciesId === 102 && m.posts[3].body.speciesId === 200 && m.posts[3].body.slot === 1, 'Larvitar no slot 1, Dratini no slot 2: ' + JSON.stringify(m.posts));
        assert(/\*\*Larvitar\*\* \+12% EXP e \*\*Dratini\*\* \+12% EXP/.test(state.hooks[0].content), 'aviso dos dois: ' + state.hooks[0].content);
    }

    // 9) erro no roll: falha avisada (vermelho), 15 min sem insistir no slot nem reler; depois volta
    {
        const m = mkApi(stateRaw([slotRaw({ slot: 0 })]), { failRoll: 'Vá até a máquina primeiro' });
        const { api, state, clock } = loadSlotModule({ slotEnabled: true, slotWanted: 'Dratini' }, { api: m.api, city: 'shopping' });
        const r = await api.slotCityWork();
        assert(!r.ok && /slot 1 roll: Vá até a máquina primeiro/.test(r.motivo) && m.posts.length === 1, 'falha do roll: ' + JSON.stringify(r));
        assert(state.hooks.length === 1 && /não conseguiu girar/.test(state.hooks[0].content) && /⚠ Slot 1: roll: Vá até a máquina primeiro/.test(state.hooks[0].desc) && state.hooks[0].color === 0xed4245, 'aviso vermelho: ' + state.hooks[0].desc);
        assert(state.logs.some(l => l[0] === 'slot-erro' && l[1].etapa === 'roll') && api.slotFailedAt === clock.now, 'log slot-erro e carimbo da falha');
        const gets = state.calls.length;
        clock.now = T0 + 5 * MIN;
        await api.slotTick();
        assert(state.calls.length === gets && state.trips.length === 0 && api.slotWanted() === false, 'em 15 min não relê nem pede viagem');
        clock.now = T0 + 16 * MIN;
        await api.slotTick();
        assert(state.trips.length === 1, 'passados 15 min volta a pedir: ' + JSON.stringify(state.trips));
        // erro de leitura: status avisa, tenta de novo em 15 min
        let quebra = true;
        const n = mkApi(() => { if (quebra) throw new Error('HTTP 500'); return stateRaw([slotRaw({ slot: 0 })]); });
        const b = loadSlotModule({ slotEnabled: true, slotWanted: '' }, { api: n.api });
        await b.api.slotTick();
        assert(b.api.slotState === null && /não consegui ler a máquina/.test(b.api.slotStatus()) && b.state.logs.some(l => l[0] === 'slot-erro' && l[1].etapa === 'leitura'), 'leitura falhou: ' + b.api.slotStatus());
        b.clock.now = T0 + 5 * MIN; await b.api.slotTick();
        assert(b.state.calls.length === 1, 'não insiste na leitura antes de 15 min');
        quebra = false; b.clock.now = T0 + 16 * MIN; await b.api.slotTick();
        assert(b.state.calls.length === 2 && b.state.trips.length === 1, 'releu e pediu viagem');
    }

    // 10) na cidade sem slot pronto (outro painel/jogador girou antes): tarefa não faz nada e não avisa
    {
        const m = mkApi(stateRaw([slotRaw({ slot: 0, freeReady: false, freeRollAt: T0 + H, active: star('Pidgey', 16) })]));
        const { api, state } = loadSlotModule({ slotEnabled: true, slotWanted: 'Dratini' }, { api: m.api, city: 'shopping' });
        const r = await api.slotCityWork();
        assert(r.ok && /nenhum slot com roll grátis/.test(r.motivo) && m.posts.length === 0 && state.hooks.length === 0 && state.sent.length === 0, 'nada a fazer: ' + JSON.stringify(r));
    }

    console.log('OK slot.test — leitura por prazo, pedido de viagem, roll grátis + escolha do pedido (ou aleatório), segura a estrela do pedido, shopping, dois slots, erros com 15 min');
})().catch(e => { console.error(e); process.exit(1); });
