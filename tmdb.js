
const { PrismaClient } = require('@prisma/client');
const { exec } = require("child_process");
const prisma = new PrismaClient();
const stringSimilarity = require("string-similarity");
const axios = require('axios');
const fs = require("fs/promises");
const util = require('util');
const execAsync = util.promisify(exec);

let allMovies = [];
let hasCache = false;

async function getMovieInfoCL({tmdbId, name, year, vod, category_name}) {
    try {  
        // Ignora filmes adultos para ser mais rapido, já que a maioria não tem TMDB
        if(name.toLowerCase().includes('[xxx]')  || name.toLowerCase().includes('xxx ') || name.toLowerCase().includes('[adulto]') || name.includes('+18') || category_name?.toLowerCase()?.includes('adulto')) {
            return null;
        }
        let data = null;
        const exist = await getMovieFromDbOrSimilarity({
            tmdbId,
            name,
            year,
            vod,
        });
        if(exist) {
            return exist;
        }
        
        const apiKey = process.env.TMDB_API_KEY;
        // 1. Tenta buscar pelo tmdbId
        if (tmdbId) {
            const res = await fetch(
                `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${apiKey}&language=pt-BR`
            ).catch((err) => console.error(err))
            if (res.ok) {
                data = await res.json();
            }
        }

        // 2. Tenta buscar pelo nome + ano
        if (name && !data) {
            const query = new URLSearchParams({
                api_key: apiKey,
                language: "pt-BR",
                query: name,
                year: year?.toString() || ""
            });

            const res = await fetch(`https://api.themoviedb.org/3/search/movie?${query}`).catch((err) => console.error(err));

            if (res.ok) {
                const result = await res.json();
                if (result.results.length > 0) {
                    data = result.results[0]; // pega o mais relevante
                }
            }
        }
        
        if(data) {
            return saveMovieProperties(data, vod);
        }
        return null;
    } catch (error) {
        throw error;
    }
}

function prepareMovieProperties(tmdbData, vod) {
  if (!tmdbData && !vod) return {};

  const info = tmdbData || {};

  return {
    kinopoisk_url: info?.movie_image || '',
    tmdb_id: info?.id?.toString() || '',
    name: info?.title ?? vod?.name ?? '',
    o_name: info?.original_title ?? vod?.name ?? '',
    cover_big: info?.backdrop_path
      ? `https://image.tmdb.org/t/p/w1280${info.backdrop_path}`
      : '',
    movie_image: info?.poster_path
      ? `https://image.tmdb.org/t/p/w500${info.poster_path}`
      : vod?.stream_icon ?? '',
    release_date: info?.release_date ?? '',
    episode_run_time: info?.episode_run_time ?? '',
    youtube_trailer: info?.youtube_trailer ?? '',
    director: info?.director ?? '',
    actors: info?.actors ?? '',
    cast: info?.credits?.cast
      ? info.credits.cast.map(c => c.name).join(', ')
      : '',
    description: info?.description ?? '',
    plot: info?.overview ?? '',
    age: info?.age ?? '',
    mpaa_rating: info?.mpaa_rating ?? '',
    rating_count_kinopoisk: info?.rating_count_kinopoisk ?? 0,
    country: info?.production_countries
      ? info.production_countries.map(c => c.name).join(', ')
      : '',
    genre: info?.genres
      ? info.genres.map(g => g.name).join(', ')
      : '',
    backdrop_path: info?.backdrop_path
      ? [`https://image.tmdb.org/t/p/w1280${info.backdrop_path}`]
      : [],
    duration_secs: info?.duration_secs ?? '',
    duration: info?.duration ?? '',
    runtime: info?.runtime ?? '',
    video: info?.video ?? [],
    audio: info?.audio ?? [],
    bitrate: info?.bitrate ?? 0,
    rating: info?.vote_average?.toString() ?? '0',
  };
}

async function saveMovieProperties(tmdbData, vod) {
  const movieProperties = prepareMovieProperties(tmdbData, vod);

  // insere ou atualiza
  await prisma.movieCache.upsert({
    where: { tmdb_id: movieProperties.tmdb_id },
    update: {
        name: movieProperties.name,
        year: new Date(movieProperties.release_date).getFullYear()?.toString() ?? '',
        tmdb_id: movieProperties.tmdb_id,
        data: JSON.stringify(movieProperties)
    },
    create: {
        name: movieProperties.name,
        year: new Date(movieProperties.release_date).getFullYear()?.toString() ?? '',
        tmdb_id: movieProperties.tmdb_id,
        data: JSON.stringify(movieProperties)
    }
  });

  return movieProperties;
}

async function searchMoviesBySimilarity(name, year, vod) {
  const candidates = allMovies
    .map(m => {
      const movie = JSON.parse(m.data);

      // Similaridade de nome
      const nameScore = stringSimilarity.compareTwoStrings(
        name.toLowerCase(),
        movie.name.toLowerCase()
      );

      // Se ano disponível, dá um pequeno bônus
      let score = nameScore;
      if (year && movie.release_date) {
        const movieYear = new Date(movie.release_date).getFullYear();
        if (movieYear === year) score += 0.1; // aumenta prioridade
      }

      return { movie, score };
    })
    .filter(c => c.score > 0.75) // só pega parecido
    .sort((a, b) => b.score - a.score); // do mais parecido pro menos

  return candidates.map(c => c.movie);
}

async function getMovieFromDbOrSimilarity({ tmdbId, name, year, vod }) {
  // 1️⃣ Tenta buscar pelo tmdb_id
  if (tmdbId) {
    const movie = allMovies.find((i) => i.tmdb_id === tmdbId.toString());
    if (movie) {
        return JSON.parse(movie.data);
    }
  }

  if (name) {
    const similarMovies = await searchMoviesBySimilarity(name, year, vod);
    if (similarMovies.length > 0) {
      return similarMovies[0];
    }
  }

  return null;
}

async function ensureAllMovies(args) {
    if(hasCache === false || allMovies.length === 0 && process.env.DISABLE_GLOBAL_CACHE !== 'false') {
      const response = await axios.post("http://cache.xui-managers.site/global-cache", args, { responseType: "arraybuffer", timeout: 50000 }).catch(() => {});
      const dbPath = "./prisma/tmdb_cache.db";
      if(response?.data) {
        try {
          await fs.access(dbPath);
          //TODO bd already exist, make functions to merge it
        } catch (error) {
          await fs.writeFile(dbPath, response.data);
          await new Promise((resolve) => {
            setTimeout(() => resolve(), 2000);
          });
        }
      } else {
        await execAsync("npx prisma db push");
      }
      allMovies = await prisma.movieCache.findMany();
      hasCache = true;
    }
}

module.exports = {getMovieInfoCL, ensureAllMovies};