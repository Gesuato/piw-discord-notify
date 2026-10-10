// Guild (v3.32.0): doação, tributo e rota da guild (tributo → Derrotar → pesca). Rodar: node test/guild.test.js
const { loadGuildModule, assert } = require('./harness');

const CREATURES = [
    { pokeId: 129, name: 'Magikarp', loot: [{ name: 'Magikarp Fin', chance: 60000, minCount: 1, maxCount: 2 }] },
    { pokeId: 253, name: 'Grovyle', loot: [{ name: 'Seed', chance: 50000, minCount: 1, maxCount: 1 }] },
    { pokeId: 16, name: 'Pidgey', loot: [{ name: 'Feather', chance: 90000, minCount: 1, maxCount: 3 }] },
];
const CATALOGO = [
    { slug: 'magikarp', name: 'Magikarp', level: 5, speciesId: 129, speciesName: 'Magikarp' },
    { slug: 'grovyle', name: 'Grovyle', level: 120, speciesId: 253, speciesName: 'Grovyle' },
    { slug: 'pidgey', name: 'Pidgey', level: 5, speciesId: 16, speciesName: 'Pidgey' },
];
const TIME = [{ id: 'a', name: 'Golem', level: 346, leader: true }];
function frame(o) {
    o = o || {};
    return {
        type: 'guild',
        guild: { id: 'g1', name: 'Cocorico', tag: 'COC', tier: 1, points: 7, members: 5, slots: 5, maxSlots: 11, nextSlot: { slot: 6, points: 50, gold: 3000000 }, goldDonated: 2500000, bonusPct: 2, online: 4 },
        me: { rank: 2, isPresident: false, canInvite: false, gold: o.gold ?? 20000000, donatedToday: o.doado ?? 0, donateCap: 500000, buff: null },
        members: [],
        hunts: [
            { id: 'h1', kind: 'kill', tier: 1, species: [{ dex: 253, name: 'Grovyle' }], progress: o.kill ?? 0, goal: 20000, done: (o.kill ?? 0) >= 20000 },
            { id: 'h2', kind: 'fish', tier: 1, species: [], progress: o.fish ?? 0, goal: 750, done: (o.fish ?? 0) >= 750 },
            { id: 'h3', kind: 'catch', tier: 1, species: [], progress: 45, goal: 45, done: true },
        ],
        huntsEndAt: Date.now() + 3600000,
        dailies: [], dailyRegions: [],
        tribute: o.tribute === null ? null : { id: 't1', itemId: 81, itemName: 'Magikarp Fin', progress: o.tprog ?? 0, goal: 3770, points: 2, mine: o.mine ?? 0, done: (o.tprog ?? 0) >= 3770 },
        tributeEndAt: Date.now() + 7200000, talents: [], points: { available: 7 }, dex: { caught: 0, total: 1, recent: [] }, history: [], invites: [],
    };
}
const fishApi = (s) => (url, opts) => {
    if (url === '/api/game/fishing-tier' && opts?.method === 'POST') { s.selected = JSON.parse(opts.body).tierId; s.posts = (s.posts || 0) + 1; return { ok: true }; }
    return { skill: 12, inLevel: 2, forNext: 20, selected: s.selected ?? 0, cooldownMs: s.cooldown || 0, tiers: [{ id: 0, unlocked: true, natural: false, minSkill: 0, mobLevel: [5, 10], names: ['Magikarp'] }, { id: 1, unlocked: true, natural: true, minSkill: 10, mobLevel: [10, 18], names: ['Poliwag', 'Goldeen'] }, { id: 2, unlocked: false, natural: false, minSkill: 20, mobLevel: [26, 36], names: ['Staryu'] }] };
};
const flush = () => new Promise(r => setImmediate(r));
const base = (extra) => Object.assign({ guildDonateGold: 0, guildDonateKeep: 0, guildTributeEnabled: false, guildTributeKeep: 0, guildAlerts: false, guildHuntEnabled: false, guildFishEnabled: false, guildFarmTribute: false }, extra || {});

