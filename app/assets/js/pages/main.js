import * as tools from "../tools.js";
import {showNotification} from "../tools.js";
const {clipboard, ipcRenderer, shell} = require("electron");

let lastClicked = null,
    contextElement = null;

// TODO: Comment
document.onclick = (e) => {
    lastClicked = e.target;

    let context = document.getElementById("contextMenu");
    if (context.classList.contains("show") && lastClicked.closest("#contextMenu") === null) {
        context.classList.remove("show");
        contextElement = null;
    }
}

// TODO: Comment
function searchButton () {
    ipcRenderer.send("open_file_dialog");

    // TODO: Comment
    ipcRenderer.once("selected_file", (event, path) => {
        let location = document.querySelector(".location #location");
        let locationButton = document.querySelector(".location .location-button");

        location.value = path;
        locationButton.ariaDisabled = "false";
    });
}

// TODO: Comment
tools.bindEvent("click", ".input .add-button:not([aria-disabled='true'])", () => {
    let input = this.closest(".input").querySelector("input");

    if (tools.addUrlToList(input.value)) input.value = "";
});

// TODO: Comment
tools.bindEvent("click", ".listBox:not([aria-disabled='true']) ul", (e) => {
    if (e.target === this) {
        let listBox = document.querySelector(".listBox");

        tools.removeActives(listBox);
        tools.updateSelected();
    }
});

