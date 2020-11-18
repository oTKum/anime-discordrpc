const app = require('express')();
const RPC = require('discord-rpc');

const CLIENT_ID = '778667680931905618';
const SCOPE     = ['rpc'];

app.get('/setRPC', (req) => {
    const client = new RPC.Client({ transport: 'ipc' });

    client.on('ready', () => setActivity(req, client));

    client.login({ clientId: CLIENT_ID, scopes: SCOPE });
}).listen(8080);

/**
 * アクティビティを設定する
 * @param req
 * @param client
 */
function setActivity(req, client) {
    console.log(`Logged in as ${client.application.name}`);

    const timestamp = new Date().getTime();
    const query     = req.query;
    const status    = query.isIdle
                      ? genStatus()
                      : genStatus(query.title, query.service, timestamp);

    client.setActivity(status);
}

/**
 * アクティビティのペイロードを生成する
 * @param {string} title 作品名
 * @param {string} service サービス名
 * @param {number} timestamp 開始時間
 * @returns {{largeImageText: string, largeImageKey: string, state: string, detail: string, startTimestamp: number}}
 */
function genStatus(title = '', service = '', timestamp = -1) {
    return {
        state         : service !== '' ? `on ${service}` : '',
        detail        : title !== '' ? `Now watching ${title}` : '',
        startTimestamp: timestamp,
        largeImageKey : 'large',
        largeImageText: 'Watching animes',
    };
}
