import * as tools from "./tools.js";
import {showNotification} from "./tools.js";

const {clipboard, ipcRenderer, shell} = require('electron');

let theme = tools.getCookie("theme");
if (!theme) theme = "light";
document.getElementsByTagName("html")[0].setAttribute("data-theme", theme);

// TODO: Comment
tools.bindEvent("click", ".input .add-button:not([aria-disabled='true'])", function () {
    tools.addLinkToList(this);
});

// TODO: Comment
tools.bindEvent("click", ".listBox:not([aria-disabled='true']) li", function (e) {
    if (!e.ctrlKey) {
        let actives = this.closest(".listBox").querySelectorAll("li.active");
        for (let active of actives)
            active.classList.remove("active");
    }

    if (this.classList.contains("active")) {
        this.classList.remove("active");
    } else {
        this.classList.add("active");
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
    tools.closeNotification();
});

// TODO: Comment
tools.bindEvent("click", "#updateNotification .restart-button", function () {
    tools.restartApp();
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
tools.bindEvent("click", "#theme-toggler", function () {
    let html = document.getElementsByTagName("html")[0], icon = this.querySelector("svg");

    if (html.getAttribute("data-theme") === "dark") {
        html.setAttribute("data-theme", "light");

        icon.classList.remove("fa-sun");
        icon.classList.add("fa-moon");

        theme = "light";
        tools.setCookie("theme", "light");
    } else {
        html.setAttribute("data-theme", "dark");

        icon.classList.remove("fa-moon");
        icon.classList.add("fa-sun");

        theme = "dark";
        tools.setCookie("theme", "dark");
    }
});

// TODO: Comment
tools.bindEvent("click", ".select:not([aria-disabled='true']) .head", function () {
    tools.selectClick(this);
});

// TODO: Comment
tools.bindEvent("click", ".select#mode .option", function () {
    let value = this.getAttribute("data-value");

    let quality = document.querySelector(".options .quality");
    let codec = document.querySelector(".options .codec");

    if (value === "audio") {
        quality.style.display = "inline-block";
        codec.style.display = "inline-block";
    } else {
        quality.style.display = "";
        codec.style.display = "";
    }
});

// TODO: Comment
tools.bindEvent("click", ".select:not([aria-disabled='true']) .option", function () {
    let select = this.closest(".select");
    let button = select.querySelector(".button");

    let selected = select.querySelector("[aria-selected='true']");
    selected.ariaSelected = "false";
    this.ariaSelected = "true";

    button.textContent = this.textContent;
    select.setAttribute("data-value", this.getAttribute("data-value"));

    tools.selectClick(this);
});

// TODO: Comment
tools.bindEvent("click", ".startAbort .start-button:not([aria-disabled='true'])", async function () {
    let listBox = document.getElementsByClassName("listBox")[0];
    let mode = document.querySelector(".mode .select");
    let codec = document.querySelector(".codec .select");
    let quality = document.querySelector(".quality .select");
    let location = document.querySelector(".location #location");

    let items = listBox.querySelectorAll("li");

    if (!items.length) {
        showNotification("Sie haben keine URLs eingegeben");
        return;
    }

    if (!mode.getAttribute("data-value")) {
        showNotification("Sie haben keinen Download-Modus ausgewählt");
        return;
    } else if (mode.getAttribute("data-value") === "audio") {
        if (!codec.getAttribute("data-value")) {
            showNotification("Sie haben keinen Codec ausgewählt");
            return;
        }

        if (!quality.getAttribute("data-value")) {
            showNotification("Sie haben keine Qualität ausgewählt");
            return;
        } else {
            switch (quality.getAttribute("data-value")) {
                case "best":
                    quality = 9;
                    break;
                case "medium":
                    quality = 5;
                    break;
                case "worst":
                    quality = 1;
                    break;
            }
        }
    }

    if (!location.value) {
        showNotification("Sie haben keinen Speicherort angegeben");
        return;
    }

    tools.setDisabled();

    let progressTotal = document.querySelector(".progress-total progress");
    let infoTotal = document.querySelector(".progress-total .info p");
    let progressSong = document.querySelector(".progress-song progress");
    let infoSong = document.querySelector(".progress-song .info p");

    progressTotal.value = 0;
    progressSong.value = 0;
    infoTotal.textContent = "0%";
    infoSong.textContent = "0%";

    let count = 0;
    for (let item of items) {
        if (item.textContent.includes("playlist?list="))
            count += await tools.checkPlaylistCount(item.textContent);
        else count++;
    }

    let percentage = Math.floor(100 / count * 100) / 100;
    let aborted = false;
    for (let i = 0; i < items.length;) {
        let item = items[i];

        let success = await tools.downloadURL(
            mode.getAttribute("data-value"),
            location.value,
            item.textContent,
            percentage,
            codec.getAttribute("data-value"),
            quality,
            tools.playlistCount
        );

        if (success) {
            i++;
        } else {
            aborted = true;
            break;
        }
    }

    tools.setEnabled();
    if (!aborted) {
        ipcRenderer.send('show_notification', "Erfolg", "Alle Lieder wurden erfolgreich heruntergeladen");
    } else {
        showNotification("Das Herunterladen wurde erfolgreich abgebrochen.");
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
ipcRenderer.on('selected_file', function (event, path) {
    let location = document.querySelector(".location #location");
    let locationButton = document.querySelector(".location .location-button");

    location.value = path;
    locationButton.ariaDisabled = "false";
})

// TODO: Comment
document.addEventListener("keydown", function (e) {
    if (e.code === "Delete") {
        tools.removeActiveListItems();
    }
});

// TODO: Comment
window.onload = function () {
    const title = document.getElementsByTagName("title")[0];

    ipcRenderer.send('app_version');
    ipcRenderer.on('app_version', (event, arg) => {
        ipcRenderer.removeAllListeners('app_version');
        title.textContent += " " + arg.version;
    });

    const notification = document.getElementById('updateNotification');
    const message = notification.querySelector(".message");
    const restartButton = notification.querySelector('.restart-button');

    ipcRenderer.on('update_available', () => {
        ipcRenderer.removeAllListeners('update_available');
        message.innerText = 'Eine neue Version ist verfügbar und wird heruntergeladen..';
        notification.classList.remove('hidden');
    });

    ipcRenderer.on('update_downloaded', () => {
        ipcRenderer.removeAllListeners('update_downloaded');
        message.innerText = 'Aktualisierung heruntergeladen. Applikation jetzt neu starten, um die Änderungen zu übernehmen.';
        restartButton.classList.remove('hidden');
        notification.classList.remove('hidden');
    });

    let interval = setInterval(function () {
        let toggler = document.getElementById("theme-toggler");

        if (toggler) {
            let icon = toggler.querySelector("svg");

            if (icon) {
                if (theme === "light") icon.classList.add("fa-moon");
                else icon.classList.add("fa-sun");

                clearInterval(interval);
            }
        }
    }, 50);
}