// 同梱済み PDF 由来レースを返す。無効なら null（呼び出し側でフォールバック）。
import { validPdfRaces } from './dataSource.js'
import META from './data/meta.json'
import PDF_RACES from './data/races_from_pdf.json'
export function getPdfRaces() {
  try { return validPdfRaces(META, PDF_RACES) ? PDF_RACES : null }
  catch (e) { console.error('[pdfRaces]', e); return null }
}
