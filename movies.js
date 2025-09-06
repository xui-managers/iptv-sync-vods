require('dotenv').config();
const axios = require('axios');
const mysql = require('mysql2/promise');
const updateBouquets = require('./updateBouquets');
const { chunkArray } = require('./util/chunck-array');
const {getMovieInfoCL, ensureAllMovies} = require('./tmdb');
const { categorizeMovies } = require('iptv-vod-organizer');
const extractNameAndYear = require('./util/extract-name-year');
const updateProgress = require('./util/update-progress');
const normalizeName = require('./util/normalize-name');
const isInvalidVodName = require('./util/is-invalid.vod');

// --- Mapeamento customizado de categorias
const categoryNameMap = {
  "VOD REBAL2": "VOD Teste ",
  "VOD REBAL1": "[XXX] Adultos",
  // adicione mais mapeamentos se precisar
};

// --- CONFIGURAÇÕES
const {
  XTREAM_URL_VODS, XTREAM_USER_VODS, XTREAM_PASS_VODS,
  XTREAM_URL_VODS_ALT, XTREAM_USER_VODS_ALT, XTREAM_PASS_VODS_ALT,
  DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, SYNC_CATEGORIES, USE_IPTV_ORGANIZER
} = process.env;

if (!XTREAM_URL_VODS || !XTREAM_USER_VODS || !XTREAM_PASS_VODS || !DB_HOST || !DB_USER || !DB_PASSWORD || !DB_NAME) {
  console.error("ERRO: Configure corretamente todas as variáveis no arquivo .env.");
  process.exit(1);
}

async function initializeMovies(isNewSync = false) {
  const startDate = new Date();
  console.log("📽️ Iniciando sincronização de filmes (VODs)...");

  let dbPool;
  try {
    dbPool = mysql.createPool({
      host: DB_HOST,
      user: DB_USER,
      password: DB_PASSWORD,
      database: DB_NAME,
      waitForConnections: true,
      connectionLimit: 10
    });

    const connection = await dbPool.getConnection();

    try {
      if(isNewSync) {
        console.log('Limpando banco de dados dos filmes.');
        await connection.query("DELETE FROM streams WHERE type = 2");
        await connection.query("DELETE FROM streams_categories WHERE category_type = 'movie'");
        console.log('Banco de dados limpo, iniciando...');
      }
      
      await processVODs(connection);
      if(XTREAM_URL_VODS_ALT && XTREAM_URL_VODS_ALT != '') {
        await processVODs(connection, true);
      }
      console.log("✅ Processamento de filmes finalizado.");
    } catch (err) {
      console.error("❌ Erro durante o processamento:", err.message);
    } finally {
      connection.release();
    }

  } catch (err) {
    console.error("Erro fatal:", err.message);
  } finally {
    if (dbPool) await dbPool.end();
    
    const endDate = new Date();

    const diffMs = endDate - startDate; // diferença em ms
    const diffSec = Math.floor(diffMs / 1000);
    const minutes = Math.floor(diffSec / 60);
    const seconds = diffSec % 60;

    console.log(`⏰ Início: ${startDate.getHours()}:${startDate.getMinutes()}`);
    console.log(`⏰ Fim: ${endDate.getHours()}:${endDate.getMinutes()}`);
    console.log(`⏰ Tempo sincronizando: ${minutes}m ${seconds}s`);
    console.log("🛑 Fim do processo.");
    process.exit(0);
  }
}


