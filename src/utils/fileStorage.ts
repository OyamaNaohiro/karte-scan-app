import RNFS from 'react-native-fs';
import RNHTMLtoPDF from 'react-native-html-to-pdf';
import { KarteData, SavedRecord } from '../types';

const RECORDS_DIR = `${RNFS.DocumentDirectoryPath}/karteRecords`;

async function ensureDir(): Promise<void> {
  const exists = await RNFS.exists(RECORDS_DIR);
  if (!exists) await RNFS.mkdir(RECORDS_DIR);
}

// base64画像配列からHTML文字列を生成
function buildHtml(karteData: KarteData, pageImages: string[]): string {
  const imagesHtml = pageImages
    .map(b64 => `<img src="data:image/jpeg;base64,${b64}" style="width:100%;margin-bottom:20px;"/>`)
    .join('');

  return `
<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8"/>
<style>
  body { font-family: 'Hiragino Sans', sans-serif; margin: 20px; color: #222; }
  h1 { font-size: 20px; text-align: center; border-bottom: 2px solid #333; padding-bottom: 8px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  td { padding: 8px 12px; border: 1px solid #ccc; font-size: 14px; }
  td:first-child { background: #f5f5f5; font-weight: bold; width: 30%; }
  .page-title { font-size: 16px; font-weight: bold; margin: 20px 0 8px; }
</style>
</head>
<body>
  <h1>カルテスキャン記録</h1>
  <table>
    <tr><td>氏名</td><td>${karteData.patientName || '—'}</td></tr>
    <tr><td>生年月日</td><td>${karteData.birthDate || '—'}</td></tr>
    <tr><td>性別</td><td>${karteData.gender || '—'}</td></tr>
    <tr><td>住所</td><td>${karteData.address || '—'}</td></tr>
    <tr><td>病名</td><td>${karteData.diagnosis || '—'}</td></tr>
    <tr><td>担当医</td><td>${karteData.doctor || '—'}</td></tr>
    <tr><td>処方装具名</td><td>${karteData.prescription || '—'}</td></tr>
  </table>
  <div class="page-title">スキャン画像</div>
  ${imagesHtml}
</body>
</html>`;
}

export async function saveRecord(
  karteData: KarteData,
  pageImages: string[],
): Promise<SavedRecord> {
  await ensureDir();

  const id = `karte_${Date.now()}`;
  const pdfPath = `${RECORDS_DIR}/${id}.pdf`;
  const metaPath = `${RECORDS_DIR}/${id}.json`;

  // PDF生成
  const html = buildHtml(karteData, pageImages);
  const pdf = await RNHTMLtoPDF.convert({
    html,
    fileName: id,
    directory: RECORDS_DIR,
    base64: false,
  });

  if (!pdf.filePath) throw new Error('PDF生成に失敗しました');

  // PDFを正しい場所へ移動（ライブラリが独自パスへ出力する場合）
  if (pdf.filePath !== pdfPath) {
    await RNFS.moveFile(pdf.filePath, pdfPath);
  }

  // メタデータJSON保存
  const record: SavedRecord = {
    id,
    karteData,
    pdfPath,
    metaPath,
    createdAt: new Date().toISOString(),
  };
  await RNFS.writeFile(metaPath, JSON.stringify(record, null, 2), 'utf8');

  return record;
}

export async function savePdfOnly(pageImages: string[]): Promise<SavedRecord> {
  await ensureDir();

  const id = `scan_${Date.now()}`;
  const pdfPath = `${RECORDS_DIR}/${id}.pdf`;
  const metaPath = `${RECORDS_DIR}/${id}.json`;

  const imagesHtml = pageImages
    .map(b64 => `<img src="data:image/jpeg;base64,${b64}" style="width:100%;margin-bottom:20px;"/>`)
    .join('');

  const html = `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"/><style>body{margin:10px;}img{max-width:100%;}</style></head><body>${imagesHtml}</body></html>`;

  const pdf = await RNHTMLtoPDF.convert({
    html,
    fileName: id,
    directory: RECORDS_DIR,
    base64: false,
  });

  if (!pdf.filePath) throw new Error('PDF生成に失敗しました');

  if (pdf.filePath !== pdfPath) {
    await RNFS.moveFile(pdf.filePath, pdfPath);
  }

  const emptyKarte: KarteData = {
    patientName: '', birthDate: '', gender: '', address: '',
    diagnosis: '', doctor: '', prescription: '', rawText: '',
  };
  const record: SavedRecord = {
    id,
    karteData: emptyKarte,
    pdfPath,
    metaPath,
    createdAt: new Date().toISOString(),
  };
  await RNFS.writeFile(metaPath, JSON.stringify(record, null, 2), 'utf8');

  return record;
}

export async function listRecords(): Promise<SavedRecord[]> {
  await ensureDir();
  const files = await RNFS.readDir(RECORDS_DIR);
  const jsonFiles = files.filter(f => f.name.endsWith('.json'));

  const records = await Promise.all(
    jsonFiles.map(async f => {
      const content = await RNFS.readFile(f.path, 'utf8');
      return JSON.parse(content) as SavedRecord;
    }),
  );

  return records.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}
