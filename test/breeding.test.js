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

const BB_ERRO = 'Os dois pais precisam estar na Breeding Box — separe-os na aba Breeding Box do Depósito.';   // texto real do jogo (26/10/2026)
// API falsa: `box` é um mapa id -> Pokémon para a cotação; `have` = stones na mochila (muda com a retirada da família); `boxOnly` = o jogo
// exige os dois pais com `breedingBox` (v3.49.0)
function fakeApi(opts) {
    const st = Object.assign({ eggs: [], have: 40, gold: 5280331, hatch: null, box: {} }, opts);
    const posts = [];
    const api = (url, o) => {
        if (o?.method === 'POST') {
            const b = JSON.parse(o.body); posts.push(b);
            if (b.action === 'breed') { if (st.breedError) throw new Error(st.breedError); if (st.boxOnly && !(st.box[b.parent1]?.breedingBox && st.box[b.parent2]?.breedingBox)) throw new Error(BB_ERRO); st.eggs = st.eggs.concat([Object.assign({}, EGG, { id: 'ovo-' + posts.length })]); st.gold -= 2000000; return centerOf(st.eggs, { gold: st.gold }); }
            if (b.action === 'hatch') { if (st.hatchError) throw new Error(st.hatchError); st.eggs = st.eggs.filter(e => e.id !== b.eggId); return st.hatch || { ok: true }; }
            throw new Error('POST inesperado ' + JSON.stringify(b));
        }
        if (/action=center/.test(url)) return centerOf(st.eggs, { gold: st.gold });
        const m = url.match(/parent1=([^&]+)&parent2=([^&]+)&free=(\d)/);
        if (!m) throw new Error('GET inesperado ' + url);
        const a = st.box[decodeURIComponent(m[1])], b = st.box[decodeURIComponent(m[2])];
        if (!a || !b) throw new Error('Pokémon não encontrado');
        if (st.boxOnly && !(a.breedingBox && b.breedingBox)) throw new Error(BB_ERRO);   // v3.49.0: o jogo só cota com os dois na Breeding Box
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
        assert(api.breedKeepsPoke(TRONCO) && api.breedKeepsPoke(COMIDA) && api.breedKeepsPoke({ id: 'x', name: 'Donphan' }) && !api.breedKeepsPoke({ id: 'r', speciesId: 19, name: 'Rattata' }), 'breedKeepsPoke protege quem sobe, a comida e quem não tem quality');
        // v3.36.1: da espécie, só quem pode servir de comida (Q a partir de 0,15 abaixo) ou é tão bom quanto quem sobe; o resto vende
        assert(api.breedKeepsPoke({ id: 'qMaior', speciesId: 232, quality: 1.8, ivTotal: 50 }) && api.breedKeepsPoke({ id: 'noLimite', speciesId: 232, quality: 1.316, ivTotal: 50 }), 'Q maior e Q no limite dos 0,15 seguem protegidos');
        assert(!api.breedKeepsPoke({ id: 'longe', speciesId: 232, quality: 1.31, ivTotal: 50 }) && !api.breedKeepsPoke({ id: 'lixo', name: 'Donphan', quality: 0.9, ivTotal: 150 }), 'Q longe demais (nunca serve) não é protegido');
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
        assert(api.breedKeepsPoke(COMIDA) && api.breedKeepsPoke({ id: 'n', speciesId: 232 }) && !api.breedKeepsPoke({ id: 'longe', speciesId: 232, quality: 1.2, ivTotal: 50 }), 'com o ovo chocando a referência é quem entrou no ovo (lastQ): comida e sem quality protegidos, Q longe vende');
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

    // 7) ovo pronto: POST hatch; resposta real (09/10/2026 12:38Z, conta3) traz `child{ quality, ivTotal, delta, growth, bqs }` SEM id
    //    -> pokes-get; o Donphan novo com a quality e o IV do `child` vira a nova geração; aviso
    {
        const cfg = { breedEnabled: true, breedLines: [{ eggId: EGG.id, gen: 0, name: 'Donphan', speciesId: 232, q0: 1.466, iv0: 126, lastQ: 1.466, lastIv: 126 }], breedFoodIvMax: 150, breedFamily: false, breedDouble: true };
        const filho = { id: 'filho1', speciesId: 232, name: 'Donphan', level: 1, team: false, quality: 1.476, ivTotal: 126 };
        const HATCH = { ok: true, child: { speciesId: 232, shiny: false, quality: 1.476, delta: 0.01, growth: { hp: 4, atk: 26, def: 32, spAtk: 25, spDef: 9, speed: 30 }, ivTotal: 126, bqs: 49 } };
        const fake = fakeApi({ eggs: [Object.assign({}, EGG, { killsDone: 3000, ready: true })], box: { filho1: filho }, hatch: HATCH });
        const { api, state } = loadBreedModule(cfg, { api: fake.api, pokes: [LIDER], freshPokes: () => [LIDER, filho] });
        await api.breedTick(true);
        assert(fake.posts.length === 1 && fake.posts[0].action === 'hatch' && fake.posts[0].eggId === EGG.id, 'POST hatch: ' + JSON.stringify(fake.posts));
        const l = cfg.breedLines[0];
        assert(l.id === 'filho1' && l.eggId === null && l.gen === 1 && l.lastQ === 1.476 && l.lastIv === 126 && !l.pendingChild, 'filho virou quem sobe: ' + JSON.stringify(l));
        const h = state.hooks.find(x => x.meta.evento === 'breeding-chocou');
        assert(h && /chocou \*\*Donphan\*\* — Q 1\.476, IV 126/.test(h.content) && /geração 1/.test(h.desc) && /Δ \+0\.010/.test(h.desc) && /começou em Q 1\.466/.test(h.desc), 'aviso do chocar: ' + (h && h.content + ' | ' + h.desc));
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
        // 2 novos com o mesmo IV mas quality diferente: a quality do `child` do hatch desempata; o aviso mostra Q/IV mesmo sem achar no box
        const cfg4 = { breedEnabled: true, breedLines: [{ eggId: EGG.id, gen: 0, name: 'Donphan', speciesId: 232, lastQ: 1.466, lastIv: 126 }], breedFoodIvMax: 150, breedFamily: false, breedDouble: true };
        const fake4 = fakeApi({ eggs: [Object.assign({}, EGG, { ready: true })], hatch: HATCH });
        const m4 = loadBreedModule(cfg4, { api: fake4.api, pokes: [LIDER], freshPokes: () => [LIDER, Object.assign({}, filho, { id: 'f1' }), Object.assign({}, filho, { id: 'f2', quality: 1.5 })] });
        await m4.api.breedTick(true);
        assert(cfg4.breedLines[0].id === 'f1' && cfg4.breedLines[0].gen === 1, 'quality do child desempata: ' + JSON.stringify(cfg4.breedLines[0]));
        // lista muda (jogo não respondeu ao pokes-get): a dica quality/IV fica em pendingChild e o frame seguinte acha o filho
        const cfg5 = { breedEnabled: true, breedLines: [{ eggId: EGG.id, gen: 0, name: 'Donphan', speciesId: 232, lastQ: 1.466, lastIv: 126 }], breedFoodIvMax: 150, breedFamily: false, breedDouble: true };
        const fake5 = fakeApi({ eggs: [Object.assign({}, EGG, { ready: true })], hatch: HATCH });
        const m5 = loadBreedModule(cfg5, { api: fake5.api, pokes: [LIDER] });
        await m5.api.breedTick(true);
        const p5 = cfg5.breedLines[0];
        assert(p5.id == null && p5.pendingChild && p5.pendingChild.quality === 1.476 && p5.pendingChild.ivTotal === 126, 'dica do hatch guardada: ' + JSON.stringify(p5));
        assert(/Filho: Q 1\.476 · IV 126\/192 \(Δ \+0\.010\)/.test(m5.state.hooks[0].desc) && /não identificado/.test(m5.state.hooks[0].desc), 'aviso mostra o filho do hatch mesmo sem achar no box: ' + m5.state.hooks[0].desc);
        m5.api.breedOnPokes([LIDER, Object.assign({}, filho, { id: 'f1' }), Object.assign({}, filho, { id: 'f2', quality: 1.5 })]);
        assert(p5.id === 'f1' && p5.gen === 1 && !p5.pendingChild, 'frame seguinte acha o filho pela dica: ' + JSON.stringify(p5));
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
        // v3.36.2: cruzou NA MÃO — linhagem com filho por identificar (lista nunca veio) e um ovo novo da espécie no centro = o ovo é dela
        {
            const cfgM = { breedEnabled: true, breedLines: [{ id: null, gen: 11, name: 'Rhyhorn', speciesId: 111, lastQ: 1.493, lastIv: 173, eggId: null, pendingChild: { at: 1, quality: 1.533, ivTotal: 173 }, eggs: 12 }, null], breedFoodIvMax: 150, breedFamily: false, breedDouble: true };
            const ovoR = Object.assign({}, EGG, { id: 'ovo-mao', speciesId: 111, speciesName: 'Rhyhorn' });
            const fm = fakeApi({ eggs: [ovoR] });
            const m = loadBreedModule(cfgM, { api: fm.api, pokes: [] });
            await m.api.breedTick(true);
            const l = cfgM.breedLines[0];
            assert(l.eggId === 'ovo-mao' && !l.pendingChild && l.id === null && l.gen === 12 && l.lastQ === 1.533 && l.lastIv === 173 && l.eggs === 13, 'ovo feito na mão adotado pela linhagem (filho pendente entrou no ovo): ' + JSON.stringify(l));
            assert(m.state.logs.some(x => x[0] === 'breeding-ovo-adotado' && x[1].origem === 'filho por identificar'), 'log breeding-ovo-adotado');
            assert(/Ovo: Rhyhorn 0\/3000 abates · linhagem 1 \(geração 13\)/.test(m.api.breedStatus().join('\n')), 'status mostra o ovo adotado: ' + m.api.breedStatus().join(' | '));
            // ovo de OUTRA espécie não é adotado; dois ovos livres da espécie também não (ambíguo)
            const cfgO = { breedEnabled: true, breedLines: [{ id: null, gen: 1, name: 'Rhyhorn', speciesId: 111, pendingChild: { at: 1 } }, null], breedFamily: false };
            const mo = loadBreedModule(cfgO, { api: fakeApi({ eggs: [EGG] }).api, pokes: [] });
            await mo.api.breedTick(true);
            assert(!cfgO.breedLines[0].eggId && cfgO.breedLines[0].pendingChild, 'ovo de Donphan não vai para a linhagem de Rhyhorn');
            const cfg2 = { breedEnabled: true, breedLines: [{ id: null, gen: 1, name: 'Rhyhorn', speciesId: 111, pendingChild: { at: 1 } }, null], breedFamily: false };
            const m2 = loadBreedModule(cfg2, { api: fakeApi({ eggs: [ovoR, Object.assign({}, ovoR, { id: 'ovo-mao-2' })] }).api, pokes: [] });
            await m2.api.breedTick(true);
            assert(!cfg2.breedLines[0].eggId && cfg2.breedLines[0].pendingChild, 'dois ovos livres = ambíguo, segue pendente');
            // quem sobe sumiu de uma lista LIDA (cruzado na mão) e há um ovo livre da espécie: também adota, sem mexer na geração
            const cfgS = { breedEnabled: true, breedLines: [{ id: 'sumido', gen: 3, name: 'Rhyhorn', speciesId: 111, lastQ: 1.4, lastIv: 100 }, null], breedFamily: false };
            const ms = loadBreedModule(cfgS, { api: fakeApi({ eggs: [ovoR] }).api, pokes: [LIDER] });
            await ms.api.breedTick(true);
            assert(cfgS.breedLines[0].eggId === 'ovo-mao' && cfgS.breedLines[0].id === null && cfgS.breedLines[0].gen === 3, 'quem sobe sumiu + ovo livre = adota: ' + JSON.stringify(cfgS.breedLines[0]));
        }
        // v3.29.4: prévia da comida com quem sobe dentro do ovo (compara com lastQ/lastIv) e com quem sobe no box
        const cfgP = { breedEnabled: true, breedLines: [{ eggId: 'ovo1', gen: 1, name: 'Donphan', speciesId: 232, lastQ: 1.466, lastIv: 126 }, null], breedFoodIvMax: 150, breedFamily: true, breedDouble: true };
        const fp = loadBreedModule(cfgP, { api: fake.api, pokes: [LIDER, COMIDA], family: { pokes: [{ id: 'fam1', speciesId: 232, name: 'Donphan', level: 3, quality: 1.5, ivTotal: 90 }], items: [] } });
        const previa = fp.api.breedFoodStatus().map(x => x.text).join('\n');
        assert(/Linhagem 1 \(Donphan Q 1\.466 IV 126 · ovo chocando, prévia contra Q 1\.466 IV 126/.test(previa) && /1 comida serve de 2 da espécie \(1 no box, 1 na família\)/.test(previa), 'prévia com ovo: ' + previa);
        assert(/✔ Donphan Q 1\.345 IV 104 lv\d+ · box/.test(previa) && /✖ Donphan Q 1\.500 IV 90 lv3 · família — Q 1\.500 não é menor/.test(previa), 'prévia lista box e família com motivo: ' + previa);
        const semDados = loadBreedModule({ breedEnabled: true, breedLines: [{ eggId: 'ovo1', gen: 0, name: 'Donphan', speciesId: 232 }] }, { api: fake.api, pokes: [LIDER] });
        assert(/Linhagem 1: ovo chocando$/.test(semDados.api.breedFoodStatus()[0].text), 'sem lastQ/lastIv só diz o estado: ' + semDados.api.breedFoodStatus()[0].text);
        const off = loadBreedModule({ breedEnabled: false, breedLines: [{ id: TRONCO.id }] }, { api: fake.api, pokes: [LIDER, TRONCO, COMIDA] });
        await off.api.breedTick(true);
        assert(off.state.calls.length === 0 && off.api.breedWanted() === false, 'desligado não chama nada');
    }

    // 12) v3.37.1: "sem resposta do jogo" na retirada da família é falha transitória: tenta de novo em 3 min, não em 30
    {
        const cfg = { breedEnabled: true, breedLines: [{ id: TRONCO.id, gen: 0 }], breedFoodIvMax: 150, breedFamily: true, breedDouble: false };
        const fake = fakeApi({ box: { [TRONCO.id]: TRONCO, [COMIDA.id]: COMIDA }, have: 20 });
        const fam = { pokes: [COMIDA], items: [] };
        const box = [LIDER, TRONCO];
        let mudo = true;
        const { api, state, clock } = loadBreedModule(cfg, {
            api: fake.api, pokes: box, family: fam, freshPokes: () => box,
            familyAction: (payload) => { if (mudo) return { ok: false, motivo: 'sem resposta do jogo' }; if (payload.action === 'poke') { fam.pokes = []; box.push(COMIDA); } return { ok: true }; },
        });
        await api.breedTick(true);
        assert(state.trips.length === 1, 'viagem pedida: ' + JSON.stringify(state.trips));
        const r = await api.breedCityWork();
        assert(!r.ok && /sem resposta do jogo/.test(r.motivo) && api.breedWait, 'jogo mudo: falhou: ' + JSON.stringify(r));
        const retryEm = api.breedWait.at + api.BREED_RETRY_MS - clock.now;
        assert(retryEm > 0 && retryEm <= 3 * 60 * 1000, 'retry em 3 min, não em 30: ' + retryEm);
        await api.breedTick(true);
        assert(state.trips.length === 1, 'não insiste antes do retry');
        clock.now += 3 * 60 * 1000 + 1000;
        mudo = false;
        await api.breedTick(true);
        assert(state.trips.length === 2, 'depois de 3 min pede a viagem de novo: ' + state.trips.length);
        const r2 = await api.breedCityWork();
        assert(r2.ok && fake.posts.length === 1, 'cruzou na 2ª tentativa: ' + JSON.stringify(r2));
    }

    // 13) v3.47.0: teto de protegidos por linhagem — só os N melhores da espécie ficam fora da venda (comida que serve hoje primeiro,
    //     maior quality primeiro, depois quem é tão bom quanto quem sobe); o resto vende pelas regras normais; a fila de capturas sem
    //     frame conta; desconhecido só é protegido com vaga sobrando; 0 = sem teto (como antes)
    {
        const cfg = { breedEnabled: true, breedLines: [{ id: TRONCO.id, gen: 0 }], breedFoodIvMax: 150, breedFamily: false, breedDouble: false, breedKeepMax: 3 };
        const f1 = P({ id: 'f1', quality: 1.40, ivTotal: 100 }), f2 = P({ id: 'f2', quality: 1.35, ivTotal: 90 }), f3 = P({ id: 'f3', quality: 1.33, ivTotal: 80 });
        const g1 = P({ id: 'g1', quality: 1.5, ivTotal: 50 }), g2 = P({ id: 'g2', quality: 1.466, ivTotal: 130 }), longe = P({ id: 'longe', quality: 1.2, ivTotal: 50 });
        const fila1 = { id: 'fila1', speciesId: 232, name: 'Donphan', quality: 1.45, ivTotal: 110, level: 1 };   // capturado sem frame `pokes`
        const pokes = [LIDER, TRONCO, f1, f2, f3, g1, g2, longe];
        const { api } = loadBreedModule(cfg, { pokes, queue: [fila1] });
        // ranking: comida que serve (fila1 1.45, f1 1.40, f2 1.35, f3 1.33) > g1 1.5 > g2 1.466; teto 3 = fila1, f1, f2
        assert(api.breedKeepsPoke(TRONCO), 'quem sobe sempre');
        assert(api.breedKeepsPoke(f1) && api.breedKeepsPoke(f2) && api.breedKeepsPoke(fila1), 'as 3 melhores comidas ficam (a da fila conta)');
        assert(!api.breedKeepsPoke(f3) && !api.breedKeepsPoke(g1) && !api.breedKeepsPoke(g2), 'f3, g1 e g2 passam do teto: venda normal');
        assert(!api.breedKeepsPoke(longe), 'Q longe demais segue sem proteção');
        assert(!api.breedKeepsPoke({ id: 'novo', speciesId: 232, quality: 1.45, ivTotal: 100 }), 'desconhecido com o teto cheio não é protegido');
        const st = api.breedFoodStatus().map(x => x.text).join('\n');
        assert(/fora da venda: 3 de 6 da espécie na faixa \(teto 3\)/.test(st), 'status mostra protegidos/elegíveis: ' + st);
        cfg.breedKeepMax = 10;
        assert(api.breedKeepsPoke(f3) && api.breedKeepsPoke(g1) && api.breedKeepsPoke(g2) && api.breedKeepsPoke({ id: 'novo', speciesId: 232, quality: 1.45, ivTotal: 100 }) && !api.breedKeepsPoke(longe), 'teto folgado protege todos na faixa e o desconhecido');
        cfg.breedKeepMax = 0;
        assert(api.breedKeepsPoke(g2) && api.breedKeepsPoke({ id: 'novo', speciesId: 232, quality: 1.45, ivTotal: 100 }) && !api.breedKeepsPoke(longe), 'teto 0 = sem teto');
        assert(!api.breedFoodStatus().some(x => /fora da venda/.test(x.text)), 'sem teto a linha de protegidos some');
        // venda tirou f1 do box (lista nova) e a fila esvaziou: o ranking refaz sem f1
        cfg.breedKeepMax = 2;
        const semF1 = pokes.filter(p => p.id !== 'f1');
        const { api: api2 } = loadBreedModule(cfg, { pokes: semF1, queue: [] });
        assert(api2.breedKeepsPoke(f2) && api2.breedKeepsPoke(f3) && !api2.breedKeepsPoke(g1), 'sem f1 e sem fila: f2 e f3 ficam, g1 vende');
    }

    // 14) v3.48.0: criar comida — quem sobe em Q 1,96 não tem captura que sirva (faixa 1,81–1,96): o melhor da espécie abaixo da faixa vira
    //     comida em criação, cruza com uma comida própria, choca, e o filho (já na faixa) é comido por quem sobe; a sub-linhagem termina
    {
        const ALTO = P({ id: 'alto', quality: 1.96, ivTotal: 150 });
        const F = P({ id: 'f175', quality: 1.75, ivTotal: 126 });          // melhor abaixo da faixa → vira comida (IV 126 = GROWTH da cotação falsa)
        const F2 = P({ id: 'f170', quality: 1.70, ivTotal: 120 });         // também pode, mas Q menor
        const IVALTO = P({ id: 'iv160', quality: 1.78, ivTotal: 160 });    // IV ≥ quem sobe: cruzar não baixa IV
        const FF = P({ id: 'ff160', quality: 1.60, ivTotal: 80 });         // comida própria de F (1,60 ≥ 1,75 − 0,15; IV 80 < 126); sem comida própria dela
        const LIXO = P({ id: 'lixo', quality: 1.30, ivTotal: 50 });
        const box = [LIDER, ALTO, F, F2, IVALTO, FF, LIXO];
        const fake = fakeApi({ box: Object.fromEntries(box.map(p => [p.id, p])), have: 40 });
        // desligado: só o motivo "sem comida", nada de criação
        const off = loadBreedModule({ breedEnabled: true, breedLines: [{ id: 'alto', gen: 0 }], breedFoodIvMax: 150, breedFamily: false, breedDouble: false, breedFoodBreed: false }, { api: fake.api, pokes: box });
        await off.api.breedTick(true);
        assert(off.state.trips.length === 0 && off.api.breedWait && /sem comida que sirva/.test(off.api.breedWait.motivo) && !/comida em criação/.test(off.api.breedWait.motivo) && !off.cfg.breedLines[0].food, 'desligado: parado sem comida, não cria: ' + JSON.stringify(off.api.breedWait));
        // ligado
        const cfg = { breedEnabled: true, breedLines: [{ id: 'alto', gen: 0 }], breedFoodIvMax: 150, breedFamily: false, breedDouble: false, breedFoodBreed: true };
        let boxNow = box.slice();
        const { api, state, clock } = loadBreedModule(cfg, { api: fake.api, pokes: box, freshPokes: () => boxNow });
        const t = api.breedTrunk(cfg.breedLines[0]);
        assert(api.breedFoodPick(t) === null, 'ninguém serve de comida para Q 1,96');
        const cands = Object.fromEntries(api.breedFoodTrunkList(t).map(f => [f.id, f.motivo]));
        assert(cands.f175 === null && cands.f170 === null && /não ficaria abaixo de 150/.test(cands.iv160) && /sem comida própria/.test(cands.ff160) && /sem comida própria/.test(cands.lixo), 'quem pode virar comida: ' + JSON.stringify(cands));
        const pick = api.breedFoodTrunkPick(t);
        assert(pick.id === 'f175' && pick.geracoes === 6 && pick.propria.id === 'ff160', 'escolhe o de maior quality abaixo da faixa, ~6 gerações até 1,81, comida própria ff160: ' + JSON.stringify(pick));
        const IV149 = P({ id: 'iv149', quality: 1.7, ivTotal: 149 });
        const dobrar = loadBreedModule(Object.assign({}, cfg, { breedDouble: true }), { api: fake.api, pokes: box });
        assert(api.breedFoodTrunkReason(IV149, t) === null && /IV 149 não ficaria abaixo de 150 \(dobrar pode dar \+1\)/.test(dobrar.api.breedFoodTrunkReason(IV149, t)), 'dobrar: margem de 1 no IV de quem vira comida: ' + dobrar.api.breedFoodTrunkReason(IV149, t));
        await api.breedTick(true);
        assert(cfg.breedLines[0].food && cfg.breedLines[0].food.id === 'f175' && cfg.breedLines[0].food.gen === 0 && cfg.breedLines[0].food.speciesId === 232 && cfg.breedLines[0].food.q0 === 1.75, 'comida em criação escolhida e salva no cfg: ' + JSON.stringify(cfg.breedLines[0].food));
        assert(api.breedPlanned.f175 && api.breedPlanned.f175.foodId === 'ff160' && !api.breedPlanned.alto, 'plano é da comida (F × comida própria), não de quem sobe: ' + JSON.stringify(api.breedPlanned));
        assert(state.trips.length === 1 && /comida para Donphan: Donphan Q 1\.750 IV 126 × Q 1\.600 IV 80/.test(state.trips[0].motivo), 'viagem pedida para criar comida: ' + JSON.stringify(state.trips));
        assert(state.logs.some(([k, d]) => k === 'breeding-comida' && d.fase === 'escolhida' && d.id === 'f175' && d.geracoes === 6), 'log breeding-comida escolhida');
        assert(api.breedWait === null, 'planejou: não fica parado');
        assert(/comida em criação, ainda não serve: Q 1\.750 longe demais/.test(api.breedFoodReason(F, t)), 'na lista de quem sobe, a comida em criação diz que ainda não serve: ' + api.breedFoodReason(F, t));
        assert(/Comida em criação/.test(api.breedStatus().join('\n')) && /falta 0\.060 de Q/.test(api.breedStatus().join('\n')), 'status mostra a comida em criação e o que falta: ' + api.breedStatus().join(' | '));
        assert(api.breedFoodStatus().some(x => /🍖 comida em criação: Donphan · geração 0 · Q 1\.750 IV 126/.test(x.text)), 'prévia mostra a comida em criação: ' + api.breedFoodStatus().map(x => x.text).join(' | '));
        // proteção: quem sobe, quem vira comida e a faixa dele (comida própria) ficam fora da venda; o lixo não
        assert(api.breedKeepsPoke(ALTO) && api.breedKeepsPoke(F) && api.breedKeepsPoke(FF) && !api.breedKeepsPoke(LIXO), 'protege quem sobe, a comida em criação e a comida dela; o lixo vende');
        // na cidade: POST breed parent1 = quem vira comida, parent2 = comida própria; o ovo é da sub-linhagem; quem sobe continua no box
        const r = await api.breedCityWork();
        assert(r.ok && fake.posts.length === 1 && fake.posts[0].parent1 === 'f175' && fake.posts[0].parent2 === 'ff160', 'cruzou quem vira comida com a comida própria: ' + JSON.stringify(fake.posts) + ' ' + JSON.stringify(r));
        assert(cfg.breedLines[0].id === 'alto' && cfg.breedLines[0].food.eggId === 'ovo-1' && cfg.breedLines[0].food.id === null && cfg.breedLines[0].food.lastQ === 1.75, 'ovo da comida em criação; quem sobe segue no box: ' + JSON.stringify(cfg.breedLines[0]));
        assert(/🍖 comida para \*\*Donphan\*\*/.test(state.hooks[state.hooks.length - 1].desc), 'aviso diz que o ovo é comida: ' + state.hooks[state.hooks.length - 1].desc);
        assert(/comida da linhagem 1 \(geração 1\)/.test(api.breedStatus().join('\n')), 'status do ovo diz de quem é: ' + api.breedStatus().join(' | '));
        // enquanto a comida choca, quem sobe fica parado com o motivo certo (e sem pedir viagem)
        clock.now += 3 * 60 * 1000;
        await api.breedTick(true);
        assert(state.trips.length === 1 && api.breedWait && /comida em criação: ovo chocando/.test(api.breedWait.motivo), 'esperando a comida chocar: ' + JSON.stringify(api.breedWait));
        // o ovo choca: filho Q 1,82 IV 126 (já na faixa de quem sobe) aparece no box e vira a comida em criação (geração 1)
        const FILHO = P({ id: 'filho1', quality: 1.82, ivTotal: 126, xp: 0 });
        fake.st.eggs[0].ready = true; fake.st.eggs[0].killsDone = 3000;
        fake.st.hatch = { ok: true, child: { speciesId: 232, shiny: false, quality: 1.82, delta: 0.07, growth: GROWTH, ivTotal: 126, bqs: 48 } };
        boxNow = [LIDER, ALTO, F2, IVALTO, LIXO, FILHO];   // os pais foram consumidos
        fake.st.box.filho1 = FILHO; fake.st.growth = { hp: 30, atk: 30, def: 30, spAtk: 30, spDef: 15, speed: 15 };   // soma 150 = IV de quem sobe
        clock.now += 31 * 60 * 1000;   // passa o retry do "parado"
        await api.breedTick(true);
        const chocou = state.hooks.find(h => /chocou/.test(h.content));
        assert(chocou && /\(comida em criação\)/.test(chocou.content) && /Comida em criação da linhagem 1 \(Donphan\): geração 1/.test(chocou.desc) && /✔ Já serve de comida para Donphan Q 1\.960/.test(chocou.desc), 'aviso do choco diz que é comida e que já serve: ' + JSON.stringify(chocou));
        assert(cfg.breedLines[0].food.id === 'filho1' && cfg.breedLines[0].food.gen === 1 && !cfg.breedLines[0].food.eggId, 'filho identificado vira a comida em criação (geração 1): ' + JSON.stringify(cfg.breedLines[0].food));
        assert(api.breedFoodReason(FILHO, t) === null && api.breedPlanned.alto && api.breedPlanned.alto.foodId === 'filho1' && state.trips.length === 2, 'quem sobe come o filho da comida em criação: ' + JSON.stringify(api.breedPlanned) + ' ' + api.breedFoodReason(FILHO, t));
        assert(/✔ já serve para quem sobe/.test(api.breedStatus().join('\n')), 'status: comida em criação já serve: ' + api.breedStatus().join(' | '));
        const r2 = await api.breedCityWork();
        assert(r2.ok && fake.posts.length === 3 && fake.posts[2].parent1 === 'alto' && fake.posts[2].parent2 === 'filho1', 'quem sobe cruzou com o filho (POSTs: breed, hatch, breed): ' + JSON.stringify(fake.posts) + ' ' + JSON.stringify(r2));
        assert(cfg.breedLines[0].eggId === 'ovo-3' && cfg.breedLines[0].id === null && cfg.breedLines[0].food == null, 'sub-linhagem de comida terminou (consumida): ' + JSON.stringify(cfg.breedLines[0]));
        assert(state.logs.some(([k, d]) => k === 'breeding-comida' && d.fase === 'consumida' && d.id === 'filho1' && d.geracao === 1), 'log breeding-comida consumida');
        assert(!/comida para/.test(state.hooks[state.hooks.length - 1].desc), 'aviso do ovo de quem sobe é o normal');
        // quem vira comida sumiu do box (vendido na mão): a sub-linhagem é descartada e outro é escolhido
        const cfg2 = { breedEnabled: true, breedLines: [{ id: 'alto', gen: 0, food: { id: 'sumido', name: 'Donphan', speciesId: 232, gen: 0 } }], breedFoodIvMax: 150, breedFamily: false, breedDouble: false, breedFoodBreed: true };
        const m2 = loadBreedModule(cfg2, { api: fakeApi({ box: Object.fromEntries(box.map(p => [p.id, p])), have: 40 }).api, pokes: box });
        await m2.api.breedTick(true);
        assert(cfg2.breedLines[0].food.id === 'f175' && m2.state.logs.some(([k, d]) => k === 'breeding-comida' && d.fase === 'sumiu' && d.id === 'sumido'), 'comida em criação sumida é trocada: ' + JSON.stringify(cfg2.breedLines[0].food));
        // sem ninguém que possa virar comida: motivo claro, nada planejado
        const cfg3 = { breedEnabled: true, breedLines: [{ id: 'alto', gen: 0 }], breedFoodIvMax: 150, breedFamily: false, breedDouble: false, breedFoodBreed: true };
        const m3 = loadBreedModule(cfg3, { api: fakeApi({ box: { alto: ALTO, lixo: LIXO }, have: 40 }).api, pokes: [LIDER, ALTO, LIXO] });
        await m3.api.breedTick(true);
        assert(!cfg3.breedLines[0].food && m3.state.trips.length === 0 && /comida em criação: ninguém da espécie pode virar comida/.test(m3.api.breedWait.motivo), 'sem candidato: parado com motivo: ' + JSON.stringify(m3.api.breedWait));
    }

    // 15) v3.49.0: Breeding Box — o jogo só cota/cruza com os dois pais lá; a cotação na hunt falha sem parar a linhagem, a viagem separa
    //     os dois (`breedbox-move`), relê a lista e cota na cidade; movimento recusado = falha com o motivo; já na Breeding Box = como antes;
    //     filho identificado entre os que nasceram lá; venda e depósito pulam quem está lá (pokesell.test).
    {
        const tronco = Object.assign({}, TRONCO), comida = Object.assign({}, COMIDA);
        const fake = fakeApi({ box: { [tronco.id]: tronco, [comida.id]: comida }, have: 40, boxOnly: true });
        const cfg = { breedEnabled: true, breedLines: [{ id: TRONCO.id, gen: 0 }], breedFoodIvMax: 120, breedFamily: false, breedDouble: false };
        const marca = (m) => { for (const p of [tronco, comida]) if (m.pokeIds.includes(p.id)) p.breedingBox = m.dir === 'in'; return null; };   // a API falsa lê os originais
        const { api, state } = loadBreedModule(cfg, { api: fake.api, pokes: [LIDER, tronco, comida], breedBoxMove: marca });
        await api.breedTick(true);
        assert(api.breedPlanned[TRONCO.id] && state.trips.length === 1 && !api.breedWait, 'cotação fora da Breeding Box adia para a viagem sem parar: ' + JSON.stringify(api.breedWait) + ' ' + JSON.stringify(api.breedPlanned));
        assert(state.logs.some(([k, d]) => k === 'breeding-box' && d.fase === 'cotacao-na-viagem' && /Breeding Box/.test(d.erro) && d.naBox.join() === 'false,false'), 'log breeding-box cotacao-na-viagem: ' + JSON.stringify(state.logs.filter(([k]) => k === 'breeding-box')));
        assert(!state.logs.some(([k]) => k === 'breeding-parado'), 'não avisa parado por causa da Breeding Box');
        const r = await api.breedCityWork();
        assert(state.boxMoves.length === 1 && state.boxMoves[0].dir === 'in' && state.boxMoves[0].pokeIds.length === 2 && state.boxMoves[0].pokeIds.includes(TRONCO.id) && state.boxMoves[0].pokeIds.includes(COMIDA.id), 'na cidade separa os dois pais: ' + JSON.stringify(state.boxMoves));
        assert(r.ok && fake.posts.length === 1 && fake.posts[0].parent1 === TRONCO.id && fake.posts[0].parent2 === COMIDA.id && tronco.breedingBox && comida.breedingBox, 'cotou e cruzou depois da Breeding Box: ' + JSON.stringify(r) + ' ' + JSON.stringify(fake.posts));
        assert(state.calls.filter(c => /action=quote/.test(c.url)).length === 2, 'cotou 2x: na hunt (recusada) e na cidade (depois da Breeding Box): ' + state.calls.map(c => c.url).join(' | '));
        assert(state.logs.some(([k, d]) => k === 'breeding-box' && d.ok === true && d.dir === 'in' && d.moved === 2 && d.frame === true), 'log breeding-box ok: ' + JSON.stringify(state.logs.filter(([k]) => k === 'breeding-box')));
        // o jogo recusa o movimento: a viagem falha com o motivo, sem cruzar
        {
            const t2 = Object.assign({}, TRONCO), c2 = Object.assign({}, COMIDA);
            const f2 = fakeApi({ box: { [t2.id]: t2, [c2.id]: c2 }, have: 40, boxOnly: true });
            const cfg2 = { breedEnabled: true, breedLines: [{ id: TRONCO.id, gen: 0 }], breedFoodIvMax: 120, breedFamily: false, breedDouble: false };
            const m2 = loadBreedModule(cfg2, { api: f2.api, pokes: [LIDER, t2, c2], breedBoxMove: () => ({ error: 'Depósito indisponível durante a hunt' }) });
            await m2.api.breedTick(true);
            const r2 = await m2.api.breedCityWork();
            assert(!r2.ok && /Breeding Box: Depósito indisponível/.test(r2.motivo) && f2.posts.length === 0 && m2.api.breedWait && /Breeding Box/.test(m2.api.breedWait.motivo), 'movimento recusado: falha com o motivo, sem cruzar: ' + JSON.stringify(r2));
            assert(m2.state.logs.some(([k, d]) => k === 'breeding-box' && d.ok === false && /Depósito indisponível/.test(d.motivo) && d.faltam.length === 2), 'log breeding-box recusado: ' + JSON.stringify(m2.state.logs.filter(([k]) => k === 'breeding-box')));
        }
        // o jogo não responde nem move: "sem resposta do jogo" (pede a lista com pokes-get antes de desistir)
        {
            const t3 = Object.assign({}, TRONCO), c3 = Object.assign({}, COMIDA);
            const f3 = fakeApi({ box: { [t3.id]: t3, [c3.id]: c3 }, have: 40, boxOnly: true });
            const cfg3 = { breedEnabled: true, breedLines: [{ id: TRONCO.id, gen: 0 }], breedFoodIvMax: 120, breedFamily: false, breedDouble: false };
            const m3 = loadBreedModule(cfg3, { api: f3.api, pokes: [LIDER, t3, c3], breedBoxMove: () => ({ frame: false, moved: 0, skipped: 2 }) });
            await m3.api.breedTick(true);
            const r3 = await m3.api.breedCityWork();
            assert(!r3.ok && /Breeding Box: o jogo não moveu 2 de 2/.test(r3.motivo) && f3.posts.length === 0, 'frame sem movimento: motivo claro: ' + JSON.stringify(r3));
            assert(m3.state.sent.filter(m => m.type === 'pokes-get').length >= 2, 'pediu a lista de novo antes de desistir: ' + JSON.stringify(m3.state.sent.map(m => m.type)));
        }
        // já na Breeding Box (o filhote nasce lá): cota na hunt como antes e a cidade não move ninguém
        {
            const t4 = Object.assign({}, TRONCO, { breedingBox: true }), c4 = Object.assign({}, COMIDA, { breedingBox: true });
            const f4 = fakeApi({ box: { [t4.id]: t4, [c4.id]: c4 }, have: 40, boxOnly: true });
            const cfg4 = { breedEnabled: true, breedLines: [{ id: TRONCO.id, gen: 0 }], breedFoodIvMax: 120, breedFamily: false, breedDouble: false };
            const m4 = loadBreedModule(cfg4, { api: f4.api, pokes: [LIDER, t4, c4] });
            await m4.api.breedTick(true);
            assert(m4.api.breedPlanned[TRONCO.id] && m4.state.logs.some(([k, d]) => k === 'breeding-cotacao' && d.ok) && !m4.state.logs.some(([k]) => k === 'breeding-box'), 'já na Breeding Box: cotação na hunt como antes');
            assert(/Q 1\.466 · IV 126\/192 · na Breeding Box/.test(m4.api.breedStatus().join('\n')), 'status diz que quem sobe está na Breeding Box: ' + m4.api.breedStatus().join(' | '));
            assert(m4.api.breedFoodStatus().some(x => /✔ Donphan Q 1\.345 IV 104 lv18 · Breeding Box/.test(x.text)), 'prévia marca a comida na Breeding Box: ' + JSON.stringify(m4.api.breedFoodStatus()));
            const r4 = await m4.api.breedCityWork();
            assert(r4.ok && m4.state.boxMoves.length === 0 && f4.posts.length === 1, 'cidade não move quem já está lá: ' + JSON.stringify(r4) + ' ' + JSON.stringify(m4.state.boxMoves));
        }
        // quem sobe já está lá e só a comida falta: move só a comida
        {
            const t5 = Object.assign({}, TRONCO, { breedingBox: true }), c5 = Object.assign({}, COMIDA);
            const f5 = fakeApi({ box: { [t5.id]: t5, [c5.id]: c5 }, have: 40, boxOnly: true });
            const cfg5 = { breedEnabled: true, breedLines: [{ id: TRONCO.id, gen: 0 }], breedFoodIvMax: 120, breedFamily: false, breedDouble: false };
            const m5 = loadBreedModule(cfg5, { api: f5.api, pokes: [LIDER, t5, c5], breedBoxMove: (m) => { if (m.pokeIds.includes(c5.id)) c5.breedingBox = true; return null; } });
            await m5.api.breedTick(true);
            const r5 = await m5.api.breedCityWork();
            assert(r5.ok && m5.state.boxMoves.length === 1 && m5.state.boxMoves[0].pokeIds.join() === COMIDA.id && f5.posts.length === 1, 'só a comida vai para a Breeding Box: ' + JSON.stringify(m5.state.boxMoves));
        }
        // o filho nasce na Breeding Box: com dois candidatos de mesmo Q/IV, fica o que está lá
        {
            const cfgF = { breedEnabled: true, breedLines: [{ id: null, eggId: null, pendingChild: { quality: 1.471, ivTotal: 126 }, speciesId: 232, name: 'Donphan', gen: 0, lastQ: 1.466, lastIv: 126 }] };
            const fora = P({ id: 'fora', quality: 1.471, ivTotal: 126 }), dentro = P({ id: 'dentro', quality: 1.471, ivTotal: 126, breedingBox: true });
            const mF = loadBreedModule(cfgF, { pokes: [LIDER, fora, dentro] });
            mF.api.breedOnPokes(mF.state.pokes);
            assert(cfgF.breedLines[0].id === 'dentro' && cfgF.breedLines[0].gen === 1, 'filho = o que nasceu na Breeding Box: ' + JSON.stringify(cfgF.breedLines[0]));
        }
    }

    console.log('OK breeding.test — filtro da comida (Q e IV menores, teto, família), checklist da cotação (donorId/growth/baseQuality), teto de protegidos (v3.47.0), comida em criação (v3.48.0), Breeding Box (v3.49.0), plano + viagem, cidade (stones e comida da família, Breeding Box, POST breed), parado/retry, hatch e filho');
})().catch(e => { console.error(e); process.exit(1); });
