export interface ScanResult {
  texts: string[];
  pageImages: string[]; // base64エンコード済みJPEG
  pageCount: number;
  personNames: string[]; // NLTaggerで検出した人名候補
  placeNames: string[];  // NLTaggerで検出した地名候補
}

export interface KarteData {
  patientName: string;
  birthDate: string;
  gender: string;
  address: string;
  diagnosis: string;
  doctor: string;
  prescription: string;
  rawText: string;
}

export interface SavedRecord {
  id: string;
  karteData: KarteData;
  pdfPath: string;
  metaPath: string;
  createdAt: string;
}
