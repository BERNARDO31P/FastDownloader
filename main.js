const { app, BrowserWindow } = require('electron');

function createWindow () {
    const win = new BrowserWindow({
        width: 800,
        height: 500,
        center: true,
        autoHideMenuBar: true,
        icon: __dirname + "/app/assets/ico/icon.ico",
        webPreferences: {
            nodeIntegration: true,
            nodeIntegrationInWorker: true,
            nodeIntegrationInSubFrames: true,
            enableRemoteModule: true,
            contextIsolation: false //required flag
        }
    });

    win.loadFile('app/index.html');
}

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
});

app.whenReady().then(createWindow);