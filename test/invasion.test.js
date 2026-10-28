// Invasão Rocket (v3.50.0): janela por hora par de Brasília, entrada sozinha (energia, horas, bloqueios), acompanhamento da rodada
// (wave/abates), fim pelo `invasion-end` ou por silêncio, volta para a hunt (cura se o time caiu), recusa do jogo, entrada na mão,
// recarga no meio, Rocket Plans fora da venda e troca na Officer Jenny. Formatos levantados do bundle em 27/10/2026; frames `invasion-*`
// CONFIRMADOS no log em 28/10/2026 01:00Z (conta1). v3.50.1: a TELA manda o único enter-hunt (hunt-resume sintético) — dois enter-hunt
// = "Você já participou dessa invasão" + invasion-end left (rodada perdida com a energia gasta).
// Rodar: node test/invasion.test.js
const { loadInvasionModule, assert } = require('./harness');

const H = 3600e3, MIN = 60e3;
const T14 = Date.UTC(2026, 9, 27, 17, 0, 0);      // 14:00 de Brasília (UTC−3)
const ROCKET = 'rocket_cerulean';
const hh = (ts) => new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });   // o painel mostra horas no fuso do PC
const sentTypes = (st) => st.sent.map(m => m.type);
const logKinds = (st) => st.logs.map(l => l[0]);
const logsOf = (st, k) => st.logs.filter(l => l[0] === k).map(l => l[1]);

function jennyApi(opts) {
    opts = opts || {};
    const srv = { balance: opts.balance ?? 650, owned: new Set(opts.owned || []), posts: [] };
    const offers = () => [
        { key: 'ball', name: '100 Idle Balls', qty: 100, cost: 200, icon: '/b.png', description: 'Vão direto pra sua carteira de bolas', owned: false, kind: 'ball' },
        { key: 'token', name: 'Bronze Boss Token', qty: 1, cost: 1500, icon: '/t.png', owned: false, kind: 'item' },
        { key: 'outfit_recruit_m', name: 'Outfit Police Recruit (masc.)', qty: 1, cost: 5000, looktype: 3400, owned: srv.owned.has('outfit_recruit_m'), kind: 'outfit' },
        { key: 'medal', name: 'Police Bravery Medal', qty: 1, cost: 15000, icon: '/m.png', owned: false, kind: 'item' },
    ];
    srv.api = (url, o) => {
        if (opts.fail) throw new Error(opts.fail);
        if (!o || o.method !== 'POST') return { balance: srv.balance, token: { name: 'Rocket Plans', icon: '/p.png' }, offers: offers() };
        const b = JSON.parse(o.body); srv.posts.push(b);
        const of = offers().find(x => x.key === b.offer);
        if (!of) throw new Error('Oferta inválida');
        if (srv.balance < of.cost) throw new Error('Plans insuficientes');
        srv.balance -= of.cost;
        if (of.kind === 'outfit') srv.owned.add(of.key);
        return { prize: { kind: of.kind, name: of.name, qty: of.qty, icon: of.icon, looktype: of.looktype } };
    };
    return srv;
}

