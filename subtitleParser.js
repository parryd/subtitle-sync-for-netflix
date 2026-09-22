// Parses SRT or WebVTT subtitle text into an array of
// { start: seconds, end: seconds, text: string } cues, sorted by start time.
// Shared between content.js (content-script context) and popup.js (popup context).

function timeToSeconds(str) {
  const m = str.trim().match(/(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/);
  if (!m) return null;
  const hours = m[1] ? parseInt(m[1], 10) : 0;
  const minutes = parseInt(m[2], 10);
  const seconds = parseInt(m[3], 10);
  const millis = parseInt(m[4].padEnd(3, '0'), 10);
  return hours * 3600 + minutes * 60 + seconds + millis / 1000;
}

function parseSubtitles(raw) {
  if (!raw) return [];
  const text = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const blocks = text.split(/\n\s*\n/);
  const cues = [];

  for (const block of blocks) {
    const lines = block.split('\n').map((l) => l.trim());
    let timeLineIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('-->')) {
        timeLineIdx = i;
        break;
      }
    }
    if (timeLineIdx === -1) continue;

    const [startStr, endPart] = lines[timeLineIdx].split('-->');
    const endStr = endPart.trim().split(/\s+/)[0]; // strip VTT cue settings e.g. "align:middle"
    const start = timeToSeconds(startStr);
    const end = timeToSeconds(endStr);
    if (start === null || end === null) continue;

    const cueText = lines
      .slice(timeLineIdx + 1)
      .filter((l) => l.length > 0)
      .join('\n')
      .replace(/<[^>]+>/g, ''); // strip basic markup tags like <i>, <b>, <font>

    if (!cueText) continue;
    cues.push({ start, end, text: cueText });
  }

  cues.sort((a, b) => a.start - b.start);
  return cues;
}

if (typeof window !== 'undefined') {
  window.parseSubtitles = parseSubtitles;
}
