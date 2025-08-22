require('dotenv').config();
const axios = require('axios');
const mysql = require('mysql2/promise');
const updateBouquets = require('./updateBouquets');
const chunkArray = require('./util/chunck-array');
const withRetry = require('./util/with-retry')

const {
  XTREAM_URL_VODS, XTREAM_USER_VODS, XTREAM_PASS_VODS,
  DB_HOST, DB_USER, DB_PASSWORD, DB_NAME
} = process.env;

const xtreamApiUrl = `${XTREAM_URL_VODS}/player_api.php?username=${XTREAM_USER_VODS}&password=${XTREAM_PASS_VODS}`;

if (!XTREAM_URL_VODS || !XTREAM_USER_VODS || !XTREAM_PASS_VODS || !DB_HOST || !DB_USER || !DB_PASSWORD || !DB_NAME) {
  console.error("ERRO: Configure corretamente todas as variáveis no arquivo .env.");
  process.exit(1);
}


async function main() {
  const startDate = new Date();
  console.log("📺 Iniciando sincronização de séries...");

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
      await processSeries(connection);
      console.log("✅ Processamento de séries finalizado.");
    } catch (err) {
      if(err.message.includes('read properties')) {
        throw err;
      }
      console.error("❌ Erro durante o processamento:", err.message);
    } finally {
      connection.release();
    }

  } catch (err) {
    console.error("Erro fatal:", err.message);
  } finally {
    if (dbPool) 
      await dbPool.end();
    
    const endDate = new Date();

    const diffMs = endDate - startDate; // diferença em ms
    const diffSec = Math.floor(diffMs / 1000);
    const minutes = Math.floor(diffSec / 60);
    const seconds = diffSec % 60;

    console.log(`⏰ Início: ${startDate.getHours()}:${startDate.getMinutes()}`);
    console.log(`⏰ Fim: ${endDate.getHours()}:${endDate.getMinutes()}`);
    console.log(`⏰ Tempo sincronizando: ${minutes}m ${seconds}s`);
    console.log("🛑 Fim do processo.");
  }
}

