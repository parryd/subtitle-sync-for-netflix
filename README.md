# Subtitle Sync for Netflix

An unofficial Chrome extension (not affiliated with Netflix) that overlays
your own subtitle file on top of a playing Netflix video, automatically
synced to playback time and speed.

[**Get it on the Chrome Web Store**](https://chromewebstore.google.com/detail/Subtitle%20Sync%20for%20Netflix/cijfbacbdamencmlijfdfonkfkfacogf)

## Install

**From the Chrome Web Store (recommended):** click the link above and hit
"Add to Chrome."

**From source, for development:**

1. Go to `chrome://extensions`.
2. Enable "Developer mode" (top right).
3. Click "Load unpacked" and select this `chromeExt` folder.

## Use it

1. Open a title on `netflix.com` and start playing it.
2. Click the extension icon and choose an `.srt` or `.vtt` subtitle file.
3. Subtitles appear over the video, timed to `video.currentTime`.
4. If they're a bit early/late, use the sync offset buttons in the popup
   (each click nudges by 0.5s) until they line up.
5. "Show subtitles" toggles the overlay on/off without clearing the file.
   "Clear subtitles" removes the loaded file entirely.
6. If the popup detects a title/episode from the page, it shows a "Now
   playing" card with a "Search for subtitles" link. This opens a normal
   web search in a new tab for you to find and download a subtitle file
   from wherever you'd normally get one — the extension does not fetch or
   host subtitle files itself.

## How it works

- `subtitleParser.js` parses `.srt`/`.vtt` text into `{ start, end, text }`
  cues (in seconds).
- The popup reads the chosen file and writes its raw text plus your
  settings (enabled, offset, font size) to `chrome.storage.local`.
- `content.js` runs on `netflix.com`, finds the `<video>` element, and
  appends an overlay `<div>` inside the player's container (so it's still
  visible in fullscreen). On every `timeupdate` it binary-searches the cue
  list for the cue matching the current time + offset and renders it.
- A `MutationObserver` (plus a 2s fallback poll) re-attaches the overlay
  when Netflix's single-page app swaps in a new `<video>` element, e.g.
  when you switch episodes or navigate away and back.
- `content.js` also reads the title/episode text Netflix already displays
  in its own player UI (`[data-uia="video-title"]`, with a couple of
  fallback selectors) and writes it to storage. The popup uses this only
  to build a plain web-search link — it never downloads or serves
  subtitle content on your behalf.

## Limitations

- This does not fetch subtitles from Netflix itself — you supply your own
  subtitle file for the title you're watching.
- Subtitle timing is only as accurate as the file you load; if it doesn't
  match the exact cut/edition you're watching, use the offset control.
