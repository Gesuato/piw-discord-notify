// Cura na Joy quando o time cai (v3.22.0). Rodar: node test/heal.test.js
const { loadHealModule, assert } = require('./harness');

const MIN = 60 * 1000;
const time = (hp) => [{ id: 'a', team: true, leader: true, slot: 0, hp, maxHp: 100 }, { id: 'b', team: true, slot: 1, hp: 50 }];

(async () => {
    // 1) desmaio na hunt -> teleporte do servidor -> set-city da tela -> joy-heal -> hp ok -> volta para a hunt
    {
        const { api, state } = loadHealModule({ healJoyEnabled: true }, { huntSlug: 'pidgey', pokesHp: [100] });
        api.onField({ type: 'field', fainted: true, reviveInMs: 12000, noRevive: false });
        api.onField({ type: 'field', fainted: true, reviveInMs: 11000 });
        assert(state.logs.filter(l => l[0] === 'desmaio').length === 1, 'desmaio logado uma vez');
        state.onSleep = () => { if (api.busy() && !state.cityDone) { state.cityDone = true; api.onSetCity(); } };
        api.onTeleport();
        await api.flush();
        assert(state.hunts.includes(null), 'teleporte zera a hunt atual');
        assert(state.sent.filter(o => o.type === 'joy-heal').length === 1, 'joy-heal enviado: ' + JSON.stringify(state.sent));
        assert(!state.sent.some(o => o.type === 'set-city'), 'a tela mandou set-city: o script não manda');
        assert(state.switches.length === 1 && state.switches[0].slug === 'pidgey' && state.switches[0].origem === 'cura', 'voltou para pidgey: ' + JSON.stringify(state.switches));
        assert(state.hooks.length === 1 && /curado na Nurse Joy, voltando/.test(state.hooks[0].content), '1ª queda avisa no canal de alertas');
        assert(!api.busy() && /curado e de volta/.test(api.status()), 'status: ' + api.status());
    }

    // 2) levantou com Revive: nada acontece
    {
        const { api, state } = loadHealModule({ healJoyEnabled: true }, { huntSlug: 'pidgey' });
        api.onField({ type: 'field', fainted: true });
        api.onField({ type: 'field', fainted: false });
        assert(state.logs.some(l => l[0] === 'desmaio-levantou') && !api.busy(), 'Revive: sem cura');
        api.onLeave();
        assert(!api.busy() && state.sent.length === 0, 'leave-hunt depois de levantar não é queda');
    }

    // 3) "Voltar para a cidade" com o líder desmaiado; a tela não manda set-city em 10 s -> o script manda
    {
        const { api, state, clock } = loadHealModule({ healJoyEnabled: true }, { huntSlug: 'rattata', pokesHp: [100] });
        api.onField({ type: 'field', fainted: true, noRevive: true });
        const t0 = clock.now;
        api.onLeave();
        await api.flush();
        assert(state.sent[0].type === 'set-city' && state.sent[0].slug === 'cerulean', 'set-city manual: ' + JSON.stringify(state.sent));
        assert(clock.now - t0 >= 10 * 1000, 'esperou 10 s pela tela');
        assert(state.switches.length === 1 && state.switches[0].slug === 'rattata', 'voltou para rattata');
        assert(state.logs.some(l => l[0] === 'cura' && l[1].fase === 'inicio' && l[1].noRevive === true), 'log marca o time inteiro');
    }

    // 4) a Joy não curou (hp segue 0 nas duas tentativas): fica na cidade e avisa
    {
        const { api, state } = loadHealModule({ healJoyEnabled: true }, { huntSlug: 'pidgey', pokesHp: [0, 0] });
        api.onField({ type: 'field', fainted: true });
        api.onTeleport(); api.onSetCity();
        await api.flush();
        assert(state.sent.filter(o => o.type === 'joy-heal').length === 2, 'duas tentativas de joy-heal');
        assert(state.switches.length === 0, 'não volta com o líder em hp 0');
        assert(state.hooks.length === 1 && /Joy não curou/.test(state.hooks[0].content), 'avisa a falha: ' + state.hooks[0]?.content);
    }

    // 5) sem `hp` no frame (não dá para conferir): segue e volta
    {
        const { api, state } = loadHealModule({ healJoyEnabled: true }, { huntSlug: 'pidgey', pokesHp: [null] });
        api.onField({ type: 'field', fainted: true }); api.onTeleport(); api.onSetCity();
        await api.flush();
        assert(state.switches.length === 1, 'sem hp no frame: volta mesmo assim');
    }

    // 6) quedas seguidas na mesma hunt (v3.24.3): volta SEMPRE; avisa só a 1ª da janela de 30 min
    {
        const { api, state, clock } = loadHealModule({ healJoyEnabled: true }, { huntSlug: 'onix', pokesHp: [100, 100, 100, 100] });
        for (let i = 0; i < 4; i++) {
            api.setHunt('onix');
            api.onField({ type: 'field', fainted: true }); api.onTeleport(); api.onSetCity();
            await api.flush();
            clock.now += 5 * MIN;
        }
        assert(state.switches.length === 4 && state.switches.every(s => s.slug === 'onix'), '4 quedas, 4 voltas: ' + state.switches.length);
        assert(state.hooks.length === 1 && /voltando para a hunt/.test(state.hooks[0].content), 'avisa só a 1ª: ' + state.hooks.map(h => h.content).join(' | '));
        assert(state.logs.filter(l => l[0] === 'cura' && l[1].fase === 'inicio').pop()[1].quedas === 4, 'log conta as quedas');
    }

    // 7) desligada: só zera a hunt no teleporte, sem Joy
    {
        const { api, state } = loadHealModule({ healJoyEnabled: false }, { huntSlug: 'pidgey' });
        api.onField({ type: 'field', fainted: true }); api.onTeleport();
        await api.flush();
        assert(state.hunts.includes(null) && state.sent.length === 0 && !api.busy(), 'desligada não cura');
        assert(api.status() === 'desligada', 'status desligada');
    }

    // 8) líder com hp 0 fora de hunt (ex.: recarga no meio da contagem): cura e volta para a última hunt
    {
        const { api, state } = loadHealModule({ healJoyEnabled: true }, { huntSlug: null, lastRealHunt: 'geodude', pokesHp: [100] });
        api.onPokes(time(0));
        await api.flush();
        assert(!state.sent.some(o => o.type === 'set-city'), 'já fora de hunt: não espera nem manda set-city');
        assert(state.sent.some(o => o.type === 'joy-heal') && state.switches[0]?.slug === 'geodude', 'curou e voltou para geodude: ' + JSON.stringify(state.switches));
        const { api: api2, state: st2 } = loadHealModule({ healJoyEnabled: true }, { huntSlug: 'geodude' });
        api2.onPokes(time(0));
        assert(!api2.busy() && st2.sent.length === 0, 'na hunt o hp do `pokes` não decide (quem decide é o field)');
    }

    // 9) teleporte sem desmaio visto: cura e volta, com texto de "mandada para a cidade"
    {
        const { api, state } = loadHealModule({ healJoyEnabled: true }, { huntSlug: 'pidgey', pokesHp: [100] });
        api.onTeleport(); api.onSetCity();
        await api.flush();
        assert(state.switches.length === 1 && /mandada para a cidade/.test(state.hooks[0].content), 'teleporte sem queda: ' + state.hooks[0]?.content);
    }

    console.log('OK heal.test — queda, teleporte, Joy, conferência do hp, volta, Revive, set-city manual, falha, quedas seguidas sempre voltam e hp 0 fora de hunt');
})().catch(err => { console.error(err); process.exit(1); });
