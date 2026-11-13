// 出走表データ本体（出走表ページからのみ読み込む）。
const FILES = import.meta.glob('./data/racecards/racecard_*.json', { eager: true, import: 'default' })
const BY_DATE = {}
for (const card of Object.values(FILES)) if (card?.schema === 'banma-racecard-v1' && card.meta?.date) BY_DATE[card.meta.date] = card
export function racecardDay(date) { return BY_DATE[date] || null }
