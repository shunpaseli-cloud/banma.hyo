import SelectionComment from './SelectionComment.jsx'
import { buildRaceRecommendation } from '../selectionReason.js'

export default function RaceDetail({ race, preds, rec }) {
  const recommendation=rec || buildRaceRecommendation(race,preds)
  return <section className="race-detail">
    <h3>レース詳細</h3>
    <SelectionComment rec={recommendation} />
    <p className="muted">買い目と公式結果は共通欄で確認できます。細かな採点値は表示せず、元の予測データに保持しています。</p>
  </section>
}
