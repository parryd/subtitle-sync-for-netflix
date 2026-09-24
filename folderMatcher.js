// Matches a Netflix-detected title/episode string against filenames in a
// user-chosen local folder. Pure string logic, no DOM/chrome APIs, so it's
// easy to test in isolation.

const STOPWORDS = new Set(['the', 'a', 'an', 'of', 'and', 'to']);

function tokenize(str) {
  return str
    .toLowerCase()
    .replace(/['’]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((t) => t && !STOPWORDS.has(t));
}

// Looks for "S01E07", "1x07", "Season 1 Episode 7", or a bare "E7"/"Ep7".
// Returns { season, episode } with season possibly null, or null if no
// episode marker was found at all.
function extractEpisodeMarker(str) {
  let m = str.match(/s(?:eason)?\s*0*(\d{1,2})[\s._-]*e(?:p(?:isode)?)?\s*0*(\d{1,3})/i);
  if (m) return { season: parseInt(m[1], 10), episode: parseInt(m[2], 10) };

  m = str.match(/\b0*(\d{1,2})x0*(\d{1,3})\b/i);
  if (m) return { season: parseInt(m[1], 10), episode: parseInt(m[2], 10) };

  m = str.match(/\be(?:p(?:isode)?)?\s*0*(\d{1,3})\b/i);
  if (m) return { season: null, episode: parseInt(m[1], 10) };

  return null;
}

function showNameTokens(str, marker) {
  // Cut the string off at wherever the episode marker starts, so "show
  // name" scoring doesn't get diluted by episode-title words after it.
  const idx = marker ? str.search(/s(?:eason)?\s*0*\d{1,2}[\s._-]*e|(\d{1,2})x(\d{1,3})|\be(?:p(?:isode)?)?\s*0*\d{1,3}\b/i) : -1;
  const prefix = idx > 0 ? str.slice(0, idx) : str;
  return tokenize(prefix);
}

function overlapScore(tokensA, tokensB) {
  const setB = new Set(tokensB);
  return tokensA.filter((t) => setB.has(t)).length;
}

// Returns the best-matching filename from `filenames`, or null if nothing
// clears a reasonable confidence bar.
function pickBestMatch(detectedTitle, filenames) {
  if (!detectedTitle || !filenames.length) return null;

  const targetMarker = extractEpisodeMarker(detectedTitle);
  const targetTokens = showNameTokens(detectedTitle, targetMarker);

  const candidates = filenames.map((name) => {
    const marker = extractEpisodeMarker(name);
    const tokens = showNameTokens(name, marker);
    return { name, marker, tokens };
  });

  if (targetMarker) {
    const episodeMatches = candidates.filter(
      (c) => c.marker && c.marker.episode === targetMarker.episode &&
        (targetMarker.season == null || c.marker.season == null || c.marker.season === targetMarker.season)
    );
    if (episodeMatches.length === 1) return episodeMatches[0].name;
    if (episodeMatches.length > 1) {
      // Disambiguate same-episode-number matches (e.g. across seasons
      // with no season number available) by show-name token overlap.
      let best = null;
      let bestScore = -1;
      for (const c of episodeMatches) {
        const score = overlapScore(targetTokens, c.tokens);
        if (score > bestScore) {
          best = c;
          bestScore = score;
        }
      }
      return best ? best.name : null;
    }
  }

  // No episode-number match anywhere -- fall back to pure show-name
  // overlap, but only if it clears a minimum bar so we don't confidently
  // pick a wrong file out of an unrelated folder.
  let best = null;
  let bestScore = 0;
  for (const c of candidates) {
    const score = overlapScore(targetTokens, c.tokens);
    if (score > bestScore) {
      best = c;
      bestScore = score;
    }
  }
  return bestScore >= 2 ? best.name : null;
}

if (typeof window !== 'undefined') {
  window.pickBestMatch = pickBestMatch;
}
if (typeof module !== 'undefined') {
  module.exports = { pickBestMatch, extractEpisodeMarker, tokenize };
}
