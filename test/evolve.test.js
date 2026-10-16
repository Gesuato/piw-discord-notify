// Evolução automática (v3.25.0): quem do time chega ao nível pede viagem; na cidade evolui com pedra (GET/POST
// /api/game/evolve), mantém o nível, avisa; sem pedra avisa uma vez; linha ramificada só com um destino pronto.
// v3.39.0: pedra que falta é buscada no Depot comum (withdraw, pilha inteira) e na família (quantidade exata); só quando as fontes
// completam a conta e, em linha ramificada, só se completam UM destino.
// Rodar: node test/evolve.test.js
const { loadEvolveModule, assert } = require('./harness');

const P = (o) => Object.assign({ id: 'x', name: 'Mon', level: 10, team: true, hasEvolution: true, evolveNeedLevel: 16, evolvesToName: 'Dest' }, o);
const TIME = [
    P({ id: 'char', name: 'Charmander', level: 16, evolveNeedLevel: 16, evolvesToName: 'Charmeleon' }),       // pronto
    P({ id: 'pidg', name: 'Pidgey', level: 12, evolveNeedLevel: 18, evolvesToName: 'Pidgeotto' }),           // abaixo
    P({ id: 'box', name: 'Bulbasaur', level: 40, team: false, evolveNeedLevel: 16, evolvesToName: 'Ivysaur' }), // no box: não conta
    P({ id: 'final', name: 'Raichu', level: 50, hasEvolution: false, evolveNeedLevel: null, evolvesToName: null }), // estágio final
];
const evoApi = (resp, posts) => (url, opts) => {
    if (opts?.method === 'POST') { const b = JSON.parse(opts.body); posts.push(b); const r = resp[b.capturedId]; return { name: (b.destId != null && r?.branches?.find(x => x.destId === b.destId)?.destName) || r?.destName || 'Evoluido' }; }
    const id = decodeURIComponent(url.split('capturedId=')[1].split('&')[0]);
    return resp[id] || { canEvolve: false };
};

