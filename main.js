// Standalone Browser Version (No Build Required)

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

let selectedFile = null;
let kuroshiro = null;

// Initialize Furigana Engine
async function initFurigana() {
  if (kuroshiro) return;
  try {
    kuroshiro = new Kuroshiro();
    await kuroshiro.init(new KuromojiAnalyzer({
      dictPath: "https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/dict"
    }));
    console.log('Furigana engine initialized');
  } catch (err) {
    console.error('Furigana init failed:', err);
  }
}

initFurigana();

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

// Click & Paste
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
  updateStatus('Processing', '#fbbf24');
  
  try {
    progressText.innerText = '文字を認識中...';
    const worker = await Tesseract.createWorker('jpn+eng', 1, {
      logger: m => {
        if (m.status === 'recognizing text') {
          const p = Math.round(m.progress * 100);
          progressFill.style.width = `${p}%`;
          progressText.innerText = `認識中... ${p}%`;
        }
      }
    });

    const { data: { text } } = await worker.recognize(selectedFile);
    await worker.terminate();

    if (!text.trim()) throw new Error('文字が検出されませんでした。');

    ocrTextEl.innerText = text;
    progressText.innerText = '翻訳中...';
    
    const translatedText = await translateText(text);
    
    // Apply Furigana if target is Japanese
    const isTargetJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(translatedText);
    if (isTargetJapanese && kuroshiro) {
      progressText.innerText = 'ふりがなを生成中...';
      const furiganaHtml = await kuroshiro.convert(translatedText, { mode: "furigana", to: "hiragana" });
      translatedTextEl.innerHTML = furiganaHtml;
    } else {
      translatedTextEl.innerText = translatedText;
    }

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
  const isJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(text);
  const sourceLang = isJapanese ? 'ja' : 'en';
  const targetLang = isJapanese ? 'en' : 'ja';

  try {
    // Using Google Translate (GTX) API for better accuracy
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
    const response = await fetch(url);
    const data = await response.json();
    
    // Google Translate returns array of sentences
    if (data && data[0]) {
      return data[0].map(s => s[0]).join('');
    }
    throw new Error();
  } catch (err) {
    console.error('Translation failed:', err);
    return '翻訳に失敗しました。';
  }
}

function updateStatus(text, color) {
  statusText.innerText = text;
  statusIndicator.querySelector('.dot').style.backgroundColor = color;
  statusIndicator.querySelector('.dot').style.boxShadow = `0 0 10px ${color}`;
}

document.addEventListener('click', (e) => {
  if (e.target.classList.contains('copy-btn')) {
    const targetId = e.target.getAttribute('data-target');
    const text = document.getElementById(targetId).innerText;
    navigator.clipboard.writeText(text).then(() => {
      const orig = e.target.innerText;
      e.target.innerText = 'コピー完了！';
      setTimeout(() => e.target.innerText = orig, 2000);
    });
  }
});
