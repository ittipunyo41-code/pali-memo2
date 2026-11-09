export interface PdfWord {
  text: string
  isHidden: boolean
  isRevealed?: boolean
  lineIndex: number
}

export interface PdfOptions {
  title?: string
  /** ขนาดตัวอักษร (rem) เหมือนที่ใช้ในหน้าแอป/ไฟล์ export HTML */
  fontSize?: number
  /** light | sepia | dark — ใช้ธีมเดียวกับหน้าจอ */
  theme?: string
  /** แสดงคำที่เปิดเฉลยไว้แล้วในแอป (ค่าเริ่มต้น: ซ่อนทุกคำที่เลือก) */
  keepRevealed?: boolean
}

const esc = (t: string) =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * สร้างหน้าที่หน้าตาเหมือนไฟล์ HTML ที่ export (หน้าฝึกท่อง):
 * ชื่อบท + เนื้อหา โดยคำที่ซ่อนเป็นเส้นประใต้ตัวอักษรที่มองไม่เห็น (ความกว้างเท่าคำจริง)
 * ตัดแถบปุ่ม/คีย์ลัดออก เพราะใช้งานใน PDF ไม่ได้
 */
export function buildPdfHtml(words: PdfWord[], opts: PdfOptions = {}): string {
  const pageTitle = (opts.title ?? '').trim() ? esc((opts.title ?? '').trim()) : 'ท่องบาลี'
  const fontSize = opts.fontSize ?? 1.5
  const theme = ['light', 'sepia', 'dark'].includes(opts.theme ?? '') ? (opts.theme as string) : 'light'

  const byLine = new Map<number, PdfWord[]>()
  words.forEach(w => {
    if (!byLine.has(w.lineIndex)) byLine.set(w.lineIndex, [])
    byLine.get(w.lineIndex)!.push(w)
  })

  const body = Array.from(byLine.keys())
    .sort((a, b) => a - b)
    .map(k => {
      const inner = byLine
        .get(k)!
        .map(w => {
          if (!w.isHidden) return `<span class="word">${esc(w.text)}</span>`
          const shown = opts.keepRevealed && w.isRevealed ? ' is-revealed' : ''
          return `<span class="word"><span class="hidden-slot${shown}"><span class="slot-text">${esc(w.text)}</span></span></span>`
        })
        .join('')
      return `<div class="line">${inner}</div>`
    })
    .join('\n')

  return `<!DOCTYPE html>
<html lang="th" data-theme="${theme}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${pageTitle}</title>
<style>
  @page { size: A4; margin: 10mm; }
  :root {
    --font-size: ${fontSize}rem;
    --bg: #f8f9fa;
    --surface: #ffffff;
    --border: #e3e3e3;
    --text: #1f1f1f;
    --slot-dash: #9aa4b2;
    --slot-revealed: #8ab4f8;
    --slot-text: #0d4bbf;
  }
  html[data-theme="sepia"] {
    --bg: #f4ecd8;
    --surface: #fbf6e9;
    --border: #d9cdb0;
    --text: #3b2f1e;
    --slot-dash: #b8a782;
    --slot-revealed: #d4b483;
    --slot-text: #6f4a26;
  }
  html[data-theme="dark"] {
    --bg: #121212;
    --surface: #1e1e1e;
    --border: #333333;
    --text: #e8eaed;
    --slot-dash: #5f6368;
    --slot-revealed: #8ab4f8;
    --slot-text: #aecbfa;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    background: var(--bg);
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  body {
    font-family: 'TH Sarabun New', 'Sarabun', 'Leelawadee UI', 'Noto Sans Thai', 'Tahoma', sans-serif;
    color: var(--text);
    padding: 0;
  }
  .container {
    background: var(--surface);
    border-radius: 12px;
    padding: 1.5rem 2rem;
    border: 1px solid var(--border);
  }
  h1 { font-size: 1.8rem; margin-bottom: 1rem; font-weight: 700; }
  .content { line-height: 2.2; font-size: var(--font-size); color: var(--text); }
  .line { margin-bottom: 0.25rem; break-inside: avoid; page-break-inside: avoid; }
  .word { display: inline-block; margin-right: 0.6rem; }
  .hidden-slot {
    display: inline; position: relative;
    border-bottom: 2px dashed var(--slot-dash);
  }
  .hidden-slot .slot-text {
    opacity: 0; visibility: hidden;
    color: var(--slot-text); font-weight: 700; letter-spacing: 0.02em;
    white-space: nowrap;
  }
  .hidden-slot.is-revealed { border-bottom-style: solid; border-color: var(--slot-revealed); }
  .hidden-slot.is-revealed .slot-text { opacity: 1; visibility: visible; }
</style>
</head>
<body>
<div class="container">
  <h1>✨ ${pageTitle}</h1>
  <div class="content">
${body}
  </div>
</div>
</body>
</html>`
}

/**
 * เปิดหน้าต่างพิมพ์ของเบราว์เซอร์ผ่าน iframe ที่ซ่อนอยู่
 * แล้วเลือก "บันทึกเป็น PDF" — ได้หน้าตาเหมือนไฟล์ HTML ที่ export
 */
export function exportToPdf(words: PdfWord[], opts: PdfOptions = {}): void {
  if (words.length === 0) return
  const html = buildPdfHtml(words, opts)

  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;'
  document.body.appendChild(iframe)

  const cleanup = () => setTimeout(() => iframe.remove(), 1000)

  const doc = iframe.contentDocument
  const win = iframe.contentWindow
  if (!doc || !win) {
    iframe.remove()
    return
  }

  doc.open()
  doc.write(html)
  doc.close()

  const startPrint = () => {
    try {
      win.focus()
      win.addEventListener('afterprint', cleanup, { once: true })
      win.print()
    } catch {
      cleanup()
    }
  }

  const fonts = (doc as Document & { fonts?: { ready: Promise<unknown> } }).fonts
  if (fonts?.ready) fonts.ready.then(() => setTimeout(startPrint, 50), () => setTimeout(startPrint, 50))
  else setTimeout(startPrint, 250)
}
