# Subtitle Sync for Netflix

An unofficial Chrome extension (not affiliated with Netflix) that overlays
your own subtitle file on top of a playing Netflix video, automatically
synced to playback time and speed.

## Load it in Chrome

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

## Limitations

- This does not fetch subtitles from Netflix itself — you supply your own
  subtitle file for the title you're watching.
- Subtitle timing is only as accurate as the file you load; if it doesn't
  match the exact cut/edition you're watching, use the offset control.
