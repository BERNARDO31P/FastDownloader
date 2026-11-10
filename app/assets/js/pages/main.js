import * as tools from "../tools.js";
import {showNotification, worker} from "../tools.js";
const {clipboard, ipcRenderer, shell} = require("electron");

let lastClicked = null,
    contextElement = null;

function showError(key) {
    showNotification(tools.languageDB["js"][key], tools.languageDB["js"]["error"]);
}

function hideNavSelect() {
    this.querySelector(".select").classList.remove("show");
}

function selectedDirectory(paths) {
    // The directory dialog allows one selection; download paths must be strings.
    return Array.isArray(paths) ? paths[0] : paths;
}

function selectContextValue(context, section, value) {
    tools.removeActives(context.querySelector("." + section));
    context.querySelector(
        "." + section + " [data-value=\"" + value + "\"]"
    ).classList.add("active");
}

/**
 * Add click event listener to document and removes context menu if it's open and clicked outside of it.
 *
 * @param {MouseEvent} e - The click event.
 */
document.onclick = (e) => {
    lastClicked = e.target;

    const context = document.getElementById("contextMenu");
    if (context.classList.contains("show") && lastClicked.closest("#contextMenu") === null) {
        context.classList.remove("show");
        contextElement = null;
    }
};

/**
 * Sends "open_file_dialog" message to the main process and updates location input field and button when a file is selected.
 */
function searchButton() {
    ipcRenderer.once("selected_file", (event, paths) => {
        const path = selectedDirectory(paths);
        const location = document.querySelector(".location #location");
        const locationButton = document.querySelector(".location .location-button");

        if (tools.getCookie("saveLocation")) {
            tools.setCookie("lastLocation", path);
        }

        location.value = path;
        locationButton.ariaDisabled = "false";
    });

    ipcRenderer.send("open_file_dialog");
}

/**
 * Adds the input value as a URL to the list.
 * Removes the value on success.
 *
 * @param {MouseEvent} e - The click event.
 */
tools.bindEvent("click", ".input .add-button:not([aria-disabled=\"true\"])", (e) => {
    let input = e.target.closest(".input").querySelector("input");

    if (tools.addUrlToList(input.value)) input.value = "";
});

/**
 * Removes all active items.
 *
 * @param {MouseEvent} e - The click event.
 */
tools.bindEvent("click", ".listBox:not([aria-disabled=\"true\"]) ul", function (e) {
    if (e.target === this) {
        let listBox = document.querySelector(".listBox");

        tools.removeActives(listBox);
        tools.updateSelected();
    }
});

/**
 * Adds or removes "active" class based on the click modifiers.
 *
 * ShiftKey allows the user to select to a specific element.
 * CtrlKey allows the user to select specific elements.
 * CtrlKey + A allows the user to select all elements.
 *
 * A click without any of these keys result in deselection of all elements.
 *
 * @param {MouseEvent} e - The click event.
 */
tools.bindEvent("click", ".listBox:not([aria-disabled=\"true\"]) li", function (e) {
    // Child tracks are read-only progress rows; the toggle must not select a URL.
    if (e.target.closest(".playlist-toggle, .playlist-entries")) {
        return;
    }

    let listBox = this.closest(".listBox");
    let actives = listBox.querySelectorAll(":scope > ul > li.active");
    let wasActive = this.classList.contains("active");

    if (!e.ctrlKey && !e.shiftKey) tools.removeActives(listBox);

    if (e.shiftKey && actives.length) {
        document.getSelection().removeAllRanges();

        let elements = listBox.querySelectorAll(":scope > ul > li");
        let active = false, clicked = false;

        for (let i = 0; i < elements.length; i++) {
            let element = elements[i];

            if (element === this) {
                clicked = true;
            }

            if (element.classList.contains("active")) {
                active = true;
            }

            if ((active && !clicked) || (clicked && !active)) {
                element.classList.add("active");
            } else if (active && clicked) {
                this.classList.add("active");
                break;
            }
        }
    } else if (e.ctrlKey) {
        this.classList.toggle("active");
    } else if (!wasActive) {
        this.classList.add("active");
    }

    tools.updateSelected();
});

