// 日付は内部的に ISO(YYYY-MM-DD) 文字列で扱う（ソート・範囲検索のため）

const pad = (n: number) => String(n).padStart(2, '0');

// Date → ISO(YYYY-MM-DD)
export function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ISO文字列 → Date（不正なら今日）
export function fromISO(s: string): Date {
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date();
}

// 実在する YYYY-MM-DD かどうか（ソート可能な正規形か）
export function isValidISODate(s: string): boolean {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  const dt = new Date(y, mo - 1, d);
  return (
    dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d
  );
}

function toIsoParts(y: string, mo: string, d: string): string {
  return `${y}-${pad(Number(mo))}-${pad(Number(d))}`;
}

// 手入力を ISO へ正規化する。
// 対応: 全角数字 / YYYY-MM-DD・YYYY/MM/DD・YYYY.MM.DD・空白区切り /
//       YYYY年M月D日 / YYYYMMDD(8桁)
// 実在する日付に変換できたときだけ ISO を返し、できなければ入力をそのまま返す
// （呼び出し側で不正として警告表示する）。
export function normalizeDateInput(s: string): string {
  let t = (s ?? '').trim();
  if (!t) return '';
  // 全角数字→半角
  t = t.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0));

  const patterns: RegExp[] = [
    /^(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?$/,
    /^(\d{4})[\/\-.\s](\d{1,2})[\/\-.\s](\d{1,2})$/,
    /^(\d{4})(\d{2})(\d{2})$/,
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m) {
      const iso = toIsoParts(m[1], m[2], m[3]);
      if (isValidISODate(iso)) return iso;
    }
  }
  return t; // 変換不能はそのまま（警告で気づかせる）
}
