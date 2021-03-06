import * as tools from "./tools.js";
import {showNotification} from "./tools.js";

const {ipcRenderer} = require('electron');

let hiddenElements = [];


// TODO: Comment
tools.bindEvent("click", "#settings .artistName .checkbox", function () {
    let artistNaming = this.closest(".artistName");

    if (this.classList.contains("active")) {
        this.classList.remove("active");
        artistNaming.querySelector("span").textContent = tools.languageDB[tools.selectedLang]["js"]["off"];

        tools.setArtistName(false);

        showNotification(tools.languageDB[tools.selectedLang]["js"]["artistNameDisabled"]);
    } else {
        this.classList.add("active");
        artistNaming.querySelector("span").textContent = tools.languageDB[tools.selectedLang]["js"]["on"];

        tools.setArtistName(true);

        showNotification(tools.languageDB[tools.selectedLang]["js"]["artistNameEnabled"]);
    }

    tools.saveSettings();
});

// TODO: Comment
tools.bindEvent("click", "#settings .save .checkbox", function () {
    let saving = this.closest(".save");

    if (this.classList.contains("active")) {
        this.classList.remove("active");
        saving.querySelector("span").textContent = tools.languageDB[tools.selectedLang]["js"]["off"];

        tools.deleteSettings();

        showNotification(tools.languageDB[tools.selectedLang]["js"]["settingsAborted"]);
    } else {
        this.classList.add("active");
        saving.querySelector("span").textContent = tools.languageDB[tools.selectedLang]["js"]["on"];

        tools.saveSettings();

        showNotification(tools.languageDB[tools.selectedLang]["js"]["settingsSaved"]);
    }
});

// TODO: Comment
tools.bindEvent("click", "#settings .closeToTray .checkbox", function (){
    let closingToTray = this.closest(".closeToTray");

    if (this.classList.contains("active")) {
        this.classList.remove("active");
        closingToTray.querySelector("span").textContent = tools.languageDB[tools.selectedLang]["js"]["off"];

        ipcRenderer.send("disableCloseToTray");

        showNotification(tools.languageDB[tools.selectedLang]["js"]["closeToTrayDisabled"]);
    } else {
        this.classList.add("active");
        closingToTray.querySelector("span").textContent = tools.languageDB[tools.selectedLang]["js"]["on"];

        ipcRenderer.send("enableCloseToTray");

        showNotification(tools.languageDB[tools.selectedLang]["js"]["closeToTrayEnabled"]);
    }

    tools.saveSettings();
});

// TODO: Comment & implement
tools.bindEvent("click", "#settings .autostart .checkbox", function () {
    let autostarting = this.closest(".autostart");

    if (this.classList.contains("active")) {
        this.classList.remove("active");
        autostarting.querySelector("span").textContent = tools.languageDB[tools.selectedLang]["js"]["off"];

        ipcRenderer.send("disableAutostart");

        showNotification(tools.languageDB[tools.selectedLang]["js"]["autostartDisabled"]);
    } else {
        this.classList.add("active");
        autostarting.querySelector("span").textContent = tools.languageDB[tools.selectedLang]["js"]["on"];

        ipcRenderer.send("enableAutostart");

        showNotification(tools.languageDB[tools.selectedLang]["js"]["autostartEnabled"]);
    }

    tools.saveSettings();
});

// TODO: Comment
tools.bindEvent("click", "#settings-close", function () {
    let settings = document.getElementById("settings");
    let body = document.getElementsByTagName("body")[0];

    body.style.overflow = "hidden";
    settings.animateCallback([
        {top: "0%"},
        {top: "100%"}
    ], {
        duration: 200,
        fill: "forwards"
    }, function () {
        body.style.overflow = "";
        settings.style.display = "";
    });
});

// TODO: Comment
tools.bindEvent("click", "#settings .select .option:not([aria-disabled='true'])", function () {
    tools.selectOption(this);

    for (let element of hiddenElements) {
        element.style.opacity = "1";
        element.style.pointerEvents = "";
    }
    hiddenElements = [];

    tools.saveSettings();
    tools.selectClick(this);
});

// TODO: Comment
tools.bindEvent("click", ".lang .select .option:not([aria-disabled='true'])", async function () {
    let lang = this.getAttribute("data-value");
    tools.setCookie("lang", lang);

    tools.getAllData();
    await tools.loadMenu();
    tools.loadAllData()
});

// TODO: Comment
tools.bindEvent("click", ".select:not([aria-disabled='true']) .head", function () {
    let active = document.querySelector(".select.active");
    let select = this.closest(".select");
    let clicked = this;
    if (active && select !== active) tools.hideSelect(active);

    if (!select.classList.contains("active")) {
        let nextElement = select.parentElement;
        let height = 0;

        let interval = setInterval(function () {
            nextElement = nextElement.nextElementSibling;
            if (nextElement) {
                let rect = nextElement.getBoundingClientRect();
                let style = getComputedStyle(nextElement);

                height += rect.height;

                if (style.opacity !== "0")
                    hiddenElements.push(nextElement);

                if (height > 100) {
                    clearInterval(interval);
                    for (let element of hiddenElements) {
                        element.style.opacity = "0";
                        element.style.pointerEvents = "none";
                    }

                    tools.selectClick(clicked);
                }
            } else {
                clearInterval(interval);
                for (let element of hiddenElements) {
                    element.style.opacity = "0";
                    element.style.pointerEvents = "none";
                }

                tools.selectClick(clicked);
            }
        }, 50);
    } else {
        for (let element of hiddenElements) {
            element.style.opacity = "1";
            element.style.pointerEvents = "";
        }

        hiddenElements = [];
        tools.selectClick(clicked);
    }
});