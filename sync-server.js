#!/usr/bin/env node
// Servidor local de sincronização do PIW Discord Notify.
//
// Cada painel do PokeGrid é uma partição isolada do Chromium: o localStorage de um painel não
// é visível pelos outros. Este mini-servidor guarda a configuração COMPARTILHADA num arquivo
// do seu PC e todos os painéis leem/gravam nele (o script faz isso sozinho a cada 15 s e ao
// salvar). Nada sai da sua máquina: ele só escuta em 127.0.0.1.
//
// Uso:   node sync-server.js            (ou dê dois cliques em sync-server.bat)
// Porta: 7391 (ou PIW_SYNC_PORT=xxxx)   Arquivo: %APPDATA%\piw-discord-notify\shared-config.json
//
// Endpoints:
//   GET  /ping  -> { ok: true, version }
//   GET  /cfg   -> { updatedAt, cfg }           (cfg = null se ainda não houver nada salvo)
//   PUT  /cfg   <- { updatedAt, cfg }           (grava; last-writer-wins pelo updatedAt)

'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const VERSION = '1.0.0';
const PORT = Number(process.env.PIW_SYNC_PORT) || 7391;
const DIR = process.env.PIW_SYNC_DIR || path.join(process.env.APPDATA || os.homedir(), 'piw-discord-notify');
const FILE = path.join(DIR, 'shared-config.json');
const MAX_BODY = 512 * 1024;

function readStore() {
    try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); }
    catch { return { updatedAt: 0, cfg: null }; }
}
function writeStore(store) {
    fs.mkdirSync(DIR, { recursive: true });
    const tmp = FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf8');
    fs.renameSync(tmp, FILE);
}

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Private-Network': 'true',
    'Access-Control-Max-Age': '600',
};
function send(res, status, body) {
    res.writeHead(status, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, CORS));
    res.end(body == null ? '' : JSON.stringify(body));
}

const server = http.createServer((req, res) => {
    const url = (req.url || '/').split('?')[0];
    if (req.method === 'OPTIONS') return send(res, 204, null);
    if (req.method === 'GET' && url === '/ping') return send(res, 200, { ok: true, version: VERSION });
    if (req.method === 'GET' && url === '/cfg') return send(res, 200, readStore());
    if (req.method === 'PUT' && url === '/cfg') {
        let body = '';
        req.on('data', (chunk) => { body += chunk; if (body.length > MAX_BODY) { send(res, 413, { ok: false, error: 'corpo grande demais' }); req.destroy(); } });
        req.on('end', () => {
            let data;
            try { data = JSON.parse(body); } catch { return send(res, 400, { ok: false, error: 'JSON inválido' }); }
            if (!data || typeof data.cfg !== 'object' || data.cfg === null) return send(res, 400, { ok: false, error: 'esperado { updatedAt, cfg }' });
            const updatedAt = Number(data.updatedAt) || Date.now();
            const cur = readStore();
            if (cur.updatedAt && updatedAt < cur.updatedAt) return send(res, 409, { ok: false, error: 'versão mais antiga', updatedAt: cur.updatedAt, cfg: cur.cfg });
            const store = { updatedAt, cfg: data.cfg };
            try { writeStore(store); } catch (err) { return send(res, 500, { ok: false, error: String(err.message || err) }); }
            console.log(`[${new Date().toLocaleTimeString('pt-BR')}] config atualizada (${Object.keys(data.cfg).length} chaves)`);
            return send(res, 200, { ok: true, updatedAt });
        });
        return;
    }
    send(res, 404, { ok: false, error: 'rota desconhecida' });
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`Porta ${PORT} já em uso. Já tem um sync-server rodando? (feche a outra janela ou use PIW_SYNC_PORT=outra)`);
    } else {
        console.error('Erro no servidor:', err.message || err);
    }
    process.exit(1);
});

server.listen(PORT, '127.0.0.1', () => {
    console.log(`PIW Discord Notify - sync-server v${VERSION}`);
    console.log(`Escutando em http://127.0.0.1:${PORT}  |  arquivo: ${FILE}`);
    console.log('Deixe esta janela aberta (ou coloque o sync-server.bat na pasta Inicializar do Windows).');
});
