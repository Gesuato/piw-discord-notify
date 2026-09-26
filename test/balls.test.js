// Estoque de bolas + compra automática (v3.13.6: bola zerada some do frame `balls`). Rodar: node test/balls.test.js
const { loadBallsModule, assert } = require('./harness');

// 1) antes de qualquer frame `balls`, nada é decidido (nem alerta nem compra)
{
    const { api, state } = loadBallsModule({ ballsWatch: '4', ballsMin: 0, autoBuy: true });
    assert(api.ballQty(4) === null, 'sem frame: quantidade desconhecida');
    api.checkBallStock();
    assert(state.buys.length === 0 && state.hooks.length === 0, 'sem frame não compra nem avisa');
}

// 2) painel 2 real: Ultra Ball (4) acabou e SUMIU do frame -> compra automática dispara com qty 0, uma vez por episódio
{
    const { api, state } = loadBallsModule({ ballsWatch: '4', ballsMin: 0, autoBuy: true, autoBuyQty: 100 });
    api.handleBalls({ type: 'balls', counts: { '1': 6, '3': 200 } });
    assert(api.ballQty(4) === 0 && api.ballQty(3) === 200, 'bola ausente vale 0 depois do 1º frame');
    assert(state.buys.length === 1 && state.buys[0].id === 4 && state.buys[0].qty === 0 && state.buys[0].min === 1, 'compra disparada: ' + JSON.stringify(state.buys));
    api.handleBalls({ type: 'balls', counts: { '1': 6, '3': 200 } });
    assert(state.buys.length === 1, 'uma tentativa por episódio');
    api.handleBalls({ type: 'balls', counts: { '1': 6, '3': 200, '4': 100 } });
    assert(state.buys.length === 1, 'repôs: rearma sem comprar');
    api.handleBalls({ type: 'balls', counts: { '1': 6, '3': 200 } });
    assert(state.buys.length === 2, 'acabou de novo: compra de novo');
}

// 3) bola "em uso" (auto) que sumiu do frame: mesmo caso
{
    const { api, state } = loadBallsModule({ ballsWatch: 'auto', ballsMin: 0, autoBuy: true });
    api.setLastBall(4);
    api.handleBalls({ type: 'balls', counts: { '1': 100 } });
    assert(state.buys.length === 1 && state.buys[0].id === 4, 'bola em uso ausente = 0: compra');
}

// 4) sem compra automática: alerta "ficou SEM" uma vez; rearma ao repor
{
    const { api, state } = loadBallsModule({ ballsWatch: '4', ballsMin: 50, autoBuy: false });
    api.handleBalls({ type: 'balls', counts: { '1': 6 } });
    assert(state.hooks.length === 1 && /ficou SEM \*\*Ultra Ball\*\*/.test(state.hooks[0].content), 'alerta de bola zerada: ' + (state.hooks[0] || {}).content);
    api.handleBalls({ type: 'balls', counts: { '1': 6 } });
    assert(state.hooks.length === 1, 'não repete');
    api.handleBalls({ type: 'balls', counts: { '1': 6, '4': 30 } });
    assert(state.hooks.length === 1, 'ainda abaixo do limite (30 < 50): não repete');
    api.handleBalls({ type: 'balls', counts: { '1': 6, '4': 80 } });
    api.handleBalls({ type: 'balls', counts: { '1': 6, '4': 10 } });
    assert(state.hooks.length === 2 && /pouca \*\*Ultra Ball\*\* \(10\)/.test(state.hooks[1].content), 'repôs (80) e caiu (10): avisa de novo: ' + state.hooks[1].content);
}

// 5) alerta desligado e sem compra: frame sem a bola não faz nada
{
    const { api, state } = loadBallsModule({ ballsWatch: '4', ballsMin: 0, autoBuy: false });
    api.handleBalls({ type: 'balls', counts: { '1': 6 } });
    assert(state.buys.length === 0 && state.hooks.length === 0, 'desligado: nada');
}

console.log('OK balls.test — bola zerada some do frame e mesmo assim compra/avisa; sem frame não decide');
