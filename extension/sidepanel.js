// Lumina Side Panel Script

document.addEventListener('DOMContentLoaded', () => {
  const scanBtn = document.getElementById('btn-scan');
  const inputEl = document.getElementById('prompt-input');
  const outputText = document.getElementById('output-text');
  const copyBtn = document.getElementById('btn-copy');

  const solve = async (text, imageBase64) => {
    scanBtn.disabled = true;
    scanBtn.textContent = '⏳ Solving with 99%+ Accuracy...';
    outputText.textContent = '✨ Analyzing question & calculating with 120B Math Reasoner...';

    try {
      const storage = await chrome.storage.local.get(['backend_url']);
      const backendUrl = storage.backend_url || 'http://127.0.0.1:8765';

      const payload = {
        question: text || 'Solve visible problem and output ONLY the option numbers and answers.',
        image_base64: imageBase64 || null,
        category: 'auto',
        answer_style: 'option_only'
      };

      const res = await fetch(`${backendUrl}/api/solve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error(`Server status ${res.status}`);

      outputText.textContent = '';
      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const token = line.slice(6);
          if (token === '[DONE]') break;
          outputText.textContent += token.replaceAll('⏎', '\n');
        }
      }
    } catch (err) {
      outputText.textContent = `⚠️ Error: ${err.message}. Ensure Lumina backend is running at http://127.0.0.1:8765`;
    } finally {
      scanBtn.disabled = false;
      scanBtn.textContent = '⚡ Scan & Solve Active Page';
    }
  };

  scanBtn.addEventListener('click', async () => {
    chrome.tabs.captureVisibleTab(null, { format: 'jpeg', quality: 80 }, (dataUrl) => {
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
