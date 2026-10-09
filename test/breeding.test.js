// Breeding automático (v3.29.0): comida só com quality E IV menores que quem sobe; cotação tem de dizer que o IV vem de quem
// sobe (donorId, growth, baseQuality); viagem pedida com plano; na cidade tira stones/comida da família, cota de novo e cruza
// (parent1 = quem sobe, free, double); choca o ovo pronto e o filho vira quem sobe; sem material fica parado e avisa 1x.
// Formatos de center/quote/breed = log de 09/10/2026 (contas 2 e 3). Rodar: node test/breeding.test.js
const { loadBreedModule, assert } = require('./harness');

const TRONCO = { id: 'cmv0dbbau1r52l4ln1pwms2wm', speciesId: 232, name: 'Donphan', level: 20, team: false, quality: 1.466, ivTotal: 126, sellValue: 13000 };
const COMIDA = { id: 'cmv0czucq1pdnl4lnp0py3pyv', speciesId: 232, name: 'Donphan', level: 18, team: false, quality: 1.345, ivTotal: 104, sellValue: 13000 };
const LIDER = { id: 'lider', speciesId: 103, name: 'Exeggutor', level: 365, team: true, leader: true, quality: 1.7, ivTotal: 150 };
const P = (o) => Object.assign({}, COMIDA, o);

const GROWTH = { hp: 4, atk: 26, def: 32, spAtk: 25, spDef: 9, speed: 30 };   // soma 126 (conta3)
const quoteOf = (a, b, opts) => Object.assign({
    childSpeciesId: 232, childSpeciesName: 'Donphan', childTypes: ['GROUND'],
    stones: { base: [{ itemId: 40, name: 'Earth Stone', icon: 'earth_stone.gif', need: 20, have: opts?.have ?? 40 }], double: [{ itemId: 40, name: 'Earth Stone', icon: 'earth_stone.gif', need: 40, have: opts?.have ?? 40 }], baseOk: (opts?.have ?? 40) >= 20, doubleOk: (opts?.have ?? 40) >= 40 },
    rank: 'N', free: true, freeAllowed: true, goldFee: 2000000, pheromoneCost: 0, pheromonesHave: 0, killsRequired: 3000, shinyChild: false, partnerExcess: null,
    delta: { table: [{ delta: 0.005, pct: 50 }, { delta: 0.01, pct: 35 }, { delta: 0.02, pct: 12 }, { delta: 0.04, pct: 3 }], baseQuality: Math.max(a.quality, b.quality), minQuality: Math.max(a.quality, b.quality) + 0.005, maxQuality: Math.max(a.quality, b.quality) + 0.04, expectedDelta: 0.01, cap: 2.6 },
    ivPreview: { growth: opts?.growth || GROWTH, ivTotal: a.quality >= b.quality ? a.ivTotal : b.ivTotal, donor: a.quality >= b.quality ? 'pai' : 'mae', shinyRef: false, bump: { chance: 0.05, possible: true, maxTotal: 127 }, donorId: a.quality >= b.quality ? a.id : b.id },
    parents: { a: { id: a.id, shiny: false, ivTotal: a.ivTotal, quality: a.quality, bqs: 48 }, b: { id: b.id, shiny: false, ivTotal: b.ivTotal, quality: b.quality, bqs: 40 } },
}, opts?.extra || {});
const centerOf = (eggs, extra) => Object.assign({ unlocked: true, unlockLevel: 60, level: 410, slots: 2, maxSlots: 6, usedSlots: eggs.length, nextSlotCost: 30, gold: 5280331, diamonds: 1, pheromones: 0, pheromoneItemId: 44417, instantHatchCost: 2, eggs }, extra || {});
const EGG = { id: 'cmv0eimak2ya7labrq97qy157', speciesId: 232, speciesName: 'Donphan', rank: 'N', shinyChild: false, killsDone: 0, killsRequired: 3000, ready: false };

