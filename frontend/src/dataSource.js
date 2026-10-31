// 表示データの出所を決める。PDF（公式出走表）由来なら警告なし、それ以外は「データ未検証」。
import META from './data/meta.json'
import PDF_RACES from './data/races_from_pdf.json'
import SEED_RACES from './data/races.json'

export function validPdfRaces(meta, races) {
  return meta?.source === 'pdf' && Array.isArray(races) && races.length > 0 &&
    races.every(r => Array.isArray(r.entries) && r.entries.length > 0 && r.entries.every(e => e.name && e.umaban))
}

export function resolveDataSource(meta = META, pdfRaces = PDF_RACES, seed = SEED_RACES) {
  try {
    if (validPdfRaces(meta, pdfRaces))
      return { source: 'pdf', warning: false, races: pdfRaces, meta }
  } catch (e) { console.error('[dataSource] PDFデータ検証失敗', e) }
  // フォールバック: HTMLスクレイパー由来 / 同梱seed
  const source = meta?.source === 'html' ? 'html' : 'seed'
  return { source, warning: true, races: seed, meta }
}

export const DATA = resolveDataSource()
