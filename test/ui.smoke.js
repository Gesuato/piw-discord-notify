// Teste de fumaça do painel 🔔 com jsdom (opcional: precisa de `npm i -g jsdom` ou `npm i jsdom` numa pasta
// com NODE_PATH apontando pra ela). Carrega o userscript inteiro com WebSocket/fetch falsos, abre o painel,
// percorre as abas, edita, salva, testa canais, importa, simula hunt/drops/time/estoque chegando pelo socket
// e falha se houver erro de runtime. Rode: node test/ui.smoke.js
let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch { console.log('PULADO ui.smoke: jsdom nao instalado (npm i -g jsdom e NODE_PATH apontando para o node_modules global)'); process.exit(0); }
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'piw-discord-notify.user.js'), 'utf8');
const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    url: 'https://poke.idleworld.online/play',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
});
const { window } = dom;
const errors = [];
window.addEventListener('error', (e) => errors.push('ERRO: ' + (e.error && e.error.stack || e.message)));
window.WebSocket = class FakeWS extends window.EventTarget { constructor(url) { super(); this.url = url; this.readyState = 1; this.sent = []; } send(d) { this.sent.push(d); } };
Object.assign(window.WebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
const fetchCalls = [];
// map-markers/creatures.json: 2 hunts com tabela de drops (v3.20.0); o resto responde o catálogo de itens
const FAKE_HUNTS = { hunts: [{ slug: 'pidgey', name: 'Pidgey', level: 5, looktype: 16, area: 'kanto' }, { slug: 'geodude', name: 'Geodude', level: 1, looktype: 74, area: 'kanto' }] };
const FAKE_CREATURES = { creatures: [{ pokeId: 16, name: 'Pidgey', looktype: 16, loot: [{ name: 'Pidgey Feather', chance: 90000, minCount: 1, maxCount: 3 }] }, { pokeId: 74, name: 'Geodude', looktype: 74, loot: [{ name: 'Small Stone', chance: 95000, minCount: 1, maxCount: 4 }] }] };
window.fetch = (url, opts) => {
    fetchCalls.push(String(url) + (opts && opts.body ? ' ' + opts.body : ''));
    const u = String(url);
    const body = /map-markers/.test(u) ? FAKE_HUNTS : /creatures\.json/.test(u) ? FAKE_CREATURES
        : { items: [{ id: 1, name: 'Pidgey Feather', category: 'loot', npcPrice: 10 }, { id: 2, name: 'Rare Candy', category: 'misc', npcPrice: 0 }, { id: 120, name: 'Small Stone', category: 'loot', npcPrice: 10 }] };
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
};
window.localStorage.setItem('pgDiscordNotifyCfg', JSON.stringify({
    webhookUrl: 'https://discord.com/api/webhooks/1/x', watchList: ['dratini'],
    route: [{ slug: 'pidgey', level: 10 }, { slug: 'larvitar', level: 15 }], routeEnabled: true, routeStage: 1,
    sellEnabled: true, sellItems: { 1: { keep: 0 } }, autoBuy: true, ballsMin: 0, autoBuyGoldReserve: 5000, cfgVersion: 2,
}));

const log = (m) => console.log(m);
try { window.eval(src); } catch (e) { console.log('EXC ao carregar: ' + e.stack); process.exit(1); }

setTimeout(() => {
    const d = window.document;
    const $ = (s) => d.querySelector(s);
    const fire = (el, type) => el.dispatchEvent(new window.Event(type, { bubbles: true }));
    try {
        const btn = $('#pg-dn-btn'), panel = $('#pg-dn-panel');
        log('btn=' + Boolean(btn) + ' panel=' + Boolean(panel) + ' hiddenAoIniciar=' + panel.hidden + ' dot=' + $('#pg-dn-dot').dataset.state);
        log('title=' + btn.title);
        btn.click();
        log('aberto=' + !panel.hidden + ' aba=' + panel.querySelector('.dn-tab[aria-selected=true]').dataset.tab + ' chanBoxHidden=' + $('#pg-dn-chan-box').hidden);
        log('resumoCanais=' + $('#pg-dn-chan-summary').textContent.trim());
        window.navigator.clipboard = { readText: () => Promise.resolve('https://discord.com/api/webhooks/77/colado'), writeText: () => Promise.reject(new Error('negado')) };
        $('#pg-dn-hook-alerts').value = ''; $('#pg-dn-hook-alerts').dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
        log('qualidade=' + $('#pg-dn-q-summary').textContent);
        log('colar botao direito: alerts=' + $('#pg-dn-hook-alerts').value + ' | msg=' + $('#pg-dn-msg').textContent.slice(0, 40));
        for (const t of panel.querySelectorAll('.dn-tab')) { t.click(); log('aba ' + t.dataset.tab + ' badge=' + t.querySelector('.b').dataset.state + ' paneVisivel=' + !panel.querySelector('[data-pane=' + t.dataset.tab + ']').hidden); }
        log('bolas=' + $('#pg-dn-balls-status').textContent.trim() + ' | warn0=' + !$('#pg-dn-autobuy-warn').hidden);
        log('venda=' + $('#pg-dn-sell-hunt').textContent.trim() + ' | ' + $('#pg-dn-sell-count').textContent + ' | lista=' + $('#pg-dn-sell-list').textContent.trim());
        log('psell=' + $('#pg-dn-psell-status').textContent.trim() + ' | campos=' + panel.querySelectorAll('.pg-dn-psell-lim').length + ' | faixa=' + $('#pg-dn-trip-title').textContent + ' / ' + $('#pg-dn-trip-sub').textContent + ' | faixaNaAba=' + ($('#pg-dn-trip').parentElement.dataset.pane) + ' blkAberto=' + [...panel.querySelectorAll('.dn-blk.open')].map(b => b.dataset.blk));
        $('#pg-dn-blk-pokes').querySelector('h3').click(); log('clicou pokes: aberto=' + [...panel.querySelectorAll('.dn-blk.open')].map(b => b.dataset.blk) + ' ui=' + window.localStorage.getItem('pgDiscordNotifyUi'));
        log('treino level.disabled=' + $('#pg-dn-level').disabled + ' value=' + $('#pg-dn-level').value + ' | ' + $('#pg-dn-route-status').textContent + ' | itens=' + $('#pg-dn-route-list').children.length);
        log('team=' + $('#pg-dn-team').textContent);
        log('daily=' + $('#pg-dn-daily-status').textContent + ' | claimPadrao=' + $('#pg-dn-daily-claim').checked);
        panel.querySelector('.dn-tab[data-tab=profissao]').click();
        log('profissao=' + $('#pg-dn-catch-status').textContent + ' | areas=' + [...panel.querySelectorAll('.pg-dn-catch-area:checked')].map(c => c.value) + ' | prof=' + $('#pg-dn-prof-status').textContent);
        $('#pg-dn-catch').checked = true; fire($('#pg-dn-catch'), 'change');
        panel.querySelector('.pg-dn-catch-area[value=orre]').checked = true; fire(panel.querySelector('.pg-dn-catch-area[value=orre]'), 'change');
        $('#pg-dn-catch-max').value = 30; fire($('#pg-dn-catch-max'), 'input');
        log('profissao rascunho badge=' + panel.querySelector('.dn-tab[data-tab=profissao] .b').dataset.state + ' treinoRotaOn=' + $('#pg-dn-route-on').checked);
        $('#pg-dn-save').click();
        const cfgC = JSON.parse(window.localStorage.getItem('pgDiscordNotifyCfg'));
        log('captura salva=' + cfgC.catchRouteEnabled + ' areas=' + cfgC.catchRouteAreas + ' max=' + cfgC.catchRouteMaxLevel + ' rotaTreino=' + cfgC.routeEnabled + ' | msg=' + $('#pg-dn-msg').textContent.slice(0, 120));
        $('#pg-dn-catch').checked = false; fire($('#pg-dn-catch'), 'change'); $('#pg-dn-route-on').checked = true; fire($('#pg-dn-route-on'), 'change'); $('#pg-dn-save').click();
        // Clã (v3.17.0): ligar "Caçar o que falta" desliga a rota de treino; depois volta como estava
        panel.querySelector('.dn-tab[data-tab=profissao]').click();
        $('#pg-dn-clan').checked = true; fire($('#pg-dn-clan'), 'change'); $('#pg-dn-clan-route').checked = true; fire($('#pg-dn-clan-route'), 'change');
        log('cla rascunho=' + $('#pg-dn-clan-status').textContent + ' | ' + $('#pg-dn-clan-plan').textContent);
        $('#pg-dn-save').click();
        const cfgK = JSON.parse(window.localStorage.getItem('pgDiscordNotifyCfg'));
        log('cla salvo=' + cfgK.clanEnabled + ' rota=' + cfgK.clanRoute + ' chave=' + cfgK.clanKey + ' rotaTreino=' + cfgK.routeEnabled + ' | msg=' + $('#pg-dn-msg').textContent.slice(0, 140));
        if (!(cfgK.clanEnabled && cfgK.clanRoute && cfgK.clanKey === 'orebound' && !cfgK.routeEnabled)) errors.push('clã: Salvar não gravou ou não desligou a rota de treino');
        // Guardar na cidade (v3.18.0): bloco da aba Venda grava os dois destinos
        panel.querySelector('.dn-tab[data-tab=venda]').click();
        $('#pg-dn-dep-items').value = 'depot'; fire($('#pg-dn-dep-items'), 'change');
        $('#pg-dn-dep-pokes').value = 'family'; fire($('#pg-dn-dep-pokes'), 'change');
        log('guardar rascunho=' + $('#pg-dn-sum-guardar').textContent + ' | ' + $('#pg-dn-dep-status').textContent);
        $('#pg-dn-famitem').value = 'Devoted Token'; $('#pg-dn-famitem-keep').value = '2'; $('#pg-dn-famitem-add').click(); // assíncrono: conferido abaixo
        $('#pg-dn-save').click();
        const cfgG = JSON.parse(window.localStorage.getItem('pgDiscordNotifyCfg'));
        if (!(cfgG.depositItems === 'depot' && cfgG.depositPokes === 'family' && cfgG.depositPokesRare === false)) errors.push('guardar: Salvar não gravou os destinos');
        $('#pg-dn-dep-items').value = ''; fire($('#pg-dn-dep-items'), 'change'); $('#pg-dn-dep-pokes').value = ''; fire($('#pg-dn-dep-pokes'), 'change');
        panel.querySelector('.dn-tab[data-tab=profissao]').click();
        $('#pg-dn-clan').checked = false; fire($('#pg-dn-clan'), 'change'); $('#pg-dn-clan-route').checked = false; fire($('#pg-dn-clan-route'), 'change');
        $('#pg-dn-route-on').checked = true; fire($('#pg-dn-route-on'), 'change'); $('#pg-dn-save').click();
        panel.querySelector('.dn-tab[data-tab=treino]').click();
        log('sistema=' + $('#pg-dn-reload-status').textContent + ' | ' + $('#pg-dn-socket').textContent);
        $('#pg-dn-ballsmin').value = 50; fire($('#pg-dn-ballsmin'), 'input');
        log('msg=' + $('#pg-dn-msg').textContent + ' saveIdle=' + $('#pg-dn-save').classList.contains('idle') + ' bolasBadge=' + panel.querySelector('.dn-tab[data-tab=bolas] .b').dataset.state + ' dot=' + $('#pg-dn-dot').dataset.state);
        $('#pg-dn-route').value = 'pidgey 10\nlarvitar 15\nxx'; fire($('#pg-dn-route'), 'input');
        log('rotaStatus=' + $('#pg-dn-route-status').textContent + ' | bad=' + panel.querySelectorAll('.dn-route li.bad').length);
        $('#pg-dn-save').click();
        const saved = JSON.parse(window.localStorage.getItem('pgDiscordNotifyCfg'));
        log('salvou msg=' + $('#pg-dn-msg').textContent);
        log('  ballsMin=' + saved.ballsMin + ' reserva=' + saved.autoBuyGoldReserve + ' routeStage=' + saved.routeStage + ' routeEnabled=' + saved.routeEnabled + ' levelAlertAt=' + saved.levelAlertAt + ' rota=' + JSON.stringify(saved.route) + ' sellItems=' + JSON.stringify(saved.sellItems));
        // ---- Daily Kill: liga, escolhe hunt de volta, salva e confere status/cfg ----
        panel.querySelector('.dn-tab[data-tab=treino]').click();
        $('#pg-dn-daily').checked = true; fire($('#pg-dn-daily'), 'change');
        $('#pg-dn-daily-return').value = 'Mr. Mime'; fire($('#pg-dn-daily-return'), 'input');
        log('daily rascunho=' + $('#pg-dn-daily-status').textContent + ' | treinoBadge=' + panel.querySelector('.dn-tab[data-tab=treino] .b').dataset.state);
        $('#pg-dn-save').click();
        const cfgDaily = JSON.parse(window.localStorage.getItem('pgDiscordNotifyCfg'));
        log('daily salvo=' + cfgDaily.dailyEnabled + ' claim=' + cfgDaily.dailyClaim + ' volta=' + cfgDaily.dailyReturnSlug + ' | msg=' + $('#pg-dn-msg').textContent.slice(0, 160));
        $('#pg-dn-daily').checked = false; fire($('#pg-dn-daily'), 'change'); $('#pg-dn-save').click();
        // ---- Daily Gift (v3.24.0): liga, escolhe o modo do Gift Center, salva e confere status/cfg ----
        $('#pg-dn-gift').checked = true; fire($('#pg-dn-gift'), 'change');
        $('#pg-dn-gift-center').value = 'all'; fire($('#pg-dn-gift-center'), 'change');
        log('gift rascunho=' + $('#pg-dn-gift-status').textContent + ' | treinoBadge=' + panel.querySelector('.dn-tab[data-tab=treino] .b').dataset.state);
        $('#pg-dn-save').click();
        const cfgGift = JSON.parse(window.localStorage.getItem('pgDiscordNotifyCfg'));
        log('gift salvo=' + cfgGift.giftEnabled + ' center=' + cfgGift.giftCenterMode + ' | status=' + $('#pg-dn-gift-status').textContent + ' | msg=' + $('#pg-dn-msg').textContent.slice(0, 160));
        $('#pg-dn-gift').checked = false; fire($('#pg-dn-gift'), 'change'); $('#pg-dn-save').click();
        // ---- Poke Slot Machine (v3.26.0): liga, escreve a lista de pedidos, salva e confere status/cfg ----
        $('#pg-dn-slot').checked = true; fire($('#pg-dn-slot'), 'change');
        $('#pg-dn-slot-wanted').value = 'Dratini, Larvitar'; fire($('#pg-dn-slot-wanted'), 'input');
        log('slot rascunho=' + $('#pg-dn-slot-status').textContent + ' | treinoBadge=' + panel.querySelector('.dn-tab[data-tab=treino] .b').dataset.state);
        $('#pg-dn-save').click();
        const cfgSlot = JSON.parse(window.localStorage.getItem('pgDiscordNotifyCfg'));
        log('slot salvo=' + cfgSlot.slotEnabled + ' pedidos=' + cfgSlot.slotWanted + ' | status=' + $('#pg-dn-slot-status').textContent + ' | msg=' + $('#pg-dn-msg').textContent.slice(0, 160));
        $('#pg-dn-slot').checked = false; fire($('#pg-dn-slot'), 'change'); $('#pg-dn-save').click();
        $('#pg-dn-route-reset').click(); log('reset1=' + $('#pg-dn-route-reset').textContent + ' | ' + $('#pg-dn-msg').textContent);
        $('#pg-dn-route-reset').click(); log('reset2=' + $('#pg-dn-msg').textContent);
        // ---- rotas nomeadas: migração da config antiga, nova, troca pelo menu, renomear, excluir ----
        const selR = $('#pg-dn-route-sel');
        let cfgR = JSON.parse(window.localStorage.getItem('pgDiscordNotifyCfg'));
        log('rotas migradas=' + JSON.stringify(Object.keys(cfgR.routes || {})) + ' ativa=' + cfgR.routeName + ' opts=' + [...selR.options].map(o => o.textContent).join(' | ') + ' go=' + ($('#pg-dn-route-go') ? $('#pg-dn-route-go').textContent : '-'));
        $('#pg-dn-route-new').click(); log('nameBox=' + !$('#pg-dn-route-name-box').hidden + ' lbl=' + $('#pg-dn-route-name-lbl').textContent);
        $('#pg-dn-route-name').value = 'Dratini'; $('#pg-dn-route-name-ok').click();
        $('#pg-dn-route').value = 'dratini 30'; fire($('#pg-dn-route'), 'input'); $('#pg-dn-save').click();
        cfgR = JSON.parse(window.localStorage.getItem('pgDiscordNotifyCfg'));
        log('nova rota=' + cfgR.routeName + ' rotas=' + JSON.stringify(cfgR.routes) + ' | opts=' + [...selR.options].map(o => o.textContent).join(' | '));
        selR.value = 'Rota 1'; fire(selR, 'change');
        cfgR = JSON.parse(window.localStorage.getItem('pgDiscordNotifyCfg'));
        log('trocou=' + cfgR.routeName + ' etapa=' + cfgR.routeStage + ' texto=' + JSON.stringify($('#pg-dn-route').value) + ' dirty=' + $('#pg-dn-msg').textContent.slice(0, 100));
        $('#pg-dn-route-rename').click(); $('#pg-dn-route-name').value = 'Larvitar'; $('#pg-dn-route-name-ok').click();
        $('#pg-dn-route-del').click(); log('del1=' + $('#pg-dn-route-del').textContent); $('#pg-dn-route-del').click();
        cfgR = JSON.parse(window.localStorage.getItem('pgDiscordNotifyCfg'));
        log('renomeou+excluiu: ativa=' + cfgR.routeName + ' rotas=' + Object.keys(cfgR.routes) + ' rota=' + JSON.stringify(cfgR.route) + ' | ' + $('#pg-dn-msg').textContent.slice(0, 80));
        $('#pg-dn-hook').value = ''; fire($('#pg-dn-hook'), 'input');
        log('avisosBadge=' + panel.querySelector('.dn-tab[data-tab=avisos] .b').dataset.state + ' dot=' + $('#pg-dn-dot').dataset.state + ' resumo=' + $('#pg-dn-chan-summary').textContent.trim());
        $('#pg-dn-test').click(); log('testar=' + $('#pg-dn-msg').textContent + ' aba=' + panel.querySelector('.dn-tab[aria-selected=true]').dataset.tab + ' hookSalvo=' + JSON.stringify(JSON.parse(window.localStorage.getItem('pgDiscordNotifyCfg')).webhookUrl));
        $('#pg-dn-hook').value = 'https://discord.com/api/webhooks/1/x'; fire($('#pg-dn-hook'), 'input');
        $('#pg-dn-test').click(); log('testar2=' + $('#pg-dn-msg').textContent);
        $('#pg-dn-import').click(); $('#pg-dn-import-text').value = JSON.stringify({ webhookUrl: 'https://discord.com/api/webhooks/2/y', watchList: ['bagon'] }); $('#pg-dn-import-apply').click();
        log('import msg=' + $('#pg-dn-msg').textContent.slice(0, 160) + ' lista=' + $('#pg-dn-list').value + ' importBoxHidden=' + $('#pg-dn-import-box').hidden);
        $('#pg-dn-import').click(); $('#pg-dn-import-paste').click();
        d.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); log('fechouEsc=' + panel.hidden + ' ui=' + window.localStorage.getItem('pgDiscordNotifyUi'));
        btn.click(); log('reabriu aba=' + panel.querySelector('.dn-tab[aria-selected=true]').dataset.tab);
        // venda: marcar item e ver "manter" aparecer, depois drop novo com painel aberto mantém marcação não salva
        panel.querySelector('.dn-tab[data-tab=venda]').click();
        log('itens venda=' + panel.querySelectorAll('#pg-dn-sell-list .dn-item').length);
        // Enter salva
        $('#pg-dn-cooldown').value = 7; fire($('#pg-dn-cooldown'), 'input');
        $('#pg-dn-cooldown').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        log('enter salvou cooldown=' + JSON.parse(window.localStorage.getItem('pgDiscordNotifyCfg')).cooldownSeconds + ' msg=' + $('#pg-dn-msg').textContent);

        // ---- socket falso: hunt, drops, time e estoque chegando com o painel aberto ----
        const ws = new window.WebSocket('wss://poke.idleworld.online/ws?token=x');
        const recv = (obj) => ws.dispatchEvent(new window.MessageEvent('message', { data: JSON.stringify(obj) }));
        ws.send(JSON.stringify({ type: 'enter-hunt', slug: 'pidgey' }));
        recv({ type: 'field-kill', speciesName: 'Pidgey', xpGained: 10, level: 12, loot: [{ itemId: 1, name: 'Pidgey Feather', qty: 2 }, { itemId: 2, name: 'Rare Candy', qty: 1 }] });
        recv({ type: 'pokes', list: [{ id: 'a', speciesId: 1, name: 'Larvitar', level: 12, team: true, slot: 0, leader: true }, { id: 'b', speciesId: 2, name: 'Pidgey', level: 10, team: true, slot: 1 }, { id: 'c', speciesId: 19, name: 'Rattata', level: 3, team: false, sellValue: 100, ivTotal: 40, quality: 1.0 }, { id: 'd', speciesId: 147, name: 'Dratini', level: 3, team: false, sellValue: 500, ivTotal: 160, quality: 1.7 }] });
        recv({ type: 'catch-result', success: true, speciesName: 'Pidgey', shiny: false, ballId: 4, ballName: 'Ultra Ball' });
        recv({ type: 'balls', counts: { 4: 1240 } });
        panel.querySelector('.dn-tab[data-tab=venda]').click();
        log('hunt=' + $('#pg-dn-sell-hunt').textContent.trim());
        log('drops=' + [...panel.querySelectorAll('#pg-dn-sell-list .dn-item')].map(i => i.className + ':' + i.textContent.replace(/\s+/g, ' ').trim()).join(' | '));
        const chk = panel.querySelector('#pg-dn-sell-list .pg-dn-sell-chk'); chk.checked = true; fire(chk, 'change');
        log('marcou=' + chk.closest('.dn-item').className + ' contagem=' + $('#pg-dn-sell-count').textContent + ' msg=' + $('#pg-dn-msg').textContent);
        recv({ type: 'field-kill', speciesName: 'Pidgey', loot: [{ itemId: 1, name: 'Pidgey Feather', qty: 1 }] });
        log('apos drop novo ainda marcado=' + panel.querySelector('#pg-dn-sell-list .pg-dn-sell-chk').checked);
        $('#pg-dn-save').click();
        log('salvo sellItems=' + JSON.stringify(JSON.parse(window.localStorage.getItem('pgDiscordNotifyCfg')).sellItems) + ' perfil=' + JSON.stringify(JSON.parse(window.localStorage.getItem('pgDiscordNotifyCfg')).sellProfiles));
        panel.querySelector('.dn-tab[data-tab=treino]').click(); log('team=' + $('#pg-dn-team').textContent + ' | rota=' + $('#pg-dn-route-list').textContent.replace(/\s+/g, ' '));
        // ---- Breeding (v3.29.0): box com dois Donphan chega, menu lista o box, escolhe quem sobe, salva; a comida aparece na prévia ----
        recv({ type: 'pokes', list: [{ id: 'a', speciesId: 1, name: 'Larvitar', level: 12, team: true, slot: 0, leader: true, quality: 1.3, ivTotal: 100 }, { id: 'd1', speciesId: 232, name: 'Donphan', level: 20, team: false, quality: 1.466, ivTotal: 126, sellValue: 100 }, { id: 'd2', speciesId: 232, name: 'Donphan', level: 20, team: false, quality: 1.345, ivTotal: 104, sellValue: 100 }, { id: 'd3', speciesId: 232, name: 'Donphan', level: 20, team: false, quality: 1.5, ivTotal: 90, sellValue: 100 }] });
        panel.querySelector('.dn-tab[data-tab=breeding]').click();
        log('breeding opcoes=' + $('#pg-dn-breed-l1').options.length + ' | status=' + $('#pg-dn-breed-status').textContent.replace(/\s+/g, ' ').slice(0, 80));
        $('#pg-dn-breed').checked = true; fire($('#pg-dn-breed'), 'change');
        $('#pg-dn-breed-l1').value = 'd1'; fire($('#pg-dn-breed-l1'), 'change');
        $('#pg-dn-breed-ivmax').value = 120; fire($('#pg-dn-breed-ivmax'), 'input');
        log('breeding comida=' + $('#pg-dn-breed-food').textContent.replace(/\s+/g, ' ') + ' | badge=' + panel.querySelector('.dn-tab[data-tab=breeding] .b').dataset.state);
        $('#pg-dn-save').click();
        const cfgBr = JSON.parse(window.localStorage.getItem('pgDiscordNotifyCfg'));
        log('breeding salvo=' + cfgBr.breedEnabled + ' linhas=' + JSON.stringify(cfgBr.breedLines) + ' ivmax=' + cfgBr.breedFoodIvMax + ' | msg=' + $('#pg-dn-msg').textContent.slice(0, 120));
        if (!(cfgBr.breedEnabled && cfgBr.breedLines[0] && cfgBr.breedLines[0].id === 'd1' && cfgBr.breedFoodIvMax === 120)) throw new Error('breeding não salvou como esperado');
        $('#pg-dn-breed').checked = false; fire($('#pg-dn-breed'), 'change'); $('#pg-dn-save').click();
        // ---- venda de Pokémon: regras na tela mostram a prévia; salvar guarda; Vender agora chama o POST ----
        panel.querySelector('.dn-tab[data-tab=venda]').click();
        $('#pg-dn-psell-common').value = 100; fire($('#pg-dn-psell-common'), 'input');
        $('#pg-dn-psell-legendary').value = 150; fire($('#pg-dn-psell-legendary'), 'input');
        log('psell previa=' + $('#pg-dn-psell-status').textContent.trim() + ' | ' + [...$('#pg-dn-psell-list').querySelectorAll('tr')].map(tr => tr.textContent.replace(/\s+/g, ' ').trim()).join(' || '));
        $('#pg-dn-psell').checked = true; fire($('#pg-dn-psell'), 'change'); $('#pg-dn-save').click();
        const cfgP = JSON.parse(window.localStorage.getItem('pgDiscordNotifyCfg'));
        log('psell salvo=' + cfgP.pokeSellEnabled + ' limites=' + JSON.stringify(cfgP.pokeSellLimits) + ' viagem=' + cfgP.tripEveryMin + '-' + cfgP.tripEveryMaxMin + ' badge=' + panel.querySelector('.dn-tab[data-tab=venda] .b').dataset.state + ' | faixa=' + $('#pg-dn-trip-sub').textContent + ' | sum=' + $('#pg-dn-sum-pokes').textContent);
        $('#pg-dn-trip-now').click();
        log('ir agora: msg=' + $('#pg-dn-msg').textContent.slice(0, 80) + ' | faixa=' + $('#pg-dn-trip-title').textContent + ' busy=' + $('#pg-dn-trip').classList.contains('busy'));
        panel.querySelector('.dn-tab[data-tab=bolas]').click(); log('bolas=' + $('#pg-dn-balls-status').textContent.trim());
        // ---- refil de poções e revives (v3.21.0): liga, salva, a mochila chega pelo socket ----
        $('#pg-dn-heal-buy').checked = true; fire($('#pg-dn-heal-buy'), 'change');
        $('#pg-dn-heal-item').value = '203'; fire($('#pg-dn-heal-item'), 'change');
        $('#pg-dn-heal-min').value = 40; fire($('#pg-dn-heal-min'), 'input');
        $('#pg-dn-revive-buy').checked = true; fire($('#pg-dn-revive-buy'), 'change');
        $('#pg-dn-save').click();
        const cfgS = JSON.parse(window.localStorage.getItem('pgDiscordNotifyCfg'));
        if (!(cfgS.healBuy && cfgS.healItemId === 203 && cfgS.healMin === 40 && cfgS.reviveBuy && cfgS.reviveItemId === 205)) throw new Error('refil não salvou: ' + JSON.stringify({ h: [cfgS.healBuy, cfgS.healItemId, cfgS.healMin], r: [cfgS.reviveBuy, cfgS.reviveItemId] }));
        if (!ws.sent.some(x => JSON.parse(x).type === 'inv-get')) throw new Error('Salvar com refil não pediu a mochila');
        recv({ type: 'inventory', items: [{ itemId: 203, quantity: 12 }, { itemId: 205, quantity: 30 }] });
        const heal = $('#pg-dn-heal-status').textContent, rev = $('#pg-dn-revive-status').textContent;
        log('refil: ' + heal + ' | ' + rev + ' | faixa=' + $('#pg-dn-trip-sub').textContent);
        if (!/Hyper Potion: 12 na mochila.*abaixo do limite/.test(heal) || !/Revive: 30 na mochila/.test(rev) || /abaixo/.test(rev)) throw new Error('status do refil errado');
        if (!$('#pg-dn-trip').classList.contains('busy') && !/comprar 200 Hyper Potion/.test($('#pg-dn-trip-sub').textContent)) throw new Error('faixa da viagem sem o refil');
        // ---- cura na Joy (v3.22.0): liga, salva, o líder desmaia e o servidor manda para a cidade ----
        $('#pg-dn-healjoy').checked = true; fire($('#pg-dn-healjoy'), 'change');
        if (!/ligada ao salvar/.test($('#pg-dn-healjoy-status').textContent)) throw new Error('status da Joy antes de salvar: ' + $('#pg-dn-healjoy-status').textContent);
        $('#pg-dn-save').click();
        if (!JSON.parse(window.localStorage.getItem('pgDiscordNotifyCfg')).healJoyEnabled) throw new Error('Joy não salvou');
        recv({ type: 'field', fainted: true, reviveInMs: 9000, noRevive: false, heroHp: 0, heroMaxHp: 120 });
        if (!/desmaiado/.test($('#pg-dn-healjoy-status').textContent)) throw new Error('status sem o desmaio: ' + $('#pg-dn-healjoy-status').textContent);
        recv({ type: 'field-teleport-city' });
        const joy = $('#pg-dn-healjoy-status').textContent;
        const kindsJoy = JSON.parse(window.localStorage.getItem('pgDiscordNotifyLog') || '[]').map(e => e.kind);
        log('joy: ' + joy + ' | log=' + kindsJoy.filter(k => ['desmaio', 'teleporte-cidade', 'cura'].includes(k)).join(','));
        if (!/indo para a cidade/.test(joy) || !kindsJoy.includes('cura')) throw new Error('cura não começou');
        // ---- parada na cidade (v3.23.0): ligada por padrão, 10 min; mudar o tempo e salvar ----
        if (!$('#pg-dn-cityidle').checked || $('#pg-dn-cityidle-min').value !== '10') throw new Error('parada na cidade não veio ligada com 10 min');
        $('#pg-dn-cityidle-min').value = 15; fire($('#pg-dn-cityidle-min'), 'input');
        $('#pg-dn-save').click();
        if (JSON.parse(window.localStorage.getItem('pgDiscordNotifyCfg')).cityIdleMin !== 15) throw new Error('tempo da parada na cidade não salvou');
        log('cidade: ' + $('#pg-dn-cityidle-status').textContent);
        if (!/Volta:/.test($('#pg-dn-cityidle-status').textContent)) throw new Error('status da parada na cidade vazio');
        panel.querySelector('.dn-tab[data-tab=sistema]').click(); log('socket=' + $('#pg-dn-socket').textContent);
        log('enviados=' + ws.sent.map(x => JSON.parse(x).type).join(','));
        // ---- importar rota do PIW Tools (texto colado da aba Rota otimizada) ----
        panel.querySelector('.dn-tab[data-tab=treino]').click();
        $('#pg-dn-route-import').click();
        $('#pg-dn-route-import-text').value = [
            'Larvitar', '', 'De', '15', 'Até', '18', '', 'Hunt desta etapa', '', 'Gastly', '', 'Lv. 20', '', 'Bite', 'DARK', '2.5x', '327/h', 'KOs/h est.', '$18k/h', 'Editar etapa', 'Dividir', 'Remover', '',
            'Larvitar', '', 'De', '19', 'Até', '27', '', 'Hunt desta etapa', '', 'Ledian', '', 'Lv. 40', 'Editar etapa', '',
            'Pupitar', '', 'De', '28', 'Até', '59', '', 'Hunt desta etapa', '', 'Furious Scyther', '', 'Lv. 150', 'Remover',
        ].join('\n');
        $('#pg-dn-route-import-apply').click();
        log('rota importada=' + JSON.stringify($('#pg-dn-route').value) + ' | boxHidden=' + $('#pg-dn-route-import-box').hidden + ' | msg=' + $('#pg-dn-msg').textContent.slice(0, 160));
        $('#pg-dn-route-piwlink').click();
        log('piwlink msg=' + $('#pg-dn-msg').textContent.slice(0, 120));
        // ---- exportar / importar SÓ a rota (v3.27.0): exporta a da tela, importa como rota nova, repete e troca as etapas ----
        $('#pg-dn-route-export').click();
        log('rota exportada msg=' + $('#pg-dn-msg').textContent.slice(0, 120));
        const rotaJson = JSON.stringify({ _piwDiscordNotifyRoute: 1, _versao: '9.9.9', _conta: 'outra', name: 'Vinda de fora', route: [{ slug: 'pidgey', level: 12 }, { slug: 'ledyba', level: 20 }] });
        $('#pg-dn-route-share-import').click();
        if ($('#pg-dn-route-share-box').hidden) throw new Error('caixa de importar rota não abriu');
        $('#pg-dn-route-share-text').value = JSON.stringify({ webhookUrl: 'x' }); fire($('#pg-dn-route-share-text'), 'input');
        log('rota share status config=' + $('#pg-dn-route-share-status').textContent.slice(0, 80));
        $('#pg-dn-route-share-text').value = rotaJson; fire($('#pg-dn-route-share-text'), 'input');
        log('rota share status=' + $('#pg-dn-route-share-status').textContent.slice(0, 160));
        $('#pg-dn-route-share-apply').click();
        let cfgRS = JSON.parse(window.localStorage.getItem('pgDiscordNotifyCfg'));
        log('rota importada ativa=' + cfgRS.routeName + ' etapas=' + JSON.stringify(cfgRS.routes['Vinda de fora']) + ' | box=' + $('#pg-dn-route-share-box').hidden + ' | msg=' + $('#pg-dn-msg').textContent.slice(0, 120));
        if (cfgRS.routeName !== 'Vinda de fora' || cfgRS.route.length !== 2 || cfgRS.routeStage !== 0) throw new Error('rota importada não ficou ativa');
        $('#pg-dn-route-share-import').click(); $('#pg-dn-route-share-text').value = 'pidgey 15\nledyba 25\ndratini 40'; fire($('#pg-dn-route-share-text'), 'input');
        $('#pg-dn-route-share-import').click(); // com texto na caixa, aplica
        cfgRS = JSON.parse(window.localStorage.getItem('pgDiscordNotifyCfg'));
        log('rota texto puro=' + cfgRS.routeName + ' etapas=' + cfgRS.route.length + ' rotas=' + JSON.stringify(Object.keys(cfgRS.routes)));
        if (cfgRS.route.length !== 3 || !cfgRS.routes['Vinda de fora'] || cfgRS.routes['Vinda de fora'].route.length !== 2) throw new Error('rota em texto puro não virou rota nova');
        // ---- guardar o avisado: liga os dois toggles, salva, captura um da lista e confere lock + família + webhook ----
        panel.querySelector('.dn-tab[data-tab=avisos]').click();
        $('#pg-dn-lock').checked = true; fire($('#pg-dn-lock'), 'change');
        $('#pg-dn-family').checked = true; fire($('#pg-dn-family'), 'change');
        $('#pg-dn-save').click();
        const cfgNow = JSON.parse(window.localStorage.getItem('pgDiscordNotifyCfg'));
        log('guardar salvo lock=' + cfgNow.lockNotified + ' family=' + cfgNow.familyNotified + ' lista=' + cfgNow.watchList + ' title=' + btn.title.split(' · ')[0]);
        fetchCalls.length = 0;
        recv({ type: 'catch-result', success: true, speciesName: 'Bagon', shiny: false, ballId: 4, ballName: 'Ultra Ball' });
        recv({ type: 'poke-delta', poke: { id: 'cuid-bagon-1', speciesId: 371, name: 'Bagon', level: 5, shiny: false, xp: 0, ivTotal: 150, quality: 1.4 } });
        setTimeout(() => {
            log('colar botao direito (assincrono): alerts=' + $('#pg-dn-hook-alerts').value);
            const chip = $('#pg-dn-famlist').textContent;
            $('#pg-dn-save').click();
            const lst = JSON.parse(window.localStorage.getItem('pgDiscordNotifyCfg')).depositFamilyList || [];
            log('lista familia chip=' + chip + ' salvo=' + JSON.stringify(lst));
            if (!(/Devoted Token/.test(chip) && lst.length === 1 && lst[0].name === 'Devoted Token' && lst[0].keep === 2)) errors.push('lista da família: item não entrou ou não salvou');
            // venda por hunt (v3.20.0): escolhe outra hunt, marca um drop que ainda não caiu, salva no perfil dela
            panel.querySelector('.dn-tab[data-tab=venda]').click();
            const ativoAntes = JSON.stringify(JSON.parse(window.localStorage.getItem('pgDiscordNotifyCfg')).sellItems);
            $('#pg-dn-sell-view').value = 'Geodude'; fire($('#pg-dn-sell-view'), 'change');
            const linhas = [...panel.querySelectorAll('#pg-dn-sell-list .dn-item')].map(i => i.textContent.replace(/\s+/g, ' ').trim());
            log('venda outra hunt=' + $('#pg-dn-sell-hunt').textContent.trim().slice(0, 90) + ' | linhas=' + linhas.join(' | '));
            const pedra = panel.querySelector('#pg-dn-sell-list [data-item-id="120"] .pg-dn-sell-chk');
            if (!pedra) errors.push('venda por hunt: Small Stone (tabela de drops) não apareceu em geodude');
            else { pedra.checked = true; fire(pedra, 'change'); }
            $('#pg-dn-save').click();
            const cfgV = JSON.parse(window.localStorage.getItem('pgDiscordNotifyCfg'));
            log('perfil geodude=' + JSON.stringify(cfgV.sellProfiles && cfgV.sellProfiles.geodude) + ' ativo=' + JSON.stringify(cfgV.sellItems));
            if (!(cfgV.sellProfiles && cfgV.sellProfiles.geodude && cfgV.sellProfiles.geodude.items && cfgV.sellProfiles.geodude.items[120])) errors.push('venda por hunt: perfil de geodude não salvou a Small Stone');
            if (JSON.stringify(cfgV.sellItems) !== ativoAntes) errors.push('venda por hunt: editar outra hunt mexeu na lista ativa');
            $('#pg-dn-sell-view-cur').click();
            log('apos delta: fetch=' + fetchCalls.map(c => c.split(' ')[0]).join(',') + ' | enviados=' + ws.sent.slice(1).map(x => JSON.parse(x).type + (JSON.parse(x).capturedId ? ':' + JSON.parse(x).capturedId : '')).join(','));
            recv({ type: 'family', family: { name: 'Fam', movesUsed: 3, movesCap: 50, frozen: false, members: [] }, depot: { items: [], pokes: [{ id: 'cuid-bagon-1', name: 'Bagon', level: 5 }] } });
            // v3.30.0: frame `guild` (formato do bundle), `guild-dirty` e um `guild-action` enviado pela tela passam sem erro e entram no log
            recv({ type: 'guild', guild: { id: 'g1', name: 'Guilda', tag: 'GLD', tier: 1, points: 12, members: 3, slots: 5, maxSlots: 11, nextSlot: { points: 50, gold: 100000 }, goldDonated: 2500, bonusPct: 1.5, online: 2 },
                me: { rank: 2, isPresident: false, canInvite: false, gold: 123456, donatedToday: 0, donateCap: 50000, buff: null },
                members: [{ characterId: 'c1', name: 'Eu', level: 90, rank: 2, online: true, lastSeenMs: 0, isMe: true, clan: null, clanRank: 0, weekKills: 10, weekGold: 0, team: [] }],
                hunts: [{ id: 'h1', kind: 'kill', tier: 1, species: [{ dex: 16, name: 'Pidgey' }, { dex: 19, name: 'Rattata' }], progress: 40, goal: 500, done: false }, { id: 'h2', kind: 'catch', tier: 1, species: [], progress: 3, goal: 30, done: false }],
                huntsEndAt: Date.now() + 3600000, dailies: [{ id: 'd1', region: 'kanto', verb: 'kill', progress: 100, goal: 1000, points: 20, done: false }], dailyRegions: [{ region: 'kanto', active: true }, { region: 'nightmare', active: false }],
                tribute: { itemId: 7, itemName: 'Small Stone', progress: 200, goal: 3000, points: 3, mine: 45, done: false }, tributeEndAt: Date.now() + 7200000,
                talents: [{ key: 'xp', level: 0, max: 5, per: 1, value: 0, next: 10 }], points: { available: 2 }, dex: { caught: 40, total: 600, recent: [] }, history: [{ kind: 'joined', actor: 'Eu', at: Date.now(), payload: {} }], invites: [], list: [], canCreate: false, createCost: 500000, myGold: 123456 });
            recv({ type: 'guild-dirty' });
            ws.send(JSON.stringify({ type: 'guild-action', action: 'donate', amount: 100 }));
            // v3.31.0: com a doação e o tributo ligados, o frame `guild` dispara `guild-action donate` (teto − doado, respeitando a reserva)
            // e, depois da resposta, `guild-action tribute`; o `error` do jogo encerra a doação sem travar o tributo
            $('#pg-dn-guild-donate').value = '500000'; fire($('#pg-dn-guild-donate'), 'input');
            $('#pg-dn-guild-keep').value = '100000'; fire($('#pg-dn-guild-keep'), 'input');
            $('#pg-dn-guild-tribute').checked = true; fire($('#pg-dn-guild-tribute'), 'change');
            $('#pg-dn-guild-tribute-keep').value = '5'; fire($('#pg-dn-guild-tribute-keep'), 'change');
            $('#pg-dn-save').click();
            const antesG = ws.sent.length;
            recv({ type: 'guild', guild: { id: 'g1', name: 'Guilda', tag: 'GLD', tier: 1, points: 12, members: 3, slots: 5, maxSlots: 11, nextSlot: { slot: 6, points: 50, gold: 100000 }, goldDonated: 2500, bonusPct: 1.5, online: 2 },
                me: { rank: 2, isPresident: false, canInvite: false, gold: 123456, donatedToday: 0, donateCap: 500000, buff: null }, members: [], hunts: [], dailies: [], dailyRegions: [],
                tribute: { id: 't1', itemId: 7, itemName: 'Small Stone', progress: 200, goal: 3000, points: 3, mine: 45, done: false }, talents: [], points: { available: 2 }, dex: { caught: 0, total: 1, recent: [] }, history: [], invites: [] });
            const acoes = ws.sent.slice(antesG).map(x => JSON.parse(x)).filter(x => x.type === 'guild-action');
            log('guild acoes=' + JSON.stringify(acoes));
            if (!(acoes.length === 1 && acoes[0].action === 'donate' && acoes[0].amount === 23456)) errors.push('guild: doação esperada de 23456 (gold − reserva), veio ' + JSON.stringify(acoes));
            recv({ type: 'error', message: 'Você já doou o máximo de hoje (500.000 gold).' });
            recv({ type: 'guild', guild: { id: 'g1', name: 'Guilda', tag: 'GLD', tier: 1, points: 12, members: 3, slots: 5, maxSlots: 11, nextSlot: { slot: 6, points: 50, gold: 100000 }, goldDonated: 2500, bonusPct: 1.5, online: 2 },
                me: { rank: 2, isPresident: false, canInvite: false, gold: 123456, donatedToday: 500000, donateCap: 500000, buff: null }, members: [], hunts: [], dailies: [], dailyRegions: [],
                tribute: { id: 't1', itemId: 7, itemName: 'Small Stone', progress: 200, goal: 3000, points: 3, mine: 45, done: false }, talents: [], points: { available: 2 }, dex: { caught: 0, total: 1, recent: [] }, history: [], invites: [] });
            const acoes2 = ws.sent.slice(antesG).map(x => JSON.parse(x)).filter(x => x.type === 'guild-action');
            log('guild acoes depois do erro=' + JSON.stringify(acoes2.slice(1)));
            if (!(acoes2.length === 2 && acoes2[1].action === 'tribute' && acoes2[1].amount === 40)) errors.push('guild: tributo esperado de 40 (45 − 5), veio ' + JSON.stringify(acoes2));
            const logG = JSON.parse(window.localStorage.getItem('pgDiscordNotifyLog') || '[]').filter(e => e.kind === 'guild-doacao').pop();
            if (!(logG && logG.data.ok === false && /máximo/.test(logG.data.erro))) errors.push('guild: log guild-doacao com o erro do jogo não gravado: ' + JSON.stringify(logG));
            if (!/Small Stone/.test($('#pg-dn-guild-status').textContent) || !/Tributo/.test($('#pg-dn-guild-status').textContent)) errors.push('guild: status da aba não mostra o tributo');
            {
                const kindsG = JSON.parse(window.localStorage.getItem('pgDiscordNotifyLog') || '[]').filter(e => e.kind.startsWith('guild'));
                log('guild: ' + kindsG.map(e => e.kind).join(',') + ' | campos=' + JSON.stringify((kindsG.find(e => e.kind === 'guild-campos') || {}).data && (kindsG.find(e => e.kind === 'guild-campos') || {}).data.tributo) + ' | envio=' + JSON.stringify((kindsG.find(e => e.kind === 'guild-envio') || {}).data));
                for (const k of ['guild-campos', 'guild', 'guild-envio']) if (!kindsG.some(e => e.kind === k)) errors.push('guild: log ' + k + ' não gravado');
                const resumo = (kindsG.find(e => e.kind === 'guild') || {}).data || {};
                if (!(resumo.cacadas && resumo.cacadas.length === 2 && resumo.cacadas[0].especies.join('&') === 'Pidgey&Rattata' && resumo.eu && resumo.eu.tetoDoacao === 50000)) errors.push('guild: resumo do frame errado: ' + JSON.stringify(resumo));
            }
            setTimeout(() => {
                const hook = fetchCalls.find(c => c.startsWith('https://discord.com/'));
                log('webhook enviado=' + Boolean(hook) + ' travado=' + (hook || '').includes('Travado no jogo') + ' familia=' + (hook || '').includes('depósito da família'));
                const kinds = JSON.parse(window.localStorage.getItem('pgDiscordNotifyLog') || '[]').map(e => e.kind);
                log('log kinds=' + kinds.filter(k => ['poke-lock', 'poke-familia', 'familia', 'decisao', 'webhook-ok'].includes(k)).join(','));
                finish();
            }, 50);
        }, 50);
        return;
        log('logEvents=' + JSON.parse(window.localStorage.getItem('pgDiscordNotifyLog') || '[]').map(e => e.ev || e.type || Object.keys(e)[0]).join(','));
    } catch (e) { log('EXC: ' + e.stack); }
    finish();
    function finish() {
        if (errors.length) { console.error(errors.join(' | ')); process.exit(1); }
        log('OK ui.smoke — painel abriu, salvou, testou, importou, recebeu hunt/drops/time/estoque e guardou uma captura sem erro de runtime');
        process.exit(0);
    }
}, 1500);
