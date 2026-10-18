// Verificação humana (v3.40.0): detectar a exigência do Turnstile, avisar e marcar como resolvida. Rodar: node test/human.test.js
const { loadHumanModule, assert } = require('./harness');

(async () => {
    // 1) leitura na carga confirma o formato no log
    {
        const { api, state } = loadHumanModule({});
        await api.sniff();
        const c = state.logs.find(l => l[0] === 'humano-campos');
        assert(c && c[1].mode === 'on' && c[1].faltaMin === 60 && c[1].chaves.includes('until'), 'humano-campos: ' + JSON.stringify(c));
        assert(/ok até/.test(api.status()), 'status ok: ' + api.status());
        assert(!api.pending(), 'nada pendente');
    }

    // 2) socket fechado com 4011 -> pendente; 20 s depois avisa; o socket religado resolve e avisa de novo
    {
        const { api, state } = loadHumanModule({}, { huntSlug: 'pidgey' });
        api.onClose({ code: 1006, reason: '', wasClean: false });
        assert(!api.pending() && state.logs.some(l => l[0] === 'socket-fechado' && l[1].motivo === 'caiu sem fechar'), 'fechamento comum só entra no log');
        api.onClose({ code: 4011, reason: 'human', wasClean: true });
        assert(api.pending(), 'pendente após 4011');
        const p = state.logs.find(l => l[0] === 'humano-pendente');
        assert(p && /4011/.test(p[1].origem) && p[1].hunt === 'pidgey', 'log humano-pendente: ' + JSON.stringify(p));
        assert(/pendente/.test(api.status()), 'status pendente: ' + api.status());
        api.onClose({ code: 4011 });
        assert(state.logs.filter(l => l[0] === 'humano-pendente').length === 1, 'segundo 4011 não duplica a pendência');
        assert(state.hooks.length === 0, 'ainda sem aviso');
        await state.fire(api.HUMAN_ALERT_DELAY_MS);
        assert(state.hooks.length === 1 && state.hooks[0].kind === 'alert' && /verificação humana/.test(state.hooks[0].content) && /20 s/.test(state.hooks[0].content), 'aviso após 20 s: ' + JSON.stringify(state.hooks));
        assert(state.hooks[0].title === 'Verificação humana pendente' && state.hooks[0].meta.evento === 'humano-aviso', 'embed do aviso');
        await state.fire(api.HUMAN_ALERT_GAP_MS);
        assert(state.hooks.length === 2 && state.hooks[1].meta.aviso === 2, 'repete a cada 15 min: ' + state.hooks.length);
        api.onTracked();
        assert(!api.pending(), 'socket novo resolve o 4011');
        const ok = state.logs.find(l => l[0] === 'humano-ok');
        assert(ok && ok[1].origem === 'socket religado' && ok[1].avisos === 2, 'log humano-ok: ' + JSON.stringify(ok));
        assert(state.hooks.length === 3 && /concluída/.test(state.hooks[2].content), 'avisa que resolveu');
        assert(state.timers.length === 0, 'timers limpos: ' + JSON.stringify(state.timers.map(t => t.ms)));
    }

    // 3) 403 human-check num REST do script -> pendente + evento para a tela abrir a janela; prazo renovado resolve pelo GET
    {
        let until = new Date(1_700_000_000_000 - 1000).toISOString();
        const { api, state, clock } = loadHumanModule({}, { api: async () => ({ mode: 'on', until, renewBeforeMs: 300000 }) });
        await api.sniff();
        assert(api.onForbidden({ message: 'Forbidden' }, '/api/game/shop') === false && !api.pending(), '403 comum não é verificação humana');
        assert(api.onForbidden({ code: 'human-check' }, '/api/game/shop/buy?x=1') === true && api.pending(), '403 human-check pendente');
        assert(state.events.includes('pw:human-check'), 'disparou pw:human-check para a tela');
        const p = state.logs.find(l => l[0] === 'humano-pendente');
        assert(p && p[1].url === '/api/game/shop/buy' && p[1].untilAntes === until, 'log com a URL sem query: ' + JSON.stringify(p));
        assert(state.logs.filter(l => l[0] === 'humano-pendente').length === 1, 'evento da tela não duplica (já pendente)');
        await state.fire(api.HUMAN_POLL_MS);
        assert(api.pending(), 'mesmo prazo vencido: segue pendente');
        until = new Date(clock.now + 3600000).toISOString();
        await state.fire(api.HUMAN_POLL_MS);
        assert(!api.pending() && state.logs.some(l => l[0] === 'humano-ok' && l[1].origem === 'prazo renovado'), 'prazo novo resolve');
        assert(state.hooks.length === 2 && state.hooks[0].meta.evento === 'humano-aviso' && /prazo renovado/.test(state.hooks[1].content), 'avisou aos 20 s e avisou que resolveu: ' + JSON.stringify(state.hooks.map(h => h.meta)));
    }

    // 4) evento da tela sozinho; verificação desligada no servidor resolve
    {
        const { api, state } = loadHumanModule({}, { api: async () => ({ mode: 'off' }) });
        state.listeners['pw:human-check'].forEach(fn => fn({ type: 'pw:human-check' }));
        assert(api.pending() && state.logs.some(l => l[0] === 'humano-pendente' && /tela/.test(l[1].origem)), 'evento da tela deixa pendente');
        await state.fire(api.HUMAN_POLL_MS);
        assert(!api.pending() && state.logs.some(l => l[0] === 'humano-ok' && /desligada/.test(l[1].origem)), 'mode off resolve');
    }

    // 5) vigia: janela "Confirme que você é humano" abre e fecha; widget aberto por 15 s vira pendência e fechar resolve
    {
        const { api, state, clock } = loadHumanModule({});
        state.dom.overlay = true; api.watch();
        assert(api.pending() && state.logs.some(l => l[0] === 'humano-pendente' && /janela/.test(l[1].origem)), 'janela aberta = pendente');
        state.dom.overlay = false; api.watch();
        assert(!api.pending() && state.logs.some(l => l[0] === 'humano-ok' && l[1].origem === 'janela fechada'), 'janela fechada resolve');

        state.dom.widgetOn = true; api.watch();
        clock.now += 3000; api.watch();
        state.dom.widgetOn = false; api.watch();
        assert(!api.pending() && !state.logs.some(l => l[0] === 'humano-desafio'), 'renovação silenciosa de 3 s: nada no log');

        state.dom.widgetOn = true; api.watch();
        clock.now += api.HUMAN_WIDGET_MS; api.watch();
        assert(api.pending() && state.logs.some(l => l[0] === 'humano-desafio' && l[1].aberto === true && l[1].seg === 15), 'widget 15 s = pendente + log');
        clock.now += 5000; api.watch();
        assert(state.logs.filter(l => l[0] === 'humano-desafio').length === 1, 'log do desafio aberto só uma vez');
        state.dom.widgetOn = false; api.watch();
        assert(!api.pending() && state.logs.some(l => l[0] === 'humano-desafio' && l[1].aberto === false && l[1].seg === 20), 'widget fechado resolve e loga a duração');
    }

    // 6) com 4011 a janela fechar não resolve (quem resolve é o socket religado)
    {
        const { api, state } = loadHumanModule({});
        api.onClose({ code: 4011 });
        state.dom.overlay = true; api.watch();
        state.dom.overlay = false; api.watch();
        assert(api.pending(), 'janela fechada com 4011 pendente: segue esperando o socket');
        api.onTracked();
        assert(!api.pending(), 'socket religado resolve');
    }

    console.log('human.test.js: ok');
})().catch(err => { console.error(err); process.exit(1); });
