const {app, BrowserWindow, ipcMain, dialog, Notification, screen, Menu, Tray, MenuItem} = require('electron');
const Store = require('electron-store');
const {autoUpdater} = require('electron-updater');

const {exec} = require("child_process");

Store.initRenderer();

let win = null, trayIcon = null, trayMenu = Menu.buildFromTemplate([]);

function createWindow() {
    const {getCursorScreenPoint, getDisplayNearestPoint} = screen;
    const currentScreen = getDisplayNearestPoint(getCursorScreenPoint());

    win = new BrowserWindow({
        minWidth: 900,
        minHeight: 580,
        x: currentScreen.workArea.x,
        y: currentScreen.workArea.y,
        alwaysOnTop: true,
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
    });

    win.on('close', function (event) {
        event.preventDefault();
        win.hide();

        return false;
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

app.whenReady().then(() => {
    createWindow();

    trayIcon = new Tray(__dirname + "/resources/256x256.png");
    trayIcon.setTitle("Fast Downloader");
    trayIcon.setToolTip("Fast Downloader");

    trayMenu = Menu.buildFromTemplate([
        {id: "hide", label: "Verstecken", type: "normal", click: hide},
        {id: "download", label: "Herunterladen", type: "normal", click: download},
        {id: "close", label: "Schliessen", type: "normal", click: exit}
    ]);

    trayIcon.setContextMenu(trayMenu);
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
    new Notification({
        title: title,
        body: message,
        icon: __dirname + "/app/assets/ico/icon_64x64.png"
    }).show();
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
    addTrayItem("abort", "Abbrechen", "normal", abort);

    trayIcon.setContextMenu(Menu.buildFromTemplate(trayMenu.items));
});

ipcMain.on("remove_abort", () => {
    removeTrayItem("abort");
    addTrayItem("download", "Herunterladen", "normal", download);

    trayIcon.setContextMenu(Menu.buildFromTemplate(trayMenu.items));
});

autoUpdater.on('update-available', () => {
    win.webContents.send('update_available');
});

autoUpdater.on('update-downloaded', () => {
    win.webContents.send('update_downloaded');
});

function exit() {
    app.exit(0);
}

function hide() {
    removeTrayItem("hide");
    addTrayItem("maximize", "Maximieren", "normal", maximize);

    trayIcon.setContextMenu(Menu.buildFromTemplate(trayMenu.items));
    win.hide();
}

function maximize() {
    removeTrayItem("maximize");
    addTrayItem("hide", "Verstecken", "normal", hide);

    trayIcon.setContextMenu(Menu.buildFromTemplate(trayMenu.items));
    win.show();
}

function download() {
    win.webContents.send("download");
}

function abort() {
    win.webContents.send("abort");
}

function addTrayItem(id, label, type, click) {
    trayMenu.items.unshift(new MenuItem({id: id, label: label, type: type, click: click}));
}

function removeTrayItem(id) {
    for( let i = 0; i < trayMenu.items.length; i++){
        if ( trayMenu.items[i].id === id) {
            trayMenu.items.splice(i, 1);
            break;
        }
    }
}