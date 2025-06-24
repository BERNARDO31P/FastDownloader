import * as tools from "../tools.js";
import {showNotification, specificSettings} from "../tools.js";
const {spawnSync} = require("child_process");

const terminate = require("terminate");
const {clipboard, ipcRenderer, shell} = require("electron");

let lastClicked = null,
    contextElement = null;

/**
 * Add click event listener to document and removes context menu if it's open and clicked outside of it.
 *
 * @param {MouseEvent} e - The click event.
 */
document.onclick = (e) => {
    lastClicked = e.target;

    let context = document.getElementById("contextMenu");
    if (context.classList.contains("show") && lastClicked.closest("#contextMenu") === null) {
        context.classList.remove("show");
        contextElement = null;
    }
}

/**
 * Sends "open_file_dialog" message to the main process and updates location input field and button when a file is selected.
 */
function searchButton() {
    ipcRenderer.send("open_file_dialog");

    ipcRenderer.once("selected_file", (event, path) => {
        let location = document.querySelector(".location #location");
        let locationButton = document.querySelector(".location .location-button");

        if (tools.getCookie("saveLocation")) {
            tools.setCookie("lastLocation", path);
        }

        location.value = path;
        locationButton.ariaDisabled = "false";
    });
}

/**
 * Adds the input value as a URL to the list.
 * Removes the value on success.
 *
 * @param {MouseEvent} e - The click event.
 */
tools.bindEvent("click", ".input .add-button:not([aria-disabled='true'])", (e) => {
    let input = e.target.closest(".input").querySelector("input");

    if (tools.addUrlToList(input.value)) input.value = "";
});

/**
 * Removes all active items.
 *
 * @param {MouseEvent} e - The click event.
 */
