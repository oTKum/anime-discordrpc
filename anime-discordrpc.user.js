// ==UserScript==
// @name         Anime DiscordRPC
// @namespace    https://github.com/oTKum/
// @version      0.1
// @description  アニメ用のDiscordRPC
// @author       otokoume
// @match        https://www.nicovideo.jp/watch/so*
// @match        https://live2.nicovideo.jp/watch/*
// @match        https://www.amazon.co.jp/*
// @include      /https://www\.nicovideo\.jp/watch/\d+/
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const BASE_URL = 'http://localhost:6463/setRPC';
    const IDLE_URL = `${BASE_URL}?isIdle=true`;

    const supportedService = {
        // TODO: ZenzaWatchでの視聴にも対応したい
        'www.nicovideo'  : 'ニコニコ動画',
        'live2.nicovideo': 'ニコニコ生放送',
        'amazon.co.jp'   : 'Prime Video',
    };

    // 現在ページのサービス名
    let service;

    // 現在ページのサービスを特定
    for (const [k, v] of Object.entries(supportedService)) {
        if (window.location.href.includes(k)) {
            service = v;

            break;
        }
    }

    // 特定できなければ終了
    if (!service) return;

    /**
     * フェッチURLを生成する
     * @param {string} service サービス名
     * @param {string} product 作品名
     * @param {number} timestamp 動画の開始時刻のタイムスタンプ
     * @param {string} sImgKey 小画像のキー名
     * @returns {string} URL
     */
    const genUrl = (service, product, timestamp, sImgKey) =>
        `${BASE_URL}?service=${service}&product=${product}&timestamp=${timestamp}&sImgKey=${sImgKey}`;

    /**
     * 指定の要素が現れるまで待機する
     * @param {string} selector
     * @returns {Promise<Element>}
     */
    const waitForElement = (selector) => {
        return new Promise((resolve) => {
            const listener = setInterval(() => {
                const $elem = document.querySelector(selector);

                if (!$elem) return;

                clearInterval(listener);
                resolve($elem);
            }, 500);
        });
    };

    // 各サービスごとの処理
    switch (service) {
        case 'ニコニコ動画':
            // 動的に動画が表示されるため、生成を待ってから処理
            waitForElement('#MainVideoPlayer video').then(($player) => {
                // さらに動画が読み込まれるまで待機
                const observer = new MutationObserver(() => {
                    // videoタグが再生成されるようなので再度取得
                    const _$player = document.getElementById('MainVideoPlayer').getElementsByTagName('video')[0];

                    observer.disconnect();
                    nicovideoHandler(_$player);
                });

                observer.observe($player, { attributes: true });
            });

            break;

        case 'ニコニコ生放送':
            nicoliveHandler();

            break;

        case 'Prime Video':
            primeVideoHandler();

            break;
    }

    // ページ遷移時は作品名の表示を消す
    window.addEventListener('beforeunload', () => fetch(IDLE_URL));

    /**
     * 遅延実行可能で、重複リクエストを阻止するFetchを提供する
     */
    class DelayedFetch {
        /**
         * リクエスト待機中のFetchのsetIntervalID
         * @type {number}
         */
        #queuedId;

        /**
         * リクエスト待機開始時のUNIX時間
         * @type {number}
         */
        #queuedTime;

        /**
         * @type {AbortController}
         */
        #controller;

        /**
         * @constructor
         */
        constructor() {
            this.#queuedId   = 0;
            this.#queuedTime = 0;
            this.#controller = new AbortController();
        }

        /**
         * リクエストを発行する。リクエスト待機中に重複して発行された場合は上書きされる。
         * @param {string} url リクエスト先のURL
         * @param {number} timeout リクエスト発行まで待機する時間（ミリ秒）
         * @returns {Promise<Response>}
         */
        async set(url, timeout = 1000) {
            // すでに待機されてたら初期化する
            if (this.#queuedId !== 0) {
                clearInterval(this.#queuedId);
                this.#queuedId   = 0;
                this.#queuedTime = 0;
                this.#controller.abort();
            }

            this.#controller = new AbortController();
            this.#queuedTime = new Date().getTime();
            this.#queuedId   = setInterval(() => {
                const hasWaitTimeElapsed = (new Date().getTime() - this.#queuedTime) >= timeout;

                // 指定待機時間を過ぎたら抜け出す
                if (hasWaitTimeElapsed) {
                    this.#queuedTime = 0;
                    clearInterval(this.#queuedId);
                }
            }, 100);

            // 現在のIntervalIDを保持
            const tmpQueuedId = this.#queuedId;

            // 指定時間経過処理の終了を待機
            await new Promise((resolve) => {
                const interval = setInterval(() => {
                    if (this.#queuedTime === 0) {
                        resolve();
                        clearInterval(interval);
                    }
                }, 100);
            });

            // IntervalIDが更新されていたら、この実行インスタンスは古いものとみなし終了する
            if (tmpQueuedId !== this.#queuedId) return null;

            // 正常にリクエストできる場合はIntervalIDをリセット
            this.#queuedId = 0;

            return fetch(url, { signal: this.#controller.signal });
        }
    }

    const dFetch = new DelayedFetch();

    /**
     * 現在時刻から指定秒前のタイムスタンプを取得する
     * @param {number} sec 遡る時間（秒）
     * @returns {number} UNIX時間
     */
    const getTimestampAt = (sec) =>
        new Date(new Date() - new Date(0).setSeconds(sec)).getTime();

    /**
     * ニコニコ動画用の処理
     * @param {HTMLVideoElement} $player 動画プレイヤーの要素
     */
    function nicovideoHandler($player) {
        // 作品名
        const product     = document.getElementsByClassName('ChannelInfo-pageLink')[0].textContent;
        // 動画ジャンル
        const genre       = data?.content.genre;
        // 動画種別
        const contentType = data?.content.content_type;

        // チャンネル動画じゃなければ終了
        if (contentType !== 'channel') return;

        // アニメじゃなければ終了
        if (genre !== 'アニメ') return;

        const IMAGE_KEY = 'small_nico';
        const pauseUrl  = genUrl(service, product, 0, IMAGE_KEY);

        fetch(pauseUrl);

        // 再生時にタイムスタンプ設定
        $player.addEventListener('play', () => {
            sendRPC();
        });

        // ポーズ時にタイムスタンプ破棄
        $player.addEventListener('pause', () => {
            dFetch.set(pauseUrl);
        });

        // シーク時にタイムスタンプ更新
        $player.addEventListener('seeked', () => {
            // ポーズ中は更新しない
            if ($player.paused) return false;

            sendRPC();
        });

        // 再生終了時にアクティビティ初期化
        $player.addEventListener('ended', () => fetch(IDLE_URL));

        function sendRPC() {
            const curPlayTime = Math.floor($player.currentTime);
            const timestamp   = getTimestampAt(curPlayTime);
            const url         = genUrl(service, product, timestamp, IMAGE_KEY);

            dFetch.set(url);
        }
    }

    /**
     * ニコニコ生放送用の処理
     */
    function nicoliveHandler() {
        // 作品名
        const $product  = document.getElementsByClassName('___channel-name-anchor___dQ-bQ')[0];
        // 分類されているタグ
        const $tags     = document.getElementsByClassName('___tag___3KpH_');
        // 提供種別
        const $provider = document.getElementsByClassName('___program-label-view___3bf0n');

        // アニメタグがなければ終了
        if ([...$tags].every((v) => !v.textContent.includes('アニメ'))) return;

        // 公式放送じゃなければ終了
        if (!$provider.length || $provider[0].textContent !== '公式') return;

        const url = genUrl(service, $product.textContent, 0, 'small_nico_live');

        fetch(url);
    }

    /**
     * プライムビデオ用の処理
     */
    function primeVideoHandler() {
        // 動画概要コンテナ
        const $container = document.getElementsByClassName('av-dp-container');

        // 動画視聴ページでなければ終了
        if (!$container.length) return;

        // 作品名
        const $product = $container[0].getElementsByClassName('_1GTSsh _2Q73m9')[0];

        // ジャンル項目
        // const $genreEntry = [...document
        //     .getElementsByClassName('_1ONDJH')[0]
        //     .getElementsByTagName('dl')]
        //     // ジャンルラベルを検索
        //     .filter((v) => {
        //         const $this = v.getElementsByTagName('span');
        //
        //         if (!$this.length) return false;
        //
        //         return $this[0].innerText === 'ジャンル';
        //     });

        // ジャンル項目がある場合はアニメが含まれるかチェック
        // if ($genreEntry.length) {
        //     const $genres = $genreEntry[0].nextElementSibling.getElementsByTagName('a');
        //
        //     // TODO: アニメジャンルが含まれなかったら確認表示
        //     if ([...$genres].every((v) => !v.textContent === 'アニメ')) {
        //     }
        // }

        const url = genUrl(service, $product.textContent, 0, 'small_prime_video');

        fetch(url);
    }
})();
