// Esperar na cidade (v3.44.0): botão do painel que segura a conta na cidade até o usuário mandar voltar. Rodar: node test/hold.test.js
const { loadHoldModule, assert } = require('./harness');

const MIN = 60 * 1000;
const tipos = (state) => state.sent.map(o => o.type);
const logs = (state, fase) => state.logs.filter(l => l[0] === 'espera-cidade' && l[1].fase === fase);

(async () => {
    // 1) ligar na hunt: sai da hunt (leave-hunt + teleporte sintético), grava, e manda set-city se a tela não viajar em 10 s
    {
        const { api, state, store } = loadHoldModule({ huntSlug: 'rattata' });
        assert(!api.active() && api.reason() === null && /desligada/.test(api.status()), 'começa desligada: ' + api.status());
        assert(api.start('painel') === true, 'ligou');
        assert(api.active() && /botão do painel/.test(api.reason()), 'ativa com motivo');
        assert(tipos(state).join(',') === 'leave-hunt', 'saiu da hunt: ' + tipos(state).join(','));
        assert(state.nudges.length === 1, 'tela mandada para a cidade');
        const ini = logs(state, 'inicio')[0];
        assert(ini && ini[1].hunt === 'rattata' && ini[1].origem === 'painel' && ini[1].tela === true, 'log inicio: ' + JSON.stringify(ini));
        assert(JSON.parse(store[api.HOLD_KEY]).hunt === 'rattata', 'gravou no localStorage: ' + store[api.HOLD_KEY]);
        assert(/ligada há 0 min/.test(api.status()) && /veio de rattata/.test(api.status()), 'status: ' + api.status());
        await state.fire(api.HOLD_CITY_WAIT_MS);
        assert(tipos(state).join(',') === 'leave-hunt,set-city', 'tela não mandou set-city: mandamos nós: ' + tipos(state).join(','));
        assert(api.start('painel') === false, 'ligar de novo não faz nada');
    }

    // 2) a tela viajou (set-city): sem set-city nosso; ligar já na cidade não manda nada e lembra de onde veio
    {
        const { api, state } = loadHoldModule({ huntSlug: 'rattata' });
        api.start('painel'); api.onSetCity();
        await state.fire(api.HOLD_CITY_WAIT_MS);
        assert(tipos(state).join(',') === 'leave-hunt', 'tela chegou: só o leave-hunt: ' + tipos(state).join(','));
        const r = loadHoldModule({ huntSlug: null, env: { lastRealHunt: 'pidgey' } });
        r.api.start('painel');
        assert(r.state.sent.length === 0 && r.state.nudges.length === 0, 'já na cidade: nada enviado');
        const ini = logs(r.state, 'inicio')[0];
        assert(ini && ini[1].jaNaCidade === true && ini[1].veioDe === 'pidgey', 'log diz que já estava na cidade: ' + JSON.stringify(ini));
        assert(/veio de pidgey/.test(r.api.status()), 'status lembra a última hunt: ' + r.api.status());
    }

    // 3) troca de hunt em andamento é cancelada (o enter-hunt dela não pode sair)
    {
        const { api, state, env } = loadHoldModule({ huntSlug: null, env: { huntSwitch: { slug: 'onix', timer: 42, origem: 'rota' } } });
        api.start('painel');
        assert(env.huntSwitch === null, 'troca cancelada');
        const c = logs(state, 'troca-cancelada')[0];
        assert(c && c[1].slug === 'onix' && c[1].origem === 'rota', 'log da troca cancelada: ' + JSON.stringify(c));
    }

    // 4) a tela religou a hunt com a espera ligada: sai de novo 2 s depois; segunda religada espera o intervalo; arena do boss não conta
    {
        const { api, state, env, clock } = loadHoldModule({ huntSlug: 'rattata' });
        api.start('painel');
        env.huntSlug = 'rattata'; api.onHuntChange('rattata');
        assert(state.timers.some(t => t.ms === api.HOLD_KICK_DELAY_MS), 'saída agendada em 2 s');
        await state.fire(api.HOLD_KICK_DELAY_MS);
        assert(tipos(state).filter(t => t === 'leave-hunt').length === 2 && env.huntSlug === null, 'saiu de novo: ' + tipos(state).join(','));
        assert(logs(state, 'saiu').length === 1 && logs(state, 'saiu')[0][1].hunt === 'rattata', 'log saiu');
        clock.now += 5 * 1000;
        env.huntSlug = 'rattata'; api.onHuntChange('rattata');
        const t2 = state.timers.find(t => t.ms !== api.HOLD_CITY_WAIT_MS && t.ms > api.HOLD_KICK_DELAY_MS);
        assert(t2 && t2.ms === api.HOLD_KICK_GAP_MS - 5 * 1000, 'segunda saída respeita o intervalo de 30 s: ' + JSON.stringify(state.timers.map(t => t.ms)));
        env.huntSlug = null;                                   // a tela desistiu antes do prazo
        await state.fire(t2.ms);
        assert(logs(state, 'saiu').length === 1, 'sem hunt no prazo: não sai de novo');
        env.huntSlug = 'cruel_boss'; api.onHuntChange('cruel_boss');
        assert(!state.timers.some(t => t.ms === api.HOLD_KICK_DELAY_MS), 'arena do Auto Boss: não expulsa');
        env.huntSlug = 'cerulean'; api.onHuntChange('cerulean');
        assert(!state.timers.some(t => t.ms === api.HOLD_KICK_DELAY_MS), 'cidade: nada a fazer');
        const antes = state.timers.length;
        api.onHuntChange(null);
        assert(state.timers.length === antes, 'hunt nula: nada');
    }

    // 5) bloqueio do switchHunt: 1 log por origem a cada 5 min
    {
        const { api, state, clock } = loadHoldModule({ huntSlug: null });
        api.start('painel');
        api.blocked('pidgey', 'viagem'); api.blocked('pidgey', 'viagem'); api.blocked('onix', 'rota'); api.blocked('onix');
        assert(logs(state, 'bloqueou').length === 2, '1 log por origem: ' + JSON.stringify(logs(state, 'bloqueou').map(l => l[1])));
        clock.now += api.HOLD_BLOCK_LOG_MS;
        api.blocked('pidgey', 'viagem');
        assert(logs(state, 'bloqueou').length === 3, 'passou o período: loga de novo');
    }

    // 6) carga nova lembra a espera (recarga do painel) e desligar volta para o destino da parada na cidade (joy-heal antes)
    {
        const at = 1_700_000_000_000 - 40 * MIN;
        const { api, state, store } = loadHoldModule({ huntSlug: null, store: { pgDiscordNotifyHold: JSON.stringify({ at, hunt: 'rattata' }) }, env: { idleTarget: { slug: 'rattata' } } });
        assert(api.load() === true && api.active(), 'lembrou a espera');
        const lem = logs(state, 'lembrada')[0];
        assert(lem && lem[1].desdeMin === 40 && lem[1].hunt === 'rattata', 'log lembrada: ' + JSON.stringify(lem));
        assert(/ligada há 40 min/.test(api.status()), 'status conta desde a carga anterior: ' + api.status());
        const r = api.stop('painel');
        assert(r.ok && r.slug === 'rattata' && r.motivo === null && r.min === 40, 'desligou com destino: ' + JSON.stringify(r));
        assert(!api.active() && !(api.HOLD_KEY in store), 'apagou o localStorage');
        assert(tipos(state).join(',') === 'joy-heal', 'cura na Joy antes de voltar: ' + tipos(state).join(','));
        assert(state.switches.length === 0, 'volta só depois do prazo');
        await state.fire(api.HOLD_BACK_DELAY_MS);
        assert(state.switches.length === 1 && state.switches[0].slug === 'rattata' && state.switches[0].origem === 'cidade', 'voltou: ' + JSON.stringify(state.switches));
        const fim = logs(state, 'fim')[0];
        assert(fim && fim[1].volta === 'rattata' && fim[1].min === 40 && fim[1].origem === 'painel', 'log fim: ' + JSON.stringify(fim));
        assert(/desligada · última volta/.test(api.status()) && /para rattata/.test(api.status()), 'status da última volta: ' + api.status());
        assert(api.stop('painel').ok === false, 'desligar de novo não faz nada');
        assert(api.load() === false, 'carga seguinte: nada para lembrar');
    }

    // 7) desligar sem destino, com viagem ou Auto Boss em andamento, ou já numa hunt: não volta e diz por quê
    {
        let r = loadHoldModule({ huntSlug: null });
        r.api.start('painel');
        let s = r.api.stop('painel');
        assert(s.ok && s.slug === null && /não sei de que hunt veio/.test(s.motivo) && r.state.sent.length === 0, 'sem destino: ' + JSON.stringify(s));
        assert(/não voltei: não sei/.test(r.api.status()), 'status explica: ' + r.api.status());
        r = loadHoldModule({ huntSlug: null, env: { idleTarget: { slug: 'rattata' }, tripRunning: true } });
        r.api.start('painel'); s = r.api.stop('painel');
        assert(s.slug === null && /viagem/.test(s.motivo), 'viagem em andamento: ' + JSON.stringify(s));
        r = loadHoldModule({ huntSlug: null, env: { idleTarget: { slug: 'rattata' }, boss: true } });
        r.api.start('painel'); s = r.api.stop('painel');
        assert(s.slug === null && /Auto Boss/.test(s.motivo), 'boss em andamento: ' + JSON.stringify(s));
        r = loadHoldModule({ huntSlug: null, env: { idleTarget: { slug: 'rattata' } } });
        r.api.start('painel'); r.env.huntSlug = 'onix'; s = r.api.stop('painel');
        assert(s.slug === null && /já está em onix/.test(s.motivo), 'já numa hunt: ' + JSON.stringify(s));
        await r.state.fire(r.api.HOLD_BACK_DELAY_MS);
        assert(r.state.switches.length === 0, 'sem volta');
    }

    // 8) localStorage com lixo: começa desligada
    {
        const { api } = loadHoldModule({ huntSlug: null, store: { pgDiscordNotifyHold: '{nope' } });
        assert(api.load() === false && !api.active(), 'lixo ignorado');
        const r = loadHoldModule({ huntSlug: null, store: { pgDiscordNotifyHold: JSON.stringify({ at: 0 }) } });
        assert(r.api.load() === false, 'registro sem data ignorado');
    }

    console.log('OK hold.test — ligar na hunt/cidade, set-city de fallback, troca cancelada, tela religou a hunt (2 s, 30 s, arena), bloqueio 1x/5 min, lembrar na carga, desligar com/sem destino');
})().catch(err => { console.error(err); process.exit(1); });