// API falsa: `box` é um mapa id -> Pokémon para a cotação; `have` = stones na mochila (muda com a retirada da família)
function fakeApi(opts) {
    const st = Object.assign({ eggs: [], have: 40, gold: 5280331, hatch: null, box: {} }, opts);
    const posts = [];
    const api = (url, o) => {
        if (o?.method === 'POST') {
            const b = JSON.parse(o.body); posts.push(b);
            if (b.action === 'breed') { if (st.breedError) throw new Error(st.breedError); st.eggs = st.eggs.concat([Object.assign({}, EGG, { id: 'ovo-' + posts.length })]); st.gold -= 2000000; return centerOf(st.eggs, { gold: st.gold }); }
            if (b.action === 'hatch') { if (st.hatchError) throw new Error(st.hatchError); st.eggs = st.eggs.filter(e => e.id !== b.eggId); return st.hatch || { ok: true }; }
            throw new Error('POST inesperado ' + JSON.stringify(b));
        }
        if (/action=center/.test(url)) return centerOf(st.eggs, { gold: st.gold });
        const m = url.match(/parent1=([^&]+)&parent2=([^&]+)&free=(\d)/);
        if (!m) throw new Error('GET inesperado ' + url);
        const a = st.box[decodeURIComponent(m[1])], b = st.box[decodeURIComponent(m[2])];
        if (!a || !b) throw new Error('Pokémon não encontrado');
        return quoteOf(a, b, { have: st.have, growth: st.growth });
    };
    return { api, posts, st };
}

