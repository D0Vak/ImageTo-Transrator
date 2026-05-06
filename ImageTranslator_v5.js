// ImageTranslator_v5.js (v5.5)

// --- Constants ---
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const OCR_TIMEOUT_MS = 60_000;
const JAPANESE_RE  = /[぀-ゟ゠-ヿ一-鿿]/;
const KATA_ONLY_RE = /^[ァ-ヺーヽヾ]+$/;
const KANA_ONLY_RE = /^[぀-ゟ゠-ヿ]+$/;
const POS_JA = {
  noun: '名詞', verb: '動詞', adjective: '形容詞', adverb: '副詞',
  conjunction: '接続詞', preposition: '前置詞', pronoun: '代名詞',
  interjection: '感動詞', particle: '助詞', suffix: '接尾辞',
  'auxiliary verb': '助動詞', 'verb phrase': '動詞句',
};

// --- DOM Elements ---
const dropZone         = document.getElementById('drop-zone');
const fileInput        = document.getElementById('file-input');
const previewContainer = document.getElementById('preview-container');
const dropZoneContent  = document.getElementById('drop-zone-content');
const imagePreview     = document.getElementById('image-preview');
const resetBtn         = document.getElementById('reset-btn');
const translateBtn     = document.getElementById('translate-btn');
const controls         = document.getElementById('controls');
const progressContainer = document.getElementById('progress-container');
const progressFill     = document.getElementById('progress-fill');
const progressText     = document.getElementById('progress-text');
const resultsSection   = document.getElementById('results-section');
const ocrTextEl        = document.getElementById('ocr-text');
const translatedTextEl = document.getElementById('translated-text');
const statusIndicator  = document.getElementById('status-indicator');
const statusText       = statusIndicator?.querySelector('.status-text');

const dictModal   = document.getElementById('dict-modal');
const dictWord    = document.getElementById('dict-word');
const dictReading = document.getElementById('dict-reading');
const dictMeaning = document.getElementById('dict-meaning');
const closeModal  = document.getElementById('close-modal');

let selectedFile = null;

// --- Persistent Cache (v5.5: new key, old caches discarded) ---
['jishoCache', 'googleCache'].forEach(k => localStorage.removeItem(k));
function loadCache(key) {
  try { return new Map(JSON.parse(localStorage.getItem(key) || '[]')); }
  catch { return new Map(); }
}
function saveCache(key, map) {
  try { localStorage.setItem(key, JSON.stringify([...map])); }
  catch { localStorage.removeItem(key); }
}
const dictCache = loadCache('dictCache_v2');

// --- Utilities ---
function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function updateStatus(text, color) {
  if (!statusText) return;
  statusText.textContent = text;
  const dot = statusIndicator.querySelector('.dot');
  dot.style.backgroundColor = color;
  dot.style.boxShadow = `0 0 10px ${color}`;
}

function setProgress(pct, msg) {
  progressFill.style.width = `${pct}%`;
  progressText.textContent = msg;
}

updateStatus('Ready', '#10b981');

// --- File Handling ---
function handleFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  if (file.size > MAX_IMAGE_SIZE) {
    alert('画像のサイズは10MB以下にしてください。');
    return;
  }
  selectedFile = file;
  const reader = new FileReader();
  reader.onload = (e) => {
    imagePreview.src = e.target.result;
    dropZoneContent.hidden = true;
    previewContainer.hidden = false;
    controls.hidden = false;
    resultsSection.hidden = true;
  };
  reader.readAsDataURL(file);
}

window.addEventListener('paste', (e) => {
  for (const item of e.clipboardData.items) {
    if (item.type.startsWith('image/')) { handleFile(item.getAsFile()); break; }
  }
});

dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  if (e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]);
});

dropZone.addEventListener('click', () => { if (!selectedFile) fileInput.click(); });
fileInput.addEventListener('change', (e) => { if (e.target.files.length > 0) handleFile(e.target.files[0]); });

resetBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  selectedFile = null;
  fileInput.value = '';
  imagePreview.src = '';
  dropZoneContent.hidden = false;
  previewContainer.hidden = true;
  controls.hidden = true;
  resultsSection.hidden = true;
  updateStatus('Ready', '#10b981');
});

