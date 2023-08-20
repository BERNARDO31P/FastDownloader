const {
    app,
    BrowserWindow,
    ipcMain,
    dialog,
    Notification,
    screen,
    Menu,
    Tray,
    MenuItem,
    clipboard
} = require("electron");
const {autoUpdater} = require("electron-updater");
const AutoLaunch = require("auto-launch");
const path = require("path");
const fs = require("fs");

let autoLauncher = null;

const replacement = new RegExp([
    path.sep + "resources" + path.sep + "app.asar",
    path.sep + "app.asar",
    path.sep + "resources"
].join("|"), "gi");
__dirname = __dirname.replaceAll(replacement, "");

let iconDir = null;
if (fs.existsSync(__dirname + path.sep + "resources")) {
    iconDir = __dirname + path.sep + "resources" + path.sep + "icons";
} else if (fs.existsSync(__dirname + path.sep + "icons")) {
    iconDir = __dirname + path.sep + "icons";
}

let win = null, trayIcon = null, trayMenu = Menu.buildFromTemplate([]);
let lang = null, hidden = false;
let language = {};

function createWindow() {
    const {getCursorScreenPoint, getDisplayNearestPoint} = screen;
    const currentScreen = getDisplayNearestPoint(getCursorScreenPoint());

    win = new BrowserWindow({
        icon: (iconDir) ? path.join(iconDir, "256x256.png") : null,
        minWidth: 900,
        minHeight: 580,
        x: currentScreen.workArea.x,
        y: currentScreen.workArea.y,
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: true,
            nodeIntegrationInWorker: true,
            nodeIntegrationInSubFrames: true,
            contextIsolation: false
        }
    });

    win.center();
    win.loadFile("app" + path.sep + "index.html").then(() => {
        trayIcon = new Tray((iconDir) ? path.join(iconDir, "256x256.png") : null);
        trayIcon.setTitle("Fast Downloader");
        trayIcon.setToolTip("Fast Downloader");

        ipcMain.on("lang", (event, selectedLang, selectedLanguage) => {
            lang = selectedLang;
            language = selectedLanguage;

            trayMenu = Menu.buildFromTemplate([
                {id: "hide", label: language["hide"], type: "normal", click: hide},
                {id: "addUrl", label: language["addUrl"], type: "normal", click: addURL},
                {id: "download", label: language["download"], type: "normal", click: download},
                {id: "location", label: language["location"], type: "normal", click: location},
                {id: "clear", label: language["clear"], type: "normal", click: clear},
                {id: "close", label: language["close"], type: "normal", click: exit}
            ]);

            trayIcon.setContextMenu(trayMenu);

            win.on("hide", () => {
                hidden = true;

                removeTrayItem("hide");
                addTrayItem("maximize", language["maximize"], "normal", maximize);

                trayIcon.setContextMenu(Menu.buildFromTemplate(trayMenu.items));

            });

            win.on("show", () => {
                hidden = false;

                removeTrayItem("maximize");
                addTrayItem("hide", language["hide"], "normal", hide);

                trayIcon.setContextMenu(Menu.buildFromTemplate(trayMenu.items));
            });
        });
    });

    autoLauncher = new AutoLaunch({
        name: "FastDownloader",
        path: app.getPath("exe"),
    });
}

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        app.quit()
    }
});

app.on("activate", () => {
    if (win === null) createWindow();
});

ipcMain.on("restart", () => {
    app.relaunch();
    app.exit();
});

ipcMain.on("app_version", (event) => {
    event.sender.send("app_version", {version: app.getVersion()});
});

ipcMain.on("dir_name", (event) => {
    event.sender.send("dir_name", __dirname);
});

ipcMain.on("restart_app", () => {
    autoUpdater.quitAndInstall();
});

ipcMain.on("set_percentage", (event, percentage) => {
    win.setProgressBar(percentage, {mode: "normal"});
});

