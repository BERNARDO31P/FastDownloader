import mustache from "./lib/mustache.min.js";

const {promisify} = require('util');
const ytpl = require('ytpl');
const {ipcRenderer} = require('electron');

const Store = require('electron-store');
const store = new Store();

const {exec} = require('child_process');
const execSync = promisify(require('child_process').exec);

export let childProcess = null, downloadAborted = false, playlistCount = 1;
export let __realdir = null;

export let languageDB = {};
export let selectedLang = null;

export let theme = getCookie("theme");
if (!theme) theme = "light";
setCookie("theme", theme);

document.getElementsByTagName("html")[0].setAttribute("data-theme", theme);

// TODO: Comment
HTMLElement.prototype.animateCallback = function (keyframes, options, callback) {
    let animation = this.animate(keyframes, options);

    animation.onfinish = function () {
        callback();
    }
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
export const bindEvent = (eventNames, selectors, handler) => {
    eventNames.split(', ').forEach((eventName) => {
        document.addEventListener(eventName, function (event) {
            selectors.split(', ').forEach((selector) => {
                if (event.target.matches(selector + ', ' + selector + ' *')) {
                    let element = event.target.closest(selector);
                    handler.apply(element, arguments);
                }
            });
        }, false);
    });
};

// TODO: Comment
export function setRealDir(dirname) {
    if (process.platform !== "win32") {
        if (dirname.includes("/app.asar")) dirname = dirname.replace("/app.asar", "");
        if (!dirname.includes("/resources")) dirname = dirname + "/resources";
    } else {
        if (dirname.includes("\\app.asar")) dirname = dirname.replace("\\app.asar", "");
        if (!dirname.includes("\\resources")) dirname = dirname + "\\resources";
    }

    __realdir = dirname;
}

/*
 * Funktion: getCookie()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  name: (String) Cookie Name
 *
 * Holt den Wert aus dem Speicher
 * Gibt den Wert zurück
 */
export function getCookie(name) {
    return store.get(name);
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
export function setCookie(name, value, expiresAt = "") {
    store.set(name, value);
}

// TODO: Comment
export function removeActiveListItems() {
    let ul = document.querySelector(".listBox ul");
    let actives = ul.querySelectorAll("li.active");
    if (actives) {
        for (let active of actives) {
            active.remove();
        }
    }

    if (ul.scrollHeight > ul.clientHeight) ul.style.width = "calc(100% + 10px)";
    else ul.style.width = "100%";
}

/*
 * Funktion: showNotification()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  message: (String) Definiert die Nachricht in der Benachrichtigung
 *  time: (Integer) Definiert wie lange die Benachrichtigung angezeigt werden soll
 *
 * Animiert eine Benachrichtigung in die Anzeige
 * Wenn der Player angezeigt wird, wird die Benachrichtigung drüber angezeigt, sonst ganz unten
 */
export function showNotification(message, time = 3000) {
    let body = document.getElementsByTagName("body")[0];

    let notifications = document.getElementsByClassName("notification");
    for (let notification of notifications) {
        let notificationStyle = window.getComputedStyle(notification);
        let notificationPosition = notification.getBoundingClientRect();

        let bottom = Number(notificationStyle.bottom.replace("px", ""));
        notification.style.bottom = bottom + notificationPosition.height + 5 + "px";
    }

    let notification = document.createElement("div");
    notification.classList.add("notification");

    notification.textContent = message;
    notification.style.left = "10px";

    body.appendChild(notification);

    let timeoutOpacity;

    notification.animateCallback([{opacity: 0}, {opacity: 1}], {
        duration: 100, fill: "forwards"
    }, function () {
        timeoutOpacity = setTimeout(() => {
            removeOpacityNotification(notification);
        }, time);
    });

    notification.onmouseover = function () {
        clearTimeout(timeoutOpacity);
    }

    notification.onmouseout = function () {
        removeOpacityNotification(notification);
    }
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
export function removeOpacityNotification(notification) {
    notification.animateCallback([{opacity: 1}, {opacity: 0}], {
        duration: 100, fill: "forwards"
    }, function () {
        notification.remove();
    });
}

// TODO: Comment
export function addLinkToList(eventElement) {
    let input = eventElement.closest(".input").querySelector("input");

    if (!input.value) {
        showNotification(languageDB[selectedLang]["js"]["noURL"]);
        return;
    }

    let foundYT = input.value.match("http(?:s?):\\/\\/(?:www\\.|music\\.)?youtu(?:be\\.com\\/watch\\?v=|be\\.com\\/playlist\\?list=|\\.be\\/)([\\w\\-\\_]*)(&(amp;)?‌​[\\w\\?‌​=]*)?");

    // TODO: Complete regex for netflix
    let foundNF = input.value.match("http(?:s?):\\/\\/(?:www\\.)?netflix.com");

    if (!foundYT && !foundNF) {
        showNotification(languageDB[selectedLang]["js"]["noValidURL"]);
        return;
    }

    let ul = document.querySelector(".listBox ul");
    let elements = ul.querySelectorAll("li");
    for (let element of elements) {
        if ((foundYT && element.textContent === foundYT[0]) || (foundNF && element.textContent === foundNF[0])) {
            showNotification(languageDB[selectedLang]["js"]["urlInList"]);
            return;
        }
    }

    let li = document.createElement("li");

    if (foundYT) li.textContent = foundYT[0];
    else li.textContent = foundNF[0];

    ul.appendChild(li);
    input.value = "";

    if (ul.scrollHeight > ul.clientHeight) ul.style.width = "calc(100% + 10px)";
    else ul.style.width = "100%";

    ul.scrollTop = ul.scrollHeight;

    showNotification(languageDB[selectedLang]["js"]["urlAdded"]);
}

// TODO: Comment
export function selectClick(element) {
    let select = element;
    if (!element.classList.contains("select")) {
        select = element.closest(".select");
    }

    if (select.classList.contains("active"))
        select.classList.remove("active");
    else
        select.classList.add("active");
}

// TODO: Comment
export function hideSelect(element) {
    let select = element;
    if (!element.classList.contains("select")) {
        select = element.closest(".select");
    }

    select.classList.remove("active");
}

// TODO: Comment
export function downloadNFURL() {

}

// TODO: Comment
export function downloadYTURL(mode, location, url, percentage, codec, quality, playlistCount) {
    return new Promise((resolve) => {
        let exe = "";
        if (process.platform === "win32") exe = ".exe";

        let progressTotal = document.querySelector(".progress-total progress");
        let infoTotal = document.querySelector(".progress-total .info p");
        let progressSong = document.querySelector(".progress-song progress");
        let infoSong = document.querySelector(".progress-song .info p");

        let command;
        if (mode === "audio") {
            if (codec === "mp3") {
                command = "\"" + __realdir + "/yt-dlp" + exe + "\" -f bestaudio --yes-playlist --playlist-start " + playlistCount + " --ffmpeg-location \"" + __realdir + "/ffmpeg" + exe + "\" --extract-audio --embed-thumbnail --audio-format " + codec + " --audio-quality " + quality + " --add-metadata -o \"" + location + "/%(title)s.%(ext)s\" " + url;
            } else {
                command = "\"" + __realdir + "/yt-dlp" + exe + "\" -f bestaudio --yes-playlist --playlist-start " + playlistCount + " --ffmpeg-location \"" + __realdir + "/ffmpeg" + exe + "\" --extract-audio --audio-format " + codec + " --audio-quality " + quality + " --add-metadata -o \"" + location + "/%(title)s.%(ext)s\" " + url;
            }
        } else {
            command = "\"" + __realdir + "/yt-dlp" + exe + "\" -f bestvideo+bestaudio --yes-playlist --playlist-start " + playlistCount + " --ffmpeg-location \"" + __realdir + "/ffmpeg" + exe + "\" --embed-thumbnail --audio-format mp3 --audio-quality 9 --merge-output-format mp4 --add-metadata -o \"" + location + "/%(title)s.%(ext)s\" " + url;
        }

        childProcess = exec(command);

        let found;
        childProcess.stdout.on('data', function (data) {
            found = data.match("(?<=\\[download\\])(?:\\s+)(\\d+(\\.\\d+)?%)");
            if (found) {
                progressSong.value = Number(found[1].replace("%", "")) / 100;
                infoSong.textContent = found[1];
            }
        });

        childProcess.on('close', function () {
            let percentageTotal = progressTotal.value + Math.round((percentage / 100) * 100) / 100;
            progressTotal.value = percentageTotal;
            progressSong.value = 1;

            ipcRenderer.send('set_percentage', percentageTotal);

            infoTotal.textContent = Number(infoTotal.textContent.replace("%", "")) + percentage + "%";
            infoSong.textContent = "100%";

            if (!downloadAborted) {
                resolve(true);
            } else {
                resolve(false);
                downloadAborted = false;
            }
        });
    });
}

// TODO: Comment
export async function getPlaylistUrls(url) {
    let playlist = await ytpl(url);

    let items = [];

    for (let item of playlist["items"])
        items.push(item["shortUrl"]);

    return items;
}

// TODO: Comment
export function setDisabled() {
    let listBox = document.getElementsByClassName("listBox")[0];
    let location = document.querySelector(".location #location");
    let buttons = document.querySelectorAll("button:not(.abort-button):not(.location-button)");
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
    let buttons = document.querySelectorAll("button:not(.abort-button):not(.location-button)");
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
export async function getChildProcessRecursive(ppid) {
    let output = [], tempOutput;
    if (process.platform === "win32") {
        tempOutput = await execSync("wmic process where (ParentProcessId=" + ppid + ") get ProcessId");
    } else {
        tempOutput = await execSync("pgrep -P " + ppid).catch(() => {});
        if (!tempOutput) tempOutput = [];
    }

    if (Object.keys(tempOutput).length) {
        tempOutput = [...tempOutput["stdout"].matchAll("\\d+")];
    }

    for (let i = 0; i < tempOutput.length; i++) {
        output[i] = Number(tempOutput[i][0]);
    }

    for (let pid of output) {
        tempOutput = await getChildProcessRecursive(pid);
        if (Array.isArray(tempOutput)) {
            output = [...tempOutput, ...output];
        }
    }

    return output;
}

// TODO: Comment
export function selectOption(option) {
    let select = option.closest(".select");
    let button = select.querySelector(".button");

    let selected = select.querySelector("[aria-selected='true']");
    selected.ariaSelected = "false";
    option.ariaSelected = "true";

    button.textContent = option.textContent;
    select.setAttribute("data-value", option.getAttribute("data-value"));

    toggleVisibility();
}

// TODO: Comment
export function toggleVisibility() {
    let mode = document.querySelector("#settings .mode .select");
    let value = mode.getAttribute("data-value");

    let quality = document.querySelector("#settings .quality");
    let codec = document.querySelector("#settings .codec");

    if (value === "audio") {
        quality.style.display = "block";
        codec.style.display = "block";
    } else {
        quality.style.display = "";
        codec.style.display = "";
    }
}

// TODO: Comment
export function abortDownload() {
    downloadAborted = true;
}

// TODO: Comment
export function saveSettings() {
    let save = document.querySelector("#settings #save");

    if (save.classList.contains("active")) {
        let mode = document.querySelector("#settings .mode .select");
        let quality = document.querySelector("#settings .quality .select");
        let codec = document.querySelector("#settings .codec .select");


        setCookie("mode", mode.getAttribute("data-value"));
        setCookie("quality", quality.getAttribute("data-value"));
        setCookie("codec", codec.getAttribute("data-value"));
        setCookie("save", true);
    }
}

// TODO: Comment
export function deleteSettings() {
    setCookie("mode", "");
    setCookie("quality", "");
    setCookie("codec", "");
    setCookie("save", false);
}

// TODO: Comment
export function loadSettings() {
    let mode = document.querySelector("#settings .mode .select");
    let quality = document.querySelector("#settings .quality .select");
    let codec = document.querySelector("#settings .codec .select");
    let lang = document.querySelector("#settings .lang .select");

    let modeValue = getCookie("mode");
    let qualityValue = getCookie("quality");
    let codecValue = getCookie("codec");
    let langValue = getCookie("lang");
    let save = getCookie("save");

    let option;
    if (modeValue) {
        option = mode.querySelector("[data-value='" + modeValue + "']");
        selectOption(option);
    }

    if (qualityValue) {
        option = quality.querySelector("[data-value='" + qualityValue + "']");
        selectOption(option);
    }

    if (codecValue) {
        option = codec.querySelector("[data-value='" + codecValue + "']");
        selectOption(option);
    }

    if (langValue) {
        option = lang.querySelector("[data-value='" + langValue + "']");
        selectOption(option);
    }

    let saveButton = document.querySelector("#settings #save");
    if (save) saveButton.classList.add("active");
}

// TODO: Comment
export async function loadLanguage() {
    if (!Object.keys(languageDB).length) {
        await fetch("assets/db/language.json").then(response => {
            return response.json();
        }).then(jsonData => languageDB = jsonData);
    }

    let cookie = getCookie("lang");
    let lang = null;
    if (cookie) {
        lang = cookie;
    } else {
        for (let language of navigator.languages) {
            if (typeof languageDB[language] !== "undefined")
                lang = language;
        }
        if (!lang) lang = "en";

        setCookie("lang", lang);
    }
    selectedLang = lang;

    await fetch("assets/template/main.html").then(response => {
        return response.text();
    }).then(htmlData => {
        let main = document.getElementsByTagName("main")[0];
        let template = new DOMParser().parseFromString(htmlData, 'text/html').body;

        main.innerHTML = mustache.render(template.innerHTML, languageDB[lang]);
    });
}

// TODO: Comment
export function setThemeIcon() {
    setTimeout(function () {
        let icons = document.querySelectorAll(".theme-toggler svg");
        for (let icon of icons) {
            if (theme === "light") icon.classList.add("fa-moon");
            else icon.classList.add("fa-sun");
        }
    }, 500);
}

// TODO: Comment
export function setTheme(themeSet) {
    theme = themeSet;
    setCookie("theme", themeSet);
}
