const {ipcRenderer, shell} = require("electron");

import * as tools from "./tools.js";

function requestMain(channel) {
    return new Promise((resolve) => {
        // Register before sending so even a fast reply is received.
        ipcRenderer.once(channel, (event, value) => resolve(value));
        ipcRenderer.send(channel);
    });
}

// TODO: Comment
window.onload = async () => {
    const title = document.getElementsByTagName("title")[0];
    const pendingUpdates = [];
    let initialized = false;

    const applyWhenReady = (callback) => {
        if (initialized) {
            callback();
        } else {
            pendingUpdates.push(callback);
        }
    };

    // Capture update events during initialization, then apply them to the UI.
    ipcRenderer.once("update_available", (event, version) => {
        applyWhenReady(() => {
            const notification = document.getElementById("updateNotification");
            notification.querySelector(".message").innerText =
                tools.languageDB["js"]["newVersion"].replaceAll("XXX", version);
            notification.classList.remove("hidden");
        });
    });

    ipcRenderer.once("app_upto_date", () => {
        applyWhenReady(() => {
            ipcRenderer.send("app_upto_date");
            tools.updateYtDl();
        });
    });

    ipcRenderer.once("update_downloaded", () => {
        applyWhenReady(() => {
            const notification = document.getElementById("updateNotification");
            notification.querySelector(".message").innerText =
                tools.languageDB["js"]["updateDownloaded"];
            notification.querySelector(".restart-button").classList.remove("hidden");
            notification.classList.remove("hidden");
        });
    });

    requestMain("app_version").then((arg) => {
        title.textContent += " " + arg.version;
    });

    const dirname = await requestMain("dir_name");
    tools.setRealDir(dirname);

    await tools.initialize();

    const location = document.querySelector(".location #location");
    const locationButton = document.querySelector(".location .location-button");

    if (tools.getCookie("saveLocation")) {
        location.value = tools.getCookie("lastLocation");
        locationButton.ariaDisabled = "false";
    }

    if (tools.getCookie("cache") !== null) {
        tools.loadAllData(location);
    }

    if (tools.getCookie("closeToTray")) {
        ipcRenderer.send("enableCloseToTray");
    }

    if (tools.getCookie("startMinimized")) {
        ipcRenderer.send("startMinimized");
    }

    initialized = true;

    for (const applyUpdate of pendingUpdates) {
        applyUpdate();
    }

    ipcRenderer.send("lang", tools.languageDB["tray"]);
};

// TODO: Comment
tools.bindEvent("click", "button[data-href],a[data-href]", function () {
    shell.openExternal(this.getAttribute("data-href"));
});

// TODO: Comment
tools.bindEvent("click", "a[href]", function (e) {
    e.preventDefault();
});

// TODO: Comment
tools.bindEvent("click", "#info-close", () => {
    const info = document.getElementById("info");

    info.classList.remove("show");
    document.body.style.overflow = "";
});