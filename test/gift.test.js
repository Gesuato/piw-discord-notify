// Daily Gift: resgatar o presente do dia e entregar pelo Gift Center (v3.24.0). Rodar: node test/gift.test.js
const { loadGiftModule, assert } = require('./harness');

const MIN = 60 * 1000;
// Estado do GET /api/game/daily como o jogo devolve (só os campos que o script lê).
function calendario(o) {
    o = o || {};
    const nextDay = o.nextDay ?? 3;
    const rewards = [1, 2, 3, 4].map(day => ({ day, label: day === 3 ? 'Rare Candy' : `Dia ${day}`, qty: day === 3 ? 2 : 1, icon: '/x.png', tag: day === 3 ? 'RARE' : null, claimed: day < nextDay, current: day === nextDay, locked: day > nextDay }));
    return { canClaim: o.canClaim ?? true, claimedToday: Boolean(o.claimedToday), blockedByVip: Boolean(o.blockedByVip), nextDay, total: 28, rewards };
}
// API falsa: `s` é o estado do calendário (mutável); `center` é a lista do Gift Center (mutável: o claim tira da lista).
function fakeApi(s, center, falhas) {
    falhas = falhas || {};
    return (url, opts) => {
        const post = opts && opts.method === 'POST';
        if (url === '/api/game/daily' && post) {
            if (falhas.resgate) return Promise.reject(new Error(falhas.resgate));
            const label = calendario(s).rewards.find(r => r.current).label;
            s.claimedToday = true; s.canClaim = false; s.nextDay = (s.nextDay ?? 3) + 1;
            center.push({ id: 'g-daily', label, icon: 'x', grantedBy: 'Daily Gift' });
            return Promise.resolve(Object.assign(calendario(s), { claimed: { label } }));
        }
        if (url === '/api/game/daily') {
            if (falhas.leitura) return Promise.reject(new Error(falhas.leitura));
            return Promise.resolve(calendario(s));
        }
        if (url === '/api/game/gifts') return Promise.resolve({ gifts: center.slice() });
        const m = /^\/api\/game\/gifts\/([^/]+)\/claim$/.exec(url);
        if (m && post) {
            const i = center.findIndex(g => g.id === decodeURIComponent(m[1]));
            if (i < 0 || falhas.entrega === center[i].id) return Promise.reject(new Error('gift not found'));
            const [g] = center.splice(i, 1);
            return Promise.resolve({ granted: `${g.label} entregue` });
        }
        return Promise.reject(new Error('url inesperada ' + url));
    };
}
const urls = (state) => state.calls.map(c => (c.opts && c.opts.method === 'POST' ? 'POST ' : 'GET ') + c.url);

