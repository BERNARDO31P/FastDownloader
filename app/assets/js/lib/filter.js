const keywordsYt = [
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

const keywordsErrors = [
    "winerror 10054",
    "winerror 3",
    "getaddrinfo failed",
    "timed out",
    "aes-cbc",
    "[youtube]",
    "cookie",
    "permission"
];

const ytFilter = new RegExp(keywordsYt.join("|"), 'gi');
const errorFilter = new RegExp(keywordsErrors.join("|"), 'gi');

export {ytFilter, errorFilter};