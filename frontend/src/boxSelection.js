// BOX 3頭の選定だけを切り替える層（t269u）。
// 4歳以上だけのレース（effective_from 以降）: 出走表スコア card-score-age4 で3頭を選ぶ。
// それ以外（3歳以下のみ・混合・欠測・発効日前）: 29特徴の現行選定そのまま。
// 点数(6点)・購入/見送りゲート・自信度は常に29特徴の軸（confidence_axis）で従来どおり計算する。
import { buildRaceRecommendation } from './selectionReason.js'
import { cardBoxAge4, CARD } from './cardScoreAge4.js'

const r4 = v => (v == null || !Number.isFinite(+v) ? null : +(+v).toFixed(4))
export function buildSelection(race, preds, { laterCards = [] } = {}) {
  const rec = buildRaceRecommendation(race, preds)
  const card = cardBoxAge4(race, { laterCards })
  if (card.reason === 'before_effective_date') return rec // 保存済みの過去予想と同一（項目も追加しない）
  const meta = rec.selection_meta
  if (!card.eligible) return { ...rec, selection_meta: { ...meta, box_method: 'model29', box_method_reason: card.reason, card_score_version: CARD?.version ?? null } }
  const byUmaban = new Map(), um = p => Number((race.entries || []).find(e => e.horse_id === p.horse_id)?.umaban)
  for (const p of preds || []) byUmaban.set(um(p), p)
  const top3 = card.box.map(h => { const p = byUmaban.get(h.umaban); return { umaban: h.umaban, name: h.name, score: r4(p?.score), past_form: r4(p?.past_form) } })
  const lead = byUmaban.get(card.box[0].umaban), lh = card.box[0]
  const axis = { horse_id: lead?.horse_id ?? lh.horse_id, umaban: lh.umaban, name: lh.name, score: r4(lead?.score), finish_score: r4(lead?.finish_score), past_form: r4(lead?.past_form), past_form_ok: meta.axis?.past_form_ok ?? null, horse_streak: lead?.horse_streak ?? 0, jockey_streak: lead?.jockey_streak ?? null, top_contribs: (lead?.top_contribs || []).slice(0, 5) }
  const boxHorses = card.box.map(h => `${h.umaban}番${h.name}`)
  const ax = meta.axis
  const comment = rec.selection_comment.replace(/主買い目は三連単三頭ボックス6点（[^）]*）。/, `主買い目は三連単三頭ボックス6点（${boxHorses.join('−')}の全順列）。`) +
    ` 買い目の3頭は4歳以上限定の出走表評価（${CARD.version}）で選定。自信度と推奨/見送りは29特徴の軸${ax ? ` ${ax.umaban}番${ax.name}` : ''}で従来どおり判定。`
  return {
    ...rec, selection_comment: comment,
    selection_meta: {
      ...meta, top3, axis, box_horses: boxHorses,
      confidence_axis: ax, box_method: 'card_score_age4', box_method_reason: card.memrobo_forced ? 'pure_O_memrobo_forced' : 'pure_O',
      card_score_version: CARD.version, card_history_through: card.history_through,
      card_box: { mass: +card.box_mass.toFixed(6), ranks: card.box.map(h => h.card_rank), model29_top3: meta.top3.map(h => h.umaban) },
    },
  }
}
