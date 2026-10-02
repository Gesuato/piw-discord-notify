// IV/qualidade da captura: espera pelo poke-delta, plano B (pokes-get) e delta atrasado (v3.24.1).
// Caso real de 02/10/2026: o jogo mandou o poke-delta 5–8 s depois do catch-result e o aviso saía
// "sem dados de qualidade", sem filtro. Rodar: node test/details.test.js
const { loadDetailsModule, assert } = require('./harness');

// As Promises do withDetails resolvem no microtask seguinte: as checagens ficam encadeadas em `pending`
// (uma rodada por await) e rodam no fim, na ordem em que foram pedidas.
const pending = [];
function return_after_tick(fn) { pending.push(fn); }

const CFG = { minTier: 'legendary', minIv: 170, minTierIv: 110 };
function socket(state) { return { readyState: 1, send: (d) => state.sent.push(JSON.parse(d)) }; }
function diglett(id, iv, q, extra) { return Object.assign({ id, speciesId: 50, name: 'Diglett', level: 1, shiny: false, team: false, xp: 0, ivTotal: iv, quality: q }, extra || {}); }
function logs(state, kind) { return state.logs.filter(l => l[0] === kind); }

// 1) caminho normal: delta chega na hora, nada mais é pedido e nenhum timer sobra
{
    const { api, state } = loadDetailsModule({ ...CFG });
    api.setSocket(socket(state));
    let got = null;
    api.withDetails({ name: 'Diglett', shiny: false, level: null }).then(i => { got = i; });
    assert(api.awaiting === 1, 'captura na fila');
    api.handlePokeDelta({ type: 'poke-delta', poke: diglett('a1', 120, 1.321) });
    return_after_tick(() => {
        assert(got && got.ivTotal === 120 && got.quality === 1.321 && got.level === 1 && got.pokeId === 'a1', 'delta aplicado: ' + JSON.stringify(got));
        assert(api.awaiting === 0 && state.timers.length === 0 && state.sent.length === 0, 'fila vazia, timers limpos, nada pedido');
        assert(api.passesQualityFilter(got).ok === false, 'Rare 120 fica abaixo do mínimo (legendary / 170)');
        assert(state.recent.includes('a1'), 'noteRecentCapture recebeu o id');
    });
}

// 2) delta atrasado 7 s (caso do log): aos 4 s pede pokes-get; lista ambígua (vários Diglett xp 0 e nenhum frame
//    anterior) NÃO fecha a captura; o delta chega e a decisão sai com IV
{
    const { api, state } = loadDetailsModule({ ...CFG });
    api.setSocket(socket(state));
    let got = null;
    api.withDetails({ name: 'Diglett', shiny: false, level: null }).then(i => { got = i; });
    state.fire(4000);
    assert(state.sent.length === 1 && state.sent[0].type === 'pokes-get', 'sem delta em 4 s: pediu pokes-get');
    assert(logs(state, 'pokes-get')[0][1].motivo.includes('não chegou'), 'motivo no log');
    api.handlePokesList([diglett('old1', 90, 1.0), diglett('old2', 100, 1.1), diglett('new', 150, 1.4)]);
    assert(api.awaiting === 1, 'lista ambígua (3 novos): segue esperando o delta');
    assert(logs(state, 'pokes')[0][1].candidatos === 3 && logs(state, 'pokes')[0][1].achou === null, 'log pokes com candidatos=3');
    api.handlePokeDelta({ type: 'poke-delta', poke: diglett('new', 150, 1.4) });
    return_after_tick(() => {
        assert(got && got.ivTotal === 150 && got.quality === 1.4 && !got.detailsTimeout, 'delta atrasado (dentro dos 20 s) aplicado: ' + JSON.stringify(got));
        assert(api.awaiting === 0 && state.timers.length === 0, 'fila vazia, timers limpos');
    });
}

