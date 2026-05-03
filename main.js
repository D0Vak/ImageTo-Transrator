// Tesseract.js is loaded via CDN in index.html

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

console.log('App initialized');

// --- File Handling Logic ---

function handleFile(file) {
  console.log('handleFile called with:', file?.type, file?.size);
  if (!file || !file.type.startsWith('image/')) {
    console.log('Not an image file');
    return;
  }
  
  selectedFile = file;
  const reader = new FileReader();
  reader.onload = (e) => {
    console.log('FileReader loaded image');
    imagePreview.src = e.target.result;
    
    // UI Transitions
    dropZoneContent.hidden = true;
    previewContainer.hidden = false;
    controls.hidden = false;
    resultsSection.hidden = true;
    
    updateStatus('Ready', '#10b981');
  };
  reader.onerror = (err) => console.error('FileReader error:', err);
  reader.readAsDataURL(file);
}

// --- Event Listeners ---

// 1. Drag and Drop
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  const files = e.dataTransfer.files;
  if (files.length > 0) {
    console.log('File dropped');
    handleFile(files[0]);
  }
});

// 2. Click to Upload
dropZone.addEventListener('click', () => {
  if (!selectedFile) {
    console.log('Drop zone clicked, opening file input');
    fileInput.click();
  }
});

fileInput.addEventListener('change', (e) => {
  if (e.target.files.length > 0) {
    console.log('File selected via input');
    handleFile(e.target.files[0]);
  }
});

// 3. Robust Paste Implementation
// We listen on window and document to be absolutely sure
const pasteHandler = (e) => {
  console.log('Paste event triggered on:', e.currentTarget === window ? 'window' : 'document');
  const clipboardData = e.clipboardData || window.clipboardData;
  if (!clipboardData) {
    console.log('No clipboard data available');
    return;
  }

  const items = clipboardData.items;
  console.log('Clipboard items count:', items.length);

  for (let i = 0; i < items.length; i++) {
    console.log('Item type:', items[i].type);
    if (items[i].type.indexOf('image') !== -1) {
      const blob = items[i].getAsFile();
      console.log('Found image in clipboard, processing...');
      handleFile(blob);
      // Optional: Prevent default if we found an image
      // e.preventDefault();
      return;
    }
  }
  console.log('No image found in clipboard items');
};

window.addEventListener('paste', pasteHandler);
// Removed document listener to avoid duplicates

// 4. Reset Button
resetBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  console.log('Resetting app state');
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

  console.log('Starting translation process');
  translateBtn.disabled = true;
  progressContainer.hidden = false;
  updateStatus('Processing', '#fbbf24');
  
  try {
    progressText.innerText = 'エンジンを初期化中...';
    // Use Tesseract global object instead of imported createWorker
    const worker = await Tesseract.createWorker('jpn+eng', 1, {
      logger: m => {
        if (m.status === 'recognizing text') {
          const progress = Math.round(m.progress * 100);
          progressFill.style.width = `${progress}%`;
          progressText.innerText = `文字を認識中... ${progress}%`;
        }
      }
    });

    console.log('OCR starting...');
    const { data: { text } } = await worker.recognize(selectedFile);
    await worker.terminate();
    console.log('OCR finished. Text length:', text.length);

    if (!text.trim()) {
      throw new Error('画像から文字が検出されませんでした。');
    }

    ocrTextEl.innerText = text;

    progressText.innerText = '翻訳中...';
    progressFill.style.width = '100%';
    
    const translatedText = await translateText(text);
    translatedTextEl.innerText = translatedText;

    resultsSection.hidden = false;
    progressContainer.hidden = true;
    translateBtn.disabled = false;
    updateStatus('Completed', '#10b981');
    
    resultsSection.scrollIntoView({ behavior: 'smooth' });

  } catch (error) {
    console.error('Translation error:', error);
    alert('エラーが発生しました: ' + error.message);
    translateBtn.disabled = false;
    progressContainer.hidden = true;
    updateStatus('Error', '#ef4444');
  }
});

async function translateText(text) {
  const isJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(text);
  const sourceLang = isJapanese ? 'ja' : 'en';
  const targetLang = isJapanese ? 'en' : 'ja';
  console.log(`Translating from ${sourceLang} to ${targetLang}`);

  try {
    const response = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${sourceLang}|${targetLang}`);
    const data = await response.json();
    
    if (data.responseData && data.responseData.translatedText) {
      return data.responseData.translatedText;
    } else {
      return '翻訳に失敗しました。APIの制限に達した可能性があります。';
    }
  } catch (err) {
    console.error('API Error:', err);
    return '翻訳サービスに接続できませんでした。';
  }
}

function updateStatus(text, color) {
  statusText.innerText = text;
  statusIndicator.querySelector('.dot').style.backgroundColor = color;
  statusIndicator.querySelector('.dot').style.boxShadow = `0 0 10px ${color}`;
}

// Copy to Clipboard Logic
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('copy-btn')) {
    const targetId = e.target.getAttribute('data-target');
    const text = document.getElementById(targetId).innerText;
    navigator.clipboard.writeText(text).then(() => {
      const originalText = e.target.innerText;
      e.target.innerText = 'コピーしました！';
      setTimeout(() => e.target.innerText = originalText, 2000);
    });
  }
});
