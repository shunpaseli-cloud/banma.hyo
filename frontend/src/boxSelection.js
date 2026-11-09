// BOX 3頭の選定だけを切り替える層（t269u / t279u）。
// - 重賞かつ4歳以上のみ（effective_from 以降）: card-score と graded5 を等重み合成
// - 非重賞の4歳以上のみ: card-score-age4
// - 3歳以下のみ・混合・欠測・発効日前: 29特徴の現行選定
// 点数(6点)・購入/見送りゲート・自信度は常に29特徴の軸（confidence_axis）で従来どおり。
import { buildRaceRecommendation } from './selectionReason.js'
import { cardBoxAge4, CARD } from './cardScoreAge4.js'
import { gradedCombineBox, isGradedRace, GRADED } from './gradedScoreAge4.js'

const r4 = v => (v == null || !Number.isFinite(+v) ? null : +(+v).toFixed(4))

function applyBox(rec, race, preds, boxHorsesMeta, method, extra = {}) {
  const meta = rec.selection_meta
  const byUmaban = new Map(), um = p => Number((race.entries || []).find(e => e.horse_id === p.horse_id)?.umaban)
  for (const p of preds || []) byUmaban.set(um(p), p)
  const top3 = boxHorsesMeta.map(h => { const p = byUmaban.get(h.umaban); return { umaban: h.umaban, name: h.name, score: r4(p?.score), past_form: r4(p?.past_form) } })
  const lead = byUmaban.get(boxHorsesMeta[0].umaban), lh = boxHorsesMeta[0]
  const axis = { horse_id: lead?.horse_id ?? lh.horse_id, umaban: lh.umaban, name: lh.name, score: r4(lead?.score), finish_score: r4(lead?.finish_score), past_form: r4(lead?.past_form), past_form_ok: meta.axis?.past_form_ok ?? null, horse_streak: lead?.horse_streak ?? 0, jockey_streak: lead?.jockey_streak ?? null, top_contribs: (lead?.top_contribs || []).slice(0, 5) }
  const boxHorses = boxHorsesMeta.map(h => `${h.umaban}番${h.name}`)
  const ax = meta.axis
  const label = method === 'graded5_card_combined'
    ? `重賞×4歳以上の出走表スコアと直近5走モデルの合成（${GRADED?.version || 'graded5'}）`
    : `4歳以上限定の出走表評価（${CARD.version}）`
  const comment = rec.selection_comment.replace(/主買い目は三連単三頭ボックス6点（[^）]*）。/, `主買い目は三連単三頭ボックス6点（${boxHorses.join('−')}の全順列）。`) +
    ` 買い目の3頭は${label}で選定。自信度と推奨/見送りは29特徴の軸${ax ? ` ${ax.umaban}番${ax.name}` : ''}で従来どおり判定。`
  return {
    ...rec, selection_comment: comment,
    selection_meta: {
      ...meta, ...extra.meta,
      top3, axis, box_horses: boxHorses,
      card_score_version: CARD?.version ?? null,
      card_history_through: extra.card_history_through ?? null,
      graded5_version: GRADED?.version ?? null,
      graded_history_through: extra.graded_history_through ?? null,
      is_graded_race: !!extra.is_graded_race,
      card_box: extra.meta?.card_box || { ranks: boxHorsesMeta.map(h => h.umaban), model29_top3: meta.top3.map(h => h.umaban), ...(extra.card_box || {}) },
      confidence_axis: ax, box_method: method,
      box_method_reason: extra.meta?.box_method_reason ?? null,
    },
  }
}

export function buildSelection(race, preds, { laterCards = [] } = {}) {
  const rec = buildRaceRecommendation(race, preds)
  const gradedFlag = isGradedRace(race)

  // 重賞×pure_O: 合成を優先
  if (gradedFlag) {
    const g = gradedCombineBox(race, { laterCards })
    if (g.reason === 'before_effective_date') return rec
    if (g.eligible) {
      return applyBox(rec, race, preds, g.box, 'graded5_card_combined', {
        is_graded_race: true,
        card_history_through: CARD?.history_file?.history_through,
        graded_history_through: g.history_through,
        meta: {
          box_method_reason: g.memrobo_forced ? 'graded_pure_O_memrobo_forced' : 'graded_pure_O',
          graded_box: { scores: g.scores, memrobo_forced: g.memrobo_forced },
        },
      })
    }
    // 重賞でも合成不可なら card / 29特徴へフォールバック
  }

  const card = cardBoxAge4(race, { laterCards })
  if (card.reason === 'before_effective_date') return rec
  const meta = rec.selection_meta
  if (!card.eligible) {
    return {
      ...rec,
      selection_meta: {
        ...meta,
        box_method: 'model29',
        box_method_reason: card.reason,
        card_score_version: CARD?.version ?? null,
        graded5_version: GRADED?.version ?? null,
        is_graded_race: gradedFlag,
      },
    }
  }
  return applyBox(rec, race, preds, card.box, 'card_score_age4', {
    is_graded_race: gradedFlag,
    card_history_through: card.history_through,
    meta: {
      box_method_reason: card.memrobo_forced ? 'pure_O_memrobo_forced' : 'pure_O',
      card_box: { mass: +card.box_mass.toFixed(6), ranks: card.box.map(h => h.card_rank), model29_top3: meta.top3.map(h => h.umaban) },
    },
  })
}
