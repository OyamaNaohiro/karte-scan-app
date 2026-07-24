export interface ScanResult {
  texts: string[];
  pageImages: string[]; // base64エンコード済みJPEG
  pageCount: number;
  personNames: string[];      // NLTaggerで検出した人名候補
  placeNames: string[];       // NLTaggerで検出した地名候補
  organizationNames: string[]; // NLTaggerで検出した組織名候補
}

export interface KarteData {
  patientName: string;
  birthDate: string;
  gender: string;
  address: string;
  hospitalName: string;
  diagnosis: string;
  doctor: string;
  prescription: string;
  rawText: string;
}

// 編集対象フィールド（rawText を除いた KarteData のキー）
export type KarteField = Exclude<keyof KarteData, 'rawText'>;

// 項目ごとの抽出候補。先頭が採用値（KarteData に入っている値）
export type KarteCandidates = Record<KarteField, string[]>;

export interface ParseResult {
  data: KarteData;
  candidates: KarteCandidates;
}

export interface SavedRecord {
  id: string;
  karteData: KarteData;
  pdfPath: string;
  imagePaths: string[]; // 保存したスキャン画像（file://なしの絶対パス）
  createdAt: string;
}
