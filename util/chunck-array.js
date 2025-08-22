/**
 * Coloque o chunkSize conforme necessário.
 * O servidor de destino aguenta tranquilamente, porém
 * a api onde voce puxa os VODs, pode nao aguentar muitas requisições sumultaneas
 * Sugiro testar conforme você prefere.
 * Por padrão, deixo 50, porém ela é adaptável, caso seja atualização complementar, ela divide por 10 o valor (series)
 * É só deixar em um servidor de forma automatica que a media de sincronizacao complementar assim é de 10 minutos.
 */
let defaultChunkSize = 50;

function chunkArray(array, chunkSize) {
  chunkSize = chunkSize ?? defaultChunkSize;
  const chunks = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

module.exports = {chunkArray, defaultChunkSize};