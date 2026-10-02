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

// 5) timeout total: sai sem dados (marcado), e o delta que chega depois vai para a captura encerrada,
//    NÃO para a captura seguinte que está na fila
{
    const { api, state } = loadDetailsModule({ ...CFG });
    api.setSocket(socket(state));
    let first = null, second = null;
    api.withDetails({ name: 'Phanpy', shiny: false, level: null }).then(i => { first = i; });
    state.fire(4000);
    state.fire(20000);
    return_after_tick(() => {
        assert(first && first.ivTotal == null && first.quality == null && first.detailsTimeout === true, 'timeout: sem dados e marcado: ' + JSON.stringify(first));
        assert(api.passesQualityFilter(first).ok === true && api.passesQualityFilter(first).motivo === 'sem dados de qualidade', 'sem dados passa (regra mantida)');
        const t = logs(state, 'detalhes-timeout');
        assert(t.length === 1 && t[0][1].pediuPokes === true && t[0][1].esperaMs === 20000, 'log do timeout: ' + JSON.stringify(t));
        assert(api.orphans === 1, 'captura encerrada vira órfã');
        api.withDetails({ name: 'Phanpy', shiny: false, level: null }).then(i => { second = i; });
        api.handlePokeDelta({ type: 'poke-delta', poke: { id: 'late', name: 'Phanpy', level: 1, xp: 0, ivTotal: 58, quality: 0.975 } });
        assert(api.orphans === 0 && api.awaiting === 1, 'delta atrasado consumido pela órfã; a 2ª captura segue esperando');
        const late = logs(state, 'poke-delta-atrasado');
        assert(late.length === 1 && late[0][1].ivTotal === 58 && late[0][1].atrasoMs >= 24000, 'log poke-delta-atrasado: ' + JSON.stringify(late));
        api.handlePokeDelta({ type: 'poke-delta', poke: { id: 'ok', name: 'Phanpy', level: 1, xp: 0, ivTotal: 140, quality: 1.7 } });
        return_after_tick(() => {
            assert(second && second.ivTotal === 140 && second.pokeId === 'ok', '2ª captura recebe o próprio delta: ' + JSON.stringify(second));
            assert(api.awaiting === 0 && state.timers.length === 0, 'fila vazia');
        });
    });
}

// 5b) reconexão depois do timeout: o delta da captura encerrada se perdeu; o primeiro delta do socket novo
//     é da captura que está esperando (não vai para a órfã)
{
    const { api, state } = loadDetailsModule({ ...CFG });
    api.setSocket(socket(state));
    let first = null, second = null;
    api.withDetails({ name: 'Phanpy', shiny: false, level: null }).then(i => { first = i; });
    state.fire(4000);
    state.fire(20000);
    assert(api.orphans === 1, 'órfã registrada');
    api.setSocket(socket(state));   // reconectou
    api.withDetails({ name: 'Phanpy', shiny: false, level: null }).then(i => { second = i; });
    api.handlePokeDelta({ type: 'poke-delta', poke: { id: 'novo', name: 'Phanpy', level: 1, xp: 0, ivTotal: 170, quality: 1.2 } });
    return_after_tick(() => {
        assert(first && first.detailsTimeout === true, '1ª saiu sem dados');
        assert(second && second.ivTotal === 170 && second.pokeId === 'novo', 'socket novo: delta vai para a captura em espera: ' + JSON.stringify(second));
        assert(api.orphans === 0 && api.awaiting === 0 && logs(state, 'poke-delta-atrasado').length === 0, 'órfã descartada sem consumir o delta');
    });
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