// 3) plano B inequívoco: frame `pokes` anterior à captura conhecia old1/old2; o novo frame traz também `new`
//    (xp 0, sem delta visto) -> é ele; captura fecha pela lista, sem esperar o delta
{
    const { api, state } = loadDetailsModule({ ...CFG });
    api.setSocket(socket(state));
    api.handlePokesList([diglett('old1', 90, 1.0), diglett('old2', 100, 1.1)]);   // frame de rotina, antes da captura
    state.clock.now += 30000;
    let got = null;
    api.withDetails({ name: 'Diglett', shiny: false, level: null }).then(i => { got = i; });
    state.fire(4000);
    api.handlePokesList([diglett('old1', 90, 1.0), diglett('old2', 100, 1.1), diglett('new', 175, 1.05)]);
    return_after_tick(() => {
        assert(got && got.ivTotal === 175 && got.pokeId === 'new', 'único novo da espécie casado pela lista: ' + JSON.stringify(got));
        assert(api.passesQualityFilter(got).ok === true, 'poder 175 >= 170 passa');
        assert(api.awaiting === 0 && state.timers.length === 0, 'fila vazia, timers limpos');
    });
}

// 4) exemplar com delta já visto não é candidato; o do time (xp alto) nunca é
{
    const { api, state } = loadDetailsModule({ ...CFG });
    api.setSocket(socket(state));
    api.handlePokeDelta({ type: 'poke-delta', poke: diglett('seen', 60, 1.0) });   // captura antiga (sem ninguém na fila)
    state.clock.now += 10000;   // bem antes da captura de agora: já saiu do buffer de 3 s
    let got = null;
    api.withDetails({ name: 'Diglett', shiny: false, level: null }).then(i => { got = i; });
    api.handlePokeDelta({ type: 'poke-delta', poke: { id: 'lider', name: 'Tyranitar', level: 451, team: true, xp: 2880753816, ivTotal: 151, quality: 1.8 } });
    assert(api.awaiting === 1 && got === null, 'delta do líder (xp alto) não fecha a captura');
    state.fire(4000);
    api.handlePokesList([diglett('seen', 60, 1.0), diglett('new', 130, 1.2), { id: 'lider', name: 'Diglett', level: 40, team: true, xp: 999, ivTotal: 180, quality: 2.0 }]);
    return_after_tick(() => {
        assert(got && got.pokeId === 'new' && got.ivTotal === 130, 'ignora o já visto e o com xp: ' + JSON.stringify(got));
    });
}

// 5) timeout total: sai sem dados (marcado); um delta que chegue muito depois, sem captura esperando, fica no
//    buffer só por 3 s e NÃO vai para a captura seguinte que vier depois disso
{
    const { api, state } = loadDetailsModule({ ...CFG });
    api.setSocket(socket(state));
    let first = null, second = null;
    api.withDetails({ name: 'Phanpy', shiny: false, level: null }).then(i => { first = i; });
    state.fire(4000);
    state.fire(20000);
    return_after_tick(() => {
        assert(first && first.ivTotal == null && first.quality == null && first.detailsTimeout === true, 'timeout: sem dados e marcado: ' + JSON.stringify(first));
        assert(api.passesQualityFilter(first).ok === false && /sem dados de qualidade/.test(api.passesQualityFilter(first).motivo), 'v3.24.6: sem dados NÃO avisa com filtro ligado');
        {   // sem filtro nenhum configurado, continua avisando (não há o que filtrar)
            const livre = loadDetailsModule({ minTier: '', minIv: 0, minTierIv: 0 });
            assert(livre.api.passesQualityFilter(first).ok === true, 'sem filtro: passa mesmo sem dados');
        }
        const t = logs(state, 'detalhes-timeout');
        assert(t.length === 1 && t[0][1].pediuPokes === true && t[0][1].esperaMs === 20000, 'log do timeout: ' + JSON.stringify(t));
        api.handlePokeDelta({ type: 'poke-delta', poke: { id: 'late', name: 'Phanpy', level: 1, xp: 0, ivTotal: 58, quality: 0.975 } });
        assert(api.pendentes === 1 && api.awaiting === 0, 'delta sem captura esperando fica pendente');
        state.clock.now += 5000;   // passou a janela de 3 s
        api.withDetails({ name: 'Phanpy', shiny: false, level: null }).then(i => { second = i; });
        assert(api.awaiting === 1 && api.pendentes === 0 && logs(state, 'poke-delta-antes').length === 0, 'delta velho não vai para a captura nova');
        api.handlePokeDelta({ type: 'poke-delta', poke: { id: 'ok', name: 'Phanpy', level: 1, xp: 0, ivTotal: 140, quality: 1.7 } });
        return_after_tick(() => {
            assert(second && second.ivTotal === 140 && second.pokeId === 'ok', '2ª captura recebe o próprio delta: ' + JSON.stringify(second));
            assert(api.awaiting === 0 && state.timers.length === 0, 'fila vazia');
        });
    });
}

