import { open } from '@op-engineering/op-sqlite';
import RNFS from 'react-native-fs';
import { KarteData, SavedRecord } from '../types';

const DB_NAME = 'karte.db';
const RECORDS_DIR = `${RNFS.DocumentDirectoryPath}/karteRecords`;

// op-sqliteの接続はプロセス内で使い回す
let connection: ReturnType<typeof open> | null = null;
let initialized = false;

function db() {
  if (!connection) {
    connection = open({ name: DB_NAME });
  }
  return connection;
}

// ファイルパスは相対（Documents配下）で保存し、読み出し時に現在のDocuments
// パスへ組み立て直す。iOSのコンテナUUIDはアップデート等で変わりうるため、
// 絶対パスをそのまま保存すると再インストール後にファイルを見失う。
function toRelativePath(p: string): string {
  if (!p) return '';
  const docs = RNFS.DocumentDirectoryPath;
  if (p.startsWith(docs + '/')) return p.slice(docs.length + 1);
  const marker = '/Documents/';
  const idx = p.indexOf(marker);
  if (idx !== -1) return p.slice(idx + marker.length);
  return p.replace(/^\/+/, '');
}

function toAbsolutePath(stored: string): string {
  if (!stored) return '';
  const docs = RNFS.DocumentDirectoryPath;
  if (stored.startsWith(docs + '/')) return stored; // 既に現在の絶対パス
  const marker = '/Documents/';
  const idx = stored.indexOf(marker);
  if (idx !== -1) return docs + '/' + stored.slice(idx + marker.length); // 旧UUIDの絶対パスを付け替え
  return `${docs}/${stored.replace(/^\/+/, '')}`; // 相対パス
}

// バージョン差異を吸収して行配列を取り出す
function rowsOf(result: any): any[] {
  const r = result?.rows;
  if (!r) return [];
  if (Array.isArray(r)) return r;
  if (Array.isArray(r._array)) return r._array;
  return [];
}

// DBの初期化（テーブル作成 → 既存JSONの取り込み）は一度だけ
export async function initDb(): Promise<void> {
  if (initialized) return;
  await db().execute(
    `CREATE TABLE IF NOT EXISTS records (
      id TEXT PRIMARY KEY,
      patientName TEXT,
      birthDate TEXT,
      gender TEXT,
      address TEXT,
      hospitalName TEXT,
      diagnosis TEXT,
      doctor TEXT,
      prescription TEXT,
      phone TEXT,
      insurance TEXT,
      orderDate TEXT,
      deliveryDate TEXT,
      price TEXT,
      rawText TEXT,
      pdfPath TEXT,
      imagePaths TEXT,
      createdAt TEXT
    );`,
  );
  await addMissingColumns();
  await normalizeStoredDates();
  initialized = true;
  await migrateLegacyJson();
}

// 既存の受注日・納品日をISO(YYYY-MM-DD)へ正規化する（スラッシュ→ハイフン）
// ソート・範囲検索は文字列比較のため、区切り文字を揃える必要がある。
async function normalizeStoredDates(): Promise<void> {
  try {
    await db().execute(
      "UPDATE records SET orderDate = replace(orderDate, '/', '-') WHERE orderDate LIKE '%/%';",
    );
    await db().execute(
      "UPDATE records SET deliveryDate = replace(deliveryDate, '/', '-') WHERE deliveryDate LIKE '%/%';",
    );
  } catch {
    // 失敗しても致命的ではない
  }
}

// 既存DBに後から追加した列を補う（重複エラーは無視）
async function addMissingColumns(): Promise<void> {
  const columns = ['phone', 'insurance', 'orderDate', 'deliveryDate', 'price'];
  for (const col of columns) {
    try {
      await db().execute(`ALTER TABLE records ADD COLUMN ${col} TEXT;`);
    } catch {
      // すでに存在する列は無視
    }
  }
}

