const updates = [];

async function prepareVodUpdate(item, type) {
    updates.push(item);
}

module.exports = {updates, prepareVodUpdate};