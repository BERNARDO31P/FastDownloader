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
let ytMusicPromise = null;
let trayClickTimeout = null;

const replacement = new RegExp([
    path.sep + "resources" + path.sep + "app.asar",
    path.sep + "app.asar",
    path.sep + "resources"
].join("|"), "gi");
const applicationDir = __dirname.replaceAll(replacement, "");

let iconDir = null;
if (fs.existsSync(applicationDir + path.sep + "resources")) {
    iconDir = path.join(applicationDir, "resources", "icons");
} else if (fs.existsSync(applicationDir + path.sep + "icons")) {
    iconDir = path.join(applicationDir, "icons");
}

const appIcon = iconDir ? path.join(iconDir, "256x256.png") : null;
const notificationIcon = iconDir ? path.join(iconDir, "64x64.png") : null;

let win = null;
let trayIcon = null;
let trayMenu = Menu.buildFromTemplate([]);
let language = {};
let hidden = false;

function createWindow() {
    const {getCursorScreenPoint, getDisplayNearestPoint} = screen;
    const currentScreen = getDisplayNearestPoint(getCursorScreenPoint());

    win = new BrowserWindow({
        icon: appIcon,
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

    const currentWindow = win;

    currentWindow.on("hide", updateTrayVisibility);
    currentWindow.on("show", updateTrayVisibility);
    currentWindow.on("closed", () => {
        clearTimeout(trayClickTimeout);

        if (trayIcon) {
            trayIcon.destroy();
            trayIcon = null;
        }

        if (win === currentWindow) {
            win = null;
        }
    });

    currentWindow.center();

    autoLauncher = new AutoLaunch({
        name: "FastDownloader",
        path: app.getPath("exe")
    });

    return currentWindow.loadFile(path.join("app", "index.html")).then(() => {
        if (currentWindow.isDestroyed()) {
            return;
        }

        trayIcon = new Tray(appIcon);
        trayIcon.setTitle("FastDownloader");
        trayIcon.setToolTip("FastDownloader");

        // Register these once per tray, rather than on every language message.
        trayIcon.on("click", () => {
            clearTimeout(trayClickTimeout);
            trayClickTimeout = setTimeout(() => {
                if (trayIcon) trayIcon.popUpContextMenu();
            }, 300);
        });

        trayIcon.on("double-click", () => {
            clearTimeout(trayClickTimeout);
            maximize();
        });

        if (Object.keys(language).length) {
            buildTrayMenu();
        }
    });
}

function refreshTrayMenu() {
    if (trayIcon) {
        trayIcon.setContextMenu(Menu.buildFromTemplate(trayMenu.items));
    }
}

function updateTrayVisibility() {
    if (!win || !trayIcon || !Object.keys(language).length) {
        return;
    }

    hidden = !win.isVisible();

    removeTrayItem(hidden ? "hide" : "maximize");
    addTrayItem(
        hidden ? "maximize" : "hide",
        language[hidden ? "maximize" : "hide"],
        "normal",
        hidden ? maximize : hide
    );

    refreshTrayMenu();
}

function buildTrayMenu() {
    trayMenu = Menu.buildFromTemplate([
        {id: "hide", label: language["hide"], type: "normal", click: hide},
        {id: "addUrl", label: language["addUrl"], type: "normal", click: addURL},
        {id: "download", label: language["download"], type: "normal", click: download},
        {id: "location", label: language["location"], type: "normal", click: location},
        {id: "clear", label: language["clear"], type: "normal", click: clear},
        {id: "close", label: language["close"], type: "normal", click: exit}
    ]);

    updateTrayVisibility();
}

ipcMain.on("lang", (event, selectedLanguage) => {
    language = selectedLanguage;

    if (trayIcon) {
        buildTrayMenu();
    }
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        app.quit();
    }
});

app.on("activate", () => {
    if (win === null) {
        createWindow().catch((error) => console.warn("Could not create window:", error));
    }
});

ipcMain.on("restart", () => {
    app.relaunch();
    app.exit();
});

ipcMain.on("app_version", (event) => {
    event.sender.send("app_version", {version: app.getVersion()});
});

ipcMain.on("dir_name", (event) => {
    event.sender.send("dir_name", applicationDir);
});

ipcMain.on("restart_app", () => {
    autoUpdater.quitAndInstall();
});

ipcMain.on("set_percentage", (event, percentage) => {
    if (win) win.setProgressBar(percentage, {mode: "normal"});
});

ipcMain.on("open_file_dialog", () => {
    dialog.showOpenDialog({
        properties: ["openDirectory"]
    }).then(function (files) {
        if (!files.canceled && win) {
            win.webContents.send("selected_file", files.filePaths);
        }
    });
});

ipcMain.on("show_notification", (event, title, message) => {
    showNotification(title, message);
});

ipcMain.on("add_abort", () => {
    removeTrayItem("download");
    addTrayItem("abort", language["abort"], "normal", abort);

    refreshTrayMenu();
});

ipcMain.on("remove_abort", () => {
    removeTrayItem("abort");
    addTrayItem("download", language["download"], "normal", download);

    refreshTrayMenu();
});

ipcMain.on("enableCloseToTray", () => {
    if (win) {
        win.off("close", closeToTray);
        win.on("close", closeToTray);
    }
});

ipcMain.on("startMinimized", () => {
    hide();
});

ipcMain.on("disableCloseToTray", () => {
    if (win) win.off("close", closeToTray);
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
});

ipcMain.on("yt-search", async (event, search) => {
    let results = [];
    try {
        const ytMusic = await getYtMusic();
        results = await ytMusic.searchSongs(search);
    } catch (error) {
        console.warn("YouTube Music search failed:", error);
    }

    if (!event.sender.isDestroyed()) {
        event.sender.send("yt-results", results);
    }
});

function getYtMusic() {
    if (!ytMusicPromise) {
        // Concurrent searches share initialization; search results are not cached.
        ytMusicPromise = import("ytmusic-api").then(async (module) => {
            const ytMusic = new module.default();
            await ytMusic.initialize();
            return ytMusic;
        }).catch((error) => {
            ytMusicPromise = null;
            throw error;
        });
    }

    return ytMusicPromise;
}

function closeToTray(event) {
    event.preventDefault();
    win.hide();

    return false;
}

function showNotification(title, message) {
    new Notification({
        title,
        body: message,
        icon: notificationIcon
    }).show();
}

function addTrayItem(id, label, type, click) {
    if (!trayMenu.items.some((item) => item.id === id)) {
        trayMenu.items.unshift(new MenuItem({id, label, type, click}));
    }
}

function removeTrayItem(id) {
    const index = trayMenu.items.findIndex((item) => item.id === id);

    if (index !== -1) {
        trayMenu.items.splice(index, 1);
    }
}

function exit() {
    app.exit(0);
}

function hide() {
    if (win) win.hide();
}

function maximize() {
    if (win) win.show();
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
    ipcMain.once("translation", (event, translations) => {
        const value = clipboard.readText();

        if (!value) {
            showNotification(translations[0], translations[1]);
        } else if (win) {
            win.webContents.send("url", value);
        }
    });

    win.webContents.send("translate", [["js", "error"], ["js", "noClipboard"]]);
}

async function checkAppUpdates() {
    const currentWindow = win;
    const timestamp = await currentWindow.webContents.executeJavaScript(
        "localStorage.getItem(\"lastCheck\");",
        true
    );
    const currentTime = Date.now() / 1000;

    if (!(currentTime - timestamp > 86400)) {
        return;
    }

    const result = await autoUpdater.checkForUpdatesAndNotify();

    if (currentWindow.isDestroyed()) {
        return;
    }

    await currentWindow.webContents.executeJavaScript(
        "localStorage.setItem(\"lastCheck\", " + currentTime + ");",
        true
    );

    if (result && typeof result.downloadPromise !== "undefined") {
        currentWindow.webContents.send("update_available", result.updateInfo.version);

        autoUpdater.once("update-downloaded", () => {
            if (!currentWindow.isDestroyed()) {
                currentWindow.webContents.send("update_downloaded");
            }
        });
    } else {
        const stopNotifications = () => {
            clearInterval(updateInterval);
            ipcMain.removeListener("app_upto_date", stopNotifications);
            currentWindow.removeListener("closed", stopNotifications);
        };

        const updateInterval = setInterval(() => {
            if (!currentWindow.isDestroyed()) {
                currentWindow.webContents.send("app_upto_date");
            } else {
                stopNotifications();
            }
        }, 50);

        ipcMain.once("app_upto_date", stopNotifications);
        currentWindow.once("closed", stopNotifications);
    }
}

app.whenReady().then(async () => {
    if (process.platform === "win32") {
        app.setAppUserModelId("fm.bernardo.fastDownloader");
    }

    // Read renderer storage after its page has loaded.
    await createWindow();
    await checkAppUpdates();
}).catch((error) => {
    console.warn("Application startup or update check failed:", error);
});