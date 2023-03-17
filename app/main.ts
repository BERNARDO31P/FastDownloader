import {app, BrowserWindow, ipcMain} from 'electron';
import * as path from 'path';
import * as fs from 'fs';

const args = process.argv.slice(1),
  serve = args.some(val => val === '--serve');

class FastDownloader {
  win?: BrowserWindow;

  constructor() {
    // This method will be called when Electron has finished
    // initialization and is ready to create browser windows.
    // Some APIs can only be used after this event occurs.
    // Added 400 ms to fix the black background issue while using transparent window. More details at https://github.com/electron/electron/issues/15947
    app.on('ready', () => setTimeout(this.createWindow, 400));

    // Quit when all windows are closed.
    app.on('window-all-closed', () => {
      // On OS X it is common for applications and their menu bar
      // to stay active until the user quits explicitly with Cmd + Q
      if (process.platform !== 'darwin') {
        app.quit();
      }
    });

    app.on('activate', () => {
      // On OS X it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (this.win === undefined) {
        this.createWindow();
      }
    });
  }

  private createWindow()
  {
    this.win = new BrowserWindow({
      width: 900,
      height: 580,
      icon: path.join(__dirname, '/../resources/icons/256x256.png'),
      webPreferences: {
        nodeIntegration: true,
        allowRunningInsecureContent: (serve),
        contextIsolation: false,  // false if you want to run e2e test with Spectron
      },
    });

    if (serve) {
      const debug = require('electron-debug');
      debug();

      require('electron-reloader')(module);
      this.win.loadURL('http://localhost:4200');
    } else {
      // Path when running electron executable
      let pathIndex = './index.html';

      if (fs.existsSync(path.join(__dirname, '../dist/index.html'))) {
        // Path when running electron in local folder
        pathIndex = path.join(__dirname, '../dist/index.html');
      }

      this.win.loadFile(pathIndex);
    }

    // Emitted when the window is closed.
    this.win.on('closed', () => {
      // Dereference the window object, usually you would store window
      // in an array if your app supports multi windows, this is the time
      // when you should delete the corresponding element.
      this.win = undefined;
    });
  }
}

ipcMain.handle('userDataPath', () => {
  return app.getPath('userData');
});

new FastDownloader();
