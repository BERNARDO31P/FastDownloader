import * as tools from "../tools.js";
import {showNotification} from "../tools.js";

const {ipcRenderer} = require("electron");

/**
 * Update a scroll shadow while preserving its state at exactly 10 pixels.
 */
function updateScrollShadow(element, position) {
    if (!element) {
        return;
    }

    if (position > 10 && !element.classList.contains("shadow")) {
        element.classList.add("shadow");
    } else if (position < 10 && element.classList.contains("shadow")) {
        element.classList.remove("shadow");
    }
}

setTimeout(() => {
    // Settings are loaded dynamically, so resolve the navigation on each scroll.
    document.body.addEventListener("scroll", () => {
        updateScrollShadow(document.querySelector("settings #nav"), window.scrollY);
    }, {passive: true});

    const info = document.querySelector("body #info");
    const dynamic = info && info.querySelector("#dynamic");
    const shadow = info && info.querySelector("#static");

    if (dynamic) {
        dynamic.addEventListener("scroll", () => {
            updateScrollShadow(shadow, dynamic.scrollTop);
        }, {passive: true});
    }
}, 1000);

/**
 * Toggle a checkbox and update its translated on/off label.
 */
function toggleCheckbox(checkbox, name) {
    const enabled = checkbox.classList.toggle("active");
    const container = checkbox.closest("." + name);

    container.querySelector("span").textContent =
        tools.languageDB["js"][enabled ? "on" : "off"];

    return enabled;
}

/**
 * Enable or disable saving settings before showing the notification.
 */
tools.bindEvent("click", "settings .save .checkbox", function () {
    const enabled = toggleCheckbox(this, "save");

    if (enabled) {
        tools.saveSettings();
    } else {
        tools.deleteSettings();
    }

    showNotification(
        tools.languageDB["js"][enabled ? "settingsSaved" : "settingsAborted"]
    );
});

const checkboxSettings = [
    {name: "startMinimized"},
    {
        name: "closeToTray",
        enableChannel: "enableCloseToTray",
        disableChannel: "disableCloseToTray"
    },
    {name: "clearList"},
    {name: "saveLocation"},
    {name: "premium"},
    {
        name: "autostart",
        enableChannel: "enableAutostart",
        disableChannel: "disableAutostart"
    }
];

/**
 * Apply each checkbox immediately, then persist settings as before.
 */
for (const setting of checkboxSettings) {
    tools.bindEvent("click", "settings ." + setting.name + " .checkbox", function () {
        const enabled = toggleCheckbox(this, setting.name);
        const channel = enabled ? setting.enableChannel : setting.disableChannel;

        if (channel) {
            ipcRenderer.send(channel);
        }

        showNotification(
            tools.languageDB["js"][setting.name + (enabled ? "Enabled" : "Disabled")]
        );

        tools.saveSettings();
    });
}

/**
 * Close the settings panel using its existing animation.
 */
tools.bindEvent("click", "#settings-close:not([aria-disabled=\"true\"])", () => {
    const settings = document.getElementsByTagName("settings")[0];
    const nav = settings.querySelector("#nav");

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
        nav.classList.remove("static");
    });
});

/**
 * Apply a selected option, persist settings, then close the dropdown.
 */
tools.bindEvent("click", "settings .select .option:not([aria-disabled=\"true\"])", function () {
    tools.selectOption(this);
    if (this.closest(".select")?.id === "threads") {
        tools.setDownloadConcurrency(this.getAttribute("data-value"));
    }
    tools.saveSettings();
    tools.selectClick(this);
});

/**
 * Save the selected language and current list before restarting.
 */
tools.bindEvent("click", ".lang .select .option:not([aria-disabled=\"true\"])", function () {
    const lang = this.getAttribute("data-value");

    tools.setCookie("lang", lang);
    tools.getAllData();
    ipcRenderer.send("restart");
});

/**
 * Close another open dropdown before toggling the clicked one.
 */
tools.bindEvent("click", ".select:not([aria-disabled=\"true\"]) .head", function () {
    const active = document.querySelector(".select.active");
    const select = this.closest(".select");

    if (active && select !== active) {
        tools.hideSelect(active);
    }

    tools.selectClick(this);
});

/**
 * Open the changelog.
 */
tools.bindEvent("click", "#info-open", () => {
    tools.showChangelog();
});