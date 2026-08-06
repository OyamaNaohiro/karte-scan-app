// 金額表示のユーティリティ

// 半角・全角の数字だけを取り出す
export function digitsOnly(value: string): string {
  return (value ?? '')
    .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[^0-9]/g, '');
}

// 金額として整形する。数字があれば "¥12,300"、無ければ元の文字列を返す。
export function formatYen(value: string): string {
  const s = (value ?? '').trim();
  if (!s) return '';
  const digits = digitsOnly(s);
  if (!digits) return s; // 数字が無い自由入力はそのまま
  const n = Number(digits);
  return `¥${n.toLocaleString('ja-JP')}`;
}
