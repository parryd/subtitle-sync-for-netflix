(function () {
  let cues = [];
  let enabled = true;
  let offset = 0; // seconds added to video.currentTime before lookup, for sync adjustment
  let fontSize = 28;

  let videoEl = null;
  let overlay = null;
  let playerContainer = null;
  let detectedTitle = null;

  const CONTROLS_SELECTOR = '.watch-video--bottom-controls-container';

  // Netflix has changed these attributes before, so try a few in order
  // and fall back to null (search link just stays hidden) rather than
  // guessing at obfuscated class names.
  const TITLE_SELECTORS = [
    '[data-uia="video-title"]',
    '[data-uia="player-title"]',
    '[data-uia="previewModal--player-titleTreatment-logo"]',
  ];

  // Netflix renders "Show Name", "E7", "Episode Title" as separate
  // sibling elements with no whitespace text node between them, so plain
  // el.textContent runs them together (e.g. "Show NameE7Episode Title").
  // Walking the text nodes and joining them with spaces avoids that.
  function extractSpacedText(el) {
    const parts = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const t = node.textContent.trim();
      if (t) parts.push(t);
    }
    const text = parts.length ? parts.join(' ') : el.textContent.trim();
    return text.replace(/\s+/g, ' ').trim();
  }

  function detectTitleText() {
    for (const sel of TITLE_SELECTORS) {
      const el = document.querySelector(sel);
      const text = el && extractSpacedText(el);
      if (text) return text;
    }
    return null;
  }

  // When you switch episodes, whatever subtitle file was loaded for the
  // previous one has no business staying on screen. If we've already seen
  // this exact title before (you loaded a file for it earlier), restore
  // that file automatically; otherwise just clear the stale one so nothing
  // mismatched gets shown. This never fetches anything -- it only ever
  // reapplies a file you yourself loaded through the popup at some point.
  function reconcileSubtitleForTitle(title) {
    chrome.storage.local.get(['subtitleLibrary'], (data) => {
      const library = data.subtitleLibrary || {};
      const entry = library[title];
      if (entry) {
        chrome.storage.local.set({ subtitleText: entry.text, subtitleName: entry.name });
      } else {
        chrome.storage.local.remove(['subtitleText', 'subtitleName']);
      }
    });
  }

  function updateDetectedTitle() {
    const title = detectTitleText();
    if (title !== detectedTitle) {
      detectedTitle = title;
      if (title) {
        chrome.storage.local.set({ detectedTitle: title });
        reconcileSubtitleForTitle(title);
      } else {
        chrome.storage.local.remove('detectedTitle');
      }
    }
  }

  function findVideo() {
    return document.querySelector('video');
  }

  function findPlayerContainer(video) {
    return (
      video.closest('.watch-video') ||
      video.closest('[data-uia="video-canvas"]') ||
      video.parentElement
    );
  }

  function createOverlay(container) {
    const el = document.createElement('div');
    el.id = '__nf_custom_subtitle_overlay';
    el.style.fontSize = fontSize + 'px';
    container.appendChild(el);
    return el;
  }

  function attach() {
    const video = findVideo();
    if (!video) return;

    const stillGood = video === videoEl && overlay && overlay.isConnected;
    if (stillGood) return;

    if (videoEl) {
      videoEl.removeEventListener('timeupdate', onTimeUpdate);
    }

    videoEl = video;
    const container = findPlayerContainer(video);
    if (getComputedStyle(container).position === 'static') {
      container.style.position = 'relative';
    }

    playerContainer = container;
    overlay = createOverlay(container);
    videoEl.addEventListener('timeupdate', onTimeUpdate);
    onTimeUpdate();
    updateControlsVisibility();
    updateDetectedTitle();
  }

  // Netflix removes its control bar from the DOM entirely when it fades out
  // during playback (rather than just hiding it), so its presence tells us
  // whether the subtitle needs to sit higher to clear it.
  function updateControlsVisibility() {
    if (!overlay || !playerContainer) return;
    const controlsVisible = !!playerContainer.querySelector(CONTROLS_SELECTOR);
    overlay.classList.toggle('controls-visible', controlsVisible);
  }

  function findCueIndex(t) {
    let lo = 0;
    let hi = cues.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const c = cues[mid];
      if (t < c.start) hi = mid - 1;
      else if (t > c.end) lo = mid + 1;
      else return mid;
    }
    return -1;
  }

  function onTimeUpdate() {
    if (!overlay) return;
    if (!enabled || cues.length === 0 || !videoEl) {
      overlay.style.display = 'none';
      return;
    }
    const t = videoEl.currentTime + offset;
    const idx = findCueIndex(t);
    if (idx === -1) {
      overlay.style.display = 'none';
    } else {
      overlay.textContent = cues[idx].text;
      overlay.style.display = 'block';
    }
    updateControlsVisibility();
  }

  function applyFontSize() {
    if (overlay) overlay.style.fontSize = fontSize + 'px';
  }

  function loadFromStorage() {
    chrome.storage.local.get(
      ['subtitleText', 'enabled', 'offset', 'fontSize'],
      (data) => {
        cues = data.subtitleText ? parseSubtitles(data.subtitleText) : [];
        enabled = data.enabled !== false;
        offset = typeof data.offset === 'number' ? data.offset : 0;
        fontSize = typeof data.fontSize === 'number' ? data.fontSize : 28;
        applyFontSize();
        onTimeUpdate();
      }
    );
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.subtitleText) {
      cues = parseSubtitles(changes.subtitleText.newValue || '');
    }
    if (changes.enabled) {
      enabled = changes.enabled.newValue !== false;
    }
    if (changes.offset) {
      offset = typeof changes.offset.newValue === 'number' ? changes.offset.newValue : 0;
    }
    if (changes.fontSize) {
      fontSize = typeof changes.fontSize.newValue === 'number' ? changes.fontSize.newValue : 28;
      applyFontSize();
    }
    onTimeUpdate();
  });

  loadFromStorage();
  attach();

  // Netflix is a single-page app: the <video> element gets torn down and
  // recreated on navigation (browsing -> watch, or switching episodes). The
  // same DOM churn also covers the control bar fading in/out.
  const observer = new MutationObserver(() => {
    attach();
    updateControlsVisibility();
    updateDetectedTitle();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  // Belt-and-suspenders in case a mutation is missed (e.g. player rebuilt
  // without a DOM event our observer's filters catch).
  setInterval(attach, 2000);
})();
