const {ipcRenderer, shell} = require('electron');
import * as tools from "./tools.js";

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

    await tools.initialize();

    if (tools.getCookie("cache") !== null) tools.loadAllData();

    const notification = document.getElementById('updateNotification');
    const message = notification.querySelector(".message");
    const restartButton = notification.querySelector('.restart-button');

    ipcRenderer.on('update_available', () => {
        ipcRenderer.removeAllListeners('update_available');
        message.innerText = tools.languageDB[tools.selectedLang]["js"]["newVersion"];
        notification.classList.remove('hidden');
    });

    ipcRenderer.on('update_downloaded', () => {
        ipcRenderer.removeAllListeners('update_downloaded');
        message.innerText = tools.languageDB[tools.selectedLang]["js"]["updateDownloaded"];
        restartButton.classList.remove('hidden');
        notification.classList.remove('hidden');
    });

    ipcRenderer.send("lang", tools.selectedLang ?? tools.getCookie("lang") ?? "en", tools.languageDB[tools.selectedLang]["tray"]);
}

// TODO: Comment
tools.bindEvent("click", "button[data-href]", function () {
    shell.openExternal(this.getAttribute("data-href"));
})