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
      rawText TEXT,
      pdfPath TEXT,
      imagePaths TEXT,
      createdAt TEXT
    );`,
  );
  initialized = true;
  await migrateLegacyJson();
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
    rawText: row.rawText ?? '',
  };
  let imagePaths: string[] = [];
  try {
    imagePaths = row.imagePaths ? JSON.parse(row.imagePaths) : [];
  } catch {
    imagePaths = [];
  }
  return {
    id: row.id,
    karteData,
    pdfPath: row.pdfPath ?? '',
    imagePaths,
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
       diagnosis, doctor, prescription, rawText, pdfPath, imagePaths, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
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
      k.rawText,
      record.pdfPath,
      JSON.stringify(record.imagePaths),
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
}

// 旧バージョンの1件1JSONファイルをDBへ取り込む（初回のみ・冪等）
async function migrateLegacyJson(): Promise<void> {
  try {
    if (!(await RNFS.exists(RECORDS_DIR))) return;
    const files = await RNFS.readDir(RECORDS_DIR);
    const jsonFiles = files.filter(f => f.name.endsWith('.json'));
    for (const f of jsonFiles) {
      try {
        const content = await RNFS.readFile(f.path, 'utf8');
        const legacy = JSON.parse(content) as Partial<SavedRecord> & {
          karteData: KarteData;
        };
        if (!legacy.id) continue;
        const existing = await getRecord(legacy.id);
        if (existing) continue;
        await insertRecord({
          id: legacy.id,
          karteData: legacy.karteData,
          pdfPath: legacy.pdfPath ?? '',
          imagePaths: legacy.imagePaths ?? [],
          createdAt: legacy.createdAt ?? new Date().toISOString(),
        });
      } catch {
        // 壊れたJSONはスキップ
      }
    }
  } catch {
    // ディレクトリが無い等は無視
  }
}