async function processVODs(connection, useAlternative = false) {
  const hostname = new URL(useAlternative ? XTREAM_URL_VODS_ALT : XTREAM_URL_VODS).hostname;
  const xtreamApiUrl = `${useAlternative ? XTREAM_URL_VODS_ALT : XTREAM_URL_VODS}/player_api.php?username=${useAlternative ? XTREAM_USER_VODS_ALT : XTREAM_USER_VODS}&password=${useAlternative ? XTREAM_PASS_VODS_ALT : XTREAM_PASS_VODS}`;
  
  console.log("🔄 Buscando categorias e filmes da API...");

  const [categoriesRes, streamsRes] = await Promise.all([
    axios.get(`${xtreamApiUrl}&action=get_vod_categories`),
    axios.get(`${xtreamApiUrl}&action=get_vod_streams`)
  ]);

  const vodCategories = categoriesRes.data;
  const vodStreams = streamsRes.data.map(vod => ({
  ...vod,
  stream_source: [
    `${useAlternative ? XTREAM_URL_VODS_ALT : XTREAM_URL_VODS}/movie/${useAlternative ? XTREAM_USER_VODS_ALT : XTREAM_USER_VODS}/${useAlternative ? XTREAM_PASS_VODS_ALT : XTREAM_PASS_VODS}/${vod.stream_id}.${vod.container_extension ?? 'mp4'}`
  ]
}));

  if (!Array.isArray(vodCategories) || !Array.isArray(vodStreams)) {
    throw new Error("A resposta da API está inválida.");
  }

  console.log(`🎬 ${vodStreams.length} filmes encontrados em ${vodCategories.length} categorias.`);

  // --- Mapear categorias
  const [existingDbCategories] = await connection.query(
    "SELECT id, category_name FROM streams_categories WHERE category_type = 'movie'"
  );
  const existingCategoryMap = new Map(existingDbCategories.map(c => [c.category_name, c.id]));
  const apiToDbCategoryIdMap = new Map();

  for (const cat of vodCategories) {
    const idStr = String(cat.category_id);

    // se existir no map, renomeia
    const dbCategoryName = categoryNameMap[cat.category_name] || cat.category_name;

    if (existingCategoryMap.has(dbCategoryName)) {
      apiToDbCategoryIdMap.set(idStr, existingCategoryMap.get(dbCategoryName));
    } else {
      const [res] = await connection.query(
        "INSERT INTO streams_categories (category_type, category_name, is_adult) VALUES (?, ?, ?)",
        ['movie', dbCategoryName, cat.is_adult]
      );
      const newId = res.insertId;
      apiToDbCategoryIdMap.set(idStr, newId);
      existingCategoryMap.set(dbCategoryName, newId);
    }
  }

  await ensureAllMovies(vodStreams[0]);

  // --- Mapear filmes existentes
  const [existingVods] = await connection.query(
    "SELECT stream_display_name, custom_sid, year FROM streams WHERE type = 2"
  );
  const existingVodKeys = new Set(existingVods.map(v => `${v.stream_display_name}:${v.custom_sid}`));
  const existingVodKeysWithYear = new Set(existingVods.map(v => `${v.stream_display_name?.toLowerCase()}:${v.year ?? ''}`)); // 'Nome do Filme:2025'

  const chunks = chunkArray(vodStreams);

  const insertedIds = [];
  let newCount = 0;
  let skipCount = 0;
  let failCount = 0;

  updateProgress(0, vodStreams.length);
  for (const batch of chunks) {
  const requests = batch
    .filter(vod => {
      // Ignorando vods que contenham nomes incorretos, com URLs, etc (mal inserção da fonte)
      if(isInvalidVodName(vod?.title ?? vod?.name)) {
        skipCount++;
        return false;
      }
      // Verificação básica de duplicidade
      const key = `${vod?.title ?? vod.name}:${hostname}_${vod.stream_id}`;
      if (existingVodKeys.has(key)) {
        skipCount++;
        return false;
      }

      // Verificação com nome+ano
      const { year } = extractNameAndYear(vod);
      const keyWithYear = `${vod?.title?.toLowerCase() ?? vod.name?.toLowerCase()}:${year}`;
      if (existingVodKeysWithYear.has(keyWithYear)) {
        skipCount++;
        return false;
      }

      return true;
    })
    .map(vod => {
      return getMovieInfoCL({
        tmdbId: vod.tmdb_id,
        name: normalizeName(extractNameAndYear(vod).name),
        year: extractNameAndYear(vod).year,
        vod,
        category_name: vodCategories.find(i => i.category_id === vod.category_id)?.category_name,
        url: useAlternative ? XTREAM_URL_VODS_ALT : XTREAM_URL_VODS,
        username: useAlternative ? XTREAM_USER_VODS_ALT : XTREAM_USER_VODS,
        password: useAlternative ? XTREAM_PASS_VODS_ALT : XTREAM_PASS_VODS,
      })
        .then(res => ({ vod, info: res }))
        .catch(err => ({ vod, error: err }));
    });

  const results = await Promise.all(requests);
    const values = [];

    for (const result of results) {
      const { vod, info } = result;

      const vodId = `${hostname}_${vod.stream_id}`;
      const year = vod?.year ? vod.year : parseInt(info?.release_date?.slice(0, 4)) || null;
      // Confirma novamente, pois pode ter vindo o ano da API interna do TMDB
      const keyWithYear = `${vod?.title?.toLowerCase() ?? vod.name?.toLowerCase()}:${year}`;
      if (existingVodKeysWithYear.has(keyWithYear)) {
        skipCount++;
        continue;
      }

      const dbCategoryId = apiToDbCategoryIdMap.get(String(vod.category_id));

      const stream_icon = info?.movie_image || info?.backdrop || null;
      
      values.push([
        vod?.title ?? vod?.name ?? info?.name,
        `${JSON.stringify(vod?.stream_source)}`,
        stream_icon,
        `[${dbCategoryId || ''}]`,
        vodId,
        parseInt(vod.added) || Math.floor(Date.now() / 1000),
        2,
        JSON.stringify(info),
        parseFloat(info?.rating) || 0,
        info?.tmdb_id ?? vod.tmdb_id ?? null,
        null,
        year,
        0,
        'pt-br',
        1,
        1,
        null
      ]);
    }

    if (values.length > 0) {
      try {
        const [result] = await connection.query(`
          INSERT INTO streams 
            (stream_display_name, stream_source, stream_icon, category_id, custom_sid, added, type, movie_properties, rating, tmdb_id, notes, year, read_native, tmdb_language, direct_source, gen_timestamps, auto_restart)
          VALUES ?
        `, [values]);
        const firstId = result.insertId;
        const ids = Array.from({ length: result.affectedRows }, (_, i) => firstId + i);

        insertedIds.push(...ids);

        newCount += values.length;
      } catch (err) {
        console.error("❌ Erro ao inserir batch no banco:", err.message);
        failCount += values.length;
      }
    }
    updateProgress(newCount + skipCount, vodStreams.length);
  }

  const firstId = insertedIds[0]
  const lastId = insertedIds[insertedIds.length - 1];

  if(insertedIds.length > 0 && (USE_IPTV_ORGANIZER=='true' || USE_IPTV_ORGANIZER == true)){ 
    console.log("🔄 Atualizando categorias dos filmes inseridos via IPTV-ORGANIZER...");
    const [rows] = await connection.query(
      `SELECT id, category_id, stream_display_name, movie_properties, year, tmdb_id
      FROM streams
      WHERE type = 2 AND id BETWEEN ? AND ?`,
      [firstId, lastId]
    );
    await categorizeMovies(rows, null, true);
  }

  console.log(`✅ ${newCount} novos filmes inseridos.`);
  console.log(`⏭️ ${skipCount} filmes já existiam.`);
  if (failCount > 0) console.log(`❌ ${failCount} falhas ao inserir filmes.`);

  if(newCount > 0) {
    await updateBouquets(connection, 2);
  }
}

module.exports = initializeMovies;