// Auto Boss (v3.43.0): retomar o Auto Boss do jogo quando ele para sem terminar. Rodar: node test/boss.test.js
const { loadBossModule, assert } = require('./harness');

const FEE = { itemId: 70000, name: 'Bronze Boss Token', qty: 1 };
const frame = (o) => Object.assign({ type: 'auto-boss', bossKey: 'cruel', bossName: 'Giant Cruel', loot: [], fee: FEE }, o);

(async () => {
    // 1) start pela tela -> intenção guardada; sessão ativa; `error` -> retomada: sai da arena, cura, confere tokens, pede só o que falta
    {
        const { api, state } = loadBossModule({}, { huntSlug: 'cruel_boss' });
        state.onSend = (o) => api.onOutgoing(o);   // como no script: o que o próprio script manda também passa por handleOutgoing
        assert(!api.busy() && api.busyReason() === null && /nenhum Auto Boss/.test(api.status()), 'parado no começo: ' + api.status());
        api.onOutgoing({ type: 'auto-boss-start', bossKey: 'cruel', count: 10 });
        const w = api.wanted();
        assert(w && w.bossKey === 'cruel' && w.total === 10 && w.origem === 'tela' && !w.sawActive, 'intenção: ' + JSON.stringify(w));
        assert(JSON.parse(state.store.pgDiscordNotifyBoss).bossKey === 'cruel', 'intenção persistida');
        assert(/pedido \(10 lutas\)/.test(api.status()), 'status pedido: ' + api.status());

        api.onFrame(frame({ active: true, phase: 'fighting', started: 3, total: 10, wins: 2, losses: 0, spent: 3, elapsedMs: 60000, fightMs: 5000, inMs: 0 }));
        assert(api.busy() && /Auto Boss do jogo em andamento/.test(api.busyReason()), 'ocupado com a sessão ativa: ' + api.busyReason());
        assert(/▶ Giant Cruel: luta 3\/10 · em combate/.test(api.status()) && /🏆 2 💀 0/.test(api.status()), 'status ativo: ' + api.status());
        const campos = state.logs.find(l => l[0] === 'auto-boss-campos');
        assert(campos && campos[1].chaves.includes('phase') && campos[1].fee.includes('itemId'), 'auto-boss-campos: ' + JSON.stringify(campos));
        assert(api.wanted().sawActive && api.wanted().prog.total === 10, 'progresso guardado: ' + JSON.stringify(api.wanted().prog));

        api.onFrame(frame({ active: false, reason: 'error', started: 4, total: 10, wins: 2, losses: 0, spent: 4 }));
        const parou = state.logs.find(l => l[0] === 'auto-boss-parado');
        assert(parou && parou[1].motivo === 'error' && parou[1].restantes === 8 && parou[1].retomadaEmS === 8, 'auto-boss-parado: ' + JSON.stringify(parou));
        assert(api.busy() && /agendada/.test(api.status()), 'retomada agendada: ' + api.status());
        assert(state.hooks.length === 0, 'sem aviso antes de retomar');

        await state.fire(api.BOSS_RESUME_DELAY_MS);
        assert(state.sent.some(s => s.type === 'leave-hunt') && state.sent.some(s => s.type === 'set-city' && s.slug === 'cerulean'), 'saiu da arena: ' + JSON.stringify(state.sent));
        assert(/retomando Giant Cruel \(saindo da hunt, tentativa 1\/3\)/.test(api.status()), 'status retomando: ' + api.status());
        api.setHunt(null);
        await state.fire(api.BOSS_LEAVE_WAIT_MS);
        assert(state.sent.some(s => s.type === 'joy-heal'), 'curou na Joy');
        await state.fire(api.BOSS_HEAL_WAIT_MS);
        assert(state.sent.some(s => s.type === 'inv-get'), 'pediu a mochila');
        assert(!state.sent.some(s => s.type === 'auto-boss-start'), 'ainda não pediu o start (espera a mochila)');
        api.onInventory([{ itemId: 70000, quantity: 5 }, { itemId: 201, quantity: 30 }]);
        await api.flush();
        const start = state.sent.find(s => s.type === 'auto-boss-start');
        assert(start && start.bossKey === 'cruel' && start.count === 5, 'start com as lutas limitadas aos tokens: ' + JSON.stringify(start));
        assert(api.wanted().origem === 'tela' && api.wanted().resumes === 0, 'o start do próprio script não vira intenção nova');

        api.onFrame(frame({ active: true, phase: 'starting', started: 0, total: 5, wins: 0, losses: 0, spent: 0 }));
        await api.flush();
        const ok = state.logs.find(l => l[0] === 'auto-boss-retomada' && l[1].fase === 'ok');
        assert(ok && ok[1].lutas === 5 && ok[1].retomadas === 1, 'retomada ok: ' + JSON.stringify(ok));
        assert(api.wanted().resumes === 1 && api.wanted().total === 5 && JSON.parse(state.store.pgDiscordNotifyBoss).resumes === 1, 'contador de retomadas persistido');
        assert(state.hooks.length === 1 && state.hooks[0].kind === 'alert' && /retomado em \*\*Giant Cruel\*\* com 5 lutas/.test(state.hooks[0].content) && /erro do jogo/.test(state.hooks[0].content), 'aviso de retomada: ' + JSON.stringify(state.hooks));
        assert(api.busy() && /1 retomada/.test(api.status()), 'status com a retomada: ' + api.status());

        // acabou a fila: encerra, avisa, esquece a intenção
        api.onFrame(frame({ active: false, reason: 'done', started: 5, total: 5, wins: 5, losses: 0, spent: 5, loot: [{ itemId: 142, name: 'Water Stone', qty: 7 }] }));
        assert(!api.wanted() && !api.busy() && !('pgDiscordNotifyBoss' in state.store), 'done encerra e limpa');
        const fim = state.logs.find(l => l[0] === 'auto-boss-fim');
        assert(fim && fim[1].motivo === 'done' && fim[1].retomadas === 1 && fim[1].loot[0] === '7x Water Stone', 'auto-boss-fim: ' + JSON.stringify(fim));
        assert(state.hooks.length === 2 && /concluído em \*\*Giant Cruel\*\* — 5 lutas/.test(state.hooks[1].content) && /7× Water Stone/.test(state.hooks[1].embeds), 'aviso de conclusão: ' + JSON.stringify(state.hooks[1]));
        assert(/último: Giant Cruel \(concluído\)/.test(api.status()), 'status final: ' + api.status());
    }

    // 2) "Parar" do jogador: o frame `stopped` encerra sem aviso e sem retomada; `no-token` encerra com aviso
    {
        const { api, state } = loadBossModule({}, {});
        api.onOutgoing({ type: 'auto-boss-start', bossKey: 'cruel', count: 20 });
        api.onFrame(frame({ active: true, phase: 'fighting', started: 2, total: 20, wins: 1, losses: 0 }));
        api.onOutgoing({ type: 'auto-boss-stop' });
        assert(api.wanted().stopping, 'stop marcado');
        api.onFrame(frame({ active: false, reason: 'error', started: 2, total: 20, wins: 1, losses: 0 }));   // mesmo que o motivo venha estranho: o jogador pediu para parar
        assert(!api.wanted() && !api.busy() && state.hooks.length === 0 && state.timers.filter(t => !t.interval).length === 0, 'stop = fim silencioso');

        api.onOutgoing({ type: 'auto-boss-start', bossKey: 'cruel', count: 20 });
        api.onFrame(frame({ active: true, phase: 'fighting', started: 4, total: 20, wins: 3, losses: 0 }));
        api.onFrame(frame({ active: false, reason: 'no-token', started: 4, total: 20, wins: 4, losses: 0, spent: 4 }));
        assert(!api.wanted() && !api.busy() && state.hooks.length === 1 && /tokens acabaram depois de 4 lutas/.test(state.hooks[0].content), 'no-token encerra e avisa: ' + JSON.stringify(state.hooks));
    }

    // 3) derrota: sem `bossResumeOnLoss` encerra, avisa e passa a bola para a cura na Joy; com a opção, retoma curando antes
    {
        const { api, state } = loadBossModule({ bossResumeOnLoss: false }, { huntSlug: 'cruel_boss' });
        api.onOutgoing({ type: 'auto-boss-start', bossKey: 'cruel', count: 10 });
        api.onFrame(frame({ active: true, phase: 'fighting', started: 6, total: 10, wins: 5, losses: 0 }));
        api.onFrame(frame({ active: false, reason: 'lost', started: 6, total: 10, wins: 5, losses: 1, spent: 6 }));
        assert(!api.wanted() && !api.busy(), 'derrota encerra');
        assert(state.hooks.length === 1 && /o time caiu em \*\*Giant Cruel\*\* na luta 6\/10/.test(state.hooks[0].content) && /retomada após derrota desligada/.test(state.hooks[0].content), 'aviso de derrota: ' + JSON.stringify(state.hooks));
        await state.fire(5000);
        assert(state.heals.length === 1 && /derrota no Auto Boss/.test(state.heals[0].motivo) && state.heals[0].caiu && state.heals[0].naCidade, 'cura na Joy chamada: ' + JSON.stringify(state.heals));
    }
    {
        const { api, state } = loadBossModule({ bossResumeOnLoss: true }, { huntSlug: null });
        api.onOutgoing({ type: 'auto-boss-start', bossKey: 'cruel', count: 10 });
        api.onFrame(frame({ active: true, phase: 'fighting', started: 6, total: 10, wins: 5, losses: 0 }));
        api.onFrame(frame({ active: false, reason: 'lost', started: 6, total: 10, wins: 5, losses: 1, spent: 6 }));
        assert(api.wanted() && api.busy(), 'derrota com a opção: retoma');
        const parou = state.logs.find(l => l[0] === 'auto-boss-parado');
        assert(parou && parou[1].motivo === 'lost' && parou[1].restantes === 4, 'faltam 4: ' + JSON.stringify(parou));
        assert(state.heals.length === 0, 'a cura na Joy do script não entra (quem cura é a retomada)');
        await state.fire(api.BOSS_RESUME_DELAY_MS);
        assert(!state.sent.some(s => s.type === 'leave-hunt') && state.sent.some(s => s.type === 'joy-heal'), 'fora de hunt: só cura: ' + JSON.stringify(state.sent));
    }

    // 4) recusa logo depois do start feito na mão (sessão nunca ativa): o jogo avisou o jogador, o script não insiste
    {
        const { api, state } = loadBossModule({}, { huntSlug: 'pidgey' });
        api.onOutgoing({ type: 'auto-boss-start', bossKey: 'cruel', count: 10 });
        api.onFrame(frame({ active: false }));   // "nada rodando" (resposta a um get) não mexe na intenção
        assert(api.wanted(), 'frame vazio antes da sessão: intenção segue');
        api.onFrame(frame({ active: false, reason: 'hunting' }));
        assert(!api.wanted() && !api.busy() && state.logs.some(l => l[0] === 'auto-boss-recusado' && l[1].motivo === 'hunting'), 'recusa encerra sem retomar');
        assert(state.timers.filter(t => !t.interval).length === 0 && state.hooks.length === 0, 'nada agendado, nada avisado');
    }

    // 5) o jogo não responde ao start: 3 tentativas (15/30/60 s) e desiste avisando; `no-token` na resposta desiste na hora
    {
        const { api, state } = loadBossModule({}, { huntSlug: null });
        api.onOutgoing({ type: 'auto-boss-start', bossKey: 'cruel', count: 10 });
        api.onFrame({ type: 'auto-boss', active: true, phase: 'fighting', bossKey: 'cruel', bossName: 'Giant Cruel', started: 1, total: 10, wins: 0, losses: 0 });   // sem fee: não confere a mochila
        api.onFrame({ type: 'auto-boss', active: false, reason: 'left', bossKey: 'cruel', bossName: 'Giant Cruel', started: 1, total: 10, wins: 0, losses: 0 });
        const tenta = async (n) => {
            await state.fire(api.BOSS_HEAL_WAIT_MS);
            assert(state.sent.filter(s => s.type === 'auto-boss-start').length === n, `start ${n} enviado`);
            await state.fire(api.BOSS_START_WAIT_MS);
            const f = state.logs.filter(l => l[0] === 'auto-boss-retomada' && l[1].fase === 'falhou');
            assert(f.length === n && f[n - 1][1].tentativa === n && /sem resposta/.test(f[n - 1][1].porque), `falha ${n}: ` + JSON.stringify(f));
        };
        await state.fire(api.BOSS_RESUME_DELAY_MS);
        await tenta(1);
        assert(api.wanted() && api.busy() && state.timers.some(t => t.ms === api.BOSS_RETRY_MS[0]), 'retry 1 agendado em 15 s');
        await state.fire(api.BOSS_RETRY_MS[0]);
        await tenta(2);
        await state.fire(api.BOSS_RETRY_MS[1]);
        await tenta(3);
        assert(!api.wanted() && !api.busy(), 'desistiu');
        const d = state.logs.find(l => l[0] === 'auto-boss-desisti');
        assert(d && /3 tentativas/.test(d[1].porque) && d[1].parou === 'left', 'auto-boss-desisti: ' + JSON.stringify(d));
        assert(state.hooks.length === 1 && /não consegui retomar o Auto Boss em \*\*Giant Cruel\*\*/.test(state.hooks[0].content), 'aviso de desistência: ' + JSON.stringify(state.hooks));
        assert(/desisti de retomar/.test(api.status()), 'status: ' + api.status());
    }
    {
        const { api, state } = loadBossModule({}, { huntSlug: null });
        api.onOutgoing({ type: 'auto-boss-start', bossKey: 'cruel', count: 10 });
        api.onFrame({ type: 'auto-boss', active: true, phase: 'fighting', bossKey: 'cruel', bossName: 'Giant Cruel', started: 1, total: 10, wins: 0, losses: 0 });
        api.onFrame({ type: 'auto-boss', active: false, reason: 'error', bossKey: 'cruel', started: 1, total: 10, wins: 0, losses: 0 });
        await state.fire(api.BOSS_RESUME_DELAY_MS);
        await state.fire(api.BOSS_HEAL_WAIT_MS);
        api.onFrame({ type: 'auto-boss', active: false, reason: 'no-token', bossKey: 'cruel' });
        await api.flush();
        assert(!api.wanted() && state.logs.some(l => l[0] === 'auto-boss-desisti' && /tokens/.test(l[1].porque)), 'no-token na resposta: desiste');
    }

    // 6) mochila sem o token: desiste sem mandar o start
    {
        const { api, state } = loadBossModule({}, { huntSlug: null });
        api.onOutgoing({ type: 'auto-boss-start', bossKey: 'cruel', count: 10 });
        api.onFrame(frame({ active: true, phase: 'fighting', started: 1, total: 10, wins: 0, losses: 0 }));
        api.onFrame(frame({ active: false, reason: 'error', started: 1, total: 10, wins: 0, losses: 0 }));
        await state.fire(api.BOSS_RESUME_DELAY_MS);
        await state.fire(api.BOSS_HEAL_WAIT_MS);
        api.onInventory([{ itemId: 201, quantity: 30 }]);
        await api.flush();
        assert(!state.sent.some(s => s.type === 'auto-boss-start'), 'sem token não pede');
        assert(!api.wanted() && state.logs.some(l => l[0] === 'auto-boss-desisti' && /sem Bronze Boss Token na mochila/.test(l[1].porque)), 'desistiu por falta de token');
    }

    // 7) recarga no meio da sessão: intenção lembrada do localStorage; socket novo pergunta; "nada rodando" sem motivo = retoma o que falta
    {
        const store = { pgDiscordNotifyBoss: JSON.stringify({ bossKey: 'cruel', bossName: 'Giant Cruel', total: 30, at: 1_700_000_000_000 - 60000, origem: 'tela', resumes: 2, sawActive: true, stopping: false, prog: { total: 30, wins: 10, losses: 1 } }) };
        const { api, state } = loadBossModule({}, { store, huntSlug: null });
        api.load();
        const lem = state.logs.find(l => l[0] === 'auto-boss-lembrado');
        assert(lem && lem[1].bossKey === 'cruel' && lem[1].retomadas === 2 && lem[1].idadeMin === 1, 'lembrado: ' + JSON.stringify(lem));
        api.onSocket();
        assert(state.sent.some(s => s.type === 'auto-boss-get') && state.logs.some(l => l[0] === 'auto-boss-get' && l[1].motivo === 'socket'), 'perguntou ao servidor');
        api.onFrame({ type: 'auto-boss', active: false });
        const parou = state.logs.find(l => l[0] === 'auto-boss-parado');
        assert(parou && parou[1].restantes === 19 && /sem motivo/.test(parou[1].motivo), 'retoma 30 − 10 − 1 = 19: ' + JSON.stringify(parou));
        assert(api.busy(), 'retomada agendada');
    }
    {   // intenção velha demais é descartada; sessão ativa que o script não viu começar vira intenção
        const store = { pgDiscordNotifyBoss: JSON.stringify({ bossKey: 'cruel', total: 30, at: 1_700_000_000_000 - 13 * 3600000, sawActive: true }) };
        const { api, state } = loadBossModule({}, { store });
        api.load();
        assert(!api.wanted() && !('pgDiscordNotifyBoss' in state.store), 'intenção de 13 h descartada');
        api.onFrame(frame({ active: true, phase: 'cooldown', started: 2, total: 8, wins: 2, losses: 0, inMs: 10000 }));
        assert(api.wanted() && api.wanted().origem === 'frame' && api.wanted().sawActive && api.wanted().total === 8, 'sessão vista no frame vira intenção: ' + JSON.stringify(api.wanted()));
        assert(/próxima luta em 10 s/.test(api.status()), 'status cooldown: ' + api.status());
        state.clock.now += api.BOSS_STALE_MS + 1000;
        api.tick();
        assert(state.sent.some(s => s.type === 'auto-boss-get') && state.logs.some(l => l[0] === 'auto-boss-get' && /10 min/.test(l[1].motivo)), 'sessão muda há 10 min: pergunta');
    }

    // 8) retomada desligada no painel: só registra; arena e sinais
    {
        const { api, state } = loadBossModule({ bossResumeEnabled: false }, { huntSlug: 'cruel_boss' });
        api.onOutgoing({ type: 'auto-boss-start', bossKey: 'cruel', count: 10 });
        api.onFrame(frame({ active: true, phase: 'fighting', started: 1, total: 10, wins: 0, losses: 0 }));
        assert(api.busy(), 'mesmo desligada, a sessão ativa segura os outros módulos');
        api.onFrame(frame({ active: false, reason: 'error', started: 1, total: 10, wins: 0, losses: 0 }));
        assert(!api.wanted() && !api.busy() && state.logs.some(l => l[0] === 'auto-boss-parado' && /desligada/.test(l[1].retomada)), 'desligada: não retoma');
        assert(/retomada desligada/.test(api.status()), 'status desligada: ' + api.status());
        assert(api.isArena('cruel_boss') && api.isArena('Aero_Boss') && !api.isArena('pidgey') && !api.isArena('') && !api.isArena('boss_mewtwo'), 'arena = slug terminado em _boss');
    }

    console.log('boss.test.js: ok');
})().catch(err => { console.error(err); process.exit(1); });
