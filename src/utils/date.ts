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

// 手入力を ISO へ正規化（YYYY/MM/DD・YYYY.M.D 等 → YYYY-MM-DD）
// 変換できない入力はそのまま返す（自由入力を許容）
export function normalizeDateInput(s: string): string {
  const t = s.trim();
  const m = t.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
  if (m) return `${m[1]}-${pad(Number(m[2]))}-${pad(Number(m[3]))}`;
  return t;
}
