import mustache from "./lib/mustache.min.js";
import {errorFilter, ytFilter} from "./lib/filter.js";

const terminate = require("terminate");
const path = require("path");
const {ipcRenderer, clipboard} = require("electron");
const {exec, spawnSync} = require("child_process");

let theme = getCookie("theme");
if (!theme) theme = "light";

setCookie("theme", theme);
document.getElementsByTagName("html")[0].setAttribute("data-theme", theme);

let fileEnding = "";
if (process.platform === "win32") fileEnding = ".exe";
else if (process.platform === "linux") fileEnding = "_linux";
else if (process.platform === "darwin") fileEnding = "_macos";

let __realDir = null, debug = console.debug;
let hiddenElements = [], urlList = [], processedUrls = [], logs = [];

export let specificSettings = {};

export let worker = new Worker("assets/js/lib/worker.js", {type: "module"});
export let workers = 0;

export let downloading = false, resolve = null, aborted = false, childProcess = null, lastLi = null;
export let languageDB = {};

export let ytDl = "", ffmpeg = "", elevate = "";
export let selectedLang = null;

let extractors = [];
let brokenExtractors = [];

// TODO: Comment
HTMLElement.prototype.animateCallback = function (keyframes, options, callback) {
    let animation = this.animate(keyframes, options);

    animation.onfinish = () => callback();
}

// TODO: Comment
console.debug = (log) => {
    debug(log);

    // TODO: Add check if logs are enabled
    // Implement logging to send for analytics if bugs are found
    //logs.push(log);
}

/*
 * Funktion: bindEvent()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  eventNames: (String) Event-Name z.B. click
 *  selector: (String) Den Element-Selector z.B. die ID oder Klasse usw.
 *  handler: (Object) Die Funktion welche ausgeführt werden soll
 *
 * Ist das Äquivalent zu .on(eventNames, selector, handler) in jQuery
 */
export function bindEvent(eventNames, selectors, handler) {
    eventNames.split(", ").forEach((eventName) => {
        document.addEventListener(eventName, function (event) {
            selectors.split(", ").forEach((selector) => {
                if (event.target.matches(selector + ", " + selector + " *")) {
                    let element = event.target.closest(selector);
                    handler.apply(element, arguments);
                }
            });
        }, false);
    });
}

// TODO: Comment
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// TODO: Comment
worker.addEventListener("message", (event) => {
    const msg = event.data;
    switch (msg.type) {
        case "checkPremiumAndAdd":
            processedUrls.push(msg.data);
            workers--;

            if (!workers) download(processedUrls).then(() => {
                let progressTotal = document.querySelector(".progress-total progress");
                let infoTotal = document.querySelector(".progress-total .info p");

                infoTotal.textContent = "100%";
                progressTotal.value = 1;
                ipcRenderer.send("set_percentage", 1);

                setEnabled();

                downloading = false;
                processedUrls = [];

                switch (resolve) {
                    case "aborted":
                        showNotification(languageDB["js"]["downloadAborted"], languageDB["js"]["error"]);
                        break;
                    case "success":
                        if (getCookie("mode") === "audio") {
                            showNotification(languageDB["js"]["songsDownloaded"], languageDB["js"]["success"]);
                        } else {
                            showNotification(languageDB["js"]["videosDownloaded"], languageDB["js"]["success"]);
                        }

                        if (getCookie("clearList")) clearList();
                        break;
                }

                ipcRenderer.send("remove_abort");
            });
            break;
        case "checkPremium":
            if (urlList.indexOf(msg.url) !== -1) {
                showNotification(languageDB["js"]["urlInList"], languageDB["js"]["error"]);
                lastLi.remove();

                return;
            }

            lastLi.textContent = msg.url;
            urlList.push(msg.url);

            break;
    }
});

// TODO: Comment
export function setRealDir(dirname) {
    dirname = dirname.replaceAll(path.sep + "app.asar", "");
    if (!dirname.includes(path.sep + "resources")) dirname = dirname + path.sep + "resources";

    __realDir = dirname;

    updateBinaryLocations();
}

// TODO: Comment
function updateBinaryLocations() {
    ytDl = "\"" + __realDir + path.sep + "yt-dlp" + fileEnding + "\"";
    ffmpeg = "\"" + __realDir + path.sep + "ffmpeg" + fileEnding + "\"";
    elevate = "\"" + __realDir + path.sep + "elevate" + fileEnding + "\"";
}

