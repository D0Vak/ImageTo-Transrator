// ImageTo-Transrator (v3.0 - Professional Dictionary Edition)
// Using Wanakana for perfect Hiragana and external dictionary links.

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
log('v3.0 Ready. Using Wanakana for perfect Hiragana conversion.');
updateStatus('Ready', '#10b981');

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
  updateStatus('Ready', '#10b981');
});

// --- OCR & Translation ---
translateBtn.addEventListener('click', async () => {
  if (!selectedFile) return;

  translateBtn.disabled = true;
  progressContainer.hidden = false;
  updateStatus('Processing...', '#fbbf24');
  
  try {
    log('Recognizing text...');
    progressText.innerText = '文字を認識中...';
    const worker = await Tesseract.createWorker('jpn+eng', 1);
    const { data: { text } } = await worker.recognize(selectedFile);
    await worker.terminate();

    if (!text.trim()) throw new Error('文字が見つかりませんでした。');
    ocrTextEl.innerHTML = splitIntoWords(text);

    log('Translating...');
    progressText.innerText = '翻訳中...';
    const translatedText = await translateText(text);
    translatedTextEl.innerHTML = splitIntoWords(translatedText);

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

async function translateText(text) {
  const isJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(text);
  const sl = isJapanese ? 'ja' : 'en';
  const tl = isJapanese ? 'en' : 'ja';

  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&dt=t&q=${encodeURIComponent(text)}`;
    const response = await fetch(url);
    const data = await response.json();
    if (data && data[0]) return data[0].map(s => s[0]).join('');
    throw new Error();
  } catch (err) {
    return '翻訳に失敗しました。';
  }
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
  if (!word || word.length < 1) return;

  log('Deep Lookup: ' + word);
  dictWord.innerText = word;
  dictReading.innerText = '';
  dictMeaning.innerText = '検索中...';
  dictModal.hidden = false;

  const isJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(word);
  const sl = isJapanese ? 'ja' : 'en';
  const tl = isJapanese ? 'en' : 'ja';
  
  try {
    // Requesting t (translation), at (alternate translations), rm (transliteration)
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&dt=t&dt=at&dt=rm&q=${encodeURIComponent(word)}`;
    const res = await fetch(url);
    const data = await res.json();
    
    if (data && data[0]) {
      let meaningsHtml = `<strong>Main:</strong> ${data[0][0][0]}`;
      
      // Alternative meanings if available
      if (data[1] && data[1][0] && data[1][0][1]) {
        meaningsHtml += `<br><br><strong>Alternatives:</strong><br>${data[1][0][1].slice(0, 5).join(', ')}`;
      }
      dictMeaning.innerHTML = meaningsHtml;
      
      // Reading/Pronunciation logic
      try {
        let rawReading = '';
        if (isJapanese) {
          // Transliteration is usually in the last block
          const lastArr = data[0][data[0].length - 1];
          rawReading = lastArr[lastArr.length - 1];
          if (rawReading && typeof wanakana !== 'undefined') {
            dictReading.innerText = '読み: ' + wanakana.toHiragana(rawReading);
          }
        } else {
          rawReading = data[0][0][3];
          if (rawReading) dictReading.innerText = 'Pronunciation: ' + rawReading;
        }
      } catch (e) {
        log('Could not determine reading');
      }

      // Add External Jisho Link for Japanese
      if (isJapanese) {
        dictMeaning.innerHTML += `<br><a href="https://jisho.org/search/${encodeURIComponent(word)}" target="_blank" class="jisho-link">Jisho.org で全ての読み・詳細を見る ↗</a>`;
      }
    }
  } catch (err) {
    dictMeaning.innerText = '情報を取得できませんでした。';
  }
});

closeModal.addEventListener('click', () => dictModal.hidden = true);
window.addEventListener('click', (e) => { if (e.target === dictModal) dictModal.hidden = true; });

function updateStatus(text, color) {
  statusText.innerText = text;
  statusIndicator.querySelector('.dot').style.backgroundColor = color;
  statusIndicator.querySelector('.dot').style.boxShadow = `0 0 10px ${color}`;
}
