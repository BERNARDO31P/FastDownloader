import mustache from "./lib/mustache.min.js";
import {errorFilter, ytFilter} from "./lib/filter.js";

const fs = require("fs");
const terminate = require("terminate");
const path = require("path");
const {ipcRenderer, clipboard} = require("electron");
const {exec, spawn, spawnSync} = require("child_process");

// Number of simultaneous track jobs, including metadata and conversion.
const DOWNLOAD_CONCURRENCY = 2;

let theme = getCookie("theme");
if (!theme) theme = "light";

setCookie("theme", theme);
document.getElementsByTagName("html")[0].setAttribute("data-theme", theme);

let fileEnding = "";
if (process.platform === "win32") fileEnding = ".exe"; else if (process.platform === "linux") fileEnding = "_linux"; else if (process.platform === "darwin") fileEnding = "_macos";

let __realDir = null;
let debug = console.debug;

let hiddenElements = [];
let urlList = [];
let logs = [];

let denoPath = null;
let denoInitialized = false;

let activeDownloadBatch = null;
let nextDownloadJobId = 0;
let nextWorkerRequestId = 0;
const pendingDownloadPrepares = new Map();
let nextPlaylistId = 0;
let nextPendingUrlId = 0;
const pendingUrlItems = new Map();
// Retain resolved playlist URLs and in-flight lookups per visible list item.
const playlistLookups = new Map();

let extractors = [];
let brokenExtractors = [];

export let specificSettings = {};

export let worker = new Worker("assets/js/lib/worker.js", {type: "module"});

export let downloading = false;
export let resolve = null;
export let aborted = false;
export let childProcess = null;
export const childProcesses = new Set();

export let languageDB = {};

export let ytDl = "";
export let ffmpeg = "";
export let elevate = "";

export let selectedLang = null;

// TODO: Comment
HTMLElement.prototype.animateCallback = function (keyframes, options, callback) {
    let animation = this.animate(keyframes, options);

    animation.onfinish = () => callback();
};

// TODO: Comment
console.debug = (log) => {
    debug(log);

    // TODO: Add check if logs are enabled
    // Implement logging to send for analytics if bugs are found
    // logs.push(log);
};

/*
 * Funktion: bindEvent()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  eventNames: (String) Event-Name z.B. click
 *  selector: (String) Den Element-Selector z.B. die ID oder Klasse usw.
 *  handler: (Object) Die Funktion welche ausgeführt werden soll
 *
 * Ist das Äquivalent zu .on(eventNames, selector, handler) in jQuery
 */
export function bindEvent(eventNames, selectors, handler) {
    eventNames.split(", ").forEach((eventName) => {
        document.addEventListener(eventName, function (event) {
            selectors.split(", ").forEach((selector) => {
                if (event.target.matches(selector + ", " + selector + " *")) {
                    let element = event.target.closest(selector);
                    handler.apply(element, arguments);
                }
            });
        }, false);
    });
}

// TODO: Comment
function sleep(ms, batch) {
    return new Promise((finish) => {
        if (aborted || batch.stopped) {
            finish();
            return;
        }

        const wake = () => {
            clearTimeout(timer);
            batch.retryWaits.delete(wake);
            finish();
        };

        const timer = setTimeout(wake, ms);
        batch.retryWaits.add(wake);
    });
}

function executablePath(binary) {
    // Existing exported binary paths include quotes for the legacy exec calls.
    // spawn receives the executable and arguments separately.
    return binary && binary.replace(/^"(.*)"$/, "$1");
}

function spawnYtDlp(args) {
    // yt-dlp may otherwise write its redirected output in the Windows code page.
    // Node decodes both pipes as UTF-8, so force the producer to use UTF-8 too.
    return spawn(executablePath(ytDl), ["--encoding", "utf-8", ...args], {
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
        env: {...process.env, PYTHONIOENCODING: "utf-8"}
    });
}

function isYouTubeUrl(url) {
    try {
        const hostname = new URL(url).hostname.toLowerCase();

        return hostname === "youtube.com" || hostname.endsWith(".youtube.com") || hostname === "youtu.be" || hostname.endsWith(".youtu.be");
    } catch (error) {
        return false;
    }
}

function stopDownloadBatch(batch) {
    if (!batch || batch.stopped) {
        return;
    }

    batch.stopped = true;

    // An in-flight worker conversion must not hold a download slot forever.
    for (const [id, pending] of pendingDownloadPrepares) {
        if (pending.batch === batch) {
            pendingDownloadPrepares.delete(id);
            pending.resolve(null);
        }
    }

    // Wake retry delays immediately. Keep processes registered until close.
    for (const wake of Array.from(batch.retryWaits)) {
        wake();
    }

    for (const currentProcess of batch.processes) {
        if (!currentProcess.pid) {
            continue;
        }

        try {
            // terminate also stops descendants such as Deno and ffmpeg.
            terminate(currentProcess.pid, (error) => {
                if (error && batch.processes.has(currentProcess)) {
                    console.warn("Could not terminate download process:", error);
                }
            });
        } catch (error) {
            console.warn("Could not terminate download process:", error);
        }
    }
}

function matchesErrorFilter(line) {
    // errorFilter is global, so reset lastIndex before every test.
    errorFilter.lastIndex = 0;

    return errorFilter.test(line);
}

function getDownloadFailure(stderr) {
    const lines = stderr
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

    // Prefer actual error lines for retry classification so unrelated warnings
    // do not choose the retry reason.
    const errorLines = lines.filter((line) => /^error:/i.test(line));
    const message = (errorLines.length ? errorLines.join("\n") : lines.join("\n")).toLowerCase();

    // Keep the old retry behaviour. These checks must happen before errorFilter,
    // because an actual error can also contain an ignored token such as [youtube].
    if (message.includes("winerror 3")) return "drive";
    if (message.includes("permission") || message.includes("cookie")) return "permission";
    if (message.includes("getaddrinfo failed") || message.includes("timed out")) return "network";
    if (message.includes("sign in")) return "login";
    if (message.includes("http error 403")) return "sleep";

    // Restore the old errorFilter behaviour: known stderr noise is ignored,
    // while every other stderr line is treated as an unexpected failure.
    //
    // Explicit ERROR lines are never hidden solely because they contain a
    // filtered token.
    const hasUnexpectedStderr = lines.some((line) => {
        if (/^error:/i.test(line)) {
            return true;
        }

        return !matchesErrorFilter(line);
    });

    return hasUnexpectedStderr ? null : "ignored";
}

function runYtDlp(args, batch, onProgress = null, captureOutput = false) {
    return new Promise((finish) => {
        if (aborted || batch.stopped) {
            finish({status: "aborted", stdout: ""});
            return;
        }

        let currentProcess;

        try {
            currentProcess = spawnYtDlp(args);
        } catch (error) {
            console.warn("Could not start yt-dlp:", error);
            finish({status: null, stdout: ""});
            return;
        }

        childProcess = currentProcess;
        childProcesses.add(currentProcess);
        batch.processes.add(currentProcess);

        let stdout = "";
        let stderr = "";
        let processError = null;
        const buffers = ["", ""];

        const readProgress = (line) => {
            if (!onProgress || aborted || batch.stopped) {
                return;
            }

            const found = line.match(/\[download\]\s+(\d+(?:\.\d+)?)%/);

            if (found) {
                onProgress(Math.min(1, Number(found[1]) / 100));
            }
        };

        const readOutput = (data, streamIndex) => {
            console.debug(data);

            if (streamIndex === 0 && captureOutput) {
                stdout = (stdout + data).slice(0, 1024 * 1024);
            } else if (streamIndex === 1) {
                stderr = (stderr + data).slice(-65536);
            }

            const lines = (buffers[streamIndex] + data).split(/\r\n|\r|\n/);
            buffers[streamIndex] = lines.pop().slice(-65536);

            for (const line of lines) {
                readProgress(line);
            }
        };

        currentProcess.stdout.setEncoding("utf8");
        currentProcess.stderr.setEncoding("utf8");
        currentProcess.stdout.on("data", (data) => readOutput(data, 0));
        currentProcess.stderr.on("data", (data) => readOutput(data, 1));

        currentProcess.on("error", (error) => {
            processError = error;
            console.warn("yt-dlp process error:", error);
        });

        currentProcess.on("close", (code) => {
            readProgress(buffers[0]);
            readProgress(buffers[1]);

            childProcesses.delete(currentProcess);
            batch.processes.delete(currentProcess);

            if (childProcess === currentProcess) {
                const remaining = Array.from(childProcesses);
                childProcess = remaining.length ? remaining[remaining.length - 1] : null;
            }

            console.debug("Closing status code: " + code);

            // Settle only after close: a retry must not overlap its old process.
            // Warnings and progress on stderr do not turn exit code 0 into failure.
            let status;

            if (aborted || batch.stopped) {
                status = "aborted";
            } else if (code === 0 && !processError) {
                // yt-dlp frequently writes warnings and informational messages to stderr.
                // A successful exit code always means the command succeeded.
                status = "success";
            } else {
                const failure = getDownloadFailure(stderr);

                status = failure === "ignored" ? null : failure;
            }

            finish({status, stdout});
        });
    });
}

