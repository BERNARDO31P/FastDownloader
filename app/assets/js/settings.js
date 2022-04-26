import * as tools from "./tools.js";
import {showNotification} from "./tools.js";

let hiddenElements = [];

tools.bindEvent("click", "#settings .save .checkbox", function () {
    if (this.classList.contains("active")) {
        this.classList.remove("active");
        tools.deleteSettings();

        showNotification(tools.languageDB[tools.selectedLang]["js"]["settingsAborted"]);
    } else {
        this.classList.add("active");
        tools.saveSettings();

        showNotification(tools.languageDB[tools.selectedLang]["js"]["settingsSaved"]);
    }
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
tools.bindEvent("click", ".select .option:not([aria-disabled='true'])", function () {
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
    await tools.loadLanguage();
    tools.setThemeIcon();
    tools.loadSettings();

    tools.loadAllData();
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