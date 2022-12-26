# Fast Downloader
This is a fast YouTube downloader written in Electron. 

It was tested on:
- Windows 10/11
- Ubuntu/Debian
- CentOS/Red Hat
- Arch Linux

If your system isn't directly supported, try the `AppImage`.

Main features:
- Download multiple songs and playlists at once
- YouTube Premium integration
  - You need a YouTube Premium subscription
  - Automatic conversion of URLs from YouTube to YouTube Music
- Highly customizable but still slim and clean
- Tray icon with the most needed functionality
  - Insert URLs without entering the application
  - Start a download
  - Change the download location
  - Clear URL list
- Autostart
- Auto update

## Settings
- Save artist name in song title
  - Useful when downloading from YouTube Music
- Close to tray
  - Minimize to tray when closing
- Start automatically at system startup
- Download mode
  - Audio only
  - Video and audio
- Quality
  - Best 
    - The highest available quality
    - Big files
  - Medium 
    - Normal file size
  - Bad
    - The lowest available quality
    - Small files
- Codec
  - aac
  - flac
  - mp3
  - m4a
  - opus
  - vorbis
  - wav
- YouTube Premium
  - No in app login needed
  - YouTube Premium subscription needed
  - Allows you to get the best available quality
  - YouTube Music URLs only
- Browser selection
  - Allows the Fast Downloader to use your YouTube Premium cookie
  - Don't worry, every application on your system has the permission to read browser cookies
- Clear list
  - Functionality to clear the URL list after a download
  - Only if download wasn't aborted

## Screenshots
**Main window - light theme**
![Main window - light theme](https://raw.githubusercontent.com/BERNARDO31P/FastDownloader/master/resources/screenshot/main_light.png)

**Settings**
![Settings window - light theme](https://raw.githubusercontent.com/BERNARDO31P/FastDownloader/master/resources/screenshot/settings_light.png)

**Dark theme**
![Main window - dark theme](https://raw.githubusercontent.com/BERNARDO31P/FastDownloader/master/resources/screenshot/main_dark.png)

## Libraries
- [easy-auto-launch](https://www.npmjs.com/package/easy-auto-launch) -> ^6.0.2
- [electron-updater](https://www.npmjs.com/package/electron-updater) -> ^5.3.0
- [number-precision](https://www.npmjs.com/package/number-precision) -> ^1.6.0
- [ytpl](https://www.npmjs.com/package/ytpl) -> ^2.3.0
- [node-youtube-music](https://www.npmjs.com/package/node-youtube-music) -> ^0.8.3
- [youtube-sr](https://www.npmjs.com/package/youtube-sr) -> ^4.3.4
- [fastest-levenshtein](https://www.npmjs.com/package/fastest-levenshtein) -> 1.0.16

## Binaries
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) -> 2022.11.11
- [ffmpeg](https://ffmpeg.org) -> 2022-11-21

## License
Copyright © 2022 Bernardo de Oliveira

Contact - bernardo@bernardo.fm

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License 
along with this program.  If not, see <http://www.gnu.org/licenses/>.
