/**
 * Atualiza os bouquets com todos os IDs de canais, filmes ou séries, dependendo do tipo informado.
 *
 * @async
 * @param {object} connection - Conexão MySQL utilizada para executar queries.
 * @param {number[]} bouquetIds - Array de IDs dos bouquets a serem atualizados.
 * @param {number} type - Tipo de stream: 1 para canais, 2 para filmes, 3 para séries.
 * @returns {Promise<void>} Retorna uma Promise que resolve quando a atualização estiver concluída.
 *
 * @example
 * await updateBouquets(connection, [1, 2, 3], 2);
 */
async function updateBouquets(connection, bouquetIds, type) {
  const column = type == 1 ? 'bouquet_channels' : type == 2 ? 'bouquet_movies' : 'bouquet_series';
  const [streams] = await connection.query(`SELECT id FROM streams WHERE type = ${type}`);
  const novosIds = streams.map(f => f.id);

  if (novosIds.length === 0) {
    console.log(`⚠️ Nenhum stream type ${type} encontrado na tabela streams.`);
    return;
  }

  // 2. Para cada bouquet, fazer merge e atualizar
  for (const bouquetId of bouquetIds) {
    const [rows] = await connection.query(
      `SELECT \`${column}\` FROM bouquets WHERE id = ?`,
      [bouquetId]
    );

    if (rows.length === 0) {
      console.warn(`❌ Bouquet ID ${bouquetId} não encontrado.`);
      continue;
    }

    await connection.query(
      `UPDATE bouquets SET \`${column}\` = ? WHERE id = ?`,
      [JSON.stringify(novosIds), bouquetId]
    );

    console.log(`✅ Bouquet ID ${bouquetId} s.`);
  }
}

module.exports = updateBouquets;