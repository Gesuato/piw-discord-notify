// Daily Kill: voltar para a hunt quando a missão do dia terminar (v3.8.0). Rodar: node test/daily.test.js
const { loadDailyModule, assert } = require('./harness');

const RESET = 1790000000000;
// Estado do GET /api/game/daily-kill como o jogo devolve (só os campos que o script lê).
function estado(o) {
    o = o || {};
    const opts = [{ name: 'Pidgey', speciesId: 16, have: o.have ?? 0, qty: o.qty ?? 5, done: (o.have ?? 0) >= (o.qty ?? 5) }, { name: 'Rattata', have: 0, qty: 5 }, { name: 'Mr. Mime', have: 0, qty: 3 }];
    return { locked: Boolean(o.locked), claimed: Boolean(o.claimed), pickedIdx: o.pickedIdx ?? 0, resetAt: o.resetAt ?? RESET, reward: { xp: 1200, items: [] }, options: opts };
}
// API falsa: `s` é o estado atual (mutável pelo teste); o claim responde payout e marca claimed.
function fakeApi(s, claimErr) {
    return (url) => {
        if (url.endsWith('/claim')) {
            if (claimErr) return Promise.reject(new Error(claimErr));
            s.claimed = true;
            return Promise.resolve({ state: estado(s), payout: { xp: 1200, totalXp: 5000, level: 12, leveledUp: false, items: [{ label: '2× Rare Candy' }] } });
        }
        return Promise.resolve(estado(s));
    };
}
const flush = () => new Promise(r => setTimeout(r, 5));

