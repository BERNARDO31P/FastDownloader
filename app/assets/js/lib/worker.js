const yt = require("youtube-sr").default;
const levenshtein = require("fastest-levenshtein");

const urlSkip = {};

import {ytFilter} from "./filter.js";

let globalSettings = {};
let globalMode, globalCodecAudio, globalCodecVideo, globalQuality;

let aborted = false;

addEventListener('message', (event) => {
    const msg = event.data;

    switch (msg.type) {
        case "abort":
            aborted = true;
            break;
        case "checkPremiumAndAdd":
            if (aborted) {
                return;
            }

            checkPremiumAndConvert(msg.url).then((url) => {
                if (aborted) {
                    return;
                }

                let data = getUrlData(url, msg.location);
                postMessage({type: "checkPremiumAndAdd", data: data});
            });
            break;
        case "checkPremium":
            globalMode = msg.mode;

            checkPremiumAndConvert(msg.url).then((url) => {
                postMessage({type: "checkPremium", url: url, old: msg.url});
            });
            break;
        case "loadData":
            aborted = false;
            loadData(msg.mode, msg.codecAudio, msg.codecVideo, msg.quality, msg.settings);
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
    if (globalMode !== "audio") {
        return url;
    }

    if (!url.includes("music.youtube") && !url.includes("playlist")) {
        let musicUrl = await getYoutubeMusic(url);
        if (musicUrl && musicUrl !== url) {
            url = musicUrl;
        } else {
            urlSkip[url] = true;
        }
    }

    return url;
}

// TODO: Comment
function matchCount(string, regex) {
    let regExp = new RegExp(regex, "gi");

    return string?.match(regExp)?.length ?? 0;
}

// TODO: Comment
function contains(string, regex) {
    let regExp = new RegExp(regex, "gi");

    return !!string.match(regExp);
}

// TODO: Comment
function escapeRegExp(text) {
    return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}

// TODO: Comment
function subtractSmallerNumber(num1, num2) {
    return (num1 < num2) ? num2 - num1 : num1 - num2;
}

// TODO: Comment
function getBiggerLength(string1, string2) {
    return (string1.length > string2.length) ? string1.length : string2.length;
}

// TODO: Comment
function getSortedLength(string1, string2) {
    return (string1.length > string2.length) ? [string1, string2] : [string2, string1];
}

// TODO: Comment
async function getYouTubeMusicSearch(ytFullTitle, run = 0, retry = 5) {
    try {
        const results = await new Promise((resolve, reject) => {
            const listener = (event) => {
                const msg = event.data;

                if (msg.type === "youTubeMusicSearchResults") {
                    removeEventListener("message", listener);
                    resolve(msg.results);
                }
            };
            addEventListener('message', listener);

            postMessage({type: "getYouTubeMusicSearch", search: ytFullTitle});
        });

        //    const results = await window.electron.invoke("yt-search", ytFullTitle);
        if (results && results.length) return results[0];
    } catch (e) {
        if (run === retry) return [];

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

        if (contains(channelName, "(various artists)|(- topic)"))
            return "https://music.youtube.com/watch?v=" + result.id;

        let ytTitle = result.title.replace(ytFilter, "").trim();
        ytTitle = ytTitle.replace(/\s{2,}/g, " ");

        let ytFullTitle, ytArtist;
        const delimiter = new RegExp(" - | – ", "gi");
        const deviation = 65;

        if (!contains(ytTitle, delimiter)) {
            ytArtist = channelName;
            ytFullTitle = ytArtist + " - " + ytTitle;
        } else {
            ytFullTitle = ytTitle;

            const splitTitle = ytTitle.split(delimiter);

            ytArtist = splitTitle[0].replace(channelName, "");
            ytTitle = splitTitle[1].replace(channelName, "");
        }

        let music = await getYouTubeMusicSearch(ytFullTitle);
        let artists = null, found = false;

        find: {
            if (music && Object.keys(music).length) {
                music.name = music.name.replace(ytFilter, "").trim();

                let duration = result.duration / 1000;
                if (contains(ytTitle, "(remix)")) {
                    if (!contains(music.name, "(remix)")) {
                        if (subtractSmallerNumber(music.duration, duration) > 2) {
                            break find;
                        }

                        music.name = music.name += " remix";
                    }
                }

                const min = Math.min(music.duration, duration);
                const max = Math.max(music.duration, duration);

                if ((max - min) / max * 100 > 6) {
                    break find;
                }

                if (contains(music.name, delimiter)) {
                    let temp = music.name.split(delimiter);

                    music.artist.name = temp[0];
                    music.name = temp[1];
                }

                let sorted = getSortedLength(ytTitle, music.name);
                let regexEscaped = escapeRegExp(sorted[1]);

                let split = regexEscaped.split("\\ ");
                let join = split.join("|");

                let count = matchCount(sorted[0], join);
                if (!contains(sorted[0], join) || 100 / split.length * count < deviation) {
                    let length = getBiggerLength(ytTitle, music.name);

                    if (100 / length * (length - levenshtein.distance(ytTitle, music.name)) < deviation) {
                        break find;
                    }
                }

                artists = music.artist.name.replace(/\(.*\)/gi, "");

                const totalArtists = artists.split(/,&/).length;
                let foundArtists = 0;
                for (let artist of artists.split(/,&/)) {
                    artist = artist.name;

                    if (contains(ytFullTitle, artist))
                        foundArtists++;
                }

                let probability = 100 / totalArtists * foundArtists;
                if (probability < deviation) {
                    if (totalArtists > 2 && probability < 50) {
                        let length = getBiggerLength(ytArtist, artists);

                        if (ytArtist && 100 / length * (length - levenshtein.distance(ytArtist, artists)) < deviation) {
                            break find;
                        }
                    }
                }

                found = true;
            }
        }

        if (found) return "https://music.youtube.com/watch?v=" + music.videoId;
        else return null;
    }).catch(() => null);
}

// TODO: Comment
function getUrlData(url, location) {
    let individualLocation = location;
    let individualQuality = globalQuality;
    let individualMode = globalMode;
    let individualCodecAudio = globalCodecAudio;
    let individualCodecVideo = globalCodecVideo;
    let item = {};

    if (!url.includes("netflix")) {
        if (typeof globalSettings[url] !== 'undefined') {
            if (typeof globalSettings[url]["quality"] !== 'undefined')
                individualQuality = globalSettings[url]["quality"];

            if (typeof globalSettings[url]["mode"] !== 'undefined')
                individualMode = globalSettings[url]["mode"];

            if (typeof globalSettings[url]["codecAudio"] !== 'undefined')
                individualCodecAudio = globalSettings[url]["codecAudio"];

            if (typeof globalSettings[url]["codecVideo"] !== 'undefined')
                individualCodecVideo = globalSettings[url]["codecVideo"];

            if (typeof globalSettings[url]["location"] !== 'undefined')
                individualLocation = globalSettings[url]["location"];
        }

        let qualityInt = 0;
        switch (individualQuality) {
            case "best":
                qualityInt = 0;
                break;
            case "medium":
                qualityInt = 5;
                break;
            case "bad":
                qualityInt = 9;
                break;
        }

        item = {
            "url": url,
            "quality": qualityInt,
            "mode": individualMode,
            "codecAudio": individualCodecAudio,
            "codecVideo": individualCodecVideo,
            "location": individualLocation
        }
    } else item.url = url;

    return item;
}