// 5b) caso real de 02/10/2026 16:50Z: o poke-delta chega ANTES do catch-result (mesmo ms). A captura pega o delta
//     pendente na hora: sem pokes-get, sem timers; o delta da captura seguinte não é roubado
{
    const { api, state } = loadDetailsModule({ ...CFG });
    api.setSocket(socket(state));
    let first = null, second = null;
    api.handlePokeDelta({ type: 'poke-delta', poke: diglett('d1', 144, 1.2) });
    assert(api.pendentes === 1 && state.recent.includes('d1'), 'delta adiantado guardado');
    state.clock.now += 1;
    api.withDetails({ name: 'Diglett', shiny: false, level: null }).then(i => { first = i; });
    assert(api.awaiting === 0 && api.pendentes === 0 && state.timers.length === 0 && state.sent.length === 0, 'pegou o delta adiantado na hora');
    const antes = logs(state, 'poke-delta-antes');
    assert(antes.length === 1 && antes[0][1].ivTotal === 144 && antes[0][1].antesMs === 1, 'log poke-delta-antes: ' + JSON.stringify(antes));
    state.clock.now += 3000;
    api.handlePokeDelta({ type: 'poke-delta', poke: diglett('d2', 60, 1.0) });   // captura seguinte, delta primeiro de novo
    api.withDetails({ name: 'Diglett', shiny: false, level: null }).then(i => { second = i; });
    return_after_tick(() => {
        assert(first && first.ivTotal === 144 && first.pokeId === 'd1', '1ª com o próprio delta: ' + JSON.stringify(first));
        assert(second && second.ivTotal === 60 && second.pokeId === 'd2', '2ª com o próprio delta: ' + JSON.stringify(second));
    });
}

// 5d) caso real de 02/10/2026 17:34Z: o delta de UMA captura não vem. As seguintes (catch-result + delta em ms)
//     recebem o PRÓPRIO delta (par pelo tempo), e só a captura sem delta estoura o timeout
{
    const { api, state } = loadDetailsModule({ ...CFG });
    api.setSocket(socket(state));
    const got = [];
    api.withDetails({ name: 'Diglett', shiny: false, level: null }).then(i => { got[0] = i; });   // A: delta nunca vem
    state.clock.now += 12000;
    api.withDetails({ name: 'Diglett', shiny: false, level: null }).then(i => { got[1] = i; });   // B
    state.clock.now += 5;
    api.handlePokeDelta({ type: 'poke-delta', poke: diglett('b', 90, 1.546) });
    assert(api.awaiting === 1 && api.pendentes === 0, 'delta de B foi para B (não para A, a mais antiga)');
    state.clock.now += 7000;
    api.withDetails({ name: 'Diglett', shiny: false, level: null }).then(i => { got[2] = i; });   // C
    state.clock.now += 3;
    api.handlePokeDelta({ type: 'poke-delta', poke: diglett('c', 124, 1.066) });
    assert(api.awaiting === 1, 'delta de C foi para C');
    state.fire(20000);   // A estoura (e os pokes-get de 4 s ficam sem resposta, como no jogo hoje)
    return_after_tick(() => {
        assert(got[1] && got[1].pokeId === 'b' && got[1].ivTotal === 90, 'B com o próprio delta: ' + JSON.stringify(got[1]));
        assert(got[2] && got[2].pokeId === 'c' && got[2].ivTotal === 124, 'C com o próprio delta: ' + JSON.stringify(got[2]));
        assert(got[0] && got[0].ivTotal == null && got[0].detailsTimeout === true, 'só A saiu sem dados: ' + JSON.stringify(got[0]));
        assert(api.awaiting === 0 && state.timers.length === 0, 'fila vazia');
    });
}