/*
 * Funktion: getCookie()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  name: (String) Cookie Name
 *  def: (Any) Standard Wert, falls Cookie nicht existiert
 *
 * Holt den Wert aus dem Speicher
 * Gibt den Wert zurück
 */
export function getCookie(name, def = null) {
    let cookie = localStorage.getItem(name);

    if (cookie === null) {
        return def;
    }

    return cookie === "true" ? true :
        cookie === "false" ? false :
            cookie === "null" ? null : cookie;
}

/*
 * Funktion: setCookie()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  name: (String) Cookie Name
 *  value: (String) Cookie Wert
 *  expiresAt: (String) Auslaufdatum vom Cookie
 *
 * Erstellt einen Cookie und setzt die Werte
 */
export function setCookie(name, value) {
    localStorage.setItem(name, value);
}

export function setAborted(bool) {
    aborted = bool;
}

export function setWorkerCount(count) {
    workers = count;
}

export function clearList() {
    let ul = document.querySelector(".listBox ul");
    ul.innerHTML = "";

    urlList = [];
}

// TODO: Comment
export function removeActives(element) {
    let actives = element.querySelectorAll(".active");
    for (let active of actives) {
        active.classList.remove("active");
    }
}

// TODO: Comment
export function updateSelected() {
    let actives = document.querySelectorAll(".listBox li.active");
    let linkCount = document.getElementById("link-count");

    if (actives.length) {
        linkCount.style.opacity = "1";
        linkCount.querySelector("a").textContent = actives.length.toString();
    } else linkCount.style.opacity = "0";
}

// TODO: Comment
export function activeToClipboard() {
    let actives = document.querySelectorAll(".listBox li.active");
    let clipText = "";

    for (let active of actives)
        clipText += active.textContent + "\n";

    clipboard.writeText(clipText);
}

// TODO: Comment
export function loadAllData(location) {
    let data = JSON.parse(getCookie("cache"));
    setCookie("cache", null);

    location.value = data["location"];

    let listBox = document.querySelector(".listBox ul");
    for (let listItem of data["listItems"]) {
        let li = document.createElement("li");
        li.textContent = listItem;

        listBox.appendChild(li);
    }
}

// TODO: Comment
export function getAllData() {
    let data = {};
    let listItems = document.querySelectorAll(".listBox ul li");

    data["listItems"] = [];
    for (let listItem of listItems) {
        data["listItems"].push(listItem.textContent);
    }

    data["location"] = document.getElementById("location").value;

    setCookie("cache", JSON.stringify(data));
}

// TODO: Comment
async function download(data) {
    let percentage = parseFloat((100 / data.length).toFixed(2));

    downloading = true;

    let i = 0;
    while (i < data.length) {
        const item = data[i];

        resolve = await downloadURL(
            item.mode,
            item.location,
            item.url,
            percentage,
            item.codecAudio,
            item.codecVideo,
            item.quality
        );

        let exitLoop = false;
        switch (resolve) {
            case "success":
                i++;
                break;
            case "permission":
                showNotification(languageDB["js"]["permission"], languageDB["js"]["error"], 8000);
                await sleep(10000);
                break;
            case "network":
                showNotification(languageDB["js"]["network"], languageDB["js"]["error"], 8000);
                await sleep(10000);
                break;
            case "drive":
                await sleep(1000);
                break;
            case "login":
                showNotification(languageDB["js"]["login"], languageDB["js"]["error"], 8000);
                await sleep(10000);
                break;
            case "sleep":
                await sleep(10000);
                break;
            default:
                exitLoop = true;
        }
        if (exitLoop || aborted) break;
    }
}

function generateDomainVariations(url) {
    const hostname = url.hostname;
    const domainParts = hostname.split('.').map(part => part.toLowerCase());

    // Extract the main domain without the subdomain and TLD
    const mainDomain = domainParts.slice(-2, -1)[0];
    return [
        `${mainDomain}.${domainParts.slice(-1)[0]}`, // domain with TLD
        `${mainDomain}${domainParts.slice(-1)[0]}`, // domain concatenated without dot
        hostname, // full domain
        hostname.replace(/\./g, ''), // full domain without dots
        ...domainParts, // domain parts
    ];
}

