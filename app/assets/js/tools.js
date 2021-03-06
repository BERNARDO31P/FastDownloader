import mustache from "./lib/mustache.min.js";

const NP = require('number-precision');
const {promisify} = require('util');
const ytpl = require('ytpl');
const {ipcRenderer, clipboard} = require('electron');

const {exec} = require('child_process');
const execSync = promisify(require('child_process').exec);

let artistName = false;
let theme = getCookie("theme");
let __realdir = null;

if (!theme) theme = "light";
setCookie("theme", theme);

export let childProcess = null, downloadAborted = false, playlistCount = 1;

export let languageDB = {};
export let selectedLang = null;

document.getElementsByTagName("html")[0].setAttribute("data-theme", theme);

// TODO: Comment
HTMLElement.prototype.animateCallback = function (keyframes, options, callback) {
    let animation = this.animate(keyframes, options);

    animation.onfinish = function () {
        callback();
    }
}

// TODO: Comment
export function setArtistName(value) {
    artistName = value;

    console.log(artistName);
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
    let cookie = localStorage.getItem(name);

    return cookie === 'true' ? true :
        cookie === 'false' ? false :
            cookie === 'null' ? null : cookie;
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
    localStorage.setItem(name, value);
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
export function loadAllData() {
    let data = JSON.parse(getCookie("cache"));
    setCookie("cache", null);

    document.getElementById("location").value = data["location"];

    let listBox = document.querySelector(".listBox ul");
    console.log(listBox);
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
export function addLinkToList(eventElement, clipboardText = null) {
    let input = eventElement.closest(".input").querySelector("input");

    if (!input.value && !clipboardText) {
        showNotification(languageDB[selectedLang]["js"]["noURL"]);

        if (document.hidden)
            ipcRenderer.send('show_notification', languageDB[selectedLang]["js"]["error"], languageDB[selectedLang]["js"]["noURL"]);

        return;
    }

    let values;
    if (clipboardText) values = clipboardText.split(/[\n\s]+/);
    else values = input.value;

    let ul = document.querySelector(".listBox ul");
    for (let value of values) {
        let foundYT = value.match("http(?:s?):\\/\\/(?:www\\.|music\\.)?youtu(?:be\\.com\\/watch\\?v=|be\\.com\\/playlist\\?list=|\\.be\\/)([\\w\\-\\_]*)(&(amp;)?‌​[\\w\\?‌​=]*)?");

        // TODO: Complete regex for netflix
        let foundNF = value.match("http(?:s?):\\/\\/(?:www\\.)?netflix.com");

        if (!foundYT && !foundNF) {
            showNotification(languageDB[selectedLang]["js"]["noValidURL"]);

            if (document.hidden)
                ipcRenderer.send('show_notification', languageDB[selectedLang]["js"]["error"], languageDB[selectedLang]["js"]["noValidURL"]);

            return;
        }

        let elements = ul.querySelectorAll("li");
        for (let element of elements) {
            if ((foundYT && element.textContent === foundYT[0]) || (foundNF && element.textContent === foundNF[0])) {
                showNotification(languageDB[selectedLang]["js"]["urlInList"]);

                if (document.hidden)
                    ipcRenderer.send('show_notification', languageDB[selectedLang]["js"]["error"], languageDB[selectedLang]["js"]["urlInList"]);

                return;
            }
        }

        let li = document.createElement("li");

        let elementCount = ul.querySelectorAll("li").length;
        li.setAttribute("data-id", elementCount.toString());

        if (foundYT) li.textContent = foundYT[0];
        else li.textContent = foundNF[0];

        ul.appendChild(li);
    }

    input.value = "";

    if (ul.scrollHeight > ul.clientHeight) ul.style.width = "calc(100% + 10px)";
    else ul.style.width = "100%";

    ul.scrollTop = ul.scrollHeight;

    showNotification(languageDB[selectedLang]["js"]["urlAdded"]);

    if (document.hidden)
        ipcRenderer.send('show_notification', languageDB[selectedLang]["js"]["error"], languageDB[selectedLang]["js"]["urlAdded"]);
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

        let command = "\"" + __realdir + "/yt-dlp" + exe + "\" -f ";
        if (mode === "audio") {
            command += "bestaudio --yes-playlist --playlist-start " + playlistCount + " --ffmpeg-location \"" + __realdir + "/ffmpeg" + exe + "\" --extract-audio --audio-format " + codec + " --audio-quality " + quality + " ";

            if (codec === "mp3") command += "--embed-thumbnail ";
        } else {
            command += "bestvideo+bestaudio --yes-playlist --playlist-start " + playlistCount + " --ffmpeg-location \"" + __realdir + "/ffmpeg" + exe + "\" --embed-thumbnail --audio-format mp3 --audio-quality 9 --merge-output-format mp4 ";
        }

        if (artistName) {
            command += "--add-metadata -o \"" + location + "/%(creator)s - %(title)s.%(ext)s\" " + url;
        } else {
            command += "--add-metadata -o \"" + location + "/%(title)s.%(ext)s\" " + url;
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
            let percentageTotal = NP.round(progressTotal.value * 100 + percentage, 2);

            progressTotal.value = percentageTotal / 100;
            infoTotal.textContent = percentageTotal + "%";

            progressSong.value = 1;
            infoSong.textContent = "100%";

            ipcRenderer.send('set_percentage', percentageTotal);

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
        tempOutput = await execSync("pgrep -P " + ppid).catch(() => {
        });
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
        let closeToTray = document.querySelector("#settings #closeToTray");
        let autostart = document.querySelector("#settings #autostart");
        let artistName = document.querySelector("#settings #artistName");

        setCookie("mode", mode.getAttribute("data-value"));
        setCookie("quality", quality.getAttribute("data-value"));
        setCookie("codec", codec.getAttribute("data-value"));
        setCookie("save", true);
        setCookie("closeToTray", closeToTray.classList.contains("active"));
        setCookie("autostart", autostart.classList.contains("active"));
        setCookie("artistName", artistName.classList.contains("active"));
    }
}

// TODO: Comment
export function deleteSettings() {
    setCookie("mode", "");
    setCookie("quality", "");
    setCookie("codec", "");
    setCookie("save", false);
    setCookie("closeToTray", false);
    setCookie("autostart", false);
}

// TODO: Comment
function loadSettings() {
    let mode = document.querySelector("#settings .mode .select");
    let quality = document.querySelector("#settings .quality .select");
    let codec = document.querySelector("#settings .codec .select");
    let lang = document.querySelector("#settings .lang .select");

    let modeValue = getCookie("mode");
    let qualityValue = getCookie("quality");
    let codecValue = getCookie("codec");
    let langValue = getCookie("lang");
    let save = getCookie("save");
    let closeToTray = getCookie("closeToTray");
    let autostart = getCookie("autostart");
    artistName = getCookie("artistName");

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

    let saving = document.querySelector("#settings .save");
    if (save) {
        saving.querySelector("#save").classList.add("active");
        saving.querySelector("span").textContent = languageDB[selectedLang]["js"]["on"];
    } else {
        saving.querySelector("span").textContent = languageDB[selectedLang]["js"]["off"];
    }

    let closingToTray = document.querySelector("#settings .closeToTray");
    if (closeToTray) {
        closingToTray.querySelector("#closeToTray").classList.add("active");
        closingToTray.querySelector("span").textContent = languageDB[selectedLang]["js"]["on"];
    } else {
        closingToTray.querySelector("span").textContent = languageDB[selectedLang]["js"]["off"];
    }

    let autostarting = document.querySelector("#settings .autostart");
    if (autostart) {
        autostarting.querySelector("#autostart").classList.add("active");
        autostarting.querySelector("span").textContent = languageDB[selectedLang]["js"]["on"];
    } else {
        autostarting.querySelector("span").textContent = languageDB[selectedLang]["js"]["off"];
    }

    let artistNaming = document.querySelector("#settings .artistName");
    if (artistName) {
        artistNaming.querySelector("#artistName").classList.add("active");
        artistNaming.querySelector("span").textContent = languageDB[selectedLang]["js"]["on"];
    } else {
        artistNaming.querySelector("span").textContent = languageDB[selectedLang]["js"]["off"];
    }
}

// TODO: Comment
export async function loadMenu() {
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

        main.innerHTML = mustache.render(template.innerHTML, languageDB[selectedLang]);

        loadSettings();
        setThemeIcon();
    });
}

// TODO: Comment
function setThemeIcon() {
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
