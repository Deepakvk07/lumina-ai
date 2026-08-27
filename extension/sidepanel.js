// Lumina Side Panel Script (using Background Port Stream)

document.addEventListener('DOMContentLoaded', () => {
  const scanBtn = document.getElementById('btn-scan');
  const inputEl = document.getElementById('prompt-input');
  const outputText = document.getElementById('output-text');
  const copyBtn = document.getElementById('btn-copy');

  let isSolving = false;

  const solve = (text, imageBase64) => {
    if (isSolving) return;
    isSolving = true;
    scanBtn.disabled = true;
    scanBtn.textContent = '⏳ Solving...';
    outputText.textContent = '✨ Analyzing question & calculating with 120B Math Reasoner...';

    const payload = {
      question: text || 'Solve visible problem and output ONLY the option numbers and answers.',
      image_base64: imageBase64 || null,
      category: 'auto',
      answer_style: 'option_only'
    };

    const port = chrome.runtime.connect({ name: 'LUMINA_SOLVER_STREAM' });
    let firstToken = true;

    port.onMessage.addListener((msg) => {
      if (msg.error) {
        outputText.textContent = ⚠️ ;
      } else if (msg.token) {
        if (firstToken) {
          outputText.textContent = '';
          firstToken = false;
        }
        outputText.textContent += msg.token;
      } else if (msg.done) {
        isSolving = false;
        scanBtn.disabled = false;
        scanBtn.textContent = '⚡ Scan & Solve Active Page';
      }
    });

    port.postMessage({ action: 'START_SOLVE', payload });
  };

  scanBtn.addEventListener('click', async () => {
    chrome.tabs.captureVisibleTab(null, { format: 'jpeg', quality: 75 }, (dataUrl) => {
      if (dataUrl) {
        solve(inputEl.value.trim() || 'Solve question in screenshot.', dataUrl);
      }
    });
  });

  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      solve(inputEl.value.trim(), null);
    }
  });

  window.addEventListener('paste', (e) => {
    const items = (e.clipboardData || e.originalEvent?.clipboardData)?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.indexOf('image') !== -1) {
        const file = item.getAsFile();
        const reader = new FileReader();
        reader.onload = (event) => {
          solve('Solve question in screenshot.', event.target.result);
        };
        reader.readAsDataURL(file);
        break;
      }
    }
  });

  copyBtn.addEventListener('click', () => {
    if (outputText.innerText) {
      navigator.clipboard.writeText(outputText.innerText);
      copyBtn.textContent = '✓ Copied';
      setTimeout(() => { copyBtn.textContent = '📋 Copy'; }, 1500);
    }
  });
});
