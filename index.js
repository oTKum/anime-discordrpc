const app = require('express')();
const RPC = require('discord-rpc');

const CLIENT_OPTIONS = { transport: 'ipc' };
const LOGIN_OPTIONS  = { clientId: '778667680931905618' };
const PORT           = 6463;

const client = new RPC.Client(CLIENT_OPTIONS);

// ログイン
client.login(LOGIN_OPTIONS).catch((reason) => {
    console.error(`Failed to login: ${reason}`);
    process.exit(0);
});

/* サーバー起動 */
// CORS設定
const allowCrossDomain = function (_, res, next) {
    res.header('Access-Control-Allow-Origin', '*');
    res.set({
                'Access-Control-Allow-Origin' : '*',
                'Access-Control-Allow-Headers': 'X-Requested-With',
            });
    next();
};

app.use(allowCrossDomain);

// RPC設定用
app.get('/setRPC', setActivity);

// TODO: Logger用

app.listen(PORT);

// イベント処理
client.on('ready', onReady);

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
    console.log('Logged in');
    setActivity();
}

/**
 * アクティビティを設定する
 * @param {Request} req
 * @param {Response} res
 */
function setActivity(req, res) {
    const query = req?.query;
    let status;

    if (!query || query?.isIdle) {
        status = genStatus();
    } else {
        status = genStatus(query.product, Number(query.timestamp), query.sImgKey, query.service);
    }

    client.setActivity(status)
          .catch((reason) => {
              console.error(reason);
              process.exit(0);
          });

    res?.sendStatus(200);
}

/**
 * アクティビティのペイロードを生成する
 * @param {string} product 作品名
 * @param {number} timestamp 開始時刻のタイムスタンプ（経過時間用）
 * @param {string} smallImageKey 小画像のファイル名
 * @param {string} smallImageText 小画像のテキスト
 * @returns {{smallImageKey: string, largeImageText: string, largeImageKey: string, details: string, state:
 *     string, smallImageText: string, startTimestamp: number}}
 */
function genStatus(product = '', timestamp = 0, smallImageKey = 'none', smallImageText = 'none') {
    // 作品名が長すぎる場合は収める
    if (product.length > 128) {
        // 先頭に絵文字、末尾に三点リーダーを設ける都合により125
        product = product.substring(0, 125) + '…';
    }

    return {
        state         : product !== '' ? `📺${product}` : '(σ回ω・)σ',
        details       : product !== '' ? `Now watching:` : '  ',
        startTimestamp: timestamp,
        largeImageKey : 'large',
        largeImageText: 'Watching animes',
        smallImageKey : smallImageKey,
        smallImageText: `on ${smallImageText}`,
        instance      : true,
    };
}
