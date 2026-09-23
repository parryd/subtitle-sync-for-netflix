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

let offset = 0;

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
}

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

      showNowPlaying(data.detectedTitle || null);
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