export function addUrlToList(url = "") {
    if (!url) {
        showNotification(languageDB["js"]["noURL"], languageDB["js"]["error"]);
        return false;
    }

    let values = url.trim().split(/[\n\s]+/);
    let ul = document.querySelector(".listBox ul");
    for (let value of values) {
        let url = null;

        try {
            url = new URL(value.trim());
        } catch (e) {
            showNotification(languageDB["js"]["noValidURL"], languageDB["js"]["error"]);
            return false;
        }

        let youtube = false;
        let valid = false;
        let broken = false;
        for (const domain of generateDomainVariations(url)) {
            if (domain === "youtube") {
                url = match(url, "http(?:s?):\\/\\/(?:www\\.|music\\.)?youtu(?:be\\.com\\/watch\\?v=|be\\.com\\/playlist\\?list=|\\.be\\/)([\\w\\-\\_]*)(&(amp;)?‌​[\\w\\?‌​=]*)?");

                valid = true;
                youtube = true;
                break;
            }

            if (extractors.includes(domain)) {
                valid = true;
                break;
            }

            if (brokenExtractors.includes(domain)) {
                broken = true;
                break;
            }
        }

        if (broken) {
            showNotification(languageDB["js"]["brokenURL"], languageDB["js"]["error"]);
            return false;
        }

        if (!valid) {
            showNotification(languageDB["js"]["noValidURL"], languageDB["js"]["error"]);
            return false;
        }

        if (urlList.indexOf(url.toString()) !== -1) {
            showNotification(languageDB["js"]["urlInList"], languageDB["js"]["error"]);
            return false;
        }

        if (youtube) {
            worker.postMessage({type: "checkPremium", url: url, mode: getCookie("mode")});
        }

        const li = document.createElement("li");
        li.textContent = url;
        li.setAttribute("data-url", url);

        ul.appendChild(li);
        lastLi = li;
    }

    if (ul.scrollHeight > ul.clientHeight) ul.style.width = "calc(100% + 10px)";
    else ul.style.width = "100%";

    ul.scrollTop = ul.scrollHeight;

    showNotification(
        (values.length === 1)
            ? languageDB["js"]["urlAdded"]
            : languageDB["js"]["urlsAdded"],
        languageDB["js"]["success"]
    );

    return true;
}

// TODO: Comment
export function removeActiveListItems() {
    let ul = document.querySelector(".listBox ul");
    let actives = ul.querySelectorAll("li.active");
    if (actives) {
        for (let active of actives) {
            let url = active.getAttribute("data-url");
            delete specificSettings[url];

            let index = urlList.indexOf(active.textContent);
            urlList.splice(index, 1);

            active.remove();
        }
    }

    if (ul.scrollHeight > ul.clientHeight) ul.style.width = "calc(100% + 10px)";
    else ul.style.width = "100%";

    updateSelected();
}

/*
 * Funktion: showNotification()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  message: (String) Definiert die Nachricht in der Benachrichtigung
 *  time: (Integer) Definiert wie lange die Benachrichtigung angezeigt werden soll
 *
 * Animiert eine Benachrichtigung in die Anzeige
 * Wenn der Player angezeigt wird, wird die Benachrichtigung darüber angezeigt, sonst ganz unten
 */
export function showNotification(message, title = "Info", time = 3000) {
    if (document.hidden) {
        ipcRenderer.send("show_notification", title, message);
        return;
    }

    let notifications = document.getElementsByClassName("notification");
    for (let notification of notifications) {
        let notificationStyle = window.getComputedStyle(notification);
        let notificationPosition = notification.getBoundingClientRect();

        let bottom = Number(notificationStyle.bottom.replaceAll("px", ""));
        notification.style.bottom = bottom + notificationPosition.height + 5 + "px";
    }

    let notification = document.createElement("div");
    notification.classList.add("notification");

    notification.textContent = message;
    notification.style.left = "10px";

    document.body.appendChild(notification);

    let timeoutOpacity;

    notification.animateCallback([{opacity: 0}, {opacity: 1}], {
        duration: 100, fill: "forwards"
    }, () => timeoutOpacity = setTimeout(() => removeOpacityNotification(notification), time));

    notification.onmouseover = () => clearTimeout(timeoutOpacity);
    notification.onmouseout = () => removeOpacityNotification(notification);
}

/*
 * Funktion: removeOpacityNotification()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  notification: (Object) Definiert die Benachrichtigung
 *
 * Entfernt die Sichtbarkeit von einer Benachrichtigung
 * Entfernt die Benachrichtigung nach Schluss
 */
function removeOpacityNotification(notification) {
    notification.animateCallback([{opacity: 1}, {opacity: 0}], {
        duration: 100, fill: "forwards"
    }, () => notification.remove());
}