/**
 * Playlists remain expandable while a download is running.
 */
tools.bindEvent("click", ".listBox .playlist-toggle", function (e) {
    e.preventDefault();
    tools.togglePlaylist(this.closest("li.playlist-item"));
});

/**
 * Removes all active items.
 */
tools.bindEvent("click", ".listBox .delete-button:not([aria-disabled=\"true\"])", () => {
    tools.removeActiveListItems();
});

/**
 * Removes all items.
 */
tools.bindEvent("click", ".listBox .clear-button:not([aria-disabled=\"true\"])", () => {
    tools.clearList();
});

/**
 * Adds the clipboard text as a URL to the list.
 */
tools.bindEvent("click", ".input .paste-button:not([aria-disabled=\"true\"])", (e) => {
    let clipboardText = clipboard.readText();

    if (!clipboardText) {
        showNotification(tools.languageDB["js"]["noClipboard"], tools.languageDB["js"]["error"]);
    } else tools.addUrlToList(clipboardText);

    let input = e.target.closest(".input").querySelector("input");
    input.value = "";
});

/**
 * Hides the notification.
 */
tools.bindEvent("click", "#updateNotification .close-button", () => {
    let notification = document.getElementById("updateNotification");
    notification.classList.add("hidden");
});

/**
 * Sets the "update" cookie and restarts the app.
 * The update cookie is used to determinate on the first startup if it was freshly installed or updated.
 */
tools.bindEvent("click", "#updateNotification .restart-button", () => {
    tools.setCookie("update", true);

    ipcRenderer.send("restart_app");
});

/**
 * Adds the input value as a URL to the list when EnterKey is pressed.
 *
 * @param {KeyboardEvent} e - The keydown event.
 */
tools.bindEvent("keydown", ".input input:not([aria-disabled=\"true\"])", function (e) {
    if (e.code === "Enter") {
        if (tools.addUrlToList(this.value)) this.value = "";
    }
});

/**
 * This function switches the theme between light and dark mode by changing the "data-theme" attribute of the HTML element.
 * The theme button gets replaced with the corresponding icon.
 *
 * The theme is saved in the cookies for keeping the theme after a restart.
 */
tools.bindEvent("click", ".theme-toggler", () => {
    const html = document.getElementsByTagName("html")[0];
    const theme = html.getAttribute("data-theme") === "dark" ? "light" : "dark";
    const light = theme === "light";

    html.setAttribute("data-theme", theme);

    for (const toggler of document.getElementsByClassName("theme-toggler")) {
        const icon = toggler.querySelector("svg");
        icon.classList.remove(light ? "fa-sun" : "fa-moon");
        icon.classList.add(light ? "fa-moon" : "fa-sun");
    }

    tools.setTheme(theme);
});

/**
 * When the user clicks the start button, this function starts the download process.
 *
 * Adds all visible URLs to the live queue. New URLs join automatically while
 * running; settings are snapshotted by each worker when its track starts.
 */
tools.bindEvent("click", ".startAbort .start-button:not([aria-disabled=\"true\"])", () => {
    if (tools.downloading) {
        tools.toggleDownloadPause();
        return;
    }

    const items = Array.from(document.querySelectorAll(".listBox > ul > li"));
    const location = document.querySelector(".location #location");
    const mode = tools.getCookie("mode");

    if (!items.length) return showError("noURLs");
    if (!mode) return showError("downloadMode");
    if (mode === "audio") {
        if (!tools.getCookie("codecAudio")) return showError("codec");
        if (!tools.getCookie("quality")) return showError("quality");
    } else if (!tools.getCookie("codecVideo")) {
        return showError("codec");
    }
    if (!location.value) return showError("storageLocation");

    tools.resetAllDownloadProgress();
    ipcRenderer.send("add_abort");
    tools.startDownloadQueue(items);
});

tools.bindEvent("click", ".startAbort .abort-button:not([aria-disabled=\"true\"])", () => {
    tools.abortDownloadQueue();
});