let done = false;
process.on('exit', () => { if (!done) { console.error('invasion.test.js: terminou sem concluir (promise pendurada?)'); process.exitCode = 1; } });
(async () => {
    // 1) janela: hora par de Brasília, 10 min de entrada, 30 min de invasão; horas aceitas; faixa pelo nível
    {
        const { api, clock } = loadInvasionModule({});
        clock.now = T14 + 5 * MIN;
        let w = api.windowAt();
        assert(w.startedAt === T14 && w.entryUntil === T14 + 10 * MIN && w.endsAt === T14 + 30 * MIN && w.nextAt === T14 + 2 * H, 'janela das 14h: início/entrada/fim/próxima');
        assert(w.entryOpen && w.live && api.hourOf(w.startedAt) === 14, 'entrada aberta às 14:05 BRT e hora BRT = 14');
        clock.now = T14 + 12 * MIN; w = api.windowAt();
        assert(!w.entryOpen && w.live, '14:12: entrada fechada, invasão rolando');
        clock.now = T14 + H; w = api.windowAt();
        assert(!w.entryOpen && !w.live && w.startedAt === T14, '15:00: mesma janela, nada aberto');
        clock.now = Date.UTC(2026, 9, 28, 2, 59, 0); w = api.windowAt();   // 23:59 BRT do dia 27
        assert(api.hourOf(w.startedAt) === 22 && w.nextAt === Date.UTC(2026, 9, 28, 3, 0, 0), 'última janela do dia é 22h; a próxima é 0h do dia seguinte (03:00Z)');
        // o servidor corrige a janela desta mesma faixa (entrada estendida)
        clock.now = T14 + 11 * MIN;
        api.onMessage({ type: 'invasion-state', live: true, entryOpen: true, entryUntil: T14 + 12 * MIN, endsAt: T14 + 32 * MIN });
        w = api.windowAt();
        assert(w.entryOpen && w.entryUntil === T14 + 12 * MIN && w.endsAt === T14 + 32 * MIN && w.fonte === 'servidor', 'janela corrigida pelo invasion-state');
        assert(JSON.stringify(api.hours({ invHours: '0, 12, 20h, 7, x, 12, 24' })) === '[0,12,20]', 'horas: só pares 0..23, sem repetir');
        assert(api.hours({ invHours: '' }).length === 0 && api.hours({ invHours: [2, '4'] }).join() === '2,4', 'horas vazias e lista');
        assert(api.tierLabel(58) === 'Kanto 60' && api.tierLabel(5) === 'Kanto 1' && api.tierLabel(140) === 'Kanto 100' && api.tierLabel(151) === 'Outland' && api.tierLabel(300) === 'Outland+', 'faixas Kanto/Outland');
        assert(api.tierLabel(500) === 'Orre 520 (−50%)' && api.tierLabel(700) === 'Orre 520 (−30%)' && api.tierLabel(999) === 'Orre 520' && api.tierLabel(1200) === 'Orre 600' && api.tierLabel(2000) === 'Nightmare 2000 (−50%)' && api.tierLabel(3600) === 'Nightmare 3000', 'faixas Orre/Nightmare com redução');
        assert(api.keepsItem(240) && !api.keepsItem(239) && api.isRaid('rocket_cerulean') && !api.isRaid('cerulean'), 'Rocket Plans = item 240; a invasão é a hunt rocket_cerulean');
        console.log('ok 1: janela, horas, faixas');
    }

    // 2) desligada: nada acontece; status explica
    {
        const { api, state, clock } = loadInvasionModule({ invEnabled: false }, { huntSlug: 'rhyhorn' });
        clock.now = T14 + 30e3;
        api.tick();
        assert(state.sent.length === 0 && !api.run() && !api.busy(), 'desligada: não pede energia nem entra');
        assert(/energia \?/.test(api.status()) && /entrada aberta até/.test(api.status({ invEnabled: true })), 'status: energia desconhecida; ligada mostra a entrada aberta');
        clock.now = T14 + 15 * MIN;
        assert(/invasão rolando até/.test(api.status()) && api.status({ invEnabled: true }).includes(`próxima entrada ${hh(T14 + 2 * H)}`), 'status: entrada fechada; ligada mostra a próxima às 16h');
        clock.now = T14 + 30e3;
        api.onSocket();
        assert(state.sent.length === 0, 'socket com a invasão desligada: não pede energia');
        console.log('ok 2: desligada');
    }

    // 3) ciclo completo: pede energia, espera 20 s, sai da hunt, entra, acompanha, invasion-end, volta
    {
        const { api, state, clock } = loadInvasionModule({ invEnabled: true }, { huntSlug: 'rhyhorn', team: [{ name: 'Golem', level: 58 }, { name: 'Rhyhorn', level: 40 }] });
        clock.now = T14 + 5e3;
        api.tick();
        assert(sentTypes(state).includes('invasion-energy-get') && !api.run(), '1º tique: pede a energia e espera');
        assert(/Energia Vermelha/.test(api.status()), 'status: esperando a leitura da energia');
        api.onMessage({ type: 'invasion-energy', energy: 3, live: true, entryOpen: true, entryUntil: T14 + 10 * MIN, endsAt: T14 + 30 * MIN });
        assert(api.energy() === 3 && logKinds(state).includes('invasao-campos') && logKinds(state).includes('invasao-energia'), 'energia lida e campos logados');
        api.tick();
        assert(!api.run(), 'antes de 20 s da abertura: não entra ainda');
        clock.now = T14 + 25e3;
        api.tick();
        const r = api.run();
        assert(r && r.from === 'rhyhorn' && r.origem === 'tique' && r.fase === 'saindo da hunt' && api.busy(), 'entrou no fluxo: hunt de volta = rhyhorn, ocupado');
        assert(sentTypes(state).includes('leave-hunt') && state.nudges === 1, 'saiu da hunt e mandou a tela viajar para a cidade');
        assert(api.tried()[T14] === 'entrou', 'janela marcada: não repete');
        api.onSetCity(); await state.flush();
        assert(!sentTypes(state).includes('set-city'), 'a tela chegou à cidade: não manda set-city');
        await state.fire(api.INV_LEAVE_WAIT_MS);
        const enters = () => state.sent.filter(m => m.type === 'enter-hunt' && m.slug === ROCKET);
        assert(state.huntNudges.length === 1 && state.switches.length === 0 && enters().length === 1 && enters()[0].pelaTela === true, 'hunt-resume sintético: a TELA manda o único enter-hunt (sem switchHunt)');
        assert(api.run().fase === 'dentro' && api.run().entered && api.hunt() === ROCKET, 'enter-hunt da tela visto: dentro');
        await state.fire(api.INV_TELA_WAIT_MS);
        assert(enters().length === 1 && logsOf(state, 'invasao-entrada').some(l => l.fase === 'enter-hunt' && l.pelaTela === true), 'a tela já estava na invasão: nenhum enter-hunt nosso (o 2º expulsava com "já participou")');
        assert(/Invasão Rocket em andamento/.test(api.busyReason()), 'motivo do bloqueio para os outros módulos');
        assert(JSON.parse(state.store.pgDiscordNotifyInvasion).from === 'rhyhorn', 'registro da rodada em localStorage com a hunt de volta');
        api.onField({ type: 'field', wave: 1, mobs: [] });
        api.onKill({ speciesName: 'Rattata', level: 60, xpGained: 2168 });
        api.onKill({ speciesName: 'Zubat', level: 60, xpGained: 2168 });
        api.onField({ type: 'field', wave: 2, mobs: [] });
        assert(api.run().wave === 2 && api.run().kills === 2 && logsOf(state, 'invasao-wave').length === 2 && logsOf(state, 'invasao-abate').length === 2, 'wave e abates acompanhados');
        api.onMessage({ type: 'invasion-refused', message: 'Você já participou dessa invasão. Espere a próxima!' });
        assert(api.run() && !api.run().ended && state.hooks.length === 0 && logsOf(state, 'invasao-recusada')[0].jaDentro === true, 'recusa com a rodada já em frames (enter-hunt duplicado): não aborta, o servidor decide');
        assert(/wave 2 · 2 Rockets/.test(api.status()) && /faixa Kanto 60 \(time lv 58\)/.test(api.status()), 'status dentro da invasão com a faixa prevista');
        // sem ligar a cura: o módulo da invasão NÃO entra (fica para a cura própria), só confere o bloqueio
        assert(api.blockedReason() === null, 'sem bloqueio externo');
        clock.now = T14 + 20 * MIN;
        api.onMessage({ type: 'invasion-end', wave: 5, bestWave: 4, reason: 'time', kills: 95, xp: 205960, tier: 'Kanto 60', level: 12, levelBefore: 10, reward: { qty: 8, name: 'Rocket Plans', icon: '/p.png' }, milestones: [], outfitReward: null });
        const fim = logsOf(state, 'invasao-fim')[0];
        assert(fim && fim.wave === 5 && fim.rockets === 95 && fim.abatesVistos === 2 && fim.plans === 8 && fim.motivo === 'time', 'log invasao-fim com os números do servidor');
        assert(state.hooks.length === 1 && /wave \*\*5\*\* 🏅 recorde/.test(state.hooks[0].content) && /8 Rocket Plans/.test(state.hooks[0].content) && /Nível de Invasão 12 \(\+2\)/.test(state.hooks[0].desc), 'aviso do fim com recorde, Plans e nível');
        assert(api.run().ended && api.run().fase === 'voltando' && api.busy(), 'voltando: ainda ocupado');
        await state.fire(api.INV_END_WAIT_MS);
        assert(sentTypes(state).filter(t => t === 'leave-hunt').length === 2 && sentTypes(state).includes('set-city') && !sentTypes(state).includes('joy-heal'), 'saiu da invasão para a cidade; sem cura (o time não caiu)');
        await state.fire(api.INV_LEAVE_WAIT_MS);
        assert(state.switches.length === 1 && state.switches[0].slug === 'rhyhorn' && state.switches[0].origem === 'invasao-volta', 'voltou para rhyhorn');
        assert(!api.run() && !api.busy() && !state.store.pgDiscordNotifyInvasion && api.last().wave === 5, 'rodada encerrada: livre, registro apagado, último resultado guardado');
        assert(/última \d\d:\d\d: wave 5, 95 Rockets, 8 Plans, Kanto 60/.test(api.status()), 'status: último resultado');
        clock.now = T14 + 21 * MIN; api.tick();
        assert(!api.run() && state.switches.length === 1 && state.huntNudges.length === 1, 'mesma janela depois do fim: não entra de novo');
        console.log('ok 3: ciclo completo');
    }

    // 4) pulos: energia na reserva, hora fora da lista, bloqueio externo (viagem) espera e entra quando libera
    {
        const { api, state, clock } = loadInvasionModule({ invEnabled: true, invKeepEnergy: 2 }, { huntSlug: 'rhyhorn' });
        clock.now = T14 + 30e3;
        api.onMessage({ type: 'invasion-energy', energy: 2, entryUntil: T14 + 10 * MIN, endsAt: T14 + 30 * MIN, live: true, entryOpen: true });
        api.tick();
        assert(!api.run() && api.tried()[T14] === 'energia 2 ≤ reserva 2' && logsOf(state, 'invasao-pulada')[0].motivo === 'energia 2 ≤ reserva 2', 'energia na reserva: pula a janela');
        assert(/esta janela: energia 2 ≤ reserva 2/.test(api.status()), 'status diz por que pulou');
    }
    {
        const { api, state, clock } = loadInvasionModule({ invEnabled: true, invHours: '0, 12, 20' }, { huntSlug: 'rhyhorn' });
        clock.now = T14 + 30e3;
        api.onMessage({ type: 'invasion-energy', energy: 5 });
        api.tick();
        assert(!api.run() && api.tried()[T14] === 'hora fora da lista', '14h não está na lista: pula');
        assert(api.status().includes(`próxima entrada ${hh(T14 + 6 * H)}`) && /horas 0h, 12h, 20h \(Brasília\)/.test(api.status()), 'status: próxima entrada permitida às 20h BRT');
        assert(state.sent.length === 0, 'não precisou nem pedir energia (energia veio sozinha)');
    }
    {
        const { api, state, clock } = loadInvasionModule({ invEnabled: true }, { huntSlug: 'rhyhorn' });
        clock.now = T14 + 30e3;
        api.onMessage({ type: 'invasion-energy', energy: 5 });
        state.env.tripRunning = true;
        api.tick();
        assert(!api.run() && !api.tried()[T14] && logsOf(state, 'invasao-espera')[0].motivo === 'viagem à cidade em andamento' && /parado: viagem à cidade/.test(api.status()), 'viagem em andamento: espera sem marcar a janela');
        state.env.tripRunning = false; state.env.hold = true;
        clock.now += 61e3; api.tick();   // o log invasao-espera sai 1x por minuto
        assert(!api.run() && /esperando na cidade/.test(logsOf(state, 'invasao-espera').pop().motivo), 'espera na cidade ligada: também espera');
        state.env.hold = false;
        clock.now += 61e3; api.tick();
        assert(api.run() && api.run().from === 'rhyhorn', 'bloqueio liberado com a entrada ainda aberta: entra');
        console.log('ok 4: pulos e esperas');
    }

    // 5) recusa do jogo na entrada: aborta, avisa e devolve a conta à hunt
    {
        const { api, state, clock } = loadInvasionModule({ invEnabled: true }, { huntSlug: 'rhyhorn', autoHunt: false });
        clock.now = T14 + 30e3;
        api.onMessage({ type: 'invasion-energy', energy: 1 });
        api.tick();
        api.onSetCity(); await state.flush();
        await state.fire(api.INV_LEAVE_WAIT_MS);
        assert(state.huntNudges.length === 1 && state.switches.length === 0 && api.run().fase === 'entrando' && !sentTypes(state).includes('enter-hunt'), 'tela avisada (hunt-resume), esperando ela mandar o enter-hunt');
        await state.fire(api.INV_TELA_WAIT_MS);
        assert(sentTypes(state).filter(t => t === 'enter-hunt').length === 1 && logsOf(state, 'invasao-entrada').some(l => l.fase === 'enter-hunt' && l.pelaTela === false), 'a tela não entrou em 5 s: enter-hunt direto (um só)');
        api.onMessage({ type: 'invasion-refused', message: 'Você não tem Energia Vermelha.' });
        assert(!api.run() && !api.busy(), 'recusa: rodada abortada');
        assert(state.hooks.length === 1 && /não entrei na Invasão Rocket — o jogo recusou \(Você não tem Energia Vermelha\.\)/.test(state.hooks[0].content), 'aviso da recusa');
        assert(logsOf(state, 'invasao-recusada').length === 1 && logsOf(state, 'invasao-entrada').some(l => l.fase === 'falhou'), 'logs da recusa e da entrada falhada');
        await state.fire(api.INV_LEAVE_WAIT_MS);
        assert(state.switches.length === 1 && state.switches[0].slug === 'rhyhorn' && state.switches[0].origem === 'invasao-volta', 'voltou para a hunt depois da recusa');
        assert(/recusa \d\d:\d\d: Você não tem Energia Vermelha/.test(api.status()), 'status mostra a recusa');
        // enter-hunt direto sem frame em 30 s também aborta (régua INV_CONFIRM_MS no tique)
        const t2 = loadInvasionModule({ invEnabled: true }, { huntSlug: 'rhyhorn', autoHunt: false });
        t2.clock.now = T14 + 30e3;
        t2.api.onMessage({ type: 'invasion-energy', energy: 1 });
        t2.api.tick(); t2.api.onSetCity(); await t2.state.flush(); await t2.state.fire(t2.api.INV_LEAVE_WAIT_MS); await t2.state.fire(t2.api.INV_TELA_WAIT_MS);
        assert(sentTypes(t2.state).includes('enter-hunt') && t2.api.run().fase === 'entrando', 'enter-hunt direto mandado');
        t2.clock.now += 20e3; t2.api.tick();
        assert(t2.api.run() && t2.state.hooks.length === 0, '20 s depois: ainda espera o frame');
        t2.clock.now += 15e3; t2.api.tick();
        assert(!t2.api.run() && t2.state.hooks.length === 1 && /nenhum frame da invasão chegou em 30 s/.test(t2.state.hooks[0].content), 'enter-hunt sem frame em 30 s: aborta e avisa');
        // enter-hunt da tela visto (dentro) mas nenhum frame: a mesma régua
        const t3 = loadInvasionModule({ invEnabled: true }, { huntSlug: 'rhyhorn' });
        t3.clock.now = T14 + 30e3; t3.api.onMessage({ type: 'invasion-energy', energy: 1 });
        t3.api.tick(); t3.api.onSetCity(); await t3.state.flush(); await t3.state.fire(t3.api.INV_LEAVE_WAIT_MS);
        assert(t3.api.run().fase === 'dentro' && !t3.api.run().fieldSeen, 'dentro pelo enter-hunt da tela, sem frame');
        t3.clock.now += 35e3; t3.api.tick();
        assert(!t3.api.run() && t3.state.hooks.length === 1 && /nenhum frame da invasão chegou em 30 s/.test(t3.state.hooks[0].content), 'dentro sem frame em 30 s: aborta e volta');
        await t3.state.fire(t3.api.INV_LEAVE_WAIT_MS);
        assert(t3.state.switches.length === 1 && t3.state.switches[0].slug === 'rhyhorn', 'voltou para rhyhorn');
        console.log('ok 5: recusa');
    }

    // 6) time caiu (wipe): cura na Joy antes de voltar; a cura própria do script não entra enquanto a rodada vale
    {
        const { api, state, clock } = loadInvasionModule({ invEnabled: true }, { huntSlug: 'rhyhorn' });
        clock.now = T14 + 30e3;
        api.onMessage({ type: 'invasion-energy', energy: 4 });
        api.tick(); api.onSetCity(); await state.flush(); await state.fire(api.INV_LEAVE_WAIT_MS);
        assert(api.run().fase === 'dentro', 'dentro');
        api.onMessage({ type: 'invasion-end', wave: 2, bestWave: 5, reason: 'wipe', kills: 23, xp: 1000, tier: 'Kanto 60', level: 3, levelBefore: 3, reward: { qty: 2 } });
        assert(state.hooks[0].color === 0xed4245 && /todo o time caiu/.test(state.hooks[0].title) && /recorde 5/.test(state.hooks[0].desc), 'aviso vermelho com o recorde antigo');
        await state.fire(api.INV_END_WAIT_MS);
        await state.fire(api.INV_LEAVE_WAIT_MS);
        assert(sentTypes(state).includes('joy-heal') && state.switches.length === 0, 'curou na Joy e ainda não voltou');
        await state.fire(api.INV_HEAL_WAIT_MS);
        assert(state.switches.length === 1 && state.switches[0].slug === 'rhyhorn' && logsOf(state, 'invasao-volta')[0].curou === true, 'voltou depois da cura');
        console.log('ok 6: wipe cura e volta');
    }

    // 7) entrada feita na mão (botão INVASÃO da tela): acompanha, segura os outros módulos e volta para a última hunt
    {
        const { api, state, clock } = loadInvasionModule({ invEnabled: false }, { huntSlug: null, lastRealHunt: 'golem' });
        clock.now = T14 + 2 * MIN;
        api.setHunt(ROCKET);   // setHunt → invOnHuntChange
        const r = api.run();
        assert(r && r.origem === 'tela' && r.from === 'golem' && r.fase === 'dentro' && api.busy(), 'entrada da tela: rodada acompanhada com a hunt lembrada como volta');
        assert(api.tried()[T14] === 'entrou (tela)', 'janela marcada pela entrada da tela');
        api.onField({ type: 'field', wave: 3 });
        api.onMessage({ type: 'invasion-end', wave: 3, bestWave: 3, reason: 'stall', kills: 50, xp: 10, tier: 'Outland', level: 1, reward: { qty: 6 } });
        await state.fire(api.INV_END_WAIT_MS); await state.fire(api.INV_LEAVE_WAIT_MS);
        assert(state.switches.length === 1 && state.switches[0].slug === 'golem' && state.switches[0].origem === 'invasao-volta', 'voltou para golem mesmo com a aba desligada (a conta nunca fica parada)');
        assert(!api.run(), 'livre');
        console.log('ok 7: entrada da tela');
    }

    // 8) recarga no meio da rodada: registro lembrado; conta nasceu na cidade → volta para a hunt de origem
    {
        const rec = { from: 'rhyhorn', origem: 'tique', at: T14 + 2 * MIN, windowStart: T14, endsAt: T14 + 30 * MIN, enteredAt: T14 + 2 * MIN, kills: 15, wave: 1 };
        const { api, state, clock } = loadInvasionModule({ invEnabled: true }, { huntSlug: null, store: { pgDiscordNotifyInvasion: JSON.stringify(rec) } });
        clock.now = T14 + 8 * MIN;
        api.load();
        assert(api.run() && api.run().origem === 'lembrado' && api.run().from === 'rhyhorn' && api.run().kills === 15 && api.busy(), 'rodada lembrada da carga anterior');
        assert(logKinds(state).includes('invasao-lembrada'), 'log invasao-lembrada');
        api.tick();
        assert(api.run() && !api.run().ended, 'logo após a carga: ainda espera (a hunt pode voltar pelo field-init)');
        clock.now += 20e3; api.tick();
        assert(api.run().ended && logsOf(state, 'invasao-fim')[0].semFrame === true && /recarga no meio/.test(logsOf(state, 'invasao-fim')[0].motivo), 'sem a hunt da invasão depois da carga: encerra e volta');
        await state.fire(api.INV_END_WAIT_MS);
        assert(!sentTypes(state).includes('leave-hunt'), 'já na cidade: não manda leave-hunt');
        assert(state.switches.length === 1 && state.switches[0].slug === 'rhyhorn' && !api.run(), 'voltou para rhyhorn');
        // registro velho (> 1 h) é descartado
        const t2 = loadInvasionModule({ invEnabled: true }, { store: { pgDiscordNotifyInvasion: JSON.stringify(Object.assign({}, rec, { at: T14 - 2 * H })) } });
        t2.clock.now = T14 + 8 * MIN; t2.api.load();
        assert(!t2.api.run() && !t2.state.store.pgDiscordNotifyInvasion, 'registro de 2 h atrás: ignorado e apagado');
        // field-init com a hunt da invasão depois da carga: a rodada continua
        const t3 = loadInvasionModule({ invEnabled: true }, { huntSlug: null, store: { pgDiscordNotifyInvasion: JSON.stringify(rec) } });
        t3.clock.now = T14 + 8 * MIN; t3.api.load(); t3.api.setHunt(ROCKET); t3.api.onField({ type: 'field', wave: 2 });
        t3.clock.now += 20e3; t3.api.tick();
        assert(t3.api.run() && !t3.api.run().ended && t3.api.run().wave === 2 && t3.api.run().kills === 15, 'hunt da invasão voltou: segue acompanhando com o progresso lembrado');
        console.log('ok 8: recarga no meio');
    }

    // 9) rodada que acaba sem invasion-end: tela saiu da hunt (1 min sem frame) ou janela encerrada
    {
        const { api, state, clock } = loadInvasionModule({ invEnabled: true }, { huntSlug: 'rhyhorn' });
        clock.now = T14 + 30e3;
        api.onMessage({ type: 'invasion-energy', energy: 4 });
        api.tick(); api.onSetCity(); await state.flush(); await state.fire(api.INV_LEAVE_WAIT_MS);
        api.onField({ type: 'field', wave: 1 });
        api.leaveHunt();   // a tela mandou leave-hunt (jogador saiu)
        clock.now += 30e3; api.tick();
        assert(api.run() && !api.run().ended, '30 s fora: ainda espera o invasion-end');
        clock.now += 40e3; api.tick();
        assert(api.run().ended && /fora da hunt da invasão há 1 min/.test(logsOf(state, 'invasao-fim')[0].motivo), '1 min fora sem invasion-end: encerra');
        await state.fire(api.INV_END_WAIT_MS);
        assert(state.switches.length === 1 && state.switches[0].slug === 'rhyhorn' && !api.run(), 'voltou para rhyhorn');
        const t2 = loadInvasionModule({ invEnabled: true }, { huntSlug: 'rhyhorn' });
        t2.clock.now = T14 + 30e3; t2.api.onMessage({ type: 'invasion-energy', energy: 4 });
        t2.api.tick(); t2.api.onSetCity(); await t2.state.flush(); await t2.state.fire(t2.api.INV_LEAVE_WAIT_MS);
        t2.clock.now = T14 + 31 * MIN; t2.api.onField({ type: 'field', wave: 9 }); t2.api.tick();
        assert(!t2.api.run().ended, 'ainda na hunt com frame: a graça de 90 s depois do fim vale');
        t2.clock.now = T14 + 32 * MIN; t2.api.tick();
        assert(t2.api.run().ended && /janela encerrada/.test(logsOf(t2.state, 'invasao-fim')[0].motivo), 'janela encerrada + graça sem invasion-end: encerra');
        console.log('ok 9: fim sem frame');
    }

    // 10) botão "Entrar agora"
    {
        const { api, state, clock } = loadInvasionModule({ invEnabled: false, invHours: '0' }, { huntSlug: 'rhyhorn' });
        clock.now = T14 + 15 * MIN;
        let r = api.now();
        assert(!r.ok && /Entrada fechada agora \(invasão em andamento\)/.test(r.msg) && r.msg.includes(`Próxima às ${hh(T14 + 2 * H)}`), 'botão com a entrada fechada: diz a próxima janela (o botão ignora a lista de horas)');
        clock.now = T14 + 2 * MIN;
        api.onMessage({ type: 'invasion-energy', energy: 0 });
        r = api.now();
        assert(!r.ok && /Sem Energia Vermelha/.test(r.msg), 'sem energia: não entra');
        api.onMessage({ type: 'invasion-energy', energy: 2 });
        r = api.now();
        assert(r.ok && api.run() && api.run().origem === 'botão' && api.tried()[T14] === 'entrou (botão)', 'botão entra mesmo com a aba desligada e fora das horas');
        assert(!api.now().ok, 'segundo clique: já há rodada');
        console.log('ok 10: botão');
    }

    // 11) Officer Jenny: leitura, quanto cabe, viagem pedida, troca na cidade (Shopping), outfit só 1x, reserva, oferta inexistente
    {
        const srv = jennyApi({ balance: 650 });
        const { api, state, clock } = loadInvasionModule({ invJennyEnabled: true, invJennyOffer: 'ball', invJennyKeep: 100 }, { huntSlug: 'rhyhorn', api: srv.api });
        clock.now = T14 + 40 * MIN;
        assert(/ainda não li/.test(api.jennyStatus()), 'status antes de ler');
        api.tick(); await state.flush();
        assert(state.calls.length === 1 && api.jenny() && api.jenny().balance === 650 && api.jenny().offers.length === 4, '1ª leitura da Jenny');
        assert(logKinds(state).includes('jenny-campos') && logsOf(state, 'jenny')[0].cabem === 2, 'campos logados; cabem 2 (650 − 100) ÷ 200');
        assert(state.trips.length === 1 && state.trips[0].key === 'jenny' && /2× 100 Idle Balls/.test(state.trips[0].motivo), 'viagem pedida com a tarefa jenny');
        assert(/cabem 2× 100 Idle Balls \(200 cada\)/.test(api.jennyStatus()), 'status: cabem 2');
        const p = api.jennyCityWork();   // espera o set-city shopping (3 s) e 1,2 s entre as trocas: timers falsos
        await state.flush(); await state.fire(api.INV_JENNY_CITY_WAIT_MS); await state.fire(api.INV_JENNY_BETWEEN_MS); await state.fire(api.INV_JENNY_BETWEEN_MS);
        const r = await p;
        assert(r.ok && r.motivo === '2× 100 Idle Balls', 'troca na cidade: 2 vezes');
        assert(sentTypes(state).includes('set-city') && state.sent.find(m => m.type === 'set-city').slug === 'shopping', 'foi ao Shopping antes de trocar');
        assert(srv.posts.length === 2 && srv.posts.every(p => p.offer === 'ball') && srv.balance === 250, '2 POSTs exchange; saldo 250');
        assert(sentTypes(state).includes('inv-get') && sentTypes(state).includes('balls-get'), 'relê mochila e bolas');
        assert(state.hooks.length === 1 && /Officer Jenny — 2× 100 Idle Balls \(200 100 Idle Balls\) por 400 Plans/.test(state.hooks[0].content), 'aviso da troca');
        assert(/faltam 50 para 100 Idle Balls/.test(api.jennyStatus()) && !api.jennyWanted(), 'depois: faltam 50 (reserva 100); nada mais a pedir');
        // outfit: só uma vez e depois "já é sua"
        const srv2 = jennyApi({ balance: 12000 });
        const t2 = loadInvasionModule({ invJennyEnabled: true, invJennyOffer: 'outfit_recruit_m' }, { huntSlug: 'rhyhorn', api: srv2.api, tripCity: 'shopping' });
        t2.clock.now = T14; await t2.api.jennyRead('teste');
        const r2 = await t2.api.jennyCityWork();
        assert(r2.ok && srv2.posts.length === 1 && !sentTypes(t2.state).includes('set-city'), 'outfit: 1 troca (já no Shopping: sem set-city)');
        const r3 = await t2.api.jennyCityWork();
        assert(r3.ok && /já é sua/.test(r3.motivo) && srv2.posts.length === 1 && !t2.api.jennyWanted(), 'outfit já comprada: não repete');
        // oferta que não existe
        const t3 = loadInvasionModule({ invJennyEnabled: true, invJennyOffer: 'foguete' }, { huntSlug: 'rhyhorn', api: jennyApi({}).api });
        t3.clock.now = T14; await t3.api.jennyRead('teste');
        const r4 = await t3.api.jennyCityWork();
        assert(!r4.ok && /oferta "foguete" não existe/.test(r4.motivo) && /não está na lista/.test(t3.api.jennyStatus()), 'oferta desconhecida: erro claro');
        // nome em vez da chave também vale
        const t4 = loadInvasionModule({ invJennyEnabled: true, invJennyOffer: 'Bronze Boss Token' }, { huntSlug: 'rhyhorn', api: jennyApi({ balance: 3100 }).api });
        t4.clock.now = T14; await t4.api.jennyRead('teste');
        assert(t4.api.jennyWanted() && /cabem 2× Bronze Boss Token/.test(t4.api.jennyStatus()), 'oferta pelo nome: 2 tokens');
        // erro de REST: 15 min sem insistir
        const t5 = loadInvasionModule({ invJennyEnabled: true, invJennyOffer: 'ball' }, { huntSlug: 'rhyhorn', api: jennyApi({ fail: 'HTTP 500' }).api });
        t5.clock.now = T14; t5.api.tick(); await t5.state.flush();
        assert(!t5.api.jenny() && logKinds(t5.state).includes('jenny-erro') && /não consegui ler/.test(t5.api.jennyStatus()), 'erro na leitura: log e status');
        t5.clock.now += 5 * MIN; t5.api.tick(); await t5.state.flush();
        assert(t5.state.calls.length === 1, '5 min depois do erro: não insiste');
        t5.clock.now += 11 * MIN; t5.api.tick(); await t5.state.flush();
        assert(t5.state.calls.length === 2, '16 min depois: tenta de novo');
        // dentro da rodada a Jenny espera (o tique da rodada não lê a Jenny)
        const t6 = loadInvasionModule({ invEnabled: true, invJennyEnabled: true, invJennyOffer: 'ball' }, { huntSlug: null, api: jennyApi({}).api });
        t6.clock.now = T14 + MIN; t6.api.setHunt(ROCKET); t6.api.tick(); await t6.state.flush();
        assert(t6.state.calls.length === 0, 'rodada em andamento: a Jenny espera');
        console.log('ok 11: Officer Jenny');
    }

    // 12) invasion-end sem rodada acompanhada (script carregou depois): só log e aviso; a Jenny relê
    {
        const { api, state, clock } = loadInvasionModule({ invEnabled: true, invJennyEnabled: true, invJennyOffer: 'ball' }, { huntSlug: 'cerulean', api: jennyApi({}).api });
        clock.now = T14 + 20 * MIN;
        api.onMessage({ type: 'invasion-end', wave: 1, bestWave: 1, reason: 'left', kills: 3, xp: 1, tier: 'Kanto 1', level: 1, reward: { qty: 2 } });
        assert(!api.run() && state.hooks.length === 1 && logsOf(state, 'invasao-fim')[0].origem === 'sem rodada acompanhada' && state.switches.length === 0, 'fim sem rodada: avisa, não mexe na hunt');
        api.tick(); await state.flush();
        assert(state.calls.length === 1, 'Jenny relida depois do fim');
        // anúncio e campos de frames desconhecidos só entram no log
        api.onMessage({ type: 'invasion-announce', text: 'ATENÇÃO A CIDADE DE CERULEAN ESTÁ SENDO INVADIDA…, TESTE!', until: T14 + 21 * MIN });
        api.onMessage({ type: 'invasion-announce', text: 'de novo' });
        assert(logsOf(state, 'invasao-anuncio').length === 1, 'anúncio logado 1x por 10 min');
        console.log('ok 12: fim sem rodada e anúncio');
    }

    // 13) tela sem o handler do hunt-resume (nudge falhou): enter-hunt nosso na hora, sem esperar os 5 s; com frame a rodada segue
    {
        const { api, state, clock } = loadInvasionModule({ invEnabled: true }, { huntSlug: 'rhyhorn', tela: false });
        clock.now = T14 + 30e3;
        api.onMessage({ type: 'invasion-energy', energy: 4 });
        api.tick(); api.onSetCity(); await state.flush(); await state.fire(api.INV_LEAVE_WAIT_MS);
        assert(state.huntNudges.length === 1 && sentTypes(state).filter(t => t === 'enter-hunt').length === 1 && api.run().fase === 'dentro', 'nudge falhou: enter-hunt nosso na hora, dentro');
        assert(logsOf(state, 'invasao-entrada').some(l => l.fase === 'tela' && l.tela === false), 'log da tela sem handler');
        api.onField({ type: 'field', wave: 1 });
        clock.now += 40e3; api.tick();
        assert(api.run() && !api.run().ended && api.run().fieldSeen, 'com frame: a rodada segue depois dos 30 s');
        console.log('ok 13: tela sem handler');
    }

    done = true;
    console.log('invasion.test.js: tudo ok');
})().catch(e => { console.error(e); process.exit(1); });
