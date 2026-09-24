const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const fileInfo = document.getElementById('fileInfo');
const fileNameEl = document.getElementById('fileName');
const fileLinesEl = document.getElementById('fileLines');
const clearBtn = document.getElementById('clearBtn');

const enabledCheckbox = document.getElementById('enabled');
const offsetValueEl = document.getElementById('offsetValue');
const offsetMinusBtn = document.getElementById('offsetMinus');
const offsetPlusBtn = document.getElementById('offsetPlus');
const fontSizeInput = document.getElementById('fontSize');
const fontSizeValueEl = document.getElementById('fontSizeValue');
const fontPreviewEl = document.getElementById('fontPreview');

const nowPlayingEl = document.getElementById('nowPlaying');
const nowPlayingTitleEl = document.getElementById('nowPlayingTitle');
const searchSubtitlesLink = document.getElementById('searchSubtitlesLink');

const chooseFolderBtn = document.getElementById('chooseFolderBtn');
const folderInfo = document.getElementById('folderInfo');
const folderNameEl = document.getElementById('folderName');
const folderStatusEl = document.getElementById('folderStatus');
const folderManageBtn = document.getElementById('folderManageBtn');
const folderStopBtn = document.getElementById('folderStopBtn');

let offset = 0;
let currentDetectedTitle = null;

function showNowPlaying(title) {
  if (!title) {
    nowPlayingEl.hidden = true;
    return;
  }
  nowPlayingEl.hidden = false;
  nowPlayingTitleEl.textContent = title;
  nowPlayingTitleEl.title = title;
  searchSubtitlesLink.href =
    'https://www.google.com/search?q=' + encodeURIComponent(title + ' subtitles srt');
}

function formatOffset(o) {
  return (o >= 0 ? '+' : '') + o.toFixed(1) + 's';
}

function showFile(name, cueCount) {
  dropzone.hidden = true;
  fileInfo.hidden = false;
  fileNameEl.textContent = name;
  fileNameEl.title = name;
  fileLinesEl.textContent = `${cueCount} line${cueCount === 1 ? '' : 's'} loaded`;
}

function showEmpty() {
  dropzone.hidden = false;
  fileInfo.hidden = true;
}

function refreshStatus(name, cueCount) {
  if (!name) {
    showEmpty();
  } else {
    showFile(name, cueCount);
  }
}

async function loadFile(file) {
  if (!file) return;
  const text = await file.text();
  const cues = parseSubtitles(text);
  chrome.storage.local.set(
    { subtitleText: text, subtitleName: file.name },
    () => refreshStatus(file.name, cues.length)
  );

  // Remember this file against whatever title is currently detected, so
  // content.js can reapply it automatically if you come back to this same
  // episode later instead of showing whatever the last-viewed episode left
  // behind.
  if (currentDetectedTitle) {
    const title = currentDetectedTitle;
    chrome.storage.local.get(['subtitleLibrary'], (data) => {
      const library = data.subtitleLibrary || {};
      library[title] = { text, name: file.name };
      chrome.storage.local.set({ subtitleLibrary: library });
    });
  }
}

// -- Subtitle folder ---------------------------------------------------
// Lets you grant access to a folder of subtitle files once; on later
// visits (to this exact episode), a matching file is loaded automatically
// via folderMatcher.js instead of you picking it by hand each time. The
// directory handle is stored in IndexedDB (chrome.storage can't hold a
// FileSystemHandle) and Chrome persists the read permission for it across
// browser sessions on its own.

const IDB_NAME = 'subtitle-sync-folder';
const IDB_STORE = 'handles';
const FOLDER_KEY = 'subtitleFolderHandle';

function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbDelete(key) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function ensurePermission(handle, requestIfNeeded) {
  const opts = { mode: 'read' };
  if ((await handle.queryPermission(opts)) === 'granted') return true;
  if (!requestIfNeeded) return false;
  try {
    return (await handle.requestPermission(opts)) === 'granted';
  } catch (err) {
    return false;
  }
}

async function listSubtitleFiles(dirHandle) {
  const names = [];
  for await (const [name, entry] of dirHandle.entries()) {
    if (entry.kind === 'file' && /\.(srt|vtt)$/i.test(name)) {
      names.push(name);
    }
  }
  return names;
}

async function readFileFromFolder(dirHandle, name) {
  const fileHandle = await dirHandle.getFileHandle(name);
  const file = await fileHandle.getFile();
  return file.text();
}

function showFolderConfigured(name, status) {
  chooseFolderBtn.hidden = true;
  folderInfo.hidden = false;
  folderNameEl.textContent = name;
  folderNameEl.title = name;
  folderStatusEl.textContent = status;
}

function showFolderUnconfigured() {
  chooseFolderBtn.hidden = false;
  folderInfo.hidden = true;
}

