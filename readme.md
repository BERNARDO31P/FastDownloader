# Fast Downloader ![Icon](https://raw.githubusercontent.com/BERNARDO31P/FastDownloader/master/resources/icons/32x32.png)

This is an intelligent, free and fast downloader for all [supported sites](https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md) written in Electron. 

It was tested on:
- Windows 10/11
- Ubuntu/Debian
- CentOS/RedHat
- Arch Linux

If your system isn't directly supported, try the `AppImage`.

## Features
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
  - Windows
  - AppImage
  - Ubuntu/Debian (Beta)
  - CentOS/RedHat (Beta)
  - ArchLinux ([AUR](https://aur.archlinux.org/packages/fastdownloader-bin))
- Download from [supported sites](https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md)

## Settings
- Close to tray
  - Minimize to tray when closing
- Start automatically at system startup
- Download mode
  - Audio only
    - Automatically converts a YouTube URL to YouTube Music
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
- Language
  - German
  - English
  - Portuguese
  - Italian
  - French
  - Chinese (simplified)

If there are any mistakes in the translations, please let me know.

## Screenshots
**Main window - light theme**
![Main window - light theme](https://raw.githubusercontent.com/BERNARDO31P/FastDownloader/master/resources/screenshot/main_light.png)

**Settings**
![Settings window - light theme](https://raw.githubusercontent.com/BERNARDO31P/FastDownloader/master/resources/screenshot/settings_light.png)

**Dark theme**
![Main window - dark theme](https://raw.githubusercontent.com/BERNARDO31P/FastDownloader/master/resources/screenshot/main_dark.png)

## Libraries
- [auto-launch](https://www.npmjs.com/package/auto-launch) -> ^5.0.6
- [electron-updater](https://www.npmjs.com/package/electron-updater) -> ^6.1.4
- [ytpl](https://www.npmjs.com/package/ytpl) -> ^2.3.0
- [node-youtube-music](https://www.npmjs.com/package/node-youtube-music) -> ^0.8.3
- [youtube-sr](https://www.npmjs.com/package/youtube-sr) -> ^4.3.4
- [fastest-levenshtein](https://www.npmjs.com/package/fastest-levenshtein) -> ^1.0.16
- [terminate](https://www.npmjs.com/package/terminate) -> ^2.6.1

## Binaries
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) -> 2023.03.04
- [ffmpeg](https://ffmpeg.org) -> 2023-02-28
