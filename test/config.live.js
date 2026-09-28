// Rodar: node test/config.live.js (precisa do jsdom). Import num painel vivo: conta B está em larvitar com perfis próprios, recebe a config da conta A e segue jogando.
let JSDOM;
try { ({ JSDOM } = require('jsdom')); } catch { console.log('PULADO config.live: jsdom nao instalado'); process.exit(0); }
const fs = require('fs');
const src = fs.readFileSync(require('path').join(__dirname, '..', 'piw-discord-notify.user.js'), 'utf8');
const falhas = []; const ok = (c, m) => { if (!c) falhas.push(m); };
function boot(cfg) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://poke.idleworld.online/play', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  w.WebSocket = class extends w.EventTarget { constructor(u) { super(); this.url = u; this.readyState = 1; this.sent = []; w.__ws = this; } send(d) { this.sent.push(d); } };
  Object.assign(w.WebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
  w.fetch = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ items: [{ id: 39, name: 'Earth Ball', category: 'loot', npcPrice: 10 }, { id: 120, name: 'Small Stone', category: 'loot', npcPrice: 10 }, { id: 7, name: 'Feather', category: 'loot', npcPrice: 5 }] }) });
  w.localStorage.setItem('pgDiscordNotifyCfg', JSON.stringify(cfg));
  w.eval(src);
  const ws = new w.WebSocket('wss://poke.idleworld.online/ws');
  w.__recv = (m) => ws.dispatchEvent(new w.MessageEvent('message', { data: JSON.stringify(m) }));
  return w;
}
const A = { webhookUrl: 'https://discord.com/api/webhooks/1/a', sellEnabled: true, sellItems: { 39: { keep: 0 }, 7: { keep: 3 } },
  sellProfiles: { larvitar: { items: { 39: { keep: 0 }, 7: { keep: 3 } } }, geodude: { items: { 120: { keep: 10 } } }, omanyte: { items: { 7: { keep: 0 } } } },
  depositItems: 'depot', depositPokes: 'family', depositFamilyList: [{ id: 13115, name: 'Devoted Token', keep: 0 }, { id: 44417, name: 'Strange Pheromone', keep: 1 }], cfgVersion: 2 };
const B = { webhookUrl: 'https://discord.com/api/webhooks/2/b', sellEnabled: false, sellItems: { 120: { keep: 0 } }, sellProfiles: { larvitar: { items: { 120: { keep: 0 } } }, pidgey: { items: { 7: { keep: 0 } } } }, cfgVersion: 2 };
const wA = boot(A);
wA.__recv({ type: 'field-init', slug: 'omanyte' });
wA.document.querySelector('#pg-dn-btn').click();
wA.document.querySelector('#pg-dn-export').click();
setTimeout(() => {
  const txt = wA.document.querySelector('#pg-dn-import-text').value;
  const wB = boot(B);
  const d = wB.document;
  wB.__ws.send(JSON.stringify({ type: 'enter-hunt', slug: 'larvitar' }));   // o script vê a hunt pelo que a tela envia
  wB.__recv({ type: 'field-kill', speciesName: 'Larvitar', loot: [{ itemId: 120, name: 'Small Stone', qty: 3 }] });
  d.querySelector('#pg-dn-btn').click();
  d.querySelector('.dn-tab[data-tab=venda]').click();
  d.querySelector('.dn-tab[data-tab=sistema]').click();
  d.querySelector('#pg-dn-import').click();
  d.querySelector('#pg-dn-import-text').value = txt;
  d.querySelector('#pg-dn-import-apply').click();
  const s1 = JSON.parse(wB.localStorage.getItem('pgDiscordNotifyCfg'));
  console.log('msg:', d.querySelector('#pg-dn-msg').textContent.slice(0, 160));
  ok(s1.sellEnabled && JSON.stringify(s1.sellItems) === JSON.stringify(A.sellProfiles.larvitar.items), 'a hunt atual (larvitar) usa a lista importada dela');
  ok(s1.sellProfiles.pidgey && s1.sellProfiles.geodude && s1.sellProfiles.omanyte, 'perfis somam: pidgey (daqui) + geodude/omanyte (vieram)');
  ok((s1.depositFamilyList || []).length === 2 && s1.depositItems === 'depot' && s1.depositPokes === 'family', 'guardar na cidade veio');
  console.log('salvo logo após importar: sellEnabled', s1.sellEnabled, 'ativa', JSON.stringify(s1.sellItems), 'perfis', JSON.stringify(s1.sellProfiles), 'lista', (s1.depositFamilyList || []).length);
  d.querySelector('.dn-tab[data-tab=venda]').click();
  const marcados = [...d.querySelectorAll('#pg-dn-sell-list .pg-dn-sell-chk:checked')].map(c => c.closest('[data-item-id]').dataset.itemId);
  console.log('tela venda: hunt', d.querySelector('#pg-dn-sell-hunt').textContent.trim().slice(0, 60), '| marcados', marcados, '| vender sozinho', d.querySelector('#pg-dn-sell').checked, '| guardar', d.querySelector('#pg-dn-dep-items').value, d.querySelector('#pg-dn-dep-pokes').value, '| família:', d.querySelector('#pg-dn-famlist').textContent);
  ok(JSON.stringify(marcados.sort()) === JSON.stringify(['39', '7']) && d.querySelector('#pg-dn-sell').checked, 'tela da Venda mostra as marcações importadas');
  ok(d.querySelector('#pg-dn-dep-items').value === 'depot' && /Devoted Token/.test(d.querySelector('#pg-dn-famlist').textContent), 'tela do Guardar mostra o que veio');
  wB.__recv({ type: 'field-kill', speciesName: 'Larvitar', loot: [{ itemId: 39, name: 'Earth Ball', qty: 2 }] });
  d.querySelector('#pg-dn-save').click();
  const s2 = JSON.parse(wB.localStorage.getItem('pgDiscordNotifyCfg'));
  console.log('depois de um drop e Salvar: ativa', JSON.stringify(s2.sellItems), 'perfis', JSON.stringify(s2.sellProfiles), 'lista', (s2.depositFamilyList || []).length, s2.depositItems, s2.depositPokes);
  ok(JSON.stringify(s2.sellProfiles) === JSON.stringify(s1.sellProfiles) && (s2.depositFamilyList || []).length === 2, 'drop + Salvar depois do import não perdem nada');
  if (falhas.length) { console.error('FALHOU config.live: ' + falhas.join(' | ')); process.exit(1); }
  console.log('OK config.live — import num painel vivo (em hunt, com perfis próprios, drop e Salvar depois)');
  process.exit(0);
}, 200);
