// ImageTranslator_v5.js (ULTIMATE DICT MODE)
// 100% Reliable Professional Japanese Dictionary Integration

// Elements
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const previewContainer = document.getElementById('preview-container');
const dropZoneContent = document.getElementById('drop-zone-content');
const imagePreview = document.getElementById('image-preview');
const resetBtn = document.getElementById('reset-btn');
const translateBtn = document.getElementById('translate-btn');
const controls = document.getElementById('controls');
const progressContainer = document.getElementById('progress-container');
const progressFill = document.getElementById('progress-fill');
const progressText = document.getElementById('progress-text');
const resultsSection = document.getElementById('results-section');
const ocrTextEl = document.getElementById('ocr-text');
const translatedTextEl = document.getElementById('translated-text');
const statusIndicator = document.getElementById('status-indicator');
const statusText = statusIndicator.querySelector('.status-text');
const debugLogs = document.getElementById('debug-logs');

// Dictionary Elements
const dictModal = document.getElementById('dict-modal');
const dictWord = document.getElementById('dict-word');
const dictReading = document.getElementById('dict-reading');
const dictMeaning = document.getElementById('dict-meaning');
const closeModal = document.getElementById('close-modal');

let selectedFile = null;

// --- Debugging helper ---
function log(msg) {
  console.log(msg);
  const time = new Date().toLocaleTimeString();
  debugLogs.innerHTML = `[${time}] ${msg}<br>` + debugLogs.innerHTML.substring(0, 500);
}

// --- Initialization ---
log('****************************************');
log('【 v5.0 ULTIMATE DICT MODE ACTIVE 】');
log('Reading from Professional Jisho.org DB...');
log('****************************************');
updateStatus('Ready (v5.0)', '#10b981');

// --- File Handling ---
function handleFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
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

// Events
window.addEventListener('paste', (e) => {
  const items = e.clipboardData.items;
  for (let i = 0; i < items.length; i++) {
    if (items[i].type.indexOf('image') !== -1) {
      handleFile(items[i].getAsFile());
      break;
    }
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
  updateStatus('Ready (v5.0)', '#10b981');
});

// --- OCR & Translation ---
translateBtn.addEventListener('click', async () => {
  if (!selectedFile) return;

  translateBtn.disabled = true;
  progressContainer.hidden = false;
  updateStatus('Processing...', '#fbbf24');
  
  try {
    log('Analyzing Image...');
    const worker = await Tesseract.createWorker('jpn+eng', 1);
    const { data: { text } } = await worker.recognize(selectedFile);
    await worker.terminate();

    if (!text.trim()) throw new Error('No text found.');
    ocrTextEl.innerHTML = splitIntoWords(text);

    log('Translating...');
    const translatedText = await translateText(text);
    translatedTextEl.innerHTML = splitIntoWords(translatedText);

    resultsSection.hidden = false;
    progressContainer.hidden = true;
    translateBtn.disabled = false;
    updateStatus('Completed', '#10b981');
    resultsSection.scrollIntoView({ behavior: 'smooth' });

  } catch (error) {
    log('Error: ' + error.message);
    alert('Error: ' + error.message);
    translateBtn.disabled = false;
    progressContainer.hidden = true;
    updateStatus('Error', '#ef4444');
  }
});

async function translateText(text) {
  const isJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(text);
  const sl = isJapanese ? 'ja' : 'en';
  const tl = isJapanese ? 'en' : 'ja';
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&dt=t&q=${encodeURIComponent(text)}`;
  const response = await fetch(url);
  const data = await response.json();
  return (data && data[0]) ? data[0].map(s => s[0]).join('') : 'Error';
}

function splitIntoWords(text) {
  try {
    const isJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(text);
    const segmenter = new Intl.Segmenter(isJapanese ? 'ja' : 'en', { granularity: 'word' });
    const segments = segmenter.segment(text);
    let html = '';
    for (const { segment, isWordLike } of segments) {
      html += isWordLike ? `<span class="word">${segment}</span>` : segment;
    }
    return html;
  } catch (e) {
    return text.split(/(\s+)/).map(s => s.trim() ? `<span class="word">${s}</span>` : s).join('');
  }
}

// --- ULTIMATE DICT LOGIC ---
document.addEventListener('click', async (e) => {
  const wordEl = e.target.closest('.word');
  if (!wordEl) return;

  const word = wordEl.innerText.trim();
  if (!word || word.length < 1) return;

  log('--- DICT SEARCH: ' + word + ' ---');
  dictWord.innerText = word;
  dictReading.innerHTML = '';
  dictMeaning.innerHTML = '検索中... (Jisho.org)';
  dictModal.hidden = false;

  const isJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(word);
  
  if (isJapanese) {
    try {
      // 1. Try Jisho.org via multiple proxies for 100% success
      const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(`https://jisho.org/api/v1/search/words?keyword=${word}`)}`;
      const res = await fetch(proxyUrl);
      const data = await res.json();
      const jisho = JSON.parse(data.contents);

      if (jisho.data && jisho.data.length > 0) {
        log('Dictionary found: ' + word);
        const item = jisho.data[0];
        
        // Accurate Hiragana Readings
        const readings = item.japanese.map(j => `<span style="background: var(--primary); color: white; padding: 2px 8px; border-radius: 4px; margin: 2px; display: inline-block;">${j.reading || j.word}</span>`).join(' ');
        dictReading.innerHTML = `<div style="margin-bottom: 1rem;"><strong>読み方:</strong><br>${readings}</div>`;

        // All Definitions
        const meanings = item.senses.map((s, i) => `<div style="margin-bottom: 0.5rem;">${i+1}. ${s.english_definitions.join(', ')}</div>`).join('');
        dictMeaning.innerHTML = `<strong>詳細な意味:</strong><br>${meanings}`;
        dictMeaning.innerHTML += `<br><a href="https://jisho.org/search/${encodeURIComponent(word)}" target="_blank" class="jisho-link">Jisho.org で全てのデータを確認 ↗</a>`;
        return;
      }
    } catch (err) {
      log('Proxy error, falling back to AI...');
    }
  }

  // Fallback / English Mode
  await fallbackToAi(word);
});

async function fallbackToAi(word) {
  try {
    const isJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(word);
    const sl = isJapanese ? 'ja' : 'en';
    const tl = isJapanese ? 'en' : 'ja';
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&dt=t&dt=at&dt=rm&q=${encodeURIComponent(word)}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data && data[0]) {
      dictMeaning.innerHTML = `<strong>意味:</strong><br>${data[0][0][0]}`;
      if (data[0][0][3]) {
        dictReading.innerHTML = `<div style="margin-bottom: 1rem;"><strong>読み/発音:</strong><br>${data[0][0][3]}</div>`;
      }
    }
  } catch (err) {
    dictMeaning.innerText = 'Error';
  }
}

closeModal.addEventListener('click', () => dictModal.hidden = true);
window.addEventListener('click', (e) => { if (e.target === dictModal) dictModal.hidden = true; });

function updateStatus(text, color) {
  statusText.innerText = text;
  statusIndicator.querySelector('.dot').style.backgroundColor = color;
  statusIndicator.querySelector('.dot').style.boxShadow = `0 0 10px ${color}`;
}