// TODO: Comment
tools.bindEvent("click", ".listBox:not([aria-disabled='true']) li", (e) => {
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

// TODO: Comment
tools.bindEvent("click", ".listBox .delete-button:not([aria-disabled='true'])", () => {
    tools.removeActiveListItems();
});

// TODO: Comment
tools.bindEvent("click", ".input .paste-button:not([aria-disabled='true'])", () => {
    let clipboardText = clipboard.readText();

    if (!clipboardText) {
        showNotification(tools.languageDB[tools.selectedLang]["js"]["noClipboard"], tools.languageDB[tools.selectedLang]["js"]["error"]);
    } else tools.addUrlToList(clipboardText);
});

// TODO: Comment
tools.bindEvent("click", "#updateNotification .close-button", () => {
    let notification = document.getElementById("updateNotification");
    notification.classList.add("hidden");
});

// TODO: Comment
tools.bindEvent("click", "#updateNotification .restart-button", () => {
    ipcRenderer.send("restart_app");
});

// TODO: Comment
tools.bindEvent("keydown", ".input input:not([aria-disabled='true'])", (e) => {
    if (e.code === "Enter") tools.addUrlToList(this.value);
});

/*
 * Funktion: Anonym
 * Autor: Bernardo de Oliveira
 *
 * Ändert das Design-Attribut und ändert somit auch das Design
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

// TODO: Comment
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
            showNotification(tools.languageDB[tools.selectedLang]["js"]["noURLs"], tools.languageDB[tools.selectedLang]["js"]["error"]);
            return;
        }

        if (!mode) {
            showNotification(tools.languageDB[tools.selectedLang]["js"]["downloadMode"], tools.languageDB[tools.selectedLang]["js"]["error"]);
            return;
        } else if (mode === "audio") {
            if (!codecAudio) {
                showNotification(tools.languageDB[tools.selectedLang]["js"]["codec"], tools.languageDB[tools.selectedLang]["js"]["error"]);
                return;
            }

            if (!quality) {
                showNotification(tools.languageDB[tools.selectedLang]["js"]["quality"], tools.languageDB[tools.selectedLang]["js"]["error"]);
                return;
            }
        } else {
            if (!codecVideo) {
                showNotification(tools.languageDB[tools.selectedLang]["js"]["codec"], tools.languageDB[tools.selectedLang]["js"]["error"]);
                return;
            }
        }

        if (!location.value) {
            showNotification(tools.languageDB[tools.selectedLang]["js"]["storageLocation"], tools.languageDB[tools.selectedLang]["js"]["error"]);
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

        tools.worker.postMessage({
            type: "loadData",
            mode: mode,
            codecAudio: codecAudio,
            codecVideo: codecVideo,
            quality: quality,
            settings: tools.specificSettings,
            premium: tools.getCookie("premium")
        });

        let count = 0;
        let allUrls = [];
        for (let item of items) {
            if (item.textContent.includes("playlist?list=")) {
                let urls = await tools.getPlaylistUrls(item.textContent);
                count += urls.length;
                allUrls = [...allUrls, ...urls];
            } else {
                count++;
                allUrls.push(item.textContent);
            }

            if (tools.aborted) break download;
        }

        tools.setWorkerCount(allUrls.length);

        for (let i = 0; i < allUrls.length; i++) {
            tools.worker.postMessage({
                type: "checkPremiumAndAdd",
                url: allUrls[i],
                location: location.value,
                count: count,
                id: i
            });

            if (tools.aborted) break download;
        }
    }
});

// TODO: Comment
tools.bindEvent("click", ".startAbort .abort-button:not([aria-disabled='true'])", () => {
    tools.setAborted(true);

    if (tools.childProcess) {
        tools.getChildProcessRecursive(tools.childProcess.pid).then((pids) => {
            pids = pids.reverse();
            for (let pid of pids) {
                ipcRenderer.send("kill_pid", Number(pid));
            }
            ipcRenderer.send("kill_pid", tools.childProcess.pid);
        });
    }

    tools.setEnabled();
});

// TODO: Comment
tools.bindEvent("contextmenu", ".listBox:not([aria-disabled='true']) li", (e) => {
    e.preventDefault();

    if (!e.target.textContent.includes("playlist?list=")) {
        let context = document.getElementById("contextMenu");
        let mode = tools.getCookie("mode");
        let id = this.getAttribute("data-id");

        if (typeof tools.specificSettings[id] !== "undefined" && typeof tools.specificSettings[id]["mode"] !== "undefined")
            mode = tools.specificSettings[id]["mode"];

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
        if (typeof tools.specificSettings[id] !== "undefined" && typeof tools.specificSettings[id]["quality"] !== "undefined") {
            context.querySelector(".quality [data-value='" + tools.specificSettings[id]["quality"] + "']").classList.add("active");
        } else {
            let quality = tools.getCookie("quality");
            context.querySelector(".quality [data-value='" + quality + "']").classList.add("active");
        }

        tools.removeActives(context.querySelector(".codecAudio"));
        if (typeof tools.specificSettings[id] !== "undefined" && typeof tools.specificSettings[id]["codec"] !== "undefined") {
            context.querySelector(".codecAudio [data-value='" + tools.specificSettings[id]["codec"] + "']").classList.add("active");
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
    } else showNotification(tools.languageDB[tools.selectedLang]["js"]["playlistContext"], tools.languageDB[tools.selectedLang]["js"]["error"]);
});

// TODO: Comment
tools.bindEvent("mouseover", "#contextMenu .nav-select", () => {
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
tools.bindEvent("click", "#contextMenu .nav-select .option:not(.active)", () => {
    let navSelect = this.closest(".nav-select");
    let className = navSelect.classList[0];

    let actives = document.querySelectorAll(".listBox li.active");
    for (let active of actives) {
        let id = active.getAttribute("data-id");

        if (typeof tools.specificSettings[id] === "undefined")
            tools.specificSettings[id] = {};

        tools.specificSettings[id][className] = this.getAttribute("data-value");
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
tools.bindEvent("click", "#contextMenu .copy", () => {
    tools.activeToClipboard();

    this.closest("#contextMenu").classList.remove("show");
});

// TODO: Comment
tools.bindEvent("click", "#contextMenu .location", () => {
    ipcRenderer.send("open_file_dialog");

    ipcRenderer.once("selected_file", (event, path) => {
        let actives = document.querySelectorAll(".listBox li.active");
        if (!actives.length) actives[actives.length] = contextElement;

        for (let active of actives) {
            let id = active.getAttribute("data-id");

            if (typeof tools.specificSettings[id] !== "object")
                tools.specificSettings[id] = {};

            tools.specificSettings[id]["location"] = path;
        }

        showNotification(tools.languageDB[tools.selectedLang]["js"]["specificLocation"]);
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

    let body = document.getElementsByTagName("body")[0];

    body.style.overflow = "hidden";
    settings.style.display = "initial";
    settings.animateCallback([
        {top: "100%"},
        {top: "0%"}
    ], {
        duration: 200,
        fill: "forwards"
    }, () => {
        body.style.overflow = "";

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
    let language = tools.languageDB[tools.selectedLang];

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