import { useMemo } from 'react'
import rules from '../data/skip_rules.json' with { type: 'json' }
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

function RaceConfCard({ race, rec, axis, partners, tickets, horses, label, rank }) {
  return (
    <article key={race.race_id} className="card conf-card" data-confidence={rec.confidence}>
      <header className="card-head">
        <span className="rno">#{rank}</span>
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
          {axis?.past_form != null && (
            <span className="meta">
              （past_form {Number(axis.past_form).toFixed(3)} · スコア {Number(axis.score).toFixed(3)}）
            </span>
          )}
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
  )
}

function BandSection({ title, hint, rows, label, emptyText }) {
  return (
    <section className="conf-band" style={{ marginBottom: 28 }}>
      <h2 className="conf-band-title" style={{
        margin: '0 0 10px', fontSize: '1.05rem',
        borderBottom: '2px solid #2A6B3C', paddingBottom: 6,
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
          <RaceConfCard key={row.race.race_id} {...row} label={label} rank={i + 1} />
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
    const sorted = sortRows(out)
    return {
      high: sorted.filter(r => (r.rec.confidence ?? 0) >= BAND_HIGH),
      mid: sorted.filter(r => {
        const c = r.rec.confidence ?? 0
        return c >= BAND_MID && c < BAND_HIGH
      }),
    }
  }, [date])

  const label = rules.ticket?.label || '三連単三頭ボックス6点'
  const stake = rules.ticket?.stakeYen || 600
  const boxIdx = (rules.ticket?.boxIdx || [0, 1, 2]).map(i => i + 1).join('')
  const cfg = `plus_hjz・BOX${boxIdx}・pf≥${rules.pastFormThreshold}・k=${rules.streakPenaltyK}`
  const total = high.length + mid.length

  if (!total) {
    return (
      <div className="confidence-rank">
        <p className="end">自信度 {BAND_MID} 以上の推奨レースはありません（対象: {date}）。</p>
        <p className="meta">構成: {cfg}</p>
      </div>
    )
  }

  return (
    <div className="confidence-rank">
      <p className="count">
        {date} 自信度順 · 0.8以上 / 0.7以上（0.8未満） · 合計 {total}レース
        <span style={{ marginLeft: 8, opacity: 0.75 }}>（{cfg} · {label} ¥{stake}）</span>
      </p>

      <BandSection
        title="自信度 0.8以上"
        hint="優先して見る帯です。"
        rows={high}
        label={label}
        emptyText="この帯の推奨はありません。"
      />

      <BandSection
        title="自信度 0.7以上（0.8未満）"
        hint="0.8未満の次点帯です。券種は同じく三連単三頭ボックス6点です。"
        rows={mid}
        label={label}
        emptyText="この帯の推奨はありません。"
      />
    </div>
  )
}
