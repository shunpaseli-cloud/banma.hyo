// 結果ページの日付候補に、事後生成予想のある日を加える（ファイル名のみ・データ本体は読まない）。
export const POSTHOC_DATES = Object.keys(import.meta.glob('./data/posthoc/posthoc_*.json')).map(k => k.match(/posthoc_(\d{4}-\d\d-\d\d)\.json$/)?.[1]).filter(Boolean).sort()
