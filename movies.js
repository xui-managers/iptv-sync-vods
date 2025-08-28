require('dotenv').config();
const axios = require('axios');
const mysql = require('mysql2/promise');
const updateBouquets = require('./updateBouquets');
const { chunkArray } = require('./util/chunck-array');
const { organizeMovies, categorizeMovies } = require('iptv-vod-organizer');
const updateProgress = require('./util/update-progress');

// --- Mapeamento customizado de categorias
const categoryNameMap = {
  "VOD REBAL2": "VOD Teste ",
  "VOD REBAL1": "[XXX] Adultos",
  // adicione mais mapeamentos se precisar
};

// --- CONFIGURAÇÕES
const {
  XTREAM_URL_VODS, XTREAM_USER_VODS, XTREAM_PASS_VODS,
  DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, SYNC_CATEGORIES, USE_IPTV_ORGANIZER
} = process.env;

if (!XTREAM_URL_VODS || !XTREAM_USER_VODS || !XTREAM_PASS_VODS || !DB_HOST || !DB_USER || !DB_PASSWORD || !DB_NAME) {
  console.error("ERRO: Configure corretamente todas as variáveis no arquivo .env.");
  process.exit(1);
}

const xtreamApiUrl = `${XTREAM_URL_VODS}/player_api.php?username=${XTREAM_USER_VODS}&password=${XTREAM_PASS_VODS}`;

async function main() {
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
      await processVODs(connection);
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
    console.log("🛑 Fim do processo.");
    process.exit(0);
  }
}


async function processVODs(connection) {
  console.log("🔄 Buscando categorias e filmes da API...");

  const [categoriesRes, streamsRes] = await Promise.all([
    axios.get(`${xtreamApiUrl}&action=get_vod_categories`),
    axios.get(`${xtreamApiUrl}&action=get_vod_streams`)
  ]);

  const vodCategories = categoriesRes.data;
  const vodStreams = streamsRes.data;

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


  if(SYNC_CATEGORIES === 'true') {
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
  }

  // --- Mapear filmes existentes
  const [existingVods] = await connection.query(
    "SELECT stream_display_name, custom_sid FROM streams WHERE type = 2"
  );
  const existingVodKeys = new Set(existingVods.map(v => `${v.stream_display_name}:${v.custom_sid}`));

  const chunks = chunkArray(vodStreams);

  const insertedIds = [];
  let newCount = 0;
  let skipCount = 0;
  let failCount = 0;

  for (const batch of chunks) {
    // ⚡ Executa 100 requisições concorrentes
    const requests = batch.filter(vod => {
        const key = `${vod.name}:${String(vod.stream_id)}`;
        if (existingVodKeys.has(key)) {
            skipCount++;
            return false; // ignora esse vod
        } else {
        }
        return true;
    })
    .map(vod =>
        axios.get(`${xtreamApiUrl}&action=get_vod_info&vod_id=${vod.stream_id}`)
        .then(res => ({ vod, info: res.data }))
        .catch(err => ({ vod, error: err }))
    );

    const results = await Promise.all(requests);
    const values = [];

    for (const result of results) {
      const { vod } = result;
      const vodId = String(vod.stream_id);
      const key = `${vod.name}:${vodId}`;
      if (existingVodKeys.has(key)) {
        skipCount++;
        continue;
      }

      if (result.error) {
        console.warn(`❌ Erro ao buscar info do VOD ${vod.name}: ${result.error.message}: URL`);
        failCount++;
        continue;
      }

      const { info, movie_data } = result.info;
      const dbCategoryId = apiToDbCategoryIdMap.get(String(movie_data.category_id));

      const stream_source = `["${XTREAM_URL_VODS}/movie/${XTREAM_USER_VODS}/${XTREAM_PASS_VODS}/${vodId}.${movie_data.container_extension}"]`;
      const stream_icon = info.movie_image || info.backdrop || null;

      const movieProperties = {
        kinopoisk_url: info?.movie_image || '',
        tmdb_id: info?.tmdbInfo?.id?.toString() || '',
        name: info.name,
        o_name: info.name,
        cover_big: info?.backdrop,
        movie_image: info?.movie_image,
        release_date: info?.releasedate,
        episode_run_time: '',
        youtube_trailer: info?.youtube_trailer,
        director: info?.director,
        actors: '',
        cast: info.cast,
        description: '',
        plot: info.plot,
        age: '',
        mpaa_rating: '',
        rating_count_kinopoisk: 0,
        country: '',
        genre: info.genre,
        backdrop_path: [`${info.backdrop}`],
        duration_secs: info.duration_secs,
        duration: info.duration,
        video: [],
        audio: [],
        bitrate: 0,
        rating: info?.rating || '0',
      };

      values.push([
        info.name,
        stream_source,
        stream_icon,
        `[${dbCategoryId || ''}]`,
        vodId,
        parseInt(movie_data.added) || Math.floor(Date.now() / 1000),
        2,
        JSON.stringify(movieProperties),
        parseFloat(info.rating) || 0,
        info.tmdb_id || null,
        null,
        parseInt(info.releasedate?.slice(0, 4)) || null,
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

  if(USE_IPTV_ORGANIZER === 'true') {
    const firstId = insertedIds[0]
    const lastId = insertedIds[insertedIds.length - 1];

    if(insertedIds.length > 0 ){ 
      console.log("🔄 Atualizando categorias dos filmes inseridos via IPTV-ORGANIZER...");
      const [rows] = await connection.query(
        `SELECT id, category_id, stream_display_name, movie_properties, year, tmdb_id
        FROM streams
        WHERE type = 2 AND id BETWEEN ? AND ?`,
        [firstId, lastId]
      );
      await categorizeMovies(rows);
    }
  }

  console.log(`✅ ${newCount} novos filmes inseridos.`);
  console.log(`⏭️ ${skipCount} filmes já existiam.`);
  if (failCount > 0) console.log(`❌ ${failCount} falhas ao inserir filmes.`);

  if(newCount > 0) {
    await updateBouquets(connection, 2);
  }
}

main();
