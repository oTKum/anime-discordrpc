const app = require('express')();
const RPC = require('discord-rpc');

const CLIENT_ID = '778667680931905618';
const SCOPE     = ['rpc'];

const startTimestamp = new Date().getTime();
const client         = new RPC.Client({ transport: 'ipc' });

client.on('ready', onReady);

client.login({ clientId: CLIENT_ID }).catch((reason) => {
    console.error(`Failed to login: ${reason}`);
    process.exit(0);
});

app.get('/setRPC', setActivity).listen(6463);

process
    .on('exit', () => {
        client.clearActivity();
        client.destroy();
    })
    .on('SIGTERM', () => {
        client.clearActivity();
        client.destroy();
    })
    .on('SIGINT', () => {
        client.clearActivity();
        client.destroy();
        process.exit(0);
    });

/**
 * 初期化処理
 */
function onReady() {
    console.log(`Logged in as ${client.application}`);
    setActivity({ query: {} });
}

/**
 * アクティビティを設定する
 * @param req
 */
function setActivity(req) {
    const query  = req.query;
    const status = query.isIdle ? genStatus() : genStatus(query.product, query.sImgKey, query.service);

    client.setActivity(status).catch((reason) => {
        console.error(reason);
        process.exit(0);
    });
}

/**
 * アクティビティのペイロードを生成する
 * @param {string} product 作品名
 * @param {string} smallImageKey 小画像のファイル名
 * @param {string} smallImageText 小画像のテキスト
 * @returns {{smallImageKey: string, largeImageText: string, largeImageKey: string, details: string, state:
 *     string, smallImageText: string, startTimestamp: number}}
 */
function genStatus(product = '', smallImageKey = '  ', smallImageText = '  ') {
    return {
        state         : product !== '' ? `📺${product}` : '(σ回ω・)σ',
        details       : product !== '' ? `Now watching:` : '  ',
        startTimestamp: startTimestamp,
        largeImageKey : 'large',
        largeImageText: 'Watching animes',
        smallImageKey : smallImageKey,
        smallImageText: smallImageText,
    };
}
