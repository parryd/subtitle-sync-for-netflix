# Subtitle Sync for Netflix

**Subtitles that actually keep up with you.**

For when Netflix doesn't have subtitles for what you're watching at all,
or doesn't have them in the language you need — load your own file
instead. And once you've loaded one, two problems most subtitle overlays
have are solved:

1. **Speed up the video, and your subtitles used to fall behind.** Most
   subtitle overlays run on a fixed timer, so the moment you bump playback
   to 1.25x, 1.5x, or 2x, the captions drift out of sync with the dialogue.
   This one doesn't — it reads the video's actual playback clock, so
   subtitles stay locked to the picture no matter what speed you're
   watching at.
2. **Binge-watching a series used to mean re-loading a subtitle file for
   every single episode.** Not anymore. Point this extension at a folder
   of subtitle files once, and it automatically finds and loads the right
   one for whatever episode you're on — no re-uploading, no digging
   through folders, no showing the wrong episode's subtitles by accident.

[**Get it on the Chrome Web Store**](https://chromewebstore.google.com/detail/Subtitle%20Sync%20for%20Netflix/cijfbacbdamencmlijfdfonkfkfacogf)

*Unofficial — not affiliated with, endorsed by, or sponsored by Netflix.*

## Features

- **Speed-adaptive sync** — subtitles track the video's real playback
  clock, so they stay perfectly timed at any speed, through pausing,
  seeking, anything.
- **One folder, a whole season** — grant access to a folder of `.srt`/`.vtt`
  files once; matching episodes load automatically from then on, matched
  by season/episode number in the filename.
- **No stale subtitles** — switch episodes and the previous one's subtitle
  file doesn't linger by mistake. Already watched this episode before?
  It's restored automatically instead of showing nothing.
- **Knows what you're watching** — detects the title/episode from Netflix's
  own page and gives you a one-click search if you need to go find a file.
- **Fits the screen, not the buttons** — the subtitle position automatically
  lifts clear of Netflix's own player controls whenever they're on screen.
- **Fine-tune it** — manual sync offset (±0.5s steps) and adjustable font
  size, for the odd file that's a little off or a little small.
- **Works everywhere you watch** — windowed or fullscreen, same result.

## Install

**From the Chrome Web Store (recommended):** click the link above and hit
"Add to Chrome."

**From source, for development:**

1. Clone or download this repository.
2. Go to `chrome://extensions`.
3. Enable "Developer mode" (top right).
4. Click "Load unpacked" and select the folder you just cloned/downloaded
   (the one containing `manifest.json`).

## Use it

1. Open a title on `netflix.com` and start playing it.
2. Click the extension icon and choose an `.srt` or `.vtt` subtitle file.
3. Subtitles appear over the video, timed to `video.currentTime` — speed
   the video up or slow it down and they stay locked in step.
4. If they're a bit early/late, use the sync offset buttons in the popup
   (each click nudges by 0.5s) until they line up.
5. "Show subtitles" toggles the overlay on/off without clearing the file.
   "Clear subtitles" removes the loaded file entirely.
6. If the popup detects a title/episode from the page, it shows a "Now
   playing" card with a "Search for subtitles" link. This opens a normal
   web search in a new tab for you to find and download a subtitle file
   from wherever you'd normally get one — the extension does not fetch or
   host subtitle files itself.
7. Switching episodes no longer leaves the previous episode's subtitles
   showing: when the detected title changes, the active subtitle is
   cleared automatically. If you'd already loaded a file for that exact
   episode before (e.g. rewatching, or resuming later), it's restored
   automatically from a small local library instead of showing nothing.
8. **The big one for series binges:** click "Use a subtitle folder" in
   the popup. This opens a separate settings tab (native folder pickers
   close extension popups immediately, so it can't run inside the popup
   itself) where you grant access to a folder of `.srt`/`.vtt` files once.
   From then on, whenever the popup detects an episode you don't already
   have a file loaded for, it scans that folder, matches by season/episode
   number (or show-name overlap as a fallback), and loads the matching file
   automatically. Nothing is ever downloaded — this only reads files
   already on your machine, and only when you open the popup (not the
   instant you change episodes, since only the popup context can access
   the folder).

## How it works

- `subtitleParser.js` parses `.srt`/`.vtt` text into `{ start, end, text }`
  cues (in seconds).
- The popup reads the chosen file and writes its raw text plus your
  settings (enabled, offset, font size) to `chrome.storage.local`.
- `content.js` runs on `netflix.com`, finds the `<video>` element, and
  appends an overlay `<div>` inside the player's container (so it's still
  visible in fullscreen). On every `timeupdate` it binary-searches the cue
  list for the cue matching the current time + offset and renders it.
  Because `video.currentTime` always reflects the real position in the
  media timeline regardless of `playbackRate`, this stays correct at any
  speed with no special-casing.
- A `MutationObserver` (plus a 2s fallback poll) re-attaches the overlay
  when Netflix's single-page app swaps in a new `<video>` element, e.g.
  when you switch episodes or navigate away and back.
- `content.js` also reads the title/episode text Netflix already displays
  in its own player UI (`[data-uia="video-title"]`, with a couple of
  fallback selectors) and writes it to storage. The popup uses this only
  to build a plain web-search link — it never downloads or serves
  subtitle content on your behalf.
- Whenever a file is loaded through the popup, it's saved into
  `subtitleLibrary` in `chrome.storage.local`, keyed by the detected
  title/episode string. When `content.js` sees the detected title change,
  it looks up that key: a match reapplies the saved file automatically, no
  match clears the active subtitle so the previous episode's file can't
  linger on screen. This only ever replays a file you already loaded
  yourself — nothing is fetched from anywhere.
- `folder-settings.html`/`.js` is a standalone extension page (opened in
  its own tab via `chrome.tabs.create`) that calls
  `window.showDirectoryPicker()` and stores the resulting
  `FileSystemDirectoryHandle` in IndexedDB. It lives outside the popup
  deliberately: Chrome extension popups close the instant they lose focus,
  and a native OS picker dialog does exactly that, which would abort the
  picker mid-flow.
- `folderMatcher.js` (shared by the popup and the settings page) matches
  the detected title against filenames in that folder: it looks for
  season/episode markers (`S01E07`, `1x07`, a bare `E7`) in both and
  compares them, disambiguating same-episode-number matches by show-name
  token overlap, and falls back to pure show-name overlap when no episode
  marker is found. `popup.js` runs this on every popup open (reading the
  stored handle via IndexedDB, not re-prompting for folder access) and, on
  a match, loads and saves the file exactly like a manual pick would.

## Limitations

- This does not fetch subtitles from Netflix itself — you supply your own
  subtitle file for the title you're watching.
- Subtitle timing is only as accurate as the file you load; if it doesn't
  match the exact cut/edition you're watching, use the offset control.
- Folder auto-matching depends on the filename carrying a recognizable
  season/episode number or overlapping show-name words; unusually-named
  files may need a manual pick.
