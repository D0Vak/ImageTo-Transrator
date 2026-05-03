// Standalone Browser Version (Ultra Robust Edition)

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

// Dictionary Elements
const dictModal = document.getElementById('dict-modal');
const dictWord = document.getElementById('dict-word');
const dictMeaning = document.getElementById('dict-meaning');
const closeModal = document.getElementById('close-modal');

let selectedFile = null;
let tokenizer = null; // Direct Kuromoji tokenizer

// --- Engine Initialization ---
async function initEngine() {
  if (tokenizer) return;
  try {
    updateStatus('Loading Dict (15MB)...', '#fbbf24');
    console.log('Starting Kuromoji build...');
    
    // Using Kuromoji directly for better control
    kuromoji.builder({ 
      dictPath: "https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/dict/" 
    }).build((err, _tokenizer) => {
      if (err) {
        console.error('Kuromoji build error:', err);
        updateStatus('Basic Mode', '#6366f1');
        return;
      }
      tokenizer = _tokenizer;
      console.log('Kuromoji engine ready');
      updateStatus('Ready', '#10b981');
    });
  } catch (err) {
    console.error('Engine init failed:', err);
    updateStatus('Offline Mode', '#ef4444');
  }
}

initEngine();

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
    updateStatus('Ready', '#10b981');
  };
  reader.readAsDataURL(file);
}

// Drag & Drop
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
    progressText.innerText = '文字を認識中...';
    const worker = await Tesseract.createWorker('jpn+eng', 1, {
      logger: m => {
        if (m.status === 'recognizing text') {
          const p = Math.round(m.progress * 100);
          progressFill.style.width = `${p}%`;
          progressText.innerText = `解析中... ${p}%`;
        }
      }
    });

    const { data: { text } } = await worker.recognize(selectedFile);
    await worker.terminate();

    if (!text.trim()) throw new Error('文字が検出されませんでした。');

    // Split OCR text into words
    ocrTextEl.innerHTML = splitIntoWords(text);

    progressText.innerText = '翻訳中...';
    const translatedText = await translateText(text);
    
    // Process Furigana
    const isTargetJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(translatedText);
    
    let finalHtml = '';
    if (isTargetJapanese && tokenizer) {
      progressText.innerText = 'ふりがなを生成中...';
      finalHtml = generateFuriganaHtml(translatedText);
    } else {
      finalHtml = splitIntoWords(translatedText);
    }

    translatedTextEl.innerHTML = finalHtml;

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

/**
 * Generate Ruby HTML using Kuromoji directly
 */
function generateFuriganaHtml(text) {
  if (!tokenizer) return splitIntoWords(text);
  
  const tokens = tokenizer.tokenize(text);
  let html = '';
  
  for (const token of tokens) {
    const surface = token.surface_form;
    const reading = token.reading; // Katakana reading
    
    if (reading && surface !== reading && /[\u4E00-\u9FAF]/.test(surface)) {
      // It's a kanji with a reading
      const hiragana = katakanaToHiragana(reading);
      html += `<span class="word"><ruby>${surface}<rt>${hiragana}</rt></ruby></span>`;
    } else {
      // Not kanji or reading is same as surface
      if (surface.trim() === '') {
        html += surface;
      } else {
        html += `<span class="word">${surface}</span>`;
      }
    }
  }
  return html;
}

function katakanaToHiragana(src) {
  return src.replace(/[\u30A1-\u30F6]/g, (match) => {
    return String.fromCharCode(match.charCodeAt(0) - 0x60);
  });
}

function splitIntoWords(text) {
  try {
    const isJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(text);
    const segmenter = new Intl.Segmenter(isJapanese ? 'ja' : 'en', { granularity: 'word' });
    const segments = segmenter.segment(text);
    let html = '';
    for (const { segment, isWordLike } of segments) {
      if (isWordLike) {
        html += `<span class="word">${segment}</span>`;
      } else {
        html += segment;
      }
    }
    return html;
  } catch (e) {
    return text.split(/(\s+)/).map(s => s.trim() ? `<span class="word">${s}</span>` : s).join('');
  }
}

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

// --- Dictionary Logic ---
document.addEventListener('click', async (e) => {
  const wordEl = e.target.closest('.word');
  if (!wordEl) return;

  // For ruby tags, we want the base text, not the ruby text
  let word = '';
  const rubyBase = wordEl.querySelector('ruby');
  if (rubyBase) {
    // Clone and remove rt to get just the kanji
    const clone = rubyBase.cloneNode(true);
    clone.querySelectorAll('rt').forEach(rt => rt.remove());
    word = clone.innerText.trim();
  } else {
    word = wordEl.innerText.trim();
  }
  
  if (!word) return;

  dictWord.innerText = word;
  dictMeaning.innerText = '検索中...';
  dictModal.hidden = false;

  const isJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(word);
  const sl = isJapanese ? 'ja' : 'en';
  const tl = isJapanese ? 'en' : 'ja';
  
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&dt=t&q=${encodeURIComponent(word)}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data && data[0]) {
      dictMeaning.innerText = data[0][0][0];
    }
  } catch (err) {
    dictMeaning.innerText = '意味を取得できませんでした。';
  }
});

closeModal.addEventListener('click', () => dictModal.hidden = true);
window.addEventListener('click', (e) => { if (e.target === dictModal) dictModal.hidden = true; });

function updateStatus(text, color) {
  statusText.innerText = text;
  statusIndicator.querySelector('.dot').style.backgroundColor = color;
  statusIndicator.querySelector('.dot').style.boxShadow = `0 0 10px ${color}`;
}
