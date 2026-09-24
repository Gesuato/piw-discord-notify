// Rota de treino (ROADMAP #11). Rodar: node test/route.test.js
const { loadLevelModule, team, assert } = require('./harness');

const { api: m, state, cfg } = loadLevelModule({
    levelAlertAt: 0, levelSwap: false, routeEnabled: true,
    route: [{ slug: 'pidgey', level: 10 }, { slug: 'larvitar', level: 15 }], routeStage: 0, mentionUserId: '',
});
const types = () => state.sent.map(o => o.type).join(',');
const summons = () => state.sent.filter(o => o.type === 'poke-summon').map(o => o.pokeId);

assert(m.levelTarget() === 10, 'alvo da etapa 1 = 10');
m.updateTeam(team([10, 3], 0));                       // líder no alvo -> troca p1
assert(summons().includes('p1'), 'summon p1');
m.updateTeam(team([10, 3], 1));                       // confirmado

state.sent.length = 0; state.hooks.length = 0;
m.updateTeam(team([10, 10], 1));                      // todos 10 -> etapa concluída, troca de hunt
assert(cfg.routeStage === 1 && state.saved === 1, 'etapa avançou e salvou');
assert(types() === 'leave-hunt,enter-hunt,pending-get', 'sequência de troca de hunt: ' + types());
assert(state.sent[1].slug === 'larvitar', 'entra em larvitar');
assert(/Etapa 1 concluída/.test(state.hooks[0].desc) && /larvitar/.test(state.hooks[0].desc), 'aviso de etapa');
assert(m.levelTarget() === 15, 'alvo agora 15');
assert(state.longTimers.length === 1, 'timer de confirmação armado');

m.fieldArrived();                                     // chegou field -> confirma
state.longTimers.shift()();
assert(state.logs.some(l => l[0] === 'hunt-ok'), 'hunt confirmada');

state.sent.length = 0; state.hooks.length = 0;
m.updateTeam(team([10, 10], 1));                      // ninguém no 15: nada
assert(!state.sent.length && !state.hooks.length, 'nada abaixo do alvo 15');
m.updateTeam(team([10, 15], 1));                      // p1 chega a 15 -> troca p0
assert(summons().includes('p0'), 'summon p0');
m.updateTeam(team([10, 15], 0));

state.sent.length = 0; state.hooks.length = 0;
m.updateTeam(team([15, 15], 0));                      // todos 15 -> rota concluída
assert(cfg.routeStage === 2 && /Rota concluída/.test(state.hooks[0].desc), 'rota concluída');
assert(!state.sent.some(o => o.type === 'enter-hunt'), 'não troca de hunt no fim');
assert(m.levelTarget() === 0, 'sem alvo após a rota (levelAlertAt 0)');

// falha de entrada: sem field em 30 s, 2 tentativas, depois aviso
{
    const { api, state: st } = loadLevelModule({ routeEnabled: true, route: [{ slug: 'a', level: 5 }, { slug: 'zzz', level: 9 }], routeStage: 0 });
    api.updateTeam(team([5, 5], 0));
    st.longTimers.shift()();                          // 30 s sem field -> tenta de novo
    assert(st.sent.filter(o => o.type === 'enter-hunt').length === 2, '2 tentativas de enter-hunt');
    st.longTimers.shift()();                          // falhou de novo -> aviso
    assert(st.hooks.some(h => /não consegui entrar na hunt \*\*zzz\*\*/.test(h.content)), 'aviso de falha');
}

// rota desligada: o campo de nível volta a mandar
{
    const { api } = loadLevelModule({ levelAlertAt: 7, routeEnabled: false, route: [{ slug: 'a', level: 5 }], routeStage: 0 });
    assert(api.levelTarget() === 7, 'rota desligada usa levelAlertAt');
}

console.log('OK route.test —', m.routeStatus());
