// Alerta de nível + troca automática de líder (ROADMAP #9). Rodar: node test/level.test.js
const { loadLevelModule, team, assert } = require('./harness');

const { api: m, state, cfg } = loadLevelModule({ levelAlertAt: 15, levelSwap: true, mentionUserId: '' });
const summons = () => state.sent.filter(o => o.type === 'poke-summon').map(o => o.pokeId);

// 1) todos lv 1: nada
m.updateTeam(team([1, 1, 1, 1], 0));
assert(state.hooks.length === 0 && state.sent.length === 0, 'não deve agir com todos lv 1');

// 2) poke-xp diz 15: só pede pokes-get (quem decide é o frame pokes)
state.sent.length = 0;
m.handlePokeXp({ type: 'poke-xp', id: 'p0', level: 15, leveledUp: true });
assert(state.sent.length === 1 && state.sent[0].type === 'pokes-get', 'poke-xp deve pedir pokes-get');

// 3) pokes confirma líder lv 15: alerta + summon do próximo abaixo do alvo
state.sent.length = 0;
m.updateTeam(team([15, 1, 1, 1], 0));
assert(state.hooks.length === 1 && state.hooks[0].kind === 'level' && /nível \*\*15\*\*/.test(state.hooks[0].content), 'alerta de nível');
assert(summons().includes('p1'), 'deveria mandar poke-summon p1');
assert(m.swapPending && m.swapPending.toId === 'p1', 'swapPending armado');

// 4) pokes com o líder trocado: confirma
m.updateTeam(team([15, 1, 1, 1], 1));
assert(state.hooks.length === 2 && /agora o líder é \*\*Mon1\*\*/.test(state.hooks[1].content), 'troca confirmada');
assert(m.swapPending === null, 'swapPending limpo');

// 5) pokes repetido: nada novo
m.updateTeam(team([15, 3, 1, 1], 1));
assert(state.hooks.length === 2, 'sem alerta repetido');

// 6) cadeia até o fim do time
state.sent.length = 0;
m.updateTeam(team([15, 15, 1, 1], 1));
assert(summons().includes('p2'), 'summon p2');
m.updateTeam(team([15, 15, 1, 1], 2));
m.updateTeam(team([15, 15, 15, 1], 2));
m.updateTeam(team([15, 15, 15, 1], 3));
state.sent.length = 0;
m.updateTeam(team([15, 15, 15, 15], 3));
assert(summons().length === 0, 'não troca quando todos estão no nível');
assert(/Mon3/.test(state.hooks[state.hooks.length - 1].content), 'último alerta é do p3');

// 7) troca não confirmada em 15 s: aviso de falha
{
    const { api, state: st } = loadLevelModule({ levelAlertAt: 20, levelSwap: true });
    api.updateTeam(team([20, 1], 0));
    assert(api.swapPending, 'pendente');
    const realNow = Date.now; Date.now = () => realNow() + 20000;
    api.updateTeam(team([20, 1], 0));
    Date.now = realNow;
    assert(st.hooks.some(h => /não confirmou/.test(h.content)), 'timeout da troca');
}

// 8) troca manual de volta para um líder acima do alvo: troca de novo (v3.2.2)
{
    const { api, state: st } = loadLevelModule({ levelAlertAt: 5, levelSwap: true });
    const sm = () => st.sent.filter(o => o.type === 'poke-summon').map(o => o.pokeId);
    api.updateTeam(team([6, 1], 0));
    assert(sm().includes('p1'), 'summon p1');
    api.updateTeam(team([6, 1], 1));
    st.sent.length = 0;
    api.updateTeam(team([6, 1], 0));             // usuário devolveu o p0
    assert(sm().includes('p1'), 'deveria trocar de novo');
    api.updateTeam(team([6, 1], 1));
    st.sent.length = 0;
    api.updateTeam(team([6, 1], 1));
    assert(sm().length === 0, 'sem summon repetido');
}

// 9) sem troca ligada: só avisa
{
    const { api, state: st } = loadLevelModule({ levelAlertAt: 5, levelSwap: false });
    api.updateTeam(team([5, 1], 0));
    assert(st.hooks.length === 1 && /Troca automática desligada/.test(st.hooks[0].desc), 'só aviso');
    assert(!st.sent.some(o => o.type === 'poke-summon'), 'sem summon');
}

console.log('OK level.test —', state.hooks.length, 'webhooks no cenário principal');
