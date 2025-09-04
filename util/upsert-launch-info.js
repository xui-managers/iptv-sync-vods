const fs = require('fs/promises');
const path = require('path');

const launchFilePath = path.resolve('./launch-info.json');

async function getLaunchInfo({ userId, username, hostname, isNewSync }) {
  let data = [];
  let result = null;

  try {
    const fileContent = await fs.readFile(launchFilePath, 'utf-8');
    data = JSON.parse(fileContent);
    if (!Array.isArray(data)) data = [];
  } catch (err) {
    // Se não existir, cria array vazia
    if (err.code !== 'ENOENT') throw err;
  }

  const index = data.findIndex(
    item => item.userId === userId && item.username === username && item.hostname === hostname
  );

  if (index === -1) {
    result = {
      userId,
      username,
      hostname: hostname ?? '',
      lastUpdate: null
    }
    data.push(result);
    await fs.writeFile(launchFilePath, JSON.stringify(data, null, 4), 'utf-8');
  } else {
    result = {
      ...data[index],
      ...isNewSync ? { lastUpdate: null} : {},
    };
  }

  return result;
}

async function updateLaunchInfo({ userId, username, hostname, lastUpdate }) {
  let data = [];

  try {
    const fileContent = await fs.readFile(launchFilePath, 'utf-8');
    data = JSON.parse(fileContent);
    if (!Array.isArray(data)) data = [];
  } catch (err) {
    if (err.code === 'ENOENT') return null; 
    throw err;
  }

  const index = data.findIndex(
    item => item.userId === userId && item.username === username && item.hostname === hostname
  );

  if (index === -1) return null; 

  data[index].lastUpdate = lastUpdate;

  await fs.writeFile(launchFilePath, JSON.stringify(data, null, 4), 'utf-8');
  return data[index];
}

module.exports = { getLaunchInfo, updateLaunchInfo };