// TODO: Comment
tools.bindEvent("contextmenu", ".listBox:not([aria-disabled=\"true\"]) li", function (e) {
    e.preventDefault();

    const context = document.getElementById("contextMenu");
    const url = this.getAttribute("data-url");
    const settings = tools.specificSettings[url] || {};
    const parent = this.closest("li.playlist-item");
    const inherited = parent && parent !== this
        ? tools.specificSettings[parent.getAttribute("data-url")] || {} : {};
    const setting = (key, fallback) => (
        settings[key] !== undefined ? settings[key]
            : inherited[key] !== undefined ? inherited[key] : tools.getCookie(fallback)
    );

    const audio = setting("mode", "mode") === "audio";

    context.querySelector(".codecAudio").style.display = audio ? "" : "none";
    context.querySelector(".quality").style.display = audio ? "" : "none";
    context.querySelector(".codecVideo").style.display = audio ? "none" : "";

    selectContextValue(context, "mode", audio ? "audio" : "video");
    selectContextValue(context, "quality", setting("quality", "quality"));
    selectContextValue(context, "codecAudio", setting("codecAudio", "codecAudio"));
    selectContextValue(context, "codecVideo", setting("codecVideo", "codecVideo"));

    contextElement = this;
    const locked = ["running", "completed", "failed"].includes(this.getAttribute("data-download-state"));
    for (const node of context.querySelectorAll(".nav-select, .location")) {
        node.setAttribute("aria-disabled", String(locked));
    }
    context.classList.add("show");

    context.style.left = e.pageX + "px";
    context.style.top = e.pageY + "px";

    let contextBounding = context.getBoundingClientRect();
    if (contextBounding.right > document.body.clientWidth) {
        context.style.left = contextBounding.left + (document.body.clientWidth - contextBounding.left - contextBounding.width - 10) + "px";
    }

    if (!this.classList.contains("playlist-entry")) {
        this.classList.add("active");
        tools.updateSelected();
    }
});

// TODO: Comment
tools.bindEvent("mouseover", "#contextMenu .nav-select", function () {
    let select = this.querySelector(".select");
    let contextMenu = this.closest("#contextMenu");
    let left = contextMenu.getBoundingClientRect().width;

    select.classList.add("show");
    select.style.left = left - 5 + "px";

    let selectBounding = select.getBoundingClientRect();
    if (selectBounding.right > document.body.clientWidth) {
        select.style.left = "-" + (selectBounding.width - 5) + "px"
    }

    // Repeated mouseover events must not accumulate mouseleave listeners.
    this.removeEventListener("mouseleave", hideNavSelect);
    this.addEventListener("mouseleave", hideNavSelect, {once: true});
});

// TODO: Comment
tools.bindEvent("click", "#contextMenu .nav-select .option:not(.active)", function () {
    if (this.closest(".nav-select").getAttribute("aria-disabled") === "true") return;
    let navSelect = this.closest(".nav-select");
    let className = navSelect.classList[0];

    let actives = contextElement && contextElement.classList.contains("playlist-entry")
        ? [contextElement] : document.querySelectorAll(".listBox > ul > li.active");
    for (let active of actives) {
        if (["running", "completed", "failed"].includes(active.getAttribute("data-download-state"))) continue;
        let url = active.getAttribute("data-url");

        if (typeof tools.specificSettings[url] === "undefined")
            tools.specificSettings[url] = {};

        tools.specificSettings[url][className] = this.getAttribute("data-value");
    }

    let activeOptions = navSelect.querySelectorAll(".active");
    for (let activeOption of activeOptions) {
        activeOption.classList.remove("active");
    }

    this.classList.add("active");

    if (navSelect.classList.contains("mode")) {
        let context = document.getElementById("contextMenu");
        let audioSettings = context.querySelectorAll(".audioSettings");
        let videoSettings = context.querySelectorAll(".videoSettings");

        if (this.getAttribute("data-value") === "audio") {
            videoSettings.forEach(function (element) {
                element.style.display = "none";
            });
            audioSettings.forEach(function (element) {
                element.style.display = "";
            });
        } else {
            audioSettings.forEach(function (element) {
                element.style.display = "none";
            });
            videoSettings.forEach(function (element) {
                element.style.display = "";
            });
        }
    }
});

// TODO: Comment
tools.bindEvent("click", "#contextMenu .copy", function () {
    tools.activeToClipboard();

    this.closest("#contextMenu").classList.remove("show");
});

