import { getAllRecords } from './db';
import { digitsOnly } from './format';

export interface SummaryRow {
  key: string;   // 病院名 or 月(YYYY-MM)
  count: number; // 件数
  total: number; // 金額合計（円）
}

export interface SummaryResult {
  byHospital: SummaryRow[];
  byMonth: SummaryRow[];
  grandTotal: number;
  grandCount: number;
}

function priceNum(value: string): number {
  const d = digitsOnly(value);
  return d ? Number(d) : 0;
}

// 病院別・月別（受注日）の件数と金額合計を集計する
export async function computeSummary(): Promise<SummaryResult> {
  const records = await getAllRecords();

  const hospital = new Map<string, SummaryRow>();
  const month = new Map<string, SummaryRow>();
  let grandTotal = 0;

  const add = (map: Map<string, SummaryRow>, key: string, price: number) => {
    const row = map.get(key) ?? { key, count: 0, total: 0 };
    row.count += 1;
    row.total += price;
    map.set(key, row);
  };

  for (const r of records) {
    const price = priceNum(r.karteData.price);
    grandTotal += price;

    add(hospital, r.karteData.hospitalName || '（病院名なし）', price);

    const od = r.karteData.orderDate;
    const m = /^\d{4}-\d{2}/.test(od) ? od.slice(0, 7) : '未設定';
    add(month, m, price);
  }

  const byHospital = [...hospital.values()].sort((a, b) => b.total - a.total);
  // 月は新しい順（「未設定」は末尾）
  const byMonth = [...month.values()].sort((a, b) => {
    if (a.key === '未設定') return 1;
    if (b.key === '未設定') return -1;
    return a.key < b.key ? 1 : -1;
  });

  return {
    byHospital,
    byMonth,
    grandTotal,
    grandCount: records.length,
  };
}
