// Runs the subtitle-folder auto-match in the background, without needing
// the popup open. Only possible here because permission on a
// FileSystemDirectoryHandle can be *queried* (not requested fresh) from a
// service worker with no user gesture -- so this only ever acts when
// permission was already granted earlier via folder-settings.html. If
// that permission has lapsed, this quietly does nothing and the popup's
// own "click to reconnect" flow still handles it.

importScripts('folderMatcher.js');

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

async function tryAutoMatch(title) {
  if (!title) return;

  const libData = await new Promise((resolve) =>
    chrome.storage.local.get(['subtitleLibrary'], resolve)
  );
  const library = libData.subtitleLibrary || {};
  if (library[title]) return; // already have a file for this exact episode

  let handle;
  try {
    handle = await idbGet(FOLDER_KEY);
  } catch (err) {
    return;
  }
  if (!handle) return; // no folder configured

  let granted = false;
  try {
    granted = (await handle.queryPermission({ mode: 'read' })) === 'granted';
  } catch (err) {
    return;
  }
  if (!granted) return; // can't silently prompt from here; popup's reconnect flow handles this

  try {
    const names = await listSubtitleFiles(handle);
    const match = pickBestMatch(title, names);
    if (!match) return;

    const text = await readFileFromFolder(handle, match);
    library[title] = { text, name: match };
    chrome.storage.local.set({
      subtitleText: text,
      subtitleName: match,
      subtitleLibrary: library,
    });
  } catch (err) {
    // Folder may have been moved/deleted since -- fail quietly.
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.detectedTitle && changes.detectedTitle.newValue) {
    tryAutoMatch(changes.detectedTitle.newValue);
  }
});
