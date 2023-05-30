const yt = require("youtube-sr").default;
const ytMusic = require("node-youtube-music");
const levenshtein = require("fastest-levenshtein");

let keywords = [
    "\\[.*\\]",
    "\\{.*\\}",
    "- official",
    "official",
    "video",
    "musi(c|k)(\\s+)?video",
    "original mix",
    "no copyright",
    "\\(",
    "\\)",
    "tdt #001",
    "free unreleased wav download",
    "free download",
    "download",
    "unreleased",
    "ᴴᴰ",
    "hd",
    "(\\d+) bpm",
    "(\\d+)bpm",
    "\\/\\/(?<=\\/\\/).*",
    "radio edit",
    "lyrics",
    "visuals",
    "\"",
    "'",
    "\\(prod\\.(.+)?\\)"
];
let ytFilter = new RegExp(keywords.join("|"), 'gi');

let globalSettings = {};
let globalMode, globalCodecAudio, globalCodecVideo, globalQuality, globalPremium;

addEventListener('message', (event) => {
    const msg = event.data;

    switch (msg.type) {
        case "checkPremiumAndAdd":
            checkPremiumAndConvert(msg.url).then((url) => {
                let data = getUrlData(url, msg.location, msg.id);
                postMessage({type: "checkPremiumAndAdd", data: data});
            });
            break;
        case "checkPremium":
            checkPremiumAndConvert(msg.url).then((url) => {
                postMessage({type: "checkPremium", url: url, old: msg.url});
            });
            break;
        case "loadData":
            loadData(msg.mode, msg.codecAudio, msg.codecVideo, msg.quality, msg.settings, msg.premium);
            break;
        case "loadPremiumAndMode":
            globalPremium = msg.premium;
            globalMode = msg.mode;
            break;
    }
});

// TODO: Comment
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// TODO: Comment
function loadData(mode, codecAudio, codecVideo, quality, settings, premium) {
    globalMode = mode;
    globalCodecAudio = codecAudio;
    globalCodecVideo = codecVideo;
    globalQuality = quality;
    globalSettings = settings;
    globalPremium = premium;
}

// TODO: Comment
async function checkPremiumAndConvert(url) {
    let premium = JSON.parse(globalPremium);
    if (globalMode === "audio" && premium && premium.check)
        if (!url.includes("music.youtube") && !url.includes("playlist")) {
            let musicUrl = await getYoutubeMusic(url);
            if (musicUrl) url = musicUrl;
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
        let results = await ytMusic.searchMusics(ytFullTitle);
        if (results) return results[0];
    } catch (e) {
        if (run === retry) return [];

        await sleep(2000);
        return getYouTubeMusicSearch(ytFullTitle, run + 1, retry);
    }

    return [];
}

// TODO: Comment
async function getYoutubeMusic(url) {
    return await yt.getVideo(url).then(async (result) => {
        let channelName = result.channel.name;

        if (contains(channelName, "(various artists)|(- topic)"))
            return "https://music.youtube.com/watch?v=" + result.id;

        let ytFullTitle, ytArtist, ytTitle = result.title;
        let delimiter = new RegExp(" - | – ", "gi");
        const deviation = 65;

        ytTitle = ytTitle.replace(ytFilter, "").trim();

        if (!contains(ytTitle, delimiter)) {
            ytArtist = channelName;
            ytFullTitle = ytArtist + " - " + ytTitle;
        } else {
            ytFullTitle = ytTitle;
            ytTitle = ytTitle.split(delimiter)[1].replace(channelName, "");
        }

        let music = await getYouTubeMusicSearch(ytFullTitle);
        let artists = null, found = false;

        find: {
            if (music && Object.keys(music).length) {
                music.title = music.title.replace(ytFilter, "").trim();

                let duration = result.duration / 1000;
                if (contains(ytTitle, "(remix)")) {
                    if (!contains(music.title, "(remix)")) {
                        if (subtractSmallerNumber(music.duration.totalSeconds, duration) > 2) {
                            break find;
                        }

                        music.title = music.title += " remix";
                    }
                }

                if (subtractSmallerNumber(music.duration.totalSeconds, duration) > 6) {
                    break find;
                }

                if (contains(music.title, delimiter)) {
                    let temp = music.title.split(delimiter);

                    music.artists[0].name = temp[0];
                    music.title = temp[1];
                }

                let sorted = getSortedLength(ytTitle, music.title);
                let regexEscaped = escapeRegExp(sorted[1]);

                let split = regexEscaped.split("\\ ");
                let join = split.join("|");

                let count = matchCount(sorted[0], join);
                if (!contains(sorted[0], join) || 100 / split.length * count < deviation) {
                    let length = getBiggerLength(ytTitle, music.title);

                    if (100 / length * (length - levenshtein.distance(ytTitle, music.title)) < deviation) {
                        break find;
                    }
                }

                artists = music.artists.pop().name;
                for (let artist of music.artists)
                    artists += "," + artist.name;

                artists = artists.replace(/\(.*\)/gi, "");

                let foundArtists = 0;
                for (let artist of artists.split(",")) {
                    artist = artist.name;

                    if (contains(ytFullTitle, artist))
                        foundArtists++;
                }

                let probability = 100 / music.artists.length * foundArtists;
                if (probability < deviation) {
                    if (music.artists.length > 2 && probability < 50) {
                        let length = getBiggerLength(ytArtist, artists);

                        if (100 / length * (length - levenshtein.distance(ytArtist, artists)) < deviation) {
                            break find;
                        }
                    }
                }

                found = true;
            }
        }

        if (found) return "https://music.youtube.com/watch?v=" + music.youtubeId;
        else return null;
    }).catch(() => null);
}

// TODO: Comment
function getUrlData(url, location, id) {
    let individualLocation = location;
    let individualQuality = globalQuality;
    let individualMode = globalMode;
    let individualCodecAudio = globalCodecAudio;
    let individualCodecVideo = globalCodecVideo;
    let item = {};

    if (!url.includes("netflix")) {
        if (typeof globalSettings[id] !== 'undefined') {
            if (typeof globalSettings[id]["quality"] !== 'undefined')
                individualQuality = globalSettings[id]["quality"];

            if (typeof globalSettings[id]["mode"] !== 'undefined')
                individualMode = globalSettings[id]["mode"];

            if (typeof globalSettings[id]["codecAudio"] !== 'undefined')
                individualCodecAudio = globalSettings[id]["codecAudio"];

            if (typeof globalSettings[id]["codecVideo"] !== 'undefined')
                individualCodecVideo = globalSettings[id]["codecVideo"];

            if (typeof globalSettings[id]["location"] !== 'undefined')
                individualLocation = globalSettings[id]["location"];
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