(async () => {
    // 1) filtro da comida: mesma espécie, Q E IV menores, Q até 0,15 abaixo, IV abaixo do teto; nunca shiny/time/inicial; família entra; mais fraco primeiro
    {
        const cfg = { breedEnabled: true, breedLines: [{ id: TRONCO.id, gen: 0 }], breedFoodIvMax: 120, breedFamily: true, breedDouble: true };
        const pokes = [LIDER, TRONCO, COMIDA,
            P({ id: 'qIgual', quality: 1.466, ivTotal: 50 }), P({ id: 'qMaior', quality: 1.5, ivTotal: 50 }), P({ id: 'ivMaior', quality: 1.4, ivTotal: 126 }),
            P({ id: 'ivTeto', quality: 1.4, ivTotal: 120 }), P({ id: 'longe', quality: 1.31, ivTotal: 50 }), P({ id: 'shiny', quality: 1.2, ivTotal: 50, shiny: true }),
            P({ id: 'time', quality: 1.4, ivTotal: 50, team: true }), P({ id: 'outra', speciesId: 19, name: 'Rattata', quality: 1.0, ivTotal: 10 }), P({ id: 'fraco', quality: 1.32, ivTotal: 30 })];
        const family = { pokes: [P({ id: 'fam', quality: 1.4, ivTotal: 60 }), P({ id: 'famShiny', quality: 1.4, ivTotal: 60, shiny: true })], items: [{ itemId: 40, quantity: 79, name: 'Earth Stone' }] };
        const { api } = loadBreedModule(cfg, { pokes, family });
        const t = api.breedTrunk(cfg.breedLines[0]);
        assert(t && t.quality === 1.466 && t.ivTotal === 126 && t.speciesId === 232, 'quem sobe lido do box: ' + JSON.stringify(t));
        const motivos = Object.fromEntries(api.breedFoodList(t).map(f => [f.id, f.motivo]));
        assert(motivos[COMIDA.id] === null && motivos.fraco === null && motivos.fam === null, 'servem: comida, fraco e o da família: ' + JSON.stringify(motivos));
        assert(/não é menor/.test(motivos.qIgual) && /não é menor/.test(motivos.qMaior), 'Q igual/maior nunca: ' + motivos.qIgual + ' | ' + motivos.qMaior);
        assert(/IV 126 não é menor/.test(motivos.ivMaior), 'IV igual ao de quem sobe nunca: ' + motivos.ivMaior);
        assert(/poupado/.test(motivos.ivTeto), 'IV no teto poupado: ' + motivos.ivTeto);
        assert(/longe demais/.test(motivos.longe), 'Q além de 0,15: ' + motivos.longe);
        assert(/shiny/.test(motivos.shiny) && /shiny/.test(motivos.famShiny) && !('time' in motivos) && !('outra' in motivos), 'shiny nunca; time e outra espécie nem aparecem: ' + JSON.stringify(motivos));
        const ordem = api.breedFoodList(t).filter(f => !f.motivo).map(f => f.id);
        assert(ordem.join() === 'fraco,' + COMIDA.id + ',fam', 'mais fraco primeiro (menor Q): ' + ordem.join());
        assert(api.breedFoodPick(t).id === 'fraco', 'escolhe o mais fraco');
        const semFam = loadBreedModule(Object.assign({}, cfg, { breedFamily: false }), { pokes, family });
        assert(!semFam.api.breedFoodList(semFam.api.breedTrunk(cfg.breedLines[0])).some(f => f.id === 'fam'), 'sem família não olha o depot');
        // proteção da venda/depósito: quem sobe, a espécie (id, speciesId ou nome), não o resto; desligado = nada
        assert(api.breedKeepsPoke(TRONCO) && api.breedKeepsPoke(COMIDA) && api.breedKeepsPoke({ id: 'x', name: 'Donphan' }) && !api.breedKeepsPoke({ id: 'r', speciesId: 19, name: 'Rattata' }), 'breedKeepsPoke protege a espécie inteira');
        api.breedOnPokes(pokes);   // guarda nome/espécie na linhagem
        assert(cfg.breedLines[0].name === 'Donphan' && cfg.breedLines[0].speciesId === 232, 'linhagem ganha nome/espécie: ' + JSON.stringify(cfg.breedLines[0]));
        const off = loadBreedModule({ breedEnabled: false, breedLines: [{ id: TRONCO.id, speciesId: 232, name: 'Donphan' }] }, { pokes });
        assert(!off.api.breedKeepsPoke(TRONCO), 'desligado não protege');
    }

    // 2) checklist da cotação com os formatos reais: conta3 (doador = slot 1) passa; conta2 (doador = slot 2) recusa; growth/baseQuality/free errados recusam
    {
        const { api } = loadBreedModule({ breedEnabled: true, breedLines: [], breedDouble: true }, {});
        const t = { id: TRONCO.id, quality: 1.466, ivTotal: 126 };
        assert(api.breedCheckQuote(quoteOf(TRONCO, COMIDA), t) === null, 'cotação da conta3 passa');
        const fraco = { id: 'cmv0ebvt92ohitxqrkf2oxzkd', quality: 1.054, ivTotal: 51 }, forte = { id: 'cmv0ea07h2o26txqreqef7nbk', quality: 1.098, ivTotal: 114 };
        const q2 = quoteOf(fraco, forte, { growth: { hp: 32, atk: 8, def: 19, spAtk: 12, spDef: 17, speed: 26 } });
        assert(/donorId/.test(api.breedCheckQuote(q2, fraco)), 'conta2: IV viria da comida -> recusa: ' + api.breedCheckQuote(q2, fraco));
        assert(/distribuição por stat/.test(api.breedCheckQuote(quoteOf(TRONCO, COMIDA, { growth: { hp: 1, atk: 1, def: 1, spAtk: 1, spDef: 1, speed: 1 } }), t)), 'growth diferente recusa');
        assert(/quality base/.test(api.breedCheckQuote(quoteOf(TRONCO, COMIDA, { extra: { delta: { baseQuality: 1.5 } } }), t)), 'baseQuality diferente recusa');
        assert(/Grátis/.test(api.breedCheckQuote(quoteOf(TRONCO, COMIDA, { extra: { free: false } }), t)), 'free=false recusa');
        assert(/feromônio/.test(api.breedCheckQuote(quoteOf(TRONCO, COMIDA, { extra: { pheromoneCost: 9 } }), t)), 'feromônio recusa');
        assert(/shiny/.test(api.breedCheckQuote(quoteOf(TRONCO, COMIDA, { extra: { shinyChild: true } }), t)), 'filho shiny recusa');
        const stones = api.breedStoneNeeds(quoteOf(TRONCO, COMIDA, { have: 8 }));
        assert(stones.length === 1 && stones[0].need === 40 && stones[0].have === 8 && stones[0].familia === 0, 'stones dobradas: ' + JSON.stringify(stones));
        const c = api.parseBreedCenter(centerOf([EGG]));
        assert(c.slots === 2 && c.usedSlots === 1 && c.eggs[0].killsRequired === 3000 && c.eggs[0].ready === false && c.unlocked, 'centro: ' + JSON.stringify(c));
    }

    // 3) na hunt: centro lido, comida no box -> cotação (parent1 = quem sobe, free=1) -> viagem pedida uma vez; carona
    {
        const cfg = { breedEnabled: true, breedLines: [{ id: TRONCO.id, gen: 0 }], breedFoodIvMax: 150, breedFamily: true, breedDouble: true };
        const fake = fakeApi({ box: { [TRONCO.id]: TRONCO, [COMIDA.id]: COMIDA } });
        const { api, state } = loadBreedModule(cfg, { api: fake.api, pokes: [LIDER, TRONCO, COMIDA], family: { pokes: [], items: [{ itemId: 40, quantity: 79, name: 'Earth Stone' }] } });
        await api.breedTick(true);
        const q = state.calls.find(c => /action=quote/.test(c.url));
        assert(q && q.url.includes(`parent1=${TRONCO.id}&parent2=${COMIDA.id}&free=1`), 'cotação com quem sobe no slot 1 e free=1: ' + (q && q.url));
        assert(state.trips.length === 1 && state.trips[0].key === 'breeding' && /Donphan Q 1\.466 IV 126 × comida Q 1\.345 IV 104/.test(state.trips[0].motivo), 'viagem pedida: ' + JSON.stringify(state.trips));
        assert(api.breedWanted() && api.breedPlanned[TRONCO.id] && api.breedPlanned[TRONCO.id].foodId === COMIDA.id && api.breedPlanned[TRONCO.id].origem === 'box', 'plano guardado: ' + JSON.stringify(api.breedPlanned));
        assert(state.sent.some(m => m.type === 'family-get'), 'leu a família');
        await api.breedTick(true);
        assert(state.trips.length === 1, 'não pede de novo com plano pendente');
        const lg = state.logs.find(l => l[0] === 'breeding-cotacao');
        assert(lg && lg[1].ok === true && lg[1].donorId === TRONCO.id, 'log da cotação: ' + JSON.stringify(lg));
        assert(/Linhagem 1: Donphan · geração 0 · Q 1\.466 · IV 126\/192 · viagem pedida/.test(api.breedStatus().join('\n')), 'status: ' + api.breedStatus().join(' | '));
    }

    // 4) cidade: stones faltando saem da família (quantidade = o que falta), cota de novo, POST breed certo, linhagem vira ovo, aviso
    {
        const cfg = { breedEnabled: true, breedLines: [{ id: TRONCO.id, gen: 0 }], breedFoodIvMax: 150, breedFamily: true, breedDouble: true };
        const fake = fakeApi({ box: { [TRONCO.id]: TRONCO, [COMIDA.id]: COMIDA }, have: 8 });
        const family = { pokes: [], items: [{ itemId: 40, quantity: 79, name: 'Earth Stone' }] };
        const { api, state } = loadBreedModule(cfg, {
            api: fake.api, pokes: [LIDER, TRONCO, COMIDA], family,
            freshPokes: () => [LIDER, TRONCO, COMIDA],
            familyAction: (payload) => { if (payload.action === 'item') { fake.st.have += payload.quantity; family.items[0].quantity -= payload.quantity; } return { ok: true }; },
        });
        await api.breedTick(true);
        assert(state.trips.length === 1, 'planejou com stones da família (8 + 79 >= 40)');
        const r = await api.breedCityWork();
        assert(r.ok && r.feitos === 1 && r.falhas === 0, 'cruzou: ' + JSON.stringify(r));
        assert(state.familyActions.length === 1 && state.familyActions[0].action === 'item' && state.familyActions[0].dir === 'withdraw' && state.familyActions[0].itemId === 40 && state.familyActions[0].quantity === 32, 'tirou só o que faltava da família: ' + JSON.stringify(state.familyActions));
        assert(fake.posts.length === 1 && JSON.stringify(fake.posts[0]) === JSON.stringify({ action: 'breed', parent1: TRONCO.id, parent2: COMIDA.id, free: true, double: true }), 'POST breed: ' + JSON.stringify(fake.posts[0]));
        const quotes = state.calls.filter(c => /action=quote/.test(c.url));
        assert(quotes.length === 3, 'cotação na hunt + 2 na cidade (antes e depois das stones): ' + quotes.length);
        const l = cfg.breedLines[0];
        assert(l.id === null && l.eggId === 'ovo-1' && l.gen === 0 && l.q0 === 1.466 && l.iv0 === 126 && l.lastQ === 1.466 && l.name === 'Donphan' && l.speciesId === 232 && l.eggs === 1, 'linhagem virou ovo: ' + JSON.stringify(l));
        assert(state.saves >= 1, 'cfg salvo');
        assert(api.breedKeepsPoke(COMIDA) && api.breedKeepsPoke({ id: 'n', speciesId: 232 }), 'espécie segue protegida com o ovo chocando');
        const h = state.hooks.find(x => x.meta.evento === 'breeding-cruzou');
        assert(h && /criou um ovo de \*\*Donphan\*\*/.test(h.content) && /geração 1: Q 1\.466 → 1\.471–1\.506 · IV 126 mantido · comida Q 1\.345 IV 104 · choca em 3000 abates/.test(h.desc) && /40x Earth Stone \(dobrado\)/.test(h.desc), 'aviso: ' + (h && h.content + ' | ' + h.desc));
        assert(!api.breedWanted() && Object.keys(api.breedPlanned).length === 0, 'plano consumido');
        assert(/Ovo: Donphan 0\/3000 abates · linhagem 1 \(geração 1\)/.test(api.breedStatus().join('\n')) && /ovo chocando/.test(api.breedStatus().join('\n')), 'status com ovo: ' + api.breedStatus().join(' | '));
        // comida da família: retira o Pokémon antes de cotar
        const cfg2 = { breedEnabled: true, breedLines: [{ id: TRONCO.id, gen: 0 }], breedFoodIvMax: 150, breedFamily: true, breedDouble: false };
        const fake2 = fakeApi({ box: { [TRONCO.id]: TRONCO, [COMIDA.id]: COMIDA }, have: 20 });
        const fam2 = { pokes: [COMIDA], items: [] };
        const box2 = [LIDER, TRONCO];
        const m2 = loadBreedModule(cfg2, {
            api: fake2.api, pokes: box2, family: fam2, freshPokes: () => box2,
            familyAction: (payload) => { if (payload.action === 'poke') { fam2.pokes = []; box2.push(COMIDA); } return { ok: true }; },
        });
        await m2.api.breedTick(true);
        assert(m2.state.trips.length === 1 && /\(família\)/.test(m2.state.trips[0].motivo) && !m2.state.calls.some(c => /action=quote/.test(c.url)), 'comida da família: viagem sem cotar antes: ' + JSON.stringify(m2.state.trips));
        const r2 = await m2.api.breedCityWork();
        assert(r2.ok && m2.state.familyActions[0].action === 'poke' && m2.state.familyActions[0].dir === 'withdraw' && m2.state.familyActions[0].capturedId === COMIDA.id, 'retirou a comida da família: ' + JSON.stringify(m2.state.familyActions));
        assert(fake2.posts[0].double === false && fake2.posts[0].parent1 === TRONCO.id, 'sem dobrar: ' + JSON.stringify(fake2.posts[0]));
    }

    // 5) cotação dizendo que o IV viria da comida (ordem invertida no servidor): NÃO cruza, para e avisa uma vez
    {
        const cfg = { breedEnabled: true, breedLines: [{ id: COMIDA.id, gen: 0 }], breedFoodIvMax: 0, breedFamily: false, breedDouble: true };
        const trunkFraco = P({ id: COMIDA.id }), outro = P({ id: 'forte', quality: 1.3, ivTotal: 90 });
        const fake = fakeApi({ box: { [COMIDA.id]: trunkFraco, forte: outro } });
        // o jogo (falso) diz que o doador é o outro: simula uma cotação errada
        fake.st.growth = GROWTH;
        const bad = (url, o) => { const r = fake.api(url, o); if (/action=quote/.test(url)) { r.ivPreview.donorId = 'forte'; } return r; };
        const { api, state } = loadBreedModule(cfg, { api: bad, pokes: [LIDER, trunkFraco, outro] });
        await api.breedTick(true);
        assert(state.trips.length === 0 && api.breedWait && /donorId/.test(api.breedWait.motivo), 'não cruza: ' + JSON.stringify(api.breedWait));
        assert(state.hooks.length === 1 && /breeding parado/.test(state.hooks[0].content) && state.hooks[0].meta.evento === 'breeding-parado', 'avisou 1x: ' + JSON.stringify(state.hooks.map(h => h.content)));
        await api.breedTick(true);
        assert(state.calls.filter(c => /quote/.test(c.url)).length === 1 && state.hooks.length === 1, 'parado: não insiste antes do retry');
    }

    // 6) sem comida: parado, aviso 1x, tenta de novo depois de 30 min; comida chegando (frame novo) + retry = viagem
    {
        const cfg = { breedEnabled: true, breedLines: [{ id: TRONCO.id, gen: 0 }], breedFoodIvMax: 150, breedFamily: false, breedDouble: true };
        const fake = fakeApi({ box: { [TRONCO.id]: TRONCO, [COMIDA.id]: COMIDA } });
        const { api, state, clock } = loadBreedModule(cfg, { api: fake.api, pokes: [LIDER, TRONCO] });
        await api.breedTick(true);
        assert(state.trips.length === 0 && /sem comida que sirva no box/.test(api.breedWait.motivo) && state.hooks.length === 1, 'parado sem comida: ' + JSON.stringify(api.breedWait));
        state.pokes.push(COMIDA);
        await api.breedTick(true);
        assert(state.trips.length === 0, 'antes do retry não replaneja');
        clock.now += api.BREED_RETRY_MS + 1000;
        await api.breedTick(true);
        assert(state.trips.length === 1 && api.breedWait === null, 'depois de 30 min planeja: ' + JSON.stringify(state.trips));
        // sem gold
        const semGold = fakeApi({ box: { [TRONCO.id]: TRONCO, [COMIDA.id]: COMIDA }, gold: 1000 });
        const g = loadBreedModule(cfg, { api: semGold.api, pokes: [LIDER, TRONCO, COMIDA] });
        await g.api.breedTick(true);
        assert(g.state.trips.length === 0 && /gold 1000 < taxa 2000000/.test(g.api.breedWait.motivo), 'sem gold: ' + JSON.stringify(g.api.breedWait));
        // incubadora cheia
        const cheia = fakeApi({ box: { [TRONCO.id]: TRONCO, [COMIDA.id]: COMIDA }, eggs: [EGG, Object.assign({}, EGG, { id: 'e2' })] });
        const f = loadBreedModule(cfg, { api: cheia.api, pokes: [LIDER, TRONCO, COMIDA] });
        await f.api.breedTick(true);
        assert(f.state.trips.length === 0 && /incubadora cheia/.test(f.api.breedWait.motivo), 'cheia: ' + JSON.stringify(f.api.breedWait));
    }

    // 7) ovo pronto: POST hatch; resposta sem `child` -> pokes-get; o Donphan novo com o IV de quem sobe vira a nova geração; aviso
    {
        const cfg = { breedEnabled: true, breedLines: [{ eggId: EGG.id, gen: 0, name: 'Donphan', speciesId: 232, q0: 1.466, iv0: 126, lastQ: 1.466, lastIv: 126 }], breedFoodIvMax: 150, breedFamily: false, breedDouble: true };
        const filho = { id: 'filho1', speciesId: 232, name: 'Donphan', level: 1, team: false, quality: 1.476, ivTotal: 126 };
        const fake = fakeApi({ eggs: [Object.assign({}, EGG, { killsDone: 3000, ready: true })], box: { filho1: filho } });
        const { api, state } = loadBreedModule(cfg, { api: fake.api, pokes: [LIDER], freshPokes: () => [LIDER, filho] });
        await api.breedTick(true);
        assert(fake.posts.length === 1 && fake.posts[0].action === 'hatch' && fake.posts[0].eggId === EGG.id, 'POST hatch: ' + JSON.stringify(fake.posts));
        const l = cfg.breedLines[0];
        assert(l.id === 'filho1' && l.eggId === null && l.gen === 1 && l.lastQ === 1.476 && l.lastIv === 126 && !l.pendingChild, 'filho virou quem sobe: ' + JSON.stringify(l));
        const h = state.hooks.find(x => x.meta.evento === 'breeding-chocou');
        assert(h && /chocou \*\*Donphan\*\* — Q 1\.476, IV 126/.test(h.content) && /geração 1/.test(h.desc) && /começou em Q 1\.466/.test(h.desc), 'aviso do chocar: ' + (h && h.content + ' | ' + h.desc));
        const lg = state.logs.find(x => x[0] === 'breeding-choca');
        assert(lg && lg[1].ok === true && Array.isArray(lg[1].campos), 'log do hatch guarda os campos da resposta');
        assert(state.trips.length === 0, 'sem comida para a nova geração: nada planejado ainda (parado)');
        assert(/sem comida/.test(api.breedWait.motivo), 'parado por comida: ' + api.breedWait.motivo);
        // filho ambíguo (2 novos com o mesmo IV): fica pendente e o aviso pede escolha no painel
        const cfg2 = { breedEnabled: true, breedLines: [{ eggId: EGG.id, gen: 0, name: 'Donphan', speciesId: 232, lastQ: 1.466, lastIv: 126 }], breedFoodIvMax: 150, breedFamily: false, breedDouble: true };
        const fake2 = fakeApi({ eggs: [Object.assign({}, EGG, { ready: true })] });
        const dois = [LIDER, Object.assign({}, filho, { id: 'f1' }), Object.assign({}, filho, { id: 'f2' })];
        const m2 = loadBreedModule(cfg2, { api: fake2.api, pokes: [LIDER], freshPokes: () => dois });
        await m2.api.breedTick(true);
        assert(cfg2.breedLines[0].id == null && cfg2.breedLines[0].pendingChild && cfg2.breedLines[0].eggId === null, 'ambíguo fica pendente: ' + JSON.stringify(cfg2.breedLines[0]));
        assert(/Filho não identificado/.test(m2.state.hooks[0].desc) && /filho não identificado/.test(m2.api.breedStatus().join('\n')), 'avisa para escolher no painel');
        // hatch falhou (ex.: só na cidade): pede viagem uma vez
        const fake3 = fakeApi({ eggs: [Object.assign({}, EGG, { ready: true })], hatchError: 'Only in town' });
        const m3 = loadBreedModule({ breedEnabled: true, breedLines: [{ eggId: EGG.id, gen: 0, name: 'Donphan', speciesId: 232 }], breedFamily: false }, { api: fake3.api, pokes: [LIDER] });
        await m3.api.breedTick(true); await m3.api.breedTick(true);
        assert(m3.state.trips.length === 1 && /chocar Donphan na cidade/.test(m3.state.trips[0].motivo) && cfg.breedLines[0].id === 'filho1', 'hatch com erro pede viagem 1x: ' + JSON.stringify(m3.state.trips));
    }

    // 8) ovo que sumiu do centro (chocado na mão): a linhagem procura o filho pelo IV; desligado nada roda
    {
        const cfg = { breedEnabled: true, breedLines: [{ eggId: 'sumiu', gen: 1, name: 'Donphan', speciesId: 232, lastQ: 1.476, lastIv: 126 }], breedFoodIvMax: 150, breedFamily: false, breedDouble: true };
        const neto = { id: 'neto', speciesId: 232, name: 'Donphan', level: 1, team: false, quality: 1.49, ivTotal: 127 };
        const fake = fakeApi({ eggs: [] });
        const { api, state } = loadBreedModule(cfg, { api: fake.api, pokes: [LIDER, neto] });
        await api.breedTick(true);
        assert(cfg.breedLines[0].id === 'neto' && cfg.breedLines[0].gen === 2 && state.logs.some(l => l[0] === 'breeding-ovo-sumiu'), 'chocado na mão: achou o filho (IV +1 do dobrar): ' + JSON.stringify(cfg.breedLines[0]));
        const off = loadBreedModule({ breedEnabled: false, breedLines: [{ id: TRONCO.id }] }, { api: fake.api, pokes: [LIDER, TRONCO, COMIDA] });
        await off.api.breedTick(true);
        assert(off.state.calls.length === 0 && off.api.breedWanted() === false, 'desligado não chama nada');
    }

    console.log('OK breeding.test — filtro da comida (Q e IV menores, teto, família), checklist da cotação (donorId/growth/baseQuality), plano + viagem, cidade (stones e comida da família, POST breed), parado/retry, hatch e filho');
})().catch(e => { console.error(e); process.exit(1); });