async function getTitle(url, mode, batch, commonArgs) {
    const result = await runYtDlp([...commonArgs, "--print", "channel,artist,title", "--skip-download", "--", url], batch, null, true);

    if (result.status !== "success") {
        return {status: result.status, title: null};
    }

    try {
        const outputString = result.stdout.split(/\r?\n/);

        if (!outputString[2] || !outputString[2].trim()) {
            return {status: null, title: null};
        }

        const URLInfo = {
            channel: outputString[0].trim() || "NA",
            artist: outputString[1].trim() || "NA",
            title: outputString[2].trim()
        };

        return {status: "success", title: clearTitle(URLInfo, mode)};
    } catch (error) {
        console.warn("Could not read the download title:", error);
        return {status: null, title: null};
    }
}

// TODO: Comment
worker.addEventListener("message", (event) => {
    const msg = event.data;

    switch (msg.type) {
        case "getYouTubeMusicSearch":
            ipcRenderer.send("yt-search", msg.search, msg.requestId);
            break;

        case "checkPremiumAndAdd": {
            const pending = pendingDownloadPrepares.get(msg.requestId);
            if (!pending) return;
            pendingDownloadPrepares.delete(msg.requestId);
            pending.resolve(msg.data);
            break;
        }

        case "checkPremium": {
            const item = pendingUrlItems.get(msg.requestId);
            pendingUrlItems.delete(msg.requestId);

            if (!item || !item.isConnected) {
                return;
            }

            if (urlList.includes(msg.url)) {
                showNotification(languageDB["js"]["urlInList"], languageDB["js"]["error"]);
                removeDownloadSource(item);
                item.remove();
                return;
            }

            // Preserve settings selected while URL normalization was pending.
            if (msg.old !== msg.url && specificSettings[msg.old]) {
                specificSettings[msg.url] = {...specificSettings[msg.old], ...specificSettings[msg.url]};
                delete specificSettings[msg.old];
            }
            item.setAttribute("data-url", msg.url);
            item.querySelector(".url-text").textContent = msg.url;
            urlList.push(msg.url);
            if (isPlaylistUrl(msg.url)) resolvePlaylist(item);
            break;
        }
    }
});

// TODO: Comment
export function setRealDir(dirname) {
    dirname = dirname.replaceAll(path.sep + "app.asar", "");

    if (!dirname.includes(path.sep + "resources")) {
        dirname = dirname + path.sep + "resources";
    }

    __realDir = dirname;

    updateBinaryLocations();
}

// TODO: Comment
function findSystemBinary(binaryName) {
    const command = process.platform === "win32" ? "where" : "which";

    try {
        const result = spawnSync(command, [binaryName], {
            encoding: "utf8", shell: false
        });

        if (result.status !== 0) {
            return null;
        }

        const output = result.stdout
            .split("\n")[0]
            .trim();

        return output.length ? output : null;
    } catch (error) {
        console.warn("Failed to locate binary:", binaryName, error);

        return null;
    }
}

function getBundledBinary(binaryName) {
    const bundledPath = path.join(__realDir, binaryName + fileEnding);

    return fs.existsSync(bundledPath) ? bundledPath : null;
}

function quoteBinary(binaryPath) {
    return binaryPath ? `"${binaryPath}"` : null;
}

function updateBinaryLocations() {
    const preferSystem = process.platform === "linux" || process.platform === "darwin";

    const ytDlPath = preferSystem ? findSystemBinary("yt-dlp") || getBundledBinary("yt-dlp") : getBundledBinary("yt-dlp") || findSystemBinary("yt-dlp");

    const ffmpegPath = preferSystem ? findSystemBinary("ffmpeg") || getBundledBinary("ffmpeg") : getBundledBinary("ffmpeg") || findSystemBinary("ffmpeg");

    const elevatePath = getBundledBinary("elevate") || findSystemBinary("elevate");

    ytDl = quoteBinary(ytDlPath);
    ffmpeg = quoteBinary(ffmpegPath);
    elevate = quoteBinary(elevatePath);

    console.debug("yt-dlp: " + ytDl);
    console.debug("ffmpeg: " + ffmpeg);
    console.debug("elevate: " + elevate);
}

/*
 * Funktion: getCookie()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  name: (String) Cookie Name
 *  def: (Any) Standard Wert, falls Cookie nicht existiert
 *
 * Holt den Wert aus dem Speicher
 * Gibt den Wert zurück
 */
export function getCookie(name, def = null) {
    let cookie = localStorage.getItem(name);

    if (cookie === null) {
        return def;
    }

    return cookie === "true" ? true : cookie === "false" ? false : cookie === "null" ? null : cookie;
}

/*
 * Funktion: setCookie()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  name: (String) Cookie Name
 *  value: (String) Cookie Wert
 *  expiresAt: (String) Auslaufdatum vom Cookie
 *
 * Erstellt einen Cookie und setzt die Werte
 */
export function setCookie(name, value) {
    localStorage.setItem(name, value);
}

export function setAborted(bool) {
    aborted = bool;

    if (bool) {
        stopDownloadBatch(activeDownloadBatch);
    }
}

export function isPlaylistUrl(value) {
    try {
        const url = new URL(value);
        const hostname = url.hostname.toLowerCase();
        return (hostname === "youtube.com" || hostname.endsWith(".youtube.com")) &&
            url.pathname === "/playlist" && url.searchParams.has("list");
    } catch (error) {
        return false;
    }
}

function normalizePlaylistEntry(value, playlistUrl) {
    const entry = value.trim();
    if (!entry || entry === "NA") return null;

    try {
        const url = new URL(entry);
        if (url.protocol !== "https:" && url.protocol !== "http:") return null;

        const hostname = url.hostname.toLowerCase();
        if ((hostname === "youtube.com" || hostname.endsWith(".youtube.com")) &&
            url.pathname === "/watch" && url.searchParams.has("v")) {
            const music = new URL(playlistUrl).hostname.toLowerCase() === "music.youtube.com";
            return `https://${music ? "music" : "www"}.youtube.com/watch?v=${encodeURIComponent(url.searchParams.get("v"))}`;
        }

        return url.toString();
    } catch (error) {
        // A flat yt-dlp playlist may contain bare YouTube video IDs.
        if (/^[a-zA-Z0-9_-]{11}$/.test(entry)) {
            const music = new URL(playlistUrl).hostname.toLowerCase() === "music.youtube.com";
            return `https://${music ? "music" : "www"}.youtube.com/watch?v=${entry}`;
        }
        return null;
    }
}

function cancelPlaylistLookup(item) {
    const state = playlistLookups.get(item);
    if (!state) return;

    state.cancelled = true;
    playlistLookups.delete(item);
    if (state.child && state.child.pid) {
        terminate(state.child.pid, (error) => {
            if (error) console.debug("Could not cancel playlist lookup: " + error.message);
        });
    }
}

