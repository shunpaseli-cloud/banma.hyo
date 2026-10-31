// 直近（今日以降で最も近い開催日）のレースを自動選択。なければ最新開催日。
export function todayJST(d = new Date()) { return new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10) }
export function pickUpcoming(races, today = todayJST()) {
  const dates = [...new Set(races.map(r => r.race_date).filter(Boolean))].sort()
  const date = dates.find(d => d >= today) || dates[dates.length - 1] || null
  const sorted = [...races].sort((a, b) => (a.race_date === date ? 0 : 1) - (b.race_date === date ? 0 : 1)
    || (a.race_date === b.race_date ? 0 : (date && a.race_date >= date ? (a.race_date < b.race_date ? -1 : 1) : (a.race_date > b.race_date ? -1 : 1)))
    || a.race_no - b.race_no)
  return { date, upcoming: !!date && date >= today, races: sorted }
}
