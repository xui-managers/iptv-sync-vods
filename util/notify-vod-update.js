const updates = [];

async function notifyVodUpdate(item, type) {
    updates.push(item);
}

module.exports = {updates, notifyVodUpdate};