function resolvePlaylist(item) {
    if (!isPlaylistUrl(item.getAttribute("data-url"))) return;

    const existing = playlistLookups.get(item);
    if (existing) return existing.promise;

    const state = {cancelled: false, child: null, entries: null, promise: null};
    playlistLookups.set(item, state);
    item.classList.add("playlist-resolving");
    item.querySelector(".url-progress-info").textContent = "0.00%";

    state.promise = new Promise((resolve, reject) => {
        const executable = executablePath(ytDl);
        if (!executable) {
            reject(new Error("yt-dlp executable was not found"));
            return;
        }

        let child;
        try {
            child = spawnYtDlp([
                "--print", "%(webpage_url)s",
                "--flat-playlist",
                "--", item.getAttribute("data-url")
            ]);
        } catch (error) {
            reject(error);
            return;
        }

        state.child = child;
        let output = "";
        let processError = null;
        child.stdout.setEncoding("utf8");
        child.stderr.setEncoding("utf8");
        child.stdout.on("data", (data) => { output += data; });
        child.stderr.on("data", (data) => console.debug(data));
        child.on("error", (error) => { processError = error; });
        child.on("close", (code) => {
            state.child = null;
            if (state.cancelled) {
                reject(new Error("Playlist lookup cancelled"));
            } else if (processError || code !== 0) {
                reject(processError || new Error(`Playlist lookup failed with exit code ${code}`));
            } else {
                resolve(output);
            }
        });
    }).then((output) => {
        if (state.cancelled || !item.isConnected || playlistLookups.get(item) !== state) {
            return [];
        }

        const url = item.getAttribute("data-url");
        const entries = output.split(/\r?\n/)
            .map((entry) => normalizePlaylistEntry(entry, url))
            .filter(Boolean);

        if (!entries.length) {
            throw new Error("Playlist lookup returned no usable tracks");
        }

        state.entries = entries;
        setPlaylistEntries(item, entries.map((entry) => ({url: entry})));
        item.classList.remove("playlist-resolving");
        item.setAttribute("data-playlist-status", "resolved");
        return entries;
    }).catch((error) => {
        if (!state.cancelled && item.isConnected && playlistLookups.get(item) === state) {
            console.warn("Could not resolve playlist:", item.getAttribute("data-url"), error);
            item.classList.remove("playlist-resolving");
            item.setAttribute("data-playlist-status", "error");
            item.querySelector(".url-progress-info").textContent = "!";
            item.title = error.message;
            error.playlistNotified = true;
            showNotification(languageDB["js"]["unexpectedError"], languageDB["js"]["error"]);
        }
        throw error;
    });

    // The lookup is started at add/restore time, not when downloading. Consume
    // rejections here too so a failed lookup does not cause unhandled rejection.
    state.promise.catch(() => {});
    return state.promise;
}

export function getPlaylistEntries(item) {
    const state = playlistLookups.get(item);
    if (!state) return Promise.reject(new Error("Playlist was not resolved"));
    return state.promise;
}

export function assignPlaylistJobIds(item, jobs) {
    const children = item.querySelectorAll(":scope > .playlist-entries > li.playlist-entry");
    if (children.length !== jobs.length) {
        throw new Error("Resolved playlist entries do not match the visible list");
    }
    children.forEach((child, index) => child.setAttribute("data-job-id", jobs[index].jobId));
}

export function clearList() {
    for (const item of document.querySelectorAll(".listBox > ul > li")) removeDownloadSource(item);
    for (const item of Array.from(playlistLookups.keys())) cancelPlaylistLookup(item);
    let ul = document.querySelector(".listBox ul");

    ul.innerHTML = "";
    urlList = [];
    pendingUrlItems.clear();
}

// TODO: Comment
export function removeActives(element) {
    let actives = element.querySelectorAll(".active");

    for (let active of actives) {
        active.classList.remove("active");
    }
}

// TODO: Comment
export function updateSelected() {
    let actives = document.querySelectorAll(".listBox > ul > li.active");
    let linkCount = document.getElementById("link-count");

    if (actives.length) {
        linkCount.style.opacity = "1";
        linkCount.querySelector("a").textContent = actives.length.toString();
    } else {
        linkCount.style.opacity = "0";
    }
}

// TODO: Comment
export function activeToClipboard() {
    let actives = document.querySelectorAll(".listBox > ul > li.active");
    let clipText = "";

    for (let active of actives) {
        clipText += active.getAttribute("data-url") + "\n";
    }

    clipboard.writeText(clipText);
}

// TODO: Comment
export function loadAllData(location) {
    let data = JSON.parse(getCookie("cache"));

    setCookie("cache", null);

    location.value = data["location"];

    let listBox = document.querySelector(".listBox ul");

    urlList = [];

    for (let listItem of data["listItems"]) {
        const li = createUrlListItem(listItem);

        listBox.appendChild(li);
        urlList.push(listItem);
        if (isPlaylistUrl(listItem)) resolvePlaylist(li);
    }
}

// TODO: Comment
export function getAllData() {
    let data = {};
    let listItems = document.querySelectorAll(".listBox > ul > li");

    data["listItems"] = [];

    for (let listItem of listItems) {
        data["listItems"].push(listItem.getAttribute("data-url"));
    }

    data["location"] = document.getElementById("location").value;

    setCookie("cache", JSON.stringify(data));
}

// TODO: Comment
function updateDownloadProgress(batch, jobId = null) {
    if (activeDownloadBatch !== batch) return;

    let downloaded = 0;
    for (const progress of batch.progress.values()) downloaded += progress;
    const total = batch.total ? downloaded / batch.total : 0;

    const progressTotal = document.querySelector(".progress-total progress");
    const progressTotalInfo = document.querySelector(".progress-total .info p");

    if (progressTotal) progressTotal.value = total;
    if (progressTotalInfo) {
        progressTotalInfo.textContent = total === 1 && batch.pendingSources === 0 &&
            batch.running === 0 && batch.queue.length === 0
            ? languageDB["js"]["done"]
            : (total * 100).toFixed(2) + "%";
    }

    if (jobId !== null) setJobProgress(jobId, batch.progress.get(jobId) || 0, batch);
    ipcRenderer.send("set_percentage", total);
}

function getJobSettings(job) {
    // This is intentionally called ONLY when a download slot becomes available.
    // Each job retains its snapshot, even when the user changes settings later.
    const parentSettings = specificSettings[job.source.item.getAttribute("data-url")] || {};
    const trackSettings = specificSettings[job.url] || {};
    const overrides = {...parentSettings, ...trackSettings};
    const settings = {
        mode: getCookie("mode"),
        codecAudio: getCookie("codecAudio"),
        codecVideo: getCookie("codecVideo"),
        quality: getCookie("quality"),
        location: document.querySelector(".location #location").value
    };

    for (const key of ["mode", "codecAudio", "codecVideo", "quality", "location"]) {
        if (overrides[key] !== undefined) settings[key] = overrides[key];
    }

    return settings;
}

function prepareDownloadJob(job, settings, batch) {
    return new Promise((resolvePrepare) => {
        if (aborted || batch.stopped) {
            resolvePrepare(null);
            return;
        }

        const requestId = ++nextWorkerRequestId;
        pendingDownloadPrepares.set(requestId, {resolve: resolvePrepare, batch});
        worker.postMessage({
            type: "checkPremiumAndAdd",
            url: job.url,
            jobId: job.jobId,
            requestId,
            settings
        });
    });
}

async function downloadItem(item, batch) {
    const job = {title: null};

    while (!aborted && !batch.stopped) {
        batch.progress.set(item.jobId, 0);
        updateDownloadProgress(batch, item.jobId);

        const result = await downloadURL(item, batch, job);

        if (aborted || batch.stopped) return "aborted";
        if (result === "success") {
            batch.progress.set(item.jobId, 1);
            updateDownloadProgress(batch, item.jobId);
            return "success";
        }

        switch (result) {
            case "permission":
            case "network":
            case "login":
                showNotification(languageDB["js"][result], languageDB["js"]["error"], 8000);
                break;
            case "drive":
            case "sleep":
                break;
            default:
                return result;
        }

        batch.progress.set(item.jobId, 0);
        updateDownloadProgress(batch, item.jobId);
        await sleep(result === "drive" ? 1000 : 10000, batch);
    }

    return "aborted";
}

function setDownloadButtons(running) {
    const start = document.querySelector(".startAbort .start-button");
    const abort = document.querySelector(".startAbort .abort-button");
    if (start) start.ariaDisabled = String(running);
    if (abort) abort.ariaDisabled = String(!running);
    // URL entry, removal, list selection and global settings stay editable.
}