// --- Copy Buttons ---
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.copy-btn');
  if (!btn) return;
  const el = document.getElementById(btn.dataset.target);
  if (!el) return;
  navigator.clipboard.writeText(el.innerText).then(() => {
    const orig = btn.textContent;
    btn.textContent = 'コピー完了!';
    setTimeout(() => { btn.textContent = orig; }, 1500);
  });
});

// --- OCR & Translation ---
translateBtn.addEventListener('click', async () => {
  if (!selectedFile) return;
  translateBtn.disabled = true;
  progressContainer.hidden = false;
  resultsSection.hidden = true;
  updateStatus('Processing...', '#fbbf24');
  setProgress(5, '画像を読み込み中...');

  try {
    setProgress(10, '文字を認識中...');
    const worker = await Tesseract.createWorker('jpn+eng', 1);

    const { data: { text } } = await Promise.race([
      worker.recognize(selectedFile),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('OCRがタイムアウトしました（60秒）。')), OCR_TIMEOUT_MS)
      ),
    ]);
    await worker.terminate();

    if (!text.trim()) throw new Error('文字が見つかりませんでした。');

    setProgress(60, '翻訳中...');
    ocrTextEl.innerHTML = splitIntoWords(text);

    const translatedText = await translateText(text);
    setProgress(95, '仕上げ中...');
    translatedTextEl.innerHTML = splitIntoWords(translatedText);

    setProgress(100, '完了!');
    resultsSection.hidden = false;
    progressContainer.hidden = true;
    translateBtn.disabled = false;
    updateStatus('Completed', '#10b981');
    resultsSection.scrollIntoView({ behavior: 'smooth' });

  } catch (error) {
    alert('エラー: ' + error.message);
    translateBtn.disabled = false;
    progressContainer.hidden = true;
    updateStatus('Error', '#ef4444');
  }
});

async function translateText(text) {
  const isJapanese = JAPANESE_RE.test(text);
  const sl = isJapanese ? 'ja' : 'en';
  const tl = isJapanese ? 'en' : 'ja';
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&dt=t&q=${encodeURIComponent(text)}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (data?.[0]) return data[0].map(s => s[0]).join('');
    throw new Error('invalid response');
  } catch {
    return '翻訳に失敗しました。';
  }
}

// --- Word Splitting ---
function splitIntoWords(text) {
  try {
    const isJapanese = JAPANESE_RE.test(text);
    if (isJapanese) {
      text = text.replace(
        /(?<=[぀-ゟ゠-ヿ一-鿿＀-￯])\s+(?=[぀-ゟ゠-ヿ一-鿿＀-￯])/g,
        ''
      );
      return tokenizeJapanese(text);
    }
    const segmenter = new Intl.Segmenter('en', { granularity: 'word' });
    return Array.from(segmenter.segment(text))
      .map(({ segment, isWordLike }) =>
        isWordLike ? `<span class="word">${escHtml(segment)}</span>` : escHtml(segment)
      )
      .join('');
  } catch {
    return text.split(/(\s+)/)
      .map(s => s.trim() ? `<span class="word">${escHtml(s)}</span>` : escHtml(s))
      .join('');
  }
}

function tokenizeJapanese(text) {
  const KANJI_RE  = /^[一-鿿㐀-䶿豈-﫿々]+$/;
  const HIRA_RE   = /^[ぁ-ゖ]+$/;
  const KATA_RE   = /^[ァ-ヺーヽヾ]+$/;
  const KANJI_END = /[一-鿿㐀-䶿豈-﫿]$/;
  const HIRA_END  = /[ぁ-ゖ]$/;

  const STOP     = new Set(['は', 'が', 'を', 'も', 'に', 'で', 'へ', 'と', 'の']);
  const PREFIXES = new Set(['非','不','無','未','再','超','高','低','最','大','小','総','第','新','旧','半','多','少','長','短']);

  const raw = Array.from(new Intl.Segmenter('ja', { granularity: 'word' }).segment(text));
  const merged = [];
  let i = 0;

  while (i < raw.length) {
    const { segment: seg, isWordLike } = raw[i];
    if (!isWordLike) { merged.push({ segment: seg, isWordLike: false }); i++; continue; }

    let word = seg;
    i++;
    let prevType = 'start';

    while (i < raw.length) {
      const { segment: next, isWordLike: nextWL } = raw[i];
      if (!nextWL) break;

      if (PREFIXES.has(word)) { word += next; i++; prevType = 'prefix'; continue; }
      if (KANJI_END.test(word) && KANJI_RE.test(next) && (prevType === 'start' || prevType === 'kk' || prevType === 'prefix')) { word += next; i++; prevType = 'kk'; continue; }
      if (KANJI_END.test(word) && HIRA_RE.test(next) && !STOP.has(next)) { word += next; i++; prevType = 'kh'; continue; }
      if (HIRA_END.test(word) && KANJI_RE.test(next) && (prevType === 'kh' || prevType === 'hk')) { word += next; i++; prevType = 'hk'; continue; }
      if (KATA_RE.test(word) && KATA_RE.test(next)) { word += next; i++; prevType = 'kata'; continue; }
      break;
    }
    merged.push({ segment: word, isWordLike: true });
  }

  return merged
    .map(({ segment, isWordLike }) =>
      isWordLike ? `<span class="word">${escHtml(segment)}</span>` : escHtml(segment)
    )
    .join('');
}

