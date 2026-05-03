// Standalone Browser Version (Ultra-Light & High Speed Edition)
// No heavy dictionary downloads required.

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
log('System starting in Ultra-Light mode...');
updateStatus('Ready', '#10b981');

// --- File Handling ---
function handleFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  log('Image selected: ' + file.name);
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
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  if (e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]);
});

dropZone.addEventListener('click', () => { if (!selectedFile) fileInput.click(); });
fileInput.addEventListener('change', (e) => { if (e.target.files.length > 0) handleFile(e.target.files[0]); });

window.addEventListener('paste', (e) => {
  const items = e.clipboardData.items;
  for (let i = 0; i < items.length; i++) {
    if (items[i].type.indexOf('image') !== -1) {
      handleFile(items[i].getAsFile());
      break;
    }
  }
});

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

// --- OCR & Translation ---
translateBtn.addEventListener('click', async () => {
  if (!selectedFile) return;

  translateBtn.disabled = true;
  progressContainer.hidden = false;
  updateStatus('Processing...', '#fbbf24');
  
  try {
    log('OCR processing...');
    progressText.innerText = '文字を認識中...';
    const worker = await Tesseract.createWorker('jpn+eng', 1);
    const { data: { text } } = await worker.recognize(selectedFile);
    await worker.terminate();

    if (!text.trim()) throw new Error('文字が検出されませんでした。');
    log('OCR finished.');

    ocrTextEl.innerHTML = splitIntoWords(text);

    log('Translating...');
    progressText.innerText = '翻訳中...';
    const result = await translateWithReading(text);
    
    log('Done. Rendering results.');
    
    // Build HTML with Reading (Transliteration)
    let finalHtml = '';
    if (result.reading) {
      // Show reading as a small subtitle above the translated text
      finalHtml = `<div style="margin-bottom: 1rem; padding: 0.5rem; background: rgba(99, 102, 241, 0.1); border-radius: 8px; color: var(--primary); font-size: 0.9rem;">
                     <strong>Reading:</strong> ${result.reading}
                   </div>`;
    }
    finalHtml += splitIntoWords(result.text);

    translatedTextEl.innerHTML = finalHtml;

    resultsSection.hidden = false;
    progressContainer.hidden = true;
    translateBtn.disabled = false;
    updateStatus('Completed', '#10b981');
    resultsSection.scrollIntoView({ behavior: 'smooth' });

  } catch (error) {
    log('Error: ' + error.message);
    alert('エラー: ' + error.message);
    translateBtn.disabled = false;
    progressContainer.hidden = true;
    updateStatus('Error', '#ef4444');
  }
});

async function translateWithReading(text) {
  const isJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(text);
  const sl = isJapanese ? 'ja' : 'en';
  const tl = isJapanese ? 'en' : 'ja';

  try {
    // dt=t (translation), dt=rm (transliteration)
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&dt=t&dt=rm&q=${encodeURIComponent(text)}`;
    const response = await fetch(url);
    const data = await response.json();
    
    let translated = '';
    let translit = '';
    
    if (data && data[0]) {
      translated = data[0].map(s => s[0]).join('');
      // Transliteration is usually in the last block of the first array
      const lastBlock = data[0][data[0].length - 1];
      if (lastBlock && lastPartExists(lastBlock)) {
        translit = lastBlock[lastBlock.length - 1];
      }
    }
    
    return { text: translated, reading: translit };
  } catch (err) {
    return { text: '翻訳に失敗しました。', reading: '' };
  }
}

function lastPartExists(block) {
  return Array.isArray(block) && block.length >= 3;
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

// --- Dictionary Logic ---
document.addEventListener('click', async (e) => {
  const wordEl = e.target.closest('.word');
  if (!wordEl) return;

  const word = wordEl.innerText.trim();
  if (!word) return;
  log('Searching: ' + word);

  dictWord.innerText = word;
  dictMeaning.innerText = 'Searching...';
  dictModal.hidden = false;

  const isJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(word);
  const sl = isJapanese ? 'ja' : 'en';
  const tl = isJapanese ? 'en' : 'ja';
  
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&dt=t&q=${encodeURIComponent(word)}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data && data[0]) dictMeaning.innerText = data[0][0][0];
  } catch (err) {
    dictMeaning.innerText = 'Error';
  }
});

closeModal.addEventListener('click', () => dictModal.hidden = true);
window.addEventListener('click', (e) => { if (e.target === dictModal) dictModal.hidden = true; });

function updateStatus(text, color) {
  statusText.innerText = text;
  statusIndicator.querySelector('.dot').style.backgroundColor = color;
  statusIndicator.querySelector('.dot').style.boxShadow = `0 0 10px ${color}`;
}
