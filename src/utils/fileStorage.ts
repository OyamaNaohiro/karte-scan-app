import RNFS from 'react-native-fs';
import RNHTMLtoPDF from 'react-native-html-to-pdf';
import { KarteData, SavedRecord } from '../types';
import { insertRecord, getAllRecords } from './db';

const RECORDS_DIR = `${RNFS.DocumentDirectoryPath}/karteRecords`;

async function ensureDir(): Promise<void> {
  const exists = await RNFS.exists(RECORDS_DIR);
  if (!exists) await RNFS.mkdir(RECORDS_DIR);
}

// 保存日（YYYY/MM/DD）
function todayStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())}`;
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
    <tr><td>病院名</td><td>${karteData.hospitalName || '—'}</td></tr>
    <tr><td>病名</td><td>${karteData.diagnosis || '—'}</td></tr>
    <tr><td>担当医</td><td>${karteData.doctor || '—'}</td></tr>
    <tr><td>処方装具名</td><td>${karteData.prescription || '—'}</td></tr>
    <tr><td>受注日</td><td>${karteData.orderDate || '—'}</td></tr>
    <tr><td>納品日</td><td>${karteData.deliveryDate || '—'}</td></tr>
    <tr><td>装具代金</td><td>${karteData.price || '—'}</td></tr>
  </table>
  <div class="page-title">スキャン画像</div>
  ${imagesHtml}
</body>
</html>`;
}

// スキャン画像(base64)をJPEGファイルとして保存し、絶対パス配列を返す
async function savePageImages(id: string, pageImages: string[]): Promise<string[]> {
  const paths: string[] = [];
  for (let i = 0; i < pageImages.length; i++) {
    const path = `${RECORDS_DIR}/${id}_p${i + 1}.jpg`;
    await RNFS.writeFile(path, pageImages[i], 'base64');
    paths.push(path);
  }
  return paths;
}

// PDFを生成して所定パスへ配置する
async function generatePdf(
  id: string,
  html: string,
  pdfPath: string,
): Promise<void> {
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
}

export async function saveRecord(
  karteData: KarteData,
  pageImages: string[],
): Promise<SavedRecord> {
  await ensureDir();

  const id = `karte_${Date.now()}`;
  const pdfPath = `${RECORDS_DIR}/${id}.pdf`;

  // 受注日が未入力なら保存日をデフォルトに
  const data: KarteData = {
    ...karteData,
    orderDate: karteData.orderDate || todayStr(),
  };

  const imagePaths = await savePageImages(id, pageImages);
  await generatePdf(id, buildHtml(data, pageImages), pdfPath);

  const record: SavedRecord = {
    id,
    karteData: data,
    pdfPath,
    imagePaths,
    createdAt: new Date().toISOString(),
  };
  await insertRecord(record);

  return record;
}

export async function savePdfOnly(pageImages: string[]): Promise<SavedRecord> {
  await ensureDir();

  const id = `scan_${Date.now()}`;
  const pdfPath = `${RECORDS_DIR}/${id}.pdf`;

  const imagesHtml = pageImages
    .map(b64 => `<img src="data:image/jpeg;base64,${b64}" style="width:100%;margin-bottom:20px;"/>`)
    .join('');
  const html = `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"/><style>body{margin:10px;}img{max-width:100%;}</style></head><body>${imagesHtml}</body></html>`;

  const imagePaths = await savePageImages(id, pageImages);
  await generatePdf(id, html, pdfPath);

  const emptyKarte: KarteData = {
    patientName: '', birthDate: '', gender: '', address: '',
    hospitalName: '', diagnosis: '', doctor: '', prescription: '',
    orderDate: todayStr(), deliveryDate: '', price: '', rawText: '',
  };
  const record: SavedRecord = {
    id,
    karteData: emptyKarte,
    pdfPath,
    imagePaths,
    createdAt: new Date().toISOString(),
  };
  await insertRecord(record);

  return record;
}

// 一覧はSQLiteから取得
export async function listRecords(): Promise<SavedRecord[]> {
  return getAllRecords();
}
