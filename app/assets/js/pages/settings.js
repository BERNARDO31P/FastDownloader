import * as tools from "../tools.js";
import {showNotification} from "../tools.js";

const {ipcRenderer} = require("electron");

setTimeout( () => {
    let nav = document.querySelector("settings #nav");
    let info = document.querySelector("body #info");

    let dynamic = info.querySelector("#dynamic");
    let shadow = info.querySelector("#static");

    document.body.onscroll = () => {
        if (window.scrollY > 10 && !nav.classList.contains("shadow")) {
            nav.classList.add("shadow");
        } else if (window.scrollY < 10 && nav.classList.contains("shadow")) {
            nav.classList.remove("shadow");
        }
    }

    dynamic.onscroll = () => {
        if (dynamic.scrollTop > 10 && !shadow.classList.contains("shadow")) {
            shadow.classList.add("shadow");
        } else if (dynamic.scrollTop < 10 && shadow.classList.contains("shadow")) {
            shadow.classList.remove("shadow");
        }
    }
}, 1000);

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
tools.bindEvent("click", "settings .closeToTray .checkbox", function () {
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
tools.bindEvent("click", "settings .clearList .checkbox", function () {
    let clearList = this.closest(".clearList");

    if (this.classList.contains("active")) {
        this.classList.remove("active");
        clearList.querySelector("span").textContent = tools.languageDB[tools.selectedLang]["js"]["off"];

        showNotification(tools.languageDB[tools.selectedLang]["js"]["clearListDisabled"]);
    } else {
        this.classList.add("active");
        clearList.querySelector("span").textContent = tools.languageDB[tools.selectedLang]["js"]["on"];

        showNotification(tools.languageDB[tools.selectedLang]["js"]["clearListEnabled"]);
    }

    tools.saveSettings();
})

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
tools.bindEvent("click", "#settings-close:not([aria-disabled='true'])", () => {
    let settings = document.getElementsByTagName("settings")[0];
    let nav = settings.querySelector("#nav");

    nav.classList.remove("static");
    document.body.style.overflow = "hidden";

    settings.animateCallback([
        {top: "0%"},
        {top: "100%"}
    ], {
        duration: 200,
        fill: "forwards"
    }, () => {
        document.body.style.overflow = "";
        settings.style.display = "";

        let nav = document.querySelector("settings #nav");
        nav.classList.remove("static");
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

    ipcRenderer.send("restart");
});

// TODO: Comment
tools.bindEvent("click", ".select:not([aria-disabled='true']) .head", function () {
    let active = document.querySelector(".select.active");
    let select = this.closest(".select");
    let clicked = this;
    if (active && select !== active) tools.hideSelect(active);

    tools.selectClick(clicked);
});

// TODO: Comment
tools.bindEvent("click", "#info-open", () => {
    tools.showChangelog();
});