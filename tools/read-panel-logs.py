"""Lê a config e o log do PIW Discord Notify direto do disco, sem abrir o PokeGrid.

Cada painel do PokeGrid é um <webview> com partição própria; o localStorage fica em
  %APPDATA%\\pokegrid\\Partitions\\conta{1..4}\\Local Storage\\leveldb\\
Este script é um leitor mínimo de LevelDB em Python puro (sem dependências):
  - *.log  = write-ahead log (registros de 32 KiB, sem compressão) — dados mais recentes;
  - *.ldb  = tabelas (blocos comprimidos com Snappy) — dados compactados, mais antigos.
Chaves do localStorage: b"_https://poke.idleworld.online\\x00\\x01" + nome. Valor: 1 byte de
prefixo (0x00 = UTF-16LE, 0x01 = Latin-1) + texto. A ÚLTIMA gravação vence (ldb em ordem de
número, depois o log em ordem de sequência).

Os webhooks são SEMPRE redigidos: nunca copie a URL para a conversa nem para o repositório.

Uso:
  python tools/read-panel-logs.py                     # tudo, todos os painéis
  python tools/read-panel-logs.py --panel 4           # só a conta4
  python tools/read-panel-logs.py --kinds nivel,troca,rota,hunt-troca,time
  python tools/read-panel-logs.py --no-cfg            # só o log
  python tools/read-panel-logs.py --cfg-only          # só a config (redigida)
  python tools/read-panel-logs.py --raw               # todos os pares chave/valor (debug)
"""
import argparse
import glob
import json
import os
import re
import struct
import sys

BASE = os.path.expandvars(r'%APPDATA%\pokegrid\Partitions')
KEYS = ('pgDiscordNotifyCfg', 'pgDiscordNotifyLog')
WEBHOOK_RE = re.compile(r'https://(?:ptb\.|canary\.)?discord(?:app)?\.com/api/webhooks/\S+')


# ---------------------------------------------------------------- Snappy (descompressão)
def snappy_uncompress(data):
    pos = 0
    n = 0
    shift = 0
    while True:                       # varint com o tamanho descomprimido
        b = data[pos]; pos += 1
        n |= (b & 0x7F) << shift
        if not b & 0x80:
            break
        shift += 7
    out = bytearray()
    while pos < len(data):
        tag = data[pos]; pos += 1
        t = tag & 3
        if t == 0:                    # literal
            ln = tag >> 2
            if ln >= 60:
                nb = ln - 59
                ln = int.from_bytes(data[pos:pos + nb], 'little'); pos += nb
            ln += 1
            out += data[pos:pos + ln]; pos += ln
            continue
        if t == 1:                    # copy 1 byte de offset
            ln = ((tag >> 2) & 7) + 4
            off = ((tag >> 5) << 8) | data[pos]; pos += 1
        elif t == 2:                  # copy 2 bytes
            ln = (tag >> 2) + 1
            off = int.from_bytes(data[pos:pos + 2], 'little'); pos += 2
        else:                         # copy 4 bytes
            ln = (tag >> 2) + 1
            off = int.from_bytes(data[pos:pos + 4], 'little'); pos += 4
        start = len(out) - off
        for i in range(ln):           # cópias podem se sobrepor
            out.append(out[start + i])
    return bytes(out)


# ---------------------------------------------------------------- utilidades
def varint(buf, pos):
    n = 0; shift = 0
    while True:
        b = buf[pos]; pos += 1
        n |= (b & 0x7F) << shift
        if not b & 0x80:
            return n, pos
        shift += 7


# ---------------------------------------------------------------- *.ldb (tabela)
def ldb_block_entries(block):
    """Entradas (key, value) de um bloco de tabela LevelDB (prefixo compartilhado + restarts)."""
    if len(block) < 4:
        return []
    n_restarts = struct.unpack('<I', block[-4:])[0]
    end = len(block) - 4 - 4 * n_restarts
    pos = 0; key = b''; out = []
    while pos < end:
        shared, pos = varint(block, pos)
        non_shared, pos = varint(block, pos)
        vlen, pos = varint(block, pos)
        key = key[:shared] + block[pos:pos + non_shared]; pos += non_shared
        value = block[pos:pos + vlen]; pos += vlen
        out.append((key, value))
    return out


def ldb_read_block(raw, offset, size):
    data = raw[offset:offset + size]
    ctype = raw[offset + size]
    if ctype == 1:
        data = snappy_uncompress(data)
    return data


def read_ldb(raw):
    """Pares (user_key, value, seq, tipo) de um arquivo .ldb, na ordem do arquivo."""
    footer = raw[-48:]
    pos = 0
    _, pos = varint(footer, pos); _, pos = varint(footer, pos)          # metaindex handle
    idx_off, pos = varint(footer, pos); idx_size, pos = varint(footer, pos)
    index = ldb_read_block(raw, idx_off, idx_size)
    out = []
    for _, handle in ldb_block_entries(index):
        off, p = varint(handle, 0); size, _ = varint(handle, p)
        for ikey, value in ldb_block_entries(ldb_read_block(raw, off, size)):
            user_key = ikey[:-8]
            tag = struct.unpack('<Q', ikey[-8:])[0]
            out.append((user_key, value, tag >> 8, tag & 0xFF))
    return out


