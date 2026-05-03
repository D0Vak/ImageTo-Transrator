// Standalone Browser Version (High Reliability Edition)

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
let kuroshiro = null;
let isEngineReady = false;

// Initialize Furigana Engine (Improved Loading)
async function initEngine() {
  if (kuroshiro) return;
  try {
    updateStatus('Initializing Engine...', '#fbbf24');
    kuroshiro = new Kuroshiro();
    // Dictionary path MUST end with a slash for Kuromoji
    const kuromojiAnalyzer = new KuromojiAnalyzer({
      dictPath: "https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/dict/"
    });
    await kuroshiro.init(kuromojiAnalyzer);
    console.log('Kuroshiro initialized successfully');
    isEngineReady = true;
    updateStatus('Ready', '#10b981');
  } catch (err) {
    console.error('Kuroshiro init failed:', err);
    updateStatus('Basic Mode (No Furigana)', '#6366f1');
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
    progressText.innerText = '文字を認識中 (OCR)...';
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

    // Split OCR text into words for dictionary
    ocrTextEl.innerHTML = splitIntoWords(text);

    progressText.innerText = '翻訳中 (AI)...';
    const translatedText = await translateText(text);
    
    // Check if target is Japanese
    const isTargetJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(translatedText);
    
    let finalHtml = '';
    if (isTargetJapanese && isEngineReady) {
      progressText.innerText = 'ふりがなを生成中...';
      try {
        finalHtml = await kuroshiro.convert(translatedText, { mode: "furigana", to: "hiragana" });
        // Wrap the furigana HTML to make words clickable
        finalHtml = wrapFuriganaHtml(finalHtml);
      } catch (e) {
        console.error('Furigana conversion failed:', e);
        finalHtml = splitIntoWords(translatedText);
      }
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
 * Split text into individual clickable words using Intl.Segmenter (Reliable)
 */
function splitIntoWords(text) {
  const isJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(text);
  const locale = isJapanese ? 'ja' : 'en';
  
  // Intl.Segmenter is a built-in browser API that's very reliable for word splitting
  try {
    const segmenter = new Intl.Segmenter(locale, { granularity: 'word' });
    const segments = segmenter.segment(text);
    let html = '';
    
    for (const { segment, isWordLike } of segments) {
      if (isWordLike) {
        html += `<span class="word">${segment}</span>`;
      } else {
        // Punctuation or whitespace
        html += segment;
      }
    }
    return html;
  } catch (e) {
    // Fallback to simple split if Intl.Segmenter is not available
    return text.split(/(\s+)/).map(s => s.trim() ? `<span class="word">${s}</span>` : s).join('');
  }
}

/**
 * Wrap Furigana HTML (from Kuroshiro) to make individual ruby elements clickable
 */
function wrapFuriganaHtml(html) {
  // Regex to match ruby tags or non-tag sequences
  return html.replace(/<ruby>.*?<\/ruby>|[^<>\s]+/g, (match) => {
    return `<span class="word">${match}</span>`;
  });
}

async function translateText(text) {
  const isJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(text);
  const sourceLang = isJapanese ? 'ja' : 'en';
  const targetLang = isJapanese ? 'en' : 'ja';

  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
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
  // Find the closest .word element (handles clicks inside ruby tags too)
  const wordEl = e.target.closest('.word');
  if (!wordEl) return;

  // Extract clean text from word element (ignoring furigana for search)
  const word = wordEl.innerText.replace(/\s+/g, '');
  if (!word || word.length < 1) return;

  // Show modal
  dictWord.innerText = word;
  dictMeaning.innerText = '検索中...';
  dictModal.hidden = false;

  // Translate word
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

// Copy to Clipboard
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

function updateStatus(text, color) {
  statusText.innerText = text;
  statusIndicator.querySelector('.dot').style.backgroundColor = color;
  statusIndicator.querySelector('.dot').style.boxShadow = `0 0 10px ${color}`;
}
