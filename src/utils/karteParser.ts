import { KarteData } from '../types';

// キーワードの後に続く値を抽出
// 対応形式:
//   "氏名：山田太郎"  (コロン区切り)
//   "住所 北海道..."  (スペース区切り)
//   "患者氏名山田太郎" (区切りなし)
//   キーワード行の次行に値がある場合
function extractAfterKeyword(lines: string[], keywords: string[]): string {
  for (const line of lines) {
    for (const kw of keywords) {
      if (!line.includes(kw)) continue;

      const kwPos = line.indexOf(kw);
      const afterKw = line.slice(kwPos + kw.length).trim();

      if (afterKw) {
        const colonMatch = afterKw.match(/^[：:]\s*(.*)/);
        if (colonMatch && colonMatch[1].trim()) return colonMatch[1].trim();
        return afterKw;
      }

      // 同行に値がない場合のみ次行を確認
      const lineIdx = lines.indexOf(line);
      if (lineIdx + 1 < lines.length) {
        const next = lines[lineIdx + 1].trim();
        if (next && !isKeywordLine(next)) return next;
      }
    }
  }
  return '';
}

// キーワード行かどうか判定
function isKeywordLine(line: string): boolean {
  // "住所 ..." "病名：..." など
  if (/^[ぁ-んァ-ン一-龥Ａ-ｚa-zA-Z]{1,8}[：:\s　]/.test(line)) return true;
  // "Dr." "Ns." など
  if (/^(Dr|Ns|MD|RN)[\.\s]/i.test(line)) return true;
  return false;
}

// 生年月日を正規表現で検出（和暦・西暦対応）
function extractBirthDate(text: string): string {
  const patterns = [
    /生年月日[：:\s]*(\d{4}[年\/\-]\d{1,2}[月\/\-]\d{1,2}日?)/,
    /生年月日[：:\s]*((?:昭和|平成|令和)\d+年\d{1,2}月\d{1,2}日)/,
    /(?:昭和|平成|令和)\d+年\d{1,2}月\d{1,2}日生/,
    /(\d{4})年(\d{1,2})月(\d{1,2})日生/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[0].replace(/生年月日[：:\s]*/, '').trim();
  }
  return '';
}

// 性別抽出
function extractGender(text: string): string {
  if (/男性|男|♂/u.test(text)) return '男性';
  if (/女性|女|♀/u.test(text)) return '女性';
  return '';
}

// 病名行の同行内容がラベル説明かどうか判定
// "・依頼内容・コメントなど" のようなラベル説明文は実際の病名ではない
const LABEL_WORDS = ['依頼', 'コメント', '内容', '記載', '備考'];
function isDiagnosisLabel(text: string): boolean {
  return LABEL_WORDS.some(w => text.includes(w));
}

// 病名抽出（ラベル説明行と Dr./Ns. 行を除外）
function extractRawDiagnosis(lines: string[]): string {
  const diagKeywords = ['病名', '診断名', '診断', '傷病名', '主病名', 'Diagnosis'];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const kw of diagKeywords) {
      if (!line.includes(kw)) continue;

      const kwPos = line.indexOf(kw);
      const afterKw = line.slice(kwPos + kw.length).replace(/^[：:・\s]+/, '').trim();

      const found: string[] = [];
      // 同行値がラベル説明でなければ採用
      if (afterKw && !isDiagnosisLabel(afterKw)) found.push(afterKw);

      // 続く行を最大4行まで取り込む
      let j = i + 1;
      while (j < lines.length && j <= i + 4) {
        const next = lines[j].trim();
        if (next && !isKeywordLine(next) && !isDiagnosisLabel(next)) {
          found.push(next);
          j++;
        } else break;
      }

      if (found.length > 0) return found.join(' ');
    }
  }
  return '';
}

// 装具・補助器具の種別キーワード
const DEVICE_KEYWORDS = [
  'コルセット', '装具', '義肢', 'シーネ', 'サポーター', 'スプリント',
  '補装具', '義足', '義手', 'インソール', '松葉杖', 'クラッチ',
];

