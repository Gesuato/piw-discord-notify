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
window.fetch = (url, opts) => { fetchCalls.push(String(url) + (opts && opts.body ? ' ' + opts.body : '')); return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ items: [{ id: 1, name: 'Pidgey Feather', category: 'loot', npcPrice: 10 }, { id: 2, name: 'Rare Candy', category: 'misc', npcPrice: 0 }] }) }); };
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
        log('qualidade=' + $('#pg-dn-q-summary').textContent);
        for (const t of panel.querySelectorAll('.dn-tab')) { t.click(); log('aba ' + t.dataset.tab + ' badge=' + t.querySelector('.b').dataset.state + ' paneVisivel=' + !panel.querySelector('[data-pane=' + t.dataset.tab + ']').hidden); }
        log('bolas=' + $('#pg-dn-balls-status').textContent.trim() + ' | warn0=' + !$('#pg-dn-autobuy-warn').hidden);
        log('venda=' + $('#pg-dn-sell-hunt').textContent.trim() + ' | ' + $('#pg-dn-sell-count').textContent + ' | lista=' + $('#pg-dn-sell-list').textContent.trim());
        log('psell=' + $('#pg-dn-psell-status').textContent.trim() + ' | campos=' + panel.querySelectorAll('.pg-dn-psell-lim').length + ' btnOff=' + $('#pg-dn-psell-now').disabled);
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
        log('import msg=' + $('#pg-dn-msg').textContent + ' lista=' + $('#pg-dn-list').value + ' importBoxHidden=' + $('#pg-dn-import-box').hidden);
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
        // ---- venda de Pokémon: regras na tela mostram a prévia; salvar guarda; Vender agora chama o POST ----
        panel.querySelector('.dn-tab[data-tab=venda]').click();
        $('#pg-dn-psell-common').value = 100; fire($('#pg-dn-psell-common'), 'input');
        $('#pg-dn-psell-legendary').value = 150; fire($('#pg-dn-psell-legendary'), 'input');
        log('psell previa=' + $('#pg-dn-psell-status').textContent.trim() + ' | ' + [...$('#pg-dn-psell-list').querySelectorAll('tr')].map(tr => tr.textContent.replace(/\s+/g, ' ').trim()).join(' || ') + ' | btn=' + $('#pg-dn-psell-now').textContent);
        $('#pg-dn-psell').checked = true; fire($('#pg-dn-psell'), 'change'); $('#pg-dn-save').click();
        const cfgP = JSON.parse(window.localStorage.getItem('pgDiscordNotifyCfg'));
        log('psell salvo=' + cfgP.pokeSellEnabled + ' limites=' + JSON.stringify(cfgP.pokeSellLimits) + ' faixa=' + cfgP.pokeSellEveryMin + '-' + cfgP.pokeSellEveryMaxMin + ' badge=' + panel.querySelector('.dn-tab[data-tab=venda] .b').dataset.state + ' | next=' + $('#pg-dn-psell-next').textContent);
        fetchCalls.length = 0; $('#pg-dn-psell-now').click();
        log('psell vender agora: fetch=' + fetchCalls.filter(c => c.includes('pokemon/sell')).join(' | ').slice(0, 160) + ' | msg=' + $('#pg-dn-msg').textContent.slice(0, 60));
        panel.querySelector('.dn-tab[data-tab=bolas]').click(); log('bolas=' + $('#pg-dn-balls-status').textContent.trim());
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
            log('apos delta: fetch=' + fetchCalls.map(c => c.split(' ')[0]).join(',') + ' | enviados=' + ws.sent.slice(1).map(x => JSON.parse(x).type + (JSON.parse(x).capturedId ? ':' + JSON.parse(x).capturedId : '')).join(','));
            recv({ type: 'family', family: { name: 'Fam', movesUsed: 3, movesCap: 50, frozen: false, members: [] }, depot: { items: [], pokes: [{ id: 'cuid-bagon-1', name: 'Bagon', level: 5 }] } });
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
