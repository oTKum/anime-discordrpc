// ==UserScript==
// @name         Anime DiscordRPC
// @namespace    https://github.com/oTKum/
// @version      0.1
// @description  アニメ用のDiscordRPC
// @author       otokoume
// @match        https://www.nicovideo.jp/watch/so*
// @match        https://live2.nicovideo.jp/watch/*
// @include      /https://www\.nicovideo\.jp/watch/\d+/
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // 現在ページのサービス名
    let service;
    // fetch先のリンク
    let url;

    const supportedService = {
        // TODO: ZenzaWatchでの視聴にも対応したい
        'www.nicovideo'        : 'ニコニコ動画',
        'live2.nicovideo'      : 'ニコニコ生放送',
        'amazon.co.jp/gp/video': 'Prime Video',
    };

    const BASE_URL = 'http://localhost:6463/setRPC';

    // 現在ページのサービスを特定
    for (const [k, v] of Object.entries(supportedService)) {
        if (window.location.href.includes(k)) {
            service = v;

            break;
        }
    }

    // 特定できなければ終了
    if (!service) return;

    if (service === 'ニコニコ動画') {
        // 作品名
        const $product = document.getElementsByClassName('ChannelInfo-pageLink')[0];
        // 動画ジャンル
        const $genre   = document.getElementsByClassName('VideoGenreMeta-link')[0];
        // 中央の再生ボタン
        // const $startBt = document.getElementsByClassName('VideoStartButton')[0];
        // 左下の再生ボタン
        // const $playBtn = document.getElementsByClassName('PlayerPlayButton')[0];

        // アニメじゃなければ終了
        if ($genre.text !== 'アニメ') return;

        url = `${BASE_URL}?service=${service}&product=${$product.textContent}&sImgKey=small_nico`;
    } else if (service === 'ニコニコ生放送') {
        // 作品名
        const $product  = document.getElementsByClassName('___channel-name-anchor___dQ-bQ')[0];
        // 分類されているタグ
        const $tags     = document.getElementsByClassName('___tag___3KpH_');
        // 提供種別
        const $provider = document.getElementsByClassName('___program-label-view___3bf0n')[0];

        // アニメタグがなければ終了
        if ([...$tags].every((v) => !v.text.includes('アニメ'))) return;

        // 公式放送じゃなければ終了
        if ($provider.text !== '公式') return;

        url = `${BASE_URL}?service=${service}&product=${$product.text}&sImgKey=small_nico_live`;
    } else if (service === 'Prime Video') {
        // 作品名
        const $product = document.getElementsByClassName('_1GTSsh _2Q73m9')[0];
        // 動画ジャンル
        const $genres  = document
            .getElementsByClassName('_1ONDJH')[0]
            .getElementsByTagName('dl')[2]
            .getElementsByTagName('a');

        // TODO: ジャンルがアニメじゃないものもあるので、その場合は選択式にする

        url = `${BASE_URL}?service=${service}&product=${$product.text}&sImgKey=small_prime`;
    }

    // ページ遷移時は作品名の表示を消す
    window.addEventListener('beforeunload', () => {
        fetch(`${BASE_URL}?isIdle=true`);
    });

    fetch(url);
})();
