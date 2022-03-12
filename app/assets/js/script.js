import * as tools from "./tools.js";
import {showNotification} from "./tools.js";

const {clipboard, ipcRenderer, shell} = require('electron');

let lastClicked = null;

// TODO: Comment
document.onclick = function (e) {
    lastClicked = e.target;
}

// TODO: Comment
tools.bindEvent("click", ".input .add-button:not([aria-disabled='true'])", function () {
    tools.addLinkToList(this);
});

// TODO: Comment
tools.bindEvent("click", ".listBox:not([aria-disabled='true']) li", function (e) {
    let listBox = this.closest(".listBox");
    let actives = listBox.querySelectorAll("li.active");

    if (!e.ctrlKey && !e.shiftKey) {
        for (let active of actives) {
            if (active !== this) active.classList.remove("active");
        }
    }

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
        if (this.classList.contains("active")) this.classList.remove("active");
        else this.classList.add("active");
    }
});

// TODO: Comment
tools.bindEvent("click", ".listBox .delete-button:not([aria-disabled='true'])", function () {
    tools.removeActiveListItems();
});

// TODO: Comment
tools.bindEvent("click", ".input .paste-button:not([aria-disabled='true'])", function () {
    let input = this.closest(".input").querySelector("input");
    input.value = clipboard.readText();

    tools.addLinkToList(this);
});

// TODO: Comment
tools.bindEvent("click", "#updateNotification .close-button", function () {
    let notification = document.getElementById("updateNotification");
    notification.classList.add('hidden');
});

// TODO: Comment
tools.bindEvent("click", "#updateNotification .restart-button", function () {
    ipcRenderer.send('restart_app');
});

// TODO: Comment
tools.bindEvent("keydown", ".input input:not([aria-disabled='true'])", function (e) {
    if (e.code === "Enter") {
        tools.addLinkToList(this);
    }
});

/*
 * Funktion: Anonym
 * Autor: Bernardo de Oliveira
 *
 * Ändert das Design-Attribut und ändert somit auch das Design
 */
tools.bindEvent("click", ".theme-toggler", function () {
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
tools.bindEvent("click", ".startAbort .start-button:not([aria-disabled='true'])", async function () {
    let listBox = document.getElementsByClassName("listBox")[0];
    let mode = document.querySelector("#settings .mode .select");
    let codec = document.querySelector("#settings .codec .select");
    let quality = document.querySelector("#settings .quality .select");
    let location = document.querySelector(".location #location");

    let items = listBox.querySelectorAll("li");

    if (!items.length) {
        showNotification(tools.languageDB[tools.selectedLang]["js"]["noURLs"]);
        return;
    }

    if (!mode.getAttribute("data-value")) {
        showNotification(tools.languageDB[tools.selectedLang]["js"]["downloadMode"]);
        return;
    } else if (mode.getAttribute("data-value") === "audio") {
        if (!codec.getAttribute("data-value")) {
            showNotification(tools.languageDB[tools.selectedLang]["js"]["codec"]);
            return;
        }

        if (!quality.getAttribute("data-value")) {
            showNotification(tools.languageDB[tools.selectedLang]["js"]["quality"]);
            return;
        } else {
            switch (quality.getAttribute("data-value")) {
                case "best":
                    quality = 0;
                    break;
                case "medium":
                    quality = 5;
                    break;
                case "worst":
                    quality = 9;
                    break;
            }
        }
    }

    if (!location.value) {
        showNotification(tools.languageDB[tools.selectedLang]["js"]["storageLocation"]);
        return;
    }

    tools.setDisabled();
    ipcRenderer.send('set_percentage', 0);

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
            let urls = await tools.getPlaylistUrls(item.textContent);
            count += urls.length;
            allUrls = [...allUrls, ...urls];
        } else {
            count++;
            allUrls.push(item.textContent);
        }
    }

    let percentage = Math.floor(100 / count * 100) / 100;
    let aborted = false;
    for (let url of allUrls) {
        let success = false;

        if (!url.includes("netflix")) {
            success = await tools.downloadYTURL(
                mode.getAttribute("data-value"),
                location.value,
                url,
                percentage,
                codec.getAttribute("data-value"),
                quality,
                tools.playlistCount
            );
        } else {
            success = await tools.downloadNFURL(
            );
        }

        if (!success) {
            aborted = true;
            break;
        }
    }

    tools.setEnabled();
    if (!aborted) {
        ipcRenderer.send('show_notification', tools.languageDB[tools.selectedLang]["js"]["success"], tools.languageDB[tools.selectedLang]["js"]["songsDownloaded"]);
    } else {
        showNotification(tools.languageDB[tools.selectedLang]["js"]["downloadAborted"]);
    }
});