// --- Dictionary (Google Translate only — no slow proxies) ---
document.addEventListener('click', async (e) => {
  const wordEl = e.target.closest('.word');
  if (!wordEl) return;
  const word = wordEl.innerText.trim();
  if (!word) return;

  dictWord.textContent = word;
  dictReading.textContent = '';
  dictMeaning.textContent = '';
  dictModal.hidden = false;
  const isJapanese = JAPANESE_RE.test(word);

  const cached = dictCache.get(word) ?? null;
  if (cached) { renderDict(word, isJapanese, cached); return; }

  dictMeaning.textContent = '検索中...';

  // Fire the main lookup and the reading lookup in parallel,
  // but render meanings immediately when the main lookup arrives —
  // don't make the user wait for the slower reading request.
  const mainReq  = fetchMainData(word, isJapanese);
  const latinReq = isJapanese
    ? fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=ja&tl=ja-Latn&dt=t&q=${encodeURIComponent(word)}`)
        .then(r => r.ok ? r.json() : null).catch(() => null)
    : Promise.resolve(null);

  const mainData = await mainReq;
  if (!mainData) { renderDict(word, isJapanese, null); return; }

  const mainTranslation = mainData[0]?.[0]?.[0] ?? '';
  const meanings = parseMeanings(mainData, mainTranslation || '見つかりませんでした');
  let reading    = extractReading(mainData, null, word);

  // Show meanings (and reading from dt=rm if available) immediately
  renderDict(word, isJapanese, { meanings, reading });

  // Update フリガナ from ja-Latn when it arrives, if not already set
  if (isJapanese && !reading) {
    const latinData = await latinReq;
    reading = extractReading(mainData, latinData, word);
    if (reading) renderDict(word, isJapanese, { meanings, reading });
  }

  const finalData = { meanings, reading };
  dictCache.set(word, finalData);
  saveCache('dictCache_v2', dictCache);
});

function renderDict(word, isJapanese, data) {
  const jishoUrl  = escHtml(`https://jisho.org/search/${encodeURIComponent(word)}`);
  const jishoLink = `<a href="${jishoUrl}" target="_blank" rel="noopener" class="jisho-link" style="margin-top:1.2rem;display:inline-block">Jisho.org で詳しく ↗</a>`;

  if (!data) {
    dictReading.textContent = '';
    dictMeaning.innerHTML = `検索に失敗しました。<br>${jishoLink}`;
    return;
  }

  // フリガナ — large and prominent
  dictReading.innerHTML = data.reading
    ? `<span style="font-size:1.5rem;font-weight:700;color:var(--primary);letter-spacing:0.08em">${escHtml(data.reading)}</span>`
    : '';

  // Meanings grouped by part of speech
  let html = '';
  for (const { pos, defs } of data.meanings) {
    if (pos) {
      const label = POS_JA[pos.toLowerCase()] ?? pos;
      html += `<div style="font-size:0.68rem;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;`
            + `color:white;background:var(--primary);border-radius:4px;display:inline-block;`
            + `padding:1px 7px;margin:0.8rem 0 0.4rem">${escHtml(label)}</div>`;
    }
    html += '<ol style="margin:0;padding-left:1.2rem">';
    for (const def of defs) {
      html += `<li style="padding:2px 0;line-height:1.5">${escHtml(def)}</li>`;
    }
    html += '</ol>';
  }
  html += `<div>${jishoLink}</div>`;
  dictMeaning.innerHTML = html;
}

// Fetch dictionary data.
// dict-chrome-ex has richer dt=bd/dt=at coverage than gtx (especially for adjectives).
// Falls back to gtx sequentially only if dict-chrome-ex fails (CORS error, network issue).
async function fetchMainData(word, isJapanese) {
  const sl = isJapanese ? 'ja' : 'en';
  const tl = isJapanese ? 'en' : 'ja';
  const params = `sl=${sl}&tl=${tl}&dt=t&dt=bd&dt=at&dt=rm&q=${encodeURIComponent(word)}`;
  const base   = 'https://translate.googleapis.com/translate_a/single';

  const data = await fetch(`${base}?client=dict-chrome-ex&${params}`)
    .then(r => r.ok ? r.json() : null).catch(() => null);
  if (data) return data;

  return fetch(`${base}?client=gtx&${params}`)
    .then(r => r.ok ? r.json() : null).catch(() => null);
}

// Extract hiragana reading from API response data.
// Handles macrons (ā ī ū ē ō) that Google returns in ja-Latn output.
function extractReading(mainData, latinData, word) {
  if (!JAPANESE_RE.test(word)) return '';
  if (typeof wanakana === 'undefined') return '';

  // Pure katakana → convert directly without any API call
  if (KATA_ONLY_RE.test(word)) return wanakana.toHiragana(word);

  let romaji = '';

  // data[1]: dict-chrome-ex sometimes puts source romanization here
  if (typeof mainData?.[1] === 'string' && mainData[1].trim()) {
    romaji = mainData[1].trim();
  }
  // data[0][x][3]: per-segment romanization from dt=rm
  if (!romaji) {
    for (const seg of (mainData?.[0] ?? [])) {
      if (Array.isArray(seg) && typeof seg[3] === 'string' && seg[3].trim()) {
        romaji = seg[3].trim(); break;
      }
    }
  }
  // ja-Latn fallback: data[0][0][0] of the separate ja-Latn response
  if (!romaji && latinData?.[0]?.[0]?.[0]) {
    romaji = String(latinData[0][0][0]).trim();
  }

  if (!romaji) return '';
  if (KANA_ONLY_RE.test(romaji)) return romaji; // already kana

  // Normalize macrons before wanakana.
  // ō → ou  (not oo): the vast majority of long-O in Japanese is おう
  //   e.g. 自動 jidō→じどう, 学校 gakkō→がっこう, 工 kō→こう
  //   (the oo subset like 大きい ōkii is less common; accepting minor inaccuracy)
  // ū → uu: e.g. 空気 kūki → くうき
  const normalized = romaji.toLowerCase()
    .replace(/ā/g, 'aa').replace(/ī/g, 'ii').replace(/ū/g, 'uu')
    .replace(/ē/g, 'ee').replace(/ō/g, 'ou');

  const result = wanakana.toHiragana(normalized);
  // Discard if wanakana produced non-kana (conversion failed)
  return /^[぀-ゟー\s]+$/.test(result) ? result : '';
}

// Parse multiple definitions from dt=bd (best) or dt=at (fallback)
function parseMeanings(data, mainTranslation) {
  // dt=bd → data[3]: [ [pos, [def, def, ...], [[def, examples, score], ...]], ... ]
  if (Array.isArray(data?.[3])) {
    const result = [];
    for (const entry of data[3]) {
      const pos  = typeof entry?.[0] === 'string' ? entry[0] : '';
      const defs = Array.isArray(entry?.[1])
        ? entry[1].slice(0, 6).filter(d => typeof d === 'string')
        : [];
      if (defs.length) result.push({ pos, defs });
    }
    if (result.length) return result;
  }

  // dt=at → data[5]: [ [pos, [[word, score, ...], ...]], ... ]
  if (Array.isArray(data?.[5])) {
    const result = [];
    for (const entry of data[5]) {
      const pos  = typeof entry?.[0] === 'string' ? entry[0] : '';
      const defs = Array.isArray(entry?.[1])
        ? entry[1].slice(0, 6).map(a => (typeof a?.[0] === 'string' ? a[0] : '')).filter(Boolean)
        : [];
      if (defs.length) result.push({ pos, defs });
    }
    if (result.length) return result;
  }

  return [{ pos: '', defs: [mainTranslation] }];
}

closeModal.addEventListener('click', () => { dictModal.hidden = true; });
window.addEventListener('click', (e) => { if (e.target === dictModal) dictModal.hidden = true; });