function finishDownloadBatch(batch) {
    if (activeDownloadBatch !== batch || batch.finished) return;
    batch.finished = true;
    resolve = aborted || (batch.stopped && batch.result === "success")
        ? "aborted" : batch.result;
    activeDownloadBatch = null;
    downloading = false;
    setDownloadButtons(false);

    const progressTotal = document.querySelector(".progress-total progress");
    const infoTotal = document.querySelector(".progress-total .info p");
    if (resolve === "success") {
        if (infoTotal) infoTotal.textContent = languageDB["js"]["done"];
        if (progressTotal) progressTotal.value = 1;
        ipcRenderer.send("set_percentage", 1);
        const message = batch.modesUsed.size > 1 ? languageDB["js"]["done"]
            : languageDB["js"][batch.modesUsed.has("audio") ? "songsDownloaded" : "videosDownloaded"];
        showNotification(message, languageDB["js"]["success"]);
        if (getCookie("clearList")) clearList();
    } else if (resolve === "aborted") {
        showNotification(languageDB["js"]["downloadAborted"], languageDB["js"]["error"]);
    } else {
        showNotification(languageDB["js"]["unexpectedError"], languageDB["js"]["error"]);
    }

    ipcRenderer.send("remove_abort");
}

async function runQueuedJob(job, batch) {
    // Mark the specific URL as started before reading mutable user settings.
    job.state = "running";
    job.row.setAttribute("data-download-state", "running");
    // URL normalization may have completed while this job was still queued.
    job.url = job.row.getAttribute("data-url");
    const snapshot = getJobSettings(job);
    batch.modesUsed.add(snapshot.mode);
    const prepared = await prepareDownloadJob(job, snapshot, batch);
    if (!prepared || aborted || batch.stopped) return "aborted";
    return downloadItem(prepared, batch);
}

function pumpDownloadQueue(batch) {
    if (activeDownloadBatch !== batch || batch.finished || batch.initializing) return;

    while (!aborted && !batch.stopped && batch.running < DOWNLOAD_CONCURRENCY && batch.queue.length) {
        const job = batch.queue.shift();
        if (job.cancelled) continue;
        batch.running++;

        runQueuedJob(job, batch).then((result) => {
            if (result === "success") {
                batch.progress.set(job.jobId, 1);
                job.state = "completed";
                job.row.setAttribute("data-download-state", "completed");
            } else if (!batch.stopped) {
                job.state = "failed";
                job.row.setAttribute("data-download-state", "failed");
                batch.result = result;
                stopDownloadBatch(batch);
            }
        }).catch((error) => {
            console.warn("Download failed:", error);
            if (!batch.stopped) {
                batch.result = null;
                stopDownloadBatch(batch);
            }
        }).finally(() => {
            batch.running--;
            updateDownloadProgress(batch, job.jobId);
            pumpDownloadQueue(batch);
        });
    }

    if (batch.running === 0 && (batch.stopped || (batch.pendingSources === 0 && batch.queue.length === 0))) {
        finishDownloadBatch(batch);
    }
}

function queueDownloadJob(batch, source, row, url) {
    const job = {
        source, row, url,
        jobId: String(++nextDownloadJobId),
        state: "queued", cancelled: false
    };
    source.jobs.push(job);
    row.setAttribute("data-job-id", job.jobId);
    row.setAttribute("data-download-state", "queued");
    batch.progress.set(job.jobId, 0);
    batch.queue.push(job);
    return job;
}

// Called at initial start and for every newly added top-level URL.
export function enqueueDownloadSource(item) {
    const batch = activeDownloadBatch;
    if (!batch || batch.finished || batch.stopped || batch.sources.has(item) || !item.isConnected) return;

    const source = {item, jobs: [], cancelled: false, pending: false};
    batch.sources.set(item, source);
    batch.total++;
    updateDownloadProgress(batch);

    const url = item.getAttribute("data-url");
    if (!isPlaylistUrl(url)) {
        queueDownloadJob(batch, source, item, url);
        pumpDownloadQueue(batch);
        return;
    }

    // A resolving playlist contributes one placeholder to the denominator.
    // Once its entries arrive, replace that placeholder with all real tracks.
    source.pending = true;
    batch.pendingSources++;
    getPlaylistEntries(item).then((entries) => {
        if (source.cancelled || batch.stopped || activeDownloadBatch !== batch) return;
        if (!entries.length) throw new Error("Playlist is empty");

        batch.total += entries.length - 1;
        const children = item.querySelectorAll(":scope > .playlist-entries > li.playlist-entry");
        if (children.length !== entries.length) throw new Error("Playlist entries changed while resolving");
        for (let i = 0; i < entries.length; i++) {
            queueDownloadJob(batch, source, children[i], entries[i]);
        }
        updateDownloadProgress(batch);
    }).catch((error) => {
        if (source.cancelled || batch.stopped || activeDownloadBatch !== batch) return;
        console.warn("Playlist could not enter the download queue:", error);
        // A failed newly added playlist must not abort downloads already running.
        source.cancelled = true;
        batch.total--;
        updateDownloadProgress(batch);
    }).finally(() => {
        if (source.pending) {
            source.pending = false;
            batch.pendingSources--;
        }
        pumpDownloadQueue(batch);
    });
}

// If a URL is deleted, any not-yet-started jobs are removed; running processes
// keep their immutable job data and are allowed to finish.
export function removeDownloadSource(item) {
    const batch = activeDownloadBatch;
    if (!batch) return;
    const source = batch.sources.get(item);
    if (!source || source.cancelled) return;

    source.cancelled = true;
    if (source.pending) {
        source.pending = false;
        batch.pendingSources--;
        batch.total--;
    }

    for (const job of source.jobs) {
        if (job.state === "queued") {
            job.cancelled = true;
            batch.queue = batch.queue.filter((entry) => entry !== job);
            batch.progress.delete(job.jobId);
            batch.total--;
        }
    }

    updateDownloadProgress(batch);
    pumpDownloadQueue(batch);
}

export function startDownloadQueue(items) {
    if (downloading || activeDownloadBatch) return false;

    aborted = false;
    resolve = null;
    const batch = {
        total: 0, running: 0, pendingSources: 0, queue: [],
        sources: new Map(), stopped: false, finished: false, initializing: true,
        modesUsed: new Set(), result: "success", processes: new Set(), retryWaits: new Set(),
        progress: new Map(), outputLocks: new Map()
    };

    activeDownloadBatch = batch;
    downloading = true;
    worker.postMessage({type: "reset"});
    setDownloadButtons(true);

    for (const item of items) enqueueDownloadSource(item);
    batch.initializing = false;
    pumpDownloadQueue(batch);
    return true;
}

export function abortDownloadQueue() {
    if (!activeDownloadBatch) return;
    setAborted(true);
    worker.postMessage({type: "abort"});
    pumpDownloadQueue(activeDownloadBatch);
}

function generateDomainVariations(url) {
    const hostname = url.hostname;
    const domainParts = hostname
        .split(".")
        .map(part => part.toLowerCase());

    // Extract the main domain without the subdomain and TLD
    const mainDomain = domainParts.slice(-2, -1)[0];

    return [`${mainDomain}.${domainParts.slice(-1)[0]}`, `${mainDomain}${domainParts.slice(-1)[0]}`, hostname, hostname.replace(/\./g, ""), ...domainParts];
}

function createUrlListItem(url) {
    const li = document.createElement("li");

    li.setAttribute("data-url", url);

    const row = document.createElement("div");
    row.classList.add("url-progress-row");

    const content = document.createElement("div");
    content.classList.add("url-progress-content");

    const header = document.createElement("div");
    header.classList.add("url-progress-header");

    const text = document.createElement("span");
    text.classList.add("url-text");
    text.textContent = url;

    const info = document.createElement("span");
    info.classList.add("url-progress-info");
    info.textContent = "0.00%";

    const progress = document.createElement("progress");
    progress.classList.add("url-progress");
    progress.max = 1;
    progress.value = 0;

    header.appendChild(text);
    header.appendChild(info);

    content.appendChild(header);
    content.appendChild(progress);
    row.appendChild(content);
    li.appendChild(row);

    return li;
}

