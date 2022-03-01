import * as tools from "./tools.js";
import {showNotification} from "./tools.js";

let hiddenElements = [];

tools.bindEvent("click", "#settings .save .checkbox", function () {
    if (this.classList.contains("active")) {
        this.classList.remove("active");
        tools.deleteSettings();

        showNotification("Die Einstellungen werden nicht mehr gespeichert");
    } else {
        this.classList.add("active");
        tools.saveSettings();

        showNotification("Die Einstellungen werden ab jetzt gespeichert");
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
tools.bindEvent("click", ".select:not([aria-disabled='true']) .option", function () {
    tools.selectOption(this);

    for (let element of hiddenElements) {
        element.style.display = "block";
    }
    hiddenElements = [];

    tools.saveSettings();
    tools.selectClick(this);
});

// TODO: Comment
tools.bindEvent("click", ".select#mode .option", function () {
    tools.toggleVisibility();
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

                if (style.display !== "none")
                    hiddenElements.push(nextElement);

                if (height > 100) {
                    clearInterval(interval);
                    for (let element of hiddenElements) {
                        element.style.display = "none";
                    }

                    tools.selectClick(clicked);
                }
            } else {
                clearInterval(interval);
                for (let element of hiddenElements) {
                    element.style.display = "none";
                }

                tools.selectClick(clicked);
            }
        }, 50);
    } else {
        for (let element of hiddenElements) {
            element.style.display = "block";
        }

        hiddenElements = [];
        tools.selectClick(clicked);
    }
});