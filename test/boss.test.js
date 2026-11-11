// Auto Boss (v3.43.0, v3.43.1 entra na arena): retomar o Auto Boss do jogo quando ele para sem terminar. Rodar: node test/boss.test.js
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
        assert(/retomando Giant Cruel \(saindo da hunt, tentativa 1\/4\)/.test(api.status()), 'status retomando: ' + api.status());
        assert(api.wanted().arena === 'cruel_boss', 'arena vista na sessão: ' + JSON.stringify(api.wanted()));
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
        // v3.43.1: o servidor só começa a luta com o personagem na arena — a tela é mandada viajar (hunt-resume sintético)
        assert(state.nudges.length === 1 && state.nudges[0] === 'cruel_boss', 'tela mandada para a arena: ' + JSON.stringify(state.nudges));
        assert(api.busy() && /entrando na arena/.test(api.status()), 'status entrando na arena: ' + api.status());
        api.setHunt('cruel_boss');                                                 // a tela viajou e mandou o enter-hunt
        await state.fire(api.BOSS_ARENA_WAIT_MS);
        const arena = state.logs.find(l => l[0] === 'auto-boss-arena');
        assert(arena && arena[1].slug === 'cruel_boss' && arena[1].tela && arena[1].chegou && arena[1].direto === false, 'auto-boss-arena: ' + JSON.stringify(arena));
        assert(!state.sent.some(s => s.type === 'enter-hunt'), 'a tela entrou: o script não manda enter-hunt');
        assert(api.busy() && /1 retomada/.test(api.status()), 'status com a retomada: ' + api.status());
        api.onFrame(frame({ active: true, phase: 'fighting', started: 1, total: 5, wins: 0, losses: 0, spent: 1 }));
        assert(api.wanted().fought && api.wanted().noFight === 0, 'luta começou: ' + JSON.stringify(api.wanted()));

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

    // 5) o jogo não responde ao start: 4 tentativas (10/20/40/60 s) e desiste avisando; `no-token` na resposta desiste na hora
    {
        const { api, state } = loadBossModule({}, { huntSlug: null });
        api.onOutgoing({ type: 'auto-boss-start', bossKey: 'cruel', count: 10 });
        api.onFrame({ type: 'auto-boss', active: true, phase: 'fighting', bossKey: 'cruel', bossName: 'Giant Cruel', started: 1, total: 10, wins: 0, losses: 0 });   // sem fee: não confere a mochila
        api.onFrame({ type: 'auto-boss', active: false, reason: 'left', bossKey: 'cruel', bossName: 'Giant Cruel', started: 1, total: 10, wins: 0, losses: 0 });
        const tenta = async (n, tt = n) => {
            await state.fire(api.BOSS_HEAL_WAIT_MS);
            assert(state.sent.filter(s => s.type === 'auto-boss-start').length === n, `start ${n} enviado`);
            await state.fire(api.BOSS_START_WAIT_MS);
            const f = state.logs.filter(l => l[0] === 'auto-boss-retomada' && l[1].fase === 'falhou');
            assert(f.length === n && f[n - 1][1].tentativa === tt && /sem resposta/.test(f[n - 1][1].porque), `falha ${n}: ` + JSON.stringify(f));
        };
        await state.fire(api.BOSS_RESUME_DELAY_MS);
        await tenta(1);
        assert(api.wanted() && api.busy() && state.timers.some(t => t.ms === api.BOSS_RETRY_MS[0]), 'retry 1 agendado em 10 s');
        await state.fire(api.BOSS_RETRY_MS[0]);
        await tenta(2);
        await state.fire(api.BOSS_RETRY_MS[1]);
        await tenta(3);
        await state.fire(api.BOSS_RETRY_MS[2]);
        await tenta(4);
        // v3.60.0: desistir vira pausa de 10 min (até 3); só depois desiste de vez
        assert(api.wanted() && api.busy() && state.timers.some(t => t.ms === api.BOSS_PAUSE_MS), 'pausa de 10 min agendada');
        const p1 = state.logs.find(l => l[0] === 'auto-boss-pausa');
        assert(p1 && /4 tentativas/.test(p1[1].porque) && p1[1].parou === 'left' && p1[1].pausa === 1, 'auto-boss-pausa: ' + JSON.stringify(p1));
        assert(state.hooks.length === 1 && /Tento de novo em 10 min/.test(state.hooks[0].content), 'aviso da pausa: ' + JSON.stringify(state.hooks));
        assert(/agendada em 10 min 00 s \(pausa 1\/3\)/.test(api.status()), 'status pausa: ' + api.status());
        let n = 4;
        for (let pausa = 1; pausa <= api.BOSS_MAX_PAUSES; pausa++) {
            await state.fire(api.BOSS_PAUSE_MS);
            await tenta(++n, 1);
            for (let t = 0; t < api.BOSS_MAX_TRIES - 1; t++) { await state.fire(api.BOSS_RETRY_MS[t]); await tenta(++n, t + 2); }
        }
        assert(!api.wanted() && !api.busy(), 'desistiu depois das 3 pausas');
        const d = state.logs.find(l => l[0] === 'auto-boss-desisti');
        assert(d && /4 tentativas/.test(d[1].porque) && d[1].parou === 'left', 'auto-boss-desisti: ' + JSON.stringify(d));
        assert(state.logs.filter(l => l[0] === 'auto-boss-pausa').length === 3, 'três pausas');
        assert(state.hooks.length === 2 && /não consegui retomar o Auto Boss em \*\*Giant Cruel\*\*/.test(state.hooks[1].content) && /aba 👹 Boss/.test(state.hooks[1].content), 'aviso de desistência (a pausa avisa só a 1ª): ' + JSON.stringify(state.hooks));
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

    // 9) v3.43.1 — a tela não viaja: o script manda o enter-hunt da arena. v3.60.0: a sessão caiu no meio da luta = espera o que falta
    //    dela; retomada sem a luta começar espera 30/60/90/120 s; 5 seguidas = pausa (não desiste)
    {
        const { api, state } = loadBossModule({}, { huntSlug: null, nudge: false });
        api.onOutgoing({ type: 'auto-boss-start', bossKey: 'cruel', count: 100 });
        api.onFrame(frame({ active: true, phase: 'fighting', started: 14, total: 100, wins: 13, losses: 0, fightMs: 20000 }));
        state.clock.now += 10000;
        api.onFrame(frame({ active: false, started: 14, total: 100, wins: 14, losses: 0 }));   // reconexão: "nada rodando"
        const parou = state.logs.find(l => l[0] === 'auto-boss-parado');
        const espera = api.BOSS_FIGHT_TYPICAL_MS - 30000 + api.BOSS_FIGHT_MARGIN_MS;           // 20 s de luta + 10 s até o frame
        assert(parou && /sem motivo/.test(parou[1].motivo) && parou[1].restantes === 86 && parou[1].retomadaEmS === Math.round(espera / 1000), 'parou no meio da luta: espera o resto: ' + JSON.stringify(parou));
        const retoma = async (n, ms) => {
            await state.fire(ms);
            await state.fire(api.BOSS_HEAL_WAIT_MS);
            api.onInventory([{ itemId: 70000, quantity: 97 }]);
            await api.flush();
            const starts = state.sent.filter(s => s.type === 'auto-boss-start');
            assert(starts.length === n && starts[n - 1].count === 86, `start ${n}: ` + JSON.stringify(starts));
            api.onFrame(frame({ active: true, phase: 'starting', started: 0, total: 86, wins: 0, losses: 0, spent: 0 }));
            await api.flush();
            assert(api.wanted().resumes === n && !api.wanted().fought, `retomada ${n} ok`);
            await state.fire(api.BOSS_ARENA_WAIT_MS);                                  // a tela não respondeu ao hunt-resume
            const arenas = state.logs.filter(l => l[0] === 'auto-boss-arena');
            assert(arenas.length === n && arenas[n - 1][1].tela === false && !arenas[n - 1][1].chegou && arenas[n - 1][1].direto === true, `auto-boss-arena ${n}: ` + JSON.stringify(arenas));
            assert(state.sent.filter(s => s.type === 'enter-hunt' && s.slug === 'cruel_boss').length === n, `enter-hunt ${n} mandado pelo script`);
            api.onFrame(frame({ active: false, reason: 'error', started: 0, total: 86, wins: 0, losses: 0, spent: 0 }));   // 30 s depois: a luta não começou
        };
        await retoma(1, espera);
        for (let k = 1; k < api.BOSS_MAX_NO_FIGHT; k++) {
            assert(api.wanted() && api.wanted().noFight === k && api.busy(), `${k}ª vez sem luta: tenta de novo`);
            const p = state.logs.filter(l => l[0] === 'auto-boss-parado').pop();
            assert(p[1].retomadaEmS === api.BOSS_NO_FIGHT_DELAY_MS[k - 1] / 1000, `espera crescente ${k}: ` + JSON.stringify(p));
            await retoma(k + 1, api.BOSS_NO_FIGHT_DELAY_MS[k - 1]);
        }
        assert(api.wanted() && api.busy() && api.wanted().pauses === 1 && api.wanted().noFight === 0, 'na 5ª: pausa, não desiste');
        const pz = state.logs.find(l => l[0] === 'auto-boss-pausa');
        assert(pz && /5 retomadas seguidas sem a luta começar/.test(pz[1].porque), 'auto-boss-pausa: ' + JSON.stringify(pz));
        assert(state.hooks.filter(h => /retomado/.test(h.content)).length === 5 && state.hooks.filter(h => /Tento de novo/.test(h.content)).length === 1, 'avisos: ' + state.hooks.map(h => h.content).join(' | '));
        // o painel manda parar: esquece a intenção e a pausa; o token fica livre
        const st = api.stopNow();
        assert(st.ok && !api.wanted() && !api.busy() && state.timers.filter(t => t.ms === api.BOSS_PAUSE_MS).length === 0, 'parar pelo painel cancela a pausa: ' + JSON.stringify(st));
        assert(!api.keepsItem(70000), 'parado: token pode ser guardado');
    }
    {   // sem token desiste de vez (sem pausa) e o token fica fora do guardar por 2 h
        const { api, state } = loadBossModule({}, { huntSlug: null });
        api.onOutgoing({ type: 'auto-boss-start', bossKey: 'cruel', count: 10 });
        api.onFrame(frame({ active: true, phase: 'cooldown', started: 1, total: 10, wins: 1, losses: 0 }));
        api.onFrame(frame({ active: false, reason: 'error', started: 1, total: 10, wins: 1, losses: 0 }));
        await state.fire(api.BOSS_RESUME_DELAY_MS);
        await state.fire(api.BOSS_HEAL_WAIT_MS);
        api.onInventory([{ itemId: 201, quantity: 3 }]);
        await api.flush();
        assert(!api.wanted() && api.last().reason === 'desisti' && !state.logs.some(l => l[0] === 'auto-boss-pausa'), 'sem token desiste de vez');
        assert(api.keepsItem(70000) && !api.keepsItem(201), 'token guardado depois de desistir');
        state.clock.now += api.BOSS_KEEP_AFTER_MS + 1000;
        assert(!api.keepsItem(70000), 'depois de 2 h o token volta a poder ser guardado');
    }

    // 10) v3.43.1 — erro do jogo durante a retomada entra no motivo; token fora do guardar enquanto o boss está pendente.
    //     v3.60.0: "Sua luta de boss anterior ainda está terminando" não conta tentativa: espera 15 s e tenta de novo, por até 3 min
    {
        const { api, state } = loadBossModule({}, { huntSlug: 'cruel_boss' });
        assert(!api.keepsItem(70000), 'sem boss pendente o token pode ser guardado');
        api.onOutgoing({ type: 'auto-boss-start', bossKey: 'cruel', count: 10 });
        assert(api.keepsItem(70000) && !api.keepsItem(201), 'boss pedido: token fora do guardar');
        api.onFrame(frame({ active: true, phase: 'fighting', started: 1, total: 10, wins: 0, losses: 0 }));
        api.onFrame(frame({ active: false, started: 1, total: 10, wins: 0, losses: 0 }));
        const espera = api.BOSS_FIGHT_TYPICAL_MS + api.BOSS_FIGHT_MARGIN_MS;
        assert(state.logs.find(l => l[0] === 'auto-boss-parado')[1].retomadaEmS === Math.round(espera / 1000), 'queda no início da luta: espera a luta inteira');
        const tentaOcupado = async (ms) => {
            await state.fire(ms);
            api.setHunt(null);
            if (state.timers.some(t => t.ms === api.BOSS_LEAVE_WAIT_MS)) await state.fire(api.BOSS_LEAVE_WAIT_MS);
            await state.fire(api.BOSS_HEAL_WAIT_MS);
            api.onInventory([{ itemId: 70000, quantity: 9 }]);
            await api.flush();
            api.onError({ type: 'error', message: 'Sua luta de boss anterior ainda está terminando — aguarde alguns segundos.' });
            api.onFrame(frame({ active: false, reason: 'error', started: 1, total: 10, wins: 0, losses: 0 }));
            await api.flush();
        };
        await tentaOcupado(espera);
        assert(state.sent.filter(s => s.type === 'auto-boss-start' && s.count === 9).length === 1, 'start pedido');
        const e1 = state.logs.find(l => l[0] === 'auto-boss-retomada' && l[1].fase === 'espera');
        assert(e1 && /ainda está terminando/.test(e1[1].porque) && e1[1].tentativa === 1 && e1[1].proximaEmS === 15, 'espera em vez de falha: ' + JSON.stringify(e1));
        assert(!state.logs.some(l => l[0] === 'auto-boss-retomada' && l[1].fase === 'falhou'), 'não contou como falha');
        assert(api.wanted() && api.busy() && api.keepsItem(70000) && /ainda está terminando no servidor/.test(api.status()), 'retry agendado, token segue guardado: ' + api.status());
        // por ~3 min segue na tentativa 1; passou disso, conta como falha normal
        const falhou = () => state.logs.some(l => l[0] === 'auto-boss-retomada' && l[1].fase === 'falhou');
        let k = 1;
        while (!falhou() && k < 30) { await tentaOcupado(api.BOSS_BUSY_RETRY_MS); k++; }
        const f = state.logs.find(l => l[0] === 'auto-boss-retomada' && l[1].fase === 'falhou');
        assert(f && f[1].tentativa === 1 && /ainda está terminando/.test(f[1].porque) && k > 5 && k < 30, `depois de ~3 min conta a falha (${k} esperas): ` + JSON.stringify(f));
        assert(state.logs.filter(l => l[0] === 'auto-boss-retomada' && l[1].fase === 'espera').every(l => l[1].tentativa === 1), 'as esperas não gastam tentativa');
        api.onFrame(frame({ active: false, reason: 'done', started: 10, total: 10, wins: 10, losses: 0 }));   // (frame fora da retomada só registra: a retomada está agendada)
        assert(api.wanted(), 'frame com retomada agendada não encerra');
    }

    // 11) v3.60.0 — conta4 em 11/11/2026: queda no meio da luta; a retomada espera a luta terminar e a 1ª tentativa já pega;
    //     com progresso entre as quedas, passa das 10 retomadas sem desistir
    {
        const { api, state } = loadBossModule({}, { huntSlug: 'cruel_boss' });
        api.onOutgoing({ type: 'auto-boss-start', bossKey: 'cruel', count: 100 });
        api.onFrame(frame({ active: true, phase: 'fighting', started: 4, total: 100, wins: 3, losses: 0, last: { outcome: 'won', durationMs: 72000 } }));
        api.onFrame(frame({ active: true, phase: 'cooldown', started: 4, total: 100, wins: 4, losses: 0, last: { outcome: 'won', durationMs: 72000 } }));
        assert(api.wanted().fightMs === 72000, 'duração da luta guardada');
        api.onFrame(frame({ active: true, phase: 'fighting', started: 5, total: 100, wins: 4, losses: 0, fightMs: 0, last: { outcome: 'won', durationMs: 72000 } }));
        state.clock.now += 12000;                                                       // 01:13:41 luta 5 → 01:13:53 frame da reconexão
        api.onFrame({ type: 'auto-boss', active: false, started: 0, total: 0, wins: 0, losses: 0 });
        const p = state.logs.find(l => l[0] === 'auto-boss-parado');
        const ms = 72000 - 12000 + api.BOSS_FIGHT_MARGIN_MS;
        assert(p && p[1].restantes === 96 && p[1].retomadaEmS === ms / 1000, 'retoma as 96 depois de a luta terminar: ' + JSON.stringify(p));
        await state.fire(ms);
        api.setHunt(null);
        await state.fire(api.BOSS_LEAVE_WAIT_MS);
        await state.fire(api.BOSS_HEAL_WAIT_MS);
        api.onInventory([{ itemId: 70000, quantity: 96 }]);
        await api.flush();
        assert(state.sent.some(s => s.type === 'auto-boss-start' && s.count === 96), 'start com 96');
        api.onFrame(frame({ active: true, phase: 'starting', started: 0, total: 96, wins: 0, losses: 0 }));
        await api.flush();
        assert(api.wanted().resumes === 1 && api.wanted().stuck === 1, 'retomada conta como seguida sem luta até uma terminar');
        await state.fire(api.BOSS_ARENA_WAIT_MS);
        api.onFrame(frame({ active: true, phase: 'cooldown', started: 1, total: 96, wins: 1, losses: 0 }));
        assert(api.wanted().stuck === 0 && api.wanted().pauses === 0, 'uma luta terminou: zera as seguidas');
        for (let q = 0; q < api.BOSS_MAX_RESUMES + 2; q++) {
            api.setHunt('cruel_boss');
            api.onFrame({ type: 'auto-boss', active: false, started: 0, total: 0, wins: 0, losses: 0 });
            const t = state.timers.find(x => !x.interval && x.ms >= api.BOSS_RESUME_DELAY_MS);
            assert(t, `queda ${q}: retomada agendada`);
            await state.fire(t.ms);
            api.setHunt(null);
            await state.fire(api.BOSS_LEAVE_WAIT_MS);
            await state.fire(api.BOSS_HEAL_WAIT_MS);
            api.onInventory([{ itemId: 70000, quantity: 90 }]);
            await api.flush();
            const last = state.sent.filter(s => s.type === 'auto-boss-start').pop();
            api.onFrame(frame({ active: true, phase: 'starting', started: 0, total: last.count, wins: 0, losses: 0 }));
            await api.flush();
            await state.fire(api.BOSS_ARENA_WAIT_MS);
            api.onFrame(frame({ active: true, phase: 'cooldown', started: 1, total: last.count, wins: 1, losses: 0 }));
        }
        assert(api.wanted() && api.wanted().resumes === api.BOSS_MAX_RESUMES + 3 && !state.logs.some(l => l[0] === 'auto-boss-desisti' || l[0] === 'auto-boss-pausa'), 'mais de 10 retomadas com progresso: segue');
    }

    // 12) v3.60.0 — aba Boss: iniciar pelo painel (sai da hunt, cura, confere tokens, start, arena), parar e retomar agora
    {
        const { api, state } = loadBossModule({}, { huntSlug: 'pidgey' });
        state.onSend = (o) => api.onOutgoing(o);
        assert(!api.startNow('mewtwo', 10).ok, 'boss sem arena recusado');
        const r = api.startNow('cruel', 500);
        assert(r.ok && /Giant Cruel com 100 lutas/.test(r.msg), 'iniciar (teto 100): ' + JSON.stringify(r));
        assert(api.wanted().origem === 'painel' && api.wanted().arena === 'cruel_boss' && api.busy(), 'intenção do painel');
        assert(state.sent.some(s => s.type === 'leave-hunt'), 'saiu da hunt');
        assert(!api.startNow('cruel', 5).ok, 'não inicia dois de uma vez');
        api.setHunt(null);
        await state.fire(api.BOSS_LEAVE_WAIT_MS);
        await state.fire(api.BOSS_HEAL_WAIT_MS);
        api.onInventory([{ itemId: 70000, quantity: 40 }]);
        await api.flush();
        const st = state.sent.find(s => s.type === 'auto-boss-start');
        assert(st && st.count === 40, 'start limitado aos tokens: ' + JSON.stringify(st));
        assert(api.wanted().origem === 'painel', 'o próprio start não vira intenção da tela');
        api.onFrame(frame({ active: true, phase: 'starting', started: 0, total: 40, wins: 0, losses: 0 }));
        await api.flush();
        assert(api.wanted().resumes === 0 && state.hooks.length === 0, 'início pelo painel não conta retomada nem avisa');
        assert(state.nudges[0] === 'cruel_boss', 'tela mandada para a arena');
        api.setHunt('cruel_boss');
        await state.fire(api.BOSS_ARENA_WAIT_MS);
        api.onFrame(frame({ active: true, phase: 'fighting', started: 1, total: 40, wins: 0, losses: 0 }));
        const stop = api.stopNow();
        assert(stop.ok && state.sent.some(s => s.type === 'auto-boss-stop') && api.wanted().stopping, 'parar manda o stop do jogo');
        api.onFrame(frame({ active: false, reason: 'stopped', started: 1, total: 40, wins: 1, losses: 0 }));
        assert(!api.wanted() && !api.busy(), 'parado');
        assert(api.stopNow().ok === false, 'parar sem nada rodando');
    }
    {
        const { api, state } = loadBossModule({}, { huntSlug: null });
        api.onOutgoing({ type: 'auto-boss-start', bossKey: 'cruel', count: 10 });
        api.onFrame(frame({ active: true, phase: 'cooldown', started: 3, total: 10, wins: 3, losses: 0 }));
        api.onFrame(frame({ active: false, reason: 'error', started: 3, total: 10, wins: 3, losses: 0 }));
        assert(state.timers.some(t => t.ms === api.BOSS_RESUME_DELAY_MS), 'retomada agendada');
        const r = api.resumeNow();
        assert(r.ok && /7 lutas/.test(r.msg) && !state.timers.some(t => t.ms === api.BOSS_RESUME_DELAY_MS), 'retomar agora pula a espera: ' + JSON.stringify(r));
        assert(/retomando Giant Cruel/.test(api.status()), 'status: ' + api.status());
    }

    // 13) v3.60.1 — conta4 em 11/11/2026 02:03–02:06Z: retomada com a conta DENTRO da arena. A saída faz a tela viajar (set-city da
    //     própria tela); 2 retomadas aceitas sem a luta começar = recarrega o painel; na carga nova o "nada rodando" não conta
    {
        const { api, state } = loadBossModule({}, { huntSlug: 'cruel_boss', reload: true, nudgeCity: () => true });
        api.onOutgoing({ type: 'auto-boss-start', bossKey: 'cruel', count: 90 });
        api.onFrame(frame({ active: true, phase: 'cooldown', started: 23, total: 90, wins: 23, losses: 0 }));
        api.onFrame(frame({ active: false, reason: 'error', started: 23, total: 90, wins: 23, losses: 0 }));
        const ciclo = async (ms) => {
            await state.fire(ms);
            assert(state.sent.filter(s => s.type === 'leave-hunt').length >= 1, 'saiu da arena');
            api.setHunt(null);
            api.onSetCity();                                                             // a tela chegou na cidade (set-city dela)
            await state.fire(api.BOSS_LEAVE_WAIT_MS);
            await state.fire(api.BOSS_HEAL_WAIT_MS);
            api.onInventory([{ itemId: 70000, quantity: 80 }]);
            await api.flush();
            api.onFrame(frame({ active: true, phase: 'starting', started: 0, total: 67, wins: 0, losses: 0 }));
            await api.flush();
            api.setHunt('cruel_boss');
            await state.fire(api.BOSS_ARENA_WAIT_MS);
            api.onFrame(frame({ active: false, reason: 'error', started: 0, total: 67, wins: 0, losses: 0 }));   // 30 s em starting
        };
        await ciclo(api.BOSS_RESUME_DELAY_MS);
        const saida = state.logs.find(l => l[0] === 'auto-boss-saida');
        assert(saida && saida[1].tela && saida[1].chegouPelaTela && state.cityNudges === 1, 'a tela saiu da arena: ' + JSON.stringify(saida));
        assert(!state.sent.some(s => s.type === 'set-city'), 'a tela mandou o set-city: o script não manda');
        assert(api.wanted().noFight === 1 && !state.reloads, '1ª sem luta: espera e tenta de novo');
        await ciclo(api.BOSS_NO_FIGHT_DELAY_MS[0]);
        assert(api.wanted().noFight === 2 && state.logs.some(l => l[0] === 'auto-boss-recarga'), '2ª sem luta: recarrega o painel');
        await state.fire(1500);
        assert(state.reloads && state.reloads.length === 1 && /tela presa na arena/.test(state.reloads[0]), 'recarregou: ' + JSON.stringify(state.reloads));
        assert(JSON.parse(state.store.pgDiscordNotifyBoss).reloadAt > 0, 'recarga anotada (1x a cada 15 min)');
        // carga nova: intenção lembrada; o "nada rodando" do get não conta como luta que não começou
        const b = loadBossModule({}, { store: state.store, huntSlug: null, reload: true });
        b.state.clock.now = state.clock.now;
        b.api.load();
        b.api.onFrame({ type: 'auto-boss', active: false });
        const p = b.state.logs.find(l => l[0] === 'auto-boss-parado');
        assert(p && p[1].retomadaEmS === b.api.BOSS_RESUME_DELAY_MS / 1000 && b.api.wanted().noFight === 2, 'carga nova retoma em 8 s sem contar: ' + JSON.stringify(p));
        await b.state.fire(b.api.BOSS_RESUME_DELAY_MS);
        await b.state.fire(b.api.BOSS_HEAL_WAIT_MS);
        b.api.onInventory([{ itemId: 70000, quantity: 80 }]);
        await b.api.flush();
        assert(b.state.sent.some(s => s.type === 'auto-boss-start' && s.count === 67), 'pede as 67 com a tela nova');
        b.api.onFrame(frame({ active: true, phase: 'fighting', started: 1, total: 67, wins: 0, losses: 0 }));
        assert(b.api.wanted().noFight === 0 && b.api.wanted().fought, 'luta começou');
    }

    // 14) v3.61.0 — 300 tokens: blocos de 100 em sequência até acabar; no fim volta para a hunt de antes
    {
        const { api, state } = loadBossModule({ bossRepeat: true, bossReturnHunt: true }, { huntSlug: 'enraged_typhlosion' });
        state.onSend = (o) => api.onOutgoing(o);
        const bloco = async (tokens, esperado) => {
            api.setHunt(null);
            await state.fire(api.BOSS_LEAVE_WAIT_MS);
            await state.fire(api.BOSS_HEAL_WAIT_MS);
            api.onInventory([{ itemId: 70000, quantity: tokens }]);
            await api.flush();
            const starts = state.sent.filter(s => s.type === 'auto-boss-start');
            assert(starts[starts.length - 1].count === esperado, `pediu ${esperado}: ` + JSON.stringify(starts));
            api.onFrame(frame({ active: true, phase: 'fighting', started: 1, total: esperado, wins: 0, losses: 0 }));
            await api.flush();
            api.setHunt('cruel_boss');
            await state.fire(api.BOSS_ARENA_WAIT_MS);
        };
        assert(api.startNow('cruel', 100).ok, 'iniciou');
        assert(api.wanted().from === 'enraged_typhlosion', 'hunt de volta guardada');
        await bloco(300, 100);
        api.onFrame(frame({ active: false, reason: 'done', started: 100, total: 100, wins: 99, losses: 1, spent: 100, loot: [{ itemId: 1, name: 'Gema', qty: 5 }] }));
        const b1 = state.logs.find(l => l[0] === 'auto-boss-bloco');
        assert(b1 && b1[1].bloco === 1 && api.wanted() && api.wanted().acc.wins === 99, 'bloco 1 somado: ' + JSON.stringify(b1));
        assert(!state.hooks.some(h => /concluído/.test(h.content)), 'sem aviso de concluído no meio');
        assert(/bloco 1 concluído/.test(api.status()), 'status entre blocos: ' + api.status());
        assert(JSON.parse(state.store.pgDiscordNotifyBoss).acc.blocks === 1, 'placar dos blocos persistido');
        await state.fire(api.BOSS_NEXT_BLOCK_MS);
        await bloco(200, 100);
        assert(api.wanted().resumes === 0, 'bloco novo não conta retomada');
        assert(/bloco 2/.test(api.status()), 'status no bloco 2: ' + api.status());
        api.onFrame(frame({ active: false, reason: 'done', started: 100, total: 100, wins: 100, losses: 0, spent: 100, loot: [{ itemId: 1, name: 'Gema', qty: 3 }] }));
        await state.fire(api.BOSS_NEXT_BLOCK_MS);
        await bloco(100, 100);
        // o jogo encerra o 3º bloco porque acabaram as fichas
        api.onFrame(frame({ active: false, reason: 'no-token', started: 100, total: 100, wins: 100, losses: 0, spent: 100 }));
        assert(!api.wanted(), 'acabou');
        const l = api.last();
        assert(l.reason === 'no-token' && l.wins === 299 && l.losses === 1 && l.total === 300 && l.blocks === 3, 'placar somado: ' + JSON.stringify(l));
        assert(l.loot.find(x => x.name === 'Gema').qty === 8, 'loot somado');
        const fim = state.hooks.find(h => /tokens acabaram/.test(h.content));
        assert(fim && /em 3 blocos/.test(fim.embeds), 'aviso do fim com os blocos: ' + JSON.stringify(state.hooks.map(h => h.content)));
        await state.fire(api.BOSS_RETURN_DELAY_MS);
        assert(state.switches && state.switches[0].slug === 'enraged_typhlosion' && state.switches[0].origem === 'boss-volta', 'voltou para a hunt: ' + JSON.stringify(state.switches));
        const v = state.logs.find(x => x[0] === 'auto-boss-volta');
        assert(v && v[1].ok, 'log da volta: ' + JSON.stringify(v));
    }
    // 14b) bloco seguinte sem ficha na mochila = fim limpo (sem "desisti") e volta pelo idleTarget; "Parar" não volta
    {
        const { api, state } = loadBossModule({ bossRepeat: true, bossReturnHunt: true }, { huntSlug: null, idleSlug: 'pidgey' });
        state.onSend = (o) => api.onOutgoing(o);
        api.onOutgoing({ type: 'auto-boss-start', bossKey: 'cruel', count: 100 });
        api.onFrame(frame({ active: true, phase: 'fighting', started: 1, total: 100, wins: 0, losses: 0 }));
        api.onFrame(frame({ active: false, reason: 'done', started: 100, total: 100, wins: 100, losses: 0, spent: 100 }));
        await state.fire(api.BOSS_NEXT_BLOCK_MS);
        await state.fire(api.BOSS_HEAL_WAIT_MS);
        api.onInventory([]);
        await api.flush();
        assert(!state.sent.some(s => s.type === 'auto-boss-start'), 'não pede sem fichas');
        assert(!api.wanted() && api.last().reason === 'no-token' && !state.logs.some(x => x[0] === 'auto-boss-desisti'), 'fim limpo: ' + JSON.stringify(api.last()));
        await state.fire(api.BOSS_RETURN_DELAY_MS);
        assert(state.switches && state.switches[0].slug === 'pidgey', 'voltou pela hunt lembrada: ' + JSON.stringify(state.switches));
    }
    {
        const { api, state } = loadBossModule({ bossRepeat: true, bossReturnHunt: true }, { huntSlug: 'cruel_boss', idleSlug: 'pidgey' });
        api.onOutgoing({ type: 'auto-boss-start', bossKey: 'cruel', count: 100 });
        api.onFrame(frame({ active: true, phase: 'fighting', started: 1, total: 100, wins: 0, losses: 0 }));
        api.onOutgoing({ type: 'auto-boss-stop' });
        api.onFrame(frame({ active: false, reason: 'stopped', started: 5, total: 100, wins: 5, losses: 0 }));
        await state.fire(api.BOSS_RETURN_DELAY_MS);
        assert(!state.switches && !api.wanted(), 'Parar não repete nem volta');
    }
    // 14c) sem repetir: concluído encerra e volta (comportamento antigo + volta)
    {
        const { api, state } = loadBossModule({ bossRepeat: false, bossReturnHunt: true }, { huntSlug: null, idleSlug: 'pidgey' });
        api.onOutgoing({ type: 'auto-boss-start', bossKey: 'cruel', count: 10 });
        api.onFrame(frame({ active: true, phase: 'fighting', started: 1, total: 10, wins: 0, losses: 0 }));
        api.onFrame(frame({ active: false, reason: 'done', started: 10, total: 10, wins: 10, losses: 0 }));
        assert(!api.wanted() && api.last().reason === 'done' && !state.logs.some(x => x[0] === 'auto-boss-bloco'), 'sem repetir: fim');
        await state.fire(api.BOSS_RETURN_DELAY_MS);
        assert(state.switches && state.switches[0].slug === 'pidgey', 'voltou');
    }
    console.log('boss.test.js: ok');
})().catch(err => { console.error(err); process.exit(1); });
