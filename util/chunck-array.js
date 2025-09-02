/**
 * Coloque o chunkSize conforme necessário.
 * O servidor de destino aguenta tranquilamente, porém
 * a api onde voce puxa os VODs, pode nao aguentar muitas requisições sumultaneas
 * Sugiro testar conforme você prefere.
 * Por padrão, deixo 200, porém ela é adaptável
 */
let defaultChunkSize = 100;

function chunkArray(array, chunkSize) {
  chunkSize = chunkSize ?? defaultChunkSize;
  const chunks = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

module.exports = {chunkArray, defaultChunkSize};