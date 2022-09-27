import * as tools from "../tools.js";
import {showNotification} from "../tools.js";

const {ipcRenderer} = require('electron');

let body = document.getElementsByTagName("body")[0];

setTimeout(function () {
    let settings = document.getElementsByTagName("settings")[0];
    let nav = settings.querySelector("#nav");

    body.onscroll = function () {
        if (window.scrollY > 10 && !nav.classList.contains("shadow")) {
            nav.classList.add("shadow");
            nav.classList.add("static");
        } else if (window.scrollY < 10 && nav.classList.contains("shadow")) {
            nav.classList.remove("shadow");
            nav.classList.remove("static");
        }
    }
}, 500);


// TODO: Comment
tools.bindEvent("click", "settings .artistName .checkbox", function () {
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
tools.bindEvent("click", "settings .save .checkbox", function () {
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
tools.bindEvent("click", "settings .closeToTray .checkbox", function (){
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

// TODO: Comment
tools.bindEvent("click", "settings .premium .checkbox", function () {
    let premium = this.closest(".premium");

    if (this.classList.contains("active")) {
        this.classList.remove("active");
        premium.querySelector("span").textContent = tools.languageDB[tools.selectedLang]["js"]["off"];

        showNotification(tools.languageDB[tools.selectedLang]["js"]["premiumDisabled"]);
    } else {
        this.classList.add("active");
        premium.querySelector("span").textContent = tools.languageDB[tools.selectedLang]["js"]["on"];

        showNotification(tools.languageDB[tools.selectedLang]["js"]["premiumEnabled"]);
    }

    tools.saveSettings();
});

// TODO: Comment
tools.bindEvent("click", "settings .autostart .checkbox", function () {
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
    let settings = document.getElementsByTagName("settings")[0];
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
tools.bindEvent("click", "settings .select .option:not([aria-disabled='true'])", function () {
    tools.selectOption(this);

    tools.saveSettings();
    tools.selectClick(this);
});

// TODO: Comment
tools.bindEvent("click", ".lang .select .option:not([aria-disabled='true'])", async function () {
    let lang = this.getAttribute("data-value");
    tools.setCookie("lang", lang);
    tools.getAllData();

    ipcRenderer.send('restart');
});

// TODO: Comment
tools.bindEvent("click", ".select:not([aria-disabled='true']) .head", function () {
    let active = document.querySelector(".select.active");
    let select = this.closest(".select");
    let clicked = this;
    if (active && select !== active) tools.hideSelect(active);

    tools.selectClick(clicked);
});