export interface PdfWord {
  text: string
  isHidden: boolean
  lineIndex: number
}

export interface PdfOptions {
  title?: string
  /** แนบหน้าเฉลย (คำที่ซ่อนจะแสดงเป็นตัวหนามีขีดเส้นใต้) ต่อท้ายใบฝึก */
  includeAnswerKey?: boolean
  /** ขนาดตัวอักษรในเอกสาร หน่วย pt */
  fontSizePt?: number
}

const esc = (t: string) =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** จัดกลุ่มคำตามบรรทัด */
function groupByLine(words: PdfWord[]): PdfWord[][] {
  const map = new Map<number, PdfWord[]>()
  words.forEach(w => {
    if (!map.has(w.lineIndex)) map.set(w.lineIndex, [])
    map.get(w.lineIndex)!.push(w)
  })
  return Array.from(map.keys())
    .sort((a, b) => a - b)
    .map(k => map.get(k)!)
}

/**
 * ช่องว่างแทนคำที่ซ่อน: ความกว้างอิงจำนวนตัวอักษรของคำนั้น
 * (ใช้หน่วย em เพื่อให้พอดีกับทุกขนาดฟอนต์ และไม่เฉลยคำ)
 */
function blank(text: string): string {
  const chars = Array.from(text).length
  const width = Math.min(Math.max(chars * 0.55, 2), 14)
  return `<span class="blank" style="min-width:${width.toFixed(2)}em">&nbsp;</span>`
}

function renderBody(lines: PdfWord[][], mode: 'practice' | 'answer'): string {
  return lines
    .map(line => {
      const inner = line
        .map(w => {
          if (!w.isHidden) return `<span class="w">${esc(w.text)}</span>`
          return mode === 'practice'
            ? `<span class="w">${blank(w.text)}</span>`
            : `<span class="w"><span class="ans">${esc(w.text)}</span></span>`
        })
        .join(' ')
      return `<p class="line">${inner}</p>`
    })
    .join('\n')
}

/** สร้าง HTML สำหรับพิมพ์/บันทึกเป็น PDF (ใช้ธีมสว่างเสมอเพื่อประหยัดหมึกและอ่านง่าย) */
export function buildPdfHtml(words: PdfWord[], opts: PdfOptions = {}): string {
  const title = (opts.title ?? '').trim() || 'ท่องบาลี'
  const fontPt = opts.fontSizePt ?? 18
  const lines = groupByLine(words)
  const hiddenCount = words.filter(w => w.isHidden).length
  const includeKey = opts.includeAnswerKey !== false && hiddenCount > 0

  const keySection = includeKey
    ? `<section class="sheet key">
  <h1>${esc(title)} <small>เฉลย</small></h1>
  ${renderBody(lines, 'answer')}
</section>`
    : ''

  return `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<title>${esc(title)}</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #000; }
  body {
    font-family: 'TH Sarabun New', 'Sarabun', 'Leelawadee UI', 'Noto Sans Thai', 'Tahoma', sans-serif;
    font-size: ${fontPt}pt;
    line-height: 1.9;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  h1 { font-size: 1.25em; margin: 0 0 0.6em; padding-bottom: 0.25em; border-bottom: 1.5px solid #444; }
  h1 small { font-size: 0.6em; font-weight: 400; color: #555; margin-left: 0.5em; }
  .sheet + .sheet { break-before: page; page-break-before: always; }
  .line { margin: 0 0 0.15em; orphans: 2; widows: 2; }
  .w { display: inline; }
  .blank {
    display: inline-block;
    border-bottom: 1.4px solid #000;
    vertical-align: baseline;
    margin: 0 0.1em;
  }
  .ans { font-weight: 700; border-bottom: 1.4px solid #0b57d0; color: #0b3d91; }
  .foot { margin-top: 1.2em; font-size: 0.55em; color: #777; text-align: right; }
</style>
</head>
<body>
<section class="sheet">
  <h1>${esc(title)}</h1>
  ${renderBody(lines, 'practice')}
  <div class="foot">เติมคำที่หายไป · ${hiddenCount} ช่อง</div>
</section>
${keySection}
</body>
</html>`
}

/**
 * เปิดหน้าต่างพิมพ์ของเบราว์เซอร์ผ่าน iframe ที่ซ่อนอยู่
 * แล้วให้ผู้ใช้เลือก "บันทึกเป็น PDF" (Save as PDF) — ฟอนต์ไทยแสดงถูกต้อง และใช้ได้ออฟไลน์
 */
export function exportToPdf(words: PdfWord[], opts: PdfOptions = {}): void {
  if (words.length === 0) return
  const html = buildPdfHtml(words, opts)

  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;'
  document.body.appendChild(iframe)

  const cleanup = () => {
    // หน่วงเล็กน้อยกันเบราว์เซอร์บางตัวปิดก่อนพิมพ์เสร็จ
    setTimeout(() => iframe.remove(), 1000)
  }

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

  // รอฟอนต์โหลดเสร็จก่อนพิมพ์ เพื่อให้ตัวอักษรไทยไม่เพี้ยน
  const fonts = (doc as Document & { fonts?: { ready: Promise<unknown> } }).fonts
  if (fonts?.ready) fonts.ready.then(() => setTimeout(startPrint, 50), () => setTimeout(startPrint, 50))
  else setTimeout(startPrint, 250)
}