(async () => {
    // 1) desligado: o tique não consulta nada
    {
        const { api, state } = loadGiftModule({ giftEnabled: false }, { api: fakeApi({}, []) });
        await api.giftTick();
        assert(state.calls.length === 0, 'desligado não consulta');
        assert(api.giftStatus() === 'desligado', 'status desligado');
    }

    // 2) cenário principal (modo padrão 'daily'): resgata o dia 3, entrega SÓ o presente do dia no Gift Center
    //    (o outro presente, de um admin, fica), avisa uma vez e respeita o intervalo depois
    {
        const s = { nextDay: 3 };
        const center = [{ id: 'g-admin', label: 'XP Boost 1h', icon: 'x', grantedBy: 'admin' }];
        const { api, state, clock } = loadGiftModule({ giftEnabled: true, mentionUserId: '42' }, { api: fakeApi(s, center) });
        assert(api.giftStatus() === 'ainda não lido', 'status inicial: ' + api.giftStatus());
        await api.giftTick();
        assert(JSON.stringify(urls(state)) === JSON.stringify(['GET /api/game/daily', 'POST /api/game/daily', 'GET /api/game/gifts', 'POST /api/game/gifts/g-daily/claim']), 'chamadas: ' + urls(state).join(' | '));
        assert(center.length === 1 && center[0].id === 'g-admin', 'o presente do admin ficou no Gift Center');
        assert(state.hooks.length === 1 && state.hooks[0].kind === 'alert', 'um aviso em alert');
        assert(/<@42> 🎁 \*\*Teste\*\* resgatou o Daily Gift do dia 3\/28: \*\*Rare Candy ×2\*\*/.test(state.hooks[0].content), 'conteúdo: ' + state.hooks[0].content);
        assert(/Calendário: dia 3\/28 \(RARE\)\nPresente: Rare Candy ×2\nEntregue pelo Gift Center: Rare Candy entregue/.test(state.hooks[0].desc), 'embed: ' + state.hooks[0].desc);
        assert(api.giftLast && api.giftLast.label === 'Rare Candy' && api.giftLast.granted.length === 1, 'último resgate guardado');
        assert(api.giftStatus() === 'dia 4/28 · resgatado hoje: Rare Candy ×2 · 1 no Gift Center', 'status: ' + api.giftStatus());
        const kinds = state.logs.map(l => l[0]);
        assert(kinds.includes('gift') && kinds.includes('gift-resgate') && kinds.includes('gift-center') && !kinds.includes('gift-erro'), 'logs: ' + kinds.join(','));
        const n = state.calls.length;
        await api.giftTick();
        assert(state.calls.length === n, 'resgatado hoje: nada por 30 min');
        clock.now += 29 * MIN; await api.giftTick();
        assert(state.calls.length === n, 'ainda dentro dos 30 min');
        clock.now += 2 * MIN; await api.giftTick();
        assert(state.calls.length === n + 1 && urls(state)[n] === 'GET /api/game/daily', 'passados 30 min relê o calendário');
        assert(state.hooks.length === 1, 'já resgatado hoje: não resgata nem avisa de novo');
    }

    // 3) modo 'all': entrega tudo que estiver no Gift Center, inclusive sem resgate do dia (a cada leitura)
    {
        const s = { nextDay: 5, canClaim: false, claimedToday: true };
        const center = [{ id: 'a', label: 'Gold 500', icon: 'x', grantedBy: 'admin' }, { id: 'b', label: 'XP Boost 1h', icon: 'x', grantedBy: 'evento' }];
        const { api, state } = loadGiftModule({ giftEnabled: true, giftCenterMode: 'all' }, { api: fakeApi(s, center) });
        await api.giftTick();
        assert(JSON.stringify(urls(state)) === JSON.stringify(['GET /api/game/daily', 'GET /api/game/gifts', 'POST /api/game/gifts/a/claim', 'POST /api/game/gifts/b/claim']), 'chamadas all: ' + urls(state).join(' | '));
        assert(center.length === 0, 'Gift Center esvaziado');
        assert(state.hooks.length === 1 && /recebeu 2 presentes do Gift Center/.test(state.hooks[0].content), 'aviso do Gift Center: ' + state.hooks[0].content);
        assert(/Entregue pelo Gift Center: Gold 500 entregue · XP Boost 1h entregue/.test(state.hooks[0].desc), 'embed all: ' + state.hooks[0].desc);
        assert(api.giftStatus() === 'dia 5/28 · resgatado hoje', 'status all: ' + api.giftStatus());
    }

    // 4) modo '': resgata o dia, mas não mexe no Gift Center; o aviso diz que ficou no correio
    {
        const s = { nextDay: 3 };
        const center = [];
        const { api, state } = loadGiftModule({ giftEnabled: true, giftCenterMode: '' }, { api: fakeApi(s, center) });
        await api.giftTick();
        assert(JSON.stringify(urls(state)) === JSON.stringify(['GET /api/game/daily', 'POST /api/game/daily']), 'chamadas sem gift center: ' + urls(state).join(' | '));
        assert(center.length === 1, 'presente ficou no Gift Center');
        assert(/Ficou no Gift Center: resgate no jogo/.test(state.hooks[0].desc), 'aviso ficou no correio: ' + state.hooks[0].desc);
        assert(api.giftCenterMode() === '', 'modo vazio respeitado');
    }
    // 4b) modo inválido na config vira 'daily'
    {
        const { api } = loadGiftModule({ giftEnabled: true, giftCenterMode: 'x' }, { api: fakeApi({}, []) });
        assert(api.giftCenterMode() === 'daily', 'modo inválido = daily');
    }

    // 5) já resgatado hoje / só VIP / calendário concluído: não resgata, só informa
    {
        const s = { nextDay: 7, canClaim: false, claimedToday: true };
        const { api, state } = loadGiftModule({ giftEnabled: true }, { api: fakeApi(s, []) });
        await api.giftTick();
        assert(state.calls.length === 1 && state.hooks.length === 0, 'resgatado hoje: só lê');
        assert(api.giftStatus() === 'dia 7/28 · resgatado hoje', 'status resgatado: ' + api.giftStatus());
    }
    {
        const s = { nextDay: 3, canClaim: false, blockedByVip: true };
        const { api, state } = loadGiftModule({ giftEnabled: true }, { api: fakeApi(s, []) });
        await api.giftTick();
        assert(state.calls.length === 1 && state.hooks.length === 0, 'VIP: só lê');
        assert(api.giftStatus() === 'dia 3/28 · Rare Candy ×2 só para VIP', 'status vip: ' + api.giftStatus());
        const n = state.calls.length;
        await api.giftTick();
        assert(state.calls.length === n, 'bloqueado: espera 30 min');
    }
    {
        const s = { nextDay: 29, canClaim: false };
        const { api, state } = loadGiftModule({ giftEnabled: true }, { api: fakeApi(s, []) });
        await api.giftTick();
        assert(state.hooks.length === 0 && api.giftStatus() === 'calendário concluído (28 dias)', 'status concluído: ' + api.giftStatus());
    }
    // 5b) ainda não liberado (sem motivo): relê em 5 min
    {
        const s = { nextDay: 3, canClaim: false };
        const { api, state, clock } = loadGiftModule({ giftEnabled: true }, { api: fakeApi(s, []) });
        await api.giftTick();
        assert(api.giftStatus() === 'dia 3/28 · ainda não liberado hoje', 'status não liberado: ' + api.giftStatus());
        clock.now += 4 * MIN; await api.giftTick();
        assert(state.calls.length === 1, 'antes de 5 min não relê');
        clock.now += 2 * MIN; s.canClaim = true; await api.giftTick();
        assert(state.hooks.length === 1 && s.claimedToday, 'liberou: resgatou na releitura de 5 min');
    }

    // 6) resgate falhou: log gift-erro, sem aviso, tenta de novo só depois de 30 min
    {
        const s = { nextDay: 3 };
        const falhas = { resgate: 'HTTP 500' };
        const { api, state, clock } = loadGiftModule({ giftEnabled: true }, { api: fakeApi(s, [], falhas) });
        await api.giftTick();
        assert(state.hooks.length === 0 && api.giftFailedAt > 0, 'falha: sem aviso, marcada');
        assert(state.logs.some(l => l[0] === 'gift-erro' && l[1].etapa === 'resgate' && l[1].erro === 'HTTP 500'), 'log gift-erro resgate');
        assert(/pronto para resgatar \(o resgate falhou, tento de novo em 30 min\)/.test(api.giftStatus()), 'status falha: ' + api.giftStatus());
        const n = state.calls.length;
        await api.giftTick(true);
        assert(state.calls.length === n + 1 && !urls(state).slice(n).includes('POST /api/game/daily'), 'forçado antes de 30 min: lê, mas não tenta o POST');
        delete falhas.resgate;
        clock.now += 31 * MIN; await api.giftTick();
        assert(s.claimedToday && state.hooks.length === 1 && api.giftFailedAt === 0, 'depois de 30 min tenta de novo e resgata');
    }

    // 7) leitura falhou: log e status, sem travar o próximo tique
    {
        const falhas = { leitura: 'HTTP 503' };
        const { api, state } = loadGiftModule({ giftEnabled: true }, { api: fakeApi({ nextDay: 3 }, [], falhas) });
        await api.giftTick();
        assert(api.gift === null && api.giftStatus() === 'não consegui ler o calendário (veja o log)', 'status leitura falhou: ' + api.giftStatus());
        assert(state.logs.some(l => l[0] === 'gift-erro' && l[1].etapa === 'leitura'), 'log gift-erro leitura');
        delete falhas.leitura;
        await api.giftTick(true);
        assert(api.gift && api.gift.claimedToday, 'leitura seguinte funciona');
    }

    // 8) o presente do dia não apareceu no Gift Center: avisa que ficou lá e registra o que havia
    {
        const s = { nextDay: 3 };
        const center = [{ id: 'z', label: 'Outra coisa', icon: 'x', grantedBy: 'admin' }];
        const api0 = fakeApi(s, center);
        const apiSemDaily = (url, opts) => api0(url, opts).then(r => { if (url === '/api/game/daily' && opts?.method === 'POST') center.splice(center.findIndex(g => g.id === 'g-daily'), 1); return r; });
        const { api, state } = loadGiftModule({ giftEnabled: true }, { api: apiSemDaily });
        await api.giftTick();
        assert(state.hooks.length === 1 && /Não consegui entregar pelo Gift Center/.test(state.hooks[0].desc), 'aviso não entregue: ' + state.hooks[0].desc);
        assert(state.logs.some(l => l[0] === 'gift-center' && l[1].esperado === 'Rare Candy' && l[1].la.includes('Outra coisa')), 'log do que havia no Gift Center');
        assert(api.giftCenterCount === 1, 'contou o que sobrou');
    }

    // 9) scheduleGiftCheck: curto roda na hora (Salvar), e não roda com o módulo desligado
    {
        const s = { nextDay: 3 };
        const { api, state } = loadGiftModule({ giftEnabled: true }, { api: fakeApi(s, []) });
        api.scheduleGiftCheck(500);
        await new Promise(r => setTimeout(r, 5));
        assert(state.calls.length >= 2 && s.claimedToday, 'agendamento curto resgatou');
    }
    {
        const { api, state } = loadGiftModule({ giftEnabled: false }, { api: fakeApi({}, []) });
        api.scheduleGiftCheck(500);
        await new Promise(r => setTimeout(r, 5));
        assert(state.calls.length === 0, 'desligado não agenda');
    }

    console.log('gift.test.js: OK');
})().catch(e => { console.error(e); process.exit(1); });