// TODO: Comment
tools.bindEvent("click", ".startAbort .abort-button:not([aria-disabled='true'])", function () {
    tools.abortDownload();
    tools.getChildProcessRecursive(tools.childProcess.pid).then(function (pids) {
        pids = pids.reverse();
        for (let pid of pids) {
            ipcRenderer.send("kill_pid", Number(pid));
        }
        ipcRenderer.send("kill_pid", tools.childProcess.pid);
    });
    tools.setEnabled();
});

// TODO: Comment
tools.bindEvent("click", ".location .search-button:not([aria-disabled='true'])", function () {
    ipcRenderer.send('open_file_dialog');
});

// TODO: Comment
tools.bindEvent("click", ".location .location-button:not([aria-disabled='true'])", function () {
    let location = document.querySelector(".location #location");

    if (location.value) shell.openPath(location.value);
});

// TODO: Comment
tools.bindEvent("click", "#settings-open", function () {
    let settings = document.getElementById("settings");
    let body = document.getElementsByTagName("body")[0];

    body.style.overflow = "hidden";
    settings.style.display = "initial";
    settings.animateCallback([
        {top: "100%"},
        {top: "0%"}
    ], {
        duration: 200,
        fill: "forwards"
    }, function () {
        body.style.overflow = "";
    });
});

// TODO: Comment
ipcRenderer.on('selected_file', function (event, path) {
    let location = document.querySelector(".location #location");
    let locationButton = document.querySelector(".location .location-button");

    location.value = path;
    locationButton.ariaDisabled = "false";
});

// TODO: Comment
document.addEventListener("keydown", function (e) {
    if (e.code === "Delete") {
        tools.removeActiveListItems();
    }


    if (e.code === "KeyA" && e.ctrlKey && lastClicked.closest(".listBox") !== null) {
        let items = document.querySelectorAll(".listBox li");

        for (let item of items) {
            item.classList.add("active");

        }

        setTimeout(function () {
            document.getSelection().removeAllRanges();
        });
    }
});

// TODO: Comment
window.onload = async function () {
    const title = document.getElementsByTagName("title")[0];

    ipcRenderer.send('app_version');
    ipcRenderer.on('app_version', (event, arg) => {
        ipcRenderer.removeAllListeners('app_version');
        title.textContent += " " + arg.version;
    });

    ipcRenderer.send('dir_name');
    ipcRenderer.on('dir_name', (event, dirname) => {
        tools.setRealDir(dirname);
    });

    await tools.loadLanguage();
    tools.loadSettings();

    const notification = document.getElementById('updateNotification');
    const message = notification.querySelector(".message");
    const restartButton = notification.querySelector('.restart-button');

    ipcRenderer.on('update_available', () => {
        ipcRenderer.removeAllListeners('update_available');
        message.innerText = tools.languageDB[tools.selectedLang]["js"]["newVersiosettingsSavedn"];
        notification.classList.remove('hidden');
    });

    ipcRenderer.on('update_downloaded', () => {
        ipcRenderer.removeAllListeners('update_downloaded');
        message.innerText = tools.languageDB[tools.selectedLang]["js"]["updateDownloaded"];
        restartButton.classList.remove('hidden');
        notification.classList.remove('hidden');
    });

    tools.setThemeIcon();
}