// TODO: Comment
function match(string, regex) {
    let regExp = new RegExp(regex, "gi");
    let found = string.toString().match(regExp);

    return (found) ? found[0] : null;
}

// TODO: Comment
export function selectClick(element) {
    let select = element;

    if (!element.classList.contains("select")) {
        select = element.closest(".select");
    }

    let label = select.previousElementSibling;

    if (select.classList.contains("active")) {
        select.classList.remove("active");

        if (select.classList.contains("top")) {
            select.classList.remove("top");
            label.classList.remove("hidden");
        }


        for (let element of hiddenElements) {
            element.classList.remove("hidden");
        }

        hiddenElements = [];
    } else {
        let options = select.querySelectorAll(".option");
        let option = options[0];

        let computedStyle = window.getComputedStyle(option, null);
        let optionHeight = getNumber(computedStyle.height) + getNumber(computedStyle.padding) * 2;

        let optionCount = options.length;
        let optionsHeight = optionHeight * optionCount;
        optionsHeight = optionsHeight > 100 ? 100 : optionsHeight;

        let clientRectSelect = select.getClientRects()[0];
        let clientRectBody = document.body.getClientRects()[0];

        if ((clientRectBody.height - 20) - clientRectSelect.bottom < optionsHeight) {
            select.classList.add("top");
            label.classList.add("hidden");
        }

        let nextElement = select.parentElement;
        let height = 0;

        let interval = setInterval(() => {
            let row = nextElement.closest(".row");
            if (row) nextElement = row;

            if (select.classList.contains("top")) {
                nextElement = nextElement.previousElementSibling;
            } else {
                nextElement = nextElement.nextElementSibling;
            }

            if (nextElement) {
                let rect = nextElement.getBoundingClientRect();
                let style = getComputedStyle(nextElement);

                height += rect.height;

                if (style.opacity !== "0")
                    hiddenElements.push(nextElement);

                if (height > 60) {
                    clearInterval(interval);
                    for (let element of hiddenElements) {
                        element.classList.add("hidden");
                    }
                }
            } else {
                clearInterval(interval);
                for (let element of hiddenElements) {
                    element.classList.add("hidden");
                }
            }
        });

        select.classList.add("active");
    }
}

// TODO: Comment
export function hideSelect(element) {
    let select = element;
    if (!element.classList.contains("select")) {
        select = element.closest(".select");
    }

    select.classList.remove("active");
    select.classList.remove("top");
}

// TODO: Comment
export async function loadExtractors() {
    extractors = JSON.parse(getCookie("extractors", "[]"));
    brokenExtractors = JSON.parse(getCookie("brokenExtractors", "[]"));

    extractors.push("x.com");
}

// TODO: Comment
export async function setExtractors() {
    let result = spawnSync(ytDl + " --list-extractors", {shell: true}).stdout.toString().trim();

    result = result.split("\n");

    const extractors = [];
    const brokenExtractors = [];
    for (let i = 0; i < result.length; i++) {
        const extractor = result[i].split(":")[0].split("(")[0].trim().toLowerCase();
        const isBroken = result[i].includes("CURRENTLY BROKEN");

        if (!extractors.includes(extractor) && !brokenExtractors.includes(extractor)) {
            isBroken ? brokenExtractors.push(extractor) : extractors.push(extractor);
        }
    }

    if (extractors.length) {
        setCookie("brokenExtractors", JSON.stringify(brokenExtractors));
        setCookie("extractors", JSON.stringify(extractors));
    }
}

