import {ytFilter} from "./filter.js";

const yt = require("youtube-sr").default;
const levenshtein = require("fastest-levenshtein");

const urlSkip = {};

const TITLE_DELIMITER = / - | – /gi;
const MATCH_DEVIATION = 65;
const SETTING_FIELDS = ["quality", "mode", "codecAudio", "codecVideo", "location"];

let globalSettings = {};
let globalMode, globalCodecAudio, globalCodecVideo, globalQuality;

let aborted = false;

addEventListener("message", (event) => {
    const msg = event.data;

    switch (msg.type) {
        case "abort":
            aborted = true;
            break;

        case "checkPremiumAndAdd":
            if (aborted) {
                return;
            }

            // TODO: Handle converted case
            checkPremiumAndConvert(msg.url)
                .catch(() => ({url: msg.url, converted: false}))
                .then(({url}) => {
                    if (aborted) {
                        return;
                    }

                    const data = getUrlData(url, msg.location, msg.settings);
                    data.jobId = msg.jobId;

                    postMessage({type: "checkPremiumAndAdd", data, index: msg.index, batchId: msg.batchId});
                });
            break;

        case "checkPremium":
            globalMode = msg.mode;

            // TODO: Handle converted case
            checkPremiumAndConvert(msg.url).then(({url, converted}) => {
                postMessage({type: "checkPremium", url, old: msg.url, requestId: msg.requestId});
            });
            break;

        case "loadData":
            aborted = false;

            loadData(
                msg.mode,
                msg.codecAudio,
                msg.codecVideo,
                msg.quality,
                msg.settings
            );
            break;
    }
});

// TODO: Comment
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// TODO: Comment
function loadData(mode, codecAudio, codecVideo, quality, settings) {
    globalMode = mode;
    globalCodecAudio = codecAudio;
    globalCodecVideo = codecVideo;
    globalQuality = quality;
    globalSettings = settings;
}

// TODO: Comment
async function checkPremiumAndConvert(url) {
    if (
        globalMode !== "audio" ||
        url.includes("music.youtube") ||
        url.includes("playlist")
    ) {
        return {url, converted: false};
    }

    const musicUrl = await getYoutubeMusic(url);

    if (musicUrl && musicUrl !== url) {
        return {url: musicUrl, converted: true};
    }

    urlSkip[url] = true;

    return {url, converted: false};
}

// TODO: Comment
function matchCount(string, regex) {
    const regExp = new RegExp(regex, "gi");

    return string?.match(regExp)?.length ?? 0;
}

// TODO: Comment
function contains(string, regex) {
    // Only the first match is needed; avoid collecting every matching substring.
    const regExp = new RegExp(regex, "i");

    return string.search(regExp) !== -1;
}

// TODO: Comment
function escapeRegExp(text) {
    return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
}

// TODO: Comment
function subtractSmallerNumber(num1, num2) {
    return Math.abs(num1 - num2);
}

// TODO: Comment
function getBiggerLength(string1, string2) {
    return Math.max(string1.length, string2.length);
}

// TODO: Comment
function getSortedLength(string1, string2) {
    return string1.length > string2.length
        ? [string1, string2]
        : [string2, string1];
}

// TODO: Comment
async function getYouTubeMusicSearch(ytFullTitle, run = 0, retry = 5) {
    try {
        const results = await new Promise((resolve) => {
            const listener = (event) => {
                const msg = event.data;

                if (msg.type !== "youTubeMusicSearchResults") {
                    return;
                }

                removeEventListener("message", listener);
                resolve(msg.results);
            };

            addEventListener("message", listener);

            postMessage({type: "getYouTubeMusicSearch", search: ytFullTitle});
        });

        //    const results = await window.electron.invoke("yt-search", ytFullTitle);
        if (results && results.length) {
            return results[0];
        }
    } catch (error) {
        if (run === retry) {
            return [];
        }

        await sleep(2000);

        return getYouTubeMusicSearch(ytFullTitle, run + 1, retry);
    }

    return [];
}

