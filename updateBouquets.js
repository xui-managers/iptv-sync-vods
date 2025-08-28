/**
 * Atualiza os bouquets com todos os IDs de canais, filmes ou séries, dependendo do tipo informado.
 *
 * @async
 * @param {object} connection - Conexão MySQL utilizada para executar queries.
 * @param {number} type - Tipo de stream: 1 para canais, 2 para filmes, 3 para séries.
 * @returns {Promise<void>} Retorna uma Promise que resolve quando a atualização estiver concluída.
 *
 * @example
 * await updateBouquets(connection, 2);
 */
async function updateBouquets(connection, type) {
  let streams = null;
  const column = type == 1 ? 'bouquet_channels' : type == 2 ? 'bouquet_movies' : 'bouquet_series';

  const [bouquetIds] = await connection.query(`SELECT id, bouquet_name FROM bouquets`);

  if(type === 5) {
    [streams] = await connection.query(`SELECT id FROM streams_series`);
  } else {
    [streams] = await connection.query(`SELECT id FROM streams WHERE type = ${type}`);
  }

  const novosIds = streams.map(f => f.id);
  if (novosIds.length === 0) {
    console.log(`⚠️ Nenhum stream type ${type} encontrado na tabela streams.`);
    return;
  }

  // 2. Para cada bouquet atualizar completamente com todas as series
  for (const bouquet of bouquetIds) {
    await connection.query(
      `UPDATE bouquets SET \`${column}\` = ? WHERE id = ?`,
      [JSON.stringify(novosIds), bouquet.id]
    );

    console.log(`✅ Bouquet ${bouquet.bouquet_name.toUpperCase()} (${bouquet.id}) atualizado. ${novosIds.length} series.`);
  }
  return;
}

module.exports = updateBouquets;