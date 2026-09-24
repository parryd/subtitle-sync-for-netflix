// Standalone extension page for granting folder access. This deliberately
// lives outside the popup: Chrome extension popups close as soon as they
// lose focus, and opening a native directory-picker dialog does exactly
// that, which can abort the picker mid-flow. A regular extension page
// (opened as its own tab) doesn't have that problem.

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

async function idbSet(key, value) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
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

const chooseFolderBtn = document.getElementById('chooseFolderBtn');
const folderInfo = document.getElementById('folderInfo');
const folderNameEl = document.getElementById('folderName');
const folderStatusEl = document.getElementById('folderStatus');
const folderChangeBtn = document.getElementById('folderChangeBtn');
const folderStopBtn = document.getElementById('folderStopBtn');

function showConfigured(name, status) {
  chooseFolderBtn.hidden = true;
  folderInfo.hidden = false;
  folderNameEl.textContent = name;
  folderNameEl.title = name;
  folderStatusEl.textContent = status;
}

function showUnconfigured() {
  chooseFolderBtn.hidden = false;
  folderInfo.hidden = true;
}

async function describeFolder(handle) {
  try {
    const names = await listSubtitleFiles(handle);
    return `${names.length} subtitle file${names.length === 1 ? '' : 's'} found`;
  } catch (err) {
    return 'Ready';
  }
}

async function pickAndStore() {
  const handle = await window.showDirectoryPicker();
  await idbSet(FOLDER_KEY, handle);
  showConfigured(handle.name, await describeFolder(handle));
}

async function init() {
  if (!window.showDirectoryPicker) {
    chooseFolderBtn.hidden = true;
    folderInfo.hidden = true;
    document.querySelector('.hint').textContent =
      'Your Chrome version does not support folder access for extensions. Update Chrome to use this feature.';
    return;
  }

  let handle;
  try {
    handle = await idbGet(FOLDER_KEY);
  } catch (err) {
    handle = null;
  }

  if (!handle) {
    showUnconfigured();
    return;
  }

  const granted = await ensurePermission(handle, true);
  if (!granted) {
    showConfigured(handle.name, 'Access was not granted — try Change folder');
    return;
  }
  showConfigured(handle.name, await describeFolder(handle));
}

chooseFolderBtn.addEventListener('click', () => {
  pickAndStore().catch(() => {
    /* user cancelled the picker */
  });
});

folderChangeBtn.addEventListener('click', () => {
  pickAndStore().catch(() => {
    /* user cancelled the picker */
  });
});

folderStopBtn.addEventListener('click', async () => {
  await idbDelete(FOLDER_KEY);
  showUnconfigured();
});

init();
