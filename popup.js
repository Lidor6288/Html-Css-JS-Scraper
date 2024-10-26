// Optimization functions
function minifyHTML(html) {
  return html
    .replace(/\s+/g, ' ')
    .replace(/>\s+</g, '><')
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim();
}

function minifyCSS(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{}:;,])\s*/g, '$1')
    .replace(/;}/g, '}')
    .trim();
}

function removeDuplicateRules(css) {
  const rules = css.match(/[^}]+\{[^{]+\}/g) || [];
  const uniqueRules = {};
  rules.forEach(rule => {
    const selector = rule.match(/[^{]+/)[0].trim();
    uniqueRules[selector] = rule;
  });
  return Object.values(uniqueRules).join('');
}

function extractUsedCSS(html, css) {
  const usedSelectors = new Set();
  const rules = css.match(/[^}]+\{[^{]+\}/g) || [];
  
  rules.forEach(rule => {
    const selector = rule.match(/[^{]+/)[0].trim();
    if (selector === '*' || html.includes(selector.replace(/[.#]/g, ''))) {
      usedSelectors.add(rule);
    }
  });

  return Array.from(usedSelectors).join('');
}

function compressRepeatedStructures(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const body = doc.body;

  function compressChildren(element) {
    const children = Array.from(element.children);
    if (children.length > 5) {
      const firstFew = children.slice(0, 3);
      const lastFew = children.slice(-2);
      const middleCount = children.length - 5;
      
      firstFew.forEach(child => compressChildren(child));
      lastFew.forEach(child => compressChildren(child));

      while (element.children.length > 5) {
        element.removeChild(element.children[3]);
      }

      const placeholder = doc.createElement('div');
      placeholder.textContent = `... ${middleCount} similar elements ...`;
      placeholder.style.color = 'gray';
      placeholder.style.fontStyle = 'italic';
      element.insertBefore(placeholder, element.children[3]);
    } else {
      children.forEach(child => compressChildren(child));
    }
  }

  compressChildren(body);
  return body.innerHTML;
}

function scrapeContent() {
  try {
    // Scrape full HTML content
    let html = document.documentElement.outerHTML;

    // Scrape all CSS
    let css = '';
    Array.from(document.styleSheets).forEach(sheet => {
      try {
        css += Array.from(sheet.cssRules).map(rule => rule.cssText).join('\n');
      } catch (e) {
        if (sheet.href) css += `@import url("${sheet.href}");\n`;
      }
    });

    // Scrape all inline styles
    document.querySelectorAll('style').forEach(style => {
      css += style.textContent + '\n';
    });

    // Scrape all JavaScript
    let js = '';
    Array.from(document.scripts).forEach(script => {
      if (script.src) {
        js += `// Source: ${script.src}\n// External script content not available\n\n`;
      } else {
        js += script.textContent + '\n\n';
      }
    });

    return { html, css, js };
  } catch (error) {
    console.error('Error in scrapeContent:', error);
    return { html: '', css: '', js: '', error: error.message };
  }
}

document.addEventListener('DOMContentLoaded', initializePopup);

function initializePopup() {
  const elements = {
    scrapeButton: document.getElementById('scrapeButton'),
    clearAllButton: document.getElementById('clearAllButton'),
    htmlResult: document.getElementById('htmlResult'),
    cssResult: document.getElementById('cssResult'),
    jsResult: document.getElementById('jsResult'),
    loader: document.getElementById('loader'),
    resultContainer: document.getElementById('result'),
    tabButtons: document.querySelectorAll('.tab-button'),
    codeBlocks: document.querySelectorAll('.code-block'),
    buttonContainer: document.querySelector('.button-container')
  };

  let scrapedContent = { html: '', css: '', js: '' };

  function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error';
    errorDiv.textContent = message;
    document.body.insertBefore(errorDiv, document.body.firstChild);
    setTimeout(() => errorDiv.remove(), 5000);
  }

  function showLoader(show) {
    elements.loader.style.display = show ? 'block' : 'none';
  }

  elements.scrapeButton.addEventListener('click', () => {
    setTimeout(handleScrape, 100);  // 100ms delay
  });
  elements.clearAllButton.addEventListener('click', handleClearAll);
  elements.buttonContainer.addEventListener('click', handleButtonClick);
  elements.tabButtons.forEach(button => {
    button.addEventListener('click', handleTabClick);
  });

  async function handleScrape() {
    showLoader(true);
    elements.resultContainer.style.display = 'none';

    try {
      const tabs = await chrome.tabs.query({active: true, currentWindow: true});
      if (tabs.length === 0) {
        throw new Error('No active tab found');
      }

      const tab = tabs[0];
      if (!tab.url || !tab.url.startsWith('http')) {
        throw new Error('Cannot scrape this page. Make sure you\'re on a web page.');
      }

      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: scrapeContent
      });

      if (!results || results.length === 0) {
        throw new Error('Failed to execute script');
      }

      const result = results[0];
      if (result.error) {
        throw new Error(result.error.message);
      }

      if (!result.result) {
        throw new Error('Script executed but returned no result');
      }

      scrapedContent = result.result;
      updateResults();
      elements.buttonContainer.querySelectorAll('button').forEach(btn => btn.hidden = false);
      elements.resultContainer.style.display = 'block';
    } catch (error) {
      console.error('Scraping error:', error);
      showError(`Error: ${error.message}`);
    } finally {
      showLoader(false);
    }
  }

  function updateResults() {
    // Simplified updateResults function without virtual scrolling
    elements.htmlResult.textContent = scrapedContent.html || 'No HTML content scraped';
    elements.cssResult.textContent = scrapedContent.css || 'No CSS content scraped';
    elements.jsResult.textContent = scrapedContent.js || 'No JavaScript content scraped';
  }

  async function copyToClipboard(text, contentType) {
    try {
      await navigator.clipboard.writeText(text);
      showCopyNotification(contentType);
      animateCopyButton(contentType);
    } catch (err) {
      showError('Failed to copy to clipboard');
    }
  }

  function showCopyNotification(contentType) {
    const notification = document.createElement('div');
    notification.className = 'copy-notification';
    notification.textContent = `${contentType} copied to clipboard!`;
    
    // Add a class based on the content type
    notification.classList.add(`copy-notification-${contentType.toLowerCase()}`);
    
    document.body.appendChild(notification);

    setTimeout(() => {
      notification.classList.add('show');
      setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300); // Wait for fade out animation
      }, 2000);
    }, 10);
  }

  function animateCopyButton(contentType) {
    const buttonId = `copy${contentType}Button`;
    const button = document.getElementById(buttonId);
    if (button) {
      button.classList.add('copy-animation');
      setTimeout(() => button.classList.remove('copy-animation'), 300);
    }
  }

  function handleButtonClick(event) {
    const target = event.target;
    if (target.id === 'copyHtmlButton') {
      copyToClipboard(scrapedContent.html, 'HTML');
    } else if (target.id === 'copyCssButton') {
      copyToClipboard(scrapedContent.css, 'CSS');
    } else if (target.id === 'copyJsButton') {
      copyToClipboard(scrapedContent.js, 'JavaScript');
    } else if (target.id === 'downloadButton') {
      downloadCombinedContent();
    }
  }

  function downloadCombinedContent() {
    const combinedContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Scraped Content</title>
  <style>${scrapedContent.css}</style>
</head>
<body>
${scrapedContent.html}
<script>${scrapedContent.js}</script>
</body>
</html>`;

    const blob = new Blob([combinedContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'scraped_content.html';
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleTabClick(event) {
    const tab = event.target.dataset.tab;
    elements.tabButtons.forEach(btn => btn.classList.remove('active'));
    elements.codeBlocks.forEach(block => block.classList.remove('active'));
    event.target.classList.add('active');
    document.getElementById(`${tab}Result`).classList.add('active');
  }

  function handleClearAll() {
    scrapedContent = { html: '', css: '', js: '' };
    updateResults();
    elements.resultContainer.style.display = 'none';
    elements.buttonContainer.querySelectorAll('button').forEach(btn => btn.hidden = true);
    showCopyNotification('All content cleared');
  }
}
