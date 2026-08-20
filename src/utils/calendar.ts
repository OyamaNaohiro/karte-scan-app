// カレンダー描画の共通ロジック

export const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

// その月を週（7日）ごとの配列にして返す。
// 先頭は前月ぶんの空白、末尾も7の倍数になるよう空白で埋める。
export function buildWeeks(year: number, month: number): (number | null)[][] {
  const startDow = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}