(async () => {
    // 1) doação: doa o que falta até o valor (teto − doado, gold − reserva); frame de resposta confirma; teto batido = segura até o reinício do dia
    {
        const { api, state } = loadGuildModule(base({ guildDonateGold: 500000, guildDonateKeep: 19900000 }));
        api.handleGuild(frame({ gold: 20000000, doado: 0 }));
        const d = state.sent.filter(m => m.type === 'guild-action');
        assert(d.length === 1 && d[0].action === 'donate' && d[0].amount === 100000, 'doa gold − reserva: ' + JSON.stringify(d));
        api.handleGuild(frame({ gold: 19900000, doado: 100000 }));
        assert(api.guildLast.donate && api.guildLast.donate.ok && api.guildLast.donate.amount === 100000, 'doação confirmada pelo frame: ' + JSON.stringify(api.guildLast));
        assert(state.hooks.some(h => /doou \*\*100\.000 gold\*\*/.test(h.content)), 'avisou a doação');
        assert(state.sent.filter(m => m.type === 'guild-action').length === 1, 'com a reserva no limite não doa de novo');
        // outro dia: tenta, o jogo diz que já doou o máximo → segura até huntsEndAt
        const { api: a2, state: s2 } = loadGuildModule(base({ guildDonateGold: 500000 }));
        a2.handleGuild(frame({ doado: 0 }));
        assert(s2.sent.filter(m => m.type === 'guild-action').length === 1, 'tentou doar');
        a2.guildOnError({ type: 'error', message: 'Você já doou o máximo de hoje (500.000 gold).' });
        a2.handleGuild(frame({ doado: 0 }));   // frame velho ainda diz 0: NÃO insiste
        assert(s2.sent.filter(m => m.type === 'guild-action').length === 1, 'não insiste depois de "já doou o máximo"');
        // sobra menor que o pedido: refaz com a sobra
        const { api: a3, state: s3 } = loadGuildModule(base({ guildDonateGold: 500000 }));
        a3.handleGuild(frame({ doado: 0 }));
        a3.guildOnError({ type: 'error', message: 'Você só pode doar mais 499.000 gold hoje.' });
        s3.fire(300);
        const d3 = s3.sent.filter(m => m.type === 'guild-action');
        assert(d3.length === 2 && d3[1].amount === 499000, 'refez com a sobra: ' + JSON.stringify(d3));
    }

    // 2) tributo: deposita mine − guardar, limitado ao que falta; o item fica protegido enquanto o tributo está aberto
    {
        const { api, state } = loadGuildModule(base({ guildTributeEnabled: true, guildTributeKeep: 5 }));
        api.handleGuild(frame({ mine: 45, tprog: 3750 }));
        const t = state.sent.filter(m => m.type === 'guild-action');
        assert(t.length === 1 && t[0].action === 'tribute' && t[0].amount === 20, 'deposita min(45 − 5, 3770 − 3750): ' + JSON.stringify(t));
        assert(api.guildKeepsItem(81) && !api.guildKeepsItem(82), 'item do tributo protegido');
        api.handleGuild(frame({ mine: 25, tprog: 3770 }));
        assert(api.guildLast.tribute && api.guildLast.tribute.ok, 'tributo confirmado pelo frame');
        assert(!api.guildKeepsItem(81), 'tributo concluído: item liberado');
    }

    // 3) rota: tributo primeiro (hunt que mais dropa o item), depois Derrotar, depois pesca; volta no fim
    {
        const s = {};
        const { api, state } = loadGuildModule(base({ guildHuntEnabled: true, guildFishEnabled: true, guildFarmTribute: true }), { api: fishApi(s), creatures: CREATURES, huntCatalog: CATALOGO, team: TIME, huntSlug: 'ancient_pinsir' });
        api.handleGuild(frame({ mine: 0 }));
        await flush(); await flush();
        assert(api.guildTarget && api.guildTarget.kind === 'tributo' && api.guildTarget.slug === 'magikarp', 'alvo 1 = hunt do item do tributo: ' + JSON.stringify(api.guildTarget));
        assert(state.switches.length === 1 && state.switches[0].slug === 'magikarp' && state.switches[0].origem === 'guild', 'foi para magikarp: ' + JSON.stringify(state.switches));
        assert(api.guildFrom === 'ancient_pinsir', 'guardou a hunt de origem');
        api.setHunt('magikarp');
        // tributo fechou → Derrotar Grovyle
        api.handleGuild(frame({ tprog: 3770 }));
        await flush(); await flush();
        assert(api.guildTarget && api.guildTarget.kind === 'kill' && api.guildTarget.slug === 'grovyle', 'alvo 2 = hunt do Derrotar: ' + JSON.stringify(api.guildTarget));
        assert(state.switches[1] && state.switches[1].slug === 'grovyle', 'foi para grovyle');
        api.setHunt('grovyle');
        // o jogo reentra na hunt antiga: volta ao alvo 8 s depois
        api.setHunt('ancient_pinsir'); api.guildOnHuntChange('ancient_pinsir');
        state.fire(8000);
        assert(state.switches[2] && state.switches[2].slug === 'grovyle', 'reentrou no alvo depois da tela trocar: ' + JSON.stringify(state.switches));
        api.setHunt('grovyle');
        // Derrotar fechou → pesca: escolhe a faixa natural (POST), entra em pesca
        api.handleGuild(frame({ tprog: 3770, kill: 20000 }));
        await flush(); await flush(); await flush();
        assert(s.posts === 1 && s.selected === 1, 'marcou a faixa natural no jogo: ' + JSON.stringify(s));
        assert(api.guildTarget && api.guildTarget.kind === 'fish' && state.switches[3] && state.switches[3].slug === 'pesca', 'foi pescar: ' + JSON.stringify(state.switches));
        api.setHunt('pesca');
        // cooldown da pesca: reentra depois do prazo se a tela não reentrou
        api.setHunt(null);
        api.fishOnMessage({ type: 'fishing-cooldown', ms: 3000 });
        state.fire(4500);
        assert(state.switches[4] && state.switches[4].slug === 'pesca', 'reentrou na pesca depois do cooldown');
        api.setHunt('pesca');
        // tudo fechado → volta para a hunt de origem
        api.handleGuild(frame({ tprog: 3770, kill: 20000, fish: 750 }));
        await flush(); await flush();
        assert(!api.guildTarget && state.switches[5] && state.switches[5].slug === 'ancient_pinsir', 'voltou para a origem: ' + JSON.stringify(state.switches));
        assert(/concluíd/.test(api.guildWait), 'motivo da parada: ' + api.guildWait);
    }

    // 4) hunt acima do nível do time é pulada com motivo; só pesca ligada ignora o resto; Daily segura
    {
        const { api, state } = loadGuildModule(base({ guildHuntEnabled: true }), { creatures: CREATURES, huntCatalog: CATALOGO, team: [{ id: 'a', name: 'Pidgey', level: 30, leader: true }], huntSlug: 'pidgey' });
        api.handleGuild(frame());
        await flush(); await flush();
        assert(!api.guildTarget && /acima do seu time/.test(api.guildWait) && !state.switches.length, 'grovyle lv120 acima do time: ' + api.guildWait);
        const { api: b, state: sb } = loadGuildModule(base({ guildFishEnabled: true }), { api: fishApi({}), creatures: CREATURES, huntCatalog: CATALOGO, team: TIME, huntSlug: 'pidgey', dailyOnHunt: true });
        b.handleGuild(frame());
        await flush(); await flush();
        assert(!sb.switches.length && /Daily/.test(b.guildWait), 'Daily Kill segura a rota: ' + b.guildWait);
    }

    // 5) avisos: caçada e tributo concluídos entre dois frames (só com guildAlerts)
    {
        const { api, state } = loadGuildModule(base({ guildAlerts: true }));
        api.handleGuild(frame({ fish: 100 }));
        api.handleGuild(frame({ fish: 750, tprog: 3770 }));
        const av = state.hooks.filter(h => h.meta?.evento === 'guild-aviso');
        assert(av.length === 1 && /Pescar peixes/.test(av[0].desc) && /Tributo do Dia concluído/.test(av[0].desc), 'avisou caçada e tributo: ' + JSON.stringify(av));
    }

    console.log('OK guild.test — doação, tributo, rota (tributo → Derrotar → pesca), reentrada, cooldown da pesca, volta e avisos');
})().catch(e => { console.error(e); process.exit(1); });