(async () => {
    // 1) frame `pokes`: só o do time no nível pede viagem, uma vez por episódio; desligado não pede
    {
        const { api, state } = loadEvolveModule({ evolveEnabled: true });
        api.evolveOnPokes(TIME);
        assert(api.evolveTeam.length === 2 && api.evolveCandidates().map(p => p.id).join() === 'char', 'time com evolução: 2; pronto: char');
        assert(state.trips.length === 1 && state.trips[0].key === 'evoluir' && /Charmander lv 16 → Charmeleon/.test(state.trips[0].motivo), 'pediu viagem: ' + JSON.stringify(state.trips));
        api.evolveOnPokes(TIME);
        assert(state.trips.length === 1, 'não pede de novo no mesmo episódio');
        assert(api.evolveWanted() === true, 'carona: quer evoluir');
        assert(/Charmander 16\/16 → Charmeleon ✔ viagem pedida/.test(api.evolveStatus()) && /Pidgey 12\/18/.test(api.evolveStatus()), 'status: ' + api.evolveStatus());

        const off = loadEvolveModule({ evolveEnabled: false });
        off.api.evolveOnPokes(TIME);
        assert(off.state.trips.length === 0 && off.api.evolveWanted() === false, 'desligado não pede viagem');
        off.api.evolveOnPokeXp({ leveledUp: true });
        assert(off.state.pokesReqs === 0, 'desligado não confere o time');
        api.evolveOnPokeXp({ leveledUp: true }); api.evolveOnPokeXp({ leveledUp: false });
        assert(state.pokesReqs === 1, 'leveledUp confere o time (pokes-get) uma vez');
    }

    // 2) na cidade: GET diz que pode e tem pedra -> POST useStone:true, aviso, pokes-get; o frame novo rearma
    {
        const posts = [];
        const resp = { char: { name: 'Charmander', level: 16, needLevel: 16, canEvolve: true, hasStones: true, keepLevel: 16, destName: 'Charmeleon', stones: [{ itemId: 300, name: 'Fire Stone', need: 2, have: 5 }] } };
        const { api, state } = loadEvolveModule({ evolveEnabled: true }, { api: evoApi(resp, posts) });
        api.evolveOnPokes(TIME);
        const r = await api.evolveCityWork();
        assert(posts.length === 1 && posts[0].capturedId === 'char' && posts[0].useStone === true && !('destId' in posts[0]), 'POST com pedra: ' + JSON.stringify(posts));
        assert(r.ok && r.feitos === 1 && r.falhas === 0, 'resultado: ' + JSON.stringify(r));
        assert(state.hooks.length === 1 && /evoluiu \*\*Charmander\*\* em \*\*Charmeleon\*\*/.test(state.hooks[0].content) && /lv 16 mantido, gastou 2x Fire Stone/.test(state.hooks[0].desc), 'aviso: ' + state.hooks[0].content + ' | ' + state.hooks[0].desc);
        assert(state.sent.some(m => m.type === 'pokes-get') && !state.sent.some(m => m.type === 'set-city'), 'relê o time; já estava em Cerulean');
        const log = state.logs.find(l => l[0] === 'evolucao');
        assert(log && log[1].ok === true && log[1].para === 'Charmeleon' && Array.isArray(log[1].campos), 'log evolucao: ' + JSON.stringify(log));
        // time novo: Charmeleon (precisa 36) -> candidato some, episódio rearmado
        api.evolveOnPokes([P({ id: 'char', name: 'Charmeleon', level: 16, evolveNeedLevel: 36, evolvesToName: 'Charizard' })]);
        assert(api.evolveCandidates().length === 0 && !api.evolveAttempted.char, 'estágio novo abaixo do nível: rearmado');
        assert(/última viagem: evoluiu Charmeleon/.test(api.evolveStatus()), 'status com a última viagem: ' + api.evolveStatus());
    }

    // 3) sem pedra: não evolui (nunca a grátis), avisa uma vez; na viagem seguinte com o mesmo motivo não repete o aviso
    {
        const posts = [];
        const resp = { char: { name: 'Charmander', level: 16, needLevel: 16, canEvolve: true, hasStones: false, destName: 'Charmeleon', stones: [{ itemId: 300, name: 'Fire Stone', need: 2, have: 0 }] } };
        const { api, state } = loadEvolveModule({ evolveEnabled: true }, { api: evoApi(resp, posts) });
        api.evolveOnPokes(TIME);
        const r = await api.evolveCityWork();
        assert(posts.length === 0 && !r.ok && /faltam pedras \(2x Fire Stone \(tem 0\)\)/.test(r.motivo), 'sem pedra não evolui: ' + JSON.stringify(r));
        assert(state.hooks.length === 1 && /não conseguiu evoluir \*\*Charmander\*\*/.test(state.hooks[0].content), 'avisou a falha: ' + state.hooks[0].content);
        await api.evolveCityWork();
        assert(state.hooks.length === 1 && state.calls.filter(c => c.method === 'GET').length === 2, '2ª viagem: tenta de novo, não repete o aviso');
        assert(api.evolveWanted() === true, 'segue querendo (carona nas próximas viagens)');
    }

    // 4) linha ramificada: com pedra para um destino só -> POST com destId; com dois prontos -> não escolhe
    {
        const posts = [];
        const ramos = [
            { destId: 134, destName: 'Vaporeon', needLevel: 20, canEvolve: true, hasStones: true, stones: [{ itemId: 301, name: 'Water Stone', need: 1, have: 1 }] },
            { destId: 135, destName: 'Jolteon', needLevel: 20, canEvolve: true, hasStones: false, stones: [{ itemId: 302, name: 'Thunder Stone', need: 1, have: 0 }] },
        ];
        const resp = { eevee: { name: 'Eevee', level: 20, needLevel: 20, canEvolve: true, hasStones: false, destName: '???', stones: [], branches: ramos } };
        const { api, state } = loadEvolveModule({ evolveEnabled: true }, { api: evoApi(resp, posts) });
        api.evolveOnPokes([P({ id: 'eevee', name: 'Eevee', level: 20, evolveNeedLevel: 20, evolvesToName: null })]);
        const r = await api.evolveCityWork();
        assert(posts.length === 1 && posts[0].destId === 134 && posts[0].useStone === true && r.feitos === 1, 'ramo único com pedra: ' + JSON.stringify(posts));
        assert(/Eevee → \*\*Vaporeon\*\*/.test(state.hooks[0].desc), 'aviso do ramo: ' + state.hooks[0].desc);

        ramos[1].hasStones = true;
        const posts2 = [];
        const b = loadEvolveModule({ evolveEnabled: true }, { api: evoApi(resp, posts2) });
        b.api.evolveOnPokes([P({ id: 'eevee', name: 'Eevee', level: 20, evolveNeedLevel: 20, evolvesToName: null })]);
        const r2 = await b.api.evolveCityWork();
        assert(posts2.length === 0 && !r2.ok && /ramificada com pedra para Vaporeon e Jolteon/.test(r2.motivo), 'dois ramos prontos: escolha no jogo: ' + JSON.stringify(r2));
    }

    // 5) cidade da viagem não é Cerulean: manda set-city cerulean antes; erro do POST vira falha com motivo
    {
        const posts = [];
        const resp = { char: { name: 'Charmander', level: 16, needLevel: 16, canEvolve: true, hasStones: true, destName: 'Charmeleon', stones: [] } };
        const api1 = (url, opts) => { if (opts?.method === 'POST') throw new Error('Evolution is only allowed in Cerulean'); return evoApi(resp, posts)(url, opts); };
        const { api, state } = loadEvolveModule({ evolveEnabled: true }, { api: api1, city: 'pewter' });
        api.evolveOnPokes(TIME);
        const r = await api.evolveCityWork();
        assert(state.sent[0]?.type === 'set-city' && state.sent[0].slug === 'cerulean', 'foi para Cerulean antes: ' + JSON.stringify(state.sent));
        assert(!r.ok && /erro: Evolution is only allowed in Cerulean/.test(r.motivo) && state.hooks.length === 1, 'erro do jogo vira falha avisada: ' + JSON.stringify(r));
    }

    // 6) ninguém no nível: tarefa não faz nada; `canEvolve:false` do jogo (nível) também não evolui
    {
        const posts = [];
        const resp = { char: { name: 'Charmander', level: 15, needLevel: 16, canEvolve: false, hasStones: true, destName: 'Charmeleon', stones: [] } };
        const { api, state } = loadEvolveModule({ evolveEnabled: true }, { api: evoApi(resp, posts) });
        let r = await api.evolveCityWork();
        assert(r.ok && /ninguém/.test(r.motivo) && state.calls.length === 0, 'sem candidato não chama a API');
        api.evolveOnPokes(TIME);
        r = await api.evolveCityWork();
        assert(posts.length === 0 && !r.ok && /ainda não pode \(nível 15, precisa 16\)/.test(r.motivo), 'jogo recusa pelo nível: ' + JSON.stringify(r));
    }

    // ---- v3.39.0: pedra que falta é buscada no Depot comum e no depósito da família ----
    // API com estado: a mochila (`bag`) decide `have`/`hasStones`; o Depot (`depot`) entrega a pilha inteira no withdraw;
    // a família entra pela retirada do harness (`init.familyWithdraw` soma na mochila).
    function stoneApi(st) {
        const stones = (lista) => lista.map(s => Object.assign({}, s, { have: st.bag[s.itemId] || 0 }));
        const has = (lista) => stones(lista).every(s => s.have >= s.need);
        return (url, opts) => {
            if (url === '/api/game/depot') { st.depotGets = (st.depotGets || 0) + 1; return { inventory: [], depot: st.depot.map(d => Object.assign({}, d)) }; }
            if (url === '/api/game/depot/move') {
                const b = JSON.parse(opts.body); st.moves.push(b);
                const i = st.depot.findIndex(d => d.id === b.itemId); if (i < 0) throw new Error('não está no depot');
                if (b.dir === 'withdraw') { st.bag[b.itemId] = (st.bag[b.itemId] || 0) + st.depot[i].quantity; st.depot.splice(i, 1); }
                return { inventory: [], depot: st.depot };
            }
            if (opts?.method === 'POST') {
                const b = JSON.parse(opts.body); st.posts.push(b);
                const r = st.resp[b.capturedId];
                const lista = b.destId != null ? r.branches.find(x => x.destId === b.destId).stones : r.stones;
                if (!has(lista)) throw new Error('Missing stones');
                for (const s of lista) st.bag[s.itemId] -= s.need;
                return { name: (b.destId != null && r.branches.find(x => x.destId === b.destId).destName) || r.destName };
            }
            const id = decodeURIComponent(url.split('capturedId=')[1].split('&')[0]);
            const r = st.resp[id];
            const out = Object.assign({}, r, { stones: stones(r.stones || []), hasStones: has(r.stones || []) });
            if (r.branches) out.branches = r.branches.map(b => Object.assign({}, b, { stones: stones(b.stones), hasStones: has(b.stones) }));
            return out;
        };
    }
    const CHAR = { char: { name: 'Charmander', level: 16, needLevel: 16, canEvolve: true, destName: 'Charmeleon', stones: [{ itemId: 300, name: 'Fire Stone', need: 2 }] } };
    const famWithdraw = (st) => (itemId, qty) => { st.bag[itemId] = (st.bag[itemId] || 0) + qty; return { ok: true }; };

    // 7) mochila vazia, Depot tem a pilha: GET depot -> withdraw (pilha inteira) -> relê a janela -> POST evolve
    {
        const st = { bag: {}, depot: [{ id: 300, name: 'Fire Stone', quantity: 3 }, { id: 301, name: 'Water Stone', quantity: 9 }], moves: [], posts: [], resp: CHAR };
        const { api, state } = loadEvolveModule({ evolveEnabled: true, evolveFromDepot: true, evolveFromFamily: true }, { api: stoneApi(st) });
        api.evolveOnPokes(TIME);
        const r = await api.evolveCityWork();
        assert(st.moves.length === 1 && st.moves[0].itemId === 300 && st.moves[0].dir === 'withdraw', 'retirou só a Fire Stone do Depot: ' + JSON.stringify(st.moves));
        assert(st.posts.length === 1 && st.posts[0].useStone === true && r.ok && r.feitos === 1, 'evoluiu depois de buscar: ' + JSON.stringify(r));
        assert(st.bag[300] === 1, 'sobrou 1 na mochila (pilha inteira de 3, gastou 2): ' + JSON.stringify(st.bag));
        assert(state.sent.some(m => m.type === 'family-get') && state.familyWithdraws.length === 0, 'leu a família (vazia) e não retirou dela');
        const lp = state.logs.find(l => l[0] === 'evolucao-pedras');
        assert(lp && lp[1].ok === true && lp[1].doDepot === 3 && lp[1].daFamilia === 0 && lp[1].item === 'Fire Stone', 'log evolucao-pedras: ' + JSON.stringify(lp));
        const le = state.logs.find(l => l[0] === 'evolucao');
        assert(le && le[1].ok === true && le[1].buscouPedras === 'Charmeleon', 'log evolucao marca a busca: ' + JSON.stringify(le));
        assert(state.hooks.length === 1 && /evoluiu \*\*Charmander\*\* em \*\*Charmeleon\*\*/.test(state.hooks[0].content), 'aviso de evolução: ' + state.hooks[0].content);
        const gets = state.calls.filter(c => c.method === 'GET' && c.url.startsWith('/api/game/evolve'));
        assert(gets.length === 2, 'releu a janela de evolução depois da busca: ' + gets.length);
    }

    // 8) Depot cobre parte, família completa: withdraw do Depot + family-action com a quantidade EXATA que falta
    {
        const st = { bag: { 300: 0 }, depot: [{ id: 300, name: 'Fire Stone', quantity: 1 }], moves: [], posts: [], resp: CHAR };
        const { api, state } = loadEvolveModule({ evolveEnabled: true, evolveFromDepot: true, evolveFromFamily: true },
            { api: stoneApi(st), family: [{ itemId: 300, name: 'Fire Stone', quantity: 5 }], familyWithdraw: famWithdraw(st) });
        api.evolveOnPokes(TIME);
        const r = await api.evolveCityWork();
        assert(st.moves.length === 1 && state.familyWithdraws.length === 1 && state.familyWithdraws[0].itemId === 300 && state.familyWithdraws[0].quantity === 1, 'Depot 1 + família 1: ' + JSON.stringify(state.familyWithdraws));
        assert(r.ok && st.posts.length === 1 && st.bag[300] === 0, 'evoluiu e gastou as 2: ' + JSON.stringify({ r, bag: st.bag }));
        const lp = state.logs.find(l => l[0] === 'evolucao-pedras');
        assert(lp[1].doDepot === 1 && lp[1].daFamilia === 1 && lp[1].ok === true, 'log da busca mista: ' + JSON.stringify(lp));
    }

    // 9) Depot + família não completam: não mexe em nada e o motivo mostra onde olhou; família muda entra no motivo
    {
        const st = { bag: {}, depot: [], moves: [], posts: [], resp: CHAR };
        const { api, state } = loadEvolveModule({ evolveEnabled: true, evolveFromDepot: true, evolveFromFamily: true },
            { api: stoneApi(st), family: [{ itemId: 300, name: 'Fire Stone', quantity: 1 }], familyWithdraw: famWithdraw(st) });
        api.evolveOnPokes(TIME);
        const r = await api.evolveCityWork();
        assert(st.moves.length === 0 && state.familyWithdraws.length === 0 && st.posts.length === 0, 'não retirou nada (1 na família não basta)');
        assert(!r.ok && /faltam pedras \(2x Fire Stone \(tem 0, depot 0, família 1\)\)/.test(r.motivo), 'motivo com as fontes: ' + r.motivo);
        assert(state.hooks.length === 1 && /não conseguiu evoluir/.test(state.hooks[0].content), 'avisou a falha');

        const st2 = { bag: {}, depot: [], moves: [], posts: [], resp: CHAR };
        const mudo = loadEvolveModule({ evolveEnabled: true, evolveFromDepot: false, evolveFromFamily: true }, { api: stoneApi(st2), familyReply: false });
        mudo.api.evolveOnPokes(TIME);
        const r2 = await mudo.api.evolveCityWork();
        assert(!r2.ok && /família: a família não respondeu/.test(r2.motivo) && !st2.depotGets, 'família muda e Depot desligado: ' + r2.motivo);
    }

    // 10) busca desligada (as duas opções falsas): nem lê o Depot nem a família
    {
        const st = { bag: {}, depot: [{ id: 300, name: 'Fire Stone', quantity: 3 }], moves: [], posts: [], resp: CHAR };
        const { api, state } = loadEvolveModule({ evolveEnabled: true, evolveFromDepot: false, evolveFromFamily: false }, { api: stoneApi(st), family: [{ itemId: 300, quantity: 9 }] });
        api.evolveOnPokes(TIME);
        const r = await api.evolveCityWork();
        assert(!r.ok && !st.depotGets && st.moves.length === 0 && !state.sent.some(m => m.type === 'family-get') && /faltam pedras \(2x Fire Stone \(tem 0\)\)/.test(r.motivo), 'desligado não busca: ' + r.motivo);
    }

    // 11) linha ramificada: a família completa UM destino só -> busca e evolui para ele; dois destinos completáveis -> escolha no jogo
    {
        const ramos = [
            { destId: 134, destName: 'Vaporeon', needLevel: 20, canEvolve: true, stones: [{ itemId: 301, name: 'Water Stone', need: 1 }] },
            { destId: 135, destName: 'Jolteon', needLevel: 20, canEvolve: true, stones: [{ itemId: 302, name: 'Thunder Stone', need: 1 }] },
        ];
        const EEVEE = { eevee: { name: 'Eevee', level: 20, needLevel: 20, canEvolve: true, destName: '???', stones: [], branches: ramos } };
        const st = { bag: {}, depot: [], moves: [], posts: [], resp: EEVEE };
        const { api, state } = loadEvolveModule({ evolveEnabled: true, evolveFromDepot: true, evolveFromFamily: true },
            { api: stoneApi(st), family: [{ itemId: 301, name: 'Water Stone', quantity: 2 }], familyWithdraw: famWithdraw(st) });
        api.evolveOnPokes([P({ id: 'eevee', name: 'Eevee', level: 20, evolveNeedLevel: 20, evolvesToName: null })]);
        const r = await api.evolveCityWork();
        assert(state.familyWithdraws.length === 1 && state.familyWithdraws[0].itemId === 301 && st.posts.length === 1 && st.posts[0].destId === 134 && r.feitos === 1, 'ramo único completável: ' + JSON.stringify({ w: state.familyWithdraws, posts: st.posts }));

        const st2 = { bag: {}, depot: [{ id: 302, name: 'Thunder Stone', quantity: 1 }], moves: [], posts: [], resp: EEVEE };
        const b = loadEvolveModule({ evolveEnabled: true, evolveFromDepot: true, evolveFromFamily: true },
            { api: stoneApi(st2), family: [{ itemId: 301, name: 'Water Stone', quantity: 2 }], familyWithdraw: famWithdraw(st2) });
        b.api.evolveOnPokes([P({ id: 'eevee', name: 'Eevee', level: 20, evolveNeedLevel: 20, evolvesToName: null })]);
        const r2 = await b.api.evolveCityWork();
        assert(st2.moves.length === 0 && b.state.familyWithdraws.length === 0 && st2.posts.length === 0 && /ramificada com pedra \(Depot\/família\) para Vaporeon e Jolteon: escolha no jogo/.test(r2.motivo), 'dois ramos completáveis: não mexe: ' + r2.motivo);
    }

    // 12) retirada da família falha (limite do dia) -> não evolui, motivo diz a causa; nível abaixo -> nem olha o Depot
    {
        const st = { bag: {}, depot: [], moves: [], posts: [], resp: CHAR };
        const { api, state } = loadEvolveModule({ evolveEnabled: true, evolveFromDepot: true, evolveFromFamily: true },
            { api: stoneApi(st), family: [{ itemId: 300, name: 'Fire Stone', quantity: 5 }], familyWithdraw: () => ({ ok: false, motivo: 'limite diário de movimentos (50/50)' }) });
        api.evolveOnPokes(TIME);
        const r = await api.evolveCityWork();
        assert(st.posts.length === 0 && !r.ok && /busca das pedras falhou \(Fire Stone: família: limite diário de movimentos/.test(r.motivo), 'falha da família: ' + r.motivo);
        const lp = state.logs.find(l => l[0] === 'evolucao-pedras');
        assert(lp && lp[1].ok === false && /limite diário/.test(lp[1].motivo), 'log da falha: ' + JSON.stringify(lp));

        const st2 = { bag: {}, depot: [{ id: 300, name: 'Fire Stone', quantity: 3 }], moves: [], posts: [], resp: { char: Object.assign({}, CHAR.char, { level: 15, canEvolve: false }) } };
        const c = loadEvolveModule({ evolveEnabled: true, evolveFromDepot: true, evolveFromFamily: true }, { api: stoneApi(st2) });
        c.api.evolveOnPokes(TIME);
        const r2 = await c.api.evolveCityWork();
        assert(!r2.ok && !st2.depotGets && st2.moves.length === 0 && /ainda não pode/.test(r2.motivo), 'sem nível não busca pedra: ' + r2.motivo);
    }

    console.log('OK evolve.test — pedido de viagem no nível, evolução com pedra (mantém o nível), sem pedra avisa uma vez, linha ramificada, Cerulean, recusas e busca das pedras no Depot/família (v3.39.0)');
})().catch(e => { console.error(e); process.exit(1); });
