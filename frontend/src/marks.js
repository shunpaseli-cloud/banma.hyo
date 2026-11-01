// 予想順位 → 印
export const MARKS = ['◎', '◯', '▲', '△', '☆']
export const markOf = rank => MARKS[rank - 1] || ''
export const MARK_LEGEND = '印: ◎本命=1位 ◯対抗=2位 ▲単穴=3位 △連下=4位 ☆穴=5位（予想スコア順）'