// TODO: Comment
function downloadURL(mode, location, url, percentage, codecAudio, codecVideo, quality) {
    return new Promise(async (resolve) => {
        let error = false;

        const progressTotal = document.querySelector(".progress-total progress");
        const progressTotalInfo = document.querySelector(".progress-total .info p");
        const progressSong = document.querySelector(".progress-song progress");
        const progressSongInfo = document.querySelector(".progress-song .info p");

        let songInfoError = "";
        let songInfo = {};
        let title = "";
        try {
            const output = spawnSync(ytDl + " --print artist,title --skip-download --no-call-home " + url, {
                shell: true
            });

            songInfoError = output.stderr.toString().toLowerCase();

            const outputString = output.stdout.toString().split("\n");

            songInfo = {artist: outputString[0], title: outputString[1]};
            title = clearTitle(songInfo, mode);
        } catch (error) {
            if (songInfoError.includes("getaddrinfo failed")) resolve("network");
            if (songInfoError.includes("sign in")) resolve("login");

            return;
        }

        if (aborted) resolve("aborted");

        console.debug(title);

        let config = [
            "--ffmpeg-location " + ffmpeg,
            "-o \"" + location + path.sep + title + ".%(ext)s\"",
            "--no-check-formats",
            "--no-check-certificates",
            "--no-call-home",
            "-N 2"
        ];

        if (mode === "audio") {
            config.push("--extract-audio");
            config.push("--audio-format " + codecAudio);
            config.push("--audio-quality " + quality);

            if (["mp3", "aac", "flac"].includes(codecAudio)) config.push("--embed-thumbnail");
        } else {
            config.push("-S vcodec:" + codecVideo);
            config.push("--embed-thumbnail");
            config.push("--audio-format mp3");
            config.push("--audio-quality 9");
            config.push("--merge-output-format mp4");
        }

        let premium = JSON.parse(getCookie("premium"));
        if (premium && premium.check) {
            if (premium.browser && premium.browser.length) {
                if (process.platform !== "win32" || premium.browser !== "chrome") {
                    config.push("--cookies-from-browser " + premium.browser);
                    config.push("--extractor-args \"youtube:formats=missing_pot\"")
                } else {
                    console.warn("Chrome is currently not supported on Windows for extracting cookies, continuing");
                }
            } else {
                showNotification(languageDB["js"]["noBrowser"]);
                resolve(null);
            }
        }

        let command = (ytDl + " " + config.join(" ")) + " " + url;
        console.debug(command);

        childProcess = exec(command);

        let found;
        childProcess.stdout.on("data", (data) => {
            console.debug(data);

            found = data.match("(?<=\\[download\\])(?:\\s+)(\\d+(\\.\\d+)?%)");
            if (found) {
                progressSong.value = Number(found[1].replaceAll("%", "")) / 100;
                progressSongInfo.textContent = found[1];
            }
        });

        childProcess.stderr.on("data", (data) => {
            console.debug("Error start:");
            console.debug(data);
            console.debug("Error end!");

            if (aborted) {
                return
            }

            data = data.toLowerCase();

            if (data.includes("attempting to unlock cookies") || data.includes("po token")) {
                return;
            }

            if (!data.match(errorFilter)) {
                error = true;
            }

            if (data.includes("winerror 3")) resolve("drive");
            if (data.includes("permission") || data.includes("cookie")) resolve("permission");
            if (data.includes("getaddrinfo failed") || data.includes("timed out")) resolve("network");
            if (data.includes("sign in")) resolve("login");
            if (data.includes("http error 403")) resolve("sleep");
        });

        childProcess.on("close", (num) => {
            console.debug("Closing status code: " + num);
            if (!error) {
                let percentageTotal = progressTotal.value * 100 + percentage;
                let percentageDecimal = percentageTotal / 100;

                progressTotal.value = percentageDecimal;
                progressTotalInfo.textContent = percentageTotal.toFixed(2) + "%";

                progressSong.value = 0;
                progressSongInfo.textContent = "0%";

                ipcRenderer.send("set_percentage", percentageDecimal);

                console.debug("No errors occurred!");

                if (!aborted) resolve("success");
                else resolve("aborted");

                return;
            }

            resolve(null);
        });
    });
}

// TODO: Comment
export function setDisabled() {
    let listBox = document.getElementsByClassName("listBox")[0];
    let location = document.querySelector(".location #location");
    let buttons = document.querySelectorAll("button:not(.abort-button):not(.location-button):not(.theme-toggler)");
    let abortButton = document.querySelector(".abort-button");
    let input = document.querySelector("input:not(#location)");

    listBox.ariaDisabled = "true";
    location.ariaDisabled = "true";
    input.ariaDisabled = "true";
    input.setAttribute("readonly", "readonly");

    for (let button of buttons)
        button.ariaDisabled = "true";

    abortButton.ariaDisabled = "false";
}

// TODO: Comment
export function setEnabled() {
    let listBox = document.getElementsByClassName("listBox")[0];
    let location = document.querySelector(".location #location");
    let buttons = document.querySelectorAll("button:not(.abort-button):not(.location-button):not(.theme-toggler)");
    let abortButton = document.querySelector(".abort-button");
    let input = document.querySelector("input:not(#location)");

    listBox.ariaDisabled = "false";
    location.ariaDisabled = "false";
    input.ariaDisabled = "false";
    input.removeAttribute("readonly");

    for (let button of buttons)
        button.ariaDisabled = "false";

    abortButton.ariaDisabled = "true";
}

