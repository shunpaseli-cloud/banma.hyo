import { useMemo } from 'react'
import rules from '../data/skip_rules.json' with { type: 'json' }
import { DATES, dayInfo } from '../lib/paginate.js'
import { predict } from '../feedback.js'
import { buildRaceRecommendation } from '../selectionReason.js'
import { boxPicks } from '../trioPayout.jsx'

const CONF_MIN = 0.8
const TARGET_DATES = ['2026-11-06', '2026-11-07', '2026-11-08']

/**
 * 自信度順タブ: 本番構成の推奨レースを confidence 降順で並べ、
 * 三連単三頭ボックス6点の券番号・軸・相手・選定理由を表示。
 * learned_model.json は参照のみ（変更しない）。
 */
export default function ConfidenceRank({ dates = TARGET_DATES, minConfidence = CONF_MIN }) {
  const rows = useMemo(() => {
    const want = new Set(dates?.length ? dates : TARGET_DATES)
    const out = []
    for (const d of DATES) {
      if (!want.has(d)) continue
      for (const race of dayInfo(d).races) {
        const preds = predict(race)
        const rec = buildRaceRecommendation(race, preds)
        if (!rec.recommended) continue
        if ((rec.confidence ?? 0) < minConfidence) continue
        const box = boxPicks(race, preds)
        const meta = rec.selection_meta || {}
        const axis = meta.axis
        const partners = (meta.top3 || []).filter(t => String(t.umaban) !== String(axis?.umaban))
        const tickets = (box.tickets || []).map(nums => ({
          order: nums.join('-'),
          detail: nums.map(n => {
            const e = (race.entries || []).find(x => Number(x.umaban ?? x.gate) === Number(n))
            return `${n}番${e?.name || '?'}`
          }).join(' → '),
        }))
        out.push({
          race,
          rec,
          box,
          axis,
          partners,
          tickets,
          horses: box.horses || [],
        })
      }
    }
    out.sort((a, b) => {
      const dc = (b.rec.confidence ?? 0) - (a.rec.confidence ?? 0)
      if (dc) return dc
      if (a.race.race_date !== b.race.race_date) return a.race.race_date < b.race.race_date ? -1 : 1
      return a.race.race_no - b.race.race_no
    })
    return out
  }, [dates, minConfidence])

  const label = rules.ticket?.label || '三連単三頭ボックス6点'
  const stake = rules.ticket?.stakeYen || 600
  const boxIdx = (rules.ticket?.boxIdx || [0, 1, 2]).map(i => i + 1).join('')
  const cfg = `plus_hjz・BOX${boxIdx}・pf≥${rules.pastFormThreshold}・k=${rules.streakPenaltyK}`

  if (!rows.length) {
    return (
      <div className="confidence-rank">
        <p className="end">自信度 {minConfidence} 以上の推奨レースはありません（対象: {dates.join('・')}）。</p>
        <p className="meta">構成: {cfg}</p>
      </div>
    )
  }

  return (
    <div className="confidence-rank">
      <p className="count">
        自信度順 · {minConfidence.toFixed(1)}以上 · {rows.length}レース
        <span style={{ marginLeft: 8, opacity: 0.75 }}>（{cfg} · {label} ¥{stake}）</span>
      </p>
      {rows.map(({ race, rec, axis, partners, tickets, horses }, i) => (
        <article key={race.race_id} className="card conf-card" data-confidence={rec.confidence}>
          <header className="card-head">
            <span className="rno">#{i + 1}</span>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.15rem' }}>
                {race.race_date} {race.race_no}R
                <span style={{ marginLeft: 8, color: '#2A6B3C', fontWeight: 700 }}>
                  自信度 {(rec.confidence * 100).toFixed(0)}%（{rec.selection_meta?.confidence_label || '—'}）
                </span>
              </h2>
              <p className="meta">
                {race.name || race.race_name || ''}
                {race.track_moisture != null ? ` · 馬場水分 ${race.track_moisture}%` : ''}
                · {race.entries?.length ?? '—'}頭
              </p>
            </div>
          </header>

          <div style={{ padding: '10px 14px' }}>
            <p className="trio-main" style={{ color: '#221E18', margin: '4px 0' }}>
              軸: {axis ? `${axis.umaban}番${axis.name}` : '—'}
              {axis?.past_form != null && <span className="meta">（past_form {Number(axis.past_form).toFixed(3)} · スコア {Number(axis.score).toFixed(3)}）</span>}
            </p>
            <p className="meta" style={{ margin: '4px 0' }}>
              相手: {partners.length
                ? partners.map(p => `${p.umaban}番${p.name}`).join(' · ')
                : '—'}
            </p>
            <p className="meta" style={{ margin: '4px 0' }}>
              ボックス頭: <span className="nowrap"><b>{horses.join('−')}</b></span>
            </p>

            <div className="ticket-box" style={{
              border: '2px solid #D85A2A', background: '#16130F', color: '#F3EEE4',
              padding: '10px 12px', margin: '8px 0', borderRadius: 4,
            }}>
              <p style={{ margin: '0 0 6px', color: '#D85A2A', fontWeight: 700 }}>
                {label} · 券番号（馬番の6点）
              </p>
              <ol className="trio-list" style={{ margin: 0, paddingLeft: '1.2em' }}>
                {tickets.map(t => (
                  <li key={t.order}>
                    <b style={{ marginLeft: 0, marginRight: 8 }}>{t.order}</b>
                    <span style={{ opacity: 0.85, fontSize: '.85rem' }}>{t.detail}</span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="selection-comment" style={{
              border: '2px solid #2A6B3C', background: '#E8F3EA',
              padding: '8px 10px', margin: '6px 0', borderRadius: 4,
            }}>
              <p className="meta" style={{ margin: 0 }}><b>選定理由</b>（confidence={rec.confidence.toFixed(2)}）</p>
              <p className="meta" style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                {rec.selection_comment}
              </p>
            </div>
          </div>
        </article>
      ))}
    </div>
  )
}