// Loads a matching file from the folder for `title`, if any -- and, like a
// manual load, saves it into subtitleLibrary so content.js's per-episode
// reconciliation stays consistent either way.
async function applyFolderMatch(dirHandle, title) {
  const names = await listSubtitleFiles(dirHandle);
  const match = window.pickBestMatch(title, names);
  if (!match) return null;

  const text = await readFileFromFolder(dirHandle, match);
  const cues = parseSubtitles(text);
  chrome.storage.local.set({ subtitleText: text, subtitleName: match }, () => {
    refreshStatus(match, cues.length);
  });
  chrome.storage.local.get(['subtitleLibrary'], (data) => {
    const library = data.subtitleLibrary || {};
    library[title] = { text, name: match };
    chrome.storage.local.set({ subtitleLibrary: library });
  });
  return match;
}

// Only auto-fills when nothing's already loaded for this exact episode,
// so it never clobbers a manual pick you made on purpose.
async function maybeAutoMatch(dirHandle) {
  if (!currentDetectedTitle) return;
  const data = await new Promise((resolve) =>
    chrome.storage.local.get(['subtitleLibrary'], resolve)
  );
  const library = data.subtitleLibrary || {};
  if (library[currentDetectedTitle]) return;

  try {
    const match = await applyFolderMatch(dirHandle, currentDetectedTitle);
    if (match) {
      folderStatusEl.textContent = `Auto-loaded: ${match}`;
    }
  } catch (err) {
    // Folder may have been moved/deleted since -- fail quietly, manual
    // load still works.
  }
}

async function initFolder() {
  if (!window.showDirectoryPicker) {
    chooseFolderBtn.hidden = true;
    return;
  }

  let handle;
  try {
    handle = await idbGet(FOLDER_KEY);
  } catch (err) {
    handle = null;
  }

  if (!handle) {
    showFolderUnconfigured();
    return;
  }

  const granted = await ensurePermission(handle, false);
  if (!granted) {
    showFolderConfigured(handle.name, 'Access needed — click to reconnect');
    folderStatusEl.onclick = async () => {
      const ok = await ensurePermission(handle, true);
      if (ok) {
        showFolderConfigured(handle.name, 'Ready');
        folderStatusEl.onclick = null;
        await maybeAutoMatch(handle);
      }
    };
    return;
  }

  showFolderConfigured(handle.name, 'Ready');
  await maybeAutoMatch(handle);
}

// Choosing/changing the folder needs window.showDirectoryPicker(), which
// opens a native OS dialog -- and Chrome extension popups close the
// instant they lose focus, which a native dialog does immediately. So
// that action always opens the dedicated folder-settings page (a regular
// tab, which doesn't have this problem) instead of running here.
function openFolderSettings() {
  chrome.tabs.create({ url: chrome.runtime.getURL('folder-settings.html') });
}

chooseFolderBtn.addEventListener('click', openFolderSettings);
folderManageBtn.addEventListener('click', openFolderSettings);

folderStopBtn.addEventListener('click', async () => {
  await idbDelete(FOLDER_KEY);
  showFolderUnconfigured();
});

function init() {
  chrome.storage.local.get(
    ['subtitleText', 'subtitleName', 'enabled', 'offset', 'fontSize', 'detectedTitle'],
    (data) => {
      enabledCheckbox.checked = data.enabled !== false;

      offset = typeof data.offset === 'number' ? data.offset : 0;
      offsetValueEl.textContent = formatOffset(offset);

      const fontSize = typeof data.fontSize === 'number' ? data.fontSize : 28;
      fontSizeInput.value = fontSize;
      updateFontPreview(fontSize);

      const cueCount = data.subtitleText ? parseSubtitles(data.subtitleText).length : 0;
      refreshStatus(data.subtitleName, cueCount);

      currentDetectedTitle = data.detectedTitle || null;
      showNowPlaying(currentDetectedTitle);

      initFolder();
    }
  );
}

fileInput.addEventListener('change', (e) => loadFile(e.target.files[0]));

['dragenter', 'dragover'].forEach((evt) =>
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.add('drag-over');
  })
);
['dragleave', 'drop'].forEach((evt) =>
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.remove('drag-over');
  })
);
dropzone.addEventListener('drop', (e) => loadFile(e.dataTransfer.files[0]));

enabledCheckbox.addEventListener('change', () => {
  chrome.storage.local.set({ enabled: enabledCheckbox.checked });
});

function setOffset(newOffset) {
  offset = Math.round(newOffset * 10) / 10;
  offsetValueEl.textContent = formatOffset(offset);
  chrome.storage.local.set({ offset });
}

offsetMinusBtn.addEventListener('click', () => setOffset(offset - 0.5));
offsetPlusBtn.addEventListener('click', () => setOffset(offset + 0.5));
offsetValueEl.addEventListener('click', () => setOffset(0));

function updateFontPreview(size) {
  fontPreviewEl.style.fontSize = Math.min(size, 32) + 'px';
  fontSizeValueEl.textContent = size + 'px';
}

fontSizeInput.addEventListener('input', () => {
  const size = parseInt(fontSizeInput.value, 10);
  updateFontPreview(size);
  chrome.storage.local.set({ fontSize: size });
});

clearBtn.addEventListener('click', () => {
  chrome.storage.local.remove(['subtitleText', 'subtitleName'], () => {
    refreshStatus(null, 0);
  });
  fileInput.value = '';
});

init();
