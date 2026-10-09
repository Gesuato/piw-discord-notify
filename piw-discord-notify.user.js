// ==UserScript==
// @name         PIW Discord Capture Notify
// @namespace    piw-discord-notify
// @version      3.29.0
// @author       Gesuato
// @description  Notifica um webhook do Discord quando você captura um Pokémon (todos, uma lista ou shinys) no Poke Idle World. Feito para o injetor de scripts do PokeGrid.
// @match        https://poke.idleworld.online/play
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const TAG = '[PIW-DiscordNotify]';
    const VERSION = '3.29.0';        // manter igual ao @version do cabeçalho
    const LS_KEY = 'pgDiscordNotifyCfg';

    // ---- Configuração (persistida no localStorage do painel) --------
    // Clique no botão 🔔 no canto inferior esquerdo do jogo para
    // configurar webhook, lista de Pokémon, shiny etc.

    const DEFAULTS = {
        webhookUrl: '',         // canal principal (capturas); os outros caem nele se vazios
        webhookShiny: '',       // canal só para capturas shiny (opcional)
        webhookAlerts: '',      // canal para alertas: shiny na fila, estoque, quedas... (opcional)
        webhookLevel: '',       // canal para alertas de nível (vazio: alertas; vazio: principal)
        watchList: [],          // nomes em minúsculas, ex.: ['dratini', 'larvitar']
        notifyEveryCapture: false,
        notifyShiny: true,
        lockNotified: false,    // travar (🔒) no jogo o Pokémon que passou nos filtros (fica fora da venda na loja)
        familyNotified: false,  // mandar o Pokémon avisado para o depósito da família (family-action)
        minTier: '',            // raridade mínima ('' = sem filtro): weak, common, ... divine
        minIv: 0,               // poder mínimo (ivTotal 0..192); 0 = sem filtro
        minTierIv: 0,           // poder mínimo exigido TAMBÉM de quem passa pela raridade; 0 = qualquer poder
        ballsMin: 0,            // alerta quando a bola monitorada ficar abaixo disto; 0 = desligado
        ballsWatch: 'auto',     // 'auto' = bola do último catch-result, ou o id da bola ('4')
        autoBuy: false,         // comprar a bola monitorada quando ficar abaixo do limite
        autoBuyQty: 100,        // quantas comprar por vez (1..10000)
        healBuy: false,         // v3.21.0 refil de poção: comprar na viagem à cidade quando ficar abaixo de healMin
        healItemId: 201,        // poção comprada (200 Small, 201 Great, 202 Ultra, 203 Hyper, 204 Ultimate)
        healMin: 50,            // limite; 0 = compra só quando acabar
        healQty: 200,           // quantas comprar por vez (1..10000)
        reviveBuy: false,       // v3.21.0 refil de revive, mesmo esquema
        reviveItemId: 205,      // 205 Revive, 206 Max Revive
        reviveMin: 10,
        reviveQty: 50,
        healJoyEnabled: false,  // v3.22.0 time caiu (líder desmaiado / mandado para a cidade): curar na Nurse Joy e voltar para a hunt
        cityIdleEnabled: true,  // v3.23.0 conta parada fora de hunt há cityIdleMin minutos (bugada): cura na Joy e volta para a hunt
        cityIdleMin: 10,
        sellEnabled: false,     // vender drops marcados da hunt atual periodicamente
        sellEveryMin: 10,       // intervalo mínimo da venda automática (minutos)
        sellEveryMaxMin: 0,     // intervalo máximo; 0 ou <= mínimo = intervalo fixo. Entre os dois é sorteado
        sellItems: {},          // lista BRANCA: itemId -> { keep: N } (manter pelo menos N)
        sellProfiles: {},       // por hunt: slug -> { items, everyMin, everyMaxMin } (carregado ao entrar)
        pokeSellEnabled: false, // vender Pokémon fora do time pelas regras abaixo (v3.11.0)
        pokeSellLimits: {},     // v3.12.0: raridade (chave: weak..divine) -> vende se poder (ivTotal) < limite; ausente/0 = não vende
        pokeSellEveryMin: 10,   // v3.13.0: intervalo mínimo entre vendas de Pokémon (minutos)
        pokeSellEveryMaxMin: 15, // intervalo máximo; 0 ou <= mínimo = fixo. Entre os dois é sorteado a cada ciclo
        boxAlertAt: 200,        // v3.28.0: box (Pokémon na conta, estimado) acima disso = alerta + viagem de venda; 0 = desligado
        levelAlertAt: 0,        // avisar quando o líder chegar a este nível; 0 = desligado
        levelSwap: false,       // ao atingir, trocar o líder pelo próximo do time abaixo do nível
        routeEnabled: false,    // seguir a rota de treino (etapas hunt + nível); implica levelSwap
        route: [],              // [{ slug, level }] em ordem
        routeStage: 0,          // índice da etapa atual (persistido; >= route.length = concluída)
        routes: {},             // rotas salvas: nome -> { route, stage } (v3.9.0). route/routeStage acima = a ATIVA
        routeName: '',          // nome da rota ativa ('' = nenhuma salva ainda)
        catchRouteEnabled: false, // Rota de captura (aba Profissão): capturar todas as espécies, hunt por hunt, por nível
        catchRouteAreas: ['kanto'], // áreas do mapa incluídas: kanto, orre, outland, nightmare
        catchRouteMaxLevel: 0,  // só hunts até este nível; 0 = todas
        catchRouteAuto: false,  // jogar a bola sozinho quando a espécie da vez entrar na fila (`catch`)
        catchRouteBall: 'auto', // bola do `catch` automático: 'auto' = última usada, ou o id da bola
        catchRouteSkipped: [],  // slugs pulados no painel
        catchRouteDone: [],     // speciesIds capturados por esta rota (soma à Pokédex até ela atualizar)
        dailyEnabled: false,    // Daily Kill: ao bater a meta da missão do dia, voltar para a hunt de antes
        dailyClaim: true,       // ...e resgatar a recompensa sozinho (POST /api/game/daily-kill/claim)
        dailyReturnSlug: '',    // hunt fixa para voltar; vazio = etapa da rota, senão a hunt anterior à daily
        dailyAuto: false,       // v3.16.0: fazer a daily sozinho (escolhe missão e Pokémon do time, vai e volta)
        giftEnabled: false,     // v3.24.0 Daily Gift: resgatar o presente do dia (calendário de 28 dias) sozinho
        giftCenterMode: 'daily', // ...e no Gift Center (correio): 'daily' = entregar só o do dia | 'all' = tudo que aparecer | '' = não mexer
        evolveEnabled: false,   // v3.25.0 Evolução: quem do time chega ao nível vai à cidade (Cerulean) e evolui com as pedras da mochila
        slotEnabled: false,     // v3.26.0 Poke Slot Machine: na viagem à cidade (shopping) gira o roll grátis e ativa o bônus
        slotWanted: '',         // ...Pokémon pedidos, em ordem de preferência (vírgula); nenhum sorteado = escolhe um qualquer
        breedEnabled: false,    // v3.29.0 Breeding (aba 🥚): cruzar quem sobe com comida mais fraca (Grátis), chocar e repetir
        breedLines: [],         // ...até 2 linhagens: [{ id, name, speciesId, gen, q0, iv0, lastQ, lastIv, eggId, pendingChild } | null]
        breedFoodIvMax: 150,    // ...comida só com IV abaixo disto (além de quality e IV menores que quem sobe); 0 = sem teto
        breedFamily: true,      // ...comida e stones também do depot da família (retirada na viagem à cidade)
        breedDouble: true,      // ...dobrar stones (40 em vez de 20): 5% de +1 IV no filho
        clanEnabled: false,     // v3.17.0 Clã (aba Profissão): acompanhar a tarefa de rank, guardar os itens base, converter na viagem
        clanKey: 'orebound',    // clã em que o script entra sozinho se a conta não tiver nenhum (1ª entrada é grátis)
        clanRankup: true,       // ...subir de rank sozinho quando a tarefa fechar (na viagem à cidade)
        clanRoute: false,       // ...ir sozinho para a hunt que mais adianta a tarefa (e jogar bola na espécie pedida)
        depositItems: '',       // v3.18.0 Guardar na cidade: drops que sobraram -> '' (mochila) | 'depot' | 'family'
        depositPokes: '',       // ...Pokémon fora do time que a venda não vende -> '' (box) | 'family'
        depositPokesRare: false, // ...incluir shiny no depósito da família (🔒 nunca: o jogo recusa)
        depositFamilyList: [],  // v3.19.0 itens escolhidos que SEMPRE vão para a família na viagem: [{ id, name, keep }]
        tripCity: 'cerulean',   // v3.14.0: cidade da viagem de venda/compra (regra do jogo: nada de venda/compra na hunt)
        tripMinGapMin: 3,       // intervalo mínimo entre duas viagens à cidade (minutos; só para viagens urgentes, ex.: bola zerada)
        tripEveryMin: 10,       // v3.15.0: relógio ÚNICO das viagens (vendas de itens e Pokémon, compras): mínimo em minutos
        tripEveryMaxMin: 15,    // máximo; 0 ou <= mínimo = fixo. Sorteado a cada ciclo. Substitui sellEveryMin/pokeSellEveryMin
        reloadEnabled: false,   // recarregar este painel sozinho (igual ao "⟳ Atualizar tudo" do PokeGrid)
        reloadEveryMin: 60,     // intervalo mínimo da recarga (minutos)
        reloadEveryMaxMin: 0,   // intervalo máximo; 0 ou <= mínimo = fixo. Entre os dois é sorteado
        mentionUserId: '',      // seu ID de usuário do Discord, opcional
        cooldownSeconds: 0,     // intervalo mínimo (s) entre avisos do mesmo pokémon; 0 = avisar todas
        cfgVersion: 2,
        debug: false,
    };

    function loadCfg() {
        let saved = {};
        try { saved = JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {}; } catch { saved = {}; }
        // Até a v2.1.0 o cooldown era fixo em 30s e não aparecia no painel; ao migrar,
        // descarta esse valor herdado para valer o novo padrão (0 = avisar todas).
        if (!saved.cfgVersion || saved.cfgVersion < 2) delete saved.cooldownSeconds;
        delete saved.autoBuyGoldReserve; // reserva de gold removida na v3.5.0 (a pedido do usuário)
        return migrateCfg(Object.assign({}, DEFAULTS, saved));
    }
    // Rotas nomeadas (v3.9.0): cfg.route/routeStage são a rota ATIVA e cfg.routes[nome] guarda cada rota com a
    // etapa em que parou (mesmo padrão de sellItems/sellProfiles). Config antiga (só `route`) vira "Rota 1".
    function migrateCfg(cfg) {
        // v3.15.0: os intervalos separados de venda de itens e de Pokémon viram o relógio único da viagem.
        if (cfg.tripEveryMin == null) {
            cfg.tripEveryMin = Math.max(1, Number(cfg.sellEveryMin) || 10);
            cfg.tripEveryMaxMin = Math.max(0, Number(cfg.sellEveryMaxMin) || 15);
        }
        delete cfg.sellEveryMin; delete cfg.sellEveryMaxMin; delete cfg.pokeSellEveryMin; delete cfg.pokeSellEveryMaxMin;
        // Venda de Pokémon (v3.11.x): duas faixas (pokeSellTier/pokeSellIvLow/pokeSellIvHigh) viram um limite por raridade.
        if (!cfg.pokeSellLimits || typeof cfg.pokeSellLimits !== 'object' || Array.isArray(cfg.pokeSellLimits)) cfg.pokeSellLimits = {};
        if ('pokeSellIvLow' in cfg || 'pokeSellIvHigh' in cfg || 'pokeSellTier' in cfg) {
            const ordem = ['weak', 'common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'ancient', 'divine']; // TIERS ainda não existe aqui (TDZ)
            const corte = Math.max(0, ordem.indexOf(String(cfg.pokeSellTier || 'legendary').toLowerCase()));
            const low = Number(cfg.pokeSellIvLow) || 0, high = Number(cfg.pokeSellIvHigh) || 0;
            if (!Object.keys(cfg.pokeSellLimits).length && (low || high)) {
                ordem.forEach((k, i) => { const v = i >= corte ? high : low; if (v > 0) cfg.pokeSellLimits[k] = v; });
            }
            delete cfg.pokeSellTier; delete cfg.pokeSellIvLow; delete cfg.pokeSellIvHigh;
        }
        if (!cfg.routes || typeof cfg.routes !== 'object' || Array.isArray(cfg.routes)) cfg.routes = {};
        const ativa = Array.isArray(cfg.route) ? cfg.route : [];
        if (!cfg.routeName && ativa.length) {
            let nome = 'Rota 1', i = 1;
            while (cfg.routes[nome]) nome = `Rota ${++i}`;
            cfg.routeName = nome;
        }
        if (cfg.routeName && !cfg.routes[cfg.routeName]) cfg.routes[cfg.routeName] = { route: ativa, stage: Number(cfg.routeStage) || 0 };
        return cfg;
    }
    function saveCfg(cfg) {
        // espelha a rota ativa (com a etapa) na rota nomeada, para a troca pelo menu não perder progresso
        if (cfg.routeName) {
            if (!cfg.routes || typeof cfg.routes !== 'object') cfg.routes = {};
            cfg.routes[cfg.routeName] = { route: Array.isArray(cfg.route) ? cfg.route : [], stage: Number(cfg.routeStage) || 0 };
        }
        localStorage.setItem(LS_KEY, JSON.stringify(cfg));
    }
    let cfg = loadCfg();

    const lastNotifyAt = new Map(); // nome -> timestamp

    // ---- Utilidades -------------------------------------------------

    function normalize(name) {
        return String(name || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '')
            .trim();
    }

    // Nome de Pokémon/hunt -> slug de hunt do jogo (minúsculas, sem acento, `_` no lugar de espaço/ponto).
    function huntSlugFromName(name) { return normalize(name).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''); }

    function playerName() {
        // mesmo caminho que o PokeGrid usa para nomear as abas
        try { return (window.__poke?.api?.['/api/characters/me']?.character?.name || '').trim(); }
        catch { return ''; }
    }

    // ---- Formato das mensagens do jogo (confirmado) ------------------
    //
    //   pending      -> { type:'pending', list:[{ id, pokeId, name, level, shiny, at }] }
    //                   fila de Pokémon capturáveis; chega a cada abate.
    //   catch-result -> { type:'catch-result', success, speciesName, shiny, ballName,
    //                     pendingId?, auto? }   (auto:true = autocatch VIP)
    //
    // O catch-result NÃO traz o nível; por isso guardamos a última fila
    // `pending` e cruzamos pelo pendingId (ou pelo nome) para completar.

    const pendingById = new Map();   // pendingId -> { name, level, shiny }
    const pendingByName = new Map(); // nome normalizado -> { name, level, shiny }

    function rememberPending(list) {
        pendingById.clear();
        pendingByName.clear();
        for (const p of list) {
            if (!p || typeof p !== 'object') continue;
            const entry = { name: p.name, level: p.level ?? null, shiny: Boolean(p.shiny) };
            if (p.id != null) pendingById.set(String(p.id), entry);
            if (p.name) pendingByName.set(normalize(p.name), entry);
        }
    }

    function extractPokemonInfo(message) {
        const name = message.speciesName || message.name || message.pokemon?.name || message.poke?.name;
        if (!name || typeof name !== 'string') return null;
        const fromPending =
            (message.pendingId != null && pendingById.get(String(message.pendingId))) ||
            pendingByName.get(normalize(name)) || null;
        return {
            name,
            shiny: Boolean(message.shiny || fromPending?.shiny),
            level: message.level ?? fromPending?.level ?? null,
            ball: message.ballName || null,
            auto: message.auto === true,
        };
    }

    // ---- IV e qualidade do indivíduo capturado -----------------------
    //
    // O catch-result não traz IV/qualidade. Logo após a captura o jogo manda
    // `poke-delta` com o indivíduo completo (confirmado em 23/09/2026):
    //   { type:'poke-delta', poke:{ id, speciesId, name, level, shiny, xp:0,
    //     ivTotal (0..192), quality, power, stats{...}, type1, type2, ... } }
    // Estratégia: ao capturar, esperamos até DETAILS_TIMEOUT_MS pelo
    // poke-delta (normalmente chega no mesmo segundo). Plano B (v3.24.1): se
    // em DETAILS_POKES_MS o delta não veio (jogo lento: em 02/10/2026 ele chegou
    // 5–8 s depois do catch-result e o aviso saía sem poder/qualidade), ou se veio
    // sem ivTotal/quality, pedimos `pokes-get` e procuramos o recém-capturado na
    // lista `pokes` — só quando a escolha é inequívoca (um único indivíduo novo da
    // espécie com xp 0), para nunca atribuir o IV de outro exemplar. Se nada chegar
    // a tempo e há filtro de qualidade, a captura NÃO é avisada (v3.24.6); sem
    // filtro nenhum, sai sem os campos e o embed diz isso.
    // v3.24.4: o jogo também manda o poke-delta ANTES do catch-result (mesmo
    // milissegundo; visto em 02/10/2026 16:50Z). Delta novo (xp 0) sem captura
    // esperando fica em `pendingDeltas` por DETAILS_PRE_MS e a captura que chegar
    // logo depois o pega na hora. Não existe mais "órfã" (delta depois do timeout
    // ia para a captura encerrada): nesse cenário ela roubava o delta da captura
    // seguinte e encadeava timeouts.
    // v3.24.5: às vezes o delta de UMA captura simplesmente não vem (17:34:11Z do
    // mesmo dia). Com a fila em FIFO, cada delta seguinte ia para a captura mais
    // antiga (a errada) e o último da corrente estourava. Agora o par é pelo tempo:
    // o delta vai para a captura mais NOVA que chegou há menos de DETAILS_PAIR_MS
    // (o delta normal chega até ~10 ms depois do catch-result); só sem captura
    // recente é que ele é tratado como atrasado e vai para a mais antiga.
    //
    // Tabela oficial de faixas (poke.idleworld.online/pokepedia/systems/quality):
    //   <1.0 Weak · 1.0 Common · 1.1 Uncommon · 1.3 Rare · 1.5 Epic
    //   1.7 Legendary · 2.0 Mythic · 3.0 Ancient · 4.0 Divine

    const IV_MAX = 192; // 32 por atributo, 6 atributos
    const DETAILS_TIMEOUT_MS = 20000;   // espera total pelo poke-delta / pokes
    const DETAILS_POKES_MS = 4000;      // sem delta até aqui: pede pokes-get (plano B)
    const DETAILS_PRE_MS = 3000;        // delta que chegou ANTES do catch-result espera a captura por este tempo
    const DETAILS_PAIR_MS = 1500;       // delta é da captura mais nova se ela chegou há menos que isto; senão, da mais antiga
    // Do mais raro ao mais fraco; `rank` cresce com a raridade.
    const TIERS = [
        [4.0, 'Divine', 0xf1f5f9], [3.0, 'Ancient', 0xfb923c], [2.0, 'Mythic', 0xe879f9],
        [1.7, 'Legendary', 0xfbbf24], [1.5, 'Epic', 0xf472b6], [1.3, 'Rare', 0xa78bfa],
        [1.1, 'Uncommon', 0x38bdf8], [1.0, 'Common', 0x4ade80], [-Infinity, 'Weak', 0x9aa4b2],
    ].map(([min, name, color], i, arr) => ({ min, name, key: name.toLowerCase(), color, rank: arr.length - 1 - i }));
    const TIERS_ASC = [...TIERS].reverse(); // Weak .. Divine (ordem do <select>)

    function qualityTier(q) {
        if (typeof q !== 'number' || !Number.isFinite(q)) return null;
        return TIERS.find(t => q >= t.min);
    }
    function tierByKey(key) {
        return TIERS.find(t => t.key === String(key || '').toLowerCase()) || null;
    }

    // Filtro de raridade/poder (cfg.minTier / cfg.minTierIv / cfg.minIv). Regra:
    //   - nenhum configurado                                  -> passa tudo;
    //   - raridade >= mínima E poder >= minTierIv (0 = qualquer) -> passa (v3.4.1: antes bastava a raridade);
    //   - senão, poder (ivTotal) >= minIv                     -> passa;
    //   - sem dados de qualidade (timeout) com filtro ligado  -> NÃO passa (v3.24.6, pedido do usuário: "não quero
    //     notificação sem o IV"; antes passava para não perder um raro). Fica no log `decisao`.
    function passesQualityFilter(info) {
        const minTier = tierByKey(cfg.minTier);
        const minIv = Number(cfg.minIv) || 0;
        if (!minTier && minIv <= 0) return { ok: true, motivo: 'sem filtro de qualidade' };
        const tier = qualityTier(info.quality);
        if (tier == null && info.ivTotal == null) return { ok: false, motivo: 'sem dados de qualidade (o jogo não mandou o poder; não aviso)' };
        const tierIv = Number(cfg.minTierIv) || 0;
        if (minTier && tier && tier.rank >= minTier.rank) {
            if (tierIv <= 0 || info.ivTotal == null || info.ivTotal >= tierIv) return { ok: true, motivo: `raridade ${tier.name} >= ${minTier.name}${tierIv > 0 ? ` com poder ${info.ivTotal ?? '?'} >= ${tierIv}` : ''}` };
            // raridade ok mas poder abaixo do exigido para ela: ainda pode passar pelo poder geral (minIv)
        }
        if (minIv > 0 && info.ivTotal != null && info.ivTotal >= minIv) return { ok: true, motivo: `poder ${info.ivTotal} >= ${minIv}` };
        return { ok: false, motivo: `abaixo do mínimo (raridade ${tier ? tier.name : '?'}, poder ${info.ivTotal ?? '?'}${minTier && tier && tier.rank >= minTier.rank ? ` < ${tierIv} exigido para ${minTier.name}+` : ''})` };
    }

    let lastSocket = null;          // socket mais recente do jogo (para pokes-get)
    const awaitingDetails = [];     // capturas esperando poke-delta / pokes
    const pendingDeltas = [];       // [{ poke, at }] deltas novos (xp 0) que chegaram sem captura esperando
    const seenDeltaIds = new Set(); // ids de todo poke-delta visto na sessão (exclui exemplares antigos do plano B)
    let prevPokesIds = new Set();   // ids do frame `pokes` anterior (quem já estava lá não é o recém-capturado)
    let prevPokesAt = 0;

    function num(v) { return (typeof v === 'number' && Number.isFinite(v)) ? v : null; }

    function applyPokeDetails(entry, p) {
        if (!p || typeof p !== 'object') return false;
        const info = entry.info;
        if (num(p.ivTotal) != null) info.ivTotal = p.ivTotal;
        if (num(p.quality) != null) info.quality = p.quality;
        if (num(p.level) != null && info.level == null) info.level = p.level;
        if (p.id != null) { entry.pokeId = String(p.id); info.pokeId = entry.pokeId; }
        return info.ivTotal != null || info.quality != null;
    }

    function finishDetails(entry) {
        clearTimeout(entry.timer);
        clearTimeout(entry.pokesTimer);
        const i = awaitingDetails.indexOf(entry);
        if (i >= 0) awaitingDetails.splice(i, 1);
        entry.resolve(entry.info);
    }

    function sendGame(obj) {
        try {
            if (lastSocket && lastSocket.readyState === 1) {
                lastSocket.send(JSON.stringify(obj));
                return true;
            }
        } catch (err) { console.warn(TAG, 'Falha ao enviar ao jogo:', err); }
        return false;
    }

    function requestPokesOnce(entry, motivo) {
        if (entry.askedPokes) return;
        entry.askedPokes = true;
        logEvent('pokes-get', { name: entry.info.name, motivo, enviado: sendGame({ type: 'pokes-get' }) });
    }

    function prunePendingDeltas() {
        const now = Date.now();
        for (let i = pendingDeltas.length - 1; i >= 0; i--) if (now - pendingDeltas[i].at > DETAILS_PRE_MS) pendingDeltas.splice(i, 1);
        while (pendingDeltas.length > 20) pendingDeltas.shift();
    }
    // Delta que chegou antes do catch-result desta captura (o mais recente da espécie).
    function takePendingDelta(entry) {
        prunePendingDeltas();
        for (let i = pendingDeltas.length - 1; i >= 0; i--) {
            if (sameSpecies(entry, pendingDeltas[i].poke)) return pendingDeltas.splice(i, 1)[0];
        }
        return null;
    }

    // Devolve uma Promise com `info` completado (ou não) com ivTotal/quality.
    function withDetails(info) {
        return new Promise((resolve) => {
            const entry = { info, resolve, pokeId: null, askedPokes: false, timer: null, pokesTimer: null, at: Date.now() };
            const antes = takePendingDelta(entry);
            if (antes) {
                logEvent('poke-delta-antes', { name: info.name, antesMs: Date.now() - antes.at, ivTotal: antes.poke?.ivTotal ?? null, quality: antes.poke?.quality ?? null });
                if (applyPokeDetails(entry, antes.poke)) { resolve(info); return; }
            }
            entry.timer = setTimeout(() => {
                logEvent('detalhes-timeout', { name: info.name, esperaMs: DETAILS_TIMEOUT_MS, pediuPokes: entry.askedPokes });
                info.detailsTimeout = true;
                finishDetails(entry);
            }, DETAILS_TIMEOUT_MS);
            entry.pokesTimer = setTimeout(() => {
                if (awaitingDetails.includes(entry)) requestPokesOnce(entry, 'poke-delta não chegou em ' + DETAILS_POKES_MS + ' ms');
            }, DETAILS_POKES_MS);
            awaitingDetails.push(entry);
        });
    }

    function sameSpecies(entry, p) {
        const n = p?.name || p?.speciesName;
        return !n || normalize(n) === normalize(entry.info.name);
    }

    function handlePokeDelta(message) {
        const poke = message.poke || message;
        logEvent('poke-delta', message);
        noteRecentCapture(poke?.id);
        if (poke?.id != null) {
            if (seenDeltaIds.size > 5000) seenDeltaIds.clear();
            seenDeltaIds.add(String(poke.id));
        }
        // Só é "novo" (xp 0) quem acabou de ser capturado: delta do líder/time (xp alto) não entra na fila.
        if (num(poke?.xp) > 0) return;
        if (typeof boxNoteCapture === 'function') boxNoteCapture(poke);
        const same = awaitingDetails.filter(e => sameSpecies(e, poke));
        const pool = same.length ? same : awaitingDetails;
        let entry = null;
        for (let i = pool.length - 1; i >= 0; i--) if (Date.now() - pool[i].at <= DETAILS_PAIR_MS) { entry = pool[i]; break; }
        if (!entry) entry = pool[0] || null;   // nenhuma captura recente: delta atrasado, vai para a mais antiga
        if (!entry) {
            // Ninguém esperando: o catch-result ainda não chegou (ou o delta é de uma captura já encerrada). Guarda um pouco.
            prunePendingDeltas();
            pendingDeltas.push({ poke, at: Date.now() });
            return;
        }
        if (applyPokeDetails(entry, poke)) finishDetails(entry);
        else requestPokesOnce(entry, 'poke-delta sem ivTotal/quality');
    }

    // Plano B: casa o recém-capturado na lista `pokes`. Pelo id do delta quando há; senão, pelo único
    // indivíduo NOVO da espécie (xp 0, sem delta visto e ausente do frame `pokes` anterior à captura).
    // Ambíguo (0 ou 2+ candidatos) = segue esperando o delta até o timeout, nunca chuta.
    function handlePokesList(list) {
        const prev = prevPokesIds, prevAt = prevPokesAt;
        prevPokesIds = new Set(list.map(p => String(p?.id)));
        prevPokesAt = Date.now();
        if (!awaitingDetails.length) return;
        for (const entry of [...awaitingDetails]) {
            let match = entry.pokeId != null ? list.find(p => String(p?.id) === entry.pokeId) : null;
            let candidatos = match ? 1 : 0;
            if (!match) {
                const usePrev = prevAt > 0 && prevAt < entry.at;
                const novos = list.filter(p => p && p.name && sameSpecies(entry, p) && (p.xp === 0 || p.xp == null)
                    && !seenDeltaIds.has(String(p.id)) && !(usePrev && prev.has(String(p.id))));
                candidatos = novos.length;
                if (novos.length === 1) match = novos[0];
            }
            logEvent('pokes', { name: entry.info.name, total: list.length, candidatos, achou: match ? { id: match.id, ivTotal: match.ivTotal, quality: match.quality, level: match.level } : null });
            if (match && applyPokeDetails(entry, match)) finishDetails(entry);
        }
    }

    // ---- Alerta de nível do líder + troca automática de líder --------------
    //   pokes       -> { type:'pokes', list:[{ id, name, level, team, slot, leader, shiny, ... }] }
    //                  (resposta a pokes-get). Time = team:true ordenado por slot; líder = leader:true
    //                  (ou o 1º do time). Fonte: piwdex sessao.ts (case 'pokes').
    //   poke-xp     -> { type:'poke-xp', id, speciesId, xpGained, xp, level, leveledUp } a cada abate
    //                  (CONFIRMADO no log em 24/09/2026): `id` e `level` são do líder que ganhou o XP.
    //   field-kill  -> também traz `level` (líder) e `leveledUp` (piwdex).
    //   poke-summon -> { type:'poke-summon', pokeId } é o que o botão "⚔ summon" do painel de time do
    //                  próprio jogo envia (visto no bundle do cliente); o HUD bloqueia durante boss.
    //                  Confirmar com pokes-get ~500 ms depois (piwdex `trocarLider`).
    // Regra: poke-xp/field-kill só DISPARAM uma conferência (pokes-get); quem decide é o frame
    // `pokes` (nível do líder vindo da lista). Evita agir sobre um `level` mal interpretado.
    // Rota de treino (v3.3.0): cfg.route = [{ slug, level }]. Com routeEnabled, o alvo é o nível da etapa
    // atual (cfg.routeStage) e a troca de líder fica implícita. Quando TODOS do time estão no nível da
    // etapa, o script manda `leave-hunt`, depois `enter-hunt { slug }` + `pending-get` (como o piwdex
    // `cacar()` e o auto-reconnect) e avança a etapa (persistida). Entrada confirmada por `field`/
    // `field-init`; sem frame em 30 s tenta de novo uma vez e depois avisa.
    // Um alerta por líder (id) por nível alvo; o Set zera quando o alvo muda no Salvar. Quando um
    // Pokémon DEIXA de ser líder ele sai do Set: se voltar a ser líder (troca manual) acima do alvo,
    // avisa e troca de novo (v3.2.2). Quem quiser um líder acima do alvo desliga a troca.

    const POKES_POLL_MS = 5 * 60 * 1000;
    const POKES_AFTER_SOCKET_MS = 4000;
    const POKES_MIN_GAP_MS = 3000;
    const SWAP_CONFIRM_MS = 800;
    const SWAP_TIMEOUT_MS = 15000;
    const HUNT_ENTER_DELAY_MS = 600;
    const HUNT_CONFIRM_MS = 30000;

    let team = [];                  // [{ id, name, level, slot, leader, shiny }] ordenado por slot
    let teamSig = '';               // assinatura do último time logado (evita log repetido)
    let leaderLevelSeen = null;     // último nível do líder visto em poke-xp/field-kill
    let pokeXpLogged = 0;
    let lastPokesReqAt = 0;
    let pokesRequestTimer = null;
    const levelAlerted = new Set(); // ids de líderes já avisados para o alvo atual
    let swapPending = null;         // { fromId, toId, toName, at } aguardando confirmação no `pokes`
    let lastLeaderId = null;        // líder do último `pokes` (para rearmar quem deixou de ser líder)
    let lastFieldAt = 0;            // último frame field/field-init (prova de que a hunt está viva)
    let huntSwitch = null;          // { slug, at, tries, timer } troca de hunt aguardando confirmação
    let onTeamChange = null;        // callback do painel para redesenhar o time

    function routeList() { return Array.isArray(cfg.route) ? cfg.route.filter(r => r && r.slug && Number(r.level) > 0) : []; }
    function routeActive() { return Boolean(cfg.routeEnabled) && routeList().length > 0 && (Number(cfg.routeStage) || 0) < routeList().length; }
    function routeStep() { return routeActive() ? routeList()[Number(cfg.routeStage) || 0] : null; }
    function levelTarget() {
        const st = routeStep();
        if (st) return Math.max(0, Number(st.level) || 0);
        return Math.max(0, Number(cfg.levelAlertAt) || 0);
    }
    function levelEnabled() { return levelTarget() > 0; }
    function swapEnabled() { return Boolean(cfg.levelSwap) || routeActive(); }
    function routeStatus() {
        const lista = routeList();
        if (!lista.length) return 'Sem rota.';
        const i = Number(cfg.routeStage) || 0;
        const nome = cfg.routeName ? `"${cfg.routeName}" ` : '';
        if (i >= lista.length) return `Rota ${nome}concluída (${lista.length} etapas). "Reiniciar rota" para começar de novo.`;
        return `${cfg.routeEnabled ? 'Rota' : 'Rota desligada'} ${nome}· etapa ${i + 1}/${lista.length}: ${lista[i].slug} até lv ${lista[i].level}`;
    }

    // Rotas nomeadas (v3.9.0): cfg.routes[nome] = { route, stage }; cfg.route/routeStage/routeName = a ativa.
    // Trocar de rota é imediato (não passa pelo Salvar): guarda a etapa da anterior e a nova volta de onde parou.
    function routeNames() { return Object.keys(cfg.routes || {}); }
    function uniqueRouteName(base) {
        let n = base, i = 1;
        while (cfg.routes?.[n]) n = `${base} ${++i}`;
        return n;
    }
    function storeActiveRoute() {
        if (!cfg.routeName) return;
        if (!cfg.routes || typeof cfg.routes !== 'object') cfg.routes = {};
        cfg.routes[cfg.routeName] = { route: routeList(), stage: Number(cfg.routeStage) || 0 };
    }
    function activateRoute(name) {
        const r = cfg.routes?.[name];
        if (!r) return false;
        storeActiveRoute();
        cfg.routeName = name;
        cfg.route = (Array.isArray(r.route) ? r.route : []).map(x => ({ slug: x.slug, level: Number(x.level) || 0 }));
        cfg.routeStage = Math.max(0, Number(r.stage) || 0);
        levelAlerted.clear(); swapPending = null;
        saveCfg(cfg);
        logEvent('rota-ativa', { nome: name, etapa: cfg.routeStage + 1, etapas: routeList().length });
        lastPokesReqAt = 0; requestPokes(0);
        if (onTeamChange) { try { onTeamChange(); } catch { /* painel fechado */ } }
        return true;
    }
    function createRoute(name, route) {
        if (!cfg.routes || typeof cfg.routes !== 'object') cfg.routes = {};
        cfg.routes[name] = { route: Array.isArray(route) ? route : [], stage: 0 };
        return activateRoute(name);
    }
    function renameRoute(oldName, newName) {
        if (!cfg.routes?.[oldName] || cfg.routes[newName]) return false;
        cfg.routes[newName] = cfg.routes[oldName];
        delete cfg.routes[oldName];
        if (cfg.routeName === oldName) cfg.routeName = newName;
        saveCfg(cfg);
        return true;
    }
    // Exclui; se era a ativa, ativa a primeira que sobrar (ou fica sem rota e desliga "Seguir a rota").
    function deleteRoute(name) {
        if (!cfg.routes?.[name]) return false;
        delete cfg.routes[name];
        if (cfg.routeName === name) {
            cfg.routeName = '';
            const next = routeNames()[0];
            if (next) return activateRoute(next);
            cfg.route = []; cfg.routeStage = 0; cfg.routeEnabled = false;
            levelAlerted.clear(); swapPending = null;
        }
        saveCfg(cfg);
        return true;
    }

    // Algum módulo usa a lista `pokes`? (nível/rota, venda de Pokémon, rota de captura, daily sozinha, clã, Joy, evolução)
    function pokesListUsed() {
        return levelEnabled() || Boolean(cfg.pokeSellEnabled) || Boolean(cfg.catchRouteEnabled) || Boolean(cfg.dailyEnabled && cfg.dailyAuto)
            || Boolean(cfg.clanEnabled && cfg.clanRoute) || Boolean(cfg.healJoyEnabled) || Boolean(cfg.evolveEnabled) || Boolean(cfg.breedEnabled);
    }
    function requestPokes(delayMs) {
        if (!pokesListUsed()) return;
        clearTimeout(pokesRequestTimer);
        pokesRequestTimer = setTimeout(() => {
            pokesRequestTimer = null;
            if (Date.now() - lastPokesReqAt < POKES_MIN_GAP_MS) return;
            lastPokesReqAt = Date.now();
            sendGame({ type: 'pokes-get' });
        }, delayMs || 0);
    }

    function teamLeader() { return team.find(p => p.leader) || team[0] || null; }

    function teamLine() {
        const alvo = levelTarget();
        return team.map(p => `${p.leader ? '★ ' : ''}${p.shiny ? '✨' : ''}${p.name} lv ${p.level}${alvo && p.level >= alvo ? ' ✔' : ''}`).join('\n') || '(time vazio)';
    }

    // Sinal de nível vindo de poke-xp/field-kill: só dispara a conferência pelo `pokes`.
    function noteLeaderLevel(level, fonte, leveledUp, pokeId) {
        if (!Number.isFinite(level)) return;
        const antes = leaderLevelSeen;
        leaderLevelSeen = level;
        if (!levelEnabled()) return;
        const lider = teamLeader();
        if (pokeId && lider && lider.id && pokeId !== lider.id) { requestPokes(0); return; } // time desatualizado
        if (lider && lider.id && levelAlerted.has(lider.id)) return;
        if (level >= levelTarget() || leveledUp || (antes != null && level > antes)) requestPokes(0);
    }

    function updateTeam(list) {
        const novo = list
            .filter(p => p && typeof p === 'object' && p.team)
            .map(p => ({ id: String(p.id ?? ''), name: String(p.name || p.speciesName || '?'), level: Number(p.level) || 0, slot: Number(p.slot) || 0, leader: Boolean(p.leader), shiny: Boolean(p.shiny), speciesId: Number(p.speciesId) || 0, t1: String(p.type1 || '').toUpperCase(), t2: String(p.type2 || '').toUpperCase() }))
            .sort((a, b) => a.slot - b.slot);
        team = novo;
        const sig = novo.map(p => `${p.id}:${p.level}:${p.leader ? 1 : 0}`).join('|');
        if (sig !== teamSig) { teamSig = sig; logEvent('time', { time: novo.map(p => ({ name: p.name, level: p.level, slot: p.slot, leader: p.leader })) }); }
        if (onTeamChange) { try { onTeamChange(); } catch { /* painel fechado */ } }
        const liderId = teamLeader()?.id || null;
        if (lastLeaderId && liderId !== lastLeaderId) levelAlerted.delete(lastLeaderId); // deixou de ser líder: rearma
        lastLeaderId = liderId;
        checkSwapConfirm();
        checkLeaderLevel();
    }

    function checkSwapConfirm() {
        if (!swapPending) return;
        const lider = teamLeader();
        const who = playerName();
        if (lider && lider.id === swapPending.toId) {
            logEvent('troca-ok', { para: lider.name, level: lider.level });
            postWebhook('level', {
                content: `🔁 ${who ? `**${who}**` : 'Sua conta'}: agora o líder é **${lider.name}** (lv ${lider.level})`,
                username: 'Poke Idle World',
                embeds: [{ title: `Troca confirmada: ${lider.name}`, description: (who ? `Conta: ${who}\n` : '') + `Time:\n${teamLine()}\nEm ${new Date().toLocaleString('pt-BR')}`, color: 0x57f287 }],
            }, { evento: 'troca-ok', para: lider.id });
            swapPending = null;
        } else if (Date.now() - swapPending.at > SWAP_TIMEOUT_MS) {
            logEvent('troca-falhou', { para: swapPending.toName, liderAtual: lider?.name });
            postWebhook('level', {
                content: `⚠️ ${who ? `**${who}**` : 'Sua conta'}: a troca para **${swapPending.toName}** não confirmou (líder ainda é ${lider?.name || '?'})`,
                username: 'Poke Idle World',
                embeds: [{ title: 'Troca de líder não confirmada', description: (who ? `Conta: ${who}\n` : '') + 'O jogo não mudou o líder após poke-summon. Troque na mão e confira o log.', color: 0xed4245 }],
            }, { evento: 'troca-falhou' });
            swapPending = null;
        } else {
            requestPokes(SWAP_CONFIRM_MS); // ainda esperando: confere de novo
        }
    }

    function checkLeaderLevel() {
        if (!levelEnabled() || swapPending) return;
        if (typeof dailyHoldsLeader === 'function' && dailyHoldsLeader()) return; // daily sozinha escolheu o líder: treino espera ela acabar
        const alvo = levelTarget();
        const lider = teamLeader();
        if (!lider || !lider.id || lider.level < alvo || levelAlerted.has(lider.id)) return;
        levelAlerted.add(lider.id);
        const who = playerName();
        const mention = cfg.mentionUserId ? `<@${cfg.mentionUserId}> ` : '';
        const conta = who ? `Conta: ${who}\n` : '';
        const swap = swapEnabled();
        const proximo = swap ? team.find(p => p.id !== lider.id && p.level < alvo) || null : null;
        const faltam = team.filter(p => p.id !== lider.id && p.level < alvo).length;
        const etapa = routeStep();
        const proxEtapa = etapa ? routeList()[(Number(cfg.routeStage) || 0) + 1] || null : null;
        let acao;
        if (!swap) acao = faltam ? `Troca automática desligada; ${faltam} do time ainda abaixo de ${alvo}.` : 'Todos do time já estão no nível.';
        else if (proximo) acao = `Trocando o líder para **${proximo.name}** (lv ${proximo.level})...`;
        else if (etapa && proxEtapa) acao = `🏁 Etapa ${(Number(cfg.routeStage) || 0) + 1} concluída (${etapa.slug}, lv ${etapa.level}). Indo para **${proxEtapa.slug}** até lv ${proxEtapa.level}...`;
        else if (etapa) acao = `🏁 Rota concluída: todos do time no nível ${alvo} (última etapa: ${etapa.slug}).`;
        else acao = `🏁 Todos do time já estão no nível ${alvo}. Nada mais para trocar.`;
        logEvent('nivel', { lider: lider.name, level: lider.level, alvo, proximo: proximo?.name || null, swap, etapa: etapa ? (Number(cfg.routeStage) || 0) + 1 : null });
        postWebhook('level', {
            content: `${mention}🎯 ${who ? `**${who}**` : 'Sua conta'}: **${lider.name}** chegou ao nível **${lider.level}**${lider.level > alvo ? ` (alvo ${alvo})` : ''}`,
            username: 'Poke Idle World',
            embeds: [{
                title: `Nível ${alvo} atingido: ${lider.name}`,
                description: conta + acao + `\n\nTime:\n${teamLine()}\nEm ${new Date().toLocaleString('pt-BR')}`,
                color: proximo ? 0x5865f2 : 0x57f287,
            }],
        }, { evento: 'nivel', lider: lider.id, level: lider.level });
        if (proximo) {
            const enviado = sendGame({ type: 'poke-summon', pokeId: proximo.id });
            logEvent('troca', { de: lider.name, para: proximo.name, enviado });
            if (enviado) { swapPending = { fromId: lider.id, toId: proximo.id, toName: proximo.name, at: Date.now() }; requestPokes(SWAP_CONFIRM_MS); }
        } else if (etapa) {
            advanceRoute();
        }
    }

    // Todos do time no nível da etapa: avança (persistido) e troca de hunt se houver próxima etapa.
    function advanceRoute() {
        const lista = routeList();
        const i = Number(cfg.routeStage) || 0;
        const proxima = lista[i + 1] || null;
        cfg.routeStage = i + 1;
        saveCfg(cfg);
        levelAlerted.clear();
        swapPending = null;
        logEvent('rota', { etapaConcluida: i + 1, proxima: proxima ? proxima.slug : null });
        if (onTeamChange) { try { onTeamChange(); } catch { /* painel fechado */ } }
        if (proxima) switchHunt(proxima.slug, 1);
        else requestPokes(POKES_MIN_GAP_MS); // rota acabou: só atualiza o painel
    }

    // A TELA do jogo guarda a hunt escolhida na mão e a reafirma sozinha: quando o servidor manda `field-none` da
    // hunt antiga (acontece ao entrarmos em outra), o cliente religa a antiga; o mesmo em toda reconexão. Visto no
    // painel 3 (v3.13.5): a conta voltava para larvitar depois de cada troca da rota de captura. O cliente tem um
    // handler para o servidor mandá-lo seguir a hunt em que a conta está: `hunt-resume { slug, name }` → viaja no
    // mapa e reenvia `enter-hunt`. Injetamos essa mensagem no socket (evento `message` sintético, marcado com
    // `synthetic`) logo depois do nosso enter-hunt, e a tela passa a acompanhar o script.
    function nudgeClientToHunt(slug) {
        try {
            if (!lastSocket || typeof lastSocket.dispatchEvent !== 'function' || typeof MessageEvent !== 'function') return false;
            const h = Array.isArray(huntCatalog) ? huntCatalog.find(x => x.slug === slug) : null;
            const name = h?.name || slug.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            lastSocket.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ type: 'hunt-resume', slug, name, synthetic: true }) }));
            return true;
        } catch (err) { logEvent('hunt-tela-erro', { slug, erro: String(err?.message || err) }); return false; }
    }

    // origem: 'rota' (padrão), 'recarga' (volta para a hunt depois da recarga automática; a conta já está
    // na cidade, então não manda leave-hunt) ou 'daily' (volta depois da Daily Kill). Recarga e daily avisam
    // a falha no webhook de alertas; a rota, no de nível.
    function switchHunt(slug, tentativa, origem) {
        origem = origem || 'rota';
        if (huntSwitch?.timer) clearTimeout(huntSwitch.timer);
        if (origem !== 'recarga' && origem !== 'viagem' && origem !== 'cura' && origem !== 'cidade') sendGame({ type: 'leave-hunt' }); // recarga/viagem/cura/cidade: a conta já está na cidade
        huntSwitch = { slug, at: 0, tries: tentativa, timer: null, origem };
        huntSwitch.timer = setTimeout(() => {
            if (!huntSwitch || huntSwitch.slug !== slug) return;
            huntSwitch.at = Date.now();
            const ok = sendGame({ type: 'enter-hunt', slug }) && sendGame({ type: 'pending-get' });
            const tela = nudgeClientToHunt(slug);
            logEvent('hunt-troca', { slug, tentativa, origem, enviado: ok, tela });
            huntSwitch.timer = setTimeout(() => confirmHuntSwitch(slug), HUNT_CONFIRM_MS);
        }, HUNT_ENTER_DELAY_MS);
    }

    function confirmHuntSwitch(slug) {
        if (!huntSwitch || huntSwitch.slug !== slug) return;
        const who = playerName();
        if (lastFieldAt >= huntSwitch.at) {
            logEvent('hunt-ok', { slug });
            huntSwitch = null;
            requestPokes(0);
            return;
        }
        const origem = huntSwitch.origem || 'rota';
        if (huntSwitch.tries < 2) { switchHunt(slug, huntSwitch.tries + 1, origem); return; }
        logEvent('hunt-falhou', { slug, origem });
        huntSwitch = null;
        const t = {
            recarga: { verbo: 'voltar para a', quando: 'depois da recarga automática', titulo: `Recarga: volta para ${slug} não confirmou`, dica: 'A conta deve estar na cidade: entre na hunt na mão.' },
            cla: { verbo: 'entrar na', quando: 'rota do clã', titulo: `Clã: entrada em ${slug} não confirmou`, dica: 'Essa hunt foi pulada nesta sessão; a rota do clã segue para a próxima melhor.' },
            'daily-ida': { verbo: 'entrar na', quando: 'Daily Kill sozinha', titulo: `Daily Kill: entrada em ${slug} não confirmou`, dica: 'O script devolveu o líder e voltou para a hunt de antes; faça a daily na mão hoje (o nível da hunt pode ser alto demais).' },
            daily: { verbo: 'voltar para a', quando: 'depois da Daily Kill', titulo: `Daily Kill: volta para ${slug} não confirmou`, dica: 'Confira o nome da hunt em "Voltar para" (ou entre na hunt na mão).' },
            rota: { verbo: 'entrar na', quando: 'rota', titulo: `Rota: entrada em ${slug} não confirmou`, dica: 'Confira o nome da hunt (é o mesmo que aparece em "Hunt atual") e entre na mão; a rota continua da etapa atual.' },
            painel: { verbo: 'entrar na', quando: 'botão do painel', titulo: `Painel: entrada em ${slug} não confirmou`, dica: 'Confira o nome da hunt da etapa e entre na mão.' },
            captura: { verbo: 'entrar na', quando: 'rota de captura', titulo: `Rota de captura: entrada em ${slug} não confirmou`, dica: 'Essa hunt foi pulada nesta sessão; a rota segue para a próxima espécie.' },
            cura: { verbo: 'voltar para a', quando: 'depois da cura na Nurse Joy', titulo: `Cura: volta para ${slug} não confirmou`, dica: 'A conta está curada na cidade: entre na hunt na mão (se o time caiu de novo na entrada, a hunt pode estar forte demais).' },
            cidade: { verbo: 'voltar para a', quando: 'conta parada na cidade', titulo: `Parada na cidade: volta para ${slug} não confirmou`, dica: 'Tento de novo depois de outro período parado (no máximo 3x em 1 h); ou entre na hunt na mão.' },
            viagem: { verbo: 'voltar para a', quando: 'depois da viagem à cidade', titulo: `Viagem: volta para ${slug} não confirmou`, dica: 'A conta deve estar na cidade: entre na hunt na mão.' },
        }[origem] || { verbo: 'entrar na', quando: origem, titulo: `Entrada em ${slug} não confirmou`, dica: 'Entre na hunt na mão.' };
        postWebhook(origem === 'rota' ? 'level' : 'alert', {
            content: `⚠️ ${who ? `**${who}**` : 'Sua conta'}: não consegui ${t.verbo} hunt **${slug}** (${t.quando})`,
            username: 'Poke Idle World',
            embeds: [{
                title: t.titulo,
                description: (who ? `Conta: ${who}\n` : '') + `Nenhum frame de combate chegou em 30 s após duas tentativas. ${t.dica}`,
                color: 0xed4245,
            }],
        }, { evento: 'hunt-falhou', slug, origem });
        if (origem === 'captura') catchHuntFailed(slug);
        if (origem === 'daily-ida') dailyGoFailed(slug);
        if (origem === 'cla') clanHuntFailed(slug);
    }

    function handlePokeXp(message) {
        if (pokeXpLogged < 3) { pokeXpLogged++; logEvent('poke-xp', message); }
        noteLeaderLevel(Number(message.level), 'poke-xp', Boolean(message.leveledUp), message.id != null ? String(message.id) : null);
    }

    // ---- Alerta de estoque de bolas -------------------------------------
    //
    //   balls     -> { type:'balls', counts:{ '<ballId>': qty, ... } }   (resposta a balls-get)
    //                O jogo OMITE do frame as bolas zeradas (visto no painel 2 em 26/09/2026: a Ultra Ball sumiu
    //                de `counts` ao acabar, e a compra automática esperava `qty == null` como "não listada").
    //                Depois do 1º frame, bola ausente = 0.
    //   balls-get -> pedido do cliente. O jogo não garante mandar `balls` sozinho,
    //                então pedimos: ao rastrear o socket, logo após cada captura e
    //                a cada BALLS_POLL_MS.
    // Avisa UMA vez quando a quantidade cruza para baixo de cfg.ballsMin e rearma
    // quando volta a ficar >= (compra/refil). ballsMin = 0 desliga o alerta, MAS se a
    // compra automática estiver ligada o limite efetivo vira 1 (compra quando acabar):
    // antes da v3.1.1 essa combinação desligava tudo em silêncio e a conta ficava sem bola.

    const BALL_NAMES = { 1: 'Poke Ball', 2: 'Great Ball', 3: 'Super Ball', 4: 'Ultra Ball', 6: 'Idle Ball' };
    const BALLS_POLL_MS = 5 * 60 * 1000;
    const BALLS_AFTER_CATCH_MS = 1500;
    const BALLS_AFTER_SOCKET_MS = 3000;

    let lastBallId = null;          // bola usada no último catch-result
    let ballCounts = {};            // ballId -> qty (último frame `balls`); ausente = 0 depois do 1º frame
    let ballsReceived = false;      // já chegou algum frame `balls` nesta carga
    function ballQty(id) { return id == null ? null : (ballCounts[id] ?? (ballsReceived ? 0 : null)); }
    let lastBallsLogAt = 0;         // o frame chega a cada captura; logar todos afogava o log
    const ballAlerted = {};         // ballId -> true enquanto estiver abaixo do limite
    let ballsRequestTimer = null;
    let onBallsChange = null;       // callback do painel para redesenhar o estoque

    function ballName(id) { return BALL_NAMES[id] || `Ball ${id}`; }
    // Limite efetivo: o configurado, ou 1 quando só a compra automática está ligada.
    function effectiveBallsMin() {
        const min = Number(cfg.ballsMin) || 0;
        if (min > 0) return min;
        return cfg.autoBuy ? 1 : 0;
    }
    function ballsEnabled() { return effectiveBallsMin() > 0; }

    function watchedBallId() {
        if (cfg.ballsWatch && cfg.ballsWatch !== 'auto') return Number(cfg.ballsWatch) || null;
        return lastBallId;
    }

    function requestBalls(delayMs) {
        if (!ballsEnabled()) return;
        clearTimeout(ballsRequestTimer);
        ballsRequestTimer = setTimeout(() => {
            ballsRequestTimer = null;
            sendGame({ type: 'balls-get' });
        }, delayMs || 0);
    }

    function handleBalls(message) {
        const counts = {};
        for (const [rawId, rawQty] of Object.entries(message.counts || {})) {
            const id = Number(rawId);
            if (Number.isInteger(id) && id > 0) counts[id] = Math.max(0, Number(rawQty) || 0);
        }
        ballCounts = counts;
        ballsReceived = true;
        const id = watchedBallId();
        if (Date.now() - lastBallsLogAt > 60 * 1000) { lastBallsLogAt = Date.now(); logEvent('balls', { counts, monitorando: id, limite: effectiveBallsMin(), autoBuy: Boolean(cfg.autoBuy) }); } // 1x/min: o log tem 80 linhas
        checkBallStock();
        if (onBallsChange) { try { onBallsChange(); } catch { /* painel fechado */ } }
    }

    // ---- Compra automática (REST, mesma API que o jogo usa) --------------
    //   tokens : sessionStorage['pokeweb:tokens'] = { accessToken, refreshToken }
    //   loja   : GET  /api/game/shop      -> { gold, balls:[{ id, name, priceGold }], items:[...] }
    //   compra : POST /api/game/shop/buy  { ballId, qty } -> { ok?, bought, gold }
    //            itens da loja (poções, revives): { itemId, qty } no mesmo endpoint (bundle, 29/09/2026)
    //   401    : POST /api/auth/refresh   { refreshToken } -> tokens novos
    // Lotes de no máximo 1000 por request. Uma tentativa por episódio de estoque
    // baixo; rearma quando o estoque volta acima do limite (ou ao Salvar).
    // NUNCA logar os tokens.

    const GAME_TOKENS_KEY = 'pokeweb:tokens';
    const SHOP_URL = '/api/game/shop';
    const SHOP_BUY_URL = '/api/game/shop/buy';
    const AUTH_REFRESH_URL = '/api/auth/refresh';
    const BUY_MAX_QTY = 10000;
    const BUY_BATCH_QTY = 1000;

    const autoBuyAttempted = {};    // ballId -> true após tentar comprar neste episódio
    let autoBuyRunning = false;

    function getGameTokens() {
        try { return JSON.parse(sessionStorage.getItem(GAME_TOKENS_KEY) || 'null'); }
        catch { return null; }
    }

    async function refreshGameToken() {
        const tokens = getGameTokens();
        if (!tokens?.refreshToken) return null;
        const res = await fetch(AUTH_REFRESH_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken: tokens.refreshToken }),
        });
        if (!res.ok) return null;
        const novo = await res.json().catch(() => null);
        if (!novo?.accessToken) return null;
        try { sessionStorage.setItem(GAME_TOKENS_KEY, JSON.stringify(novo)); } catch { /* ignora */ }
        return novo.accessToken;
    }

    async function gameApi(url, options) {
        const opts = options || {};
        const send = (token) => fetch(url, Object.assign({}, opts, {
            headers: Object.assign(
                {},
                opts.body ? { 'Content-Type': 'application/json' } : {},
                token ? { Authorization: `Bearer ${token}` } : {},
                opts.headers || {},
            ),
        }));
        let res = await send(getGameTokens()?.accessToken);
        if (res.status === 401) {
            const token = await refreshGameToken();
            if (token) res = await send(token);
        }
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body?.message || `HTTP ${res.status}`);
        return body;
    }

    // Guarda de venda do PokeGrid (index.html, SELLGUARD): ele embrulha o `fetch` do painel e, num POST de venda
    // com shiny/qualidade Lendária+ (>= 1.7) ou item travado (Strange Pheromone, Rare Pokémon Picture e os da
    // engrenagem), abre um `window.confirm` nativo — que trava a página e fica esperando alguém clicar. Nas vendas
    // do script quem manda são as regras do painel (o usuário escolheu o limite por raridade e a lista de itens),
    // então a guarda é desligada SÓ durante a chamada, pelo interruptor oficial dela (`window.__pgSellGuardOn`),
    // e volta ao que era. Fora do PokeGrid (Tampermonkey) não existe guarda e nada muda.
    async function withoutPokeGridSellGuard(fn) {
        if (!window.__pgSellGuard) return fn();
        const antes = window.__pgSellGuardOn;
        window.__pgSellGuardOn = false;
        try { return await fn(); }
        finally { if (window.__pgSellGuardOn === false) window.__pgSellGuardOn = antes; }
    }

    // ---- Farejador de REST (Breeding Center) --------------------------
    // v3.28.1: para confirmar os endpoints do Breeding antes de implementar a feature (nada entra como fato sem aparecer no
    // log), o script embrulha o `fetch` da página e registra toda chamada que a TELA do jogo faz a /api/game/breeding:
    // método, URL (sem host), corpo enviado, status e resposta (cortada em 6000 caracteres). O cabeçalho Authorization
    // nunca é gravado. Encadeia com a guarda de venda do PokeGrid (ela também embrulha o fetch). Sai quando a feature
    // ficar pronta.
    const REST_SNIFF = /\/api\/game\/breeding/;
    (function installRestSniffer() {
        const orig = window.fetch;
        if (typeof orig !== 'function' || orig.__pgDnSniff) return;
        const wrapped = async function (input, init) {
            const url = typeof input === 'string' ? input : String((input && input.url) || '');
            const res = await orig.apply(this, arguments);
            if (!REST_SNIFF.test(url)) return res;
            try {
                const metodo = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
                let corpo = init && init.body;
                if (typeof corpo === 'string') { try { corpo = JSON.parse(corpo); } catch { /* texto puro */ } }
                const texto = await res.clone().text().catch(() => '');
                let resposta = texto;
                try { resposta = JSON.parse(texto); } catch { /* texto puro */ }
                const json = JSON.stringify(resposta) || '';
                logEvent('rest-breeding', { metodo, url: url.replace(/^https?:\/\/[^/]+/, ''), corpo: corpo ?? null, status: res.status,
                    resposta: json.length > 6000 ? json.slice(0, 6000) + '…' : resposta });
            } catch (e) { logEvent('rest-breeding-erro', { url, erro: String((e && e.message) || e) }); }
            return res;
        };
        wrapped.__pgDnSniff = true;
        window.fetch = wrapped;
    })();

    // Compra `qty` da bola `id`. Devolve { ok, bought, spent, gold, motivo }.
    function buyBalls(id, qty) { return buyFromShop('ball', id, qty); }

    // Compra na loja do Mark: kind 'ball' (lista `balls`, corpo { ballId }) ou 'item' (lista `items`, corpo { itemId },
    // poções e revives). Devolve { ok, bought, spent, gold, motivo, name }.
    async function buyFromShop(kind, id, qty) {
        const bola = kind === 'ball';
        const shop = await gameApi(SHOP_URL);
        const lista = bola ? shop?.balls : shop?.items;
        const product = (Array.isArray(lista) ? lista : []).find(b => Number(b?.id) === Number(id));
        const price = Number(product?.priceGold);
        let gold = Number(shop?.gold);
        if (!product || !Number.isFinite(price) || price <= 0) return { ok: false, bought: 0, spent: 0, gold, motivo: `${bola ? 'bola' : 'item'} não está à venda na loja` };
        if (!Number.isFinite(gold)) return { ok: false, bought: 0, spent: 0, gold: null, motivo: 'loja não informou o gold' };
        if (product.name && bola) BALL_NAMES[Number(id)] = product.name;

        let remaining = Math.min(BUY_MAX_QTY, Math.max(1, Math.floor(Number(qty) || 0)));
        let bought = 0, spent = 0, motivo = null;
        while (remaining > 0) {
            const batch = Math.min(BUY_BATCH_QTY, remaining);
            if (gold < price * batch) {
                motivo = `gold insuficiente (tem ${gold.toLocaleString('pt-BR')}, precisa ${(price * batch).toLocaleString('pt-BR')})`;
                break;
            }
            let r;
            try { r = await gameApi(SHOP_BUY_URL, { method: 'POST', body: JSON.stringify(bola ? { ballId: Number(id), qty: batch } : { itemId: Number(id), qty: batch }) }); }
            catch (err) { motivo = `erro na compra: ${err?.message || err}`; break; }
            const got = Math.max(0, Math.floor(Number(r?.bought) || 0));
            bought += Math.min(batch, got);
            spent += price * Math.min(batch, got);
            if (Number.isFinite(Number(r?.gold))) gold = Number(r.gold);
            if (r?.ok === false || got !== batch) { motivo = 'o jogo confirmou só parte do lote'; break; }
            remaining -= batch;
        }
        return { ok: remaining === 0, bought, spent, gold, motivo, name: product.name || null };
    }

    async function autoBuyBalls(id, qty, min) {
        if (autoBuyRunning) return;
        autoBuyRunning = true;
        const who = playerName();
        const mention = cfg.mentionUserId ? `<@${cfg.mentionUserId}> ` : '';
        const conta = who ? `Conta: ${who}\n` : '';
        let r;
        try { r = await buyBalls(id, cfg.autoBuyQty); }
        catch (err) { r = { ok: false, bought: 0, spent: 0, gold: null, motivo: `erro: ${err?.message || err}` }; }
        finally { autoBuyRunning = false; }
        logEvent('compra', { ballId: id, qtyAntes: qty, pedido: cfg.autoBuyQty, comprado: r.bought, gasto: r.spent, gold: r.gold, motivo: r.motivo });
        const goldTxt = r.gold != null ? `\nGold agora: ${Number(r.gold).toLocaleString('pt-BR')}` : '';
        if (r.bought > 0) {
            postWebhook('alert', {
                content: `${mention}🛒 ${who ? `**${who}**` : 'Sua conta'} comprou **${r.bought} ${ballName(id)}** (estava com ${qty})${r.ok ? '' : ' — compra parcial'}`,
                username: 'Poke Idle World',
                embeds: [{
                    title: `${r.ok ? 'Compra automática: ' : 'Compra parcial: '}${r.bought} ${ballName(id)}`,
                    description: conta + `Gasto: ${r.spent.toLocaleString('pt-BR')} gold` + goldTxt + (r.motivo ? `\nObs.: ${r.motivo}` : '') + `\nEm ${new Date().toLocaleString('pt-BR')}`,
                    color: r.ok ? 0x57f287 : 0xfee75c,
                }],
            }, { evento: 'compra', ballId: id, bought: r.bought });
        } else {
            postWebhook('alert', {
                content: `${mention}⚠️ ${who ? `**${who}**` : 'Sua conta'} está com pouca **${ballName(id)}** (${qty}) e a compra automática falhou`,
                username: 'Poke Idle World',
                embeds: [{
                    title: `Compra falhou: ${ballName(id)}`,
                    description: conta + `Restam ${qty} (limite ${min})\nMotivo: ${r.motivo || 'desconhecido'}` + goldTxt + `\nEm ${new Date().toLocaleString('pt-BR')}`,
                    color: 0xed4245,
                }],
            }, { evento: 'compra-falhou', ballId: id, qty });
        }
        requestBalls(1000); // confirma o estoque novo
        return { ok: r.bought > 0 && r.ok, motivo: r.motivo, bought: r.bought, gold: r.gold };
    }

    // ---- Refil de poções e revives (v3.21.0) ------------------------------
    //   mochila : `inv-get` (socket) -> `inventory { items:[{ itemId, quantity }] }` (o mesmo frame do módulo do clã).
    //             Item zerado não vem na lista: depois do 1º frame, ausente = 0 (como as bolas).
    //   na cidade: GET /api/game/depot -> { inventory:[{ id, quantity }] } (estoque exato antes de comprar)
    //   compra  : POST /api/game/shop/buy { itemId, qty } (buyFromShop('item', ...)); catálogo em /game/items.json,
    //             categorias `heal` (healAmount) e `revive` (revivePct).
    // Como a compra de bolas: abaixo do limite (0 = só quando acabar) pede viagem à cidade UMA vez por episódio
    // (rearma quando o estoque volta ao limite ou no Salvar) e, com a viagem saindo por outro motivo, vai de carona.
    // A regra do jogo proíbe comprar no Mark durante a hunt: a compra só acontece em supplyCityWork, na viagem.

    const SUPPLY_ITEMS = {
        heal: [
            { id: 200, name: 'Small Potion', info: 'cura 60 HP', price: 5 },
            { id: 201, name: 'Great Potion', info: 'cura 150 HP', price: 10 },
            { id: 202, name: 'Ultra Potion', info: 'cura 400 HP', price: 22 },
            { id: 203, name: 'Hyper Potion', info: 'cura 1.000 HP', price: 55 },
            { id: 204, name: 'Ultimate Potion', info: 'cura 3.000 HP', price: 135 },
        ],
        revive: [
            { id: 205, name: 'Revive', info: 'revive com 50% do HP', price: 40 },
            { id: 206, name: 'Max Revive', info: 'revive com 100% do HP', price: 350 },
        ],
    };
    const SUPPLY_KINDS = [
        { key: 'heal', label: 'Poção', icon: '🧪', buy: 'healBuy', id: 'healItemId', min: 'healMin', qty: 'healQty', def: 201 },
        { key: 'revive', label: 'Revive', icon: '💫', buy: 'reviveBuy', id: 'reviveItemId', min: 'reviveMin', qty: 'reviveQty', def: 205 },
    ];
    const SUPPLY_POLL_MS = 5 * 60 * 1000;
    const SUPPLY_AFTER_SOCKET_MS = 4000;
    const SUPPLY_BAG_URL = '/api/game/depot';

    const supplyBag = new Map();    // itemId -> quantidade na mochila (último frame `inventory`)
    let supplyBagReceived = false;
    let supplyBagAt = 0;
    const supplyAttempted = {};     // itemId -> true depois de pedir a viagem neste episódio
    let onSupplyChange = null;      // callback do painel

    function supplyItemName(id) {
        for (const k of Object.keys(SUPPLY_ITEMS)) { const it = SUPPLY_ITEMS[k].find(i => i.id === Number(id)); if (it) return it.name; }
        return `Item ${id}`;
    }
    // Refis ligados (d = cfg ou rascunho do painel): [{ key, label, icon, itemId, name, min, qty }]. Limite 0 vira 1.
    function supplySlots(d) {
        d = d || cfg;
        return SUPPLY_KINDS.filter(k => d[k.buy]).map(k => {
            const itemId = Number(d[k.id]) || k.def;
            return {
                key: k.key, label: k.label, icon: k.icon, itemId, name: supplyItemName(itemId),
                min: Math.max(1, Math.floor(Number(d[k.min]) || 0)),
                qty: Math.min(BUY_MAX_QTY, Math.max(1, Math.floor(Number(d[k.qty]) || 0) || 1)),
            };
        });
    }
    function supplyOn(d) { return supplySlots(d).length > 0; }
    function supplyQty(id) { return supplyBagReceived ? (supplyBag.get(Number(id)) || 0) : null; }
    // Refis abaixo do limite agora (com a mochila já lida).
    function supplyLow(d) {
        return supplySlots(d).map(s => Object.assign(s, { have: supplyQty(s.itemId) })).filter(s => s.have != null && s.have < s.min);
    }
    function supplyNotify() { if (onSupplyChange) { try { onSupplyChange(); } catch { /* painel fechado */ } } }
    function requestSupplies() { if (supplyOn()) sendGame({ type: 'inv-get' }); }

    function supplyOnInventory(items) {
        supplyBag.clear();
        for (const it of items) {
            const id = Number(it?.itemId ?? it?.id);
            if (id > 0) supplyBag.set(id, (supplyBag.get(id) || 0) + Math.max(0, Number(it.quantity) || 0));
        }
        supplyBagReceived = true;
        supplyBagAt = Date.now();
        checkSupplyStock();
        supplyNotify();
    }

    function checkSupplyStock() {
        const pedir = [];
        for (const s of supplySlots()) {
            const have = supplyQty(s.itemId);
            if (have == null) return;                                // mochila ainda não lida
            if (have >= s.min) { supplyAttempted[s.itemId] = false; continue; }
            if (supplyAttempted[s.itemId]) continue;                 // já pediu viagem neste episódio
            supplyAttempted[s.itemId] = true;
            pedir.push(`${s.name} com ${have}`);
        }
        if (pedir.length) tripRequest('suprimentos', null, pedir.join(', '));
    }

    // Tarefa da viagem (na cidade): confere a mochila pela REST e compra o que estiver abaixo do limite.
    async function supplyCityWork() {
        const slots = supplySlots();
        if (!slots.length) return { ok: true, motivo: 'refil desligado' };
        let mochila = null;
        try {
            const dep = await gameApi(SUPPLY_BAG_URL);
            if (Array.isArray(dep?.inventory)) {
                mochila = new Map();
                for (const it of dep.inventory) { const id = Number(it?.id ?? it?.itemId); if (id > 0) mochila.set(id, (mochila.get(id) || 0) + Math.max(0, Number(it.quantity) || 0)); }
            }
        } catch (err) { logEvent('refil-mochila-erro', { erro: String(err?.message || err) }); }
        const compras = [];
        for (const s of slots) {
            const have = mochila ? (mochila.get(s.itemId) || 0) : supplyQty(s.itemId);
            if (have == null || have >= s.min) continue;
            let r;
            try { r = await buyFromShop('item', s.itemId, s.qty); }
            catch (err) { r = { ok: false, bought: 0, spent: 0, gold: null, motivo: `erro: ${err?.message || err}` }; }
            compras.push({ key: s.key, itemId: s.itemId, name: r.name || s.name, have, min: s.min, pedido: s.qty, comprado: r.bought, gasto: r.spent, gold: r.gold, ok: r.ok, motivo: r.motivo });
        }
        logEvent('refil', { pelaRest: Boolean(mochila), compras });
        if (!compras.length) return { ok: true, motivo: 'estoque ok' };
        const who = playerName();
        const mention = cfg.mentionUserId ? `<@${cfg.mentionUserId}> ` : '';
        const tudo = compras.every(c => c.ok);
        const algum = compras.some(c => c.comprado > 0);
        const gold = [...compras].reverse().find(c => c.gold != null)?.gold;
        const linhas = compras.map(c => c.comprado > 0
            ? `${c.name}: +${c.comprado} (tinha ${c.have}) · ${Number(c.gasto).toLocaleString('pt-BR')} gold${c.ok ? '' : ` · parcial: ${c.motivo}`}`
            : `${c.name}: falhou (tinha ${c.have}, limite ${c.min}) · ${c.motivo || 'motivo desconhecido'}`);
        postWebhook('alert', {
            content: `${mention}${algum ? '🧪' : '⚠️'} ${who ? `**${who}**` : 'Sua conta'} ${algum ? `repôs ${compras.filter(c => c.comprado > 0).map(c => `**${c.comprado} ${c.name}**`).join(' e ')}` : `está com pouca ${compras.map(c => `**${c.name}**`).join(' e ')} e a compra falhou`}`,
            username: 'Poke Idle World',
            embeds: [{
                title: tudo ? 'Refil de poções/revives' : algum ? 'Refil parcial de poções/revives' : 'Refil de poções/revives falhou',
                description: (who ? `Conta: ${who}\n` : '') + linhas.join('\n') + (gold != null ? `\nGold agora: ${Number(gold).toLocaleString('pt-BR')}` : '') + `\nEm ${new Date().toLocaleString('pt-BR')}`,
                color: tudo ? 0x57f287 : algum ? 0xfee75c : 0xed4245,
            }],
        }, { evento: algum ? 'refil' : 'refil-falhou', itens: compras.map(c => c.itemId) });
        setTimeout(() => sendGame({ type: 'inv-get' }), 1000); // confirma o estoque novo
        return { ok: tudo, motivo: tudo ? null : compras.filter(c => !c.ok).map(c => `${c.name}: ${c.motivo}`).join('; '), compras };
    }

    // ---- Venda automática de drops da hunt atual ------------------------
    //   catálogo : GET /game/items.json (público) -> { items:[{ id, name, category, npcPrice, rare }] }
    //   mochila  : GET /api/game/depot            -> { inventory:[{ id, name, quantity, npcPrice, category }] }
    //   cadeados : GET /api/game/item/lock        -> { locked:[itemId, ...] }  (o jogo recusa o lote inteiro
    //                                                 se um item travado entrar nele)
    //   venda    : POST /api/game/shop/sell { items:[{ itemId, qty }] } -> { ok, soldCount, goldGained, gold }
    //   hunt     : `enter-hunt { slug }` / `leave-hunt` enviados pelo cliente; `field-kill` traz
    //              loot:[{ itemId, name, qty }] — é daí que sai a lista "o que cai nesta hunt".
    // Regras fixas (não configuráveis): nunca preço 0 (o NPC não compra) e nunca item com cadeado
    // do jogo (o lote inteiro seria recusado). Todo o resto é lista BRANCA por item + reserva: o
    // usuário escolhe; itens de outra categoria, raros ou com nome sensível só ganham um aviso ⚠️
    // na lista (a pedido do usuário, v3.1.0 — antes ficavam com 🔒 e não podiam ser marcados).

    const ITEMS_CATALOG_URL = '/game/items.json';
    const DEPOT_URL = '/api/game/depot';
    const LOCK_URL = '/api/game/item/lock';
    const SHOP_SELL_URL = '/api/game/shop/sell';
    const SELL_CHECK_MS = 60 * 1000;
    const PROTECTED_NAME = /pherom|feromon|stone|pedra/i;

    let huntSlug = null;
    const huntLoot = new Map();     // itemId -> { name, qty } (acumulado na hunt atual)
    let itemsCatalog = null;        // Map id -> item do catálogo
    let sellRunning = false;
    let lastSellAt = 0;
    // Desde a v3.15.0 a venda de itens não tem relógio próprio: vai na viagem à cidade (relógio único, módulo "Viagem").
    let onHuntLootChange = null;    // callback do painel para redesenhar a lista

    function loadItemsCatalog() {
        if (itemsCatalog) return Promise.resolve(itemsCatalog);
        return fetch(ITEMS_CATALOG_URL).then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
            .then(data => {
                const list = Array.isArray(data) ? data : data?.items;
                itemsCatalog = new Map((Array.isArray(list) ? list : []).map(i => [Number(i.id), i]));
                return itemsCatalog;
            })
            .catch(err => { logEvent('catalogo-erro', { erro: String(err?.message || err) }); return new Map(); });
    }

    // Motivo pelo qual um item NÃO pode ser vendido de jeito nenhum, ou null se pode.
    function protectedReason(item) {
        if (!item) return null;                       // fora do catálogo: a mochila ainda traz npcPrice
        if (!(Number(item.npcPrice) > 0)) return 'NPC não compra';
        return null;
    }

    // Aviso (não bloqueia) para itens que merecem atenção antes de marcar para venda.
    function sellWarning(item) {
        if (!item) return 'fora do catálogo';
        if (item.category && item.category !== 'loot') return `categoria ${item.category}`;
        if (item.rare === true) return 'raro';
        if (PROTECTED_NAME.test(String(item.name || ''))) return 'pedra/feromônio';
        return null;
    }

    // Perfil por hunt: ao entrar numa hunt com perfil salvo, os itens marcados e a faixa de
    // tempo daquela hunt viram os ativos. Salvar/Vender agora gravam o perfil da hunt atual.
    function hasHuntProfile() { return Boolean(huntSlug && cfg.sellProfiles && cfg.sellProfiles[huntSlug]); }

    function loadHuntProfile() {
        if (!huntSlug) return;
        const prof = cfg.sellProfiles?.[huntSlug];
        if (!prof) { logEvent('perfil', { slug: huntSlug, salvo: false }); return; }
        cfg.sellItems = Object.assign({}, prof.items || {});   // (everyMin/everyMaxMin dos perfis antigos são ignorados desde a v3.15.0)
        saveCfg(cfg);
        logEvent('perfil', { slug: huntSlug, salvo: true, itens: Object.keys(cfg.sellItems).length });
    }

    function saveHuntProfile() {
        if (!huntSlug) return;
        if (!cfg.sellProfiles || typeof cfg.sellProfiles !== 'object') cfg.sellProfiles = {};
        cfg.sellProfiles[huntSlug] = { items: Object.assign({}, cfg.sellItems || {}) };
    }

    function setHunt(slug) {
        const novo = slug ? String(slug) : null;
        if (novo === huntSlug) return;
        huntSlug = novo;
        huntLoot.clear();
        noteHuntChange(novo);
        catchOnHuntChange(novo);
        idleOnHuntChange(novo);
        loadHuntProfile();
        logEvent('hunt', { slug: huntSlug });
        if (onHuntLootChange) onHuntLootChange();
    }

    function handleOutgoing(data) {
        if (typeof data !== 'string' || data[0] !== '{') return;
        let m;
        try { m = JSON.parse(data); } catch { return; }
        if (m?.type === 'enter-hunt') setHunt(m.slug);
        else if (m?.type === 'leave-hunt') { healOnLeave(); setHunt(null); }
        else if (m?.type === 'set-city') { tripOnSetCity(); healOnSetCity(); pokesOnSetCity(); armResume(RESUME_AFTER_CITY_MS); } // SPA na cidade: viagem chegou / hora de voltar pra hunt
    }

    function handleFieldKill(message) {
        if (!Array.isArray(message.loot)) return;
        let novo = false;
        for (const l of message.loot) {
            const id = Number(l?.itemId);
            if (!Number.isInteger(id) || id <= 0) continue;
            const cur = huntLoot.get(id);
            if (cur) cur.qty += Number(l.qty) || 0;
            else { huntLoot.set(id, { name: String(l.name || `Item ${id}`), qty: Number(l.qty) || 0 }); novo = true; }
        }
        if (novo) { loadItemsCatalog(); if (onHuntLootChange) onHuntLootChange(); }
    }

    // Vende o excedente dos itens marcados que caem na hunt atual. `manual` ignora sellEnabled.
    // `wantedIds`/`huntName` (v3.14.0): a viagem congela a lista na hunt, porque na cidade `huntSlug` é null e `huntLoot` zera.
    async function runSellCycle(manual, wantedIds, huntName) {
        if (sellRunning) return { ok: false, motivo: 'venda já em andamento' };
        if (!manual && !cfg.sellEnabled) return { ok: false, motivo: 'desligada' };
        const huntSlug = huntName || huntSlugAtual();
        const wanted = Array.isArray(wantedIds) ? wantedIds.map(Number) : sellWantedNow();
        if (!wanted.length) return { ok: false, motivo: huntSlug ? 'nenhum item marcado caiu nesta hunt' : 'fora de hunt' };
        sellRunning = true;
        lastSellAt = Date.now();
        const who = playerName();
        const conta = who ? `Conta: ${who}\n` : '';
        try {
            const catalog = await loadItemsCatalog();
            const depot = await gameApi(DEPOT_URL);
            const inventory = Array.isArray(depot?.inventory) ? depot.inventory : [];
            let locked = new Set();
            try { const lk = await gameApi(LOCK_URL); locked = new Set((Array.isArray(lk?.locked) ? lk.locked : []).map(Number)); }
            catch (err) { logEvent('cadeado-erro', { erro: String(err?.message || err) }); return { ok: false, motivo: 'não consegui ler os cadeados; venda cancelada por segurança' }; }

            const lote = [];
            for (const inv of inventory) {
                const id = Number(inv?.id);
                if (!wanted.includes(id)) continue;
                if (locked.has(id)) continue;
                const item = catalog.get(id) || inv;
                if (protectedReason(item)) continue;
                if (typeof clanKeepsItem === 'function' && clanKeepsItem(id)) continue;   // item base/de clã que a tarefa ainda pede
                const keep = Math.max(0, Number(cfg.sellItems[id]?.keep) || 0);
                const qty = Math.floor(Number(inv.quantity) || 0) - keep;
                if (qty <= 0) continue;
                lote.push({ itemId: id, qty, name: inv.name || item.name || `Item ${id}`, price: Number(inv.npcPrice ?? item.npcPrice) || 0 });
            }
            if (!lote.length) { logEvent('venda-nada', { hunt: huntSlug, marcados: wanted }); return { ok: false, motivo: 'nada acima da reserva para vender' }; }

            const r = await withoutPokeGridSellGuard(() => gameApi(SHOP_SELL_URL, { method: 'POST', body: JSON.stringify({ items: lote.map(({ itemId, qty }) => ({ itemId, qty })) }) }));
            const ok = r?.ok !== false;
            const ganho = Number.isFinite(Number(r?.goldGained)) ? Number(r.goldGained) : lote.reduce((a, i) => a + i.qty * i.price, 0);
            const gold = Number.isFinite(Number(r?.gold)) ? Number(r.gold) : null;
            const total = lote.reduce((a, i) => a + i.qty, 0);
            const lista = lote.map(i => `${i.qty}x ${i.name}`).join(', ');
            logEvent('venda', { hunt: huntSlug, itens: lote.map(i => ({ id: i.itemId, qty: i.qty })), ok, ganho, gold });
            postWebhook('alert', {
                content: `💰 ${who ? `**${who}**` : 'Sua conta'} vendeu **${total} ${total === 1 ? 'item' : 'itens'}** por **${ganho.toLocaleString('pt-BR')} gold**`,
                username: 'Poke Idle World',
                embeds: [{
                    title: `Venda automática${huntSlug ? ` (${huntSlug})` : ''}`,
                    description: conta + lista + (gold != null ? `\nGold agora: ${gold.toLocaleString('pt-BR')}` : '') + `\nEm ${new Date().toLocaleString('pt-BR')}`,
                    color: ok ? 0x57f287 : 0xfee75c,
                }],
            }, { evento: 'venda', total, ganho });
            return { ok, motivo: ok ? null : 'o jogo não confirmou a venda', total, ganho };
        } catch (err) {
            const motivo = String(err?.message || err);
            logEvent('venda-erro', { hunt: huntSlug, erro: motivo });
            postWebhook('alert', {
                content: `⚠️ ${who ? `**${who}**` : 'Sua conta'}: a venda automática falhou`,
                username: 'Poke Idle World',
                embeds: [{ title: 'Venda falhou', description: conta + `Motivo: ${motivo}\nEm ${new Date().toLocaleString('pt-BR')}`, color: 0xed4245 }],
            }, { evento: 'venda-falhou' });
            return { ok: false, motivo };
        } finally {
            sellRunning = false;
        }
    }

    function huntSlugAtual() { return huntSlug; }
    function sellWantedNow() { return Object.keys(cfg.sellItems || {}).map(Number).filter(id => huntLoot.has(id)); }

    function checkBallStock() {
        if (!ballsEnabled()) return;
        const id = watchedBallId();
        if (id == null) return;                 // ainda não sabemos qual bola o autocatch usa
        const qty = ballQty(id);
        if (qty == null) return;                // ainda não chegou nenhum frame `balls`
        const min = effectiveBallsMin();
        if (qty >= min) { ballAlerted[id] = false; autoBuyAttempted[id] = false; return; }
        if (cfg.autoBuy) {
            if (autoBuyAttempted[id]) return;   // uma tentativa por episódio
            autoBuyAttempted[id] = true;
            tripRequest('bolas', { id, qty, min }, `${ballName(id)} com ${qty}`);
            return;
        }
        if (ballAlerted[id]) return;            // já avisado; espera repor
        ballAlerted[id] = true;
        const who = playerName();
        const mention = cfg.mentionUserId ? `<@${cfg.mentionUserId}> ` : '';
        const acabou = qty === 0;
        postWebhook('alert', {
            content: `${mention}${acabou ? '🚫' : '⚠️'} ${who ? `**${who}**` : 'Sua conta'} ${acabou ? 'ficou SEM' : 'está com pouca'} **${ballName(id)}**${acabou ? '' : ` (${qty})`}`,
            username: 'Poke Idle World',
            embeds: [{
                title: `${acabou ? 'Acabou: ' : 'Estoque baixo: '}${ballName(id)}`,
                description: (who ? `Conta: ${who}\n` : '') + `Restam ${qty} (limite ${min})\nEm ${new Date().toLocaleString('pt-BR')}`,
                color: acabou ? 0xed4245 : 0xfee75c,
            }],
        }, { evento: 'bolas', ballId: id, qty });
    }

    // ---- Venda automática de Pokémon fora do time --------------------------
    //   lista  : frame `pokes` (resposta a pokes-get; também chega após capturas) -> list[{ id, name, level, team,
    //            leader, starter, shiny, locked, sellValue, ivTotal (0..192), quality }]. É a mesma lista que a aba
    //            "Pokémon" da loja do NPC usa, filtrada por !team && !starter && !shiny && sellValue > 0 && !locked.
    //   venda  : POST /api/game/pokemon/sell { pokeIds:[...] } -> { gold, goldGained, sold } (bundle, v3.6.0).
    // Regra (escolhida pelo usuário no mock docs/mockup-venda-pokemon.html, v3.12.0): UM limite de poder por
    // raridade em `pokeSellLimits[tier.key]`: vende se ivTotal < limite; raridade sem limite (vazio/0) não vende.
    // Nunca vende: no time/líder, inicial, shiny, com cadeado do jogo (o 🔒 de "guardar o avisado" entra aqui),
    // sem valor de venda, sem IV/qualidade na lista, ou capturado nos últimos POKE_SELL_RECENT_MS (dá tempo do
    // aviso/cadeado da captura acontecer antes). Desde a v3.15.0 não há relógio próprio: a venda vai na viagem à
    // cidade (relógio único do módulo "Viagem"); o frame `pokes` só atualiza a lista e a prévia do painel.

    const POKE_SELL_URL = '/api/game/pokemon/sell';
    const POKE_SELL_TICK_MS = 30 * 1000;
    const POKE_SELL_RECENT_MS = 2 * 60 * 1000;
    const POKE_SELL_REFRESH_MS = 5000;        // espera pela lista fresca (pokes-get) antes de vender (v3.24.7)
    const POKE_SELL_BATCH = 50;

    let lastPokesList = [];         // último frame `pokes` (para a prévia do painel e a venda)
    let lastPokesAt = 0;
    let pokesFrameSeq = 0;           // conta os frames `pokes` (dois no mesmo ms têm o mesmo lastPokesAt)
    let pokeSellRunning = false;
    let lastPokeSellAt = 0;         // última venda de Pokémon (só informativo; a recarga restaura)
    const recentCaptureIds = new Map();   // id -> quando chegou o poke-delta
    const pokeSellRejected = new Map();   // id -> motivo que o jogo deu ao recusar (não volta a entrar no lote nesta sessão)
    let pokesFieldsLogged = false;
    let onPokeSellChange = null;    // callback do painel

    // ---- Box (v3.28.0): o jogo CALA o frame `pokes` quando o box fica grande demais (conta4, 04/10/2026: centenas de
    // Phanpy sem vender; nem ao carregar, nem ao pokes-get na cidade, sem `error`; vendido na mão, voltou). Sem lista
    // nada vende e o box só cresce. Três defesas:
    //   1. estimativa do box = total do último frame + capturas vistas no poke-delta − vendidas; acima de `cfg.boxAlertAt`
    //      avisa (1x/h) e pede viagem de venda. `boxMaxSeen` = maior total que já chegou (o limite real do jogo é acima);
    //   2. 2 pedidos seguidos na cidade sem frame = alerta "lista não chega" (1x/h);
    //   3. plano B de venda: fila dos capturados com os dados do poke-delta (id, ivTotal, quality, shiny, sellValue,
    //      starter), persistida em localStorage (sobrevive ao reload). Sem lista fresca, vende quem passa nas MESMAS
    //      regras, nunca com menos de 2 min nem quem o script travou. Risco aceito: Pokémon posto no time à mão enquanto
    //      a lista está muda (o jogo recusa cadeado e anúncio; time não confirmado).
    const BOX_KEY = 'pgDiscordNotifyBox';
    const BOX_QUEUE_MAX = 3000;
    const BOX_ALERT_GAP_MS = 60 * 60 * 1000;
    const POKES_SILENT_ALERT_AT = 2;
    let boxKnown = null;            // { total, at } do último frame `pokes`
    let boxMaxSeen = 0;             // maior lista que já chegou nesta carga
    let boxCapturesSince = 0;       // capturas desde o último frame
    let boxSoldSince = 0;           // vendidas desde o último frame
    let boxAlertedAt = 0;
    let pokesSilentAsks = 0;        // pedidos seguidos (na cidade) sem frame
    let pokesSilentAlertedAt = 0;
    let captureQueue = loadBoxQueue();
    function loadBoxQueue() {
        try { const q = JSON.parse(localStorage.getItem(BOX_KEY) || '[]'); return Array.isArray(q) ? q.filter(p => p && p.id != null) : []; }
        catch { return []; }
    }
    function saveBoxQueue() {
        try {
            if (captureQueue.length > BOX_QUEUE_MAX) captureQueue = captureQueue.slice(-BOX_QUEUE_MAX);
            localStorage.setItem(BOX_KEY, JSON.stringify(captureQueue));
        } catch { /* sem localStorage */ }
    }
    function boxLimit(d) { return Math.max(0, Number((d || cfg).boxAlertAt) || 0); }
    function boxEstimate() {
        if (boxKnown) return Math.max(0, boxKnown.total + boxCapturesSince - boxSoldSince);
        return captureQueue.length || null;   // sem frame nesta carga: a fila é o mínimo que se sabe
    }
    // Captura nova (poke-delta com xp 0): conta na estimativa e entra na fila do plano B.
    function boxNoteCapture(poke) {
        if (!poke || poke.id == null) return;
        const id = String(poke.id);
        boxCapturesSince++;
        if (!captureQueue.some(p => String(p.id) === id)) {
            captureQueue.push({ id, speciesId: Number(poke.speciesId) || 0, name: poke.name || poke.speciesName || '?', level: Number(poke.level) || 1, shiny: Boolean(poke.shiny), starter: Boolean(poke.starter), sellValue: poke.sellValue ?? null, ivTotal: poke.ivTotal ?? null, quality: poke.quality ?? null, at: Date.now() });
            saveBoxQueue();
        }
        boxCheck();
    }
    function boxNoteLocked(id) { const p = captureQueue.find(x => String(x.id) === String(id)); if (p) { p.locked = true; saveBoxQueue(); } }
    // Frame `pokes` chegou: o box é o que o jogo diz; na fila só fica quem o frame mostra como vendável (o resto o frame cobre).
    function boxOnPokes(list) {
        const total = list.length;
        const antes = boxKnown ? boxKnown.total : null;
        boxKnown = { total, at: Date.now() };
        boxCapturesSince = 0; boxSoldSince = 0;
        if (total > boxMaxSeen) boxMaxSeen = total;
        const ids = new Map(list.map(p => [String(p.id), p]));
        const n0 = captureQueue.length;
        captureQueue = captureQueue.filter(p => { const f = ids.get(String(p.id)); return f && !f.team && !f.leader && !f.locked && !f.starter && !f.listed; });
        if (captureQueue.length !== n0) saveBoxQueue();
        if (antes == null || Math.abs(total - antes) >= 10) logEvent('box', { total, maiorLido: boxMaxSeen, fila: captureQueue.length, limite: boxLimit() });
        boxCheck();
    }
    // Candidatos do plano B: fila (dados do delta) com mais de 2 min, fora da lista conhecida, passando nas regras.
    function pokeSellQueueCandidates(d) {
        const known = new Set(lastPokesList.map(p => String(p.id)));
        return captureQueue.filter(p => !known.has(String(p.id)) && Date.now() - (Number(p.at) || 0) >= POKE_SELL_RECENT_MS && !pokeSellReason(Object.assign({ team: false, leader: false }, p), d));
    }
    function boxCheck() {
        const limite = boxLimit(), est = boxEstimate();
        if (!limite || est == null || est < limite) return;
        if (cfg.pokeSellEnabled && typeof tripRequest === 'function') tripRequest('pokes', null, `box com ~${est} Pokémon (limite ${limite})`);
        if (Date.now() - boxAlertedAt < BOX_ALERT_GAP_MS) return;
        boxAlertedAt = Date.now();
        const who = playerName();
        logEvent('box-alerta', { estimativa: est, limite, conhecido: boxKnown ? boxKnown.total : null, fila: captureQueue.length, vendaLigada: Boolean(cfg.pokeSellEnabled) });
        postWebhook('alert', {
            content: `📦 ${who ? `**${who}**` : 'Sua conta'}: box com **~${est} Pokémon** (limite ${limite})${cfg.pokeSellEnabled ? ' — viagem de venda pedida' : ' — venda de Pokémon DESLIGADA: venda na mão'}`,
            username: 'Poke Idle World',
            embeds: [{
                title: `Box com ~${est} Pokémon`,
                description: `${who ? `Conta: ${who}\n` : ''}Box grande demais = o jogo para de mandar a lista de Pokémon e nada vende sozinho.\n${cfg.pokeSellEnabled ? 'O script pediu uma viagem à cidade para vender.' : 'Ligue "Vender sozinho" na aba Venda ou venda na mão.'}\nMaior lista já lida nesta carga: ${boxMaxSeen || '?'}\nEm ${new Date().toLocaleString('pt-BR')}`,
                color: 0xfee75c,
            }],
        }, { evento: 'box-alerta', estimativa: est, limite });
    }
    // Pedido de lista feito na cidade: respondido zera o contador; mudo conta e, no 2º seguido, avisa (1x por hora).
    function pokesNoteSilent(answered) {
        if (answered) { pokesSilentAsks = 0; return; }
        pokesSilentAsks++;
        logEvent('pokes-mudo', { seguidos: pokesSilentAsks, box: boxEstimate(), fila: captureQueue.length });
        if (pokesSilentAsks < POKES_SILENT_ALERT_AT || Date.now() - pokesSilentAlertedAt < BOX_ALERT_GAP_MS) return;
        pokesSilentAlertedAt = Date.now();
        const who = playerName(), est = boxEstimate();
        postWebhook('alert', {
            content: `⚠️ ${who ? `**${who}**` : 'Sua conta'}: o jogo não responde a lista de Pokémon (${pokesSilentAsks} pedidos na cidade sem resposta) — box grande demais?${est != null ? ` ~${est} Pokémon` : ''}`,
            username: 'Poke Idle World',
            embeds: [{
                title: 'Lista de Pokémon não chega',
                description: `${who ? `Conta: ${who}\n` : ''}Sintoma de box cheio: o servidor cala o frame de Pokémon. ${captureQueue.length ? `O script vai vender pela fila das capturas (${captureQueue.length}) na viagem.` : 'Venda Pokémon na mão na tela do jogo.'}\nEm ${new Date().toLocaleString('pt-BR')}`,
                color: 0xed4245,
            }],
        }, { evento: 'pokes-mudo', seguidos: pokesSilentAsks });
    }

    function noteRecentCapture(id) {
        if (id == null) return;
        recentCaptureIds.set(String(id), Date.now());
        for (const [k, at] of recentCaptureIds) if (Date.now() - at > POKE_SELL_RECENT_MS) recentCaptureIds.delete(k);
    }
    function pokeSellLimit(d, tierKey) { return Math.min(IV_MAX, Math.max(0, Number(((d || cfg).pokeSellLimits || {})[tierKey]) || 0)); }
    function pokeSellHasRules(d) { return TIERS.some(t => pokeSellLimit(d, t.key) > 0); }

    // Motivo para NÃO vender `p` com as regras `d` (cfg ou rascunho do painel); null = vende.
    function pokeSellReason(p, d) {
        d = d || cfg;
        if (!p || typeof p !== 'object') return 'inválido';
        if (p.team || p.leader) return 'no time';
        if (p.starter) return 'inicial';
        if (p.shiny) return 'shiny';
        if (p.locked) return 'cadeado';
        if (p.listed || p.tradeId) return 'anunciado no mercado';   // `listed` = anúncio no mercado (bundle: o depósito também bloqueia)
        if (p.sellValue != null && !(Number(p.sellValue) > 0)) return 'sem valor';
        if (pokeSellRejected.has(String(p.id))) return `recusado pelo jogo (${pokeSellRejected.get(String(p.id))})`;
        const at = recentCaptureIds.get(String(p.id));
        if (at && Date.now() - at < POKE_SELL_RECENT_MS) return 'capturado agora';
        if (typeof clanKeepsSpecies === 'function' && clanKeepsSpecies(Number(p.speciesId))) return 'tarefa do clã';
        if (typeof breedKeepsPoke === 'function' && breedKeepsPoke(p)) return 'breeding';   // v3.29.0: quem sobe e a espécie dele, SEMPRE
        const tier = qualityTier(Number(p.quality));
        const iv = Number(p.ivTotal);
        if (!tier || !Number.isFinite(iv)) return 'sem IV';
        const limite = pokeSellLimit(d, tier.key);
        if (!limite) return `${tier.name} sem limite`;
        if (iv >= limite) return `poder ${iv} ≥ ${limite}`;
        return null;
    }
    // v3.27.1: lista `pokes` nunca lida nesta carga. Na hunt o servidor NÃO responde ao `pokes-get` (só manda `pokes`
    // sozinho quando o líder sobe de nível); na cidade responde. Sem lista não há candidatos, e sem candidatos a viagem
    // não levava a tarefa de Pokémon: a conta4 (líder sem subir de nível na hunt de Phanpy, 04/10/2026) ficou com
    // "Time ainda não lido" e dezenas de capturas no box sem vender. A viagem agora lê a lista quando ela nunca veio.
    function pokeSellListUnread() { return Boolean(cfg.pokeSellEnabled) && !lastPokesList.length; }
    // v3.27.2: a lista nunca veio e algum módulo (evolução, nível, Joy...) precisa dela — a viagem leva a tarefa `time`
    // (só lê a lista; sem venda). Com a venda de Pokémon ligada a tarefa `pokes` já faz isso e vende na mesma viagem.
    function pokesListWanted() { return !lastPokesList.length && pokesListUsed(); }
    // Chegada na cidade pela MÃO do usuário (`set-city` fora da viagem do script): o jogo responde aqui, então pede a lista
    // 3 s depois (a tela ainda está trocando de cena). Na viagem do script quem pede é a tarefa.
    const POKES_CITY_DELAY_MS = 3000;
    let pokesCityTimer = null;
    function pokesOnSetCity() {
        if (typeof tripRunning !== 'undefined' && tripRunning) return;
        if (!pokesListUsed()) return;
        clearTimeout(pokesCityTimer);
        pokesCityTimer = setTimeout(() => {
            pokesCityTimer = null;
            lastPokesReqAt = Date.now();
            const antes = pokesFrameSeq;
            const enviado = sendGame({ type: 'pokes-get' });
            logEvent('pokes-get', { motivo: 'chegou na cidade', nuncaLida: !lastPokesList.length, enviado });
            if (enviado) setTimeout(() => pokesNoteSilent(pokesFrameSeq !== antes), POKE_SELL_REFRESH_MS);
        }, POKES_CITY_DELAY_MS);
    }
    function pokeSellCandidates(d, list) {
        return (Array.isArray(list) ? list : lastPokesList).filter(p => !pokeSellReason(p, d));
    }
    function pokeLabel(p) {
        const t = qualityTier(Number(p.quality));
        return `${p.name || '?'} lv${Number(p.level) || 0} ${t ? t.name : '?'} ${Number.isFinite(Number(p.ivTotal)) ? Number(p.ivTotal) : '?'}/${IV_MAX}`;
    }

    // Lista fresca antes de vender (v3.24.7): o último frame `pokes` pode ser velho (Pokémon posto no time ou travado na
    // mão depois dele). Pede `pokes-get` e espera o frame novo até POKE_SELL_REFRESH_MS; sem resposta, segue com a última.
    function pokeSellRefreshList() {
        const antes = pokesFrameSeq;
        if (!sendGame({ type: 'pokes-get' })) return Promise.resolve(false);
        const t0 = Date.now();
        return new Promise(res => (function loop() {
            if (pokesFrameSeq !== antes) return res(true);
            if (Date.now() - t0 >= POKE_SELL_REFRESH_MS) return res(false);
            setTimeout(loop, 250);
        })()).then(ok => { pokesNoteSilent(ok); return ok; });
    }

    async function runPokeSellCycle(manual) {
        if (pokeSellRunning) return { ok: false, motivo: 'venda de Pokémon já em andamento' };
        if (!manual && !cfg.pokeSellEnabled) return { ok: false, motivo: 'desligada' };
        if (awaitingDetails.length) return { ok: false, motivo: 'captura aguardando detalhes' };
        pokeSellRunning = true;
        let fresca = false;
        try { fresca = await pokeSellRefreshList(); } catch (err) { fresca = false; }
        let cand = pokeSellCandidates(cfg);
        let planoB = [];
        if (!fresca) {   // lista muda (ou velha): completa com a fila das capturas (plano B, v3.28.0)
            const ids = new Set(cand.map(p => String(p.id)));
            planoB = pokeSellQueueCandidates(cfg).filter(p => !ids.has(String(p.id)));
            cand = cand.concat(planoB);
        }
        logEvent('venda-pokes-lista', { fresca, total: lastPokesList.length, candidatos: cand.length, fila: captureQueue.length, planoB: planoB.length });
        if (!cand.length) { pokeSellRunning = false; return { ok: false, motivo: lastPokesList.length ? 'nenhum Pokémon dentro das regras' : 'time ainda não lido' }; }
        lastPokeSellAt = Date.now();
        const who = playerName();
        const conta = who ? `Conta: ${who}\n` : '';
        let vendidos = [], ganho = 0, gold = null, motivo = null;
        try {
            const vender = async (lote) => {
                const r = await withoutPokeGridSellGuard(() => gameApi(POKE_SELL_URL, { method: 'POST', body: JSON.stringify({ pokeIds: lote.map(p => p.id) }) }));
                const n = Number(r?.sold);
                vendidos = vendidos.concat(Number.isFinite(n) && n < lote.length ? lote.slice(0, n) : lote);
                ganho += Number(r?.goldGained) || 0;
                if (Number.isFinite(Number(r?.gold))) gold = Number(r.gold);
                if (Number.isFinite(n) && n < lote.length) motivo = 'o jogo vendeu só parte do lote';
            };
            // O jogo recusa o lote INTEIRO se um Pokémon não for vendável (ex.: anunciado no mercado). Lote recusado:
            // tenta um por um, guarda quem foi recusado (com os campos, para diagnóstico) e segue com o resto.
            const recusados = [];
            const recusar = (p, err) => {
                const msg = String(err?.message || err);
                pokeSellRejected.set(String(p.id), msg.slice(0, 60));
                recusados.push(p);
                logEvent('venda-pokes-recusado', { id: p.id, name: p.name, level: p.level, erro: msg, campos: { team: p.team, leader: p.leader, starter: p.starter, shiny: p.shiny, locked: p.locked, listed: p.listed, tradeId: p.tradeId ?? null, sellValue: p.sellValue, ivTotal: p.ivTotal, quality: p.quality }, chaves: Object.keys(p) });
            };
            for (let i = 0; i < cand.length; i += POKE_SELL_BATCH) {
                const lote = cand.slice(i, i + POKE_SELL_BATCH);
                try { await vender(lote); continue; }
                catch (err) { if (lote.length === 1) { recusar(lote[0], err); continue; } logEvent('venda-pokes-lote', { tam: lote.length, erro: String(err?.message || err), acao: 'um por um' }); }
                for (const p of lote) {
                    try { await vender([p]); }
                    catch (err) { recusar(p, err); }
                }
            }
            if (recusados.length) motivo = `${recusados.length} recusado(s) pelo jogo (${pokeSellRejected.get(String(recusados[0].id))})${motivo ? `; ${motivo}` : ''}`;
        } catch (err) { motivo = `erro na venda: ${err?.message || err}`; }
        finally { pokeSellRunning = false; }
        const ids = new Set(vendidos.map(p => String(p.id)));
        lastPokesList = lastPokesList.filter(p => !ids.has(String(p.id)));
        boxSoldSince += vendidos.length;
        if (ids.size) { captureQueue = captureQueue.filter(p => !ids.has(String(p.id))); saveBoxQueue(); }
        logEvent('venda-pokes', { candidatos: cand.length, vendidos: vendidos.length, planoB: planoB.filter(p => ids.has(String(p.id))).length, ganho, gold, motivo, guardaPokeGrid: Boolean(window.__pgSellGuard), lista: vendidos.slice(0, 20).map(pokeLabel) });
        if (onPokeSellChange) { try { onPokeSellChange(); } catch { /* painel fechado */ } }
        if (vendidos.length) {
            const nomes = vendidos.slice(0, 15).map(pokeLabel).join('\n');
            postWebhook('alert', {
                content: `💰 ${who ? `**${who}**` : 'Sua conta'} vendeu **${vendidos.length} Pokémon** por ${fmtNum(ganho)} gold${motivo ? ' — venda parcial' : ''}`,
                username: 'Poke Idle World',
                embeds: [{
                    title: `Venda de Pokémon: ${vendidos.length} por ${fmtNum(ganho)} gold`,
                    description: conta + nomes + (vendidos.length > 15 ? `\n… e mais ${vendidos.length - 15}` : '') + (gold != null ? `\nGold agora: ${fmtNum(gold)}` : '') + (motivo ? `\nObs.: ${motivo}` : '') + `\nEm ${new Date().toLocaleString('pt-BR')}`,
                    color: motivo ? 0xfee75c : 0x57f287,
                }],
            }, { evento: 'venda-pokes', vendidos: vendidos.length, ganho });
        } else if (motivo) {
            postWebhook('alert', {
                content: `⚠️ ${who ? `**${who}**` : 'Sua conta'}: a venda automática de Pokémon falhou (${cand.length} candidatos)`,
                username: 'Poke Idle World',
                embeds: [{ title: 'Venda de Pokémon falhou', description: conta + `Motivo: ${motivo}\nEm ${new Date().toLocaleString('pt-BR')}`, color: 0xed4245 }],
            }, { evento: 'venda-pokes-falhou', motivo });
        }
        requestPokes(1500); // confirma a lista nova
        return { ok: vendidos.length > 0 && !motivo, vendidos: vendidos.length, ganho, motivo };
    }

    // Frame `pokes` chegou: guarda a lista e, se estiver na hora, vende.
    function pokeSellOnPokes(list) {
        lastPokesList = Array.isArray(list) ? list.filter(p => p && typeof p === 'object') : [];
        lastPokesAt = Date.now();
        pokesFrameSeq++;
        boxOnPokes(lastPokesList);
        if (!pokesFieldsLogged && lastPokesList.length) {
            pokesFieldsLogged = true;
            const fora = lastPokesList.find(p => !p.team) || lastPokesList[0];
            logEvent('pokes-campos', { total: lastPokesList.length, foraDoTime: lastPokesList.filter(p => !p.team).length, chaves: Object.keys(fora), exemplo: { name: fora.name, team: fora.team, starter: fora.starter, shiny: fora.shiny, locked: fora.locked, listed: fora.listed, sellValue: fora.sellValue, ivTotal: fora.ivTotal, quality: fora.quality } });
        }
        if (onPokeSellChange) { try { onPokeSellChange(); } catch { /* painel fechado */ } }
    }

    // ---- Rota de captura (aba Profissão): capturar todas as espécies, da hunt de menor nível à maior ----
    // Fontes (levantadas no bundle e nos arquivos públicos em 25/09/2026):
    //   GET /api/game/map-markers  (público) -> { map, hunts:[{ slug, name, level, area, looktype, pixel, range }] }
    //                                          454 hunts; level 0 = cidade; areas: kanto, orre, outland, nightmare.
    //   GET /game/creatures.json   (público) -> { creatures:[{ pokeId, name, looktype, huntLevel, rarity, type1... }] }
    //                                          pokeId < 10000 = espécie normal (a Pokédex só lista essas).
    //   GET /api/game/pokedex      (auth)    -> { unlockKills, species:[{ id, kills, unlocked, claimed, caught,
    //                                          canClaim, captureBonus }] }   `caught` = a conta já capturou.
    //   GET /api/game/professions  (auth)    -> { profession, rankKey, speciesCount, pictures, nextStep:{ toRankKey,
    //                                          species:{ have, need }, ... } }  (só para o status do painel)
    //   socket: `pending` { list:[{ id, pokeId, name, level, shiny }] } é a fila capturável; o cliente captura com
    //   `{ type:'catch', pendingId, ballId }`; `catch-result { success, speciesName, pendingId, cooldownMs, auto }`;
    //   `catch-cooldown { leftMs }`. `field-init { slug }` confirma a hunt em que a conta está.
    // Espécie de cada hunt: criatura com o mesmo `looktype` (pokeId < 10000; empate = nome igual, senão o menor id).
    // Plano = hunts das áreas marcadas, até o nível máximo, sem espécie já "feita", sem as puladas e sem as que
    // falharam na entrada nesta sessão; ordem: nível, depois nome. Espécie feita (v3.13.2) = `caught` na Pokédex OU
    // capturada por esta rota OU um exemplar na conta (frame `pokes`: box + time) OU no depósito da família (frame
    // `family.depot.pokes`, casado pelo nome). A Pokédex do jogo só marca capturas registradas por ela; Pokémon
    // antigos, de troca ou do mercado aparecem só na lista da conta, e o usuário não quer repetir esses. O alvo é a
    // 1ª do plano: o script entra na hunt (switchHunt origem 'captura'); quando um `catch-result` de sucesso da
    // espécie chega (manual, Auto-Catch VIP ou a bola que o script joga com `catchRouteAuto`), marca capturada e
    // segue para a próxima. Sem alvo = rota concluída (avisa e desliga). Excludente com a rota de treino.

    const MAP_MARKERS_URL = '/api/game/map-markers';
    const CREATURES_URL = '/game/creatures.json';
    const POKEDEX_URL = '/api/game/pokedex';
    const PROFESSIONS_URL = '/api/game/professions';
    const CATCH_AREAS = ['kanto', 'orre', 'outland', 'nightmare'];
    const CATCH_TICK_MS = 60 * 1000;
    const CATCH_IDLE_REENTER_MS = 2 * 60 * 1000;   // fora de hunt há tanto tempo: volta para a hunt do alvo
    const CATCH_SEND_GAP_MS = 1500;                 // intervalo mínimo entre bolas jogadas pelo script
    const CATCH_REENTER_MS = 8000;                  // o jogo entrou em outra hunt: espera isto e volta para a do alvo
    const DEX_REFRESH_MIN_MS = 30 * 1000;

    let huntCatalog = null;         // [{ slug, name, level, area, speciesId, speciesName }] ordenado por nível
    let dexCaught = new Set();      // speciesId capturados (Pokédex + capturas desta rota)
    let ownedSpecies = new Set();   // speciesId de todo Pokémon da conta (frame `pokes`: box + time)
    let familyNames = new Set();    // nomes (normalizados) dos Pokémon no depósito da família
    let creatureIdByName = new Map(); // nome normalizado -> pokeId (do creatures.json)
    let creatureTypes = new Map();  // pokeId -> [type1, type2] em maiúsculas (do creatures.json; daily sozinha)
    let creatureLoot = new Map();   // pokeId -> [{ name, chance (em 100000), minCount, maxCount }] (do creatures.json; clã)
    let huntLootBySlug = new Map(); // slug -> loot do monstro da hunt (todas as hunts, inclusive Furious/Ancient/Brave/Orre)
    let dexSig = '';
    let dexTotal = 0;               // espécies normais no catálogo
    let dexFetchedAt = 0;
    let profession = null;          // { name, rank, speciesCount, next:{ rank, have, need } } | null
    let catchTarget = null;         // hunt da vez (entrada do catálogo)
    let catchBusy = false;
    let catchCooldownUntil = 0;
    let catchSentFor = null;        // pendingId da última bola jogada pelo script
    let catchSentAt = 0;
    const catchFailed = new Set();  // slugs cuja entrada falhou nesta sessão (não persiste)
    let onCatchChange = null;       // callback do painel
    let catchReenterTimer = null;

    function catchRouteActive() { return Boolean(cfg.catchRouteEnabled); }
    function catchAreas() {
        const a = Array.isArray(cfg.catchRouteAreas) ? cfg.catchRouteAreas.filter(x => CATCH_AREAS.includes(x)) : [];
        return a.length ? a : ['kanto'];
    }

    // Tabela de drops da hunt (loot do monstro no creatures.json, como a wiki mostra), com o id do item pelo nome no
    // items.json: [{ id, name, chance (0..1; null = o jogo não publica), min, max }], mais provável primeiro.
    function huntLootTable(slug, itemsCat) {
        const loot = huntLootBySlug.get(normalize(slug || '')) || [];
        const idPorNome = new Map();
        if (itemsCat) for (const [id, it] of itemsCat) { const k = normalize(it?.name); if (k && !idPorNome.has(k)) idPorNome.set(k, Number(id)); }
        const out = new Map();
        for (const l of loot) {
            const id = idPorNome.get(normalize(l?.name));
            if (!id) continue;
            const chance = Number(l.chance) > 0 ? Number(l.chance) / 100000 : null;
            const min = Math.max(1, Number(l.minCount) || 1), max = Math.max(min, Number(l.maxCount) || min);
            const cur = out.get(id);
            if (!cur || (chance || 0) > (cur.chance || 0)) out.set(id, { id, name: String(l.name), chance, min, max });
        }
        return [...out.values()].sort((a, b) => (b.chance || 0) - (a.chance || 0) || a.name.localeCompare(b.name));
    }

    async function loadHuntCatalog() {
        if (huntCatalog) return huntCatalog;
        const getJson = (url) => fetch(url).then(r => r.ok ? r.json() : Promise.reject(new Error(`${url}: HTTP ${r.status}`)));
        const [mm, cr] = await Promise.all([getJson(MAP_MARKERS_URL), getJson(CREATURES_URL)]);
        const creatures = (Array.isArray(cr?.creatures) ? cr.creatures : []).filter(c => Number(c?.pokeId) > 0 && c.name);
        const byLook = new Map();
        for (const c of creatures) { const k = Number(c.looktype); if (!byLook.has(k)) byLook.set(k, []); byLook.get(k).push(c); }
        const byName = new Map(creatures.map(c => [normalize(c.name), c]));
        creatureIdByName = new Map(creatures.filter(c => Number(c.pokeId) < 10000).map(c => [normalize(c.name), Number(c.pokeId)]));
        creatureTypes = new Map(creatures.map(c => [Number(c.pokeId), [String(c.type1 || '').toUpperCase(), String(c.type2 || '').toUpperCase()]]));
        creatureLoot = new Map(creatures.map(c => [Number(c.pokeId), Array.isArray(c.loot) ? c.loot : []]));
        // Monstro de cada hunt pelo nome (445 de 451 em 27/09/2026, inclusive as especiais); o resto pelo looktype.
        const porNome = new Map();
        for (const c of creatures) { const k = huntSlugFromName(c.name); if (!porNome.has(k)) porNome.set(k, c); }
        huntLootBySlug = new Map();
        for (const h of Array.isArray(mm?.hunts) ? mm.hunts : []) {
            if (!h?.slug || !(Number(h.level) > 0)) continue;
            const c = porNome.get(huntSlugFromName(h.name)) || porNome.get(huntSlugFromName(h.slug)) || (byLook.get(Number(h.looktype)) || [])[0] || null;
            if (c && Array.isArray(c.loot)) huntLootBySlug.set(normalize(h.slug), c.loot);
        }
        dexTotal = creatures.filter(c => Number(c.pokeId) < 10000).length;
        huntCatalog = (Array.isArray(mm?.hunts) ? mm.hunts : [])
            .filter(h => h && h.slug && Number(h.level) > 0)
            .map(h => {
                const cands = (byLook.get(Number(h.looktype)) || []).filter(c => Number(c.pokeId) < 10000).sort((a, b) => Number(a.pokeId) - Number(b.pokeId));
                const sp = cands.find(c => normalize(c.name) === normalize(h.name)) || cands[0] || byName.get(normalize(h.name)) || null;
                return { slug: normalize(h.slug), name: String(h.name), level: Number(h.level), area: String(h.area || ''), speciesId: sp ? Number(sp.pokeId) : null, speciesName: sp ? String(sp.name) : null };
            })
            .sort((a, b) => a.level - b.level || a.slug.localeCompare(b.slug));
        logEvent('captura-catalogo', { hunts: huntCatalog.length, semEspecie: huntCatalog.filter(h => !h.speciesId).length, especies: dexTotal });
        return huntCatalog;
    }

    async function refreshPokedex(force) {
        if (!force && dexFetchedAt && Date.now() - dexFetchedAt < DEX_REFRESH_MIN_MS) return dexCaught;
        const d = await gameApi(POKEDEX_URL);
        const list = Array.isArray(d?.species) ? d.species : [];
        dexCaught = new Set(list.filter(s => s && s.caught).map(s => Number(s.id)));
        for (const id of (Array.isArray(cfg.catchRouteDone) ? cfg.catchRouteDone : [])) dexCaught.add(Number(id));
        dexFetchedAt = Date.now();
        const ids = [...dexCaught].sort((a, b) => a - b);
        const sig = ids.join(',');
        if (sig !== dexSig) { dexSig = sig; logEvent('pokedex', { capturadas: dexCaught.size, listadas: list.length, ids: ids.slice(0, 80), naConta: ownedSpecies.size, familia: familyNames.size }); }
        return dexCaught;
    }
    // Espécie já feita por qualquer fonte (ver comentário do módulo).
    function speciesDone(id) {
        if (dexCaught.has(id) || ownedSpecies.has(id)) return true;
        if (!familyNames.size) return false;
        for (const n of familyNames) if (creatureIdByName.get(n) === id) return true;
        return false;
    }
    function speciesSource(id) {
        if (dexCaught.has(id)) return 'Pokédex';
        if (ownedSpecies.has(id)) return 'na conta';
        return speciesDone(id) ? 'família' : null;
    }
    // Frame `pokes` (box + time): tudo que a conta tem conta como feito. Se o alvo já está na conta, pula para o próximo.
    function catchOnPokes(list) {
        const novo = new Set((Array.isArray(list) ? list : []).map(p => Number(p?.speciesId)).filter(n => Number.isInteger(n) && n > 0 && n < 10000));
        const mudou = novo.size !== ownedSpecies.size || [...novo].some(id => !ownedSpecies.has(id));
        ownedSpecies = novo;
        if (!mudou) return;
        logEvent('captura-conta', { especiesNaConta: ownedSpecies.size });
        if (catchRouteActive() && huntCatalog && catchTarget && speciesDone(catchTarget.speciesId)) catchNext('já tem na conta');
        else if (onCatchChange) { try { onCatchChange(); } catch { /* painel fechado */ } }
    }
    // Frame `family`: os Pokémon no depósito da família (só nome) também contam.
    function catchOnFamily(pokes) {
        familyNames = new Set((Array.isArray(pokes) ? pokes : []).map(p => normalize(p?.name)).filter(Boolean));
        if (catchRouteActive() && huntCatalog && catchTarget && speciesDone(catchTarget.speciesId)) catchNext('já tem na família');
    }

    async function refreshProfession() {
        try {
            const d = await gameApi(PROFESSIONS_URL);
            const ns = d?.nextStep || null;
            profession = {
                key: d?.profession || null,
                rank: d?.rankKey || null,
                speciesCount: Number(d?.speciesCount) || 0,
                next: ns ? { rank: ns.toRankKey || null, have: Number(ns.species?.have) || 0, need: Number(ns.species?.need) || 0 } : null,
            };
        } catch (err) { logEvent('profissao-erro', { erro: String(err?.message || err) }); }
        if (onCatchChange) { try { onCatchChange(); } catch { /* painel fechado */ } }
        return profession;
    }

    // Hunts no escopo (áreas + nível máximo), uma por espécie, na ordem da rota.
    function catchScope() {
        if (!huntCatalog) return [];
        const areas = new Set(catchAreas());
        const max = Number(cfg.catchRouteMaxLevel) || 0;
        const vistos = new Set();
        return huntCatalog.filter(h => {
            if (!h.speciesId || h.speciesId >= 10000 || !areas.has(h.area) || (max && h.level > max)) return false;
            if (vistos.has(h.speciesId)) return false;
            vistos.add(h.speciesId);
            return true;
        });
    }
    // O que falta: escopo menos capturadas, puladas e falhas desta sessão.
    function catchPlan() {
        const skipped = new Set(Array.isArray(cfg.catchRouteSkipped) ? cfg.catchRouteSkipped : []);
        return catchScope().filter(h => !speciesDone(h.speciesId) && !skipped.has(h.slug) && !catchFailed.has(h.slug));
    }
    function catchProgress() {
        const escopo = catchScope();
        const feitas = escopo.filter(h => speciesDone(h.speciesId)).length;
        return { total: escopo.length, feitas, faltam: catchPlan().length, dex: dexCaught.size, dexTotal, naConta: ownedSpecies.size };
    }
    function catchBallId() {
        const v = cfg.catchRouteBall;
        if (v && v !== 'auto') return Number(v) || null;
        return lastBallId || 1;
    }
    function catchStatus() {
        if (!catchRouteActive()) return 'desligada';
        if (!huntCatalog) return catchBusy ? 'carregando hunts e Pokédex…' : 'ainda não carregada';
        const p = catchProgress();
        if (!catchTarget) return p.faltam ? `${p.faltam} espécies faltando · aguardando` : `concluída: ${p.feitas}/${p.total} espécies das áreas marcadas`;
        const onde = normalize(huntSlug || '') === catchTarget.slug ? 'na hunt' : (huntSwitch?.origem === 'captura' ? 'entrando…' : `você está em ${huntSlug || 'cidade'}`);
        return `alvo ${catchTarget.name} (lv ${catchTarget.level}, ${catchTarget.area}) · ${onde} · ${p.feitas}/${p.total} feitas, faltam ${p.faltam} · Pokédex ${p.dex}/${p.dexTotal}${p.naConta ? ` · ${p.naConta} espécies na conta` : ''}`;
    }

    // Carrega catálogo + Pokédex e vai para o 1º alvo. `motivo` só para o log.
    async function startCatchRoute(motivo) {
        if (!catchRouteActive() || catchBusy) return;
        catchBusy = true;
        if (onCatchChange) { try { onCatchChange(); } catch { /* painel fechado */ } }
        try {
            await loadHuntCatalog();
            await refreshPokedex(true);
        } catch (err) {
            logEvent('captura-erro', { motivo, erro: String(err?.message || err) });
            catchBusy = false;
            if (onCatchChange) { try { onCatchChange(); } catch { /* painel fechado */ } }
            return;
        }
        catchBusy = false;
        refreshProfession();
        lastPokesReqAt = 0; requestPokes(0);   // a lista da conta (box + time) também define o que já está feito
        catchNext(motivo);
    }

    function catchNext(motivo) {
        if (!catchRouteActive() || !huntCatalog) return;
        const alvo = catchPlan()[0] || null;
        if (!alvo) { finishCatchRoute(); return; }
        const trocou = !catchTarget || catchTarget.slug !== alvo.slug;
        catchTarget = alvo;
        catchSentFor = null;
        const p = catchProgress();
        if (trocou) logEvent('captura-alvo', { slug: alvo.slug, level: alvo.level, speciesId: alvo.speciesId, faltam: p.faltam, motivo, proximas: catchPlan().slice(1, 6).map(h => h.slug) });
        if (normalize(huntSlug || '') !== alvo.slug && !(huntSwitch && huntSwitch.slug === alvo.slug)) switchHunt(alvo.slug, 1, 'captura');
        if (onCatchChange) { try { onCatchChange(); } catch { /* painel fechado */ } }
    }

    // Entrada na hunt do alvo não confirmou (ou o jogo respondeu `error`): pula nesta sessão e segue.
    function catchHuntFailed(slug, erro) {
        if (!catchRouteActive() || !catchTarget || catchTarget.slug !== slug) return;
        catchFailed.add(slug);
        logEvent('captura-pulou', { slug, erro: erro || 'entrada não confirmou' });
        catchNext('entrada falhou');
    }

    function skipCatchTarget() {
        if (!catchTarget) return null;
        const slug = catchTarget.slug;
        cfg.catchRouteSkipped = [...new Set([...(Array.isArray(cfg.catchRouteSkipped) ? cfg.catchRouteSkipped : []), slug])];
        saveCfg(cfg);
        logEvent('captura-pulou', { slug, erro: 'pulado no painel' });
        catchNext('pulado');
        return slug;
    }

    // `pending` chegou: se a espécie da vez está na fila e a bola automática está ligada, joga a bola.
    function catchOnPending(list) {
        if (!catchRouteActive() || !cfg.catchRouteAuto || !catchTarget) return;
        if (Date.now() < catchCooldownUntil || Date.now() - catchSentAt < CATCH_SEND_GAP_MS) return;
        const alvo = list.find(p => p && p.id != null && (Number(p.pokeId) === catchTarget.speciesId || normalize(p.name) === normalize(catchTarget.speciesName || catchTarget.name)));
        if (!alvo || catchSentFor === alvo.id) return;
        const ballId = catchBallId();
        if (!ballId) return;
        if (ballQty(ballId) === 0) { logEvent('captura-sem-bola', { ballId, name: alvo.name }); return; }
        catchSentFor = alvo.id;
        catchSentAt = Date.now();
        const ok = sendGame({ type: 'catch', pendingId: alvo.id, ballId });
        logEvent('captura-bola', { pendingId: alvo.id, name: alvo.name, shiny: Boolean(alvo.shiny), ballId, enviado: ok });
    }

    function catchOnCooldown(message) {
        const ms = Number(message?.leftMs ?? message?.cooldownMs) || 0;
        if (ms > 0) catchCooldownUntil = Date.now() + ms;
    }

    // `catch-result` de sucesso (qualquer origem: manual, Auto-Catch VIP ou o script). `info` já extraído.
    function catchOnResult(info, message) {
        if (message?.cooldownMs) catchOnCooldown(message);
        if (!catchRouteActive() || !huntCatalog || !info?.name) return;
        const nome = normalize(info.name);
        const hit = catchScope().find(h => normalize(h.speciesName || h.name) === nome || h.slug === huntSlugFromName(nome));
        if (!hit || speciesDone(hit.speciesId)) return;
        dexCaught.add(hit.speciesId);
        cfg.catchRouteDone = [...new Set([...(Array.isArray(cfg.catchRouteDone) ? cfg.catchRouteDone : []), hit.speciesId])];
        saveCfg(cfg);
        const eraAlvo = Boolean(catchTarget && catchTarget.slug === hit.slug);
        const p = catchProgress();
        const proximo = catchPlan().find(h => h.slug !== hit.slug) || null;
        logEvent('captura-feita', { slug: hit.slug, speciesId: hit.speciesId, eraAlvo, feitas: p.feitas, total: p.total, proximo: proximo?.slug || null });
        const who = playerName();
        const mention = cfg.mentionUserId ? `<@${cfg.mentionUserId}> ` : '';
        postWebhook('alert', {
            content: `${mention}📖 ${who ? `**${who}**` : 'Sua conta'} capturou **${hit.name}** (${p.feitas}/${p.total})${proximo ? ` — próximo: **${proximo.name}** (lv ${proximo.level})` : ' — era a última!'}`,
            username: 'Poke Idle World',
            embeds: [{
                title: `Rota de captura: ${hit.name} ✔`,
                description: (who ? `Conta: ${who}\n` : '') + `Hunt ${hit.slug} (lv ${hit.level}, ${hit.area})${info.shiny ? ' · ✨ shiny' : ''}${message?.auto ? ' · Auto-Catch' : ''}\nProgresso: ${p.feitas}/${p.total} espécies das áreas marcadas · faltam ${p.faltam} · Pokédex ${p.dex}/${p.dexTotal}\n${proximo ? `Próximo alvo: ${proximo.name} (hunt ${proximo.slug}, lv ${proximo.level})` : 'Rota concluída!'}\nEm ${new Date().toLocaleString('pt-BR')}`,
                color: 0x57f287,
            }],
        }, { evento: 'captura-feita', slug: hit.slug });
        refreshPokedex(true).catch(() => {});
        if (eraAlvo) catchNext('capturou');
        else if (onCatchChange) { try { onCatchChange(); } catch { /* painel fechado */ } }
    }

    function finishCatchRoute() {
        const p = catchProgress();
        catchTarget = null;
        cfg.catchRouteEnabled = false;
        saveCfg(cfg);
        logEvent('captura-concluida', { feitas: p.feitas, total: p.total, puladas: (cfg.catchRouteSkipped || []).length, falhas: catchFailed.size });
        const who = playerName();
        const pend = (cfg.catchRouteSkipped || []).length + catchFailed.size;
        postWebhook('alert', {
            content: `🏁 ${who ? `**${who}**` : 'Sua conta'} terminou a rota de captura: ${p.feitas}/${p.total} espécies (${catchAreas().join(', ')}${Number(cfg.catchRouteMaxLevel) ? `, até lv ${cfg.catchRouteMaxLevel}` : ''})${pend ? ` · ${pend} hunt(s) puladas/sem entrada` : ''}`,
            username: 'Poke Idle World',
            embeds: [{ title: 'Rota de captura concluída', description: (who ? `Conta: ${who}\n` : '') + `Pokédex ${p.dex}/${p.dexTotal}. A rota foi desligada no painel 🔔; amplie as áreas ou o nível para continuar.\nEm ${new Date().toLocaleString('pt-BR')}`, color: 0x5865f2 }],
        }, { evento: 'captura-concluida' });
        if (onCatchChange) { try { onCatchChange(); } catch { /* painel fechado */ } }
    }

    // A rota manda na hunt (v3.13.3): a tela do jogo guarda a última hunt escolhida na mão e a reenvia sozinha em toda
    // reconexão do socket e após `hunt-cooldown` (visto no painel 3: a conta voltava para larvitar enquanto o alvo era
    // poliwag). Por isso, com a rota ligada, entrar em qualquer hunt que não seja a do alvo dispara a volta em
    // CATCH_REENTER_MS (chamado por setHunt). Para caçar na mão, desligue a rota. Exceção: a hunt da Daily Kill.
    function catchOnHuntChange(slug) {
        clearTimeout(catchReenterTimer); catchReenterTimer = null;
        if (!catchRouteActive() || !catchTarget || !huntCatalog || tripRunning || (typeof healBusy === 'function' && healBusy())) return;
        const h = normalize(slug || '');
        if (!h || CITY_SLUGS.includes(h) || h === catchTarget.slug) return;
        if (dailyEnabled() && dailyOnHunt()) return;
        catchReenterTimer = setTimeout(() => {
            catchReenterTimer = null;
            if (!catchRouteActive() || !catchTarget || huntSwitch || catchBusy) return;
            const atual = normalize(huntSlug || '');
            if (!atual || atual === catchTarget.slug || (dailyEnabled() && dailyOnHunt())) return;
            logEvent('captura-reentrada', { de: atual, slug: catchTarget.slug, motivo: 'o jogo entrou em outra hunt' });
            switchHunt(catchTarget.slug, 1, 'captura');
        }, CATCH_REENTER_MS);
    }
    // Tique (60 s): fora de hunt há 2 min (ex.: teleporte para a cidade) ou em outra hunt: volta para a do alvo.
    function catchTick() {
        if (!catchRouteActive()) return;
        if (!huntCatalog) { startCatchRoute('tique'); return; }
        if (!catchTarget || huntSwitch || catchBusy || catchReenterTimer || tripRunning || (typeof healBusy === 'function' && healBusy())) return;
        const h = normalize(huntSlug || '');
        if (h === catchTarget.slug) return;
        if (dailyEnabled() && dailyOnHunt()) return;
        const emHunt = h && !CITY_SLUGS.includes(h);
        if (!emHunt && Date.now() - lastFieldAt < CATCH_IDLE_REENTER_MS) return;   // fora de hunt há pouco: espera
        logEvent('captura-reentrada', { de: h || null, slug: catchTarget.slug, motivo: emHunt ? 'em outra hunt' : 'parado fora de hunt' });
        switchHunt(catchTarget.slug, 1, 'captura');
    }

    // ---- Daily Kill: voltar para a hunt quando a missão do dia terminar ----------
    // A "Daily Kill" (menu Quests, Tasks & Dailys do jogo) é uma missão diária: o jogador escolhe 1 de 3
    // Pokémon, derrota `qty` deles e resgata XP + itens. Não passa pelo socket — o cliente consulta por REST
    // (levantado no bundle em 25/09/2026; a janela do jogo repete o GET a cada 5 s enquanto está aberta):
    //   GET  /api/game/daily-kill       -> { locked, minLevel, claimed, pickedIdx (-1 = não escolheu), resetAt,
    //                                       reward:{ xp, items }, options:[{ name, speciesId, have, qty, done, xp,
    //                                       type1, type2 }], cards, rerollCost, rerollMax, rerolls }
    //   POST /api/game/daily-kill/claim -> { state, payout:{ xp, totalXp, level, leveledUp, items:[{ label }] } }
    //   POST /api/game/daily-kill/pick { idx } (usado só pela daily sozinha) e /reroll (nunca usado).
    // Fluxo: o usuário escolhe a missão e entra na hunt do Pokémon na mão. O script consulta o estado a cada
    // 30 s enquanto a conta está na hunt da daily (2 min fora dela) e, a cada `field-kill` da espécie da missão,
    // conta o abate e antecipa a consulta quando a meta parece batida. Terminou: resgata (opcional), sai da
    // hunt e volta via switchHunt(origem 'daily') para: o campo "Voltar para", senão a etapa atual da rota,
    // senão a hunt em que a conta estava antes da daily (`prevHuntSlug`, guardado a cada troca de hunt e no
    // registro da recarga automática). Um tratamento por missão (`dailyHandledReset` = resetAt tratada).
    // Missão já resgatada quando o script a viu pela primeira vez (ex.: depois de um reload) não gera volta.
    //
    // Daily sozinha (v3.16.0, `cfg.dailyAuto`): sem missão escolhida, o script escolhe a de melhor nota (POST /pick);
    // com a missão aberta e a conta fora da hunt dela, escolhe o Pokémon do TIME que mais bate na espécie (tabela de
    // tipos do jogo, a mesma do Tierlist do PokeGrid, × nível, com desconto se estiver abaixo do nível da hunt),
    // manda `poke-summon` se ele não for o líder e entra na hunt (switchHunt origem 'daily-ida'). De onde saiu e quem
    // era o líder ficam em localStorage.pgDiscordNotifyDaily (sobrevivem à recarga). Na meta: resgata, devolve o
    // líder e volta para a hunt de antes. Enquanto a ida vale, a troca de líder do treino espera (dailyHoldsLeader).
    // Só o time entra na conta (box não: tirar do box mexe na composição do time).

    const DAILY_URL = '/api/game/daily-kill';
    const DAILY_CLAIM_URL = '/api/game/daily-kill/claim';
    const DAILY_CHECK_MS = 30 * 1000;           // tique
    const DAILY_POLL_HUNT_MS = 30 * 1000;       // consulta na hunt da daily
    const DAILY_POLL_IDLE_MS = 2 * 60 * 1000;   // consulta fora dela (só para saber se há missão escolhida)
    const DAILY_AFTER_KILL_MS = 2500;           // antecipação da consulta depois do abate que fecha a meta
    const DAILY_PICK_URL = '/api/game/daily-kill/pick';
    const DAILY_RUN_KEY = 'pgDiscordNotifyDaily';
    const DAILY_GO_RETRY_MS = 5 * 60 * 1000;    // saiu da hunt da daily (ex.: na mão): espera isso antes de ir de novo
    const DAILY_GO_MAX = 3;                     // idas por missão
    // Dano do tipo do golpe (linha) no tipo do defensor (coluna); ausente = 1. É a tabela do jogo, copiada do
    // Tierlist do PokeGrid (`CHART` no index.html dele).
    const TYPE_CHART = {
        NORMAL: { ROCK: .5, GHOST: 0, STEEL: .5 },
        FIRE: { FIRE: .5, WATER: .5, GRASS: 2, ICE: 2, BUG: 2, ROCK: .5, DRAGON: .5, STEEL: 2 },
        WATER: { FIRE: 2, WATER: .5, GRASS: .5, GROUND: 2, ROCK: 2, DRAGON: .5 },
        ELECTRIC: { WATER: 2, ELECTRIC: .5, GRASS: .5, GROUND: 0, FLYING: 2, DRAGON: .5 },
        GRASS: { FIRE: .5, WATER: 2, GRASS: .5, POISON: .5, GROUND: 2, FLYING: .5, BUG: .5, ROCK: 2, DRAGON: .5, STEEL: .5 },
        ICE: { FIRE: .5, WATER: .5, GRASS: 2, ICE: .5, GROUND: 2, FLYING: 2, DRAGON: 2, STEEL: .5 },
        FIGHTING: { NORMAL: 2, ICE: 2, POISON: .5, FLYING: .5, PSYCHIC: .5, BUG: .5, ROCK: 2, GHOST: 0, DARK: 2, STEEL: 2, FAIRY: .5 },
        POISON: { GRASS: 2, POISON: .5, GROUND: .5, ROCK: .5, GHOST: .5, STEEL: 0, FAIRY: 2 },
        GROUND: { FIRE: 2, ELECTRIC: 2, GRASS: .5, POISON: 2, FLYING: 0, BUG: .5, ROCK: 2, STEEL: 2 },
        FLYING: { ELECTRIC: .5, GRASS: 2, FIGHTING: 2, BUG: 2, ROCK: .5, STEEL: .5 },
        PSYCHIC: { FIGHTING: 2, POISON: 2, PSYCHIC: .5, DARK: 0, STEEL: .5 },
        BUG: { FIRE: .5, GRASS: 2, FIGHTING: .5, POISON: .5, FLYING: .5, PSYCHIC: 2, GHOST: .5, DARK: 2, STEEL: .5, FAIRY: .5 },
        ROCK: { FIRE: 2, ICE: 2, FIGHTING: .5, GROUND: .5, FLYING: 2, BUG: 2, STEEL: .5 },
        GHOST: { NORMAL: 0, PSYCHIC: 2, GHOST: 2, DARK: .5 },
        DRAGON: { DRAGON: 2, STEEL: .5, FAIRY: 0 },
        DARK: { FIGHTING: .5, PSYCHIC: 2, GHOST: 2, DARK: .5, FAIRY: .5 },
        STEEL: { FIRE: .5, WATER: .5, ELECTRIC: .5, ICE: 2, ROCK: 2, STEEL: .5, FAIRY: 2 },
        FAIRY: { FIRE: .5, FIGHTING: 2, POISON: .5, DRAGON: 2, DARK: 2, STEEL: .5 },
    };

    let daily = null;               // último estado lido (ver parseDaily)
    let dailyFetchedAt = 0;
    let dailyRunning = false;
    let dailyHandledReset = 0;      // resetAt da missão já tratada (não repete resgate/volta)
    let dailySeenUnclaimed = false; // vimos a missão escolhida e ainda não resgatada nesta sessão
    let dailyKillsHere = 0;         // abates da espécie da missão vistos na hunt atual
    let dailyKillTimer = null;
    let dailySig = '';
    let prevHuntSlug = null;        // hunt (não cidade) anterior à atual: para onde voltar depois da daily
    let lastRealHunt = null;        // última hunt (não cidade) vista
    let onDailyChange = null;       // callback do painel para redesenhar o status
    let dailyAutoBusy = false;
    let dailyPickTried = 0;         // resetAt da missão que já tentamos escolher (não repete o POST /pick)
    let dailyAutoNote = '';         // último motivo de a daily sozinha não ir (status do painel; log só quando muda)
    let dailyRun = loadDailyRun();  // { resetAt, name, slug, from, leaderId, leaderName, pokeId, pokeName, eff, goes, lastGoAt, over }

    function dailyEnabled() { return Boolean(cfg.dailyEnabled); }
    function dailyAutoOn() { return Boolean(cfg.dailyEnabled && cfg.dailyAuto); }
    function loadDailyRun() {
        try { const r = JSON.parse(localStorage.getItem(DAILY_RUN_KEY) || 'null'); return r && typeof r === 'object' ? r : null; }
        catch { return null; }
    }
    function saveDailyRun() {
        try { if (dailyRun) localStorage.setItem(DAILY_RUN_KEY, JSON.stringify(dailyRun)); else localStorage.removeItem(DAILY_RUN_KEY); }
        catch { /* sem localStorage: vale só nesta carga */ }
    }
    // Ida da daily sozinha em andamento (a missão de hoje, ainda não fechada).
    function activeDailyRun() {
        if (!dailyRun || dailyRun.over) return null;
        if (daily && daily.resetAt && dailyRun.resetAt && daily.resetAt !== dailyRun.resetAt) return null;
        return dailyRun;
    }
    // Chamado pelo módulo de nível: enquanto a daily sozinha escolheu o líder, a troca automática espera.
    function dailyHoldsLeader() { return dailyAutoOn() && Boolean(activeDailyRun()?.pokeId); }
    // A daily ainda precisa da hunt (rota do clã espera): missão em andamento na hunt dela, ou a ida da daily sozinha.
    // Feita ou resgatada, não segura mais nada, mesmo com a conta parada na hunt da espécie do dia.
    function dailyWantsHunt() {
        if (!dailyEnabled()) return false;
        if (dailyHoldsLeader()) return true;
        return dailyOnHunt() && !daily.done && !daily.claimed;
    }

    // Chamado por setHunt() a cada troca de hunt.
    function noteHuntChange(novo) {
        const slug = novo ? normalize(novo) : null;
        if (!slug || CITY_SLUGS.includes(slug)) return;
        if (lastRealHunt && lastRealHunt !== slug) prevHuntSlug = lastRealHunt;
        if (lastRealHunt !== slug) dailyKillsHere = 0;
        lastRealHunt = slug;
        if (dailyEnabled()) scheduleDailyCheck(DAILY_AFTER_KILL_MS); // hunt nova: consulta a daily logo
    }

    function parseDaily(s) {
        const opts = Array.isArray(s?.options) ? s.options : [];
        const idx = Number(s?.pickedIdx);
        const m = Number.isInteger(idx) && idx >= 0 ? opts[idx] : null;
        const qty = Math.max(0, Number(m?.qty) || 0);
        const have = Math.max(0, Number(m?.have) || 0);
        return {
            locked: Boolean(s?.locked),
            claimed: Boolean(s?.claimed),
            resetAt: Number(s?.resetAt) || 0,
            picked: Boolean(m),
            name: m?.name ? String(m.name) : null,
            slug: m?.name ? huntSlugFromName(m.name) : null,
            have, qty,
            done: Boolean(m) && (m.done === true || (qty > 0 && have >= qty)),
            xp: Number(s?.reward?.xp) || 0,
            pickedIdx: m ? idx : -1,
            options: opts.map((o, i) => ({
                idx: i, name: String(o?.name || '?'), speciesId: Number(o?.speciesId) || 0,
                t1: String(o?.type1 || '').toUpperCase(), t2: String(o?.type2 || '').toUpperCase(),
                have: Math.max(0, Number(o?.have) || 0), qty: Math.max(0, Number(o?.qty) || 0),
            })),
        };
    }
    function dailyOnHunt() {
        if (!daily?.picked || !huntSlug) return false;
        const h = normalize(huntSlug);
        if (CITY_SLUGS.includes(h)) return false;
        const run = activeDailyRun();
        return h === daily.slug || Boolean(run && h === run.slug) || dailyKillsHere > 0;
    }
    // Para onde voltar (d = cfg ou rascunho do painel): campo fixo > etapa da rota > hunt anterior.
    function dailyReturnTarget(d) {
        d = d || cfg;
        const fixo = huntSlugFromName(d.dailyReturnSlug || '');
        if (fixo) return fixo;
        const run = activeDailyRun();
        if (run?.from) return run.from;                              // daily sozinha: a hunt de onde ela saiu
        if (catchRouteActive() && catchTarget) return catchTarget.slug;
        if (typeof clanRouteOn === 'function' && clanRouteOn() && clanTarget) return clanTarget.slug;
        const st = routeStep();
        if (st?.slug) return st.slug;
        return prevHuntSlug || null;
    }
    function dailyStatus(d) {
        d = d || cfg;
        if (!d.dailyEnabled) return 'desligada';
        if (!daily) return dailyFetchedAt ? 'não consegui ler a missão (veja o log)' : 'ainda não lida';
        if (daily.locked) return 'bloqueada no seu nível';
        const auto = d.dailyAuto;
        if (!daily.picked) return auto ? `nenhuma missão escolhida · o script escolhe a melhor${dailyAutoNote ? ` (${dailyAutoNote})` : ''}` : 'nenhuma missão escolhida (escolha no jogo, em Dailys)';
        const meta = `${daily.name} ${fmtNum(daily.have)}/${fmtNum(daily.qty)}`;
        if (daily.claimed) return `${meta} · concluída e resgatada hoje`;
        if (daily.done) return `${meta} · meta batida${d.dailyClaim ? ', resgatando' : ' (resgate no jogo)'}`;
        const dest = dailyReturnTarget(d);
        const run = activeDailyRun();
        const com = run?.pokeName ? ` · com ${run.pokeName}${run.eff != null ? ` (${effLabel(run.eff)})` : ''}` : '';
        const onde = dailyOnHunt() ? 'na hunt da daily' : auto ? (dailyAutoNote ? `fora da hunt da daily (${dailyAutoNote})` : 'indo para a hunt da daily') : 'fora da hunt da daily';
        return `${meta} · ${onde}${com} · volta para ${dest || '? (entre numa hunt antes ou preencha "Voltar para")'}`;
    }

    // ---- daily sozinha: escolha da missão e do Pokémon ----
    function typeMult(atk, t1, t2) {
        const row = TYPE_CHART[atk] || {};
        return [t1, t2].filter(Boolean).reduce((m, dfn) => m * (row[dfn] != null ? row[dfn] : 1), 1);
    }
    function typesOf(p) {
        if (p?.t1) return [p.t1, p.t2 || ''];
        const t = typeof creatureTypes !== 'undefined' ? creatureTypes.get(Number(p?.speciesId) || 0) : null;
        return t || ['', ''];
    }
    // Melhor multiplicador entre os tipos do Pokémon (o golpe de mesmo tipo) contra os tipos da espécie; sem dado = 1.
    function pokeEffVs(p, t1, t2) {
        const meus = typesOf(p).filter(Boolean);
        if (!meus.length || !t1) return 1;
        return Math.max(...meus.map(a => typeMult(a, t1, t2)));
    }
    function effLabel(e) { return `x${Math.round(e * 100) / 100}`; }
    // Hunt da espécie da missão (a de menor nível: o catálogo vem ordenado por nível).
    function dailyHuntFor(o) {
        if (!Array.isArray(huntCatalog) || !o) return null;
        const nome = normalize(o.name);
        return huntCatalog.find(h => o.speciesId && h.speciesId === o.speciesId)
            || huntCatalog.find(h => normalize(h.speciesName || '') === nome || normalize(h.name) === nome || h.slug === huntSlugFromName(o.name))
            || null;
    }
    // Nota de um Pokémon do time para a missão: efetividade × nível, com desconto (quadrático) abaixo do nível da hunt.
    function dailyBestPoke(o, hunt) {
        let best = null;
        const [ot1, ot2] = o.t1 ? [o.t1, o.t2] : typesOf({ speciesId: o.speciesId }); // opção sem tipo: o do creatures.json
        for (const p of team) {
            if (!p?.id) continue;
            const eff = pokeEffVs(p, ot1, ot2);
            const lv = Math.max(1, Number(p.level) || 1);
            const hl = Number(hunt?.level) || 0;
            const score = eff * lv * (hl && lv < hl ? (lv / hl) ** 2 : 1);
            if (score > 0 && (!best || score > best.score || (score === best.score && p.leader))) best = { p, eff, score };
        }
        return best;
    }
    // Opções da missão ordenadas pela nota do melhor Pokémon dividida pelos abates que faltam.
    function dailyRankOptions() {
        return (daily?.options || [])
            .map(o => {
                const hunt = dailyHuntFor(o);
                const best = hunt ? dailyBestPoke(o, hunt) : null;
                const falta = Math.max(1, o.qty - o.have);
                return { o, hunt, best, nota: best ? best.score / falta : 0 };
            })
            .filter(x => x.hunt && x.best)
            .sort((a, b) => b.nota - a.nota);
    }
    function noteDailyAuto(motivo, extra) {
        if (motivo === dailyAutoNote) return;
        dailyAutoNote = motivo;
        if (motivo) logEvent('daily-auto-espera', Object.assign({ motivo }, extra || {}));
        if (onDailyChange) { try { onDailyChange(); } catch { /* painel fechado */ } }
    }
    async function dailyAutoStep() {
        if (!dailyAutoOn() || dailyAutoBusy || !daily || daily.locked || daily.claimed || daily.done) return;
        if (daily.picked && dailyOnHunt()) { noteDailyAuto(''); return; }
        if (huntSwitch || tripRunning || swapPending || (typeof healBusy === 'function' && healBusy())) return;       // outra troca/viagem/cura em andamento: próximo tique
        dailyAutoBusy = true;
        try {
            try { await loadHuntCatalog(); }
            catch (err) { noteDailyAuto('não consegui ler as hunts do jogo', { erro: String(err?.message || err) }); return; }
            if (!team.length) { noteDailyAuto('esperando o time'); requestPokes(0); return; }
            if (!daily.picked) { await dailyAutoPick(); return; }
            dailyAutoGo();
        } finally { dailyAutoBusy = false; }
    }
    async function dailyAutoPick() {
        if (dailyPickTried === daily.resetAt) return;
        const plano = dailyRankOptions();
        const melhor = plano[0];
        dailyPickTried = daily.resetAt;
        if (!melhor) { noteDailyAuto('nenhuma opção com hunt conhecida', { opcoes: daily.options.map(o => o.name) }); return; }
        try {
            await gameApi(DAILY_PICK_URL, { method: 'POST', body: JSON.stringify({ idx: melhor.o.idx }) });
        } catch (err) { noteDailyAuto('o jogo recusou a escolha da missão', { erro: String(err?.message || err) }); return; }
        logEvent('daily-auto-escolha', { missao: melhor.o.name, idx: melhor.o.idx, hunt: melhor.hunt.slug, pokemon: melhor.best.p.name, eff: melhor.best.eff,
            opcoes: plano.map(x => ({ nome: x.o.name, pokemon: x.best.p.name, eff: x.best.eff, nota: Math.round(x.nota * 100) / 100 })) });
        noteDailyAuto('');
        await refreshDaily();
        if (daily?.picked && !daily.done && !daily.claimed) dailyAutoGo();
    }
    function dailyAutoGo() {
        const o = daily.options[daily.pickedIdx];
        const hunt = dailyHuntFor(o);
        if (!hunt) { noteDailyAuto(`não achei a hunt de ${daily.name}`); return; }
        let run = dailyRun && dailyRun.resetAt === daily.resetAt ? dailyRun : null;
        if (run?.over) { noteDailyAuto('a ida de hoje já falhou: faça na mão'); return; }
        if (run && (run.goes || 0) >= DAILY_GO_MAX) { noteDailyAuto(`já fui ${DAILY_GO_MAX} vezes hoje`); return; }
        if (run && Date.now() - (run.lastGoAt || 0) < DAILY_GO_RETRY_MS) return;
        const best = dailyBestPoke(o, hunt);
        const lider = teamLeader();
        const atual = huntSlug ? normalize(huntSlug) : null;
        if (!run) {
            const aqui = atual && !CITY_SLUGS.includes(atual) && atual !== hunt.slug ? atual : null;
            const from = aqui || (lastRealHunt && lastRealHunt !== hunt.slug ? lastRealHunt : null) || (prevHuntSlug !== hunt.slug ? prevHuntSlug : null);
            run = dailyRun = { resetAt: daily.resetAt, name: daily.name, slug: hunt.slug, from, leaderId: lider?.id || null, leaderName: lider?.name || null, goes: 0 };
        }
        const escolhido = best?.p || lider;
        Object.assign(run, { slug: hunt.slug, pokeId: escolhido?.id || null, pokeName: escolhido?.name || null, eff: best ? best.eff : null, goes: (run.goes || 0) + 1, lastGoAt: Date.now() });
        saveDailyRun();
        noteDailyAuto('');
        let summon = false;
        if (escolhido?.id && lider?.id && escolhido.id !== lider.id) {
            summon = sendGame({ type: 'poke-summon', pokeId: escolhido.id });
            requestPokes(1500);
        }
        switchHunt(hunt.slug, 1, 'daily-ida');
        logEvent('daily-auto-ida', { missao: daily.name, have: daily.have, qty: daily.qty, hunt: hunt.slug, nivelHunt: hunt.level, pokemon: escolhido?.name || null, eff: best ? best.eff : null, liderAntes: lider?.name || null, summon, volta: run.from, ida: run.goes });
        if (run.goes > 1) return;                                      // o aviso sai só na 1ª ida
        const who = playerName();
        const trocou = escolhido && lider && escolhido.id !== lider.id;
        postWebhook('alert', {
            content: `⚔️ ${who ? `**${who}**` : 'Sua conta'} foi fazer a Daily Kill (**${daily.name}** ${fmtNum(daily.have)}/${fmtNum(daily.qty)})${escolhido ? ` com **${escolhido.name}**` : ''}`,
            username: 'Poke Idle World',
            embeds: [{
                title: `Daily Kill sozinha: ${daily.name}`,
                description: (who ? `Conta: ${who}\n` : '') + `Hunt: ${hunt.slug} (lv ${hunt.level})\n`
                    + (escolhido ? `Pokémon: ${escolhido.name} lv ${escolhido.level}${best ? ` · efetividade ${effLabel(best.eff)}` : ''}${trocou ? ` (líder era ${lider.name})` : ' (já era o líder)'}\n` : '')
                    + `Volta para: ${run.from || '? (preencha "Voltar para")'}\nEm ${new Date().toLocaleString('pt-BR')}`,
                color: 0x5865f2,
            }],
        }, { evento: 'daily-auto-ida', missao: daily.name, hunt: hunt.slug });
    }
    // Devolve o líder de antes da daily (se ainda estiver no time e não for o líder atual).
    function dailyRestoreLeader(run) {
        if (!run?.leaderId || !team.some(p => p.id === run.leaderId)) return false;
        if (teamLeader()?.id === run.leaderId) return false;
        const ok = sendGame({ type: 'poke-summon', pokeId: run.leaderId });
        requestPokes(1500);
        logEvent('daily-auto-lider', { para: run.leaderName, enviado: ok });
        return ok;
    }
    // A entrada na hunt da daily não confirmou (switchHunt desistiu): devolve o líder, volta e não tenta mais hoje.
    function dailyGoFailed(slug) {
        const run = activeDailyRun();
        if (!run || run.slug !== slug) return;
        run.over = true;
        saveDailyRun();
        dailyRestoreLeader(run);
        logEvent('daily-auto-falhou', { hunt: slug, volta: run.from });
        noteDailyAuto('a ida de hoje falhou: faça na mão');
        if (run.from) switchHunt(run.from, 1, 'daily');
    }

    function scheduleDailyCheck(ms) {
        if (!dailyEnabled()) return;
        clearTimeout(dailyKillTimer);
        dailyKillTimer = setTimeout(() => { dailyKillTimer = null; dailyTick(true); }, ms);
    }

    // field-kill da espécie da missão: conta o abate; meta aparentemente batida antecipa a consulta.
    function noteDailyKill(message) {
        if (!dailyEnabled() || !daily?.picked || daily.claimed || !message?.speciesName) return;
        if (normalize(message.speciesName) !== normalize(daily.name)) return;
        dailyKillsHere++;
        if (!daily.done) {
            daily.have++;
            if (daily.have >= daily.qty) scheduleDailyCheck(DAILY_AFTER_KILL_MS);
        }
        if (onDailyChange) { try { onDailyChange(); } catch { /* painel fechado */ } }
    }

    function dailyTick(force) {
        if (!dailyEnabled() || dailyRunning) return;
        const gap = dailyOnHunt() ? DAILY_POLL_HUNT_MS : DAILY_POLL_IDLE_MS;
        if (!force && dailyFetchedAt && Date.now() - dailyFetchedAt < gap) return daily ? dailyAutoStep() : undefined;
        return refreshDaily().then(() => (daily ? handleDailyState() : undefined));
    }

    async function refreshDaily() {
        dailyRunning = true;
        try {
            const novo = parseDaily(await gameApi(DAILY_URL));
            if (daily && novo.resetAt !== daily.resetAt) { dailySeenUnclaimed = false; dailyKillsHere = 0; } // virou o dia
            const velha = dailyRun && !dailyRun.over && dailyRun.resetAt && novo.resetAt && dailyRun.resetAt !== novo.resetAt ? dailyRun : null;
            daily = novo;
            if (velha) {                                              // virou o dia no meio da ida: desfaz e larga
                velha.over = true; saveDailyRun();
                dailyRestoreLeader(velha);
                logEvent('daily-auto-virou-dia', { missao: velha.name, volta: velha.from });
                if (velha.from && huntSlug && normalize(huntSlug) === velha.slug) switchHunt(velha.from, 1, 'daily');
            }
            if (daily.picked && !daily.claimed) dailySeenUnclaimed = true;
            const sig = JSON.stringify([daily.picked, daily.name, daily.done, daily.claimed, daily.locked, daily.resetAt]);
            if (sig !== dailySig) {
                dailySig = sig;
                logEvent('daily', { missao: daily.name, have: daily.have, qty: daily.qty, done: daily.done, resgatada: daily.claimed, bloqueada: daily.locked, naHunt: dailyOnHunt(), volta: dailyReturnTarget() });
            }
        } catch (err) {
            logEvent('daily-erro', { erro: String(err?.message || err) });
        } finally {
            dailyFetchedAt = Date.now();
            dailyRunning = false;
            if (onDailyChange) { try { onDailyChange(); } catch { /* painel fechado */ } }
        }
    }

    async function handleDailyState() {
        const d = daily;
        if (d.locked) return;
        if (!d.picked || !(d.done || d.claimed)) return dailyAutoStep(); // sem missão / ainda caçando
        const marca = d.resetAt || Math.floor(Date.now() / 86400000);
        if (dailyHandledReset === marca) return;                    // já tratada
        dailyHandledReset = marca;
        const onHunt = dailyOnHunt();
        const run = dailyAutoOn() ? activeDailyRun() : null;       // a daily sozinha trouxe a conta até aqui
        if (d.claimed && !dailySeenUnclaimed && !run) {                     // já estava resgatada quando a vimos: não foi a gente
            logEvent('daily-pronta', { missao: d.name, resgatada: true, naHunt: onHunt, acao: 'nada (já estava resgatada)' });
            return;
        }
        let payout = null, erroResgate = null;
        if (!d.claimed && cfg.dailyClaim) {
            try {
                const r = await gameApi(DAILY_CLAIM_URL, { method: 'POST', body: '{}' });
                payout = r?.payout || {};
                d.claimed = true;
                if (r?.state) daily = Object.assign(parseDaily(r.state), { claimed: true });
                requestPokes(1500);                                 // o XP foi para o líder: reconfere nível/rota
            } catch (err) { erroResgate = String(err?.message || err); }
        }
        const dest = onHunt || run ? dailyReturnTarget() : null;
        const atual = huntSlug ? normalize(huntSlug) : null;
        const volta = Boolean(dest && dest !== atual);
        const liderDevolvido = run ? dailyRestoreLeader(run) : false;
        if (run) { run.over = true; saveDailyRun(); }
        if (volta) switchHunt(dest, 1, 'daily');
        logEvent('daily-pronta', { missao: d.name, have: d.have, qty: d.qty, resgatada: d.claimed, xp: payout ? (Number(payout.xp) || 0) : null, erroResgate, naHunt: onHunt, volta: volta ? dest : null, sozinha: Boolean(run), lider: liderDevolvido ? run.leaderName : null });
        const who = playerName();
        const mention = cfg.mentionUserId ? `<@${cfg.mentionUserId}> ` : '';
        const itens = Array.isArray(payout?.items) ? payout.items.map(i => i?.label || i?.name).filter(Boolean) : [];
        const recompensa = payout
            ? `Recompensa: +${fmtNum(Number(payout.xp) || 0)} XP${itens.length ? ` · ${itens.join(' · ')}` : ''}${payout.leveledUp ? ` · líder subiu para o nível ${payout.level}` : ''}`
            : erroResgate ? `Resgate falhou: ${erroResgate} — resgate no jogo, em Dailys`
            : d.claimed ? 'Recompensa resgatada no jogo' : 'Resgate automático desligado: resgate no jogo, em Dailys';
        const destino = volta ? `Voltando para a hunt **${dest}**`
            : onHunt || run ? 'Não sei para onde voltar: entre na hunt na mão (ou preencha "Voltar para" no painel 🔔)'
            : `A conta não estava na hunt da daily (segue em ${atual || 'cidade'})`;
        const lider = liderDevolvido ? `\nLíder devolvido: ${run.leaderName}` : '';
        postWebhook('alert', {
            content: `${mention}✅ ${who ? `**${who}**` : 'Sua conta'} terminou a Daily Kill (**${d.name}**)${volta ? ` — voltando para **${dest}**` : ''}`,
            username: 'Poke Idle World',
            embeds: [{
                title: `Daily Kill concluída: ${d.name}`,
                description: (who ? `Conta: ${who}\n` : '') + `Missão: ${d.name} ${fmtNum(d.have)}/${fmtNum(d.qty)}\n${recompensa}\n${destino}${lider}\nEm ${new Date().toLocaleString('pt-BR')}`,
                color: volta || !(onHunt || run) ? 0x57f287 : 0xfee75c,
            }],
        }, { evento: 'daily-pronta', missao: d.name, volta: volta ? dest : null });
    }

    // ---- Evolução automática: evoluir quem do time chegou ao nível, com as pedras, na cidade (v3.25.0) ----
    //   Levantado no bundle do cliente em 02/10/2026 (janela "Evolve" do HUD do time, componente `ns`):
    //   GET  /api/game/evolve?capturedId=<id>[&destId=<speciesId>] -> { name, level, needLevel, canEvolve, hasStones,
    //        keepLevel, destName, destId?, itemOnly, stones:[{ itemId, name, need, have, icon }],
    //        branches:[{ destId, destName, needLevel, canEvolve, hasStones, stones:[...] }] }  (branches = linha ramificada,
    //        ex. Eevee: cada pedra leva a um destino; o cliente manda destId na 2ª leitura e no POST)
    //   POST /api/game/evolve { capturedId, useStone: true|false, destId? } -> { name }  (nome novo). useStone:true gasta
    //        as pedras e MANTÉM o nível; useStone:false é grátis mas volta ao Lv.1 — o script SÓ evolui com pedra (pedido
    //        do usuário). Depois o cliente manda `pokes-get`.
    //   O botão do HUD só funciona em Cerulean ("Evolution is only allowed in Cerulean — return to town"): a evolução é
    //   tarefa da viagem à cidade (`evoluir`); se a cidade da viagem não for Cerulean, manda `set-city cerulean` antes.
    //   Candidato: Pokémon do TIME no frame `pokes` (`team`, `hasEvolution`, `evolveNeedLevel`, `evolvesToName`, campos
    //   vistos em `pokes-campos` em 02/10/2026) com level >= evolveNeedLevel. Uma viagem pedida por Pokémon por episódio
    //   (`evolveAttempted`); rearma no Salvar, quando ele evolui/sai do time ou deixa de estar no nível. Faltando pedra,
    //   avisa uma vez (repete só se o motivo mudar) e tenta de novo a cada viagem (carona).
    //   Formatos só valem como confirmados depois de aparecerem no log `evolucao` (traz `campos` da resposta).

    const EVOLVE_URL = '/api/game/evolve';
    const EVOLVE_CITY = 'cerulean';
    const EVOLVE_CITY_WAIT_MS = 2000;

    let evolveTeam = [];            // [{ id, name, level, need, dest }] do último frame `pokes` (time com evolução por nível)
    const evolveAttempted = {};     // id -> true depois de pedir a viagem neste episódio
    const evolveFailed = {};        // id -> motivo da última falha (não repete o aviso enquanto for o mesmo)
    let evolveLast = null;          // { at, feitos, falhas } da última viagem (painel)
    let onEvolveChange = null;      // callback do painel

    function evolveNotify() { if (onEvolveChange) { try { onEvolveChange(); } catch { /* painel fechado */ } } }
    function evolveReady(p) { return Number(p.level) >= Number(p.need); }
    function evolveCandidates() { return evolveTeam.filter(evolveReady); }
    function evolveWanted() { return Boolean(cfg.evolveEnabled) && evolveCandidates().length > 0; }

    // Frame `pokes`: guarda quem do time evolui por nível e, no nível, pede a viagem (uma vez por Pokémon por episódio).
    function evolveOnPokes(list) {
        evolveTeam = (Array.isArray(list) ? list : [])
            .filter(p => p && p.team && p.hasEvolution && Number(p.evolveNeedLevel) > 0)
            .map(p => ({ id: String(p.id), name: p.name, level: Number(p.level) || 0, need: Number(p.evolveNeedLevel), dest: p.evolvesToName || null }));
        for (const id of Object.keys(evolveAttempted)) {
            const p = evolveTeam.find(x => x.id === id);
            if (!p || !evolveReady(p)) { delete evolveAttempted[id]; delete evolveFailed[id]; }   // evoluiu, saiu do time ou (estágio novo) ainda não está no nível
        }
        evolveNotify();
        if (!cfg.evolveEnabled) return;
        const pedir = evolveCandidates().filter(p => !evolveAttempted[p.id]);
        if (!pedir.length) return;
        for (const p of pedir) evolveAttempted[p.id] = true;
        tripRequest('evoluir', null, pedir.map(p => `${p.name} lv ${p.level}${p.dest ? ` → ${p.dest}` : ''}`).join(', '));
    }
    // `poke-xp` com leveledUp: confere o time (o frame `pokes` é quem decide).
    function evolveOnPokeXp(message) { if (cfg.evolveEnabled && message?.leveledUp) requestPokes(0); }

    const evolveStonesTxt = (stones) => (Array.isArray(stones) ? stones : []).map(s => `${s.need}x ${s.name}${s.have != null ? ` (tem ${s.have})` : ''}`).join(', ');

    // Tarefa da viagem (na cidade): lê a janela de evolução de cada candidato e evolui com pedra quando o jogo deixa.
    async function evolveCityWork() {
        if (!cfg.evolveEnabled) return { ok: true, motivo: 'desligado' };
        const cand = evolveCandidates();
        if (!cand.length) return { ok: true, motivo: 'ninguém do time no nível de evoluir' };
        if (tripCity() !== EVOLVE_CITY) {
            logEvent('evolucao-cidade', { de: tripCity(), para: EVOLVE_CITY });
            sendGame({ type: 'set-city', slug: EVOLVE_CITY });
            await new Promise(r => setTimeout(r, EVOLVE_CITY_WAIT_MS));
        }
        const feitos = [], falhas = [];
        for (const p of cand) {
            let info = null, motivo = null, destId = null, pedras = null, para = null;
            try {
                info = await gameApi(`${EVOLVE_URL}?capturedId=${encodeURIComponent(p.id)}`);
                const ramos = Array.isArray(info?.branches) ? info.branches : [];
                if (ramos.length) {
                    const prontos = ramos.filter(b => b && b.canEvolve && b.hasStones);
                    if (prontos.length === 1) { destId = prontos[0].destId; pedras = prontos[0].stones; para = prontos[0].destName; }
                    else if (!prontos.length) motivo = `faltam pedras (${ramos.map(b => `${b.destName}: ${evolveStonesTxt(b.stones) || '?'}`).join(' · ')})`;
                    else motivo = `linha ramificada com pedra para ${prontos.map(b => b.destName).join(' e ')}: escolha no jogo`;
                } else if (!info || info.canEvolve !== true) motivo = `o jogo diz que ainda não pode (nível ${info?.level ?? '?'}, precisa ${info?.needLevel ?? '?'})`;
                else if (!info.hasStones) motivo = `faltam pedras (${evolveStonesTxt(info.stones) || 'sem lista'})`;
                else { pedras = info.stones; para = info.destName; }
                if (!motivo) {
                    const body = Object.assign({ capturedId: p.id, useStone: true }, destId != null ? { destId } : {});
                    const r = await gameApi(EVOLVE_URL, { method: 'POST', body: JSON.stringify(body) });
                    para = r?.name || para || p.dest;
                    feitos.push({ id: p.id, de: p.name, para, level: p.level, pedras: evolveStonesTxt(pedras).replace(/ \(tem \d+\)/g, '') });
                }
            } catch (err) { motivo = `erro: ${err?.message || err}`; }
            if (motivo) falhas.push({ id: p.id, name: p.name, dest: info?.destName || p.dest, motivo });
            logEvent('evolucao', { id: p.id, name: p.name, level: p.level, ok: !motivo, para: motivo ? null : para, destId, motivo, campos: info && typeof info === 'object' ? Object.keys(info) : null });
        }
        evolveLast = { at: Date.now(), feitos, falhas };
        setTimeout(() => sendGame({ type: 'pokes-get' }), 1000);   // o time novo (nome, hasEvolution) rearma/limpa os candidatos
        const novas = falhas.filter(f => evolveFailed[f.id] !== f.motivo);
        for (const f of falhas) evolveFailed[f.id] = f.motivo;
        if (feitos.length || novas.length) {
            const who = playerName();
            const mention = cfg.mentionUserId ? `<@${cfg.mentionUserId}> ` : '';
            const linhas = feitos.map(f => `${f.de} → **${f.para}** (lv ${f.level} mantido${f.pedras ? `, gastou ${f.pedras}` : ''})`)
                .concat(novas.map(f => `⚠ ${f.name}${f.dest ? ` → ${f.dest}` : ''}: ${f.motivo}`));
            postWebhook('alert', {
                content: `${mention}🧬 ${who ? `**${who}**` : 'Sua conta'} ${feitos.length ? `evoluiu ${feitos.map(f => `**${f.de}** em **${f.para}**`).join(' e ')}` : `não conseguiu evoluir ${novas.map(f => `**${f.name}**`).join(' e ')}`}`,
                username: 'Poke Idle World',
                embeds: [{
                    title: feitos.length ? (falhas.length ? 'Evolução parcial' : 'Evolução') : 'Evolução não feita',
                    description: (who ? `Conta: ${who}\n` : '') + linhas.join('\n') + `\nEm ${new Date().toLocaleString('pt-BR')}`,
                    color: feitos.length ? (falhas.length ? 0xfee75c : 0x57f287) : 0xed4245,
                }],
            }, { evento: feitos.length ? 'evolucao' : 'evolucao-falhou', ids: cand.map(p => p.id) });
        }
        evolveNotify();
        return { ok: falhas.length === 0, motivo: falhas.length ? falhas.map(f => `${f.name}: ${f.motivo}`).join('; ') : null, feitos: feitos.length, falhas: falhas.length };
    }

    // Linha do painel.
    function evolveStatus(d) {
        d = d || cfg;
        if (!evolveTeam.length) return 'ninguém do time evolui por nível (ou o time ainda não foi lido)';
        const partes = evolveTeam.map(p => `${p.name} ${p.level}/${p.need}${p.dest ? ` → ${p.dest}` : ''}${evolveReady(p) ? (d.evolveEnabled ? (evolveAttempted[p.id] ? ' ✔ viagem pedida' : ' ✔ pronto') : ' ✔ no nível') : ''}`);
        const ult = evolveLast ? ` · última viagem: ${evolveLast.feitos.length ? `evoluiu ${evolveLast.feitos.map(f => f.para).join(', ')}` : ''}${evolveLast.falhas.length ? `${evolveLast.feitos.length ? '; ' : ''}${evolveLast.falhas.map(f => `${f.name}: ${f.motivo}`).join('; ')}` : ''}` : '';
        return partes.join(' · ') + ult;
    }

    // ---- Poke Slot Machine: girar de graça, ativar o bônus no Pokémon pedido (ou num qualquer) e avisar (v3.26.0) ----
    //   O NPC "Poke Slot Machine" (kind `pokeslot`, "Sorteie bônus por espécie na máquina") fica na cidade `shopping`;
    //   por dentro o jogo chama o sistema de "golden stars". Levantado no bundle do cliente em 02/10/2026 (componente `a0`
    //   da janela; formatos ainda não vistos no log — o log `slot-campos` registra as chaves na 1ª leitura):
    //   GET  /api/game/golden-stars -> { cards, cardIcon, cardItemId, isVip, slots:[{ slot, unlocked, unlockedPerm,
    //        unlockedUntil, vipLocked, freeReady, freeRollAt, active:{ speciesId, name, looktype, pct, bonusType, rarity,
    //        startedAt, expiresAt } | null, expired:{ name, ... } | null, candidates:[{ speciesId, name, looktype }] | null,
    //        unlockPerm, unlockTemp }], config:{ rarities:[{ key, color, min, max }], bonuses:[{ type, icon }], candidates (9),
    //        freeRollCooldownMs, rollCostCards, rerollCostCards, rerollBonusCards, pickSpeciesCards } }
    //   POST /api/game/golden-stars/roll { slot } -> { state, candidates:[...] }  (grátis com `freeReady`; senão gasta Poke Slot
    //        Cards — o script NUNCA gasta: só gira slot com roll grátis pronto)
    //   POST /api/game/golden-stars/pick { slot, speciesId } -> { active, state }  (speciesId de `candidates`; bônus, % e
    //        raridade são sorteados aqui; "a estrela atual continua até você escolher um Pokémon")
    //   Não usados: POST .../reroll-bonus { slot } (1 card), GET .../species?slot= + POST .../species { slot, speciesId }
    //   (escolha direta, 5 cards), POST .../unlock { slot, mode:'perm'|'temp' }, GET .../history?limit=. Depois de mudar
    //   algo o cliente manda `golden-stars-refresh` pelo socket (só para o HUD).
    //   Regras (texto do próprio jogo): o bônus vale SÓ nas interações com a espécie sorteada (EXP, loot, captura, dano,
    //   defesa, crítico, shiny); cada slot tem um roll grátis a cada `freeRollCooldownMs` (12 h, texto "Como funciona" do jogo em
    //   02/10/2026; depois 1 card por roll); ao rolar escolhe-se 1 entre 9; faixas por raridade: Comum +5–10%, Incomum +10–15%,
    //   Raro +15–20%, Épico +20–25%, Lendário +25–35%;
    //   dois slots nunca repetem a mesma espécie nem o mesmo tipo de bônus; só entram espécies de hunts liberadas para o
    //   nível da conta. Slot 1 é de todos; os outros se desbloqueiam (ouro/diamante/VIP).
    //   Fluxo: tique de 1 min lê o estado (de novo quando o próximo roll grátis vence ou uma estrela expira; no máximo a
    //   cada 30 min). Slot "pronto" = liberado, sem trava de VIP e com sorteio esperando escolha OU roll grátis sem uma
    //   estrela ativa que já seja um dos Pokémon pedidos. Com slot pronto pede viagem à cidade (`tripRequest('slot')`, e
    //   vai de carona em toda viagem); na cidade, `slotCityWork` manda `set-city shopping` se a viagem foi para outra
    //   cidade, faz o roll grátis de cada slot pronto e escolhe o 1º da lista `cfg.slotWanted` que estiver entre os
    //   sorteados — nenhum deles saiu = escolhe um sorteado qualquer (pedido do usuário). Aviso no canal de Alertas.
    //   Erro (leitura, roll ou escolha) = espera 15 min antes de tentar de novo o mesmo slot.

    const SLOT_URL = '/api/game/golden-stars';
    const SLOT_CITY = 'shopping';               // cidade do NPC (lista de NPCs do bundle: `shopping:pokeslot`)
    const SLOT_CITY_WAIT_MS = 2000;
    const SLOT_TICK_MS = 60 * 1000;
    const SLOT_POLL_MS = 30 * 60 * 1000;        // relê o estado de meia em meia hora (antes disso só quando um prazo vence)
    const SLOT_RETRY_MS = 15 * 60 * 1000;       // espera depois de um erro, e antes de insistir no mesmo slot
    const SLOT_BETWEEN_MS = [1200, 2500];       // entre o roll e a escolha, e entre slots ("humano")
    const SLOT_BONUS = { exp: 'EXP', loot: 'Loot', catch: 'Captura', damage: 'Dano', defense: 'Defesa', critChance: 'Chance de crítico', critDamage: 'Dano crítico', shiny: 'Chance de shiny' };
    const SLOT_RARITY = { common: 'Comum', uncommon: 'Incomum', rare: 'Raro', epic: 'Épico', legendary: 'Lendário' };

    let slotState = null;        // última leitura (parseSlotState)
    let slotFetchedAt = 0;
    let slotBusy = false;        // lendo o estado
    let slotWorking = false;     // na cidade, girando
    let slotFailedAt = 0;        // último erro (leitura/roll/escolha)
    let slotLast = null;         // { at, feitos:[{ slot, name, pct, bonusType, rarity, expiresAt, aleatorio, candidatos }], falhas:[{ slot, motivo }] }
    let slotSig = '';
    let slotFieldsLogged = false;
    const slotTriedAt = {};      // slot -> quando foi girado/falhou por último (não insiste antes de SLOT_RETRY_MS)
    let onSlotChange = null;     // callback do painel

    function slotEnabled(d) { return Boolean((d || cfg).slotEnabled); }
    // Chave de comparação de espécie: minúsculas, sem acento, e espaço/`_`/`-` equivalentes (v3.26.1: os outros campos do painel
    // viram slug `ancient_pinsir`, e o usuário escreve assim por hábito; o sorteio traz "Ancient Pinsir").
    const slotKey = (name) => normalize(name).replace(/[\s_-]+/g, ' ').trim();
    // Lista de Pokémon pedidos, em ordem de preferência (vírgula, ponto e vírgula ou linha), normalizada e sem repetição.
    function slotWantedList(d) {
        const out = [];
        for (const p of String((d || cfg).slotWanted || '').split(/[,;\n]+/)) { const n = slotKey(p); if (n && !out.includes(n)) out.push(n); }
        return out;
    }
    function slotNotify() { if (onSlotChange) { try { onSlotChange(); } catch { /* painel fechado */ } } }
    const slotRnd = (par) => par[0] + Math.floor(Math.random() * (par[1] - par[0] + 1));
    const slotWait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    const slotHora = (ts) => (ts ? new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '?');
    function slotFmtLeft(ms) {
        ms = Math.max(0, Number(ms) || 0);
        const h = Math.floor(ms / 36e5), m = Math.round((ms % 36e5) / 6e4);
        return h > 0 ? `${h}h${m ? String(m).padStart(2, '0') : ''}` : `${Math.max(1, m)}min`;
    }
    const slotBonusName = (t) => SLOT_BONUS[t] || String(t || '?');
    const slotRarityName = (r) => SLOT_RARITY[r] || String(r || '?');
    const slotStarText = (a) => `${a.name} +${a.pct}% ${slotBonusName(a.bonusType)}${a.rarity ? ` (${slotRarityName(a.rarity)})` : ''}`;

    function parseSlotActive(a) {
        if (!a || typeof a !== 'object') return null;
        return { speciesId: Number(a.speciesId) || 0, name: String(a.name || '?'), pct: Number(a.pct) || 0, bonusType: String(a.bonusType || ''), rarity: String(a.rarity || ''), startedAt: Number(a.startedAt) || 0, expiresAt: Number(a.expiresAt) || 0 };
    }
    const parseSlotCands = (list) => (Array.isArray(list) && list.length ? list.map(c => ({ speciesId: Number(c?.speciesId) || 0, name: String(c?.name || '?') })) : null);
    function parseSlotState(s) {
        const slots = (Array.isArray(s?.slots) ? s.slots : []).map((x, i) => ({
            slot: Number.isFinite(Number(x?.slot)) ? Number(x.slot) : i,
            unlocked: Boolean(x?.unlocked), vipLocked: Boolean(x?.vipLocked),
            freeReady: Boolean(x?.freeReady), freeRollAt: Number(x?.freeRollAt) || 0,
            active: parseSlotActive(x?.active),
            candidates: parseSlotCands(x?.candidates),
        }));
        return { cards: Number(s?.cards) || 0, cooldownMs: Number(s?.config?.freeRollCooldownMs) || 0, nCandidates: Number(s?.config?.candidates) || 0, slots };
    }
    function slotActive(x, now) { return x?.active && x.active.expiresAt > (now || Date.now()) ? x.active : null; }
    // Slots que valem uma ida à máquina (ver o cabeçalho). `st` = estado a usar (padrão: o último lido).
    function slotReadySlots(d, st) {
        d = d || cfg; st = st || slotState;
        if (!st) return [];
        const wanted = slotWantedList(d);
        const now = Date.now();
        return st.slots.filter(x => {
            if (!x.unlocked || x.vipLocked) return false;
            if (x.candidates) return true;
            if (!x.freeReady) return false;
            const a = slotActive(x, now);
            return !(a && wanted.includes(slotKey(a.name)));
        });
    }
    // Os prontos em que o script ainda não insistiu há pouco (girados ou com erro nos últimos SLOT_RETRY_MS).
    function slotPending(d, st) { const now = Date.now(); return slotReadySlots(d, st).filter(x => !(slotTriedAt[x.slot] && now - slotTriedAt[x.slot] < SLOT_RETRY_MS)); }
    function slotWanted(d) { return slotEnabled(d) && !slotWorking && slotPending(d).length > 0; }   // carona na viagem
    // Próximo prazo que muda o estado sem ler de novo: roll grátis vencendo ou estrela expirando.
    function slotNextEventAt(st) {
        st = st || slotState;
        const ts = [];
        for (const x of st?.slots || []) {
            if (!x.unlocked || x.vipLocked) continue;
            if (!x.freeReady && x.freeRollAt > 0) ts.push(x.freeRollAt);
            if (x.active && x.active.expiresAt > 0) ts.push(x.active.expiresAt);
        }
        return ts.length ? Math.min(...ts) : 0;
    }
    function slotDue() {
        if (!slotState) return true;
        const now = Date.now();
        if (now - slotFetchedAt >= SLOT_POLL_MS) return true;
        const ev = slotNextEventAt();
        return ev > 0 && ev <= now && slotFetchedAt < ev;
    }
    // Com slot pronto, pede a viagem (idempotente: `tripRequest` guarda por chave).
    function slotAsk() {
        if (!slotEnabled() || slotWorking) return;
        if (slotFailedAt && Date.now() - slotFailedAt < SLOT_RETRY_MS) return;
        const pend = slotPending();
        if (pend.length) tripRequest('slot', null, pend.map(x => `slot ${x.slot + 1} (${x.candidates ? 'sorteio esperando escolha' : 'roll grátis'})`).join(', '));
    }
    function slotTick(force) {
        if (!slotEnabled() || slotBusy || slotWorking) return;
        if (!force && slotFailedAt && Date.now() - slotFailedAt < SLOT_RETRY_MS) return;
        if (!force && !slotDue()) { slotAsk(); return; }
        return slotRead().then(() => slotAsk());
    }
    async function slotRead() {
        slotBusy = true;
        try {
            const raw = await gameApi(SLOT_URL);
            if (!slotFieldsLogged && raw && typeof raw === 'object') {
                slotFieldsLogged = true;
                const s0 = Array.isArray(raw.slots) ? raw.slots.find(x => x && typeof x === 'object') : null;
                logEvent('slot-campos', { chaves: Object.keys(raw), slot: s0 ? Object.keys(s0) : null, ativa: s0?.active && typeof s0.active === 'object' ? Object.keys(s0.active) : null, config: raw.config && typeof raw.config === 'object' ? Object.keys(raw.config) : null });
            }
            slotState = parseSlotState(raw);
            slotFailedAt = 0;
            const sig = JSON.stringify(slotState.slots.map(x => [x.unlocked, x.vipLocked, x.freeReady, x.freeRollAt, x.active?.name, x.active?.expiresAt, x.candidates?.length || 0]));
            if (sig !== slotSig) {
                slotSig = sig;
                logEvent('slot', {
                    cards: slotState.cards, gratisACada: slotState.cooldownMs ? slotFmtLeft(slotState.cooldownMs) : null,
                    slots: slotState.slots.map(x => ({ slot: x.slot, liberado: x.unlocked, vip: x.vipLocked, gratis: x.freeReady, gratisEm: !x.freeReady && x.freeRollAt ? new Date(x.freeRollAt).toISOString() : null, ativa: x.active ? slotStarText(x.active) : null, ate: x.active ? new Date(x.active.expiresAt).toISOString() : null, sorteados: x.candidates ? x.candidates.map(c => c.name) : null })),
                });
            }
        } catch (err) {
            slotFailedAt = Date.now();
            logEvent('slot-erro', { etapa: 'leitura', erro: String(err?.message || err) });
        } finally {
            slotFetchedAt = Date.now();
            slotBusy = false;
            slotNotify();
        }
        return slotState;
    }

    // Tarefa da viagem (na cidade): relê a máquina, vai ao shopping se a viagem foi para outra cidade e, em cada slot
    // pronto, faz o roll grátis (ou usa o sorteio pendente) e escolhe o Pokémon.
    async function slotCityWork() {
        if (!slotEnabled()) return { ok: true, motivo: 'desligado' };
        slotWorking = true;
        const feitos = [], falhas = [];
        const wanted = slotWantedList();
        try {
            await slotRead();
            if (!slotState) return { ok: false, motivo: 'não consegui ler a máquina' };
            const pend = slotPending();
            if (!pend.length) return { ok: true, motivo: 'nenhum slot com roll grátis pronto' };
            if (tripCity() !== SLOT_CITY) {
                logEvent('slot-cidade', { de: tripCity(), para: SLOT_CITY });
                sendGame({ type: 'set-city', slug: SLOT_CITY });
                await slotWait(SLOT_CITY_WAIT_MS);
            }
            for (const x of pend) {
                let etapa = 'roll';
                slotTriedAt[x.slot] = Date.now();
                try {
                    let cands = x.candidates;
                    if (!cands) {
                        const r = await gameApi(`${SLOT_URL}/roll`, { method: 'POST', body: JSON.stringify({ slot: x.slot }) });
                        cands = parseSlotCands(r?.candidates) || parseSlotCands(r?.state?.slots?.find?.(s => Number(s?.slot) === x.slot)?.candidates);
                        if (r?.state) slotState = parseSlotState(r.state);
                        if (!cands) throw new Error('o roll não devolveu os sorteados');
                        await slotWait(slotRnd(SLOT_BETWEEN_MS));
                    }
                    etapa = 'escolha';
                    const nomes = cands.map(c => slotKey(c.name));
                    let escolha = null;
                    for (const w of wanted) { const i = nomes.indexOf(w); if (i >= 0) { escolha = cands[i]; break; } }
                    const aleatorio = !escolha;
                    if (!escolha) escolha = cands[Math.floor(Math.random() * cands.length)];
                    const r = await gameApi(`${SLOT_URL}/pick`, { method: 'POST', body: JSON.stringify({ slot: x.slot, speciesId: escolha.speciesId }) });
                    if (r?.state) slotState = parseSlotState(r.state);
                    const a = parseSlotActive(r?.active) || { name: escolha.name, pct: 0, bonusType: '', rarity: '', startedAt: 0, expiresAt: 0 };
                    const feito = Object.assign({ slot: x.slot, aleatorio, candidatos: cands.map(c => c.name) }, a);
                    feitos.push(feito);
                    logEvent('slot-roll', { slot: x.slot, candidatos: feito.candidatos, pedidos: wanted, escolhido: feito.name, aleatorio, bonus: feito.bonusType, pct: feito.pct, raridade: feito.rarity, ate: feito.expiresAt ? new Date(feito.expiresAt).toISOString() : null, campos: r?.active && typeof r.active === 'object' ? Object.keys(r.active) : null });
                } catch (err) {
                    falhas.push({ slot: x.slot, motivo: `${etapa}: ${err?.message || err}` });
                    logEvent('slot-erro', { etapa, slot: x.slot, erro: String(err?.message || err) });
                }
                await slotWait(slotRnd(SLOT_BETWEEN_MS));
            }
            slotLast = { at: Date.now(), feitos, falhas };
            await slotRead();                               // estado final (próximo roll grátis, estrela nova)
            if (falhas.length) slotFailedAt = Date.now();   // depois da releitura (ela zera o carimbo quando lê bem)
            if (feitos.length || falhas.length) slotNotifyDiscord(feitos, falhas, wanted);
            return { ok: falhas.length === 0, motivo: falhas.length ? falhas.map(f => `slot ${f.slot + 1} ${f.motivo}`).join('; ') : null, feitos: feitos.length, falhas: falhas.length };
        } finally {
            slotWorking = false;
            slotNotify();
        }
    }

    function slotNotifyDiscord(feitos, falhas, wanted) {
        const who = playerName();
        const mention = cfg.mentionUserId ? `<@${cfg.mentionUserId}> ` : '';
        const linhas = feitos.map(f => `Slot ${f.slot + 1}: **${slotStarText(f)}**${f.expiresAt ? ` até ${slotHora(f.expiresAt)}` : ''}${f.aleatorio && wanted.length ? ` — nenhum dos pedidos saiu (sorteados: ${f.candidatos.join(', ')})` : ''}`)
            .concat(falhas.map(f => `⚠ Slot ${f.slot + 1}: ${f.motivo}`));
        const resumo = feitos.length ? feitos.map(f => `**${f.name}** +${f.pct}% ${slotBonusName(f.bonusType)}`).join(' e ') : null;
        postWebhook('alert', {
            content: `${mention}🎰 ${who ? `**${who}**` : 'Sua conta'} ${resumo ? `girou a Poke Slot Machine: ${resumo}` : 'não conseguiu girar a Poke Slot Machine'}`,
            username: 'Poke Idle World',
            embeds: [{
                title: feitos.length ? (falhas.length ? 'Poke Slot Machine (parcial)' : 'Poke Slot Machine') : 'Poke Slot Machine: falhou',
                description: (who ? `Conta: ${who}\n` : '') + linhas.join('\n') + (wanted.length ? `\nPedidos: ${wanted.join(', ')}` : '') + `\nEm ${new Date().toLocaleString('pt-BR')}`,
                color: feitos.length ? (falhas.length || feitos.some(f => f.aleatorio) ? 0xfee75c : 0x57f287) : 0xed4245,
            }],
        }, { evento: 'slot', feitos: feitos.map(f => ({ slot: f.slot, name: f.name, aleatorio: f.aleatorio })), falhas: falhas.length });
    }

    // Linha do painel.
    function slotStatus(d) {
        d = d || cfg;
        if (!slotState) return slotFetchedAt ? 'não consegui ler a máquina (veja o log)' : (d.slotEnabled ? 'ainda não lida' : 'liga para ler a máquina');
        const now = Date.now();
        const wanted = slotWantedList(d);
        const partes = slotState.slots.map(x => {
            const n = `Slot ${x.slot + 1}`;
            if (!x.unlocked) return `${n}: bloqueado`;
            if (x.vipLocked) return `${n}: só VIP`;
            const a = slotActive(x, now);
            const estrela = a ? `★ ${slotStarText(a)} até ${slotHora(a.expiresAt)}` : 'sem estrela';
            const roll = x.candidates ? `${x.candidates.length} sorteados esperando escolha`
                : x.freeReady ? (a && wanted.includes(slotKey(a.name)) ? 'roll grátis pronto (segura o pedido até expirar)' : (slotWorking ? 'girando…' : 'roll grátis pronto → viagem'))
                : x.freeRollAt > now ? `grátis em ${slotFmtLeft(x.freeRollAt - now)}` : '';
            return `${n}: ${estrela}${roll ? ` · ${roll}` : ''}`;
        });
        const extra = [`${fmtNum(slotState.cards)} cards`];
        if (slotState.cooldownMs) extra.push(`roll grátis a cada ${slotFmtLeft(slotState.cooldownMs)}`);
        if (slotLast) extra.push(`última ida ${slotHora(slotLast.at)}: ${slotLast.feitos.map(f => `${f.name}${f.aleatorio ? ' (aleatório)' : ''}`).concat(slotLast.falhas.map(f => `slot ${f.slot + 1} ✖`)).join(', ') || 'nada'}`);
        return partes.concat(extra).join(' · ');
    }

    // ---- Daily Gift: resgatar o presente do dia (calendário de 28 dias) e entregar pelo Gift Center (v3.24.0) ----
    // O "Daily Gift" (🎁 do menu do jogo) é um calendário de 28 dias: um presente por dia, resgatado na mão. Não passa
    // pelo socket — a janela consulta por REST (levantado no bundle em 30/09/2026):
    //   GET  /api/game/daily    -> { canClaim, claimedToday, blockedByVip, nextDay, total, rewards:[{ day, label, qty, icon,
    //                                tag, claimed, current, locked }] }
    //   POST /api/game/daily {} -> o mesmo estado + claimed:{ label }. O presente NÃO vai para a mochila: cai no Gift Center
    //                              (correio 🎁), onde precisa de um 2º resgate para chegar à conta:
    //   GET  /api/game/gifts    -> { gifts:[{ id, label, icon, grantedBy }] }
    //   POST /api/game/gifts/{id}/claim {} -> { granted }
    // Fluxo: tique de 1 min; relê o calendário a cada 30 min (5 min enquanto não resgatou hoje e o jogo não disse por quê:
    // o dia pode virar), resgata quando `canClaim` e, no Gift Center, entrega o presente do dia (mesmo rótulo) ou tudo que
    // houver, conforme `cfg.giftCenterMode` ('daily' | 'all' | ''). Um aviso no canal de Alertas por resgate. Resgate que
    // falhou é tentado de novo em 30 min. Boosts entregues pelo Gift Center começam a contar na hora — por isso "tudo" é
    // opcional e o padrão é só o do dia.

    const GIFT_URL = '/api/game/daily';
    const GIFT_CENTER_URL = '/api/game/gifts';
    const GIFT_TICK_MS = 60 * 1000;
    const GIFT_POLL_MS = 30 * 60 * 1000;        // já resgatado hoje, bloqueado ou concluído: relê de meia em meia hora
    const GIFT_POLL_SHORT_MS = 5 * 60 * 1000;   // ainda não resgatado e sem motivo: o dia pode ter virado
    const GIFT_RETRY_MS = 30 * 60 * 1000;       // espera depois de um erro no resgate

    let gift = null;                 // último estado lido (ver parseGift)
    let giftFetchedAt = 0;
    let giftBusy = false;
    let giftFailedAt = 0;
    let giftTimer = null;
    let giftLast = null;             // { day, label, qty, tag, granted:[], at } do último resgate desta carga (status do painel)
    let giftCenterCount = null;      // quantos presentes sobraram no Gift Center na última leitura (null = não lido)
    let giftSig = '';
    let onGiftChange = null;         // callback do painel para redesenhar o status

    function giftEnabled() { return Boolean(cfg.giftEnabled); }
    function giftCenterMode(d) { d = d || cfg; return ['daily', 'all', ''].includes(d.giftCenterMode) ? d.giftCenterMode : 'daily'; }

    function parseGift(s) {
        const rewards = Array.isArray(s?.rewards) ? s.rewards : [];
        const total = Math.max(0, Number(s?.total) || rewards.length);
        const nextDay = Math.max(0, Number(s?.nextDay) || 0);
        const hoje = rewards.find(r => r?.current) || rewards.find(r => Number(r?.day) === nextDay) || null;
        return {
            canClaim: Boolean(s?.canClaim),
            claimedToday: Boolean(s?.claimedToday),
            blockedByVip: Boolean(s?.blockedByVip),
            nextDay, total,
            done: total > 0 && nextDay > total,
            label: hoje?.label ? String(hoje.label) : null,
            qty: Math.max(0, Number(hoje?.qty) || 0),
            tag: hoje?.tag ? String(hoje.tag) : null,
            claimedDays: rewards.filter(r => r?.claimed).length,
        };
    }
    function giftRewardText(g) { return g?.label ? `${g.label}${g.qty > 1 ? ` ×${fmtNum(g.qty)}` : ''}` : 'presente do dia'; }
    function giftStatus(d) {
        d = d || cfg;
        if (!d.giftEnabled) return 'desligado';
        if (!gift) return giftFetchedAt ? 'não consegui ler o calendário (veja o log)' : 'ainda não lido';
        const dia = `dia ${fmtNum(Math.min(gift.nextDay, gift.total) || gift.nextDay)}/${fmtNum(gift.total)}`;
        const centro = giftCenterCount ? ` · ${fmtNum(giftCenterCount)} no Gift Center` : '';
        if (giftBusy) return `${dia} · resgatando…`;
        if (gift.done) return `calendário concluído (${fmtNum(gift.total)} dias)${centro}`;
        if (gift.claimedToday) return `${dia} · resgatado hoje${giftLast ? `: ${giftRewardText(giftLast)}` : ''}${centro}`;
        if (gift.blockedByVip) return `${dia} · ${giftRewardText(gift)} só para VIP${centro}`;
        if (gift.canClaim) return `${dia} · ${giftRewardText(gift)} pronto para resgatar${giftFailedAt ? ' (o resgate falhou, tento de novo em 30 min)' : ''}${centro}`;
        return `${dia} · ainda não liberado hoje${centro}`;
    }
    function scheduleGiftCheck(ms) {
        if (!giftEnabled()) return;
        clearTimeout(giftTimer);
        giftTimer = setTimeout(() => { giftTimer = null; giftTick(true); }, ms);
    }
    function giftTick(force) {
        if (!giftEnabled() || giftBusy) return;
        const gap = gift && !gift.claimedToday && !gift.blockedByVip && !gift.done ? GIFT_POLL_SHORT_MS : GIFT_POLL_MS;
        if (!force && giftFetchedAt && Date.now() - giftFetchedAt < gap) return;
        return giftRun();
    }
    async function giftRun() {
        giftBusy = true;
        try {
            gift = parseGift(await gameApi(GIFT_URL));
            const sig = JSON.stringify([gift.nextDay, gift.canClaim, gift.claimedToday, gift.blockedByVip, gift.done]);
            if (sig !== giftSig) {
                giftSig = sig;
                logEvent('gift', { dia: gift.nextDay, total: gift.total, presente: gift.label, qty: gift.qty, pronto: gift.canClaim, resgatadoHoje: gift.claimedToday, vip: gift.blockedByVip, concluido: gift.done });
            }
            let resgatado = null;
            if (gift.canClaim && (!giftFailedAt || Date.now() - giftFailedAt >= GIFT_RETRY_MS)) {
                const antes = gift;
                try {
                    const r = await gameApi(GIFT_URL, { method: 'POST', body: '{}' });
                    const label = r?.claimed?.label ? String(r.claimed.label) : antes.label;
                    gift = Object.assign(parseGift(r), { claimedToday: true, canClaim: false });
                    resgatado = { day: antes.nextDay, label, qty: antes.qty, tag: antes.tag, granted: [], at: Date.now() };
                    giftFailedAt = 0;
                    logEvent('gift-resgate', { dia: antes.nextDay, presente: label, qty: antes.qty });
                } catch (err) {
                    giftFailedAt = Date.now();
                    logEvent('gift-erro', { etapa: 'resgate', dia: antes.nextDay, erro: String(err?.message || err) });
                }
            }
            const modo = giftCenterMode();
            if (modo && (resgatado || modo === 'all')) {
                const granted = await giftCenterSweep(modo === 'all' ? null : (resgatado?.label || null));
                if (resgatado) resgatado.granted = granted;
                else if (granted.length) giftNotify(null, granted);
            }
            if (resgatado) { giftLast = resgatado; giftNotify(resgatado, resgatado.granted); }
        } catch (err) {
            logEvent('gift-erro', { etapa: 'leitura', erro: String(err?.message || err) });
        } finally {
            giftFetchedAt = Date.now();
            giftBusy = false;
            if (onGiftChange) { try { onGiftChange(); } catch { /* painel fechado */ } }
        }
    }
    // Entrega o que está no Gift Center: tudo (`label` null) ou só os presentes com o rótulo dado (o do dia). Devolve o que
    // o jogo disse ter entregado (`granted`, um texto por presente).
    async function giftCenterSweep(label) {
        const granted = [];
        let lista;
        try {
            const r = await gameApi(GIFT_CENTER_URL);
            lista = Array.isArray(r?.gifts) ? r.gifts : [];
        } catch (err) {
            logEvent('gift-erro', { etapa: 'gift-center', erro: String(err?.message || err) });
            return granted;
        }
        const alvo = label ? lista.filter(g => normalize(g?.label) === normalize(label)) : lista;
        if (label && !alvo.length) logEvent('gift-center', { aviso: 'o presente do dia não apareceu no Gift Center', esperado: label, la: lista.map(g => g?.label) });
        for (const g of alvo) {
            if (!g?.id) continue;
            try {
                const r = await gameApi(`${GIFT_CENTER_URL}/${encodeURIComponent(g.id)}/claim`, { method: 'POST', body: '{}' });
                granted.push(r?.granted ? String(r.granted) : String(g.label || 'presente'));
            } catch (err) {
                logEvent('gift-erro', { etapa: 'gift-center-claim', id: g.id, presente: g.label, erro: String(err?.message || err) });
            }
        }
        giftCenterCount = Math.max(0, lista.length - granted.length);
        if (alvo.length) logEvent('gift-center', { modo: label ? 'dia' : 'tudo', entregues: granted, restantes: giftCenterCount });
        return granted;
    }
    function giftNotify(resgatado, granted) {
        const who = playerName();
        const mention = cfg.mentionUserId ? `<@${cfg.mentionUserId}> ` : '';
        const n = granted.length;
        const dia = resgatado ? `dia ${fmtNum(resgatado.day)}/${fmtNum(gift?.total || 28)}` : null;
        const presente = resgatado ? giftRewardText(resgatado) : null;
        const entregue = n ? `Entregue pelo Gift Center: ${granted.join(' · ')}`
            : !resgatado ? ''
            : giftCenterMode() ? 'Não consegui entregar pelo Gift Center: resgate no jogo, no correio 🎁 (veja o log)'
            : 'Ficou no Gift Center: resgate no jogo, no correio 🎁';
        postWebhook('alert', {
            content: `${mention}🎁 ${who ? `**${who}**` : 'Sua conta'} ${resgatado ? `resgatou o Daily Gift do ${dia}: **${presente}**` : `recebeu ${n} presente${n > 1 ? 's' : ''} do Gift Center`}`,
            username: 'Poke Idle World',
            embeds: [{
                title: resgatado ? `Daily Gift resgatado: ${presente}` : `Gift Center: ${n} presente${n > 1 ? 's' : ''} entregue${n > 1 ? 's' : ''}`,
                description: (who ? `Conta: ${who}\n` : '') + (resgatado ? `Calendário: ${dia}${resgatado.tag ? ` (${resgatado.tag})` : ''}\nPresente: ${presente}\n` : '') + (entregue ? `${entregue}\n` : '') + `Em ${new Date().toLocaleString('pt-BR')}`,
                color: n || !resgatado ? 0x57f287 : 0xfee75c,
            }],
        }, { evento: resgatado ? 'gift-resgate' : 'gift-center', dia: resgatado ? resgatado.day : null, presente, entregues: granted });
    }

    // ---- Breeding automático: subir a quality de um Pokémon de IV alto cruzando com comida mais fraca (v3.29.0) ----
    //   REST confirmado no log em 09/10/2026 (contas 2 e 3, farejador `rest-breeding` da v3.28.1; ver docs/mensagens-do-jogo.md →
    //   "Breeding Center"): `GET /api/game/breeding?action=center`, `?action=quote&parent1&parent2&free=1` e
    //   `POST { action:'breed', parent1, parent2, free, double }`. Resposta do `hatch` ainda NÃO vista (o ovo leva 3000 abates).
    //   Regras do jogo (texto da tela + 3 guias do Discord lidos em 09/10/2026): os 2 pais são CONSUMIDOS; o filho nasce com o IV
    //   (e a distribuição por stat, `ivPreview.growth`) do pai de MAIOR quality e quality = maior quality + Δ (Grátis: 0,005–0,04,
    //   esperado 0,01); o par precisa ter diferença de quality ≤ 0,15; custa 2.000.000 de gold + 20 stones do elemento do filho
    //   (40 com "dobrar", que dá 5% de +1 IV); choca com abates em hunt (`killsDone/killsRequired`); a incubadora tem 2 slots.
    //   A ORDEM DOS SLOTS NÃO DECIDE o doador (conta2, 03:29Z: fraco no slot 1, `donorId` = slot 2). O que "sobe" é a LINHAGEM:
    //   o escolhido ("quem sobe", tronco) vira o ovo e o filho passa a ser o escolhido da geração seguinte.
    //   Garantias (pedido do usuário, "SUPER IMPORTANTE"):
    //     - quem sobe vai sempre em `parent1`; a comida é da mesma espécie, com quality E IV MENORES que ele, quality até 0,15
    //       abaixo, IV abaixo do teto do painel (`breedFoodIvMax`), nunca shiny/time/inicial/travado/Ditto/anunciado;
    //     - antes de todo breed a cotação (free=1) tem de dizer `donorId` = quem sobe, `growth` somando o IV dele, `baseQuality` =
    //       quality dele, sem feromônio e sem filho shiny; qualquer diferença = NÃO cruza, avisa e espera;
    //     - quem sobe e toda a espécie dele ficam fora da venda automática e do depósito na família (`breedKeepsPoke`, usado em
    //       `pokeSellReason`/`depositPokeReason`), mesmo com IV abaixo da tabela;
    //     - só o caminho Grátis (que mesmo assim cobra gold + stones); nunca `hatch-now`/`buy-slot` (diamante).
    //   Comida e stones podem vir do depot da família (`breedFamily`): o frame `family` traz quality/ivTotal dos Pokémon e
    //   itemId/quantity dos itens (confirmado em `familia-campos`); a retirada (`family-action … dir:'withdraw'`, mesmo formato
    //   do depósito) acontece na viagem à cidade, tarefa `breeding`, seguida de cotação de novo, checklist e breed. Na hunt o
    //   módulo só lê (centro a cada 2 min, cotação quando tem comida no box) e choca quando o centro diz `ready`; o filho é
    //   achado no frame `pokes` (id novo da espécie, senão o único com o IV do tronco) e vira o tronco da linhagem.
    //   Sem comida/stone/gold: para, avisa 1x por motivo e tenta de novo a cada 30 min (a família pode abastecer).

    const BREED_URL = '/api/game/breeding';
    const BREED_TICK_MS = 60 * 1000;
    const BREED_POLL_MS = 2 * 60 * 1000;           // relê a incubadora (o progresso do ovo só existe por REST; a tela lê a cada 20 s)
    const BREED_FAMILY_POLL_MS = 10 * 60 * 1000;   // relê o depot da família
    const BREED_RETRY_MS = 30 * 60 * 1000;         // parado por falta de comida/stone/gold: volta a planejar depois disso
    const BREED_Q_GAP = 0.15;                      // o jogo exige diferença de quality ≤ 0,15 no breed normal
    const BREED_Q_EPS = 0.0005;
    const BREED_MAX_LINES = 2;
    const BREED_WAIT_MS = 5000;                    // espera por frame (`pokes`/`family`)
    const BREED_BETWEEN_MS = [1500, 3000];
    const BREED_GOLD_FEE_HINT = 2000000;           // taxa vista no log (serve só quando ainda não há cotação)
    const BREED_WARN_GAP_MS = 6 * 60 * 60 * 1000;  // repete o aviso do mesmo motivo só depois disso

    let breedCenter = null;        // última leitura do centro (parseBreedCenter)
    let breedCenterAt = 0;
    let breedCenterSig = '';
    let breedBusy = false;         // ciclo (centro/choca/plano) em andamento
    let breedWorking = false;      // tarefa da viagem em andamento
    const breedPlanned = {};       // id de quem sobe -> plano { foodId, foodName, foodQ, foodIv, origem, stones, at } (viagem pedida)
    let breedWait = null;          // { motivo, at } parado por falta de material (painel + aviso)
    const breedWarned = {};        // motivo -> quando avisou
    const breedHatchAsked = {};    // eggId -> true (chocar falhou na hunt: viagem pedida)
    let breedLast = null;          // { at, feitos, falhas } da última viagem
    let breedPokesSeq = 0;         // frames `pokes` vistos pelo módulo (espera por lista fresca)
    let breedFamilySeq = 0;        // frames `family` vistos pelo módulo
    let breedFamilyAskedAt = 0;
    let onBreedChange = null;      // callback do painel

    function breedEnabled(d) { return Boolean((d || cfg).breedEnabled); }
    function breedFoodIvMax(d) { return Math.max(0, Math.min(IV_MAX, Number((d || cfg).breedFoodIvMax) || 0)); }
    function breedNotify() { if (onBreedChange) { try { onBreedChange(); } catch { /* painel fechado */ } } }
    const breedQ = (q) => (Number.isFinite(Number(q)) ? Number(q).toFixed(3) : '?');
    const breedRnd = (par) => par[0] + Math.floor(Math.random() * (par[1] - par[0] + 1));
    const breedSleep = () => new Promise(r => setTimeout(r, breedRnd(BREED_BETWEEN_MS)));
    const breedHora = (ts) => new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    // Linhagens do painel (até 2), na posição em que foram escolhidas; vazia = null. Uma linhagem existe enquanto tiver quem
    // sobe (`id`), um ovo chocando (`eggId`) ou um filho por identificar (`pendingChild`).
    function breedLines(d) {
        const arr = Array.isArray((d || cfg).breedLines) ? (d || cfg).breedLines : [];
        const out = arr.slice(0, BREED_MAX_LINES).map(l => (l && typeof l === 'object' && (l.id || l.eggId || l.pendingChild)) ? l : null);
        while (out.length < BREED_MAX_LINES) out.push(null);
        return out;
    }
    function breedActiveLines(d) { return breedLines(d).filter(Boolean); }
    // Quem sobe, pelo id, na lista `pokes` (box).
    function breedTrunk(line) {
        if (!line?.id) return null;
        const p = lastPokesList.find(x => x && String(x.id) === String(line.id));
        if (!p) return null;
        return { id: String(p.id), name: p.name || '?', speciesId: Number(p.speciesId), quality: Number(p.quality), ivTotal: Number(p.ivTotal), level: Number(p.level) || 0, shiny: Boolean(p.shiny), team: Boolean(p.team || p.leader), starter: Boolean(p.starter) };
    }
    // Proteção: quem sobe e toda a espécie dele ficam fora da venda automática e do depósito na família.
    function breedKeepsPoke(p) {
        if (!cfg.breedEnabled || !p || typeof p !== 'object') return false;
        const id = String(p.id ?? ''), sp = Number(p.speciesId) || 0, nome = normalize(p.name || '');
        for (const l of breedActiveLines()) {
            if (l.id && String(l.id) === id) return true;
            const t = l.speciesId ? null : breedTrunk(l);   // linhagem recém-escolhida: espécie pelo box
            const lsp = Number(l.speciesId) || (t ? t.speciesId : 0), lnome = normalize(l.name || (t ? t.name : ''));
            if (lsp && sp && lsp === sp) return true;
            if (lnome && nome && lnome === nome) return true;
        }
        return false;
    }
    // Motivo para `p` NÃO servir de comida para `trunk`; null = serve.
    function breedFoodReason(p, trunk, d) {
        d = d || cfg;
        if (!p || typeof p !== 'object' || !trunk) return 'inválido';
        if (String(p.id) === trunk.id) return 'é quem sobe';
        if (breedActiveLines(d).some(l => l.id && String(l.id) === String(p.id))) return 'é quem sobe de outra linhagem';
        if (Number(p.speciesId) !== trunk.speciesId) return 'outra espécie';
        if (p.team || p.leader) return 'no time';
        if (p.starter) return 'inicial';
        if (p.shiny) return 'shiny: nunca';
        if (p.isDitto) return 'Ditto';
        if (p.locked) return 'cadeado';
        if (p.listed || p.tradeId) return 'anunciado no mercado';
        const q = Number(p.quality), iv = Number(p.ivTotal);
        if (!Number.isFinite(q) || !Number.isFinite(iv)) return 'sem IV/quality';
        if (q >= trunk.quality - BREED_Q_EPS) return `Q ${breedQ(q)} não é menor que ${breedQ(trunk.quality)}: nunca`;
        if (q < trunk.quality - BREED_Q_GAP - BREED_Q_EPS) return `Q ${breedQ(q)} longe demais (o jogo exige até 0,15 abaixo)`;
        if (iv >= trunk.ivTotal) return `IV ${iv} não é menor que ${trunk.ivTotal}: nunca`;
        const max = breedFoodIvMax(d);
        if (max > 0 && iv >= max) return `IV ${iv} ≥ ${max}: poupado`;
        return null;
    }
    // Candidatos a comida de quem sobe: box (lista `pokes`) e, com `breedFamily`, depot da família. Quem serve vem primeiro, o
    // mais fraco antes (menor quality, depois menor IV): a comida de Q baixa deixa de servir assim que quem sobe cresce.
    function breedFoodList(trunk, d) {
        d = d || cfg;
        if (!trunk) return [];
        const out = [];
        const add = (p, origem) => out.push({ id: String(p.id ?? ''), name: p.name || '?', quality: Number(p.quality), ivTotal: Number(p.ivTotal), level: Number(p.level) || 0, origem, motivo: breedFoodReason(p, trunk, d) });
        for (const p of lastPokesList) if (p && !p.team && Number(p.speciesId) === trunk.speciesId && String(p.id) !== trunk.id) add(p, 'box');
        if (d.breedFamily) for (const p of (lastFamilyDepot.pokes || [])) if (p && Number(p.speciesId) === trunk.speciesId) add(p, 'familia');
        return out.sort((a, b) => (a.motivo ? 1 : 0) - (b.motivo ? 1 : 0) || (a.quality || 0) - (b.quality || 0) || (a.ivTotal || 0) - (b.ivTotal || 0));
    }
    function breedFoodPick(trunk, d) { return breedFoodList(trunk, d).find(f => !f.motivo) || null; }

    function parseBreedCenter(raw) {
        if (!raw || typeof raw !== 'object') return null;
        return {
            unlocked: raw.unlocked !== false, unlockLevel: Number(raw.unlockLevel) || 0, level: Number(raw.level) || 0,
            slots: Number(raw.slots) || 0, usedSlots: Number(raw.usedSlots) || 0, gold: Number(raw.gold) || 0, pheromones: Number(raw.pheromones) || 0,
            eggs: (Array.isArray(raw.eggs) ? raw.eggs : []).filter(e => e && typeof e === 'object').map(e => ({
                id: String(e.id), speciesId: Number(e.speciesId) || 0, speciesName: e.speciesName || '?', rank: e.rank || null, shinyChild: Boolean(e.shinyChild),
                killsDone: Number(e.killsDone) || 0, killsRequired: Number(e.killsRequired) || 0, ready: Boolean(e.ready),
            })),
        };
    }
    async function breedReadCenter() {
        const raw = await gameApi(`${BREED_URL}?action=center`);
        const c = parseBreedCenter(raw);
        if (!c) throw new Error('centro de breeding vazio');
        breedCenter = c; breedCenterAt = Date.now();
        const sig = JSON.stringify([c.unlocked, c.slots, c.usedSlots, c.eggs.map(e => [e.id, e.killsDone, e.ready])]);
        if (sig !== breedCenterSig) {
            breedCenterSig = sig;
            logEvent('breeding-centro', { liberado: c.unlocked, nivel: c.level, slots: `${c.usedSlots}/${c.slots}`, gold: c.gold, ovos: c.eggs.map(e => `${e.speciesName} ${e.killsDone}/${e.killsRequired}${e.ready ? ' pronto' : ''}`) });
        }
        return c;
    }
    function breedQuote(trunk, food) {
        return gameApi(`${BREED_URL}?action=quote&parent1=${encodeURIComponent(trunk.id)}&parent2=${encodeURIComponent(food.id)}&free=1`);
    }
    // Checklist da cotação: tudo tem de bater com quem sobe, senão não cruza (a genética do filho vem do pai de maior quality).
    function breedCheckQuote(q, trunk) {
        if (!q || typeof q !== 'object') return 'cotação vazia';
        if (q.freeAllowed === false || q.free !== true) return 'o jogo não permite o caminho Grátis neste par';
        if (Number(q.pheromoneCost) > 0) return `a cotação pede ${q.pheromoneCost} feromônio(s)`;
        if (q.shinyChild) return 'o filho seria shiny (par com shiny): nunca';
        const prev = q.ivPreview && typeof q.ivPreview === 'object' ? q.ivPreview : null;
        if (!prev || prev.donorId == null) return 'a cotação não diz quem doa o IV';
        if (String(prev.donorId) !== trunk.id) return `o jogo diz que o IV viria da comida (donorId ≠ quem sobe)`;
        if (prev.ivTotal != null && Number(prev.ivTotal) !== trunk.ivTotal) return `IV projetado ${prev.ivTotal} ≠ IV de quem sobe (${trunk.ivTotal})`;
        if (prev.growth && typeof prev.growth === 'object') {
            const soma = Object.values(prev.growth).reduce((a, b) => a + (Number(b) || 0), 0);
            if (soma !== trunk.ivTotal) return `distribuição por stat soma ${soma} ≠ IV de quem sobe (${trunk.ivTotal})`;
        }
        const bq = Number(q.delta?.baseQuality);
        if (Number.isFinite(bq) && Math.abs(bq - trunk.quality) > 0.001) return `quality base ${breedQ(bq)} ≠ quality de quem sobe (${breedQ(trunk.quality)})`;
        const pa = q.parents?.a;
        if (pa && pa.id != null && String(pa.id) !== trunk.id) return 'o jogo pôs quem sobe no slot 2';
        return null;
    }
    // Stones do breed: `need` (base ou dobrada), `have` (mochila, pela cotação) e `familia` (depot da família, se permitido).
    function breedStoneNeeds(q, d) {
        d = d || cfg;
        const lista = d.breedDouble ? q?.stones?.double : q?.stones?.base;
        return (Array.isArray(lista) ? lista : []).map(s => {
            const itemId = Number(s?.itemId);
            const fam = (lastFamilyDepot.items || []).find(i => Number(i?.itemId ?? i?.id) === itemId);
            return { itemId, name: s?.name || `Item ${itemId}`, need: Number(s?.need) || 0, have: Number(s?.have) || 0, familia: d.breedFamily ? Math.max(0, Number(fam?.quantity) || 0) : 0 };
        });
    }
    const breedStonesTxt = (stones) => stones.map(s => `${s.name} ${s.have}${s.familia ? `+${s.familia} na família` : ''}/${s.need}`).join(', ');

    // Espera a lista `pokes` / o frame `family` chegar (até BREED_WAIT_MS) depois de pedir.
    function breedRefreshPokes() {
        const antes = breedPokesSeq;
        if (!sendGame({ type: 'pokes-get' })) return Promise.resolve(false);
        const t0 = Date.now();
        return new Promise(res => (function loop() {
            if (breedPokesSeq !== antes) return res(true);
            if (Date.now() - t0 >= BREED_WAIT_MS) return res(false);
            setTimeout(loop, 250);
        })());
    }
    function breedRefreshFamily() {
        const antes = breedFamilySeq;
        breedFamilyAskedAt = Date.now();
        if (!sendGame({ type: 'family-get' })) return Promise.resolve(false);
        const t0 = Date.now();
        return new Promise(res => (function loop() {
            if (breedFamilySeq !== antes) return res(true);
            if (Date.now() - t0 >= BREED_WAIT_MS) return res(false);
            setTimeout(loop, 250);
        })());
    }
    function familyItemWithdraw(itemId, quantity, name) {
        const antes = Number((lastFamilyDepot.items || []).find(i => Number(i?.itemId ?? i?.id) === itemId)?.quantity) || 0;
        return familyAction({ action: 'item', dir: 'withdraw', itemId, quantity }, 'item-familia-retira', { name, itemId, quantity },
            (depot) => { const it = (Array.isArray(depot.items) ? depot.items : []).find(i => Number(i?.itemId ?? i?.id) === itemId); return !it || Number(it.quantity) < antes; });
    }
    function familyPokeWithdraw(pokeId, name) {
        return familyAction({ action: 'poke', dir: 'withdraw', capturedId: pokeId }, 'poke-familia-retira', { name, pokeId },
            (depot) => !(Array.isArray(depot.pokes) ? depot.pokes : []).some(p => String(p?.id) === String(pokeId)));
    }

    // Frame `pokes`: guarda nome/espécie de quem sobe (a proteção da venda usa isso) e identifica o filho pendente.
    function breedOnPokes(list) {
        breedPokesSeq++;
        if (!breedEnabled()) { breedNotify(); return; }
        let mudou = false;
        for (const l of breedActiveLines()) {
            const t = breedTrunk(l);
            if (t && (l.name !== t.name || Number(l.speciesId) !== t.speciesId)) { l.name = t.name; l.speciesId = t.speciesId; mudou = true; }
            if (!l.id && !l.eggId && l.pendingChild && breedAdoptChild(l, Array.isArray(list) ? list : lastPokesList)) mudou = true;
        }
        if (mudou) saveCfg(cfg);
        breedNotify();
    }
    function breedOnFamily() { breedFamilySeq++; breedNotify(); }
    // Filho de uma linhagem: id novo da espécie (quando se sabe o que havia antes), senão o ÚNICO da espécie com o IV de quem
    // sobe (ou +1, do dobrar) e quality acima da dele. 0 ou 2+ candidatos = fica pendente (o painel deixa escolher à mão).
    function breedAdoptChild(line, list, novosIds) {
        const sp = Number(line.speciesId) || 0;
        const outros = breedActiveLines().filter(o => o !== line && o.id).map(o => String(o.id));
        let cand = (Array.isArray(list) ? list : []).filter(p => p && !p.team && !p.leader && !p.shiny && (!sp || Number(p.speciesId) === sp) && !outros.includes(String(p.id)));
        if (novosIds && novosIds.size) {
            const n = cand.filter(p => novosIds.has(String(p.id)));
            if (n.length === 1) return breedSetChild(line, n[0]);
            if (n.length > 1) cand = n;
        }
        const iv = Number(line.lastIv), q = Number(line.lastQ);
        const porIv = cand.filter(p => Number.isFinite(iv) && (Number(p.ivTotal) === iv || Number(p.ivTotal) === iv + 1) && (!Number.isFinite(q) || Number(p.quality) > q - BREED_Q_EPS));
        if (porIv.length === 1) return breedSetChild(line, porIv[0]);
        logEvent('breeding-filho', { linhagem: line.name || null, achou: false, candidatos: porIv.length, novos: novosIds ? novosIds.size : null, iv: Number.isFinite(iv) ? iv : null });
        return false;
    }
    function breedSetChild(line, p) {
        line.id = String(p.id); line.pendingChild = null; line.eggId = null;
        line.gen = (Number(line.gen) || 0) + 1;
        line.lastQ = Number(p.quality); line.lastIv = Number(p.ivTotal); line.name = p.name || line.name; line.speciesId = Number(p.speciesId) || line.speciesId;
        logEvent('breeding-filho', { linhagem: line.name, achou: true, id: line.id, geracao: line.gen, quality: line.lastQ, ivTotal: line.lastIv });
        return true;
    }
    // Ovos das linhagens x centro: ovo sem id conhecido ganha o único livre da espécie; ovo que sumiu (chocado na mão) vira filho pendente.
    function breedSyncLines(c) {
        let mudou = false;
        const claimed = new Set(breedActiveLines().map(l => l.eggId).filter(id => id && c.eggs.some(e => e.id === id)));
        for (const l of breedActiveLines()) {
            if (!l.eggId || c.eggs.some(e => e.id === l.eggId)) continue;
            const livres = c.eggs.filter(e => !claimed.has(e.id) && (!l.speciesId || e.speciesId === Number(l.speciesId)));
            if (livres.length === 1) { l.eggId = livres[0].id; claimed.add(l.eggId); mudou = true; continue; }
            logEvent('breeding-ovo-sumiu', { linhagem: l.name || null, eggId: l.eggId, ovosNoCentro: c.eggs.length });
            l.eggId = null; l.pendingChild = { at: Date.now() }; mudou = true;
            breedAdoptChild(l, lastPokesList);
        }
        if (mudou) saveCfg(cfg);
    }

    function breedWaitSet(motivo) {
        const novo = !breedWait || breedWait.motivo !== motivo;
        breedWait = { motivo, at: Date.now() };
        if (!novo) return;
        logEvent('breeding-parado', { motivo });
        if (breedWarned[motivo] && Date.now() - breedWarned[motivo] < BREED_WARN_GAP_MS) return;
        breedWarned[motivo] = Date.now();
        const who = playerName();
        postWebhook('alert', {
            content: `🥚 ${who ? `**${who}**` : 'Sua conta'}: breeding parado — ${motivo}`,
            username: 'Poke Idle World',
            embeds: [{ title: 'Breeding parado', description: `${who ? `Conta: ${who}\n` : ''}${motivo}\nTenta de novo a cada ${BREED_RETRY_MS / 60000} min (a família pode abastecer).\nEm ${new Date().toLocaleString('pt-BR')}`, color: 0xfee75c }],
        }, { evento: 'breeding-parado' });
    }
    function breedReset() {
        for (const k of Object.keys(breedPlanned)) delete breedPlanned[k];
        breedWait = null; breedCenterAt = 0; breedFamilyAskedAt = 0;
    }
    function breedWanted() { return breedEnabled() && !breedWorking && Object.keys(breedPlanned).length > 0; }   // carona/pedido na viagem

    // Tique (1 min): com o módulo ligado, relê o centro a cada 2 min, choca o que estiver pronto e planeja o próximo cruzamento.
    function breedTick(force) {
        if (!breedEnabled() || breedBusy || breedWorking) return;
        if (typeof tripRunning !== 'undefined' && tripRunning) return;
        if (!force && Date.now() - breedCenterAt < BREED_POLL_MS) return;
        return breedCycle();
    }
    async function breedCycle() {
        breedBusy = true;
        try {
            const c = await breedReadCenter();
            if (!c.unlocked) { breedWaitSet(`o Breeding Center libera no nível ${c.unlockLevel} (conta no ${c.level})`); return; }
            breedSyncLines(c);
            let chocou = false;
            for (const egg of c.eggs.filter(e => e.ready)) if (await breedHatch(egg)) chocou = true;
            await breedPlan(chocou ? await breedReadCenter() : c);
        } catch (err) {
            logEvent('breeding-erro', { erro: String(err?.message || err) });
        } finally {
            breedBusy = false;
            breedNotify();
        }
    }
    // Choca um ovo pronto (POST hatch). Falhou na hunt: pede a viagem (a tarefa choca na cidade).
    async function breedHatch(egg) {
        const line = breedActiveLines().find(l => l.eggId === egg.id) || null;
        const antes = new Set(lastPokesList.map(p => String(p?.id)));
        let r;
        try { r = await gameApi(BREED_URL, { method: 'POST', body: JSON.stringify({ action: 'hatch', eggId: egg.id }) }); }
        catch (err) {
            logEvent('breeding-choca', { eggId: egg.id, especie: egg.speciesName, ok: false, erro: String(err?.message || err) });
            if (!breedHatchAsked[egg.id]) { breedHatchAsked[egg.id] = true; tripRequest('breeding', null, `chocar ${egg.speciesName} na cidade (${err?.message || err})`); }
            return false;
        }
        const txt = JSON.stringify(r) || '';
        logEvent('breeding-choca', { eggId: egg.id, especie: egg.speciesName, linhagem: line?.name || null, ok: true, campos: r && typeof r === 'object' ? Object.keys(r) : null, resposta: txt.length > 2500 ? txt.slice(0, 2500) + '…' : r });
        breedCenterAt = 0;
        const child = r?.child && typeof r.child === 'object' ? r.child : null;
        let filho = null;
        if (line) {
            line.eggId = null; line.pendingChild = { at: Date.now() };
            if (child?.id) { breedSetChild(line, Object.assign({ speciesId: egg.speciesId, name: egg.speciesName }, child)); filho = child; }
            else {
                await breedRefreshPokes();
                const novos = new Set(lastPokesList.map(p => String(p?.id)).filter(id => !antes.has(id)));
                // o frame novo já pode ter identificado o filho (breedOnPokes); senão tenta com os ids novos
                if (line.id || breedAdoptChild(line, lastPokesList, novos)) filho = lastPokesList.find(p => String(p?.id) === line.id) || null;
            }
            saveCfg(cfg);
        }
        const who = playerName();
        const gen = line ? Number(line.gen) || 0 : 0;
        const linhas = [
            line ? `Linhagem ${line.name || egg.speciesName}: geração ${gen}` : `Ovo sem linhagem no painel (${egg.speciesName})`,
            filho ? `Filho: Q ${breedQ(filho.quality)} · IV ${filho.ivTotal}/${IV_MAX}${line?.q0 != null ? ` (começou em Q ${breedQ(line.q0)})` : ''}` : (line ? '⚠ Filho não identificado no box: escolha no painel 🥚 quem continua' : ''),
            child?.shiny ? '✨ Nasceu shiny!' : '',
        ].filter(Boolean);
        postWebhook('alert', {
            content: `🥚 ${who ? `**${who}**` : 'Sua conta'} chocou **${egg.speciesName}**${filho ? ` — Q ${breedQ(filho.quality)}, IV ${filho.ivTotal}` : ''}`,
            username: 'Poke Idle World',
            embeds: [{ title: 'Ovo chocou', description: `${who ? `Conta: ${who}\n` : ''}${linhas.join('\n')}\nEm ${new Date().toLocaleString('pt-BR')}`, color: filho ? 0x57f287 : 0xfee75c }],
        }, { evento: 'breeding-chocou', eggId: egg.id, filho: filho?.id || null });
        return true;
    }
    // Planeja o próximo cruzamento de cada linhagem com quem sobe no box e slot livre: escolhe a comida, cota (quando ela está
    // no box) e pede a viagem. Falta algo: fica parado e avisa.
    async function breedPlan(c) {
        if (breedWait && Date.now() - breedWait.at < BREED_RETRY_MS) return;
        let livres = c.slots - c.usedSlots;
        const motivos = [];
        let planejou = false;
        const linhas = breedActiveLines();
        if (!linhas.length) { breedWaitSet('escolha quem sobe na aba 🥚 Breeding'); return; }
        if (cfg.breedFamily && Date.now() - breedFamilyAskedAt > BREED_FAMILY_POLL_MS) await breedRefreshFamily();
        for (const line of linhas) {
            if (!line.id) continue;                                  // ovo chocando ou filho por identificar
            if (breedPlanned[line.id]) { livres--; planejou = true; continue; }
            if (livres <= 0) { motivos.push('incubadora cheia'); break; }
            const trunk = breedTrunk(line);
            if (!trunk) { motivos.push(`${line.name || line.id}: não está no box (lista ainda não lida?)`); continue; }
            if (trunk.team || trunk.starter || trunk.shiny) { motivos.push(`${trunk.name}: no time, inicial ou shiny não cruza`); continue; }
            const food = breedFoodPick(trunk);
            if (!food) { motivos.push(`${trunk.name} (Q ${breedQ(trunk.quality)}, IV ${trunk.ivTotal}): sem comida que sirva${cfg.breedFamily ? ' no box nem na família' : ' no box'}`); continue; }
            let stones = null;
            if (food.origem === 'box') {
                let q = null;
                try { q = await breedQuote(trunk, food); } catch (err) { motivos.push(`${trunk.name}: cotação falhou (${err?.message || err})`); continue; }
                const chk = breedCheckQuote(q, trunk);
                stones = breedStoneNeeds(q);
                logEvent('breeding-cotacao', { tronco: trunk.name, troncoId: trunk.id, comida: food.id, qTronco: trunk.quality, qComida: food.quality, ivTronco: trunk.ivTotal, ivComida: food.ivTotal, donorId: q?.ivPreview?.donorId ?? null, ok: !chk, motivo: chk, goldFee: q?.goldFee ?? null, stones: breedStonesTxt(stones) });
                if (chk) { motivos.push(`${trunk.name}: ${chk}`); continue; }
                const faltam = stones.filter(s => s.have + s.familia < s.need);
                if (faltam.length) { motivos.push(`${trunk.name}: faltam stones (${breedStonesTxt(faltam)})`); continue; }
                if (c.gold < Number(q.goldFee || 0)) { motivos.push(`${trunk.name}: gold ${fmtNum(c.gold)} < taxa ${fmtNum(q.goldFee)}`); continue; }
            } else if (c.gold < BREED_GOLD_FEE_HINT) { motivos.push(`${trunk.name}: gold ${fmtNum(c.gold)} < taxa ${fmtNum(BREED_GOLD_FEE_HINT)}`); continue; }
            breedPlanned[line.id] = { foodId: food.id, foodName: food.name, foodQ: food.quality, foodIv: food.ivTotal, origem: food.origem, stones, at: Date.now() };
            livres--; planejou = true;
            tripRequest('breeding', null, `${trunk.name} Q ${breedQ(trunk.quality)} IV ${trunk.ivTotal} × comida Q ${breedQ(food.quality)} IV ${food.ivTotal}${food.origem === 'familia' ? ' (família)' : ''}`);
        }
        if (planejou) breedWait = null;
        else if (motivos.length) breedWaitSet(motivos.join(' · '));
        else breedWait = null;
    }

    // Tarefa da viagem (na cidade): choca o que estiver pronto, tira da família o que falta, cota de novo, confere e cruza.
    async function breedCityWork() {
        if (!breedEnabled()) return { ok: true, motivo: 'desligado' };
        if (breedWorking) return { ok: false, motivo: 'breeding já em andamento' };
        breedWorking = true;
        const feitos = [], falhas = [];
        try {
            let c = await breedReadCenter();
            for (const egg of c.eggs.filter(e => e.ready)) if (await breedHatch(egg)) c = await breedReadCenter();
            for (const troncoId of Object.keys(breedPlanned)) {
                const plan = breedPlanned[troncoId];
                delete breedPlanned[troncoId];
                const line = breedActiveLines().find(l => l.id && String(l.id) === troncoId);
                if (!line) continue;
                try {
                    if (c.usedSlots >= c.slots) throw new Error('incubadora cheia');
                    if (plan.origem === 'familia') {
                        const r = await familyPokeWithdraw(plan.foodId, plan.foodName);
                        if (!r.ok) throw new Error(`comida da família: ${r.motivo}`);
                        await breedSleep();
                    }
                    await breedRefreshPokes();
                    const trunk = breedTrunk(line);
                    if (!trunk) throw new Error('quem sobe não está no box');
                    const food = lastPokesList.find(p => p && String(p.id) === plan.foodId);
                    if (!food) throw new Error('a comida não está no box');
                    const fr = breedFoodReason(food, trunk);
                    if (fr) throw new Error(`a comida não serve mais: ${fr}`);
                    let q = await breedQuote(trunk, food);
                    let chk = breedCheckQuote(q, trunk);
                    if (chk) throw new Error(chk);
                    let stones = breedStoneNeeds(q);
                    const tirar = stones.filter(s => s.have < s.need);
                    if (tirar.length) {
                        if (!cfg.breedFamily) throw new Error(`faltam stones (${breedStonesTxt(tirar)})`);
                        for (const s of tirar) {
                            const r = await familyItemWithdraw(s.itemId, s.need - s.have, s.name);
                            if (!r.ok) throw new Error(`${s.name} da família: ${r.motivo}`);
                            await breedSleep();
                        }
                        q = await breedQuote(trunk, food);
                        chk = breedCheckQuote(q, trunk);
                        if (chk) throw new Error(chk);
                        stones = breedStoneNeeds(q);
                        const ainda = stones.filter(s => s.have < s.need);
                        if (ainda.length) throw new Error(`stones não chegaram à mochila (${breedStonesTxt(ainda)})`);
                    }
                    const okStones = cfg.breedDouble ? q?.stones?.doubleOk : q?.stones?.baseOk;
                    if (okStones === false) throw new Error('o jogo diz que faltam stones');
                    if (c.gold < Number(q.goldFee || 0)) throw new Error(`gold ${fmtNum(c.gold)} < taxa ${fmtNum(q.goldFee)}`);
                    const antes = new Set(c.eggs.map(e => e.id));
                    const usadosAntes = c.usedSlots;
                    const body = { action: 'breed', parent1: trunk.id, parent2: String(food.id), free: true, double: Boolean(cfg.breedDouble) };
                    const r = await gameApi(BREED_URL, { method: 'POST', body: JSON.stringify(body) });
                    const novo = parseBreedCenter(r);
                    const egg = novo ? novo.eggs.find(e => !antes.has(e.id)) || null : null;
                    if (novo) { breedCenter = novo; breedCenterAt = Date.now(); c = novo; }
                    if (!egg && !(novo && novo.usedSlots > usadosAntes)) throw new Error('o jogo respondeu sem o ovo novo');
                    if (line.q0 == null) { line.q0 = trunk.quality; line.iv0 = trunk.ivTotal; }
                    line.gen = Number(line.gen) || 0;
                    line.lastQ = trunk.quality; line.lastIv = trunk.ivTotal; line.name = trunk.name; line.speciesId = trunk.speciesId;
                    line.eggId = egg?.id || 'desconhecido'; line.id = null; line.pendingChild = null; line.eggAt = Date.now(); line.eggs = (Number(line.eggs) || 0) + 1;
                    saveCfg(cfg);
                    const feito = { name: trunk.name, q: trunk.quality, iv: trunk.ivTotal, foodQ: Number(food.quality), foodIv: Number(food.ivTotal), min: q.delta?.minQuality, max: q.delta?.maxQuality, kills: egg?.killsRequired || null, gen: line.gen + 1, stones: stones.map(s => `${s.need}x ${s.name}`).join(', '), gold: Number(q.goldFee) || 0, dobrar: Boolean(cfg.breedDouble) };
                    feitos.push(feito);
                    logEvent('breeding-cruzou', { tronco: trunk.name, troncoId: trunk.id, comida: String(food.id), origem: plan.origem, qTronco: trunk.quality, qComida: feito.foodQ, ivTronco: trunk.ivTotal, ivComida: feito.foodIv, dobrar: feito.dobrar, ovo: egg?.id || null, abates: feito.kills, faixa: [feito.min, feito.max], gold: c.gold, geracao: feito.gen });
                } catch (err) {
                    const motivo = String(err?.message || err);
                    falhas.push({ name: line.name || troncoId, motivo });
                    logEvent('breeding-falhou', { linhagem: line.name || troncoId, comida: plan.foodId, origem: plan.origem, motivo });
                }
                await breedSleep();
            }
        } catch (err) {
            falhas.push({ name: 'centro', motivo: String(err?.message || err) });
            logEvent('breeding-falhou', { motivo: String(err?.message || err) });
        } finally {
            breedWorking = false;
        }
        breedLast = { at: Date.now(), feitos, falhas };
        if (falhas.length) breedWait = { motivo: falhas.map(f => `${f.name}: ${f.motivo}`).join(' · '), at: Date.now() };   // não insiste antes do retry
        if (feitos.length || falhas.length) {
            const who = playerName();
            const linhas = feitos.map(f => `**${f.name}** geração ${f.gen}: Q ${breedQ(f.q)} → ${breedQ(f.min)}–${breedQ(f.max)} · IV ${f.iv} mantido · comida Q ${breedQ(f.foodQ)} IV ${f.foodIv}${f.kills ? ` · choca em ${fmtNum(f.kills)} abates` : ''}\nCustou ${fmtNum(f.gold)} gold + ${f.stones}${f.dobrar ? ' (dobrado)' : ''}`)
                .concat(falhas.map(f => `⚠ ${f.name}: ${f.motivo}`));
            postWebhook('alert', {
                content: `🥚 ${who ? `**${who}**` : 'Sua conta'} ${feitos.length ? `criou ${feitos.length === 1 ? 'um ovo' : `${feitos.length} ovos`} de ${feitos.map(f => `**${f.name}**`).join(' e ')}` : `não conseguiu cruzar ${falhas.map(f => `**${f.name}**`).join(' e ')}`}`,
                username: 'Poke Idle World',
                embeds: [{ title: feitos.length ? (falhas.length ? 'Breeding parcial' : 'Ovo na incubadora') : 'Breeding não feito', description: `${who ? `Conta: ${who}\n` : ''}${linhas.join('\n')}\nEm ${new Date().toLocaleString('pt-BR')}`, color: feitos.length ? (falhas.length ? 0xfee75c : 0x57f287) : 0xed4245 }],
            }, { evento: feitos.length ? 'breeding-cruzou' : 'breeding-falhou', feitos: feitos.length, falhas: falhas.length });
        }
        breedNotify();
        return { ok: falhas.length === 0, motivo: falhas.length ? falhas.map(f => `${f.name}: ${f.motivo}`).join('; ') : (feitos.length ? null : 'nada planejado'), feitos: feitos.length, falhas: falhas.length };
    }

    // Linhas do painel (bloco de estado).
    function breedStatus(d) {
        d = d || cfg;
        const out = [];
        const c = breedCenter;
        if (c) {
            out.push(`Incubadora ${c.usedSlots}/${c.slots}${c.unlocked ? '' : ` (libera no nível ${c.unlockLevel})`} · gold ${fmtNum(c.gold)} · lido ${breedHora(breedCenterAt)}`);
            for (const e of c.eggs) {
                const l = breedActiveLines(d).find(x => x.eggId === e.id);
                out.push(`Ovo: ${e.speciesName} ${fmtNum(e.killsDone)}/${fmtNum(e.killsRequired)} abates${e.ready ? ' · PRONTO' : ''}${l ? ` · linhagem ${breedLines(d).indexOf(l) + 1} (geração ${(Number(l.gen) || 0) + 1})` : ''}`);
            }
        } else out.push(d.breedEnabled ? 'Incubadora ainda não lida.' : 'Desligado.');
        breedLines(d).forEach((l, i) => {
            if (!l) return;
            const t = breedTrunk(l);
            let estado;
            if (l.id) estado = t ? `Q ${breedQ(t.quality)} · IV ${t.ivTotal}/${IV_MAX}${breedPlanned[l.id] ? ' · viagem pedida para cruzar' : ''}` : 'não está no box (lista não lida?)';
            else if (l.eggId) estado = 'ovo chocando';
            else estado = '⚠ filho não identificado: escolha no menu';
            out.push(`Linhagem ${i + 1}: ${t?.name || l.name || '?'} · geração ${Number(l.gen) || 0}${l.q0 != null ? ` · começou em Q ${breedQ(l.q0)}` : ''} · ${estado}`);
        });
        if (breedWait) out.push(`Parado: ${breedWait.motivo} · tenta de novo ${breedHora(breedWait.at + BREED_RETRY_MS)}`);
        if (breedLast) out.push(`Última viagem ${breedHora(breedLast.at)}: ${breedLast.feitos.length ? `criou ${breedLast.feitos.length} ovo(s)` : 'nada cruzado'}${breedLast.falhas.length ? ` · ⚠ ${breedLast.falhas[0].motivo}` : ''}`);
        return out;
    }
    // Prévia da comida por linhagem: [{ text, ok }].
    function breedFoodStatus(d) {
        d = d || cfg;
        const out = [];
        breedLines(d).forEach((l, i) => {
            if (!l) return;
            const t = breedTrunk(l);
            if (!t) { out.push({ text: `Linhagem ${i + 1}: ${l.eggId ? 'ovo chocando' : (l.id ? 'quem sobe não está no box' : 'filho por identificar')}`, ok: false }); return; }
            const lista = breedFoodList(t, d);
            const servem = lista.filter(f => !f.motivo);
            out.push({ text: `Linhagem ${i + 1} (${t.name} Q ${breedQ(t.quality)} IV ${t.ivTotal}): ${servem.length} ${servem.length === 1 ? 'comida serve' : 'comidas servem'} de ${lista.length} da espécie`, ok: servem.length > 0 });
            for (const f of lista.slice(0, 8)) out.push({ text: `  ${f.motivo ? '✖' : '✔'} ${f.name} Q ${breedQ(f.quality)} IV ${f.ivTotal}${f.origem === 'familia' ? ' (família)' : ''}${f.motivo ? ` — ${f.motivo}` : ''}`, ok: !f.motivo });
            if (lista.length > 8) out.push({ text: `  … e mais ${lista.length - 8}`, ok: false });
        });
        return out;
    }

    // ---- Clã: subir de rank sozinho (Orebound e os outros 9) ------------------------
    // Levantado no bundle em 27/09/2026 (janela "Clãs" e mochila) e na pokepedia (systems/clans):
    //   GET  /api/game/clans -> { clan, clanRank, level, diamonds, canJoin, joinLevel, nextTask } ; nextTask (null = rank
    //        máximo) = { rank, name, level, levelOk, items:[{ itemId, name, icon, have, need }], caught:[{ speciesId, name,
    //        have, need }], kills:[{ type, have, need }], rewardXp, ok, goldOk, goldCost }
    //   POST /api/game/clans/rankup {} -> estado novo · POST /api/game/clans/skip {} (paga goldCost; o script NÃO usa)
    //   POST /api/game/clans/change { clan, targetRank } -> entrar (1ª vez grátis, rank 1) ou trocar (diamantes; NUNCA usado)
    //   POST /api/game/convert { baseItemId, packs } -> { converted, toName }: 100 do item base viram 1 item de clã
    //   `inv-get` (socket) -> `inventory { items:[{ itemId, quantity }] }`: a mochila, de onde a conversão tira o item base
    // Regras: entra no nível 80; ranks 2..5 pedem nível 90/100/110/120; itens entregues são consumidos; capturar uma
    // espécie; derrotar N por elemento. O script: lê a tarefa (2 min; 1 min com a rota), pede a mochila, entra no clã
    // escolhido se a conta não tiver nenhum, não vende item base/de clã nem Pokémon da espécie que a tarefa pede, converte
    // e sobe de rank NA VIAGEM À CIDADE (tarefa 'cla'). Com `clanRoute`, vai para a hunt que mais adianta a tarefa: primeiro
    // a da espécie a capturar (jogando a bola da rota de captura), depois a de maior fração da tarefa por abate
    // (itens base esperados pelo loot do creatures.json + tipos que faltam derrotar). Terminou ou travou: volta para a hunt
    // de antes. Excludente com a rota de treino e a de captura (Salvar desliga a outra); a Daily tem prioridade.

    const CLAN_URL = '/api/game/clans';
    const CLAN_RANKUP_URL = '/api/game/clans/rankup';
    const CLAN_CHANGE_URL = '/api/game/clans/change';
    const CONVERT_URL = '/api/game/convert';
    const CLAN_POLL_MS = 2 * 60 * 1000;
    const CLAN_POLL_ROUTE_MS = 60 * 1000;
    const CLAN_TICK_MS = 60 * 1000;
    const CLAN_PACK = 100;                   // itens base por item de clã
    const CLAN_KEEP_RATIO = 0.8;             // a hunt atual segue alvo enquanto render >= 80% da melhor (evita pular de hunt)
    // Item base -> item de clã (mapa do inventário no bundle).
    const CLAN_CONVERT = {
        'Screw': 'Big Screw', 'Band Aid': 'Injection', 'Bug Gosme': 'Big Bug Gosme', 'Bottles of Poison': 'Big Poison Bottle',
        'Dark Gem': 'Solid Dark Gem', 'Dragon Scale': 'Dragon Scale Collection', 'Earth Ball': 'Solid Earth Piece',
        'Enchanted Gem': 'Big Enchanted Gem', 'Essence of Fire': 'Compressed Fire', 'Ghost Essence': 'Compressed Ghost Essence',
        'Piece of Steel': 'Compressed Steel', 'Rubber Ball': 'Solid Rubber Ball', 'Seed': 'Pile of Seed', 'Small Stone': 'Big Stone',
        'Snowball': 'Solid Ice Cube', 'Straw': 'Compressed Straw', 'Water Gem': 'Solid Water Gem',
    };
    const CLAN_BASE_OF = Object.fromEntries(Object.entries(CLAN_CONVERT).map(([b, c]) => [c.toLowerCase(), b]));
    const CLAN_INFO = {
        ironhard: { name: 'Ironhard', types: ['STEEL'], ranks: ['Smither', 'Forge', 'Hammer', 'Metal', 'Titan'] },
        naturia: { name: 'Naturia', types: ['GRASS', 'BUG'], ranks: ['Seed', 'Sprout', 'Webhead', 'Woodtrunk', 'Keeper'] },
        seavell: { name: 'Seavell', types: ['WATER', 'ICE'], ranks: ['Drop', 'Icelake', 'Waterfall', 'Frost', 'Master'] },
        malefic: { name: 'Malefic', types: ['GHOST', 'POISON', 'DARK'], ranks: ['Troublemaker', 'Venomancer', 'Spectre', 'Nightwalker', 'Lord'] },
        orebound: { name: 'Orebound', types: ['GROUND', 'ROCK'], ranks: ['Sand', 'Rock', 'Solid', 'Hardskin', 'Hero'] },
        psycraft: { name: 'Psycraft', types: ['PSYCHIC', 'FAIRY'], ranks: ['Mind', 'Brain', 'Scholar', 'Telepath', 'Medium'] },
        raibolt: { name: 'Raibolt', types: ['ELECTRIC'], ranks: ['Shock', 'Watt', 'Electrician', 'Overcharge', 'Legend'] },
        volcanic: { name: 'Volcanic', types: ['FIRE'], ranks: ['Spark', 'Flame', 'Firetamer', 'Pyromancer', 'Master'] },
        gardestrike: { name: 'Gardestrike', types: ['FIGHTING', 'NORMAL'], ranks: ['Fist', 'Tamer', 'Fighter', 'Deathand', 'Champion'] },
        wingeon: { name: 'Wingeon', types: ['FLYING', 'DRAGON'], ranks: ['Cloud', 'Wind', 'Sky', 'Falcon', 'Dragon'] },
    };

    let clanState = null;           // ver parseClan
    let clanFetchedAt = 0;
    let clanBusy = null;            // Promise da leitura em andamento
    let clanSig = '';
    let clanJoinTried = false;
    // Viagem urgente para subir de rank: refeita enquanto a tarefa seguir pronta (antes era uma vez por rank; se a
    // única ida chegasse cedo, a subida ficava para a viagem do relógio). { rank, n, at }
    let clanReadyAsk = { rank: 0, n: 0, at: 0 };
    const CLAN_READY_RETRY_MS = 5 * 60 * 1000;
    const CLAN_READY_MAX_ASKS = 3;           // por rank; depois, só na carona da viagem do relógio
    const bag = new Map();          // itemId -> quantidade na mochila (frame `inventory`)
    let bagAt = 0;
    let clanTarget = null;          // { slug, name, level, motivo } hunt escolhida pela rota do clã
    let clanFrom = null;            // hunt de antes da rota do clã (para onde voltar)
    let clanWait = '';              // por que a rota do clã ainda não foi para a hunt (painel e log)
    const clanFailed = new Set();   // slugs cuja entrada falhou nesta sessão
    let onClanChange = null;        // callback do painel

    function clanOn() { return Boolean(cfg.clanEnabled); }
    function clanRouteOn() { return Boolean(cfg.clanEnabled && cfg.clanRoute); }
    function clanNotify() { if (onClanChange) { try { onClanChange(); } catch { /* painel fechado */ } } }
    function clanName(key) { return CLAN_INFO[key]?.name || (key ? String(key) : '?'); }

    function parseClan(s) {
        const t = s?.nextTask || null;
        const arr = (a) => Array.isArray(a) ? a : [];
        const n = (v) => Math.max(0, Number(v) || 0);
        return {
            clan: s?.clan ? String(s.clan) : null, rank: n(s?.clanRank), level: n(s?.level),
            canJoin: Boolean(s?.canJoin), joinLevel: n(s?.joinLevel) || 80,
            task: t ? {
                rank: n(t.rank), name: String(t.name || ''), level: n(t.level), levelOk: t.levelOk !== false,
                items: arr(t.items).map(i => ({ itemId: n(i?.itemId), name: String(i?.name || ''), have: n(i?.have), need: n(i?.need) })),
                caught: arr(t.caught).map(c => ({ speciesId: n(c?.speciesId), name: String(c?.name || ''), have: n(c?.have), need: n(c?.need) })),
                kills: arr(t.kills).map(k => ({ type: String(k?.type || '').toUpperCase(), have: n(k?.have), need: n(k?.need) })),
                rewardXp: n(t.rewardXp), ok: Boolean(t.ok), goldCost: n(t.goldCost),
            } : null,
        };
    }
    function bagQty(id) { return bag.get(Number(id)) || 0; }
    function clanItemIdByName(name) {
        const k = normalize(name);
        if (typeof itemsCatalog !== 'undefined' && itemsCatalog) for (const [id, it] of itemsCatalog) if (normalize(it?.name) === k) return id;
        return null;
    }
    // Algum monstro do creatures.json dropa esse item (nome normalizado)?
    function clanIsDrop(name) {
        const k = normalize(name);
        if (!k || typeof creatureLoot === 'undefined') return false;
        for (const loot of creatureLoot.values()) if (loot.some(l => normalize(l?.name) === k)) return true;
        return false;
    }
    // O que falta da tarefa. Itens: em unidades do item de clã e do item base (descontando o que já está na mochila).
    // Item pedido que já é o drop (sem conversão; ex.: a própria Earth Ball): `base.direto`, conta só pelo `have` do jogo.
    function clanMissing() {
        const t = clanState?.task;
        if (!t) return null;
        const items = t.items.filter(i => i.have < i.need).map(i => {
            const falta = i.need - i.have;
            const baseName = CLAN_BASE_OF[normalize(i.name)] || null;
            if (!baseName && clanIsDrop(i.name)) return { itemId: i.itemId, name: i.name, falta, base: { name: i.name, id: i.itemId, have: 0, falta, direto: true } };
            const baseId = baseName ? clanItemIdByName(baseName) : null;
            const baseHave = baseId ? bagQty(baseId) : 0;
            return { itemId: i.itemId, name: i.name, falta, base: baseName ? { name: baseName, id: baseId, have: baseHave, falta: Math.max(0, falta * CLAN_PACK - baseHave) } : null };
        });
        const kills = t.kills.filter(k => k.have < k.need).map(k => ({ type: k.type, falta: k.need - k.have }));
        const caught = t.caught.filter(c => c.have < c.need).map(c => ({ speciesId: c.speciesId, name: c.name, falta: c.need - c.have }));
        return { items, kills, caught, levelOk: t.levelOk, nada: !items.length && !kills.length && !caught.length };
    }
    // Não vender: o item de clã e o item base que a tarefa ainda pede.
    function clanKeepsItem(id) {
        const m = clanOn() ? clanMissing() : null;
        if (!m) return false;
        id = Number(id);
        return m.items.some(i => i.itemId === id || (i.base && i.base.id === id));
    }
    function clanKeepsSpecies(speciesId) {
        const m = clanOn() ? clanMissing() : null;
        return Boolean(m && speciesId && m.caught.some(c => c.speciesId === speciesId));
    }
    // Viagem à cidade tem o que fazer pelo clã: rank pronto, ou item base suficiente para converter.
    function clanWantsCity(d) {
        d = d || cfg;
        if (!d.clanEnabled || !clanState) return false;
        if (!clanState.clan) return false;
        const t = clanState.task;
        if (!t) return false;
        if (t.ok && d.clanRankup) return true;
        const m = clanMissing();
        return Boolean(m && m.items.some(i => i.base && i.base.id && i.base.have >= CLAN_PACK));
    }
    // Tudo pronto menos a conversão (que a mochila já cobre): vale uma viagem urgente.
    function clanReadyForCity() {
        const t = clanState?.task, m = clanMissing();
        if (!t || !m || !cfg.clanRankup || !t.levelOk) return false;
        if (t.ok) return true;
        return !m.kills.length && !m.caught.length && m.items.every(i => i.base && i.base.id && i.base.falta === 0);
    }

    function clanOnInventory(items) {
        bag.clear();
        for (const it of items) { const id = Number(it?.itemId ?? it?.id); if (id > 0) bag.set(id, Math.max(0, Number(it.quantity) || 0)); }
        bagAt = Date.now();
        clanNotify();
    }
    function requestBag() { if (clanOn()) sendGame({ type: 'inv-get' }); }
    // Pede a mochila e espera o frame (até `ms`); resolve true se chegou.
    function refreshBag(ms) {
        const antes = bagAt;
        sendGame({ type: 'inv-get' });
        const t0 = Date.now();
        return new Promise(res => {
            (function loop() {
                if (bagAt !== antes) return res(true);
                if (Date.now() - t0 >= ms) return res(false);
                setTimeout(loop, 250);
            })();
        });
    }

    // field-kill: soma o loot na mochila e o abate no tipo (só para o status; a leitura do jogo corrige).
    function noteClanKill(message) {
        if (!clanOn() || !clanState?.task) return;
        let mudou = false;
        for (const l of Array.isArray(message.loot) ? message.loot : []) {
            const id = Number(l?.itemId);
            if (id > 0 && (bag.has(id) || clanKeepsItem(id))) { bag.set(id, bagQty(id) + (Number(l.qty) || 0)); mudou = true; }
        }
        const sid = typeof creatureIdByName !== 'undefined' ? creatureIdByName.get(normalize(message.speciesName || '')) : null;
        const tipos = sid && typeof creatureTypes !== 'undefined' ? (creatureTypes.get(sid) || []) : [];
        for (const k of clanState.task.kills) if (k.have < k.need && tipos.includes(k.type)) { k.have++; mudou = true; }
        if (mudou) clanNotify();
    }

    // Leitura em andamento: espera por ela (com `force`, lê de novo depois, para a viagem não decidir com estado velho).
    async function refreshClan(force) {
        if (clanBusy) { await clanBusy; if (!force) return; if (clanBusy) return clanBusy; }
        const gap = clanRouteOn() ? CLAN_POLL_ROUTE_MS : CLAN_POLL_MS;
        if (!force && clanFetchedAt && Date.now() - clanFetchedAt < gap) return;
        clanBusy = clanFetch();
        return clanBusy;
    }
    async function clanFetch() {
        try {
            clanState = parseClan(await gameApi(CLAN_URL));
            requestBag();
            const t = clanState.task;
            const sig = JSON.stringify([clanState.clan, clanState.rank, t && [t.rank, t.ok, t.levelOk, t.items.map(i => i.have), t.caught.map(c => c.have)]]);
            if (sig !== clanSig) {
                clanSig = sig;
                logEvent('cla', { cla: clanState.clan, rank: clanState.rank, nivel: clanState.level, tarefa: t ? { rank: t.rank, nivel: t.level, nivelOk: t.levelOk, ok: t.ok, itens: t.items.map(i => `${i.name} ${i.have}/${i.need}`), captura: t.caught.map(c => `${c.name} ${c.have}/${c.need}`), abates: t.kills.map(k => `${k.type} ${k.have}/${k.need}`) } : null });
            }
        } catch (err) {
            logEvent('cla-erro', { erro: String(err?.message || err) });
        } finally {
            clanFetchedAt = Date.now();
            clanBusy = null;
            clanNotify();
        }
    }

    // Sem clã e já pode entrar: entra no escolhido (1ª entrada é grátis). Trocar de clã (diamantes) nunca.
    async function clanAutoJoin(manual) {
        const key = cfg.clanKey || 'orebound';
        if (!clanState || clanState.clan || !clanState.canJoin || !CLAN_INFO[key]) return { ok: false, motivo: clanState?.clan ? 'já está num clã' : 'ainda não pode entrar' };
        if (clanJoinTried && !manual) return { ok: false, motivo: 'já tentei nesta sessão' };
        clanJoinTried = true;
        try {
            await gameApi(CLAN_CHANGE_URL, { method: 'POST', body: JSON.stringify({ clan: key, targetRank: 1 }) });
            logEvent('cla-entrou', { cla: key });
            const who = playerName();
            postWebhook('alert', {
                content: `🛡️ ${who ? `**${who}**` : 'Sua conta'} entrou no clã **${clanName(key)}**`,
                username: 'Poke Idle World',
                embeds: [{ title: `Clã: ${clanName(key)}`, description: (who ? `Conta: ${who}\n` : '') + `Rank 1 (${CLAN_INFO[key].ranks[0]}). O script segue para a tarefa do rank 2.\nEm ${new Date().toLocaleString('pt-BR')}`, color: 0x57f287 }],
            }, { evento: 'cla-entrou', cla: key });
            await refreshClan(true);
            return { ok: true };
        } catch (err) {
            logEvent('cla-erro', { acao: 'entrar', erro: String(err?.message || err) });
            return { ok: false, motivo: String(err?.message || err) };
        }
    }

    const clanSleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    // O que o jogo ainda diz que falta (para o log): ['Solid Earth Piece 3/5', 'ROCK 480/500', 'nível 100'].
    function clanReqsLeft() {
        const t = clanState?.task;
        if (!t) return [];
        return t.items.filter(i => i.have < i.need).map(i => `${i.name} ${i.have}/${i.need}`)
            .concat(t.caught.filter(c => c.have < c.need).map(c => `${c.name} ${c.have}/${c.need}`),
                t.kills.filter(k => k.have < k.need).map(k => `${k.type} ${k.have}/${k.need}`),
                t.levelOk ? [] : [`nível ${t.level}`]);
    }

    // Na cidade (tarefa 'cla' da viagem): converte o item base que a mochila já tem e sobe de rank se a tarefa fechou.
    async function clanCityWork() {
        if (!clanOn()) return { ok: false, motivo: 'desligado' };
        await refreshClan(true);
        if (!clanState?.clan || !clanState.task) return { ok: false, motivo: clanState?.clan ? 'rank máximo' : 'sem clã' };
        await loadItemsCatalog();
        await refreshBag(4000);
        const feito = [];
        for (const i of clanMissing().items) {
            if (!i.base?.id || i.base.direto) continue;
            const packs = Math.min(i.falta, Math.floor(bagQty(i.base.id) / CLAN_PACK));
            if (packs < 1) continue;
            try {
                const r = await gameApi(CONVERT_URL, { method: 'POST', body: JSON.stringify({ baseItemId: i.base.id, packs }) });
                const n = Number(r?.converted) || packs;
                feito.push(`${n}x ${r?.toName || i.name}`);
                bag.set(i.base.id, Math.max(0, bagQty(i.base.id) - n * CLAN_PACK));
                logEvent('cla-converteu', { base: i.base.name, packs, convertido: n, para: r?.toName || i.name });
            } catch (err) { logEvent('cla-erro', { acao: 'converter', base: i.base.name, packs, erro: String(err?.message || err) }); }
        }
        if (feito.length) await refreshClan(true);
        // Tudo entregue pelas nossas contas mas o jogo ainda não marcou `ok` (conversão acabou de entrar): confere de novo.
        if (feito.length && clanState.task && !clanState.task.ok && cfg.clanRankup && clanMissing()?.nada) { await clanSleep(2000); await refreshClan(true); }
        const t = clanState.task;
        logEvent('cla-cidade', { ok: Boolean(t?.ok), nivelOk: t ? t.levelOk : null, convertido: feito, falta: t ? clanReqsLeft() : [] });
        let subiu = null;
        if (t && t.ok && cfg.clanRankup) {
            try {
                const r = await gameApi(CLAN_RANKUP_URL, { method: 'POST', body: '{}' });
                subiu = { de: clanState.rank, para: Number(r?.clanRank) || t.rank, xp: t.rewardXp };
                logEvent('cla-rank', subiu);
                const who = playerName();
                const mention = cfg.mentionUserId ? `<@${cfg.mentionUserId}> ` : '';
                const nomeRank = CLAN_INFO[clanState.clan]?.ranks[subiu.para - 1] || '';
                postWebhook('alert', {
                    content: `${mention}🛡️ ${who ? `**${who}**` : 'Sua conta'} subiu para o rank **${subiu.para}${nomeRank ? ` (${nomeRank})` : ''}** do clã ${clanName(clanState.clan)}`,
                    username: 'Poke Idle World',
                    embeds: [{ title: `Clã ${clanName(clanState.clan)}: rank ${subiu.para}`, description: (who ? `Conta: ${who}\n` : '') + `+${fmtNum(subiu.xp)} XP${feito.length ? `\nConvertido: ${feito.join(', ')}` : ''}\nEm ${new Date().toLocaleString('pt-BR')}`, color: 0x57f287 }],
                }, { evento: 'cla-rank', rank: subiu.para });
                clanTarget = null;
                await refreshClan(true);
            } catch (err) { logEvent('cla-erro', { acao: 'rankup', erro: String(err?.message || err) }); }
        }
        clanNotify();
        return { ok: true, motivo: feito.length || subiu ? null : 'nada para converter', convertido: feito, subiu };
    }

    // ---- rota do clã ----
    function clanLevelCap() {
        const time = team.length ? Math.max(...team.map(p => Number(p.level) || 0)) : 0;
        return time || clanState?.level || 9999;
    }
    function lootPerKill(speciesId, itemName) {
        const loot = typeof creatureLoot !== 'undefined' ? (creatureLoot.get(Number(speciesId)) || []) : [];
        const k = normalize(itemName);
        return loot.filter(l => normalize(l?.name) === k).reduce((a, l) => a + (Number(l.chance) || 0) / 100000 * ((Number(l.minCount) || 1) + (Number(l.maxCount) || Number(l.minCount) || 1)) / 2, 0);
    }
    // Hunts ordenadas pelo quanto adiantam a tarefa: captura primeiro; depois fração da tarefa por abate.
    function clanPlan() {
        const m = clanMissing();
        if (!m || m.nada || !Array.isArray(huntCatalog)) return [];
        const cap = clanLevelCap();
        const hs = huntCatalog.filter(h => h.speciesId && h.level <= cap && !clanFailed.has(h.slug));
        const out = [];
        for (const c of m.caught) {
            const h = hs.find(x => x.speciesId === c.speciesId) || hs.find(x => normalize(x.speciesName || x.name) === normalize(c.name));
            if (h) out.push({ hunt: h, nota: Infinity, motivo: `capturar ${c.name}` });
        }
        const bases = m.items.filter(i => i.base && i.base.falta > 0);
        const rest = [];
        for (const h of hs) {
            const tipos = typeof creatureTypes !== 'undefined' ? (creatureTypes.get(h.speciesId) || []) : [];
            let nota = 0;
            const por = [];
            for (const i of bases) { const e = lootPerKill(h.speciesId, i.base.name); if (e > 0) { nota += e / i.base.falta; por.push(`${i.base.name} ~${Math.round(e * 10) / 10}/abate`); } }
            for (const k of m.kills) if (tipos.includes(k.type)) { nota += 1 / k.falta; por.push(`derrotar ${k.type}`); }
            if (nota > 0) rest.push({ hunt: h, nota, motivo: por.join(', ') });
        }
        rest.sort((a, b) => b.nota - a.nota || a.hunt.level - b.hunt.level);
        return out.concat(rest);
    }
    // Onde cada item base cai (as 3 melhores hunts ao alcance), para o painel.
    function clanDropHints() {
        const m = clanMissing();
        if (!m || !Array.isArray(huntCatalog)) return [];
        const cap = clanLevelCap();
        return m.items.filter(i => i.base).map(i => {
            const top = huntCatalog.filter(h => h.speciesId && h.level <= cap)
                .map(h => ({ h, e: lootPerKill(h.speciesId, i.base.name) })).filter(x => x.e > 0)
                .sort((a, b) => b.e - a.e || a.h.level - b.h.level).slice(0, 3);
            return { base: i.base.name, top: top.map(x => `${x.h.slug} lv${x.h.level} (~${Math.round(x.e * 10) / 10}/abate)`) };
        });
    }

    function clanHuntFailed(slug) {
        clanFailed.add(slug);
        if (clanTarget?.slug === slug) clanTarget = null;
        logEvent('cla-hunt-falhou', { slug });
    }
    function clanReturn(motivo) {
        const volta = clanFrom;
        const atual = normalize(huntSlug || '');
        clanTarget = null; clanFrom = null;
        logEvent('cla-volta', { motivo, volta });
        if (volta && volta !== atual) switchHunt(volta, 1, 'cla');
    }

    // Por que o plano saiu vazio com a tarefa ainda aberta (texto do painel e do log).
    function clanNoPlanReason() {
        const m = clanMissing();
        if (!m) return 'rank máximo';
        if (m.nada) return 'tarefa feita';
        const semBase = m.items.filter(i => !i.base).map(i => i.name);
        if (semBase.length) return `não sei onde cai ${semBase.join(', ')}`;
        const falta = m.items.filter(i => i.base.falta > 0).map(i => i.base.name).concat(m.kills.map(k => `derrotar ${k.type}`), m.caught.map(c => `capturar ${c.name}`));
        if (falta.length) return `nenhuma hunt até lv ${clanLevelCap()} dá ${falta.join(', ')}`;
        return 'item base já na mochila: converte e entrega na próxima viagem';
    }
    // Motivo da espera (painel e log `cla-espera`, só quando muda).
    function clanSetWait(motivo) {
        if (motivo === clanWait) return;
        clanWait = motivo;
        if (motivo) logEvent('cla-espera', { motivo, hunt: huntSlug || null });
        clanNotify();
    }

    // Tarefa pronta: pede viagem urgente. Confirma antes com o jogo (os abates do painel são estimativa local) e refaz o
    // pedido a cada CLAN_READY_RETRY_MS enquanto seguir pronta, até CLAN_READY_MAX_ASKS vezes por rank.
    async function clanAskTrip() {
        if (typeof tripRequest !== 'function' || !clanReadyForCity()) return;
        if (tripRunning || (typeof tripNeeds !== 'undefined' && tripNeeds.has('cla'))) return;
        const rank = clanState.task.rank;
        if (clanReadyAsk.rank !== rank) clanReadyAsk = { rank, n: 0, at: 0 };
        if (clanReadyAsk.n >= CLAN_READY_MAX_ASKS || (clanReadyAsk.at && Date.now() - clanReadyAsk.at < CLAN_READY_RETRY_MS)) return;
        if (Date.now() - clanFetchedAt > 5000) { await refreshClan(true); if (!clanReadyForCity() || clanState.task?.rank !== rank) return; }
        clanReadyAsk.n++; clanReadyAsk.at = Date.now();
        tripRequest('cla', null, clanState.task.ok ? 'tarefa do clã pronta: subir de rank' : 'tarefa do clã pronta: converter e subir de rank');
        if (clanReadyAsk.n === CLAN_READY_MAX_ASKS) logEvent('cla-espera', { motivo: `pedi ${CLAN_READY_MAX_ASKS} viagens para o rank ${rank} e o jogo não deixou subir; agora só na viagem do relógio`, falta: clanReqsLeft() });
    }

    // Tique (60 s): lê a tarefa, entra no clã, pede a viagem se o rank estiver pronto e (com a rota) escolhe a hunt.
    async function clanTick() {
        if (!clanOn()) return;
        await refreshClan(false);
        if (!clanState) return;
        if (!clanState.clan) { if (clanState.canJoin) await clanAutoJoin(false); return; }
        await clanAskTrip();
        if (!clanRouteOn()) { clanSetWait(''); return; }
        if (!Array.isArray(huntCatalog)) {
            try { await loadHuntCatalog(); } catch (err) { clanSetWait(`não consegui baixar o mapa de hunts (${String(err?.message || err)})`); return; }
        }
        await loadItemsCatalog();
        if (tripRunning) { clanSetWait('esperando a viagem à cidade acabar'); return; }
        if ((typeof healBusy === 'function' && healBusy())) { clanSetWait('esperando a cura na Nurse Joy acabar'); return; }
        if (huntSwitch) { clanSetWait(`esperando a troca para ${huntSwitch.slug} confirmar`); return; }
        if (swapPending) { clanSetWait('esperando a troca de líder confirmar'); return; }
        if (dailyWantsHunt()) { clanSetWait('a Daily Kill está usando a hunt (o clã segue quando ela acabar)'); return; }   // a Daily vem primeiro
        const plano = clanPlan();
        const atual = normalize(huntSlug || '');
        if (!plano.length) {
            const motivo = clanNoPlanReason();
            clanSetWait(motivo);
            if (clanTarget) clanReturn(motivo);
            return;
        }
        clanSetWait('');
        let alvo = plano[0];
        const aqui = plano.find(x => x.hunt.slug === atual);
        if (aqui && alvo.nota !== Infinity && aqui.nota >= alvo.nota * CLAN_KEEP_RATIO) alvo = aqui; // não troca por pouco
        if (!clanTarget || clanTarget.slug !== alvo.hunt.slug) {
            clanTarget = { slug: alvo.hunt.slug, name: alvo.hunt.name, level: alvo.hunt.level, motivo: alvo.motivo };
            logEvent('cla-alvo', clanTarget);
            clanNotify();
        }
        if (atual === alvo.hunt.slug) return;
        if (!clanFrom && atual && !CITY_SLUGS.includes(atual)) clanFrom = atual;
        switchHunt(alvo.hunt.slug, 1, 'cla');
    }

    // Fila `pending` na hunt da captura da tarefa: joga a bola (a mesma da rota de captura).
    function clanOnPending(list) {
        if (!clanRouteOn() || catchRouteActive()) return;
        const m = clanMissing();
        if (!m || !m.caught.length) return;
        if (Date.now() < catchCooldownUntil || Date.now() - catchSentAt < CATCH_SEND_GAP_MS) return;
        const alvo = list.find(p => p && p.id != null && m.caught.some(c => Number(p.pokeId) === c.speciesId || normalize(p.name) === normalize(c.name)));
        if (!alvo || catchSentFor === alvo.id) return;
        const ballId = catchBallId();
        if (!ballId || ballQty(ballId) === 0) { logEvent('cla-sem-bola', { ballId, name: alvo.name }); return; }
        catchSentFor = alvo.id;
        catchSentAt = Date.now();
        const ok = sendGame({ type: 'catch', pendingId: alvo.id, ballId });
        logEvent('cla-bola', { pendingId: alvo.id, name: alvo.name, ballId, enviado: ok });
        setTimeout(() => refreshClan(true), 5000);   // confere o "capturar" da tarefa
    }

    // Texto do painel: { head, reqs:[linha], dicas:[linha], rota }.
    function clanStatus(d) {
        d = d || cfg;
        if (!d.clanEnabled) return { head: 'Clã desligado', reqs: [], dicas: [], rota: '' };
        const c = clanState;
        if (!c) return { head: clanFetchedAt ? 'não consegui ler o clã (veja o log)' : 'ainda não lido', reqs: [], dicas: [], rota: '' };
        if (!c.clan) return { head: c.canJoin ? `Sem clã · entrando em ${clanName(d.clanKey)} (1ª entrada é grátis)` : `Sem clã · entra no nível ${c.joinLevel} (você: ${c.level})`, reqs: [], dicas: [], rota: '' };
        const info = CLAN_INFO[c.clan];
        const nomeRank = info?.ranks[c.rank - 1] || '';
        const t = c.task;
        if (!t) return { head: `${clanName(c.clan)} rank ${c.rank}${nomeRank ? ` (${nomeRank})` : ''} · rank máximo ⭐`, reqs: [], dicas: [], rota: '' };
        const m = clanMissing();
        const reqs = [];
        for (const i of t.items) {
            const mi = m.items.find(x => x.itemId === i.itemId);
            const vendendo = mi?.base?.id && cfg.sellItems && cfg.sellItems[mi.base.id] ? ' · marcado para venda na aba Venda: o script NÃO vende enquanto a tarefa pedir' : '';
            reqs.push(`${i.have >= i.need ? '✔' : '•'} Entregar ${i.name} ${fmtNum(Math.min(i.have, i.need))}/${fmtNum(i.need)}${mi?.base && !mi.base.direto ? ` · ${mi.base.name} na mochila ${fmtNum(mi.base.have)}${mi.base.falta ? ` (faltam ${fmtNum(mi.base.falta)})` : ' ✔ (converte na viagem)'}${vendendo}` : ''}`);
        }
        for (const x of t.caught) reqs.push(`${x.have >= x.need ? '✔' : '•'} Capturar ${x.name} ${x.have}/${x.need}`);
        for (const k of t.kills) reqs.push(`${k.have >= k.need ? '✔' : '•'} Derrotar ${k.type} ${fmtNum(Math.min(k.have, k.need))}/${fmtNum(k.need)}`);
        const nivel = t.levelOk ? `nível ${t.level} ✔` : `nível ${t.level} ✖ (você: ${c.level})`;
        const pronto = t.ok ? ' · pronto para subir' + (d.clanRankup ? ' (na próxima viagem)' : ' (suba no jogo)') : '';
        const dicas = clanDropHints().map(x => `${x.base}: ${x.top.length ? x.top.join(' · ') : 'nenhuma hunt ao alcance'}`);
        const rota = !d.clanRoute ? 'Rota do clã desligada' : clanTarget ? `▶ ${clanTarget.slug} lv${clanTarget.level} (${clanTarget.motivo})${clanFrom ? ` · volta para ${clanFrom}` : ''}` : (m.nada ? 'Nada a caçar' : clanWait ? `parado: ${clanWait}` : clanRouteOn() ? 'escolhendo a hunt… (confere a cada 1 min)' : 'salve para ligar');
        return { head: `${clanName(c.clan)} rank ${c.rank}${nomeRank ? ` (${nomeRank})` : ''} → ${t.rank}${t.name ? ` ${t.name}` : ''} · ${nivel} · +${fmtNum(t.rewardXp)} XP${pronto}`, reqs, dicas, rota };
    }

    // ---- Guardar na cidade: o que sobrou da venda vai para o Depot comum ou para a família ---------
    // Levantado no bundle em 27/09/2026 (janelas Depot e Família):
    //   GET  /api/game/depot -> { inventory:[{ id, name, quantity, npcPrice, category }] (mochila), depot:[...] }
    //   POST /api/game/depot/move { itemId, dir:'store'|'withdraw' } -> mesmo formato; move a PILHA inteira ({ all:true } = tudo)
    //   family-action { action:'item', dir:'deposit', itemId, quantity } e { action:'poke', dir:'deposit', capturedId } pelo
    //        socket -> frame `family` ou `error`. Limite diário: 50 movimentos + 50 por membro VIP (máx. 250). O que entra
    //        passa a ser DA FAMÍLIA (qualquer membro retira).
    //   Pokémon no "Depot comum" = o box: todo Pokémon fora do time já está lá (`poke-store` só tira do time). Por isso o
    //   destino dos Pokémon é só a família.
    // Roda como ÚLTIMA tarefa de toda viagem à cidade (depois de vender, comprar e do clã) e nunca pede viagem sozinho.
    // Lista da família (v3.19.0, `depositFamilyList`): itens escolhidos pelo usuário (ex.: Devoted Token, Bronze Dimensional
    //   Key, Strange Pheromone, algumas stones) vão SEMPRE para a família, venham de onde vierem (drop, daily, boss), menos a
    //   reserva `keep` de cada um. Vão primeiro, antes dos Pokémon e dos drops, para não ficarem sem movimento no dia.
    // Itens: só os que já caíram em hunt (ids vistos em `field-kill`, em localStorage.pgDiscordNotifyDrops), menos
    //   consumível (DEPOSIT_SKIP_CATS: poção, revive, bola, berry, held, TM, addon...), os marcados para venda (ficam na mochila: vendidos ou "Manter") e os que a tarefa
    //   do clã pede (a conversão usa a mochila).
    // Pokémon: fora do time que a venda NÃO vende (regras da aba Venda), menos inicial, anunciado no mercado, capturado há
    //   menos de 2 min, com 🔒 (o jogo recusa travado na família), da tarefa do clã e, sem `depositPokesRare`, shiny.

    const DEPOT_MOVE_URL = '/api/game/depot/move';
    const DROPS_KEY = 'pgDiscordNotifyDrops';
    // Consumíveis nunca saem da mochila (o jogo usa na hunt ou o jogador usa na mão), mesmo que um dia caiam em hunt.
    const DEPOSIT_SKIP_CATS = ['heal', 'revive', 'ball', 'berry', 'held', 'tm', 'addon', 'pokecard', 'vitamin', 'energy'];
    const DEPOSIT_WAIT_MS = 5000;
    const DEPOSIT_WAIT_RETRY_MS = 15000;      // 2ª espera pelo frame `family` (v3.24.2: jogo lento não é "sem família")
    const DEPOSIT_GAP_MS = [300, 700];        // pausa entre movimentos (sorteada)
    const droppedIds = loadDropped();         // ids de item que já caíram em hunt
    let lastDeposit = null;                   // { at, itens, pokes, erros } da última viagem
    let depositRunning = false;

    function loadDropped() {
        try { const a = JSON.parse(localStorage.getItem(DROPS_KEY) || '[]'); return new Set(Array.isArray(a) ? a.map(Number).filter(n => n > 0) : []); }
        catch { return new Set(); }
    }
    function saveDropped() {
        try { localStorage.setItem(DROPS_KEY, JSON.stringify([...droppedIds].slice(-500))); } catch { /* sem localStorage */ }
    }
    function noteDepositDrop(message) {
        let novo = false;
        for (const l of Array.isArray(message?.loot) ? message.loot : []) {
            const id = Number(l?.itemId);
            if (id > 0 && !droppedIds.has(id)) { droppedIds.add(id); novo = true; }
        }
        if (novo) saveDropped();
    }
    function familyList(d) {
        d = d || cfg;
        return (Array.isArray(d.depositFamilyList) ? d.depositFamilyList : [])
            .filter(e => e && (Number(e.id) > 0 || e.name))
            .map(e => ({ id: Number(e.id) || 0, name: String(e.name || ''), keep: Math.max(0, Math.floor(Number(e.keep) || 0)) }));
    }
    function familyListEntry(id, name, d) {
        const n = normalize(name || '');
        return familyList(d).find(e => (e.id && e.id === Number(id)) || (n && normalize(e.name) === n)) || null;
    }
    function depositWanted(d) { d = d || cfg; return Boolean(d.depositItems || d.depositPokes || familyList(d).length); }
    // Motivo para um item da mochila NÃO ir para o depósito, ou null se vai.
    function depositItemReason(inv, item) {
        const id = Number(inv?.id ?? inv?.itemId);
        if (!(Math.floor(Number(inv?.quantity) || 0) > 0)) return 'vazio';
        if (!droppedIds.has(id)) return 'não é drop de hunt';
        if (DEPOSIT_SKIP_CATS.includes(String(item?.category || inv?.category || ''))) return 'consumível';
        if (cfg.sellEnabled && cfg.sellItems && cfg.sellItems[id]) return 'marcado para venda';
        if (typeof clanKeepsItem === 'function' && clanKeepsItem(id)) return 'tarefa do clã';
        return null;
    }
    // Motivo para um Pokémon NÃO ir para a família, ou null se vai.
    function depositPokeReason(p, d) {
        d = d || cfg;
        if (!p || typeof p !== 'object') return 'inválido';
        if (p.team || p.leader || String(p.id).startsWith('team-')) return 'no time';
        if (p.starter) return 'inicial';
        if (p.listed || p.tradeId) return 'anunciado no mercado';
        if (p.locked) return 'cadeado';          // o jogo recusa: "Este Pokémon está TRAVADO (cadeado)" (log da conta3, 28/09/2026)
        if (!d.depositPokesRare && p.shiny) return 'shiny';
        const at = recentCaptureIds.get(String(p.id));
        if (at && Date.now() - at < POKE_SELL_RECENT_MS) return 'capturado agora';
        if (typeof clanKeepsSpecies === 'function' && clanKeepsSpecies(Number(p.speciesId))) return 'tarefa do clã';
        if (typeof breedKeepsPoke === 'function' && breedKeepsPoke(p)) return 'breeding';
        if (d.pokeSellEnabled && !pokeSellReason(p, d)) return 'vai ser vendido';
        return null;
    }
    function depositPokeCandidates(d, list) { return (Array.isArray(list) ? list : lastPokesList).filter(p => !depositPokeReason(p, d)); }

    function depositSleep() { return new Promise(r => setTimeout(r, DEPOSIT_GAP_MS[0] + Math.random() * (DEPOSIT_GAP_MS[1] - DEPOSIT_GAP_MS[0]))); }
    // Manda `send()` e espera `getAt()` mudar (frame novo) por até `ms`.
    function waitFrame(getAt, send, ms) {
        const antes = getAt();
        send();
        const t0 = Date.now();
        return new Promise(res => {
            (function loop() {
                if (getAt() !== antes) return res(true);
                if (Date.now() - t0 >= ms) return res(false);
                setTimeout(loop, 250);
            })();
        });
    }
    const FAMILY_STOP = /limite|congelad|família|familia/i;   // motivo que encerra os depósitos na família desta viagem

    async function depositCityWork() {
        if (!depositWanted()) return { ok: false, motivo: 'desligado' };
        if (depositRunning) return { ok: false, motivo: 'já guardando' };
        depositRunning = true;
        const res = { itens: [], itensFamilia: [], pokes: [], erros: [] };
        const lista = familyList();
        let movs = Infinity;
        const familiaNaConta = () => movs > 0;
        const pararFamilia = (motivo) => FAMILY_STOP.test(motivo || '');
        try {
            if (lista.length || cfg.depositItems === 'family' || cfg.depositPokes === 'family') {
                // Sem resposta ao family-get, `lastFamily` segue null e parecia "sem família" (bobosky, 02/10/2026, com o
                // jogo lento). Agora: tenta de novo com espera maior e, ainda mudo, diz que o jogo não respondeu.
                let veio = await waitFrame(() => lastFamilyAt, () => sendGame({ type: 'family-get' }), DEPOSIT_WAIT_MS);
                if (!veio && !lastFamilyAt) {
                    logEvent('familia-espera', { tentativa: 2, esperaMs: DEPOSIT_WAIT_RETRY_MS });
                    veio = await waitFrame(() => lastFamilyAt, () => sendGame({ type: 'family-get' }), DEPOSIT_WAIT_RETRY_MS);
                }
                if (!veio && !lastFamilyAt) { res.erros.push(`o jogo não respondeu ao family-get em ${(DEPOSIT_WAIT_MS + DEPOSIT_WAIT_RETRY_MS) / 1000} s (tento na próxima viagem)`); movs = 0; }
                else if (!lastFamily) { res.erros.push('a conta não está numa família'); movs = 0; }
                else if (lastFamily.frozen) { res.erros.push('depósito da família congelado'); movs = 0; }
                else movs = Math.max(0, lastFamily.movesCap - lastFamily.movesUsed);
                if (lastFamily && !movs && !lastFamily.frozen) res.erros.push(`limite diário da família (${lastFamily.movesUsed}/${lastFamily.movesCap})`);
            }
            let mochila = [], catalog = new Map();
            if (lista.length || cfg.depositItems) {
                catalog = await loadItemsCatalog();
                try { const dep = await gameApi(DEPOT_URL); mochila = Array.isArray(dep?.inventory) ? dep.inventory : []; }
                catch (err) { res.erros.push(`mochila: ${err?.message || err}`); }
            }
            const feitos = new Set();
            // 1) lista da família: o que o usuário escolheu, de qualquer origem, menos a reserva
            if (lista.length && familiaNaConta()) {
                for (const inv of mochila) {
                    const id = Number(inv?.id ?? inv?.itemId);
                    const item = catalog.get(id) || inv;
                    const nome = inv.name || item.name || `Item ${id}`;
                    const e = familyListEntry(id, nome);
                    if (!e) continue;
                    feitos.add(id);
                    if (DEPOSIT_SKIP_CATS.includes(String(item?.category || inv?.category || ''))) continue;   // consumível nunca sai
                    if (typeof clanKeepsItem === 'function' && clanKeepsItem(id)) continue;
                    const qty = Math.floor(Number(inv.quantity) || 0) - e.keep;
                    if (qty <= 0) continue;
                    if (!familiaNaConta()) break;
                    const r = await familyItemDeposit(id, qty, nome);
                    if (r.ok) { res.itensFamilia.push(`${qty}x ${nome}`); movs--; }
                    else { res.erros.push(`${nome}: ${r.motivo}`); if (pararFamilia(r.motivo)) { movs = 0; break; } }
                    await depositSleep();
                }
            }
            // 2) Pokémon (só família), com a lista relida depois da venda
            if (cfg.depositPokes === 'family' && familiaNaConta()) {
                await waitFrame(() => lastPokesAt, () => sendGame({ type: 'pokes-get' }), DEPOSIT_WAIT_MS);
                for (const p of depositPokeCandidates(cfg)) {
                    if (!familiaNaConta()) break;
                    const r = await familyDeposit(String(p.id), p.name);
                    if (r.ok) { res.pokes.push(pokeLabel(p)); movs--; }
                    else { res.erros.push(`${p.name}: ${r.motivo}`); if (pararFamilia(r.motivo)) { movs = 0; break; } }
                    await depositSleep();
                }
            }
            // 3) drops que sobraram (regra geral), fora os da lista
            const destino = cfg.depositItems;
            if (destino && !(destino === 'family' && !familiaNaConta())) {
                for (const inv of mochila) {
                    const id = Number(inv?.id ?? inv?.itemId);
                    if (feitos.has(id)) continue;
                    const item = catalog.get(id) || inv;
                    if (depositItemReason(inv, item)) continue;
                    const qty = Math.floor(Number(inv.quantity) || 0);
                    const nome = inv.name || item.name || `Item ${id}`;
                    if (destino === 'depot') {
                        try {
                            const r = await gameApi(DEPOT_MOVE_URL, { method: 'POST', body: JSON.stringify({ itemId: id, dir: 'store' }) });
                            const ficou = Array.isArray(r?.inventory) && r.inventory.some(x => Number(x?.id ?? x?.itemId) === id && Number(x.quantity) > 0);
                            if (ficou) res.erros.push(`${nome}: continuou na mochila`); else res.itens.push(`${qty}x ${nome}`);
                        } catch (err) { res.erros.push(`${nome}: ${err?.message || err}`); }
                    } else {
                        if (!familiaNaConta()) break;
                        const r = await familyItemDeposit(id, qty, nome);
                        if (r.ok) { res.itensFamilia.push(`${qty}x ${nome}`); movs--; }
                        else { res.erros.push(`${nome}: ${r.motivo}`); if (pararFamilia(r.motivo)) break; }
                    }
                    await depositSleep();
                }
            }
        } finally {
            depositRunning = false;
        }
        lastDeposit = Object.assign({ at: Date.now() }, res);
        logEvent('guardar-cidade', { itensDepot: res.itens, itensFamilia: res.itensFamilia, pokes: res.pokes, erros: res.erros, lista: lista.map(e => e.name), destinoItens: cfg.depositItems || null, destinoPokes: cfg.depositPokes || null, movimentosSobrando: Number.isFinite(movs) ? movs : null });
        const movidos = res.itens.length + res.itensFamilia.length + res.pokes.length;
        if (movidos || res.erros.length) {
            const who = playerName();
            const partes = [];
            if (res.itens.length) partes.push(`**${res.itens.length} ${res.itens.length === 1 ? 'item' : 'itens'}** no Depot`);
            if (res.itensFamilia.length) partes.push(`**${res.itensFamilia.length} ${res.itensFamilia.length === 1 ? 'item' : 'itens'}** na família`);
            if (res.pokes.length) partes.push(`**${res.pokes.length} Pokémon** na família`);
            postWebhook('alert', {
                content: `📦 ${who ? `**${who}**` : 'Sua conta'} ${partes.length ? `guardou ${partes.join(' e ')}` : 'não conseguiu guardar nada'}`,
                username: 'Poke Idle World',
                embeds: [{
                    title: 'Guardar na cidade',
                    description: (who ? `Conta: ${who}\n` : '')
                        + (res.itensFamilia.length ? `Família (itens): ${res.itensFamilia.join(', ')}\n` : '')
                        + (res.pokes.length ? `Família (Pokémon): ${res.pokes.join(', ')}\n` : '')
                        + (res.itens.length ? `Depot: ${res.itens.join(', ')}\n` : '')
                        + (res.erros.length ? `⚠ ${res.erros.slice(0, 6).join(' · ')}\n` : '')
                        + (lastFamily && Number.isFinite(movs) ? `Movimentos da família sobrando hoje: ${movs}\n` : '')
                        + `Em ${new Date().toLocaleString('pt-BR')}`,
                    color: res.erros.length && !movidos ? 0xed4245 : res.erros.length ? 0xfee75c : 0x57f287,
                }],
            }, { evento: 'guardar-cidade', itens: res.itens.length + res.itensFamilia.length, pokes: res.pokes.length });
        }
        return { ok: res.erros.length === 0 || movidos > 0, motivo: res.erros[0] || (movidos ? null : 'nada para guardar'), ...res };
    }
    // Linha do painel.
    function depositStatus(d) {
        d = d || cfg;
        if (!depositWanted(d)) return 'Desligado: o que sobra fica na mochila e no box.';
        const p = [];
        if (d.depositPokes === 'family') { const n = depositPokeCandidates(d).length; p.push(`${n} Pokémon iriam para a família agora`); }
        const lista = familyList(d);
        if (lista.length) p.push(`${lista.length} ${lista.length === 1 ? 'item escolhido' : 'itens escolhidos'} para a família`);
        if (d.depositItems) p.push(`drops ${d.depositItems === 'depot' ? 'para o Depot' : 'para a família'} (${droppedIds.size} tipos de drop conhecidos)`);
        let txt = `Na próxima viagem: ${p.join(' · ')}.`;
        if (lastDeposit) txt += ` Última (${new Date(lastDeposit.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}): ${lastDeposit.itensFamilia.length + lastDeposit.itens.length} itens, ${lastDeposit.pokes.length} Pokémon${lastDeposit.erros.length ? `, ⚠ ${lastDeposit.erros[0]}` : ''}.`;
        return txt;
    }

    // ---- Viagem à cidade: vender e comprar no NPC FORA da hunt (regra do jogo) ----------
    // Anúncio do jogo (26/09/2026, colado pelo usuário): não é mais permitido comprar/vender itens no NPC Mark,
    // vender Pokémon, usar o Mercado Global nem o Depot DURANTE a hunt. Toda venda/compra do script passa a ser
    // uma viagem: sair da hunt, ir à cidade (padrão Cerulean, onde ficam o Mark e o Mercado), fazer as tarefas
    // com pausas humanas e voltar à hunt.
    //   ida   : `leave-hunt` + `field-teleport-city` sintético no socket (o cliente viaja para Cerulean e manda
    //           `set-city` sozinho, encerrando a hunt no servidor; se não vier em TRIP_CITY_WAIT_MS, mandamos o
    //           `set-city` nós mesmos); espera "andar até o NPC".
    //   tarefas: venda de itens (lista congelada na hora do pedido, porque `huntLoot` zera ao sair da hunt), venda
    //           de Pokémon e compra de bolas — as mesmas funções de antes, só que executadas na cidade.
    //   volta : switchHunt(slug, 1, 'viagem') → `enter-hunt` + `hunt-resume` sintético (a tela acompanha).
    // Quem PEDE viagem: sellTick, pokeSellOnPokes, checkBallStock, checkSupplyStock e os botões do painel. Os pedidos acumulam em
    // `tripNeeds`; `tripTick` (30 s) faz UMA viagem com tudo que estiver pendente, respeitando `tripMinGapMin`
    // entre viagens e sem troca de hunt/líder ou captura em andamento. Durante a viagem, rota de captura e recarga
    // não trocam de hunt. Sem hunt para voltar (conta já na cidade), só faz as tarefas.

    const TRIP_TICK_MS = 30 * 1000;
    const TRIP_CITY_WAIT_MS = 10 * 1000;    // espera pelo set-city do cliente depois do teleporte
    const TRIP_WALK_MS = [4000, 9000];      // "andar até o NPC"
    const TRIP_BETWEEN_MS = [2000, 5000];   // entre tarefas
    const TRIP_BEFORE_BACK_MS = [3000, 8000];
    const TRIP_MIN_GAP_DEFAULT_MIN = 3;

    let tripRunning = false;
    let tripPhase = '';
    const tripNeeds = new Map();    // tarefa -> { dados, motivo, at }
    let lastTripAt = 0;
    let lastTripInfo = null;        // { at, motivo, tarefas:[{ key, ok, motivo }], volta, seg }
    let tripCityArrived = false;
    let nextTripDelayMs = 0;        // relógio único (v3.15.0): sorteado em [tripEveryMin, tripEveryMaxMin] a cada ciclo
    let onTripChange = null;        // callback do painel

    const tripRnd = (par) => par[0] + Math.floor(Math.random() * (par[1] - par[0] + 1));
    const tripWait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    function tripCity() { const c = normalize(cfg.tripCity || ''); return CITY_SLUGS.includes(c) ? c : 'cerulean'; }
    function tripMinGapMs() { return Math.max(1, Number(cfg.tripMinGapMin) || TRIP_MIN_GAP_DEFAULT_MIN) * 60 * 1000; }
    function tripIntervalRange(d) {
        d = d || cfg;
        const min = Math.max(1, Number(d.tripEveryMin) || 10);
        const max = Math.max(min, Number(d.tripEveryMaxMin) || 0);
        return { min, max };
    }
    function drawTripDelay() {
        const { min, max } = tripIntervalRange();
        nextTripDelayMs = Math.round((min + Math.random() * (max - min)) * 60 * 1000);
        return nextTripDelayMs;
    }
    // (Re)começa o relógio: na carga, ao mudar a faixa no Salvar e depois de cada viagem (ou de um horário sem nada a fazer).
    function restartTripCycle() { lastTripAt = Date.now(); drawTripDelay(); tripNotify(); }
    function tripDueAt() { return lastTripAt + (nextTripDelayMs || drawTripDelay()); }
    // O que a próxima viagem levaria agora (d = cfg ou rascunho do painel): { drops, pokes, bolas:{id,qty,min}|null }.
    function tripLoad(d) {
        d = d || cfg;
        const drops = d.sellEnabled ? Object.keys(d.sellItems || {}).map(Number).filter(id => huntLoot.has(id)).length : 0;
        const pokes = d.pokeSellEnabled ? pokeSellCandidates(d).length : 0;
        let bolas = null;
        if (d.autoBuy) { const id = watchedBallId(); const q = ballQty(id); const min = (Number(d.ballsMin) || 0) > 0 ? Number(d.ballsMin) : 1; if (id != null && q != null && q < min) bolas = { id, qty: q, min }; }
        const cla = typeof clanWantsCity === 'function' && clanWantsCity(d);
        const sup = typeof supplyLow === 'function' ? supplyLow(d) : [];
        const suprimentos = sup.length ? sup : null;
        const slot = typeof slotWanted === 'function' && slotWanted(d);
        const time = (typeof pokeSellListUnread === 'function' && pokeSellListUnread()) || (typeof pokesListWanted === 'function' && pokesListWanted());
        const breeding = typeof breedWanted === 'function' && breedWanted();
        return { drops, pokes, bolas, cla, suprimentos, slot, time, breeding, nada: !drops && !pokes && !bolas && !cla && !suprimentos && !slot && !time && !breeding };
    }
    function tripLoadText(l) {
        const p = [];
        if (l.drops) p.push(`${l.drops} ${l.drops === 1 ? 'drop' : 'drops'}`);
        if (l.pokes) p.push(`${l.pokes} Pokémon`);
        if (l.bolas) p.push(`comprar ${Number(cfg.autoBuyQty) || 100} ${ballName(l.bolas.id)}`);
        if (l.suprimentos) p.push(l.suprimentos.map(s => `comprar ${s.qty} ${s.name}`).join(', '));
        if (l.cla) p.push('clã (converter/subir de rank)');
        if (l.slot) p.push('slot machine (roll grátis)');
        if (l.time) p.push('ler o time (a lista nunca veio; o jogo só responde na cidade)');
        if (l.breeding) p.push('breeding (cruzar)');
        if (p.length && typeof depositWanted === 'function' && depositWanted()) p.push('guardar o resto');
        return p.length ? `Vai levar: ${p.join(', ')}` : 'Nada para levar por enquanto';
    }
    function tripNotify() { if (onTripChange) { try { onTripChange(); } catch { /* painel fechado */ } } }

    // Registra uma necessidade; a viagem sai no próximo tique livre.
    function tripRequest(key, dados, motivo) {
        const novo = !tripNeeds.has(key);
        tripNeeds.set(key, { dados: dados || null, motivo: motivo || '', at: tripNeeds.get(key)?.at || Date.now() });
        if (novo) logEvent('viagem-pedida', { tarefa: key, motivo: motivo || '' });
        tripNotify();
    }
    function tripReturnSlug() {
        const h = normalize(huntSlug || '');
        if (h && !CITY_SLUGS.includes(h)) return h;
        if (catchRouteActive() && catchTarget) return catchTarget.slug;
        const st = routeStep();
        if (st?.slug) return st.slug;
        return lastRealHunt || null;
    }
    const TRIP_PHASE_PCT = { 'indo para a cidade': 15, 'na cidade': 50, 'voltando': 90 };
    function tripLastText() {
        if (!lastTripInfo) return '';
        const nome = { itens: 'drops', pokes: 'Pokémon', bolas: 'bolas', suprimentos: 'poções/revives', cla: 'clã', guardar: 'guardar', evoluir: 'evolução', slot: 'slot machine', time: 'ler o time', breeding: 'breeding' };
        return `Última ${new Date(lastTripInfo.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}: ${lastTripInfo.tarefas.map(t => `${nome[t.key] || t.key} ${t.ok ? '✔' : '✖'}`).join(' · ')}`;
    }
    // Estado para a faixa do painel: { busy, pct, title, sub }.
    function tripStatus(d) {
        if (tripRunning) {
            const fase = tripPhase || 'indo para a cidade';
            const titulo = fase === 'indo para a cidade' ? 'Indo à cidade…' : fase === 'na cidade' ? 'Na cidade: vendendo e comprando…' : `Voltando para ${tripReturnSlug() || 'a hunt'}…`;
            return { busy: true, pct: TRIP_PHASE_PCT[fase] || 30, title: titulo, sub: 'A tela acompanha; espere terminar.' };
        }
        const load = tripLoad(d);
        const pend = [...tripNeeds.keys()];
        const ms = tripDueAt() - Date.now();
        const hora = new Date(tripDueAt()).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const title = pend.length ? 'Viagem à cidade sai no próximo minuto' : `Próxima viagem à cidade em ${Math.max(1, Math.ceil(ms / 60000))} min (${hora})`;
        const sub = tripLoadText(load) + (lastTripInfo ? ` · ${tripLastText()}` : '');
        return { busy: false, pct: 0, title, sub, load };
    }

    // A tela do jogo viaja para a cidade com o mesmo handler que o servidor usa para teleportar (`field-teleport-city`).
    function nudgeClientToCity() {
        try {
            if (!lastSocket || typeof lastSocket.dispatchEvent !== 'function' || typeof MessageEvent !== 'function') return false;
            lastSocket.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ type: 'field-teleport-city', synthetic: true }) }));
            return true;
        } catch (err) { logEvent('viagem-tela-erro', { erro: String(err?.message || err) }); return false; }
    }
    function tripOnSetCity() { tripCityArrived = true; }

    // Monta as tarefas a partir das necessidades registradas.
    function tripTasksFor(needs) {
        const tarefas = [];
        for (const [key, n] of needs) {
            if (key === 'itens') tarefas.push({ key, run: () => runSellCycle(true, n.dados?.wanted, n.dados?.hunt) });
            else if (key === 'pokes') tarefas.push({ key, run: () => runPokeSellCycle(true) });
            else if (key === 'time') tarefas.push({ key, run: () => Promise.resolve(pokeSellRefreshList()).then(ok => ({ ok, motivo: ok ? null : 'o jogo não respondeu ao pedido da lista' })) });
            else if (key === 'bolas' && n.dados) tarefas.push({ key, run: () => autoBuyBalls(n.dados.id, n.dados.qty, n.dados.min) });
            else if (key === 'suprimentos') tarefas.push({ key, run: () => supplyCityWork() });
            else if (key === 'cla') tarefas.push({ key, run: () => clanCityWork() });
            else if (key === 'evoluir') tarefas.push({ key, run: () => evolveCityWork() });
            else if (key === 'slot') tarefas.push({ key, run: () => slotCityWork() });
            else if (key === 'breeding') tarefas.push({ key, run: () => breedCityWork() });
        }
        // Guardar na cidade (v3.18.0): última tarefa de toda viagem que tenha outra coisa a fazer.
        if (tarefas.length && typeof depositWanted === 'function' && depositWanted()) tarefas.push({ key: 'guardar', run: () => depositCityWork() });
        return tarefas;
    }

    async function cityTrip(motivo, tarefas) {
        if (tripRunning) return { ok: false, motivo: 'viagem em andamento' };
        if (!tarefas.length) return { ok: false, motivo: 'nada a fazer' };
        tripRunning = true;
        const t0 = Date.now();
        const volta = tripReturnSlug();
        const emHunt = Boolean(normalize(huntSlug || '')) && !CITY_SLUGS.includes(normalize(huntSlug || ''));
        const res = [];
        tripNotify();
        try {
            tripPhase = 'indo para a cidade';
            tripCityArrived = false;
            let tela = null;
            if (emHunt) {
                sendGame({ type: 'leave-hunt' });
                tela = nudgeClientToCity();
                const limite = Date.now() + TRIP_CITY_WAIT_MS;
                while (!tripCityArrived && Date.now() < limite) await tripWait(500);
                if (!tripCityArrived) sendGame({ type: 'set-city', slug: tripCity() }); // a tela não viajou: avisa o servidor nós mesmos
            }
            logEvent('viagem', { fase: 'cidade', motivo, cidade: tripCity(), estavaEmHunt: emHunt, pelaTela: tripCityArrived, tela, volta, tarefas: tarefas.map(t => t.key) });
            tripPhase = 'na cidade';
            tripNotify();
            await tripWait(tripRnd(TRIP_WALK_MS));
            for (const t of tarefas) {
                let r;
                try { r = await t.run(); } catch (err) { r = { ok: false, motivo: String(err?.message || err) }; }
                res.push({ key: t.key, ok: Boolean(r?.ok), motivo: r?.motivo || null, r });
                await tripWait(tripRnd(TRIP_BETWEEN_MS));
            }
            tripPhase = 'voltando';
            tripNotify();
            await tripWait(tripRnd(TRIP_BEFORE_BACK_MS));
            if (volta) switchHunt(volta, 1, 'viagem');
        } finally {
            tripRunning = false;
            tripPhase = '';
            lastTripAt = Date.now();
            drawTripDelay();
            lastTripInfo = { at: lastTripAt, motivo, tarefas: res, volta, seg: Math.round((lastTripAt - t0) / 1000) };
            logEvent('viagem', { fase: 'fim', motivo, tarefas: res, volta, seg: lastTripInfo.seg });
            tripNotify();
        }
        return { ok: res.length > 0 && res.every(r => r.ok), tarefas: res, volta };
    }

    // Aproveita a viagem: quem já tem o que fazer vai junto ("carona"), mesmo sem ter vencido o próprio intervalo.
    function tripAugment(needs) {
        const has = (k) => needs.some(([key]) => key === k);
        if (!has('itens') && cfg.sellEnabled) { const wanted = sellWantedNow(); if (wanted.length) needs.push(['itens', { dados: { wanted, hunt: huntSlug }, motivo: 'carona' }]); }
        if (!has('pokes') && cfg.pokeSellEnabled && pokeSellCandidates(cfg).length) needs.push(['pokes', { dados: null, motivo: 'carona' }]);
        else if (!has('pokes') && typeof pokeSellListUnread === 'function' && pokeSellListUnread()) needs.push(['pokes', { dados: null, motivo: 'lista de Pokémon nunca lida (o jogo só responde na cidade)' }]);
        else if (!has('time') && typeof pokesListWanted === 'function' && pokesListWanted()) needs.push(['time', { dados: null, motivo: 'ler o time na cidade (lista nunca lida)' }]);
        if (!has('bolas') && cfg.autoBuy) {
            const id = watchedBallId(), q = ballQty(id), min = effectiveBallsMin();
            if (id != null && q != null && q < min) needs.push(['bolas', { dados: { id, qty: q, min }, motivo: 'carona' }]);
        }
        if (!has('suprimentos') && typeof supplyLow === 'function' && supplyLow().length) needs.push(['suprimentos', { dados: null, motivo: 'carona' }]);
        if (!has('cla') && typeof clanWantsCity === 'function' && clanWantsCity()) needs.push(['cla', { dados: null, motivo: 'carona' }]);
        if (!has('evoluir') && typeof evolveWanted === 'function' && evolveWanted()) needs.push(['evoluir', { dados: null, motivo: 'carona' }]);
        if (!has('slot') && typeof slotWanted === 'function' && slotWanted()) needs.push(['slot', { dados: null, motivo: 'carona' }]);
        if (!has('breeding') && typeof breedWanted === 'function' && breedWanted()) needs.push(['breeding', { dados: null, motivo: 'carona' }]);
        return needs;
    }

    // Tique (30 s), relógio único (v3.15.0): venceu o horário sorteado -> uma viagem com tudo que houver para fazer
    // (nada a fazer = só sorteia o próximo horário, sem sair da hunt). Pedido urgente (ex.: bola zerada) não espera o
    // relógio, só o intervalo mínimo entre viagens. Nunca com troca de hunt/líder ou captura em andamento.
    function tripTick() {
        if (tripRunning || (typeof healBusy === 'function' && healBusy())) return;              // cura na Joy em andamento: a viagem espera
        if (typeof idleRunning !== 'undefined' && idleRunning) return;                            // volta da cidade parada em andamento
        if (huntSwitch || swapPending || awaitingDetails.length) return;
        const urgente = tripNeeds.size > 0;
        const venceu = Date.now() >= tripDueAt();
        if (!urgente && !venceu) return;
        if (urgente && !venceu && Date.now() - lastTripAt < tripMinGapMs()) return;
        const needs = tripAugment([...tripNeeds.entries()]);
        tripNeeds.clear();
        if (!needs.length) { logEvent('viagem-vazia', { motivo: 'nada para levar' }); restartTripCycle(); return; }
        return cityTrip(`${urgente ? 'urgente' : 'relógio'}: ${needs.map(([k]) => k).join('+')}`, tripTasksFor(needs));
    }

    // ---- Recarga automática do painel -------------------------------------
    // Faz o que o botão "⟳ Atualizar tudo" do PokeGrid faz (reload do webview), mas só neste painel e em
    // intervalo sorteado dentro de [reloadEveryMin, reloadEveryMaxMin] minutos. O PokeGrid injeta o script
    // de novo no dom-ready da carga nova, então o que importa é guardado em localStorage[RESUME_KEY] logo
    // antes do reload e lido na carga seguinte (só vale por RESUME_MAX_AGE_MS):
    //   - hunt atual: quem tira a conta da hunt no reload é a SPA do jogo, que nasce em Cerulean e manda
    //     `set-city` ao montar (comentário do "Voltar pra hunt" experimental do PokeGrid). O script espera
    //     esse `set-city` sair (ou 12 s do socket, se não vier) e, se nenhum `field`/`field-init` chegou,
    //     manda `enter-hunt { slug }` + `pending-get` pelo mesmo caminho da rota (switchHunt, origem
    //     'recarga'). Efeito conhecido: a tela pode seguir mostrando a cidade enquanto o servidor farma.
    //   - lastSellAt, avisos de bola e de nível já dados: para não vender/avisar de novo a cada recarga.
    // Não recarrega com venda, troca de hunt ou de líder em andamento nem com captura esperando poke-delta
    // (adia e tenta no tique seguinte; depois de RELOAD_POSTPONE_MAX_MS recarrega mesmo assim).

    const RESUME_KEY = 'pgDiscordNotifyResume';
    const RELOAD_CHECK_MS = 30 * 1000;
    const RELOAD_POSTPONE_MAX_MS = 10 * 60 * 1000;
    const RESUME_MAX_AGE_MS = 5 * 60 * 1000;
    const RESUME_AFTER_CITY_MS = 3000;
    const RESUME_AFTER_SOCKET_MS = 12000;
    const CITY_SLUGS = ['cerulean', 'pewter', 'viridian', 'cassino', 'arena_pvp', 'goldenrod', 'shopping']; // lista `o4` do bundle (26/09/2026)

    let nextReloadAt = 0;           // quando recarregar (ms); 0 = ainda não sorteado
    let reloadDueSince = 0;         // desde quando a recarga está adiada por algo em andamento
    let resumeHunt = null;          // hunt guardada pela carga anterior, até ser reenviada
    let resumeTimer = null;
    let onReloadChange = null;      // callback do painel para redesenhar o status

    function reloadIntervalRange() {
        const min = Math.max(1, Number(cfg.reloadEveryMin) || 60);
        const max = Math.max(min, Number(cfg.reloadEveryMaxMin) || 0);
        return { min, max };
    }
    function scheduleReload() {
        reloadDueSince = 0;
        if (!cfg.reloadEnabled) { nextReloadAt = 0; return 0; }
        const { min, max } = reloadIntervalRange();
        const minutos = min + Math.random() * (max - min);
        nextReloadAt = Date.now() + Math.round(minutos * 60 * 1000);
        logEvent('recarga-agendada', { emMin: Math.round(minutos * 10) / 10 });
        if (onReloadChange) { try { onReloadChange(); } catch { /* painel fechado */ } }
        return nextReloadAt;
    }
    function reloadBusyReason() {
        if (sellRunning) return 'venda em andamento';
        if (tripRunning) return 'viagem à cidade em andamento';
        if ((typeof healBusy === 'function' && healBusy())) return 'cura na Nurse Joy em andamento';
        if (typeof idleRunning !== 'undefined' && idleRunning) return 'volta da cidade parada em andamento';
        if (huntSwitch) return 'troca de hunt em andamento';
        if (swapPending) return 'troca de líder em andamento';
        if (awaitingDetails.length) return 'captura aguardando detalhes';
        return null;
    }
    function reloadStatus() {
        if (!cfg.reloadEnabled) return 'desligada';
        if (!nextReloadAt) return 'agendando...';
        if (reloadDueSince) return `adiada (${reloadBusyReason() || 'aguardando'})`;
        const min = Math.max(0, Math.round((nextReloadAt - Date.now()) / 60000));
        const hora = new Date(nextReloadAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        return `próxima em ${min} min (${hora})`;
    }
    function doReload(motivo) {
        const rec = {
            at: Date.now(),
            slug: huntSlug,
            prevSlug: prevHuntSlug,
            lastSellAt,
            lastPokeSellAt,
            lastTripAt,
            nextTripDelayMs,
            ballAlerted: Object.assign({}, ballAlerted),
            autoBuyAttempted: Object.assign({}, autoBuyAttempted),
            levelAlerted: Array.from(levelAlerted),
        };
        try { localStorage.setItem(RESUME_KEY, JSON.stringify(rec)); } catch { /* sem espaço: recarrega mesmo assim */ }
        logEvent('recarga', { motivo, hunt: huntSlug, adiadaMin: reloadDueSince ? Math.round((Date.now() - reloadDueSince) / 60000) : 0 });
        location.reload();
    }
    function reloadTick() {
        if (!cfg.reloadEnabled) return;
        if (!nextReloadAt) { scheduleReload(); return; }
        if (Date.now() < nextReloadAt) return;
        const busy = reloadBusyReason();
        if (busy && (!reloadDueSince || Date.now() - reloadDueSince < RELOAD_POSTPONE_MAX_MS)) {
            if (!reloadDueSince) { reloadDueSince = Date.now(); logEvent('recarga-adiada', { motivo: busy }); }
            if (onReloadChange) { try { onReloadChange(); } catch { /* painel fechado */ } }
            return;
        }
        doReload('agendada');
    }

    // Carga nova: restaura o que a carga anterior guardou (se foi há pouco).
    function loadResume() {
        let rec = null;
        try { rec = JSON.parse(localStorage.getItem(RESUME_KEY) || 'null'); localStorage.removeItem(RESUME_KEY); } catch { rec = null; }
        if (!rec || typeof rec !== 'object') return;
        const idade = Date.now() - (Number(rec.at) || 0);
        if (idade < 0 || idade > RESUME_MAX_AGE_MS) { logEvent('recarga-ignorada', { idadeMin: Math.round(idade / 60000) }); return; }
        if (Number(rec.lastSellAt) > 0) lastSellAt = Number(rec.lastSellAt);
        if (Number(rec.lastPokeSellAt) > 0) lastPokeSellAt = Number(rec.lastPokeSellAt);
        if (Number(rec.lastTripAt) > 0) { lastTripAt = Number(rec.lastTripAt); nextTripDelayMs = Number(rec.nextTripDelayMs) || 0; }
        Object.assign(ballAlerted, rec.ballAlerted || {});
        Object.assign(autoBuyAttempted, rec.autoBuyAttempted || {});
        for (const id of (Array.isArray(rec.levelAlerted) ? rec.levelAlerted : [])) levelAlerted.add(String(id));
        const slug = rec.slug ? normalize(rec.slug) : null;
        resumeHunt = slug && !CITY_SLUGS.includes(slug) ? slug : null;
        if (rec.prevSlug) prevHuntSlug = normalize(rec.prevSlug);   // para onde a daily volta
        logEvent('recarga-retomada', { hunt: resumeHunt, idadeS: Math.round(idade / 1000) });
    }
    // Arma a volta para a hunt: chamado ao rastrear o socket (fallback) e quando a SPA manda `set-city`.
    function armResume(delayMs) {
        if (!resumeHunt) return;
        if (resumeTimer) clearTimeout(resumeTimer);
        resumeTimer = setTimeout(() => {
            resumeTimer = null;
            const slug = resumeHunt;
            if (!slug) return;
            resumeHunt = null;
            if (lastFieldAt > 0) { logEvent('recarga-hunt', { slug, jaNaHunt: true }); return; }
            if ((typeof healBusy === 'function' && healBusy())) { logEvent('recarga-hunt', { slug, cura: true }); return; }   // a cura volta para a hunt
            switchHunt(slug, 1, 'recarga');
        }, delayMs);
    }

    // ---- Log persistente (para diagnóstico sem abrir o console) --------
    // Guarda os últimos eventos relevantes em localStorage[LOG_KEY]; o botão
    // "Copiar log" do painel copia tudo como JSON.

    // v3.20.2: com 80 eventos no total, as capturas (catch-result a cada poucos segundos) empurravam para fora em ~5 min
    // o que importa para diagnóstico (import, viagem, clã...). Agora cada tipo barulhento tem cota própria e o resto dura horas.
    const LOG_KEY = 'pgDiscordNotifyLog';
    const LOG_MAX = 200;
    const LOG_NOISY = { 'catch-result': 25, decisao: 25, 'webhook-ok': 25, balls: 10, 'poke-xp': 5, 'captura-conta': 10, 'poke-delta': 15, 'pokes-frame': 10, 'pokes-get': 10, 'rest-breeding': 40 };

    function logEvent(kind, data) {
        if (cfg.debug) console.log(TAG, kind, data);
        try {
            const arr = JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
            arr.push({ t: new Date().toISOString(), kind, data });
            const cota = LOG_NOISY[kind];
            if (cota) { let n = 0; for (let i = arr.length - 1; i >= 0; i--) if (arr[i].kind === kind && ++n > cota) arr.splice(i, 1); }
            while (arr.length > LOG_MAX) arr.shift();
            localStorage.setItem(LOG_KEY, JSON.stringify(arr));
        } catch { /* localStorage indisponível: ignora */ }
    }

    // ---- Discord ----------------------------------------------------

    // ---- Roteamento de webhooks por tipo de evento ----------------------
    //   capture -> webhookUrl
    //   shiny   -> webhookShiny  (vazio: webhookUrl)
    //   alert   -> webhookAlerts (vazio: NÃO envia)
    //   level   -> webhookLevel  (vazio: NÃO envia)
    // Desde a v3.5.1 (a pedido do usuário) alertas e nível NÃO caem no principal: com o canal vazio o
    // evento é só registrado no log. Shiny é uma captura, por isso continua caindo em Capturas.
    const WEBHOOK_KINDS = {
        capture: { key: 'webhookUrl', label: 'capturas' },
        shiny: { key: 'webhookShiny', label: 'shinys', fallback: 'webhookUrl' },
        alert: { key: 'webhookAlerts', label: 'alertas' },
        level: { key: 'webhookLevel', label: 'nível' },
    };
    function webhookFor(kind) {
        const k = WEBHOOK_KINDS[kind] || WEBHOOK_KINDS.capture;
        return (cfg[k.key] || '').trim() || (k.fallback && (cfg[k.fallback] || '').trim()) || '';
    }

    const webhookMissingWarned = {};
    function postWebhook(kind, payload, meta) {
        const url = webhookFor(kind);
        if (!url) {
            const k = WEBHOOK_KINDS[kind] || WEBHOOK_KINDS.capture;
            logEvent('webhook-sem-canal', Object.assign({ kind, canal: k.label }, meta));
            if (!webhookMissingWarned[kind]) {
                webhookMissingWarned[kind] = true;
                console.warn(TAG, `Canal de ${k.label} vazio: esse aviso não foi enviado. Preencha no 🔔 › Avisos › Canais do Discord.`);
            }
            if (kind === 'capture' || kind === 'shiny') flashButton();
            return Promise.resolve(false);
        }
        return fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        }).then(res => {
            if (!res.ok) { console.warn(TAG, 'Discord respondeu com erro:', res.status); logEvent('webhook-erro', Object.assign({ kind, status: res.status }, meta)); return false; }
            logEvent('webhook-ok', Object.assign({ kind }, meta));
            return true;
        }).catch(err => { console.warn(TAG, 'Falha ao enviar webhook:', err); logEvent('webhook-falha', Object.assign({ kind, erro: String(err) }, meta)); return false; });
    }

    function sendDiscordNotification(info, isTest) {
        if (!cfg.webhookUrl) {
            console.warn(TAG, 'Webhook não configurado. Clique no 🔔 para configurar.');
            flashButton();
            return;
        }

        if (!isTest) {
            const key = normalize(info.name) + (info.shiny ? ':shiny' : '');
            const now = Date.now();
            if (cfg.cooldownSeconds > 0 && now - (lastNotifyAt.get(key) || 0) < cfg.cooldownSeconds * 1000) {
                logEvent('cooldown', { key });
                return;
            }
            lastNotifyAt.set(key, now);
        }

        const mention = cfg.mentionUserId ? `<@${cfg.mentionUserId}> ` : '';
        const shinyTag = info.shiny ? ' ✨ SHINY ✨' : '';
        const levelTxt = info.level != null ? ` (nível ${info.level})` : '';
        const ballTxt = info.ball ? `\nBola: ${info.ball}` : '';
        const autoTxt = info.auto ? '\nCaptura automática (VIP)' : '';
        const keepTxt = (info.locked === true ? '\n🔒 Travado no jogo (fora da venda)' : info.locked === false ? '\n⚠ Não consegui travar no jogo' : '')
            + (info.family === true ? '\n📦 Guardado no depósito da família' : info.family === false ? `\n⚠ Não foi para o depósito da família${info.familyMotivo ? ` (${info.familyMotivo})` : ''}` : '')
            + (info.keepErro ? `\n⚠ Não guardei: ${info.keepErro}` : '');
        const tier = qualityTier(info.quality);
        // O jogo mostra o ivTotal (0..192) como "Poder X/192"; usamos o mesmo rótulo.
        const ivTxt = info.ivTotal != null ? `\nPoder: ${info.ivTotal}/${IV_MAX} (${Math.round(info.ivTotal / IV_MAX * 100)}%)` : '';
        const qualTxt = info.quality != null ? `\nQualidade: ${info.quality.toFixed(3)}${tier ? ` · ${tier.name}` : ''}` : '';
        const noDataTxt = (!isTest && info.ivTotal == null && info.quality == null && info.detailsTimeout) ? `\n⚠ Poder/qualidade não chegaram do jogo em ${DETAILS_TIMEOUT_MS / 1000} s (aviso sem filtro de qualidade)` : '';
        const who = playerName();

        const payload = {
            content: `${mention}🎉 ${who ? `**${who}** capturou` : 'Você capturou'} **${info.name}**${levelTxt}!${shinyTag}`,
            username: 'Poke Idle World',
            embeds: [{
                title: `${isTest ? 'Teste: ' : 'Captura: '}${info.name}${shinyTag}${tier ? ` [${tier.name}]` : ''}`,
                description: (who ? `Conta: ${who}\n` : '') + `Em ${new Date().toLocaleString('pt-BR')}` + ivTxt + qualTxt + noDataTxt + ballTxt + autoTxt + keepTxt,
                color: info.shiny ? 0xffd700 : (tier ? tier.color : 0x57f287),
            }],
        };

        return postWebhook(info.shiny ? 'shiny' : 'capture', payload, { name: info.name, test: Boolean(isTest) });
    }

    // ---- Guardar o Pokémon avisado: cadeado (🔒) e/ou depósito da família ----
    //
    // Levantado no bundle do cliente (24/09/2026):
    //   - A aba "Pokémon" da loja do NPC vende os Pokémon FORA do time (depósito/box) que não estejam
    //     travados. O cadeado é o mesmo da loja/mercado: POST /api/game/pokemon/lock { id, locked }.
    //     Guardar no depósito comum (`poke-store`) NÃO protege: é de lá que a loja vende.
    //   - Depósito da família (janela "Família"): `family-action { action:'poke', dir:'deposit', capturedId }`
    //     pelo socket. O servidor responde com o frame `family` (estado completo, com `depot.pokes`) ou
    //     `error { message }`. Regras do jogo: precisa estar numa família; limite diário de movimentos
    //     (`family.movesUsed/movesCap`); depósito congelado se houver conta banida; líder e starter não vão.
    //     O que é depositado passa a ser DA FAMÍLIA (qualquer membro retira).
    // O id do indivíduo vem do `poke-delta`; sem ele, avisa sem guardar e registra no log.
    const POKE_LOCK_URL = '/api/game/pokemon/lock';
    const KEEP_TIMEOUT_MS = 5000;

    async function lockPokemon(pokeId, name) {
        try {
            const r = await Promise.race([
                gameApi(POKE_LOCK_URL, { method: 'POST', body: JSON.stringify({ id: pokeId, locked: true }) }),
                new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), KEEP_TIMEOUT_MS)),
            ]);
            logEvent('poke-lock', { name, pokeId, ok: true, resposta: r });
            if (typeof boxNoteLocked === 'function') boxNoteLocked(pokeId);
            return true;
        } catch (err) {
            logEvent('poke-lock', { name, pokeId, ok: false, erro: String(err?.message || err) });
            return false;
        }
    }

    let familyPending = null;       // { check, resolve, timer } ação da família aguardando `family`/`error`
    let lastFamily = null;          // { movesUsed, movesCap, frozen } do último frame `family` (null = sem família)
    let lastFamilyAt = 0;
    let lastFamilyDepot = { pokes: [], items: [] };   // v3.29.0: depot inteiro do último frame `family` (comida e stones do breeding)
    // Uma ação da família pelo socket; `check(depot)` diz se o frame `family` da resposta confirma o que foi pedido.
    function familyAction(payload, evento, dados, check) {
        return new Promise((resolve) => {
            if (familyPending) familyPending.resolve({ ok: false, motivo: 'outro depósito em andamento' });
            const entry = { check, timer: null, resolve: null };
            entry.resolve = (r) => {
                clearTimeout(entry.timer);
                if (familyPending === entry) familyPending = null;
                logEvent(evento, Object.assign({}, dados, { ok: r.ok, motivo: r.motivo || null }));
                resolve(r);
            };
            familyPending = entry;
            if (!sendGame(Object.assign({ type: 'family-action' }, payload))) {
                entry.resolve({ ok: false, motivo: 'socket do jogo não rastreado' });
                return;
            }
            entry.timer = setTimeout(() => entry.resolve({ ok: false, motivo: 'sem resposta do jogo' }), KEEP_TIMEOUT_MS);
        });
    }
    function familyDeposit(pokeId, name) {
        return familyAction({ action: 'poke', dir: 'deposit', capturedId: pokeId }, 'poke-familia', { name, pokeId },
            (depot) => Array.isArray(depot.pokes) && depot.pokes.some(p => String(p?.id) === pokeId));
    }
    function familyItemDeposit(itemId, quantity, name) {
        return familyAction({ action: 'item', dir: 'deposit', itemId, quantity }, 'item-familia', { name, itemId, quantity },
            (depot) => Array.isArray(depot.items) && depot.items.some(i => Number(i?.itemId ?? i?.id) === itemId));
    }
    // v3.28.1: 1x por carga, o 1º Pokémon e o 1º item do depósito inteiros (para saber se `depot.pokes` traz
    // quality/ivTotal, de que o breeding automático vai depender para escolher comida na família).
    let familyFieldsLogged = false;
    function handleFamily(message) {
        const fam = message.family || null;
        const depot = message.depot || {};
        if (!familyFieldsLogged && ((Array.isArray(depot.pokes) && depot.pokes.length) || (Array.isArray(depot.items) && depot.items.length))) {
            familyFieldsLogged = true;
            logEvent('familia-campos', { poke: Array.isArray(depot.pokes) ? depot.pokes[0] ?? null : null, item: Array.isArray(depot.items) ? depot.items[0] ?? null : null, chavesFamilia: fam ? Object.keys(fam) : null });
        }
        logEvent('familia', { temFamilia: Boolean(fam), movimentos: fam ? `${fam.movesUsed}/${fam.movesCap}` : null, congelado: Boolean(fam?.frozen), pokesNoDeposito: Array.isArray(depot.pokes) ? depot.pokes.length : null, chaves: fam ? undefined : Object.keys(message || {}) });
        catchOnFamily(depot.pokes);
        lastFamily = fam ? { movesUsed: Number(fam.movesUsed) || 0, movesCap: Number(fam.movesCap) || 0, frozen: Boolean(fam.frozen) } : null;
        lastFamilyAt = Date.now();
        lastFamilyDepot = { pokes: Array.isArray(depot.pokes) ? depot.pokes : [], items: Array.isArray(depot.items) ? depot.items : [] };
        breedOnFamily();
        if (!familyPending) return;
        const achou = familyPending.check(depot);
        if (achou) familyPending.resolve({ ok: true });
        else if (!fam) familyPending.resolve({ ok: false, motivo: 'a conta não está numa família' });
        else if (fam.frozen) familyPending.resolve({ ok: false, motivo: 'depósito da família congelado' });
        else if (Number(fam.movesUsed) >= Number(fam.movesCap)) familyPending.resolve({ ok: false, motivo: `limite diário de movimentos (${fam.movesUsed}/${fam.movesCap})` });
        else familyPending.resolve({ ok: false, motivo: 'o jogo respondeu, mas o movimento não apareceu no depósito' });
    }
    function handleGameError(message) {
        logEvent('erro-jogo', { message: message.message || null });
        if (familyPending) familyPending.resolve({ ok: false, motivo: message.message || 'erro do jogo' });
        if (huntSwitch?.origem === 'captura' && huntSwitch.at && catchTarget && huntSwitch.slug === catchTarget.slug) {
            const slug = huntSwitch.slug;
            clearTimeout(huntSwitch.timer); huntSwitch = null;
            catchHuntFailed(slug, message.message || 'erro do jogo');
        }
    }

    // Aplica as opções "guardar" ao Pokémon que passou nos filtros, ANTES do aviso (o texto do aviso diz o resultado).
    async function keepNotified(info) {
        if (!cfg.lockNotified && !cfg.familyNotified) return;
        if (!info.pokeId) {
            logEvent('guardar', { name: info.name, ok: false, erro: 'sem id do Pokémon (poke-delta não chegou a tempo)' });
            info.keepErro = 'sem id do Pokémon';
            return;
        }
        if (cfg.lockNotified) info.locked = await lockPokemon(info.pokeId, info.name);
        if (cfg.familyNotified) {
            const r = await familyDeposit(info.pokeId, info.name);
            info.family = r.ok;
            info.familyMotivo = r.motivo || null;
        }
    }

    // ---- Cura na Joy: o time caiu, a conta foi para a cidade -> curar e voltar para a hunt (v3.22.0) ----
    // Levantado no bundle do cliente em 29/09/2026:
    //   field               -> também traz `fainted`, `reviveInMs`, `noRevive`, `heroHp`, `heroMaxHp`. Com `fainted` a tela
    //                          mostra "💀 <líder> desmaiou!" com contagem regressiva: "Reviver agora" (`field-revive`, gasta
    //                          um Revive; o Auto-Revive do jogo faz isso sozinho) ou "Voltar para a cidade" (`leave-hunt`).
    //                          `noRevive` = o time inteiro caiu (Nightmare World não aceita Revive).
    //   field-teleport-city -> o servidor mandou a conta para a cidade (acabou o tempo sem Revive); a tela vai para
    //                          Cerulean e manda `set-city`.
    //   joy-heal            -> o botão da Nurse Joy ("Curar a equipe", de graça, cura o time todo). O cliente não espera
    //                          resposta (só mostra "💊 Seus Pokémon foram curados!"); confirmamos pelo `hp` do líder no `pokes`.
    //   Com o líder em hp 0 a tela recusa viajar para hunt ("Cure-o com a Nurse Joy ou use um Revive antes de ir caçar").
    // Fluxo: queda confirmada (teleporte do servidor, "Voltar para a cidade" com o líder desmaiado ou líder em hp 0 fora de
    // hunt) -> espera a tela chegar na cidade (set-city; sem ele em 10 s mandamos nós) -> "anda até a Joy" -> `joy-heal` ->
    // `pokes-get` confere o hp -> `switchHunt(slug, 1, 'cura')`. Enquanto isso (`healBusy()`) a viagem, a rota de captura, a
    // daily, o clã e a recarga não trocam de hunt. SEMPRE volta para a hunt (v3.24.3, pedido do usuário: a proteção de
    // 3 quedas em 30 min deixava a conta parada na cidade); as quedas só contam para o log e para avisar 1x por janela.

    const HEAL_CITY_WAIT_MS = 10 * 1000;
    const HEAL_WALK_MS = [3000, 7000];       // "andar até a Joy"
    const HEAL_CHECK_MS = 1500;              // joy-heal -> pokes-get
    const HEAL_BEFORE_BACK_MS = [2000, 5000];
    const HEAL_TRIES = 2;
    const HEAL_DEATH_WINDOW_MS = 30 * 60 * 1000;   // janela em que as quedas na mesma hunt contam (só log/aviso)

    let faintSeen = null;           // { slug, at, noRevive } desde o 1º `field` com fainted; some se levantou (Revive)
    let healRun = null;             // { slug, motivo, at, fase, tries, cityArrived, hpWait }
    let healDeaths = [];            // [{ slug, at }] quedas recentes (contagem para o log e o aviso; não bloqueia a volta)
    let healLast = null;            // { at, slug, ok, motivo } para o painel
    let onHealChange = null;        // callback do painel

    const healRnd = (par) => par[0] + Math.floor(Math.random() * (par[1] - par[0] + 1));
    const healWait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    function healBusy() { return Boolean(healRun); }
    function healNotify() { if (onHealChange) { try { onHealChange(); } catch { /* painel fechado */ } } }
    function healIsHunt(slug) { const h = normalize(slug || ''); return Boolean(h) && !CITY_SLUGS.includes(h); }
    function healStatus() {
        if (!cfg.healJoyEnabled) return 'desligada';
        if (healRun) return `${healRun.fase} (volta para ${healRun.slug || '—'})`;
        if (faintSeen) return `líder desmaiado em ${faintSeen.slug || '?'}; esperando o Revive ou o teleporte para a cidade`;
        if (!healLast) return 'pronta; nenhuma queda nesta sessão';
        const hora = new Date(healLast.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        return `última queda ${hora} em ${healLast.slug || '?'}: ${healLast.ok ? 'curado e de volta ✔' : `✖ ${healLast.motivo}`}`;
    }

    // Cada frame `field`: só olha a transição do `fainted`.
    function healOnField(message) {
        const caiu = message.fainted === true;
        if (caiu && !faintSeen) {
            faintSeen = { slug: healIsHunt(huntSlug) ? normalize(huntSlug) : null, at: Date.now(), noRevive: Boolean(message.noRevive) };
            logEvent('desmaio', { hunt: faintSeen.slug, noRevive: faintSeen.noRevive, reviveEmS: Math.round((Number(message.reviveInMs) || 0) / 1000), hp: message.heroHp ?? null });
            healNotify();
        } else if (!caiu && faintSeen) {                        // a tela trata `fainted` ausente como de pé
            logEvent('desmaio-levantou', { hunt: faintSeen.slug, seg: Math.round((Date.now() - faintSeen.at) / 1000) });
            faintSeen = null;
            healNotify();
        }
    }
    // O servidor teleportou para a cidade (o sintético da viagem já foi filtrado em handleGameMessage).
    // A conta saiu da hunt no servidor, mas a tela não manda `leave-hunt`: zera a hunt atual aqui.
    function healOnTeleport() {
        const caiu = Boolean(faintSeen);
        const slug = faintSeen?.slug || (healIsHunt(huntSlug) ? normalize(huntSlug) : null);
        logEvent('teleporte-cidade', { desmaiado: caiu, hunt: slug });
        healStart(caiu ? 'teleporte do servidor (líder desmaiado)' : 'teleporte do servidor', slug, caiu);
        setHunt(null);
    }
    // O jogador (ou a tela) clicou "Voltar para a cidade" com o líder desmaiado.
    function healOnLeave() { if (faintSeen && !healRun && !(typeof tripRunning !== 'undefined' && tripRunning)) healStart('"Voltar para a cidade" com o líder desmaiado', faintSeen.slug, true); }
    function healOnSetCity() { if (healRun) healRun.cityArrived = true; }

    function healLeader(list) {
        const time = list.filter(p => p && p.team);
        return time.find(p => p.leader) || time.sort((a, b) => (Number(a.slot) || 0) - (Number(b.slot) || 0))[0] || null;
    }
    // Frame `pokes`: confere a cura em andamento; fora dela, líder em hp 0 fora de hunt também é queda (ex.: recarga
    // no meio da contagem, ou a tela recusou a hunt).
    function healOnPokes(list) {
        const lider = healLeader(list);
        const hp = lider && lider.hp != null ? Number(lider.hp) : null;
        if (healRun?.hpWait) { const r = healRun.hpWait; healRun.hpWait = null; r(hp); return; }
        if (!cfg.healJoyEnabled || healRun || hp == null || hp > 0) return;
        if (healIsHunt(huntSlug) || faintSeen) return;            // na hunt quem decide é o `field` (Revive/teleporte)
        if (typeof tripRunning !== 'undefined' && tripRunning) return;
        healStart('líder com hp 0 fora de hunt', null, true, true);
    }
    function healPokesHp() {
        return new Promise(resolve => {
            let feito = false;
            const fim = (hp) => { if (!feito) { feito = true; resolve(hp); } };
            healRun.hpWait = fim;
            sendGame({ type: 'pokes-get' });
            setTimeout(() => { if (healRun?.hpWait === fim) healRun.hpWait = null; fim(undefined); }, 8000);
        });
    }

    // slug: hunt para onde voltar (sem ela, a última hunt vista); caiu: queda confirmada (senão foi só um teleporte);
    // naCidade: a conta já está fora de hunt, não espera set-city.
    function healStart(motivo, slugHint, caiu, naCidade) {
        const noRevive = Boolean(faintSeen?.noRevive);
        faintSeen = null;
        if (!cfg.healJoyEnabled || healRun) return false;
        const slug = (healIsHunt(slugHint) ? normalize(slugHint) : null) || (typeof lastRealHunt !== 'undefined' && healIsHunt(lastRealHunt) ? normalize(lastRealHunt) : null);
        healRun = { slug, motivo, caiu: Boolean(caiu), at: Date.now(), fase: 'indo para a cidade', tries: 0, cityArrived: Boolean(naCidade), hpWait: null };
        if (slug) healDeaths = healDeaths.filter(d => Date.now() - d.at < HEAL_DEATH_WINDOW_MS).concat([{ slug, at: Date.now() }]);
        const quedas = slug ? healDeaths.filter(d => d.slug === slug).length : 0;
        logEvent('cura', { fase: 'inicio', motivo, hunt: slug, quedas, noRevive });
        healNotify();
        healFlow(motivo, slug, quedas, noRevive);
        return true;
    }

    async function healFlow(motivo, slug, quedas, noRevive) {
        const who = playerName();
        const conta = who ? `Conta: ${who}\n` : '';
        let ok = false, erro = null, volta = null;
        const caiu = healRun.caiu;
        const oQue = caiu ? 'o time caiu' : 'a conta foi mandada para a cidade';
        try {
            // 1) a tela vai para a cidade sozinha (teleporte); se não mandar set-city, mandamos nós
            const limite = Date.now() + HEAL_CITY_WAIT_MS;
            while (!healRun.cityArrived && Date.now() < limite) await healWait(500);
            if (!healRun.cityArrived) sendGame({ type: 'set-city', slug: 'cerulean' });
            healRun.fase = 'indo até a Nurse Joy'; healNotify();
            await healWait(healRnd(HEAL_WALK_MS));
            // 2) Joy, conferindo o hp do líder
            let hp;
            for (healRun.tries = 1; healRun.tries <= HEAL_TRIES; healRun.tries++) {
                sendGame({ type: 'joy-heal' });
                await healWait(HEAL_CHECK_MS);
                hp = await healPokesHp();
                logEvent('cura', { fase: 'joy', tentativa: healRun.tries, hpLider: hp === undefined ? 'sem resposta' : hp });
                if (hp === undefined || hp === null || hp > 0) break;   // sem `hp` no frame: não dá para conferir, segue
            }
            if (typeof hp === 'number' && hp <= 0) { erro = 'a Joy não curou (líder segue com hp 0)'; return; }
            ok = true;
            // 3) volta sempre (v3.24.3: sem limite de quedas)
            if (!slug) { erro = 'curado; não sei de que hunt veio, fica na cidade'; return; }
            healRun.fase = 'voltando'; healNotify();
            await healWait(healRnd(HEAL_BEFORE_BACK_MS));
            volta = slug;
            switchHunt(slug, 1, 'cura');
        } catch (err) {
            erro = String(err?.message || err);
        } finally {
            healLast = { at: Date.now(), slug, ok: ok && Boolean(volta), motivo: erro };
            logEvent('cura', { fase: 'fim', ok, volta, erro, seg: Math.round((Date.now() - (healRun?.at || Date.now())) / 1000) });
            healRun = null;
            healNotify();
            const primeira = quedas <= 1;
            if (!ok || !volta) {
                postWebhook('alert', {
                    content: `💀 ${who ? `**${who}**` : 'Sua conta'}: ${oQue}${slug ? ` em **${slug}**` : ''} — ${erro || 'ficou na cidade'}`,
                    username: 'Poke Idle World',
                    embeds: [{ title: ok ? 'Curado na Joy, parado na cidade' : 'Cura na Joy falhou', description: conta + `Motivo da ida: ${motivo}${noRevive ? ' (time inteiro)' : ''}\n${ok ? 'Entre na hunt na mão quando quiser.' : 'Cure na Nurse Joy na mão e entre na hunt.'}\nEm ${new Date().toLocaleString('pt-BR')}`, color: 0xed4245 }],
                }, { evento: 'cura', ok, slug });
            } else if (primeira) {
                postWebhook('alert', {
                    content: `💀 ${who ? `**${who}**` : 'Sua conta'}: ${oQue} em **${slug}**; curado na Nurse Joy, voltando para a hunt`,
                    username: 'Poke Idle World',
                    embeds: [{ title: caiu ? 'Time caiu: cura na Joy' : 'Mandado para a cidade: cura na Joy', description: conta + `Motivo da ida: ${motivo}${noRevive ? ' (time inteiro)' : ''}\nVolto sempre; novas quedas nessa hunt nos próximos 30 min ficam só no log.\nEm ${new Date().toLocaleString('pt-BR')}`, color: 0xfee75c }],
                }, { evento: 'cura', ok, slug });
            }
        }
    }

    // ---- Volta da cidade: conta parada fora de hunt há muito tempo -> cura na Joy e volta para a hunt (v3.23.0) ----
    // Ligada por padrão (pedido do usuário: mais de 10 min na cidade = a conta bugou). Casos: a volta da viagem/recarga/cura não confirmou, o servidor mandou para a cidade com a cura desligada, a
    // tela reconectou na cidade, o jogador saiu na mão e esqueceu. "Parado" (idleWhy) = sem hunt no script (hunt nula ou
    // cidade) E sem `field`/`field-kill` há `cityIdleMin` minutos (o servidor manda esses frames enquanto farma, mesmo com a
    // tela na cidade), ou uma hunt que o script pediu mas que nunca mandou frame nenhum. Não age com viagem, cura, troca de
    // hunt/líder, venda, daily sozinha ou volta da recarga em andamento; a rota de captura tem a própria volta (catchTick).
    // Destino: alvo da rota do clã > etapa da rota de treino > última hunt vista (v3.24.3: quedas da cura não excluem
    // mais a hunt). Fluxo (idleGoBack): hunt pedida sem frame -> `leave-hunt` + `set-city`; `joy-heal` sempre (a conta pode ter
    // ficado com o líder desmaiado, e com hp 0 a tela recusa hunt) -> `pokes-get` confere o hp -> `switchHunt(slug, 1,
    // 'cidade')`. Não conta como queda da cura. Proteção: IDLE_MAX_BACKS voltas em 1 h sem a hunt confirmar = para e avisa
    // (rearma quando a conta volta a farmar).

    const IDLE_TICK_MS = 30 * 1000;
    const IDLE_MIN_DEFAULT = 10;
    const IDLE_JOY_MS = [3000, 7000];      // "andar até a Joy"
    const IDLE_CHECK_MS = 2500;            // joy-heal -> pokes-get -> resposta
    const IDLE_BEFORE_BACK_MS = [2000, 5000];
    const IDLE_MAX_BACKS = 3;
    const IDLE_WINDOW_MS = 60 * 60 * 1000;

    const idleLoadedAt = Date.now();
    let idleOutSince = 0;           // desde quando a hunt do script é nula/cidade (0 = numa hunt)
    let idleHuntAt = 0;             // quando o script viu a entrada na hunt atual
    let idleAliveAt = 0;            // último `field`/`field-init`/`field-kill`
    let idleBacks = [];             // [at] voltas recentes que ainda não confirmaram
    let idleGaveUp = false;
    let idleLeaderHp = null;        // hp do líder no último `pokes` (null = sem o campo)
    let idleLast = null;            // { at, slug, min, ok, motivo } última volta
    let idleRunning = false;        // cura + volta em andamento
    let idleNote = '';              // por que não voltou ainda (status; log `cidade-parada-espera` quando muda)
    let onIdleChange = null;        // callback do painel

    function idleMinMs(d) { return Math.max(1, Number((d || cfg).cityIdleMin) || IDLE_MIN_DEFAULT) * 60 * 1000; }
    function idleNotify() { if (onIdleChange) { try { onIdleChange(); } catch { /* painel fechado */ } } }
    const idleRnd = (par) => par[0] + Math.floor(Math.random() * (par[1] - par[0] + 1));
    const idleWait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    function idleIsHunt(slug) { const h = normalize(slug || ''); return Boolean(h) && !CITY_SLUGS.includes(h); }

    // Chamado por setHunt() a cada troca de hunt.
    function idleOnHuntChange(slug) {
        if (idleIsHunt(slug)) { idleOutSince = 0; idleHuntAt = Date.now(); }
        else if (!idleOutSince) idleOutSince = Date.now();
    }
    function idleOnAlive() {
        idleAliveAt = Date.now();
        if (idleBacks.length || idleGaveUp) { idleBacks = []; idleGaveUp = false; idleNotify(); }   // voltou a farmar: rearma
    }
    function idleOnPokes(list) {
        const lider = healLeader(list);
        idleLeaderHp = lider && lider.hp != null ? Number(lider.hp) : null;
    }

    // Desde quando a conta está parada (ms), ou 0 se está farmando.
    function idleSinceAt() {
        if (idleIsHunt(huntSlug)) return idleAliveAt >= idleHuntAt ? 0 : idleHuntAt;   // pediu a hunt e nada chegou
        if (idleAliveAt && Date.now() - idleAliveAt < 2 * IDLE_TICK_MS) return 0;       // o servidor farma (tela na cidade)
        return Math.max(idleOutSince || idleLoadedAt, idleAliveAt);
    }
    function idleBusyReason() {
        if (tripRunning) return 'viagem à cidade em andamento';
        if (healBusy()) return 'cura na Nurse Joy em andamento';
        if (huntSwitch) return `troca para ${huntSwitch.slug} em andamento`;
        if (swapPending) return 'troca de líder em andamento';
        if (sellRunning) return 'venda em andamento';
        if (resumeHunt) return 'volta da recarga pendente';
        if (dailyAutoBusy) return 'Daily Kill sozinha decidindo';
        return null;
    }
    // Para onde voltar: { slug } ou { motivo } quando não há destino.
    function idleTarget() {
        let slug = null;
        if (clanRouteOn() && clanTarget) slug = clanTarget.slug;
        else if (routeStep()?.slug) slug = normalize(routeStep().slug);
        else if (idleIsHunt(lastRealHunt)) slug = normalize(lastRealHunt);
        if (!slug) return { motivo: 'não sei de que hunt veio (entre numa hunt uma vez)' };
        return { slug };
    }
    function idleSetNote(motivo) {
        if (motivo === idleNote) return;
        idleNote = motivo;
        if (motivo) logEvent('cidade-parada-espera', { motivo });
        idleNotify();
    }
    function idleStatus(d) {
        d = d || cfg;
        if (!d.cityIdleEnabled) return 'desligada';
        if (!cfg.cityIdleEnabled) return 'ligada ao salvar';
        if (idleRunning) return `curando na Nurse Joy e voltando para ${idleLast?.slug || 'a hunt'}`;
        if (idleGaveUp) return `parei: voltei ${IDLE_MAX_BACKS}x em 1 h e a hunt não confirmou (entre na mão; rearma quando a conta farmar)`;
        const ult = idleLast ? ` · última volta ${new Date(idleLast.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} para ${idleLast.slug}${idleLast.motivo ? ` (✖ ${idleLast.motivo})` : ''}` : '';
        const desde = idleSinceAt();
        if (!desde) return `farmando${ult}`;
        const min = Math.floor((Date.now() - desde) / 60000);
        const falta = Math.max(0, Math.ceil((desde + idleMinMs(d) - Date.now()) / 60000));
        return `parada fora de hunt há ${min} min${idleNote ? ` · esperando: ${idleNote}` : falta > 0 ? ` · volta em ${falta} min` : ''}${ult}`;
    }

    // Tique (30 s).
    function idleTick() {
        if (!cfg.cityIdleEnabled || idleRunning) { idleSetNote(''); return; }
        const desde = idleSinceAt();
        if (!desde) { idleSetNote(''); return; }
        if (catchRouteActive()) { idleSetNote('a rota de captura cuida da volta'); return; }
        if (Date.now() - desde < idleMinMs()) { idleNotify(); return; }
        if (idleGaveUp) return;
        const busy = idleBusyReason();
        if (busy) { idleSetNote(busy); return; }
        const alvo = idleTarget();
        if (!alvo.slug) { idleSetNote(alvo.motivo); return; }
        idleSetNote('');
        const who = playerName();
        const min = Math.round((Date.now() - desde) / 60000);
        idleBacks = idleBacks.filter(at => Date.now() - at < IDLE_WINDOW_MS);
        if (idleBacks.length >= IDLE_MAX_BACKS) {
            idleGaveUp = true;
            logEvent('cidade-parada', { fase: 'desisti', slug: alvo.slug, voltas: idleBacks.length, min });
            postWebhook('alert', {
                content: `🏙️ ${who ? `**${who}**` : 'Sua conta'}: parada fora de hunt e as últimas ${idleBacks.length} voltas para **${alvo.slug}** não pegaram`,
                username: 'Poke Idle World',
                embeds: [{ title: 'Parada na cidade: desisti de voltar', description: (who ? `Conta: ${who}\n` : '') + `Entre numa hunt na mão; a volta automática rearma assim que a conta voltar a farmar.\nEm ${new Date().toLocaleString('pt-BR')}`, color: 0xed4245 }],
            }, { evento: 'cidade-parada', slug: alvo.slug });
            idleNotify();
            return;
        }
        idleBacks.push(Date.now());
        idleLast = { at: Date.now(), slug: alvo.slug, min, ok: false, motivo: null };
        logEvent('cidade-parada', { fase: 'inicio', slug: alvo.slug, min, hunt: huntSlug || null, volta: idleBacks.length });
        return idleGoBack(alvo.slug, min);
    }

    async function idleGoBack(slug, min) {
        idleRunning = true;
        idleNotify();
        const who = playerName();
        let hp, erro = null;
        try {
            if (idleIsHunt(huntSlug)) {                  // pediu a hunt e nada chegou: sai dela e se põe na cidade
                sendGame({ type: 'leave-hunt' });
                sendGame({ type: 'set-city', slug: 'cerulean' });
            }
            await idleWait(idleRnd(IDLE_JOY_MS));
            sendGame({ type: 'joy-heal' });
            idleLeaderHp = null;
            sendGame({ type: 'pokes-get' });            // a resposta passa por idleOnPokes
            await idleWait(IDLE_CHECK_MS);
            hp = idleLeaderHp;
            if (hp === 0) { erro = 'a Joy não curou (líder segue com hp 0)'; return; }
            await idleWait(idleRnd(IDLE_BEFORE_BACK_MS));
            idleOutSince = 0; idleHuntAt = Date.now();   // o relógio recomeça: se a entrada não pegar, tenta de novo depois de outro período
            switchHunt(slug, 1, 'cidade');
        } catch (err) {
            erro = String(err?.message || err);
        } finally {
            idleRunning = false;
            if (idleLast) { idleLast.ok = !erro; idleLast.motivo = erro; }
            logEvent('cidade-parada', { fase: 'fim', slug, hpLider: hp === undefined || hp === null ? 'sem resposta' : hp, ok: !erro, erro });
            postWebhook('alert', {
                content: `🏙️ ${who ? `**${who}**` : 'Sua conta'}: parada fora de hunt há ${min} min — ${erro ? `não voltei: ${erro}` : `curei na Nurse Joy e estou voltando para **${slug}**`}`,
                username: 'Poke Idle World',
                embeds: [{ title: erro ? 'Parada na cidade: volta falhou' : 'Parada na cidade: curando e voltando', description: (who ? `Conta: ${who}
` : '') + `Limite: ${Math.round(idleMinMs() / 60000)} min sem farmar (aba Compras → 🏙️ Parada na cidade).${erro ? ' Cure e entre na hunt na mão.' : ''}
Em ${new Date().toLocaleString('pt-BR')}`, color: erro ? 0xed4245 : 0xfee75c }],
            }, { evento: 'cidade-parada', slug, ok: !erro });
            idleNotify();
        }
    }

    // ---- Lógica principal -------------------------------------------

    function handleGameMessage(rawData) {
        let message;
        try { message = JSON.parse(rawData); }
        catch { return; }
        if (!message || typeof message !== 'object' || message.synthetic) return;

        if (message.type === 'pending' && Array.isArray(message.list)) {
            rememberPending(message.list);
            if (cfg.debug) console.log(TAG, 'Fila pending:', message.list);
            catchOnPending(message.list);
            clanOnPending(message.list);
            return;
        }
        if (message.type === 'catch-cooldown') { catchOnCooldown(message); return; }

        if (message.type === 'poke-delta') { handlePokeDelta(message); return; }
        if (message.type === 'family') { handleFamily(message); return; }
        if (message.type === 'error') { handleGameError(message); return; }
        if (message.type === 'poke-xp') { handlePokeXp(message); evolveOnPokeXp(message); return; }
        if (message.type === 'field' || message.type === 'field-init') {
            lastFieldAt = Date.now();
            if (message.type === 'field') healOnField(message);
            if (message.type === 'field-init' && message.slug && !huntSlug) setHunt(message.slug); // script carregou depois do enter-hunt
            idleOnAlive();
            return;
        }
        if (message.type === 'field-teleport-city') { healOnTeleport(); return; }   // o sintético da viagem já saiu acima
        if (message.type === 'field-kill') { idleOnAlive(); noteLeaderLevel(Number(message.level), 'field-kill', Boolean(message.leveledUp)); handleFieldKill(message); noteDailyKill(message); noteClanKill(message); noteDepositDrop(message); return; }
        if (message.type === 'inventory' && Array.isArray(message.items)) { clanOnInventory(message.items); supplyOnInventory(message.items); return; }
        if (message.type === 'balls' && message.counts && typeof message.counts === 'object') { handleBalls(message); return; }
        if (message.type === 'pokes' && Array.isArray(message.list)) { logEvent('pokes-frame', { total: message.list.length, time: message.list.filter(p => p && p.team).map(p => `${p.name} lv${p.level}`), hunt: huntSlug || null }); updateTeam(message.list); healOnPokes(message.list); idleOnPokes(message.list);handlePokesList(message.list); pokeSellOnPokes(message.list); catchOnPokes(message.list); evolveOnPokes(message.list); breedOnPokes(message.list); return; }

        if (message.type !== 'catch-result') return;

        logEvent('catch-result', message);
        if (message.ballId != null) {
            lastBallId = Number(message.ballId) || null;
            if (message.ballName && lastBallId) BALL_NAMES[lastBallId] = message.ballName;
        }
        if (message.success !== true) return;
        requestBalls(BALLS_AFTER_CATCH_MS); // a captura consumiu uma bola: atualiza o estoque

        const info = extractPokemonInfo(message);
        if (!info) {
            logEvent('sem-nome', message);
            return;
        }

        catchOnResult(info, message);

        const name = normalize(info.name);
        // lista vazia = qualquer Pokémon
        const inWatchList = cfg.watchList.length === 0 ||
            cfg.watchList.map(normalize).includes(name);
        const passesName = cfg.notifyEveryCapture || inWatchList;
        const isShinyPass = cfg.notifyShiny && info.shiny;

        if (!passesName && !isShinyPass) {
            logEvent('decisao', { name: info.name, shiny: info.shiny, notificar: false, motivo: 'fora da lista' });
            return;
        }

        // Raridade/poder só chegam no poke-delta: decide depois dos detalhes.
        withDetails(info).then(full => {
            const q = isShinyPass ? { ok: true, motivo: 'shiny' } : passesQualityFilter(full);
            logEvent('decisao', { name: full.name, shiny: full.shiny, level: full.level, quality: full.quality ?? null, ivTotal: full.ivTotal ?? null, notificar: q.ok, motivo: q.motivo });
            if (q.ok) keepNotified(full).then(() => sendDiscordNotification(full, false));
        });
    }

    // ---- Interceptação do WebSocket (mesmo estilo do PIW-QOL) -------
    //
    // O PokeGrid injeta os userscripts no dom-ready, ou seja, o jogo pode
    // JÁ ter aberto o WebSocket antes de nós rodarmos. Por isso, duas frentes:
    //   1) patch no construtor       -> pega sockets criados DEPOIS (reconexões);
    //   2) patch no prototype.send   -> descobre o socket que já existia,
    //      na primeira vez que o jogo enviar qualquer coisa por ele.

    const trackedSockets = new WeakSet();

    function trackSocket(ws) {
        if (!ws || trackedSockets.has(ws)) return;
        trackedSockets.add(ws);
        ws.addEventListener('message', (event) => {
            try {
                if (typeof event.data === 'string') handleGameMessage(event.data);
            } catch (err) {
                console.warn(TAG, 'Erro ao processar mensagem:', err);
            }
        });
        lastSocket = ws;
        logEvent('socket', { url: String(ws.url || '').split('?')[0] });
        requestBalls(BALLS_AFTER_SOCKET_MS);
        setTimeout(requestSupplies, SUPPLY_AFTER_SOCKET_MS);
        requestPokes(POKES_AFTER_SOCKET_MS);
        armResume(RESUME_AFTER_SOCKET_MS);
    }

    const NativeWebSocket = window.WebSocket;

    function TrackedWebSocket(url, protocols) {
        const ws = protocols !== undefined
            ? new NativeWebSocket(url, protocols)
            : new NativeWebSocket(url);
        trackSocket(ws);
        return ws;
    }
    TrackedWebSocket.prototype = NativeWebSocket.prototype;
    Object.setPrototypeOf(TrackedWebSocket, NativeWebSocket);
    ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'].forEach(k => {
        TrackedWebSocket[k] = NativeWebSocket[k];
    });
    window.WebSocket = TrackedWebSocket;

    const nativeSend = NativeWebSocket.prototype.send;
    NativeWebSocket.prototype.send = function (data) {
        trackSocket(this);
        lastSocket = this;
        try { handleOutgoing(data); } catch (err) { console.warn(TAG, 'Erro ao ler envio:', err); }
        return nativeSend.call(this, data);
    };

    // ---- Painel de configurações (botão 🔔) --------------------------
    //
    // Estrutura (v3.5.0, proposta em docs/design-painel.md): 5 abas por objetivo (Avisos, Bolas,
    // Venda, Treino, Sistema), cabeçalho e rodapé fixos, Salvar GLOBAL sempre visível com indicador
    // de "não salvo", badge de estado por aba e ponto de estado no botão 🔔. Os ids `#pg-dn-*` e as
    // chaves de `cfg` são as mesmas de antes. Preferências só de UI (aba ativa) ficam em UI_KEY,
    // fora de `cfg`, para não entrarem no Exportar/Importar.

    const UI_KEY = 'pgDiscordNotifyUi';
    const PANEL_CSS = `
#pg-dn-btn,#pg-dn-panel{--dn-bg-0:#1e1f22;--dn-bg-1:#2b2d31;--dn-bg-2:#313338;--dn-bg-3:#3a3c42;--dn-border:#3f4147;--dn-text:#dbdee1;--dn-muted:#949ba4;--dn-dim:#80848e;--dn-accent:#5865f2;--dn-ok:#23a559;--dn-ok-t:#57d38a;--dn-warn:#f0b232;--dn-danger:#da373c;--dn-danger-t:#ff7a7e;--dn-shiny:#fee75c;--dn-radius:6px;--dn-radius-sm:4px;font:13px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--dn-text);box-sizing:border-box}
#pg-dn-panel *,#pg-dn-panel *::before,#pg-dn-panel *::after{box-sizing:border-box}
#pg-dn-panel[hidden],#pg-dn-panel [hidden]{display:none!important}
#pg-dn-btn{position:fixed;bottom:12px;left:12px;z-index:99999;width:38px;height:38px;border-radius:50%;border:1px solid var(--dn-border);background:var(--dn-bg-1);font-size:18px;line-height:1;cursor:pointer;opacity:.95;padding:0}
#pg-dn-btn .dn-dot{position:absolute;right:-1px;top:-1px;width:11px;height:11px;border-radius:50%;border:2px solid #111;background:transparent}
#pg-dn-btn .dn-dot[data-state="ok"]{background:var(--dn-ok)}
#pg-dn-btn .dn-dot[data-state="warn"]{background:var(--dn-warn)}
#pg-dn-btn .dn-dot[data-state="danger"]{background:var(--dn-danger);animation:dn-pulse 1.4s ease-in-out infinite}
@keyframes dn-pulse{0%,100%{box-shadow:0 0 0 0 rgba(218,55,60,.6)}50%{box-shadow:0 0 0 5px rgba(218,55,60,0)}}
#pg-dn-panel{position:fixed;bottom:58px;left:12px;z-index:99999;width:min(400px,calc(100vw - 24px));height:min(520px,calc(100vh - 70px));container-type:inline-size;display:flex;flex-direction:column;background:var(--dn-bg-1);border:1px solid var(--dn-border);border-radius:var(--dn-radius);box-shadow:0 8px 24px rgba(0,0,0,.5);overflow:hidden;text-align:left}
#pg-dn-panel .dn-head{display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--dn-bg-0);border-bottom:1px solid var(--dn-border)}
#pg-dn-panel .dn-head .t{font-weight:600;font-size:14px}
#pg-dn-panel .dn-head .v{color:var(--dn-muted);font-size:12px}
#pg-dn-panel .dn-dots{margin-left:auto;display:flex;gap:4px}
#pg-dn-panel .dn-dots i{width:8px;height:8px;border-radius:50%;background:var(--dn-dim);display:block}
#pg-dn-panel .dn-dots i[data-state="on"],#pg-dn-panel .dn-tab .b[data-state="on"]{background:var(--dn-ok)}
#pg-dn-panel .dn-dots i[data-state="warn"],#pg-dn-panel .dn-tab .b[data-state="warn"]{background:var(--dn-warn)}
#pg-dn-panel .dn-dots i[data-state="danger"],#pg-dn-panel .dn-tab .b[data-state="danger"]{background:var(--dn-danger)}
#pg-dn-panel .dn-tabs{display:flex;flex-wrap:wrap;background:var(--dn-bg-0);border-bottom:1px solid var(--dn-border)}
#pg-dn-panel .dn-tab{flex:1 1 auto;min-width:0;background:transparent;border:0;border-bottom:2px solid transparent;color:var(--dn-muted);font:inherit;font-size:12px;font-weight:600;padding:7px 4px 6px;cursor:pointer;white-space:nowrap;border-radius:0}
#pg-dn-panel .dn-tab .ic{margin-right:3px}
@container (max-width:370px){#pg-dn-panel .dn-tab .lbl{display:none}#pg-dn-panel .dn-tab .ic{margin-right:0;font-size:15px}}
#pg-dn-panel .dn-tab[aria-selected="true"]{color:var(--dn-text);border-bottom-color:var(--dn-accent);background:var(--dn-bg-1)}
#pg-dn-panel .dn-tab .b{display:inline-block;width:7px;height:7px;border-radius:50%;margin-left:3px;background:var(--dn-dim);vertical-align:1px}
#pg-dn-panel .dn-body{flex:1;overflow:auto;padding:12px;display:flex;flex-direction:column;gap:8px}
#pg-dn-panel .dn-pane{display:flex;flex-direction:column;gap:8px}
#pg-dn-panel .dn-section{display:flex;flex-direction:column;gap:8px}
#pg-dn-panel .dn-section+.dn-section{border-top:1px solid var(--dn-border);padding-top:12px;margin-top:4px}
#pg-dn-panel .dn-section>h3{margin:0;font-size:13px;font-weight:600;display:flex;align-items:center;gap:8px;color:var(--dn-text)}
#pg-dn-panel .dn-section>h3 .spacer{flex:1}
#pg-dn-panel .dn-field{display:flex;flex-direction:column;gap:2px;margin:0}
#pg-dn-panel .dn-field>span{font-size:13px}
#pg-dn-panel .dn-row{display:flex;gap:8px;align-items:flex-start;flex-wrap:wrap}
#pg-dn-panel .dn-row .dn-field{flex:1;min-width:120px}
#pg-dn-panel .dn-input,#pg-dn-panel .dn-select,#pg-dn-panel .dn-textarea{width:100%;min-height:28px;background:var(--dn-bg-0);color:var(--dn-text);border:1px solid var(--dn-border);border-radius:var(--dn-radius-sm);padding:4px 8px;font:inherit;margin:0}
#pg-dn-panel .dn-input:focus,#pg-dn-panel .dn-select:focus,#pg-dn-panel .dn-textarea:focus,#pg-dn-panel .dn-btn:focus-visible,#pg-dn-panel .dn-tab:focus-visible{outline:2px solid var(--dn-accent);outline-offset:1px}
#pg-dn-panel .dn-input:disabled{color:var(--dn-dim);background:var(--dn-bg-1)}
#pg-dn-panel .dn-input--sm{width:64px;min-width:64px}
#pg-dn-panel .dn-textarea{font:12px/1.4 ui-monospace,Consolas,monospace;resize:vertical}
#pg-dn-panel .dn-help{display:block;font-size:12px;color:var(--dn-muted);line-height:1.4;margin:0}
#pg-dn-panel .dn-hint{font-size:12px;color:var(--dn-muted);font-weight:400}
#pg-dn-panel .dn-help.warn{color:var(--dn-warn)}
#pg-dn-panel .dn-help.err{color:var(--dn-danger-t)}
#pg-dn-panel .dn-inline{display:flex;align-items:center;gap:6px;font-size:13px}
#pg-dn-panel .dn-route-bar .dn-select{flex:1;min-width:0}
#pg-dn-panel .dn-toggle--sm{font-size:12px;margin:0 6px 0 0}
#pg-dn-panel .dn-trip{background:var(--dn-bg-0);border:1px solid var(--dn-border);border-radius:var(--dn-radius);padding:10px 12px;display:flex;flex-direction:column;gap:8px}
#pg-dn-panel .dn-trip .top{display:flex;align-items:center;gap:10px}
#pg-dn-panel .dn-trip .ico{font-size:20px;flex:none}
#pg-dn-panel .dn-trip .txt{flex:1;min-width:0}
#pg-dn-panel .dn-trip .txt b{display:block;font-size:13px}
#pg-dn-panel .dn-trip .txt span{color:var(--dn-muted);font-size:12px}
#pg-dn-panel .dn-trip .bar{height:4px;border-radius:2px;background:var(--dn-bg-3);overflow:hidden}
#pg-dn-panel .dn-trip .bar i{display:block;height:100%;width:0;background:var(--dn-accent);transition:width .4s}
#pg-dn-panel .dn-trip.busy .bar i{background:var(--dn-warn)}
#pg-dn-panel .dn-trip .cfg{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:12px;color:var(--dn-muted)}
#pg-dn-panel .dn-blk>h3{cursor:pointer;user-select:none}
#pg-dn-panel .dn-blk>h3 .chev{color:var(--dn-muted);font-size:11px;transition:transform .15s}
#pg-dn-panel .dn-blk.open>h3 .chev{transform:rotate(90deg)}
#pg-dn-panel .dn-blk>h3 .sum{color:var(--dn-muted);font-weight:400;font-size:12px}
#pg-dn-panel .dn-blk>.in{display:none;flex-direction:column;gap:8px}
#pg-dn-panel .dn-blk.open>.in{display:flex}
#pg-dn-panel .dn-blk.open>h3 .sum{display:none}
@media (prefers-reduced-motion:reduce){#pg-dn-panel .dn-trip .bar i,#pg-dn-panel .dn-blk>h3 .chev{transition:none}}
#pg-dn-panel .dn-tiers{display:grid;grid-template-columns:1fr auto;gap:4px 10px;align-items:center;font-size:12px}
#pg-dn-panel .dn-famlist{display:flex;flex-wrap:wrap;gap:6px}
#pg-dn-panel .dn-famlist:empty::before{content:'Nenhum item escolhido.';color:var(--dn-muted);font-size:12px}
#pg-dn-panel .dn-famchip{display:inline-flex;align-items:center;gap:4px;font-size:12px;padding:2px 4px 2px 8px;border:1px solid var(--dn-border);border-radius:999px}
#pg-dn-panel .dn-famchip .k{color:var(--dn-muted)}
#pg-dn-panel .dn-famchip button{border:0;background:none;color:var(--dn-muted);cursor:pointer;font-size:13px;line-height:1;padding:0 4px}
#pg-dn-panel .dn-chip{display:inline-block;font-size:11px;font-weight:600;padding:1px 8px;border-radius:10px;color:var(--c);border:1px solid color-mix(in srgb,var(--c) 60%,transparent);background:color-mix(in srgb,var(--c) 12%,var(--dn-bg-0))}
#pg-dn-panel .dn-prev{width:100%;border-collapse:collapse;font-size:12px;font-variant-numeric:tabular-nums}
#pg-dn-panel .dn-prev th{text-align:left;color:var(--dn-muted);font-weight:500;padding:2px 6px;border-bottom:1px solid var(--dn-border)}
#pg-dn-panel .dn-prev td{padding:3px 6px;border-bottom:1px solid color-mix(in srgb,var(--dn-border) 50%,transparent)}
#pg-dn-panel .dn-prev td.n{text-align:right}
#pg-dn-panel .dn-prev tr.keep td{color:var(--dn-muted)}
#pg-dn-panel .dn-prev tr.sell td:first-child,#pg-dn-panel .dn-prev tr.sell td.why{color:var(--dn-ok-t)}
#pg-dn-panel .dn-route-bar .dn-btn{flex:none}
#pg-dn-panel .dn-btn:disabled{opacity:.4;cursor:default}
#pg-dn-panel .dn-status{display:flex;align-items:center;gap:8px;font-size:12px;background:var(--dn-bg-0);border-radius:var(--dn-radius-sm);padding:6px 8px;font-variant-numeric:tabular-nums}
#pg-dn-panel .dn-status .k{color:var(--dn-muted)}
#pg-dn-panel .dn-status .r{margin-left:auto}
#pg-dn-panel .dn-status.col{flex-direction:column;align-items:stretch;gap:4px}
#pg-dn-panel .dn-status .bad{color:var(--dn-danger-t);font-weight:600}
#pg-dn-panel .dn-status.col .ok{color:var(--dn-ok-t)}
#pg-dn-panel .dn-status.col .dim{color:var(--dn-muted)}
#pg-dn-panel .dn-status.col div{white-space:pre-wrap}
#pg-dn-panel .dn-summary{font-size:12px;background:var(--dn-bg-0);border-left:2px solid var(--dn-accent);padding:6px 8px;border-radius:0 var(--dn-radius-sm) var(--dn-radius-sm) 0}
#pg-dn-panel .dn-toggle{display:inline-flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;position:relative;margin:0}
#pg-dn-panel .dn-toggle input{position:absolute;opacity:0;width:0;height:0;margin:0}
#pg-dn-panel .dn-toggle .sw{width:32px;height:18px;border-radius:9px;background:var(--dn-bg-3);position:relative;flex:none;transition:background .15s}
#pg-dn-panel .dn-toggle .sw::after{content:"";position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:#fff;transition:left .15s}
#pg-dn-panel .dn-toggle input:checked+.sw{background:var(--dn-ok)}
#pg-dn-panel .dn-toggle input:checked+.sw::after{left:16px}
#pg-dn-panel .dn-toggle input:focus-visible+.sw{outline:2px solid var(--dn-accent);outline-offset:1px}
#pg-dn-panel .dn-btn{min-height:28px;border-radius:var(--dn-radius-sm);border:1px solid transparent;font:inherit;font-size:13px;font-weight:600;padding:4px 12px;cursor:pointer;background:var(--dn-bg-3);color:var(--dn-text);margin:0}
#pg-dn-panel .dn-btn--primary{background:var(--dn-accent);color:#fff}
#pg-dn-panel .dn-btn--primary.idle{background:var(--dn-bg-3);color:var(--dn-text)}
#pg-dn-panel .dn-btn--danger{background:transparent;border-color:var(--dn-danger);color:var(--dn-danger-t)}
#pg-dn-panel .dn-btn--danger:hover{background:var(--dn-danger);color:#fff}
#pg-dn-panel .dn-btn--ghost{background:transparent;color:var(--dn-muted);font-weight:400;padding:2px 6px}
#pg-dn-panel .dn-btn--ghost:hover{color:var(--dn-text)}
#pg-dn-panel .dn-btn--sm{min-height:24px;padding:2px 8px;font-size:12px}
#pg-dn-panel .dn-actions{display:flex;gap:8px;flex-wrap:wrap}
#pg-dn-panel .dn-actions .dn-btn{flex:1}
#pg-dn-panel .dn-badge{font-size:11px;font-weight:600;padding:1px 7px;border-radius:10px;background:var(--dn-bg-3);color:var(--dn-muted)}
#pg-dn-panel .dn-badge[data-state="on"]{background:rgba(35,165,89,.18);color:var(--dn-ok-t)}
#pg-dn-panel .dn-badge[data-state="warn"]{background:rgba(240,178,50,.18);color:var(--dn-warn)}
#pg-dn-panel .dn-chan-summary{display:flex;gap:8px;align-items:center;font-size:12px;color:var(--dn-muted);flex-wrap:wrap}
#pg-dn-panel .dn-chan-summary b{color:var(--dn-text);font-weight:500}
#pg-dn-panel .dn-items{display:flex;flex-direction:column}
#pg-dn-panel .dn-item{display:grid;grid-template-columns:auto 1fr auto;gap:8px;align-items:center;padding:4px 6px;border-radius:var(--dn-radius-sm);font-size:12px;cursor:pointer;margin:0}
#pg-dn-panel .dn-item:hover{background:var(--dn-bg-2)}
#pg-dn-panel .dn-item input[type="checkbox"]{width:16px;height:16px;margin:0;accent-color:var(--dn-accent);position:static;opacity:1}
#pg-dn-panel .dn-item .nm{display:flex;gap:6px;align-items:baseline;flex-wrap:wrap}
#pg-dn-panel .dn-item .q{color:var(--dn-muted);font-variant-numeric:tabular-nums}
#pg-dn-panel .dn-item .w{color:var(--dn-shiny)}
#pg-dn-panel .dn-item .keep{display:none;align-items:center;gap:4px;color:var(--dn-muted)}
#pg-dn-panel .dn-item.on .keep{display:inline-flex}
#pg-dn-panel .dn-item.faltou .nm{color:var(--dn-muted)}
#pg-dn-panel .dn-item .keep input{width:52px;min-height:24px;padding:2px 6px}
#pg-dn-panel .dn-item.locked{color:var(--dn-dim);cursor:default}
#pg-dn-panel .dn-item.locked:hover{background:transparent}
#pg-dn-panel .dn-route{list-style:none;margin:0;padding:0;font-size:12px;display:flex;flex-direction:column;gap:2px;font-variant-numeric:tabular-nums}
#pg-dn-panel .dn-route li{display:flex;gap:8px;padding:2px 6px;border-radius:var(--dn-radius-sm)}
#pg-dn-panel .dn-route li .m{width:14px;text-align:center;color:var(--dn-muted);flex:none}
#pg-dn-panel .dn-route li.done{color:var(--dn-muted)}
#pg-dn-panel .dn-route li.cur{background:var(--dn-bg-1)}
#pg-dn-panel .dn-route li.cur .m{color:var(--dn-accent)}
#pg-dn-panel .dn-route li.bad,#pg-dn-panel .dn-route li.bad .m{color:var(--dn-danger-t)}
#pg-dn-panel .dn-route li .hint{margin-left:auto;color:var(--dn-muted)}
#pg-dn-panel .dn-foot{display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--dn-bg-0);border-top:1px solid var(--dn-border)}
#pg-dn-panel .dn-msg{flex:1;min-width:0;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--dn-muted);cursor:default}
#pg-dn-panel .dn-msg.wrap{white-space:normal}
#pg-dn-panel .dn-msg[data-kind="ok"]{color:var(--dn-ok-t)}
#pg-dn-panel .dn-msg[data-kind="warn"],#pg-dn-panel .dn-msg[data-kind="dirty"]{color:var(--dn-warn)}
#pg-dn-panel .dn-msg[data-kind="error"]{color:var(--dn-danger-t)}
#pg-dn-panel .dn-ok-t{color:var(--dn-ok-t)}
#pg-dn-panel .dn-err-t{color:var(--dn-danger-t)}
@media (prefers-reduced-motion:reduce){#pg-dn-btn .dn-dot[data-state="danger"]{animation:none}}
`;

    let btn;
    function flashButton() {
        if (!btn) return;
        btn.style.boxShadow = '0 0 12px 4px #f04747';
        setTimeout(() => { btn.style.boxShadow = ''; }, 3000);
    }

    function loadUi() {
        try { return JSON.parse(localStorage.getItem(UI_KEY) || '{}') || {}; } catch { return {}; }
    }
    function saveUi(patch) {
        try { localStorage.setItem(UI_KEY, JSON.stringify(Object.assign(loadUi(), patch))); } catch { /* sem localStorage */ }
    }
    function escHtml(t) { return String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
    function fmtNum(n) { return Number(n).toLocaleString('pt-BR'); }

    const TABS = [
        { id: 'avisos', icon: '🔔', label: 'Avisos' },
        { id: 'bolas', icon: '🛒', label: 'Compras' },
        { id: 'venda', icon: '💰', label: 'Venda' },
        { id: 'treino', icon: '⚔', label: 'Treino' },
        { id: 'profissao', icon: '📖', label: 'Profissão' },
        { id: 'breeding', icon: '🥚', label: 'Breeding' },
        { id: 'sistema', icon: '⚙', label: 'Sistema' },
    ];

    // Estado de cada módulo para os badges: 'on' | 'off' | 'warn' | 'danger'. Recebe um objeto no
    // formato do cfg (o próprio cfg com o painel fechado; o rascunho do formulário com ele aberto).
    function moduleState(tab, d) {
        const rota = Array.isArray(d.route) ? d.route.filter(r => r && r.slug && Number(r.level) > 0) : [];
        const temAlertas = Boolean((d.webhookAlerts || '').trim()); // true = canal de Alertas preenchido
        switch (tab) {
            case 'avisos': return (d.webhookUrl || '').trim() ? 'on' : 'danger';
            case 'bolas': {
                const min = Number(d.ballsMin) || 0;
                if (!(min > 0 || d.autoBuy) && !supplyOn(d) && !d.healJoyEnabled && !d.cityIdleEnabled) return 'off';
                if ((d.autoBuy && !min) || !temAlertas) return 'warn';
                return 'on';
            }
            case 'venda': {
                const itens = d.sellEnabled, pokes = d.pokeSellEnabled;
                if (!itens && !pokes && !depositWanted(d)) return 'off';
                if (!temAlertas) return 'warn';
                if (itens && !Object.keys(d.sellItems || {}).length) return 'warn';
                if (pokes && !pokeSellHasRules(d)) return 'warn';
                return 'on';
            }
            case 'treino': {
                const nivel = d.routeEnabled || (Number(d.levelAlertAt) || 0) > 0;
                if (!(nivel || d.dailyEnabled || d.giftEnabled || d.evolveEnabled || d.slotEnabled)) return 'off';
                if (d.routeEnabled && (!rota.length || (Number(cfg.routeStage) || 0) >= rota.length)) return 'warn';
                if (nivel && !(d.webhookLevel || '').trim()) return 'warn';
                if ((d.routeEnabled || d.dailyEnabled || d.giftEnabled || d.evolveEnabled || d.slotEnabled) && !temAlertas) return 'warn'; // troca de hunt, daily, gift, evolução e slot machine avisam em Alertas
                return 'on';
            }
            case 'profissao':
                if (!d.catchRouteEnabled && !d.clanEnabled) return 'off';
                return temAlertas ? 'on' : 'warn';
            case 'breeding': {
                if (!d.breedEnabled) return 'off';
                if (!breedActiveLines(d).length || !temAlertas) return 'warn';
                return 'on';
            }
            case 'sistema': return d.reloadEnabled ? 'on' : 'off';
        }
        return 'off';
    }
    function stateSummary(d) {
        const rota = Array.isArray(d.route) ? d.route.filter(r => r && r.slug && Number(r.level) > 0) : [];
        const st = Number(cfg.routeStage) || 0;
        return [
            `Avisos: ${d.notifyEveryCapture ? 'toda captura' : (d.watchList && d.watchList.length ? `lista (${d.watchList.length})` : 'todas')}${d.notifyShiny ? ' + shiny' : ''}${d.lockNotified ? ' + 🔒' : ''}${d.familyNotified ? ' + 📦' : ''}`,
            `Bolas: ${!((Number(d.ballsMin) || 0) > 0 || d.autoBuy) ? 'desligado' : `${d.ballsWatch && d.ballsWatch !== 'auto' ? ballName(Number(d.ballsWatch)) : 'em uso'} < ${Number(d.ballsMin) || (d.autoBuy ? 1 : 0)}${d.autoBuy ? ' + compra' : ''}`}${supplyOn(d) ? ` · refil: ${supplySlots(d).map(s => `${s.name} < ${s.min}`).join(', ')}` : ''}${d.healJoyEnabled ? ' · Joy' : ''}${d.cityIdleEnabled ? ` · volta da cidade ${Number(d.cityIdleMin) || IDLE_MIN_DEFAULT} min` : ''}`,
            `Venda: ${[d.sellEnabled ? `${Object.keys(d.sellItems || {}).length} drops` : '', d.pokeSellEnabled ? `Pokémon (${TIERS.filter(t => pokeSellLimit(d, t.key) > 0).length} raridades)` : '', depositWanted(d) ? 'guardar' : ''].filter(Boolean).join(' + ') || 'desligada'} · viagem ${d.tripEveryMin}${d.tripEveryMaxMin > d.tripEveryMin ? `–${d.tripEveryMaxMin}` : ''} min`,
            `Treino: ${[d.routeEnabled && rota.length ? (st >= rota.length ? 'rota concluída' : `rota${cfg.routeName ? ` "${cfg.routeName}"` : ''} ${st + 1}/${rota.length}`) : ((Number(d.levelAlertAt) || 0) ? `nível ${d.levelAlertAt}${d.levelSwap ? ' + troca' : ''}` : ''), d.dailyEnabled ? (d.dailyAuto ? 'daily sozinha' : 'daily') : '', d.giftEnabled ? 'gift' : '', d.evolveEnabled ? 'evolução' : '', d.slotEnabled ? 'slot machine' : ''].filter(Boolean).join(' + ') || 'desligado'}`,
            `Profissão: ${[d.catchRouteEnabled ? `rota de captura (${(Array.isArray(d.catchRouteAreas) && d.catchRouteAreas.length ? d.catchRouteAreas : ['kanto']).join('+')}${Number(d.catchRouteMaxLevel) ? ` até lv ${d.catchRouteMaxLevel}` : ''}${d.catchRouteAuto ? ', bola auto' : ''})` : '', d.clanEnabled ? `clã ${clanName(d.clanKey)}${d.clanRoute ? ' + caça' : ''}` : ''].filter(Boolean).join(' + ') || 'desligada'}`,
            `Breeding: ${d.breedEnabled ? `${breedActiveLines(d).length} ${breedActiveLines(d).length === 1 ? 'linhagem' : 'linhagens'}${d.breedDouble ? ' + dobrar' : ''}` : 'desligado'}`,
            `Recarga: ${d.reloadEnabled ? `${d.reloadEveryMin}${d.reloadEveryMaxMin > d.reloadEveryMin ? `–${d.reloadEveryMaxMin}` : ''} min` : 'desligada'}`,
        ].join(' · ');
    }

    const TIER_LABEL = (t) => `${t.name} (${t.min === -Infinity ? '< 1.0' : t.min.toFixed(1) + '+'})`;

    function buildUI() {
        if (document.getElementById('pg-dn-btn')) return;
        if (!document.body) { setTimeout(buildUI, 500); return; }

        const style = document.createElement('style');
        style.id = 'pg-dn-style';
        style.textContent = PANEL_CSS;
        document.head.appendChild(style);

        btn = document.createElement('button');
        btn.id = 'pg-dn-btn';
        btn.type = 'button';
        btn.innerHTML = '<span>🔔</span><span class="dn-dot" id="pg-dn-dot"></span>';
        btn.title = 'Notificações no Discord — configurar';

        const panel = document.createElement('div');
        panel.id = 'pg-dn-panel';
        panel.hidden = true;
        const hookInput = (id, help) => `<label class="dn-field"><span>${id === 'hook' ? 'Capturas' : id === 'hook-shiny' ? 'Shinys' : id === 'hook-alerts' ? 'Alertas' : 'Nível'}</span>
                <input id="pg-dn-${id}" class="dn-input" type="password" placeholder="https://discord.com/api/webhooks/…" autocomplete="off"><span class="dn-help">${help}</span></label>`;
        panel.innerHTML = `
            <div class="dn-head">
                <span class="t">🔔 Notify</span><span class="v">v${VERSION}</span>
                <div class="dn-dots" id="pg-dn-dots">${TABS.map(t => `<i data-tab="${t.id}"></i>`).join('')}</div>
                <button type="button" class="dn-btn dn-btn--ghost" id="pg-dn-close" title="Fechar (Esc)">✕</button>
            </div>
            <div class="dn-tabs" role="tablist">${TABS.map(t => `<button type="button" class="dn-tab" role="tab" data-tab="${t.id}" aria-selected="false" title="${t.label}"><span class="ic">${t.icon}</span><span class="lbl">${t.label}</span><span class="b"></span></button>`).join('')}</div>
            <div class="dn-body">
                <section class="dn-pane" data-pane="avisos" hidden>
                    <div class="dn-section">
                        <h3>Canais do Discord <span class="spacer"></span><button type="button" class="dn-btn dn-btn--ghost dn-btn--sm" id="pg-dn-chan-toggle">editar</button></h3>
                        <div class="dn-chan-summary" id="pg-dn-chan-summary"></div>
                        <div id="pg-dn-chan-box" class="dn-section" hidden>
                            ${hookInput('hook', 'Obrigatório. Recebe as capturas e tudo que não tiver canal próprio.')}
                            ${hookInput('hook-shiny', 'Vazio = shinys vão para Capturas.')}
                            ${hookInput('hook-alerts', 'Estoque, compra, venda e troca de hunt. Vazio = esses avisos NÃO são enviados.')}
                            ${hookInput('hook-level', 'Nível atingido e troca de líder. Vazio = esses avisos NÃO são enviados.')}
                        </div>
                    </div>
                    <div class="dn-section">
                        <h3>Quais capturas avisar</h3>
                        <label class="dn-field"><span>Pokémon</span><input id="pg-dn-list" class="dn-input" type="text" placeholder="dratini, larvitar"><span class="dn-help">Separados por vírgula. Vazio = todas.</span></label>
                        <label class="dn-toggle"><input id="pg-dn-shiny" type="checkbox"><span class="sw"></span>Todo shiny <span class="dn-hint">(avisa sempre, mesmo fora da lista)</span></label>
                        <label class="dn-toggle"><input id="pg-dn-all" type="checkbox"><span class="sw"></span>Toda captura <span class="dn-hint">(ignora a lista)</span></label>
                    </div>
                    <div class="dn-section">
                        <h3>Guardar o Pokémon avisado</h3>
                        <label class="dn-toggle"><input id="pg-dn-lock" type="checkbox"><span class="sw"></span>🔒 Travar no jogo</label>
                        <p class="dn-help">Cadeado da loja: fica fora da venda de Pokémon.</p>
                        <label class="dn-toggle"><input id="pg-dn-family" type="checkbox"><span class="sw"></span>📦 Mandar para o depósito da família</label>
                        <p class="dn-help">Precisa estar numa família e gasta 1 movimento do limite diário. O Pokémon passa a ser da família. Líder e starter não vão.</p>
                    </div>
                    <div class="dn-section">
                        <h3>Filtro de qualidade</h3>
                        <div class="dn-summary" id="pg-dn-q-summary"></div>
                        <label class="dn-field"><span>Raridade mínima</span>
                            <select id="pg-dn-tier" class="dn-select"><option value="">Qualquer</option>${TIERS_ASC.map(t => `<option value="${t.key}">${TIER_LABEL(t)}</option>`).join('')}</select></label>
                        <div class="dn-row">
                            <label class="dn-field"><span>Poder mínimo dessa raridade</span><input id="pg-dn-tier-iv" class="dn-input" type="number" min="0" max="${IV_MAX}" step="1" placeholder="0 = qualquer"></label>
                            <label class="dn-field"><span>Poder mínimo, qualquer raridade</span><input id="pg-dn-miniv" class="dn-input" type="number" min="0" max="${IV_MAX}" step="1" placeholder="0 = desligado"></label>
                        </div>
                        <p class="dn-help">Poder é o X/${IV_MAX} que o jogo mostra.</p>
                    </div>
                    <div class="dn-section">
                        <h3>Mensagem</h3>
                        <div class="dn-row">
                            <label class="dn-field"><span>Mencionar (ID do Discord)</span><input id="pg-dn-mention" class="dn-input" type="text" placeholder="123456789012345678 (opcional)"></label>
                            <label class="dn-field"><span>Intervalo, mesmo Pokémon</span><span class="dn-inline"><input id="pg-dn-cooldown" class="dn-input dn-input--sm" type="number" min="0" step="1" placeholder="0">s</span><span class="dn-help">0 = avisa todas.</span></label>
                        </div>
                    </div>
                </section>
                <section class="dn-pane" data-pane="bolas" hidden>
                    <div class="dn-trip" id="pg-dn-trip">
                        <div class="top"><span class="ico">🏙</span><div class="txt"><b id="pg-dn-trip-title"></b><span id="pg-dn-trip-sub"></span></div><button type="button" class="dn-btn dn-btn--sm" id="pg-dn-trip-now" title="Sai da hunt, vende e compra tudo que estiver pendente no NPC da cidade e volta.">Ir agora</button></div>
                        <div class="bar"><i id="pg-dn-trip-bar"></i></div>
                        <div class="cfg">Sai da hunt, vende e compra no NPC, volta. A cada <input id="pg-dn-trip-min" class="dn-input dn-input--sm" type="number" min="1" step="1" aria-label="mínimo"> a <input id="pg-dn-trip-max" class="dn-input dn-input--sm" type="number" min="0" step="1" aria-label="máximo"> min</div>
                    </div>
                    <div class="dn-section">
                        <h3>Bolas <span class="spacer"></span><label class="dn-toggle"><input id="pg-dn-autobuy" type="checkbox"><span class="sw"></span>Comprar sozinho</label></h3>
                        <div class="dn-inline">Bola <select id="pg-dn-ball" class="dn-select" style="flex:1;min-width:120px"><option value="auto">A que estiver em uso (último catch)</option>${Object.entries(BALL_NAMES).map(([id, n]) => `<option value="${id}">${n}</option>`).join('')}</select></div>
                        <div class="dn-inline">Quando ficar abaixo de <input id="pg-dn-ballsmin" class="dn-input dn-input--sm" type="number" min="0" step="1" placeholder="0"> comprar <input id="pg-dn-autobuy-qty" class="dn-input dn-input--sm" type="number" min="1" max="${BUY_MAX_QTY}" step="1" placeholder="100"></div>
                        <div class="dn-status" id="pg-dn-balls-status"></div>
                        <p class="dn-help warn" id="pg-dn-autobuy-warn" hidden>⚠ Limite 0: compra só quando a bola acabar.</p>
                        <p class="dn-help">Sem "Comprar sozinho", só avisa no Discord quando ficar abaixo do limite (0 = sem aviso). A compra vai na viagem à cidade; bola zerada pede viagem na hora.</p>
                    </div>
${SUPPLY_KINDS.map(k => `                    <div class="dn-section">
                        <h3>${k.label} <span class="spacer"></span><label class="dn-toggle"><input id="pg-dn-${k.key}-buy" type="checkbox"><span class="sw"></span>Comprar sozinho</label></h3>
                        <div class="dn-inline">${k.label} <select id="pg-dn-${k.key}-item" class="dn-select" style="flex:1;min-width:120px">${SUPPLY_ITEMS[k.key].map(i => `<option value="${i.id}">${i.name} (${i.info}, 💲${i.price})</option>`).join('')}</select></div>
                        <div class="dn-inline">Quando ficar abaixo de <input id="pg-dn-${k.key}-min" class="dn-input dn-input--sm" type="number" min="0" step="1" placeholder="0"> comprar <input id="pg-dn-${k.key}-qty" class="dn-input dn-input--sm" type="number" min="1" max="${BUY_MAX_QTY}" step="1" placeholder="100"></div>
                        <div class="dn-status" id="pg-dn-${k.key}-status"></div>
                    </div>
`).join('')}                    <p class="dn-help">Poções e revives: o script confere a mochila a cada 5 min; abaixo do limite (0 = quando acabar), pede viagem à cidade e compra no Mark. Na viagem do relógio, vão de carona se estiverem abaixo do limite. O aviso da compra vai para o canal de Alertas.</p>
                    <div class="dn-section">
                        <h3>💊 Nurse Joy <span class="spacer"></span><label class="dn-toggle"><input id="pg-dn-healjoy" type="checkbox"><span class="sw"></span>Curar e voltar para a hunt</label></h3>
                        <div class="dn-status" id="pg-dn-healjoy-status"></div>
                        <p class="dn-help">Quando o líder desmaia sem Revive (ou o time inteiro cai) o jogo manda a conta para a cidade. Com isto ligado o script cura o time na Nurse Joy (de graça) e volta para a hunt em que caiu. Se o Auto-Revive do jogo levantar o líder, nada muda. Caiu 3 vezes na mesma hunt em 30 min: fica na cidade e avisa (a hunt está forte demais). Avisos no canal de Alertas.</p>
                    </div>
                    <div class="dn-section">
                        <h3>🏙️ Parada na cidade <span class="spacer"></span><label class="dn-toggle"><input id="pg-dn-cityidle" type="checkbox"><span class="sw"></span>Voltar para a hunt</label></h3>
                        <div class="dn-inline">Depois de <input id="pg-dn-cityidle-min" class="dn-input dn-input--sm" type="number" min="1" step="1" placeholder="5"> min parada fora de hunt (padrão 10)</div>
                        <div class="dn-status" id="pg-dn-cityidle-status"></div>
                        <p class="dn-help">Se a conta ficar esse tempo na cidade sem farmar (a volta da viagem ou da recarga não pegou, o jogo mandou para a cidade, você saiu e esqueceu), a conta está bugada: o script cura o time na Nurse Joy e volta para a hunt: a da rota do clã, a etapa da rota de treino ou a última em que esteve. Não mexe durante viagem, cura, troca de hunt ou de líder; a rota de captura já tem a própria volta. Não volta se a Joy não curar. Voltou 3 vezes em 1 h sem a hunt pegar: para e avisa. Avisos no canal de Alertas.</p>
                    </div>
                </section>
                <section class="dn-pane" data-pane="venda" hidden>
                    <div class="dn-section dn-blk" id="pg-dn-blk-itens" data-blk="itens">
                        <h3><span class="chev">▶</span>Drops da hunt <span class="sum" id="pg-dn-sum-itens"></span><span class="spacer"></span><label class="dn-toggle"><input id="pg-dn-sell" type="checkbox"><span class="sw"></span>Vender sozinho</label></h3>
                        <div class="in">
                            <div class="dn-inline"><span class="k">Hunt</span><input id="pg-dn-sell-view" class="dn-input" list="pg-dn-sell-view-dl" type="text" placeholder="a atual (ou escolha outra para configurar antes)" spellcheck="false"><button type="button" class="dn-btn dn-btn--ghost dn-btn--sm" id="pg-dn-sell-view-cur" title="Volta para a hunt em que a conta está.">Hunt atual</button></div>
                            <datalist id="pg-dn-sell-view-dl"></datalist>
                            <div class="dn-status" id="pg-dn-sell-hunt"></div>
                            <div class="dn-items" id="pg-dn-sell-list"></div>
                            <p class="dn-help">A lista traz todos os drops do monstro da hunt (tabela do jogo, com chance e quantidade por abate), mesmo os que ainda não caíram. Marcado = vendido na viagem. "Manter" = quantidade que fica na mochila. ⚠ = raro, pedra/feromônio ou outra categoria: confira. 🔒 = o jogo não deixa vender. Cada hunt guarda a sua lista: escolha outra hunt no campo acima para deixar a venda pronta antes de ir. <span class="dn-badge" id="pg-dn-sell-count"></span></p>
                        </div>
                    </div>
                    <div class="dn-section dn-blk" id="pg-dn-blk-pokes" data-blk="pokes">
                        <h3><span class="chev">▶</span>Pokémon fora do time <span class="sum" id="pg-dn-sum-pokes"></span><span class="spacer"></span><label class="dn-toggle"><input id="pg-dn-psell" type="checkbox"><span class="sw"></span>Vender sozinho</label></h3>
                        <div class="in">
                        <p class="dn-help">Nunca vende: no time, inicial, shiny, com cadeado 🔒, anunciado no mercado ou capturado há menos de 2 min. Vazio = essa raridade não vende. A proteção de venda do PokeGrid não pergunta nas vendas do script.</p>
                        <div class="dn-tiers">${TIERS_ASC.map(t => `<label for="pg-dn-psell-${t.key}"><span class="dn-chip" style="--c:#${t.color.toString(16).padStart(6, '0')}">${t.name}</span></label><span class="dn-inline">poder &lt; <input id="pg-dn-psell-${t.key}" class="dn-input dn-input--sm pg-dn-psell-lim" data-tier="${t.key}" type="number" min="0" max="${IV_MAX}" step="1" placeholder="—"></span>`).join('')}</div>
                        <p class="dn-help">Poder = 0 a ${IV_MAX}.</p>
                        <label class="dn-field"><span>Avisar com box acima de</span><input id="pg-dn-box-alert" class="dn-input dn-input--sm" type="number" min="0" step="10" placeholder="0 = desligado"></label>
                        <p class="dn-help">Pokémon na conta, estimado pelas capturas. Acima disso avisa no canal de Alertas e pede uma viagem de venda. Box grande demais = o jogo para de mandar a lista e nada vende sozinho; sem a lista, o script vende pela fila das capturas (dados da própria captura).</p>
                        <div class="dn-status col">
                            <div class="dn-inline"><b id="pg-dn-psell-status"></b><span class="k">prévia</span><button type="button" class="dn-btn dn-btn--ghost dn-btn--sm r" id="pg-dn-psell-refresh" title="Pede a lista de Pokémon ao jogo.">Atualizar lista</button></div>
                            <table class="dn-prev" aria-label="Prévia da venda"><thead><tr><th>Pokémon</th><th>Raridade</th><th class="n">Poder</th><th>Decisão</th></tr></thead><tbody id="pg-dn-psell-list"></tbody></table>
                        </div>
                        </div>
                    </div>
                    <div class="dn-section dn-blk" id="pg-dn-blk-guardar" data-blk="guardar">
                        <h3><span class="chev">▶</span>Guardar na cidade <span class="sum" id="pg-dn-sum-guardar"></span></h3>
                        <div class="in">
                            <div class="dn-field"><span>Sempre para a família</span>
                                <div class="dn-inline"><input id="pg-dn-famitem" class="dn-input" list="pg-dn-famitem-dl" type="text" placeholder="nome do item (ex.: Devoted Token)" spellcheck="false"> manter <input id="pg-dn-famitem-keep" class="dn-input dn-input--sm" type="number" min="0" step="1" placeholder="0"> <button type="button" class="dn-btn dn-btn--sm" id="pg-dn-famitem-add">Adicionar</button></div>
                                <datalist id="pg-dn-famitem-dl"></datalist>
                                <div class="dn-famlist" id="pg-dn-famlist"></div>
                            </div>
                            <label class="dn-field"><span>Drops que sobraram</span><select id="pg-dn-dep-items" class="dn-select"><option value="">Deixar na mochila</option><option value="depot">Depot comum</option><option value="family">Depósito da família</option></select></label>
                            <label class="dn-field"><span>Pokémon que não foram vendidos</span><select id="pg-dn-dep-pokes" class="dn-select"><option value="">Deixar no box (é o Depot comum)</option><option value="family">Depósito da família</option></select></label>
                            <label class="dn-toggle"><input id="pg-dn-dep-rare" type="checkbox"><span class="sw"></span>Mandar também shiny para a família <span class="dn-hint">(🔒 nunca: o jogo não aceita travado)</span></label>
                            <p class="dn-help">Última etapa de toda viagem à cidade (depois de vender e comprar); sozinho não gera viagem. "Sempre para a família": os itens que você escolher vão todos (menos o "manter"), venham de drop, daily ou boss; vão primeiro. Drops: só o que já caiu em hunt; poções, revives e outros consumíveis (berry, held, TM, addon) NUNCA saem da mochila, nem os marcados para venda e o que o clã pede. Pokémon: os de fora do time que a venda não vende; nunca inicial, anunciado ou capturado há menos de 2 min. No Depot comum o Pokémon já está (o box é o Depot), por isso o destino dele é só a família. O que entra na família passa a ser DA FAMÍLIA; limite de 50 movimentos por dia (+50 por VIP).</p>
                            <div class="dn-status" id="pg-dn-dep-status"></div>
                        </div>
                    </div>
                </section>
                <section class="dn-pane" data-pane="treino" hidden>
                    <div class="dn-section">
                        <h3>Nível do líder</h3>
                        <label class="dn-field"><span>Avisar no nível</span><input id="pg-dn-level" class="dn-input" type="number" min="0" step="1" placeholder="0 = desligado"><span class="dn-help" id="pg-dn-level-help"></span></label>
                        <label class="dn-toggle"><input id="pg-dn-level-swap" type="checkbox"><span class="sw"></span>Trocar de líder ao atingir</label>
                        <p class="dn-help">Põe como líder o próximo do time abaixo do nível. Um aviso por Pokémon, no canal de Nível.</p>
                        <div class="dn-status"><span>★</span><span id="pg-dn-team"></span><button type="button" class="dn-btn dn-btn--ghost dn-btn--sm r" id="pg-dn-team-refresh">Atualizar time</button></div>
                    </div>
                    <div class="dn-section">
                        <h3>Rota de treino</h3>
                        <div class="dn-inline dn-route-bar">
                            <select id="pg-dn-route-sel" class="dn-select" title="Rota ativa. Cada rota guarda as próprias etapas e a etapa em que parou; trocar aqui vale na hora."></select>
                            <button type="button" class="dn-btn dn-btn--sm" id="pg-dn-route-new" title="Cria outra rota (ex.: para outro Pokémon) e a deixa ativa.">＋ Nova</button>
                            <button type="button" class="dn-btn dn-btn--ghost dn-btn--sm" id="pg-dn-route-rename" title="Renomear a rota ativa.">✎</button>
                            <button type="button" class="dn-btn dn-btn--ghost dn-btn--sm" id="pg-dn-route-del" title="Excluir a rota ativa.">🗑</button>
                        </div>
                        <div id="pg-dn-route-name-box" class="dn-section" hidden>
                            <label class="dn-field"><span id="pg-dn-route-name-lbl">Nome da rota</span><input id="pg-dn-route-name" class="dn-input" type="text" maxlength="40" placeholder="ex.: Dratini até 50" spellcheck="false"></label>
                            <div class="dn-actions"><button type="button" class="dn-btn dn-btn--primary dn-btn--sm" id="pg-dn-route-name-ok">OK</button><button type="button" class="dn-btn dn-btn--sm" id="pg-dn-route-name-cancel">Cancelar</button></div>
                        </div>
                        <textarea id="pg-dn-route" class="dn-textarea" rows="3" placeholder="pidgey 10&#10;larvitar 15" spellcheck="false"></textarea>
                        <p class="dn-help">Uma etapa por linha: <b>hunt nível</b> (a hunt é o nome que aparece em "Hunt"). Quando todo o time chega ao nível, troca para a próxima hunt. Uma rota por Pokémon: crie com <b>＋ Nova</b> e troque no menu acima.</p>
                        <div class="dn-actions">
                            <button type="button" class="dn-btn dn-btn--sm" id="pg-dn-route-import" title="Cole o texto da aba Rota otimizada do PIW Tools e o script monta as etapas.">Importar do PIW Tools</button>
                            <button type="button" class="dn-btn dn-btn--sm" id="pg-dn-route-piwlink" title="Copia o link do gerador de rota do PIW Tools já com o líder e o nível atuais.">Copiar link do PIW Tools</button>
                            <button type="button" class="dn-btn dn-btn--sm" id="pg-dn-route-export" title="Copia SÓ esta rota (nome e etapas) para colar em outra conta/painel.">Exportar rota</button>
                            <button type="button" class="dn-btn dn-btn--sm" id="pg-dn-route-share-import" title="Cola uma rota exportada de outra conta/painel (só a rota; o resto da config não muda).">Importar rota</button>
                        </div>
                        <div id="pg-dn-route-share-box" class="dn-section" hidden>
                            <textarea id="pg-dn-route-share-text" class="dn-textarea" rows="3" placeholder="Clique aqui e cole (Ctrl+V) a rota exportada na outra conta" spellcheck="false"></textarea>
                            <p class="dn-help" id="pg-dn-route-share-status"></p>
                            <div class="dn-actions"><button type="button" class="dn-btn dn-btn--primary" id="pg-dn-route-share-apply">Aplicar rota</button><button type="button" class="dn-btn dn-btn--ghost" id="pg-dn-route-share-paste" title="Tenta colar da área de transferência.">📋 Colar</button></div>
                        </div>
                        <div id="pg-dn-route-import-box" class="dn-section" hidden>
                            <textarea id="pg-dn-route-import-text" class="dn-textarea" rows="4" placeholder="No PIW Tools (aba Rota otimizada), selecione as etapas, Ctrl+C e cole aqui"></textarea>
                            <p class="dn-help">Lê os blocos "De / Até / Hunt desta etapa". Cada etapa vira "hunt nível", com o nível em que a próxima hunt começa. Rota gerada pelo PIW Tools (Rakupo / bar).</p>
                            <div class="dn-actions"><button type="button" class="dn-btn dn-btn--primary" id="pg-dn-route-import-apply">Aplicar na rota</button></div>
                        </div>
                        <label class="dn-toggle"><input id="pg-dn-route-on" type="checkbox"><span class="sw"></span>Seguir a rota <span class="dn-hint">(liga a troca de líder)</span></label>
                        <div class="dn-status col"><div id="pg-dn-route-status"></div><ol class="dn-route" id="pg-dn-route-list"></ol></div>
                        <div class="dn-actions"><button type="button" class="dn-btn dn-btn--danger" id="pg-dn-route-reset" title="Volta à 1ª etapa.">Reiniciar rota</button></div>
                    </div>
                    <div class="dn-section">
                        <h3>Daily Kill</h3>
                        <label class="dn-toggle"><input id="pg-dn-daily" type="checkbox"><span class="sw"></span>Voltar para a hunt quando a missão do dia terminar</label>
                        <label class="dn-toggle"><input id="pg-dn-daily-claim" type="checkbox"><span class="sw"></span>Resgatar a recompensa sozinho</label>
                        <label class="dn-toggle"><input id="pg-dn-daily-auto" type="checkbox"><span class="sw"></span>Fazer a daily sozinho <span class="dn-hint">(escolhe a missão e o Pokémon do time, vai e volta)</span></label>
                        <label class="dn-field"><span>Voltar para</span><input id="pg-dn-daily-return" class="dn-input" type="text" placeholder="vazio = hunt de antes (ou a etapa da rota)" spellcheck="false"></label>
                        <p class="dn-help">Escolha a missão em Dailys e entre na hunt do Pokémon no jogo. Quando a meta bater, o script resgata (se marcado), sai da hunt e volta. Com "Fazer a daily sozinho", o script escolhe a missão (se você não escolheu), põe de líder o Pokémon do time com mais vantagem de tipo contra ela (tabela do jogo × nível), entra na hunt e, no fim, devolve o líder e volta. Aviso no canal de Alertas.</p>
                        <div class="dn-status"><span>⚔️</span><span id="pg-dn-daily-status"></span></div>
                    </div>
                    <div class="dn-section">
                        <h3>Daily Gift</h3>
                        <label class="dn-toggle"><input id="pg-dn-gift" type="checkbox"><span class="sw"></span>Resgatar o presente do dia sozinho <span class="dn-hint">(calendário de 28 dias)</span></label>
                        <label class="dn-field"><span>No Gift Center</span><select id="pg-dn-gift-center" class="dn-select"><option value="daily">entregar só o presente do dia</option><option value="all">entregar tudo que aparecer</option><option value="">não mexer (eu resgato no correio)</option></select></label>
                        <p class="dn-help">O jogo libera um presente por dia; resgatado, ele cai no Gift Center (correio 🎁) e precisa de um segundo resgate para chegar à conta. O script lê o calendário a cada 30 min, resgata o do dia e entrega pelo Gift Center conforme a opção acima. Boosts começam a contar na hora em que são entregues. Aviso no canal de Alertas.</p>
                        <div class="dn-status"><span>🎁</span><span id="pg-dn-gift-status"></span></div>
                    </div>
                    <div class="dn-section">
                        <h3>Evolução</h3>
                        <label class="dn-toggle"><input id="pg-dn-evolve" type="checkbox"><span class="sw"></span>Evoluir sozinho quem do time chegar ao nível <span class="dn-hint">(só com as pedras na mochila; mantém o nível)</span></label>
                        <p class="dn-help">Quando um Pokémon do time chega ao nível de evolução, o script pede uma viagem à cidade (o jogo só deixa evoluir em Cerulean), evolui gastando as pedras do elemento e volta para a hunt. Sem as pedras não evolui (a evolução grátis volta ao Lv.1) e avisa uma vez; tenta de novo nas próximas viagens. Linha ramificada (Eevee) só evolui se houver pedra para um destino só. Aviso no canal de Alertas.</p>
                        <div class="dn-status"><span>🧬</span><span id="pg-dn-evolve-status"></span></div>
                    </div>
                    <div class="dn-section">
                        <h3>Poke Slot Machine</h3>
                        <label class="dn-toggle"><input id="pg-dn-slot" type="checkbox"><span class="sw"></span>Girar a máquina de graça e ativar o bônus sozinho <span class="dn-hint">(nunca gasta Poke Slot Cards)</span></label>
                        <label class="dn-field"><span>Pokémon pedidos, em ordem de preferência</span><input id="pg-dn-slot-wanted" class="dn-input" type="text" placeholder="ex.: Dratini, Larvitar, Bagon — vazio = qualquer um" spellcheck="false"></label>
                        <p class="dn-help">A Poke Slot Machine fica no shopping: cada slot tem um roll grátis a cada 12 h (depois custa 1 Poke Slot Card) e sorteia 9 Pokémon; o escolhido ganha um bônus (EXP, loot, captura, dano…) de +5% a +35% conforme a raridade, que só vale contra aquela espécie, por algumas horas. Quando um slot liberado estiver com o roll grátis pronto, o script pede uma viagem à cidade, vai ao shopping, gira e escolhe o primeiro da lista acima que tiver saído no sorteio; se nenhum saiu, escolhe um dos 9 ao acaso. Uma estrela ativa de um Pokémon pedido não é trocada antes de expirar. Aviso no canal de Alertas.</p>
                        <div class="dn-status"><span>🎰</span><span id="pg-dn-slot-status"></span></div>
                    </div>
                </section>
                <section class="dn-pane" data-pane="profissao" hidden>
                    <div class="dn-section">
                        <h3>Rota de captura (Pokédex)</h3>
                        <label class="dn-toggle"><input id="pg-dn-catch" type="checkbox"><span class="sw"></span>Capturar todas as espécies, da hunt de menor nível à maior</label>
                        <p class="dn-help">Entra na hunt da espécie da vez; quando ela for capturada (por você, pelo Auto-Catch VIP ou pela bola abaixo), vai para a próxima. Espécies que a conta já tem na Pokédex são puladas. Desliga a rota de treino.</p>
                        <div class="dn-inline" id="pg-dn-catch-areas">Áreas: ${CATCH_AREAS.map(a => `<label class="dn-toggle dn-toggle--sm"><input type="checkbox" class="pg-dn-catch-area" value="${a}"><span class="sw"></span>${a}</label>`).join('')}</div>
                        <div class="dn-inline">Só hunts até o nível <input id="pg-dn-catch-max" class="dn-input dn-input--sm" type="number" min="0" step="1" placeholder="0"> <span class="dn-hint">(0 = todas)</span></div>
                        <label class="dn-toggle"><input id="pg-dn-catch-auto" type="checkbox"><span class="sw"></span>Jogar a bola sozinho quando a espécie da vez entrar na fila</label>
                        <label class="dn-field"><span>Bola</span><select id="pg-dn-catch-ball" class="dn-select"><option value="auto">A última usada (senão Poke Ball)</option>${Object.entries(BALL_NAMES).map(([id, n]) => `<option value="${id}">${n}</option>`).join('')}</select></label>
                        <div class="dn-status col"><div id="pg-dn-catch-status"></div><div id="pg-dn-catch-next" class="dn-help"></div></div>
                        <div class="dn-actions">
                            <button type="button" class="dn-btn dn-btn--sm" id="pg-dn-catch-skip" title="Pula a espécie da vez (fica na lista de puladas).">Pular esta</button>
                            <button type="button" class="dn-btn dn-btn--ghost dn-btn--sm" id="pg-dn-catch-refresh" title="Relê a Pokédex e a profissão no jogo.">Atualizar Pokédex</button>
                            <button type="button" class="dn-btn dn-btn--ghost dn-btn--sm" id="pg-dn-catch-unskip" title="Volta as puladas para a rota.">Limpar puladas</button>
                        </div>
                    </div>
                    <div class="dn-section">
                        <h3>Clã</h3>
                        <label class="dn-toggle"><input id="pg-dn-clan" type="checkbox"><span class="sw"></span>Fazer o clã sozinho <span class="dn-hint">(guarda os drops da tarefa, converte e entrega na viagem à cidade)</span></label>
                        <label class="dn-field"><span>Clã</span><select id="pg-dn-clan-key" class="dn-select">${Object.entries(CLAN_INFO).map(([k, c]) => `<option value="${k}">${c.name} (${c.types.join('/')})</option>`).join('')}</select></label>
                        <label class="dn-toggle"><input id="pg-dn-clan-rankup" type="checkbox"><span class="sw"></span>Subir de rank sozinho quando a tarefa fechar</label>
                        <label class="dn-toggle"><input id="pg-dn-clan-route" type="checkbox"><span class="sw"></span>Caçar o que falta <span class="dn-hint">(vai para a melhor hunt; joga a bola da rota de captura na espécie pedida)</span></label>
                        <p class="dn-help">Sem clã, o script entra no escolhido (a 1ª entrada é grátis; trocar de clã custa diamante e ele nunca faz). Os itens de clã saem de 100 do item base (ex.: 100 Small Stone = 1 Big Stone): o script não vende esses drops nem o Pokémon da espécie pedida. Converter e subir de rank vão na viagem à cidade. "Caçar o que falta" desliga a rota de treino e a de captura; a Daily tem prioridade.</p>
                        <div class="dn-status col"><div id="pg-dn-clan-status"></div><ul id="pg-dn-clan-reqs" class="dn-help"></ul><div id="pg-dn-clan-hints" class="dn-help"></div><div id="pg-dn-clan-plan" class="dn-help"></div></div>
                        <div class="dn-actions"><button type="button" class="dn-btn dn-btn--ghost dn-btn--sm" id="pg-dn-clan-refresh" title="Relê o clã e a mochila no jogo.">Atualizar clã</button></div>
                    </div>
                    <div class="dn-section">
                        <h3>Profissão</h3>
                        <div class="dn-status"><span>🎓</span><span id="pg-dn-prof-status"></span></div>
                        <p class="dn-help">"Espécies diferentes capturadas" é requisito de rank no jogo; a rota acima serve para isso. Os dados vêm de Profissões e da Pokédex do jogo.</p>
                    </div>
                </section>
                <section class="dn-pane" data-pane="breeding" hidden>
                    <div class="dn-section">
                        <h3>🥚 Breeding automático (Grátis)</h3>
                        <label class="dn-toggle"><input id="pg-dn-breed" type="checkbox"><span class="sw"></span>Cruzar, chocar com os abates da hunt e repetir <span class="dn-hint">(só o caminho Grátis; cada ovo custa 2.000.000 de gold + stones)</span></label>
                        <p class="dn-help">Quem sobe vira o ovo e o filho nasce com o IV dele e a quality dele + 0,005 a 0,04. O filho passa a ser quem sobe (geração seguinte). O script lê a incubadora a cada 2 min, choca o ovo pronto, escolhe a comida, pede uma viagem à cidade para tirar da família o que falta e cruzar, e volta para a hunt. Sem comida, stone ou gold: para, avisa no canal de Alertas e tenta de novo a cada 30 min.</p>
                        <div class="dn-status col" id="pg-dn-breed-status"></div>
                    </div>
                    <div class="dn-section">
                        <h3>🌳 Quem sobe <span class="dn-hint">· até 2 linhagens (um ovo por slot da incubadora)</span></h3>
                        <label class="dn-field"><span>Linhagem 1</span><select id="pg-dn-breed-l1" class="dn-select"></select></label>
                        <label class="dn-field"><span>Linhagem 2</span><select id="pg-dn-breed-l2" class="dn-select"></select></label>
                        <div class="dn-row"><button type="button" class="dn-btn dn-btn--sm" id="pg-dn-breed-refresh">↻ Atualizar box e família</button></div>
                        <p class="dn-help">Menu vazio = o jogo ainda não mandou a lista do box (na hunt ele costuma não responder; na cidade responde). O IV e a distribuição por stat do filho vêm do pai de MAIOR quality, por isso a comida é sempre mais fraca; quem sobe vai sempre no Slot 1 e o script confere na cotação, antes de todo cruzamento, que o IV vem dele.</p>
                        <div class="dn-status"><span class="bad">🔒 Nunca vendido</span><span class="dn-hint">quem sobe e toda a espécie dele ficam fora da venda automática e do depósito na família, mesmo com IV abaixo da tabela da aba Venda.</span></div>
                    </div>
                    <div class="dn-section">
                        <h3>🍖 Quem vira comida</h3>
                        <div class="dn-inline">Mesma espécie, com quality <b>e</b> IV menores que quem sobe, e IV abaixo de <input id="pg-dn-breed-ivmax" class="dn-input dn-input--sm" type="number" min="0" max="192"> <span class="dn-hint">(0 = sem teto)</span></div>
                        <label class="dn-toggle"><input id="pg-dn-breed-family" type="checkbox"><span class="sw"></span>Pegar da família também <span class="dn-hint">(comida e stones; a retirada acontece na viagem à cidade)</span></label>
                        <label class="dn-toggle"><input id="pg-dn-breed-double" type="checkbox"><span class="sw"></span>Dobrar stones <span class="dn-hint">(40 em vez de 20; 5% de chance de +1 IV no filho)</span></label>
                        <div class="dn-status col" id="pg-dn-breed-food"></div>
                        <p class="dn-help">O jogo só aceita par com até 0,15 de diferença de quality. Shiny, time, inicial, Ditto, travado e anunciado no mercado nunca viram comida. Usa primeiro a comida mais fraca que serve (a de quality baixa deixa de servir quando quem sobe cresce).</p>
                    </div>
                </section>
                <section class="dn-pane" data-pane="sistema" hidden>
                    <div class="dn-section">
                        <h3>Recarga do painel</h3>
                        <label class="dn-toggle"><input id="pg-dn-reload" type="checkbox"><span class="sw"></span>Recarregar automaticamente</label>
                        <div class="dn-inline">A cada <input id="pg-dn-reload-min" class="dn-input dn-input--sm" type="number" min="1" step="1"> a <input id="pg-dn-reload-max" class="dn-input dn-input--sm" type="number" min="0" step="1"> min</div>
                        <p class="dn-help">Guarda a hunt e volta pra ela após recarregar. Espera venda, troca e captura terminarem. <span title="O mesmo que o ⟳ Atualizar tudo do PokeGrid, só neste painel. A tela pode seguir mostrando a cidade enquanto o servidor farma. Cada painel sorteia o próprio horário." style="cursor:help">ⓘ</span></p>
                        <div class="dn-status"><span>⟳</span><span id="pg-dn-reload-status"></span></div>
                        <div class="dn-actions"><button type="button" class="dn-btn" id="pg-dn-reload-now" title="Guarda a hunt e volta.">Recarregar agora</button></div>
                    </div>
                    <div class="dn-section">
                        <h3>Viagem à cidade</h3>
                        <p class="dn-help">Regra do jogo: não se vende nem compra durante a hunt. As viagens são configuradas na faixa das abas Compras e Venda; aqui só a cidade e o histórico.</p>
                        <label class="dn-field"><span>Cidade</span><select id="pg-dn-trip-city" class="dn-select">${['cerulean', 'pewter', 'viridian', 'goldenrod'].map(c => `<option value="${c}">${c[0].toUpperCase()}${c.slice(1)}</option>`).join('')}</select></label>
                        <div class="dn-status"><span>🏙</span><span id="pg-dn-trip-status"></span></div>
                    </div>
                    <div class="dn-section">
                        <h3>Ferramentas</h3>
                        <div class="dn-actions">
                            <button type="button" class="dn-btn" id="pg-dn-log" title="Últimos 40 eventos, sem canais. Cole para quem for diagnosticar.">Copiar log</button>
                            <button type="button" class="dn-btn" id="pg-dn-export" title="Copia a config inteira, com os canais.">Exportar config</button>
                            <button type="button" class="dn-btn" id="pg-dn-import" title="Cola uma config exportada de outro painel.">Importar config</button>
                        </div>
                        <div id="pg-dn-import-box" class="dn-section" hidden>
                            <textarea id="pg-dn-import-text" class="dn-textarea" rows="3" placeholder="Clique aqui e cole com Ctrl+V a config exportada (no PokeGrid o botão Colar não consegue ler a área de transferência)"></textarea>
                            <p class="dn-help" id="pg-dn-import-status"></p>
                            <label class="dn-toggle"><input id="pg-dn-import-keephooks" type="checkbox"><span class="sw"></span>Manter os canais deste painel</label>
                            <div class="dn-actions"><button type="button" class="dn-btn" id="pg-dn-import-paste" title="Tenta ler a área de transferência. No PokeGrid a leitura é negada: clique na caixa e use Ctrl+V.">📋 Colar</button><button type="button" class="dn-btn dn-btn--primary" id="pg-dn-import-apply">Aplicar</button></div>
                        </div>
                        <label class="dn-toggle"><input id="pg-dn-debug" type="checkbox"><span class="sw"></span>Debug no console</label>
                        <div class="dn-status"><span class="k">v${VERSION}</span><span class="r" id="pg-dn-socket"></span></div>
                    </div>
                </section>
            </div>
            <div class="dn-foot">
                <div class="dn-msg" id="pg-dn-msg" data-kind=""></div>
                <button type="button" class="dn-btn" id="pg-dn-test" title="Salva os canais e envia uma mensagem de teste a cada um preenchido.">Testar canais</button>
                <button type="button" class="dn-btn dn-btn--primary idle" id="pg-dn-save">Salvar</button>
            </div>`;

        document.body.appendChild(btn);
        document.body.appendChild(panel);

        const $ = (id) => panel.querySelector(id);
        let dirty = false;          // algum campo editado desde o último Salvar
        let msgTimer = null;
        let resetArmed = null;      // timer da confirmação em 2 cliques do Reiniciar rota

        // ---- abas ----
        function showTab(name) {
            if (!TABS.some(t => t.id === name)) name = 'avisos';
            for (const t of panel.querySelectorAll('.dn-tab')) t.setAttribute('aria-selected', String(t.dataset.tab === name));
            for (const p of panel.querySelectorAll('.dn-pane')) p.hidden = p.dataset.pane !== name;
            if (name === 'bolas' || name === 'venda') { // a faixa da viagem é um elemento só: vai para a aba ativa
                const pane = panel.querySelector(`.dn-pane[data-pane="${name}"]`);
                const trip = $('#pg-dn-trip');
                if (trip && pane.firstElementChild !== trip) pane.insertBefore(trip, pane.firstElementChild);
            }
            saveUi({ tab: name });
        }
        for (const t of panel.querySelectorAll('.dn-tab')) t.onclick = () => showTab(t.dataset.tab);
        // blocos recolhíveis da aba Venda: um aberto por vez (lembra qual em pgDiscordNotifyUi)
        function openBlk(which) {
            for (const b of panel.querySelectorAll('.dn-blk')) b.classList.toggle('open', b.dataset.blk === which);
            saveUi({ vendaOpen: which || '' });
        }
        for (const h of panel.querySelectorAll('.dn-blk > h3')) h.addEventListener('click', (e) => {
            if (e.target.closest('label, input, button')) return;
            const blk = h.parentElement;
            openBlk(blk.classList.contains('open') ? '' : blk.dataset.blk);
        });
        openBlk(loadUi().vendaOpen != null ? loadUi().vendaOpen : 'itens');

        // ---- rodapé: mensagens por tipo e indicador de não salvo ----
        function renderDirty() {
            const m = $('#pg-dn-msg');
            m.classList.remove('wrap');
            if (dirty) { m.textContent = '● Alterações não salvas'; m.dataset.kind = 'dirty'; }
            else { m.textContent = ''; m.dataset.kind = ''; }
            m.title = '';
            $('#pg-dn-save').classList.toggle('idle', !dirty);
            renderState();
        }
        // kind: ok (some em 2,5 s) | info (4 s) | warn/error (fica até o próximo clique)
        function flash(msg, kind, ms) {
            const m = $('#pg-dn-msg');
            clearTimeout(msgTimer);
            m.textContent = msg; m.title = msg; m.dataset.kind = kind || 'info';
            m.classList.remove('wrap');
            const dur = ms || (kind === 'ok' ? 2500 : (kind === 'warn' || kind === 'error') ? 0 : 4000);
            if (dur) msgTimer = setTimeout(() => { if (m.textContent === msg) renderDirty(); }, dur);
        }
        $('#pg-dn-msg').onclick = () => $('#pg-dn-msg').classList.toggle('wrap');
        // aviso/erro persistente some no próximo clique em qualquer botão
        panel.addEventListener('click', (e) => {
            const m = $('#pg-dn-msg');
            if (e.target.closest('button') && (m.dataset.kind === 'warn' || m.dataset.kind === 'error') && e.target.id !== 'pg-dn-msg') renderDirty();
        }, true);

        // ---- leitura do formulário (rascunho no formato do cfg) ----
        function readSellList(base) {
            const out = Object.assign({}, base || cfg.sellItems || {});
            for (const row of panel.querySelectorAll('[data-item-id]')) {
                const id = Number(row.getAttribute('data-item-id'));
                const checked = row.querySelector('.pg-dn-sell-chk')?.checked;
                const keep = Math.max(0, parseInt(row.querySelector('.pg-dn-sell-keep')?.value, 10) || 0);
                if (checked) out[id] = { keep }; else delete out[id];
            }
            return out;
        }
        function readRoute() {
            const linhasRuins = [];
            const route = $('#pg-dn-route').value.split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => {
                const m = l.match(/^(\S+)\s+(\d+)$/);
                if (!m) { linhasRuins.push(l); return null; }
                return { slug: normalize(m[1]), level: parseInt(m[2], 10) };
            }).filter(r => r && r.level > 0);
            return { route, linhasRuins };
        }
        // Linhagens do breeding a partir dos dois menus: a escolha salva é mantida (com geração, Q de partida, ovo); id novo
        // começa uma linhagem nova; filho pendente escolhido no menu continua a linhagem.
        function readBreedLines() {
            const old = Array.isArray(cfg.breedLines) ? cfg.breedLines : [];
            return [1, 2].map(n => {
                const v = $(`#pg-dn-breed-l${n}`).value || '';
                const o = old[n - 1] && typeof old[n - 1] === 'object' ? Object.assign({}, old[n - 1]) : null;
                if (!v) return null;
                if (v.startsWith('egg:') || v === 'pending') return o;
                if (o && o.id != null && String(o.id) === v) return o;
                if (o && !o.id && o.pendingChild) return Object.assign(o, { id: v, pendingChild: null, gen: (Number(o.gen) || 0) + 1 });
                const p = lastPokesList.find(x => x && String(x.id) === v);
                return { id: v, gen: 0, name: p?.name || null, speciesId: Number(p?.speciesId) || null };
            });
        }
        function readForm() {
            const { route, linhasRuins } = readRoute();
            const lv = $('#pg-dn-level');
            const draft = {
                webhookUrl: $('#pg-dn-hook').value.trim(),
                webhookShiny: $('#pg-dn-hook-shiny').value.trim(),
                webhookAlerts: $('#pg-dn-hook-alerts').value.trim(),
                webhookLevel: $('#pg-dn-hook-level').value.trim(),
                // com a rota ligada o campo mostra o nível da etapa (desabilitado); o valor do usuário fica em dataset.own
                levelAlertAt: Math.max(0, parseInt(lv.disabled ? lv.dataset.own : lv.value, 10) || 0),
                levelSwap: $('#pg-dn-level-swap').checked,
                route,
                routeEnabled: $('#pg-dn-route-on').checked && route.length > 0,
                catchRouteEnabled: $('#pg-dn-catch').checked,
                catchRouteAreas: [...panel.querySelectorAll('.pg-dn-catch-area:checked')].map(c => c.value),
                catchRouteMaxLevel: Math.max(0, parseInt($('#pg-dn-catch-max').value, 10) || 0),
                catchRouteAuto: $('#pg-dn-catch-auto').checked,
                catchRouteBall: $('#pg-dn-catch-ball').value || 'auto',
                dailyEnabled: $('#pg-dn-daily').checked,
                dailyClaim: $('#pg-dn-daily-claim').checked,
                dailyAuto: $('#pg-dn-daily-auto').checked,
                giftEnabled: $('#pg-dn-gift').checked,
                evolveEnabled: $('#pg-dn-evolve').checked,
                slotEnabled: $('#pg-dn-slot').checked,
                slotWanted: $('#pg-dn-slot-wanted').value.trim(),
                breedEnabled: $('#pg-dn-breed').checked,
                breedLines: readBreedLines(),
                breedFoodIvMax: Math.max(0, Math.min(IV_MAX, parseInt($('#pg-dn-breed-ivmax').value, 10) || 0)),
                breedFamily: $('#pg-dn-breed-family').checked,
                breedDouble: $('#pg-dn-breed-double').checked,
                giftCenterMode: ['daily', 'all', ''].includes($('#pg-dn-gift-center').value) ? $('#pg-dn-gift-center').value : 'daily',
                clanEnabled: $('#pg-dn-clan').checked,
                depositItems: $('#pg-dn-dep-items').value || '',
                depositPokes: $('#pg-dn-dep-pokes').value || '',
                depositPokesRare: $('#pg-dn-dep-rare').checked,
                depositFamilyList: famListDraft.map(e => Object.assign({}, e)),
                clanKey: $('#pg-dn-clan-key').value || 'orebound',
                clanRankup: $('#pg-dn-clan-rankup').checked,
                clanRoute: $('#pg-dn-clan-route').checked,
                dailyReturnSlug: huntSlugFromName($('#pg-dn-daily-return').value),
                watchList: $('#pg-dn-list').value.split(',').map(normalize).filter(Boolean),
                notifyShiny: $('#pg-dn-shiny').checked,
                notifyEveryCapture: $('#pg-dn-all').checked,
                lockNotified: $('#pg-dn-lock').checked,
                familyNotified: $('#pg-dn-family').checked,
                minTier: $('#pg-dn-tier').value,
                minIv: Math.min(IV_MAX, Math.max(0, parseInt($('#pg-dn-miniv').value, 10) || 0)),
                minTierIv: Math.min(IV_MAX, Math.max(0, parseInt($('#pg-dn-tier-iv').value, 10) || 0)),
                ballsWatch: $('#pg-dn-ball').value || 'auto',
                ballsMin: Math.max(0, parseInt($('#pg-dn-ballsmin').value, 10) || 0),
                autoBuy: $('#pg-dn-autobuy').checked,
                autoBuyQty: Math.min(BUY_MAX_QTY, Math.max(1, parseInt($('#pg-dn-autobuy-qty').value, 10) || 100)),
                ...Object.fromEntries(SUPPLY_KINDS.flatMap(k => [
                    [k.buy, $(`#pg-dn-${k.key}-buy`).checked],
                    [k.id, Number($(`#pg-dn-${k.key}-item`).value) || k.def],
                    [k.min, Math.max(0, parseInt($(`#pg-dn-${k.key}-min`).value, 10) || 0)],
                    [k.qty, Math.min(BUY_MAX_QTY, Math.max(1, parseInt($(`#pg-dn-${k.key}-qty`).value, 10) || DEFAULTS[k.qty]))],
                ])),
                healJoyEnabled: $('#pg-dn-healjoy').checked,
                cityIdleEnabled: $('#pg-dn-cityidle').checked,
                cityIdleMin: Math.max(1, parseInt($('#pg-dn-cityidle-min').value, 10) || IDLE_MIN_DEFAULT),
                mentionUserId: $('#pg-dn-mention').value.trim(),
                cooldownSeconds: Math.max(0, parseInt($('#pg-dn-cooldown').value, 10) || 0),
                debug: $('#pg-dn-debug').checked,
                sellEnabled: $('#pg-dn-sell').checked,
                ...(() => {
                    const sd = sellCollect(), cur = sellCurSlug();
                    const perfis = Object.assign({}, cfg.sellProfiles || {});
                    for (const [k, v] of Object.entries(sd)) if (k && k !== cur) perfis[k] = Object.assign({}, perfis[k] || {}, { items: v });
                    return { sellItems: sd[cur] || Object.assign({}, cfg.sellItems || {}), sellProfiles: perfis };
                })(),
                pokeSellEnabled: $('#pg-dn-psell').checked,
                boxAlertAt: Math.max(0, parseInt($('#pg-dn-box-alert').value, 10) || 0),
                tripEveryMin: Math.max(1, parseInt($('#pg-dn-trip-min').value, 10) || 10),
                tripEveryMaxMin: Math.max(0, parseInt($('#pg-dn-trip-max').value, 10) || 0),
                pokeSellLimits: Object.fromEntries([...panel.querySelectorAll('.pg-dn-psell-lim')].map(i => [i.dataset.tier, Math.min(IV_MAX, Math.max(0, parseInt(i.value, 10) || 0))]).filter(([, v]) => v > 0)),
                tripCity: $('#pg-dn-trip-city').value || 'cerulean',
                reloadEnabled: $('#pg-dn-reload').checked,
                reloadEveryMin: Math.max(1, parseInt($('#pg-dn-reload-min').value, 10) || 60),
                reloadEveryMaxMin: Math.max(0, parseInt($('#pg-dn-reload-max').value, 10) || 0),
            };
            return { draft, linhasRuins };
        }
        // Com o painel aberto os badges refletem o que está na tela; fechado, o que está salvo.
        function current() { return panel.hidden ? cfg : readForm().draft; }

        // ---- estado de relance: badges das abas, pontos do cabeçalho, ponto do 🔔 ----
        function renderState() {
            const d = current();
            const states = {};
            for (const t of TABS) {
                states[t.id] = moduleState(t.id, d);
                panel.querySelector(`.dn-tab[data-tab="${t.id}"] .b`).dataset.state = states[t.id];
                panel.querySelector(`.dn-dots i[data-tab="${t.id}"]`).dataset.state = states[t.id];
            }
            const vals = Object.values(states);
            const dot = document.getElementById('pg-dn-dot');
            dot.dataset.state = vals.includes('danger') ? 'danger' : (vals.includes('warn') || dirty) ? 'warn' : vals.includes('on') ? 'ok' : '';
            const resumo = stateSummary(d) + (dirty ? ' · ● alterações não salvas' : '') + (states.avisos === 'danger' ? ' · ⚠ sem canal de Capturas' : '');
            btn.title = resumo;
            $('#pg-dn-dots').title = resumo;
        }

        // ---- Avisos ----
        function setChanOpen(open) {
            $('#pg-dn-chan-box').hidden = !open;
            $('#pg-dn-chan-toggle').textContent = open ? 'recolher' : 'editar';
        }
        $('#pg-dn-chan-toggle').onclick = () => setChanOpen($('#pg-dn-chan-box').hidden);
        function renderChannels() {
            const has = (id) => Boolean($('#pg-dn-' + id).value.trim());
            const el = $('#pg-dn-chan-summary');
            if (!has('hook')) { el.innerHTML = '<span class="dn-err-t">⚠ Cole o webhook do canal de Capturas para começar.</span>'; return; }
            el.innerHTML = [['hook', 'Capturas'], ['hook-shiny', 'Shinys'], ['hook-alerts', 'Alertas'], ['hook-level', 'Nível']]
                .map(([id, n]) => `<span><b>${n}</b> ${has(id) ? '✔' : '—'}</span>`).join('');
        }
        function renderQuality() {
            const tier = tierByKey($('#pg-dn-tier').value);
            const tierIv = parseInt($('#pg-dn-tier-iv').value, 10) || 0;
            const minIv = parseInt($('#pg-dn-miniv').value, 10) || 0;
            const parts = [];
            if (tier) parts.push(`${tier.name}+${tierIv ? ` com poder ≥ ${tierIv}` : ''}`);
            if (minIv) parts.push(`qualquer raridade com poder ≥ ${minIv}`);
            let txt = parts.length ? `Avisa: ${parts.join(', ou ')}.` : 'Avisa: tudo que passar pela lista de nomes.';
            if ($('#pg-dn-shiny').checked) txt += ' Shiny avisa sempre.';
            $('#pg-dn-q-summary').textContent = txt;
        }

        // ---- Bolas ----
        function renderBalls() {
            const d = current();
            const min = Number(d.ballsMin) || 0;
            $('#pg-dn-autobuy-warn').hidden = !(d.autoBuy && !min);
            const el = $('#pg-dn-balls-status');
            const id = d.ballsWatch && d.ballsWatch !== 'auto' ? Number(d.ballsWatch) : lastBallId;
            const qty = ballQty(id);
            if (!(min > 0 || d.autoBuy)) el.innerHTML = '<span>🎯</span><span class="k">Alerta desligado.</span>';
            else if (id == null) el.innerHTML = '<span>🎯</span><span class="k">Bola em uso ainda não vista: capture algo.</span>';
            else if (qty == null) el.innerHTML = `<span>🎯</span><span><span class="k">${escHtml(ballName(id))}:</span> estoque ainda não lido</span>`;
            else el.innerHTML = `<span>🎯</span><span><span class="k">${escHtml(ballName(id))}:</span> ${fmtNum(qty)} em estoque</span>${qty < (min || 1) ? '<span class="r" style="color:var(--dn-warn)">abaixo do limite</span>' : ''}`;
        }
        onBallsChange = () => { if (!panel.hidden) renderBalls(); };

        // ---- Poções e revives ----
        function renderSupply() {
            const d = current();
            for (const k of SUPPLY_KINDS) {
                const el = $(`#pg-dn-${k.key}-status`);
                const s = supplySlots(d).find(x => x.key === k.key);
                const id = s ? s.itemId : (Number(d[k.id]) || k.def);
                const qty = supplyQty(id);
                if (!s) el.innerHTML = `<span>${k.icon}</span><span class="k">Refil desligado${qty != null ? ` · ${escHtml(supplyItemName(id))}: ${fmtNum(qty)} na mochila` : ''}.</span>`;
                else if (qty == null) el.innerHTML = `<span>${k.icon}</span><span><span class="k">${escHtml(s.name)}:</span> mochila ainda não lida</span>`;
                else el.innerHTML = `<span>${k.icon}</span><span><span class="k">${escHtml(s.name)}:</span> ${fmtNum(qty)} na mochila</span>${qty < s.min ? '<span class="r" style="color:var(--dn-warn)">abaixo do limite: compra na viagem</span>' : ''}`;
            }
        }
        onSupplyChange = () => { if (!panel.hidden) renderSupply(); };

        // ---- Nurse Joy ----
        function renderHeal() {
            const d = current();
            const txt = d.healJoyEnabled && !cfg.healJoyEnabled ? 'ligada ao salvar' : healStatus();
            $('#pg-dn-healjoy-status').innerHTML = `<span>💊</span><span><span class="k">Cura:</span> ${escHtml(txt)}</span>`;
        }
        onHealChange = () => { if (!panel.hidden) renderHeal(); };

        // ---- Parada na cidade ----
        function renderIdle() {
            $('#pg-dn-cityidle-status').innerHTML = `<span>🏙️</span><span><span class="k">Volta:</span> ${escHtml(idleStatus(current()))}</span>`;
        }
        onIdleChange = () => { if (!panel.hidden) renderIdle(); };

        // ---- Venda ----
        // Hunt vista na lista de venda ('' = a atual). Outra hunt = edita o perfil dela (cfg.sellProfiles[slug]); marcações
        // não salvas de cada hunt ficam em sellDrafts até o Salvar, para trocar de hunt na lista sem perder nada.
        let sellView = '';
        let sellDrafts = {};
        let sellCatLoading = false;
        function sellCurSlug() { return huntSlug ? normalize(huntSlug) : ''; }
        function sellViewSlug() { return sellView || sellCurSlug(); }
        function sellIsCurrent(slug) { return !slug || slug === sellCurSlug(); }
        function sellBase(slug) { return sellIsCurrent(slug) ? (cfg.sellItems || {}) : (cfg.sellProfiles?.[slug]?.items || {}); }
        function sellCollect() {
            const out = Object.assign({}, sellDrafts);
            const v = sellViewSlug();
            out[v] = readSellList(sellDrafts[v] || sellBase(v));
            return out;
        }
        function rerenderSell() { renderSellList(dirty ? sellCollect()[sellViewSlug()] : null); }
        function switchSellView(slug) {
            if (dirty) { const v = sellViewSlug(); sellDrafts[v] = readSellList(sellDrafts[v] || sellBase(v)); }
            sellView = slug && slug !== sellCurSlug() ? slug : '';
            $('#pg-dn-sell-view').value = sellView;
            renderSellList(sellDrafts[sellViewSlug()] || null);
        }
        function fillSellViewList() {
            if (!Array.isArray(huntCatalog) || $('#pg-dn-sell-view-dl').childElementCount) return;
            $('#pg-dn-sell-view-dl').innerHTML = huntCatalog.map(h => `<option value="${escHtml(h.slug)}">${escHtml(h.name)} · lv ${h.level}</option>`).join('');
        }
        function renderSellList(sel) {
            const box = $('#pg-dn-sell-list');
            const info = $('#pg-dn-sell-hunt');
            const slug = sellViewSlug();
            const atual = sellIsCurrent(slug);
            sel = sel || sellDrafts[slug] || sellBase(slug);
            if ((!Array.isArray(huntCatalog) || !itemsCatalog) && !sellCatLoading) {
                sellCatLoading = true;
                Promise.all([loadHuntCatalog().catch(() => null), loadItemsCatalog()])
                    .then(() => { sellCatLoading = false; fillSellViewList(); if (!panel.hidden) rerenderSell(); });
            }
            fillSellViewList();
            const temPerfil = Boolean(slug && cfg.sellProfiles && cfg.sellProfiles[slug]);
            info.innerHTML = slug
                ? `<span>💰</span><span><span class="k">Hunt:</span> ${escHtml(slug)}${atual ? ' (a atual)' : ' · outra hunt: o Salvar grava a lista dela, que vale quando a conta entrar lá'} · ${temPerfil ? 'perfil salvo' : 'sem perfil (Salvar cria)'}</span>`
                : '<span>💰</span><span class="k">Fora de hunt. Escolha uma hunt no campo acima para montar a lista, ou entre numa.</span>';
            const tabela = slug && Array.isArray(huntCatalog) && itemsCatalog ? huntLootTable(slug, itemsCatalog) : [];
            const porId = new Map(tabela.map(t => [t.id, t]));
            const ids = atual ? [...huntLoot.keys()] : [];
            for (const t of tabela) if (!ids.includes(t.id)) ids.push(t.id);
            for (const k of Object.keys(sel)) { const id = Number(k); if (id > 0 && !ids.includes(id)) ids.push(id); } // marcado de antes, fora da tabela
            if (!ids.length) {
                box.innerHTML = `<p class="dn-help">${!slug ? 'Nenhuma hunt escolhida.' : sellCatLoading ? 'Carregando a tabela de drops do jogo…' : `Sem tabela de drops para ${escHtml(slug)} e nenhum drop visto ainda.`}</p>`;
                renderSellCount();
                return;
            }
            box.innerHTML = ids.map(id => {
                const loot = atual ? huntLoot.get(id) : null;
                const t = porId.get(id) || null;
                const item = itemsCatalog?.get(id) || null;
                const nome = loot?.name || t?.name || item?.name || `Item ${id}`;
                const motivo = protectedReason(item);
                const aviso = sellWarning(item);
                const s = sel[id];
                const price = item ? Number(item.npcPrice) || 0 : null;
                const qtd = loot ? `×${fmtNum(loot.qty)}` : (atual ? 'ainda não caiu' : '');
                const chance = t ? (t.chance != null ? `${Math.round(t.chance * 1000) / 10}% · ${t.min}${t.max > t.min ? `–${t.max}` : ''}/abate` : 'drop raro') : '';
                const extra = [qtd, chance, price != null ? `${fmtNum(price)} gold` : ''].filter(Boolean).join(' · ');
                if (motivo) {
                    return `<div class="dn-item locked" title="Protegido: ${escHtml(motivo)}"><span>🔒</span><span class="nm">${escHtml(nome)} <span class="q">${escHtml(extra)}</span></span><span class="q">${escHtml(motivo)}</span></div>`;
                }
                return `<label class="dn-item${s ? ' on' : ''}${loot || !atual ? '' : ' faltou'}" data-item-id="${id}">
                    <input type="checkbox" class="pg-dn-sell-chk" ${s ? 'checked' : ''}>
                    <span class="nm">${escHtml(nome)} <span class="q">${escHtml(extra)}</span>${aviso ? ` <span class="w" title="Atenção: ${escHtml(aviso)}">⚠ ${escHtml(aviso)}</span>` : ''}</span>
                    <span class="keep" title="Quantidade que fica na mochila">manter <input type="number" class="dn-input pg-dn-sell-keep" min="0" step="1" value="${s ? (Number(s.keep) || 0) : 0}"></span>
                </label>`;
            }).join('');
            for (const chk of box.querySelectorAll('.pg-dn-sell-chk')) chk.addEventListener('change', () => chk.closest('.dn-item').classList.toggle('on', chk.checked));
            renderSellCount();
        }
        $('#pg-dn-sell-view').addEventListener('change', () => {
            const v = $('#pg-dn-sell-view').value.trim();
            if (!v) { switchSellView(''); return; }
            const slug = huntSlugFromName(v);
            const existe = (Array.isArray(huntCatalog) && huntCatalog.some(h => h.slug === slug)) || Boolean(cfg.sellProfiles?.[slug]);
            if (!existe) { flash(`⚠ Não achei a hunt "${v}". Use o nome ou o slug da lista.`, 'warn', 6000); $('#pg-dn-sell-view').value = sellView; return; }
            switchSellView(slug);
        });
        $('#pg-dn-sell-view').addEventListener('focus', fillSellViewList);
        $('#pg-dn-sell-view-cur').onclick = () => switchSellView('');
        function renderSellCount() {
            const n = panel.querySelectorAll('.pg-dn-sell-chk:checked').length;
            const b = $('#pg-dn-sell-count');
            b.textContent = n ? `${n} marcados` : 'nenhum marcado';
            b.dataset.state = n ? 'on' : ($('#pg-dn-sell').checked ? 'warn' : '');
            $('#pg-dn-sum-itens').textContent = `· ${n ? `${n} marcados` : 'nenhum marcado'}${sellViewSlug() ? ` · ${sellViewSlug()}` : ''}${$('#pg-dn-sell').checked ? '' : ' · desligado'}`;
        }
        // Drop novo chega com o painel aberto: redesenha sem perder o que o usuário marcou e ainda não salvou.
        onHuntLootChange = () => { if (!panel.hidden) rerenderSell(); };
        // Pokémon fora do time: prévia com as regras da tela (o que seria vendido agora)
        function renderPokeSell() {
            const d = current();
            const st = $('#pg-dn-psell-status'), ls = $('#pg-dn-psell-list');
            const nLim = TIERS.filter(t => pokeSellLimit(d, t.key) > 0).length;
            const sum = $('#pg-dn-sum-pokes');
            const est = boxEstimate();
            const boxTxt = est != null ? ` · box ~${est}${boxLimit(d) ? `/${boxLimit(d)}` : ''}${boxMaxSeen ? ` (maior lista lida: ${boxMaxSeen})` : ''}` : '';
            const filaTxt = captureQueue.length ? ` · fila do plano B: ${captureQueue.length}` : '';
            if (!lastPokesList.length) { st.textContent = `Lista de Pokémon ainda não lida.${boxTxt}${filaTxt}${captureQueue.length ? ' (sem a lista, a viagem vende pela fila)' : ''}`; ls.innerHTML = ''; sum.textContent = `· ${nLim} raridades com limite${d.pokeSellEnabled ? '' : ' · desligado'}`; return; }
            const fora = lastPokesList.filter(p => !p.team && !p.leader);
            const linhas = fora.map(p => ({ p, motivo: pokeSellReason(p, d), t: qualityTier(Number(p.quality)) }))
                .sort((a, b) => (a.motivo ? 1 : 0) - (b.motivo ? 1 : 0) || (b.t?.rank ?? -1) - (a.t?.rank ?? -1));
            const cand = linhas.filter(l => !l.motivo);
            const gold = cand.reduce((s, l) => s + (Number(l.p.sellValue) || 0), 0);
            st.textContent = `${fora.length} fora do time · ${cand.length} ${d.pokeSellEnabled ? 'serão vendidos' : 'dentro das regras (desligado)'}${gold ? ` · ~${fmtNum(gold)} gold` : ''}${boxTxt}${filaTxt}`;
            sum.textContent = `· ${nLim} raridades com limite · ${cand.length} ${cand.length === 1 ? 'seria vendido' : 'seriam vendidos'}${d.pokeSellEnabled ? '' : ' · desligado'}`;
            ls.innerHTML = linhas.slice(0, 40).map(l => `<tr class="${l.motivo ? 'keep' : 'sell'}"><td>${escHtml(l.p.name || '?')} <span class="k">lv${Number(l.p.level) || 0}</span></td><td style="color:#${(l.t?.color ?? 0x9aa4b2).toString(16).padStart(6, '0')}">${l.t ? l.t.name : '?'}</td><td class="n">${Number.isFinite(Number(l.p.ivTotal)) ? Number(l.p.ivTotal) : '?'}</td><td class="why">${l.motivo ? escHtml(l.motivo) : '✔ vende'}</td></tr>`).join('')
                + (linhas.length > 40 ? `<tr class="keep"><td colspan="4">… e mais ${linhas.length - 40}</td></tr>` : '');
        }
        onPokeSellChange = () => { if (!panel.hidden) renderPokeSell(); };
        $('#pg-dn-psell-refresh').onclick = () => {
            lastPokesReqAt = 0;
            const ok = sendGame({ type: 'pokes-get' });
            flash(ok ? '📥 Pedi a lista de Pokémon ao jogo…' : '✖ Sem socket do jogo ainda. Recarregue o painel.', ok ? 'info' : 'error', 3000);
        };

        // ---- Treino ----
        function renderLevelField() {
            const lv = $('#pg-dn-level');
            const { route } = readRoute();
            const on = $('#pg-dn-route-on').checked && route.length > 0;
            const st = Math.min(Number(cfg.routeStage) || 0, route.length - 1);
            if (on) {
                if (!lv.disabled) lv.dataset.own = lv.value;
                lv.disabled = true;
                lv.value = route[Math.max(0, st)].level;
                $('#pg-dn-level-help').textContent = 'Vem da etapa atual da rota. Desligue "Seguir a rota" para editar.';
            } else {
                if (lv.disabled) { lv.disabled = false; lv.value = lv.dataset.own || 0; }
                $('#pg-dn-level-help').textContent = 'Se o líder já estiver no nível ao salvar, avisa e troca na hora.';
            }
        }
        function renderTeam() {
            const alvo = levelTarget();
            $('#pg-dn-team').innerHTML = team.length
                ? `<span class="k">Time:</span> ${team.map(p => `${p.leader ? '★ ' : ''}${p.shiny ? '✨' : ''}${escHtml(p.name)} ${p.level}${alvo && p.level >= alvo ? ' ✔' : ''}`).join(' · ')}`
                : '<span class="k">Time ainda não lido. O jogo só responde na cidade: vem na próxima viagem (ou quando o líder subir de nível).</span>';
        }
        function renderRoute() {
            const lines = $('#pg-dn-route').value.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
            const valid = lines.filter(l => /^(\S+)\s+(\d+)$/.test(l));
            const saved = JSON.stringify(readRoute().route) === JSON.stringify(routeList());
            const cur = saved ? (Number(cfg.routeStage) || 0) : 0; // rota editada recomeça da 1ª etapa ao salvar
            const list = $('#pg-dn-route-list');
            let vi = 0;
            list.innerHTML = lines.map(l => {
                const m = l.match(/^(\S+)\s+(\d+)$/);
                if (!m) return `<li class="bad"><span class="m">✖</span><span>${escHtml(l)}</span><span class="hint">use "hunt nível"</span></li>`;
                const i = vi++;
                const cls = i < cur ? 'done' : i === cur ? 'cur' : '';
                const mark = i < cur ? '✔' : i === cur ? '▶' : '';
                const hint = i === cur ? `<span class="hint">atual${huntSlug ? ` · hunt: ${escHtml(huntSlug)}` : ''}</span>` : '';
                return `<li class="${cls}"><span class="m">${mark}</span><span>${escHtml(m[1])} → nível ${m[2]}</span>${hint}</li>`;
            }).join('');
            const on = $('#pg-dn-route-on').checked;
            let st;
            if (!valid.length) st = on ? '<span class="dn-err-t">Sem etapas: a rota fica desligada.</span>' : '<span class="k">Sem rota.</span>';
            else if (cur >= valid.length) st = `<span class="k">Rota ·</span> concluída (${valid.length} etapas). Reiniciar para começar de novo.`;
            else st = `<span class="k">Rota${on ? '' : ' (desligada)'} ·</span> etapa ${cur + 1} de ${valid.length}${!saved ? ' <span class="k">(recomeça ao salvar)</span>' : ''}`;
            const passo = routeStep();
            const go = passo && normalize(huntSlug || '') !== passo.slug
                ? ` <button type="button" class="dn-btn dn-btn--ghost dn-btn--sm" id="pg-dn-route-go" title="Manda a conta para a hunt da etapa atual (leave-hunt + enter-hunt).">→ ir para ${escHtml(passo.slug)}</button>`
                : '';
            $('#pg-dn-route-status').innerHTML = st + go;
            const goBtn = $('#pg-dn-route-go');
            if (goBtn) goBtn.onclick = () => { switchHunt(passo.slug, 1, 'painel'); flash(`⏳ Entrando em ${passo.slug}… (confirmo pelo combate em até 30 s)`, 'info', 8000); };
            renderLevelField();
        }
        onTeamChange = () => { if (!panel.hidden) { renderTeam(); renderRoute(); } };
        function renderDaily() {
            const d = current();
            $('#pg-dn-daily-status').textContent = d.dailyEnabled ? `Daily: ${dailyStatus(d)}` : 'Daily desligada';
        }
        onDailyChange = () => { if (!panel.hidden) renderDaily(); };
        function renderGift() {
            const d = current();
            $('#pg-dn-gift-status').textContent = d.giftEnabled ? `Daily Gift: ${giftStatus(d)}` : 'Daily Gift desligado';
        }
        onGiftChange = () => { if (!panel.hidden) renderGift(); };
        function renderEvolve() {
            const d = current();
            $('#pg-dn-evolve-status').textContent = `Evolução${d.evolveEnabled ? '' : ' (desligada)'}: ${evolveStatus(d)}`;
        }
        onEvolveChange = () => { if (!panel.hidden) renderEvolve(); };
        function renderSlot() {
            const d = current();
            $('#pg-dn-slot-status').textContent = `Slot Machine${d.slotEnabled ? '' : ' (desligada)'}: ${slotStatus(d)}`;
        }
        onSlotChange = () => { if (!panel.hidden) renderSlot(); };
        // ---- Breeding (v3.29.0) ----
        const breedEsc = (v) => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        function breedBoxOptions() {
            return lastPokesList.filter(p => p && !p.team && !p.leader && !p.starter && !p.shiny && Number.isFinite(Number(p.quality)) && Number.isFinite(Number(p.ivTotal)))
                .sort((a, b) => Number(b.ivTotal) - Number(a.ivTotal) || Number(b.quality) - Number(a.quality))
                .map(p => ({ id: String(p.id), label: `${p.name} · Q ${Number(p.quality).toFixed(3)} · IV ${p.ivTotal}/${IV_MAX} · lv${Number(p.level) || 0}` }));
        }
        function renderBreedSelects() {
            const opts = breedBoxOptions();
            const lines = Array.isArray(cfg.breedLines) ? cfg.breedLines : [];
            for (const n of [1, 2]) {
                const sel = $(`#pg-dn-breed-l${n}`);
                const atual = sel.dataset.ready ? sel.value : null;   // conserva a escolha ainda não salva
                const line = lines[n - 1] && typeof lines[n - 1] === 'object' ? lines[n - 1] : null;
                const html = ['<option value="">— nenhum —</option>'];
                if (line && !line.id && line.eggId) html.push(`<option value="egg:${breedEsc(line.eggId)}">🥚 ${breedEsc(line.name || 'ovo')} chocando (geração ${(Number(line.gen) || 0) + 1})</option>`);
                if (line && !line.id && !line.eggId && line.pendingChild) html.push(`<option value="pending">⚠ ${breedEsc(line.name || '?')}: filho não identificado — escolha abaixo</option>`);
                for (const o of opts) html.push(`<option value="${breedEsc(o.id)}">${breedEsc(o.label)}</option>`);
                const want = atual != null ? atual : (line ? (line.id ? String(line.id) : (line.eggId ? `egg:${line.eggId}` : (line.pendingChild ? 'pending' : ''))) : '');
                if (want && !html.some(h => h.includes(`value="${breedEsc(want)}"`))) html.splice(1, 0, `<option value="${breedEsc(want)}">${breedEsc(line?.name || want)} (não está no box)</option>`);
                sel.innerHTML = html.join('');
                sel.value = want;
                sel.dataset.ready = '1';
            }
        }
        function renderBreed() {
            const d = current();
            renderBreedSelects();
            $('#pg-dn-breed-status').innerHTML = breedStatus(d).map(l => `<div>${breedEsc(l)}</div>`).join('') || '<div class="dim">—</div>';
            const linhas = breedFoodStatus(d);
            $('#pg-dn-breed-food').innerHTML = linhas.length ? linhas.map(l => `<div class="${l.ok ? 'ok' : 'dim'}">${breedEsc(l.text)}</div>`).join('') : '<div class="dim">Escolha quem sobe para ver a comida.</div>';
        }
        onBreedChange = () => { if (!panel.hidden) renderBreed(); };
        $('#pg-dn-breed-refresh').onclick = () => {
            lastPokesReqAt = 0;
            const ok = sendGame({ type: 'pokes-get' });
            const fam = current().breedFamily ? sendGame({ type: 'family-get' }) : null;
            logEvent('pokes-get', { motivo: 'botão Atualizar box (breeding)', hunt: huntSlug || null, enviado: ok, familia: fam });
            flash(ok ? 'Pedi a lista do box ao jogo (na hunt ele pode não responder; na cidade responde).' : 'Socket do jogo não rastreado.', ok ? 'info' : 'warn');
            if (cfg.breedEnabled) setTimeout(() => breedTick(true), 1500);
        };
        $('#pg-dn-team-refresh').onclick = () => {
            lastPokesReqAt = 0;
            const ok = sendGame({ type: 'pokes-get' });
            const naHunt = Boolean(normalize(huntSlug || '')) && !CITY_SLUGS.includes(normalize(huntSlug || ''));
            logEvent('pokes-get', { motivo: 'botão Atualizar time', naHunt, hunt: huntSlug || null, nuncaLida: !team.length, enviado: ok });
            if (ok && naHunt) flash('📥 Pedi o time ao jogo… Na hunt o jogo costuma NÃO responder: a lista chega quando o líder sobe de nível ou na próxima viagem à cidade (o script pede lá).', 'info', 8000);
            else if (ok) flash('📥 Pedi o time ao jogo…', 'info', 3000);
            else flash('✖ Sem socket do jogo ainda. Recarregue o painel.', 'error');
        };
        $('#pg-dn-route-reset').onclick = () => {
            const b = $('#pg-dn-route-reset');
            if (!routeList().length) { flash('⚠ Nenhuma rota salva.', 'warn'); return; }
            if (!resetArmed) {
                b.textContent = 'Clique de novo para confirmar';
                flash(`⚠ Reiniciar volta à 1ª etapa (${routeList()[0].slug} ${routeList()[0].level}).`, 'warn');
                resetArmed = setTimeout(() => { resetArmed = null; b.textContent = 'Reiniciar rota'; renderDirty(); }, 3000);
                return;
            }
            clearTimeout(resetArmed); resetArmed = null; b.textContent = 'Reiniciar rota';
            cfg.routeStage = 0;
            saveCfg(cfg);
            levelAlerted.clear(); swapPending = null;
            renderTeam(); renderRoute();
            lastPokesReqAt = 0; requestPokes(0);
            flash(`✔ Rota reiniciada · etapa 1 de ${routeList().length} (${routeList()[0].slug} ${routeList()[0].level})`, 'ok', 5000);
        };

        // ---- Rotas nomeadas: menu de troca, nova, renomear, excluir (agem na hora; só o texto das etapas passa pelo Salvar) ----
        function routeOptionLabel(name) {
            const r = cfg.routes?.[name] || {};
            const lista = (Array.isArray(r.route) ? r.route : []).filter(x => x && x.slug && Number(x.level) > 0);
            const st = Number(r.stage) || 0;
            const prog = !lista.length ? 'vazia' : st >= lista.length ? 'concluída' : `etapa ${st + 1}/${lista.length}: ${lista[st].slug}`;
            return `${name} · ${prog}`;
        }
        function renderRouteSelect() {
            const sel = $('#pg-dn-route-sel');
            const nomes = routeNames();
            sel.innerHTML = nomes.length
                ? nomes.map(n => `<option value="${escHtml(n)}">${escHtml(routeOptionLabel(n))}</option>`).join('')
                : '<option value="">— nenhuma rota salva: digite as etapas e Salve —</option>';
            sel.value = cfg.routeName || '';
            $('#pg-dn-route-rename').disabled = $('#pg-dn-route-del').disabled = !cfg.routeName;
        }
        // O que está na tela pertence à rota atual: com edição pendente, salva antes de trocar/criar/excluir.
        function saveIfDirty() { if (!dirty) return false; $('#pg-dn-save').click(); return true; }
        $('#pg-dn-route-sel').onchange = () => {
            const name = $('#pg-dn-route-sel').value;
            if (!name || name === cfg.routeName) return;
            const salvou = saveIfDirty();
            if (!activateRoute(name)) { renderRouteSelect(); flash('✖ Rota não encontrada.', 'error'); return; }
            dirty = false; fill();
            const passo = routeStep();
            const onde = passo ? ` · etapa ${(Number(cfg.routeStage) || 0) + 1}/${routeList().length}: ${passo.slug} até lv ${passo.level}` : routeList().length ? ' · concluída' : ' · sem etapas: digite e Salve';
            flash(`${salvou ? '✔ Salvo · ' : '✔ '}Rota "${name}" ativa${onde}${cfg.routeEnabled ? '' : ' · "Seguir a rota" está desligado'}`, 'ok', 6000);
        };
        let nameMode = null;        // 'new' | 'rename'
        function openNameBox(mode) {
            nameMode = mode;
            $('#pg-dn-route-name-box').hidden = false;
            $('#pg-dn-route-name-lbl').textContent = mode === 'rename' ? `Novo nome para "${cfg.routeName}"` : 'Nome da nova rota (ex.: o Pokémon que vai upar)';
            $('#pg-dn-route-name').value = mode === 'rename' ? cfg.routeName : '';
            $('#pg-dn-route-name').focus();
        }
        function closeNameBox() { nameMode = null; $('#pg-dn-route-name-box').hidden = true; }
        $('#pg-dn-route-new').onclick = () => openNameBox('new');
        $('#pg-dn-route-rename').onclick = () => { if (cfg.routeName) openNameBox('rename'); };
        $('#pg-dn-route-name-cancel').onclick = closeNameBox;
        $('#pg-dn-route-name').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); $('#pg-dn-route-name-ok').click(); }
            else if (e.key === 'Escape') { e.stopPropagation(); closeNameBox(); }
        });
        $('#pg-dn-route-name-ok').onclick = () => {
            const name = $('#pg-dn-route-name').value.trim();
            if (!name) { flash('⚠ Dê um nome para a rota.', 'warn'); return; }
            if (cfg.routes?.[name] && name !== cfg.routeName) { flash(`⚠ Já existe uma rota chamada "${name}".`, 'warn'); return; }
            if (nameMode === 'rename') {
                const antigo = cfg.routeName;
                closeNameBox();
                if (name === antigo) return;
                renameRoute(antigo, name); renderRouteSelect(); renderState();
                flash(`✔ Rota "${antigo}" agora se chama "${name}".`, 'ok', 4000);
                return;
            }
            const salvou = saveIfDirty();
            closeNameBox();
            createRoute(name, []);
            dirty = false; fill();
            $('#pg-dn-route').focus();
            flash(`${salvou ? '✔ Salvo · ' : '✔ '}Rota "${name}" criada e ativa. Digite as etapas (ou importe do PIW Tools) e Salve.`, 'ok', 7000);
        };
        let delArmed = null;        // timer da confirmação em 2 cliques do Excluir
        $('#pg-dn-route-del').onclick = () => {
            const b = $('#pg-dn-route-del');
            if (!cfg.routeName) return;
            if (!delArmed) {
                b.textContent = 'confirmar 🗑';
                flash(`⚠ Excluir a rota "${cfg.routeName}"? Clique de novo em 🗑.`, 'warn');
                delArmed = setTimeout(() => { delArmed = null; b.textContent = '🗑'; renderDirty(); }, 3000);
                return;
            }
            clearTimeout(delArmed); delArmed = null; b.textContent = '🗑';
            saveIfDirty();
            const nome = cfg.routeName;
            deleteRoute(nome);
            dirty = false; fill();
            flash(`✔ Rota "${nome}" excluída${cfg.routeName ? ` · ativa agora: "${cfg.routeName}"` : ' · sem rota'}.`, 'ok', 5000);
        };

        // ---- Importar rota do PIW Tools (https://piwtools.com.br/hunt, aba "Rota otimizada") ----
        // O texto copiado da página vem em blocos: "<Pokémon>", "De", "<n>", "Até", "<n>", "Hunt desta etapa",
        // "<hunt>", "Lv. <n>", golpe, XP/h... Só De/Até/Hunt interessam. O nível de cada etapa da NOSSA rota é
        // o "De" da etapa seguinte (quando o time chega lá, troca de hunt); na última, o "Até".
        const PIWTOOLS_URL = 'https://piwtools.com.br/hunt';
        function parsePiwToolsRoute(text) {
            const lines = String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
            const steps = [], avisos = [];
            for (let i = 0; i < lines.length; i++) {
                if (!/^de$/i.test(lines[i])) continue;
                const from = parseInt(lines[i + 1], 10);
                const j = lines.findIndex((l, k) => k > i && /^at[eé]$/i.test(l));
                const to = j > 0 ? parseInt(lines[j + 1], 10) : NaN;
                const h = lines.findIndex((l, k) => k > i && /^hunt desta etapa$/i.test(l));
                const hunt = h > 0 ? (lines[h + 1] || '') : '';
                const poke = i > 0 ? lines[i - 1] : '';
                if (!Number.isFinite(from) || !Number.isFinite(to) || !hunt || /^de$/i.test(hunt)) {
                    avisos.push(`bloco perto de "${lines[i - 1] || lines[i + 1] || '?'}" sem De/Até/Hunt`);
                    continue;
                }
                steps.push({ poke, from, to, hunt, slug: huntSlugFromName(hunt) });
                i = h;
            }
            const route = steps.map((st, k) => ({ slug: st.slug, level: k + 1 < steps.length ? steps[k + 1].from : st.to }));
            const evolucoes = steps.filter((st, k) => k > 0 && st.poke && normalize(st.poke) !== normalize(steps[k - 1].poke)).map(st => `${st.poke} a partir do nível ${st.from}`);
            return { steps, route, avisos, evolucoes };
        }
        $('#pg-dn-route-import').onclick = () => {
            const box = $('#pg-dn-route-import-box');
            box.hidden = !box.hidden;
            if (!box.hidden) { $('#pg-dn-route-import-text').value = ''; $('#pg-dn-route-import-text').focus(); }
        };
        $('#pg-dn-route-import-apply').onclick = () => {
            const r = parsePiwToolsRoute($('#pg-dn-route-import-text').value);
            logEvent('rota-import', { etapas: r.route, avisos: r.avisos, evolucoes: r.evolucoes });
            if (!r.route.length) { flash('✖ Não achei etapas "De / Até / Hunt desta etapa" no texto colado.', 'error'); return; }
            $('#pg-dn-route').value = r.route.map(x => `${x.slug} ${x.level}`).join('\n');
            $('#pg-dn-route-import-box').hidden = true;
            dirty = true; renderDirty(); renderLive();
            const extra = (r.evolucoes.length ? ` · evolui: ${r.evolucoes.join(', ')} (o script não evolui; faça no jogo)` : '')
                + (r.avisos.length ? ` · ⚠ ${r.avisos.length} bloco(s) ignorado(s)` : '');
            flash(`✔ ${r.route.length} etapas importadas: ${r.route.map(x => `${x.slug} ${x.level}`).join(' · ')}${extra}. Salve para valer.`, r.avisos.length ? 'warn' : 'ok', 12000);
        };
        $('#pg-dn-route-piwlink').onclick = () => {
            const lider = teamLeader();
            const q = new URLSearchParams({ tab: 'route', routeTarget: String(Math.max(levelTarget() || 0, (lider?.level || 1) + 50, 100)) });
            if (lider?.name) { q.set('pokemon', normalize(lider.name)); q.set('level', String(lider.level || 1)); }
            const url = `${PIWTOOLS_URL}?${q.toString()}`;
            copyText(url).then(ok => flash(ok ? `✔ Link copiado${lider?.name ? ` (${lider.name} nível ${lider.level})` : ' (time ainda não lido: escolha o Pokémon no site)'}. Abra no navegador, copie as etapas e use "Importar do PIW Tools".` : `⚠ Não copiou. Link: ${url}`, ok ? 'ok' : 'warn', 9000));
        };

        // ---- Exportar / importar SÓ a rota de treino (v3.27.0): para levar uma rota a outra conta sem mexer no
        // resto da config. Formato: { _piwDiscordNotifyRoute: 1, _versao, _exportadoEm, _conta, name, route:[{slug, level}] }.
        // O Exportar leva o que está NA TELA (texto das etapas, mesmo sem salvar) com o nome da rota ativa. O Importar
        // cria a rota com o nome que veio (se já existe uma com esse nome, troca as etapas dela, como os perfis de venda)
        // e a deixa ativa a partir da 1ª etapa; não liga "Seguir a rota" sozinho. Também aceita texto "hunt nível" por linha.
        function parseSharedRoute(bruto) {
            const txt = String(bruto || '').trim();
            if (!txt) return { erro: 'vazio' };
            let data = null;
            try { data = JSON.parse(txt); } catch { data = null; }
            if (data && typeof data === 'object' && !Array.isArray(data)) {
                if (!data._piwDiscordNotifyRoute && !Array.isArray(data.route)) return { erro: 'webhookUrl' in data ? 'config' : 'formato' };
                const route = (Array.isArray(data.route) ? data.route : []).map(x => ({ slug: normalize(x?.slug || ''), level: parseInt(x?.level, 10) || 0 })).filter(x => x.slug && x.level > 0);
                if (!route.length) return { erro: 'sem-etapas' };
                return { name: String(data.name || '').trim().slice(0, 40), route, origem: { conta: data._conta || null, versao: data._versao || null, em: data._exportadoEm || null } };
            }
            // texto puro "hunt nível" por linha (o mesmo formato da caixa de etapas)
            const linhas = txt.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
            const route = linhas.map(l => { const m = l.match(/^(\S+)\s+(\d+)$/); return m ? { slug: normalize(m[1]), level: parseInt(m[2], 10) } : null; }).filter(r => r && r.level > 0);
            if (!route.length || route.length !== linhas.length) return { erro: 'formato' };
            return { name: '', route, origem: {} };
        }
        function routeShareStatus() {
            const st = $('#pg-dn-route-share-status');
            const r = parseSharedRoute($('#pg-dn-route-share-text').value);
            st.classList.remove('warn');
            if (r.erro === 'vazio') { st.textContent = 'Clique na caixa, cole com Ctrl+V e clique em Aplicar rota.'; return null; }
            if (r.erro) {
                st.classList.add('warn');
                st.textContent = r.erro === 'config' ? '✖ Isso é a config inteira: use Sistema → Importar config.' : r.erro === 'sem-etapas' ? '✖ A rota colada não tem etapas.' : '✖ Não é uma rota exportada nem "hunt nível" por linha.';
                return null;
            }
            const nome = r.name || uniqueRouteName('Rota importada');
            const existe = Boolean(r.name && cfg.routes?.[r.name]);
            st.textContent = `✔ Rota "${nome}"${r.origem.conta ? ` de ${r.origem.conta}` : ''}: ${r.route.length} ${r.route.length === 1 ? 'etapa' : 'etapas'} (${r.route.map(x => `${x.slug} ${x.level}`).join(' · ')}). ${existe ? 'Já existe uma rota com esse nome: as etapas dela serão trocadas.' : 'Será criada e ativada.'} Clique em Aplicar rota.`;
            return r;
        }
        $('#pg-dn-route-export').onclick = () => {
            const { route, linhasRuins } = readRoute();
            if (!route.length) { flash('⚠ Esta rota não tem etapas para exportar.', 'warn'); return; }
            const name = cfg.routeName || '';
            const txt = JSON.stringify({ _piwDiscordNotifyRoute: 1, _versao: VERSION, _exportadoEm: new Date().toISOString(), _conta: playerName() || null, name, route });
            logEvent('rota-exportada', { nome: name, etapas: route.length, pendente: dirty, linhasRuins });
            copyText(txt).then(ok => {
                if (ok) flash(`✔ Rota ${name ? `"${name}" ` : ''}copiada (${route.length} ${route.length === 1 ? 'etapa' : 'etapas'}). Na outra conta: Treino → Importar rota, clique na caixa e cole com Ctrl+V.`, 'ok', 10000);
                else {
                    $('#pg-dn-route-share-box').hidden = false;
                    const ta = $('#pg-dn-route-share-text'); ta.value = txt; routeShareStatus(); ta.focus(); ta.select();
                    flash('⚠ Não copiou; a rota apareceu na caixa abaixo, já selecionada: Ctrl+C.', 'warn');
                }
            });
        };
        $('#pg-dn-route-share-text').addEventListener('input', routeShareStatus);
        $('#pg-dn-route-share-paste').onclick = () => pasteInto($('#pg-dn-route-share-text')).then(pasteFlash);
        // com uma rota já colada, o botão APLICA (mesmo atalho do Importar config)
        $('#pg-dn-route-share-import').onclick = () => {
            const box = $('#pg-dn-route-share-box');
            if (!box.hidden && $('#pg-dn-route-share-text').value.trim()) { $('#pg-dn-route-share-apply').click(); return; }
            box.hidden = !box.hidden;
            if (!box.hidden) { $('#pg-dn-route-share-text').value = ''; routeShareStatus(); $('#pg-dn-route-share-text').focus(); }
        };
        $('#pg-dn-route-share-apply').onclick = () => {
            const r = routeShareStatus();
            if (!r) { flash($('#pg-dn-route-share-status').textContent || '✖ Cole uma rota exportada na caixa.', 'error'); return; }
            const salvou = saveIfDirty();
            const name = r.name || uniqueRouteName('Rota importada');
            const existia = Boolean(cfg.routes?.[name]);
            createRoute(name, r.route);
            logEvent('rota-importada', { nome: name, etapas: r.route, substituiu: existia, origem: r.origem });
            $('#pg-dn-route-share-box').hidden = true;
            dirty = false; fill();
            flash(`${salvou ? '✔ Salvo · ' : '✔ '}Rota "${name}" ${existia ? 'atualizada' : 'criada'} e ativa (${r.route.length} ${r.route.length === 1 ? 'etapa' : 'etapas'}, começa na 1ª)${cfg.routeEnabled ? '' : ' · "Seguir a rota" está desligado: marque e Salve para valer'}.`, 'ok', 9000);
        };

        // ---- Profissão: rota de captura ----
        function renderCatch() {
            const d = current();
            $('#pg-dn-catch-status').innerHTML = d.catchRouteEnabled
                ? `<span class="k">Rota ·</span> ${escHtml(catchStatus())}`
                : '<span class="k">Rota de captura desligada.</span>';
            const prox = (cfg.catchRouteEnabled && huntCatalog) ? catchPlan().slice(0, 8) : [];
            const feitas = (cfg.catchRouteEnabled && huntCatalog) ? catchScope().filter(h => speciesDone(h.speciesId)) : [];
            const fontes = feitas.reduce((m, h) => { const f = speciesSource(h.speciesId) || '?'; m[f] = (m[f] || 0) + 1; return m; }, {});
            const fontesTxt = feitas.length ? ` Feitas: ${Object.entries(fontes).map(([f, n]) => `${n} ${f}`).join(', ')}.` : '';
            $('#pg-dn-catch-next').textContent = prox.length
                ? `Próximas: ${prox.map((h, i) => `${i === 0 ? '▶ ' : ''}${h.name} lv${h.level}`).join(' · ')}${catchPlan().length > 8 ? ` (+${catchPlan().length - 8})` : ''}`
                : (cfg.catchRouteEnabled && huntCatalog ? 'Nada faltando nas áreas marcadas.' : '');
            $('#pg-dn-catch-next').textContent += fontesTxt;
            const puladas = (cfg.catchRouteSkipped || []).length;
            $('#pg-dn-catch-unskip').hidden = !puladas;
            $('#pg-dn-catch-unskip').textContent = `Limpar puladas (${puladas})`;
            $('#pg-dn-catch-skip').disabled = !catchTarget;
            const pr = profession;
            $('#pg-dn-prof-status').innerHTML = pr
                ? `<span class="k">${escHtml(pr.key || 'sem profissão')}${pr.rank ? ` · rank ${escHtml(pr.rank)}` : ''} ·</span> ${fmtNum(pr.speciesCount)} espécies capturadas${pr.next && pr.next.need ? ` · próximo rank ${escHtml(pr.next.rank || '')}: ${fmtNum(pr.next.have)}/${fmtNum(pr.next.need)}` : ''}`
                : '<span class="k">Profissão ainda não lida (Atualizar Pokédex).</span>';
        }
        onCatchChange = () => { if (!panel.hidden) renderCatch(); };
        function renderClan() {
            const st = clanStatus(current());
            $('#pg-dn-clan-status').innerHTML = `<span class="k">Clã ·</span> ${escHtml(st.head)}`;
            $('#pg-dn-clan-reqs').innerHTML = st.reqs.map(r => `<li>${escHtml(r)}</li>`).join('');
            $('#pg-dn-clan-hints').textContent = st.dicas.length ? `Onde cai: ${st.dicas.join(' | ')}` : '';
            $('#pg-dn-clan-plan').textContent = st.rota ? `Rota: ${st.rota}` : '';
        }
        onClanChange = () => { if (!panel.hidden) renderClan(); };
        function renderDeposit() {
            const d = current();
            $('#pg-dn-dep-status').textContent = depositStatus(d);
            const on = { depot: 'Depot', family: 'família' };
            const nLista = familyList(d).length;
            $('#pg-dn-sum-guardar').textContent = depositWanted(d) ? `· ${[nLista ? `${nLista} ${nLista === 1 ? 'item' : 'itens'} → família` : '', d.depositItems ? `drops → ${on[d.depositItems]}` : '', d.depositPokes ? 'Pokémon → família' : ''].filter(Boolean).join(' · ')}` : '· desligado';
        }
        ['#pg-dn-dep-items', '#pg-dn-dep-pokes', '#pg-dn-dep-rare'].forEach(sel => $(sel).addEventListener('change', renderDeposit));
        // lista "Sempre para a família": rascunho próprio (entra no readForm), autocompletar pelo catálogo sem consumíveis
        let famListDraft = familyList(cfg);
        function renderFamList() {
            $('#pg-dn-famlist').innerHTML = famListDraft.map((e, i) => `<span class="dn-famchip">${escHtml(e.name)}${e.keep ? ` <span class="k">· manter ${fmtNum(e.keep)}</span>` : ''}<button type="button" data-i="${i}" title="Tirar da lista" aria-label="Tirar ${escHtml(e.name)} da lista">×</button></span>`).join('');
        }
        function famEdited() { dirty = true; renderDirty(); renderLive(); renderFamList(); renderDeposit(); }
        let famDlFilled = false;
        function fillFamDatalist() {
            if (famDlFilled) return;
            loadItemsCatalog().then(cat => {
                if (!cat || !cat.size || famDlFilled) return;
                famDlFilled = true;
                const nomes = [...new Set([...cat.values()].filter(i => i && i.name && !DEPOSIT_SKIP_CATS.includes(String(i.category || ''))).map(i => String(i.name)))].sort((a, b) => a.localeCompare(b));
                $('#pg-dn-famitem-dl').innerHTML = nomes.map(n => `<option value="${escHtml(n)}"></option>`).join('');
            });
        }
        $('#pg-dn-famitem').addEventListener('focus', fillFamDatalist);
        $('#pg-dn-famitem-add').onclick = () => {
            const nome = $('#pg-dn-famitem').value.trim();
            if (!nome) { flash('⚠ Escreva o nome do item.', 'warn', 4000); return; }
            const keep = Math.max(0, Math.floor(Number($('#pg-dn-famitem-keep').value) || 0));
            loadItemsCatalog().then(cat => {
                const it = [...(cat || new Map()).values()].find(i => normalize(i?.name) === normalize(nome)) || null;
                if (it && DEPOSIT_SKIP_CATS.includes(String(it.category || ''))) { flash(`⚠ ${it.name} é consumível (${it.category}): fica sempre na mochila.`, 'warn', 6000); return; }
                const e = { id: it ? Number(it.id) : 0, name: it ? String(it.name) : nome, keep };
                const i = famListDraft.findIndex(x => (e.id && x.id === e.id) || normalize(x.name) === normalize(e.name));
                if (i >= 0) famListDraft[i] = e; else famListDraft.push(e);
                $('#pg-dn-famitem').value = ''; $('#pg-dn-famitem-keep').value = '';
                famEdited();
                flash(it ? `✔ ${e.name} na lista${keep ? ` (mantém ${keep})` : ''}. Salve para valer.` : `⚠ "${nome}" não está no catálogo do jogo; confira o nome (vale o nome exato da mochila). Salve para valer.`, it ? 'ok' : 'warn', 6000);
            });
        };
        $('#pg-dn-famitem').addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); $('#pg-dn-famitem-add').click(); } });
        $('#pg-dn-famlist').addEventListener('click', (ev) => {
            const b = ev.target.closest('button[data-i]');
            if (!b) return;
            famListDraft.splice(Number(b.dataset.i), 1);
            famEdited();
        });
        renderFamList();
        $('#pg-dn-clan-refresh').onclick = () => {
            flash('📥 Lendo o clã e a mochila…', 'info', 3000);
            Promise.all([loadHuntCatalog().catch(() => null), loadItemsCatalog()])
                .then(() => refreshClan(true)).then(() => { requestBag(); renderClan(); });
        };
        ['#pg-dn-clan', '#pg-dn-clan-route', '#pg-dn-clan-rankup', '#pg-dn-clan-key'].forEach(sel => $(sel).addEventListener('change', renderClan));
        $('#pg-dn-catch-skip').onclick = () => {
            const slug = skipCatchTarget();
            renderCatch();
            flash(slug ? `⏭ ${slug} pulada · ${catchStatus()}` : '⚠ Nenhum alvo no momento.', slug ? 'ok' : 'warn', 6000);
        };
        $('#pg-dn-catch-unskip').onclick = () => {
            cfg.catchRouteSkipped = []; saveCfg(cfg);
            if (cfg.catchRouteEnabled && huntCatalog) catchNext('puladas liberadas');
            renderCatch(); flash('✔ Puladas voltaram para a rota.', 'ok', 4000);
        };
        $('#pg-dn-catch-refresh').onclick = () => {
            flash('📥 Lendo Pokédex e profissão…', 'info', 3000);
            Promise.all([loadHuntCatalog().catch(() => null), refreshPokedex(true).catch(err => { flash(`✖ Pokédex: ${err?.message || err}`, 'error'); }), refreshProfession()])
                .then(() => { if (cfg.catchRouteEnabled && huntCatalog) catchNext('atualizou'); renderCatch(); });
        };

        // ---- Viagem à cidade ----
        function renderTrip() {
            const s = tripStatus(current());
            const box = $('#pg-dn-trip');
            box.classList.toggle('busy', s.busy);
            $('#pg-dn-trip-title').textContent = s.title;
            $('#pg-dn-trip-sub').textContent = s.sub;
            $('#pg-dn-trip-bar').style.width = `${s.pct}%`;
            $('#pg-dn-trip-now').disabled = s.busy;
            $('#pg-dn-trip-status').textContent = tripRunning ? s.title : (lastTripInfo ? tripLastText() : 'Nenhuma viagem ainda.');
        }
        onTripChange = () => { if (!panel.hidden) { renderTrip(); rerenderSell(); renderPokeSell(); } };
        // "Ir agora": salva o que está na tela (a viagem usa as regras salvas) e leva tudo que houver.
        $('#pg-dn-trip-now').onclick = () => {
            if (dirty) $('#pg-dn-save').click();
            const needs = tripAugment([]);
            if (!needs.length) { flash('⚠ Nada para levar: nenhum drop marcado nesta hunt, nenhum Pokémon nas regras e bolas, poções e revives acima do limite.', 'warn'); return; }
            const nome = { itens: 'drops', pokes: 'Pokémon', bolas: 'bolas', suprimentos: 'poções/revives', cla: 'clã', guardar: 'guardar', evoluir: 'evolução', slot: 'slot machine', time: 'ler o time', breeding: 'breeding' };
            flash(`🏙 Indo à cidade: ${needs.map(n => nome[n[0]]).join(', ')}…`, 'info', 90000);
            tripNeeds.clear();
            cityTrip('manual: ' + needs.map(n => n[0]).join('+'), tripTasksFor(needs)).then(r => {
                const linha = r.tarefas.map(t => {
                    const x = t.r || {};
                    if (t.key === 'itens') return `drops ${t.ok ? `✔ ${x.total ?? ''} por ${fmtNum(x.ganho || 0)} gold` : `✖ ${t.motivo || ''}`}`;
                    if (t.key === 'pokes') return `Pokémon ${t.ok ? `✔ ${x.vendidos ?? ''} por ${fmtNum(x.ganho || 0)} gold` : `✖ ${t.motivo || ''}`}`;
                    if (t.key === 'suprimentos') return `poções/revives ${t.ok ? `✔ ${(x.compras || []).map(c => `${c.comprado} ${c.name}`).join(', ') || 'estoque ok'}` : `✖ ${t.motivo || ''}`}`;
                    if (t.key === 'bolas') return `bolas ${t.ok ? `✔ ${x.bought ?? ''}` : `✖ ${t.motivo || ''}`}`;
                    if (t.key === 'evoluir') return `evolução ${t.ok ? `✔ ${x.feitos ?? ''}` : `✖ ${t.motivo || ''}`}`;
                    return `${nome[t.key] || t.key} ${t.ok ? '✔' : `✖ ${t.motivo || ''}`}`;
                }).join(' · ');
                flash(`${r.ok ? '✔' : '⚠'} Viagem: ${linha}${r.volta ? ` · voltando para ${r.volta}` : ''}`, r.ok ? 'ok' : 'warn', 12000);
            });
        };

        // ---- Sistema ----
        function renderReload() {
            $('#pg-dn-reload-status').textContent = cfg.reloadEnabled ? `Recarga ${reloadStatus()}` : 'Recarga desligada';
            $('#pg-dn-socket').innerHTML = lastSocket && lastSocket.readyState === 1
                ? 'socket do jogo <span class="dn-ok-t">● rastreado</span>'
                : 'socket do jogo <span class="dn-err-t">○ não rastreado</span>';
        }
        onReloadChange = () => { if (!panel.hidden) renderReload(); };
        $('#pg-dn-reload-now').onclick = () => {
            flash(`⟳ Recarregando${huntSlug ? ` (volto para ${huntSlug})` : ''}…`, 'info', 10000);
            setTimeout(() => doReload('manual'), 300);
        };

        // ---- preencher e redesenhar tudo ----
        function renderLive() {
            renderChannels(); renderQuality(); renderBalls(); renderSupply(); renderHeal(); renderIdle(); renderSellCount(); renderPokeSell(); renderRoute(); renderDaily(); renderGift(); renderEvolve(); renderSlot(); renderBreed(); renderCatch(); renderClan(); renderDeposit(); renderTrip(); renderState();
        }
        function fill() {
            $('#pg-dn-hook').value = cfg.webhookUrl;
            $('#pg-dn-hook-shiny').value = cfg.webhookShiny || '';
            $('#pg-dn-hook-alerts').value = cfg.webhookAlerts || '';
            $('#pg-dn-hook-level').value = cfg.webhookLevel || '';
            setChanOpen(!cfg.webhookUrl);
            $('#pg-dn-list').value = cfg.watchList.join(', ');
            $('#pg-dn-shiny').checked = cfg.notifyShiny;
            $('#pg-dn-all').checked = cfg.notifyEveryCapture;
            $('#pg-dn-lock').checked = Boolean(cfg.lockNotified);
            $('#pg-dn-family').checked = Boolean(cfg.familyNotified);
            $('#pg-dn-tier').value = tierByKey(cfg.minTier) ? tierByKey(cfg.minTier).key : '';
            $('#pg-dn-miniv').value = cfg.minIv || 0;
            $('#pg-dn-tier-iv').value = cfg.minTierIv || 0;
            $('#pg-dn-mention').value = cfg.mentionUserId;
            $('#pg-dn-cooldown').value = cfg.cooldownSeconds;
            $('#pg-dn-ball').value = cfg.ballsWatch || 'auto';
            $('#pg-dn-ballsmin').value = cfg.ballsMin || 0;
            $('#pg-dn-autobuy').checked = Boolean(cfg.autoBuy);
            $('#pg-dn-autobuy-qty').value = cfg.autoBuyQty || 100;
            for (const k of SUPPLY_KINDS) {
                $(`#pg-dn-${k.key}-buy`).checked = Boolean(cfg[k.buy]);
                $(`#pg-dn-${k.key}-item`).value = String(Number(cfg[k.id]) || k.def);
                $(`#pg-dn-${k.key}-min`).value = Number(cfg[k.min]) || 0;
                $(`#pg-dn-${k.key}-qty`).value = Number(cfg[k.qty]) || DEFAULTS[k.qty];
            }
            $('#pg-dn-healjoy').checked = Boolean(cfg.healJoyEnabled);
            $('#pg-dn-cityidle').checked = Boolean(cfg.cityIdleEnabled);
            $('#pg-dn-cityidle-min').value = Number(cfg.cityIdleMin) || IDLE_MIN_DEFAULT;
            $('#pg-dn-sell').checked = Boolean(cfg.sellEnabled);

            $('#pg-dn-psell').checked = Boolean(cfg.pokeSellEnabled);
            $('#pg-dn-box-alert').value = Number(cfg.boxAlertAt) || 0;
            $('#pg-dn-trip-min').value = cfg.tripEveryMin || 10;
            $('#pg-dn-trip-max').value = cfg.tripEveryMaxMin || '';
            for (const i of panel.querySelectorAll('.pg-dn-psell-lim')) i.value = pokeSellLimit(cfg, i.dataset.tier) || '';
            sellDrafts = {};
            loadItemsCatalog().then(() => { if (!panel.hidden) rerenderSell(); });
            renderSellList();
            const lv = $('#pg-dn-level');
            lv.disabled = false; lv.value = cfg.levelAlertAt || 0; lv.dataset.own = String(cfg.levelAlertAt || 0);
            $('#pg-dn-level-swap').checked = Boolean(cfg.levelSwap);
            $('#pg-dn-route').value = routeList().map(r => `${r.slug} ${r.level}`).join('\n');
            $('#pg-dn-route-on').checked = Boolean(cfg.routeEnabled);
            renderRouteSelect();
            $('#pg-dn-route-name-box').hidden = true;
            renderTeam();
            $('#pg-dn-catch').checked = Boolean(cfg.catchRouteEnabled);
            for (const c of panel.querySelectorAll('.pg-dn-catch-area')) c.checked = catchAreas().includes(c.value);
            $('#pg-dn-catch-max').value = cfg.catchRouteMaxLevel || '';
            $('#pg-dn-catch-auto').checked = Boolean(cfg.catchRouteAuto);
            $('#pg-dn-catch-ball').value = cfg.catchRouteBall || 'auto';
            $('#pg-dn-daily').checked = Boolean(cfg.dailyEnabled);
            $('#pg-dn-daily-claim').checked = cfg.dailyClaim !== false;
            $('#pg-dn-daily-auto').checked = Boolean(cfg.dailyAuto);
            $('#pg-dn-gift').checked = Boolean(cfg.giftEnabled);
            $('#pg-dn-evolve').checked = Boolean(cfg.evolveEnabled);
            $('#pg-dn-slot').checked = Boolean(cfg.slotEnabled);
            $('#pg-dn-slot-wanted').value = cfg.slotWanted || '';
            $('#pg-dn-breed').checked = Boolean(cfg.breedEnabled);
            $('#pg-dn-breed-ivmax').value = Math.max(0, Math.min(IV_MAX, Number(cfg.breedFoodIvMax) || 0));
            $('#pg-dn-breed-family').checked = cfg.breedFamily !== false;
            $('#pg-dn-breed-double').checked = cfg.breedDouble !== false;
            for (const n of [1, 2]) delete $(`#pg-dn-breed-l${n}`).dataset.ready;   // menus refeitos a partir do cfg salvo
            $('#pg-dn-gift-center').value = giftCenterMode(cfg);
            $('#pg-dn-clan').checked = Boolean(cfg.clanEnabled);
            $('#pg-dn-dep-items').value = ['depot', 'family'].includes(cfg.depositItems) ? cfg.depositItems : '';
            $('#pg-dn-dep-pokes').value = cfg.depositPokes === 'family' ? 'family' : '';
            $('#pg-dn-dep-rare').checked = Boolean(cfg.depositPokesRare);
            famListDraft = familyList(cfg);
            renderFamList();
            $('#pg-dn-clan-key').value = CLAN_INFO[cfg.clanKey] ? cfg.clanKey : 'orebound';
            $('#pg-dn-clan-rankup').checked = cfg.clanRankup !== false;
            $('#pg-dn-clan-route').checked = Boolean(cfg.clanRoute);
            $('#pg-dn-daily-return').value = cfg.dailyReturnSlug || '';
            $('#pg-dn-trip-city').value = ['cerulean', 'pewter', 'viridian', 'goldenrod'].includes(cfg.tripCity) ? cfg.tripCity : 'cerulean';
            $('#pg-dn-reload').checked = Boolean(cfg.reloadEnabled);
            $('#pg-dn-reload-min').value = cfg.reloadEveryMin || 60;
            $('#pg-dn-reload-max').value = cfg.reloadEveryMaxMin || '';
            renderReload();
            $('#pg-dn-debug').checked = cfg.debug;
            $('#pg-dn-import-box').hidden = true;
            $('#pg-dn-route-import-box').hidden = true;
            $('#pg-dn-route-share-box').hidden = true;
            renderLive();
        }

        // qualquer edição marca "não salvo" e recalcula resumos e badges
        const onEdit = (e) => {
            if (e.target.closest('#pg-dn-import-box, #pg-dn-route-import-box, #pg-dn-route-share-box, #pg-dn-route-name-box') || e.target.id === 'pg-dn-route-sel' || e.target.id === 'pg-dn-sell-view') return;
            if (!e.target.matches('input, select, textarea')) return;
            dirty = true;
            renderDirty();
            renderLive();
        };
        panel.querySelector('.dn-body').addEventListener('input', onEdit);
        panel.querySelector('.dn-body').addEventListener('change', onEdit);
        // ---- colar com o botão direito (v3.15.1): tenta a área de transferência; se negarem, tenta o comando nativo;
        // senão avisa. No PokeGrid (v1.5.23) NÃO funciona e não tem como funcionar daqui: o app nega toda permissão
        // dos painéis (`setPermissionRequestHandler(cb(false))`, inclusive clipboard-read) e, no clique direito em campo
        // editável, não faz nada (`params.isEditable` → return). A correção é dele: nesse handler, `contents.paste()`.
        // Enquanto isso, o Ctrl+V/Ctrl+C/Ctrl+A/Ctrl+X num campo do painel não chega ao jogo (v3.15.2, abaixo).
        async function pasteInto(el) {
            let txt = '';
            try { txt = await navigator.clipboard.readText(); } catch { txt = ''; }
            if (!txt) {
                try { el.focus(); if (document.execCommand('paste')) { el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return true; } } catch { /* segue */ }
                return false;
            }
            const a = el.selectionStart ?? el.value.length, b = el.selectionEnd ?? el.value.length;
            el.value = el.value.slice(0, a) + txt + el.value.slice(b);
            const pos = a + txt.length;
            try { el.setSelectionRange(pos, pos); } catch { /* campo sem seleção */ }
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
        }
        function pasteFlash(ok) { flash(ok ? '📋 Colado.' : '⚠ O PokeGrid não deixa o painel ler a área de transferência. Clique no campo e use Ctrl+V (funciona; o jogo não captura mais).', ok ? 'ok' : 'warn', ok ? 2000 : 0); }
        panel.addEventListener('contextmenu', (e) => {
            const el = e.target.closest('input:not([type=number]):not([type=checkbox]), textarea');
            if (!el || el.disabled) return;
            e.preventDefault(); e.stopPropagation();
            pasteInto(el).then(pasteFlash);
        });
        $('#pg-dn-import-paste').onclick = () => pasteInto($('#pg-dn-import-text')).then(pasteFlash);

        panel.addEventListener('keydown', (e) => {
            // atalhos de edição num campo do painel são do campo: não deixa o jogo vê-los (o navegador cola/copia normalmente)
            if ((e.ctrlKey || e.metaKey) && ['v', 'c', 'x', 'a'].includes(String(e.key).toLowerCase()) && e.target.matches('input, textarea')) { e.stopPropagation(); return; }
            if (e.key === 'Escape') { e.stopPropagation(); togglePanel(false); return; }
            if (e.key === 'Enter' && e.target.matches('input:not([type=checkbox])')) { e.preventDefault(); $('#pg-dn-save').click(); }
        });

        function togglePanel(force) {
            const open = typeof force === 'boolean' ? force : panel.hidden;
            if (open && !dirty) fill();     // com edição pendente, reabrir mantém o que estava na tela
            panel.hidden = !open;
            if (open) {
                showTab(cfg.webhookUrl ? (loadUi().tab || 'avisos') : 'avisos');
                renderLive();
                if (!cfg.webhookUrl) $('#pg-dn-hook').focus();
            }
            renderState();
        }
        btn.onclick = () => togglePanel();
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) togglePanel(false); });
        $('#pg-dn-close').onclick = () => togglePanel(false);

        // ---- Salvar (global; mantém os efeitos colaterais de antes) ----
        $('#pg-dn-save').onclick = () => {
            const { draft, linhasRuins } = readForm();
            const alvoAntes = levelTarget(), swapAntes = swapEnabled();
            const rotaAntes = JSON.stringify(routeList());
            const recargaAntes = JSON.stringify([cfg.reloadEnabled, cfg.reloadEveryMin, cfg.reloadEveryMaxMin]);
            const dailyAntes = JSON.stringify([cfg.dailyEnabled, cfg.dailyClaim, cfg.dailyReturnSlug, cfg.dailyAuto]);
            const giftAntes = JSON.stringify([cfg.giftEnabled, cfg.giftCenterMode]);
            const slotAntes = JSON.stringify([cfg.slotEnabled, cfg.slotWanted]);
            const breedAntes = JSON.stringify([cfg.breedEnabled, cfg.breedLines, cfg.breedFoodIvMax, cfg.breedFamily, cfg.breedDouble]);
            const capturaAntes = JSON.stringify([cfg.catchRouteEnabled, cfg.catchRouteAreas, cfg.catchRouteMaxLevel]);
            const viagemAntes = JSON.stringify([cfg.tripEveryMin, cfg.tripEveryMaxMin]);
            const ligouCaptura = draft.catchRouteEnabled && !cfg.catchRouteEnabled;
            const ligouRota = draft.routeEnabled && !cfg.routeEnabled;
            const ligouCla = draft.clanEnabled && draft.clanRoute && !(cfg.clanEnabled && cfg.clanRoute);
            const clanAntes = JSON.stringify([cfg.clanEnabled, cfg.clanRoute, cfg.clanKey]);
            Object.assign(cfg, draft);
            sellDrafts = {};                                  // listas de venda das outras hunts já foram para cfg.sellProfiles
            const exclusivo = [];
            // Rota de treino, de captura e do clã trocam de hunt: fica a que acabou de ser ligada.
            const rotas = [
                { on: () => cfg.routeEnabled, off: () => { cfg.routeEnabled = false; }, ligou: ligouRota, nome: '"Seguir a rota" (treino)' },
                { on: () => cfg.catchRouteEnabled, off: () => { cfg.catchRouteEnabled = false; }, ligou: ligouCaptura, nome: 'Rota de captura' },
                { on: () => cfg.clanEnabled && cfg.clanRoute, off: () => { cfg.clanRoute = false; }, ligou: ligouCla, nome: '"Caçar o que falta" (clã)' },
            ];
            const ligadas = rotas.filter(r => r.on());
            if (ligadas.length > 1) {
                const fica = ligadas.find(r => r.ligou) || ligadas[0];
                for (const r of ligadas) if (r !== fica) { r.off(); exclusivo.push(`${r.nome} desligada: ${fica.nome} manda na hunt.`); }
            }
            if (JSON.stringify(routeList()) !== rotaAntes) cfg.routeStage = 0; // rota editada: recomeça
            if (routeList().length && !cfg.routeName) cfg.routeName = uniqueRouteName('Rota 1'); // primeira rota ganha nome sozinha (saveCfg espelha)
            // Alvo ou troca mudaram: reavalia o time inteiro (antes, ligar a troca depois do aviso não fazia nada).
            if (levelTarget() !== alvoAntes || swapEnabled() !== swapAntes) { levelAlerted.clear(); swapPending = null; }
            lastPokesReqAt = 0; requestPokes(0);
            for (const k of Object.keys(ballAlerted)) delete ballAlerted[k]; // limite mudou: rearma
            for (const k of Object.keys(autoBuyAttempted)) delete autoBuyAttempted[k];
            requestBalls(0);
            for (const k of Object.keys(supplyAttempted)) delete supplyAttempted[k]; // refil mudou: rearma e relê a mochila
            requestSupplies();
            for (const k of Object.keys(evolveAttempted)) delete evolveAttempted[k]; // evolução: rearma (pedras compradas, etc.) e relê o time
            for (const k of Object.keys(evolveFailed)) delete evolveFailed[k];
            if (cfg.evolveEnabled) requestPokes(0);
            if (JSON.stringify([cfg.tripEveryMin, cfg.tripEveryMaxMin]) !== viagemAntes) restartTripCycle(); // faixa da viagem mudou: sorteia de novo
            saveHuntProfile();
            if (JSON.stringify([cfg.reloadEnabled, cfg.reloadEveryMin, cfg.reloadEveryMaxMin]) !== recargaAntes) scheduleReload(); // faixa mudou: sorteia de novo
            if (JSON.stringify([cfg.dailyEnabled, cfg.dailyClaim, cfg.dailyReturnSlug, cfg.dailyAuto]) !== dailyAntes) scheduleDailyCheck(500); // daily mudou: lê a missão já
            if (JSON.stringify([cfg.giftEnabled, cfg.giftCenterMode]) !== giftAntes) { giftFetchedAt = 0; scheduleGiftCheck(500); } // gift mudou: lê o calendário já
            if (JSON.stringify([cfg.slotEnabled, cfg.slotWanted]) !== slotAntes) { // slot machine mudou: rearma e relê a máquina já
                slotFailedAt = 0;
                for (const k of Object.keys(slotTriedAt)) delete slotTriedAt[k];
                if (cfg.slotEnabled) setTimeout(() => slotTick(true), 500);
            }
            if (JSON.stringify([cfg.breedEnabled, cfg.breedLines, cfg.breedFoodIvMax, cfg.breedFamily, cfg.breedDouble]) !== breedAntes) { // breeding mudou: replaneja já
                breedReset();
                if (cfg.breedEnabled) setTimeout(() => breedTick(true), 500);
            }
            if (JSON.stringify([cfg.clanEnabled, cfg.clanRoute, cfg.clanKey]) !== clanAntes) {
                if (!(cfg.clanEnabled && cfg.clanRoute) && clanTarget) clanReturn('rota do clã desligada');
                if (cfg.clanEnabled) setTimeout(() => clanTick(), 500);
            }
            if (JSON.stringify([cfg.catchRouteEnabled, cfg.catchRouteAreas, cfg.catchRouteMaxLevel]) !== capturaAntes) {
                if (!cfg.catchRouteEnabled) catchTarget = null;
                else if (huntCatalog) catchNext('salvar'); else startCatchRoute('salvar');
            }
            cfg.cfgVersion = 2;
            saveCfg(cfg);
            dirty = false;
            fill();
            const avisos = exclusivo.map(t => `⚠ ${t}`);
            if (cfg.autoBuy && !cfg.ballsMin) avisos.push('⚠ Compra com limite 0: só compra quando a bola acabar.');
            if (linhasRuins.length) avisos.push(`⚠ Rota: ${linhasRuins.length} linha(s) ignorada(s) (formato "hunt nível"): ${linhasRuins.map(l => `"${l}"`).join(', ')}`);
            if (!cfg.webhookUrl) avisos.push('⚠ Sem canal de Capturas: capturas não serão enviadas.');
            if (cfg.pokeSellEnabled && !pokeSellHasRules(cfg)) avisos.push('⚠ Venda de Pokémon ligada sem nenhum limite: nada será vendido.');
            const usaAlertas = [effectiveBallsMin() > 0 && 'bolas', supplyOn() && 'poções/revives', cfg.sellEnabled && 'venda', cfg.pokeSellEnabled && 'venda de Pokémon', routeActive() && 'troca de hunt', cfg.dailyEnabled && 'daily', cfg.catchRouteEnabled && 'rota de captura'].filter(Boolean);
            if (usaAlertas.length && !cfg.webhookAlerts) avisos.push(`⚠ Sem canal de Alertas: avisos de ${usaAlertas.join(', ')} não serão enviados.`);
            if (levelEnabled() && !cfg.webhookLevel) avisos.push('⚠ Sem canal de Nível: avisos de nível/troca de líder não serão enviados.');
            const nivel = levelEnabled() ? ` · conferindo o time para o nível ${levelTarget()}${swapEnabled() ? ' (com troca)' : ''}…` : '';
            if (avisos.length) flash('✔ Salvo · ' + avisos.join(' '), 'warn');
            else flash('✔ Salvo' + nivel, 'ok', nivel ? 4000 : 2500);
        };

        // ---- Testar canais: salva SÓ os canais (o resto do formulário segue como rascunho) e envia um teste a cada um ----
        $('#pg-dn-test').onclick = () => {
            cfg.webhookUrl = $('#pg-dn-hook').value.trim();
            cfg.webhookShiny = $('#pg-dn-hook-shiny').value.trim();
            cfg.webhookAlerts = $('#pg-dn-hook-alerts').value.trim();
            cfg.webhookLevel = $('#pg-dn-hook-level').value.trim();
            saveCfg(cfg);
            if (!cfg.webhookUrl) {
                flash('⚠ Preencha o canal de Capturas primeiro.', 'warn');
                showTab('avisos'); setChanOpen(true); $('#pg-dn-hook').focus();
                return;
            }
            // capturas: sempre; shinys/alertas/nível: só se tiverem canal próprio
            sendDiscordNotification({ name: 'Dratini (teste)', shiny: false, level: 5, ivTotal: 150, quality: 1.35, ball: 'Ultra Ball' }, true);
            const canais = ['capturas'];
            if (cfg.webhookShiny) {
                canais.push('shinys');
                sendDiscordNotification({ name: 'Dratini (teste)', shiny: true, level: 5, ivTotal: 180, quality: 1.72, ball: 'Idle Ball' }, true);
            }
            if (cfg.webhookAlerts) {
                canais.push('alertas');
                postWebhook('alert', {
                    username: 'Poke Idle World',
                    embeds: [{ title: 'Teste: canal de alertas', description: 'Aqui chegarão estoque de bolas, compras, vendas de itens e de Pokémon, trocas de hunt, Daily Kill e a rota de captura.', color: 0xfee75c }],
                }, { test: true });
            }
            if (cfg.webhookLevel) {
                canais.push('nível');
                postWebhook('level', {
                    username: 'Poke Idle World',
                    embeds: [{ title: 'Teste: canal de nível', description: 'Aqui chegarão os avisos de nível atingido e troca de líder.', color: 0x5865f2 }],
                }, { test: true });
            }
            renderChannels(); renderState();
            flash(`✔ Canais salvos · teste enviado: ${canais.join(', ')}`, 'ok', 4000);
        };

        // Copia texto com fallback (o webview do PokeGrid às vezes nega navigator.clipboard).
        function copyText(txt) {
            const legacyCopy = () => {
                try {
                    const ta = document.createElement('textarea');
                    ta.value = txt;
                    ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
                    document.body.appendChild(ta);
                    ta.select();
                    const ok = document.execCommand('copy');
                    ta.remove();
                    return ok;
                } catch { return false; }
            };
            const clip = navigator.clipboard?.writeText ? navigator.clipboard.writeText(txt) : Promise.reject();
            return clip.then(() => true, () => legacyCopy());
        }

        $('#pg-dn-log').onclick = () => {
            const txt = localStorage.getItem(LOG_KEY) || '[]';
            copyText(txt).then(ok => {
                if (ok) flash('✔ Log copiado. Cole para quem for diagnosticar.', 'ok', 4000);
                else { console.log(TAG, 'LOG:', txt); flash('⚠ Não copiou; o log foi impresso no console.', 'warn'); }
            });
        };

        // ---- Exportar / importar configuração (para copiar entre contas/painéis) ----
        // Compara versões "3.20.1": > 0 se a for mais nova que b.
        function cmpVersion(a, b) {
            const pa = String(a || '').split('.').map(Number), pb = String(b || '').split('.').map(Number);
            for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d; }
            return 0;
        }
        // Exporta o que está NA TELA (com alteração não salva, leva o rascunho e avisa), mais os drops conhecidos do
        // "Guardar na cidade" (`_drops`, fora do cfg). Tudo com `_` no começo é carimbo e o Importar descarta.
        $('#pg-dn-export').onclick = () => {
            const pendente = dirty;
            const base = pendente ? Object.assign({}, cfg, readForm().draft) : cfg;
            const txt = JSON.stringify(Object.assign({ _piwDiscordNotify: cfg.cfgVersion || 2, _versao: VERSION, _exportadoEm: new Date().toISOString(), _conta: playerName() || null, _drops: [...droppedIds] }, base));
            logEvent('config-exportada', { versao: VERSION, pendente, tamanho: txt.length, chaves: Object.keys(base).length, guardar: { itens: base.depositItems || '', pokes: base.depositPokes || '', lista: familyList(base).length }, drops: droppedIds.size });
            const extra = pendente ? ' Levou também as alterações ainda NÃO salvas da tela (salve aqui se quiser mantê-las neste painel).' : '';
            copyText(txt).then(ok => {
                if (ok) flash(`✔ Config copiada (inclui os canais).${extra} Na outra conta: Sistema → Importar config, clique na caixa e cole com Ctrl+V.`, pendente ? 'warn' : 'ok', 12000);
                else {
                    $('#pg-dn-import-box').hidden = false;
                    const ta = $('#pg-dn-import-text'); ta.value = txt; ta.focus(); ta.select();
                    flash(`⚠ Não copiou; a config apareceu na caixa abaixo, já selecionada: Ctrl+C.${extra}`, 'warn');
                }
            });
        };
        // Prévia do que foi colado (v3.20.4): diz de onde veio e o que entra, e lembra de clicar em Aplicar.
        function importPreview() {
            const st = $('#pg-dn-import-status');
            const bruto = $('#pg-dn-import-text').value.trim();
            st.classList.remove('warn');
            if (!bruto) { st.textContent = 'Clique na caixa, cole com Ctrl+V e clique em Aplicar.'; return null; }
            let data = null;
            try { data = JSON.parse(bruto); } catch { data = null; }
            if (!data || typeof data !== 'object' || Array.isArray(data) || !('webhookUrl' in data)) {
                st.classList.add('warn');
                st.textContent = data ? '✖ Isso não é uma config deste script.' : `✖ Texto incompleto (${fmtNum(bruto.length)} caracteres): exporte de novo e cole tudo.`;
                return null;
            }
            const n = Object.keys(data.sellProfiles || {}).length, fl = familyList(data).length;
            st.textContent = `✔ Config de ${data._conta || 'outra conta'}${data._versao ? ` (v${data._versao})` : ''}: listas de venda de ${n} ${n === 1 ? 'hunt' : 'hunts'}, ${fl} ${fl === 1 ? 'item' : 'itens'} em "Sempre para a família". Clique em Aplicar para importar.`;
            return data;
        }
        $('#pg-dn-import-text').addEventListener('input', importPreview);
        // "Importar config" com uma config já colada APLICA (antes fechava a caixa e o texto se perdia sem aviso).
        $('#pg-dn-import').onclick = () => {
            const box = $('#pg-dn-import-box');
            const bruto = $('#pg-dn-import-text').value.trim();
            if (!box.hidden && bruto) {
                logEvent('config-import-botao', { acao: 'Importar config com texto na caixa: aplica', tamanho: bruto.length });
                $('#pg-dn-import-apply').click();
                return;
            }
            box.hidden = !box.hidden;
            logEvent('config-import-caixa', { aberta: !box.hidden });
            if (!box.hidden) { $('#pg-dn-import-text').value = ''; importPreview(); $('#pg-dn-import-text').focus(); }
        };
        $('#pg-dn-import-apply').onclick = () => {
            let data;
            const bruto = $('#pg-dn-import-text').value.trim();
            try { data = JSON.parse(bruto); }
            catch {
                logEvent('config-import-falhou', { motivo: 'texto não é JSON', tamanho: bruto.length, inicio: bruto.slice(0, 1), fim: bruto.slice(-1) });
                flash(bruto ? `✖ Não é uma config válida (${fmtNum(bruto.length)} caracteres${bruto.slice(-1) !== '}' ? '; o fim está faltando: o texto foi cortado ao copiar' : ''}). Exporte de novo e cole com Ctrl+V.` : '✖ A caixa está vazia: clique nela e cole com Ctrl+V.', 'error');
                return;
            }
            if (!data || typeof data !== 'object' || Array.isArray(data) || !('webhookUrl' in data)) {
                logEvent('config-import-falhou', { motivo: 'não é config deste script', chaves: Object.keys(data || {}).slice(0, 8) });
                flash('✖ Isso não parece uma config deste script.', 'error');
                return;
            }
            const origem = { versao: data._versao, conta: data._conta, em: data._exportadoEm };
            const dropsVindos = Array.isArray(data._drops) ? data._drops.map(Number).filter(n => n > 0) : [];
            const maisNova = Boolean(origem.versao && cmpVersion(origem.versao, VERSION) > 0);
            const desconhecidas = Object.keys(data).filter(k => !k.startsWith('_') && !(k in DEFAULTS) && !['sellProfiles', 'routes', 'routeName'].includes(k));
            for (const k of Object.keys(data)) if (k.startsWith('_')) delete data[k];
            const keepHooks = $('#pg-dn-import-keephooks').checked;
            const mine = { webhookUrl: cfg.webhookUrl, webhookShiny: cfg.webhookShiny, webhookAlerts: cfg.webhookAlerts, webhookLevel: cfg.webhookLevel };
            const perfisDaqui = Object.assign({}, cfg.sellProfiles || {});
            cfg = migrateCfg(Object.assign({}, DEFAULTS, data));
            if (keepHooks) Object.assign(cfg, mine);
            // v3.20.3: listas de venda por hunt SOMAM (a que veio ganha na mesma hunt); antes o import apagava as hunts
            // que só este painel tinha configurado.
            const perfisVindos = Object.keys(cfg.sellProfiles || {});
            const soDaqui = Object.keys(perfisDaqui).filter(k => !perfisVindos.includes(k));
            cfg.sellProfiles = Object.assign({}, perfisDaqui, cfg.sellProfiles || {});
            cfg.cfgVersion = 2;
            saveCfg(cfg);
            if (dropsVindos.length) { for (const id of dropsVindos) droppedIds.add(id); saveDropped(); }   // drops conhecidos do "Guardar na cidade"
            for (const k of Object.keys(ballAlerted)) delete ballAlerted[k];
            for (const k of Object.keys(autoBuyAttempted)) delete autoBuyAttempted[k];
            for (const k of Object.keys(supplyAttempted)) delete supplyAttempted[k];
            for (const k of Object.keys(evolveAttempted)) delete evolveAttempted[k];
            for (const k of Object.keys(evolveFailed)) delete evolveFailed[k];
            restartTripCycle();
            scheduleReload();
            loadHuntProfile();
            dirty = false;
            fill();
            const canais = ['webhookUrl', 'webhookShiny', 'webhookAlerts', 'webhookLevel'].filter(k => (cfg[k] || '').trim()).length;
            const resumo = [
                `${canais} ${canais === 1 ? 'canal' : 'canais'}${keepHooks ? ' (mantidos deste painel)' : ''}`,
                cfg.notifyEveryCapture ? 'avisa toda captura' : `lista com ${(cfg.watchList || []).length}`,
                `bolas ${cfg.autoBuy ? `compra ${cfg.autoBuyQty} abaixo de ${cfg.ballsMin || 1}` : (cfg.ballsMin ? `avisa abaixo de ${cfg.ballsMin}` : 'desligado')}`,
                `refil ${supplyOn() ? supplySlots().map(s => `${s.name} < ${s.min}`).join(', ') : 'desligado'}`,
                `Joy ${cfg.healJoyEnabled ? 'ligada' : 'desligada'}`,
                `volta da cidade ${cfg.cityIdleEnabled ? `${cfg.cityIdleMin} min` : 'desligada'}`,
                `drops ${cfg.sellEnabled ? 'ligado' : 'desligado'}, listas de ${Object.keys(cfg.sellProfiles || {}).length} hunts (${perfisVindos.length} vieram${soDaqui.length ? `, ${soDaqui.length} já eram daqui e ficaram` : ''})`,
                `Pokémon ${cfg.pokeSellEnabled ? 'ligado' : 'desligado'}, ${Object.keys(cfg.pokeSellLimits || {}).length} raridades com limite`,
                `viagem ${cfg.tripEveryMin}${cfg.tripEveryMaxMin > cfg.tripEveryMin ? `–${cfg.tripEveryMaxMin}` : ''} min (${cfg.tripCity})`,
                `${Object.keys(cfg.routes || {}).length} rotas de treino${cfg.routeName ? ` (ativa: ${cfg.routeName})` : ''}`,
                `captura ${cfg.catchRouteEnabled ? 'ligada' : 'desligada'}`, `daily ${cfg.dailyEnabled ? (cfg.dailyAuto ? 'sozinha' : 'ligada') : 'desligada'}`,
                `gift ${cfg.giftEnabled ? ({ daily: 'ligado', all: 'ligado + Gift Center todo', '': 'ligado, fica no correio' })[giftCenterMode(cfg)] : 'desligado'}`,
                `clã ${cfg.clanEnabled ? `${clanName(cfg.clanKey)}${cfg.clanRoute ? ' + caça' : ''}` : 'desligado'}`,
                `guardar: ${[familyList(cfg).length ? `${familyList(cfg).length} itens → família` : '', cfg.depositItems ? `drops → ${cfg.depositItems === 'depot' ? 'Depot' : 'família'}` : '', cfg.depositPokes ? 'Pokémon → família' : ''].filter(Boolean).join(', ') || 'desligado'}${dropsVindos.length ? ` (${dropsVindos.length} drops conhecidos)` : ''}`,
                `recarga ${cfg.reloadEnabled ? 'ligada' : 'desligada'}`,
            ].join(' · ');
            logEvent('config-importada', { origem, versaoAqui: VERSION, maisNova, desconhecidas, drops: dropsVindos.length, resumo });
            $('#pg-dn-import-text').value = ''; $('#pg-dn-import-box').hidden = true;   // aplicado: a caixa fecha
            if (maisNova || desconhecidas.length) {
                flash(`⚠ Importada, mas a config veio da v${origem.versao || '?'} e este painel roda a v${VERSION}${desconhecidas.length ? `: ${desconhecidas.length} opção(ões) nova(s) (${desconhecidas.slice(0, 4).join(', ')}) ficam guardadas sem aparecer` : ''}. Recarregue este painel (⟳ Atualizar tudo no PokeGrid) para usar tudo. ${resumo}`, 'warn', 0);
            } else {
                flash(`✔ Config importada${origem.conta ? ` de ${origem.conta}` : ''}${origem.versao ? ` (v${origem.versao})` : ''}: ${resumo}`, 'ok', 20000);
            }
        };


        renderState();
    }

    logEvent('script-carregado', { versao: VERSION, familia: familyList().length, guardar: [cfg.depositItems || '', cfg.depositPokes || ''] }); // /log mostra a versão de cada painel
    loadResume(); // antes do painel e dos timers: restaura o que a carga anterior guardou
    if (cfg.reloadEnabled) scheduleReload();
    buildUI();
    setInterval(() => requestBalls(0), BALLS_POLL_MS);
    setInterval(requestSupplies, SUPPLY_POLL_MS);
    setInterval(() => requestPokes(0), POKES_POLL_MS);
    setInterval(reloadTick, RELOAD_CHECK_MS);
    setInterval(dailyTick, DAILY_CHECK_MS);
    setInterval(giftTick, GIFT_TICK_MS);
    setInterval(slotTick, SLOT_TICK_MS);
    setInterval(breedTick, BREED_TICK_MS);
    if (cfg.breedEnabled) setTimeout(() => breedTick(true), 9000);   // 1ª leitura da incubadora logo após a carga
    if (cfg.slotEnabled) setTimeout(() => slotTick(true), 8000);   // 1ª leitura da slot machine logo após a carga
    setInterval(catchTick, CATCH_TICK_MS);
    setInterval(tripTick, TRIP_TICK_MS);
    setInterval(clanTick, CLAN_TICK_MS);
    setInterval(idleTick, IDLE_TICK_MS);
    if (!lastTripAt) restartTripCycle(); // 1ª viagem só depois de um intervalo inteiro (a recarga restaura o relógio)
    if (cfg.catchRouteEnabled) setTimeout(() => startCatchRoute('carga'), 8000); // depois do socket/retomada da recarga
    if (cfg.clanEnabled) setTimeout(clanTick, 8000);   // lê o clã logo na carga (REST) e pede a mochila
    if (cfg.dailyEnabled) scheduleDailyCheck(5000); // lê a missão do dia logo na carga (REST, não depende do socket)
    if (cfg.giftEnabled) scheduleGiftCheck(10000);  // Daily Gift: lê o calendário e resgata logo na carga (REST)

    console.log(TAG, `v${VERSION} ativo.`, 'Watch list:', cfg.watchList.join(', ') || '(vazia)',
        '| toda captura:', cfg.notifyEveryCapture, '| shiny:', cfg.notifyShiny,
        '| raridade mín.:', cfg.minTier ? `${cfg.minTier}${cfg.minTierIv ? ` com poder ${cfg.minTierIv}+` : ''}` : '(nenhuma)', '| poder mín.:', cfg.minIv || 0,
        '| alerta bolas:', effectiveBallsMin() ? `${cfg.ballsWatch} < ${effectiveBallsMin()}` : 'desligado',
        '| compra auto:', cfg.autoBuy ? `${cfg.autoBuyQty} un.` : 'não',
        '| refil:', supplyOn() ? supplySlots().map(s => `${s.name} < ${s.min} (+${s.qty})`).join(', ') : 'não',
        '| Joy:', cfg.healJoyEnabled ? 'cura e volta' : 'não',
        '| parada na cidade:', cfg.cityIdleEnabled ? `volta após ${cfg.cityIdleMin} min` : 'não',
        '| nível:', levelEnabled() ? `${levelTarget()}${swapEnabled() ? ' + troca' : ''}` : 'não',
        '| rota:', routeActive() ? routeStatus() : 'não',
        '| captura:', cfg.catchRouteEnabled ? `${catchAreas().join('+')}${cfg.catchRouteMaxLevel ? ` até lv ${cfg.catchRouteMaxLevel}` : ''}${cfg.catchRouteAuto ? ' + bola' : ''}` : 'não',
        '| daily:', cfg.dailyEnabled ? `${cfg.dailyAuto ? 'sozinha, ' : ''}volta para ${dailyReturnTarget() || 'a hunt anterior'}${cfg.dailyClaim ? ' + resgate' : ''}` : 'não',
        '| gift:', cfg.giftEnabled ? `sim (Gift Center: ${giftCenterMode() || 'não mexe'})` : 'não',
        '| venda pokes:', cfg.pokeSellEnabled ? TIERS_ASC.filter(t => pokeSellLimit(cfg, t.key) > 0).map(t => `${t.name}<${pokeSellLimit(cfg, t.key)}`).join(' ') || 'sem limites' : 'não',
        '| venda drops:', cfg.sellEnabled ? `${Object.keys(cfg.sellItems || {}).length} itens` : 'não',
        '| viagem à cidade:', `${cfg.tripCity} a cada ${cfg.tripEveryMin}${cfg.tripEveryMaxMin > cfg.tripEveryMin ? `–${cfg.tripEveryMaxMin}` : ''} min`,
        '| recarga auto:', cfg.reloadEnabled ? `${cfg.reloadEveryMin}${cfg.reloadEveryMaxMin > cfg.reloadEveryMin ? `–${cfg.reloadEveryMaxMin}` : ''} min` : 'não');
})();