function writeListItemProgress(item, value) {
    if (!item) {
        return;
    }

    value = Math.max(0, Math.min(1, value));
    item.querySelector(".url-progress").value = value;
    item.querySelector(".url-progress-info").textContent = value === 1
        ? languageDB["js"]["done"]
        : (value * 100).toFixed(2) + "%";
}

function setJobProgress(jobId, value, batch) {
    for (const item of document.querySelectorAll(".listBox li[data-job-id]")) {
        if (item.getAttribute("data-job-id") !== String(jobId)) {
            continue;
        }

        writeListItemProgress(item, value);

        const playlist = item.closest("li.playlist-item");
        if (playlist && playlist !== item) {
            const children = playlist.querySelectorAll(".playlist-entries > li[data-job-id]");
            let completed = 0;

            for (const child of children) {
                completed += batch.progress.get(child.getAttribute("data-job-id")) || 0;
            }

            writeListItemProgress(playlist, children.length ? completed / children.length : 0);
        }
        break;
    }
}

export function setPlaylistEntries(item, entries) {
    let list = item.querySelector(".playlist-entries");

    if (!list) {
        list = document.createElement("ul");
        list.classList.add("playlist-entries");
        list.id = `playlist-entries-${++nextPlaylistId}`;
        list.hidden = true;

        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.classList.add("playlist-toggle");
        toggle.textContent = "▸";
        toggle.setAttribute("aria-expanded", "false");
        toggle.setAttribute("aria-controls", list.id);
        toggle.setAttribute("aria-label", "Playlist: " + item.getAttribute("data-url"));

        item.classList.add("playlist-item");
        item.querySelector(".url-progress-row").prepend(toggle);
        item.appendChild(list);
    }

    list.replaceChildren();

    for (const entry of entries) {
        const child = createUrlListItem(entry.url);
        child.classList.add("playlist-entry");
        if (entry.jobId !== undefined) child.setAttribute("data-job-id", entry.jobId);
        list.appendChild(child);
    }

    writeListItemProgress(item, 0);
}

export function togglePlaylist(item) {
    if (!item) {
        return;
    }

    const list = item.querySelector(".playlist-entries");
    const toggle = item.querySelector(".playlist-toggle");

    if (!list || !toggle) {
        return;
    }

    list.hidden = !list.hidden;
    toggle.setAttribute("aria-expanded", String(!list.hidden));
    toggle.textContent = list.hidden ? "▸" : "▾";
}

export function addUrlToList(url = "") {
    if (!url) {
        showNotification(languageDB["js"]["noURL"], languageDB["js"]["error"]);

        return false;
    }

    let values = url.trim().split(/[\n\s]+/);
    let ul = document.querySelector(".listBox ul");

    for (let value of values) {
        let url = null;

        try {
            url = new URL(value.trim());
        } catch (e) {
            showNotification(languageDB["js"]["noValidURL"], languageDB["js"]["error"]);

            return false;
        }

        let youtube = false;
        let valid = false;
        let broken = false;

        for (const domain of generateDomainVariations(url)) {
            if (domain === "youtube") {
                url = match(url, "http(?:s?):\\/\\/(?:www\\.|music\\.)?youtu(?:be\\.com\\/watch\\?v=|be\\.com\\/playlist\\?list=|\\.be\\/)([\\w\\-\\_]*)(&(amp;)?‌​[\\w\\?‌​=]*)?");

                valid = true;
                youtube = true;

                break;
            }

            if (extractors.includes(domain)) {
                valid = true;
                break;
            }

            if (brokenExtractors.includes(domain)) {
                broken = true;
                break;
            }
        }

        if (broken) {
            showNotification(languageDB["js"]["brokenURL"], languageDB["js"]["error"]);

            return false;
        }

        if (!valid) {
            showNotification(languageDB["js"]["noValidURL"], languageDB["js"]["error"]);

            return false;
        }

        if (urlList.includes(url.toString()) ||
            Array.from(pendingUrlItems.values()).some((item) => item.isConnected && item.getAttribute("data-url") === url.toString())) {
            showNotification(languageDB["js"]["urlInList"], languageDB["js"]["error"]);

            return false;
        }

        const li = createUrlListItem(url.toString());
        ul.appendChild(li);

        if (isPlaylistUrl(url.toString())) {
            urlList.push(url.toString());
            resolvePlaylist(li);
        } else if (youtube) {
            const requestId = ++nextPendingUrlId;
            pendingUrlItems.set(requestId, li);
            worker.postMessage({
                type: "checkPremium", url: url.toString(), mode: getCookie("mode"), requestId
            });
        } else {
            urlList.push(url.toString());
        }

        // The live batch observes new list items immediately. An unresolved
        // playlist remains a placeholder until its lookup finishes.
        if (downloading) enqueueDownloadSource(li);
    }

    if (ul.scrollHeight > ul.clientHeight) {
        ul.style.width = "calc(100% + 10px)";
    } else {
        ul.style.width = "100%";
    }

    ul.scrollTop = ul.scrollHeight;

    showNotification(values.length === 1 ? languageDB["js"]["urlAdded"] : languageDB["js"]["urlsAdded"], languageDB["js"]["success"]);

    return true;
}

// TODO: Comment
export function removeActiveListItems() {
    let ul = document.querySelector(".listBox ul");
    let actives = ul.querySelectorAll(":scope > li.active");

    if (actives) {
        for (let active of actives) {
            let url = active.getAttribute("data-url");

            delete specificSettings[url];

            let index = urlList.indexOf(url);
            if (index !== -1) {
                urlList.splice(index, 1);
            }

            for (const [pendingId, item] of pendingUrlItems) {
                if (item === active) {
                    pendingUrlItems.delete(pendingId);
                }
            }

            removeDownloadSource(active);
            cancelPlaylistLookup(active);
            active.remove();
        }
    }

    if (ul.scrollHeight > ul.clientHeight) {
        ul.style.width = "calc(100% + 10px)";
    } else {
        ul.style.width = "100%";
    }

    updateSelected();
}

/*
 * Funktion: showNotification()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  message: (String) Definiert die Nachricht in der Benachrichtigung
 *  time: (Integer) Definiert wie lange die Benachrichtigung angezeigt werden soll
 *
 * Animiert eine Benachrichtigung in die Anzeige
 * Wenn der Player angezeigt wird, wird die Benachrichtigung darüber angezeigt, sonst ganz unten
 */
export function showNotification(message, title = "Info", time = 3000) {
    if (document.hidden) {
        ipcRenderer.send("show_notification", title, message);
        return;
    }

    let notifications = document.getElementsByClassName("notification");

    for (let notification of notifications) {
        let notificationStyle = window.getComputedStyle(notification);
        let notificationPosition = notification.getBoundingClientRect();

        let bottom = Number(notificationStyle.bottom.replaceAll("px", ""));

        notification.style.bottom = bottom + notificationPosition.height + 5 + "px";
    }

    let notification = document.createElement("div");

    notification.classList.add("notification");

    notification.textContent = message;
    notification.style.left = "10px";

    document.body.appendChild(notification);

    let timeoutOpacity;

    notification.animateCallback([{opacity: 0}, {opacity: 1}], {
        duration: 100, fill: "forwards"
    }, () => {
        timeoutOpacity = setTimeout(() => removeOpacityNotification(notification), time);
    });

    notification.onmouseover = () => clearTimeout(timeoutOpacity);
    notification.onmouseout = () => removeOpacityNotification(notification);
}

/*
 * Funktion: removeOpacityNotification()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  notification: (Object) Definiert die Benachrichtigung
 *
 * Entfernt die Sichtbarkeit von einer Benachrichtigung
 * Entfernt die Benachrichtigung nach Schluss
 */
function removeOpacityNotification(notification) {
    notification.animateCallback([{opacity: 1}, {opacity: 0}], {
        duration: 100, fill: "forwards"
    }, () => notification.remove());
}

// TODO: Comment
function match(string, regex) {
    let regExp = new RegExp(regex, "gi");
    let found = string.toString().match(regExp);

    return found ? found[0] : null;
}

