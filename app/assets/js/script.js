import * as tools from "./tools.js";

const {clipboard} = require('electron');

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
document.addEventListener("keydown", function (e) {
    if (e.code === "Delete") {
        tools.removeActiveListItems();
    }
});

// TODO: Comment
window.onload = function () {
    const {ipcRenderer} = require('electron');
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
        message.innerText = 'A new update is available. Downloading now...';
        notification.classList.remove('hidden');
    });

    ipcRenderer.on('update_downloaded', () => {
        ipcRenderer.removeAllListeners('update_downloaded');
        message.innerText = 'Update Downloaded. It will be installed on restart. Restart now?';
        restartButton.classList.remove('hidden');
        notification.classList.remove('hidden');
    });
}