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
        'www.nicovideo'  : ['ニコニコ動画', 'small_nico'],
        'live2.nicovideo': ['ニコニコ生放送', 'small_nico_live'],
        'amazon.co.jp'   : ['Prime Video', 'small_prime_video']
    };

    // 現在ページのサービス名
    let service;
    // 小画像のキー
    let imageKey;

    // 現在ページのサービスを特定
    for (const [k, v] of Object.entries(supportedService)) {
        if (window.location.href.includes(k)) {
            service  = v[0];
            imageKey = v[1];

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
     * @returns {Promise<HTMLElement>}
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
                const hasWaitTimeElapsed = new Date().getTime() - this.#queuedTime >= timeout;

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

    // ページ遷移時はRPCリセット（DelayedFetchだと反映に間に合わないため、通常フェッチ）
    window.addEventListener('beforeunload', () => fetch(IDLE_URL));

    /**
     * 指定時刻から指定秒前のタイムスタンプを取得する
     * @param {number} sec 遡る時間（秒）
     * @param {number} from 遡る基準のタイムスタンプ (UNIX)
     * @returns {number} タイムスタンプ (UNIX)
     */
    const getTimestampBefore = (sec, from) => {
        const resultTimestamp = new Date(from) - new Date(0).setSeconds(sec);

        return new Date(resultTimestamp).getTime();
    };

    /**
     * RPC情報をクライアントへ送信する
     * @param {string} product 作品名
     * @param {number} curPlayTime 動画プレイヤーの経過時間（秒）
     * @param {number} fromTimestamp 経過時間の原点となるタイムスタンプ (UNIX)
     * @returns {Promise<Response>}
     */
    const sendRPC = (product, curPlayTime, fromTimestamp = new Date().getTime()) => {
        let timestamp;

        // 経過時間と原点となるタイムスタンプが両方0の場合、わざわざ計算させない
        if (curPlayTime === 0 && fromTimestamp === 0) {
            timestamp = 0;
        } else {
            timestamp = getTimestampBefore(curPlayTime, fromTimestamp);
        }

        const url = genUrl(service, product, timestamp, imageKey);

        return dFetch.set(url);
    };

    /**
     * プレイヤーのイベントリスナーを処理する
     * @param {HTMLVideoElement} $player 動画プレイヤー要素
     * @param {string} product 作品名
     */
    const playerEventHandler = ($player, product) => {
        // 最初はアイドル状態で設定
        sendRPC(product, 0, 0);

        // 再生時にタイムスタンプ設定
        $player.addEventListener('play', () => {
            console.log('play');
            sendRPC(product, Math.floor($player.currentTime));
        });

        // ポーズ時にタイムスタンプ破棄
        $player.addEventListener('pause', () => {
            console.log('pause');
            sendRPC(product, 0, 0);
        });

        // シーク時にタイムスタンプ更新
        $player.addEventListener('seeked', () => {
            console.log('seeked');
            // ポーズ中は更新しない
            if ($player.paused) return null;

            sendRPC(product, Math.floor($player.currentTime));
        });

        // 再生終了時にアクティビティリセット
        $player.addEventListener('ended', () => {
            console.log('ended');
            dFetch.set(IDLE_URL);
        });
    };

    /**
     * ニコニコ動画用の処理
     * @param {HTMLVideoElement} $player 動画プレイヤーの要素
     */
    const nicovideoHandler = ($player) => {
        // 作品名
        const product     = document.getElementsByClassName('VideoTitle')[0].textContent;
        // 動画ジャンル
        const genre       = data?.content.genre;
        // 動画種別
        const contentType = data?.content.content_type;

        // チャンネル動画じゃなければ終了
        if (contentType !== 'channel') return;

        // アニメじゃなければ終了
        if (genre !== 'アニメ') return;

        playerEventHandler($player, product);
    };

    /**
     * ニコニコ生放送用の処理
     */
    const nicoliveHandler = () => {
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

        // TODO: [Nicolive] 再生位置を反映

        const url = genUrl(service, $product.textContent, 0, imageKey);

        fetch(url);
    };

    /**
     * プライムビデオ用の処理
     */
    const primeVideoHandler = () => {
        // 動画概要コンテナ
        const $container = document.getElementsByClassName('av-dp-container');

        // 動画視聴ページでなければ終了
        if (!$container.length) return;

        // 作品名
        const product = $container[0].getElementsByClassName('av-detail-section')[0].getElementsByTagName('h1')[0]
            .textContent;

        // 動画プレイヤーを閉じる際にタイムスタンプクリア
        const observer = new MutationObserver((records) => {
            const isPlayerOpened = records[0].target.className.includes('dv-player-fullscreen');

            if (isPlayerOpened) return null;

            sendRPC(product, 0, 0);
        });

        // 動画プレイヤーの出現を待ってから処理
        waitForElement('#dv-web-player video').then(($player) => {
            playerEventHandler($player, product);

            const $rootOfPlayer = document.getElementById('dv-web-player');

            observer.observe($rootOfPlayer, { attributes: true, attributeFilter: ['class'] });
        });

        // TODO: [Prime] 再生直後に広告が入ると、経過時間がその広告分加算されるのを阻止

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
    };

    // 各サービスごとの処理
    switch (service) {
        case 'ニコニコ動画':
            // 動画の生成を待ってから処理
            waitForElement('#MainVideoPlayer video').then(($player) => {
                // さらに動画が読み込まれるまで待機
                const observer = new MutationObserver(() => {
                    // videoタグが再生成されるようなので再度取得
                    const _$player = document.getElementById('MainVideoPlayer')
                                             .getElementsByTagName('video')[0];

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
})();
