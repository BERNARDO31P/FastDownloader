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
    "aes-cbc",
    "[youtube]",
];

const ytFilter = new RegExp(keywordsYt.join("|"), 'gi');
const errorFilter = new RegExp(keywordsErrors.map(keyword => `\\b${keyword.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`).join("|"), 'gi');

export {ytFilter, errorFilter};