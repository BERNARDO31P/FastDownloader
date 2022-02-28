const {ipcRenderer} = require('electron');
const {promisify} = require('util');
const ytpl = require('ytpl');

const Store = require('electron-store');
const store = new Store();

const {exec} = require('child_process');
const execSync = promisify(require('child_process').exec);

export let childProcess = null, downloadAborted = false, playlistCount = 1;
export let __realdir = null;

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
        showNotification("Sie haben keinen Link angegeben");
        return;
    }

    let found = input.value.match("http(?:s?):\\/\\/(?:www\\.|music\\.)?youtu(?:be\\.com\\/watch\\?v=|be\\.com\\/playlist\\?list=|\\.be\\/)([\\w\\-\\_]*)(&(amp;)?‌​[\\w\\?‌​=]*)?");
    if (!found) {
        showNotification("Sie haben keinen gültigen Link angegeben");
        return;
    }

    let ul = document.querySelector(".listBox ul");
    let elements = ul.querySelectorAll("li");
    for (let element of elements) {
        if (element.textContent === found[0]) {
            showNotification("Dieser Link befindet sich bereits in der Liste");
            return;
        }
    }

    let li = document.createElement("li");
    li.textContent = found[0];

    ul.appendChild(li);
    input.value = "";

    if (ul.scrollHeight > ul.clientHeight) ul.style.width = "calc(100% + 10px)";
    else ul.style.width = "100%";

    showNotification("Link wurde zur Liste hinzugefügt");
}

// TODO: Comment
export function closeNotification() {
    let notification = document.getElementById("updateNotification");
    notification.classList.add('hidden');
}

// TODO: Comment
export function restartApp() {
    ipcRenderer.send('restart_app');
}

// TODO: Comment
export function selectClick(element) {
    let select = element;
    if (!element.classList.contains("select")) {
        select = element.closest(".select");
    }

    let songProgress = document.getElementsByClassName("progress-song")[0];
    let totalProgress = document.getElementsByClassName("progress-total")[0];

    if (select.classList.contains("active")) {
        songProgress.style.opacity = "1";
        totalProgress.style.opacity = "1";

        select.classList.remove("active");
    } else {
        songProgress.style.opacity = "0";
        totalProgress.style.opacity = "0";

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
}

// TODO: Comment
export function downloadURL(mode, location, url, percentage, codec, quality, playlistCount) {
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
            progressTotal.value = progressTotal.value + (percentage / 100);
            progressSong.value = 1;

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
    let mode = document.querySelector(".mode .select");
    let codec = document.querySelector(".codec .select");
    let quality = document.querySelector(".quality .select");
    let location = document.querySelector(".location #location");
    let buttons = document.querySelectorAll("button:not(.abort-button):not(.location-button)");
    let abortButton = document.querySelector(".abort-button");
    let input = document.querySelector("input:not(#location)");

    listBox.ariaDisabled = "true";
    mode.ariaDisabled = "true";
    codec.ariaDisabled = "true";
    quality.ariaDisabled = "true";
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
    let mode = document.querySelector(".mode .select");
    let codec = document.querySelector(".codec .select");
    let quality = document.querySelector(".quality .select");
    let location = document.querySelector(".location #location");
    let buttons = document.querySelectorAll("button:not(.abort-button):not(.location-button)");
    let abortButton = document.querySelector(".abort-button");
    let input = document.querySelector("input:not(#location)");

    listBox.ariaDisabled = "false";
    mode.ariaDisabled = "false";
    codec.ariaDisabled = "false";
    quality.ariaDisabled = "false";
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
export function abortDownload() {
    downloadAborted = true;
}