// TODO: Comment
export function selectOption(option) {
    if (!option) {
        return;
    }

    let select = option.closest(".select");
    let button = select.querySelector("div");

    let selected = select.querySelector("[aria-selected='true']");
    selected.ariaSelected = "false";
    option.ariaSelected = "true";

    button.textContent = option.textContent;
    select.setAttribute("data-value", option.getAttribute("data-value"));

    toggleVisibility();
}

// TODO: Comment
function toggleVisibility() {
    let mode = document.querySelector("settings .mode .select");
    let value = mode.getAttribute("data-value");

    let audioSettings = document.querySelectorAll("settings .audioSettings");
    let videoSettings = document.querySelectorAll("settings .videoSettings");

    if (value === "audio") {
        videoSettings.forEach((element) => {
            element.classList.remove("visible");
        });

        audioSettings.forEach((element) => {
            element.classList.add("visible");
        });
    } else {
        audioSettings.forEach((element) => {
            element.classList.remove("visible");
        });
        videoSettings.forEach((element) => {
            element.classList.add("visible");
        });
    }
}

// TODO: Comment
export function saveSettings() {
    const save = document.querySelector("settings #save");

    if (save.classList.contains("active")) {
        const mode = document.querySelector("settings .mode .select");
        const quality = document.querySelector("settings .quality .select");
        const codecAudio = document.querySelector("settings .codecAudio .select");
        const codecVideo = document.querySelector("settings .codecVideo .select");
        const closeToTray = document.querySelector("settings #closeToTray");
        const startMinimized = document.querySelector("settings #startMinimized");
        const autostart = document.querySelector("settings #autostart");
        const clearList = document.querySelector("settings #clearList");
        const premiumCheck = document.querySelector("settings #premium");
        const saveLocation = document.querySelector("settings #saveLocation");
        const premiumBrowser = document.querySelector("settings #browser");

        setCookie("mode", mode.getAttribute("data-value"));
        setCookie("quality", quality.getAttribute("data-value"));
        setCookie("codecAudio", codecAudio.getAttribute("data-value"));
        setCookie("codecVideo", codecVideo.getAttribute("data-value"));
        setCookie("save", true);
        setCookie("closeToTray", closeToTray.classList.contains("active"));
        setCookie("startMinimized", startMinimized.classList.contains("active"));
        setCookie("autostart", autostart.classList.contains("active"));
        setCookie("clearList", clearList.classList.contains("active"));
        setCookie("saveLocation", saveLocation.classList.contains("active"));
        setCookie("premium", JSON.stringify({
            "browser": premiumBrowser.getAttribute("data-value"),
            "check": premiumCheck.classList.contains("active")
        }));
    }
}

// TODO: Comment
export function deleteSettings() {
    setCookie("mode", "");
    setCookie("quality", "");
    setCookie("codecAudio", "");
    setCookie("codecVideo", "");
    setCookie("save", false);
    setCookie("closeToTray", false);
    setCookie("startMinimized", false);
    setCookie("autostart", false);
    setCookie("premium", JSON.stringify({"browser": null, "check": false}));
    setCookie("clearList", false);
    setCookie("saveLocation", false);
}

