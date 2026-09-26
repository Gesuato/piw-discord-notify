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
assert(state.nudges.length === 1 && state.nudges[0].type === 'hunt-resume' && state.nudges[0].slug === 'larvitar' && state.nudges[0].name === 'Larvitar' && state.nudges[0].synthetic === true, 'tela do jogo recebe hunt-resume sintético: ' + JSON.stringify(state.nudges));
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

// rotas nomeadas (v3.9.0): trocar guarda a etapa da anterior; a nova volta de onde parou; excluir a ativa cai na próxima
{
    const rotaA = [{ slug: 'a', level: 5 }, { slug: 'b', level: 9 }];
    const { api, state: st, cfg: c } = loadLevelModule({
        routeEnabled: true, routeName: 'A', route: rotaA, routeStage: 1,
        routes: { A: { route: rotaA, stage: 1 }, B: { route: [{ slug: 'c', level: 20 }], stage: 0 } },
    });
    assert(api.levelTarget() === 9, 'A na etapa 2');
    assert(api.activateRoute('B') && c.routeName === 'B' && api.levelTarget() === 20 && c.routeStage === 0, 'B ativa do início');
    assert(c.routes.A.stage === 1, 'A guardou a etapa');
    assert(st.saved === 1 && st.logs.some(l => l[0] === 'rota-ativa' && l[1].nome === 'B'), 'salvou e logou');
    assert(api.activateRoute('A') && c.routeStage === 1 && api.levelTarget() === 9, 'A volta de onde parou');
    assert(!api.activateRoute('zzz'), 'rota inexistente');
    assert(api.createRoute('C', []) && c.routeName === 'C' && api.levelTarget() === 0, 'C vazia ativa: sem alvo');
    assert(api.renameRoute('C', 'D') && c.routeName === 'D' && !c.routes.C && c.routes.D, 'renomeada');
    assert(!api.renameRoute('D', 'A'), 'não renomeia por cima de outra');
    assert(api.deleteRoute('D') && c.routeName === 'A' && api.levelTarget() === 9, 'excluir a ativa cai na primeira que sobra');
    assert(api.deleteRoute('A') && api.deleteRoute('B') && c.routeName === '' && c.route.length === 0 && c.routeEnabled === false, 'sem rotas: desliga');
    assert(api.routeNames().length === 0 && api.uniqueRouteName('Rota 1') === 'Rota 1', 'nome livre');
}

console.log('OK route.test —', m.routeStatus());