tools.bindEvent("click", ".listBox:not([aria-disabled='true']) ul", function (e) {
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
tools.bindEvent("click", ".listBox:not([aria-disabled='true']) li", function (e) {
    let listBox = this.closest(".listBox");
    let actives = listBox.querySelectorAll("li.active");

    if (!e.ctrlKey && !e.shiftKey) tools.removeActives(listBox);

    if (e.shiftKey && actives.length) {
        document.getSelection().removeAllRanges();

        let elements = listBox.querySelectorAll("li");
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
    } else {
        (this.classList.contains("active"))
            ? this.classList.remove("active")
            : this.classList.add("active");
    }

    tools.updateSelected();
});

/**
 * Removes all active items.
 */
tools.bindEvent("click", ".listBox .delete-button:not([aria-disabled='true'])", () => {
    tools.removeActiveListItems();
});

/**
 * Removes all items.
 */
tools.bindEvent("click", ".listBox .clear-button:not([aria-disabled='true'])", () => {
    tools.clearList();
});

/**
 * Adds the clipboard text as a URL to the list.
 */
tools.bindEvent("click", ".input .paste-button:not([aria-disabled='true'])", (e) => {
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
tools.bindEvent("keydown", ".input input:not([aria-disabled='true'])", function (e) {
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
    let html = document.getElementsByTagName("html")[0];
    let togglers = document.getElementsByClassName("theme-toggler");

    if (html.getAttribute("data-theme") === "dark") {
        html.setAttribute("data-theme", "light");

        for (let toggler of togglers) {
            let icon = toggler.querySelector("svg");
            icon.classList.remove("fa-sun");
            icon.classList.add("fa-moon");
        }

        tools.setTheme("light");
    } else {
        html.setAttribute("data-theme", "dark");

        for (let toggler of togglers) {
            let icon = toggler.querySelector("svg");
            icon.classList.remove("fa-moon");
            icon.classList.add("fa-sun");
        }

        tools.setTheme("dark");
    }
});

/**
 * When the user clicks the start button, this function starts the download process.
 *
 * It sends the configuration to the worker to prepare.
 * Playlists are converted to single URLS.
 *
 * The URLs are then converted to YouTube Music by the worker (if configured).
 */
tools.bindEvent("click", ".startAbort .start-button:not([aria-disabled='true'])", async () => {
    tools.setAborted(false);

    download: {
        let listBox = document.getElementsByClassName("listBox")[0];
        let location = document.querySelector(".location #location");
        let items = listBox.querySelectorAll("li");

        let mode = tools.getCookie("mode");
        let codecAudio = tools.getCookie("codecAudio");
        let codecVideo = tools.getCookie("codecVideo");
        let quality = tools.getCookie("quality");

        if (!items.length) {
            showNotification(tools.languageDB["js"]["noURLs"], tools.languageDB["js"]["error"]);
            return;
        }

        if (!mode) {
            showNotification(tools.languageDB["js"]["downloadMode"], tools.languageDB["js"]["error"]);
            return;
        } else if (mode === "audio") {
            if (!codecAudio) {
                showNotification(tools.languageDB["js"]["codec"], tools.languageDB["js"]["error"]);
                return;
            }

            if (!quality) {
                showNotification(tools.languageDB["js"]["quality"], tools.languageDB["js"]["error"]);
                return;
            }
        } else {
            if (!codecVideo) {
                showNotification(tools.languageDB["js"]["codec"], tools.languageDB["js"]["error"]);
                return;
            }
        }

        if (!location.value) {
            showNotification(tools.languageDB["js"]["storageLocation"], tools.languageDB["js"]["error"]);
            return;
        }

        tools.setDisabled();
        ipcRenderer.send("set_percentage", 0);
        ipcRenderer.send("add_abort");

        let progressTotal = document.querySelector(".progress-total progress");
        let infoTotal = document.querySelector(".progress-total .info p");
        let progressSong = document.querySelector(".progress-song progress");
        let infoSong = document.querySelector(".progress-song .info p");

        progressTotal.value = 0;
        progressSong.value = 0;
        infoTotal.textContent = "0%";
        infoSong.textContent = "0%";

        let count = 0;
        let allUrls = [];
        for (let item of items) {
            if (item.textContent.includes("playlist?list=")) {
                const result = spawnSync(tools.ytDl + " --print \"%(url)s\" --flat-playlist " + item.textContent, {shell: true}).stdout.toString().trim();
                if (!result) {
                    continue;
                }

                result.split("\n").forEach((url) => {
                    if (url) {
                        count++;
                        allUrls.push(url);
                    }
                });

                if (typeof specificSettings[item.textContent] !== "undefined") {
                    for (let url of urls) {
                        specificSettings[url] = specificSettings[item.textContent];
                    }
                    delete specificSettings[item.textContent];
                }
            } else {
                count++;
                allUrls.push(item.textContent);
            }

            if (tools.aborted) break download;
        }

        tools.worker.postMessage({
            type: "loadData",
            mode: mode,
            codecAudio: codecAudio,
            codecVideo: codecVideo,
            quality: quality,
            settings: tools.specificSettings
        });

        tools.setWorkerCount(allUrls.length);
        for (let url of allUrls) {
            tools.worker.postMessage({
                type: "checkPremiumAndAdd",
                url: url,
                location: location.value,
                count: count,
            });

            if (tools.aborted) break download;
        }
    }
});

// TODO: Comment
tools.bindEvent("click", ".startAbort .abort-button:not([aria-disabled='true'])", () => {
    tools.setAborted(true);

    if (tools.childProcess && tools.childProcess.pid)
        terminate(tools.childProcess.pid);

    tools.setEnabled();
});

// TODO: Comment
tools.bindEvent("contextmenu", ".listBox:not([aria-disabled='true']) li", function (e) {
    e.preventDefault();

    let context = document.getElementById("contextMenu");
    let mode = tools.getCookie("mode");
    let url = this.getAttribute("data-url");

    if (typeof tools.specificSettings[url] !== "undefined" && typeof tools.specificSettings[url]["mode"] !== "undefined")
        mode = tools.specificSettings[url]["mode"];

    tools.removeActives(context.querySelector(".mode"));
    if (mode === "audio") {
        context.querySelector(".codecAudio").style.display = "";
        context.querySelector(".quality").style.display = "";

        context.querySelector(".codecVideo").style.display = "none";

        context.querySelector(".mode [data-value='audio']").classList.add("active");
    } else {
        context.querySelector(".codecAudio").style.display = "none";
        context.querySelector(".quality").style.display = "none";

        context.querySelector(".codecVideo").style.display = "";

        context.querySelector(".mode [data-value='video']").classList.add("active");
    }

    tools.removeActives(context.querySelector(".quality"));
    if (typeof tools.specificSettings[url] !== "undefined" && typeof tools.specificSettings[url]["quality"] !== "undefined") {
        context.querySelector(".quality [data-value='" + tools.specificSettings[url]["quality"] + "']").classList.add("active");
    } else {
        let quality = tools.getCookie("quality");
        context.querySelector(".quality [data-value='" + quality + "']").classList.add("active");
    }

    tools.removeActives(context.querySelector(".codecAudio"));
    if (typeof tools.specificSettings[url] !== "undefined" && typeof tools.specificSettings[url]["codec"] !== "undefined") {
        context.querySelector(".codecAudio [data-value='" + tools.specificSettings[url]["codec"] + "']").classList.add("active");
    } else {
        let codec = tools.getCookie("codecAudio");
        context.querySelector(".codecAudio [data-value='" + codec + "']").classList.add("active");
    }

    contextElement = e.target;
    context.classList.add("show");

    context.style.left = e.pageX + "px";
    context.style.top = e.pageY + "px";

    let contextBounding = context.getBoundingClientRect();
    if (contextBounding.right > document.body.clientWidth) {
        context.style.left = contextBounding.left + (document.body.clientWidth - contextBounding.left - contextBounding.width - 10) + "px";
    }

    this.classList.add("active");
    tools.updateSelected();
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

    this.addEventListener("mouseleave", () => select.classList.remove("show"), {once: true});
});

// TODO: Comment
tools.bindEvent("click", "#contextMenu .nav-select .option:not(.active)", function () {
    let navSelect = this.closest(".nav-select");
    let className = navSelect.classList[0];

    let actives = document.querySelectorAll(".listBox li.active");
    for (let active of actives) {
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
    ipcRenderer.send("open_file_dialog");

    ipcRenderer.once("selected_file", (event, path) => {
        let actives = document.querySelectorAll(".listBox li.active");
        if (!actives.length) actives[actives.length] = contextElement;

        for (let active of actives) {
            let url = active.getAttribute("data-url");

            if (typeof tools.specificSettings[url] !== "object")
                tools.specificSettings[url] = {};

            tools.specificSettings[url]["location"] = path;
        }

        showNotification(tools.languageDB["js"]["specificLocation"]);
    });

    this.closest("#contextMenu").classList.remove("show");
});

// TODO: Comment
tools.bindEvent("click", ".location .search-button:not([aria-disabled='true'])", searchButton);

// TODO: Comment
tools.bindEvent("click", ".location .location-button:not([aria-disabled='true'])", () => {
    let location = document.querySelector(".location #location");

    if (location.value) shell.openPath(location.value);
});

// TODO: Comment
tools.bindEvent("click", "#settings-open:not([aria-disabled='true'])", async () => {
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
    if (e.code === "Delete" && !tools.downloading)
        tools.removeActiveListItems();

    if (e.code === "KeyA" && e.ctrlKey && lastClicked.closest(".listBox") !== null && !tools.downloading) {
        let items = document.querySelectorAll(".listBox li");
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