// TODO: Comment
export function selectClick(element) {
    let select = element;

    if (!element.classList.contains("select")) {
        select = element.closest(".select");
    }

    let label = select.previousElementSibling;

    if (select.classList.contains("active")) {
        select.classList.remove("active");

        if (select.classList.contains("top")) {
            select.classList.remove("top");
            label.classList.remove("hidden");
        }

        for (let element of hiddenElements) {
            element.classList.remove("hidden");
        }

        hiddenElements = [];
    } else {
        let options = select.querySelectorAll(".option");
        let option = options[0];

        let computedStyle = window.getComputedStyle(option, null);

        let optionHeight = getNumber(computedStyle.height) + getNumber(computedStyle.padding) * 2;

        let optionCount = options.length;
        let optionsHeight = optionHeight * optionCount;

        optionsHeight = optionsHeight > 100 ? 100 : optionsHeight;

        let clientRectSelect = select.getClientRects()[0];
        let clientRectBody = document.body.getClientRects()[0];

        if ((clientRectBody.height - 20) - clientRectSelect.bottom < optionsHeight) {
            select.classList.add("top");
            label.classList.add("hidden");
        }

        let nextElement = select.parentElement;
        let height = 0;

        let interval = setInterval(() => {
            let row = nextElement.closest(".row");

            if (row) {
                nextElement = row;
            }

            if (select.classList.contains("top")) {
                nextElement = nextElement.previousElementSibling;
            } else {
                nextElement = nextElement.nextElementSibling;
            }

            if (nextElement) {
                let rect = nextElement.getBoundingClientRect();
                let style = getComputedStyle(nextElement);

                height += rect.height;

                if (style.opacity !== "0") {
                    hiddenElements.push(nextElement);
                }

                if (height > 60) {
                    clearInterval(interval);

                    for (let element of hiddenElements) {
                        element.classList.add("hidden");
                    }
                }
            } else {
                clearInterval(interval);

                for (let element of hiddenElements) {
                    element.classList.add("hidden");
                }
            }
        });

        select.classList.add("active");
    }
}

// TODO: Comment
export function hideSelect(element) {
    let select = element;

    if (!element.classList.contains("select")) {
        select = element.closest(".select");
    }

    select.classList.remove("active");
    select.classList.remove("top");
}

// TODO: Comment
export async function loadExtractors() {
    extractors = JSON.parse(getCookie("extractors", "[]"));
    brokenExtractors = JSON.parse(getCookie("brokenExtractors", "[]"));

    extractors.push("x.com");
}

// TODO: Comment
export async function setExtractors() {
    let result = spawnSync(ytDl + " --list-extractors", {
        shell: true
    }).stdout.toString().trim();

    result = result.split("\n");

    const extractors = [];
    const brokenExtractors = [];

    for (let i = 0; i < result.length; i++) {
        const extractor = result[i]
            .split(":")[0]
            .split("(")[0]
            .trim()
            .toLowerCase();

        const isBroken = result[i].includes("CURRENTLY BROKEN");

        if (!extractors.includes(extractor) && !brokenExtractors.includes(extractor)) {
            isBroken ? brokenExtractors.push(extractor) : extractors.push(extractor);
        }
    }

    if (extractors.length) {
        setCookie("brokenExtractors", JSON.stringify(brokenExtractors));

        setCookie("extractors", JSON.stringify(extractors));
    }
}

function upgradeDeno(denoPath) {
    const result = spawnSync(denoPath, ["upgrade"], {
        input: "y\n", stdio: ["pipe", "pipe", "pipe"]
    });

    const stdout = result.stdout?.toString() ?? "";
    const stderr = result.stderr?.toString() ?? "";

    console.log("stdout:\n", stdout);
    console.log("stderr:\n", stderr);

    if (result.status === 0) {
        console.log("Deno upgraded successfully.");
        return true;
    }

    console.warn("Deno upgrade failed.");

    return false;
}

function installDeno() {
    const denoInstallation = getCookie("deno");

    if (denoInstallation && denoInstallation.length) {
        return denoInstallation;
    }

    const platform = process.platform;

    let result;

    if (platform === "win32") {
        // Windows PowerShell installer
        result = spawnSync("C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe", ["-Command", "irm https://deno.land/install.ps1 | iex"], {
            stdio: "pipe"
        });
    } else if (platform === "linux" || platform === "darwin") {
        // Linux / macOS installer (curl | sh)
        result = spawnSync("/bin/sh", ["-c", "curl -fsSL https://deno.land/install.sh | sh"], {
            stdio: "pipe"
        });
    } else {
        console.warn("Unsupported platform:", platform);

        return null;
    }

    const stdout = result.stdout?.toString() ?? "";
    const stderr = result.stderr?.toString() ?? "";

    console.log("stdout:\n", stdout);
    console.log("stderr:\n", stderr);

    // Cross-platform path extraction:
    // Windows: ...deno.exe
    // Linux/Mac: ...deno
    const match = stdout.match(/Deno was installed successfully to (.+deno(?:\.exe)?)/i);

    if (match && match[1]) {
        const denoPath = match[1].trim();

        console.log("Deno installed at:", denoPath);

        setCookie("deno", denoPath);

        return denoPath;
    }

    console.warn("Deno installation output did not contain a path.");

    return null;
}

function initializeDeno() {
    if (denoInitialized) {
        return;
    }

    denoInitialized = true;

    denoPath = installDeno();

    if (denoPath && denoPath.length) {
        upgradeDeno(denoPath);
    } else {
        console.warn("Couldn't find or install Deno, some YouTube formats may not work properly.");
    }
}

// TODO: Comment
async function downloadURL(item, batch, job) {
    if (aborted || batch.stopped) {
        return "aborted";
    }

    const {mode, location, url, codecAudio, codecVideo, quality} = item;
    const commonArgs = ["--no-check-formats", "--no-check-certificates", "--extractor-args", "youtube:player_client=default,web_safari;player_js_version=actual"];

    const premium = JSON.parse(getCookie("premium"));

    if (isYouTubeUrl(url) && premium && premium.check) {
        if (premium.browser && premium.browser.length) {
            if (process.platform !== "win32" || premium.browser !== "chrome") {
                commonArgs.push("--cookies-from-browser", premium.browser);
            } else {
                console.warn("Chrome is currently not supported on Windows for extracting cookies, continuing");
            }
        } else {
            showNotification(languageDB["js"]["noBrowser"]);
            return null;
        }
    }

    /*
     * Deno is installed/found and updated once during startup.
     * Downloads only reuse the already resolved executable path.
     */
    if (denoPath && denoPath.length) {
        commonArgs.push("--js-runtimes", "deno:" + denoPath);
    }

    // A successful title lookup is reused if the actual download needs a retry.
    if (job.title === null) {
        const metadata = await getTitle(url, mode, batch, commonArgs);

        if (metadata.status !== "success") {
            return metadata.status;
        }

        job.title = metadata.title;
    }

    if (aborted || batch.stopped) {
        return "aborted";
    }

    console.debug(job.title);

    const outputPath = path.resolve(location, job.title);
    const outputKey = process.platform === "linux" ? outputPath : outputPath.toLowerCase();

    // Two different URLs can produce the same title. Serialize those outputs
    // so concurrent yt-dlp/ffmpeg processes never write the same partial file.
    const previousOutput = batch.outputLocks.get(outputKey) || Promise.resolve();
    let releaseOutput;
    const outputLock = new Promise((finish) => {
        releaseOutput = finish;
    });

    batch.outputLocks.set(outputKey, outputLock);
    await previousOutput;

    try {
        if (aborted || batch.stopped) {
            return "aborted";
        }

        // Arguments are passed directly, preserving spaces and URL ampersands.
        // Literal percent characters must still be escaped for yt-dlp templates.
        const config = [...commonArgs, "-o", outputPath.replace(/%/g, "%%") + ".%(ext)s", "-N", "2", "--newline", "--progress"];

        if (ffmpeg) {
            config.push("--ffmpeg-location", executablePath(ffmpeg));
        }

        if (mode === "audio") {
            config.push("--extract-audio");
            config.push("--audio-format", codecAudio);
            config.push("--audio-quality", String(quality));

            if (["mp3", "aac", "flac"].includes(codecAudio)) {
                config.push("--embed-thumbnail");
            }
        } else {
            config.push("-S", "vcodec:" + codecVideo);
            config.push("--embed-thumbnail");
            config.push("--audio-format", "mp3");
            config.push("--audio-quality", "9");
            config.push("--merge-output-format", "mp4");
        }

        config.push("--", url);

        const result = await runYtDlp(config, batch, (progress) => {
            // Reserve 100% for completed postprocessing and a successful exit.
            batch.progress.set(item.jobId, Math.max(batch.progress.get(item.jobId) || 0, Math.min(0.99, progress)));
            updateDownloadProgress(batch, item.jobId);
        });

        return result.status;
    } finally {
        releaseOutput();

        if (batch.outputLocks.get(outputKey) === outputLock) {
            batch.outputLocks.delete(outputKey);
        }
    }
}

