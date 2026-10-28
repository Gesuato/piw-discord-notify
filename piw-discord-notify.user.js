// ==UserScript==
// @name         PIW Discord Capture Notify
// @namespace    piw-discord-notify
// @version      3.50.1
// @author       Gesuato
// @description  Notifica um webhook do Discord quando você captura um Pokémon (todos, uma lista ou shinys) no Poke Idle World. Feito para o injetor de scripts do PokeGrid.
// @match        https://poke.idleworld.online/play
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const TAG = '[PIW-DiscordNotify]';
    const VERSION = '3.50.1';        // manter igual ao @version do cabeçalho
    const LS_KEY = 'pgDiscordNotifyCfg';

    // ---- Configuração (persistida no localStorage do painel) --------
    // Clique no botão 🔔 no canto inferior esquerdo do jogo para
    // configurar webhook, lista de Pokémon, shiny etc.

    const DEFAULTS = {
        webhookUrl: '',         // canal principal (capturas); os outros caem nele se vazios
        webhookShiny: '',       // canal só para capturas shiny (opcional)
        webhookAlerts: '',      // canal para alertas: shiny na fila, estoque, quedas... (opcional)
        webhookLevel: '',       // canal para alertas de nível (vazio: NÃO envia)
        webhookHuman: '',       // v3.41.0: canal para a verificação humana / captcha (vazio: cai em Alertas)
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
        cityIdleHunt: '',       // v3.36.0 hunt padrão: destino de último recurso da volta (sem rota, clã nem última hunt conhecida)
        sellEnabled: false,     // vender drops marcados da hunt atual periodicamente
        sellEveryMin: 10,       // intervalo mínimo da venda automática (minutos)
        sellEveryMaxMin: 0,     // intervalo máximo; 0 ou <= mínimo = intervalo fixo. Entre os dois é sorteado
        sellItems: {},          // lista BRANCA: itemId -> { keep: N } (manter pelo menos N)
        sellProfiles: {},       // por hunt: slug -> { items, everyMin, everyMaxMin } (carregado ao entrar)
        pokeSellEnabled: false, // vender Pokémon fora do time pelas regras abaixo (v3.11.0)
        pokeSellLimits: {},     // v3.12.0: raridade (chave: weak..divine) -> vende se poder (ivTotal) < limite; ausente/0 = não vende
        pokeSellKeepQuality: 0, // v3.34.0: qualidade (multiplicador) a partir da qual NUNCA vende, ex.: 1.8; 0 = só as regras por raridade
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
        dailyAreas: ['kanto', 'outland'], // v3.37.0: regiões de hunt aceitas pela daily sozinha (orre fica de fora por padrão)
        dailyAuto: false,       // v3.16.0: fazer a daily sozinho (escolhe missão e Pokémon do time, vai e volta)
        giftEnabled: false,     // v3.24.0 Daily Gift: resgatar o presente do dia (calendário de 28 dias) sozinho
        giftCenterMode: 'daily', // ...e no Gift Center (correio): 'daily' = entregar só o do dia | 'all' = tudo que aparecer | '' = não mexer
        evolveEnabled: false,   // v3.25.0 Evolução: quem do time chega ao nível vai à cidade (Cerulean) e evolui com as pedras da mochila
        evolveFromDepot: true,  // v3.39.0 ...pedra que falta na mochila: busca no Depot comum (POST /api/game/depot/move withdraw)
        evolveFromFamily: true, // v3.39.0 ...e no depósito da família (family-action item withdraw), nessa ordem
        slotEnabled: false,     // v3.26.0 Poke Slot Machine: na viagem à cidade (shopping) gira o roll grátis e ativa o bônus
        slotWanted: '',         // ...Pokémon pedidos, em ordem de preferência (vírgula); nenhum sorteado = escolhe um qualquer
        gymEnabled: false,      // v3.45.0 Ginásios: na viagem à cidade desafia os ginásios sem insígnia (modo Insígnia, time atual)
        gymBonus: true,         // ...e resgata a Recompensa bônus (pedras de evolução) que a vitória libera
        gymRedo: true,          // ...refaz o ginásio quando o bônus volta a pedir vitória (a cada 48 h)
        gymAlerts: true,        // ...avisa no canal de Alertas (insígnia, derrota, bônus, outfit das 18)
        invEnabled: false,      // v3.50.0 Invasão Rocket: entrar sozinho em cada janela (horas pares de Brasília) e voltar para a hunt
        invHours: '',           // ...só nestas horas (pares, Brasília; ex.: "0, 12, 20"); vazio = toda invasão
        invKeepEnergy: 0,       // ...não entra se a Energia Vermelha ficar em/abaixo disto (2 por dia, acumula 10)
        invAlerts: true,        // ...avisa no canal de Alertas (fim da rodada, recusa, entrada que falhou, trocas na Jenny)
        invJennyEnabled: false, // ...trocar Rocket Plans na Officer Jenny (Shopping) na viagem à cidade
        invJennyOffer: '',      // ...chave da oferta escolhida (lida da janela da Jenny: ball, token, outfit, medal...)
        invJennyKeep: 0,        // ...Plans que ficam guardados (nunca troca abaixo disto)
        bossResumeEnabled: true, // v3.43.0 Auto Boss do jogo: retomar quando parar sem terminar (erro, saiu da arena, reconexão)
        bossResumeOnLoss: false, // ...também depois de derrota (cura na Joy antes; cada derrota perde 1 token)
        bossAlerts: true,       // ...avisar no canal de Alertas (retomada, desistência, fim)
        breedEnabled: false,    // v3.29.0 Breeding (aba 🥚): cruzar quem sobe com comida mais fraca (Grátis), chocar e repetir
        breedLines: [],         // ...até 2 linhagens: [{ id, name, speciesId, gen, q0, iv0, lastQ, lastIv, eggId, pendingChild, food? } | null]; `food` (v3.48.0) = comida em criação, mesmo formato
        breedFoodIvMax: 150,    // ...comida só com IV abaixo disto (além de quality e IV menores que quem sobe); 0 = sem teto
        breedKeepMax: 20,       // v3.47.0 ...quantos da espécie (além de quem sobe) ficam fora da venda por linhagem; 0 = todos na faixa
        breedFamily: true,      // ...comida e stones também do depot da família (retirada na viagem à cidade)
        breedDouble: true,      // ...dobrar stones (40 em vez de 20): 5% de +1 IV no filho
        breedFoodBreed: false,  // v3.48.0 ...criar comida: sem capturado que sirva, cruza o melhor da espécie abaixo da faixa com um mais fraco até ele entrar na faixa de quem sobe
        guildDonateGold: 0,     // v3.31.0 Guild (aba 🛡): gold a doar por dia para a próxima vaga (0 = não doa; o jogo limita a 500.000/dia por membro)
        guildDonateKeep: 0,     // ...gold que fica sempre na conta (não doa o que faria o saldo cair abaixo disto)
        guildTributeEnabled: false, // ...depositar o item do Tributo do Dia que estiver na mochila (o item fica fora da venda enquanto o tributo está aberto)
        guildTributeKeep: 0,    // ...quantos do item do dia guardar na mochila
        guildAlerts: false,     // ...avisar no canal de Alertas caçada/daily/tributo concluídos, tier, vaga nova e convites (ligar em UM painel só)
        guildHuntEnabled: false, // v3.32.0 rota da guild (4ª rota excludente): caçar a espécie da caçada "Derrotar" até a meta fechar
        guildFishEnabled: false, // ...pescar (hunt `pesca`, faixa natural da skill) para a caçada "Pescar peixes"
        guildFarmTribute: false, // ...farmar o item do Tributo do Dia na hunt que mais o dropa (e depositar)
        guildRouteOrder: ['tributo', 'fish', 'kill'], // v3.42.0 prioridade dos objetivos da rota da guild (1º que der entra); pedido: pesca antes do "Derrotar"
        farmEnabled: false,     // v3.33.0 Farm por lista (aba 🎒): dropar N de cada item na hunt do monstro indicado, um item de cada vez
        farmList: [],           // ...[{ item, qty, hunt, got }] em ordem; hunt '' = a que mais dropa o item até o nível do time; got = drops contados
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
        if (typeof bossBusy === 'function' && bossBusy()) return;   // v3.43.0: o HUD do jogo bloqueia o summon durante boss; o script também espera
        if (typeof invBusy === 'function' && invBusy()) return;    // v3.50.0: dentro da Invasão Rocket o time reveza sozinho; troca de líder espera
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
        if (typeof holdActive === 'function' && holdActive()) { holdBlocked(slug, origem); return false; }   // v3.44.0: espera na cidade pelo botão do painel: nada entra em hunt
        if (huntSwitch?.timer) clearTimeout(huntSwitch.timer);
        if (origem !== 'recarga' && origem !== 'viagem' && origem !== 'cura' && origem !== 'cidade' && origem !== 'invasao' && origem !== 'invasao-volta') sendGame({ type: 'leave-hunt' }); // recarga/viagem/cura/cidade: a conta já está na cidade
        huntSwitch = { slug, at: 0, tries: tentativa, timer: null, origem };
        huntSwitch.timer = setTimeout(() => {
            if (!huntSwitch || huntSwitch.slug !== slug) return;
            huntSwitch.at = Date.now();
            const ok = sendGame({ type: 'enter-hunt', slug }) && sendGame({ type: 'pending-get' });
            const tela = nudgeClientToHunt(slug);
            logEvent('hunt-troca', { slug, tentativa, origem, enviado: ok, tela });
            huntSwitch.timer = setTimeout(() => confirmHuntSwitch(slug), HUNT_CONFIRM_MS);
        }, HUNT_ENTER_DELAY_MS);
        return true;
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
        if (origem === 'invasao') { invHuntFailed(slug, origem); return; }   // v3.50.0: o módulo da invasão avisa e devolve a conta à hunt
        const t = {
            recarga: { verbo: 'voltar para a', quando: 'depois da recarga automática', titulo: `Recarga: volta para ${slug} não confirmou`, dica: 'A conta deve estar na cidade: entre na hunt na mão.' },
            guild: { verbo: 'entrar na', quando: 'rota da guild', titulo: `Guild: entrada em ${slug} não confirmou`, dica: 'Essa hunt foi pulada nesta sessão; a rota da guild segue para o próximo objetivo.' },
            farm: { verbo: 'entrar na', quando: 'farm por lista', titulo: `Farm: entrada em ${slug} não confirmou`, dica: 'Essa hunt foi pulada nesta sessão; o farm tenta outra hunt do mesmo monstro ou passa para o próximo item da lista.' },
            cla: { verbo: 'entrar na', quando: 'rota do clã', titulo: `Clã: entrada em ${slug} não confirmou`, dica: 'Essa hunt foi pulada nesta sessão; a rota do clã segue para a próxima melhor.' },
            'daily-ida': { verbo: 'entrar na', quando: 'Daily Kill sozinha', titulo: `Daily Kill: entrada em ${slug} não confirmou`, dica: 'O script devolveu o líder e voltou para a hunt de antes; faça a daily na mão hoje (o nível da hunt pode ser alto demais).' },
            daily: { verbo: 'voltar para a', quando: 'depois da Daily Kill', titulo: `Daily Kill: volta para ${slug} não confirmou`, dica: 'Confira o nome da hunt em "Voltar para" (ou entre na hunt na mão).' },
            rota: { verbo: 'entrar na', quando: 'rota', titulo: `Rota: entrada em ${slug} não confirmou`, dica: 'Confira o nome da hunt (é o mesmo que aparece em "Hunt atual") e entre na mão; a rota continua da etapa atual.' },
            painel: { verbo: 'entrar na', quando: 'botão do painel', titulo: `Painel: entrada em ${slug} não confirmou`, dica: 'Confira o nome da hunt da etapa e entre na mão.' },
            captura: { verbo: 'entrar na', quando: 'rota de captura', titulo: `Rota de captura: entrada em ${slug} não confirmou`, dica: 'Essa hunt foi pulada nesta sessão; a rota segue para a próxima espécie.' },
            cura: { verbo: 'voltar para a', quando: 'depois da cura na Nurse Joy', titulo: `Cura: volta para ${slug} não confirmou`, dica: 'A conta está curada na cidade: entre na hunt na mão (se o time caiu de novo na entrada, a hunt pode estar forte demais).' },
            cidade: { verbo: 'voltar para a', quando: 'conta parada na cidade', titulo: `Parada na cidade: volta para ${slug} não confirmou`, dica: 'Tento de novo depois de outro período parado (no máximo 3x em 1 h); ou entre na hunt na mão.' },
            'invasao-volta': { verbo: 'voltar para a', quando: 'depois da Invasão Rocket', titulo: `Invasão Rocket: volta para ${slug} não confirmou`, dica: 'A conta deve estar em Cerulean: entre na hunt na mão (a parada na cidade também tenta).' },
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
        if (origem === 'guild') guildHuntFailed(slug);
        if (origem === 'farm') farmHuntFailed(slug);
        if (origem === 'invasao-volta') invHuntFailed(slug, origem);
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
        if (!res.ok) {
            // v3.40.0: 403 { code:'human-check' } = o servidor quer a verificação humana (Cloudflare) antes de atender.
            if (res.status === 403 && typeof humanOnRestForbidden === 'function' && humanOnRestForbidden(body, url)) {
                throw new Error('verificação humana pendente: clique no desafio da Cloudflare no painel do jogo');
            }
            throw new Error(body?.message || `HTTP ${res.status}`);
        }
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
        invOnHuntChange(novo);    // v3.50.0: a hunt virou a Invasão Rocket (nossa entrada confirmando ou botão INVASÃO da tela) — ANTES das rotas, para `invBusy()` já segurar a reentrada delas
        catchOnHuntChange(novo);
        guildOnHuntChange(novo);
        farmOnHuntChange(novo);
        idleOnHuntChange(novo);
        holdOnHuntChange(novo);   // v3.44.0: espera na cidade ligada e a tela religou a hunt: sai de novo
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
        else if (m?.type === 'set-city') { tripOnSetCity(); healOnSetCity(); pokesOnSetCity(); holdOnSetCity(); invOnSetCity(); armResume(RESUME_AFTER_CITY_MS); } // SPA na cidade: viagem chegou / hora de voltar pra hunt
        else if (m?.type === 'auto-boss-start' || m?.type === 'auto-boss-stop') bossOnOutgoing(m);   // v3.43.0: intenção do Auto Boss (pela tela ou pela retomada)
        // v3.29.2: todo `family-action` enviado (pela tela OU pelo script) entra no log com os campos, para confirmar o formato da
        // retirada (`dir:'withdraw'`) que o breeding usa — a janela "Família" do jogo passa por aqui também.
        // v3.30.0: todo `guild-action` enviado (pela tela do jogo; o script ainda não envia nenhum) entra no log com os campos,
        // para confirmar o formato de doação de gold, tributo etc. antes de automatizar.
        else if (m?.type === 'guild-action') logEvent('guild-envio', { action: m.action ?? null, dados: Object.fromEntries(Object.entries(m).filter(([k]) => k !== 'type' && k !== 'action')) });
        else if (m?.type === 'family-action') logEvent('familia-envio', { action: m.action ?? null, dir: m.dir ?? null, itemId: m.itemId ?? null, quantity: m.quantity ?? null, capturedId: m.capturedId ?? null, campos: Object.keys(m).filter(k => k !== 'type') });
        else if (m?.type === 'breedbox-move') logEvent('breedbox-envio', { dir: m.dir ?? null, n: Array.isArray(m.pokeIds) ? m.pokeIds.length : null, campos: Object.keys(m).filter(k => k !== 'type') });   // v3.49.0: Breeding Box (pela tela ou pelo script)
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
                if (typeof guildKeepsItem === 'function' && guildKeepsItem(id)) continue;  // v3.31.0: item do Tributo do Dia da guild
                if (typeof farmKeepsItem === 'function' && farmKeepsItem(id)) continue;    // v3.33.0: item da lista de farm
                if (typeof bossKeepsItem === 'function' && bossKeepsItem(id)) continue;    // v3.43.1: token do Auto Boss pendente
                if (typeof invKeepsItem === 'function' && invKeepsItem(id)) continue;     // v3.50.0: Rocket Plans (não vendem nem vão para a família)
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
    // v3.34.0: `pokeSellKeepQuality` (ex.: 1.8) = piso de qualidade: `quality` igual ou acima disso NUNCA vende, qualquer que
    // seja o poder/raridade (pedido do usuário: "qualidade acima de 1.79 não vende"; a raridade é uma faixa larga, a qualidade é
    // o número exato do indivíduo, e o breeding cria 1.805, 1.84…). 0 = desligado.
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
    // v3.34.0: piso de qualidade protegido (0 = desligado). Aceita vírgula decimal ("1,79") vinda do painel.
    function pokeSellKeepQ(d) { const v = parseFloat(String((d || cfg).pokeSellKeepQuality ?? '').replace(',', '.')); return Number.isFinite(v) && v > 0 ? v : 0; }

    // Motivo para NÃO vender `p` com as regras `d` (cfg ou rascunho do painel); null = vende.
    function pokeSellReason(p, d) {
        d = d || cfg;
        if (!p || typeof p !== 'object') return 'inválido';
        if (p.team || p.leader) return 'no time';
        if (p.starter) return 'inicial';
        if (p.shiny) return 'shiny';
        if (Number(p.level) > 1) return `nível ${Number(p.level)}`;   // v3.38.0: quem já treinou (nível > 1) NUNCA vende (pedido do usuário em 16/10/2026)
        if (p.locked) return 'cadeado';
        if (p.listed || p.tradeId) return 'anunciado no mercado';   // `listed` = anúncio no mercado (bundle: o depósito também bloqueia)
        if (p.breedingBox) return 'na Breeding Box';   // v3.49.0: lá dentro o jogo não vende (nem Mercado, troca, família ou time)
        if (p.sellValue != null && !(Number(p.sellValue) > 0)) return 'sem valor';
        if (pokeSellRejected.has(String(p.id))) return `recusado pelo jogo (${pokeSellRejected.get(String(p.id))})`;
        const at = recentCaptureIds.get(String(p.id));
        if (at && Date.now() - at < POKE_SELL_RECENT_MS) return 'capturado agora';
        if (typeof clanKeepsSpecies === 'function' && clanKeepsSpecies(Number(p.speciesId))) return 'tarefa do clã';
        if (typeof breedKeepsPoke === 'function' && breedKeepsPoke(p)) return 'breeding';   // v3.29.0: quem sobe e a espécie dele (v3.47.0: até o teto `breedKeepMax`)
        const keepQ = pokeSellKeepQ(d), q = Number(p.quality);
        if (keepQ && Number.isFinite(q) && q >= keepQ) return `qualidade ${q} ≥ ${keepQ}`;   // v3.34.0: piso de qualidade
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
        if (!catchRouteActive() || !catchTarget || !huntCatalog || tripRunning || (typeof healBusy === 'function' && healBusy()) || (typeof bossBusy === 'function' && bossBusy()) || (typeof invBusy === 'function' && invBusy()) || (typeof holdActive === 'function' && holdActive())) return;
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
        if (!catchTarget || huntSwitch || catchBusy || catchReenterTimer || tripRunning || (typeof healBusy === 'function' && healBusy()) || (typeof bossBusy === 'function' && bossBusy()) || (typeof invBusy === 'function' && invBusy()) || (typeof holdActive === 'function' && holdActive())) return;
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
    // v3.37.0 (pedido do usuário em 12/10/2026: "bloquear os monstros da daily em Orre"): `cfg.dailyAreas` (padrão kanto +
    // outland) limita as regiões de hunt que a daily sozinha aceita. `dailyHuntFor` só devolve hunt dessas regiões (a espécie
    // pode ter hunt em mais de uma; a de menor nível entre as permitidas); missão sem hunt permitida não é escolhida e, se o
    // usuário a escolheu na mão, a ida não acontece (status/log `daily-auto-espera` dizem a região bloqueada).

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
    const DAILY_AREAS_ALL = ['kanto', 'orre', 'outland', 'nightmare'];
    const DAILY_AREAS_DEFAULT = ['kanto', 'outland'];
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
    let lastRealHunt = null;        // última hunt (não cidade) vista (v3.35.0: também em localStorage, ver loadLastHunt)
    // v3.35.0: a última hunt sobrevive à recarga (⟳ do PokeGrid, F5, PokeGrid fechado e aberto). Antes, depois de uma recarga
    // manual, `lastRealHunt` nascia nulo e a parada na cidade ficava "não sei de que hunt veio" para sempre sem rota/clã.
    const LAST_HUNT_KEY = 'pgDiscordNotifyLastHunt';
    const LAST_HUNT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
    function saveLastHunt(slug) {
        try { localStorage.setItem(LAST_HUNT_KEY, JSON.stringify({ slug, at: Date.now() })); } catch { /* sem localStorage: vale só nesta carga */ }
    }
    // Lida na carga (loadResume): { slug, at } da última hunt, ou null se não há, é cidade ou tem mais de 24 h.
    function loadLastHunt() {
        try {
            const r = JSON.parse(localStorage.getItem(LAST_HUNT_KEY) || 'null');
            const slug = r && r.slug ? normalize(r.slug) : null;
            if (!slug || CITY_SLUGS.includes(slug)) return null;
            const idade = Date.now() - (Number(r.at) || 0);
            if (idade < 0 || idade > LAST_HUNT_MAX_AGE_MS) return null;
            return { slug, at: Number(r.at) || 0 };
        } catch { return null; }
    }
    let onDailyChange = null;       // callback do painel para redesenhar o status
    let dailyAutoBusy = false;
    let dailyPickTried = 0;         // resetAt da missão que já tentamos escolher (não repete o POST /pick)
    let dailyAutoNote = '';         // último motivo de a daily sozinha não ir (status do painel; log só quando muda)
    let dailyRun = loadDailyRun();  // { resetAt, name, slug, from, leaderId, leaderName, pokeId, pokeName, eff, goes, lastGoAt, over }

    function dailyEnabled() { return Boolean(cfg.dailyEnabled); }
    function dailyAutoOn() { return Boolean(cfg.dailyEnabled && cfg.dailyAuto); }
    // Regiões de hunt aceitas pela daily sozinha (d = cfg ou rascunho); lista vazia/inválida = padrão (kanto + outland).
    function dailyAreas(d) {
        d = d || cfg;
        const a = Array.isArray(d.dailyAreas) ? d.dailyAreas.map(x => normalize(x)).filter(x => DAILY_AREAS_ALL.includes(x)) : [];
        return a.length ? a : DAILY_AREAS_DEFAULT.slice();
    }
    function dailyAreaOk(h) { return !h?.area || dailyAreas().includes(normalize(h.area)); } // hunt sem área (catálogo velho) passa
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
        if (!slug || CITY_SLUGS.includes(slug) || (typeof bossIsArena === 'function' && bossIsArena(slug)) || (typeof invIsRaid === 'function' && invIsRaid(slug))) return;   // v3.43.0: a arena do boss não é hunt de volta; v3.50.0: nem a invasão
        if (lastRealHunt && lastRealHunt !== slug) prevHuntSlug = lastRealHunt;
        if (lastRealHunt !== slug) dailyKillsHere = 0;
        lastRealHunt = slug;
        saveLastHunt(slug);
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
    // Hunts da espécie da missão, em qualquer região (o catálogo vem ordenado por nível).
    function dailyHuntsFor(o) {
        if (!Array.isArray(huntCatalog) || !o) return [];
        const nome = normalize(o.name);
        const porId = o.speciesId ? huntCatalog.filter(h => h.speciesId === o.speciesId) : [];
        if (porId.length) return porId;
        return huntCatalog.filter(h => normalize(h.speciesName || '') === nome || normalize(h.name) === nome || h.slug === huntSlugFromName(o.name));
    }
    // Hunt da espécie da missão: a de menor nível entre as regiões permitidas (v3.37.0); null = nenhuma permitida.
    function dailyHuntFor(o) {
        return dailyHuntsFor(o).find(dailyAreaOk) || null;
    }
    // Regiões em que a espécie tem hunt mas que estão bloqueadas (para explicar no status/log).
    function dailyBlockedAreas(o) {
        return [...new Set(dailyHuntsFor(o).filter(h => !dailyAreaOk(h)).map(h => normalize(h.area)))];
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
        if (huntSwitch || tripRunning || swapPending || (typeof healBusy === 'function' && healBusy()) || (typeof bossBusy === 'function' && bossBusy()) || (typeof invBusy === 'function' && invBusy()) || (typeof holdActive === 'function' && holdActive())) return;       // outra troca/viagem/cura/Auto Boss/espera na cidade em andamento: próximo tique
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
        if (!melhor) {
            const bloqueadas = daily.options.map(o => ({ nome: o.name, regioes: dailyBlockedAreas(o) })).filter(x => x.regioes.length);
            const motivo = bloqueadas.length === daily.options.length
                ? `todas as opções ficam em região bloqueada (${[...new Set(bloqueadas.flatMap(x => x.regioes))].join(', ')})`
                : 'nenhuma opção com hunt conhecida';
            noteDailyAuto(motivo, { opcoes: daily.options.map(o => o.name), bloqueadas, regioes: dailyAreas() });
            return;
        }
        try {
            await gameApi(DAILY_PICK_URL, { method: 'POST', body: JSON.stringify({ idx: melhor.o.idx }) });
        } catch (err) { noteDailyAuto('o jogo recusou a escolha da missão', { erro: String(err?.message || err) }); return; }
        logEvent('daily-auto-escolha', { missao: melhor.o.name, idx: melhor.o.idx, hunt: melhor.hunt.slug, regiao: melhor.hunt.area || null, regioes: dailyAreas(), pokemon: melhor.best.p.name, eff: melhor.best.eff,
            opcoes: plano.map(x => ({ nome: x.o.name, pokemon: x.best.p.name, eff: x.best.eff, nota: Math.round(x.nota * 100) / 100 })) });
        noteDailyAuto('');
        await refreshDaily();
        if (daily?.picked && !daily.done && !daily.claimed) dailyAutoGo();
    }
    function dailyAutoGo() {
        const o = daily.options[daily.pickedIdx];
        const hunt = dailyHuntFor(o);
        if (!hunt) {
            const bloq = dailyBlockedAreas(o);
            noteDailyAuto(bloq.length ? `a hunt de ${daily.name} fica em ${bloq.join('/')} (região bloqueada): faça na mão ou libere a região` : `não achei a hunt de ${daily.name}`, { regioes: dailyAreas() });
            return;
        }
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
    //   v3.39.0 (pedido do usuário em 16/10/2026: "ir buscar no depot pessoal ou família as pedras necessárias"): pedra que
    //   falta na mochila é buscada, nessa ordem, no Depot comum (`GET /api/game/depot` → `depot[]`; `POST /api/game/depot/move
    //   { itemId, dir:'withdraw' }` traz a PILHA inteira para a mochila; `cfg.evolveFromDepot`) e no depósito da família
    //   (`family-get` → `depot.items[{ itemId, quantity }]`; `familyItemWithdraw` = `family-action item withdraw` com a quantidade
    //   exata; `cfg.evolveFromFamily`). Só busca quando o jogo diz `canEvolve` (nível ok) e quando Depot + família completam a
    //   conta; depois relê a janela de evolução e só evolui se `hasStones` virar true. Linha ramificada: busca só se as pedras
    //   completam UM destino. Log `evolucao-pedras` por pedra buscada.

    const EVOLVE_URL = '/api/game/evolve';
    const EVOLVE_DEPOT_URL = '/api/game/depot';
    const EVOLVE_DEPOT_MOVE_URL = '/api/game/depot/move';
    const EVOLVE_CITY = 'cerulean';
    const EVOLVE_CITY_WAIT_MS = 2000;
    const EVOLVE_FAMILY_WAIT_MS = 5000;     // espera pelo frame `family` depois do `family-get`
    const EVOLVE_FAMILY_FRESH_MS = 60000;   // frame `family` mais novo que isso não é pedido de novo
    const EVOLVE_AFTER_MOVE_MS = 700;       // pausa entre movimentos (o servidor é lento)

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
    const evolveSleep = (ms) => new Promise(r => setTimeout(r, ms));
    const evolveFetchOn = (d) => { d = d || cfg; return Boolean(d.evolveFromDepot) || Boolean(d.evolveFromFamily); };

    // Pedras que faltam para uma lista `stones` da janela de evolução: [{ itemId, name, need, have, falta }].
    function evolveMissing(stones) {
        return (Array.isArray(stones) ? stones : [])
            .map(s => ({ itemId: Number(s?.itemId), name: s?.name || `Item ${s?.itemId}`, need: Number(s?.need) || 0, have: Number(s?.have) || 0 }))
            .map(s => Object.assign(s, { falta: Math.max(0, s.need - s.have) }))
            .filter(s => s.falta > 0 && Number.isFinite(s.itemId));
    }
    // Quanto há de cada item fora da mochila: Depot comum (`depot[]` do GET) e família (último frame `family`).
    async function evolveStoneSources() {
        const src = { depot: new Map(), familia: new Map(), depotErro: null, familiaErro: null };
        if (cfg.evolveFromDepot) {
            try {
                const r = await gameApi(EVOLVE_DEPOT_URL);
                for (const it of (Array.isArray(r?.depot) ? r.depot : [])) {
                    const id = Number(it?.id ?? it?.itemId); const q = Number(it?.quantity) || 0;
                    if (Number.isFinite(id) && q > 0) src.depot.set(id, q);
                }
            } catch (err) { src.depotErro = String(err?.message || err); }
        }
        if (cfg.evolveFromFamily) {
            if (typeof familyDepotItems !== 'function' || typeof familyItemWithdraw !== 'function') src.familiaErro = 'módulo da família indisponível';
            else {
                if (Date.now() - familyDepotAt() > EVOLVE_FAMILY_FRESH_MS) {
                    const t0 = familyDepotAt();
                    if (sendGame({ type: 'family-get' })) {
                        const ini = Date.now();
                        while (familyDepotAt() === t0 && Date.now() - ini < EVOLVE_FAMILY_WAIT_MS) await evolveSleep(250);
                        if (familyDepotAt() === t0) src.familiaErro = 'a família não respondeu';
                    } else src.familiaErro = 'socket do jogo não rastreado';
                }
                for (const it of familyDepotItems()) {
                    const id = Number(it?.itemId ?? it?.id); const q = Number(it?.quantity) || 0;
                    if (Number.isFinite(id) && q > 0) src.familia.set(id, q);
                }
            }
        }
        return src;
    }
    // Depot + família completam todas as pedras de `missing`?
    const evolveCovered = (missing, src) => missing.every(s => (src.depot.get(s.itemId) || 0) + (src.familia.get(s.itemId) || 0) >= s.falta);
    const evolveMissingTxt = (missing, src) => missing.map(s => `${s.need}x ${s.name} (tem ${s.have}${src ? `, depot ${src.depot.get(s.itemId) || 0}, família ${src.familia.get(s.itemId) || 0}` : ''})`).join(', ');

    // Traz para a mochila o que falta de cada pedra: Depot primeiro (pilha inteira), depois família (quantidade exata).
    // Devolve null quando tudo foi buscado; senão o motivo da falha.
    async function evolveFetchStones(p, missing, src) {
        for (const s of missing) {
            let resta = s.falta;
            const log = { id: p.id, name: p.name, item: s.name, itemId: s.itemId, falta: s.falta, depot: src.depot.get(s.itemId) || 0, familia: src.familia.get(s.itemId) || 0, doDepot: 0, daFamilia: 0, ok: false, motivo: null };
            try {
                const noDepot = src.depot.get(s.itemId) || 0;
                if (noDepot > 0) {
                    await gameApi(EVOLVE_DEPOT_MOVE_URL, { method: 'POST', body: JSON.stringify({ itemId: s.itemId, dir: 'withdraw' }) });
                    log.doDepot = noDepot; resta -= noDepot; src.depot.delete(s.itemId);
                    await evolveSleep(EVOLVE_AFTER_MOVE_MS);
                }
                if (resta > 0) {
                    const naFamilia = src.familia.get(s.itemId) || 0;
                    const tirar = Math.min(resta, naFamilia);
                    if (tirar > 0) {
                        const r = await familyItemWithdraw(s.itemId, tirar, s.name);
                        if (!r.ok) throw new Error(`família: ${r.motivo}`);
                        log.daFamilia = tirar; resta -= tirar; src.familia.set(s.itemId, naFamilia - tirar);
                        await evolveSleep(EVOLVE_AFTER_MOVE_MS);
                    }
                }
                if (resta > 0) throw new Error(`faltam ${resta} fora da mochila`);
                log.ok = true;
            } catch (err) { log.motivo = String(err?.message || err); }
            logEvent('evolucao-pedras', log);
            if (!log.ok) return `${s.name}: ${log.motivo}`;
        }
        return null;
    }

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
        let fontes = null;   // Depot + família, lidos uma vez por viagem e só quando alguma pedra falta
        for (const p of cand) {
            let info = null, motivo = null, destId = null, pedras = null, para = null, buscou = null;
            try {
                info = await gameApi(`${EVOLVE_URL}?capturedId=${encodeURIComponent(p.id)}`);
                // v3.39.0: pedra que falta é buscada no Depot/família (uma rodada por Pokémon) e a janela é relida.
                const decide = (inf) => {
                    const ramos = Array.isArray(inf?.branches) ? inf.branches : [];
                    const r = { motivo: null, destId: null, pedras: null, para: null, buscar: null };
                    if (ramos.length) {
                        const prontos = ramos.filter(b => b && b.canEvolve && b.hasStones);
                        if (prontos.length === 1) { r.destId = prontos[0].destId; r.pedras = prontos[0].stones; r.para = prontos[0].destName; }
                        else if (!prontos.length) {
                            r.motivo = `faltam pedras (${ramos.map(b => `${b.destName}: ${evolveStonesTxt(b.stones) || '?'}`).join(' · ')})`;
                            r.buscar = ramos.filter(b => b && b.canEvolve && evolveMissing(b.stones).length).map(b => ({ dest: b.destName, missing: evolveMissing(b.stones) }));
                        } else r.motivo = `linha ramificada com pedra para ${prontos.map(b => b.destName).join(' e ')}: escolha no jogo`;
                    } else if (!inf || inf.canEvolve !== true) r.motivo = `o jogo diz que ainda não pode (nível ${inf?.level ?? '?'}, precisa ${inf?.needLevel ?? '?'})`;
                    else if (!inf.hasStones) {
                        r.motivo = `faltam pedras (${evolveStonesTxt(inf.stones) || 'sem lista'})`;
                        const missing = evolveMissing(inf.stones);
                        if (missing.length) r.buscar = [{ dest: inf.destName, missing }];
                    } else { r.pedras = inf.stones; r.para = inf.destName; }
                    if (r.buscar && !r.buscar.length) r.buscar = null;
                    return r;
                };
                let dec = decide(info);
                if (dec.buscar && evolveFetchOn()) {
                    if (!fontes) fontes = await evolveStoneSources();
                    const completa = dec.buscar.filter(b => evolveCovered(b.missing, fontes));
                    if (completa.length === 1) {
                        buscou = completa[0].dest;
                        const erro = await evolveFetchStones(p, completa[0].missing, fontes);
                        if (erro) dec.motivo = `busca das pedras falhou (${erro})`;
                        else {
                            info = await gameApi(`${EVOLVE_URL}?capturedId=${encodeURIComponent(p.id)}`);
                            dec = decide(info);
                            if (dec.motivo && dec.buscar) dec.motivo = `pedras buscadas, mas o jogo ainda diz que faltam (${dec.buscar.map(b => evolveMissingTxt(b.missing)).join(' · ')})`;
                        }
                    } else if (completa.length > 1) dec.motivo = `linha ramificada com pedra (Depot/família) para ${completa.map(b => b.dest).join(' e ')}: escolha no jogo`;
                    else {
                        const extra = [fontes.depotErro ? `Depot: ${fontes.depotErro}` : null, fontes.familiaErro ? `família: ${fontes.familiaErro}` : null].filter(Boolean);
                        dec.motivo = `faltam pedras (${dec.buscar.map(b => `${dec.buscar.length > 1 ? `${b.dest}: ` : ''}${evolveMissingTxt(b.missing, fontes)}`).join(' · ')})${extra.length ? ` · ${extra.join('; ')}` : ''}`;
                    }
                }
                motivo = dec.motivo; destId = dec.destId; pedras = dec.pedras; para = dec.para;
                if (!motivo) {
                    const body = Object.assign({ capturedId: p.id, useStone: true }, destId != null ? { destId } : {});
                    const r = await gameApi(EVOLVE_URL, { method: 'POST', body: JSON.stringify(body) });
                    para = r?.name || para || p.dest;
                    feitos.push({ id: p.id, de: p.name, para, level: p.level, pedras: evolveStonesTxt(pedras).replace(/ \(tem \d+\)/g, '') });
                }
            } catch (err) { motivo = `erro: ${err?.message || err}`; }
            if (motivo) falhas.push({ id: p.id, name: p.name, dest: info?.destName || p.dest, motivo });
            logEvent('evolucao', { id: p.id, name: p.name, level: p.level, ok: !motivo, para: motivo ? null : para, destId, motivo, buscouPedras: buscou || undefined, campos: info && typeof info === 'object' ? Object.keys(info) : null });
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
    //     - quem sobe e, da espécie dele, quem pode servir de comida ou é tão bom quanto ele (Q a partir de 0,15 abaixo) ficam fora
    //       da venda automática e do depósito na família (`breedKeepsPoke`, usado em `pokeSellReason`/`depositPokeReason`), mesmo
    //       com IV abaixo da tabela; o resto da espécie (Q longe demais, nunca vai servir) segue as regras normais da venda (v3.36.1);
    //       v3.47.0: essa proteção tem TETO por linhagem (`breedKeepMax`, padrão 20): só os N melhores (comida que serve hoje primeiro,
    //       maior quality primeiro) ficam guardados; o resto vende pelas regras da aba Venda (relato de 26/10/2026: quem sobe de Q baixa
    //       protegia quase toda captura e, sem stones, o box enchia sem parar até o servidor calar o frame `pokes`);
    //     - só o caminho Grátis (que mesmo assim cobra gold + stones); nunca `hatch-now`/`buy-slot` (diamante).
    //   Comida e stones podem vir do depot da família (`breedFamily`): o frame `family` traz quality/ivTotal dos Pokémon e
    //   itemId/quantity dos itens (confirmado em `familia-campos`); a retirada (`family-action … dir:'withdraw'`, mesmo formato
    //   do depósito) acontece na viagem à cidade, tarefa `breeding`, seguida de cotação de novo, checklist e breed. Na hunt o
    //   módulo só lê (centro a cada 2 min, cotação quando tem comida no box) e choca quando o centro diz `ready`; o filho é
    //   achado no frame `pokes` (id novo da espécie, senão o único com o IV do tronco) e vira o tronco da linhagem.
    //   Sem comida/stone/gold: para, avisa 1x por motivo e tenta de novo a cada 30 min (a família pode abastecer).
    //   v3.48.0 — comida em criação (`cfg.breedFoodBreed`, pedido do usuário em 26/10/2026: "quando o Pokémon chega a 1,96 já não dá para
    //   continuar subindo com Pokémon dropados; precisamos breedar a comida"): quem sobe em Q 1,96 só come Q 1,81–1,96 e captura nunca
    //   chega lá. Sem NENHUMA comida que sirva, a linhagem ganha uma sub-linhagem de comida (`line.food`, mesmo formato de uma linhagem,
    //   `breedUnits()` = linhagens + comidas em criação): o melhor da espécie ABAIXO da faixa (maior quality = menos gerações; IV abaixo do
    //   de quem sobe e do teto, com margem de 1 se dobrar, porque o filho herda o IV dele) é cruzado com uma comida própria (mesmas regras,
    //   mesma cotação e checklist com `donorId` = ele), o filho vira a comida em criação (geração +1) e repete até a quality entrar na
    //   faixa; aí quem sobe come esse filho (a comida em criação da PRÓPRIA linhagem é a única unidade que pode ser comida) e a
    //   sub-linhagem termina (log `breeding-comida { fase: escolhida | sumiu | consumida }`). Só cruza comida enquanto quem sobe está
    //   parado sem comida: a sub-linhagem usa o slot que ele não usa. Quem vira comida pode estar na família (retirado na viagem).
    //   v3.49.0 — Breeding Box (mudança do JOGO vista em 26/10/2026 no outro PC do usuário: "Comida em criação … porém não tem nada
    //   sendo incubado"; a cotação e a última viagem falhavam com "Os dois pais precisam estar na Breeding Box — separe-os na aba
    //   Breeding Box do Depósito"): o Depósito ganhou a aba 🥚 Breeding Box e só quem está nela aparece no Breeding Center. A lista
    //   `pokes` traz `breedingBox: true` para quem está lá; a tela move com `breedbox-move { dir:'in'|'out', pokeIds[] }` pelo socket e o
    //   servidor responde `breedbox-moved { moved, skipped }` ou `error`. Lá dentro o Pokémon não vai para o Mark, Mercado, troca, família
    //   nem time (a venda e o depósito do script pulam quem tem `breedingBox`), e os filhotes nascem lá. O script: na hunt a cotação fora da
    //   Breeding Box não é falta de material (planeja sem cotar, log `breeding-box { fase:'cotacao-na-viagem' }`); na viagem, antes da
    //   cotação, `breedBoxMove([quem sobe, comida], 'in')` separa os dois e confere pela lista nova (log `breeding-box`). Caso 15 do teste.

    const BREED_URL = '/api/game/breeding';
    const BREED_TICK_MS = 60 * 1000;
    const BREED_POLL_MS = 2 * 60 * 1000;           // relê a incubadora (o progresso do ovo só existe por REST; a tela lê a cada 20 s)
    const BREED_FAMILY_POLL_MS = 10 * 60 * 1000;   // relê o depot da família
    const BREED_RETRY_MS = 30 * 60 * 1000;         // parado por falta de comida/stone/gold: volta a planejar depois disso
    const BREED_HUNT_RETRY_MS = 3 * 60 * 1000;     // v3.36.3: falhou porque a conta estava na hunt: tenta de novo depois disso
    const BREED_Q_GAP = 0.15;                      // o jogo exige diferença de quality ≤ 0,15 no breed normal
    const BREED_Q_EPS = 0.0005;
    const BREED_Q_STEP = 0.01;                     // Δ esperado por cruzamento Grátis (estimativa de gerações da comida em criação)
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
    let breedBoxPending = null;    // v3.49.0: { ids, dir, at, resolve } esperando o `breedbox-moved`/`error` do movimento da Breeding Box
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
    // v3.48.0: comida em criação de uma linhagem (`line.food`, mesmo formato: id | eggId | pendingChild, gen, q0, iv0, lastQ, lastIv, name,
    // speciesId, familia = ainda no depot da família). Unidades = linhagens + comidas em criação: tudo que tem id/ovo/filho próprio.
    function breedFoodLine(l) { const f = l && l.food; return f && typeof f === 'object' && (f.id || f.eggId || f.pendingChild) ? f : null; }
    function breedUnits(d) { const out = []; for (const l of breedActiveLines(d)) { out.push(l); const f = breedFoodLine(l); if (f) out.push(f); } return out; }
    // Dona de uma unidade: { line, idx (1-based), food } — `food` = true quando `u` é a comida em criação de `line`.
    function breedUnitInfo(u, d) {
        const lines = breedLines(d);
        for (let i = 0; i < lines.length; i++) { const l = lines[i]; if (!l) continue; if (l === u) return { line: l, idx: i + 1, food: false }; if (l.food === u) return { line: l, idx: i + 1, food: true }; }
        return { line: null, idx: 0, food: false };
    }
    function breedUnitLabel(u, d) { const i = breedUnitInfo(u, d); return i.food ? `comida da linhagem ${i.idx}` : `linhagem ${i.idx || '?'}`; }
    function breedFoodBreedOn(d) { return Boolean((d || cfg).breedFoodBreed); }
    // Quem sobe, pelo id, na lista `pokes` (box).
    const breedPokeView = (p) => ({ id: String(p.id), name: p.name || '?', speciesId: Number(p.speciesId), quality: Number(p.quality), ivTotal: Number(p.ivTotal), level: Number(p.level) || 0, shiny: Boolean(p.shiny), team: Boolean(p.team || p.leader), starter: Boolean(p.starter), breedingBox: Boolean(p.breedingBox) });
    function breedTrunk(line) {
        if (!line?.id) return null;
        const p = lastPokesList.find(x => x && String(x.id) === String(line.id));
        if (!p) {
            // v3.48.0: quem vira comida pode ter sido escolhido no depot da família (sai de lá na viagem)
            const f = line.familia && cfg.breedFamily ? (lastFamilyDepot.pokes || []).find(x => x && String(x.id) === String(line.id)) : null;
            return f ? Object.assign(breedPokeView(f), { origem: 'familia' }) : null;
        }
        return Object.assign(breedPokeView(p), { origem: 'box' });
    }
    // Quality de referência da linhagem: quem sobe no box; senão o filho chocado (`pendingChild`), senão quem entrou no ovo.
    function breedLineQ(l) {
        const t = breedTrunk(l);
        if (t && Number.isFinite(t.quality)) return t.quality;
        const pc = Number(l?.pendingChild?.quality);
        return Number.isFinite(pc) ? pc : Number(l?.lastQ);
    }
    // Proteção: quem sobe e, da espécie dele, quem ainda pode servir de comida ou já é tão bom quanto ele (quality a partir de
    // 0,15 abaixo da referência) ficam fora da venda automática e do depósito na família. v3.36.1: antes a espécie INTEIRA
    // ficava fora da venda — na conta1 (12/10/2026) 312 Rhyhorn de Q 0,9–1,3 (que nunca serviriam: quem sobe só cresce)
    // entupiram o box (313 ≥ 200), o servidor parou de mandar o frame `pokes`, o filho chocado nunca foi identificado
    // ("filho não identificado") e a venda não tinha lista nem candidatos: ciclo fechado. Sem quality conhecida, protege.
    // v3.47.0: a proteção tem TETO por linhagem (`cfg.breedKeepMax`, 0 = sem teto). Relato do usuário em 26/10/2026: com quem sobe
    // de quality baixa quase toda captura da espécie cai na faixa "até 0,15 abaixo" e ficava fora da venda; cada cruzamento consome
    // UMA comida a cada 3000 abates (e nenhuma enquanto faltam stones), então o box enchia sem parar até o servidor calar o frame
    // `pokes` e tudo travar. Agora só os N melhores da espécie (box fora do time + fila de capturas sem frame, `captureQueue`) ficam
    // guardados: quem serve de comida HOJE primeiro (maior quality primeiro, porque serve por mais gerações), depois quem é tão bom
    // quanto quem sobe ou tem IV alto demais para comida; o resto segue as regras da aba Venda (shiny, nível > 1, piso de qualidade e
    // tabela por raridade continuam valendo). Pokémon ainda não visto no box nem na fila só é protegido enquanto sobra vaga.
    function breedKeepMax(d) { const v = Number((d || cfg).breedKeepMax); return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0; }
    const breedKeepCache = new Map();   // key -> { key, list, kept:Set, known:Set, elegiveis, max } (invalida por frame/fila/cfg; v3.48.0: uma entrada por unidade)
    function breedKept(l, ref, max) {
        const t = breedTrunk(l);
        const lsp = Number(l.speciesId) || (t ? t.speciesId : 0), lnome = normalize(l.name || (t ? t.name : ''));
        const fila = (typeof captureQueue !== 'undefined' && Array.isArray(captureQueue)) ? captureQueue : [];
        const key = `${breedPokesSeq}|${lastPokesList.length}|${fila.length}|${fila.length ? fila[fila.length - 1].id : ''}|${l.id || ''}|${l.eggId || ''}|${ref}|${max}|${lsp}|${lnome}`;
        const hit = breedKeepCache.get(key);
        if (hit && hit.list === lastPokesList) return hit;
        const same = (p) => { const sp = Number(p.speciesId) || 0, n = normalize(p.name || ''); return (lsp && sp && lsp === sp) || (lnome && n && lnome === n); };
        const known = new Set(), pool = [];
        const add = (p) => {
            if (!p || typeof p !== 'object' || p.id == null) return;
            const id = String(p.id);
            if (known.has(id) || id === String(l.id || '') || p.team || p.leader || !same(p)) return;
            known.add(id); pool.push(p);
        };
        for (const p of lastPokesList) add(p);
        for (const p of fila) add(p);
        const elegiveis = pool.filter(p => Number.isFinite(Number(p.quality)) && Number(p.quality) >= ref - BREED_Q_GAP - BREED_Q_EPS);
        const rank = (p) => [t && !breedFoodReason(p, t) ? 1 : 0, Number(p.quality), Number(p.ivTotal) || 0];
        elegiveis.sort((a, b) => { const ka = rank(a), kb = rank(b); return kb[0] - ka[0] || kb[1] - ka[1] || kb[2] - ka[2]; });
        const kept = new Set((max ? elegiveis.slice(0, max) : elegiveis).map(p => String(p.id)));
        if (breedKeepCache.size >= 8) breedKeepCache.clear();
        const out = { key, list: lastPokesList, kept, known, elegiveis: elegiveis.length, max };
        breedKeepCache.set(key, out);
        return out;
    }
    function breedKeepsPoke(p) {
        if (!cfg.breedEnabled || !p || typeof p !== 'object') return false;
        const id = String(p.id ?? ''), sp = Number(p.speciesId) || 0, nome = normalize(p.name || '');
        const max = breedKeepMax();
        for (const l of breedUnits()) {   // v3.48.0: a comida em criação e a faixa dela também ficam guardadas
            if (l.id && String(l.id) === id) return true;
            const t = l.speciesId ? null : breedTrunk(l);   // linhagem recém-escolhida: espécie pelo box
            const lsp = Number(l.speciesId) || (t ? t.speciesId : 0), lnome = normalize(l.name || (t ? t.name : ''));
            if (!((lsp && sp && lsp === sp) || (lnome && nome && lnome === nome))) continue;
            const ref = breedLineQ(l), q = Number(p.quality);
            if (!Number.isFinite(ref) || !Number.isFinite(q)) return true;
            if (q < ref - BREED_Q_GAP - BREED_Q_EPS) continue;   // nunca vai servir: regras normais da venda
            if (!max) return true;
            const k = breedKept(l, ref, max);
            if (k.kept.has(id)) return true;
            if (!k.known.has(id) && k.kept.size < max) return true;   // ainda não visto no box/fila e sobra vaga
        }
        return false;
    }
    // Motivo para `p` NÃO servir de comida para `trunk`; null = serve.
    function breedFoodReason(p, trunk, d) {
        d = d || cfg;
        if (!p || typeof p !== 'object' || !trunk) return 'inválido';
        if (String(p.id) === trunk.id) return 'é quem sobe';
        // v3.48.0: a comida em criação da PRÓPRIA linhagem existe para ser comida de quem sobe; as outras unidades (quem sobe e comida
        // em criação das outras linhagens) nunca
        const own = breedUnits(d).find(u => u.id && String(u.id) === trunk.id) || null;
        const ownFood = own ? breedFoodLine(own) : null;
        const outra = breedUnits(d).find(u => u !== ownFood && u.id && String(u.id) === String(p.id));
        if (outra) return breedUnitInfo(outra, d).food ? 'é comida em criação de outra linhagem' : 'é quem sobe de outra linhagem';
        const r = breedFoodReasonQ(p, trunk, d);
        return r && ownFood && String(ownFood.id) === String(p.id) ? `comida em criação, ainda não serve: ${r}` : r;
    }
    function breedFoodReasonQ(p, trunk, d) {
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
        const add = (p, origem) => out.push({ id: String(p.id ?? ''), name: p.name || '?', quality: Number(p.quality), ivTotal: Number(p.ivTotal), level: Number(p.level) || 0, breedingBox: Boolean(p.breedingBox), origem, motivo: breedFoodReason(p, trunk, d) });
        for (const p of lastPokesList) if (p && !p.team && Number(p.speciesId) === trunk.speciesId && String(p.id) !== trunk.id) add(p, 'box');
        if (d.breedFamily) for (const p of (lastFamilyDepot.pokes || [])) if (p && Number(p.speciesId) === trunk.speciesId) add(p, 'familia');
        return out.sort((a, b) => (a.motivo ? 1 : 0) - (b.motivo ? 1 : 0) || (a.quality || 0) - (b.quality || 0) || (a.ivTotal || 0) - (b.ivTotal || 0));
    }
    function breedFoodPick(trunk, d) { return breedFoodList(trunk, d).find(f => !f.motivo) || null; }
    // v3.48.0: quem pode VIRAR comida de `trunk` (comida em criação): da espécie, ABAIXO da faixa de 0,15 (quem está na faixa já serve,
    // ou tem IV demais — e cruzar não baixa IV), IV (com margem de 1 se dobrar) abaixo do de quem sobe e do teto, e com pelo menos uma
    // comida própria que sirva. O melhor = maior quality (menos gerações até a faixa), depois maior IV (mais comida própria possível).
    function breedFoodTrunkReason(p, trunk, d) {
        d = d || cfg;
        if (!p || typeof p !== 'object' || !trunk) return 'inválido';
        if (String(p.id) === trunk.id) return 'é quem sobe';
        const outra = breedUnits(d).find(u => u.id && String(u.id) === String(p.id));
        if (outra) return breedUnitInfo(outra, d).food ? 'já é comida em criação' : 'é quem sobe de outra linhagem';
        if (Number(p.speciesId) !== trunk.speciesId) return 'outra espécie';
        if (p.team || p.leader) return 'no time';
        if (p.starter) return 'inicial';
        if (p.shiny) return 'shiny: nunca';
        if (p.isDitto) return 'Ditto';
        if (p.locked) return 'cadeado';
        if (p.listed || p.tradeId) return 'anunciado no mercado';
        const q = Number(p.quality), iv = Number(p.ivTotal);
        if (!Number.isFinite(q) || !Number.isFinite(iv)) return 'sem IV/quality';
        if (q >= trunk.quality - BREED_Q_GAP - BREED_Q_EPS) return `Q ${breedQ(q)} já está na faixa de quem sobe`;
        const margem = d.breedDouble ? 1 : 0;
        if (iv + margem >= trunk.ivTotal) return `IV ${iv} não ficaria abaixo de ${trunk.ivTotal}${margem ? ' (dobrar pode dar +1)' : ''}`;
        const max = breedFoodIvMax(d);
        if (max > 0 && iv + margem >= max) return `IV ${iv} não ficaria abaixo do teto ${max}`;
        return null;
    }
    // Gerações estimadas até a quality entrar na faixa de quem sobe (Δ esperado 0,01 por cruzamento).
    function breedFoodGens(q, trunk) { if (!Number.isFinite(q) || !trunk) return null; return Math.max(1, Math.ceil((trunk.quality - BREED_Q_GAP - q) / BREED_Q_STEP - BREED_Q_EPS)); }
    function breedFoodTrunkList(trunk, d) {
        d = d || cfg;
        if (!trunk) return [];
        const out = [];
        const add = (p, origem) => {
            const motivo = breedFoodTrunkReason(p, trunk, d);
            const t = motivo ? null : Object.assign(breedPokeView(p), { origem });
            const propria = t ? breedFoodPick(t, d) : null;
            out.push({ id: String(p.id ?? ''), name: p.name || '?', quality: Number(p.quality), ivTotal: Number(p.ivTotal), level: Number(p.level) || 0, origem, motivo: motivo || (propria ? null : 'sem comida própria que sirva'), propria, geracoes: breedFoodGens(Number(p.quality), trunk) });
        };
        for (const p of lastPokesList) if (p && !p.team && Number(p.speciesId) === trunk.speciesId && String(p.id) !== trunk.id) add(p, 'box');
        if (d.breedFamily) for (const p of (lastFamilyDepot.pokes || [])) if (p && Number(p.speciesId) === trunk.speciesId) add(p, 'familia');
        return out.sort((a, b) => (a.motivo ? 1 : 0) - (b.motivo ? 1 : 0) || (b.quality || 0) - (a.quality || 0) || (b.ivTotal || 0) - (a.ivTotal || 0));
    }
    function breedFoodTrunkPick(trunk, d) { return breedFoodTrunkList(trunk, d).find(f => !f.motivo) || null; }

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
    // v3.49.0: Breeding Box (aba 🥚 do Depósito; mudança do jogo vista em 26/10/2026). A cotação e o breed só saem com os dois pais lá
    // ("Os dois pais precisam estar na Breeding Box — separe-os na aba Breeding Box do Depósito"). Pelo socket, como a tela faz:
    // `breedbox-move { dir:'in'|'out', pokeIds[] (até 200) }` → `breedbox-moved { moved, skipped }` ou `error { message }` (a tela só
    // mostra o erro que chega em até 4 s). Cada Pokémon da lista `pokes` traz `breedingBox: true` quando está lá (ausente = fora).
    const breedBoxErrorRe = /breeding box/i;
    function breedInBox(p) { return Boolean(p && p.breedingBox); }
    // Põe `ids` na Breeding Box (`dir` 'in') ou devolve ao box ('out'); confere pela lista `pokes` nova (o servidor manda a lista
    // depois do movimento; sem frame em BREED_WAIT_MS pede com `pokes-get`). Devolve { ok, moved, skipped, motivo }.
    function breedBoxMove(ids, dir) {
        ids = [...new Set((ids || []).map(id => String(id ?? '')).filter(Boolean))];
        if (!ids.length) return Promise.resolve({ ok: true, moved: 0, skipped: 0, motivo: null });
        return new Promise((resolve) => {
            if (breedBoxPending) breedBoxPending.resolve({ motivo: 'outro movimento da Breeding Box em andamento' });
            const antes = breedPokesSeq;
            const entry = { ids, dir, at: Date.now(), timer: null, done: false, resolve: null };
            entry.resolve = async (r) => {
                if (entry.done) return;
                entry.done = true;
                clearTimeout(entry.timer);
                if (breedBoxPending === entry) breedBoxPending = null;
                if (breedPokesSeq === antes) await breedWaitPokes(antes);
                if (breedPokesSeq === antes) await breedRefreshPokes();
                const faltam = ids.filter(id => { const p = lastPokesList.find(x => x && String(x.id) === id); return !p || breedInBox(p) !== (dir === 'in'); });
                const ok = !faltam.length;
                const motivo = ok ? null : (r.motivo || (r.frame ? `o jogo não moveu ${faltam.length} de ${ids.length}` : 'sem resposta do jogo'));
                logEvent('breeding-box', { dir, ids, ok, moved: r.moved ?? null, skipped: r.skipped ?? null, frame: Boolean(r.frame), motivo, faltam: ok ? undefined : faltam });
                resolve({ ok, moved: r.moved ?? null, skipped: r.skipped ?? null, motivo });
            };
            breedBoxPending = entry;
            if (!sendGame({ type: 'breedbox-move', dir, pokeIds: ids.slice(0, 200) })) { entry.resolve({ motivo: 'socket do jogo não rastreado' }); return; }
            entry.timer = setTimeout(() => entry.resolve({}), BREED_WAIT_MS);
        });
    }
    function breedWaitPokes(antes) {
        const t0 = Date.now();
        return new Promise(res => (function loop() {
            if (breedPokesSeq !== antes) return res(true);
            if (Date.now() - t0 >= BREED_WAIT_MS) return res(false);
            setTimeout(loop, 250);
        })());
    }
    // Frame `breedbox-moved` (resposta do movimento, pela tela ou pelo script).
    function breedOnBoxMoved(m) {
        logEvent('breedbox-moved', { moved: m?.moved ?? null, skipped: m?.skipped ?? null, pendente: Boolean(breedBoxPending) });
        if (breedBoxPending) breedBoxPending.resolve({ frame: true, moved: m?.moved, skipped: m?.skipped });
    }
    // Frame `error` do jogo logo depois do movimento (até 4 s, como a tela faz).
    function breedOnError(m) {
        if (breedBoxPending && Date.now() - breedBoxPending.at <= 4000) breedBoxPending.resolve({ frame: true, motivo: m?.message || 'erro do jogo' });
    }

    // Frame `pokes`: guarda nome/espécie de quem sobe (a proteção da venda usa isso) e identifica o filho pendente.
    function breedOnPokes(list) {
        breedPokesSeq++;
        if (!breedEnabled()) { breedNotify(); return; }
        let mudou = false;
        for (const l of breedUnits()) {
            const t = breedTrunk(l);
            if (t && (l.name !== t.name || Number(l.speciesId) !== t.speciesId)) { l.name = t.name; l.speciesId = t.speciesId; mudou = true; }
            if (!l.id && !l.eggId && l.pendingChild && breedAdoptChild(l, Array.isArray(list) ? list : lastPokesList, null, l.pendingChild)) mudou = true;
        }
        if (mudou) saveCfg(cfg);
        breedNotify();
    }
    function breedOnFamily() { breedFamilySeq++; breedNotify(); }
    // Filho de uma linhagem: id novo da espécie (quando se sabe o que havia antes); senão o ÚNICO da espécie com a quality e o IV
    // que o `hatch` devolveu (`filho`, v3.29.1: a resposta traz `child{ quality, ivTotal }` mas NÃO o id); senão o ÚNICO com o IV
    // de quem sobe (ou +1, do dobrar) e quality acima da dele. 0 ou 2+ candidatos = fica pendente (o painel deixa escolher à mão).
    function breedAdoptChild(line, list, novosIds, filho) {
        const sp = Number(line.speciesId) || 0;
        const outros = breedUnits().filter(o => o !== line && o.id).map(o => String(o.id));
        let cand = (Array.isArray(list) ? list : []).filter(p => p && !p.team && !p.leader && !p.shiny && (!sp || Number(p.speciesId) === sp) && !outros.includes(String(p.id)));
        const naBox = cand.filter(p => breedInBox(p));   // v3.49.0: os filhotes nascem na Breeding Box — com candidatos lá, só eles contam
        if (naBox.length) cand = naBox;
        if (novosIds && novosIds.size) {
            const n = cand.filter(p => novosIds.has(String(p.id)));
            if (n.length === 1) return breedSetChild(line, n[0]);
            if (n.length > 1) cand = n;
        }
        const fq = Number(filho?.quality), fiv = Number(filho?.ivTotal);
        let exatos = null;
        if (Number.isFinite(fq) && Number.isFinite(fiv)) {
            exatos = cand.filter(p => Number(p.ivTotal) === fiv && Math.abs(Number(p.quality) - fq) < BREED_Q_EPS);
            if (exatos.length === 1) return breedSetChild(line, exatos[0]);
            if (exatos.length > 1) cand = exatos;
        }
        const iv = Number(line.lastIv), q = Number(line.lastQ);
        const porIv = cand.filter(p => Number.isFinite(iv) && (Number(p.ivTotal) === iv || Number(p.ivTotal) === iv + 1) && (!Number.isFinite(q) || Number(p.quality) > q - BREED_Q_EPS));
        if (porIv.length === 1) return breedSetChild(line, porIv[0]);
        logEvent('breeding-filho', { linhagem: line.name || null, comida: breedUnitInfo(line).food || undefined, achou: false, candidatos: porIv.length, exatos: exatos ? exatos.length : null, novos: novosIds ? novosIds.size : null, iv: Number.isFinite(iv) ? iv : null });
        return false;
    }
    function breedSetChild(line, p) {
        line.id = String(p.id); line.pendingChild = null; line.eggId = null;
        line.gen = (Number(line.gen) || 0) + 1;
        line.lastQ = Number(p.quality); line.lastIv = Number(p.ivTotal); line.name = p.name || line.name; line.speciesId = Number(p.speciesId) || line.speciesId;
        logEvent('breeding-filho', { linhagem: line.name, comida: breedUnitInfo(line).food || undefined, achou: true, id: line.id, geracao: line.gen, quality: line.lastQ, ivTotal: line.lastIv });
        return true;
    }
    // Ovos das linhagens x centro: ovo sem id conhecido ganha o único livre da espécie; ovo que sumiu (chocado na mão) vira filho pendente.
    // v3.36.2: o usuário cruzou NA MÃO (conta1, 12/10/2026 04:25Z: linhagem com filho por identificar — a lista `pokes` nunca veio —
    // e um ovo novo de Rhyhorn no centro que o script ignorava; "não está continuando o breeding"): linhagem sem quem sobe nem ovo
    // (filho por identificar) ou com quem sobe que sumiu de uma lista lida, e UM ovo livre da espécie no centro = o ovo é dela
    // (`breeding-ovo-adotado`). Quem entrou no ovo foi o filho pendente (geração +1, Q/IV do `hatch` quando se sabe).
    function breedSyncLines(c) {
        let mudou = false;
        const claimed = new Set(breedUnits().map(l => l.eggId).filter(id => id && c.eggs.some(e => e.id === id)));
        const livresDe = (l) => c.eggs.filter(e => !claimed.has(e.id) && (!l.speciesId || e.speciesId === Number(l.speciesId)));
        for (const l of breedUnits()) {
            if (!l.eggId || c.eggs.some(e => e.id === l.eggId)) continue;
            const livres = livresDe(l);
            if (livres.length === 1) { l.eggId = livres[0].id; claimed.add(l.eggId); mudou = true; continue; }
            logEvent('breeding-ovo-sumiu', { linhagem: l.name || null, eggId: l.eggId, ovosNoCentro: c.eggs.length });
            l.eggId = null; l.pendingChild = { at: Date.now() }; mudou = true;
            breedAdoptChild(l, lastPokesList);
        }
        for (const l of breedUnits()) {
            if (l.eggId) continue;
            if (l.familia && breedFamilySeq === 0) continue;   // v3.48.0: quem vira comida está na família e o depot ainda não foi lido
            const semTronco = l.id ? (lastPokesList.length > 0 && !breedTrunk(l)) : Boolean(l.pendingChild);
            if (!semTronco) continue;
            const livres = livresDe(l);
            if (livres.length !== 1) continue;
            const pc = l.pendingChild || null;
            const q = Number(pc?.quality), iv = Number(pc?.ivTotal);
            if (!l.id) { l.gen = (Number(l.gen) || 0) + 1; if (Number.isFinite(q)) l.lastQ = q; if (Number.isFinite(iv)) l.lastIv = iv; }
            logEvent('breeding-ovo-adotado', { linhagem: l.name || null, eggId: livres[0].id, especie: livres[0].speciesName, origem: l.id ? 'quem sobe sumiu do box' : 'filho por identificar', geracao: l.gen, lastQ: l.lastQ ?? null, lastIv: l.lastIv ?? null });
            l.eggId = livres[0].id; l.id = null; l.pendingChild = null; l.eggAt = Date.now(); l.eggs = (Number(l.eggs) || 0) + 1;
            claimed.add(l.eggId); mudou = true;
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
        // v3.29.3: tolerância de meio tick — com tick de 1 min e releitura a cada 2 min, o 2º tick caía uns ms antes dos 2 min e a
        // leitura real acontecia só no 3º (log da conta1 em 09/10/2026: `breeding-centro` a cada 3 min; o ovo pronto esperava até 3 min).
        if (!force && Date.now() - breedCenterAt < BREED_POLL_MS - BREED_TICK_MS / 2) return;
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
        const line = breedUnits().find(l => l.eggId === egg.id) || null;
        const info = breedUnitInfo(line);   // v3.48.0: o ovo pode ser da comida em criação
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
        // CONFIRMADO no log em 09/10/2026 12:37Z (contas 2 e 3): `{ ok, child{ speciesId, shiny, quality, delta, growth{..}, ivTotal,
        // bqs } }` — SEM o id do filho. O filho é achado no frame `pokes` pela quality e IV exatos (a dica fica em `pendingChild`
        // para os frames seguintes, caso a lista demore).
        const child = r?.child && typeof r.child === 'object' ? r.child : null;
        let filho = null;
        if (line) {
            line.eggId = null; line.pendingChild = { at: Date.now(), quality: Number.isFinite(Number(child?.quality)) ? Number(child.quality) : null, ivTotal: Number.isFinite(Number(child?.ivTotal)) ? Number(child.ivTotal) : null };
            if (child?.id) { breedSetChild(line, Object.assign({ speciesId: egg.speciesId, name: egg.speciesName }, child)); filho = child; }
            else {
                await breedRefreshPokes();
                const novos = new Set(lastPokesList.map(p => String(p?.id)).filter(id => !antes.has(id)));
                // o frame novo já pode ter identificado o filho (breedOnPokes); senão tenta com os ids novos + quality/IV do hatch
                if (line.id || breedAdoptChild(line, lastPokesList, novos, child)) filho = lastPokesList.find(p => String(p?.id) === line.id) || null;
            }
            saveCfg(cfg);
        }
        const mostra = filho || (Number.isFinite(Number(child?.quality)) ? child : null);
        const delta = Number.isFinite(Number(child?.delta)) ? ` (Δ +${Number(child.delta).toFixed(3)})` : '';
        const who = playerName();
        const gen = line ? Number(line.gen) || 0 : 0;
        // v3.48.0: filho da comida em criação — já serve para quem sobe?
        const mainTrunk = info.food && info.line ? breedTrunk(info.line) : null;
        const serveMotivo = info.food && filho && mainTrunk ? breedFoodReason(filho, mainTrunk) : null;
        const linhas = [
            line ? (info.food ? `Comida em criação da linhagem ${info.idx} (${info.line?.name || egg.speciesName}): geração ${gen}` : `Linhagem ${line.name || egg.speciesName}: geração ${gen}`) : `Ovo sem linhagem no painel (${egg.speciesName})`,
            mostra ? `Filho: Q ${breedQ(mostra.quality)} · IV ${mostra.ivTotal}/${IV_MAX}${delta}${line?.q0 != null ? ` (começou em Q ${breedQ(line.q0)})` : ''}` : '',
            info.food && filho && mainTrunk ? (serveMotivo ? `Ainda não serve para ${mainTrunk.name} Q ${breedQ(mainTrunk.quality)} (${serveMotivo.replace(/^comida em criação, ainda não serve: /, '')}): continua a criação` : `✔ Já serve de comida para ${mainTrunk.name} Q ${breedQ(mainTrunk.quality)}: quem sobe come na próxima viagem`) : '',
            line && !filho ? (info.food ? '⚠ Filho não identificado no box: a comida em criação fica esperando a lista' : '⚠ Filho não identificado no box: escolha no painel 🥚 quem continua') : '',
            child?.shiny ? '✨ Nasceu shiny!' : '',
        ].filter(Boolean);
        postWebhook('alert', {
            content: `🥚 ${who ? `**${who}**` : 'Sua conta'} chocou **${egg.speciesName}**${info.food ? ' (comida em criação)' : ''}${mostra ? ` — Q ${breedQ(mostra.quality)}, IV ${mostra.ivTotal}` : ''}`,
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
        // Cota o par (quando os dois estão no box), confere stones e gold e registra o plano da unidade; devolve o motivo de não dar
        // (null = planejado). v3.48.0: serve para quem sobe e para a comida em criação.
        const planeja = async (unit, trunk, food, rotulo) => {
            let stones = null, cotou = false;
            if (food.origem === 'box' && trunk.origem !== 'familia') {
                let q = null, erro = null;
                try { q = await breedQuote(trunk, food); } catch (err) { erro = String(err?.message || err); }
                // v3.49.0: fora da Breeding Box o jogo não cota ("Os dois pais precisam estar na Breeding Box"): não é falta de material —
                // a viagem separa os dois lá e cota de novo na cidade. Qualquer outro erro segue parando a linhagem.
                if (erro && !breedBoxErrorRe.test(erro)) return `${rotulo}: cotação falhou (${erro})`;
                if (erro) logEvent('breeding-box', { fase: 'cotacao-na-viagem', tronco: trunk.name, troncoId: trunk.id, comida: food.id, naBox: [breedInBox(trunk), breedInBox(food)], erro, criacao: breedUnitInfo(unit).food || undefined });
                else {
                    cotou = true;
                    const chk = breedCheckQuote(q, trunk);
                    stones = breedStoneNeeds(q);
                    logEvent('breeding-cotacao', { tronco: trunk.name, troncoId: trunk.id, comida: food.id, qTronco: trunk.quality, qComida: food.quality, ivTronco: trunk.ivTotal, ivComida: food.ivTotal, donorId: q?.ivPreview?.donorId ?? null, ok: !chk, motivo: chk, goldFee: q?.goldFee ?? null, stones: breedStonesTxt(stones), criacao: breedUnitInfo(unit).food || undefined });
                    if (chk) return `${rotulo}: ${chk}`;
                    const faltam = stones.filter(s => s.have + s.familia < s.need);
                    if (faltam.length) return `${rotulo}: faltam stones (${breedStonesTxt(faltam)})`;
                    if (c.gold < Number(q.goldFee || 0)) return `${rotulo}: gold ${fmtNum(c.gold)} < taxa ${fmtNum(q.goldFee)}`;
                }
            }
            if (!cotou && c.gold < BREED_GOLD_FEE_HINT) return `${rotulo}: gold ${fmtNum(c.gold)} < taxa ${fmtNum(BREED_GOLD_FEE_HINT)}`;
            breedPlanned[unit.id] = { foodId: food.id, foodName: food.name, foodQ: food.quality, foodIv: food.ivTotal, origem: food.origem, troncoOrigem: trunk.origem || 'box', stones, at: Date.now() };
            return null;
        };
        for (const line of linhas) {
            if (!line.id) continue;                                  // ovo chocando ou filho por identificar
            if (breedPlanned[line.id]) { livres--; planejou = true; continue; }
            const fu = breedFoodLine(line);
            if (fu && fu.id && breedPlanned[fu.id]) { livres--; planejou = true; continue; }   // v3.48.0: comida em criação já planejada
            if (livres <= 0) { motivos.push('incubadora cheia'); break; }
            const trunk = breedTrunk(line);
            if (!trunk) { motivos.push(`${line.name || line.id}: não está no box (lista ainda não lida?)`); continue; }
            if (trunk.team || trunk.starter || trunk.shiny) { motivos.push(`${trunk.name}: no time, inicial ou shiny não cruza`); continue; }
            const food = breedFoodPick(trunk);
            if (food) {
                const m = await planeja(line, trunk, food, trunk.name);
                if (m) { motivos.push(m); continue; }
                livres--; planejou = true;
                tripRequest('breeding', null, `${trunk.name} Q ${breedQ(trunk.quality)} IV ${trunk.ivTotal} × comida Q ${breedQ(food.quality)} IV ${food.ivTotal}${food.origem === 'familia' ? ' (família)' : ''}`);
                continue;
            }
            const semComida = `${trunk.name} (Q ${breedQ(trunk.quality)}, IV ${trunk.ivTotal}): sem comida que sirva${cfg.breedFamily ? ' no box nem na família' : ' no box'}`;
            if (!breedFoodBreedOn()) { motivos.push(semComida); continue; }
            // v3.48.0: criar comida — a sub-linhagem cruza enquanto quem sobe está parado (usa o slot que ele não usa)
            const m = await breedPlanFood(line, trunk, planeja);
            if (m) { motivos.push(`${semComida}; comida em criação: ${m}`); continue; }
            livres--; planejou = true;
        }
        if (planejou) breedWait = null;
        else if (motivos.length) breedWaitSet(motivos.join(' · '));
        else breedWait = null;
    }
    // v3.48.0: planeja o cruzamento da comida em criação de `line` (quem sobe = `trunk`, parado sem comida). Escolhe quem vira comida
    // quando ainda não há (ou quando o escolhido sumiu do box e da família), cota com a comida própria dele e pede a viagem. Devolve o
    // motivo de não dar; null = planejado.
    async function breedPlanFood(line, trunk, planeja) {
        let fu = breedFoodLine(line);
        if (fu && (fu.eggId || fu.pendingChild)) return fu.eggId ? 'ovo chocando' : 'filho por identificar (lista do box não lida?)';
        let ft = fu ? breedTrunk(fu) : null;
        if (fu && !ft) {
            logEvent('breeding-comida', { linhagem: line.name || null, fase: 'sumiu', id: fu.id, geracao: Number(fu.gen) || 0 });
            line.food = null; fu = null; saveCfg(cfg);
        }
        if (!ft) {
            const pick = breedFoodTrunkPick(trunk);
            if (!pick) return 'ninguém da espécie pode virar comida (precisa estar abaixo da faixa, com IV menor que o de quem sobe e ter comida própria)';
            line.food = { id: pick.id, name: pick.name, speciesId: trunk.speciesId, gen: 0, q0: pick.quality, iv0: pick.ivTotal, familia: pick.origem === 'familia' };
            fu = line.food; saveCfg(cfg);
            ft = breedTrunk(fu);
            logEvent('breeding-comida', { linhagem: line.name || null, fase: 'escolhida', id: pick.id, quality: pick.quality, ivTotal: pick.ivTotal, origem: pick.origem, geracoes: pick.geracoes, faixaDe: breedQ(trunk.quality - BREED_Q_GAP) });
            if (!ft) return 'quem vira comida não está no box';
        }
        if (ft.team || ft.starter || ft.shiny) return `${ft.name}: no time, inicial ou shiny não cruza`;
        const ffood = breedFoodPick(ft);
        if (!ffood) return `${ft.name} (Q ${breedQ(ft.quality)}, IV ${ft.ivTotal}) não tem comida própria que sirva`;
        const m = await planeja(fu, ft, ffood, `comida ${ft.name}`);
        if (m) return m;
        tripRequest('breeding', null, `comida para ${trunk.name}: ${ft.name} Q ${breedQ(ft.quality)} IV ${ft.ivTotal} × Q ${breedQ(ffood.quality)} IV ${ffood.ivTotal}${ffood.origem === 'familia' ? ' (família)' : ''}${ft.origem === 'familia' ? ' (quem vira comida sai da família)' : ''}`);
        return null;
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
                const line = breedUnits().find(u => u.id && String(u.id) === troncoId);
                if (!line) continue;
                const info = breedUnitInfo(line);   // v3.48.0: `line` pode ser a comida em criação de `info.line`
                try {
                    if (c.usedSlots >= c.slots) throw new Error('incubadora cheia');
                    if (plan.troncoOrigem === 'familia') {   // v3.48.0: quem vira comida estava no depot da família
                        const r = await familyPokeWithdraw(troncoId, line.name || plan.foodName);
                        if (!r.ok) throw new Error(`quem vira comida, da família: ${r.motivo}`);
                        line.familia = false; saveCfg(cfg);
                        await breedSleep();
                    }
                    if (plan.origem === 'familia') {
                        const r = await familyPokeWithdraw(plan.foodId, plan.foodName);
                        if (!r.ok) throw new Error(`comida da família: ${r.motivo}`);
                        await breedSleep();
                    }
                    await breedRefreshPokes();
                    let trunk = breedTrunk(line);
                    if (!trunk) throw new Error(`${info.food ? 'quem vira comida' : 'quem sobe'} não está no box`);
                    if (trunk.origem === 'familia') throw new Error('quem vira comida ainda está na família');
                    let food = lastPokesList.find(p => p && String(p.id) === plan.foodId);
                    if (!food) throw new Error('a comida não está no box');
                    // v3.49.0: o jogo só cota e cruza com os dois pais na Breeding Box — separa quem falta e relê a lista
                    if (!breedInBox(trunk) || !breedInBox(food)) {
                        const mv = await breedBoxMove([trunk.id, String(food.id)].filter(id => !breedInBox(lastPokesList.find(x => x && String(x.id) === id))), 'in');
                        if (!mv.ok) throw new Error(`Breeding Box: ${mv.motivo}`);
                        trunk = breedTrunk(line); food = lastPokesList.find(p => p && String(p.id) === plan.foodId);
                        if (!trunk || !food) throw new Error('os pais sumiram do box ao ir para a Breeding Box');
                        await breedSleep();
                    }
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
                    // v3.48.0: quem sobe comeu a comida em criação da própria linhagem: a sub-linhagem termina
                    const ownFood = !info.food && info.line ? breedFoodLine(info.line) : null;
                    if (ownFood && String(ownFood.id) === String(food.id)) {
                        logEvent('breeding-comida', { linhagem: info.line.name || null, fase: 'consumida', id: String(food.id), quality: Number(food.quality), ivTotal: Number(food.ivTotal), geracao: Number(ownFood.gen) || 0, comecouEm: ownFood.q0 ?? null });
                        info.line.food = null;
                    }
                    saveCfg(cfg);
                    const feito = { name: trunk.name, q: trunk.quality, iv: trunk.ivTotal, foodQ: Number(food.quality), foodIv: Number(food.ivTotal), min: q.delta?.minQuality, max: q.delta?.maxQuality, kills: egg?.killsRequired || null, gen: line.gen + 1, stones: stones.map(s => `${s.need}x ${s.name}`).join(', '), gold: Number(q.goldFee) || 0, dobrar: Boolean(cfg.breedDouble), comida: info.food, para: info.food ? (info.line?.name || trunk.name) : null };
                    feitos.push(feito);
                    logEvent('breeding-cruzou', { tronco: trunk.name, troncoId: trunk.id, comida: String(food.id), origem: plan.origem, criacao: info.food || undefined, qTronco: trunk.quality, qComida: feito.foodQ, ivTronco: trunk.ivTotal, ivComida: feito.foodIv, dobrar: feito.dobrar, ovo: egg?.id || null, abates: feito.kills, faixa: [feito.min, feito.max], gold: c.gold, geracao: feito.gen });
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
        // v3.36.3: "durante a hunt" (a conta voltou para a hunt no meio da viagem) não é falta de material: tenta de novo em 3 min, não em 30.
        // v3.37.1: "sem resposta do jogo" (servidor lento, 14/10/2026: a retirada da família respondeu 12–56 s depois e TINHA acontecido)
        // também é transitório: o material já está na mão ou vem na próxima viagem.
        const transitorio = falhas.length > 0 && falhas.every(f => /durante a hunt|sem resposta do jogo/i.test(f.motivo));
        if (falhas.length) breedWait = { motivo: falhas.map(f => `${f.name}: ${f.motivo}`).join(' · '), at: Date.now() - (transitorio ? BREED_RETRY_MS - BREED_HUNT_RETRY_MS : 0) };   // não insiste antes do retry
        if (feitos.length || falhas.length) {
            const who = playerName();
            const linhas = feitos.map(f => `${f.comida ? `🍖 comida para **${f.para}** — ` : ''}**${f.name}** geração ${f.gen}: Q ${breedQ(f.q)} → ${breedQ(f.min)}–${breedQ(f.max)} · IV ${f.iv} mantido · comida Q ${breedQ(f.foodQ)} IV ${f.foodIv}${f.kills ? ` · choca em ${fmtNum(f.kills)} abates` : ''}\nCustou ${fmtNum(f.gold)} gold + ${f.stones}${f.dobrar ? ' (dobrado)' : ''}`)
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
                const l = breedUnits(d).find(x => x.eggId === e.id);
                out.push(`Ovo: ${e.speciesName} ${fmtNum(e.killsDone)}/${fmtNum(e.killsRequired)} abates${e.ready ? ' · PRONTO' : ''}${l ? ` · ${breedUnitLabel(l, d)} (geração ${(Number(l.gen) || 0) + 1})` : ''}`);
            }
        } else out.push(d.breedEnabled ? 'Incubadora ainda não lida.' : 'Desligado.');
        breedLines(d).forEach((l, i) => {
            if (!l) return;
            const t = breedTrunk(l);
            let estado;
            if (l.id) estado = t ? `Q ${breedQ(t.quality)} · IV ${t.ivTotal}/${IV_MAX}${t.breedingBox ? ' · na Breeding Box' : ''}${breedPlanned[l.id] ? ' · viagem pedida para cruzar' : ''}` : 'não está no box (lista não lida?)';
            else if (l.eggId) estado = 'ovo chocando';
            else if (!lastPokesList.length) estado = '⚠ filho não identificado: o jogo ainda não mandou a lista de Pokémon (box grande demais? venda na mão)';
            else estado = '⚠ filho não identificado: escolha no menu';
            out.push(`Linhagem ${i + 1}: ${t?.name || l.name || '?'} · geração ${Number(l.gen) || 0}${l.q0 != null ? ` · começou em Q ${breedQ(l.q0)}` : ''} · ${estado}`);
            const fu = breedFoodLine(l);   // v3.48.0: comida em criação
            if (fu) {
                const ft = breedTrunk(fu);
                let fe;
                if (fu.id && ft) {
                    const serve = t && !breedFoodReason(ft, t);
                    const gens = t ? breedFoodGens(ft.quality, t) : null;
                    fe = `Q ${breedQ(ft.quality)} · IV ${ft.ivTotal}${ft.breedingBox ? ' · na Breeding Box' : ''}${ft.origem === 'familia' ? ' · na família (sai na viagem)' : ''}${breedPlanned[fu.id] ? ' · viagem pedida para cruzar' : ''}${t ? (serve ? ` · ✔ já serve para quem sobe (Q a partir de ${breedQ(t.quality - BREED_Q_GAP)})` : ` · falta ${Math.max(0, t.quality - BREED_Q_GAP - ft.quality).toFixed(3)} de Q para servir (~${gens} ${gens === 1 ? 'geração' : 'gerações'})`) : ''}`;
                } else if (fu.id) fe = 'não está no box (lista não lida?)';
                else if (fu.eggId) fe = 'ovo chocando';
                else fe = '⚠ filho não identificado (lista do box não lida?)';
                out.push(`  🍖 Comida em criação: ${ft?.name || fu.name || '?'} · geração ${Number(fu.gen) || 0}${fu.q0 != null ? ` · começou em Q ${breedQ(fu.q0)}` : ''} · ${fe}`);
            }
        });
        if (breedWait) out.push(`Parado: ${breedWait.motivo} · tenta de novo ${breedHora(breedWait.at + BREED_RETRY_MS)}`);
        if (breedLast) out.push(`Última viagem ${breedHora(breedLast.at)}: ${breedLast.feitos.length ? `criou ${breedLast.feitos.length} ovo(s)` : 'nada cruzado'}${breedLast.falhas.length ? ` · ⚠ ${breedLast.falhas[0].motivo}` : ''}`);
        return out;
    }
    // Prévia da comida por linhagem: [{ text, ok }]. v3.29.4: com quem sobe dentro do ovo (ou filho por identificar) a lista continua
    // visível, comparada com a Q e o IV de quem entrou no ovo (o filho nasce com o mesmo IV e Q um pouco maior, então quem serve
    // hoje serve amanhã; quem está no limite pode deixar de servir). Mostra até BREED_FOOD_SHOW por linhagem.
    const BREED_FOOD_SHOW = 20;
    function breedFoodStatus(d) {
        d = d || cfg;
        const out = [];
        breedLines(d).forEach((l, i) => {
            if (!l) return;
            let t = breedTrunk(l), previa = '';
            if (!t) {
                const q = Number(l.lastQ), iv = Number(l.lastIv), sp = Number(l.speciesId) || 0;
                const estado = l.eggId ? 'ovo chocando' : (l.id ? 'quem sobe não está no box (lista não lida?)' : 'filho por identificar');
                if (!sp || !Number.isFinite(q) || !Number.isFinite(iv)) { out.push({ text: `Linhagem ${i + 1}: ${estado}`, ok: false }); return; }
                t = { id: '', name: l.name || '?', speciesId: sp, quality: q, ivTotal: iv };
                previa = ` · ${estado}, prévia contra Q ${breedQ(q)} IV ${iv} de quem entrou no ovo`;
            }
            const lista = breedFoodList(t, d);
            const servem = lista.filter(f => !f.motivo);
            out.push({ text: `Linhagem ${i + 1} (${t.name} Q ${breedQ(t.quality)} IV ${t.ivTotal}${previa}): ${servem.length} ${servem.length === 1 ? 'comida serve' : 'comidas servem'} de ${lista.length} da espécie${lista.length ? ` (${lista.filter(f => f.origem === 'box').length} no box, ${lista.filter(f => f.origem === 'familia').length} na família)` : ''}`, ok: servem.length > 0 });
            const max = breedKeepMax(d), refQ = breedLineQ(l);
            if (max && Number.isFinite(refQ)) {   // v3.47.0: quantos ficam fora da venda com o teto
                const k = breedKept(l, refQ, max);
                out.push({ text: `  🔒 fora da venda: ${k.kept.size} de ${k.elegiveis} da espécie na faixa (teto ${max}); o resto vende pelas regras da aba Venda`, ok: k.elegiveis <= max });
            }
            if (breedFoodBreedOn(d) && t.id && !servem.length) {   // v3.48.0: ninguém serve — quem pode virar comida
                const fu = breedFoodLine(l), ft = fu ? breedTrunk(fu) : null;
                const cands = breedFoodTrunkList(t, d), bons = cands.filter(x => !x.motivo);
                if (fu) out.push({ text: `  🍖 comida em criação: ${ft?.name || fu.name || '?'} · geração ${Number(fu.gen) || 0} · ${fu.id ? (ft ? `Q ${breedQ(ft.quality)} IV ${ft.ivTotal}${ft.origem === 'familia' ? ' (família)' : ''}` : 'fora do box') : (fu.eggId ? 'ovo chocando' : 'filho por identificar')} · faixa a partir de Q ${breedQ(t.quality - BREED_Q_GAP)}`, ok: true });
                else if (bons.length) out.push({ text: `  🍖 vai virar comida: ${bons[0].name} Q ${breedQ(bons[0].quality)} IV ${bons[0].ivTotal} (${bons[0].origem === 'familia' ? 'família' : 'box'}) × comida própria Q ${breedQ(bons[0].propria.quality)} IV ${bons[0].propria.ivTotal} · faixa a partir de Q ${breedQ(t.quality - BREED_Q_GAP)} · ~${bons[0].geracoes} ${bons[0].geracoes === 1 ? 'geração' : 'gerações'} (Δ esperado 0,01)`, ok: true });
                else out.push({ text: `  🍖 ninguém da espécie pode virar comida${cands.length ? ` — ${cands.slice(0, 3).map(x => `${x.name} Q ${breedQ(x.quality)} IV ${x.ivTotal}: ${x.motivo}`).join(' · ')}` : ''}`, ok: false });
            }
            for (const f of lista.slice(0, BREED_FOOD_SHOW)) out.push({ text: `  ${f.motivo ? '✖' : '✔'} ${f.name} Q ${breedQ(f.quality)} IV ${f.ivTotal}${f.level ? ` lv${f.level}` : ''} · ${f.origem === 'familia' ? 'família' : (f.breedingBox ? 'Breeding Box' : 'box')}${f.motivo ? ` — ${f.motivo}` : ''}`, ok: !f.motivo });
            if (lista.length > BREED_FOOD_SHOW) out.push({ text: `  … e mais ${lista.length - BREED_FOOD_SHOW} (as mais fracas aparecem primeiro)`, ok: false });
        });
        return out;
    }

    // ---- Farm por lista (v3.33.0): dropar N de cada item na hunt do monstro escolhido, um item de cada vez -----------------
    // Pedido do usuário (10/10/2026): "eu coloco 1000 x item x e o nome do monstro; o script dropa isso e quando acabar vai para o
    // próximo". `cfg.farmList` = [{ item, qty, hunt, got }] em ordem; `got` = drops do item contados nos `field-kill` desde que a
    // etapa começou (persistido no cfg: sobrevive à recarga; gravado no máximo a cada FARM_SAVE_MS). Etapa atual = a 1ª com
    // `got < qty` e não pulada. Monstro = slug exato da hunt, senão nome da espécie/hunt (a de menor nível ao alcance do time);
    // vazio = a hunt que mais dropa o item (`lootPerKill`, até o nível do time). 5ª rota excludente do Salvar; espera viagem, cura,
    // troca de hunt/líder e Daily Kill como as rotas do clã e da guild; `farmOnHuntChange` volta ao alvo 8 s depois de a tela
    // trocar. Os itens da lista ficam fora da venda automática de drops e do guardar na cidade (`farmKeepsItem`) enquanto o módulo
    // está ligado. Hunt não encontrada ou entrada que não confirma (`farmHuntFailed`) = etapa pulada nesta sessão (aviso). Lista
    // concluída = aviso e volta para a hunt de antes (`farmFrom`). Logs `farm-alvo`, `farm-espera`, `farm-etapa`, `farm-pulada`,
    // `farm-volta`, `farm-reentrada`, `farm-hunt-falhou`, `farm-aviso`. Teste: `node test/farm.test.js` (`loadFarmModule`).
    const FARM_TICK_MS = 60 * 1000;
    const FARM_REENTER_MS = 8000;
    const FARM_SAVE_MS = 10 * 1000;   // todo abate pode dropar: grava o progresso no cfg no máximo a cada 10 s (e na hora ao fechar)
    let farmTarget = null;            // { key, idx, slug, name, level, item, qty, perKill }
    let farmFrom = null;              // hunt de antes da lista (para onde voltar)
    let farmWait = '';                // por que a lista ainda não anda (painel + log `farm-espera`)
    const farmSkipped = new Map();    // chave da etapa -> motivo (pulada nesta sessão)
    const farmFailed = new Set();     // hunts cuja entrada não confirmou nesta sessão
    let farmReenterTimer = null, farmSaveTimer = null;
    let farmBusy = false;
    let onFarmChange = null;          // callback do painel
    function farmNotify() { if (onFarmChange) { try { onFarmChange(); } catch { /* painel fechado */ } } }
    const farmN = (n) => Number(n).toLocaleString('pt-BR');

    function farmList(d) { d = d || cfg; return (Array.isArray(d.farmList) ? d.farmList : []).filter(e => e && typeof e === 'object' && e.item && Math.floor(Number(e.qty) || 0) > 0); }
    function farmOn(d) { d = d || cfg; return Boolean(d.farmEnabled) && farmList(d).length > 0; }
    function farmGot(e) { return Math.max(0, Math.floor(Number(e?.got) || 0)); }
    function farmQty(e) { return Math.max(0, Math.floor(Number(e?.qty) || 0)); }
    function farmEntryDone(e) { return farmGot(e) >= farmQty(e); }
    function farmKey(e) { return `${normalize(e?.item || '')}|${normalize(e?.hunt || '')}`; }
    function farmLevelCap() { return typeof clanLevelCap === 'function' ? clanLevelCap() : 9999; }
    // Linha do painel: "1000 Magikarp Fin @ magikarp" | "1000x Magikarp Fin @ Magikarp" | "1000 Magikarp Fin" (monstro vazio).
    function parseFarmLine(line) {
        const m = String(line || '').trim().match(/^(\d+)\s*[x×]?\s+([^@]+?)\s*(?:@\s*(.+?))?\s*$/i);
        if (!m) return null;
        const qty = parseInt(m[1], 10);
        if (!(qty > 0)) return null;
        return { item: m[2].trim(), qty, hunt: m[3] ? huntSlugFromName(m[3]) : '' };
    }
    function farmLineText(e) { return `${farmQty(e)} ${e.item}${e.hunt ? ` @ ${e.hunt}` : ''}`; }
    // Texto do painel -> lista no formato do cfg, conservando o progresso (`got`) das etapas que já existiam (mesmo item e monstro).
    function parseFarmText(text, antes) {
        const prev = new Map((Array.isArray(antes) ? antes : []).map(e => [farmKey(e), farmGot(e)]));
        const list = [], ruins = [];
        for (const raw of String(text || '').split(/\r?\n/)) {
            const l = raw.trim();
            if (!l) continue;
            const e = parseFarmLine(l);
            if (!e) { ruins.push(l); continue; }
            e.got = prev.get(farmKey(e)) || 0;
            prev.delete(farmKey(e));   // linha repetida não herda o progresso da primeira
            list.push(e);
        }
        return { list, ruins };
    }
    // Ids dos itens da lista (pelo nome, no catálogo público e nos drops já vistos nesta hunt): ficam fora da venda e do guardar.
    function farmItemIds() {
        const names = new Set(farmList().map(e => normalize(e.item)));
        const ids = new Set();
        if (typeof itemsCatalog !== 'undefined' && itemsCatalog) for (const [id, it] of itemsCatalog) if (names.has(normalize(it?.name))) ids.add(Number(id));
        if (typeof huntLoot !== 'undefined' && huntLoot) for (const [id, l] of huntLoot) if (names.has(normalize(l?.name))) ids.add(Number(id));
        return ids;
    }
    function farmKeepsItem(id) { return farmOn() && farmItemIds().has(Number(id)); }
    // Etapa atual: a 1ª não concluída e não pulada. { idx, e } ou null.
    function farmCurrent(d) {
        const list = farmList(d);
        for (let i = 0; i < list.length; i++) if (!farmEntryDone(list[i]) && !farmSkipped.has(farmKey(list[i]))) return { idx: i, e: list[i] };
        return null;
    }
    // Hunt da etapa: { slug, name, level, perKill } ou null (não achei / todas falharam nesta sessão).
    function farmHuntFor(e) {
        if (!Array.isArray(huntCatalog)) return null;
        const cap = farmLevelCap();
        const per = (h) => (typeof lootPerKill === 'function' && h.speciesId ? lootPerKill(h.speciesId, e.item) : 0);
        let cands;
        if (e.hunt) {
            const slug = huntSlugFromName(e.hunt), k = normalize(e.hunt);
            cands = huntCatalog.filter(h => h.slug === slug || normalize(h.speciesName || '') === k || normalize(h.name) === k)
                .sort((a, b) => (a.slug === slug ? 0 : 1) - (b.slug === slug ? 0 : 1) || (a.level <= cap ? 0 : 1) - (b.level <= cap ? 0 : 1) || a.level - b.level);
        } else {
            cands = huntCatalog.filter(h => h.speciesId && h.level <= cap).map(h => ({ h, e: per(h) })).filter(x => x.e > 0)
                .sort((a, b) => b.e - a.e || a.h.level - b.h.level).map(x => x.h);
        }
        const h = cands.find(x => !farmFailed.has(x.slug));
        return h ? { slug: h.slug, name: h.name, level: h.level, perKill: per(h) } : null;
    }
    function farmSetWait(motivo) {
        if (motivo === farmWait) return;
        farmWait = motivo;
        if (motivo) logEvent('farm-espera', { motivo, hunt: huntSlug || null });
        farmNotify();
    }
    function farmSave() { clearTimeout(farmSaveTimer); farmSaveTimer = null; saveCfg(cfg); }
    function farmHuntFailed(slug) {
        farmFailed.add(slug);
        if (farmTarget?.slug === slug) farmTarget = null;
        logEvent('farm-hunt-falhou', { slug });
    }
    function farmReturn(motivo) {
        const volta = farmFrom;
        const atual = normalize(huntSlug || '');
        farmTarget = null; farmFrom = null;
        logEvent('farm-volta', { motivo, volta });
        farmNotify();
        if (volta && volta !== atual) switchHunt(volta, 1, 'farm');
    }
    // Etapa sem hunt possível: pula nesta sessão e avisa (corrigir a linha e salvar tenta de novo).
    function farmSkip(e, motivo) {
        farmSkipped.set(farmKey(e), motivo);
        if (farmTarget?.key === farmKey(e)) farmTarget = null;
        logEvent('farm-pulada', { item: e.item, qty: farmQty(e), hunt: e.hunt || null, motivo });
        const who = playerName();
        postWebhook('alert', {
            content: `⚠️ ${who ? `**${who}**` : 'Sua conta'}: farm de **${farmN(farmQty(e))}× ${e.item}** pulado (${motivo})`,
            username: 'Poke Idle World',
            embeds: [{ title: `Farm: ${e.item} pulado`, description: `${who ? `Conta: ${who}\n` : ''}${motivo}. Corrija a linha na aba 🎒 Farm e salve para tentar de novo; a lista segue para a próxima etapa.`, color: 0xfee75c }],
        }, { evento: 'farm-pulada', item: e.item });
        farmNotify();
    }
    // Etapa fechou: avisa (com a próxima) e replaneja na hora.
    function farmEntryFinished(cur) {
        const list = farmList();
        const next = farmCurrent();
        logEvent('farm-etapa', { etapa: cur.idx + 1, de: list.length, item: cur.e.item, qty: farmQty(cur.e), got: farmGot(cur.e), hunt: farmTarget?.slug || huntSlug || null, proxima: next ? next.e.item : null });
        const who = playerName();
        postWebhook('alert', {
            content: `🎒 ${who ? `**${who}**` : 'Sua conta'}: farm de **${farmN(farmQty(cur.e))}× ${cur.e.item}** concluído${next ? ` · próximo: ${farmN(farmQty(next.e))}× ${next.e.item}` : ' · lista concluída'}`,
            username: 'Poke Idle World',
            embeds: [{
                title: `Farm: ${cur.e.item} ${farmN(farmGot(cur.e))}/${farmN(farmQty(cur.e))}`,
                description: `${who ? `Conta: ${who}\n` : ''}Etapa ${cur.idx + 1} de ${list.length}${farmTarget?.slug ? ` na hunt ${farmTarget.slug}` : ''}.\n${next ? `Próxima: ${farmN(farmQty(next.e))}× ${next.e.item}${next.e.hunt ? ` em ${next.e.hunt}` : ' (hunt que mais dropa)'}` : `Todas as etapas fechadas${farmFrom ? `: voltando para ${farmFrom}` : ''}.`}`,
                color: 0x57f287,
            }],
        }, { evento: 'farm-etapa', item: cur.e.item });
        farmTarget = null;
        farmNotify();
        farmTick();
    }
    // `field-kill`: conta o drop do item da etapa atual (pelo nome, de qualquer hunt), grava e fecha a etapa quando chega lá.
    function farmOnKill(message) {
        if (!farmOn() || !Array.isArray(message?.loot) || !message.loot.length) return;
        const cur = farmCurrent();
        if (!cur) return;
        const k = normalize(cur.e.item);
        let n = 0;
        for (const l of message.loot) {
            const nome = l?.name || (typeof itemsCatalog !== 'undefined' && itemsCatalog ? itemsCatalog.get(Number(l?.itemId))?.name : null);
            if (normalize(nome) === k) n += Math.max(0, Number(l?.qty) || 0);
        }
        if (!n) return;
        cur.e.got = farmGot(cur.e) + n;
        if (farmEntryDone(cur.e)) { farmSave(); farmEntryFinished(cur); return; }
        if (!farmSaveTimer) farmSaveTimer = setTimeout(() => { farmSaveTimer = null; saveCfg(cfg); }, FARM_SAVE_MS);
        farmNotify();
    }
    // Tique (60 s, ao fechar uma etapa e no Salvar): escolhe a etapa e a hunt, vai, volta no fim.
    async function farmTick() {
        if (farmBusy) return;
        if (!farmOn()) { if (farmTarget || farmFrom) farmReturn('farm desligado'); farmSetWait(''); return; }
        farmBusy = true;
        try {
            if (!Array.isArray(huntCatalog)) {
                try { await loadHuntCatalog(); } catch (err) { farmSetWait(`não consegui baixar o mapa de hunts (${String(err?.message || err)})`); return; }
            }
            if (typeof loadItemsCatalog === 'function') await loadItemsCatalog();
            let cur, h;
            for (;;) {
                cur = farmCurrent();
                if (!cur) {
                    const puladas = farmList().filter(e => farmSkipped.has(farmKey(e)));
                    farmSetWait(puladas.length ? `lista concluída · ${puladas.length} pulada${puladas.length > 1 ? 's' : ''} (${puladas.map(e => e.item).join(', ')}): corrija e salve` : 'lista concluída · edite a lista ou zere a contagem');
                    if (farmTarget || farmFrom) farmReturn('lista concluída');
                    return;
                }
                h = farmHuntFor(cur.e);
                if (h) break;
                farmSkip(cur.e, cur.e.hunt ? `não achei a hunt de "${cur.e.hunt}" (ou a entrada nela não confirmou)` : `nenhuma hunt até lv ${farmLevelCap()} dropa ${cur.e.item}`);
            }
            if (tripRunning) { farmSetWait('esperando a viagem à cidade acabar'); return; }
            if (typeof healBusy === 'function' && healBusy()) { farmSetWait('esperando a cura na Nurse Joy acabar'); return; }
            if (typeof bossBusy === 'function' && bossBusy()) { farmSetWait('esperando o Auto Boss do jogo acabar'); return; }
            if (typeof invBusy === 'function' && invBusy()) { farmSetWait('esperando a Invasão Rocket acabar'); return; }   // v3.50.0
            if (typeof holdActive === 'function' && holdActive()) { farmSetWait('esperando na cidade (botão do painel)'); return; }
            if (huntSwitch) { farmSetWait(`esperando a troca para ${huntSwitch.slug} confirmar`); return; }
            if (swapPending) { farmSetWait('esperando a troca de líder confirmar'); return; }
            if (typeof dailyWantsHunt === 'function' && dailyWantsHunt()) { farmSetWait('a Daily Kill está usando a hunt (o farm segue quando ela acabar)'); return; }
            farmSetWait('');
            const key = farmKey(cur.e);
            if (!farmTarget || farmTarget.key !== key || farmTarget.slug !== h.slug) {
                farmTarget = { key, idx: cur.idx, slug: h.slug, name: h.name, level: h.level, item: cur.e.item, qty: farmQty(cur.e), perKill: h.perKill };
                logEvent('farm-alvo', { etapa: cur.idx + 1, de: farmList().length, item: cur.e.item, qty: farmQty(cur.e), got: farmGot(cur.e), slug: h.slug, level: h.level, porAbate: Math.round(h.perKill * 1000) / 1000 });
                if (!(h.perKill > 0)) logEvent('farm-aviso', { item: cur.e.item, slug: h.slug, motivo: 'o item não consta na tabela de drops desse monstro (creatures.json); o script conta os drops mesmo assim' });
                farmNotify();
            }
            const atual = normalize(huntSlug || '');
            if (atual === h.slug) return;
            if (!farmFrom && atual && !CITY_SLUGS.includes(atual)) farmFrom = atual;
            switchHunt(h.slug, 1, 'farm');
        } finally { farmBusy = false; }
    }
    // O jogo entrou em outra hunt (tela reafirmando a escolhida na mão, reconexão): volta ao alvo 8 s depois.
    function farmOnHuntChange(slug) {
        clearTimeout(farmReenterTimer); farmReenterTimer = null;
        if (!farmOn() || !farmTarget || tripRunning || (typeof healBusy === 'function' && healBusy()) || (typeof bossBusy === 'function' && bossBusy()) || (typeof invBusy === 'function' && invBusy()) || (typeof holdActive === 'function' && holdActive())) return;
        const h = normalize(slug || '');
        if (!h || CITY_SLUGS.includes(h) || h === farmTarget.slug) return;
        if (typeof dailyWantsHunt === 'function' && dailyWantsHunt()) return;
        farmReenterTimer = setTimeout(() => {
            farmReenterTimer = null;
            if (!farmOn() || !farmTarget || huntSwitch) return;
            const atual = normalize(huntSlug || '');
            if (!atual || atual === farmTarget.slug || (typeof dailyWantsHunt === 'function' && dailyWantsHunt())) return;
            logEvent('farm-reentrada', { de: atual, slug: farmTarget.slug, motivo: 'o jogo entrou em outra hunt' });
            switchHunt(farmTarget.slug, 1, 'farm');
        }, FARM_REENTER_MS);
    }
    // Salvar / botões do painel: esquece pulos e falhas da sessão e replaneja.
    function farmReset() {
        farmSkipped.clear(); farmFailed.clear();
        farmTarget = null;
        farmSetWait('');
    }
    // Linha de estado do painel.
    function farmLine(d) {
        d = d || cfg;
        if (!d.farmEnabled) return 'Farm desligado';
        if (!farmList(d).length) return 'Sem itens na lista: o farm fica desligado';
        if (farmTarget) {
            const cur = farmCurrent();
            const got = cur && farmKey(cur.e) === farmTarget.key ? farmGot(cur.e) : 0;
            const falta = Math.max(0, farmTarget.qty - got);
            const est = farmTarget.perKill > 0 ? ` · ~${farmN(Math.ceil(falta / farmTarget.perKill))} abates` : '';
            return `▶ ${farmTarget.item} ${farmN(got)}/${farmN(farmTarget.qty)} em ${farmTarget.slug} lv${farmTarget.level}${farmTarget.perKill > 0 ? ` (~${Math.round(farmTarget.perKill * 100) / 100}/abate)` : ' (item fora da tabela de drops)'}${est}${farmFrom ? ` · volta para ${farmFrom}` : ''}`;
        }
        if (farmWait) return `parado: ${farmWait}`;
        return cfg.farmEnabled ? 'escolhendo a hunt… (confere a cada 1 min)' : 'salve para ligar';
    }

    // ---- Guild (v3.30.0): ler o estado da guild e confirmar o formato no log ANTES de automatizar ---------------------
    // Levantado no bundle do cliente em 09/10/2026 (janela "Guild" do menu, patch 1.9 do mesmo dia; a pokepedia ainda não
    // documenta o sistema e o patch note completo está só no Discord do jogo). TUDO pelo socket, sem REST:
    //   cliente -> `guild-get { withList }` (true = traz também a lista de guilds do servidor) · `guild-history-get` (chat) ·
    //              `guild-action { action, ... }` com action em: create{ name, tag, crest } · invite{ name } · respond{ inviteId,
    //              accept } · leave · kick{ targetId } · rank{ targetId, rank } · rename-rank{ rank, title } · motd{ text } ·
    //              crest{ crest } · dissolve{ confirm } · donate{ amount } (gold; teto diário por membro) · tribute{ amount }
    //              (item do dia, consumido da mochila) · talent{ key } (só o Presidente).
    //   servidor -> `guild { guild{ id, name, tag, crest, motd, tier, points, members, slots, maxSlots, nextSlot{ points, gold },
    //              goldDonated, bonusPct, online }, me{ rank (0 Presidente, 1 Oficial, 2 Membro), isPresident, canInvite, gold,
    //              donatedToday, donateCap, buff{ kind: xp|loot|catch, pct } }, members[{ characterId, name, level, rank, online,
    //              lastSeenMs, isMe, clan, clanRank, weekKills, weekGold, team[{ slot, dex, level, shiny }] }], rankTitles,
    //              hunts[{ id, kind, tier, species[{ dex, name }], progress, goal, done }], huntsEndAt, dailies[{ id, region,
    //              verb: kill|catch, progress, goal, points, done }], dailyRegions[{ region, active }], tribute{ itemId, itemName,
    //              progress, goal, points, mine, done }, tributeEndAt, talents[{ key, level, max, per, value, next }],
    //              points{ available }, dex{ caught, total, recent[] }, history[{ kind, actor, at, payload }], invites[{ id,
    //              guildName, fromName, tag, crest }], list[{ id, name, tag, tier, leader, members, slots, points, bonusPct }],
    //              canCreate, createCost, myGold, flash }` · `guild-dirty` (sem campos: algo mudou, a tela relê) · `error { message }`.
    //   Caçadas (`hunts[].kind`): kill (com `species`), catch, fish, berry, evolve, egg, boss, orre, nightmare, photo — 3 por dia,
    //   o progresso de todos os membros soma. Dailies por região: kanto, outland, orre, nightmare (derrotar / capturar).
    //   Tributo do Dia: item e meta (2.000–4.000) mudam às 10h; fechar dá pontos e 15 min de +50% (xp/loot/captura) a quem está online.
    // CONFIRMADO no log em 10/10/2026 01:25Z (4 contas, guild Cocorico): o frame é exatamente este, com os extras `member.lifetimeGold`,
    // `daily.kind`, `tribute.id`/`buffKind`, `points{ total, spent, available }` e `nextSlot.slot`. `donateCap` = 500.000 POR MEMBRO
    // (01:39Z: conta2 doou 1.000 com a conta1 já no teto; o frame `guild` chegou 170 ms depois com `me.donatedToday` 1.000, `me.gold`
    // −1.000, `guild.goldDonated` +1.000 e `flash: null`; outros membros doaram 500k em seguida). Erros (`error`, ~150 ms):
    // acima do teto → "Você só pode doar até 500.000 gold por dia."; teto batido → "Você já doou o máximo de hoje (500.000 gold).";
    // sobra menor que o pedido → "Você só pode doar mais 499.000 gold hoje." (o script refaz com a sobra). `guild-dirty` chega a
    // todo membro, com a janela fechada (convite feito na conta1 → contas 2–4 releram 2 s depois). O estado chega 6 s após o socket, a cada 30 min e quando chega
    // `guild-dirty` (logs `guild-campos` 1x por carga, `guild` resumo, `guild-envio` = o que a TELA manda).
    // v3.31.0 (aba 🛡 Guild): doação diária de gold (`guildDonateGold`/`guildDonateKeep`), Tributo do Dia (`guildTributeEnabled`/
    // `guildTributeKeep`; o item do dia fica fora da venda e do guardar via `guildKeepsItem`) e avisos (`guildAlerts`, transições
    // entre dois frames: caçada/daily/tributo concluídos, dia perfeito, tier, vaga, convite). Cada ação espera a resposta do jogo
    // (frame `guild` novo ou `error`) e confere pelo próprio frame (`donatedToday`/`tribute.progress`); erro = 1 h sem insistir.
    // Talentos, convites, cargos, brasão e dissolver NUNCA são automatizados. Caçar para a guild fica para a etapa 3 (ROADMAP #32).
    const GUILD_AFTER_SOCKET_MS = 6000;
    const GUILD_TICK_MS = 60 * 1000;
    const GUILD_REFRESH_MS = 30 * 60 * 1000;   // releitura de rotina (o servidor avisa mudanças com `guild-dirty`)
    const GUILD_DIRTY_GAP_MS = 30 * 1000;      // vários `guild-dirty` seguidos (abates da guild inteira) = uma leitura só
    let lastGuild = null;        // último frame `guild` recebido (null = ainda não leu)
    let lastGuildAt = 0;
    let guildAskedAt = 0;
    let guildDirtyTimer = null;
    let guildFieldsLogged = false;
    const GUILD_ACTION_RETRY_MS = 60 * 60 * 1000;   // depois de um erro (ou sem resposta), 1 h antes de tentar a mesma ação
    const GUILD_REPLY_MS = 4000;                    // o jogo responde em ~150 ms; sem nada em 4 s o script pede `guild-get` para conferir
    const GUILD_DROP_GAP_MS = 5 * 60 * 1000;        // releitura por drop do item do tributo: no máximo 1 a cada 5 min
    const GUILD_KIND_LABEL = { kill: 'Derrotar', catch: 'Capturar Pokémon', fish: 'Pescar peixes', berry: 'Colher ervas e berries', evolve: 'Evoluir Pokémon', egg: 'Chocar ovos', boss: 'Derrotar bosses', orre: 'Caçar em Orre', nightmare: 'Caçar na Nightmare', photo: 'Fotos de Pokémon shiny' };
    const GUILD_REGION_LABEL = { kanto: 'Kanto', outland: 'Outland', orre: 'Orre', nightmare: 'Nightmare' };
    const GUILD_VERB_LABEL = { kill: 'derrotar', catch: 'capturar' };
    const GUILD_BUFF_LABEL = { xp: 'XP', loot: 'Loot', catch: 'Captura' };
    let guildPending = null;      // ação enviada pelo script esperando resposta: { action, amount, antes, at, timer }
    let guildDonateDoneUntil = 0; // "já doou o máximo de hoje": não tenta de novo antes disto (reinício do dia da guild, `huntsEndAt`)
    let guildTriedAt = {};        // { donate: ts, tribute: ts } última tentativa (não insiste antes de GUILD_ACTION_RETRY_MS)
    let guildLast = {};           // { donate: { at, ok, amount, erro }, tribute: {...} } resultado da última ação, para o painel
    let onGuildChange = null;     // callback do painel
    function guildNotify() { if (onGuildChange) { try { onGuildChange(); } catch { /* painel fechado */ } } }
    const guildHora = (ts) => new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const guildN = (n) => Number(n).toLocaleString('pt-BR');

    function guildRequest(motivo, withList) {
        guildAskedAt = Date.now();
        const enviado = sendGame({ type: 'guild-get', withList: Boolean(withList) });
        logEvent('guild-get', { motivo: motivo || null, lista: Boolean(withList), enviado });
        return enviado;
    }

    function guildOnDirty() {
        if (guildDirtyTimer) return;
        const wait = Math.max(500, GUILD_DIRTY_GAP_MS - (Date.now() - guildAskedAt));
        guildDirtyTimer = setTimeout(() => { guildDirtyTimer = null; guildRequest('dirty'); }, wait);
    }

    function guildTick() {
        guildRouteTick();
        if (Date.now() - Math.max(lastGuildAt, guildAskedAt) < GUILD_REFRESH_MS) return;
        guildRequest('rotina');
    }

    function guildKeys(o) {
        if (Array.isArray(o)) return `array(${o.length})`;
        if (o && typeof o === 'object') return Object.keys(o);
        return o === undefined ? undefined : typeof o;
    }

    function handleGuild(message) {
        const prev = lastGuild;
        lastGuild = message;
        lastGuildAt = Date.now();
        guildKillsSince = 0;
        const g = message.guild && typeof message.guild === 'object' ? message.guild : null;
        const me = message.me && typeof message.me === 'object' ? message.me : null;
        const first = (arr) => (Array.isArray(arr) && arr.length ? arr[0] : null);
        if (!guildFieldsLogged) {
            guildFieldsLogged = true;
            logEvent('guild-campos', {
                raiz: guildKeys(message), guild: guildKeys(g), me: guildKeys(me), buff: guildKeys(me?.buff), proximaVaga: guildKeys(g?.nextSlot),
                membro: guildKeys(first(message.members)), cacada: guildKeys(first(message.hunts)), especie: guildKeys(first(first(message.hunts)?.species)),
                daily: guildKeys(first(message.dailies)), regiao: guildKeys(first(message.dailyRegions)), tributo: guildKeys(message.tribute),
                talento: guildKeys(first(message.talents)), pontos: guildKeys(message.points), dex: guildKeys(message.dex),
                historico: guildKeys(first(message.history)), convite: guildKeys(first(message.invites)), lista: guildKeys(first(message.list)),
            });
        }
        const t = message.tribute && typeof message.tribute === 'object' ? message.tribute : null;
        logEvent('guild', {
            guild: g ? { nome: g.name ?? null, tag: g.tag ?? null, tier: g.tier ?? null, pontos: g.points ?? null, membros: g.members ?? null, vagas: g.slots ?? null, online: g.online ?? null, bonusPct: g.bonusPct ?? null, goldDoado: g.goldDonated ?? null, proximaVaga: g.nextSlot ?? null } : null,
            eu: me ? { rank: me.rank ?? null, presidente: Boolean(me.isPresident), gold: me.gold ?? null, doadoHoje: me.donatedToday ?? null, tetoDoacao: me.donateCap ?? null, buff: me.buff ?? null } : null,
            tributo: t ? { item: t.itemName ?? null, itemId: t.itemId ?? null, progresso: t.progress ?? null, meta: t.goal ?? null, tenho: t.mine ?? null, pontos: t.points ?? null, feito: Boolean(t.done) } : null,
            cacadas: Array.isArray(message.hunts) ? message.hunts.map(h => ({ tipo: h?.kind ?? null, especies: Array.isArray(h?.species) ? h.species.map(x => x?.name).filter(Boolean) : [], progresso: h?.progress ?? null, meta: h?.goal ?? null, feito: Boolean(h?.done), tier: h?.tier ?? null, minha: h?.mine ?? null, teto: h?.cap ?? null })) : null,
            dailies: Array.isArray(message.dailies) ? message.dailies.map(d => ({ regiao: d?.region ?? null, verbo: d?.verb ?? null, progresso: d?.progress ?? null, meta: d?.goal ?? null, pontos: d?.points ?? null, feito: Boolean(d?.done) })) : null,
            regioes: Array.isArray(message.dailyRegions) ? message.dailyRegions : null,
            fimCacadas: message.huntsEndAt ?? null, fimTributo: message.tributeEndAt ?? null,
            talentos: Array.isArray(message.talents) ? message.talents.map(x => `${x?.key} ${x?.level}/${x?.max}`) : null,
            pontosDisponiveis: message.points?.available ?? null,
            convites: Array.isArray(message.invites) ? message.invites.length : null,
            lista: Array.isArray(message.list) ? message.list.length : null,
            podeFundar: message.canCreate ?? null, custoFundar: message.createCost ?? null, flash: message.flash ?? null,
        });
        if (guildPending) guildActionDone(message, null);
        try { guildAlertChanges(prev, message); } catch (err) { console.warn(TAG, 'guild avisos:', err); }
        guildAutomate(message);
        guildRouteTick();
        guildNotify();
    }

    // ---- automação: doação diária de gold e Tributo do Dia
    function guildDonateWanted(d) { return Math.max(0, Math.floor(Number((d || cfg).guildDonateGold) || 0)); }
    function guildOn(d) { d = d || cfg; return guildDonateWanted(d) > 0 || Boolean(d.guildTributeEnabled) || Boolean(d.guildAlerts) || guildRouteOn(d); }
    function guildRouteOn(d) { d = d || cfg; return Boolean(d.guildHuntEnabled || d.guildFishEnabled || d.guildFarmTribute); }
    // Item do Tributo do Dia enquanto o tributo está aberto: fica fora da venda de drops e do guardar na cidade.
    function guildKeepsItem(id) {
        const t = lastGuild?.tribute;
        return Boolean((cfg.guildTributeEnabled || cfg.guildFarmTribute) && lastGuild?.guild && t && !t.done && Number(t.itemId) === Number(id));
    }

    function guildAutomate(m) {
        const g = m.guild && typeof m.guild === 'object' ? m.guild : null;
        const me = m.me && typeof m.me === 'object' ? m.me : null;
        if (!g || !me || guildPending) return;
        const now = Date.now();
        const quer = guildDonateWanted();
        if (quer > 0 && now - (guildTriedAt.donate || 0) >= GUILD_ACTION_RETRY_MS && now >= guildDonateDoneUntil) {
            const cap = Number(me.donateCap) || 0, feito = Number(me.donatedToday) || 0, gold = Number(me.gold) || 0;
            const keep = Math.max(0, Number(cfg.guildDonateKeep) || 0);
            const amount = Math.floor(Math.min(quer - feito, cap - feito, gold - keep));
            if (amount > 0) { guildAct('donate', amount, feito, { quer, teto: cap, doadoHoje: feito, gold, manter: keep }); return; }
        }
        const t = m.tribute && typeof m.tribute === 'object' ? m.tribute : null;
        if ((cfg.guildTributeEnabled || cfg.guildFarmTribute) && t && !t.done && now - (guildTriedAt.tribute || 0) >= GUILD_ACTION_RETRY_MS) {
            const keep = Math.max(0, Number(cfg.guildTributeKeep) || 0);
            const amount = Math.floor(Math.min((Number(t.mine) || 0) - keep, (Number(t.goal) || 0) - (Number(t.progress) || 0)));
            if (amount > 0) guildAct('tribute', amount, Number(t.progress) || 0, { item: t.itemName ?? null, itemId: t.itemId ?? null, tenho: t.mine ?? null, guardar: keep, meta: t.goal ?? null });
        }
    }

    function guildAct(action, amount, antes, dados) {
        guildTriedAt[action] = Date.now();
        const enviado = sendGame({ type: 'guild-action', action, amount });
        logEvent('guild-acao', Object.assign({ action, amount, enviado }, dados || {}));
        if (!enviado) return;
        guildPending = { action, amount, antes, at: Date.now(), dados: dados || {}, timer: null };
        guildPending.timer = setTimeout(() => {   // sem `guild` nem `error`: pede o estado e confere por ele
            if (!guildPending) return;
            guildRequest('confirmar ' + action);
            guildPending.timer = setTimeout(() => { if (guildPending) guildActionDone(null, 'o jogo não respondeu'); }, 10000);
        }, GUILD_REPLY_MS);
    }

    // Resposta de uma ação do script: frame `guild` novo (confere pelos números) ou `error { message }`.
    function guildOnError(message) {
        if (guildPending && Date.now() - guildPending.at <= GUILD_REPLY_MS + 10000) guildActionDone(null, String(message?.message || 'erro do jogo'));
    }
    function guildActionDone(frame, erro) {
        const p = guildPending; if (!p) return;
        clearTimeout(p.timer); guildPending = null;
        let depois = null, ok = false;
        if (p.action === 'donate') { depois = Number(frame?.me?.donatedToday); ok = !erro && Number.isFinite(depois) && depois >= p.antes + p.amount; }
        else { depois = Number(frame?.tribute?.progress); ok = !erro && ((Number.isFinite(depois) && depois >= p.antes + p.amount) || Boolean(frame?.tribute?.done)); }
        if (!erro && !ok) erro = frame ? 'o jogo não registrou' : 'o jogo não respondeu';
        guildLast[p.action] = { at: Date.now(), ok, amount: p.amount, erro: erro || null, depois: Number.isFinite(depois) ? depois : null, item: p.dados.item || null };
        if (ok) guildTriedAt[p.action] = 0;   // deu certo: pode doar/depositar de novo assim que o frame mostrar espaço
        if (p.action === 'donate' && erro) {   // v3.31.2: os textos do jogo (confirmados em 10/10/2026)
            const sobra = /doar mais ([\d.]+)/i.exec(erro);
            if (/máximo de hoje/i.test(erro)) {   // teto do dia batido: só volta a tentar no reinício do dia da guild
                const fim = Number(lastGuild?.huntsEndAt) || 0;
                guildDonateDoneUntil = fim > Date.now() ? fim : Date.now() + GUILD_ACTION_RETRY_MS;
            } else if (sobra && !p.dados.refeita) {   // "só pode doar mais N gold hoje": refaz uma vez com a sobra
                const n = Math.floor(Number(sobra[1].replace(/\./g, '')) || 0);
                if (n > 0 && n < p.amount) {
                    logEvent('guild-doacao', { ok: false, amount: p.amount, antes: p.antes, depois: null, erro, refazCom: n });
                    guildTriedAt.donate = 0;
                    setTimeout(() => guildAct('donate', n, p.antes, Object.assign({}, p.dados, { refeita: true })), 300);
                    guildNotify();
                    return;
                }
            }
        }
        logEvent(p.action === 'donate' ? 'guild-doacao' : 'guild-tributo', { ok, amount: p.amount, antes: p.antes, depois, erro: erro || null, flash: frame?.flash ?? null });
        const who = playerName();
        const quem = who ? `**${who}**` : 'Sua conta';
        const texto = p.action === 'donate'
            ? (ok ? `doou **${guildN(p.amount)} gold** para a guild${frame?.guild ? ` **${frame.guild.name}**` : ''} (hoje: ${guildN(depois)} / ${guildN(frame?.me?.donateCap ?? 0)})` : `não conseguiu doar ${guildN(p.amount)} gold para a guild: ${erro}`)
            : (ok ? `depositou **${guildN(p.amount)}× ${p.dados.item || 'item'}** no Tributo do Dia (${guildN(depois)} / ${guildN(frame?.tribute?.goal ?? 0)}${frame?.tribute?.done ? ' · concluído!' : ''})` : `não conseguiu depositar ${guildN(p.amount)}× ${p.dados.item || 'item'} no tributo: ${erro}`);
        postWebhook('alert', {
            content: `🛡️ ${quem} ${texto}`,
            username: 'Poke Idle World',
            embeds: [{ title: p.action === 'donate' ? 'Doação para a guild' : 'Tributo do Dia', description: `${who ? `Conta: ${who}\n` : ''}${texto.replace(/\*\*/g, '')}\nEm ${new Date().toLocaleString('pt-BR')}`, color: ok ? 0x57f287 : 0xed4245 }],
        }, { evento: p.action === 'donate' ? 'guild-doacao' : 'guild-tributo', ok });
        guildNotify();
    }

    // Drop do item do tributo na hunt: relê a guild (no máximo 1x a cada 5 min) para depositar sem esperar os 30 min.
    function guildOnKill(message) {
        guildCountKill();
        if (!(cfg.guildTributeEnabled || cfg.guildFarmTribute) || !Array.isArray(message?.loot)) return;
        const t = lastGuild?.tribute;
        if (!t || t.done || !message.loot.some(l => Number(l?.itemId) === Number(t.itemId))) return;
        if (Date.now() - guildAskedAt < GUILD_DROP_GAP_MS) return;
        guildRequest('drop do tributo');
    }

    // ---- avisos: o que mudou entre o frame anterior e este (só com `guildAlerts`)
    function guildHuntLabel(h) {
        if (!h) return '?';
        if (h.kind === 'kill') return `Derrotar ${(Array.isArray(h.species) ? h.species.map(x => x?.name).filter(Boolean) : []).join(' & ') || 'Pokémon'}`;
        return GUILD_KIND_LABEL[h.kind] || String(h.kind || '?');
    }
    function guildDailyLabel(d) { return `${GUILD_VERB_LABEL[d?.verb] || d?.verb || '?'} em ${GUILD_REGION_LABEL[d?.region] || d?.region || '?'}`; }
    function guildAlertChanges(prev, m) {
        if (!cfg.guildAlerts) return;
        const linhas = [];
        const g = m.guild && typeof m.guild === 'object' ? m.guild : null;
        const invAntes = new Set(Array.isArray(prev?.invites) ? prev.invites.map(i => String(i?.id)) : []);
        for (const i of (Array.isArray(m.invites) ? m.invites : [])) if (!invAntes.has(String(i?.id))) linhas.push(`✉️ Convite para a guild **${i?.guildName || '?'}** de ${i?.fromName || '?'}`);
        if (g && prev && prev.guild) {
            const pg = prev.guild;
            const doneAntes = (arr) => new Set((Array.isArray(arr) ? arr : []).filter(x => x?.done).map(x => String(x.id)));
            const hd = doneAntes(prev.hunts);
            const hunts = Array.isArray(m.hunts) ? m.hunts : [];
            for (const h of hunts) if (h?.done && !hd.has(String(h.id))) linhas.push(`🎯 Caçada concluída: **${guildHuntLabel(h)}** (${guildN(h.progress)} / ${guildN(h.goal)})`);
            const capAntes = new Set((Array.isArray(prev.hunts) ? prev.hunts : []).filter(h => guildHuntCapped(h)).map(h => String(h.id)));
            for (const h of hunts) if (guildHuntCapped(h) && !capAntes.has(String(h.id))) linhas.push(`◐ Sua parte da caçada **${guildHuntLabel(h)}** fechou (${guildN(h.cap)}/${guildN(h.cap)}) — o resto vem dos outros membros`);
            if (hunts.length >= 3 && hunts.every(h => h?.done) && !(Array.isArray(prev.hunts) && prev.hunts.length && prev.hunts.every(h => h?.done))) linhas.push('🏆 Dia perfeito: as 3 caçadas do dia fechadas (+1 ponto)');
            const dd = doneAntes(prev.dailies);
            for (const d of (Array.isArray(m.dailies) ? m.dailies : [])) if (d?.done && !dd.has(String(d.id))) linhas.push(`🌍 Daily concluída: **${guildDailyLabel(d)}** (+${d.points ?? 0} XP de guild)`);
            if (m.tribute?.done && !(prev.tribute?.done && String(prev.tribute?.id) === String(m.tribute?.id))) linhas.push(`🏺 Tributo do Dia concluído: **${m.tribute.itemName || 'item'}**${m.me?.buff ? ` · buff +${m.me.buff.pct}% ${GUILD_BUFF_LABEL[m.me.buff.kind] || m.me.buff.kind} para quem está online` : ''}`);
            if (Number(g.tier) > Number(pg.tier)) linhas.push(`⬆️ A guild subiu para o **Tier ${['', 'I', 'II', 'III', 'IV', 'V'][Number(g.tier)] || g.tier}**`);
            if (Number(g.slots) > Number(pg.slots)) linhas.push(`🔓 Vaga desbloqueada: agora **${g.slots} vagas**`);
        }
        if (!linhas.length) return;
        const who = playerName();
        postWebhook('alert', {
            content: `🛡️ Guild${g ? ` **${g.name}**` : ''}: ${linhas[0].replace(/\*\*/g, '')}${linhas.length > 1 ? ` (+${linhas.length - 1})` : ''}`,
            username: 'Poke Idle World',
            embeds: [{ title: g ? `${g.name} [${g.tag || ''}]` : 'Guild', description: `${linhas.join('\n')}${who ? `\nVisto por: ${who}` : ''}\nEm ${new Date().toLocaleString('pt-BR')}`, color: 0x5865f2 }],
        }, { evento: 'guild-aviso', linhas: linhas.length });
        logEvent('guild-aviso', { linhas });
    }

    // Linhas do painel (bloco de estado). { text, ok?, dim? }
    function guildStatus(d) {
        d = d || cfg;
        const m = lastGuild;
        const out = [];
        if (!m) { out.push({ text: 'Guild ainda não lida (o script pede 6 s depois de conectar).', dim: true }); return out; }
        const g = m.guild && typeof m.guild === 'object' ? m.guild : null;
        const me = m.me || {};
        if (!g) {
            out.push({ text: `Esta conta não está em uma guild.${Array.isArray(m.invites) && m.invites.length ? ` Convites: ${m.invites.map(i => i?.guildName).filter(Boolean).join(', ')}` : ''}`, dim: true });
            return out;
        }
        const tierTxt = ['', 'I', 'II', 'III', 'IV', 'V'][Number(g.tier)] || g.tier;
        out.push({ text: `${g.name} [${g.tag || ''}] · Tier ${tierTxt} · ${guildN(g.points)} pontos · ${g.members}/${g.slots} membros (${g.online ?? '?'} online) · bônus +${String(g.bonusPct ?? 0).replace('.', ',')}% XP · lido ${guildHora(lastGuildAt)}` });
        if (g.nextSlot) out.push({ text: `Próxima vaga (${g.nextSlot.slot ?? g.slots + 1}ª): ${guildN(g.points)}/${guildN(g.nextSlot.points)} pontos · ${guildN(g.goldDonated)}/${guildN(g.nextSlot.gold)} gold doado` });
        else out.push({ text: `Todas as ${g.maxSlots} vagas desbloqueadas.`, ok: true });
        const rankNome = ['Presidente', 'Oficial', 'Membro'][Number(me.rank)] || `rank ${me.rank}`;
        const quer = guildDonateWanted(d);
        out.push({ text: `Você: ${rankNome} · gold ${guildN(me.gold ?? 0)} · doou hoje ${guildN(me.donatedToday ?? 0)}/${guildN(me.donateCap ?? 0)}${quer ? ` · o script doa até ${guildN(quer)}/dia${Number(d.guildDonateKeep) > 0 ? `, mantendo ${guildN(d.guildDonateKeep)}` : ''}` : ' · doação automática desligada'}${me.buff ? ` · buff +${me.buff.pct}% ${GUILD_BUFF_LABEL[me.buff.kind] || me.buff.kind}` : ''}`, ok: Boolean(quer) && Number(me.donatedToday) >= Number(me.donateCap) });
        if (guildLast.donate) out.push({ text: `Última doação ${guildHora(guildLast.donate.at)}: ${guildLast.donate.ok ? `${guildN(guildLast.donate.amount)} gold ✔` : `⚠ ${guildLast.donate.erro}`}`, ok: guildLast.donate.ok, dim: !guildLast.donate.ok });
        const t = m.tribute;
        if (t) out.push({ text: `Tributo do Dia: ${t.itemName || '?'} ${guildN(t.progress)}/${guildN(t.goal)}${t.done ? ' · concluído ✔' : ` · você tem ${guildN(t.mine ?? 0)}`} · +${t.points ?? 0} pontos${d.guildTributeEnabled ? (t.done ? '' : ` · o script deposita${Number(d.guildTributeKeep) > 0 ? `, guardando ${guildN(d.guildTributeKeep)}` : ''}`) : ' · depósito automático desligado'} · reinicia ${m.tributeEndAt ? guildHora(m.tributeEndAt) : '?'}`, ok: Boolean(t.done) });
        if (guildLast.tribute) out.push({ text: `Último depósito ${guildHora(guildLast.tribute.at)}: ${guildLast.tribute.ok ? `${guildN(guildLast.tribute.amount)}× ${guildLast.tribute.item || 'item'} ✔` : `⚠ ${guildLast.tribute.erro}`}`, ok: guildLast.tribute.ok, dim: !guildLast.tribute.ok });
        const hunts = Array.isArray(m.hunts) ? m.hunts : [];
        out.push({ text: `Caçadas de hoje (${hunts.filter(h => h?.done).length}/${hunts.length} · reiniciam ${m.huntsEndAt ? guildHora(m.huntsEndAt) : '?'}):`, dim: true });
        for (const h of hunts) out.push({ text: `  ${h?.done ? '✔' : guildHuntCapped(h) ? '◐' : '•'} ${guildHuntLabel(h)} ${guildN(h?.progress ?? 0)}/${guildN(h?.goal ?? 0)}${guildHuntShare(h)}${guildHuntCapped(h) ? ' — sua parte fechou' : ''}`, ok: Boolean(h?.done) });
        const dailies = Array.isArray(m.dailies) ? m.dailies : [];
        if (dailies.length) {
            out.push({ text: `Dailies por região (${dailies.filter(x => x?.done).length}/${dailies.length}):`, dim: true });
            for (const r of Object.keys(GUILD_REGION_LABEL)) {
                const ds = dailies.filter(x => x?.region === r);
                if (!ds.length) continue;
                out.push({ text: `  ${ds.every(x => x?.done) ? '✔' : '•'} ${GUILD_REGION_LABEL[r]}: ${ds.map(x => `${GUILD_VERB_LABEL[x.verb] || x.verb} ${guildN(x.progress ?? 0)}/${guildN(x.goal ?? 0)}${x.done ? ' ✔' : ''}`).join(' · ')}`, ok: ds.every(x => x?.done) });
            }
        }
        if (guildPending) out.push({ text: `Esperando o jogo responder: ${guildPending.action === 'donate' ? 'doação' : 'tributo'} de ${guildN(guildPending.amount)}…`, dim: true });
        return out;
    }

    // ---- rota da guild (v3.32.0): 4ª rota excludente, por conta --------------------------------------------------------
    // Prioridade: (1) farmar o item do Tributo do Dia na hunt que mais o dropa (`lootPerKill`, creatures.json), enquanto a
    // mochila tiver menos que falta; (2) caçar a espécie da caçada "Derrotar" (hunt da espécie no map-markers); (3) pescar:
    // `GET /api/game/fishing-tier`, `POST { tierId }` na faixa natural (CONFIRMADO em 10/10/2026: a tela faz o mesmo) e
    // `switchHunt('pesca')`. Objetivo fechou / dia reiniciou / desligou = volta para a hunt de antes (`guildFrom`). Espera viagem,
    // cura, troca de hunt/líder e Daily Kill, como a rota do clã. O jogo reafirma a hunt escolhida na tela: `guildOnHuntChange`
    // volta ao alvo 8 s depois. `fishing-cooldown { ms }`: reentra em `pesca` depois do prazo se a tela não reentrar sozinha.
    // v3.39.1 (pedido do usuário em 16/10/2026: "cada personagem só pode matar 9600 e o personagem fica nessa quest para sempre"):
    // cada caçada traz `mine` (a parte deste personagem) e `cap` (teto por membro, 40% da meta — bundle: "Sua parte: n/cap — o resto
    // precisa vir de outros membros"; Sunflora 24.000 → 9.600). Parte cheia = a caçada sai do plano desta conta mesmo com `done: false`
    // (`guildHuntCapped`), e a rota segue para o próximo objetivo ou volta para a hunt de origem. Como o frame `guild` só chega a cada
    // 30 min (ou em `guild-dirty`), os abates na hunt alvo são contados (`guildCountKill`) e, na estimativa do teto, o script relê a
    // guild (`guild-get`, motivo `parte da caçada no teto`, no máximo 1 a cada 2 min); quem decide é sempre o frame.
    const GUILD_ROUTE_REENTER_MS = 8000;
    const GUILD_CAP_GAP_MS = 2 * 60 * 1000;   // releitura "minha parte no teto": no máximo 1 a cada 2 min
    const GUILD_FISH_TIER_MS = 10 * 60 * 1000;     // relê a janela de pesca no máximo a cada 10 min
    let guildTarget = null;        // { kind: 'tributo'|'kill'|'fish', slug, name, level, motivo }
    let guildFrom = null;          // hunt de antes da rota da guild (para onde voltar); v3.46.0: também em localStorage (`guildSaveFrom`)
    let guildFromLoaded = false;   // `guildLoadFrom` roda no 1º tique (CITY_SLUGS e o log ainda não existem na carga do módulo)
    let guildWait = '';            // por que a rota ainda não foi (painel + log `guild-espera`)
    // v3.46.0: a hunt de origem sobrevive à recarga da página e a volta tem um destino de último recurso. Relato do usuário em
    // 24/10/2026 (outro PC, 4 contas dedicadas às tarefas da guild): "quando acaba de matar os monstros necessários ele não volta pra
    // hunt de caçar". `guildFrom` só era anotado na troca feita pelo script e vivia em memória: conta recarregada já dentro da hunt da
    // guild (`recarga-retomada`) ou que começou na cidade chegava ao fim do objetivo com `guildFrom` nulo e `guildReturn` não ia a lugar
    // nenhum (log `guild-volta { volta: null }`). Agora a origem fica em `localStorage.pgDiscordNotifyGuild` (24 h; é da conta, não entra
    // no Exportar/Importar) e, sem origem, a volta usa a hunt padrão do painel (`cityIdleHunt`, aba Compras → Parada na cidade), como a
    // viagem e a cura (`idleDefaultSlug`). Toda volta por objetivo fechado avisa no canal de Alertas (por conta; não depende de
    // `guildAlerts`, que é o aviso da guild inteira e só deve ficar ligado em um painel).
    const GUILD_FROM_KEY = 'pgDiscordNotifyGuild';
    const GUILD_FROM_MAX_AGE_MS = 24 * 60 * 60 * 1000;
    function guildSaveFrom() {
        try {
            if (guildFrom) localStorage.setItem(GUILD_FROM_KEY, JSON.stringify({ from: guildFrom, at: Date.now() }));
            else localStorage.removeItem(GUILD_FROM_KEY);
        } catch { /* sem localStorage: a origem vale só nesta carga */ }
    }
    function guildLoadFrom() {
        try {
            const r = JSON.parse(localStorage.getItem(GUILD_FROM_KEY) || 'null');
            const slug = r && r.from ? normalize(r.from) : null;
            const idade = Date.now() - (Number(r?.at) || 0);
            if (!slug || CITY_SLUGS.includes(slug) || slug === FISH_SLUG || idade < 0 || idade > GUILD_FROM_MAX_AGE_MS) return;
            guildFrom = slug;
            logEvent('guild-origem-lembrada', { volta: slug, idadeMin: Math.round(idade / 60000) });
        } catch { /* sem registro */ }
    }
    // Para onde a conta vai quando a rota acaba: { slug, fonte: 'origem'|'hunt padrão' } ou { motivo } quando não há destino.
    function guildReturnTarget(d) {
        if (guildFrom) return { slug: guildFrom, fonte: 'origem' };
        const padrao = typeof idleDefaultSlug === 'function' ? idleDefaultSlug(d) : null;
        if (padrao) return { slug: padrao, fonte: 'hunt padrão' };
        return { motivo: 'sem hunt de origem nem hunt padrão (preencha "Hunt padrão" em Compras → Parada na cidade)' };
    }
    let guildFailed = new Set();   // hunts cuja entrada não confirmou nesta sessão
    let guildReenterTimer = null;
    let guildRouteBusy = false;
    let fishTierAt = 0, fishTierInfo = null;   // última leitura da janela de pesca
    let fishReenterTimer = null;
    let guildKillsSince = 0;       // abates na hunt alvo desde o último frame `guild` (estimativa da parte do membro)
    let guildCapAskedAt = 0;

    // Parte do membro na caçada (v3.39.1): `cap` ausente/0 = sem teto conhecido (frame antigo).
    function guildHuntCapped(h) { return Boolean(h) && !h.done && Number(h.cap) > 0 && Number(h.mine ?? 0) >= Number(h.cap); }
    function guildHuntShare(h) { return h && Number(h.cap) > 0 ? ` · sua parte ${guildN(Math.min(Number(h.mine ?? 0), Number(h.cap)))}/${guildN(h.cap)}` : ''; }
    function guildCappedMsg(h) { return `sua parte da caçada "${guildHuntLabel(h)}" fechou (${guildN(h.cap)}/${guildN(h.cap)}) — o resto vem dos outros membros`; }
    // Abate na hunt alvo (Derrotar ou pesca): soma à parte estimada; no teto, relê a guild para o frame confirmar.
    function guildCountKill() {
        if (!guildTarget || (guildTarget.kind !== 'kill' && guildTarget.kind !== 'fish') || normalize(huntSlug || '') !== guildTarget.slug) return;
        const h = (Array.isArray(lastGuild?.hunts) ? lastGuild.hunts : []).find(x => x?.kind === guildTarget.kind && !x.done);
        if (!h || !(Number(h.cap) > 0)) return;
        guildKillsSince++;
        if (Number(h.mine ?? 0) + guildKillsSince < Number(h.cap)) return;
        if (Date.now() - Math.max(guildAskedAt, guildCapAskedAt) < GUILD_CAP_GAP_MS) return;
        guildCapAskedAt = Date.now();
        guildRequest('parte da caçada no teto');
    }

    function guildLevelCap() {
        if (typeof clanLevelCap === 'function') return clanLevelCap();
        const t = Array.isArray(team) && team.length ? Math.max(...team.map(p => Number(p.level) || 0)) : 0;
        return t || 9999;
    }
    function guildHuntFor(nome, cap) {
        if (!Array.isArray(huntCatalog)) return null;
        const k = normalize(nome || '');
        const slug = huntSlugFromName(nome || '');
        const cands = huntCatalog.filter(h => h.slug === slug || normalize(h.speciesName || '') === k || normalize(h.name) === k).sort((a, b) => (a.slug === slug ? -1 : 1) - (b.slug === slug ? -1 : 1) || a.level - b.level);
        return cands.find(h => !guildFailed.has(h.slug) && h.level <= cap) || (cands[0] ? Object.assign({}, cands[0], { foraDoNivel: true }) : null);
    }
    // Prioridade dos objetivos (v3.42.0): `cfg.guildRouteOrder` = ['tributo'|'fish'|'kill' …]; config velha/inválida = padrão.
    const GUILD_ORDER_DEFAULT = ['tributo', 'fish', 'kill'];
    const GUILD_ORDER_LABEL = { tributo: 'tributo', fish: 'pesca', kill: '"Derrotar"' };
    function guildRouteOrder(d) {
        d = d || cfg;
        const raw = Array.isArray(d.guildRouteOrder) ? d.guildRouteOrder : String(d.guildRouteOrder || '').split(',');
        const vistos = raw.map(k => String(k || '').trim().toLowerCase()).filter((k, i, a) => GUILD_ORDER_DEFAULT.includes(k) && a.indexOf(k) === i);
        return vistos.concat(GUILD_ORDER_DEFAULT.filter(k => !vistos.includes(k)));
    }
    function guildOrderText(d) { return guildRouteOrder(d).map(k => GUILD_ORDER_LABEL[k]).join(' → '); }
    // Plano ordenado pela prioridade do painel: [{ kind, slug, name, level, motivo }] ; `motivos` = por que cada parte ligada não entrou.
    function guildPlan() {
        const m = lastGuild;
        const out = [], motivos = [];
        if (!m?.guild) return { plano: out, motivos: ['guild ainda não lida'] };
        const cap = guildLevelCap();
        const t = m.tribute;
        if (cfg.guildFarmTribute) {
            if (!t) motivos.push('sem tributo hoje');
            else if (t.done) motivos.push('tributo do dia concluído');
            else if ((Number(t.goal) || 0) - (Number(t.progress) || 0) - (Number(t.mine) || 0) <= 0) motivos.push(`já tem ${t.itemName} na mochila para fechar o tributo`);
            else if (!Array.isArray(huntCatalog)) motivos.push('mapa de hunts ainda não carregado');
            else {
                const top = huntCatalog.filter(h => h.speciesId && h.level <= cap && !guildFailed.has(h.slug))
                    .map(h => ({ h, e: typeof lootPerKill === 'function' ? lootPerKill(h.speciesId, t.itemName) : 0 })).filter(x => x.e > 0)
                    .sort((a, b) => b.e - a.e || a.h.level - b.h.level)[0];
                if (top) out.push({ kind: 'tributo', slug: top.h.slug, name: top.h.name, level: top.h.level, motivo: `tributo: ${t.itemName} ~${Math.round(top.e * 100) / 100}/abate` });
                else motivos.push(`nenhuma hunt até lv ${cap} dropa ${t.itemName}`);
            }
        }
        const hunts = Array.isArray(m.hunts) ? m.hunts : [];
        if (cfg.guildHuntEnabled) {
            const kill = hunts.find(h => h?.kind === 'kill' && !h.done && !guildHuntCapped(h));
            const killCheio = kill ? null : hunts.find(h => h?.kind === 'kill' && guildHuntCapped(h));
            if (killCheio) motivos.push(guildCappedMsg(killCheio));
            else if (!kill) motivos.push(hunts.some(h => h?.kind === 'kill') ? 'caçada "Derrotar" concluída' : 'sem caçada "Derrotar" hoje');
            else if (!Array.isArray(huntCatalog)) motivos.push('mapa de hunts ainda não carregado');
            else {
                const sp = (Array.isArray(kill.species) ? kill.species : []).map(x => x?.name).filter(Boolean);
                const achados = sp.map(n => ({ n, h: guildHuntFor(n, cap) }));
                const ok = achados.find(x => x.h && !x.h.foraDoNivel);
                if (ok) out.push({ kind: 'kill', slug: ok.h.slug, name: ok.h.name, level: ok.h.level, motivo: `derrotar ${ok.n} ${guildN(kill.progress)}/${guildN(kill.goal)}${guildHuntShare(kill)}` });
                else if (achados.some(x => x.h)) motivos.push(`hunt de ${achados.filter(x => x.h).map(x => `${x.n} (lv ${x.h.level})`).join(', ')} acima do seu time (lv ${cap})`);
                else motivos.push(`não achei a hunt de ${sp.join(', ') || '?'}`);
            }
        }
        if (cfg.guildFishEnabled) {
            const fish = hunts.find(h => h?.kind === 'fish' && !h.done && !guildHuntCapped(h));
            const fishCheio = fish ? null : hunts.find(h => h?.kind === 'fish' && guildHuntCapped(h));
            if (fishCheio) motivos.push(guildCappedMsg(fishCheio));
            else if (!fish) motivos.push(hunts.some(h => h?.kind === 'fish') ? 'caçada "Pescar" concluída' : 'sem caçada "Pescar" hoje');
            else if (guildFailed.has(FISH_SLUG)) motivos.push('a entrada na pesca não confirmou nesta sessão');
            else out.push({ kind: 'fish', slug: FISH_SLUG, name: 'Pesca', level: 0, motivo: `pescar ${guildN(fish.progress)}/${guildN(fish.goal)}${guildHuntShare(fish)}` });
        }
        const ordem = guildRouteOrder();
        out.sort((a, b) => ordem.indexOf(a.kind) - ordem.indexOf(b.kind));
        return { plano: out, motivos };
    }
    function guildSetWait(motivo) {
        if (motivo === guildWait) return;
        guildWait = motivo;
        if (motivo) logEvent('guild-espera', { motivo, hunt: huntSlug || null });
        guildNotify();
    }
    function guildHuntFailed(slug) {
        guildFailed.add(slug);
        if (guildTarget?.slug === slug) guildTarget = null;
        logEvent('guild-hunt-falhou', { slug });
    }
    function guildReturn(motivo) {
        const atual = normalize(huntSlug || '');
        const destino = guildReturnTarget();
        const volta = destino.slug || null;
        guildTarget = null; guildFrom = null; guildSaveFrom();
        const trocou = Boolean(volta) && volta !== atual && switchHunt(volta, 1, 'guild') !== false;
        logEvent('guild-volta', { motivo, volta, fonte: destino.fonte || null, de: atual || null, trocou, semDestino: destino.motivo || null });
        guildNotify();
        if (motivo === 'rota da guild desligada' || motivo === 'sem guild') return;   // Salvar / conta fora da guild: sem aviso
        const who = playerName();
        const texto = trocou ? `voltou para **${volta}**${destino.fonte === 'hunt padrão' ? ' (hunt padrão)' : ''}`
            : volta ? `já está em **${volta}**`
            : `ficou em **${atual || 'cidade'}** — ${destino.motivo}`;
        postWebhook('alert', {
            content: `🧭 ${who ? `**${who}**` : 'Sua conta'}: rota da guild encerrada (${motivo}) — ${texto}`,
            username: 'Poke Idle World',
            embeds: [{ title: 'Rota da guild encerrada', description: `${who ? `Conta: ${who}\n` : ''}Motivo: ${motivo}\n${texto.replace(/\*\*/g, '')}\nEm ${new Date().toLocaleString('pt-BR')}`, color: volta ? 0x57f287 : 0xfee75c }],
        }, { evento: 'guild-volta', volta, trocou });
    }
    // Pesca: lê a janela (10 min de cache), escolhe a faixa natural liberada (senão a mais alta liberada) e a marca no jogo.
    async function guildFishPrepare() {
        try {
            if (!fishTierInfo || Date.now() - fishTierAt >= GUILD_FISH_TIER_MS) { fishTierInfo = await gameApi('/api/game/fishing-tier'); fishTierAt = Date.now(); }
            const r = fishTierInfo;
            const tiers = (Array.isArray(r?.tiers) ? r.tiers : []).filter(t => t?.unlocked);
            const faixa = tiers.find(t => t.natural) || tiers.sort((a, b) => (Number(b.minSkill) || 0) - (Number(a.minSkill) || 0))[0];
            if (!faixa) { guildSetWait('nenhuma faixa de pesca liberada'); return false; }
            if ((Number(r.cooldownMs) || 0) > 0 && Date.now() - fishTierAt < Number(r.cooldownMs)) { guildSetWait(`pesca em cooldown (${Math.ceil((Number(r.cooldownMs) - (Date.now() - fishTierAt)) / 1000)} s)`); return false; }
            let trocou = false;
            if (Number(r.selected) !== Number(faixa.id)) { await gameApi('/api/game/fishing-tier', { method: 'POST', body: JSON.stringify({ tierId: faixa.id }) }); r.selected = faixa.id; trocou = true; }
            logEvent('pesca-faixa', { skill: r.skill ?? null, faixa: faixa.id, natural: Boolean(faixa.natural), peixes: Array.isArray(faixa.names) ? faixa.names : null, nivel: faixa.mobLevel ?? null, trocou });
            return true;
        } catch (err) {
            fishTierInfo = null; fishTierAt = Date.now();
            logEvent('pesca-erro', { erro: String(err?.message || err), onde: 'faixa' });
            guildSetWait(`não consegui escolher a faixa de pesca (${String(err?.message || err)})`);
            return false;
        }
    }
    // Tique (60 s e a cada frame `guild`): escolhe o alvo, vai, volta.
    async function guildRouteTick() {
        if (guildRouteBusy) return;
        if (!guildFromLoaded) { guildFromLoaded = true; guildLoadFrom(); }
        if (!guildRouteOn()) {
            if (guildTarget) guildReturn('rota da guild desligada');
            else if (guildFrom) { guildFrom = null; guildSaveFrom(); }   // registro velho de uma rota que já não existe
            guildSetWait(''); return;
        }
        guildRouteBusy = true;
        try {
            if (!lastGuild) { guildSetWait('guild ainda não lida'); return; }
            if (!lastGuild.guild) { guildSetWait('esta conta não está em uma guild'); if (guildTarget) guildReturn('sem guild'); return; }
            if (!Array.isArray(huntCatalog)) {
                try { await loadHuntCatalog(); } catch (err) { guildSetWait(`não consegui baixar o mapa de hunts (${String(err?.message || err)})`); return; }
            }
            if (typeof loadItemsCatalog === 'function') await loadItemsCatalog();
            if (tripRunning) { guildSetWait('esperando a viagem à cidade acabar'); return; }
            if (typeof healBusy === 'function' && healBusy()) { guildSetWait('esperando a cura na Nurse Joy acabar'); return; }
            if (typeof bossBusy === 'function' && bossBusy()) { guildSetWait('esperando o Auto Boss do jogo acabar'); return; }
            if (typeof invBusy === 'function' && invBusy()) { guildSetWait('esperando a Invasão Rocket acabar'); return; }   // v3.50.0
            if (typeof holdActive === 'function' && holdActive()) { guildSetWait('esperando na cidade (botão do painel)'); return; }
            if (huntSwitch) { guildSetWait(`esperando a troca para ${huntSwitch.slug} confirmar`); return; }
            if (swapPending) { guildSetWait('esperando a troca de líder confirmar'); return; }
            if (typeof dailyWantsHunt === 'function' && dailyWantsHunt()) { guildSetWait('a Daily Kill está usando a hunt (a guild segue quando ela acabar)'); return; }
            const { plano, motivos } = guildPlan();
            const atual = normalize(huntSlug || '');
            if (!plano.length) {
                const motivo = motivos.join(' · ') || 'nada ligado';
                guildSetWait(motivo);
                if (guildTarget || guildFrom) guildReturn(motivo);   // v3.46.0: origem lembrada da carga anterior também volta
                return;
            }
            const alvo = plano[0];
            if (alvo.kind === 'fish' && atual !== alvo.slug && !(await guildFishPrepare())) return;
            guildSetWait('');
            if (!guildTarget || guildTarget.slug !== alvo.slug) { guildTarget = alvo; logEvent('guild-alvo', alvo); guildNotify(); }
            if (atual === alvo.slug) return;
            if (!guildFrom && atual && !CITY_SLUGS.includes(atual) && atual !== FISH_SLUG) { guildFrom = atual; guildSaveFrom(); }
            switchHunt(alvo.slug, 1, 'guild');
        } finally { guildRouteBusy = false; }
    }
    // O jogo entrou em outra hunt (tela reafirmando a escolhida na mão, reconexão): volta ao alvo 8 s depois.
    function guildOnHuntChange(slug) {
        clearTimeout(guildReenterTimer); guildReenterTimer = null;
        if (!guildRouteOn() || !guildTarget || tripRunning || (typeof healBusy === 'function' && healBusy()) || (typeof bossBusy === 'function' && bossBusy()) || (typeof invBusy === 'function' && invBusy()) || (typeof holdActive === 'function' && holdActive())) return;
        const h = normalize(slug || '');
        if (!h || CITY_SLUGS.includes(h) || h === guildTarget.slug) return;
        if (typeof dailyWantsHunt === 'function' && dailyWantsHunt()) return;
        guildReenterTimer = setTimeout(() => {
            guildReenterTimer = null;
            if (!guildRouteOn() || !guildTarget || huntSwitch) return;
            const atual = normalize(huntSlug || '');
            if (!atual || atual === guildTarget.slug || (typeof dailyWantsHunt === 'function' && dailyWantsHunt())) return;
            logEvent('guild-reentrada', { de: atual, slug: guildTarget.slug, motivo: 'o jogo entrou em outra hunt' });
            switchHunt(guildTarget.slug, 1, 'guild');
        }, GUILD_ROUTE_REENTER_MS);
    }
    // `fishing-cooldown { ms }` com a pesca como alvo: se a tela não reentrar sozinha, o script reentra depois do prazo.
    function guildOnFishingCooldown(ms) {
        if (!guildRouteOn() || guildTarget?.kind !== 'fish') return;
        clearTimeout(fishReenterTimer);
        fishReenterTimer = setTimeout(() => {
            fishReenterTimer = null;
            if (!guildRouteOn() || guildTarget?.kind !== 'fish' || huntSwitch || normalize(huntSlug || '') === FISH_SLUG) return;
            logEvent('pesca-reentra', { ms });
            switchHunt(FISH_SLUG, 1, 'guild');
        }, Math.max(0, Number(ms) || 0) + 1500);
    }
    function guildRouteLine(d) {
        d = d || cfg;
        if (!guildRouteOn(d)) return 'Rota da guild desligada';
        if (guildTarget) {
            const v = guildReturnTarget(d);
            return `▶ ${guildTarget.slug}${guildTarget.level ? ` lv${guildTarget.level}` : ''} (${guildTarget.motivo}) · no fim volta para ${v.slug ? `${v.slug}${v.fonte === 'hunt padrão' ? ' (hunt padrão)' : ''}` : '⚠ lugar nenhum — preencha "Hunt padrão" em Compras → Parada na cidade'}`;
        }
        if (guildWait) return `parado: ${guildWait}`;
        return guildRouteOn() ? 'escolhendo a hunt… (confere a cada 1 min)' : 'salve para ligar';
    }


    // ---- Pesca (v3.31.1, farejador): como a pesca funciona, levantado no bundle em 10/10/2026 ----------------------------
    // NPC "Pescador" (kind `fishing`) abre a janela 🎣: `GET /api/game/fishing-tier` → `{ skill, inLevel, forNext, selected,
    // cooldownMs, tiers[{ id, unlocked, natural, minSkill, mobLevel[min,max], names[], fish[{ dex, name, looktype }] }] }`;
    // o botão "Pescar" faz `POST /api/game/fishing-tier { tierId }` e a tela viaja para o mapa `pesca` = `enter-hunt { slug:'pesca' }`
    // (a pesca é uma hunt comum de slug fixo `pesca`; o treinador vira o outfit de pescador 6753/6754 e cada peixe leva ~12 s,
    // barra "Pescando…"). Servidor: `fishing-cooldown { ms }` (a tela reenvia `enter-hunt` depois de ms) e `fishing-levelup
    // { level }`. Faixa "natural" = a da skill atual (progresso cheio); faixa abaixo = 50% de progresso de skill. As Caçadas da
    // guild com kind `fish` ("Pescar peixes") contam os peixes. NADA visto no log ainda: este módulo lê a janela uma vez na carga
    // (`pesca-campos`), registra os dois frames (`pesca-cooldown`, `pesca-nivel`) e o 1º `field-kill` dentro de `pesca` (`pesca-abate`).
    const FISH_SLUG = 'pesca';
    let fishKillLogged = false;
    async function fishSniff() {
        try {
            const r = await gameApi('/api/game/fishing-tier');
            logEvent('pesca-campos', { raiz: Object.keys(r || {}), skill: r?.skill ?? null, inLevel: r?.inLevel ?? null, forNext: r?.forNext ?? null, selected: r?.selected ?? null, cooldownMs: r?.cooldownMs ?? null,
                tier: Array.isArray(r?.tiers) && r.tiers[0] ? Object.keys(r.tiers[0]) : null,
                tiers: Array.isArray(r?.tiers) ? r.tiers.map(t => ({ id: t?.id, liberada: t?.unlocked, natural: t?.natural, minSkill: t?.minSkill, nivel: t?.mobLevel, peixes: Array.isArray(t?.names) ? t.names : (Array.isArray(t?.fish) ? t.fish.map(f => f?.name) : null) })) : null });
        } catch (err) { logEvent('pesca-erro', { erro: String(err?.message || err) }); }
    }
    function fishOnMessage(message) {
        if (message.type === 'fishing-cooldown') { logEvent('pesca-cooldown', { ms: message.ms ?? null, campos: Object.keys(message) }); guildOnFishingCooldown(message.ms); }
        else if (message.type === 'fishing-levelup') logEvent('pesca-nivel', { level: message.level ?? null, campos: Object.keys(message) });
    }
    function fishOnKill(message) {
        if (fishKillLogged || normalize(huntSlug || '') !== FISH_SLUG) return;
        fishKillLogged = true;
        logEvent('pesca-abate', { campos: Object.keys(message), speciesName: message.speciesName ?? null, level: message.level ?? null, xpGained: message.xpGained ?? null, loot: Array.isArray(message.loot) ? message.loot.map(l => `${l?.name}×${l?.qty}`) : null });
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
        if (typeof bossBusy === 'function' && bossBusy()) { clanSetWait('esperando o Auto Boss do jogo acabar'); return; }
        if (typeof invBusy === 'function' && invBusy()) { clanSetWait('esperando a Invasão Rocket acabar'); return; }   // v3.50.0
        if (typeof holdActive === 'function' && holdActive()) { clanSetWait('esperando na cidade (botão do painel)'); return; }
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
        if (typeof guildKeepsItem === 'function' && guildKeepsItem(id)) return 'tributo da guild';
        if (typeof farmKeepsItem === 'function' && farmKeepsItem(id)) return 'lista de farm';
        if (typeof bossKeepsItem === 'function' && bossKeepsItem(id)) return 'token do Auto Boss';
        if (typeof invKeepsItem === 'function' && invKeepsItem(id)) return 'Rocket Plans (o jogo não deixa guardar)';   // v3.50.0
        return null;
    }
    // Motivo para um Pokémon NÃO ir para a família, ou null se vai.
    function depositPokeReason(p, d) {
        d = d || cfg;
        if (!p || typeof p !== 'object') return 'inválido';
        if (p.team || p.leader || String(p.id).startsWith('team-')) return 'no time';
        if (p.starter) return 'inicial';
        if (p.listed || p.tradeId) return 'anunciado no mercado';
        if (p.breedingBox) return 'na Breeding Box';   // v3.49.0: lá dentro não vai para a família
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
                    if (typeof guildKeepsItem === 'function' && guildKeepsItem(id)) continue;
                    if (typeof farmKeepsItem === 'function' && farmKeepsItem(id)) continue;
                    if (typeof bossKeepsItem === 'function' && bossKeepsItem(id)) continue;   // v3.43.1: token do Auto Boss pendente
                    if (typeof invKeepsItem === 'function' && invKeepsItem(id)) continue;     // v3.50.0: Rocket Plans (não vendem nem vão para a família)
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
        const ginasio = typeof gymWanted === 'function' && gymWanted(d);
        return { drops, pokes, bolas, cla, suprimentos, slot, time, breeding, ginasio, nada: !drops && !pokes && !bolas && !cla && !suprimentos && !slot && !time && !breeding && !ginasio };
    }
    function tripLoadText(l) {
        const p = [];
        if (l.drops) p.push(`${l.drops} ${l.drops === 1 ? 'drop' : 'drops'}`);
        if (l.pokes) p.push(`${l.pokes} Pokémon`);
        if (l.bolas) p.push(`comprar ${Number(cfg.autoBuyQty) || 100} ${ballName(l.bolas.id)}`);
        if (l.suprimentos) p.push(l.suprimentos.map(s => `comprar ${s.qty} ${s.name}`).join(', '));
        if (l.cla) p.push('clã (converter/subir de rank)');
        if (l.slot) p.push('slot machine (roll grátis)');
        if (l.ginasio) p.push('ginásios (desafiar/bônus)');
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
        return lastRealHunt || (typeof idleDefaultSlug === 'function' ? idleDefaultSlug() : null) || null;   // v3.36.0: hunt padrão
    }
    const TRIP_PHASE_PCT = { 'indo para a cidade': 15, 'na cidade': 50, 'voltando': 90 };
    function tripLastText() {
        if (!lastTripInfo) return '';
        const nome = { itens: 'drops', pokes: 'Pokémon', bolas: 'bolas', suprimentos: 'poções/revives', cla: 'clã', guardar: 'guardar', evoluir: 'evolução', slot: 'slot machine', time: 'ler o time', breeding: 'breeding', ginasio: 'ginásios', jenny: 'Officer Jenny' };
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
        const title = pend.length ? (tripWaitReason ? `Viagem à cidade pedida (${pend.join('+')}), esperando: ${tripWaitReason}` : 'Viagem à cidade sai no próximo minuto') : `Próxima viagem à cidade em ${Math.max(1, Math.ceil(ms / 60000))} min (${hora})`;
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
            else if (key === 'ginasio') tarefas.push({ key, run: () => gymCityWork() });
            else if (key === 'jenny') tarefas.push({ key, run: () => invJennyCityWork() });   // v3.50.0: Officer Jenny (Shopping)
            else if (key === 'breeding') tarefas.push({ key, run: () => breedCityWork() });
        }
        // Guardar na cidade (v3.18.0): última tarefa de toda viagem que tenha outra coisa a fazer.
        if (tarefas.length && typeof depositWanted === 'function' && depositWanted()) tarefas.push({ key: 'guardar', run: () => depositCityWork() });
        return tarefas;
    }

    function tripInHunt() { return Boolean(normalize(huntSlug || '')) && !CITY_SLUGS.includes(normalize(huntSlug || '')); }
    // Sai da hunt e espera a tela chegar à cidade (`set-city`); a tela não viajou = avisa o servidor nós mesmos. Devolve o que o teleporte disse.
    async function tripLeaveHunt() {
        tripCityArrived = false;
        sendGame({ type: 'leave-hunt' });
        const tela = nudgeClientToCity();
        const limite = Date.now() + TRIP_CITY_WAIT_MS;
        while (!tripCityArrived && Date.now() < limite) await tripWait(500);
        if (!tripCityArrived) sendGame({ type: 'set-city', slug: tripCity() }); // a tela não viajou: avisa o servidor nós mesmos
        return tela;
    }
    async function cityTrip(motivo, tarefas) {
        if (tripRunning) return { ok: false, motivo: 'viagem em andamento' };
        if (!tarefas.length) return { ok: false, motivo: 'nada a fazer' };
        tripRunning = true;
        const t0 = Date.now();
        let volta = tripReturnSlug();
        const emHunt = tripInHunt();
        const res = [];
        tripNotify();
        try {
            tripPhase = 'indo para a cidade';
            tripCityArrived = false;
            let tela = null;
            if (emHunt) tela = await tripLeaveHunt();
            logEvent('viagem', { fase: 'cidade', motivo, cidade: tripCity(), estavaEmHunt: emHunt, pelaTela: tripCityArrived, tela, volta, tarefas: tarefas.map(t => t.key) });
            tripPhase = 'na cidade';
            tripNotify();
            await tripWait(tripRnd(TRIP_WALK_MS));
            for (const t of tarefas) {
                // v3.36.3: a tela pode mandar `enter-hunt` NO MEIO da viagem (conta2, 12/10/2026 23:12Z: o usuário foi para a cidade na
                // mão, a viagem começou já na cidade e 5 s depois a tela voltou para a hunt; a retirada da comida do breeding na família
                // falhou com "não está disponível durante a hunt"). De volta na hunt = sai de novo e espera a tela chegar à cidade.
                if (tripInHunt()) {
                    logEvent('viagem-hunt-no-meio', { tarefa: t.key, slug: huntSlug });
                    tripPhase = 'indo para a cidade'; tripNotify();
                    await tripLeaveHunt();
                    tripPhase = 'na cidade'; tripNotify();
                    await tripWait(tripRnd(TRIP_WALK_MS));
                }
                let r;
                try { r = await t.run(); } catch (err) { r = { ok: false, motivo: String(err?.message || err) }; }
                res.push({ key: t.key, ok: Boolean(r?.ok), motivo: r?.motivo || null, r });
                await tripWait(tripRnd(TRIP_BETWEEN_MS));
            }
            tripPhase = 'voltando';
            tripNotify();
            await tripWait(tripRnd(TRIP_BEFORE_BACK_MS));
            if (volta && !switchHunt(volta, 1, 'viagem')) volta = null;   // v3.44.0: espera na cidade ligada: fica
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
        if (!has('ginasio') && typeof gymWanted === 'function' && gymWanted()) needs.push(['ginasio', { dados: null, motivo: 'carona' }]);
        if (!has('jenny') && typeof invJennyWanted === 'function' && invJennyWanted()) needs.push(['jenny', { dados: null, motivo: 'carona' }]);
        if (!has('breeding') && typeof breedWanted === 'function' && breedWanted()) needs.push(['breeding', { dados: null, motivo: 'carona' }]);
        return needs;
    }

    // Tique (30 s), relógio único (v3.15.0): venceu o horário sorteado -> uma viagem com tudo que houver para fazer
    // (nada a fazer = só sorteia o próximo horário, sem sair da hunt). Pedido urgente (ex.: bola zerada) não espera o
    // relógio, só o intervalo mínimo entre viagens. Nunca com troca de hunt/líder ou captura em andamento.
    // v3.45.1: por que a viagem não sai agora (null = pode sair). A mesma lista de bloqueios de sempre, com nome, para o log e a faixa.
    function tripBlockedReason() {
        if (tripRunning) return 'viagem em andamento';
        if (typeof healBusy === 'function' && healBusy()) return 'cura na Nurse Joy em andamento';
        if (typeof bossBusyReason === 'function' && bossBusyReason()) return bossBusyReason();
        if (typeof bossBusy === 'function' && bossBusy()) return 'Auto Boss em andamento';
        if (typeof invBusyReason === 'function' && invBusyReason()) return invBusyReason();   // v3.50.0
        if (typeof idleRunning !== 'undefined' && idleRunning) return 'volta da cidade parada em andamento';
        if (huntSwitch) return 'troca de hunt em andamento';
        if (swapPending) return 'troca de líder em andamento';
        if (awaitingDetails.length) return 'captura aguardando detalhes (até 20 s)';
        return null;
    }
    let tripWaitLoggedAt = 0;
    let tripWaitReason = null;   // motivo atual da espera de um pedido urgente (faixa de viagem)
    function tripNoteWait(motivo) {
        tripWaitReason = motivo;
        if (!motivo) return;
        if (Date.now() - tripWaitLoggedAt < 5 * 60 * 1000) return;   // 1x a cada 5 min
        tripWaitLoggedAt = Date.now();
        logEvent('viagem-espera', { tarefas: [...tripNeeds.keys()], motivo, pedidoHa: Math.round((Date.now() - Math.min(...[...tripNeeds.values()].map(n => n.at || Date.now()))) / 1000) + ' s' });
    }
    function tripTick() {
        const urgente = tripNeeds.size > 0;
        const bloqueio = tripBlockedReason();
        if (bloqueio) { if (urgente) tripNoteWait(bloqueio); return; }
        const venceu = Date.now() >= tripDueAt();
        if (!urgente && !venceu) return;
        if (urgente && !venceu && Date.now() - lastTripAt < tripMinGapMs()) { tripNoteWait(`intervalo mínimo entre viagens (${Math.max(1, Math.ceil((tripMinGapMs() - (Date.now() - lastTripAt)) / 60000))} min)`); return; }
        tripNoteWait(null);
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
    // v3.35.0: o registro de retomada também é gravado em `pagehide`/`beforeunload` (saveResume), ou seja, a recarga MANUAL
    // (⟳ Atualizar tudo do PokeGrid, F5) volta para a hunt do mesmo jeito que a automática — antes só o `location.reload()` do
    // script gravava o registro, e na recarga manual a conta nascia em Cerulean sem `resumeHunt`, sem `lastRealHunt` e ficava
    // parada "sem saber de que hunt veio". Recarga no meio de viagem/cura/volta da cidade guarda a hunt de volta
    // (`lastRealHunt`). A volta é armada também por um fallback de RESUME_FALLBACK_MS na carga (sem socket nem `set-city`,
    // `resumeHunt` ficava pendurado e travava a parada na cidade em "volta da recarga pendente"). `loadLastHunt()` restaura a
    // última hunt (até 24 h) para a parada na cidade ter destino mesmo com o registro velho (PokeGrid fechado por horas).

    const RESUME_KEY = 'pgDiscordNotifyResume';
    const RELOAD_CHECK_MS = 30 * 1000;
    const RELOAD_POSTPONE_MAX_MS = 10 * 60 * 1000;
    const RESUME_MAX_AGE_MS = 5 * 60 * 1000;
    const RESUME_AFTER_CITY_MS = 3000;
    const RESUME_AFTER_SOCKET_MS = 12000;
    const RESUME_FALLBACK_MS = 45000;      // v3.35.0: sem socket rastreado nem set-city, volta mesmo assim
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
        if (typeof bossBusyReason === 'function' && bossBusyReason()) return bossBusyReason();   // v3.43.0
        if (typeof invBusyReason === 'function' && invBusyReason()) return invBusyReason();   // v3.50.0
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
    // Hunt para retomar na carga seguinte: a hunt atual ou, no meio de viagem/cura/volta da cidade (conta na cidade de
    // passagem), a hunt de volta. Na cidade por vontade do jogador: null (a parada na cidade decide depois).
    function resumeSlugNow() {
        const h = huntSlug ? normalize(huntSlug) : null;
        if (h && !CITY_SLUGS.includes(h) && !(typeof bossIsArena === 'function' && bossIsArena(h)) && !(typeof invIsRaid === 'function' && invIsRaid(h))) return h;   // v3.43.0: a arena do Auto Boss não se reentra (o servidor segue a sessão); v3.50.0: nem a invasão
        const voltando = tripRunning || (typeof healBusy === 'function' && healBusy()) || (typeof idleRunning !== 'undefined' && idleRunning);
        const ult = typeof lastRealHunt === 'string' && lastRealHunt ? normalize(lastRealHunt) : null;
        return voltando && ult && !CITY_SLUGS.includes(ult) ? ult : null;
    }
    // Grava o registro de retomada (lido por loadResume na carga seguinte). origem: 'recarga' (location.reload do script)
    // ou 'tela' (pagehide/beforeunload: ⟳ do PokeGrid, F5, fechar o PokeGrid).
    function saveResume(origem) {
        const rec = {
            at: Date.now(),
            origem: origem || 'recarga',
            slug: resumeSlugNow(),
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
        return rec;
    }
    function doReload(motivo) {
        const rec = saveResume('recarga');
        logEvent('recarga', { motivo, hunt: huntSlug, volta: rec.slug, adiadaMin: reloadDueSince ? Math.round((Date.now() - reloadDueSince) / 60000) : 0 });
        location.reload();
    }
    // v3.35.0: recarga manual (⟳ do PokeGrid, F5) e fechamento do PokeGrid gravam o mesmo registro.
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        for (const ev of ['pagehide', 'beforeunload']) window.addEventListener(ev, () => { try { saveResume('tela'); } catch { /* nada a fazer na saída */ } });
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
        // v3.35.0: última hunt (até 24 h) para a parada na cidade/viagem/cura terem destino depois de qualquer recarga.
        if (typeof lastRealHunt !== 'undefined' && !lastRealHunt && typeof loadLastHunt === 'function') {
            const ult = loadLastHunt();
            if (ult) { lastRealHunt = ult.slug; logEvent('hunt-lembrada', { slug: ult.slug, idadeMin: Math.round((Date.now() - ult.at) / 60000) }); }
        }
        let rec = null;
        try { rec = JSON.parse(localStorage.getItem(RESUME_KEY) || 'null'); localStorage.removeItem(RESUME_KEY); } catch { rec = null; }
        if (!rec || typeof rec !== 'object') return;
        const idade = Date.now() - (Number(rec.at) || 0);
        if (idade < 0 || idade > RESUME_MAX_AGE_MS) { logEvent('recarga-ignorada', { idadeMin: Math.round(idade / 60000), origem: rec.origem || 'recarga', hunt: rec.slug || null }); return; }
        if (Number(rec.lastSellAt) > 0) lastSellAt = Number(rec.lastSellAt);
        if (Number(rec.lastPokeSellAt) > 0) lastPokeSellAt = Number(rec.lastPokeSellAt);
        if (Number(rec.lastTripAt) > 0) { lastTripAt = Number(rec.lastTripAt); nextTripDelayMs = Number(rec.nextTripDelayMs) || 0; }
        Object.assign(ballAlerted, rec.ballAlerted || {});
        Object.assign(autoBuyAttempted, rec.autoBuyAttempted || {});
        for (const id of (Array.isArray(rec.levelAlerted) ? rec.levelAlerted : [])) levelAlerted.add(String(id));
        const slug = rec.slug ? normalize(rec.slug) : null;
        resumeHunt = slug && !CITY_SLUGS.includes(slug) ? slug : null;
        if (rec.prevSlug) prevHuntSlug = normalize(rec.prevSlug);   // para onde a daily volta
        logEvent('recarga-retomada', { hunt: resumeHunt, idadeS: Math.round(idade / 1000), origem: rec.origem || 'recarga' });
        armResume(RESUME_FALLBACK_MS);   // v3.35.0: socket (12 s) e set-city (3 s) encurtam; sem nenhum dos dois, volta em 45 s
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
            if (typeof holdActive === 'function' && holdActive()) { logEvent('recarga-hunt', { slug, esperaCidade: true }); return; }   // v3.44.0: espera na cidade pelo botão: fica
            if ((typeof healBusy === 'function' && healBusy())) { logEvent('recarga-hunt', { slug, cura: true }); return; }   // a cura volta para a hunt
            if (huntSwitch) { logEvent('recarga-hunt', { slug, trocando: huntSwitch.slug }); return; }   // outra troca já em andamento (rota/clã/farm)
            logEvent('recarga-hunt', { slug, enviando: true });
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
    const LOG_NOISY = { 'socket-fechado': 10, 'humano-desafio': 10, 'catch-result': 25, decisao: 25, 'webhook-ok': 25, balls: 10, 'poke-xp': 5, 'captura-conta': 10, 'poke-delta': 15, 'pokes-frame': 10, 'pokes-get': 10, guild: 10, 'guild-get': 10, 'auto-boss': 15, ginasio: 10, 'ginasio-global': 10, 'invasao-wave': 10, 'invasao-energia-pedida': 5, 'invasao-espera': 10, 'invasao-janela': 5 };

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
    //   human   -> webhookHuman  (vazio: webhookAlerts; vazio: NÃO envia) — v3.41.0, pedido do usuário (canal só do captcha)
    // Desde a v3.5.1 (a pedido do usuário) alertas e nível NÃO caem no principal: com o canal vazio o
    // evento é só registrado no log. Shiny é uma captura, por isso continua caindo em Capturas.
    const WEBHOOK_KINDS = {
        capture: { key: 'webhookUrl', label: 'capturas' },
        shiny: { key: 'webhookShiny', label: 'shinys', fallback: 'webhookUrl' },
        alert: { key: 'webhookAlerts', label: 'alertas' },
        level: { key: 'webhookLevel', label: 'nível' },
        human: { key: 'webhookHuman', label: 'captcha', fallback: 'webhookAlerts' },
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
    const KEEP_CONFIRM_MS = 10000;  // v3.37.1: ação da família sem resposta em 5 s → `family-get` e mais essa espera para ver se o movimento apareceu

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
    // v3.39.0: leitura por função (a evolução roda isolada no harness e não enxerga as variáveis acima).
    function familyDepotItems() { return Array.isArray(lastFamilyDepot.items) ? lastFamilyDepot.items : []; }
    function familyDepotAt() { return lastFamilyAt; }
    // Uma ação da família pelo socket; `check(depot)` diz se o frame `family` da resposta confirma o que foi pedido.
    function familyAction(payload, evento, dados, check) {
        return new Promise((resolve) => {
            if (familyPending) familyPending.resolve({ ok: false, motivo: 'outro depósito em andamento' });
            const entry = { check, timer: null, resolve: null, conferindo: false };
            entry.resolve = (r) => {
                clearTimeout(entry.timer);
                if (familyPending === entry) familyPending = null;
                logEvent(evento, Object.assign({}, dados, { ok: r.ok, motivo: r.motivo || null, conferido: entry.conferindo || undefined }));
                resolve(r);
            };
            familyPending = entry;
            if (!sendGame(Object.assign({ type: 'family-action' }, payload))) {
                entry.resolve({ ok: false, motivo: 'socket do jogo não rastreado' });
                return;
            }
            entry.timer = setTimeout(() => {
                // v3.37.1: com o servidor lento (14/10/2026, "Transaction API error") o frame `family` chegou 12–56 s depois e o
                // movimento TINHA acontecido; o script dava "sem resposta do jogo" e o breeding/guardar desistiam. Antes de falhar,
                // pede o estado da família: qualquer frame `family` que chegar (o atrasado ou a resposta do `family-get`) passa
                // pelo mesmo `check` em `handleFamily`.
                entry.conferindo = true;
                logEvent('familia-confere', { evento, action: payload.action, dir: payload.dir, esperaMs: KEEP_CONFIRM_MS });
                if (!sendGame({ type: 'family-get' })) { entry.resolve({ ok: false, motivo: 'sem resposta do jogo' }); return; }
                entry.timer = setTimeout(() => entry.resolve({ ok: false, motivo: 'sem resposta do jogo' }), KEEP_CONFIRM_MS);
            }, KEEP_TIMEOUT_MS);
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
        if (typeof guildOnError === 'function') guildOnError(message);
        if (typeof bossOnError === 'function') bossOnError(message);          // v3.43.1: texto do erro no log da retomada do Auto Boss
        if (typeof breedOnError === 'function') breedOnError(message);        // v3.49.0: o jogo recusou o movimento da Breeding Box
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

    // ---- Invasão Rocket (v3.50.0): entrar na invasão de Cerulean a cada janela, voltar para a hunt e trocar os Rocket Plans com a Officer Jenny ----
    // Patch notes de 27/10/2026 (colado pelo usuário) + bundle do mesmo dia (módulo de constantes `tD` no chunk compartilhado; HUD do jogo
    // `hh`/`hp`/`hu`/`hx`/`tW`/`ii`; janela `lK` da Officer Jenny). Protocolo em docs/mensagens-do-jogo.md → "Invasão Rocket".
    //   - Janela: a cada 2 h nas horas PARES de Brasília (`INVASION_EVERY_MS` 7 200 000; `scheduledWindow`: início = hora par BRT,
    //     `entryUntil` = +10 min, `endsAt` = +30 min). O servidor manda `invasion-state { live, entryOpen, entryUntil, endsAt }` a todos e
    //     `invasion-announce { text, until }` (a Oficial chama o jogador pelo nome). Energia: `invasion-energy-get` → `invasion-energy
    //     { energy, live, entryOpen, entryUntil, endsAt }` (a tela pede ao montar e 0–3 s depois de cada `invasion-state` com entrada aberta).
    //   - Entrar = o botão INVASÃO da cidade: a tela só viaja para o mapa `rocket_cerulean` (`ROCKET_SLUG`; desenho de cerulean_novo) e o
    //     componente da hunt manda `enter-hunt { slug:'rocket_cerulean' }` — a invasão É uma hunt de slug fixo, como a arena do boss
    //     (`*_boss`) e a pesca (`pesca`). Recusa = `invasion-refused { message }` (sem Energia Vermelha, entrada fechada, líder caído...).
    //     1 Energia Vermelha por entrada (2 por dia, acumula 10; 15 💎 na Loja de Diamantes — o script NUNCA compra); uma entrada por invasão.
    //   - Lá dentro: 10 s de apresentação, waves de 20 duplas (`PAIRS_PER_WAVE`), frames `field` normais com `wave` e um `field-kill` por
    //     Rocket derrubado; sem vantagem de tipo. Acaba por `wipe` (time caiu), `time` (30 min), `stall` (3 min sem abate), `left` ou
    //     `restart` → `invasion-end { wave, bestWave, reason, kills, xp, tier, level, levelBefore, reward{ qty, name, icon }, milestones[],
    //     outfitReward{ items[{ looktype, gender, milestone }], equipped } }` (janela "Resultado da Invasão Rocket").
    //   - Rocket Plans = item 240 (`REWARD_ITEM_ID`): não vendem, não trocam, não vão para a família → fora da venda e do guardar.
    //   - Officer Jenny (NPC `officer_jenny` do Shopping): `GET /api/game/officer-jenny` → `{ balance, token{ name, icon }, offers[{ key,
    //     name, qty, cost, icon, description, owned, looktype, kind }] }`; `POST /api/game/officer-jenny/exchange { offer:key }` → `{ prize{
    //     kind, name, qty, icon, looktype } }` (a tela manda `inv-get` depois). Preços do anúncio: 100 Idle Balls 200, Bronze Boss Token
    //     1 500, outfits 5 000/10 000 (uma por gênero), Police Bravery Medal 15 000 (+2 IV, uma por Pokémon, para sempre — o script no
    //     máximo COMPRA a medalha; em quem usar é escolha do jogador).
    // Formatos ainda NÃO vistos no log (patch de hoje): `invasao-campos` registra as chaves do 1º frame de cada tipo; `jenny-campos` idem.
    // Fluxo: `invTick` (30 s) → entrada aberta + hora aceita (`invHours`, vazio = todas) + energia > reserva (`invKeepEnergy`) + nada em
    // andamento (viagem/cura/boss/espera/humano/troca) → `invEnterFlow`: guarda a hunt de volta (`invRun.from`; registro em
    // localStorage[INV_KEY] para sobreviver à recarga), sai da hunt (tela → cidade; `set-city` nós mesmos se ela não for),
    // `switchHunt('rocket_cerulean', 1, 'invasao')` (enter-hunt + `hunt-resume` sintético para a tela viajar). `invasion-end` → log e aviso,
    // `set-city`, `joy-heal` se o time caiu, volta com `switchHunt(from, 1, 'invasao-volta')`. Janela encerrada sem `invasion-end` (recarga
    // no meio, tela saiu) = volta do mesmo jeito. Enquanto entra/está dentro/volta (`invBusy()`), viagem, parada na cidade, recarga, rotas,
    // troca de líder e cura esperam — sair da hunt encerra a rodada (o que foi conquistado fica salvo). `invIsRaid(slug)` tira a invasão de
    // `lastRealHunt`, da retomada da recarga e da espera na cidade. Entrada feita na mão (botão da tela) também é acompanhada e volta.
    // Jenny: com `invJennyEnabled` + oferta escolhida (`invJennyOffer`, chave da oferta lida da janela), lê o saldo após cada rodada e a cada
    // 2 h; saldo − reserva (`invJennyKeep`) ≥ custo → tarefa `jenny` da viagem (`set-city shopping`, exchange; repete enquanto der, outfit 1x).

    const INV_SLUG = 'rocket_cerulean';           // `ROCKET_SLUG` do bundle
    const INV_EVERY_MS = 2 * 60 * 60 * 1000;      // `INVASION_EVERY_MS`: horas pares de Brasília
    const INV_ENTRY_MS = 10 * 60 * 1000;          // `ENTRY_WINDOW_MS`
    const INV_RAID_MS = 30 * 60 * 1000;           // `RAID_DURATION_MS`
    const INV_BRT_OFFSET_MS = 3 * 60 * 60 * 1000; // Brasília = UTC−3 (o jogo usa o deslocamento fixo −108e5)
    const INV_ENERGY_MAX = 10;                    // `ENERGY_MAX`
    const INV_ENERGY_PER_DAY = 2;                 // `ENERGY_PER_DAY`
    const INV_PLANS_ITEM_ID = 240;                // `REWARD_ITEM_ID`: Rocket Plans
    const INV_KANTO_STEPS = [1, 10, 20, 30, 40, 50, 60, 70, 80, 100, 150];   // faixas Kanto do `invasionTierForLevel` (150 = Outland)
    const INV_TICK_MS = 30 * 1000;
    const INV_ENTER_DELAY_MS = 20 * 1000;         // entra 20 s depois da abertura (anúncio, outros jogadores; nada de correr)
    const INV_CITY_WAIT_MS = 10 * 1000;           // a tela não viajou depois do teleporte sintético: `set-city` nós mesmos
    const INV_LEAVE_WAIT_MS = 1500;
    const INV_HEAL_WAIT_MS = 2500;
    const INV_END_WAIT_MS = 4000;                 // `invasion-end` → espera a janela de resultado antes de sair/voltar
    const INV_TELA_WAIT_MS = 5000;                // v3.50.1: a TELA viaja para a invasão e manda o enter-hunt; sem a hunt em 5 s mandamos nós
    const INV_CONFIRM_MS = 30 * 1000;             // enter-hunt mandado e nenhum frame da invasão em 30 s = entrada falhou (aviso + volta)
    const INV_ENTER_TIMEOUT_MS = 3 * 60 * 1000;   // rede de segurança da entrada (a régua de 30 s acima avisa antes)
    const INV_RESULT_GRACE_MS = 90 * 1000;        // janela encerrada (endsAt) sem `invasion-end`: espera isto e volta mesmo assim
    const INV_GONE_MS = 60 * 1000;                // fora da hunt da invasão há 1 min sem `invasion-end` = rodada acabou
    const INV_ENERGY_STALE_MS = 15 * 60 * 1000;   // energia sem leitura há 15 min: pede de novo antes de decidir
    const INV_ENERGY_ASK_GAP_MS = 20 * 1000;
    const INV_KEY = 'pgDiscordNotifyInvasion';
    const INV_RUN_MAX_AGE_MS = 60 * 60 * 1000;    // registro da rodada (recarga no meio) vale 1 h
    const INV_JENNY_URL = '/api/game/officer-jenny';
    const INV_JENNY_POLL_MS = 2 * 60 * 60 * 1000;
    const INV_JENNY_RETRY_MS = 15 * 60 * 1000;
    const INV_JENNY_CITY = 'shopping';
    const INV_JENNY_CITY_WAIT_MS = 3000;
    const INV_JENNY_BETWEEN_MS = 1200;
    const INV_JENNY_MAX_PER_TRIP = 20;
    const INV_REASON_LABEL = { wipe: 'todo o time caiu', time: 'a invasão terminou', stall: '3 min sem derrubar ninguém', left: 'saiu da invasão', restart: 'o servidor reiniciou' };

    let invWindowSrv = null;    // último `invasion-state`/`invasion-energy` do servidor: { live, entryOpen, entryUntil, endsAt, at }
    let invStateLogged = 0;     // janela (startedAt) cujo `invasion-state` já foi logado
    let invEnergy = null;       // Energia Vermelha (null = nunca lida)
    let invEnergyAt = 0;
    let invEnergyAskedAt = 0;
    let invRun = null;          // rodada: { from, origem, at, windowStart, endsAt, fase, entered, enteredAt, lastFieldAt, wave, kills, ended, result }
    let invTried = {};          // windowStart -> o que aconteceu nesta janela ('entrou', 'hora fora da lista', 'energia …'): não repete
    let invLast = null;         // último resultado (`invasion-end` normalizado)
    let invRefused = null;      // última recusa { at, message }
    let invWaitNote = null;     // por que não entrou ainda (bloqueio do momento), para o painel e o log
    let invWaitLoggedAt = 0;
    let invCityWaiter = null;
    let invFieldsLogged = {};
    let invAnnounceLoggedAt = 0;
    let invJenny = null;        // { balance, token, offers[{ key, name, qty, cost, owned, kind, description }], at }
    let invJennyAt = 0;
    let invJennyFailedAt = 0;
    let invJennyWorking = false;
    let invJennyLast = null;    // { at, feitas:[{ name, qty }], oferta }
    let onInvChange = null;     // painel (aba Invasão)

    function invOn(d) { return Boolean((d || cfg).invEnabled); }
    function invJennyOffer(d) { return String((d || cfg).invJennyOffer || '').trim(); }
    function invJennyOn(d) { d = d || cfg; return Boolean(d.invJennyEnabled) && Boolean(invJennyOffer(d)); }
    function invIsRaid(slug) { return normalize(slug || '') === INV_SLUG; }
    function invKeepEnergy(d) { return Math.max(0, Math.min(INV_ENERGY_MAX, Math.floor(Number((d || cfg).invKeepEnergy) || 0))); }
    function invJennyKeep(d) { return Math.max(0, Math.floor(Number((d || cfg).invJennyKeep) || 0)); }
    function invNotify() { if (onInvChange) { try { onInvChange(); } catch { /* painel fechado */ } } }
    function invWait(ms) { return new Promise(r => setTimeout(r, ms)); }
    function invFmt(ms) {
        const s = Math.max(0, Math.round(ms / 1000));
        if (s < 60) return `${s} s`;
        const m = Math.floor(s / 60);
        return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
    }
    function invHora(ts) { return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); }
    // Hora de Brasília (0..23) de um instante — o horário das janelas é fixo em BRT, seja qual for o fuso do PC.
    function invHourOf(ts) { return Math.floor((((ts - INV_BRT_OFFSET_MS) % 86400000) + 86400000) % 86400000 / 3600000); }
    // Início da janela de 2 h (hora par BRT) que contém `now` — porte de `invasionStartAt` do bundle.
    function invWindowStart(now) {
        now = now ?? Date.now();
        const r = new Date(now - INV_BRT_OFFSET_MS);
        const midnight = Date.UTC(r.getUTCFullYear(), r.getUTCMonth(), r.getUTCDate()) + INV_BRT_OFFSET_MS;
        return midnight + INV_EVERY_MS * Math.floor((now - midnight) / INV_EVERY_MS);
    }
    // Janela da vez pelo relógio, corrigida pelo que o servidor disse desta MESMA janela (`invasion-state`/`invasion-energy`).
    function invWindowAt(now) {
        now = now ?? Date.now();
        const s = invWindowStart(now);
        const w = { startedAt: s, entryUntil: s + INV_ENTRY_MS, endsAt: s + INV_RAID_MS, nextAt: s + INV_EVERY_MS, fonte: 'relógio' };
        const sv = invWindowSrv;
        if (sv && sv.entryUntil > s && sv.entryUntil <= s + INV_EVERY_MS) {
            w.entryUntil = sv.entryUntil;
            if (sv.endsAt > s) w.endsAt = sv.endsAt;
            w.fonte = 'servidor';
            if (sv.live === false && now - sv.at < 60 * 1000) { w.entryUntil = Math.min(w.entryUntil, sv.at); w.endsAt = Math.min(w.endsAt, sv.at); }   // o servidor disse que já acabou
        }
        w.live = now < w.endsAt;
        w.entryOpen = now < w.entryUntil;
        return w;
    }
    // Horas pares aceitas (texto "0, 2, 14" ou lista); vazio = toda invasão.
    function invHours(d) {
        const raw = (d || cfg).invHours;
        const list = Array.isArray(raw) ? raw : String(raw || '').split(/[\s,;]+/);
        const out = [];
        for (const x of list) {
            const tx = String(x).trim();
            if (!tx) continue;
            const n = Number(tx.replace(/h$/i, ''));
            if (Number.isInteger(n) && n >= 0 && n <= 23 && n % 2 === 0 && !out.includes(n)) out.push(n);
        }
        return out.sort((a, b) => a - b);
    }
    function invHourOk(start, d) { const hs = invHours(d); return !hs.length || hs.includes(invHourOf(start)); }
    function invNextAllowedStart(base, d) { let s = base; for (let i = 0; i < 13; i++) { if (invHourOk(s, d)) return s; s += INV_EVERY_MS; } return s; }
    function invTeamTop() { return (Array.isArray(team) ? team : []).reduce((m, p) => Math.max(m, Number(p?.level) || 0), 0); }
    // Rótulo da faixa pelo nível do Pokémon mais forte do time (porte de `invasionTierForLevel`; o servidor decide, isto é só previsão).
    function invTierLabel(level) {
        const t = Math.max(1, Math.floor(level) || 1);
        const pct = (a, b) => Math.round((1 - (0.5 + 0.5 * Math.min(1, Math.max(0, (t - a) / (b - a))))) * 100);
        if (t >= 3500) return 'Nightmare 3000';
        if (t >= 2000) { const o = pct(2000, 3499); return o > 0 ? `Nightmare 2000 (−${o}%)` : 'Nightmare 2000'; }
        if (t >= 1000) return 'Orre 600';
        if (t >= 500) { const o = pct(500, 999); return o > 0 ? `Orre 520 (−${o}%)` : 'Orre 520'; }
        if (t >= 251) return 'Outland+';
        if (t >= 151) return 'Outland';
        if (t >= 91) return 'Kanto 100';
        let best = INV_KANTO_STEPS[0];
        for (const s of INV_KANTO_STEPS) if (Math.abs(t - s) < Math.abs(t - best)) best = s;
        return best === 150 ? 'Outland' : `Kanto ${best}`;
    }
    function invBusy() { return Boolean(invRun); }
    function invBusyReason() {
        if (!invRun) return null;
        if (invRun.fase === 'dentro') return `Invasão Rocket em andamento (wave ${invRun.wave || '?'}, ${invRun.kills || 0} Rockets)`;
        return `Invasão Rocket: ${invRun.fase}`;
    }
    // Rocket Plans ficam fora da venda de drops e do guardar na cidade (o jogo recusa; evita erro em toda viagem).
    function invKeepsItem(id) { return Number(id) === INV_PLANS_ITEM_ID; }
    function invLogFields(tipo, m) {
        if (invFieldsLogged[tipo]) return;
        invFieldsLogged[tipo] = true;
        const sub = {};
        for (const k of ['reward', 'outfitReward', 'token']) if (m && m[k] && typeof m[k] === 'object') sub[k] = Object.keys(m[k]);
        logEvent('invasao-campos', { tipo, chaves: Object.keys(m || {}).filter(k => k !== 'type'), sub, exemplo: tipo === 'field' ? { wave: m?.wave ?? null } : m });
    }
    function invSave() {
        try {
            if (invRun && !invRun.ended) localStorage.setItem(INV_KEY, JSON.stringify({ from: invRun.from, origem: invRun.origem, at: invRun.at, windowStart: invRun.windowStart, endsAt: invRun.endsAt, enteredAt: invRun.enteredAt || 0, kills: invRun.kills || 0, wave: invRun.wave || 0 }));
            else localStorage.removeItem(INV_KEY);
        } catch { /* sem espaço: a rodada vale só nesta carga */ }
    }
    // Carga nova no meio de uma rodada (⟳ do PokeGrid, recarga automática): a hunt de volta e o progresso voltam; o tique decide.
    function invLoad() {
        let rec = null;
        try { rec = JSON.parse(localStorage.getItem(INV_KEY) || 'null'); } catch { rec = null; }
        if (!rec || typeof rec !== 'object') return;
        const idade = Date.now() - (Number(rec.at) || 0);
        if (idade < 0 || idade > INV_RUN_MAX_AGE_MS) { try { localStorage.removeItem(INV_KEY); } catch { /* nada */ } return; }
        const at = Number(rec.at) || Date.now();
        invRun = {
            from: rec.from ? String(rec.from) : null, origem: 'lembrado', at, loadedAt: Date.now(), windowStart: Number(rec.windowStart) || invWindowStart(at),
            endsAt: Number(rec.endsAt) || invWindowAt(at).endsAt, fase: 'dentro', entered: true, enteredAt: Number(rec.enteredAt) || at, sentAt: at, fieldSeen: false, lastFieldAt: 0,
            wave: Math.max(0, Number(rec.wave) || 0), kills: Math.max(0, Number(rec.kills) || 0), ended: false, result: null,
        };
        invTried[invRun.windowStart] = 'entrou';
        logEvent('invasao-lembrada', { from: invRun.from, idadeMin: Math.round(idade / 60000), wave: invRun.wave, kills: invRun.kills, acabaEm: invFmt(invRun.endsAt - Date.now()) });
        invNotify();
    }
    function invAskEnergy(motivo) {
        invEnergyAskedAt = Date.now();
        const ok = sendGame({ type: 'invasion-energy-get' });
        logEvent('invasao-energia-pedida', { motivo, enviado: ok });
        return ok;
    }
    function invOnSocket() { if (invOn() || invRun) invAskEnergy('socket'); }
    function invOnSetCity() { if (invCityWaiter) invCityWaiter(true); }
    function invWaitCity(ms) {
        return new Promise(resolve => {
            let done = false;
            const fim = (ok) => { if (!done) { done = true; if (invCityWaiter === fim) invCityWaiter = null; resolve(ok); } };
            invCityWaiter = fim;
            setTimeout(() => fim(false), ms);
        });
    }
    // Hunt para onde voltar depois da rodada: a hunt atual (fora de cidade/arena/invasão) ou o destino da parada na cidade.
    function invFromSlug() {
        const h = normalize(huntSlug || '');
        if (h && !CITY_SLUGS.includes(h) && !invIsRaid(h) && !(typeof bossIsArena === 'function' && bossIsArena(h))) return h;
        const t = typeof idleTarget === 'function' ? idleTarget() : null;   // clã > rota > última hunt > hunt padrão
        return t?.slug || null;
    }
    // O que impede a entrada agora (null = pode entrar). Mesma lista de bloqueios das outras rotas, com nome.
    function invBlockedReason() {
        if (typeof holdReason === 'function' && holdReason()) return holdReason();
        if (typeof humanPending === 'function' && humanPending()) return 'verificação humana pendente';
        if (typeof bossBusyReason === 'function' && bossBusyReason()) return bossBusyReason();
        if (typeof tripRunning !== 'undefined' && tripRunning) return 'viagem à cidade em andamento';
        if (typeof healBusy === 'function' && healBusy()) return 'cura na Nurse Joy em andamento';
        if (typeof idleRunning !== 'undefined' && idleRunning) return 'volta da cidade parada em andamento';
        if (typeof huntSwitch !== 'undefined' && huntSwitch) return `troca para ${huntSwitch.slug} em andamento`;
        if (typeof swapPending !== 'undefined' && swapPending) return 'troca de líder em andamento';
        if (typeof sellRunning !== 'undefined' && sellRunning) return 'venda em andamento';
        if (typeof resumeHunt !== 'undefined' && resumeHunt) return 'volta da recarga pendente';
        if (typeof dailyAutoBusy !== 'undefined' && dailyAutoBusy) return 'Daily Kill sozinha decidindo';
        if (typeof awaitingDetails !== 'undefined' && awaitingDetails.length) return 'captura aguardando detalhes';
        return null;
    }
    function invSetWait(motivo) {
        if (motivo !== invWaitNote) { invWaitNote = motivo; invNotify(); }
        if (!motivo) return;
        if (Date.now() - invWaitLoggedAt < 60 * 1000) return;
        invWaitLoggedAt = Date.now();
        logEvent('invasao-espera', { motivo });
    }

    // Tique (30 s): fora de rodada, decide se entra; em rodada, vigia o fim.
    function invTick() {
        const now = Date.now();
        if (invRun) { invRunTick(now); return; }
        invJennyTick(now);
        if (!invOn()) { invSetWait(null); return; }
        const w = invWindowAt(now);
        if (!w.entryOpen) { invSetWait(null); return; }
        if (invTried[w.startedAt]) return;
        const janela = `${invHourOf(w.startedAt)}h`;
        if (!invHourOk(w.startedAt)) { invTried[w.startedAt] = 'hora fora da lista'; logEvent('invasao-pulada', { janela, motivo: 'hora fora da lista', horas: invHours() }); invNotify(); return; }
        if (invEnergy == null || now - invEnergyAt > INV_ENERGY_STALE_MS) {
            if (now - invEnergyAskedAt > INV_ENERGY_ASK_GAP_MS) invAskEnergy(invEnergy == null ? 'energia nunca lida' : 'energia velha');
            invSetWait('esperando a leitura da Energia Vermelha');
            return;
        }
        if (invEnergy <= invKeepEnergy()) {
            invTried[w.startedAt] = invEnergy <= 0 ? 'sem Energia Vermelha' : `energia ${invEnergy} ≤ reserva ${invKeepEnergy()}`;
            logEvent('invasao-pulada', { janela, motivo: invTried[w.startedAt], energia: invEnergy, reserva: invKeepEnergy() });
            invSetWait(null); invNotify();
            return;
        }
        if (now - w.startedAt < INV_ENTER_DELAY_MS) return;   // deixa a abertura assentar (anúncio, outros jogadores)
        const bloqueio = invBlockedReason();
        if (bloqueio) { invSetWait(bloqueio); return; }   // tenta no próximo tique enquanto a entrada estiver aberta
        invSetWait(null);
        invTried[w.startedAt] = 'entrou';
        invEnterFlow(w, 'tique');
    }
    function invRunTick(now) {
        const r = invRun;
        if (r.ended) return;   // voltando
        const raidNow = invIsRaid(huntSlug);
        if (r.fase === 'dentro') {
            // v3.50.1: `dentro` = enter-hunt visto (`invOnHuntChange`), não confirmado; sem NENHUM frame da invasão em 30 s a entrada falhou
            if (!r.fieldSeen && r.origem !== 'lembrado' && now - (r.enteredAt || r.at) > INV_CONFIRM_MS) { invAbort('nenhum frame da invasão chegou em 30 s depois do enter-hunt'); return; }
            if (raidNow && now - (r.lastFieldAt || now) < INV_GONE_MS) return;   // frames chegando: rodada viva (mesmo depois do endsAt previsto)
            if (r.origem === 'lembrado' && !raidNow && !r.lastFieldAt && now - (r.loadedAt || r.at) > 15 * 1000) { invFinishSilent(r, 'recarga no meio da rodada (a conta nasceu na cidade)'); return; }
            if (now > r.endsAt + INV_RESULT_GRACE_MS) { invFinishSilent(r, 'janela encerrada sem invasion-end'); return; }
            const base = r.lastFieldAt || (r.origem === 'lembrado' ? r.loadedAt : 0) || r.enteredAt || r.at;   // lembrada: conta a partir da carga
            if (!raidNow && now - base > INV_GONE_MS) { invFinishSilent(r, 'fora da hunt da invasão há 1 min sem invasion-end'); return; }
            return;
        }
        if (r.sentAt && now - r.sentAt > INV_CONFIRM_MS) { invAbort('nenhum frame da invasão chegou em 30 s depois do enter-hunt'); return; }
        if (now - r.at > INV_ENTER_TIMEOUT_MS) invAbort('a entrada não confirmou em 3 min');
    }

    async function invEnterFlow(w, origem) {
        const from = invFromSlug();
        invRun = { from, origem, at: Date.now(), windowStart: w.startedAt, endsAt: w.endsAt, fase: 'saindo da hunt', entered: false, enteredAt: 0, sentAt: 0, fieldSeen: false, lastFieldAt: 0, wave: 0, kills: 0, ended: false, result: null };
        const r = invRun;
        invSave(); invNotify();
        logEvent('invasao-entrada', { fase: 'inicio', origem, from, hunt: huntSlug || null, energia: invEnergy, janela: `${invHourOf(w.startedAt)}h`, fechaEm: invFmt(w.entryUntil - Date.now()), faixa: invTierLabel(invTeamTop()), timeLv: invTeamTop() });
        try {
            const emHunt = typeof tripInHunt === 'function' ? tripInHunt() : Boolean(normalize(huntSlug || '')) && !CITY_SLUGS.includes(normalize(huntSlug || ''));
            if (emHunt) {
                sendGame({ type: 'leave-hunt' });
                const tela = typeof nudgeClientToCity === 'function' ? nudgeClientToCity() : false;
                const chegou = await invWaitCity(INV_CITY_WAIT_MS);
                if (invRun !== r) return;
                if (!chegou) sendGame({ type: 'set-city', slug: 'cerulean' });   // a tela não viajou: avisa o servidor nós mesmos
                logEvent('invasao-entrada', { fase: 'cidade', pelaTela: chegou, tela });
                await invWait(INV_LEAVE_WAIT_MS);
            }
            if (invRun !== r) return;   // recusa/cancelamento no meio
            if (typeof holdActive === 'function' && holdActive()) { invAbort('espera na cidade ligada'); return; }
            r.fase = 'entrando'; invNotify();
            // v3.50.1: a TELA manda o ÚNICO enter-hunt. Na 1ª rodada real (conta1, 28/10/2026 01:00Z, janela das 22h BRT) o `switchHunt`
            // mandava o nosso enter-hunt (a conta ENTROU: energia 4→3, `field { wave:1 }`) e o `hunt-resume` sintético fazia a tela viajar
            // para o mapa e mandar OUTRO enter-hunt 4 s depois → `error`/`invasion-refused` "Você já participou dessa invasão. Espere a
            // próxima!" + `invasion-end { reason:'left' }`: rodada perdida com a energia gasta. Agora só injetamos o `hunt-resume` (a tela
            // viaja e manda o enter-hunt, exatamente o que o botão INVASÃO faz); sem a hunt da invasão em 5 s (tela sem o handler, socket
            // sem dispatchEvent) mandamos o enter-hunt nós mesmos. NUNCA mandar dois `enter-hunt rocket_cerulean`.
            const tela = typeof nudgeClientToHunt === 'function' ? Boolean(nudgeClientToHunt(INV_SLUG)) : false;
            logEvent('invasao-entrada', { fase: 'tela', tela });
            if (tela) { await invWait(INV_TELA_WAIT_MS); if (invRun !== r) return; }
            if (invIsRaid(huntSlug)) { r.sentAt = r.sentAt || Date.now(); logEvent('invasao-entrada', { fase: 'enter-hunt', pelaTela: true }); return; }
            const ok = sendGame({ type: 'enter-hunt', slug: INV_SLUG });
            r.sentAt = Date.now();
            logEvent('invasao-entrada', { fase: 'enter-hunt', pelaTela: false, enviado: ok });
            if (!ok && invRun === r) invAbort('não consegui mandar o enter-hunt (socket fechado?)');
        } catch (err) { if (invRun === r) invAbort(String(err?.message || err)); }
    }
    // Entrada que não aconteceu: registra, avisa e devolve a conta à hunt (ela ficou na cidade).
    function invAbort(porque) {
        const r = invRun;
        if (!r) return;
        invRun = null; invSave();
        logEvent('invasao-entrada', { fase: 'falhou', porque, origem: r.origem, from: r.from, hunt: huntSlug || null });
        if (cfg.invAlerts !== false) {
            const who = playerName();
            postWebhook('alert', {
                content: `⚠️ ${who ? `**${who}**` : 'Sua conta'}: não entrei na Invasão Rocket — ${porque}`,
                username: 'Poke Idle World',
                embeds: [{ title: 'Invasão Rocket: entrada falhou', color: 0xed4245, description: (who ? `Conta: ${who}\n` : '') + `${porque}.${r.from ? ` Voltando para ${r.from}.` : ' A parada na cidade decide a volta.'}${invEnergy != null ? `\nEnergia Vermelha: ${invEnergy}/${INV_ENERGY_MAX}` : ''}` }],
            }, { evento: 'invasao-entrada-falhou', porque });
        }
        if (r.from && !(typeof holdActive === 'function' && holdActive())) {
            setTimeout(() => { if (!invRun) logEvent('invasao-volta', { para: r.from, motivo: 'entrada falhou', enviado: switchHunt(r.from, 1, 'invasao-volta') }); }, INV_LEAVE_WAIT_MS);
        }
        invNotify();
    }
    // `confirmHuntSwitch` sem frame em 30 s (2 tentativas) para as nossas trocas.
    function invHuntFailed(slug, origem) {
        if (origem === 'invasao') { if (invRun && !invRun.fieldSeen) invAbort('nenhum frame da invasão chegou em 30 s após duas tentativas'); return; }
        if (origem === 'invasao-volta') logEvent('invasao-volta', { para: slug, fase: 'falhou', motivo: 'a parada na cidade tenta depois' });
    }
    // `setHunt`: a hunt virou a invasão (nossa entrada confirmando, ou o jogador clicou INVASÃO na tela / carga no meio da rodada).
    function invOnHuntChange(novo) {
        if (!invIsRaid(novo)) return;
        const now = Date.now();
        if (!invRun) {
            const w = invWindowAt(now);
            invRun = { from: invFromSlug(), origem: 'tela', at: now, windowStart: w.startedAt, endsAt: w.endsAt, fase: 'dentro', entered: true, enteredAt: now, sentAt: now, fieldSeen: false, lastFieldAt: now, wave: 0, kills: 0, ended: false, result: null };
            invTried[w.startedAt] = 'entrou (tela)';
            logEvent('invasao-entrada', { fase: 'tela', from: invRun.from, janela: `${invHourOf(w.startedAt)}h`, acabaEm: invFmt(w.endsAt - now) });
        } else if (!invRun.entered || invRun.fase !== 'dentro') {
            invRun.entered = true; invRun.enteredAt = now; invRun.sentAt = invRun.sentAt || now; invRun.lastFieldAt = now; invRun.fase = 'dentro';
            logEvent('invasao-entrada', { fase: 'dentro', origem: invRun.origem, segundos: Math.round((now - invRun.at) / 1000), from: invRun.from });
            if (invJennyOn()) invJennyAt = 0;   // a rodada vai render Plans: relê a Jenny depois
        }
        invSave(); invNotify();
    }
    function invOnField(m) {
        if (!invRun || invRun.ended || !invIsRaid(huntSlug)) return;
        const r = invRun;
        r.lastFieldAt = Date.now(); r.fieldSeen = true;
        if (r.fase !== 'dentro') { r.fase = 'dentro'; r.entered = true; r.enteredAt = r.enteredAt || Date.now(); }
        invLogFields('field', m);
        const w = Number(m?.wave);
        if (Number.isFinite(w) && w > 0 && w !== r.wave) { r.wave = w; logEvent('invasao-wave', { wave: w, kills: r.kills }); invSave(); invNotify(); }
    }
    function invOnKill(m) {
        if (!invRun || invRun.ended || !invIsRaid(huntSlug)) return;
        const r = invRun;
        r.kills = (r.kills || 0) + 1;
        r.lastFieldAt = Date.now(); r.fieldSeen = true;
        if (r.kills <= 2) logEvent('invasao-abate', { speciesName: m?.speciesName ?? null, shiny: Boolean(m?.shiny), level: m?.level ?? null, xp: m?.xpGained ?? null, loot: Array.isArray(m?.loot) ? m.loot.length : null });
        if (r.kills % 20 === 0) invSave();
        invNotify();
    }
    // Frames `invasion-*` do servidor.
    function invOnMessage(m) {
        const t = String(m.type || '');
        if (t === 'invasion-state' || t === 'invasion-energy') {
            invLogFields(t, m);
            if (typeof m.entryUntil === 'number') invWindowSrv = { live: Boolean(m.live), entryOpen: Boolean(m.entryOpen), entryUntil: Number(m.entryUntil), endsAt: Number(m.endsAt) || 0, at: Date.now() };
            if (t === 'invasion-energy') {
                const e = Number(m.energy);
                if (Number.isFinite(e)) { const antes = invEnergy; invEnergy = Math.max(0, e); invEnergyAt = Date.now(); if (antes !== invEnergy) logEvent('invasao-energia', { energia: invEnergy, antes }); }
            } else {
                const w = invWindowAt();
                if (invStateLogged !== w.startedAt) { invStateLogged = w.startedAt; logEvent('invasao-janela', { janela: `${invHourOf(w.startedAt)}h`, live: Boolean(m.live), entradaAberta: Boolean(m.entryOpen), entradaAte: m.entryUntil ? invHora(m.entryUntil) : null, acabaAs: m.endsAt ? invHora(m.endsAt) : null }); }
                if (m.entryOpen && (invOn() || invRun) && Date.now() - invEnergyAskedAt > INV_ENERGY_ASK_GAP_MS) setTimeout(() => invAskEnergy('invasion-state'), 2000 + Math.floor(Math.random() * 3000));
            }
            invNotify();
            return;
        }
        if (t === 'invasion-announce') {
            if (Date.now() - invAnnounceLoggedAt > 10 * 60 * 1000) { invAnnounceLoggedAt = Date.now(); invLogFields(t, m); logEvent('invasao-anuncio', { texto: String(m.text || '').slice(0, 200), ateAs: m.until ? invHora(m.until) : null }); }
            return;
        }
        if (t === 'invasion-refused') { invLogFields(t, m); invOnRefused(String(m.message || '')); return; }
        if (t === 'invasion-end') { invLogFields(t, m); invOnEnd(m); return; }
        invLogFields(t, m);
    }
    function invOnRefused(message) {
        invRefused = { at: Date.now(), message };
        logEvent('invasao-recusada', { mensagem: message, fase: invRun?.fase || null, origem: invRun?.origem || null, jaDentro: Boolean(invRun?.fieldSeen), energia: invEnergy, hunt: huntSlug || null });
        // Recusa DEPOIS do 1º frame = enter-hunt duplicado (a tela mandou outro): a conta estava dentro e o servidor a tira com
        // `invasion-end { reason:'left' }` logo depois — quem encerra é ele; aqui só fica o registro. Antes do 1º frame é a resposta à entrada.
        if (invRun && !invRun.ended && !invRun.fieldSeen) {
            if (typeof huntSwitch !== 'undefined' && huntSwitch && huntSwitch.slug === INV_SLUG) { clearTimeout(huntSwitch.timer); huntSwitch = null; }   // não insiste: o jogo já disse não
            invAbort(`o jogo recusou (${message || 'sem motivo'})`);
        }
        invNotify();
    }
    function invOnEnd(m) {
        const r = invRun;
        const n = (v) => Math.max(0, Number(v) || 0);
        const res = {
            at: Date.now(), reason: m.reason ? String(m.reason) : null, wave: n(m.wave), bestWave: n(m.bestWave), kills: n(m.kills), xp: n(m.xp),
            tier: m.tier ? String(m.tier) : null, level: n(m.level), levelBefore: typeof m.levelBefore === 'number' ? m.levelBefore : null,
            plans: n(m.reward?.qty), plansName: m.reward?.name ? String(m.reward.name) : 'Rocket Plans',
            milestones: Array.isArray(m.milestones) ? m.milestones.map(Number).filter(Number.isFinite) : (m.milestone ? [Number(m.milestone)] : []),
            outfit: Array.isArray(m.outfitReward?.items) ? m.outfitReward.items.length : 0,
            from: r?.from || null, origem: r?.origem || 'sem rodada acompanhada', killsVistos: r?.kills || 0,
        };
        invLast = res;
        logEvent('invasao-fim', { motivo: res.reason, wave: res.wave, recorde: res.bestWave, rockets: res.kills, abatesVistos: res.killsVistos, xp: res.xp, faixa: res.tier, nivel: res.level, nivelAntes: res.levelBefore, plans: res.plans, marcos: res.milestones, outfit: res.outfit, origem: res.origem, from: res.from, hunt: huntSlug || null });
        if (cfg.invAlerts !== false) invAlertEnd(res);
        if (invJennyOn()) invJennyAt = 0;   // o saldo de Plans mudou: relê a Jenny no próximo tique
        if (r && !r.ended) { r.result = res; invReturnFlow(r, res.reason === 'wipe'); }
        invNotify();
    }
    function invFinishSilent(r, motivo) {
        logEvent('invasao-fim', { motivo, semFrame: true, wave: r.wave, abatesVistos: r.kills, origem: r.origem, from: r.from, hunt: huntSlug || null });
        invReturnFlow(r, false);
    }
    // Fim da rodada: espera a janela de resultado, garante a conta na cidade, cura se o time caiu e volta para a hunt de origem.
    async function invReturnFlow(r, caiu) {
        r.ended = true; r.fase = 'voltando'; invSave(); invNotify();
        try {
            await invWait(INV_END_WAIT_MS);
            if (invRun !== r) return;
            const h = normalize(huntSlug || '');
            if (h && !CITY_SLUGS.includes(h)) { sendGame({ type: 'leave-hunt' }); sendGame({ type: 'set-city', slug: 'cerulean' }); await invWait(INV_LEAVE_WAIT_MS); }
            if (invRun !== r) return;
            if (caiu) { sendGame({ type: 'joy-heal' }); await invWait(INV_HEAL_WAIT_MS); }   // grátis; líder em hp 0 = a tela recusa viajar
            if (invRun !== r) return;
            const para = r.from;
            if (!para) { logEvent('invasao-volta', { para: null, motivo: 'sem hunt de volta (a parada na cidade decide)', curou: caiu }); return; }
            if (typeof holdActive === 'function' && holdActive()) { logEvent('invasao-volta', { para, motivo: 'espera na cidade ligada: fica', curou: caiu }); return; }
            const ok = switchHunt(para, 1, 'invasao-volta');
            logEvent('invasao-volta', { para, enviado: ok, curou: caiu, motivo: r.result?.reason || 'fim' });
        } finally {
            if (invRun === r) { invRun = null; invSave(); invNotify(); }
        }
    }
    function invAlertEnd(r) {
        const who = playerName();
        const conta = who ? `**${who}**` : 'Sua conta';
        const up = r.levelBefore != null && r.level > r.levelBefore ? ` (+${r.level - r.levelBefore})` : '';
        const recorde = r.wave > 0 && r.bestWave > 0 && r.wave >= r.bestWave ? ' 🏅 recorde' : '';
        postWebhook('alert', {
            content: `🚀 ${conta}: Invasão Rocket — wave **${r.wave}**${recorde}, ${r.kills} Rockets, **${fmtNum(r.plans)} ${r.plansName}**${r.tier ? ` · ${r.tier}` : ''}`,
            username: 'Poke Idle World',
            embeds: [{
                title: `Invasão Rocket: ${INV_REASON_LABEL[r.reason] || r.reason || 'fim da rodada'}`,
                color: r.reason === 'wipe' ? 0xed4245 : 0x5865f2,
                description: (who ? `Conta: ${who}\n` : '') + `Wave ${r.wave}${r.bestWave ? ` (recorde ${r.bestWave})` : ''} · ${r.kills} Rockets derrotados · ${fmtNum(r.xp)} XP\nNível de Invasão ${r.level}${up}${r.milestones.length ? ` · 🏁 marco ${r.milestones.join(', ')}` : ''}${r.outfit ? ' · outfit nova' : ''}\nRecompensa: ${fmtNum(r.plans)} ${r.plansName}${r.from ? `\nVolta para ${r.from}` : ''}`,
            }],
        }, { evento: 'invasao-fim', wave: r.wave, plans: r.plans, motivo: r.reason });
    }
    // Botão "Entrar agora" do painel: entrada aberta e energia → entra já (ignora a lista de horas e a reserva).
    function invNow() {
        if (invRun) return { ok: false, msg: `Já há uma rodada em andamento (${invRun.fase}).` };
        const w = invWindowAt();
        if (!w.entryOpen) {
            const prox = w.nextAt;   // o botão não olha a lista de horas
            return { ok: false, msg: `Entrada fechada agora${w.live ? ' (invasão em andamento)' : ''}. Próxima às ${invHora(prox)} (${invFmt(prox - Date.now())}).` };
        }
        if (invEnergy != null && invEnergy <= 0) return { ok: false, msg: 'Sem Energia Vermelha (2 por dia; o script não compra com diamantes).' };
        const bloqueio = invBlockedReason();
        if (bloqueio) return { ok: false, msg: `Não dá agora: ${bloqueio}.` };
        invTried[w.startedAt] = 'entrou (botão)';
        invEnterFlow(w, 'botão');
        return { ok: true, msg: `Entrando na Invasão Rocket (entrada fecha em ${invFmt(w.entryUntil - Date.now())})…` };
    }

    // ---- Officer Jenny: trocar Rocket Plans pela oferta escolhida ----
    async function invJennyRead(motivo) {
        try {
            const r = await gameApi(INV_JENNY_URL);
            const rawOffers = Array.isArray(r?.offers) ? r.offers : [];
            const offers = rawOffers.map(o => ({
                key: String(o?.key ?? ''), name: String(o?.name || o?.key || '?'), qty: Math.max(1, Number(o?.qty) || 1), cost: Math.max(0, Number(o?.cost) || 0),
                owned: Boolean(o?.owned), kind: o?.kind ? String(o.kind) : (o?.looktype ? 'outfit' : 'item'), description: o?.description ? String(o.description) : '',
            })).filter(o => o.key);
            if (!invJenny) logEvent('jenny-campos', { chaves: Object.keys(r || {}), oferta: rawOffers.length ? Object.keys(rawOffers[0]) : [], ofertas: offers.map(o => `${o.key}=${o.cost}${o.owned ? ' (tem)' : ''}`) });
            invJenny = { balance: Math.max(0, Number(r?.balance) || 0), token: r?.token?.name ? String(r.token.name) : 'Rocket Plans', offers, at: Date.now() };
            invJennyAt = Date.now(); invJennyFailedAt = 0;
            logEvent('jenny', { motivo, saldo: invJenny.balance, ofertas: offers.length, escolhida: invJennyPick()?.name || null, cabem: invJennyAffordable() });
            invNotify();
            return invJenny;
        } catch (err) {
            invJennyFailedAt = Date.now();
            logEvent('jenny-erro', { motivo, erro: String(err?.message || err) });
            invNotify();
            return null;
        }
    }
    function invJennyPick(d) {
        const key = invJennyOffer(d);
        if (!key || !invJenny) return null;
        return invJenny.offers.find(o => o.key === key) || invJenny.offers.find(o => normalize(o.name) === normalize(key)) || null;
    }
    // Quantas trocas cabem agora: (saldo − reserva) ÷ custo; oferta já possuída (outfit) = 0.
    function invJennyAffordable(d) {
        const o = invJennyPick(d);
        if (!o || !invJenny || o.owned || o.cost <= 0) return 0;
        return Math.max(0, Math.floor((invJenny.balance - invJennyKeep(d)) / o.cost));
    }
    function invJennyWanted() { return invJennyOn() && !invJennyWorking && invJennyAffordable() > 0 && Date.now() - invJennyFailedAt > INV_JENNY_RETRY_MS; }
    function invJennyAsk() { if (invJennyWanted()) tripRequest('jenny', null, `${invJennyAffordable()}× ${invJennyPick()?.name || invJennyOffer()}`); }
    function invJennyTick(now) {
        if (!invJennyOn() || invJennyWorking) return;
        if (now - invJennyFailedAt < INV_JENNY_RETRY_MS) return;
        if (now - invJennyAt > INV_JENNY_POLL_MS) { invJennyRead(invJennyAt ? 'prazo' : '1ª leitura').then(j => { if (j) invJennyAsk(); }); return; }
        invJennyAsk();
    }
    // Tarefa `jenny` da viagem: Shopping, troca enquanto o saldo (menos a reserva) der, relê e avisa.
    async function invJennyCityWork() {
        if (!invJennyOn()) return { ok: true, motivo: 'desligada' };
        invJennyWorking = true;
        const feitas = [];
        let o = null;
        try {
            const j = await invJennyRead('cidade');
            if (!j) return { ok: false, motivo: 'não consegui ler a Officer Jenny' };
            o = invJennyPick();
            if (!o) return { ok: false, motivo: `oferta "${invJennyOffer()}" não existe na Jenny (${j.offers.map(x => x.name).join(', ') || 'lista vazia'})` };
            const n = invJennyAffordable();
            if (n <= 0) return { ok: true, motivo: o.owned ? `${o.name} já é sua` : `saldo ${fmtNum(j.balance)} ${j.token} não dá para ${o.name} (${fmtNum(o.cost)})${invJennyKeep() ? ` com reserva ${fmtNum(invJennyKeep())}` : ''}` };
            if (tripCity() !== INV_JENNY_CITY) {
                logEvent('jenny-cidade', { de: tripCity(), para: INV_JENNY_CITY });
                sendGame({ type: 'set-city', slug: INV_JENNY_CITY });
                await invWait(INV_JENNY_CITY_WAIT_MS);
            }
            const max = Math.min(n, o.kind === 'outfit' ? 1 : INV_JENNY_MAX_PER_TRIP);
            for (let i = 0; i < max; i++) {
                const r = await gameApi(`${INV_JENNY_URL}/exchange`, { method: 'POST', body: JSON.stringify({ offer: o.key }) });
                const prize = r?.prize && typeof r.prize === 'object' ? r.prize : {};
                feitas.push({ name: String(prize.name || o.name), qty: Math.max(1, Number(prize.qty) || o.qty) });
                logEvent('jenny-troca', { oferta: o.key, premio: prize.name ?? null, qty: prize.qty ?? null, kind: prize.kind ?? null, chaves: Object.keys(r || {}) });
                if (o.kind === 'outfit') break;
                await invWait(INV_JENNY_BETWEEN_MS);
            }
            sendGame({ type: 'inv-get' });
            sendGame({ type: 'balls-get' });   // 100 Idle Balls vão direto para a carteira de bolas
            await invJennyRead('depois da troca');
            return { ok: true, motivo: `${feitas.length}× ${o.name}` };
        } catch (err) {
            invJennyFailedAt = Date.now();
            logEvent('jenny-erro', { fase: 'troca', erro: String(err?.message || err), feitas: feitas.length });
            return { ok: false, motivo: String(err?.message || err) };
        } finally {
            invJennyWorking = false;
            if (feitas.length) { invJennyLast = { at: Date.now(), feitas, oferta: o?.name || invJennyOffer() }; if (cfg.invAlerts !== false) invAlertJenny(feitas, o); }
            invNotify();
        }
    }
    function invAlertJenny(feitas, o) {
        const who = playerName();
        const total = feitas.reduce((s, f) => s + f.qty, 0);
        const nome = feitas[0]?.name || o?.name || 'prêmio';
        postWebhook('alert', {
            content: `👮 ${who ? `**${who}**` : 'Sua conta'}: Officer Jenny — ${feitas.length}× ${o?.name || nome} (${fmtNum(total)} ${nome})${o ? ` por ${fmtNum(o.cost * feitas.length)} Plans` : ''}`,
            username: 'Poke Idle World',
            embeds: [{ title: `Officer Jenny: ${feitas.length} troca${feitas.length === 1 ? '' : 's'}`, color: 0x5865f2, description: (who ? `Conta: ${who}\n` : '') + `${feitas.map(f => `${f.qty}× ${f.name}`).join(', ')}${invJenny ? `\nSaldo: ${fmtNum(invJenny.balance)} ${invJenny.token}` : ''}` }],
        }, { evento: 'jenny-troca', n: feitas.length });
    }
    // Botão "Trocar agora": na cidade troca já; na hunt pede a viagem.
    async function invJennyNow() {
        if (!invJennyOn()) return { ok: false, msg: 'Ligue a troca na Jenny, escolha a oferta e salve antes.' };
        if (invJennyWorking) return { ok: false, msg: 'Troca em andamento.' };
        const j = await invJennyRead('botão');
        if (!j) return { ok: false, msg: 'Não consegui ler a Officer Jenny (veja o log).' };
        const o = invJennyPick();
        if (!o) return { ok: false, msg: `A oferta escolhida não existe na Jenny. Ofertas: ${j.offers.map(x => `${x.name} (${fmtNum(x.cost)})`).join(', ')}` };
        const n = invJennyAffordable();
        if (n <= 0) return { ok: false, msg: o.owned ? `${o.name} já é sua.` : `Saldo ${fmtNum(j.balance)} ${j.token} não dá para ${o.name} (${fmtNum(o.cost)}${invJennyKeep() ? `, reserva ${fmtNum(invJennyKeep())}` : ''}).` };
        const naCidade = !(typeof tripInHunt === 'function' && tripInHunt()) && !(typeof tripRunning !== 'undefined' && tripRunning) && !invRun;
        if (naCidade) { const r = await invJennyCityWork(); return { ok: r.ok, msg: r.ok ? `Troca feita: ${r.motivo}.` : `Troca falhou: ${r.motivo}` }; }
        tripRequest('jenny', null, `botão: ${n}× ${o.name}`);
        return { ok: true, msg: `Viagem pedida: ${n}× ${o.name} na Officer Jenny (Shopping).` };
    }

    // Linhas de estado do painel.
    function invStatus(d) {
        d = d || cfg;
        const now = Date.now();
        const partes = [];
        if (invRun) {
            if (invRun.fase === 'dentro') partes.push(`▶ dentro da invasão: wave ${invRun.wave || '?'} · ${invRun.kills || 0} Rockets · acaba em ${invFmt(invRun.endsAt - now)}${invRun.from ? ` · volta para ${invRun.from}` : ''}`);
            else partes.push(`${invRun.fase}${invRun.from ? ` (volta: ${invRun.from})` : ''}`);
        } else {
            const w = invWindowAt(now);
            const feito = invTried[w.startedAt];
            if (w.entryOpen) partes.push(`entrada aberta até ${invHora(w.entryUntil)} (${invFmt(w.entryUntil - now)})${feito ? ` · esta janela: ${feito}` : ''}`);
            else if (w.live) partes.push(`invasão rolando até ${invHora(w.endsAt)} (entrada fechada${feito ? `; esta janela: ${feito}` : ''})`);
            if (d.invEnabled) {
                const base = w.entryOpen && !feito ? w.startedAt : w.nextAt;
                const prox = invNextAllowedStart(base, d);
                if (!(w.entryOpen && !feito)) partes.push(`próxima entrada ${invHora(prox)} (${invFmt(prox - now)})${invHours(d).length ? ` · horas ${invHours(d).map(h => `${h}h`).join(', ')} (Brasília)` : ''}`);
            }
            if (invWaitNote) partes.push(`parado: ${invWaitNote}`);
        }
        partes.push(`energia ${invEnergy == null ? '?' : `${invEnergy}/${INV_ENERGY_MAX}`}${invKeepEnergy(d) ? ` (reserva ${invKeepEnergy(d)})` : ''}`);
        const top = invTeamTop();
        if (top) partes.push(`faixa ${invTierLabel(top)} (time lv ${top})`);
        if (invLast) partes.push(`última ${invHora(invLast.at)}: wave ${invLast.wave}, ${invLast.kills} Rockets, ${fmtNum(invLast.plans)} Plans${invLast.tier ? `, ${invLast.tier}` : ''} (${INV_REASON_LABEL[invLast.reason] || invLast.reason || 'fim'})`);
        if (invRefused && now - invRefused.at < 2 * 60 * 60 * 1000) partes.push(`recusa ${invHora(invRefused.at)}: ${invRefused.message}`);
        return partes.join(' · ');
    }
    function invJennyStatus(d) {
        d = d || cfg;
        if (!d.invJennyEnabled) return 'desligada';
        if (!invJennyOffer(d)) return 'escolha a oferta';
        if (!invJenny) return invJennyFailedAt ? 'não consegui ler a Jenny (veja o log)' : 'ainda não li a Jenny';
        const o = invJennyPick(d);
        const partes = [`${fmtNum(invJenny.balance)} ${invJenny.token}`];
        if (!o) partes.push(`oferta "${invJennyOffer(d)}" não está na lista`);
        else if (o.owned) partes.push(`${o.name}: já é sua`);
        else { const n = invJennyAffordable(d); partes.push(n > 0 ? `cabem ${n}× ${o.name} (${fmtNum(o.cost)} cada)${invJennyWorking ? ' · trocando' : ' · na próxima viagem'}` : `faltam ${fmtNum(o.cost + invJennyKeep(d) - invJenny.balance)} para ${o.name}`); }
        if (invJennyLast) partes.push(`última ${invHora(invJennyLast.at)}: ${invJennyLast.feitas.map(f => `${f.qty}× ${f.name}`).join(', ')}`);
        return partes.join(' · ');
    }

    // ---- Ginásio (v3.45.0): conquistar as insígnias que faltam e resgatar a Recompensa bônus, na viagem à cidade ------------
    //   Janela "Ginásios" do jogo (abas "Ginásios"/"Recompensas"; modos Insígnia/Liderança). 18 ginásios (8 Kanto + 10 Johto), tudo
    //   por REST — CONFIRMADO no log em 21/10/2026 (conta3: 5 desafios vencidos e 6 resgates feitos na mão, farejador da v3.43.2):
    //   GET  /api/game/gyms -> { gyms[{ id, region, enabled, city, leader, type, badge, order, teamSize, holder{ name }|null, owned,
    //        cooldownMs, canLead }], details[{ id, region, enabled, city, type, badge, order, defender{ name, isNpc, charId, sinceAt,
    //        defenses, look }, team[], npcTeam[{ speciesId, looktype, name, level, shiny, types[], maxHp, stats, moves[{ name, type,
    //        power, category }] }], owned, bonus{ itemId, name, icon, qty, state:'claimable'|'cooldown'|'needWin', cooldownMs }|null,
    //        cooldownMs, leaderCooldownMs, arenaMap, leaderBlock{ reason }|null, leaderBlockMsg, mine }], badges, total,
    //        regions{ kanto{ badges, total:8 }, johto{ badges, total:10 } }, badgePerk{ active, max, xpPct, dropPct }, vault,
    //        payout{ nextAt, basisDay, gold, diamonds, perGymGold, perGymDiamonds }, myGymIds[] }
    //   POST /api/game/gyms/challenge { gymId, mode:'badge' } -> { won, gymId, battleId, defenderName, vsNpc, log[{ kind:'start'|
    //        'move'|'faint'|'switch'|'end', side, monName, move, moveType, dmg, eff, stab, targetHp, targetMaxHp, teamIndex, winner,
    //        reason, seq }], snapshot{ id, seq, phase, winner, endReason:'ko'|…, you:'a', sides{ a{ charId, name, look, active,
    //        teamSize, team[{ name, level, maxHp, … }] }, b{…} } }, badgeEarned, becameLeader, badges, arena{ map, floor, … } }.
    //        A luta é resolvida NA HORA pelo servidor com o TIME ATUAL (modo Insígnia = time livre; o NPC tem 6 Pokémon lv 400); o
    //        HUD do jogo só anima o `log` (o usuário até recarrega a página para pular a animação — o script nem a dispara, porque
    //        o POST é dele). Erro = { message }. Depois de um desafio o ginásio fica `cooldownMs` ≈ 10 min (599 675 ms logo após a
    //        vitória na conta3). Feito com a conta na cidade (hunt nula); de dentro da hunt não foi testado — por isso é tarefa da viagem.
    //   POST /api/game/gyms/bonus { gymId } -> { ok, itemId, name, qty, nextAvailableAt }: "Recompensa bônus" (pedras de evolução:
    //        20x Rock Stone, 2x Metal Stone, 2x Ancient Stone…); `bonus.state` 'claimable' depois de vencer, 'cooldown' por 48 h
    //        (172 800 000 ms) após o resgate e 'needWin' quando o prazo vence ("Vença o ginásio de novo").
    //   Não usados: POST /api/game/gyms/abandon e mode 'leader' (liderança). Pelo socket só o anúncio `gym-global` (log `ginasio-global`).
    //   Pedido do usuário em 21/10/2026: "coletar as insígnias que faltam, para o bônus das 16 insígnias; e recuperar a recompensa
    //   depois de ganhar o desafio". `badgePerk` = +1% XP e +1% drop por insígnia (18/18 = +18%); as 18 dão a Gym Champion Outfit.
    //   Fluxo: tique de 1 min; lê a janela a cada 30 min ou quando um prazo vence (cooldown do desafio, prazo do bônus, espera de
    //   derrota). Plano = ginásios abertos SEM insígnia (ou, com `gymRedo`, com bônus em `needWin`) e sem cooldown -> desafiar; bônus
    //   `claimable` (com `gymBonus`) -> resgatar. Com algo no plano pede viagem à cidade (`tripRequest('ginasio')`, e vai de carona em
    //   toda viagem); na cidade `gymCityWork` desafia um a um (modo Insígnia, time atual), relê, resgata os bônus liberados e avisa em
    //   Alertas (insígnia, derrota com o time do líder, bônus, outfit). Derrota = espera 2 h, dobrando a cada derrota seguida do mesmo
    //   ginásio (máx. 24 h): o time precisa ficar mais forte, insistir não adianta. Erro = 15 min antes de tentar de novo.

    const GYM_URL = '/api/game/gyms';
    const GYM_TICK_MS = 60 * 1000;
    const GYM_POLL_MS = 30 * 60 * 1000;          // relê a janela de meia em meia hora (antes disso só quando um prazo vence)
    const GYM_RETRY_MS = 15 * 60 * 1000;         // espera depois de um erro (leitura, desafio ou resgate)
    const GYM_LOSS_WAIT_MS = 2 * 60 * 60 * 1000; // espera depois de uma derrota (dobra a cada derrota seguida do mesmo ginásio)
    const GYM_LOSS_WAIT_MAX_MS = 24 * 60 * 60 * 1000;
    const GYM_BETWEEN_MS = [1200, 2500];         // entre desafios/resgates ("humano")
    const GYM_BONUS_RETRY_MS = 3000;             // v3.45.2: vitória sem bônus `claimable` na releitura: espera e relê mais uma vez

    let gymState = null;        // última leitura (parseGymState)
    let gymFetchedAt = 0;
    let gymBusy = false;        // lendo
    let gymWorking = false;     // na cidade, desafiando
    let gymFailedAt = 0;        // último erro
    let gymLast = null;         // { at, desafios:[{ id, city, badge, won, badgeEarned, outfit, defender, npc }], bonus:[{ id, city, name, qty }], falhas:[{ id, city, motivo }] }
    let gymSig = '';
    let gymFieldsLogged = false;
    const gymLoss = {};         // id -> { at, n }: derrotas seguidas (zera na vitória)
    let onGymChange = null;     // callback do painel

    function gymEnabled(d) { return Boolean((d || cfg).gymEnabled); }
    function gymNotify() { if (onGymChange) { try { onGymChange(); } catch { /* painel fechado */ } } }
    const gymRnd = (par) => par[0] + Math.floor(Math.random() * (par[1] - par[0] + 1));
    const gymWait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    const gymHora = (ts) => (ts ? new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '?');
    function gymFmtLeft(ms) {
        ms = Math.max(0, Number(ms) || 0);
        const h = Math.floor(ms / 36e5), m = Math.round((ms % 36e5) / 6e4);
        return h > 0 ? `${h}h${m ? String(m).padStart(2, '0') : ''}` : `${Math.max(1, m)}min`;
    }
    const gymCityName = (g) => (g ? (g.city ? g.city.charAt(0).toUpperCase() + g.city.slice(1) : String(g.id || '?')) : '?');
    const gymTeamText = (team) => (Array.isArray(team) ? team : []).map(p => `${p?.name ?? '?'}${p?.shiny ? '✨' : ''} lv${p?.level ?? '?'}`).join(', ');

    function parseGymState(raw) {
        const now = Date.now();
        const lista = Array.isArray(raw?.gyms) ? raw.gyms : [];
        const det = Array.isArray(raw?.details) ? raw.details : [];
        const gyms = det.map(d => {
            const g = lista.find(x => x && x.id === d?.id) || {};
            const b = d?.bonus && typeof d.bonus === 'object' ? d.bonus : null;
            const cd = Math.max(0, Number(d?.cooldownMs) || 0);
            return {
                id: String(d?.id || ''), city: String(d?.city || g.city || d?.id || ''), region: String(d?.region || g.region || 'kanto'),
                type: String(d?.type || g.type || ''), badge: String(d?.badge || g.badge || ''), leader: String(g.leader || d?.defender?.name || ''),
                enabled: d?.enabled !== false, owned: Boolean(d?.owned), cooldownUntil: cd > 0 ? now + cd : 0,
                bonus: b ? { state: String(b.state || ''), name: String(b.name || ''), qty: Number(b.qty) || 0, until: (Number(b.cooldownMs) || 0) > 0 ? now + Number(b.cooldownMs) : 0 } : null,
                npcTeam: Array.isArray(d?.npcTeam) ? d.npcTeam.map(p => ({ name: String(p?.name || '?'), level: Number(p?.level) || 0, shiny: Boolean(p?.shiny), types: Array.isArray(p?.types) ? p.types : [] })) : [],
            };
        }).filter(g => g.id);
        const badges = Number.isFinite(Number(raw?.badges)) ? Number(raw.badges) : gyms.filter(g => g.owned).length;
        const total = Number(raw?.total) > 0 ? Number(raw.total) : gyms.length;
        const bp = raw?.badgePerk && typeof raw.badgePerk === 'object' ? raw.badgePerk : null;
        const perk = bp ? { active: Number(bp.active) || 0, max: Number(bp.max) || 0, xpPct: Number(bp.xpPct) || 0, dropPct: Number(bp.dropPct) || 0 } : null;
        return { gyms, badges, total, regions: raw?.regions && typeof raw.regions === 'object' ? raw.regions : {}, perk };
    }
    // Quanto falta da espera por derrota do ginásio (0 = pode desafiar).
    function gymLossWait(id) {
        const l = gymLoss[id];
        if (!l) return 0;
        const w = Math.min(GYM_LOSS_WAIT_MAX_MS, GYM_LOSS_WAIT_MS * Math.pow(2, Math.max(0, l.n - 1)));
        return Math.max(0, l.at + w - Date.now());
    }
    // Plano para a cidade: { desafiar:[g], resgatar:[g], esperando:[{ g, ms, motivo:'cooldown'|'derrota' }] }.
    function gymPlan(d, st) {
        d = d || cfg; st = st || gymState;
        const out = { desafiar: [], resgatar: [], esperando: [] };
        if (!st) return out;
        const now = Date.now();
        for (const g of st.gyms) {
            if (!g.enabled) continue;
            if (d.gymBonus !== false && g.bonus && g.bonus.state === 'claimable') out.resgatar.push(g);
            const quer = !g.owned || (d.gymRedo !== false && g.bonus && g.bonus.state === 'needWin');
            if (!quer) continue;
            const cd = Math.max(0, g.cooldownUntil - now);
            const loss = gymLossWait(g.id);
            if (cd > 0) out.esperando.push({ g, ms: cd, motivo: 'cooldown' });
            else if (loss > 0) out.esperando.push({ g, ms: loss, motivo: 'derrota' });
            else out.desafiar.push(g);
        }
        return out;
    }
    function gymWanted(d) {   // carona na viagem
        if (!gymEnabled(d) || gymWorking) return false;
        const p = gymPlan(d);
        return p.desafiar.length > 0 || p.resgatar.length > 0;
    }
    // Próximo prazo que muda o plano sem ler de novo: cooldown de desafio, prazo do bônus ou espera por derrota.
    function gymNextEventAt(st) {
        st = st || gymState;
        const after = gymFetchedAt;   // prazo já vencido mas posterior à última leitura ainda pede releitura
        const ts = [];
        for (const g of st?.gyms || []) {
            if (!g.enabled) continue;
            if (g.cooldownUntil > after) ts.push(g.cooldownUntil);
            if (g.bonus && g.bonus.until > after) ts.push(g.bonus.until);
            const l = gymLoss[g.id];
            if (l) { const fim = l.at + Math.min(GYM_LOSS_WAIT_MAX_MS, GYM_LOSS_WAIT_MS * Math.pow(2, Math.max(0, l.n - 1))); if (fim > after) ts.push(fim); }
        }
        return ts.length ? Math.min(...ts) : 0;
    }
    function gymDue() {
        if (!gymState) return true;
        const now = Date.now();
        if (now - gymFetchedAt >= GYM_POLL_MS) return true;
        const ev = gymNextEventAt();
        return ev > 0 && ev <= now && gymFetchedAt < ev;
    }
    // v3.45.4: a conta já está na cidade (parada, "Esperar na cidade" pelo botão, viagem que acabou de chegar)? Então o desafio
    // não precisa de viagem nenhuma: faz na hora. Relato do usuário em 21/10/2026: "não está mais iniciando o ginásio, travado em
    // '→ viagem'; o personagem já está parado na cidade" — a viagem esperava algum bloqueio (troca de hunt, intervalo mínimo…)
    // enquanto a conta já estava onde precisava.
    function gymInCity() { return !(typeof tripInHunt === 'function' && tripInHunt()) && !(typeof tripRunning !== 'undefined' && tripRunning); }
    function gymPlanText(p) { return p.desafiar.map(g => `desafiar ${gymCityName(g)}${g.owned ? ' (bônus de novo)' : ' (insígnia)'}`).concat(p.resgatar.map(g => `bônus de ${gymCityName(g)}`)).join(', '); }
    // Com algo no plano: na cidade faz agora; na hunt pede a viagem (idempotente: `tripRequest` guarda por chave).
    function gymAsk() {
        if (!gymEnabled() || gymWorking) return;
        if (gymFailedAt && Date.now() - gymFailedAt < GYM_RETRY_MS) return;
        const p = gymPlan();
        if (!p.desafiar.length && !p.resgatar.length) return;
        if (gymInCity()) {
            if (typeof tripNeeds !== 'undefined' && tripNeeds.delete) tripNeeds.delete('ginasio');   // a viagem não precisa mais levar
            logEvent('ginasio-cidade', { motivo: 'já na cidade', plano: gymPlanText(p) });
            return gymCityWork();
        }
        tripRequest('ginasio', null, gymPlanText(p));
    }
    function gymTick(force) {
        if (!gymEnabled() || gymBusy || gymWorking) return;
        if (!force && gymFailedAt && Date.now() - gymFailedAt < GYM_RETRY_MS) return;
        if (!force && !gymDue()) return gymAsk();
        return gymRead().then(() => gymAsk());
    }
    // Botão "Desafiar agora" do painel: na cidade roda já; na hunt pede a viagem. Devolve um texto para o rodapé.
    async function gymNow() {
        if (!gymEnabled()) return { ok: false, msg: 'Ligue os ginásios e salve antes.' };
        if (gymWorking) return { ok: false, msg: 'Já está desafiando; espere terminar.' };
        gymFailedAt = 0;
        await gymRead();
        const p = gymPlan();
        if (!p.desafiar.length && !p.resgatar.length) return { ok: false, msg: `Nenhum ginásio pronto agora: ${gymStatus()}` };
        if (!gymInCity()) { tripRequest('ginasio', null, gymPlanText(p)); return { ok: true, msg: `Viagem à cidade pedida: ${gymPlanText(p)}` }; }
        const r = await gymCityWork();
        return { ok: r.ok, msg: r.ok ? `Ginásios: ${r.vitorias ?? 0} vitórias, ${r.derrotas ?? 0} derrotas, ${r.bonus ?? 0} bônus` : `Ginásios: ${r.motivo || 'falhou'}` };
    }
    async function gymRead() {
        gymBusy = true;
        try {
            const raw = await gameApi(GYM_URL);
            if (!gymFieldsLogged && raw && typeof raw === 'object') {
                gymFieldsLogged = true;
                const d0 = Array.isArray(raw.details) ? raw.details.find(x => x && typeof x === 'object') : null;
                logEvent('ginasio-campos', { raiz: Object.keys(raw), detalhe: d0 ? Object.keys(d0) : null, bonus: d0?.bonus && typeof d0.bonus === 'object' ? Object.keys(d0.bonus) : null, perk: raw.badgePerk ?? null, regioes: raw.regions ?? null });
            }
            gymState = parseGymState(raw);
            gymFailedAt = 0;
            const now = Date.now();
            const sig = JSON.stringify(gymState.gyms.map(g => [g.enabled, g.owned, g.cooldownUntil > now, g.bonus?.state]).concat([gymState.badges]));
            if (sig !== gymSig) {
                gymSig = sig;
                logEvent('ginasio', {
                    insignias: `${gymState.badges}/${gymState.total}`, perk: gymState.perk,
                    faltam: gymState.gyms.filter(g => g.enabled && !g.owned).map(g => g.id), fechados: gymState.gyms.filter(g => !g.enabled).map(g => g.id),
                    cooldown: gymState.gyms.filter(g => g.cooldownUntil > now).map(g => `${g.id} ${gymFmtLeft(g.cooldownUntil - now)}`),
                    bonus: Object.fromEntries(gymState.gyms.filter(g => g.bonus).map(g => [g.id, `${g.bonus.state} ${g.bonus.qty}x ${g.bonus.name}${g.bonus.until > now ? ` em ${gymFmtLeft(g.bonus.until - now)}` : ''}`])),
                });
            }
        } catch (err) {
            gymFailedAt = Date.now();
            logEvent('ginasio-erro', { etapa: 'leitura', erro: String(err?.message || err) });
        } finally {
            gymFetchedAt = Date.now();
            gymBusy = false;
            gymNotify();
        }
        return gymState;
    }

    async function gymClaimBonus(g) {
        const r = await gameApi(`${GYM_URL}/bonus`, { method: 'POST', body: JSON.stringify({ gymId: g.id }) });
        const b = { id: g.id, city: g.city, name: String(r?.name || g.bonus?.name || '?'), qty: Number(r?.qty) || g.bonus?.qty || 0 };
        logEvent('ginasio-bonus', { id: g.id, item: `${b.qty}x ${b.name}`, proximoEm: r?.nextAvailableAt ? new Date(Number(r.nextAvailableAt)).toISOString() : null, campos: r && typeof r === 'object' ? Object.keys(r) : null });
        return b;
    }
    // Tarefa da viagem (na cidade): relê a janela, desafia cada ginásio do plano (modo Insígnia, time atual) resgatando o bônus
    // LOGO DEPOIS de cada vitória (v3.45.3: no outro PC a página foi recarregada no meio da viagem, depois de 12 vitórias, e a
    // passada final de resgates nunca rodou — os 12 bônus ficaram para a viagem seguinte), relê e resgata os `claimable` que
    // sobraram (vitórias anteriores, resgate que falhou na hora) e avisa.
    async function gymCityWork() {
        if (!gymEnabled()) return { ok: true, motivo: 'desligado' };
        gymWorking = true;
        const desafios = [], bonus = [], falhas = [];
        const resgatados = new Set();
        try {
            await gymRead();
            if (!gymState) return { ok: false, motivo: 'não consegui ler os ginásios' };
            let plan = gymPlan();
            if (!plan.desafiar.length && !plan.resgatar.length) return { ok: true, motivo: 'nenhum ginásio pronto (cooldown, derrota recente ou nada a fazer)' };
            for (const g of plan.desafiar) {
                try {
                    const r = await gameApi(`${GYM_URL}/challenge`, { method: 'POST', body: JSON.stringify({ gymId: g.id, mode: 'badge' }) });
                    const won = r?.won === true;
                    const eu = r?.snapshot?.you === 'b' ? 'b' : 'a';
                    const meuTime = r?.snapshot?.sides?.[eu]?.team;
                    const npc = r?.snapshot?.sides?.[eu === 'a' ? 'b' : 'a']?.team;
                    const feito = { id: g.id, city: g.city, badge: g.badge, won, badgeEarned: Boolean(r?.badgeEarned), outfit: Boolean(r?.championOutfit), defender: String(r?.defenderName || g.leader || '?'), npc: Array.isArray(npc) && npc.length ? npc : g.npcTeam };
                    desafios.push(feito);
                    if (won) delete gymLoss[g.id];
                    else gymLoss[g.id] = { at: Date.now(), n: (gymLoss[g.id]?.n || 0) + 1 };
                    logEvent('ginasio-desafio', { id: g.id, venceu: won, insignia: feito.badgeEarned, outfit: feito.outfit, lider: feito.defender, fim: r?.snapshot?.endReason ?? null, lances: Array.isArray(r?.log) ? r.log.length : null, insignias: r?.badges ?? null, meuTime: gymTeamText(meuTime), timeDoLider: gymTeamText(feito.npc), derrotasSeguidas: gymLoss[g.id]?.n || 0, campos: r && typeof r === 'object' ? Object.keys(r) : null });
                    if (won && cfg.gymBonus !== false) {   // v3.45.3: bônus na hora (a vitória o deixa `claimable`); falhou = fica para a passada final
                        await gymWait(gymRnd(GYM_BETWEEN_MS));
                        try { bonus.push(await gymClaimBonus(g)); resgatados.add(g.id); }
                        catch (err) { logEvent('ginasio-bonus-espera', { id: g.id, erro: String(err?.message || err) }); }
                    }
                } catch (err) {
                    falhas.push({ id: g.id, city: g.city, motivo: `desafio: ${err?.message || err}` });
                    logEvent('ginasio-erro', { etapa: 'desafio', id: g.id, erro: String(err?.message || err) });
                }
                await gymWait(gymRnd(GYM_BETWEEN_MS));
            }
            if (plan.desafiar.length) {   // as vitórias liberam o bônus (`bonus.state` 'locked'/'needWin' -> 'claimable')
                await gymRead();
                const vencidos = desafios.filter(x => x.won && !resgatados.has(x.id)).map(x => x.id);   // bônus já resgatado na hora não conta
                const semBonus = () => vencidos.filter(id => { const g = gymState?.gyms.find(x => x.id === id); return !(g?.bonus && g.bonus.state === 'claimable'); });
                if (semBonus().length) { await gymWait(GYM_BONUS_RETRY_MS); await gymRead(); }   // v3.45.2: o servidor pode demorar a virar o estado
                for (const id of vencidos) { const g = gymState?.gyms.find(x => x.id === id); logEvent('ginasio-bonus-estado', { id, estado: g?.bonus?.state ?? null, item: g?.bonus ? `${g.bonus.qty}x ${g.bonus.name}` : null, resgate: cfg.gymBonus !== false }); }
                plan = gymPlan();
            }
            for (const g of plan.resgatar.filter(x => !resgatados.has(x.id))) {
                try {
                    bonus.push(await gymClaimBonus(g));
                } catch (err) {
                    falhas.push({ id: g.id, city: g.city, motivo: `bônus: ${err?.message || err}` });
                    logEvent('ginasio-erro', { etapa: 'bonus', id: g.id, erro: String(err?.message || err) });
                }
                await gymWait(gymRnd(GYM_BETWEEN_MS));
            }
            gymLast = { at: Date.now(), desafios, bonus, falhas };
            await gymRead();                              // estado final (cooldowns, prazos dos bônus)
            if (falhas.length) gymFailedAt = Date.now();  // depois da releitura (ela zera o carimbo quando lê bem)
            if (desafios.length || bonus.length || falhas.length) gymNotifyDiscord(desafios, bonus, falhas);
            const vit = desafios.filter(x => x.won).length, der = desafios.length - vit;
            return { ok: falhas.length === 0, motivo: falhas.length ? falhas.map(f => `${gymCityName(f)} ${f.motivo}`).join('; ') : null, vitorias: vit, derrotas: der, bonus: bonus.length, falhas: falhas.length };
        } finally {
            gymWorking = false;
            gymNotify();
        }
    }

    function gymNotifyDiscord(desafios, bonus, falhas) {
        if (cfg.gymAlerts === false) return;
        const who = playerName();
        const mention = cfg.mentionUserId ? `<@${cfg.mentionUserId}> ` : '';
        const vit = desafios.filter(x => x.won), der = desafios.filter(x => !x.won);
        const st = gymState;
        const linhas = desafios.map(x => (x.won
            ? `✔ ${gymCityName(x)} (${x.defender}): ${x.badgeEarned ? `insígnia **${x.badge}** conquistada` : 'vitória'}${x.outfit ? ' · 🏆 18 insígnias: Gym Champion Outfit!' : ''}`
            : `✖ ${gymCityName(x)} (${x.defender}): derrota — time do líder: ${gymTeamText(x.npc) || '?'} · tenta de novo em ${gymFmtLeft(gymLossWait(x.id))}`))
            .concat(bonus.map(b => `🎁 ${gymCityName(b)}: ${b.qty}x ${b.name}`))
            .concat(falhas.map(f => `⚠ ${gymCityName(f)}: ${f.motivo}`));
        const n = (k, um, varios) => (k ? `${k} ${k === 1 ? um : varios}` : '');
        const resumo = [n(vit.length, 'vitória', 'vitórias'), n(der.length, 'derrota', 'derrotas'), n(bonus.length, 'bônus', 'bônus'), n(falhas.length, 'falha', 'falhas')].filter(Boolean).join(', ');
        postWebhook('alert', {
            content: `${mention}🏟️ ${who ? `**${who}**` : 'Sua conta'} nos ginásios: ${resumo || 'nada feito'}${st ? ` · ${st.badges}/${st.total} insígnias` : ''}`,
            username: 'Poke Idle World',
            embeds: [{
                title: der.length || falhas.length ? 'Ginásios (parcial)' : 'Ginásios',
                description: (who ? `Conta: ${who}\n` : '') + linhas.join('\n') + (st?.perk ? `\nBônus das insígnias: +${st.perk.xpPct}% XP, +${st.perk.dropPct}% drop (${st.perk.active}/${st.perk.max})` : '') + `\nEm ${new Date().toLocaleString('pt-BR')}`,
                color: falhas.length && !vit.length && !bonus.length ? 0xed4245 : (der.length || falhas.length ? 0xfee75c : 0x57f287),
            }],
        }, { evento: 'ginasio', vitorias: vit.map(x => x.id), derrotas: der.map(x => x.id), bonus: bonus.map(b => b.id), falhas: falhas.length });
    }

    // Linha do painel.
    function gymStatus(d) {
        d = d || cfg;
        if (!gymState) return gymFetchedAt ? 'não consegui ler os ginásios (veja o log)' : (d.gymEnabled ? 'ainda não lidos' : 'liga para ler os ginásios');
        const now = Date.now();
        const st = gymState;
        const p = gymPlan(d);
        const partes = [`${st.badges}/${st.total} insígnias${st.perk ? ` (+${st.perk.xpPct}% XP, +${st.perk.dropPct}% drop)` : ''}`];
        const faltam = st.gyms.filter(g => g.enabled && !g.owned);
        if (faltam.length) partes.push(`faltam: ${faltam.map(gymCityName).join(', ')}`);
        const fechados = st.gyms.filter(g => !g.enabled).length;
        if (fechados) partes.push(`${fechados} ainda não ${fechados === 1 ? 'abriu' : 'abriram'}`);
        if (gymWorking) partes.push('na cidade, desafiando…');
        else {
            const onde = gymInCity() ? 'agora (já na cidade)' : 'viagem';
            if (p.desafiar.length) partes.push(`prontos para desafiar: ${p.desafiar.map(gymCityName).join(', ')} → ${onde}`);
            if (p.resgatar.length) partes.push(`bônus para resgatar: ${p.resgatar.map(g => `${gymCityName(g)} (${g.bonus.qty}x ${g.bonus.name})`).join(', ')} → ${onde}`);
            else if (d.gymBonus === false) { const c = st.gyms.filter(g => g.enabled && g.bonus && g.bonus.state === 'claimable').length; if (c) partes.push(`${c} bônus liberados (resgate desligado)`); }
            const esp = p.esperando.slice().sort((a, b) => a.ms - b.ms);
            if (esp.length) partes.push(`esperando: ${esp.slice(0, 3).map(e => `${gymCityName(e.g)} ${e.motivo === 'derrota' ? 'após derrota' : 'cooldown'} ${gymFmtLeft(e.ms)}`).join(', ')}${esp.length > 3 ? ` (+${esp.length - 3})` : ''}`);
            const prox = st.gyms.filter(g => g.enabled && g.bonus && g.bonus.state === 'cooldown' && g.bonus.until > now).map(g => g.bonus.until);
            if (prox.length && !p.desafiar.length && !p.resgatar.length && !esp.length) partes.push(`próximo bônus em ${gymFmtLeft(Math.min(...prox) - now)}${d.gymRedo === false ? ' (refazer desligado)' : ''}`);
        }
        if (gymFailedAt && now - gymFailedAt < GYM_RETRY_MS) partes.push(`erro há ${gymFmtLeft(now - gymFailedAt)}, tenta em ${gymFmtLeft(GYM_RETRY_MS - (now - gymFailedAt))} (veja o log)`);
        if (gymLast) {
            const v = gymLast.desafios.filter(x => x.won).length, dd = gymLast.desafios.length - v;
            partes.push(`última ida ${gymHora(gymLast.at)}: ${[v ? `${v} ${v === 1 ? 'vitória' : 'vitórias'}` : '', dd ? `${dd} ${dd === 1 ? 'derrota' : 'derrotas'}` : '', gymLast.bonus.length ? `${gymLast.bonus.length} bônus` : '', gymLast.falhas.length ? `${gymLast.falhas.length} ${gymLast.falhas.length === 1 ? 'falha' : 'falhas'}` : ''].filter(Boolean).join(', ') || 'nada'}`);
        }
        return partes.join(' · ');
    }
    function gymOnGlobal(message) { logEvent('ginasio-global', { campos: Object.keys(message), dados: message }); }

    // ---- Auto Boss (v3.43.0): retomar o Auto Boss do próprio jogo quando ele para sem terminar ----
    // O jogo tem (Bosses → ⟳ Auto Boss) um modo que renova a luta contra um boss sozinho, gastando 1 token por luta (ex.: Bronze Boss
    // Token, item 70000, do Giant Cruel e do Ancient Aero) até acabar a fila pedida ou os tokens. Levantado no bundle em 19/10/2026
    // (chunk do jogo: `auto-boss-get`, `auto-boss-start`, `auto-boss-stop`, handler `auto-boss`; i18n `window.bosses.auto.*`);
    // formatos ainda NÃO vistos no log (o 1º frame entra como `auto-boss-campos`). Detalhes em docs/mensagens-do-jogo.md → "Auto Boss".
    //   - Tela → servidor: `auto-boss-get` (ao abrir o socket), `auto-boss-start { bossKey, count }` (bossKey do `/game/bossCatalog.json`,
    //     ex. `cruel` = Giant Cruel, `aerodactyl2` = Ancient Aero; count = lutas/tokens) e `auto-boss-stop` (para depois da luta atual).
    //   - Servidor → tela: `auto-boss { active, phase ('starting'|'fighting'|'cooldown'), bossKey, bossName, started, total, wins,
    //     losses, loot[{ itemId, name, qty }], last{ outcome, durationMs, loot }, fee{ itemId, name, qty }, spent, elapsedMs, fightMs,
    //     inMs, stopping, reason }`. `reason` só com `active:false`: `done` (acabou a fila), `lost` (o time caiu: o token da luta é
    //     perdido e o Auto Boss PARA), `no-token` (tokens acabaram), `stopped` (o jogador parou), `error` ("a próxima luta não pôde
    //     começar: time, líder desmaiado ou arena"), `left` (saiu da arena: QUALQUER `leave-hunt`/`enter-hunt` encerra) e `hunting`
    //     (recusou o start porque a conta está em hunt: "só funciona fora de hunt — ative estando numa cidade").
    //   - Na arena a conta fica na hunt do mapa do boss (`cruel_boss`, `aero_boss`: slug terminado em `_boss`): `field`/`field-kill`
    //     chegam como numa hunt comum (visto na conta1 em 20/10/2026 01:00Z: `hunt { slug: cruel_boss }`; a sessão sumiu depois de
    //     uma queda do socket, código 1006, às 01:03Z).
    // O que o script faz (pedido do usuário em 19/10/2026: "tem uma opção auto boss, porém às vezes para e não continua; retomar o boss
    // caso ele pare"): guarda a INTENÇÃO quando a tela manda `auto-boss-start` (boss + quantidade; `localStorage.pgDiscordNotifyBoss`,
    // sobrevive à recarga) e, quando o frame `auto-boss` diz que parou SEM terminar (`error`, `left`, `hunting` ou sem motivo depois de
    // uma sessão que esteve ativa, ex. reconexão), sai da hunt se estiver numa, cura na Joy, confere os tokens na mochila (`inv-get`) e
    // manda `auto-boss-start` de novo só com as lutas que faltam (total − vitórias − derrotas, limitado aos tokens). `done`,
    // `no-token` e `stopped` encerram a intenção; `lost` só retoma com `bossResumeOnLoss` (senão encerra e, com a cura na Joy ligada,
    // passa a bola para ela). Recusa logo depois do start feito na mão (sessão nunca ativa) não é retomada: o jogo já avisou o jogador.
    // Enquanto o Auto Boss roda ou a retomada está pendente (`bossBusy()`), viagem à cidade, parada na cidade, recarga, rotas
    // (captura/guild/farm/clã/daily sozinha), troca de líder e cura esperam — qualquer `leave-hunt` do script mataria a sessão
    // ("Auto Boss encerrado — você saiu da arena"). Até 4 tentativas por parada (10/20/40/60 s) e 10 retomadas por sessão; depois desiste
    // e avisa. v3.43.1 (visto na conta1 em 20/10/2026 02:02–02:10Z): o servidor ACEITA o start mas só começa a luta com o personagem
    // dentro da arena — no start feito na mão é a TELA que viaja para o mapa da arena (`nS` → `nb(arena.map)` no bundle) e o
    // componente da hunt manda `enter-hunt { slug:'cruel_boss' }`; o start do script não fazia a tela viajar, a conta ficava na cidade,
    // 30 s em `starting` e `error`, 10 retomadas seguidas. Agora, aceito o start, o script faz a tela viajar (`hunt-resume` sintético,
    // o mesmo de `switchHunt`) e, sem a hunt da arena em 4 s, manda o `enter-hunt` ele mesmo (`bossEnterArena`, log `auto-boss-arena`);
    // 3 retomadas seguidas sem a luta começar (`fought`/`noFight`) desistem cedo; o item do token fica fora do guardar na cidade e da
    // venda enquanto há boss pendente (`bossKeepsItem`: a viagem das 02:11Z depositou os 97 tokens na família). Avisos (retomada, desistência, fim) no canal de Alertas com `bossAlerts`. Nunca gasta Poke Slot Cards/diamantes: só
    // repete o que o jogador pediu. Teste: `node test/boss.test.js` (`loadBossModule`).
    const BOSS_KEY = 'pgDiscordNotifyBoss';
    const BOSS_INTENT_MAX_AGE_MS = 12 * 60 * 60 * 1000;
    const BOSS_AFTER_SOCKET_MS = 6000;
    const BOSS_RESUME_DELAY_MS = 8000;        // depois do frame que parou: a tela ainda está voltando do mapa da arena
    const BOSS_RETRY_MS = [10000, 20000, 40000, 60000];
    const BOSS_ARENA_WAIT_MS = 4000;          // start aceito: a tela viaja para a arena; sem a hunt da arena até lá, o script manda o enter-hunt
    const BOSS_MAX_NO_FIGHT = 3;              // retomadas seguidas em que a luta nem começou (time/líder/arena): desiste antes das 10
    const BOSS_ARENAS = { cruel: 'cruel_boss', aerodactyl2: 'aero_boss' };   // tabela `og` do bundle (arena.map); a hunt vista na sessão ganha
    const BOSS_FEE_ITEMS = [70000];           // Bronze Boss Token: entrada das duas arenas
    const BOSS_KEEP_AFTER_MS = 2 * 60 * 60 * 1000;   // depois de desistir, o token ainda fica fora do guardar por 2 h (o jogador reinicia na mão)
    const BOSS_LEAVE_WAIT_MS = 1500;
    const BOSS_HEAL_WAIT_MS = 2500;
    const BOSS_INV_WAIT_MS = 4000;
    const BOSS_START_WAIT_MS = 8000;          // a tela também espera 8 s pela resposta do start
    const BOSS_STALE_MS = 10 * 60 * 1000;     // sessão ativa sem frame há 10 min: pergunta ao servidor
    const BOSS_TICK_MS = 60 * 1000;
    const BOSS_MAX_TRIES = 4;
    const BOSS_MAX_RESUMES = 10;
    const BOSS_END_REASONS = ['done', 'no-token', 'stopped'];
    const BOSS_REASON_LABEL = { done: 'concluído', lost: 'derrota', 'no-token': 'sem tokens', stopped: 'parado por você', error: 'erro do jogo (time, líder desmaiado ou arena)', left: 'saiu da arena', hunting: 'recusado: a conta está em hunt' };

    let bossState = null;       // último frame `auto-boss` (normalizado, com `at`)
    let bossLastActive = null;  // último frame com `active:true` (contagem de referência quando o frame final vem sem números)
    let bossWanted = null;      // intenção: { bossKey, bossName, total, at, origem, resumes, sawActive, stopping, prog{ total, wins, losses } }
    let bossRun = null;         // retomada em andamento: { since, motivo, tries, fase, waitStart, waitInv }
    let bossRetryTimer = null;  // retomada agendada
    let bossInv = new Map();    // mochila (frame `inventory`): itemId -> quantidade
    let bossInvAt = 0;
    let bossFieldsLogged = false;
    let bossLast = null;        // último encerramento: { reason, at, boss, wins, losses, started, total, spent, loot }
    let onBossChange = null;    // painel (aba Treino)

    function bossIsArena(slug) { const h = normalize(slug || ''); return Boolean(h) && /_boss$/.test(h); }
    function bossOn(d) { return (d || cfg).bossResumeEnabled !== false; }
    function bossActive() { return Boolean(bossState?.active); }
    function bossBusy() { return bossActive() || Boolean(bossRun) || Boolean(bossRetryTimer); }
    function bossBusyReason() {
        if (bossActive()) return `Auto Boss do jogo em andamento (${bossState.bossName || bossState.bossKey || 'boss'}, luta ${Math.max(1, bossState.started)}/${bossState.total})`;
        if (bossRun) return `retomada do Auto Boss em andamento (${bossRun.fase})`;
        if (bossRetryTimer) return 'retomada do Auto Boss agendada';
        return null;
    }
    function bossNotify() { if (onBossChange) { try { onBossChange(); } catch { /* painel fechado */ } } }
    function bossWait(ms) { return new Promise(r => setTimeout(r, ms)); }
    function bossFmt(ms) {
        const s = Math.max(0, Math.round(ms / 1000));
        if (s < 60) return `${s} s`;
        const m = Math.floor(s / 60);
        return m < 60 ? `${m} min ${String(s % 60).padStart(2, '0')} s` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
    }
    function bossSave() {
        try { if (bossWanted) localStorage.setItem(BOSS_KEY, JSON.stringify(bossWanted)); else localStorage.removeItem(BOSS_KEY); }
        catch { /* sem espaço: a intenção vale só nesta carga */ }
    }
    // Carga nova: a intenção da carga anterior (Auto Boss pedido e ainda não encerrado) volta; o frame do `auto-boss-get` decide.
    function bossLoad() {
        let rec = null;
        try { rec = JSON.parse(localStorage.getItem(BOSS_KEY) || 'null'); } catch { rec = null; }
        if (!rec || typeof rec !== 'object' || !rec.bossKey) return;
        const idade = Date.now() - (Number(rec.at) || 0);
        if (idade < 0 || idade > BOSS_INTENT_MAX_AGE_MS) { try { localStorage.removeItem(BOSS_KEY); } catch { /* nada */ } return; }
        bossWanted = {
            bossKey: String(rec.bossKey), bossName: rec.bossName ? String(rec.bossName) : null, total: Math.max(0, Number(rec.total) || 0),
            at: Number(rec.at) || Date.now(), origem: 'lembrado', resumes: Math.max(0, Number(rec.resumes) || 0), sawActive: Boolean(rec.sawActive),
            stopping: Boolean(rec.stopping), prog: rec.prog && typeof rec.prog === 'object' ? { total: Number(rec.prog.total) || 0, wins: Number(rec.prog.wins) || 0, losses: Number(rec.prog.losses) || 0 } : null,
            arena: rec.arena ? String(rec.arena) : null, fought: false, noFight: Math.max(0, Number(rec.noFight) || 0),
        };
        logEvent('auto-boss-lembrado', { bossKey: bossWanted.bossKey, boss: bossWanted.bossName, lutas: bossWanted.total, progresso: bossWanted.prog, idadeMin: Math.round(idade / 60000), retomadas: bossWanted.resumes });
        bossNotify();
    }
    function bossNorm(m) {
        const n = (v) => Math.max(0, Number(v) || 0);
        return {
            active: m.active === true, reason: m.reason ? String(m.reason) : null, phase: m.phase ? String(m.phase) : null,
            bossKey: m.bossKey ? String(m.bossKey) : null, bossName: m.bossName ? String(m.bossName) : null,
            started: n(m.started), total: n(m.total), wins: n(m.wins), losses: n(m.losses), spent: m.spent != null ? n(m.spent) : null,
            fee: m.fee && typeof m.fee === 'object' ? { itemId: Number(m.fee.itemId) || 0, name: m.fee.name ? String(m.fee.name) : 'token', qty: Math.max(1, Number(m.fee.qty) || 1) } : null,
            loot: Array.isArray(m.loot) ? m.loot.map(l => ({ itemId: Number(l?.itemId) || 0, name: l?.name ? String(l.name) : `item ${l?.itemId}`, qty: n(l?.qty) })) : [],
            last: m.last && typeof m.last === 'object' ? { outcome: m.last.outcome ?? null, durationMs: n(m.last.durationMs) } : null,
            elapsedMs: n(m.elapsedMs), fightMs: n(m.fightMs), inMs: n(m.inMs), stopping: Boolean(m.stopping), at: Date.now(),
        };
    }
    // Lutas que faltam da sessão: total − vitórias − derrotas (a luta interrompida sem resultado conta de novo; o teto são os tokens).
    function bossRemaining(ref) { return ref ? Math.max(0, ref.total - ref.wins - ref.losses) : 0; }
    function bossRef(s) {
        if (s && s.total > 0) return s;
        if (bossLastActive && bossLastActive.total > 0) return bossLastActive;
        if (bossWanted?.prog?.total > 0) return { bossKey: bossWanted.bossKey, bossName: bossWanted.bossName, total: bossWanted.prog.total, wins: bossWanted.prog.wins, losses: bossWanted.prog.losses, started: bossWanted.prog.wins + bossWanted.prog.losses, spent: null, loot: [] };
        if (bossWanted?.total > 0) return { bossKey: bossWanted.bossKey, bossName: bossWanted.bossName, total: bossWanted.total, wins: 0, losses: 0, started: 0, spent: null, loot: [] };
        return s;
    }
    function bossFee() { return bossState?.fee || bossLastActive?.fee || null; }

    // Frame `inventory` (resposta ao `inv-get`): quantidade de tokens na mochila.
    function bossOnInventory(items) {
        bossInv = new Map();
        for (const it of items) {
            const id = Number(it?.itemId ?? it?.id);
            if (id > 0) bossInv.set(id, (bossInv.get(id) || 0) + Math.max(0, Number(it.quantity) || 0));
        }
        bossInvAt = Date.now();
        if (bossRun?.waitInv) { const r = bossRun.waitInv; bossRun.waitInv = null; r(true); }
    }
    // O que a tela manda: start = intenção nova (boss + quantidade); stop = o jogador quer parar (o frame `stopped` encerra).
    function bossOnOutgoing(m) {
        if (m.type === 'auto-boss-start') {
            if (bossRun) return;                                   // é o nosso start (retomada): a intenção já está certa
            const count = Math.max(0, Number(m.count) || 0);
            bossWanted = { bossKey: String(m.bossKey || ''), bossName: bossWanted?.bossKey === String(m.bossKey || '') ? bossWanted.bossName : null, total: count, at: Date.now(), origem: 'tela', resumes: 0, sawActive: false, stopping: false, prog: null, arena: bossWanted?.bossKey === String(m.bossKey || '') ? bossWanted.arena : null, fought: false, noFight: 0 };
            bossSave();
            clearTimeout(bossRetryTimer); bossRetryTimer = null;   // o jogador reiniciou na mão
            logEvent('auto-boss-envio', { acao: 'start', bossKey: bossWanted.bossKey, lutas: count, hunt: huntSlug || null });
        } else if (m.type === 'auto-boss-stop') {
            logEvent('auto-boss-envio', { acao: 'stop', bossKey: bossWanted?.bossKey || null });
            if (bossWanted) { bossWanted.stopping = true; bossSave(); }
            clearTimeout(bossRetryTimer); bossRetryTimer = null;
        } else return;
        bossNotify();
    }
    // Socket novo (carga ou reconexão): com intenção aberta, pergunta ao servidor (a tela também manda `auto-boss-get` ao ficar online).
    function bossOnSocket() {
        if (!bossWanted || bossRun) return;
        logEvent('auto-boss-get', { motivo: 'socket', bossKey: bossWanted.bossKey, enviado: sendGame({ type: 'auto-boss-get' }) });
    }
    // Tique (1 min): sessão ativa sem nenhum frame há 10 min = pergunta de novo (a resposta diz se ainda roda).
    function bossTick() {
        if (!bossWanted || !bossActive() || bossRun) return;
        if (Date.now() - bossState.at < BOSS_STALE_MS) return;
        bossState.at = Date.now();
        logEvent('auto-boss-get', { motivo: 'sem frame há 10 min', bossKey: bossWanted.bossKey, enviado: sendGame({ type: 'auto-boss-get' }) });
    }

    function bossOnFrame(m) {
        const s = bossNorm(m);
        const antes = bossState;
        if (!bossFieldsLogged) {
            bossFieldsLogged = true;
            logEvent('auto-boss-campos', { chaves: Object.keys(m).filter(k => k !== 'type'), fee: m.fee && typeof m.fee === 'object' ? Object.keys(m.fee) : null, last: m.last && typeof m.last === 'object' ? Object.keys(m.last) : null, loot: Array.isArray(m.loot) && m.loot[0] ? Object.keys(m.loot[0]) : null });
        }
        bossState = s;
        if (s.active) bossLastActive = s;
        const mudou = !antes || antes.active !== s.active || antes.reason !== s.reason || antes.started !== s.started || antes.phase !== s.phase || antes.wins !== s.wins || antes.losses !== s.losses;
        if (mudou) logEvent('auto-boss', { ativo: s.active, motivo: s.reason, fase: s.phase, boss: s.bossName || s.bossKey, luta: `${s.started}/${s.total}`, vitorias: s.wins, derrotas: s.losses, tokens: s.spent, fee: s.fee ? `${s.fee.qty}x ${s.fee.name}` : null, ultima: s.last?.outcome ?? null, hunt: huntSlug || null });
        if (s.active) {
            if (!bossWanted || (s.bossKey && bossWanted.bossKey !== s.bossKey)) {   // sessão que o script não viu começar (carga no meio dela)
                bossWanted = { bossKey: s.bossKey || bossWanted?.bossKey || '', bossName: s.bossName, total: s.total, at: Date.now(), origem: 'frame', resumes: 0, sawActive: true, stopping: false, prog: null, arena: null, fought: false, noFight: 0 };
                logEvent('auto-boss-intencao', { origem: 'frame', bossKey: bossWanted.bossKey, lutas: s.total });
            }
            bossWanted.sawActive = true;
            if (s.bossName) bossWanted.bossName = s.bossName;
            if (s.stopping) bossWanted.stopping = true;
            if (bossIsArena(huntSlug)) bossWanted.arena = normalize(huntSlug);                          // mapa da arena desta sessão
            if (s.phase === 'fighting' || s.phase === 'cooldown') { bossWanted.fought = true; bossWanted.noFight = 0; }   // a luta começou de verdade
            bossWanted.prog = { total: s.total, wins: s.wins, losses: s.losses };
            bossSave();
            if (bossRun?.waitStart) { const r = bossRun.waitStart; bossRun.waitStart = null; r(s); }
            bossNotify();
            return;
        }
        // Parou (ou "nada rodando", resposta ao auto-boss-get).
        if (bossRun?.waitStart) { const r = bossRun.waitStart; bossRun.waitStart = null; r(s); bossNotify(); return; }   // resposta ao nosso start: a retomada decide
        if (!bossWanted) { bossNotify(); return; }                                                                      // nada pedido (ou já encerrado): só registra
        if (bossRun || bossRetryTimer) { bossNotify(); return; }                                                        // retomada já cuidando
        const reason = s.reason;
        const ref = bossRef(s);
        const restantes = bossRemaining(ref);
        if (!bossWanted.sawActive) {                                                                                    // start feito na mão e recusado na hora: o jogo avisou o jogador
            if (reason) { logEvent('auto-boss-recusado', { motivo: reason, bossKey: bossWanted.bossKey }); bossWanted = null; bossSave(); bossNotify(); }
            return;                                                                                                     // sem motivo = só o "nada rodando" do get antes do start pegar
        }
        if (bossWanted.stopping) { bossFinish('stopped', s, ref); return; }                                              // o jogador pediu para parar: fim, seja qual for o motivo
        if (BOSS_END_REASONS.includes(reason)) { bossFinish(reason, s, ref); return; }
        if (reason === 'lost' && !cfg.bossResumeOnLoss) { bossFinish('lost', s, ref); return; }
        if (!bossOn()) { logEvent('auto-boss-parado', { motivo: reason || 'sem motivo', restantes, retomada: 'desligada no painel' }); bossWanted = null; bossSave(); bossNotify(); return; }
        if (restantes <= 0) { bossFinish(reason || 'done', s, ref); return; }
        if (bossWanted.resumes > 0 && !bossWanted.fought) {                                                              // retomada aceita, mas a luta nem começou
            bossWanted.noFight = (bossWanted.noFight || 0) + 1; bossSave();
            if (bossWanted.noFight >= BOSS_MAX_NO_FIGHT) { bossGiveUp(`${BOSS_MAX_NO_FIGHT} retomadas seguidas sem a luta começar (time abaixo do nível do boss, líder desmaiado ou arena)`, reason || 'sem motivo'); return; }
        }
        bossScheduleResume(reason || 'parou sem motivo (reconexão?)', restantes, reason === 'lost');
    }

    function bossFinish(reason, s, ref) {
        const w = bossWanted; bossWanted = null; bossSave();
        ref = ref || s;
        bossLast = { reason, at: Date.now(), boss: ref.bossName || w?.bossName || ref.bossKey || w?.bossKey || 'boss', wins: ref.wins, losses: ref.losses, started: ref.started, total: ref.total, spent: ref.spent, loot: ref.loot || [], fee: s?.fee || bossFee(), resumes: w?.resumes || 0 };
        logEvent('auto-boss-fim', { motivo: reason, boss: bossLast.boss, lutas: `${ref.started}/${ref.total}`, vitorias: ref.wins, derrotas: ref.losses, tokens: ref.spent, loot: bossLast.loot.map(l => `${l.qty}x ${l.name}`), retomadas: bossLast.resumes });
        if (reason === 'lost' && typeof healStart === 'function') setTimeout(() => { try { healStart('derrota no Auto Boss', null, true, true); } catch { /* cura desligada */ } }, 5000);   // a cura na Joy (se ligada) cura e volta para a hunt
        if (cfg.bossAlerts !== false && reason !== 'stopped') bossAlertFinish(reason, bossLast);
        bossNotify();
    }
    function bossAlertFinish(reason, r) {
        const who = playerName();
        const conta = who ? `**${who}**` : 'Sua conta';
        const loot = r.loot.length ? r.loot.map(l => `${l.qty}× ${l.name}`).join(', ') : 'nenhum drop';
        const placar = `🏆 ${r.wins} 💀 ${r.losses}`;
        let content, title, color;
        if (reason === 'done') { content = `✅ ${conta}: Auto Boss concluído em **${r.boss}** — ${r.total} luta${r.total === 1 ? '' : 's'}, ${placar}`; title = `Auto Boss concluído: ${r.boss}`; color = 0x57f287; }
        else if (reason === 'no-token') { content = `🎟️ ${conta}: os tokens acabaram depois de ${r.started} luta${r.started === 1 ? '' : 's'} em **${r.boss}** (${placar})`; title = `Auto Boss: sem tokens (${r.boss})`; color = 0xfee75c; }
        else if (reason === 'lost') { content = `💀 ${conta}: o time caiu em **${r.boss}** na luta ${Math.max(1, r.started)}/${r.total} — ${r.fee ? `${r.fee.qty}× ${r.fee.name} perdido` : 'token perdido'}; o Auto Boss parou${cfg.bossResumeOnLoss ? '' : ' (retomada após derrota desligada no painel)'}`; title = `Auto Boss: derrota em ${r.boss}`; color = 0xed4245; }
        else { content = `🏁 ${conta}: Auto Boss em **${r.boss}** encerrado (${BOSS_REASON_LABEL[reason] || reason}) com ${placar}`; title = `Auto Boss encerrado: ${r.boss}`; color = 0x5865f2; }
        postWebhook('alert', {
            content, username: 'Poke Idle World',
            embeds: [{ title, color, description: (who ? `Conta: ${who}\n` : '') + `Lutas: ${r.started}/${r.total} · ${placar}${r.spent != null && r.fee ? ` · ${r.spent}× ${r.fee.name}` : ''}${r.resumes ? ` · ${r.resumes} retomada${r.resumes === 1 ? '' : 's'}` : ''}\nLoot: ${loot}\nEm ${new Date().toLocaleString('pt-BR')}` }],
        }, { evento: 'auto-boss-fim', motivo: reason, boss: r.boss });
    }

    function bossScheduleResume(motivo, restantes, curar, delayMs) {
        if (bossRun || bossRetryTimer || !bossWanted) return;
        if (bossWanted.resumes >= BOSS_MAX_RESUMES) { bossGiveUp(`${BOSS_MAX_RESUMES} retomadas nesta sessão`, motivo); return; }
        const ms = delayMs ?? BOSS_RESUME_DELAY_MS;
        logEvent('auto-boss-parado', { motivo, restantes, boss: bossWanted.bossName || bossWanted.bossKey, retomadaEmS: Math.round(ms / 1000), hunt: huntSlug || null });
        bossRetryTimer = setTimeout(() => { bossRetryTimer = null; bossResumeFlow(motivo, restantes, Boolean(curar), 1); }, ms);
        bossNotify();
    }
    function bossRetry(motivo, restantes, curar, tentativa, porque) {
        logEvent('auto-boss-retomada', { fase: 'falhou', tentativa, porque, boss: bossWanted?.bossKey || null });
        if (!bossWanted) return;
        if (tentativa >= BOSS_MAX_TRIES) { bossGiveUp(`${tentativa} tentativas sem o jogo aceitar (${porque})`, motivo); return; }
        const ms = BOSS_RETRY_MS[Math.min(tentativa, BOSS_RETRY_MS.length) - 1];
        bossRetryTimer = setTimeout(() => { bossRetryTimer = null; bossResumeFlow(motivo, restantes, curar, tentativa + 1); }, ms);
    }
    function bossGiveUp(porque, motivo) {
        const w = bossWanted; bossWanted = null; bossSave();
        const boss = w?.bossName || w?.bossKey || 'boss';
        bossLast = { reason: 'desisti', at: Date.now(), boss, wins: w?.prog?.wins || 0, losses: w?.prog?.losses || 0, started: (w?.prog?.wins || 0) + (w?.prog?.losses || 0), total: w?.prog?.total || w?.total || 0, spent: null, loot: [], fee: bossFee(), resumes: w?.resumes || 0, porque };
        logEvent('auto-boss-desisti', { porque, parou: motivo, boss, retomadas: w?.resumes || 0 });
        if (cfg.bossAlerts !== false) {
            const who = playerName();
            postWebhook('alert', {
                content: `⚠️ ${who ? `**${who}**` : 'Sua conta'}: não consegui retomar o Auto Boss em **${boss}** — ${porque}. Inicie na mão (Bosses → ⟳ Auto Boss, numa cidade).`,
                username: 'Poke Idle World',
                embeds: [{ title: `Auto Boss: desisti de retomar (${boss})`, color: 0xed4245, description: (who ? `Conta: ${who}\n` : '') + `Parou por: ${BOSS_REASON_LABEL[motivo] || motivo}\nRetomadas nesta sessão: ${w?.resumes || 0}\nEm ${new Date().toLocaleString('pt-BR')}` }],
            }, { evento: 'auto-boss-desisti', boss, porque });
        }
        bossNotify();
    }
    // Frame `error { message }` do jogo durante a retomada (ex.: "Sua luta de boss anterior ainda está terminando — aguarde alguns
    // segundos."): guarda o texto para o log da tentativa (o `auto-boss` com reason `error` chega junto e é ele que decide).
    function bossOnError(message) {
        if (bossRun) bossRun.lastError = String(message?.message || '').trim() || null;
    }
    function bossArenaSlug(w) { return (w && (w.arena || BOSS_ARENAS[w.bossKey])) || null; }
    // Start aceito: o servidor só começa a luta com o personagem na arena. No start feito na mão é a TELA que viaja para o mapa da
    // arena e o componente da hunt manda `enter-hunt { slug }`; o nosso start não faz a tela viajar, então injetamos o `hunt-resume`
    // sintético (o mesmo de `switchHunt`: a tela viaja e manda o enter-hunt) e, sem a hunt da arena em 4 s, mandamos o enter-hunt.
    async function bossEnterArena(slug, tentativa) {
        if (bossRun) bossRun.fase = 'entrando na arena';
        bossNotify();
        const tela = typeof nudgeClientToHunt === 'function' ? Boolean(nudgeClientToHunt(slug)) : false;
        await bossWait(BOSS_ARENA_WAIT_MS);
        const chegou = normalize(huntSlug || '') === slug;
        const direto = chegou ? false : sendGame({ type: 'enter-hunt', slug });
        logEvent('auto-boss-arena', { slug, tela, chegou, direto, tentativa, hunt: huntSlug || null });
    }
    // Token do boss fora da venda e do guardar na cidade enquanto há Auto Boss pedido/rodando (e por 2 h depois de desistir).
    function bossKeepsItem(id) {
        const n = Number(id);
        if (!(n > 0)) return false;
        const pendente = Boolean(bossWanted) || bossBusy() || (bossLast?.reason === 'desisti' && Date.now() - bossLast.at < BOSS_KEEP_AFTER_MS);
        if (!pendente) return false;
        return n === bossFee()?.itemId || BOSS_FEE_ITEMS.includes(n);
    }
    function bossSendStart(bossKey, count) {
        return new Promise(resolve => {
            let feito = false;
            const fim = (s) => { if (!feito) { feito = true; resolve(s); } };
            bossRun.waitStart = fim;
            const enviado = sendGame({ type: 'auto-boss-start', bossKey, count });
            if (!enviado) { bossRun.waitStart = null; fim(null); return; }
            setTimeout(() => { if (bossRun?.waitStart === fim) bossRun.waitStart = null; fim(null); }, BOSS_START_WAIT_MS);
        });
    }
    function bossFetchInv(itemId) {
        return new Promise(resolve => {
            let feito = false;
            const fim = () => { if (!feito) { feito = true; resolve(bossInv.has(itemId) ? bossInv.get(itemId) : (bossInvAt ? 0 : null)); } };
            bossRun.waitInv = fim;
            if (!sendGame({ type: 'inv-get' })) { bossRun.waitInv = null; resolve(null); return; }
            setTimeout(() => { if (bossRun?.waitInv === fim) { bossRun.waitInv = null; feito = true; resolve(null); } }, BOSS_INV_WAIT_MS);
        });
    }
    async function bossResumeFlow(motivo, restantes, curar, tentativa) {
        if (!bossWanted || bossRun) return;
        if (typeof humanPending === 'function' && humanPending()) {                 // verificação humana pendente: espera (o socket pode estar fechado)
            bossRetryTimer = setTimeout(() => { bossRetryTimer = null; bossResumeFlow(motivo, restantes, curar, tentativa); }, 30000);
            return;
        }
        const w = bossWanted;
        bossRun = { since: Date.now(), motivo, tries: tentativa, fase: 'saindo da hunt', waitStart: null, waitInv: null };
        bossNotify();
        logEvent('auto-boss-retomada', { fase: 'inicio', tentativa, motivo, boss: w.bossName || w.bossKey, restantes, hunt: huntSlug || null, curar });
        try {
            const h = normalize(huntSlug || '');
            if (h && !CITY_SLUGS.includes(h)) {                                      // o Auto Boss só começa fora de hunt (inclusive da arena)
                sendGame({ type: 'leave-hunt' });
                sendGame({ type: 'set-city', slug: 'cerulean' });
                await bossWait(BOSS_LEAVE_WAIT_MS);
            }
            bossRun.fase = 'curando na Joy';
            sendGame({ type: 'joy-heal' });                                          // grátis; "líder desmaiado" é um dos motivos de `error`
            await bossWait(BOSS_HEAL_WAIT_MS);
            const fee = bossFee();
            let lutas = restantes;
            if (fee?.itemId) {
                bossRun.fase = 'conferindo os tokens';
                const tem = await bossFetchInv(fee.itemId);
                if (tem !== null) {
                    const cabem = Math.floor(tem / fee.qty);
                    if (cabem < 1) { bossGiveUp(`sem ${fee.name} na mochila`, motivo); return; }
                    lutas = Math.min(lutas, cabem);
                }
            }
            bossRun.fase = `pedindo ${lutas} luta${lutas === 1 ? '' : 's'}`;
            bossNotify();
            const r = await bossSendStart(w.bossKey, lutas);
            if (r?.active) {
                w.resumes += 1; w.total = r.total || lutas; w.sawActive = true; w.fought = false; w.prog = { total: r.total || lutas, wins: r.wins, losses: r.losses }; bossSave();
                logEvent('auto-boss-retomada', { fase: 'ok', tentativa, lutas, boss: r.bossName || w.bossKey, retomadas: w.resumes });
                if (cfg.bossAlerts !== false) {
                    const who = playerName();
                    postWebhook('alert', {
                        content: `🔁 ${who ? `**${who}**` : 'Sua conta'}: Auto Boss retomado em **${r.bossName || w.bossName || w.bossKey}** com ${lutas} luta${lutas === 1 ? '' : 's'} (tinha parado: ${BOSS_REASON_LABEL[motivo] || motivo})`,
                        username: 'Poke Idle World',
                        embeds: [{ title: `Auto Boss retomado: ${r.bossName || w.bossName || w.bossKey}`, color: 0x5865f2, description: (who ? `Conta: ${who}\n` : '') + `Lutas pedidas: ${lutas}${fee ? ` (${fee.qty}× ${fee.name} cada)` : ''} · retomada ${w.resumes} nesta sessão · tentativa ${tentativa}\nEm ${new Date().toLocaleString('pt-BR')}` }],
                    }, { evento: 'auto-boss-retomada', boss: w.bossKey, lutas, retomadas: w.resumes });
                }
                const arena = bossArenaSlug(w);
                if (arena) await bossEnterArena(arena, tentativa);
                else logEvent('auto-boss-arena', { slug: null, tela: false, chegou: false, direto: false, tentativa, hunt: huntSlug || null, porque: 'arena desconhecida para este boss' });
                return;
            }
            if (r?.reason === 'no-token') { bossGiveUp(`o jogo diz que não há ${fee?.name || 'tokens'} suficientes`, motivo); return; }
            const erro = bossRun?.lastError || null;
            bossRun = null;
            bossRetry(motivo, restantes, curar, tentativa, !r ? 'sem resposta em 8 s' : `recusado: ${erro || BOSS_REASON_LABEL[r.reason] || r.reason || 'sem motivo'}`);
        } catch (err) {
            bossRun = null;
            bossRetry(motivo, restantes, curar, tentativa, String(err?.message || err));
        } finally {
            bossRun = null;
            bossNotify();
        }
    }

    // Linha de estado do painel (aba Treino).
    function bossStatus(d) {
        d = d || cfg;
        const s = bossState;
        if (s?.active) {
            const idade = Date.now() - s.at;
            const fase = s.stopping ? 'encerrando após esta luta' : s.phase === 'starting' ? 'entrando na arena' : s.phase === 'cooldown' ? `próxima luta em ${Math.max(0, Math.ceil((s.inMs - idade) / 1000))} s` : `em combate há ${bossFmt(s.fightMs + idade)}`;
            return `▶ ${s.bossName || s.bossKey}: luta ${Math.max(1, s.started)}/${s.total} · ${fase} · 🏆 ${s.wins} 💀 ${s.losses}${s.fee ? ` · ${s.spent != null ? s.spent : s.started * s.fee.qty}× ${s.fee.name}` : ''}${bossWanted?.resumes ? ` · ${bossWanted.resumes} retomada${bossWanted.resumes === 1 ? '' : 's'}` : ''}`;
        }
        if (bossRun) return `retomando ${bossWanted?.bossName || bossWanted?.bossKey || ''} (${bossRun.fase}, tentativa ${bossRun.tries}/${BOSS_MAX_TRIES})`;
        if (bossRetryTimer && bossWanted) return `parou; retomada de ${bossWanted.bossName || bossWanted.bossKey} agendada`;
        if (bossWanted) return `${bossWanted.bossName || bossWanted.bossKey} pedido (${bossWanted.total} luta${bossWanted.total === 1 ? '' : 's'}) · esperando o jogo confirmar`;
        if (bossLast) return `último: ${bossLast.boss} ${bossLast.reason === 'desisti' ? `— desisti de retomar (${bossLast.porque})` : `(${BOSS_REASON_LABEL[bossLast.reason] || bossLast.reason})`} às ${new Date(bossLast.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} · 🏆 ${bossLast.wins} 💀 ${bossLast.losses}`;
        return d.bossResumeEnabled === false ? 'retomada desligada; nada em andamento' : 'nenhum Auto Boss em andamento (inicie no jogo: Bosses → ⟳ Auto Boss, numa cidade)';
    }

    // ---- Verificação humana (v3.40.0): o jogo pede o clique "sou humano" (Cloudflare Turnstile) e a conta fica parada ----
    // Levantado no bundle em 18/10/2026 (chunk do jogo: `tz="pw:human-check"` e `/api/auth/human`; chunk 535482: sitekey e
    // `loadTurnstileScript`; i18n `hud.world.humanCheck.*`). Detalhes em docs/mensagens-do-jogo.md → "Verificação humana".
    //   - `GET /api/auth/human` → `{ mode, until, renewBeforeMs }` (`mode:'off'` = desligado). A tela consulta 3 s após montar e a
    //     cada 20 min; faltando menos de `renewBeforeMs` para `until`, renova sozinha: Turnstile (`appearance:'interaction-only'`,
    //     passa sem clique na maioria das vezes) → token → `POST /api/auth/human { token }` → `{ until }`.
    //   - O servidor EXIGE de duas formas: fecha o socket com o código 4011 (a tela NÃO reconecta sozinha) ou responde 403
    //     `{ code:'human-check' }` a um REST (a camada REST da tela dispara o evento `pw:human-check` na janela). A tela abre
    //     "🧑 Confirme que você é humano" (`.win-overlay > .win-window`, botão "✅ Verificar agora"), tenta verificar sozinha e,
    //     verificada, religa o socket. O widget mora em `div#pw-turnstile-host.turnstile-host` (classe `on` enquanto renderiza;
    //     a Cloudflare só mostra a caixa quando precisa do clique).
    // O script NÃO resolve o desafio (a prova é justamente a pessoa clicar). Ele percebe a exigência pelas mesmas fontes (4011,
    // `pw:human-check`, 403 nos SEUS REST, janela/widget abertos), registra no log (`humano-campos`, `humano-pendente`, `humano-ok`,
    // `humano-desafio`, `humano-aviso`, `socket-fechado`), avisa no canal Captcha (v3.41.0; vazio = Alertas) se não resolveu em 20 s (`HUMAN_ALERT_DELAY_MS`;
    // repete a cada 15 min e avisa quando resolve), segura a volta da cidade (`humanPending()` em `idleBusyReason`) e, num 403 do
    // próprio script, dispara `pw:human-check` para a tela abrir a janela. Sem config: sempre ligado (o aviso depende do canal de alertas).
    const HUMAN_API = '/api/auth/human';
    const HUMAN_WS_CLOSE_CODE = 4011;
    const HUMAN_ALERT_DELAY_MS = 20 * 1000;
    const HUMAN_ALERT_GAP_MS = 15 * 60 * 1000;
    const HUMAN_POLL_MS = 20 * 1000;
    const HUMAN_WATCH_MS = 2 * 1000;
    const HUMAN_WIDGET_MS = 15 * 1000;   // widget renderizado há mais de 15 s = o desafio está esperando o clique
    const WS_CLOSE_REASONS = { 1000: 'normal', 1001: 'página saindo', 1006: 'caiu sem fechar', 4001: 'token expirado', 4002: 'reconectar', 4003: 'manutenção', 4005: 'conta aberta em outro lugar', 4006: 'limite de contas na rede', 4007: 'limite de contas na máquina', 4008: 'namelock', 4009: 'trocar senha', 4011: 'verificação humana' };
    let humanReq = null;        // { since, origem, until, alertedAt, alerts, timer, poll }
    let humanInfo = null;       // última resposta do GET: { mode, until, renewBeforeMs, at }
    let humanWidgetOn = 0;      // desde quando `#pw-turnstile-host` tem a classe `on` (0 = fechado)
    let humanWidgetLogged = false;
    let humanOverlayOn = false;
    let onHumanChange = null;   // painel (aba Sistema)

    function humanPending() { return Boolean(humanReq); }
    function humanNotify() { if (onHumanChange) { try { onHumanChange(); } catch { /* painel fechado */ } } }
    function humanFmt(seg) { return seg >= 120 ? `${Math.round(seg / 60)} min` : `${seg} s`; }
    function humanStatus() {
        if (humanReq) return `🧑 verificação humana pendente há ${humanFmt(Math.round((Date.now() - humanReq.since) / 1000))} (${humanReq.origem}) — clique no desafio da Cloudflare`;
        if (humanInfo?.mode === 'off') return 'verificação humana desligada no servidor';
        if (humanInfo?.until) {
            const falta = Date.parse(humanInfo.until) - Date.now();
            return falta > 0 ? `verificação humana ok até ${new Date(humanInfo.until).toLocaleString('pt-BR')}` : 'verificação humana vencida (a tela renova sozinha)';
        }
        return humanInfo ? 'verificação humana: sem prazo informado' : 'verificação humana: ainda não consultada';
    }
    async function humanFetch(motivo) {
        try {
            const r = await gameApi(HUMAN_API);
            humanInfo = { mode: r?.mode ?? null, until: r?.until ?? null, renewBeforeMs: r?.renewBeforeMs ?? null, at: Date.now() };
            return r || {};
        } catch (err) { logEvent('humano-erro', { motivo, erro: String(err?.message || err) }); return null; }
    }
    // Uma leitura na carga, para confirmar o formato no log.
    async function humanSniff() {
        const r = await humanFetch('carga');
        if (!r) return;
        const u = r.until ? Date.parse(r.until) : NaN;
        logEvent('humano-campos', { chaves: Object.keys(r), mode: r.mode ?? null, until: r.until ?? null, renewBeforeMs: r.renewBeforeMs ?? null, faltaMin: Number.isFinite(u) ? Math.round((u - Date.now()) / 60000) : null });
        humanNotify();
    }
    function humanRequired(origem, extra) {
        if (humanReq) return;
        humanReq = { since: Date.now(), origem, until: humanInfo?.until ?? null, alertedAt: 0, alerts: 0, timer: null, poll: null };
        logEvent('humano-pendente', Object.assign({ origem, untilAntes: humanReq.until, hunt: typeof huntSlug !== 'undefined' ? huntSlug : null }, extra || {}));
        humanReq.timer = setTimeout(humanAlert, HUMAN_ALERT_DELAY_MS);
        humanReq.poll = setInterval(humanPoll, HUMAN_POLL_MS);
        humanNotify();
    }
    function humanResolved(origem) {
        if (!humanReq) return;
        const req = humanReq; humanReq = null;
        clearTimeout(req.timer); clearInterval(req.poll);
        const seg = Math.round((Date.now() - req.since) / 1000);
        logEvent('humano-ok', { origem, aposSeg: seg, avisos: req.alerts, detectadaPor: req.origem });
        if (req.alerts) {
            const who = playerName();
            postWebhook('human', { content: `✅ ${who ? `**${who}**` : 'Sua conta'}: verificação humana concluída (${origem}) depois de ${humanFmt(seg)} — o jogo voltou.`, username: 'Poke Idle World' }, { evento: 'humano-ok', aposSeg: seg });
        }
        humanNotify();
    }
    function humanAlert() {
        if (!humanReq) return;
        humanReq.alertedAt = Date.now(); humanReq.alerts += 1;
        const who = playerName();
        const seg = Math.round((Date.now() - humanReq.since) / 1000);
        logEvent('humano-aviso', { origem: humanReq.origem, aposSeg: seg, aviso: humanReq.alerts });
        postWebhook('human', {
            content: `🧑 ${who ? `**${who}**` : 'Sua conta'}: o jogo pede a **verificação humana** (Cloudflare) há ${humanFmt(seg)} — clique no desafio no painel do PokeGrid. Até lá o personagem fica parado.`,
            username: 'Poke Idle World',
            embeds: [{
                title: 'Verificação humana pendente',
                color: 0xf0b232,
                fields: [
                    { name: 'Conta', value: who || '—', inline: true },
                    { name: 'Detectada por', value: humanReq.origem, inline: true },
                    { name: 'Desde', value: new Date(humanReq.since).toLocaleTimeString('pt-BR'), inline: true },
                ],
                footer: { text: `O script não resolve o captcha, só avisa · aviso ${humanReq.alerts}` },
            }],
        }, { evento: 'humano-aviso', origem: humanReq.origem, aposSeg: seg, aviso: humanReq.alerts });
        humanReq.timer = setTimeout(humanAlert, HUMAN_ALERT_GAP_MS);
    }
    // Enquanto pendente: relê o prazo; `until` novo no futuro (ou verificação desligada) = resolvido.
    async function humanPoll() {
        if (!humanReq) return;
        const antes = humanReq.until;
        const r = await humanFetch('pendente');
        if (!r || !humanReq) return;
        if (r.mode === 'off') { humanResolved('verificação desligada no servidor'); return; }
        if (antes == null) { humanReq.until = r.until ?? null; return; }   // sem prazo anterior conhecido: guarda e compara no próximo
        const u = r.until ? Date.parse(r.until) : NaN;
        if (Number.isFinite(u) && u > Date.now() && r.until !== antes) humanResolved('prazo renovado');
    }
    // Fontes da exigência.
    function humanOnSocketClose(ev) {
        const code = Number(ev?.code) || 0;
        logEvent('socket-fechado', { code, motivo: WS_CLOSE_REASONS[code] || null, razao: ev?.reason || null, limpo: Boolean(ev?.wasClean) });
        if (code === HUMAN_WS_CLOSE_CODE) humanRequired('socket fechado com 4011');
    }
    function humanOnSocketTracked() {   // depois do 4011 a tela só religa o socket quando a verificação passou
        if (humanReq && humanReq.origem.includes('4011')) humanResolved('socket religado');
    }
    function humanOnRestForbidden(body, url) {
        if (!body || body.code !== 'human-check') return false;
        humanRequired('403 human-check num REST do script', { url: String(url || '').split('?')[0] });
        try { window.dispatchEvent(new CustomEvent('pw:human-check')); } catch { /* sem janela (teste) */ }
        return true;
    }
    function humanOnScreenEvent() { humanRequired('evento pw:human-check da tela'); }
    // Vigia (2 s): janela "Confirme que você é humano" e widget do Turnstile aberto há tempo demais.
    function humanWatchTick() {
        if (typeof document === 'undefined' || !document.body) return;
        const now = Date.now();
        let overlay = false;
        for (const h of document.querySelectorAll('.win-overlay .win-window h3')) {
            if (/humano|human/i.test(h.textContent || '')) { overlay = true; break; }
        }
        if (overlay !== humanOverlayOn) {
            humanOverlayOn = overlay;
            if (overlay) humanRequired('janela "Confirme que você é humano" aberta');
            else if (humanReq && !humanReq.origem.includes('4011')) humanResolved('janela fechada');   // com 4011 quem resolve é o socket religado
        }
        const host = document.getElementById('pw-turnstile-host');
        const on = Boolean(host && host.classList && host.classList.contains('on'));
        if (on && !humanWidgetOn) { humanWidgetOn = now; humanWidgetLogged = false; }
        if (on && now - humanWidgetOn >= HUMAN_WIDGET_MS) {
            if (!humanWidgetLogged) { humanWidgetLogged = true; logEvent('humano-desafio', { aberto: true, seg: Math.round((now - humanWidgetOn) / 1000) }); }
            humanRequired('desafio do Turnstile aberto há 15 s');
        }
        if (!on && humanWidgetOn) {
            if (humanWidgetLogged) logEvent('humano-desafio', { aberto: false, seg: Math.round((now - humanWidgetOn) / 1000) });
            humanWidgetOn = 0; humanWidgetLogged = false;
            if (humanReq && humanReq.origem.startsWith('desafio') && !humanOverlayOn) humanResolved('desafio fechado');
        }
    }
    try { window.addEventListener('pw:human-check', humanOnScreenEvent); } catch { /* sem janela (teste) */ }

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
        if (typeof bossBusy === 'function' && bossBusy()) { faintSeen = null; logEvent('cura', { fase: 'pulada', motivo, autoBoss: true }); return false; }
        if (typeof invBusy === 'function' && invBusy()) { faintSeen = null; logEvent('cura', { fase: 'pulada', motivo, invasao: true }); return false; }   // v3.50.0: o time cair ENCERRA a rodada; a volta da invasão cura na Joy   // v3.43.0: durante o Auto Boss (ou a retomada) quem cura é o módulo do boss
        if (typeof holdActive === 'function' && holdActive()) { faintSeen = null; logEvent('cura', { fase: 'pulada', motivo, esperaCidade: true }); return false; }   // v3.44.0: esperando na cidade de propósito: não volta para hunt nenhuma
        const noRevive = Boolean(faintSeen?.noRevive);
        faintSeen = null;
        if (!cfg.healJoyEnabled || healRun) return false;
        const slug = (healIsHunt(slugHint) ? normalize(slugHint) : null) || (typeof lastRealHunt !== 'undefined' && healIsHunt(lastRealHunt) ? normalize(lastRealHunt) : null)
            || (typeof idleDefaultSlug === 'function' ? idleDefaultSlug() : null);   // v3.36.0: hunt padrão
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
    // v3.36.0: hunt padrão do painel ("NÃO PODEMOS PERDER TEMPO PARADO"): último recurso da parada na cidade, da volta da
    // viagem e da cura quando não há rota do clã, etapa de treino nem última hunt conhecida. Nome ou slug; null = vazio/cidade.
    function idleDefaultSlug(d) { const h = huntSlugFromName((d || cfg).cityIdleHunt || ''); return idleIsHunt(h) ? h : null; }

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

    // Desde quando a conta está parada (ms), ou 0 se está farmando. "Farmando" = algum frame de hunt (`field`, `field-init`,
    // `field-kill`, `poke-xp`) no último minuto, não importa o que o script acha da hunt. v3.33.1: antes, com a hunt do
    // script preenchida e UM frame visto depois da entrada, devolvia 0 para sempre — a conta que o servidor tirou da hunt
    // sem a tela mandar `leave-hunt` (reconexão que caiu na cidade, hunt encerrada pelo servidor) aparecia "farmando" no
    // painel e nunca voltava (10/10/2026: contas paradas na cidade sem nenhum `cidade-parada` no log).
    function idleSinceAt() {
        const vivo = idleAliveAt && Date.now() - idleAliveAt < 2 * IDLE_TICK_MS;
        if (idleIsHunt(huntSlug)) {
            if (vivo && idleAliveAt >= idleHuntAt) return 0;
            return Math.max(idleHuntAt, idleAliveAt);        // pediu a hunt e nada chegou, ou os frames pararam
        }
        if (vivo) return 0;                                  // o servidor farma (tela na cidade)
        return Math.max(idleOutSince || idleLoadedAt, idleAliveAt);
    }
    // Onde a conta parou, para o status e o aviso: hunt que o script ainda considera ativa ou fora de hunt.
    function idleWhere() { return idleIsHunt(huntSlug) ? `em ${huntSlug} sem abates` : 'fora de hunt'; }
    function idleBusyReason() {
        if (typeof holdReason === 'function' && holdReason()) return holdReason();   // v3.44.0: espera na cidade pelo botão do painel
        if (typeof humanPending === 'function' && humanPending()) return 'verificação humana pendente (clique no desafio da Cloudflare)';
        if (typeof bossBusyReason === 'function' && bossBusyReason()) return bossBusyReason();   // v3.43.0: Auto Boss do jogo em andamento / retomada
        if (typeof invBusyReason === 'function' && invBusyReason()) return invBusyReason();   // v3.50.0: Invasão Rocket (entrando, dentro ou voltando)
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
        else if (idleDefaultSlug()) slug = idleDefaultSlug();
        if (!slug) return { motivo: 'não sei de que hunt veio (entre numa hunt uma vez ou preencha a hunt padrão)' };
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
        return `parada ${idleWhere()} há ${min} min${idleNote ? ` · esperando: ${idleNote}` : falta > 0 ? ` · volta em ${falta} min` : ''}${ult}`;
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
                content: `🏙️ ${who ? `**${who}**` : 'Sua conta'}: parada ${idleWhere()} e as últimas ${idleBacks.length} voltas para **${alvo.slug}** não pegaram`,
                username: 'Poke Idle World',
                embeds: [{ title: 'Parada na cidade: desisti de voltar', description: (who ? `Conta: ${who}\n` : '') + `Entre numa hunt na mão; a volta automática rearma assim que a conta voltar a farmar.\nEm ${new Date().toLocaleString('pt-BR')}`, color: 0xed4245 }],
            }, { evento: 'cidade-parada', slug: alvo.slug });
            idleNotify();
            return;
        }
        idleBacks.push(Date.now());
        idleLast = { at: Date.now(), slug: alvo.slug, min, ok: false, motivo: null };
        logEvent('cidade-parada', { fase: 'inicio', slug: alvo.slug, min, hunt: huntSlug || null, ultimoFrame: idleAliveAt ? new Date(idleAliveAt).toISOString() : null, volta: idleBacks.length });
        return idleGoBack(alvo.slug, min, idleWhere());
    }

    async function idleGoBack(slug, min, onde) {
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
                content: `🏙️ ${who ? `**${who}**` : 'Sua conta'}: parada ${onde || 'fora de hunt'} há ${min} min — ${erro ? `não voltei: ${erro}` : `curei na Nurse Joy e estou voltando para **${slug}**`}`,
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
        if (message.type === 'breedbox-moved') { breedOnBoxMoved(message); return; }   // v3.49.0: resposta do movimento da Breeding Box
        if (message.type === 'family') { handleFamily(message); return; }
        if (message.type === 'guild') { handleGuild(message); return; }
        if (message.type === 'guild-dirty') { guildOnDirty(); return; }
        if (message.type === 'fishing-cooldown' || message.type === 'fishing-levelup') { fishOnMessage(message); return; }
        if (message.type === 'error') { handleGameError(message); return; }
        if (message.type === 'poke-xp') { idleOnAlive(); handlePokeXp(message); evolveOnPokeXp(message); return; }
        if (message.type === 'field' || message.type === 'field-init') {
            lastFieldAt = Date.now();
            if (message.type === 'field') healOnField(message);
            if (message.type === 'field') invOnField(message);   // v3.50.0: wave da Invasão Rocket
            if (message.type === 'field-init' && message.slug && !huntSlug) setHunt(message.slug); // script carregou depois do enter-hunt
            idleOnAlive();
            return;
        }
        if (typeof message.type === 'string' && message.type.startsWith('invasion-')) { invOnMessage(message); return; }   // v3.50.0: Invasão Rocket (janela, energia, recusa, fim)
        if (message.type === 'auto-boss') { bossOnFrame(message); return; }   // v3.43.0: Auto Boss do jogo (estado/encerramento)
        if (message.type === 'gym-global') { gymOnGlobal(message); return; }   // v3.45.0: anúncio global do ginásio (só log)
        if (message.type === 'field-teleport-city') { healOnTeleport(); return; }   // o sintético da viagem já saiu acima
        if (message.type === 'field-kill') { idleOnAlive(); invOnKill(message); noteLeaderLevel(Number(message.level), 'field-kill', Boolean(message.leveledUp)); handleFieldKill(message); noteDailyKill(message); noteClanKill(message); noteDepositDrop(message); guildOnKill(message); fishOnKill(message); farmOnKill(message); return; }
        if (message.type === 'inventory' && Array.isArray(message.items)) { clanOnInventory(message.items); supplyOnInventory(message.items); bossOnInventory(message.items); return; }
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

    // ---- Esperar na cidade (v3.44.0): botão do painel que segura a conta na cidade até o usuário mandar voltar ----
    // Pedido do usuário em 21/10/2026: "peguei emprestado o Pokémon em outra conta e gostaria que ele ficasse esperando na
    // cidade; dentro do settings, um botão para ficar idle". Sem isto tudo no script empurra a conta de volta para a hunt
    // (parada na cidade, volta da viagem/cura/recarga, rotas, e a própria tela reafirma a hunt na reconexão).
    // Estado em `holdRun` ({ at, hunt }), persistido em localStorage[HOLD_KEY] para sobreviver à recarga do painel; fica
    // FORA do cfg porque é da conta (não entra no Exportar/Importar). Ligado: cancela troca em andamento, sai da hunt
    // (`leave-hunt` + teleporte sintético para a tela viajar; `set-city` nós mesmos se ela não mandar em HOLD_CITY_WAIT_MS),
    // `switchHunt` recusa toda entrada (log `espera-cidade { fase:'bloqueou' }`, 1x por origem a cada 5 min), as rotas e a
    // parada na cidade esperam (`holdActive()`/`holdReason()`), a cura na Joy é pulada, a recarga não arma a volta e, se a
    // tela religar a hunt (reconexão reafirma a última hunt escolhida na mão), o script sai de novo HOLD_KICK_DELAY_MS depois
    // (`holdOnHuntChange`, no máximo 1x por HOLD_KICK_GAP_MS, fase 'saiu'). A arena do Auto Boss (`*_boss`) não conta:
    // boss começado na mão segue. Viagens à cidade continuam (a conta já está lá; só a volta é recusada).
    // Desligar (`holdStop`): `joy-heal` (de graça; líder em hp 0 = a tela recusa hunt) e volta para o destino da parada na
    // cidade (`idleTarget`: clã > rota > última hunt > hunt padrão); sem destino, o painel pede para entrar na mão.
    // Logs `espera-cidade { fase: inicio | lembrada | saiu | bloqueou | troca-cancelada | fim }`.

    const HOLD_KEY = 'pgDiscordNotifyHold';
    const HOLD_CITY_WAIT_MS = 10 * 1000;       // a tela não viajou depois do teleporte sintético: mandamos set-city nós mesmos
    const HOLD_KICK_DELAY_MS = 2000;           // hunt vista com a espera ligada: sai dela depois disto
    const HOLD_KICK_GAP_MS = 30 * 1000;        // no máximo uma saída forçada por período
    const HOLD_BLOCK_LOG_MS = 5 * 60 * 1000;   // log `bloqueou` 1x por origem por período
    const HOLD_BACK_DELAY_MS = 2500;           // joy-heal -> volta para a hunt

    let holdRun = null;           // { at, hunt } enquanto a espera está ligada
    let holdKickTimer = null;
    let holdKickAt = 0;
    let holdCityTimer = null;
    let holdCityArrived = false;
    let holdBlockLog = {};        // origem -> última vez que o bloqueio foi logado
    let holdLast = null;          // { at, slug, motivo } última volta pedida pelo desligar
    let onHoldChange = null;      // callback do painel

    function holdNotify() { if (onHoldChange) { try { onHoldChange(); } catch { /* painel fechado */ } } }
    function holdActive() { return Boolean(holdRun); }
    function holdReason() { return holdRun ? 'esperando na cidade (botão do painel)' : null; }
    function holdIsHunt(slug) { const h = normalize(slug || ''); return Boolean(h) && !CITY_SLUGS.includes(h) && !(typeof bossIsArena === 'function' && bossIsArena(h)) && !(typeof invIsRaid === 'function' && invIsRaid(h)); }
    const holdHora = (at) => new Date(at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    function holdSave() {
        try { if (holdRun) localStorage.setItem(HOLD_KEY, JSON.stringify(holdRun)); else localStorage.removeItem(HOLD_KEY); }
        catch { /* sem espaço: a espera vale só nesta carga */ }
    }
    // Carga nova: a espera ligada na carga anterior continua (a recarga do painel não desliga).
    function holdLoad() {
        let rec = null;
        try { rec = JSON.parse(localStorage.getItem(HOLD_KEY) || 'null'); } catch { rec = null; }
        if (!rec || typeof rec !== 'object' || !(Number(rec.at) > 0)) return false;
        holdRun = { at: Number(rec.at), hunt: rec.hunt ? String(rec.hunt) : null };
        logEvent('espera-cidade', { fase: 'lembrada', desdeMin: Math.round((Date.now() - holdRun.at) / 60000), hunt: holdRun.hunt });
        return true;
    }
    function holdStatus() {
        if (!holdRun) {
            if (!holdLast) return 'desligada: a conta segue as rotas e a parada na cidade';
            return `desligada · última volta ${holdHora(holdLast.at)}${holdLast.slug ? ` para ${holdLast.slug}` : ` (não voltei: ${holdLast.motivo})`}`;
        }
        const min = Math.round((Date.now() - holdRun.at) / 60000);
        return `ligada há ${min} min (desde ${holdHora(holdRun.at)})${holdRun.hunt ? ` · veio de ${holdRun.hunt}` : ''} · nada manda a conta para a hunt até você clicar em Voltar`;
    }
    // Sai da hunt e põe a tela na cidade (como a ida da viagem). Devolve se havia hunt para sair.
    function holdLeave(fase, extra) {
        if (!holdIsHunt(huntSlug)) return false;
        const hunt = normalize(huntSlug);
        sendGame({ type: 'leave-hunt' });
        holdCityArrived = false;
        const tela = typeof nudgeClientToCity === 'function' ? nudgeClientToCity() : false;
        clearTimeout(holdCityTimer);
        holdCityTimer = setTimeout(() => {
            holdCityTimer = null;
            if (!holdCityArrived && holdRun) sendGame({ type: 'set-city', slug: typeof tripCity === 'function' ? tripCity() : 'cerulean' });   // a tela não viajou: avisa o servidor nós mesmos
        }, HOLD_CITY_WAIT_MS);
        logEvent('espera-cidade', Object.assign({ fase, hunt, tela }, extra || {}));
        return true;
    }
    function holdOnSetCity() { holdCityArrived = true; }
    function holdStart(origem) {
        if (holdRun) return false;
        const hunt = holdIsHunt(huntSlug) ? normalize(huntSlug) : (typeof lastRealHunt === 'string' && holdIsHunt(lastRealHunt) ? normalize(lastRealHunt) : null);
        holdRun = { at: Date.now(), hunt };
        holdSave();
        if (huntSwitch) {   // troca de hunt no meio do caminho: o enter-hunt dela não pode sair
            if (huntSwitch.timer) clearTimeout(huntSwitch.timer);
            logEvent('espera-cidade', { fase: 'troca-cancelada', slug: huntSwitch.slug, origem: huntSwitch.origem || null });
            huntSwitch = null;
        }
        if (!holdLeave('inicio', { origem })) logEvent('espera-cidade', { fase: 'inicio', hunt: null, origem, jaNaCidade: true, veioDe: hunt });
        holdNotify();
        return true;
    }
    // Chamado por setHunt(): a tela (reconexão, clique) ou o servidor religou uma hunt com a espera ligada.
    function holdOnHuntChange(slug) {
        if (!holdRun || !holdIsHunt(slug) || holdKickTimer) return;
        const espera = Math.max(HOLD_KICK_DELAY_MS, holdKickAt + HOLD_KICK_GAP_MS - Date.now());
        holdKickTimer = setTimeout(() => {
            holdKickTimer = null;
            if (!holdRun || !holdIsHunt(huntSlug)) return;
            holdKickAt = Date.now();
            holdLeave('saiu');
            holdNotify();
        }, espera);
    }
    // switchHunt recusou uma entrada por causa da espera: fica no log, 1x por origem por período.
    function holdBlocked(slug, origem) {
        const k = origem || 'rota';
        if (Date.now() - (holdBlockLog[k] || 0) < HOLD_BLOCK_LOG_MS) return;
        holdBlockLog[k] = Date.now();
        logEvent('espera-cidade', { fase: 'bloqueou', slug, origem: k });
    }
    function holdStop(origem) {
        if (!holdRun) return { ok: false, motivo: 'a espera não está ligada' };
        const min = Math.round((Date.now() - holdRun.at) / 60000);
        holdRun = null;
        holdSave();
        clearTimeout(holdKickTimer); holdKickTimer = null;
        clearTimeout(holdCityTimer); holdCityTimer = null;
        holdBlockLog = {};
        let slug = null, motivo = null;
        if (holdIsHunt(huntSlug)) motivo = `a conta já está em ${normalize(huntSlug)}`;
        else if (typeof bossBusy === 'function' && bossBusy()) motivo = 'Auto Boss do jogo em andamento';
        else if (typeof invBusy === 'function' && invBusy()) motivo = 'Invasão Rocket em andamento (ela volta para a hunt no fim)';
        else if (tripRunning) motivo = 'viagem à cidade em andamento (ela volta para a hunt no fim)';
        else {
            const alvo = typeof idleTarget === 'function' ? idleTarget() : { motivo: 'não sei de que hunt veio' };
            if (alvo.slug) slug = alvo.slug; else motivo = alvo.motivo;
        }
        holdLast = { at: Date.now(), slug, motivo };
        logEvent('espera-cidade', { fase: 'fim', origem, min, volta: slug, motivo });
        if (slug) {
            sendGame({ type: 'joy-heal' });   // de graça; com o líder em hp 0 a tela recusa a hunt
            setTimeout(() => { if (!holdRun && !holdIsHunt(huntSlug)) switchHunt(slug, 1, 'cidade'); }, HOLD_BACK_DELAY_MS);
        }
        holdNotify();
        return { ok: true, slug, motivo, min };
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
        // v3.40.0: o código do fechamento diz POR QUE o jogo caiu (4011 = verificação humana, 4005 = conta aberta em outro lugar...).
        ws.addEventListener('close', (event) => {
            try { humanOnSocketClose(event); } catch (err) { console.warn(TAG, 'Erro ao ler fechamento do socket:', err); }
        });
        lastSocket = ws;
        logEvent('socket', { url: String(ws.url || '').split('?')[0] });
        humanOnSocketTracked();
        requestBalls(BALLS_AFTER_SOCKET_MS);
        setTimeout(requestSupplies, SUPPLY_AFTER_SOCKET_MS);
        setTimeout(bossOnSocket, BOSS_AFTER_SOCKET_MS);   // v3.43.0: Auto Boss pedido? pergunta ao servidor se ainda roda
        setTimeout(invOnSocket, 4000);   // v3.50.0: Energia Vermelha (só com a invasão ligada ou rodada em andamento)
        requestPokes(POKES_AFTER_SOCKET_MS);
        armResume(RESUME_AFTER_SOCKET_MS);
        setTimeout(() => guildRequest('socket'), GUILD_AFTER_SOCKET_MS);
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
        { id: 'guild', icon: '🛡', label: 'Guild' },
        { id: 'farm', icon: '🎒', label: 'Farm' },
        { id: 'ginasio', icon: '🏟', label: 'Ginásio' },
        { id: 'invasao', icon: '🚀', label: 'Invasão' },
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
            case 'guild': {
                if (!guildOn(d)) return 'off';
                if (!temAlertas) return 'warn';
                if (guildRouteOn(d) && !guildReturnTarget(d).slug) return 'warn';   // v3.46.0: rota sem hunt de volta
                return 'on';
            }
            case 'farm': {
                if (!d.farmEnabled) return 'off';
                if (!farmList(d).length || !temAlertas) return 'warn';
                return 'on';
            }
            case 'ginasio': {
                if (!d.gymEnabled) return 'off';
                if (d.gymAlerts !== false && !temAlertas) return 'warn';
                return 'on';
            }
            case 'invasao': {
                if (!d.invEnabled && !d.invJennyEnabled) return 'off';
                if (d.invJennyEnabled && !invJennyOffer(d)) return 'warn';   // troca ligada sem oferta escolhida
                if (d.invAlerts !== false && !temAlertas) return 'warn';
                return 'on';
            }
            case 'sistema': return holdActive() ? 'warn' : d.reloadEnabled ? 'on' : 'off';   // v3.44.0: esperando na cidade de propósito = ⚠ para não esquecer
        }
        return 'off';
    }
    function stateSummary(d) {
        const rota = Array.isArray(d.route) ? d.route.filter(r => r && r.slug && Number(r.level) > 0) : [];
        const st = Number(cfg.routeStage) || 0;
        return [
            `Avisos: ${d.notifyEveryCapture ? 'toda captura' : (d.watchList && d.watchList.length ? `lista (${d.watchList.length})` : 'todas')}${d.notifyShiny ? ' + shiny' : ''}${d.lockNotified ? ' + 🔒' : ''}${d.familyNotified ? ' + 📦' : ''}`,
            `Bolas: ${!((Number(d.ballsMin) || 0) > 0 || d.autoBuy) ? 'desligado' : `${d.ballsWatch && d.ballsWatch !== 'auto' ? ballName(Number(d.ballsWatch)) : 'em uso'} < ${Number(d.ballsMin) || (d.autoBuy ? 1 : 0)}${d.autoBuy ? ' + compra' : ''}`}${supplyOn(d) ? ` · refil: ${supplySlots(d).map(s => `${s.name} < ${s.min}`).join(', ')}` : ''}${d.healJoyEnabled ? ' · Joy' : ''}${d.cityIdleEnabled ? ` · volta da cidade ${Number(d.cityIdleMin) || IDLE_MIN_DEFAULT} min${idleDefaultSlug(d) ? ` (padrão ${idleDefaultSlug(d)})` : ''}` : ''}`,
            `Venda: ${[d.sellEnabled ? `${Object.keys(d.sellItems || {}).length} drops` : '', d.pokeSellEnabled ? `Pokémon (${TIERS.filter(t => pokeSellLimit(d, t.key) > 0).length} raridades${pokeSellKeepQ(d) ? `, guarda ≥ ${pokeSellKeepQ(d)}` : ''})` : '', depositWanted(d) ? 'guardar' : ''].filter(Boolean).join(' + ') || 'desligada'} · viagem ${d.tripEveryMin}${d.tripEveryMaxMin > d.tripEveryMin ? `–${d.tripEveryMaxMin}` : ''} min`,
            `Treino: ${[d.routeEnabled && rota.length ? (st >= rota.length ? 'rota concluída' : `rota${cfg.routeName ? ` "${cfg.routeName}"` : ''} ${st + 1}/${rota.length}`) : ((Number(d.levelAlertAt) || 0) ? `nível ${d.levelAlertAt}${d.levelSwap ? ' + troca' : ''}` : ''), d.dailyEnabled ? (d.dailyAuto ? `daily sozinha (${dailyAreas(d).join('+')})` : 'daily') : '', d.giftEnabled ? 'gift' : '', d.evolveEnabled ? 'evolução' : '', d.slotEnabled ? 'slot machine' : '', bossOn(d) ? `auto boss${d.bossResumeOnLoss ? ' (até após derrota)' : ''}` : ''].filter(Boolean).join(' + ') || 'desligado'}`,
            `Profissão: ${[d.catchRouteEnabled ? `rota de captura (${(Array.isArray(d.catchRouteAreas) && d.catchRouteAreas.length ? d.catchRouteAreas : ['kanto']).join('+')}${Number(d.catchRouteMaxLevel) ? ` até lv ${d.catchRouteMaxLevel}` : ''}${d.catchRouteAuto ? ', bola auto' : ''})` : '', d.clanEnabled ? `clã ${clanName(d.clanKey)}${d.clanRoute ? ' + caça' : ''}` : ''].filter(Boolean).join(' + ') || 'desligada'}`,
            `Breeding: ${d.breedEnabled ? `${breedActiveLines(d).length} ${breedActiveLines(d).length === 1 ? 'linhagem' : 'linhagens'}${d.breedDouble ? ' + dobrar' : ''}${d.breedFoodBreed ? ' + cria comida' : ''}` : 'desligado'}`,
            `Guild: ${[guildDonateWanted(d) > 0 ? `doa ${guildN(guildDonateWanted(d))}/dia` : '', d.guildTributeEnabled ? 'tributo' : '', d.guildFarmTribute ? 'farma tributo' : '', d.guildHuntEnabled ? 'caça' : '', d.guildFishEnabled ? 'pesca' : '', guildRouteOn(d) ? `ordem ${guildOrderText(d)}` : '', d.guildAlerts ? 'avisos' : ''].filter(Boolean).join(' + ') || 'desligada'}`,
            `Farm: ${d.farmEnabled && farmList(d).length ? `${farmList(d).filter(farmEntryDone).length}/${farmList(d).length} itens` : 'desligado'}`,
            `Ginásios: ${d.gymEnabled ? ['insígnias', d.gymBonus !== false ? 'bônus' : '', d.gymRedo !== false ? 'refaz a cada 48 h' : ''].filter(Boolean).join(' + ') : 'desligados'}`,
            `Invasão: ${d.invEnabled ? `entra${invHours(d).length ? ` às ${invHours(d).map(h => `${h}h`).join(', ')}` : ' em toda janela'}${invKeepEnergy(d) ? `, reserva ${invKeepEnergy(d)}` : ''}` : 'desligada'}${d.invJennyEnabled ? ` + Jenny (${invJennyOffer(d) || 'sem oferta'})` : ''}`,
            `Recarga: ${d.reloadEnabled ? `${d.reloadEveryMin}${d.reloadEveryMaxMin > d.reloadEveryMin ? `–${d.reloadEveryMaxMin}` : ''} min` : 'desligada'}`,
            holdActive() ? '⏸ esperando na cidade (botão do painel)' : '',
        ].filter(Boolean).join(' · ');
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
        const hookInput = (id, help) => `<label class="dn-field"><span>${id === 'hook' ? 'Capturas' : id === 'hook-shiny' ? 'Shinys' : id === 'hook-alerts' ? 'Alertas' : id === 'hook-human' ? 'Captcha' : 'Nível'}</span>
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
                            ${hookInput('hook-human', 'Verificação humana (captcha da Cloudflare) pendente e resolvida. Vazio = vai para Alertas.')}
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
                        <label class="dn-field"><span>Hunt padrão</span><input id="pg-dn-cityidle-hunt" class="dn-input" type="text" placeholder="ex.: rhyhorn — usada quando não sei de que hunt a conta veio" spellcheck="false"></label>
                        <div class="dn-status" id="pg-dn-cityidle-status"></div>
                        <p class="dn-help">Se a conta ficar esse tempo na cidade sem farmar (a volta da viagem ou da recarga não pegou, o jogo mandou para a cidade, você saiu e esqueceu), a conta está bugada: o script cura o time na Nurse Joy e volta para a hunt: a da rota do clã, a etapa da rota de treino, a última em que esteve ou, sem nenhuma delas, a hunt padrão (também vale para a volta da viagem e da cura). Não mexe durante viagem, cura, troca de hunt ou de líder; a rota de captura já tem a própria volta. Não volta se a Joy não curar. Voltou 3 vezes em 1 h sem a hunt pegar: para e avisa. Avisos no canal de Alertas.</p>
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
                        <p class="dn-help">Nunca vende: no time, inicial, shiny, com nível acima de 1, com cadeado 🔒, anunciado no mercado, capturado há menos de 2 min ou com qualidade igual ou acima do piso abaixo. Vazio = essa raridade não vende. A proteção de venda do PokeGrid não pergunta nas vendas do script.</p>
                        <div class="dn-tiers">${TIERS_ASC.map(t => `<label for="pg-dn-psell-${t.key}"><span class="dn-chip" style="--c:#${t.color.toString(16).padStart(6, '0')}">${t.name}</span></label><span class="dn-inline">poder &lt; <input id="pg-dn-psell-${t.key}" class="dn-input dn-input--sm pg-dn-psell-lim" data-tier="${t.key}" type="number" min="0" max="${IV_MAX}" step="1" placeholder="—"></span>`).join('')}</div>
                        <p class="dn-help">Poder = 0 a ${IV_MAX}.</p>
                        <label class="dn-field"><span>Guardar com qualidade a partir de</span><input id="pg-dn-psell-keepq" class="dn-input dn-input--sm" type="number" min="0" step="0.01" placeholder="0 = desligado"></label>
                        <p class="dn-help">Qualidade = multiplicador do indivíduo (Common 1.0, Rare 1.3, Epic 1.5, Legendary 1.7, Mythic 2.0…). Ex.: 1.79 guarda todo Pokémon com qualidade 1.79 ou mais, qualquer que seja o poder, mesmo com limite na raridade dele.</p>
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
                        <div class="dn-inline" id="pg-dn-daily-areas">Regiões aceitas: ${DAILY_AREAS_ALL.map(a => `<label class="dn-toggle dn-toggle--sm"><input type="checkbox" class="pg-dn-daily-area" value="${a}"><span class="sw"></span>${a}</label>`).join('')} <span class="dn-hint">(missão com hunt só em região desmarcada não é escolhida nem feita)</span></div>
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
                        <label class="dn-toggle"><input id="pg-dn-evolve" type="checkbox"><span class="sw"></span>Evoluir sozinho quem do time chegar ao nível <span class="dn-hint">(só com pedra; mantém o nível)</span></label>
                        <label class="dn-toggle"><input id="pg-dn-evolve-depot" type="checkbox"><span class="sw"></span>Buscar as pedras que faltam no Depot comum <span class="dn-hint">(traz a pilha inteira para a mochila)</span></label>
                        <label class="dn-toggle"><input id="pg-dn-evolve-family" type="checkbox"><span class="sw"></span>Buscar as pedras que faltam no depósito da família <span class="dn-hint">(só a quantidade que falta; gasta movimentos do dia)</span></label>
                        <p class="dn-help">Quando um Pokémon do time chega ao nível de evolução, o script pede uma viagem à cidade (o jogo só deixa evoluir em Cerulean), evolui gastando as pedras do elemento e volta para a hunt. Pedra que falta na mochila é buscada primeiro no Depot comum e depois na família (se marcados), só quando as duas fontes juntas completam a conta. Sem as pedras não evolui (a evolução grátis volta ao Lv.1) e avisa uma vez; tenta de novo nas próximas viagens. Linha ramificada (Eevee) só evolui se houver pedra para um destino só. Aviso no canal de Alertas.</p>
                        <div class="dn-status"><span>🧬</span><span id="pg-dn-evolve-status"></span></div>
                    </div>
                    <div class="dn-section">
                        <h3>Poke Slot Machine</h3>
                        <label class="dn-toggle"><input id="pg-dn-slot" type="checkbox"><span class="sw"></span>Girar a máquina de graça e ativar o bônus sozinho <span class="dn-hint">(nunca gasta Poke Slot Cards)</span></label>
                        <label class="dn-field"><span>Pokémon pedidos, em ordem de preferência</span><input id="pg-dn-slot-wanted" class="dn-input" type="text" placeholder="ex.: Dratini, Larvitar, Bagon — vazio = qualquer um" spellcheck="false"></label>
                        <p class="dn-help">A Poke Slot Machine fica no shopping: cada slot tem um roll grátis a cada 12 h (depois custa 1 Poke Slot Card) e sorteia 9 Pokémon; o escolhido ganha um bônus (EXP, loot, captura, dano…) de +5% a +35% conforme a raridade, que só vale contra aquela espécie, por algumas horas. Quando um slot liberado estiver com o roll grátis pronto, o script pede uma viagem à cidade, vai ao shopping, gira e escolhe o primeiro da lista acima que tiver saído no sorteio; se nenhum saiu, escolhe um dos 9 ao acaso. Uma estrela ativa de um Pokémon pedido não é trocada antes de expirar. Aviso no canal de Alertas.</p>
                        <div class="dn-status"><span>🎰</span><span id="pg-dn-slot-status"></span></div>
                    </div>
                    <div class="dn-section">
                        <h3>Auto Boss</h3>
                        <label class="dn-toggle"><input id="pg-dn-boss" type="checkbox"><span class="sw"></span>Retomar o Auto Boss do jogo quando ele parar sem terminar <span class="dn-hint">(erro na próxima luta, saiu da arena, queda da conexão)</span></label>
                        <label class="dn-toggle"><input id="pg-dn-boss-loss" type="checkbox"><span class="sw"></span>Retomar também depois de derrota <span class="dn-hint">(cura na Joy antes; cada derrota perde 1 token)</span></label>
                        <label class="dn-toggle"><input id="pg-dn-boss-alerts" type="checkbox"><span class="sw"></span>Avisar no canal de Alertas <span class="dn-hint">(retomada, desistência e fim)</span></label>
                        <p class="dn-help">Inicie o Auto Boss no próprio jogo (Bosses → ⟳ Auto Boss, estando numa cidade). O script guarda o boss e a quantidade pedida e, se o jogo parar antes de acabar a fila (erro na próxima luta, saiu da arena, queda da conexão), sai da hunt, cura na Joy, confere os tokens na mochila e pede de novo só as lutas que faltam. "Concluído", "tokens acabaram" e o seu "Parar" encerram. Enquanto o Auto Boss roda, viagem à cidade, parada na cidade, recarga, rotas e troca de líder esperam (qualquer saída da arena encerra o Auto Boss). Até 3 tentativas por parada e 10 retomadas por sessão; depois avisa e desiste.</p>
                        <div class="dn-status"><span>👹</span><span id="pg-dn-boss-status"></span></div>
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
                        <div class="dn-inline">🔒 Fora da venda e do depósito, por linhagem, até <input id="pg-dn-breed-keepmax" class="dn-input dn-input--sm" type="number" min="0" max="3000"> da espécie <span class="dn-hint">(0 = todos que ainda podem servir ou são tão bons quanto quem sobe)</span></div>
                        <p class="dn-help">Quem sobe nunca é vendido. Dos outros da espécie ficam guardados, até esse teto, primeiro quem serve de comida hoje (maior quality primeiro: serve por mais gerações), depois quem é tão bom quanto quem sobe; o resto segue as regras da aba Venda (shiny, nível > 1 e o piso de qualidade continuam valendo). Sem teto, com quem sobe de quality baixa, quase toda captura ficava guardada e o box enchia até o jogo parar de mandar a lista.</p>
                    </div>
                    <div class="dn-section">
                        <h3>🍖 Quem vira comida</h3>
                        <div class="dn-inline">Mesma espécie, com quality <b>e</b> IV menores que quem sobe, e IV abaixo de <input id="pg-dn-breed-ivmax" class="dn-input dn-input--sm" type="number" min="0" max="192"> <span class="dn-hint">(0 = sem teto)</span></div>
                        <label class="dn-toggle"><input id="pg-dn-breed-family" type="checkbox"><span class="sw"></span>Pegar da família também <span class="dn-hint">(comida e stones; a retirada acontece na viagem à cidade)</span></label>
                        <label class="dn-toggle"><input id="pg-dn-breed-double" type="checkbox"><span class="sw"></span>Dobrar stones <span class="dn-hint">(40 em vez de 20; 5% de chance de +1 IV no filho)</span></label>
                        <label class="dn-toggle"><input id="pg-dn-breed-foodbreed" type="checkbox"><span class="sw"></span>Criar comida quando nenhuma servir <span class="dn-hint">(cruza o melhor da espécie abaixo da faixa com um mais fraco, geração a geração, até a quality dele entrar na faixa de quem sobe; cada ovo custa gold + stones e usa o slot que quem sobe não está usando)</span></label>
                        <div class="dn-status col" id="pg-dn-breed-food"></div>
                        <p class="dn-help">O jogo só aceita par com até 0,15 de diferença de quality. Shiny, time, inicial, Ditto, travado e anunciado no mercado nunca viram comida. Usa primeiro a comida mais fraca que serve (a de quality baixa deixa de servir quando quem sobe cresce). A lista acima vem do último frame do box e da última leitura da família (botão ↻ acima); com quem sobe dentro do ovo ela é uma prévia. "Criar comida": quando quem sobe passa de uma quality que captura nenhuma alcança (ex.: Q 1,96 só come Q 1,81–1,96), o script escolhe o melhor da espécie abaixo da faixa (IV menor que o de quem sobe, porque o filho herda o IV dele) e sobe a quality dele com comida própria até servir; quem sobe espera parado e come o resultado. Quem vira comida e a faixa dele também ficam fora da venda. Desde 26/10/2026 o jogo só cota e cruza quem está na aba <b>Breeding Box</b> do Depósito: na viagem o script separa quem sobe e a comida lá antes de cotar (quem está na Breeding Box não é vendido nem vai para a família; os filhotes nascem lá).</p>
                    </div>
                </section>
                <section class="dn-pane" data-pane="guild" hidden>
                    <div class="dn-section">
                        <h3>🛡 Guild</h3>
                        <p class="dn-help">O script lê a guild 6 s depois de conectar, a cada 30 min e quando o jogo avisa que algo mudou. Tudo pelo socket, sem viagem à cidade. Talentos, convites, cargos, brasão e dissolver ficam com você, sempre.</p>
                        <div class="dn-status col" id="pg-dn-guild-status"></div>
                        <div class="dn-actions"><button type="button" class="dn-btn dn-btn--ghost dn-btn--sm" id="pg-dn-guild-refresh" title="Pede o estado da guild ao jogo agora.">Atualizar guild</button></div>
                    </div>
                    <div class="dn-section">
                        <h3>💰 Doação diária de gold</h3>
                        <div class="dn-inline">Doar por dia <input id="pg-dn-guild-donate" class="dn-input dn-input--sm" type="number" min="0" step="1000"> gold <span class="dn-hint">(0 = não doa; o jogo limita a 500.000 por membro por dia)</span></div>
                        <div class="dn-inline">Deixar sempre na conta <input id="pg-dn-guild-keep" class="dn-input dn-input--sm" type="number" min="0" step="100000"> gold <span class="dn-hint">(não doa o que faria o gold cair abaixo disto; 0 = sem reserva)</span></div>
                        <p class="dn-help">O gold doado conta para desbloquear a próxima vaga da guild. O script doa o que falta até o valor acima (respeitando o teto do dia e a reserva) assim que lê a guild; a resposta do jogo é conferida pelo próprio frame e o resultado vai para o canal de Alertas. Erro = espera 1 h antes de tentar de novo.</p>
                    </div>
                    <div class="dn-section">
                        <h3>🏺 Tributo do Dia</h3>
                        <label class="dn-toggle"><input id="pg-dn-guild-tribute" type="checkbox"><span class="sw"></span>Depositar o item do dia que estiver na mochila</label>
                        <div class="dn-inline">Guardar <input id="pg-dn-guild-tribute-keep" class="dn-input dn-input--sm" type="number" min="0" step="1"> na mochila <span class="dn-hint">(0 = deposita tudo)</span></div>
                        <p class="dn-help">O item e a meta (2.000–4.000) mudam todo dia; fechar o tributo dá pontos e 15 min de +50% (XP, Loot ou Captura) para quem está online. Enquanto o tributo do dia está aberto, o item fica fora da venda automática e do guardar na cidade. Deposita ao ler a guild e relê até 5 min depois de um drop do item.</p>
                    </div>
                    <div class="dn-section">
                        <h3>🎯 Caçar e pescar para a guild</h3>
                        <label class="dn-toggle"><input id="pg-dn-guild-hunt" type="checkbox"><span class="sw"></span>Caçar a espécie da caçada "Derrotar" <span class="dn-hint">(vai para a hunt da espécie até a meta fechar)</span></label>
                        <label class="dn-toggle"><input id="pg-dn-guild-fish" type="checkbox"><span class="sw"></span>Pescar para a caçada "Pescar peixes" <span class="dn-hint">(faixa natural da sua skill, na hunt de pesca)</span></label>
                        <label class="dn-toggle"><input id="pg-dn-guild-farm" type="checkbox"><span class="sw"></span>Farmar o item do Tributo do Dia <span class="dn-hint">(vai para a hunt que mais dropa o item e deposita, mesmo com o depósito acima desligado)</span></label>
                        <div class="dn-inline">Prioridade <select id="pg-dn-guild-order" class="dn-input">
                            <option value="tributo,fish,kill">tributo → pesca → "Derrotar"</option>
                            <option value="tributo,kill,fish">tributo → "Derrotar" → pesca</option>
                            <option value="fish,tributo,kill">pesca → tributo → "Derrotar"</option>
                            <option value="fish,kill,tributo">pesca → "Derrotar" → tributo</option>
                            <option value="kill,tributo,fish">"Derrotar" → tributo → pesca</option>
                            <option value="kill,fish,tributo">"Derrotar" → pesca → tributo</option>
                        </select> <span class="dn-hint">(o 1º objetivo ligado e ainda aberto vence; os outros entram quando ele fecha)</span></div>
                        <div class="dn-status"><span>🧭</span><span id="pg-dn-guild-route"></span></div>
                        <p class="dn-help">A prioridade acima decide para onde a conta vai quando mais de um objetivo está ligado e aberto. É a 4ª rota que manda na hunt: ligar aqui desliga a rota de treino, a de captura e a do clã (e vice-versa). A Daily Kill tem prioridade. Quando os objetivos fecham, o dia reinicia ou você desliga, a conta volta para a hunt em que estava (lembrada mesmo depois de recarregar a página; sem ela, vai para a "Hunt padrão" de Compras → Parada na cidade) e avisa no canal de Alertas. Hunt acima do nível do time é pulada. Cada membro conta só até um teto por caçada ("Sua parte" na janela da guild, 40% da meta): quando a sua parte fecha, a conta passa para o próximo objetivo ou volta para a hunt de origem em vez de ficar na hunt sem contar.</p>
                    </div>
                    <div class="dn-section">
                        <h3>🔔 Avisos da guild</h3>
                        <label class="dn-toggle"><input id="pg-dn-guild-alerts" type="checkbox"><span class="sw"></span>Avisar no canal de Alertas: caçada, daily e tributo concluídos, dia perfeito, tier, vaga nova e convites</label>
                        <p class="dn-help">A guild é a mesma nas 4 contas: ligue isto em UM painel só, senão cada aviso chega 4 vezes. Esses avisos saem quando o jogo manda o estado da guild (a cada 30 min ou quando algo muda), por isso podem atrasar. As doações, os depósitos e o fim da rota de cada conta (voltou para qual hunt) avisam sempre (canal de Alertas).</p>
                    </div>
                </section>
                <section class="dn-pane" data-pane="farm" hidden>
                    <div class="dn-section">
                        <h3>🎒 Farm por lista</h3>
                        <label class="dn-toggle"><input id="pg-dn-farm" type="checkbox"><span class="sw"></span>Dropar a lista abaixo, um item de cada vez</label>
                        <textarea id="pg-dn-farm-list" class="dn-textarea" rows="5" placeholder="1000 Magikarp Fin @ magikarp&#10;500 Seed @ Grovyle&#10;200 Feather" spellcheck="false"></textarea>
                        <p class="dn-help">Uma linha por item: <b>quantidade item @ monstro</b> (ex.: <b>1000 Magikarp Fin @ magikarp</b>). O monstro é o nome da hunt (o mesmo de "Hunt atual") ou da espécie; sem <b>@ monstro</b> o script escolhe a hunt que mais dropa o item até o nível do time. Conta os drops que caem nos abates (não o que já está na mochila) e, ao fechar a quantidade, passa para a próxima linha; no fim volta para a hunt em que estava. O progresso fica salvo e sobrevive à recarga.</p>
                        <div class="dn-status col"><div id="pg-dn-farm-status"></div><ol class="dn-route" id="pg-dn-farm-items"></ol></div>
                        <div class="dn-actions">
                            <button type="button" class="dn-btn dn-btn--ghost dn-btn--sm" id="pg-dn-farm-skip" title="Marca o item atual como feito (quantidade = contado) e passa para o próximo.">Pular item atual</button>
                            <button type="button" class="dn-btn dn-btn--ghost dn-btn--sm" id="pg-dn-farm-reset" title="Zera o contado de todos os itens e recomeça pela 1ª linha.">Zerar contagem</button>
                        </div>
                        <p class="dn-help">É a 5ª rota que manda na hunt: ligar aqui desliga a rota de treino, a de captura, a do clã e a da guild (e vice-versa). A Daily Kill, a viagem à cidade e a cura têm prioridade. Enquanto o farm está ligado, os itens da lista ficam fora da venda automática de drops e do guardar na cidade. Linha com monstro que não existe ou hunt em que a conta não consegue entrar é pulada com aviso (canal de Alertas) e a lista segue.</p>
                    </div>
                </section>
                <section class="dn-pane" data-pane="ginasio" hidden>
                    <div class="dn-section">
                        <h3>🏟 Ginásios: insígnias e Recompensa bônus</h3>
                        <label class="dn-toggle"><input id="pg-dn-gym" type="checkbox"><span class="sw"></span>Conquistar as insígnias que faltam sozinho <span class="dn-hint">(modo Insígnia, com o time atual; 18 ginásios)</span></label>
                        <label class="dn-toggle"><input id="pg-dn-gym-bonus" type="checkbox"><span class="sw"></span>Resgatar a Recompensa bônus depois de vencer <span class="dn-hint">(pedras de evolução; libera a cada 48 h)</span></label>
                        <label class="dn-toggle"><input id="pg-dn-gym-redo" type="checkbox"><span class="sw"></span>Refazer o ginásio quando a Recompensa bônus liberar de novo <span class="dn-hint">(a cada 48 h: "Vença o ginásio de novo")</span></label>
                        <label class="dn-toggle"><input id="pg-dn-gym-alerts" type="checkbox"><span class="sw"></span>Avisar no canal de Alertas <span class="dn-hint">(insígnia, derrota, bônus, outfit das 18)</span></label>
                        <p class="dn-help">Cada insígnia dá +1% de XP e +1% de drop (as 18 dão +18% e a Gym Champion Outfit). A luta é resolvida na hora pelo servidor com o seu time atual contra os 6 Pokémon lv 400 do líder; não há golpe a escolher. Quando um ginásio aberto sem insígnia estiver fora do cooldown (10 min após cada desafio), o script pede uma viagem à cidade, desafia um a um, resgata a Recompensa bônus que a vitória libera e volta para a hunt. Depois de uma derrota espera 2 h (dobrando a cada derrota seguida, até 24 h): o time precisa ficar mais forte. Liderança de ginásio fica de fora.</p>
                        <div class="dn-actions"><button type="button" class="dn-btn dn-btn--sm" id="pg-dn-gym-now" title="Na cidade: desafia os ginásios prontos agora. Na hunt: pede a viagem à cidade.">⚔ Desafiar agora</button></div>
                        <div class="dn-status"><span>🏟️</span><span id="pg-dn-gym-status"></span></div>
                    </div>
                </section>
                <section class="dn-pane" data-pane="invasao" hidden>
                    <div class="dn-section">
                        <h3>🚀 Invasão Rocket: entrar sozinho e voltar para a hunt</h3>
                        <label class="dn-toggle"><input id="pg-dn-inv" type="checkbox"><span class="sw"></span>Entrar na invasão de Cerulean a cada janela <span class="dn-hint">(horas pares de Brasília; 10 min para entrar, 30 min de invasão; 1 Energia Vermelha por entrada)</span></label>
                        <label class="dn-field"><span>Só nestas horas</span><input id="pg-dn-inv-hours" class="dn-input" type="text" placeholder="ex.: 0, 12, 20 — horas pares de Brasília; vazio = toda invasão" spellcheck="false"></label>
                        <div class="dn-inline">Não entrar com Energia Vermelha em <input id="pg-dn-inv-keep" class="dn-input dn-input--sm" type="number" min="0" max="10" step="1" placeholder="0"> ou menos <span class="dn-hint">(2 por dia, acumula 10; o script não compra com diamantes)</span></div>
                        <label class="dn-toggle"><input id="pg-dn-inv-alerts" type="checkbox"><span class="sw"></span>Avisar no canal de Alertas <span class="dn-hint">(fim da rodada com wave, Rockets, XP e Plans; recusa; trocas na Jenny)</span></label>
                        <p class="dn-help">A dificuldade é escolhida pelo jogo pelo nível do Pokémon mais forte do time (Kanto, Outland, Orre, Nightmare); não há vantagem de tipo. O script sai da hunt, entra pela mesma mensagem do botão INVASÃO, acompanha a rodada (wave e Rockets derrubados) e, quando ela acaba (time caiu, 30 min, 3 min sem abate), cura na Joy se preciso e volta para a hunt de onde saiu. Enquanto dura, viagem à cidade, parada na cidade, recarga, rotas e troca de líder esperam — sair encerra a rodada. Entrada feita na mão pelo botão da tela também é acompanhada e volta.</p>
                        <div class="dn-actions"><button type="button" class="dn-btn dn-btn--sm" id="pg-dn-inv-now" title="Com a entrada aberta: entra agora (ignora a lista de horas e a reserva de energia).">🚀 Entrar agora</button></div>
                        <div class="dn-status"><span>🚀</span><span id="pg-dn-inv-status"></span></div>
                    </div>
                    <div class="dn-section">
                        <h3>👮 Officer Jenny: trocar Rocket Plans</h3>
                        <label class="dn-toggle"><input id="pg-dn-inv-jenny" type="checkbox"><span class="sw"></span>Trocar os Plans pela oferta abaixo na viagem à cidade <span class="dn-hint">(a Jenny fica no Shopping; repete enquanto o saldo der)</span></label>
                        <div class="dn-inline">Oferta <select id="pg-dn-inv-jenny-offer" class="dn-input"><option value="">(nenhuma)</option></select></div>
                        <div class="dn-inline">Guardar <input id="pg-dn-inv-jenny-keep" class="dn-input dn-input--sm" type="number" min="0" step="100" placeholder="0"> Plans <span class="dn-hint">(nunca troca abaixo disto)</span></div>
                        <p class="dn-help">Anúncio do jogo: 100 Idle Balls 200 Plans · Bronze Boss Token 1.500 · outfit Police Recruit 5.000 · Police Officer 10.000 · Police Bravery Medal 15.000 (+2 IV, uma por Pokémon, para sempre; nunca em Pokémon que passou pelo mercado, troca ou baú da família — o script só compra a medalha; em quem usar é com você). A lista de ofertas vem da própria janela da Jenny na 1ª leitura (ligue a troca para ler).</p>
                        <div class="dn-actions"><button type="button" class="dn-btn dn-btn--sm" id="pg-dn-inv-jenny-now" title="Na cidade: troca agora. Na hunt: pede a viagem à cidade.">👮 Trocar agora</button></div>
                        <div class="dn-status"><span>👮</span><span id="pg-dn-inv-jenny-status"></span></div>
                    </div>
                </section>
                <section class="dn-pane" data-pane="sistema" hidden>
                    <div class="dn-section">
                        <h3>⏸ Esperar na cidade</h3>
                        <p class="dn-help">Para a conta ficar parada na cidade de propósito (ex.: Pokémon emprestado de outra conta). Sai da hunt agora e segura tudo o que mandaria a conta de volta: parada na cidade, volta da viagem, cura, recarga e rotas. Se a tela religar a hunt, o script sai de novo. Fica ligado até você clicar em Voltar (sobrevive à recarga do painel; não entra no Exportar). Viagens à cidade para vender/comprar seguem normais.</p>
                        <div class="dn-status"><span>⏸</span><span id="pg-dn-hold-status"></span></div>
                        <div class="dn-actions"><button type="button" class="dn-btn dn-btn--primary" id="pg-dn-hold">⏸ Ficar parado na cidade</button></div>
                    </div>
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
            const farm = parseFarmText($('#pg-dn-farm-list').value, cfg.farmList);
            const lv = $('#pg-dn-level');
            const draft = {
                farmEnabled: $('#pg-dn-farm').checked,
                farmList: farm.list,
                webhookUrl: $('#pg-dn-hook').value.trim(),
                webhookShiny: $('#pg-dn-hook-shiny').value.trim(),
                webhookAlerts: $('#pg-dn-hook-alerts').value.trim(),
                webhookLevel: $('#pg-dn-hook-level').value.trim(),
                webhookHuman: $('#pg-dn-hook-human').value.trim(),
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
                dailyAreas: [...panel.querySelectorAll('.pg-dn-daily-area:checked')].map(c => c.value),
                giftEnabled: $('#pg-dn-gift').checked,
                evolveEnabled: $('#pg-dn-evolve').checked,
                evolveFromDepot: $('#pg-dn-evolve-depot').checked,
                evolveFromFamily: $('#pg-dn-evolve-family').checked,
                slotEnabled: $('#pg-dn-slot').checked,
                slotWanted: $('#pg-dn-slot-wanted').value.trim(),
                gymEnabled: $('#pg-dn-gym').checked,
                gymBonus: $('#pg-dn-gym-bonus').checked,
                gymRedo: $('#pg-dn-gym-redo').checked,
                gymAlerts: $('#pg-dn-gym-alerts').checked,
                invEnabled: $('#pg-dn-inv').checked,
                invHours: $('#pg-dn-inv-hours').value.trim(),
                invKeepEnergy: Math.max(0, Math.min(10, parseInt($('#pg-dn-inv-keep').value, 10) || 0)),
                invAlerts: $('#pg-dn-inv-alerts').checked,
                invJennyEnabled: $('#pg-dn-inv-jenny').checked,
                invJennyOffer: $('#pg-dn-inv-jenny-offer').value,
                invJennyKeep: Math.max(0, parseInt($('#pg-dn-inv-jenny-keep').value, 10) || 0),
                bossResumeEnabled: $('#pg-dn-boss').checked,
                bossResumeOnLoss: $('#pg-dn-boss-loss').checked,
                bossAlerts: $('#pg-dn-boss-alerts').checked,
                breedEnabled: $('#pg-dn-breed').checked,
                breedLines: readBreedLines(),
                breedFoodIvMax: Math.max(0, Math.min(IV_MAX, parseInt($('#pg-dn-breed-ivmax').value, 10) || 0)),
                breedKeepMax: Math.max(0, parseInt($('#pg-dn-breed-keepmax').value, 10) || 0),
                breedFamily: $('#pg-dn-breed-family').checked,
                breedDouble: $('#pg-dn-breed-double').checked,
                breedFoodBreed: $('#pg-dn-breed-foodbreed').checked,
                guildDonateGold: Math.max(0, parseInt($('#pg-dn-guild-donate').value, 10) || 0),
                guildDonateKeep: Math.max(0, parseInt($('#pg-dn-guild-keep').value, 10) || 0),
                guildTributeEnabled: $('#pg-dn-guild-tribute').checked,
                guildTributeKeep: Math.max(0, parseInt($('#pg-dn-guild-tribute-keep').value, 10) || 0),
                guildAlerts: $('#pg-dn-guild-alerts').checked,
                guildHuntEnabled: $('#pg-dn-guild-hunt').checked,
                guildFishEnabled: $('#pg-dn-guild-fish').checked,
                guildFarmTribute: $('#pg-dn-guild-farm').checked,
                guildRouteOrder: guildRouteOrder({ guildRouteOrder: $('#pg-dn-guild-order').value }),
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
                cityIdleHunt: huntSlugFromName($('#pg-dn-cityidle-hunt').value),
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
                pokeSellKeepQuality: pokeSellKeepQ({ pokeSellKeepQuality: $('#pg-dn-psell-keepq').value }),
                tripCity: $('#pg-dn-trip-city').value || 'cerulean',
                reloadEnabled: $('#pg-dn-reload').checked,
                reloadEveryMin: Math.max(1, parseInt($('#pg-dn-reload-min').value, 10) || 60),
                reloadEveryMaxMin: Math.max(0, parseInt($('#pg-dn-reload-max').value, 10) || 0),
            };
            return { draft, linhasRuins, farmRuins: farm.ruins };
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
            el.innerHTML = [['hook', 'Capturas'], ['hook-shiny', 'Shinys'], ['hook-alerts', 'Alertas'], ['hook-level', 'Nível'], ['hook-human', 'Captcha']]
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
            sum.textContent = `· ${nLim} raridades com limite${pokeSellKeepQ(d) ? ` · guarda qualidade ≥ ${pokeSellKeepQ(d)}` : ''} · ${cand.length} ${cand.length === 1 ? 'seria vendido' : 'seriam vendidos'}${d.pokeSellEnabled ? '' : ' · desligado'}`;
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
        function renderGym() {
            const d = current();
            $('#pg-dn-gym-status').textContent = `Ginásios${d.gymEnabled ? '' : ' (desligados)'}: ${gymStatus(d)}`;
        }
        onGymChange = () => { if (!panel.hidden) renderGym(); };
        function renderBoss() {
            const d = current();
            $('#pg-dn-boss-status').textContent = `Auto Boss: ${bossStatus(d)}`;
        }
        onBossChange = () => { if (!panel.hidden) renderBoss(); };
        // ---- Invasão Rocket (v3.50.0) ----
        function renderInvOffers(selected) {
            const sel = $('#pg-dn-inv-jenny-offer');
            const atual = selected != null ? selected : sel.value;
            const offers = invJenny?.offers || [];
            const opts = ['<option value="">(nenhuma)</option>'];
            for (const o of offers) opts.push(`<option value="${escHtml(o.key)}">${escHtml(o.name)} — ${fmtNum(o.cost)} Plans${o.owned ? ' (já tem)' : ''}</option>`);
            if (atual && !offers.some(o => o.key === atual)) opts.push(`<option value="${escHtml(atual)}">${escHtml(atual)}${offers.length ? ' (não está na lista)' : ''}</option>`);
            sel.innerHTML = opts.join('');
            sel.value = atual || '';
        }
        function renderInv() {
            const d = current();
            $('#pg-dn-inv-status').textContent = `Invasão${d.invEnabled ? '' : ' (desligada)'}: ${invStatus(d)}`;
            const sel = $('#pg-dn-inv-jenny-offer');
            if (invJenny?.offers?.length && sel.options.length < invJenny.offers.length + 1) renderInvOffers();   // ofertas chegaram depois do fill
            $('#pg-dn-inv-jenny-status').textContent = `Jenny: ${invJennyStatus(d)}`;
            if (d.invJennyEnabled && !invJenny && !invJennyFailedAt && !invJennyWorking) invJennyRead('painel');   // lista as ofertas para o menu
        }
        onInvChange = () => { if (!panel.hidden) renderInv(); };
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
        function renderGuild() {
            const linhas = guildStatus(current());
            $('#pg-dn-guild-status').innerHTML = linhas.map(l => `<div class="${l.ok ? 'ok' : (l.dim ? 'dim' : '')}">${breedEsc(l.text)}</div>`).join('') || '<div class="dim">—</div>';
            $('#pg-dn-guild-route').textContent = guildRouteLine(current());
        }
        onGuildChange = () => { if (!panel.hidden) renderGuild(); };
        // ---- Farm por lista (v3.33.0) ----
        function renderFarm() {
            const d = current();
            const { list, ruins } = parseFarmText($('#pg-dn-farm-list').value, cfg.farmList);
            const cur = farmCurrent({ farmList: list });
            const items = $('#pg-dn-farm-items');
            const lines = $('#pg-dn-farm-list').value.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
            let vi = 0;
            items.innerHTML = lines.map(l => {
                const e = parseFarmLine(l);
                if (!e) return `<li class="bad"><span class="m">✖</span><span>${escHtml(l)}</span><span class="hint">use "quantidade item @ monstro"</span></li>`;
                const it = list[vi++];
                const feito = farmEntryDone(it), pulada = farmSkipped.get(farmKey(it)), atual = cur && cur.e === it;
                const h = Array.isArray(huntCatalog) ? farmHuntFor(it) : null;
                const cls = feito ? 'done' : atual ? 'cur' : pulada ? 'bad' : '';
                const mark = feito ? '✔' : atual ? '▶' : pulada ? '✖' : '';
                const onde = h ? `${h.slug} lv${h.level}${h.perKill > 0 ? ` · ~${Math.round(h.perKill * 100) / 100}/abate` : ' · item fora da tabela de drops'}` : (Array.isArray(huntCatalog) ? (it.hunt ? 'hunt não encontrada' : 'nenhuma hunt ao alcance dropa') : 'mapa de hunts ainda não carregado');
                return `<li class="${cls}"><span class="m">${mark}</span><span>${farmN(farmGot(it))}/${farmN(farmQty(it))} ${escHtml(it.item)}</span><span class="hint">${escHtml(pulada ? `pulada: ${pulada}` : onde)}</span></li>`;
            }).join('');
            const salvo = JSON.stringify(list.map(e => [e.item, farmQty(e), e.hunt])) === JSON.stringify(farmList().map(e => [e.item, farmQty(e), e.hunt]));
            $('#pg-dn-farm-status').textContent = `${farmLine(d)}${!salvo ? ' · (lista alterada: salve)' : ''}${ruins.length ? ` · ${ruins.length} linha(s) inválida(s)` : ''}`;
        }
        onFarmChange = () => { if (!panel.hidden) renderFarm(); };
        $('#pg-dn-inv-now').onclick = () => {
            const r = invNow();
            flash(`${r.ok ? '✔' : '⚠'} ${r.msg}`, r.ok ? 'ok' : 'warn', 15000);
            renderInv();
        };
        $('#pg-dn-inv-jenny-now').onclick = () => {
            flash('👮 Lendo a Officer Jenny…', 'info', 60000);
            invJennyNow().then(r => { flash(`${r.ok ? '✔' : '⚠'} ${r.msg}`, r.ok ? 'ok' : 'warn', 15000); renderInv(); }).catch(e => flash(`⚠ Jenny: ${e?.message || e}`, 'error'));
        };
        $('#pg-dn-gym-now').onclick = () => {
            flash('🏟 Lendo os ginásios…', 'info', 60000);
            gymNow().then(r => flash(`${r.ok ? '✔' : '⚠'} ${r.msg}`, r.ok ? 'ok' : 'warn', 15000)).catch(e => flash(`⚠ Ginásios: ${e?.message || e}`, 'error'));
        };
        $('#pg-dn-farm-skip').onclick = () => {
            const cur = farmCurrent();
            if (!cur) { flash('⚠ Nenhum item em andamento na lista salva.', 'warn'); return; }
            cur.e.got = farmQty(cur.e);
            logEvent('farm-pulada', { item: cur.e.item, qty: farmQty(cur.e), hunt: cur.e.hunt || null, motivo: 'botão Pular item atual' });
            farmTarget = null;
            farmSave();
            renderFarm();
            if (cfg.farmEnabled) setTimeout(() => farmTick(), 300);
            flash(`✔ ${cur.e.item} marcado como feito.`, 'ok', 3000);
        };
        $('#pg-dn-farm-reset').onclick = () => {
            for (const e of farmList()) e.got = 0;
            farmReset();
            farmSave();
            logEvent('farm-zerado', { itens: farmList().length });
            renderFarm();
            if (cfg.farmEnabled) setTimeout(() => farmTick(), 300);
            flash('✔ Contagem zerada: recomeça pela 1ª linha.', 'ok', 3000);
        };
        $('#pg-dn-guild-refresh').onclick = () => {
            const ok = guildRequest('botão Atualizar guild');
            flash(ok ? 'Pedi o estado da guild ao jogo.' : 'Socket do jogo não rastreado.', ok ? 'info' : 'warn');
        };
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
            const nome = { itens: 'drops', pokes: 'Pokémon', bolas: 'bolas', suprimentos: 'poções/revives', cla: 'clã', guardar: 'guardar', evoluir: 'evolução', slot: 'slot machine', time: 'ler o time', breeding: 'breeding', ginasio: 'ginásios', jenny: 'Officer Jenny' };
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
                    if (t.key === 'ginasio') return `ginásios ${t.ok ? `✔ ${x.vitorias ?? 0} vit., ${x.derrotas ?? 0} der., ${x.bonus ?? 0} bônus` : `✖ ${t.motivo || ''}`}`;
                    return `${nome[t.key] || t.key} ${t.ok ? '✔' : `✖ ${t.motivo || ''}`}`;
                }).join(' · ');
                flash(`${r.ok ? '✔' : '⚠'} Viagem: ${linha}${r.volta ? ` · voltando para ${r.volta}` : ''}`, r.ok ? 'ok' : 'warn', 12000);
            });
        };

        // ---- Sistema ----
        function renderReload() {
            $('#pg-dn-reload-status').textContent = cfg.reloadEnabled ? `Recarga ${reloadStatus()}` : 'Recarga desligada';
            $('#pg-dn-socket').innerHTML = (lastSocket && lastSocket.readyState === 1
                ? 'socket do jogo <span class="dn-ok-t">● rastreado</span>'
                : 'socket do jogo <span class="dn-err-t">○ não rastreado</span>')
                + (humanPending() ? ' · <span class="dn-err-t">🧑 verificação humana pendente — clique no desafio da Cloudflare</span>' : '');
        }
        onReloadChange = () => { if (!panel.hidden) renderReload(); };
        onHumanChange = onReloadChange;   // v3.40.0: a verificação humana aparece na mesma linha do socket
        $('#pg-dn-reload-now').onclick = () => {
            flash(`⟳ Recarregando${huntSlug ? ` (volto para ${huntSlug})` : ''}…`, 'info', 10000);
            setTimeout(() => doReload('manual'), 300);
        };

        // ---- Esperar na cidade (v3.44.0) ----
        function renderHold() {
            const on = holdActive();
            $('#pg-dn-hold-status').textContent = holdStatus();
            const b = $('#pg-dn-hold');
            b.textContent = on ? '▶ Voltar para a hunt' : '⏸ Ficar parado na cidade';
            b.classList.toggle('dn-btn--danger', on);
            b.classList.toggle('dn-btn--primary', !on);
            b.title = on ? 'Desliga a espera: cura na Joy e volta para a hunt (clã > rota > última hunt > hunt padrão).' : 'Sai da hunt agora e segura a conta na cidade até você clicar de novo. Sobrevive à recarga do painel.';
        }
        $('#pg-dn-hold').onclick = () => {
            if (holdActive()) {
                const r = holdStop('painel');
                if (r.slug) flash(`▶ Espera desligada: curando na Joy e voltando para ${r.slug}.`, 'ok', 6000);
                else flash(`▶ Espera desligada; não voltei sozinho: ${r.motivo}. Entre na hunt na mão.`, 'warn');
            } else {
                const tinha = holdIsHunt(huntSlug);
                holdStart('painel');
                flash(`⏸ Esperando na cidade${tinha ? ' (saí da hunt)' : ''}: nada manda a conta para a hunt até você clicar em Voltar.`, 'ok', 6000);
            }
            renderHold(); renderIdle(); renderState();
        };
        onHoldChange = () => { if (!panel.hidden) { renderHold(); renderIdle(); renderState(); } };

        // ---- preencher e redesenhar tudo ----
        function renderLive() {
            renderChannels(); renderQuality(); renderBalls(); renderSupply(); renderHeal(); renderIdle(); renderHold(); renderSellCount(); renderPokeSell(); renderRoute(); renderDaily(); renderGift(); renderEvolve(); renderSlot(); renderBoss(); renderInv(); renderBreed(); renderGuild(); renderFarm(); renderCatch(); renderClan(); renderDeposit(); renderTrip(); renderState();
        }
        function fill() {
            $('#pg-dn-hook').value = cfg.webhookUrl;
            $('#pg-dn-hook-shiny').value = cfg.webhookShiny || '';
            $('#pg-dn-hook-alerts').value = cfg.webhookAlerts || '';
            $('#pg-dn-hook-level').value = cfg.webhookLevel || '';
            $('#pg-dn-hook-human').value = cfg.webhookHuman || '';
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
            $('#pg-dn-cityidle-hunt').value = cfg.cityIdleHunt || '';
            $('#pg-dn-sell').checked = Boolean(cfg.sellEnabled);

            $('#pg-dn-psell').checked = Boolean(cfg.pokeSellEnabled);
            $('#pg-dn-box-alert').value = Number(cfg.boxAlertAt) || 0;
            $('#pg-dn-trip-min').value = cfg.tripEveryMin || 10;
            $('#pg-dn-trip-max').value = cfg.tripEveryMaxMin || '';
            for (const i of panel.querySelectorAll('.pg-dn-psell-lim')) i.value = pokeSellLimit(cfg, i.dataset.tier) || '';
            $('#pg-dn-psell-keepq').value = pokeSellKeepQ(cfg) || '';
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
            for (const c of panel.querySelectorAll('.pg-dn-daily-area')) c.checked = dailyAreas().includes(c.value);
            $('#pg-dn-gift').checked = Boolean(cfg.giftEnabled);
            $('#pg-dn-evolve').checked = Boolean(cfg.evolveEnabled);
            $('#pg-dn-evolve-depot').checked = cfg.evolveFromDepot !== false;
            $('#pg-dn-evolve-family').checked = cfg.evolveFromFamily !== false;
            $('#pg-dn-slot').checked = Boolean(cfg.slotEnabled);
            $('#pg-dn-slot-wanted').value = cfg.slotWanted || '';
            $('#pg-dn-gym').checked = Boolean(cfg.gymEnabled);
            $('#pg-dn-gym-bonus').checked = cfg.gymBonus !== false;
            $('#pg-dn-gym-redo').checked = cfg.gymRedo !== false;
            $('#pg-dn-gym-alerts').checked = cfg.gymAlerts !== false;
            $('#pg-dn-inv').checked = Boolean(cfg.invEnabled);
            $('#pg-dn-inv-hours').value = Array.isArray(cfg.invHours) ? cfg.invHours.join(', ') : (cfg.invHours || '');
            $('#pg-dn-inv-keep').value = invKeepEnergy(cfg) || '';
            $('#pg-dn-inv-alerts').checked = cfg.invAlerts !== false;
            $('#pg-dn-inv-jenny').checked = Boolean(cfg.invJennyEnabled);
            renderInvOffers(cfg.invJennyOffer || '');
            $('#pg-dn-inv-jenny-keep').value = invJennyKeep(cfg) || '';
            $('#pg-dn-boss').checked = cfg.bossResumeEnabled !== false;
            $('#pg-dn-boss-loss').checked = Boolean(cfg.bossResumeOnLoss);
            $('#pg-dn-boss-alerts').checked = cfg.bossAlerts !== false;
            $('#pg-dn-breed').checked = Boolean(cfg.breedEnabled);
            $('#pg-dn-breed-ivmax').value = Math.max(0, Math.min(IV_MAX, Number(cfg.breedFoodIvMax) || 0));
            $('#pg-dn-breed-keepmax').value = Math.max(0, Number(cfg.breedKeepMax) || 0);
            $('#pg-dn-breed-family').checked = cfg.breedFamily !== false;
            $('#pg-dn-breed-double').checked = cfg.breedDouble !== false;
            $('#pg-dn-breed-foodbreed').checked = Boolean(cfg.breedFoodBreed);
            $('#pg-dn-guild-donate').value = Math.max(0, Number(cfg.guildDonateGold) || 0);
            $('#pg-dn-guild-keep').value = Math.max(0, Number(cfg.guildDonateKeep) || 0);
            $('#pg-dn-guild-tribute').checked = Boolean(cfg.guildTributeEnabled);
            $('#pg-dn-guild-tribute-keep').value = Math.max(0, Number(cfg.guildTributeKeep) || 0);
            $('#pg-dn-guild-alerts').checked = Boolean(cfg.guildAlerts);
            $('#pg-dn-guild-hunt').checked = Boolean(cfg.guildHuntEnabled);
            $('#pg-dn-guild-fish').checked = Boolean(cfg.guildFishEnabled);
            $('#pg-dn-guild-farm').checked = Boolean(cfg.guildFarmTribute);
            $('#pg-dn-guild-order').value = guildRouteOrder(cfg).join(',');
            $('#pg-dn-farm').checked = Boolean(cfg.farmEnabled);
            $('#pg-dn-farm-list').value = farmList(cfg).map(farmLineText).join('\n');
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
            const { draft, linhasRuins, farmRuins } = readForm();
            const alvoAntes = levelTarget(), swapAntes = swapEnabled();
            const rotaAntes = JSON.stringify(routeList());
            const recargaAntes = JSON.stringify([cfg.reloadEnabled, cfg.reloadEveryMin, cfg.reloadEveryMaxMin]);
            const dailyAntes = JSON.stringify([cfg.dailyEnabled, cfg.dailyClaim, cfg.dailyReturnSlug, cfg.dailyAuto, cfg.dailyAreas]);
            const giftAntes = JSON.stringify([cfg.giftEnabled, cfg.giftCenterMode]);
            const slotAntes = JSON.stringify([cfg.slotEnabled, cfg.slotWanted]);
            const gymAntes = JSON.stringify([cfg.gymEnabled, cfg.gymBonus, cfg.gymRedo]);
            const invAntes = JSON.stringify([cfg.invJennyEnabled, cfg.invJennyOffer, cfg.invJennyKeep]);
            const breedAntes = JSON.stringify([cfg.breedEnabled, cfg.breedLines, cfg.breedFoodIvMax, cfg.breedFamily, cfg.breedDouble, cfg.breedFoodBreed]);
            const guildAntes = JSON.stringify([cfg.guildDonateGold, cfg.guildDonateKeep, cfg.guildTributeEnabled, cfg.guildTributeKeep, cfg.guildAlerts, cfg.guildHuntEnabled, cfg.guildFishEnabled, cfg.guildFarmTribute, cfg.guildRouteOrder]);
            const capturaAntes = JSON.stringify([cfg.catchRouteEnabled, cfg.catchRouteAreas, cfg.catchRouteMaxLevel]);
            const viagemAntes = JSON.stringify([cfg.tripEveryMin, cfg.tripEveryMaxMin]);
            const ligouCaptura = draft.catchRouteEnabled && !cfg.catchRouteEnabled;
            const ligouRota = draft.routeEnabled && !cfg.routeEnabled;
            const ligouCla = draft.clanEnabled && draft.clanRoute && !(cfg.clanEnabled && cfg.clanRoute);
            const ligouGuild = guildRouteOn(draft) && !guildRouteOn(cfg);
            const ligouFarm = draft.farmEnabled && !cfg.farmEnabled;
            const farmAntes = JSON.stringify([cfg.farmEnabled, farmList(cfg).map(e => [e.item, farmQty(e), e.hunt])]);
            const clanAntes = JSON.stringify([cfg.clanEnabled, cfg.clanRoute, cfg.clanKey]);
            Object.assign(cfg, draft);
            sellDrafts = {};                                  // listas de venda das outras hunts já foram para cfg.sellProfiles
            const exclusivo = [];
            // Rota de treino, de captura e do clã trocam de hunt: fica a que acabou de ser ligada.
            const rotas = [
                { on: () => cfg.routeEnabled, off: () => { cfg.routeEnabled = false; }, ligou: ligouRota, nome: '"Seguir a rota" (treino)' },
                { on: () => cfg.catchRouteEnabled, off: () => { cfg.catchRouteEnabled = false; }, ligou: ligouCaptura, nome: 'Rota de captura' },
                { on: () => cfg.clanEnabled && cfg.clanRoute, off: () => { cfg.clanRoute = false; }, ligou: ligouCla, nome: '"Caçar o que falta" (clã)' },
                { on: () => guildRouteOn(cfg), off: () => { cfg.guildHuntEnabled = false; cfg.guildFishEnabled = false; cfg.guildFarmTribute = false; }, ligou: ligouGuild, nome: 'Caçar/pescar para a guild' },
                { on: () => farmOn(cfg), off: () => { cfg.farmEnabled = false; }, ligou: ligouFarm, nome: 'Farm por lista' },
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
            if (JSON.stringify([cfg.dailyEnabled, cfg.dailyClaim, cfg.dailyReturnSlug, cfg.dailyAuto, cfg.dailyAreas]) !== dailyAntes) { dailyPickTried = 0; scheduleDailyCheck(500); } // daily mudou: lê a missão já (e pode escolher de novo)
            if (JSON.stringify([cfg.giftEnabled, cfg.giftCenterMode]) !== giftAntes) { giftFetchedAt = 0; scheduleGiftCheck(500); } // gift mudou: lê o calendário já
            if (JSON.stringify([cfg.slotEnabled, cfg.slotWanted]) !== slotAntes) { // slot machine mudou: rearma e relê a máquina já
                slotFailedAt = 0;
                for (const k of Object.keys(slotTriedAt)) delete slotTriedAt[k];
                if (cfg.slotEnabled) setTimeout(() => slotTick(true), 500);
            }
            if (JSON.stringify([cfg.invJennyEnabled, cfg.invJennyOffer, cfg.invJennyKeep]) !== invAntes) { invJennyAt = 0; invJennyFailedAt = 0; }   // v3.50.0: Jenny mudou: relê no próximo tique
            if (JSON.stringify([cfg.gymEnabled, cfg.gymBonus, cfg.gymRedo]) !== gymAntes) { // ginásios mudaram: relê a janela já
                gymFailedAt = 0;
                if (cfg.gymEnabled) setTimeout(() => gymTick(true), 500);
            }
            if (JSON.stringify([cfg.breedEnabled, cfg.breedLines, cfg.breedFoodIvMax, cfg.breedFamily, cfg.breedDouble, cfg.breedFoodBreed]) !== breedAntes) { // breeding mudou: replaneja já
                breedReset();
                if (cfg.breedEnabled) setTimeout(() => breedTick(true), 500);
            }
            if (JSON.stringify([cfg.guildDonateGold, cfg.guildDonateKeep, cfg.guildTributeEnabled, cfg.guildTributeKeep, cfg.guildAlerts, cfg.guildHuntEnabled, cfg.guildFishEnabled, cfg.guildFarmTribute, cfg.guildRouteOrder]) !== guildAntes) { // guild mudou: rearma e relê já
                guildTriedAt = {};
                guildFailed.clear();
                if (!guildRouteOn() && guildTarget) guildReturn('rota da guild desligada');
                if (guildOn()) setTimeout(() => guildRequest('salvar'), 500);
            }
            if (JSON.stringify([cfg.farmEnabled, farmList(cfg).map(e => [e.item, farmQty(e), e.hunt])]) !== farmAntes) { // farm mudou: esquece pulos e replaneja já
                farmReset();
                if (!farmOn() && (farmTarget || farmFrom)) farmReturn('farm desligado');
                if (farmOn()) setTimeout(() => farmTick(), 500);
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
            if (farmRuins && farmRuins.length) avisos.push(`⚠ Farm: ${farmRuins.length} linha(s) ignorada(s) (formato "quantidade item @ monstro"): ${farmRuins.map(l => `"${l}"`).join(', ')}`);
            if (cfg.farmEnabled && !farmList(cfg).length) avisos.push('⚠ Farm ligado sem nenhuma linha válida: nada será farmado.');
            if (!cfg.webhookUrl) avisos.push('⚠ Sem canal de Capturas: capturas não serão enviadas.');
            if (cfg.pokeSellEnabled && !pokeSellHasRules(cfg)) avisos.push('⚠ Venda de Pokémon ligada sem nenhum limite: nada será vendido.');
            const usaAlertas = [effectiveBallsMin() > 0 && 'bolas', supplyOn() && 'poções/revives', cfg.sellEnabled && 'venda', cfg.pokeSellEnabled && 'venda de Pokémon', routeActive() && 'troca de hunt', cfg.dailyEnabled && 'daily', cfg.catchRouteEnabled && 'rota de captura', farmOn(cfg) && 'farm por lista'].filter(Boolean);
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
            cfg.webhookHuman = $('#pg-dn-hook-human').value.trim();
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
            if (cfg.webhookHuman) {
                canais.push('captcha');
                postWebhook('human', {
                    username: 'Poke Idle World',
                    embeds: [{ title: 'Teste: canal do captcha', description: 'Aqui chegará o aviso quando o jogo pedir a verificação humana (Cloudflare) e quando ela for resolvida. O script não clica no desafio: só avisa.', color: 0xf0b232 }],
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
            const mine = { webhookUrl: cfg.webhookUrl, webhookShiny: cfg.webhookShiny, webhookAlerts: cfg.webhookAlerts, webhookLevel: cfg.webhookLevel, webhookHuman: cfg.webhookHuman };
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
            const canais = ['webhookUrl', 'webhookShiny', 'webhookAlerts', 'webhookLevel', 'webhookHuman'].filter(k => (cfg[k] || '').trim()).length;
            const resumo = [
                `${canais} ${canais === 1 ? 'canal' : 'canais'}${keepHooks ? ' (mantidos deste painel)' : ''}`,
                cfg.notifyEveryCapture ? 'avisa toda captura' : `lista com ${(cfg.watchList || []).length}`,
                `bolas ${cfg.autoBuy ? `compra ${cfg.autoBuyQty} abaixo de ${cfg.ballsMin || 1}` : (cfg.ballsMin ? `avisa abaixo de ${cfg.ballsMin}` : 'desligado')}`,
                `refil ${supplyOn() ? supplySlots().map(s => `${s.name} < ${s.min}`).join(', ') : 'desligado'}`,
                `Joy ${cfg.healJoyEnabled ? 'ligada' : 'desligada'}`,
                `volta da cidade ${cfg.cityIdleEnabled ? `${cfg.cityIdleMin} min` : 'desligada'}`,
                `drops ${cfg.sellEnabled ? 'ligado' : 'desligado'}, listas de ${Object.keys(cfg.sellProfiles || {}).length} hunts (${perfisVindos.length} vieram${soDaqui.length ? `, ${soDaqui.length} já eram daqui e ficaram` : ''})`,
                `Pokémon ${cfg.pokeSellEnabled ? 'ligado' : 'desligado'}, ${Object.keys(cfg.pokeSellLimits || {}).length} raridades com limite${pokeSellKeepQ(cfg) ? `, guarda qualidade ≥ ${pokeSellKeepQ(cfg)}` : ''}`,
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
    holdLoad();   // v3.44.0: espera na cidade ligada na carga anterior continua (antes de loadResume: a volta da recarga respeita)
    loadResume(); // antes do painel e dos timers: restaura o que a carga anterior guardou
    bossLoad();   // v3.43.0: Auto Boss pedido na carga anterior (o frame do auto-boss-get decide se ainda roda)
    invLoad();    // v3.50.0: rodada da Invasão Rocket em andamento na carga anterior (hunt de volta e progresso)
    if (cfg.reloadEnabled) scheduleReload();
    buildUI();
    setInterval(() => requestBalls(0), BALLS_POLL_MS);
    setInterval(requestSupplies, SUPPLY_POLL_MS);
    setInterval(() => requestPokes(0), POKES_POLL_MS);
    setInterval(reloadTick, RELOAD_CHECK_MS);
    setInterval(dailyTick, DAILY_CHECK_MS);
    setInterval(giftTick, GIFT_TICK_MS);
    setInterval(slotTick, SLOT_TICK_MS);
    setInterval(gymTick, GYM_TICK_MS);   // v3.45.0: ginásios (plano por prazo; desafio/resgate só na viagem)
    setInterval(breedTick, BREED_TICK_MS);
    setInterval(guildTick, GUILD_TICK_MS);
    setInterval(farmTick, FARM_TICK_MS);
    if (cfg.farmEnabled) setTimeout(farmTick, 9000);   // v3.33.0: farm por lista logo após a carga (depois do socket/retomada da recarga)
    setTimeout(fishSniff, 12000);   // v3.31.1: lê a janela de pesca uma vez (REST) para confirmar o formato no log
    setTimeout(humanSniff, 15000);  // v3.40.0: lê o prazo da verificação humana uma vez (REST) para confirmar o formato no log
    setInterval(humanWatchTick, HUMAN_WATCH_MS);   // v3.40.0: janela "Confirme que você é humano" / widget do Turnstile aberto
    setInterval(bossTick, BOSS_TICK_MS);   // v3.43.0: sessão do Auto Boss muda sem frame há 10 min: pergunta ao servidor
    setInterval(invTick, INV_TICK_MS);   // v3.50.0: Invasão Rocket (entrada por janela, fim da rodada, Officer Jenny)
    if (cfg.breedEnabled) setTimeout(() => breedTick(true), 9000);   // 1ª leitura da incubadora logo após a carga
    if (cfg.slotEnabled) setTimeout(() => slotTick(true), 8000);   // 1ª leitura da slot machine logo após a carga
    if (cfg.gymEnabled) setTimeout(() => gymTick(true), 10000);   // v3.45.0: 1ª leitura dos ginásios logo após a carga
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
        '| parada na cidade:', cfg.cityIdleEnabled ? `volta após ${cfg.cityIdleMin} min${cfg.cityIdleHunt ? `, padrão ${cfg.cityIdleHunt}` : ''}` : 'não',
        '| espera na cidade:', holdActive() ? 'LIGADA (botão do painel)' : 'não',
        '| nível:', levelEnabled() ? `${levelTarget()}${swapEnabled() ? ' + troca' : ''}` : 'não',
        '| rota:', routeActive() ? routeStatus() : 'não',
        '| captura:', cfg.catchRouteEnabled ? `${catchAreas().join('+')}${cfg.catchRouteMaxLevel ? ` até lv ${cfg.catchRouteMaxLevel}` : ''}${cfg.catchRouteAuto ? ' + bola' : ''}` : 'não',
        '| daily:', cfg.dailyEnabled ? `${cfg.dailyAuto ? `sozinha (${dailyAreas().join('+')}), ` : ''}volta para ${dailyReturnTarget() || 'a hunt anterior'}${cfg.dailyClaim ? ' + resgate' : ''}` : 'não',
        '| gift:', cfg.giftEnabled ? `sim (Gift Center: ${giftCenterMode() || 'não mexe'})` : 'não',
        '| auto boss:', bossOn() ? `retoma${cfg.bossResumeOnLoss ? ' (até após derrota)' : ''}` : 'não',
        '| guild:', guildOn() ? [guildDonateWanted() > 0 ? `doa ${guildDonateWanted()}/dia` : '', cfg.guildTributeEnabled ? 'tributo' : '', cfg.guildFarmTribute ? 'farma tributo' : '', cfg.guildHuntEnabled ? 'caça' : '', cfg.guildFishEnabled ? 'pesca' : '', guildRouteOn() ? `ordem ${guildOrderText()}` : '', cfg.guildAlerts ? 'avisos' : ''].filter(Boolean).join(' + ') : 'não',
        '| venda pokes:', cfg.pokeSellEnabled ? TIERS_ASC.filter(t => pokeSellLimit(cfg, t.key) > 0).map(t => `${t.name}<${pokeSellLimit(cfg, t.key)}`).join(' ') || 'sem limites' : 'não',
        '| venda drops:', cfg.sellEnabled ? `${Object.keys(cfg.sellItems || {}).length} itens` : 'não',
        '| viagem à cidade:', `${cfg.tripCity} a cada ${cfg.tripEveryMin}${cfg.tripEveryMaxMin > cfg.tripEveryMin ? `–${cfg.tripEveryMaxMin}` : ''} min`,
        '| recarga auto:', cfg.reloadEnabled ? `${cfg.reloadEveryMin}${cfg.reloadEveryMaxMin > cfg.reloadEveryMin ? `–${cfg.reloadEveryMaxMin}` : ''} min` : 'não');
})();
