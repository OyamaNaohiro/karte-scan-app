import { KarteData, KarteCandidates, ParseResult } from '../types';

// 重複と空文字を除いた候補リストを作る
function uniq(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const t = v.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

// キーワードの後に続く値をすべて抽出
// 対応形式:
//   "氏名：山田太郎"  (コロン区切り)
//   "住所 北海道..."  (スペース区切り)
//   "患者氏名山田太郎" (区切りなし)
//   キーワード行の次行に値がある場合
function extractAllAfterKeyword(lines: string[], keywords: string[]): string[] {
  const found: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const kw of keywords) {
      if (!line.includes(kw)) continue;

      const kwPos = line.indexOf(kw);
      const afterKw = line.slice(kwPos + kw.length).trim();

      if (afterKw) {
        const colonMatch = afterKw.match(/^[：:]\s*(.*)/);
        if (colonMatch && colonMatch[1].trim()) {
          found.push(colonMatch[1].trim());
        } else {
          found.push(afterKw);
        }
        continue;
      }

      // 同行に値がない場合のみ次行を確認
      if (i + 1 < lines.length) {
        const next = lines[i + 1].trim();
        if (next && !isKeywordLine(next)) found.push(next);
      }
    }
  }
  return uniq(found);
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
function extractBirthDates(text: string): string[] {
  const patterns = [
    /生年月日[：:\s]*(\d{4}[年\/\-]\d{1,2}[月\/\-]\d{1,2}日?)/g,
    /生年月日[：:\s]*((?:昭和|平成|令和)\d+年\d{1,2}月\d{1,2}日)/g,
    /(?:昭和|平成|令和)\d+年\d{1,2}月\d{1,2}日生/g,
    /(\d{4})年(\d{1,2})月(\d{1,2})日生/g,
  ];
  const found: string[] = [];
  for (const pattern of patterns) {
    const matches = text.match(pattern);
    if (!matches) continue;
    for (const m of matches) {
      found.push(m.replace(/生年月日[：:\s]*/, '').trim());
    }
  }
  return uniq(found);
}

// 性別抽出（両方の表記が混在する場合は両方を候補にする）
function extractGenders(text: string): string[] {
  const found: string[] = [];
  if (/男性|男|♂/u.test(text)) found.push('男性');
  if (/女性|女|♀/u.test(text)) found.push('女性');
  return found;
}

// 病名行の同行内容がラベル説明かどうか判定
// "・依頼内容・コメントなど" のようなラベル説明文は実際の病名ではない
const LABEL_WORDS = ['依頼', 'コメント', '内容', '記載', '備考'];
function isDiagnosisLabel(text: string): boolean {
  return LABEL_WORDS.some(w => text.includes(w));
}

// 病名抽出（ラベル説明行と Dr./Ns. 行を除外）
function extractRawDiagnoses(lines: string[]): string[] {
  const diagKeywords = ['病名', '診断名', '診断', '傷病名', '主病名', 'Diagnosis'];
  const results: string[] = [];

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

      if (found.length > 0) results.push(found.join(' '));
    }
  }
  return uniq(results);
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
function extractPrescriptions(lines: string[], devicesFromDiagnosis: string[]): string[] {
  // "装具" 単体は "装具依頼伝票" などに誤マッチするため除外し、より具体的なキーワードのみ使用
  const byKeyword = extractAllAfterKeyword(lines, ['処方装具名', '処方装具', '用具名', '補助具名']);
  return uniq([...byKeyword, ...devicesFromDiagnosis]);
}

// 住所の抽出
function extractAddresses(lines: string[], fullText: string, placeNames: string[]): string[] {
  const found = extractAllAfterKeyword(lines, [
    '住所', '住居', 'ご住所', '居住地', '現住所', '連絡先住所',
  ]);

  const postalMatch = fullText.match(/〒?\d{3}[-－]\d{4}[\s\S]{1,60}?(?=[\r\n]|$)/m);
  if (postalMatch) found.push(postalMatch[0].trim());

  const prefMatch = fullText.match(/(?:北海道|東京都|大阪府|京都府|.{2,3}県).{4,40}?[町村丁目号棟]/);
  if (prefMatch) found.push(prefMatch[0].trim());

  const joinedPlaces = placeNames.join(' ').trim();
  if (joinedPlaces) found.push(joinedPlaces);

  return uniq(found);
}

// 病院名の抽出（キーワード行 → 行単体マッチ → NLTagger組織名フォールバック）
const HOSPITAL_KEYWORDS = ['病院', 'クリニック', '医院', '診療所', '医療センター', '医療法人'];
function extractHospitalNames(lines: string[], organizationNames: string[]): string[] {
  const found = extractAllAfterKeyword(lines, [
    '病院名', '医療機関名', '施設名', '機関名',
  ]);

  for (const line of lines) {
    if (
      HOSPITAL_KEYWORDS.some(kw => line.includes(kw)) &&
      line.length <= 30 &&
      !line.includes('病名') &&
      !line.includes('病棟')
    ) {
      found.push(line.trim());
    }
  }

  // NLTagger の組織名候補をフォールバックとして使用
  for (const o of organizationNames) {
    if (HOSPITAL_KEYWORDS.some(kw => o.includes(kw))) found.push(o);
  }

  return uniq(found);
}

// メイン解析関数
export function parseKarteText(
  rawTexts: string[],
  personNames: string[] = [],
  placeNames: string[] = [],
  organizationNames: string[] = [],
): ParseResult {
  const fullText = rawTexts.join('\n');
  const lines = rawTexts.map(t => t.trim()).filter(Boolean);

  const patientNames = uniq([
    ...extractAllAfterKeyword(lines, ['患者氏名', '患者名', '氏名', '名前', 'Name']),
    ...personNames,
  ]);

  const birthDates = extractBirthDates(fullText);
  const genders = extractGenders(fullText);
  const addresses = extractAddresses(lines, fullText, placeNames);
  const hospitalNames = extractHospitalNames(lines, organizationNames);

  const rawDiagnoses = extractRawDiagnoses(lines);
  const split = rawDiagnoses.map(splitDiagnosisAndDevice);
  const diagnoses = uniq(split.map(s => s.diagnosis));
  const devices = uniq(split.map(s => s.device));

  const doctors = extractAllAfterKeyword(lines, [
    '担当医', '主治医', '医師名', '担当医師', 'Dr.', 'Dr ',
  ]);
  const prescriptions = extractPrescriptions(lines, devices);

  const candidates: KarteCandidates = {
    patientName: patientNames,
    birthDate: birthDates,
    gender: genders,
    address: addresses,
    hospitalName: hospitalNames,
    diagnosis: diagnoses,
    doctor: doctors,
    prescription: prescriptions,
  };

  // 先頭候補を採用値とする
  const data: KarteData = {
    patientName: patientNames[0] ?? '',
    birthDate: birthDates[0] ?? '',
    gender: genders[0] ?? '',
    address: addresses[0] ?? '',
    hospitalName: hospitalNames[0] ?? '',
    diagnosis: diagnoses[0] ?? '',
    doctor: doctors[0] ?? '',
    prescription: prescriptions[0] ?? '',
    rawText: fullText,
  };

  return { data, candidates };
}
