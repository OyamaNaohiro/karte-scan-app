// 1枚（1書類）分のスキャン結果
export interface PageScan {
  image: string;              // base64エンコード済みJPEG
  texts: string[];            // OCRで再構成した行
  personNames: string[];      // NLTaggerで検出した人名候補
  placeNames: string[];       // NLTaggerで検出した地名候補
  organizationNames: string[]; // NLTaggerで検出した組織名候補
}

export interface ScanResult {
  pageCount: number;    // 実際に返したページ数（最大10）
  totalScanned: number; // ユーザーがスキャンした総数
  pages: PageScan[];    // 1枚ごとに分けたスキャン結果
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
  // OCRでは抽出しない手入力項目
  orderDate: string;    // 受注日（保存日をデフォルト）
  deliveryDate: string; // 納品日
  price: string;        // 装具代金
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
