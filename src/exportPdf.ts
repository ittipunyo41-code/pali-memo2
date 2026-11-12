import { buildExportHtml, type ExportWord } from './exportHtml'

export interface PdfOptions {
  title?: string
  /** ขนาดตัวอักษร (rem) เหมือนที่ใช้ในหน้าแอป/ไฟล์ export HTML */
  fontSize?: number
  /** light | sepia | dark — ใช้ธีมเดียวกับหน้าจอ */
  theme?: string
}

/**
 * ส่งออกเนื้อหาเป็น PDF ขนาด A4 โดยใช้สไตล์พิมพ์ของไฟล์ Export HTML
 * โดยโหลดหน้า HTML ตัวเดียวกันลง iframe ที่ซ่อนอยู่ แล้วเปิดหน้าต่างพิมพ์
 */
export function exportToPdf(words: ExportWord[], opts: PdfOptions = {}): void {
  if (words.length === 0) return

  const html = buildExportHtml(words, opts.fontSize ?? 1.5, opts.theme ?? 'light', opts.title ?? '')

  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  // อยู่นอกจอแต่ต้องมีขนาดจริง เพื่อให้เบราว์เซอร์จัดวางเนื้อหาได้
  iframe.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px;height:900px;border:0;visibility:hidden;'
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

  // รอฟอนต์โหลดเสร็จก่อนเปิดหน้าพิมพ์ เพื่อให้การจัดหน้าใช้ฟอนต์ที่ถูกต้อง
  const fonts = (doc as Document & { fonts?: { ready: Promise<unknown> } }).fonts
  if (fonts?.ready) fonts.ready.then(() => setTimeout(startPrint, 80), () => setTimeout(startPrint, 80))
  else setTimeout(startPrint, 300)
}