// TODO: Comment
export function setDisabled() {
    let listBox = document.getElementsByClassName("listBox")[0];
    let location = document.querySelector(".location #location");

    let buttons = document.querySelectorAll("button:not(.abort-button):not(.location-button):not(.theme-toggler):not(.playlist-toggle)");

    let abortButton = document.querySelector(".abort-button");
    let input = document.querySelector("input:not(#location)");

    listBox.ariaDisabled = "true";
    location.ariaDisabled = "true";

    input.ariaDisabled = "true";
    input.setAttribute("readonly", "readonly");

    for (let button of buttons) {
        button.ariaDisabled = "true";
    }

    abortButton.ariaDisabled = "false";
}

// TODO: Comment
export function setEnabled() {
    let listBox = document.getElementsByClassName("listBox")[0];
    let location = document.querySelector(".location #location");

    let buttons = document.querySelectorAll("button:not(.abort-button):not(.location-button):not(.theme-toggler):not(.playlist-toggle)");

    let abortButton = document.querySelector(".abort-button");
    let input = document.querySelector("input:not(#location)");

    listBox.ariaDisabled = "false";
    location.ariaDisabled = "false";

    input.ariaDisabled = "false";
    input.removeAttribute("readonly");

    for (let button of buttons) {
        button.ariaDisabled = "false";
    }

    abortButton.ariaDisabled = "true";
}

// TODO: Comment
export function selectOption(option) {
    if (!option) {
        return;
    }

    let select = option.closest(".select");
    let button = select.querySelector("div");

    let selected = select.querySelector("[aria-selected=\"true\"]");

    selected.ariaSelected = "false";
    option.ariaSelected = "true";

    button.textContent = option.textContent;

    select.setAttribute("data-value", option.getAttribute("data-value"));

    toggleVisibility();
}

// TODO: Comment
function toggleVisibility() {
    let mode = document.querySelector("settings .mode .select");
    let value = mode.getAttribute("data-value");

    let audioSettings = document.querySelectorAll("settings .audioSettings");

    let videoSettings = document.querySelectorAll("settings .videoSettings");

    if (value === "audio") {
        videoSettings.forEach((element) => {
            element.classList.remove("visible");
        });

        audioSettings.forEach((element) => {
            element.classList.add("visible");
        });
    } else {
        audioSettings.forEach((element) => {
            element.classList.remove("visible");
        });

        videoSettings.forEach((element) => {
            element.classList.add("visible");
        });
    }
}

// TODO: Comment
export function saveSettings() {
    const save = document.querySelector("settings #save");

    if (save.classList.contains("active")) {
        const mode = document.querySelector("settings .mode .select");

        const quality = document.querySelector("settings .quality .select");

        const codecAudio = document.querySelector("settings .codecAudio .select");

        const codecVideo = document.querySelector("settings .codecVideo .select");

        const closeToTray = document.querySelector("settings #closeToTray");

        const startMinimized = document.querySelector("settings #startMinimized");

        const autostart = document.querySelector("settings #autostart");

        const clearList = document.querySelector("settings #clearList");

        const premiumCheck = document.querySelector("settings #premium");

        const saveLocation = document.querySelector("settings #saveLocation");

        const premiumBrowser = document.querySelector("settings #browser");

        setCookie("mode", mode.getAttribute("data-value"));

        setCookie("quality", quality.getAttribute("data-value"));

        setCookie("codecAudio", codecAudio.getAttribute("data-value"));

        setCookie("codecVideo", codecVideo.getAttribute("data-value"));

        setCookie("save", true);

        setCookie("closeToTray", closeToTray.classList.contains("active"));

        setCookie("startMinimized", startMinimized.classList.contains("active"));

        setCookie("autostart", autostart.classList.contains("active"));

        setCookie("clearList", clearList.classList.contains("active"));

        setCookie("saveLocation", saveLocation.classList.contains("active"));

        setCookie("premium", JSON.stringify({
            browser: premiumBrowser.getAttribute("data-value"), check: premiumCheck.classList.contains("active")
        }));
    }
}

// TODO: Comment
export function deleteSettings() {
    setCookie("mode", "");
    setCookie("quality", "");
    setCookie("codecAudio", "");
    setCookie("codecVideo", "");

    setCookie("save", false);
    setCookie("closeToTray", false);
    setCookie("startMinimized", false);
    setCookie("autostart", false);

    setCookie("premium", JSON.stringify({
        browser: null, check: false
    }));

    setCookie("clearList", false);
    setCookie("saveLocation", false);
}

// TODO: Comment
export function loadSettings() {
    const mode = document.querySelector("settings .mode .select");

    const quality = document.querySelector("settings .quality .select");

    const codecAudio = document.querySelector("settings .codecAudio .select");

    const codecVideo = document.querySelector("settings .codecVideo .select");

    const lang = document.querySelector("settings .lang .select");

    const modeValue = getCookie("mode");
    const qualityValue = getCookie("quality");
    const codecAudioValue = getCookie("codecAudio");
    const codecVideoValue = getCookie("codecVideo");
    const langValue = getCookie("lang");

    const save = getCookie("save");
    const closeToTray = getCookie("closeToTray");
    const startMinimized = getCookie("startMinimized");
    const autostart = getCookie("autostart");

    const premium = JSON.parse(getCookie("premium"));

    const clearList = getCookie("clearList");
    const saveLocation = getCookie("saveLocation");

    let option;

    if (modeValue) {
        option = mode.querySelector("[data-value=\"" + modeValue + "\"]");

        selectOption(option);
    }

    if (qualityValue) {
        option = quality.querySelector("[data-value=\"" + qualityValue + "\"]");

        selectOption(option);
    }

    if (codecAudioValue) {
        option = codecAudio.querySelector("[data-value=\"" + codecAudioValue + "\"]");

        selectOption(option);
    }

    if (codecVideoValue) {
        option = codecVideo.querySelector("[data-value=\"" + codecVideoValue + "\"]");

        selectOption(option);
    }

    if (langValue) {
        option = lang.querySelector("[data-value=\"" + langValue + "\"]");

        selectOption(option);
    }

    const saving = document.querySelector("settings .save");

    if (save) {
        saving.querySelector("#save").classList.add("active");
        saving.querySelector("span").textContent = languageDB["js"]["on"];
    } else {
        saving.querySelector("span").textContent = languageDB["js"]["off"];
    }

    const closingToTray = document.querySelector("settings .closeToTray");

    if (closeToTray) {
        closingToTray
            .querySelector("#closeToTray")
            .classList.add("active");

        closingToTray.querySelector("span").textContent = languageDB["js"]["on"];
    } else {
        closingToTray.querySelector("span").textContent = languageDB["js"]["off"];
    }

    const startingMinimized = document.querySelector("settings .startMinimized");

    if (startMinimized) {
        startingMinimized
            .querySelector("#startMinimized")
            .classList.add("active");

        startingMinimized.querySelector("span").textContent = languageDB["js"]["on"];
    } else {
        startingMinimized.querySelector("span").textContent = languageDB["js"]["off"];
    }

    const autostarting = document.querySelector("settings .autostart");

    if (autostart) {
        autostarting
            .querySelector("#autostart")
            .classList.add("active");

        autostarting.querySelector("span").textContent = languageDB["js"]["on"];
    } else {
        autostarting.querySelector("span").textContent = languageDB["js"]["off"];
    }

    const clearListing = document.querySelector("settings .clearList");

    if (clearList) {
        clearListing
            .querySelector("#clearList")
            .classList.add("active");

        clearListing.querySelector("span").textContent = languageDB["js"]["on"];
    } else {
        clearListing.querySelector("span").textContent = languageDB["js"]["off"];
    }

    const savingLocation = document.querySelector("settings .saveLocation");

    if (saveLocation) {
        savingLocation
            .querySelector("#saveLocation")
            .classList.add("active");

        savingLocation.querySelector("span").textContent = languageDB["js"]["on"];
    } else {
        savingLocation.querySelector("span").textContent = languageDB["js"]["off"];
    }

    const premiumCheck = document.querySelector("settings .premium");

    const premiumBrowser = document.querySelector("settings .browser");

    if (premium && typeof premium != "undefined" && (premium["check"] ?? false)) {
        premiumCheck
            .querySelector("#premium")
            .classList.add("active");

        premiumCheck.querySelector("span").textContent = languageDB["js"]["on"];

        if (typeof premium["browser"] != "undefined" && premium["browser"] != null) {
            option = premiumBrowser.querySelector("[data-value=\"" + premium["browser"] + "\"]");

            selectOption(option);
        }
    } else {
        premiumCheck.querySelector("span").textContent = languageDB["js"]["off"];
    }
}