// 5e) delta atrasado (jogo lento) sem captura recente continua indo para a mais antiga (FIFO como reserva)
{
    const { api, state } = loadDetailsModule({ ...CFG });
    api.setSocket(socket(state));
    const got = [];
    api.withDetails({ name: 'Phanpy', shiny: false, level: null }).then(i => { got[0] = i; });
    state.clock.now += 6000;
    api.withDetails({ name: 'Phanpy', shiny: false, level: null }).then(i => { got[1] = i; });
    state.clock.now += 4000;
    api.handlePokeDelta({ type: 'poke-delta', poke: { id: 'a', name: 'Phanpy', level: 1, xp: 0, ivTotal: 58, quality: 0.975 } });
    state.clock.now += 4000;
    api.handlePokeDelta({ type: 'poke-delta', poke: { id: 'b', name: 'Phanpy', level: 1, xp: 0, ivTotal: 140, quality: 1.7 } });
    return_after_tick(() => {
        assert(got[0] && got[0].pokeId === 'a' && got[1] && got[1].pokeId === 'b', 'atrasados em ordem: ' + JSON.stringify(got));
    });
}

// 5c) ordem normal continua igual: catch-result primeiro, delta depois (nada fica pendente)
{
    const { api, state } = loadDetailsModule({ ...CFG });
    api.setSocket(socket(state));
    let got = null;
    api.withDetails({ name: 'Diglett', shiny: false, level: null }).then(i => { got = i; });
    api.handlePokeDelta({ type: 'poke-delta', poke: diglett('n1', 130, 1.1) });
    assert(api.pendentes === 0 && api.awaiting === 0, 'nada pendente na ordem normal');
    return_after_tick(() => { assert(got && got.ivTotal === 130, 'ordem normal ok'); });
}

// 6) delta sem ivTotal/quality: pede pokes-get na hora e casa pelo id do delta na lista
{
    const { api, state } = loadDetailsModule({ ...CFG });
    api.setSocket(socket(state));
    let got = null;
    api.withDetails({ name: 'Diglett', shiny: false, level: null }).then(i => { got = i; });
    api.handlePokeDelta({ type: 'poke-delta', poke: { id: 'x1', name: 'Diglett', level: 1, xp: 0 } });
    assert(state.sent.length === 1 && state.sent[0].type === 'pokes-get' && api.awaiting === 1, 'delta sem campos: pokes-get e segue na fila');
    state.fire(4000);
    assert(state.sent.length === 1, 'pokes-get só uma vez por captura');
    api.handlePokesList([diglett('x0', 50, 1.0), diglett('x1', 160, 1.9), diglett('x2', 70, 1.0)]);
    return_after_tick(() => {
        assert(got && got.ivTotal === 160 && got.quality === 1.9 && got.pokeId === 'x1', 'casou pelo id do delta: ' + JSON.stringify(got));
        assert(api.qualityTier(got.quality).name === 'Legendary' && api.passesQualityFilter(got).ok === true, 'Legendary 160 >= 110 passa');
    });
}

(async function run() {
    while (pending.length) { await Promise.resolve(); const fn = pending.shift(); fn(); }
    console.log('details.test.js: ok');
})().catch(err => { console.error(err); process.exitCode = 1; });
