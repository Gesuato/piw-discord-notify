// Recarga automática do painel (v3.4.0). Rodar: node test/reload.test.js
const { loadReloadModule, assert } = require('./harness');

const MIN = 60 * 1000;

// 1) faixa: padrão 60 fixo; com máximo, sorteia dentro dela
{
    const { api } = loadReloadModule({ reloadEnabled: true });
    const r = api.reloadIntervalRange();
    assert(r.min === 60 && r.max === 60, 'faixa padrão 60–60');
}
{
    const { api, clock } = loadReloadModule({ reloadEnabled: true, reloadEveryMin: 10, reloadEveryMaxMin: 30 });
    for (let i = 0; i < 50; i++) {
        const at = api.scheduleReload();
        const em = at - clock.now;
        assert(em >= 10 * MIN && em <= 30 * MIN, `sorteio fora da faixa: ${em / MIN} min`);
    }
}

// 2) desligada: o tique não faz nada
{
    const { api, state } = loadReloadModule({ reloadEnabled: false });
    api.reloadTick();
    assert(api.nextReloadAt === 0 && state.reloads === 0, 'desligada não agenda nem recarrega');
}

// 3) ligada: 1º tique agenda; vencida, guarda o estado e recarrega
{
    const { api, state, clock } = loadReloadModule({ reloadEnabled: true, reloadEveryMin: 5 }, { huntSlug: 'pidgey', lastSellAt: 123456, ballAlerted: { 4: true } });
    api.reloadTick();
    assert(api.nextReloadAt > clock.now && state.reloads === 0, '1º tique só agenda');
    clock.now = api.nextReloadAt - 1000;
    api.reloadTick();
    assert(state.reloads === 0, 'antes da hora não recarrega');
    clock.now = api.nextReloadAt + 1000;
    api.reloadTick();
    assert(state.reloads === 1, 'na hora recarrega');
    const rec = JSON.parse(state.store.pgDiscordNotifyResume);
    assert(rec.slug === 'pidgey' && rec.lastSellAt === 123456 && rec.ballAlerted['4'] === true, 'registro de retomada guardado');
}

// 4) ocupada (venda em andamento): adia; passado o limite, recarrega mesmo assim
{
    const { api, state, clock } = loadReloadModule({ reloadEnabled: true, reloadEveryMin: 5 }, { sellRunning: true });
    api.reloadTick();
    clock.now = api.nextReloadAt + 1000;
    api.reloadTick();
    assert(state.reloads === 0 && /adiada/.test(api.reloadStatus()), 'adia com venda em andamento');
    assert(state.logs.some(l => l[0] === 'recarga-adiada' && /venda/.test(l[1].motivo)), 'log de adiamento');
    clock.now += 11 * MIN;
    api.reloadTick();
    assert(state.reloads === 1, 'depois de 10 min adiada recarrega mesmo assim');
}

// 5) carga nova com registro recente: restaura a venda e volta para a hunt depois do set-city
{
    const store = { pgDiscordNotifyResume: JSON.stringify({ at: Date.now() - 5000, slug: 'Pidgey', lastSellAt: 777, levelAlerted: ['p1'] }) };
    const { api, state } = loadReloadModule({ reloadEnabled: true }, { store });
    api.loadResume();
    assert(!('pgDiscordNotifyResume' in store), 'registro consumido');
    assert(api.lastSellAt === 777, 'lastSellAt restaurado');
    assert(api.levelAlerted.has('p1'), 'levelAlerted restaurado');
    assert(api.resumeHunt === 'pidgey', 'hunt normalizada guardada');
    api.armResume(12000);                       // socket rastreado: fallback longo fica pendente
    assert(state.longTimers.length === 1 && state.switches.length === 0, 'fallback de 12 s armado, nada enviado ainda');
    api.armResume(3000);                        // set-city saiu: 3 s (curto, roda na hora no stub)
    assert(state.switches.length === 1 && state.switches[0].slug === 'pidgey' && state.switches[0].origem === 'recarga', 'enter-hunt via switchHunt origem recarga');
    assert(api.resumeHunt === null, 'só volta uma vez');
    api.armResume(3000);
    assert(state.switches.length === 1, 'set-city depois não reenvia');
}

// 6) já na hunt (field chegou antes): não manda nada
{
    const store = { pgDiscordNotifyResume: JSON.stringify({ at: Date.now(), slug: 'pidgey' }) };
    const { api, state } = loadReloadModule({ reloadEnabled: true }, { store });
    api.loadResume();
    api.fieldArrived();
    api.armResume(3000);
    assert(state.switches.length === 0 && state.logs.some(l => l[0] === 'recarga-hunt' && l[1].jaNaHunt), 'já na hunt: não reenvia');
}

// 7) registro velho ou de cidade: ignora
{
    const store = { pgDiscordNotifyResume: JSON.stringify({ at: Date.now() - 20 * MIN, slug: 'pidgey', lastSellAt: 5 }) };
    const { api } = loadReloadModule({ reloadEnabled: true }, { store });
    api.loadResume();
    assert(api.resumeHunt === null && api.lastSellAt === 0, 'registro velho ignorado');
}
{
    const store = { pgDiscordNotifyResume: JSON.stringify({ at: Date.now(), slug: 'cerulean' }) };
    const { api, state } = loadReloadModule({ reloadEnabled: true }, { store });
    api.loadResume();
    api.armResume(3000);
    assert(api.resumeHunt === null && state.switches.length === 0, 'cidade não é hunt');
}

console.log('OK reload.test — faixa, adiamento, registro e volta para a hunt');
