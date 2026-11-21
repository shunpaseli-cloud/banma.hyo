import SelectionComment from './SelectionComment.jsx'
export default function RaceDetail({rec}) {
  return <section className="race-detail" data-snapshot-version={rec?.snapshot_version}>
    <h3>レース詳細</h3>
    {rec?<><SelectionComment rec={rec}/><p className="muted">買い目と公式結果は共通欄で確認できます。同じ保存版を表示し、細かな採点値は元データに保持しています。</p></>:<p>保存予想がありません。ライブ再計算は行いません。</p>}
  </section>
}
