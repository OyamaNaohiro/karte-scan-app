export interface ScanResult {
  texts: string[];
  pageImages: string[]; // base64エンコード済みJPEG
  pageCount: number;
}

export interface KarteData {
  patientName: string;
  birthDate: string;
  gender: string;
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
