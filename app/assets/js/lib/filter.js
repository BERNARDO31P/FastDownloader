let keywords = [
    "\\[.*\\]",
    "\\{.*\\}",
    "\\([A-Za-z]{2}\\)",
    "(\\d+) bpm",
    "(\\d+)bpm",
    "\\/\\/(?<=\\/\\/).*",
    "\\(prod\\.(.+)?\\)",
    "- official",
    "official",
    "video",
    "musi(c|k)(\\s+)?video",
    "original mix",
    "no copyright",
    "tdt #001",
    "free unreleased wav download",
    "free download",
    "download",
    "unreleased",
    "ᴴᴰ",
    "hd",
    "radio edit",
    "lyrics",
    "visuals",
    "\"",
    "'"
];
let ytFilter = new RegExp(keywords.join("|"), 'gi');

export {ytFilter};