// TODO: Comment
export function loadSettings() {
    const mode = document.querySelector("settings .mode .select");
    const quality = document.querySelector("settings .quality .select");
    const codecAudio = document.querySelector("settings .codecAudio .select");
    const codecVideo = document.querySelector("settings .codecVideo .select");
    const lang = document.querySelector("settings .lang .select");

    const modeValue = getCookie("mode");
    const qualityValue = getCookie("quality");
    const codecAudioValue = getCookie("codecAudio");
    const codecVideoValue = getCookie("codecVideo");
    const langValue = getCookie("lang");
    const save = getCookie("save");
    const closeToTray = getCookie("closeToTray");
    const startMinimized = getCookie("startMinimized");
    const autostart = getCookie("autostart");
    const premium = JSON.parse(getCookie("premium"));
    const clearList = getCookie("clearList");
    const saveLocation = getCookie("saveLocation");

    let option;
    if (modeValue) {
        option = mode.querySelector("[data-value='" + modeValue + "']");
        selectOption(option);
    }

    if (qualityValue) {
        option = quality.querySelector("[data-value='" + qualityValue + "']");
        selectOption(option);
    }

    if (codecAudioValue) {
        option = codecAudio.querySelector("[data-value='" + codecAudioValue + "']");
        selectOption(option);
    }

    if (codecVideoValue) {
        option = codecVideo.querySelector("[data-value='" + codecVideoValue + "']");
        selectOption(option);
    }

    if (langValue) {
        option = lang.querySelector("[data-value='" + langValue + "']");
        selectOption(option);
    }

    const saving = document.querySelector("settings .save");
    if (save) {
        saving.querySelector("#save").classList.add("active");
        saving.querySelector("span").textContent = languageDB["js"]["on"];
    } else {
        saving.querySelector("span").textContent = languageDB["js"]["off"];
    }

    const closingToTray = document.querySelector("settings .closeToTray");
    if (closeToTray) {
        closingToTray.querySelector("#closeToTray").classList.add("active");
        closingToTray.querySelector("span").textContent = languageDB["js"]["on"];
    } else {
        closingToTray.querySelector("span").textContent = languageDB["js"]["off"];
    }

    const startingMinimized = document.querySelector("settings .startMinimized");
    if (startMinimized) {
        startingMinimized.querySelector("#startMinimized").classList.add("active");
        startingMinimized.querySelector("span").textContent = languageDB["js"]["on"];
    } else {
        startingMinimized.querySelector("span").textContent = languageDB["js"]["off"];
    }

    const autostarting = document.querySelector("settings .autostart");
    if (autostart) {
        autostarting.querySelector("#autostart").classList.add("active");
        autostarting.querySelector("span").textContent = languageDB["js"]["on"];
    } else {
        autostarting.querySelector("span").textContent = languageDB["js"]["off"];
    }

    const clearListing = document.querySelector("settings .clearList");
    if (clearList) {
        clearListing.querySelector("#clearList").classList.add("active");
        clearListing.querySelector("span").textContent = languageDB["js"]["on"];
    } else {
        clearListing.querySelector("span").textContent = languageDB["js"]["off"];
    }

    const savingLocation = document.querySelector("settings .saveLocation");
    if (saveLocation) {
        savingLocation.querySelector("#saveLocation").classList.add("active");
        savingLocation.querySelector("span").textContent = languageDB["js"]["on"];
    } else {
        savingLocation.querySelector("span").textContent = languageDB["js"]["off"];
    }

    const premiumCheck = document.querySelector("settings .premium");
    const premiumBrowser = document.querySelector("settings .browser");

    if (premium && typeof premium != "undefined" && (premium["check"] ?? false)) {
        premiumCheck.querySelector("#premium").classList.add("active");
        premiumCheck.querySelector("span").textContent = languageDB["js"]["on"];

        if (typeof premium["browser"] != "undefined" && premium["browser"] != null) {
            option = premiumBrowser.querySelector("[data-value='" + premium["browser"] + "']");
            selectOption(option);
        }
    } else {
        premiumCheck.querySelector("span").textContent = languageDB["js"]["off"];
    }
}

// TODO: Comment
export async function showChangelog(update = false) {
    let info = document.getElementById("info");
    let dynamic = info.querySelector("#dynamic");

    if (dynamic.innerHTML === "") await loadInfo();

    if (update) {
        let title = info.querySelector("#title");
        title.classList.remove("hidden");
    }

    document.body.style.overflow = "hidden";
    info.classList.add("show");
}

async function loadLanguage(language) {
    language = language.toLowerCase().split("-")[0];

    return fetch("assets/db/language." + language + ".json").then(response => {
        return response.json();
    }).then(jsonData => languageDB = jsonData);
}

// TODO: Comment
export async function initialize() {
    await loadExtractors();

    let cookie = getCookie("lang");
    if (cookie) {
        selectedLang = cookie;

        await loadLanguage(selectedLang);
    } else {
        for (let language of navigator.languages) {
            await loadLanguage(language)
                .then(() => selectedLang = language)
                .catch(() => null);
        }
        if (!selectedLang) {
            selectedLang = "en";
            await loadLanguage(selectedLang);
        }
        setCookie("lang", selectedLang);
    }

    document.body.innerHTML = mustache.render(document.body.innerHTML, languageDB);

    let main = document.getElementsByTagName("main")[0];
    await loadPage("assets/template/main.html", main, () => {
        setThemeIcon();

        if (getCookie("update") !== false) {
            setCookie("update", false);
            showChangelog(true);
        }
    });
}