// TODO: Comment
tools.bindEvent("click", "#contextMenu .location", function () {
    if (this.getAttribute("aria-disabled") === "true") return;
    ipcRenderer.once("selected_file", (event, paths) => {
        const path = selectedDirectory(paths);
        const actives = contextElement && contextElement.classList.contains("playlist-entry")
            ? [contextElement] : Array.from(document.querySelectorAll(".listBox > ul > li.active"));
        if (!actives.length && contextElement) actives.push(contextElement);

        for (let active of actives) {
            if (["running", "completed", "failed"].includes(active.getAttribute("data-download-state"))) continue;
            let url = active.getAttribute("data-url");

            if (typeof tools.specificSettings[url] !== "object")
                tools.specificSettings[url] = {};

            tools.specificSettings[url]["location"] = path;
        }

        showNotification(tools.languageDB["js"]["specificLocation"]);
    });

    ipcRenderer.send("open_file_dialog");

    this.closest("#contextMenu").classList.remove("show");
});

// TODO: Comment
tools.bindEvent("click", ".location .search-button:not([aria-disabled=\"true\"])", searchButton);

// TODO: Comment
tools.bindEvent("click", ".location .location-button:not([aria-disabled=\"true\"])", () => {
    let location = document.querySelector(".location #location");

    if (location.value) shell.openPath(location.value);
});

// TODO: Comment
tools.bindEvent("click", "#settings-open:not([aria-disabled=\"true\"])", async () => {
    let settings = document.getElementsByTagName("settings")[0];

    if (settings.innerHTML === "") {
        await tools.loadPage("assets/template/settings.html", settings, () => {
            tools.loadSettings();
            tools.setThemeIcon();
        });
    }

    document.body.style.overflow = "hidden";
    settings.style.display = "initial";
    settings.animateCallback([
        {top: "100%"},
        {top: "0%"}
    ], {
        duration: 200,
        fill: "forwards"
    }, () => {
        document.body.style.overflow = "";

        let nav = document.querySelector("settings #nav");
        nav.classList.add("static");
    });
});

// TODO: Comment
ipcRenderer.on("download", () => {
    document.querySelector(".startAbort .start-button").click();
});

// TODO: Comment
ipcRenderer.on("clear", () => {
    tools.clearList();
});

// TODO: Comment
ipcRenderer.on("location", () => {
    searchButton();
});

// TODO: Comment
ipcRenderer.on("yt-results", (event, results) => {
    worker.postMessage({type: "youTubeMusicSearchResults", results: results.results, requestId: results.requestId});
});

// TODO: Comment
ipcRenderer.on("abort", () => {
    document.querySelector(".startAbort .abort-button").click();
});

// TODO: Comment
ipcRenderer.on("url", (event, value) => {
    let input = document.querySelector(".input input");
    input.value = value;

    if (tools.addUrlToList(value)) input.value = "";
});

// TODO: Comment
ipcRenderer.on("translate", (event, array) => {
    let value = [];
    let language = tools.languageDB;

    let i = 0;
    for (let arrayLevels of array) {
        let tmpLanguage = language;

        for (let arrayLevel of arrayLevels) {
            value[i] = tmpLanguage[arrayLevel];
            tmpLanguage = tmpLanguage[arrayLevel];
        }
        i++;
    }

    ipcRenderer.send("translation", value);
});

// TODO: Comment
document.addEventListener("keydown", (e) => {
    if (e.code === "Delete")
        tools.removeActiveListItems();

    if (e.code === "KeyA" && e.ctrlKey && lastClicked && lastClicked.closest(".listBox") !== null) {
        let items = document.querySelectorAll(".listBox > ul > li");
        if (!items.length) return;

        setTimeout(() => {
            document.getSelection().removeAllRanges();
        });

        for (let item of items) {
            item.classList.add("active");
        }

        let linkCount = document.getElementById("link-count");
        linkCount.querySelector("a").textContent = items.length.toString();
        linkCount.style.opacity = "1";
    }

    if (e.code === "KeyC" && e.ctrlKey) tools.activeToClipboard();
});