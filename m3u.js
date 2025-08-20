/**
 * Esse arquivo ele importa exatamente na ordem todas as listas m3u fazendo a inserção
 * Ideal para quando voce deseja organizar os seus canais, então edite a lista na ordem que deseja, e depois importa
 * Ela apagará todo o banco de dados e depois irá inserir
 * Não esqueça de trocar o M3U8_PATH no env
 */
require('dotenv').config();
const fs = require('fs');
const mysql = require('mysql2/promise');
const path = require('path');

// --- CONFIGURAÇÕES ---
const {
    M3U8_PATH,
    DB_HOST, DB_USER, DB_PASSWORD, DB_NAME
} = process.env;

if (!M3U8_PATH || !DB_HOST || !DB_USER || !DB_PASSWORD || !DB_NAME) {
    console.error("ERRO: Configure todas as variáveis no arquivo .env");
    process.exit(1);
}


const adultChannels = [];
const normalChannels = [];

/**
 * Nessa array é para voce colocar o nome das categorias que tem no arquivo para elas serem ordenadas assim
 * Pensei em usar o m3u, porem para isso eu teria que alterar a a ordem dos canais, o que para mim não é interessante
 */
const categoriasOrganizadas = [
  // Globos
  "JOGOS DO DIA",
  "EVENTOS INTERNACIONAIS",
  "CANAIS | A FAZENDA 17",
  "CANAIS | GLOBOS CAPITAIS",
  "CANAIS | GLOBOS INTERIORES",

  // Esportes
  "CANAIS | PREMIERES",
  "CANAIS | SPORTV",
  "CANAIS | ESPN",
  "CANAIS | AMAZON PRIME",
  "CANAIS | DISNEY +",
  "CANAIS | PARAMOUNT+",
  "CANAIS | MAX",
  "CANAIS | CAZE TV",
  "CANAIS | SPORTY NET",
  "CANAIS | UFC FIGHT PASS",
  "CANAIS | NBA LEAGUE PASS",
  "CANAIS | PAULISTÃO SICREDI 2025",
  "CANAIS | BRASILEIRAO SERIE D",
  "CANAIS | ESPORTES",

  // Abertos nacionais
  "CANAIS | RECORD",
  "CANAIS | SBT",
  "CANAIS | MAIS SBT",
  "CANAIS | BAND",
  "CANAIS | ABERTOS",

  // Filmes & séries / streams
  "CANAIS | TELECINE",
  "CANAIS | HBO",
  "CANAIS | CINE SKY",
  "CANAIS | FILMES E SERIES",

  // Notícias e variedades
  "CANAIS | NOTÍCIAS",
  "CANAIS | VARIEDADES",
  "CANAIS | DOCUMENTARIOS",

  // Infantis
  "CANAIS | INFANTIS",

  // Internacionais / religiosos
  "CANAIS | RELIGIOSOS",
  "INTERNACIONAIS | GERAL",
  "INTERNACIONAIS | EUA",
  "INTERNACIONAIS | PORTUGAL",
  "INTERNACIONAIS | FRANÇA",

  // Realitys & especiais
  "CANAIS | 24 HORAS",
  "CANAIS | INFANTIS 24H",
  "CANAIS | DESENHOS 24H",
  "CANAIS | SERIES 24H",
  "CANAIS | NOVELA 24H",
  "CANAIS | SHOWS 24H",

  // Adultos
  "XXX: +18 | ADULTOS"
];
async function main() {
    console.log("Iniciando sincronização via M3U8...");
    let dbPool;
    try {
        dbPool = mysql.createPool({
            host: DB_HOST,
            user: DB_USER,
            password: DB_PASSWORD,
            database: DB_NAME,
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0
        });

        console.log("Conectado ao MySQL.");
        
        console.log("Lendo arquivo M3U8...");
        const m3uData = fs.readFileSync(path.resolve(M3U8_PATH), 'utf8');
        const canais = parseM3U8(m3uData);

        console.log(`Encontrados ${canais.length} canais no arquivo.`);

        // Organiza dados antes de mexer no banco
        const categoriasMap = new Map(); // nome -> id temporário
        canais.forEach(c => {
            if (!categoriasMap.has(c.group)) {
                categoriasMap.set(c.group, categoriasMap.size + 1);
            }
        });

        const categorias = Array.from(categoriasMap.keys());

        // Agora vamos inserir tudo em uma transação
        const connection = await dbPool.getConnection();
        await connection.beginTransaction();
        try {
            console.log("Limpando tabelas...");
            await connection.query("DELETE FROM streams_categories WHERE category_type = 'live'");
            await connection.query("DELETE FROM streams WHERE type = 1");
            await connection.query("DELETE FROM streams_servers");
            await connection.query("UPDATE bouquets SET bouquet_channels = ''");
            console.log("Inserindo categorias...");
            const categoryIdMap = new Map();
            for (const cat of categorias) {
                const cat_order = categoriasOrganizadas.indexOf(cat) + 1;
                const [res] = await connection.query(
                    "INSERT INTO streams_categories (category_type, category_name, cat_order) VALUES (?, ?, ?)",
                    ['live', cat, cat_order]
                );
                categoryIdMap.set(cat, res.insertId);
            }

            console.log("Inserindo canais...");
            // ordem normal do arquivo
            for (let i = 0; i < canais.length; i++) {
                const c = canais[i];
                
                // Inserir na tabela streams
                const [res] = await connection.query(
                    "INSERT INTO streams (type, category_id, stream_display_name, stream_source, stream_icon, read_native, `order`, custom_sid, added, gen_timestamps, direct_source, allow_record, probesize_ondemand) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    [
                        1,
                        `[${categoryIdMap.get(c.group)}]`,
                        c.name,
                        `["${c.url}"]`,
                        c.logo || null,
                        false,
                        i + 1,
                        c.id || `m3u_${i+1}`,
                        Math.floor(Date.now() / 1000),
                        false,
                        false,
                        false,
                        542000
                    ]
                );

                const streamId = res.insertId;
                
                if (c.name.toLowerCase().includes("xxx") || c.category?.toLowerCase() === "adult") {
                    adultChannels.push(streamId);
                } else {
                    normalChannels.push(streamId);
                }

                // Inserir na streams_servers
                await connection.query(
                    "INSERT INTO streams_servers (stream_id, server_id, on_demand) VALUES (?, ?, ?)",
                    [streamId, 1, true]
                );
            }

            const allAdultChannels = [...normalChannels, ...adultChannels];

            await connection.query(
                "UPDATE bouquets SET bouquet_channels = ? WHERE bouquet_name LIKE '%c/ Adult%'",
                [`[${allAdultChannels.join(",")}]`]
            );

            await connection.query(
                "UPDATE bouquets SET bouquet_channels = ? WHERE bouquet_name NOT LIKE '%c/ Adult%'",
                [`[${normalChannels.join(",")}]`]
            );
            await connection.commit();
            console.log("Sincronização concluída!");
        } catch (err) {
            await connection.rollback();
            throw err;
        } finally {
            connection.release();
        }

    } catch (err) {
        console.error("Erro:", err.message);
    } finally {
        if (dbPool) await dbPool.end();
        console.log("Pool de conexões encerrado.");
    }
}

// Função para parsear um arquivo M3U8 simples
function parseM3U8(content) {
    const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
    const canais = [];
    let temp = {};
    for (const line of lines) {
        if (line.startsWith('#EXTINF:')) {
            const id = line.match(/tvg-id="([^"]*)"/)?.[1];
            const logo = line.match(/tvg-logo="([^"]*)"/)?.[1];
            const group = line.match(/group-title="([^"]*)"/)?.[1];
            const name = line.split(',')[1]; // pega o texto depois da vírgula

            if (name) {
                temp = {
                    id: id || null,
                    logo: logo || null,
                    group: group || 'Sem Categoria',
                    name: name || 'Sem Nome'
                };
            } else {
                temp = { group: 'Sem Categoria', name: 'Sem Nome' };
            }
        } else if (!line.startsWith('#')) {
            temp.url = line;
            canais.push(temp);
            temp = {};
        }
    }
    return canais;
}

main();