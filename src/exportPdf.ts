import { buildExportHtml, type ExportWord } from './exportHtml'

export interface PdfOptions {
  title?: string
  /** ขนาดตัวอักษร (rem) เหมือนที่ใช้ในหน้าแอป/ไฟล์ export HTML */
  fontSize?: number
  /** light | sepia | dark — ใช้ธีมเดียวกับหน้าจอ */
  theme?: string
}

/** ความกว้างหน้ากระดาษ (px) — เท่ากับผลที่ได้จากการแปลงไฟล์ HTML ด้วย sejda.com */
const PAGE_WIDTH_PX = 1181
/** Chrome จำกัดความสูงหน้ากระดาษประมาณ 200 นิ้ว; ถ้ายาวกว่านี้ให้ตัดเป็นหลายหน้า */
const MAX_SINGLE_PAGE_PX = 18000
const SPLIT_PAGE_HEIGHT_PX = 1670

/** CSS เสริมเฉพาะตอนสร้าง PDF (ไม่กระทบไฟล์ export HTML) */
const PRINT_TWEAKS = `
<style id="pdf-tweaks">
  html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { min-height: 0 !important; }
  .line { content-visibility: visible !important; contain-intrinsic-size: auto !important; break-inside: avoid; page-break-inside: avoid; }
</style>`

/**
 * ส่งออกเป็น PDF ที่หน้าตาเหมือนหน้าแสดงผลของไฟล์ Export HTML ทุกอย่าง
 * (การ์ด, ชื่อบท, แถบปุ่ม, เนื้อหาที่ซ่อนคำเป็นเส้นประ, บรรทัดคีย์ลัด)
 * โดยโหลดหน้า HTML ตัวเดียวกันลง iframe ที่ซ่อนอยู่ วัดความสูง ตั้งขนาดหน้ากระดาษให้พอดี
 * แล้วเปิดหน้าต่างพิมพ์ — เลือก "บันทึกเป็น PDF"
 */
export function exportToPdf(words: ExportWord[], opts: PdfOptions = {}): void {
  if (words.length === 0) return

  const html = buildExportHtml(words, opts.fontSize ?? 1.5, opts.theme ?? 'light', opts.title ?? '').replace(
    '</head>',
    `${PRINT_TWEAKS}\n</head>`,
  )

  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  // อยู่นอกจอแต่ต้องมีขนาดจริง เพื่อให้เบราว์เซอร์จัดวางเนื้อหาและวัดความสูงได้
  iframe.style.cssText = `position:fixed;left:-10000px;top:0;width:${PAGE_WIDTH_PX}px;height:900px;border:0;visibility:hidden;`
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
      // วัดจาก body (ไม่ใช้ documentElement.scrollHeight เพราะจะไม่ต่ำกว่าความสูง viewport ของ iframe)
      const height = Math.ceil(doc.body.getBoundingClientRect().height) + 4
      const pageHeight = height <= MAX_SINGLE_PAGE_PX ? height : SPLIT_PAGE_HEIGHT_PX
      const page = doc.createElement('style')
      page.textContent = `@page { size: ${PAGE_WIDTH_PX}px ${pageHeight}px; margin: 0; }`
      doc.head.appendChild(page)
      win.focus()
      win.addEventListener('afterprint', cleanup, { once: true })
      win.print()
    } catch {
      cleanup()
    }
  }

  // รอฟอนต์โหลดเสร็จก่อนวัดความสูง เพื่อให้หน้าไม่ยาวเกินหรือขาด
  const fonts = (doc as Document & { fonts?: { ready: Promise<unknown> } }).fonts
  if (fonts?.ready) fonts.ready.then(() => setTimeout(startPrint, 80), () => setTimeout(startPrint, 80))
  else setTimeout(startPrint, 300)
}
