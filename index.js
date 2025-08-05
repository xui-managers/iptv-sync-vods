require('dotenv').config();
const axios = require('axios');
const mysql = require('mysql2/promise');

// --- CONFIGURAÇÕES ---
const {
    XTREAM_URL, XTREAM_USER, XTREAM_PASS,
    DB_HOST, DB_USER, DB_PASSWORD, DB_NAME
} = process.env;

// Validação básica das variáveis de ambiente
if (!XTREAM_URL || !XTREAM_USER || !XTREAM_PASS || !DB_HOST || !DB_USER || !DB_PASSWORD || !DB_NAME) {
    console.error("ERRO: Por favor, configure todas as variáveis no arquivo .env");
    process.exit(1);
}

const xtreamApiUrl = `${XTREAM_URL}/player_api.php?username=${XTREAM_USER}&password=${XTREAM_PASS}`;

async function main() {
    console.log("Iniciando processo de sincronização...");
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

        console.log("Conectado ao banco de dados MySQL.");

        console.log("Buscando dados da API Xtream Codes...");
        const [apiCategories, apiStreams] = await Promise.all([
            axios.get(`${xtreamApiUrl}&action=get_live_categories`),
            axios.get(`${xtreamApiUrl}&action=get_live_streams`)
        ]);

        if (!Array.isArray(apiCategories.data) || !Array.isArray(apiStreams.data)) {
            throw new Error("Resposta da API inválida. Verifique suas credenciais e URL.");
        }

        console.log(`Encontradas ${apiCategories.data.length} categorias e ${apiStreams.data.length} canais na API.`);

        const connection = await dbPool.getConnection();
        await connection.beginTransaction();
        console.log("Iniciando transação com o banco de dados.");

        try {
            const apiToDbCategoryIdMap = await processCategories(connection, apiCategories.data);
            await processStreams(connection, apiStreams.data, apiToDbCategoryIdMap);

            await connection.commit();
            console.log("Transação concluída com sucesso!");

        } catch (error) {
            await connection.rollback();
            console.error("ERRO durante a transação. As alterações foram revertidas.");
            throw error;
        } finally {
            connection.release();
            console.log("Conexão com o banco de dados liberada.");
        }

    } catch (error) {
        console.error("Ocorreu um erro fatal no processo:", error.message);
    } finally {
        if (dbPool) {
            await dbPool.end();
            console.log("Pool de conexões do banco de dados encerrado.");
        }
        console.log("Processo de sincronização finalizado.");
    }
}

async function processCategories(connection, apiCategories) {
    console.log("Processando categorias...");
    const [existingDbCategories] = await connection.query(
        "SELECT id, category_name FROM streams_categories WHERE category_type = 'live'"
    );

    const existingCategoryMap = new Map(existingDbCategories.map(c => [c.category_name, c.id]));
    const apiToDbCategoryIdMap = new Map();
    let newCategoriesCount = 0;

    for (const apiCategory of apiCategories) {
        const apiCategoryIdStr = String(apiCategory.category_id);

        if (existingCategoryMap.has(apiCategory.category_name)) {
            const dbId = existingCategoryMap.get(apiCategory.category_name);
            apiToDbCategoryIdMap.set(apiCategoryIdStr, dbId);
        } else {
            console.log(`  -> Inserindo nova categoria: "${apiCategory.category_name}"`);
            const [result] = await connection.query(
                'INSERT INTO streams_categories (category_type, category_name) VALUES (?, ?)',
                ['live', apiCategory.category_name]
            );
            const newDbId = result.insertId;
            apiToDbCategoryIdMap.set(apiCategoryIdStr, newDbId);
            existingCategoryMap.set(apiCategory.category_name, newDbId);
            newCategoriesCount++;
        }
    }
    console.log(`${newCategoriesCount} novas categorias foram inseridas.`);
    return apiToDbCategoryIdMap;
}

/**
 * Processa os canais da API, inserindo novos ou atualizando existentes.
 */
async function processStreams(connection, apiStreams, apiToDbCategoryIdMap) {
    console.log("Processando canais (streams)...");
    
    const [existingStreams] = await connection.query("SELECT stream_source, id, custom_sid FROM streams WHERE type = 1;");
    const existingStreamSids = new Set(existingStreams.map(s => `${s.stream_display_name}:${s.custom_sid}`));
    
    let newStreamsCount = 0;
    let updatedStreamsCount = 0;
    let skippedStreamsCount = 0;

    for (const stream of apiStreams) {
        const apiStreamId = String(stream.stream_id);
        const apiCategoryIdStr = String(stream.category_id);
        const dbCategoryId = apiToDbCategoryIdMap.get(apiCategoryIdStr);

        if (!dbCategoryId) {
            console.warn(`  -> Pulando canal "${stream.name}" (ID: ${apiStreamId}) porque sua categoria (ID API: ${apiCategoryIdStr}) não foi encontrada no mapa.`);
            skippedStreamsCount++;
            continue;
        }

        const streamSource = `["${XTREAM_URL}/${XTREAM_USER}/${XTREAM_PASS}/${stream.stream_id}"]`;

        const streamData = {
            category_id: `[${dbCategoryId}]`,
            stream_display_name: stream.name,
            stream_source: streamSource,
            stream_icon: stream.stream_icon,
            order: stream.num || 0
        };

        // Canal é novo, então INSERE
        // Aqui verificamos se ele tem o nome e também o mesmo custom_sid da fonte de canais
        if (!existingStreamSids.has(`${stream.name}:${apiStreamId}`)) {
            const fullStreamData = {
                ...streamData,
                type: 1,
                custom_sid: apiStreamId,
                added: Math.floor(Date.now() / 1000),
            };
            await connection.query('INSERT INTO streams SET ?', [fullStreamData]);
            newStreamsCount++;
        }
    }

    console.log(`${newStreamsCount} novos canais foram inseridos.`);
    if (skippedStreamsCount > 0) {
        console.log(`${skippedStreamsCount} canais foram pulados por falta de categoria.`);
    }
}

main();