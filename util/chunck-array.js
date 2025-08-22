/**
 * Coloque o chunkSize conforme necessário.
 * O servidor de destino aguenta tranquilamente, porém
 * a api onde voce puxa os VODs, pode nao aguentar muitas requisições sumultaneas
 * Sugiro testar conforme você prefere.
 * Por padrão, deixo 100, pois funcionou bem para mim
 */
const chunkSize = 100;

function chunkArray(array) {
  const chunks = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

module.exports = chunkArray;