async function processSeries(connection) {
  console.log("🔄 Buscando categorias e séries da API...");

  const [categoriesRes, seriesRes] = await Promise.all([
    axios.get(`${xtreamApiUrl}&action=get_series_categories`),
    axios.get(`${xtreamApiUrl}&action=get_series`)
  ]);

  const seriesCategories = categoriesRes.data;
  const seriesList = seriesRes.data;

  if (!Array.isArray(seriesCategories) || !Array.isArray(seriesList)) {
    throw new Error("A resposta da API está inválida.");
  }

  console.log(`📚 ${seriesList.length} séries encontradas em ${seriesCategories.length} categorias.`);

  // --- Mapear categorias
  const [existingDbCategories] = await connection.query(
    "SELECT id, category_name FROM streams_categories WHERE category_type = 'series'"
  );
  const existingCategoryMap = new Map(existingDbCategories.map(c => [c.category_name, c.id]));
  const apiToDbCategoryIdMap = new Map();

  // categorias novas (array de objetos)
  const newCategories = [];

  for (const cat of seriesCategories) {
    const idStr = String(cat.category_id);
    if (existingCategoryMap.has(cat.category_name)) {
      apiToDbCategoryIdMap.set(idStr, existingCategoryMap.get(cat.category_name));
    } else {
      newCategories.push([ 'series', cat.category_name, cat.is_adult ]);
    }
  }

  if (newCategories.length > 0) {
    const [insertRes] = await connection.query(
      "INSERT INTO streams_categories (category_type, category_name, is_adult) VALUES ?",
      [newCategories]
    );

    // gerar os novos IDs inseridos
    let newId = insertRes.insertId;
    for (let i = 0; i < newCategories.length; i++) {
      const [, category_name] = newCategories[i];
      apiToDbCategoryIdMap.set(
        seriesCategories.find(c => c.category_name === category_name).category_id,
        newId
      );
      existingCategoryMap.set(category_name, newId);
      newId++;
    }
  }

  const chunks = chunkArray(seriesList);

  let newCount = 0;
  let skipCount = 0;
  let failCount = 0;

  for (const batch of chunks) {
    console.log(`📦 Processando lote com ${batch.length} séries...\nSeries processadas até o momento: ${newCount + skipCount}`);

    const requests = batch.map(async series =>
      withRetry(
        async () => {
          const res = await axios.get(
            `${xtreamApiUrl}&action=get_series_info&series_id=${series.series_id}`,
            { timeout: 15000 }
          )
          return { series, info: res.data }
        },
        3,
        2000
      ).catch(error => ({ series, error }))
    );

    const results = await Promise.all(requests);

    // Busca todas as series ja cadastradas
    const [rows] = await connection.query(`SELECT id, title, year FROM streams_series`);

    const seriesMap = new Map();
    // chave: "titulo|ano"  (ano pode ser vazio/null)
    for (const r of rows) {
      seriesMap.set(`${r.title.trim().toLowerCase()}|${r.year || ''}`, r.id);
    }
    for (const result of results) {
      const { series, info } = result;
      const releaseYear = info?.info?.releaseDate?.slice(0, 4) || null;

      const keySerie = `${series.name.trim().toLowerCase()}|${releaseYear || ''}`;
      const existing = seriesMap.get(keySerie);

      if (result.error) {
        console.warn(`❌ Erro ao buscar info da série ${series.name}: ${result.error.message}`);
        failCount++;
        continue;
      }
      const catId = apiToDbCategoryIdMap.get(String(series.category_id));
      if (!catId) {
        console.warn(`⚠️ Categoria não encontrada para a série ${series.name}.`);
      }

      let seriesId = null;

      if(!existing || existing.length === 0) {
        console.log(`🎭 Nova série: ${series.name} (${releaseYear})`);

        const [insertRes] = await connection.query(`
          INSERT INTO streams_series 
          (title, category_id, cover, cover_big, genre, plot, cast, rating, director, release_date, tmdb_id, episode_run_time, backdrop_path, youtube_trailer, year)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            series.name,
            `[${catId || ''}]`,
            info.info.cover || '',
            info.info.cover_big || '',
            info.info.genre || '',
            info.info.plot || '',
            info.info.cast || '',
            parseFloat(info.info.rating) || 0,
            info.info.director || '',
            info.info.releaseDate || null,
            info.info.tmdb_id || null,
            info.info?.episode_run_time,
            info.info?.backdrop_path?.length > 0 ? `${info.info?.backdrop_path}` : '[]',
            info.info?.youtube_trailer,
            releaseYear
          ]
        );
        seriesId = insertRes.insertId;
      } else {
        seriesId = existing;
      }


      // Inserção dos episódios
      if (info.episodes && typeof info.episodes === 'object') {
        for (const seasonNum in info.episodes) {
          const season = info.episodes[seasonNum];
          if (!Array.isArray(season)) continue;

          // Verificamos todos os episodios disponiveis na serie e salvamos em um map
          const [existRows] = await connection.query(
            `SELECT season_num, episode_num 
            FROM streams_episodes 
            WHERE series_id = ?`,
            [seriesId]
          );

          const existingMap = new Set(existRows.map(r => `${r.season_num}-${r.episode_num}`));

          const streamsValues = [];
          const episodesValues = [];

          for (const ep of season) {
            try {
              const epName = `S${seasonNum}E${ep.episode_num} - ${ep.title || series.name}`;
              const streamSource = JSON.stringify([`${XTREAM_URL_VODS}/series/${XTREAM_USER_VODS}/${XTREAM_PASS_VODS}/${ep.id}.${ep.container_extension}`]);

              // Caso o episodio já exista no banco de dados, ignora todo o restante e prossegue
              if(existingMap.has(`${seasonNum}-${ep.episode_num}`))
                continue;
              
              const movieProperties = JSON.stringify({
                release_date: ep?.releaseDate || '',
                plot: ep?.plot || '',
                duration_secs: ep?.info?.duration_secs || 0,
                duration: ep?.info?.duration || '',
                movie_image: ep?.info?.movie_image || '',
                season: seasonNum,
                tmdb_id: info?.info?.tmdb_id || ''
              });

              streamsValues.push([
                5, `[${catId || ''}]`, epName, streamSource, ep?.info?.movie_image || '',
                ep?.plot || '', 0, movieProperties, 0, 'mp4', 0, 0, 1,
                Math.floor(Date.now() / 1000), seriesId, 'pt-br', null, 0
              ]);

              /*const [streamRes] = await connection.query(`
                INSERT INTO streams 
                (type, category_id, stream_display_name, stream_source, stream_icon, notes, 
                enable_transcode, movie_properties, read_native, target_container, stream_all, 
                remove_subtitles, direct_source, added, series_no, tmdb_language, year, rating)
                VALUES (5, ?, ?, ?, ?, ?, 0, ?, 0, 'mp4', 0, 0, 1, ?, ?, 'pt-br', NULL, 0)`,
                [
                  `[${catId || ''}]`,
                  epName,
                  streamSource,
                  ep?.info?.movie_image || '',
                  ep?.plot || '',
                  movieProperties,
                  Math.floor(Date.now() / 1000),
                  seriesId
                ]
              );*/
/*
              const streamId = streamRes.insertId;

              await connection.query(`
                INSERT INTO streams_episodes (stream_id, series_id, season_num, episode_num)
                VALUES (?, ?, ?, ?)`,
                [streamId, seriesId, seasonNum, ep.episode_num]
              );*/
            } catch (err) {
              console.warn(`⚠️ Falha ao inserir episódio S${seasonNum}E${ep.episode_num}: ${err.message}`);
            }
          }

          // Inserindo tudo de uma vez para ganhar tempo
          if (streamsValues.length > 0) {
            const [result] = await connection.query(`
              INSERT INTO streams 
              (type, category_id, stream_display_name, stream_source, stream_icon, notes,
              enable_transcode, movie_properties, read_native, target_container, stream_all,
              remove_subtitles, direct_source, added, series_no, tmdb_language, year, rating)
              VALUES ?
            `, [streamsValues]);

            // Gerar os stream_id correspondentes
            const firstId = result.insertId;
            const episodesBatch = streamsValues.map((_, idx) => [
              firstId + idx, seriesId, seasonNum, season[idx].episode_num
            ]);

            await connection.query(`
              INSERT INTO streams_episodes (stream_id, series_id, season_num, episode_num)
              VALUES ?
            `, [episodesBatch]);
            if(existing) {
              console.log(`🆕 ${series.name}: ${streamsValues.length} novos episódios`)
            }
          }
        }
      }

      newCount++;
    }
  }

  console.log(`✅ ${newCount} novas séries inseridas.`);
  console.log(`⏭️ ${skipCount} séries já existiam.`);
  if (failCount > 0) console.log(`❌ ${failCount} falhas ao inserir séries.`);

  if (newCount > 0) {
    await updateBouquets(connection, [1, 2], 5);
  }
}

main();
