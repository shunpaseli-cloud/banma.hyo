import RecommendationCard from './RecommendationCard.jsx'
import { useMemo } from 'react'
import { dayInfo } from '../lib/paginate.js'
import { predict } from '../feedback.js'
import { buildRaceRecommendation } from '../selectionReason.js'
import { boxPicks } from '../trioPayout.jsx'

const BAND_HIGH = 0.8
const BAND_MID = 0.7

function sortRows(rows) {
  return [...rows].sort((a, b) => {
    const dc = (b.rec.confidence ?? 0) - (a.rec.confidence ?? 0)
    if (dc) return dc
    if (a.race.race_date !== b.race.race_date) return a.race.race_date < b.race.race_date ? -1 : 1
    return a.race.race_no - b.race.race_no
  })
}

function BandSection({ title, hint, rows, emptyText }) {
  return (
    <section className="conf-band" style={{ marginBottom: 28 }}>
      <h2 className="conf-band-title" style={{
        margin: '0 0 10px', fontSize: '1.05rem',
        borderBottom: '1px solid #b9c3ca', paddingBottom: 6,
      }}>
        {title}
        <span style={{ marginLeft: 8, fontWeight: 500, opacity: 0.8 }}>
          {rows.length}レース
        </span>
      </h2>
      {hint && <p className="meta" style={{ margin: '0 0 10px' }}>{hint}</p>}
      {!rows.length ? (
        <p className="end">{emptyText}</p>
      ) : (
        rows.map((row, i) => (
          <RecommendationCard key={row.race.race_id} race={row.race} rec={row.rec} tickets={row.box.tickets} rank={i + 1} />
        ))
      )}
    </section>
  )
}

/**
 * 自信度順タブ: 選択日の本番構成の推奨レースを
 * 0.8以上 / 0.7以上（0.8未満）の2帯に分け、各帯内は confidence 降順。
 * 三連単三頭ボックス6点の券番号・軸・相手・選定理由を表示。
 * learned_model.json は参照のみ（変更しない）。
 */
export default function ConfidenceRank({ date }) {
  const { high, mid } = useMemo(() => {
    const out = []
    for (const race of dayInfo(date).races) {
      const preds = predict(race)
      const rec = buildRaceRecommendation(race, preds)
      if (!rec.recommended) continue
      const conf = rec.confidence ?? 0
      if (conf < BAND_MID) continue
      const box = boxPicks(race, preds)
      out.push({race,rec,box})
    }
    const sorted = sortRows(out)
    return {
      high: sorted.filter(r => (r.rec.confidence ?? 0) >= BAND_HIGH),
      mid: sorted.filter(r => {
        const c = r.rec.confidence ?? 0
        return c >= BAND_MID && c < BAND_HIGH
      }),
    }
  }, [date])

  const total = high.length + mid.length

  if (!total) {
    return (
      <div className="confidence-rank">
        <p className="end">自信度 {BAND_MID} 以上の推奨レースはありません（対象: {date}）。</p>
        <p className="meta">推奨条件に合うレースだけを表示しています。</p>
      </div>
    )
  }

  return (
    <div className="confidence-rank">
      <p className="count">
        {date} 自信度順 · 0.8以上 / 0.7以上（0.8未満） · 合計 {total}レース
        <span style={{ marginLeft: 8, opacity: 0.75 }}>（三連単3頭BOX · 各100円／計600円）</span>
      </p>

      <BandSection
        title="自信度 0.8以上"
        hint="優先して見る帯です。"
        rows={high}
        emptyText="この帯の推奨はありません。"
      />

      <BandSection
        title="自信度 0.7以上（0.8未満）"
        hint="0.8未満の次点帯です。券種は同じく三連単三頭ボックス6点です。"
        rows={mid}
        emptyText="この帯の推奨はありません。"
      />
    </div>
  )
}
