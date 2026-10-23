export interface ExportWord {
  text: string
  isHidden: boolean
  isRevealed: boolean
  lineIndex: number
}

/** สร้างไฟล์ HTML เดี่ยว (ไม่พึ่งไฟล์ภายนอก) สำหรับฝึกท่องแบบออฟไลน์ */
export function buildExportHtml(words: ExportWord[], fontSize: number, theme: string): string {
  // escape "<" กันข้อความที่มี </script> ทำให้ไฟล์พัง
  const wordsJson = JSON.stringify(
    words.map((w) => ({ text: w.text, isHidden: w.isHidden, isRevealed: w.isRevealed, lineIndex: w.lineIndex })),
  ).replace(/</g, '\\u003c')
  const initialFontSize = fontSize
  const initialTheme = theme

  return `<!DOCTYPE html>
<html lang="th" data-theme="${initialTheme}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>บาลีฝึกท่องจำ</title>
<style>
  :root {
    --font-size: ${initialFontSize}rem;
    --bg: #f8f9fa;
    --surface: #ffffff;
    --border: #e3e3e3;
    --text: #1f1f1f;
    --text-soft: #5f6368;
    --text-mute: #70757a;
    --accent: #0b57d0;
    --accent-hover: #0842a0;
    --btn-bg: #f1f3f4;
    --btn-hover: #e2e7eb;
    --slot-dash: #9aa4b2;
    --slot-revealed: #8ab4f8;
    --slot-active: #1f5fe8;
    --slot-text: #0d4bbf;
    --shadow: rgba(0,0,0,0.05);
  }
  html[data-theme="sepia"] {
    --bg: #f4ecd8;
    --surface: #fbf6e9;
    --border: #d9cdb0;
    --text: #3b2f1e;
    --text-soft: #6b5a3e;
    --text-mute: #8a795a;
    --accent: #8b5e34;
    --accent-hover: #6f4a26;
    --btn-bg: #ede0c8;
    --btn-hover: #e0d0b0;
    --slot-dash: #b8a782;
    --slot-revealed: #d4b483;
    --slot-active: #8b5e34;
    --slot-text: #6f4a26;
    --shadow: rgba(80,60,30,0.08);
  }
  html[data-theme="dark"] {
    --bg: #121212;
    --surface: #1e1e1e;
    --border: #333333;
    --text: #e8eaed;
    --text-soft: #b8bcc2;
    --text-mute: #8a8f96;
    --accent: #8ab4f8;
    --accent-hover: #aecbfa;
    --btn-bg: #2a2a2a;
    --btn-hover: #3a3a3a;
    --slot-dash: #5f6368;
    --slot-revealed: #8ab4f8;
    --slot-active: #aecbfa;
    --slot-text: #aecbfa;
    --shadow: rgba(0,0,0,0.4);
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'TH Sarabun New', 'Sarabun', 'Leelawadee UI', 'Tahoma', sans-serif;
    background: var(--bg); color: var(--text); padding: 2rem 1rem;
    min-height: 100vh; transition: background 0.3s, color 0.3s;
  }
  .container {
    max-width: 1200px; margin: 0 auto; background: var(--surface);
    border-radius: 12px; padding: 2rem 3rem;
    box-shadow: 0 2px 6px var(--shadow);
    border: 1px solid var(--border);
    transition: background 0.3s, border-color 0.3s;
  }
  h1 { font-size: 1.8rem; margin-bottom: 1rem; font-weight: 700; }
  .toolbar {
    display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center;
    margin-bottom: 1.5rem; padding-bottom: 1rem; border-bottom: 1px solid var(--border);
  }
  .toolbar button {
    background: var(--btn-bg); color: var(--text); border: none;
    padding: 0.35rem 0.8rem; border-radius: 8px; cursor: pointer;
    font-family: inherit; font-size: 1rem; transition: background 0.2s;
  }
  .toolbar button:hover { background: var(--btn-hover); }
  .toolbar .font-label {
    padding: 0.35rem 0.5rem; font-size: 1rem; color: var(--text-soft);
    min-width: 3.5rem; text-align: center;
  }
  .content {
    line-height: 2.2; font-size: var(--font-size);
    transition: font-size 0.2s ease; color: var(--text);
  }
  /* ข้ามการ layout/paint ของบรรทัดที่อยู่นอกจอ — ช่วยเอกสารยาวมาก */
  .line {
    margin-bottom: 0.25rem;
    content-visibility: auto;
    contain-intrinsic-size: auto 3.5rem;
  }
  .word { display: inline-block; margin-right: 0.6rem; }
  .hidden-slot {
    display: inline; position: relative;
    border-bottom: 2px dashed var(--slot-dash);
    cursor: pointer; user-select: none;
  }
  .hidden-slot .slot-text {
    opacity: 0; visibility: hidden;
    color: var(--slot-text); font-weight: 700; letter-spacing: 0.02em;
    white-space: nowrap;
  }
  @media (hover: hover) {
    .hidden-slot:hover { border-color: var(--slot-active); border-bottom-style: solid; }
    .hidden-slot:hover .slot-text { opacity: 1; visibility: visible; }
  }
  .hidden-slot.is-revealed { border-color: var(--slot-revealed); border-bottom-style: solid; }
  .hidden-slot.is-revealed .slot-text { opacity: 1; visibility: visible; }
  .hidden-slot.is-active { border-color: var(--slot-active); border-bottom-style: solid; }
  .footer {
    margin-top: 2rem; padding-top: 1rem; border-top: 1px solid var(--border);
    font-size: 0.95rem; color: var(--text-soft); text-align: center;
  }
  @media (max-width: 640px) {
    body { padding: 1rem 0.5rem; }
    .container { padding: 1rem; }
  }
  kbd {
    background: var(--btn-bg); border: 1px solid var(--border); border-radius: 4px;
    padding: 0.05rem 0.3rem; font-family: monospace; font-size: 0.9em;
  }
</style>
</head>
<body>
<div class="container">
  <h1>✨ บาลีฝึกท่องจำ</h1>
  <div class="toolbar">
    <button onclick="revealAll(true)">👁️ เฉลยหมด</button>
    <button onclick="revealAll(false)">🙈 ซ่อนหมด</button>
    <button onclick="undoReveal()">⌫ ปิดคำล่าสุด</button>
    <button onclick="changeFont(-0.1)">A-</button>
    <span class="font-label" id="fontLabel">100%</span>
    <button onclick="changeFont(0.1)">A+</button>
    <button onclick="cycleTheme()" id="themeBtn">☀️ สว่าง</button>
  </div>
  <div class="content" id="content"></div>
  <div class="footer">
    💡 <kbd>←</kbd> <kbd>→</kbd> <kbd>↑</kbd> <kbd>↓</kbd> เลื่อน + Auto เปิดเฉลย |
    <kbd>Delete</kbd> / <kbd>Backspace</kbd> ปิดคำล่าสุดถอยหลังทีละคำ |
    <kbd>Shift</kbd>+<kbd>C</kbd> สลับเปิด/ปิดทั้งหมด
  </div>
</div>
<script>
(function() {
  var words = ${wordsJson};
  var baseFontSize = ${initialFontSize};
  var currentFontSize = baseFontSize;
  var activeIndex = -1;
  var hiddenWords = words.filter(function(w) { return w.isHidden; });
  var themes = ['light', 'sepia', 'dark'];
  var themeLabels = { light: '☀️ สว่าง', sepia: '📜 สบายตา', dark: '🌙 โหมดมืด' };
  var currentTheme = document.documentElement.getAttribute('data-theme') || 'light';

  function applyTheme(t) {
    currentTheme = t;
    document.documentElement.setAttribute('data-theme', t);
    var btn = document.getElementById('themeBtn');
    if (btn) btn.textContent = themeLabels[t] || '☀️ สว่าง';
  }

  window.cycleTheme = function() {
    var idx = themes.indexOf(currentTheme);
    applyTheme(themes[(idx + 1) % themes.length]);
  };

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function(c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  var slotEls = [];
  var hiddenIndexOf = new Map();
  hiddenWords.forEach(function(w, i) { hiddenIndexOf.set(w, i); });

  // สร้าง DOM ครั้งเดียว (ใช้ array + join แทนการต่อสตริง) แล้วอัปเดตเฉพาะ class ภายหลัง
  function build() {
    var byLine = new Map();
    words.forEach(function(w) {
      if (!byLine.has(w.lineIndex)) byLine.set(w.lineIndex, []);
      byLine.get(w.lineIndex).push(w);
    });
    var out = [];
    Array.from(byLine.keys()).sort(function(a, b) { return a - b; }).forEach(function(lineIdx) {
      out.push('<div class="line">');
      byLine.get(lineIdx).forEach(function(w) {
        if (w.isHidden) {
          out.push('<span class="word"><span class="hidden-slot" data-h="' + hiddenIndexOf.get(w) + '">'
            + '<span class="slot-text">' + escapeHtml(w.text) + '</span></span></span>');
        } else {
          out.push('<span class="word">' + escapeHtml(w.text) + '</span>');
        }
      });
      out.push('</div>');
    });
    var container = document.getElementById('content');
    container.innerHTML = out.join('');
    slotEls = Array.prototype.slice.call(container.querySelectorAll('.hidden-slot'));
    slotEls.forEach(function(_, i) { updateSlot(i); });
  }

  function updateSlot(i) {
    var el = slotEls[i];
    if (!el) return;
    el.classList.toggle('is-revealed', !!hiddenWords[i].isRevealed);
    el.classList.toggle('is-active', i === activeIndex);
  }

  function setActive(i) {
    var prev = activeIndex;
    activeIndex = i;
    if (prev >= 0 && prev !== i) updateSlot(prev);
    updateSlot(i);
  }

  // Event delegation: ผูก listener ตัวเดียวที่ container
  document.getElementById('content').addEventListener('click', function(e) {
    var t = e.target;
    var slot = t && t.closest ? t.closest('.hidden-slot') : null;
    if (!slot) return;
    var i = Number(slot.getAttribute('data-h'));
    hiddenWords[i].isRevealed = !hiddenWords[i].isRevealed;
    setActive(i);
  });

  function render() {
    slotEls.forEach(function(_, i) { updateSlot(i); });
  }

  window.revealAll = function(reveal) {
    words.forEach(function(w) { if (w.isHidden) w.isRevealed = reveal; });
    render();
  };

  window.undoReveal = function() {
    var lastRevealedIdx = -1;
    for (var i = hiddenWords.length - 1; i >= 0; i--) {
      if (hiddenWords[i].isRevealed) { lastRevealedIdx = i; break; }
    }
    if (lastRevealedIdx !== -1) {
      hiddenWords[lastRevealedIdx].isRevealed = false;
      setActive(lastRevealedIdx);
    }
  };

  window.changeFont = function(delta) {
    var next = Math.round((currentFontSize + delta) * 10) / 10;
    if (next >= 1.1 && next <= 2.5) {
      currentFontSize = next;
      document.documentElement.style.setProperty('--font-size', currentFontSize + 'rem');
      document.getElementById('fontLabel').textContent =
        Math.round((currentFontSize / 1.5) * 100) + '%';
    }
  };

  document.addEventListener('keydown', function(e) {
    if (hiddenWords.length === 0) return;
    if (e.shiftKey && (e.key === 'C' || e.key === 'c' || e.key === 'ฉ')) {
      e.preventDefault();
      var allRevealed = hiddenWords.every(function(w) { return w.isRevealed; });
      window.revealAll(!allRevealed);
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      window.undoReveal();
      return;
    }
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      if (activeIndex + 1 < hiddenWords.length) {
        hiddenWords[activeIndex + 1].isRevealed = true;
        setActive(activeIndex + 1);
      }
      return;
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (activeIndex - 1 >= 0) {
        hiddenWords[activeIndex - 1].isRevealed = true;
        setActive(activeIndex - 1);
      }
      return;
    }
  });

  document.getElementById('fontLabel').textContent =
    Math.round((currentFontSize / 1.5) * 100) + '%';
  applyTheme(currentTheme);
  build();
})();
<\/script>
</body>
</html>`
}