(async () => {
    // 1) desligada: o tique não consulta nada
    {
        const { api, state } = loadDailyModule({ dailyEnabled: false }, { api: fakeApi({}) });
        await api.dailyTick();
        assert(state.calls.length === 0, 'desligada não consulta');
        assert(api.dailyStatus() === 'desligada', 'status desligada');
    }

    // 2) sem missão escolhida: consulta, mas não age
    {
        const s = { pickedIdx: -1 };
        const { api, state } = loadDailyModule({ dailyEnabled: true }, { api: fakeApi(s), huntSlug: 'pidgey' });
        await api.dailyTick();
        assert(state.calls.length === 1 && state.switches.length === 0 && state.hooks.length === 0, 'sem missão: só consulta');
        assert(/nenhuma missão escolhida/.test(api.dailyStatus()), 'status sem missão: ' + api.dailyStatus());
        await api.dailyTick();
        assert(state.calls.length === 1, 'fora da hunt da daily respeita o intervalo de 2 min');
    }

    // 3) cenário principal: veio de larvitar, entrou em pidgey (missão Pidgey 0/5); abates fecham a meta,
    //    resgata, volta para larvitar e avisa uma vez só
    {
        const s = { have: 3, qty: 5 };
        const { api, state } = loadDailyModule({ dailyEnabled: true, dailyClaim: true, mentionUserId: '42' }, { api: fakeApi(s) });
        api.setHunt('larvitar');
        api.setHunt('pidgey');                                      // setHunt já agenda uma consulta (curta: roda na hora)
        await flush();
        assert(api.prevHuntSlug === 'larvitar', 'hunt anterior guardada');
        assert(api.daily && api.daily.picked && api.daily.name === 'Pidgey' && api.daily.have === 3, 'missão lida');
        assert(api.dailyOnHunt(), 'na hunt da daily');
        assert(/Pidgey 3\/5 · na hunt da daily · volta para larvitar/.test(api.dailyStatus()), 'status: ' + api.dailyStatus());
        api.noteDailyKill({ type: 'field-kill', speciesName: 'Rattata' });
        assert(api.daily.have === 3, 'abate de outra espécie não conta');
        api.noteDailyKill({ type: 'field-kill', speciesName: 'Pidgey' });
        assert(api.daily.have === 4 && state.switches.length === 0, '4/5: ainda não');
        s.have = 5;                                                 // o servidor também chegou em 5
        api.noteDailyKill({ type: 'field-kill', speciesName: 'pidgey' });
        await flush(); await flush();
        assert(state.calls.some(c => c.url.endsWith('/daily-kill/claim') && c.opts?.method === 'POST'), 'resgatou via POST claim');
        assert(state.switches.length === 1 && state.switches[0].slug === 'larvitar' && state.switches[0].origem === 'daily', 'voltou para larvitar via switchHunt daily');
        assert(state.pokesReqs === 1, 'reconfere o time depois do XP');
        assert(state.hooks.length === 1 && state.hooks[0].kind === 'alert', 'um webhook no canal de alertas');
        assert(/<@42> ✅ \*\*Teste\*\* terminou a Daily Kill \(\*\*Pidgey\*\*\) — voltando para \*\*larvitar\*\*/.test(state.hooks[0].content), 'texto do aviso: ' + state.hooks[0].content);
        assert(/\+1200 XP · 2× Rare Candy/.test(state.hooks[0].desc), 'recompensa no embed: ' + state.hooks[0].desc);
        assert(state.logs.some(l => l[0] === 'daily-pronta' && l[1].volta === 'larvitar' && l[1].xp === 1200), 'log daily-pronta');
        await api.dailyTick(true); await api.dailyTick(true);
        assert(state.switches.length === 1 && state.hooks.length === 1, 'não repete no mesmo dia');
        assert(/concluída e resgatada hoje/.test(api.dailyStatus()), 'status depois: ' + api.dailyStatus());
    }

    // 4) "Voltar para" fixo vence a rota, que vence a hunt anterior
    {
        const s = { have: 5, qty: 5 };
        const { api, state } = loadDailyModule({ dailyEnabled: true, dailyClaim: true, dailyReturnSlug: 'mr_mime' }, { api: fakeApi(s), routeStep: { slug: 'dratini', level: 20 } });
        api.setHunt('larvitar'); api.setHunt('pidgey');
        await flush(); await flush();
        assert(state.switches.length === 1 && state.switches[0].slug === 'mr_mime', 'campo fixo vence: ' + JSON.stringify(state.switches));
    }
    {
        const s = { have: 5, qty: 5 };
        const { api, state } = loadDailyModule({ dailyEnabled: true, dailyClaim: true }, { api: fakeApi(s), routeStep: { slug: 'dratini', level: 20 } });
        api.setHunt('larvitar'); api.setHunt('pidgey');
        await flush(); await flush();
        assert(state.switches.length === 1 && state.switches[0].slug === 'dratini', 'etapa da rota vence a hunt anterior');
    }

    // 5) resgate desligado: só volta; o aviso manda resgatar no jogo
    {
        const s = { have: 5, qty: 5 };
        const { api, state } = loadDailyModule({ dailyEnabled: true, dailyClaim: false }, { api: fakeApi(s), prevHuntSlug: null });
        api.setHunt('larvitar'); api.setHunt('pidgey');
        await flush(); await flush();
        assert(!state.calls.some(c => c.url.endsWith('/claim')), 'não resgata');
        assert(state.switches.length === 1 && /Resgate automático desligado/.test(state.hooks[0].desc), 'voltou e avisou para resgatar no jogo');
    }

    // 6) resgate falhou: volta mesmo assim e conta a falha
    {
        const s = { have: 5, qty: 5 };
        const { api, state } = loadDailyModule({ dailyEnabled: true, dailyClaim: true }, { api: fakeApi(s, 'já resgatada') });
        api.setHunt('larvitar'); api.setHunt('pidgey');
        await flush(); await flush();
        assert(state.switches.length === 1 && /Resgate falhou: já resgatada/.test(state.hooks[0].desc), 'falha no resgate não impede a volta');
    }

    // 7) já resgatada quando o script a viu (ex.: depois de reload): silêncio, sem volta
    {
        const s = { have: 5, qty: 5, claimed: true };
        const { api, state } = loadDailyModule({ dailyEnabled: true }, { api: fakeApi(s), huntSlug: 'pidgey' });
        await api.dailyTick();
        assert(state.switches.length === 0 && state.hooks.length === 0, 'já resgatada: nada a fazer');
        assert(state.logs.some(l => l[0] === 'daily-pronta' && /já estava resgatada/.test(l[1].acao)), 'log explica');
    }

    // 8) resgatada na mão enquanto o script acompanhava: volta sem resgatar de novo
    {
        const s = { have: 4, qty: 5 };
        const { api, state } = loadDailyModule({ dailyEnabled: true }, { api: fakeApi(s) });
        api.setHunt('larvitar'); api.setHunt('pidgey');
        await flush();
        s.have = 5; s.claimed = true;
        await api.dailyTick(true); await flush();
        assert(!state.calls.some(c => c.url.endsWith('/claim')), 'não resgata de novo');
        assert(state.switches.length === 1 && /Recompensa resgatada no jogo/.test(state.hooks[0].desc), 'voltou para larvitar');
    }

    // 9) meta batida fora da hunt da daily: resgata, mas não troca de hunt
    {
        const s = { have: 5, qty: 5 };
        const { api, state } = loadDailyModule({ dailyEnabled: true, dailyClaim: true }, { api: fakeApi(s), huntSlug: 'dratini' });
        await api.dailyTick();
        assert(state.calls.some(c => c.url.endsWith('/claim')), 'resgatou');
        assert(state.switches.length === 0 && /não estava na hunt da daily/.test(state.hooks[0].desc), 'sem troca fora da hunt');
    }

    // 10) sem para onde voltar: resgata, avisa e fica
    {
        const s = { have: 5, qty: 5 };
        const { api, state } = loadDailyModule({ dailyEnabled: true, dailyClaim: true }, { api: fakeApi(s), huntSlug: 'pidgey' });
        await api.dailyTick();
        assert(state.switches.length === 0 && /Não sei para onde voltar/.test(state.hooks[0].desc), 'sem destino: avisa');
    }

    // 11) hunt de volta igual à atual (rota manda ficar em pidgey): não troca
    {
        const s = { have: 5, qty: 5 };
        const { api, state } = loadDailyModule({ dailyEnabled: true }, { api: fakeApi(s), huntSlug: 'pidgey', routeStep: { slug: 'pidgey', level: 30 } });
        await api.dailyTick();
        assert(state.switches.length === 0 && state.hooks.length === 1, 'já está onde deve ficar');
    }

    // 12) cidade não vira hunt anterior; abates da espécie em hunt de outro nome marcam "na hunt da daily"
    {
        const s = { have: 1, qty: 5 };
        const { api } = loadDailyModule({ dailyEnabled: true }, { api: fakeApi(s) });
        api.setHunt('larvitar'); api.setHunt('cerulean'); api.setHunt('route_1');
        await flush();
        assert(api.prevHuntSlug === 'larvitar', 'cidade ignorada como hunt anterior');
        assert(!api.dailyOnHunt(), 'route_1 não é a hunt da daily ainda');
        api.noteDailyKill({ speciesName: 'Pidgey' });
        assert(api.dailyOnHunt(), 'abate de Pidgey em route_1: passa a valer como hunt da daily');
    }

    // 13) erro na consulta: não quebra, status explica
    {
        const { api, state } = loadDailyModule({ dailyEnabled: true }, { api: () => Promise.reject(new Error('HTTP 500')) });
        await api.dailyTick();
        assert(state.logs.some(l => l[0] === 'daily-erro') && /não consegui ler/.test(api.dailyStatus()), 'erro logado: ' + api.dailyStatus());
    }

    console.log('OK daily.test — leitura, abates, resgate, volta para a hunt e casos sem ação');
})().catch(e => { console.error(e); process.exit(1); });
