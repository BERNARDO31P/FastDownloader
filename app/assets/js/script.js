import * as tools from "./tools.js";
import {showNotification} from "./tools.js";

const {clipboard, ipcRenderer, shell} = require('electron');

let theme = tools.getCookie("theme");
if (!theme) theme = "light";
document.getElementsByTagName("html")[0].setAttribute("data-theme", theme);

// TODO: Comment
tools.bindEvent("click", ".input .add-button", function () {
    tools.addLinkToList(this);
});

// TODO: Comment
tools.bindEvent("click", ".listBox li", function (e) {
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
tools.bindEvent("click", ".listBox .delete-button", function () {
    tools.removeActiveListItems();
});

// TODO: Comment
tools.bindEvent("click", ".input .paste-button", function () {
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
tools.bindEvent("keydown", ".input input", function (e) {
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
tools.bindEvent("click", ".select .head", function () {
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
tools.bindEvent("click", ".select .option:not([aria-disabled='true'])", function () {
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
tools.bindEvent("click", ".startAbort .start-button", function () {
    let listBox = document.getElementsByClassName("listBox")[0];
    let mode = document.querySelector(".mode .select");
    let codec = document.querySelector(".codec .select");
    let quality = document.querySelector(".quality .select");
    let location = document.querySelector(".location #location");

    let items = listBox.querySelectorAll("li");
    let percentage = Math.floor(100 / items.length * 100) / 100;

    for (let item of items) {
        tools.generateShellCommand(
            mode.getAttribute("data-value"),
            location.value,
            item.textContent,
            percentage,
            codec.getAttribute("data-value"),
            quality.getAttribute("data-value")
        );
    }
});

// TODO: Comment
tools.bindEvent("click", ".startAbort .abort-button", function () {

});

// TODO: Comment
tools.bindEvent("click", ".location .search-button", function () {
    ipcRenderer.send('open_file_dialog');
});

// TODO: Comment
tools.bindEvent("click", ".location .location-button:not(.disabled)", function () {
    let location = document.querySelector(".location #location");

    if (location.value) shell.openPath(location.value);
});

// TODO: Comment
ipcRenderer.on('selected_file', function (event, path) {
    let location = document.querySelector(".location #location");
    let locationButton = document.querySelector(".location .location-button");

    location.value = path;
    locationButton.classList.remove("disabled");
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