// TODO: Comment
async function getYoutubeMusic(url) {
    if (typeof urlSkip[url] !== "undefined") {
        return url;
    }

    return await yt.getVideo(url).then(async (result) => {
        const channelName = result.channel.name;

        if (contains(channelName, "(various artists)|(- topic)")) {
            return "https://music.youtube.com/watch?v=" + result.id;
        }

        let ytTitle = result.title
            .replace(ytFilter, "")
            .trim()
            .replace(/\s{2,}/g, " ");

        let ytFullTitle;
        let ytArtist;

        if (!contains(ytTitle, TITLE_DELIMITER)) {
            ytArtist = channelName;
            ytFullTitle = ytArtist + " - " + ytTitle;
        } else {
            ytFullTitle = ytTitle;

            const splitTitle = ytTitle.split(TITLE_DELIMITER);

            ytArtist = splitTitle[0].replace(channelName, "");
            ytTitle = splitTitle[1].replace(channelName, "");
        }

        const music = await getYouTubeMusicSearch(ytFullTitle);

        if (!music || !Object.keys(music).length) {
            return null;
        }

        music.name = music.name.replace(ytFilter, "").trim();

        const duration = result.duration / 1000;

        if (contains(ytTitle, "(remix)") && !contains(music.name, "(remix)")) {
            if (subtractSmallerNumber(music.duration, duration) > 2) {
                return null;
            }

            music.name += " remix";
        }

        const min = Math.min(music.duration, duration);
        const max = Math.max(music.duration, duration);

        if ((max - min) / max * 100 > 6) {
            return null;
        }

        if (contains(music.name, TITLE_DELIMITER)) {
            const splitTitle = music.name.split(TITLE_DELIMITER);

            music.artist.name = splitTitle[0];
            music.name = splitTitle[1];
        }

        const sorted = getSortedLength(ytTitle, music.name);
        const regexEscaped = escapeRegExp(sorted[1]);
        const words = regexEscaped.split("\\ ");
        const wordPattern = words.join("|");
        const count = matchCount(sorted[0], wordPattern);

        // The count already tells us whether any word matched.
        if (count === 0 || 100 / words.length * count < MATCH_DEVIATION) {
            const length = getBiggerLength(ytTitle, music.name);

            if (
                100 / length *
                (length - levenshtein.distance(ytTitle, music.name)) < MATCH_DEVIATION
            ) {
                return null;
            }
        }

        const artists = music.artist.name.replace(/\(.*\)/gi, "");
        const artistList = artists.split(/,&/);
        const totalArtists = artistList.length;
        let foundArtists = 0;

        for (let artist of artistList) {
            // Preserve the existing matching behaviour. These entries are
            // strings, so changing this lookup would change accepted matches.
            artist = artist.name;

            if (contains(ytFullTitle, artist)) {
                foundArtists++;
            }
        }

        const probability = 100 / totalArtists * foundArtists;

        if (
            probability < MATCH_DEVIATION &&
            totalArtists > 2 &&
            probability < 50
        ) {
            const length = getBiggerLength(ytArtist, artists);

            if (
                ytArtist &&
                100 / length *
                (length - levenshtein.distance(ytArtist, artists)) < MATCH_DEVIATION
            ) {
                return null;
            }
        }

        return "https://music.youtube.com/watch?v=" + music.videoId;
    }).catch(() => null);
}

// TODO: Comment
function getUrlData(url, location, jobSettings = {}) {
    if (url.includes("netflix")) {
        return {url};
    }

    const item = {
        url,
        quality: globalQuality,
        mode: globalMode,
        codecAudio: globalCodecAudio,
        codecVideo: globalCodecVideo,
        location
    };

    const settings = {...globalSettings[url], ...jobSettings};

    for (const field of SETTING_FIELDS) {
        // Per-job overrides retain the selected playlist's settings even if
        // the same track is present in multiple different playlists.
        if (typeof settings[field] !== "undefined") {
            item[field] = settings[field];
        }
    }

    switch (item.quality) {
        case "medium":
            item.quality = 5;
            break;

        case "bad":
            item.quality = 9;
            break;

        case "best":
        default:
            item.quality = 0;
            break;
    }

    return item;
}