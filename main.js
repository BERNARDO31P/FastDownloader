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
} = require('electron');
const Store = require('electron-store');
const {autoUpdater} = require('electron-updater');
const fs = require('fs');

const {exec} = require("child_process");

Store.initRenderer();

let win = null, trayIcon = null, trayMenu = Menu.buildFromTemplate([]);
let lang = null;
const languageDB = {
    "de": {
        "hide": "Verstecken",
        "addUrl": "URL hinzufügen",
        "download": "Herunterladen",
        "close": "Schliessen",
        "maximize": "Maximieren",
        "abort": "Abbrechen"
    },
    "en": {
        "hide": "Hide",
        "addUrl": "Add URL",
        "download": "Download",
        "close": "Close",
        "maximize": "Maximize",
        "abort": "Abort"
    }
}

function createWindow() {
    const {getCursorScreenPoint, getDisplayNearestPoint} = screen;
    const currentScreen = getDisplayNearestPoint(getCursorScreenPoint());

    win = new BrowserWindow({
        minWidth: 900,
        minHeight: 580,
        x: currentScreen.workArea.x,
        y: currentScreen.workArea.y,
        autoHideMenuBar: true,
        icon: __dirname + "/resources/256x256.png",
        webPreferences: {
            nodeIntegration: true,
            nodeIntegrationInWorker: true,
            nodeIntegrationInSubFrames: true,
            enableRemoteModule: true,
            contextIsolation: false //required flag
        }
    });

    win.center();
    win.loadFile('app/index.html');

    win.once('ready-to-show', () => {
        autoUpdater.checkForUpdatesAndNotify();

        trayIcon = new Tray(__dirname + "/resources/256x256.png");
        trayIcon.setTitle("Fast Downloader");
        trayIcon.setToolTip("Fast Downloader");

        win.webContents.send("lang");
        ipcMain.on("lang", function (event, selectedLang) {
            lang = selectedLang;

            trayMenu = Menu.buildFromTemplate([
                {id: "hide", label: languageDB[lang]["hide"], type: "normal", click: hide},
                {id: "addUrl", label: languageDB[lang]["addUrl"], type: "normal", click: addURL},
                {id: "download", label: languageDB[lang]["download"], type: "normal", click: download},
                {id: "close", label: languageDB[lang]["close"], type: "normal", click: exit}
            ]);

            trayIcon.setContextMenu(trayMenu);

            win.show();
            win.focus();
        });
    });

    win.on('close', function (event) {
        event.preventDefault();
        win.hide();

        return false;
    });

    win.on('hide', function () {

        removeTrayItem("hide");
        addTrayItem("maximize", languageDB[lang]["maximize"], "normal", maximize);

        trayIcon.setContextMenu(Menu.buildFromTemplate(trayMenu.items));

    });

    win.on('show', function () {

        removeTrayItem("maximize");
        addTrayItem("hide", languageDB[lang]["hide"], "normal", hide);

        trayIcon.setContextMenu(Menu.buildFromTemplate(trayMenu.items));
    });

    app.setAppUserModelId("Fast Downloader");
}

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
});

app.on('activate', function () {
    if (win === null) createWindow();
});

ipcMain.on('app_version', (event) => {
    event.sender.send('app_version', {version: app.getVersion()});
});

ipcMain.on('dir_name', (event) => {
    event.sender.send('dir_name', __dirname);
});

ipcMain.on('restart_app', () => {
    autoUpdater.quitAndInstall();
});

ipcMain.on('set_percentage', (event, percentage) => {
    win.setProgressBar(percentage);
});

ipcMain.on("open_file_dialog", () => {
    dialog.showOpenDialog({
        properties: ['openDirectory']
    }).then(function (files) {
        if (!files.canceled)
            win.webContents.send('selected_file', files.filePaths);
    });
});

ipcMain.on("show_notification", (event, title, message) => {
    showNotification(title, message);
});

ipcMain.on("kill_pid", (event, pid) => {
    if (process.platform === "win32")
        exec("taskkill /F /T /PID " + pid);
    else {
        exec("pkill -KILL -P " + pid);
    }
});

ipcMain.on("add_abort", () => {
    removeTrayItem("download");
    addTrayItem("abort", languageDB[lang]["abort"], "normal", abort);

    trayIcon.setContextMenu(Menu.buildFromTemplate(trayMenu.items));
});

ipcMain.on("remove_abort", () => {
    removeTrayItem("abort");
    addTrayItem("download", languageDB[lang]["download"], "normal", download);

    trayIcon.setContextMenu(Menu.buildFromTemplate(trayMenu.items));
});

ipcMain.on("translation", function (event, translations) {
    let value = clipboard.readText();

    if (!value)
        showNotification(translations[0], translations[1]);
    else win.webContents.send("url", value);
});

ipcMain.on("saveCache", function (event, data) {
    fs.writeFileSync(__dirname + "/.cache.json", JSON.stringify(data), 'utf-8');
});

ipcMain.on("loadCache", function (event) {
    let data = fs.readFileSync(__dirname + "/.cache.json", 'utf-8');
    win.webContents.send("loadCache", JSON.parse(data));

    fs.unlinkSync(__dirname + "/.cache.json");
});

autoUpdater.on('update-available', () => {
    win.webContents.send('update_available');
});

autoUpdater.on('update-downloaded', () => {
    win.webContents.send('update_downloaded');
});

function showNotification(title, message) {
    new Notification({
        title: title,
        body: message,
        icon: __dirname + "/app/assets/ico/icon_64x64.png"
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

function addURL() {
    win.webContents.send("translate", [["js", "error"], ["js", "noClipboard"]]);
}

app.whenReady().then(() => {
    createWindow();
});