// TODO: Comment
export function updateYtDl(administrator = false) {
    let update = true;
    let error = false;

    console.debug("Checking for yt-dlp update");

    showNotification(languageDB["js"]["libUpdate"]);
    setDisabled();

    if (administrator) {
        childProcess = exec(elevate + " " + ytDl + " -U");
    } else {
        childProcess = exec(ytDl + " -U");
    }

    childProcess.stdout.on("data", (data) => {
        console.debug(data);

        if (data.includes("yt-dlp is up to date")) {
            update = false;
            terminate(childProcess.pid);
        }
    });

    childProcess.stderr.on("data", (data) => {
        error = true;

        console.debug("Error start:");
        console.debug(data);
        console.debug("Error end!");

        if (data.includes("administrator") && !administrator) {
            updateYtDl(true);
            return;
        }

        if (administrator) {
            showNotification(languageDB["js"]["adminPermission"], languageDB["js"]["error"]);
            return;
        }

        showNotification(languageDB["js"]["unexpectedError"], languageDB["js"]["error"]);
        setEnabled();
    });

    childProcess.on("close", () => {
        if (error) {
            return;
        }

        if (update || !extractors || !extractors.length) {
            setExtractors().then(() => {
                setEnabled();
                showNotification(languageDB["js"]["libUpdated"]);
            });
        } else {
            showNotification(languageDB["js"]["libUptoDate"]);
            setEnabled();
        }
    });
}

// TODO: Comment
export async function loadPage(pageURL, element, callback = () => {
}) {
    await fetch(pageURL).then(response => {
        return response.text();
    }).then(htmlData => {
        let template = new DOMParser().parseFromString(htmlData, "text/html").body;

        let scripts = template.getElementsByTagName("script");
        scripts = Object.assign([], scripts);

        for (let script of scripts) {
            let scriptTag = document.createElement("script");
            scriptTag.type = "module";
            scriptTag.src = script.src;

            element.appendChild(scriptTag);

            script.parentElement.removeChild(script);
        }

        element.innerHTML += mustache.render(template.innerHTML, languageDB);
        callback();
    });
}

// TODO: Comment
export function setThemeIcon() {
    let themeInterval = setInterval(() => {
        let icons = document.querySelectorAll(".theme-toggler svg");
        if (icons.length) {
            clearInterval(themeInterval);

            for (let icon of icons) {
                if (theme === "light") icon.classList.add("fa-moon");
                else icon.classList.add("fa-sun");
            }
        }
    }, 50);
}

// TODO: Comment
function getNumber(string) {
    return Number((string).match(/\d+/));
}

// TODO: Comment
function clearTitle(songInfo, mode) {
    const artist = ("artist" in songInfo && songInfo["artist"] !== null && mode === "audio");

    let title = ((artist) ? songInfo["artist"] + " - " + songInfo["title"] : songInfo["title"]).replace(ytFilter, "").trim();
    title = title.replace(/[\\/|:*"?<>]/g, "_");
    title = title.replace(/\s{2,}/g, " ");
    title = title.replace(/\(\)/g, "");

    return title.trim();
}

// TODO: Comment
export function setTheme(themeSet) {
    theme = themeSet;
    setCookie("theme", themeSet);
}

// TODO: Comment
function addLeadingZero(string, size) {
    let count = Number(size) - string.toString().length;

    for (let i = 0; i < count; i++)
        string = "0" + string;

    return string;
}

// TODO: Comment
async function loadInfo() {
    let dynamic = document.querySelector("#info #dynamic");

    await fetch("https://api.github.com/repos/BERNARDO31P/FastDownloader/releases?per_page=10").then(response => {
        return response.json();
    }).then(htmlData => {
        for (let tag of htmlData) {
            let date = new Date(tag.published_at);
            let day = addLeadingZero(date.getUTCDate(), 2);
            let month = addLeadingZero(date.getUTCMonth() + 1, 2);
            let year = addLeadingZero(date.getUTCFullYear(), 4);

            let title = document.createElement("h3");
            title.textContent = tag.tag_name + " - " + day + "." + month + "." + year;

            dynamic.appendChild(title);

            let infos = tag.body.split("\r\n");
            infos = infos.filter(n => n);
            infos.shift();

            let infoBox = document.createElement("div");
            for (let info of infos) {
                let infoText = document.createElement("p");
                infoText.innerHTML = info;

                infoBox.appendChild(infoText);
            }

            dynamic.appendChild(infoBox);
        }
    });
}