# ---------------------------------------------------------------- *.log (write-ahead)
def read_log(raw):
    """Pares (user_key, value, seq, tipo) do write-ahead log, em ordem de sequência."""
    BLOCK = 32768
    records = []
    frag = bytearray()
    pos = 0
    while pos + 7 <= len(raw):
        if BLOCK - (pos % BLOCK) < 7:               # trailer do bloco
            pos += BLOCK - (pos % BLOCK); continue
        length = struct.unpack('<H', raw[pos + 4:pos + 6])[0]
        rtype = raw[pos + 6]
        body = raw[pos + 7:pos + 7 + length]
        pos += 7 + length
        if rtype == 0:
            break                                    # zero-padding: fim
        if rtype == 1:
            records.append(bytes(body))
        elif rtype == 2:
            frag = bytearray(body)
        elif rtype == 3:
            frag += body
        elif rtype == 4:
            frag += body; records.append(bytes(frag)); frag = bytearray()
    out = []
    for rec in records:
        if len(rec) < 12:
            continue
        seq = struct.unpack('<Q', rec[:8])[0]
        count = struct.unpack('<I', rec[8:12])[0]
        p = 12
        try:
            for i in range(count):
                t = rec[p]; p += 1
                klen, p = varint(rec, p); key = rec[p:p + klen]; p += klen
                value = b''
                if t == 1:
                    vlen, p = varint(rec, p); value = rec[p:p + vlen]; p += vlen
                out.append((key, value, seq + i, t))
        except (IndexError, struct.error):
            continue
    return out


# ---------------------------------------------------------------- localStorage
def decode_value(value):
    if not value:
        return ''
    if value[0] == 0:
        return value[1:].decode('utf-16-le', errors='replace')
    return value[1:].decode('latin-1', errors='replace')


def file_number(f):
    try:
        return int(os.path.basename(f).split('.')[0])
    except ValueError:
        return 0


def read_panel(part_dir):
    """Último valor de cada chave de interesse (dict nome -> objeto JSON)."""
    d = os.path.join(part_dir, 'Local Storage', 'leveldb')
    ldbs = sorted(glob.glob(os.path.join(d, '*.ldb')), key=file_number)
    logs = sorted(glob.glob(os.path.join(d, '*.log')), key=file_number)
    latest = {}   # nome -> (ordem, seq, valor bytes | None se apagado)
    order = 0
    for f in ldbs + logs:
        try:
            raw = open(f, 'rb').read()
        except (PermissionError, OSError):
            continue
        try:
            pairs = read_ldb(raw) if f.endswith('.ldb') else read_log(raw)
        except Exception:
            continue
        order += 1
        for key, value, seq, t in pairs:
            for name in KEYS:
                if key.endswith(b'\x01' + name.encode()):
                    cur = latest.get(name)
                    if cur is None or (order, seq) >= (cur[0], cur[1]):
                        latest[name] = (order, seq, value if t == 1 else None)
    found = {}
    for name, (_, _, value) in latest.items():
        if value is None:
            continue
        try:
            found[name] = json.loads(decode_value(value))
        except Exception:
            pass
    return found


def redact(obj):
    return WEBHOOK_RE.sub('<webhook redigido>', json.dumps(obj, ensure_ascii=False))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--panel', type=int, help='número do painel (1..4); padrão: todos')
    ap.add_argument('--kinds', help='kinds do log separados por vírgula (ex.: nivel,troca,rota)')
    ap.add_argument('--no-cfg', action='store_true', help='não imprimir a config')
    ap.add_argument('--cfg-only', action='store_true', help='imprimir só a config')
    ap.add_argument('--raw', action='store_true', help='listar todas as chaves do localStorage (debug)')
    ap.add_argument('--width', type=int, default=400, help='corte de cada linha do log (0 = sem corte)')
    args = ap.parse_args()
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

    kinds = set(k.strip() for k in args.kinds.split(',')) if args.kinds else None
    parts = sorted(glob.glob(os.path.join(BASE, 'conta*')))
    if args.panel:
        parts = [p for p in parts if p.endswith(f'conta{args.panel}')]
    if not parts:
        print('Nenhuma partição encontrada em', BASE)
        return 1

    for part in parts:
        print('=====', os.path.basename(part))
        if args.raw:
            d = os.path.join(part, 'Local Storage', 'leveldb')
            for f in sorted(glob.glob(os.path.join(d, '*.ldb')) + glob.glob(os.path.join(d, '*.log')), key=file_number):
                try:
                    raw = open(f, 'rb').read()
                    pairs = read_ldb(raw) if f.endswith('.ldb') else read_log(raw)
                except Exception as e:
                    print(' ', os.path.basename(f), 'erro:', e); continue
                for key, value, seq, t in pairs:
                    print(' ', os.path.basename(f), seq, 'del' if t == 0 else 'put', key[:80], len(value))
            continue
        found = read_panel(part)
        cfg = found.get('pgDiscordNotifyCfg')
        if cfg and not args.no_cfg:
            red = {k: (('<webhook redigido>' if v else '') if k.startswith('webhook') else v) for k, v in cfg.items()}
            print('CFG:', json.dumps(red, ensure_ascii=False))
        if args.cfg_only:
            continue
        for e in found.get('pgDiscordNotifyLog') or []:
            if kinds and e.get('kind') not in kinds:
                continue
            line = redact(e)
            print(line[:args.width] if args.width else line)
    return 0


if __name__ == '__main__':
    sys.exit(main())
