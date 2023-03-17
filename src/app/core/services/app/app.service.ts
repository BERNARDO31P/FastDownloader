import { Injectable } from '@angular/core';

import * as yaml from 'js-yaml';
import * as path from 'path';

import {ElectronService} from '..';

@Injectable({
  providedIn: 'root'
})
export class AppService {
  path: typeof path;
  private config: any;
  private configPath: string;

  constructor(private electronService: ElectronService) {
    this.path = window.require('path');

    this.getUserDataPath().then(userDataPath => {
      this.configPath = this.path.join(userDataPath, '/config.yml');
      this.loadConfig();
    });

    window.onbeforeunload = () => this.saveConfig();
  }

  public getConfig(): any {
    return this.config;
  }

  private getUserDataPath(): Promise<string> {
    if (!this.electronService.ipcRenderer) {
      throw new Error('Electron is required to use this service.');
    }

    return new Promise((resolve) => {
      this.electronService.ipcRenderer.invoke('userDataPath').then(userDataPath => {
        resolve(userDataPath);
      });
    });
  }

  private loadConfig(): void {
    try {
      const fileContent = this.electronService.fs.readFileSync(this.configPath, 'utf8');
      this.config = yaml.load(fileContent) ?? {};
    } catch (error) {
      console.error(`Error loading config file: ${this.configPath}`, error);
      this.electronService.fs.writeFileSync(this.configPath, '');
      this.config = {};
    }
  }

  private saveConfig(): void {
    this.electronService.fs.writeFileSync(this.configPath, yaml.dump(this.config));
  }
}