// 病名行から「疾患名」と「装具名」を分離
function splitDiagnosisAndDevice(raw: string): { diagnosis: string; device: string } {
  for (const kw of DEVICE_KEYWORDS) {
    const idx = raw.indexOf(kw);
    if (idx === -1) continue;

    const before = raw.slice(0, idx);
    const spaceIdx = before.lastIndexOf(' ');
    if (spaceIdx !== -1) {
      return {
        diagnosis: raw.slice(0, spaceIdx).trim(),
        device: raw.slice(spaceIdx + 1).trim(),
      };
    }
    // スペースなし（全体が装具名）
    return { diagnosis: '', device: raw.slice(idx).trim() };
  }
  return { diagnosis: raw, device: '' };
}

// 処方装具名の抽出（明示キーワード優先 → 病名行からの分離）
function extractPrescription(lines: string[], deviceFromDiagnosis: string): string {
  // "装具" 単体は "装具依頼伝票" などに誤マッチするため除外し、より具体的なキーワードのみ使用
  const byKeyword = extractAfterKeyword(lines, ['処方装具名', '処方装具', '用具名', '補助具名']);
  if (byKeyword) return byKeyword;
  return deviceFromDiagnosis;
}

// 住所の抽出
function extractAddress(lines: string[], fullText: string, placeNames: string[]): string {
  const byKeyword = extractAfterKeyword(lines, ['住所', '住居', 'ご住所', '居住地', '現住所', '連絡先住所']);
  if (byKeyword) return byKeyword;

  const postalMatch = fullText.match(/〒?\d{3}[-－]\d{4}[\s\S]{1,60}?(?=[\r\n]|$)/m);
  if (postalMatch) return postalMatch[0].trim();

  const prefMatch = fullText.match(/(?:北海道|東京都|大阪府|京都府|.{2,3}県).{4,40}?[町村丁目号棟]/);
  if (prefMatch) return prefMatch[0].trim();

  return placeNames.join(' ');
}

// 病院名の抽出（キーワード行 → 行単体マッチ → NLTagger組織名フォールバック）
const HOSPITAL_KEYWORDS = ['病院', 'クリニック', '医院', '診療所', '医療センター', '医療法人'];
function extractHospitalName(lines: string[], organizationNames: string[]): string {
  const byLabel = extractAfterKeyword(lines, ['病院名', '医療機関名', '施設名', '機関名']);
  if (byLabel) return byLabel;

  for (const line of lines) {
    if (
      HOSPITAL_KEYWORDS.some(kw => line.includes(kw)) &&
      line.length <= 30 &&
      !line.includes('病名') &&
      !line.includes('病棟')
    ) {
      return line.trim();
    }
  }

  // NLTagger の組織名候補をフォールバックとして使用
  const orgMatch = organizationNames.find(o =>
    HOSPITAL_KEYWORDS.some(kw => o.includes(kw))
  );
  return orgMatch || '';
}

// メイン解析関数
export function parseKarteText(
  rawTexts: string[],
  personNames: string[] = [],
  placeNames: string[] = [],
  organizationNames: string[] = [],
): KarteData {
  const fullText = rawTexts.join('\n');
  const lines = rawTexts.map(t => t.trim()).filter(Boolean);

  const nameByKeyword = extractAfterKeyword(lines, [
    '患者氏名', '患者名', '氏名', '名前', 'Name',
  ]);
  const patientName = nameByKeyword || personNames[0] || '';

  const birthDate = extractBirthDate(fullText);
  const gender = extractGender(fullText);
  const address = extractAddress(lines, fullText, placeNames);
  const hospitalName = extractHospitalName(lines, organizationNames);

  const rawDiagnosis = extractRawDiagnosis(lines);
  const { diagnosis, device } = splitDiagnosisAndDevice(rawDiagnosis);

  const doctor = extractAfterKeyword(lines, ['担当医', '主治医', '医師名', '担当医師', 'Dr.', 'Dr ']);
  const prescription = extractPrescription(lines, device);

  return {
    patientName,
    birthDate,
    gender,
    address,
    hospitalName,
    diagnosis,
    doctor,
    prescription,
    rawText: fullText,
  };
}
