// Exportar → Importar de ponta a ponta no jsdom: nenhum campo da config pode se perder. Rodar: node test/config.roundtrip.js
let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch { console.log('PULADO config.roundtrip: jsdom nao instalado'); process.exit(0); }
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'piw-discord-notify.user.js'), 'utf8');
function boot(cfg, extra) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://poke.idleworld.online/play', runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  window.WebSocket = class extends window.EventTarget { constructor(u) { super(); this.url = u; this.readyState = 1; } send() {} };
  Object.assign(window.WebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
  window.fetch = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ items: [] }) });
  if (cfg) window.localStorage.setItem('pgDiscordNotifyCfg', JSON.stringify(cfg));
  for (const [k, v] of Object.entries(extra || {})) window.localStorage.setItem(k, v);
  window.eval(src);
  return window;
}
const rica = {
  webhookUrl: 'https://discord.com/api/webhooks/1/a', webhookShiny: 'https://discord.com/api/webhooks/2/b', webhookAlerts: 'https://discord.com/api/webhooks/3/c', webhookLevel: 'https://discord.com/api/webhooks/4/d',
  watchList: ['dratini', 'larvitar'], notifyEveryCapture: true, notifyShiny: false, lockNotified: true, familyNotified: true, minTier: 'epic', minIv: 150, minTierIv: 120,
  ballsMin: 200, ballsWatch: '4', autoBuy: true, autoBuyQty: 500, sellEnabled: true, sellItems: { 39: { keep: 5 } }, sellProfiles: { pidgey: { items: { 39: { keep: 5 } } } },
  pokeSellEnabled: true, pokeSellLimits: { common: 100, legendary: 140 }, levelAlertAt: 30, levelSwap: true, routeEnabled: true, route: [{ slug: 'pidgey', level: 10 }], routeStage: 0,
  routes: { A: { route: [{ slug: 'pidgey', level: 10 }], stage: 0 } }, routeName: 'A', catchRouteEnabled: false, catchRouteAreas: ['kanto', 'orre'], catchRouteMaxLevel: 30, catchRouteAuto: true, catchRouteBall: '4',
  catchRouteSkipped: ['abra'], catchRouteDone: [16, 19], dailyEnabled: true, dailyClaim: false, dailyReturnSlug: 'larvitar', tripCity: 'pewter', tripMinGapMin: 5, tripEveryMin: 12, tripEveryMaxMin: 20,
  reloadEnabled: true, reloadEveryMin: 45, reloadEveryMaxMin: 90, mentionUserId: '123', cooldownSeconds: 7, cfgVersion: 2, debug: true,
  // v3.16+ (daily sozinha, clã, guardar na cidade)
  dailyAuto: true, clanEnabled: true, clanKey: 'naturia', clanRankup: false, clanRoute: false,
  depositItems: 'depot', depositPokes: 'family', depositPokesRare: true,
  depositFamilyList: [{ id: 13115, name: 'Devoted Token', keep: 0 }, { id: 44417, name: 'Strange Pheromone', keep: 2 }],
  // v3.21.0 (refil de poções e revives)
  healBuy: true, healItemId: 203, healMin: 30, healQty: 150, reviveBuy: true, reviveItemId: 206, reviveMin: 3, reviveQty: 12, healJoyEnabled: true,
};
setTimeout(() => {
  const w1 = boot(rica, { pgDiscordNotifyDrops: JSON.stringify([120, 7]) });
  w1.document.querySelector('#pg-dn-btn').click();
  w1.document.querySelector('#pg-dn-export').click();
  setTimeout(() => {
    const box = w1.document.querySelector('#pg-dn-import-text').value;   // sem clipboard no jsdom, cai na caixa
    const exp = JSON.parse(box);
    const faltamNoExport = Object.keys(rica).filter(k => JSON.stringify(exp[k]) !== JSON.stringify(rica[k]));
    console.log('export: chaves diferentes do original =', JSON.stringify(faltamNoExport), '| msg:', w1.document.querySelector('#pg-dn-msg').textContent.slice(0, 60));
    const w2 = boot(null);
    w2.document.querySelector('#pg-dn-btn').click();
    w2.document.querySelector('#pg-dn-import').click();
    w2.document.querySelector('#pg-dn-import-text').value = box;
    w2.document.querySelector('#pg-dn-import-apply').click();
    const saved = JSON.parse(w2.localStorage.getItem('pgDiscordNotifyCfg'));
    // toda chave dos DEFAULTS tem que estar no fixture (feature nova sem entrar aqui = teste cego)
    const semFixture = Object.keys(saved).filter(k => !(k in rica) && !['sellProfiles'].includes(k));
    // o que a tela mostra depois de importar, e um Salvar logo em seguida não pode apagar nada
    const d2 = w2.document;
    const tela = { depItems: d2.querySelector('#pg-dn-dep-items').value, depPokes: d2.querySelector('#pg-dn-dep-pokes').value, depRare: d2.querySelector('#pg-dn-dep-rare').checked,
      famList: d2.querySelector('#pg-dn-famlist').textContent, clan: d2.querySelector('#pg-dn-clan').checked, clanKey: d2.querySelector('#pg-dn-clan-key').value, dailyAuto: d2.querySelector('#pg-dn-daily-auto').checked };
    console.log('tela depois de importar =', JSON.stringify(tela));
    const telaOk = tela.depItems === 'depot' && tela.depPokes === 'family' && tela.depRare && /Devoted Token/.test(tela.famList) && /Strange Pheromone/.test(tela.famList) && tela.clan && tela.clanKey === 'naturia' && tela.dailyAuto;
    d2.querySelector('#pg-dn-save').click();
    const aposSalvar = JSON.parse(w2.localStorage.getItem('pgDiscordNotifyCfg'));
    const diffSalvar = Object.keys(rica).filter(k => JSON.stringify(aposSalvar[k]) !== JSON.stringify(rica[k])).map(k => `${k}: ${JSON.stringify(rica[k])} -> ${JSON.stringify(aposSalvar[k])}`);
    console.log('salvar depois de importar: diferenças =', diffSalvar.length ? diffSalvar.join(' | ') : 'nenhuma', '| chaves fora do fixture =', JSON.stringify(semFixture));
    const diff = Object.keys(rica).filter(k => JSON.stringify(saved[k]) !== JSON.stringify(rica[k])).map(k => `${k}: ${JSON.stringify(rica[k])} -> ${JSON.stringify(saved[k])}`);
    console.log('import: diferenças =', diff.length ? diff.join(' | ') : 'nenhuma', '| msg:', w2.document.querySelector('#pg-dn-msg').textContent.slice(0, 60));
    // e com "manter os canais" marcado
    const w3 = boot({ webhookUrl: 'https://discord.com/api/webhooks/9/z', sellProfiles: { soDaqui: { items: { 7: { keep: 1 } } }, pidgey: { items: { 1: { keep: 0 } } } } });
    w3.document.querySelector('#pg-dn-btn').click();
    w3.document.querySelector('#pg-dn-import').click();
    w3.document.querySelector('#pg-dn-import-text').value = box; w3.document.querySelector('#pg-dn-import-keephooks').checked = true;
    w3.document.querySelector('#pg-dn-import-apply').click();
    const s3 = JSON.parse(w3.localStorage.getItem('pgDiscordNotifyCfg'));
    console.log('import mantendo canais: webhookUrl=' + s3.webhookUrl + ' watchList=' + s3.watchList + ' routes=' + Object.keys(s3.routes) + ' perfis=' + JSON.stringify(s3.sellProfiles));
    const somaOk = s3.sellProfiles.soDaqui && s3.sellProfiles.soDaqui.items[7] && JSON.stringify(s3.sellProfiles.pidgey) === JSON.stringify(rica.sellProfiles.pidgey);
    // drops conhecidos viajam no _drops; import normal não avisa versão; log registra
    const dropsW2 = JSON.parse(w2.localStorage.getItem('pgDiscordNotifyDrops') || '[]');
    const logW2 = JSON.parse(w2.localStorage.getItem('pgDiscordNotifyLog') || '[]').map(e => e.kind);
    console.log('drops no painel importado =', JSON.stringify(dropsW2), '| log:', logW2.filter(k => /config/.test(k)).join(','));
    const dropsOk = JSON.stringify(dropsW2.sort()) === JSON.stringify([120, 7].sort()) && logW2.includes('config-importada');
    // exportar com alteração não salva leva o que está na tela
    const w4 = boot(rica);
    w4.document.querySelector('#pg-dn-btn').click();
    const sel = w4.document.querySelector('#pg-dn-dep-items'); sel.value = 'family'; sel.dispatchEvent(new w4.Event('change', { bubbles: true })); sel.dispatchEvent(new w4.Event('input', { bubbles: true }));
    w4.document.querySelector('#pg-dn-export').click();
    // config de versão mais nova com opção desconhecida: importa e avisa para recarregar; texto cortado: erro claro + log
    const nova = JSON.parse(box); nova._versao = '99.0.0'; nova.opcaoDoFuturo = true;
    const w5 = boot(null);
    w5.document.querySelector('#pg-dn-btn').click(); w5.document.querySelector('#pg-dn-import').click();
    w5.document.querySelector('#pg-dn-import-text').value = JSON.stringify(nova); w5.document.querySelector('#pg-dn-import-apply').click();
    const msg5 = w5.document.querySelector('#pg-dn-msg').textContent;
    w5.document.querySelector('#pg-dn-import').click(); w5.document.querySelector('#pg-dn-import').click();
    w5.document.querySelector('#pg-dn-import-text').value = box.slice(0, 200); w5.document.querySelector('#pg-dn-import-apply').click();
    const msg5b = w5.document.querySelector('#pg-dn-msg').textContent;
    const log5 = JSON.parse(w5.localStorage.getItem('pgDiscordNotifyLog') || '[]').map(e => e.kind);
    console.log('versão nova:', msg5.slice(0, 110), '| cortado:', msg5b.slice(0, 110), '| log:', log5.filter(k => /config/.test(k)).join(','));
    // colar e clicar de novo em "Importar config" (em vez de Aplicar) também importa; a prévia avisa o que vem
    const w6 = boot({ webhookUrl: 'https://discord.com/api/webhooks/8/q' });
    w6.document.querySelector('#pg-dn-btn').click(); w6.document.querySelector('#pg-dn-import').click();
    const ta6 = w6.document.querySelector('#pg-dn-import-text'); ta6.value = box; ta6.dispatchEvent(new w6.Event('input', { bubbles: true }));
    const prev6 = w6.document.querySelector('#pg-dn-import-status').textContent;
    w6.document.querySelector('#pg-dn-import').click();
    const s6 = JSON.parse(w6.localStorage.getItem('pgDiscordNotifyCfg'));
    const botaoOk = /Clique em Aplicar/.test(prev6) && /2 itens em "Sempre para a família"/.test(prev6) && (s6.depositFamilyList || []).length === 2 && w6.document.querySelector('#pg-dn-import-box').hidden;
    console.log('prévia:', prev6.slice(0, 120), '| importou pelo botão Importar:', (s6.depositFamilyList || []).length === 2, '| caixa fechou:', w6.document.querySelector('#pg-dn-import-box').hidden);
    const avisoOk = /v99\.0\.0/.test(msg5) && /Recarregue este painel/.test(msg5) && /cortado/.test(msg5b) && log5.includes('config-import-falhou');
    setTimeout(() => {
    const exp4 = JSON.parse(w4.document.querySelector('#pg-dn-import-text').value || '{}');
    console.log('export com alteração não salva: depositItems =', exp4.depositItems, '| msg:', w4.document.querySelector('#pg-dn-msg').textContent.slice(0, 90));
    const pendenteOk = exp4.depositItems === 'family';
    if (!botaoOk || !somaOk || !dropsOk || !pendenteOk || !avisoOk || faltamNoExport.length || diff.length || !telaOk || diffSalvar.length || semFixture.length || s3.webhookUrl !== 'https://discord.com/api/webhooks/9/z') { console.error('FALHOU config.roundtrip'); process.exit(1); }
    console.log('OK config.roundtrip — exportar/importar sem perdas (tela, salvar depois, drops, alteração não salva, versão nova, texto cortado)');
    process.exit(0);
    }, 50);
  }, 100);
}, 50);
