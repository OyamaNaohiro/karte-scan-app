import { getAllRecords } from './db';
import { digitsOnly } from './format';

export interface SummaryRow {
  key: string;   // 病院名 or 月(YYYY-MM)
  count: number; // 件数
  total: number; // 金額合計（円）
}

export interface HospitalMonthly {
  hospital: string;
  count: number;
  total: number;
  months: SummaryRow[]; // その病院の月別内訳（新しい月順）
}

export interface SummaryResult {
  byHospital: SummaryRow[];
  byMonth: SummaryRow[];
  byHospitalMonth: HospitalMonthly[];
  grandTotal: number;
  grandCount: number;
}

// 月キー（YYYY-MM or 未設定）を新しい順に並べる比較関数
function compareMonthDesc(a: string, b: string): number {
  if (a === '未設定') return 1;
  if (b === '未設定') return -1;
  return a < b ? 1 : -1;
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
  // 病院 → (月 → 集計)
  const hospitalMonth = new Map<string, Map<string, SummaryRow>>();
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

    const hosp = r.karteData.hospitalName || '（病院名なし）';
    add(hospital, hosp, price);

    const od = r.karteData.orderDate;
    const m = /^\d{4}-\d{2}/.test(od) ? od.slice(0, 7) : '未設定';
    add(month, m, price);

    let inner = hospitalMonth.get(hosp);
    if (!inner) {
      inner = new Map<string, SummaryRow>();
      hospitalMonth.set(hosp, inner);
    }
    add(inner, m, price);
  }

  const byHospital = [...hospital.values()].sort((a, b) => b.total - a.total);
  const byMonth = [...month.values()].sort((a, b) => compareMonthDesc(a.key, b.key));

  // 病院別（金額順）、各病院の月別は新しい順
  const byHospitalMonth: HospitalMonthly[] = byHospital.map(h => {
    const inner = hospitalMonth.get(h.key);
    const months = inner
      ? [...inner.values()].sort((a, b) => compareMonthDesc(a.key, b.key))
      : [];
    return { hospital: h.key, count: h.count, total: h.total, months };
  });

  return {
    byHospital,
    byMonth,
    byHospitalMonth,
    grandTotal,
    grandCount: records.length,
  };
}