// TODO: Comment
export async function showChangelog(update = false) {
    let info = document.getElementById("info");
    let dynamic = info.querySelector("#dynamic");

    if (dynamic.innerHTML === "") {
        await loadInfo();
    }

    if (update) {
        let title = info.querySelector("#title");
        title.classList.remove("hidden");
    }

    document.body.style.overflow = "hidden";
    info.classList.add("show");
}

async function loadLanguage(language) {
    language = language
        .toLowerCase()
        .split("-")[0];

    return fetch("assets/db/language." + language + ".json")
        .then(response => {
            return response.json();
        })
        .then(jsonData => {
            languageDB = jsonData;

            return languageDB;
        });
}

// TODO: Comment
export async function initialize() {
    /*
     * Resolve/install Deno and run its update check once when the
     * application starts. Downloads reuse the cached path afterwards.
     */
    initializeDeno();

    await loadExtractors();

    let cookie = getCookie("lang");

    if (cookie) {
        selectedLang = cookie;

        await loadLanguage(selectedLang);
    } else {
        for (let language of navigator.languages) {
            await loadLanguage(language)
                .then(() => selectedLang = language)
                .catch(() => null);
        }

        if (!selectedLang) {
            selectedLang = "en";

            await loadLanguage(selectedLang);
        }

        setCookie("lang", selectedLang);
    }

    document.body.innerHTML = mustache.render(document.body.innerHTML, languageDB);

    let main = document.getElementsByTagName("main")[0];

    await loadPage("assets/template/main.html", main, () => {
        setThemeIcon();

        if (getCookie("update") !== false) {
            setCookie("update", false);
            showChangelog(true);
        }
    });
}

// TODO: Comment
export function updateYtDl(administrator = false) {
    let update = true;
    let error = false;

    console.debug("Checking for yt-dlp update");

    if (administrator) {
        childProcess = exec(elevate + " " + ytDl + " -U");
    } else {
        showNotification(languageDB["js"]["libUpdate"]);

        setDisabled();

        childProcess = exec(ytDl + " -U");
    }

    childProcess.stdout.on("data", (data) => {
        console.debug(data);

        data = data.toLowerCase();

        if (data.includes("yt-dlp is up to date")) {
            update = false;
            terminate(childProcess.pid);
        }
    });

    childProcess.stderr.on("data", (data) => {
        error = true;

        console.debug("Error start:");
        console.debug(data);
        console.debug("Error end!");

        data = data.toLowerCase();

        if (data.includes("administrator") && !administrator) {
            updateYtDl(true);
            return;
        }

        if (data.includes("to remove") && !administrator) {
            updateYtDl(true);
            return;
        }

        if (administrator) {
            showNotification(languageDB["js"]["adminPermission"], languageDB["js"]["error"]);

            return;
        }

        showNotification(languageDB["js"]["unexpectedError"], languageDB["js"]["error"]);

        setEnabled();
    });

    childProcess.on("close", () => {
        if (error) {
            return;
        }

        if (update || !extractors || !extractors.length) {
            setExtractors().then(() => {
                setEnabled();

                showNotification(languageDB["js"]["libUpdated"]);
            });
        } else {
            showNotification(languageDB["js"]["libUptoDate"]);

            setEnabled();
        }
    });
}

// TODO: Comment
export async function loadPage(pageURL, element, callback = () => {
}) {
    await fetch(pageURL)
        .then(response => {
            return response.text();
        })
        .then(htmlData => {
            let template = new DOMParser()
                .parseFromString(htmlData, "text/html").body;

            let scripts = template.getElementsByTagName("script");

            scripts = Object.assign([], scripts);

            for (let script of scripts) {
                let scriptTag = document.createElement("script");

                scriptTag.type = "module";
                scriptTag.src = script.src;

                element.appendChild(scriptTag);

                script.parentElement.removeChild(script);
            }

            element.innerHTML += mustache.render(template.innerHTML, languageDB);

            callback();
        });
}

// TODO: Comment
export function setThemeIcon() {
    let themeInterval = setInterval(() => {
        let icons = document.querySelectorAll(".theme-toggler svg");

        if (icons.length) {
            clearInterval(themeInterval);

            for (let icon of icons) {
                if (theme === "light") {
                    icon.classList.add("fa-moon");
                } else {
                    icon.classList.add("fa-sun");
                }
            }
        }
    }, 50);
}

// TODO: Comment
function getNumber(string) {
    return Number(string.match(/\d+/));
}

// TODO: Comment
function clearTitle(URLInfo, mode) {
    let hasArtist = "artist" in URLInfo && URLInfo["artist"] !== null && mode === "audio";

    let hasChannel = "channel" in URLInfo && URLInfo["channel"] !== null;

    if (hasArtist && URLInfo["artist"] === "NA") {
        if (URLInfo["title"].includes(" - ")) {
            const songInfo = URLInfo["title"].split(" - ");

            URLInfo["artist"] = songInfo[0];
            URLInfo["title"] = songInfo[1];
        } else if (hasChannel && URLInfo["channel"] !== "NA") {
            URLInfo["artist"] = URLInfo["channel"];
        } else {
            hasArtist = false;
        }
    }

    let title = (hasArtist ? URLInfo["artist"] + " - " + URLInfo["title"] : URLInfo["title"])
        .replace(ytFilter, "")
        .trim();

    title = title.replace(/[\\/|:*"?<>]/g, "_");

    title = title.replace(/\s{2,}/g, " ");

    title = title.replace(/\(\)/g, "");

    return title.trim();
}

// TODO: Comment
export function setTheme(themeSet) {
    theme = themeSet;

    setCookie("theme", themeSet);
}

// TODO: Comment
function addLeadingZero(string, size) {
    let count = Number(size) - string.toString().length;

    for (let i = 0; i < count; i++) {
        string = "0" + string;
    }

    return string;
}

// TODO: Comment
async function loadInfo() {
    let dynamic = document.querySelector("#info #dynamic");

    await fetch("https://api.github.com/repos/BERNARDO31P/FastDownloader/releases?per_page=10")
        .then(response => {
            return response.json();
        })
        .then(htmlData => {
            for (let tag of htmlData) {
                let date = new Date(tag.published_at);

                let day = addLeadingZero(date.getUTCDate(), 2);

                let month = addLeadingZero(date.getUTCMonth() + 1, 2);

                let year = addLeadingZero(date.getUTCFullYear(), 4);

                let title = document.createElement("h3");

                title.textContent = tag.tag_name + " - " + day + "." + month + "." + year;

                dynamic.appendChild(title);

                let infos = tag.body.split("\r\n");

                infos = infos.filter(n => n);
                infos.shift();

                let infoBox = document.createElement("div");

                for (let info of infos) {
                    let infoText = document.createElement("p");

                    infoText.innerHTML = info;

                    infoBox.appendChild(infoText);
                }

                dynamic.appendChild(infoBox);
            }
        });
}