ipcMain.on("open_file_dialog", () => {
    dialog.showOpenDialog({
        properties: ["openDirectory"]
    }).then(function (files) {
        if (!files.canceled)
            win.webContents.send("selected_file", files.filePaths);
    });
});

ipcMain.on("show_notification", (event, title, message) => {
    showNotification(title, message);
});

ipcMain.on("add_abort", () => {
    removeTrayItem("download");
    addTrayItem("abort", language["abort"], "normal", abort);

    trayIcon.setContextMenu(Menu.buildFromTemplate(trayMenu.items));
});

ipcMain.on("remove_abort", () => {
    removeTrayItem("abort");
    addTrayItem("download", language["download"], "normal", download);

    trayIcon.setContextMenu(Menu.buildFromTemplate(trayMenu.items));
});

ipcMain.on("enableCloseToTray", () => {
    win.on("close", closeToTray);
});

ipcMain.on("disableCloseToTray", () => {
    win.off("close", closeToTray);
});

ipcMain.on("enableAutostart", () => {
    autoLauncher.isEnabled().then((isEnabled) => {
        if (!isEnabled) autoLauncher.enable();
    });
});

ipcMain.on("disableAutostart", () => {
    autoLauncher.isEnabled().then((isEnabled) => {
        if (isEnabled) autoLauncher.disable();
    });
})

function closeToTray(event) {
    event.preventDefault();
    win.hide();

    return false;
}

function showNotification(title, message) {
    new Notification({
        title: title,
        body: message,
        icon: (iconDir) ? path.join(iconDir, "64x64.png") : null
    }).show();
}

function addTrayItem(id, label, type, click) {
    for (let trayItem of trayMenu.items)
        if (trayItem.id === id) return;

    trayMenu.items.unshift(new MenuItem({id: id, label: label, type: type, click: click}));
}

function removeTrayItem(id) {
    for (let i = 0; i < trayMenu.items.length; i++) {
        if (trayMenu.items[i].id === id) {
            trayMenu.items.splice(i, 1);
            break;
        }
    }
}

function exit() {
    app.exit(0);
}

function hide() {
    win.hide();
}

function maximize() {
    win.show();
}

function download() {
    win.webContents.send("download");
}

function abort() {
    win.webContents.send("abort");
}

function clear() {
    win.webContents.send("clear");
}

function location() {
    win.webContents.send("location");
}

function addURL() {
    win.webContents.send("translate", [["js", "error"], ["js", "noClipboard"]]);

    ipcMain.once("translation", (event, translations) => {
        let value = clipboard.readText();

        if (!value)
            showNotification(translations[0], translations[1]);
        else win.webContents.send("url", value);
    });
}

app.whenReady().then(async () => {
    if (process.platform === "win32")
        app.setAppUserModelId("fm.bernardo.fastDownloader");

    createWindow();

    const timestamp = await new Promise((resolve) => {
        win.webContents
            .executeJavaScript('localStorage.getItem("lastCheck");', true)
            .then(result => {
                resolve(result);
            });
    });

    const currentTime = Date.now() / 1000;

    if (currentTime - timestamp > 86400) {
        autoUpdater.checkForUpdatesAndNotify().then(async (result) => {
            await new Promise((resolve) => {
                win.webContents
                    .executeJavaScript('localStorage.setItem("lastCheck", ' + currentTime + ');', true)
                    .then(result => {
                        resolve(result);
                    });
            });

            if (result && typeof result.downloadPromise !== "undefined") {
                win.webContents.send("update_available", result.updateInfo.version);

                autoUpdater.once("update-downloaded", () => {
                    win.webContents.send("update_downloaded");
                });
            } else {
                let updateInterval = null;

                ipcMain.once("app_upto_date", () => {
                    clearInterval(updateInterval);
                });

                updateInterval = setInterval(() => {
                    win.webContents.send("app_upto_date");
                }, 50);
            }
        });
    }
});
