import { useState } from 'react'
import { RACECARD_DATES } from '../racecards.js'
import { racecardDay } from '../racecardData.js'
const WD = '日月火水木金土'
const label = d => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}(${WD[new Date(d + 'T00:00:00Z').getUTCDay()]})`
const sexAge = e => e.sex && e.age != null ? `${e.sex}${e.age}` : '—'
function Race({ race, open }) {
  const v = race.verification
  return <details className="rc-race" id={`r${race.race_no}`} open={open || undefined} data-race-id={race.race_id} data-head-count={race.head_count}>
    <summary>
      <span className="rc-no">{race.race_no}R</span>
      <span className="rc-time">{race.post_time}</span>
      <span className="rc-title">{race.race_name || '（レース名なし）'}</span>
      <span className="rc-sub">{[race.class, race.prize_band, `${race.distance_m}m`].filter(Boolean).join(' · ')} · <b>{race.head_count}頭</b>{v.scratches.length ? ` · 取消${v.scratches.join('・')}番` : ''}</span>
    </summary>
    <table className="rc-horses">
      <colgroup><col className="rc-col-num" /><col /><col className="rc-col-wt" /><col className="rc-col-jk" /></colgroup>
      <thead><tr><th>馬番</th><th>馬名・性齢</th><th>重量</th><th>騎手／調教師</th></tr></thead>
      <tbody>{race.entries.map(e => <tr key={e.umaban} className={e.status ? 'rc-scratched' : ''}>
        <td><span className={`rc-gate g${e.gate}`} aria-label={`${e.gate}枠`}>{e.gate}</span><b>{e.umaban}</b></td>
        <td><span className="rc-name">{e.name}</span><small>{sexAge(e)}{e.status ? ` · ${e.status}` : ''}</small></td>
        <td>{e.sled_weight ?? '—'}{e.weight_reduction && <small>{e.weight_reduction}減量</small>}</td>
        <td><span>{e.jockey || '—'}</span><small>{e.trainer || '—'}</small></td>
      </tr>)}</tbody>
    </table>
    <details className="rc-more"><summary>条件・出典</summary>
      {race.subtitle && <p>副題 {race.subtitle}</p>}
      {race.pdf_heading && race.pdf_heading !== race.race_name && <p>公式PDF見出し {race.pdf_heading}</p>}
      <p>{race.condition || ''} · 発売締切 {race.close_time || '未取得'}</p>
      <p>{race.nar_condition}</p>
      <p>照合: 公式PDF {v.pdf_head_count}頭 · umanity {v.umanity_head_count}頭 · NAR {v.nar_head_count}頭 · 馬名/馬番/重量/騎手/性齢 {v.horse_fields_agree ? '一致' : '要確認'}</p>
      {v.notes.map(n => <p key={n}>{n}</p>)}
      <p>馬体重・オッズは前日時点で未発表（未取得）。</p>
      <p><a href={race.sources.umanity} target="_blank" rel="noreferrer">umanity</a> · <a href={race.sources.nar} target="_blank" rel="noreferrer">NAR出馬表</a> · {race.sources.pdf.map((u, i) => <a key={u} href={u} target="_blank" rel="noreferrer">公式PDF{i + 1} </a>)}</p>
    </details>
  </details>
}
export default function RaceCardsView({ date, onDate }) {
  const card = racecardDay(date), [all, setAll] = useState(false)
  return <div className="racecards-page">
    <div className="view-heading"><h2>出走表 <span>{date}</span></h2><p>公式PDFを、umanityとNARの出馬表で照合した全頭データです。</p></div>
    <div className="date-chips">{RACECARD_DATES.map(d => <button key={d} className={'chip' + (d === date ? ' on' : '')} onClick={() => onDate(d)}>{label(d)}</button>)}</div>
    {!card ? <p className="end">{date} の出走表は未収録です。上の日付から選んでください。</p> : <>
      <p className="view-status">{card.meta.meeting} · 全{card.races.length}R · {card.meta.entries}頭 · 1R {card.races[0]?.post_time}〜{card.races.length}R {card.races[card.races.length - 1]?.post_time}</p>
      <p className="muted">取得 {card.meta.fetched_at.replace('T', ' ').replace('+09:00', '')} JST。取消・騎手変更は当日の公式発表を優先してください。</p>
      <button className="link" aria-expanded={all} onClick={() => setAll(!all)}>{all ? '全レースを閉じる' : '全レースの出走馬を開く'}</button>
      <div className="rc-list" key={String(all)}>{card.races.map(r => <Race key={r.race_id} race={r} open={all} />)}</div>
    </>}
  </div>
}
