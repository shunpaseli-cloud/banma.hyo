import { DATA } from '../dataSource.js'
export default function DataBanner({ data = DATA }) {
  if (!data.warning) return (
    <div className="src-ok">出典: ばんえい競馬 公式出走表PDF（{data.meta?.race_date}・取得 {data.meta?.fetched_at?.slice(0, 16).replace('T', ' ')}）</div>)
  return (
    <div className="warn-banner" role="alert">
      <strong>⚠ データ未検証</strong>
      <span>公式出走表PDFの取得に失敗したため、{data.source === 'html' ? 'HTMLスクレイパー' : '同梱サンプル'}由来のデータを表示しています。馬番・騎手・重量などは公式発表と異なる可能性があります。</span>
    </div>)
}
