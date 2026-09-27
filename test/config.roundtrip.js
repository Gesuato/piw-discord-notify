// Exportar → Importar de ponta a ponta no jsdom: nenhum campo da config pode se perder. Rodar: node test/config.roundtrip.js
let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch { console.log('PULADO config.roundtrip: jsdom nao instalado'); process.exit(0); }
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'piw-discord-notify.user.js'), 'utf8');
function boot(cfg) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://poke.idleworld.online/play', runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  window.WebSocket = class extends window.EventTarget { constructor(u) { super(); this.url = u; this.readyState = 1; } send() {} };
  Object.assign(window.WebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
  window.fetch = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ items: [] }) });
  if (cfg) window.localStorage.setItem('pgDiscordNotifyCfg', JSON.stringify(cfg));
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
};
setTimeout(() => {
  const w1 = boot(rica);
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
    const diff = Object.keys(rica).filter(k => JSON.stringify(saved[k]) !== JSON.stringify(rica[k])).map(k => `${k}: ${JSON.stringify(rica[k])} -> ${JSON.stringify(saved[k])}`);
    console.log('import: diferenças =', diff.length ? diff.join(' | ') : 'nenhuma', '| msg:', w2.document.querySelector('#pg-dn-msg').textContent.slice(0, 60));
    // e com "manter os canais" marcado
    const w3 = boot({ webhookUrl: 'https://discord.com/api/webhooks/9/z' });
    w3.document.querySelector('#pg-dn-btn').click();
    w3.document.querySelector('#pg-dn-import').click();
    w3.document.querySelector('#pg-dn-import-text').value = box; w3.document.querySelector('#pg-dn-import-keephooks').checked = true;
    w3.document.querySelector('#pg-dn-import-apply').click();
    const s3 = JSON.parse(w3.localStorage.getItem('pgDiscordNotifyCfg'));
    console.log('import mantendo canais: webhookUrl=' + s3.webhookUrl + ' watchList=' + s3.watchList + ' routes=' + Object.keys(s3.routes));
    if (faltamNoExport.length || diff.length || s3.webhookUrl !== 'https://discord.com/api/webhooks/9/z') { console.error('FALHOU config.roundtrip'); process.exit(1); }
    console.log('OK config.roundtrip — exportar/importar sem perdas');
    process.exit(0);
  }, 100);
}, 50);