// 行(DB) → SavedRecord へ変換
function rowToRecord(row: any): SavedRecord {
  const karteData: KarteData = {
    patientName: row.patientName ?? '',
    birthDate: row.birthDate ?? '',
    gender: row.gender ?? '',
    address: row.address ?? '',
    hospitalName: row.hospitalName ?? '',
    diagnosis: row.diagnosis ?? '',
    doctor: row.doctor ?? '',
    prescription: row.prescription ?? '',
    phone: row.phone ?? '',
    insurance: row.insurance ?? '',
    orderDate: row.orderDate ?? '',
    deliveryDate: row.deliveryDate ?? '',
    price: row.price ?? '',
    rawText: row.rawText ?? '',
  };
  let rawImagePaths: string[] = [];
  try {
    rawImagePaths = row.imagePaths ? JSON.parse(row.imagePaths) : [];
  } catch {
    rawImagePaths = [];
  }
  return {
    id: row.id,
    karteData,
    // 保存値（相対/旧絶対）を現在のDocumentsパスへ解決
    pdfPath: toAbsolutePath(row.pdfPath ?? ''),
    imagePaths: rawImagePaths.map(toAbsolutePath),
    createdAt: row.createdAt ?? '',
  };
}

// レコードを1件保存（upsert）
export async function insertRecord(record: SavedRecord): Promise<void> {
  await initDb();
  const k = record.karteData;
  await db().execute(
    `INSERT OR REPLACE INTO records
      (id, patientName, birthDate, gender, address, hospitalName,
       diagnosis, doctor, prescription, phone, insurance,
       orderDate, deliveryDate, price,
       rawText, pdfPath, imagePaths, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      record.id,
      k.patientName,
      k.birthDate,
      k.gender,
      k.address,
      k.hospitalName,
      k.diagnosis,
      k.doctor,
      k.prescription,
      k.phone,
      k.insurance,
      k.orderDate,
      k.deliveryDate,
      k.price,
      k.rawText,
      toRelativePath(record.pdfPath),
      JSON.stringify(record.imagePaths.map(toRelativePath)),
      record.createdAt,
    ],
  );
}

// 新しい順に全件取得
export async function getAllRecords(): Promise<SavedRecord[]> {
  await initDb();
  const res = await db().execute(
    'SELECT * FROM records ORDER BY createdAt DESC;',
  );
  return rowsOf(res).map(rowToRecord);
}

export type SortKey = 'orderDate' | 'deliveryDate' | 'createdAt' | 'patientName';

export interface RecordQuery {
  search?: string;       // 氏名・病院名・病名・電話などの部分一致
  hospital?: string;     // 病院名で完全一致絞り込み
  orderFrom?: string;    // 受注日の下限（ISO）
  orderTo?: string;      // 受注日の上限（ISO）
  sortBy?: SortKey;
  sortDir?: 'asc' | 'desc';
}

// 検索・絞り込み・ソート付きでレコードを取得
export async function queryRecords(q: RecordQuery = {}): Promise<SavedRecord[]> {
  await initDb();

  const where: string[] = [];
  const params: any[] = [];

  if (q.search && q.search.trim()) {
    const like = `%${q.search.trim()}%`;
    where.push(
      '(patientName LIKE ? OR hospitalName LIKE ? OR diagnosis LIKE ? OR prescription LIKE ? OR phone LIKE ? OR address LIKE ? OR doctor LIKE ?)',
    );
    params.push(like, like, like, like, like, like, like);
  }
  if (q.hospital) {
    where.push('hospitalName = ?');
    params.push(q.hospital);
  }
  if (q.orderFrom) {
    where.push('orderDate >= ?');
    params.push(q.orderFrom);
  }
  if (q.orderTo) {
    where.push('orderDate <= ?');
    params.push(q.orderTo);
  }

  // 列名はホワイトリストで固定（SQLインジェクション防止）
  const sortCols: SortKey[] = ['orderDate', 'deliveryDate', 'createdAt', 'patientName'];
  const sortBy: SortKey = sortCols.includes(q.sortBy as SortKey)
    ? (q.sortBy as SortKey)
    : 'createdAt';
  const sortDir = q.sortDir === 'asc' ? 'ASC' : 'DESC';

  // 空欄(NULL/'')は方向に関わらず常に末尾へ。日付は同値時 createdAt で安定化。
  const emptyLast = `(${sortBy} IS NULL OR ${sortBy} = '')`;
  const sql =
    `SELECT * FROM records` +
    (where.length ? ` WHERE ${where.join(' AND ')}` : '') +
    ` ORDER BY ${emptyLast} ASC, ${sortBy} ${sortDir}, createdAt DESC;`;

  const res = await db().execute(sql, params);
  return rowsOf(res).map(rowToRecord);
}

// 登録済みの病院名一覧（重複なし）。オートコンプリート・絞り込み用。
export async function getHospitalNames(): Promise<string[]> {
  await initDb();
  const res = await db().execute(
    "SELECT DISTINCT hospitalName FROM records WHERE hospitalName IS NOT NULL AND hospitalName != '' ORDER BY hospitalName;",
  );
  return rowsOf(res)
    .map(r => r.hospitalName as string)
    .filter(Boolean);
}

// 1件取得
export async function getRecord(id: string): Promise<SavedRecord | null> {
  await initDb();
  const res = await db().execute('SELECT * FROM records WHERE id = ?;', [id]);
  const rows = rowsOf(res);
  return rows.length ? rowToRecord(rows[0]) : null;
}

// 1件削除（DB行 + PDF + 画像ファイル）
export async function deleteRecord(id: string): Promise<void> {
  await initDb();
  const record = await getRecord(id);
  await db().execute('DELETE FROM records WHERE id = ?;', [id]);

  if (record) {
    const files = [record.pdfPath, ...record.imagePaths];
    await Promise.all(
      files.map(async p => {
        try {
          if (p && (await RNFS.exists(p))) await RNFS.unlink(p);
        } catch {
          // ファイル削除の失敗はレコード削除を妨げない
        }
      }),
    );
  }

  // 旧JSONが残っていると次回起動で復活するため、あれば削除する
  try {
    const legacyJson = `${RECORDS_DIR}/${id}.json`;
    if (await RNFS.exists(legacyJson)) await RNFS.unlink(legacyJson);
  } catch {
    // 無視
  }
}

// 旧バージョンの1件1JSONファイルをDBへ取り込む（初回のみ）。
// 取り込んだJSONは削除し、二度と再取り込みしない（削除したレコードの復活防止）。
// 既にDBへ移行済み（レコードあり）の場合は、残っているJSONは古い残骸なので
// 取り込まずに掃除だけ行う。
async function migrateLegacyJson(): Promise<void> {
  try {
    if (!(await RNFS.exists(RECORDS_DIR))) return;
    const files = await RNFS.readDir(RECORDS_DIR);
    const jsonFiles = files.filter(f => f.name.endsWith('.json'));
    if (jsonFiles.length === 0) return;

    // DBに1件でもあれば「移行済み」とみなし、再取り込みしない
    const countRes = await db().execute('SELECT COUNT(*) AS c FROM records;');
    const alreadyMigrated = Number(rowsOf(countRes)[0]?.c ?? 0) > 0;

    for (const f of jsonFiles) {
      try {
        if (!alreadyMigrated) {
          const content = await RNFS.readFile(f.path, 'utf8');
          const legacy = JSON.parse(content) as Partial<SavedRecord> & {
            karteData: KarteData;
          };
          if (legacy.id && !(await getRecord(legacy.id))) {
            // 旧JSONに無い手入力項目は空で補完
            const base: KarteData = {
              patientName: '', birthDate: '', gender: '', address: '',
              phone: '', insurance: '',
              hospitalName: '', diagnosis: '', doctor: '', prescription: '',
              orderDate: '', deliveryDate: '', price: '', rawText: '',
            };
            const karteData: KarteData = { ...base, ...legacy.karteData };
            await insertRecord({
              id: legacy.id,
              karteData,
              pdfPath: legacy.pdfPath ?? '',
              imagePaths: legacy.imagePaths ?? [],
              createdAt: legacy.createdAt ?? new Date().toISOString(),
            });
          }
        }
        // 取り込み済み・掃除対象いずれもJSONを削除して復活を防ぐ
        await RNFS.unlink(f.path);
      } catch {
        // 壊れたJSON等はスキップ
      }
    }
  } catch {
    // ディレクトリが無い等は無視
  }
}
