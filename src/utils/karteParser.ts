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

// 氏名の敬称（末尾から除去する）
const HONORIFICS = ['様', 'さま', 'サマ', 'さん', '殿', 'どの', '君', 'ちゃん'];

// 氏名候補の整形（敬称・前後の記号を除去）
function cleanName(raw: string): string {
  let s = raw.trim().replace(/^[（(]|[）)]$/g, '').trim();
  for (const h of HONORIFICS) {
    if (s.endsWith(h)) {
      s = s.slice(0, -h.length).trim();
      break;
    }
  }
  return s;
}

// 氏名の値から、後続ラベル・日付以降を切り捨てて名前部分だけを取り出す
// 例: "大渕 久子 生年月日 昭和20年…" → "大渕 久子"
// OCRが1行にまとめて認識した長い行でも名前だけを拾えるようにする
const NAME_CUT_WORDS = [
  '生年月日', '生年', '年齢', '性別', '住所', '電話', 'TEL', '病名',
  '診断', '担当', '主治', '医師', '患者', 'ID', 'カルテ', '様',
];
function trimNameValue(raw: string): string {
  let s = raw.trim();
  let end = s.length;
  for (const w of NAME_CUT_WORDS) {
    const i = s.indexOf(w);
    if (i > 0 && i < end) end = i;
  }
  // 数字・和暦が現れたらそこで切る
  const dateMatch = s.slice(0, end).match(/[0-9０-９]|昭和|平成|令和|大正|明治/);
  if (dateMatch && dateMatch.index !== undefined && dateMatch.index > 0) {
    end = Math.min(end, dateMatch.index);
  }
  return s.slice(0, end).trim();
}

// 氏名として妥当か判定
// - 2〜12文字（「尾崎進」のような3文字名も許可）
// - 数字を含むもの（生年月日など）は除外
// - ラベル語・記号を含むものは除外
const NAME_STOP_WORDS = [
  '氏名', '名前', '患者', '生年', '月日', '住所', '病名', '診断',
  '担当', '医師', '主治', '性別', '男性', '女性', '不明',
  '病院', 'クリニック', '医院', '装具', '指示', '番号',
];
function isValidName(raw: string): boolean {
  const s = cleanName(raw);
  if (s.length < 2 || s.length > 12) return false;
  if (/[0-9０-９]/.test(s)) return false; // 数字を含む＝生年月日・番号など
  if (/[：:／\/|｜\-]/.test(s)) return false;
  if (/(昭和|平成|令和|大正|明治)/.test(s)) return false; // 和暦
  if (NAME_STOP_WORDS.some(w => s.includes(w))) return false;
  return true;
}

// 生年月日らしい行かどうか
const BIRTHDATE_LINE = /(?:昭和|平成|令和|大正|明治)\s*\d{1,2}\s*年|\d{4}\s*[年\/\-]\s*\d{1,2}\s*[月\/\-]/;

// 生年月日行の前後行を氏名候補として拾う
// ラベルと値が離れた表形式カルテ（"氏名"ラベルの下に別ラベルが続く）対策。
// カルテでは「氏名 → 生年月日」の並びが多く、生年月日行の直前が氏名であることが多い。
function extractNamesNearBirthDate(lines: string[]): string[] {
  const found: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!BIRTHDATE_LINE.test(lines[i])) continue;
    if (i - 1 >= 0) found.push(lines[i - 1]);
    if (i + 1 < lines.length) found.push(lines[i + 1]);
  }
  return found;
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

// 装具名らしい行を判定するためのマーカー語（診断分離用の DEVICE_KEYWORDS より広め）
// この病院の書類のように装具の選択肢が列挙され○で囲む形式に対応するため、
// 装具名らしい行はすべて候補として拾う（どれが処方されたかはOCRでは判別できない）。
const ORTHOSIS_MARKERS = [
  '装具', 'コルセット', 'カラー', 'ブレース', 'サポート', 'スリング',
  'ウエッジ', 'サポーター', 'シーネ', 'スプリント', 'インソール',
  '補高', 'サポート', 'ウルトラ',
];
// ヘッダー・会社名など装具名ではない行を除外する語
const ORTHOSIS_EXCLUDE = ['種類', '指示', '依頼', '伝票', '義肢'];

// 装具名の前後の記号・囲み文字を除去
function cleanDeviceName(line: string): string {
  return line
    .replace(/^[（(「『【\s]+/, '')
    .replace(/[（(）)「『」』【】、。・"“”½\s]+$/, '')
    .trim();
}

// 書類全体から装具名らしい行を候補として収集
function extractDeviceCandidates(lines: string[]): string[] {
  const found: string[] = [];
  for (const line of lines) {
    if (!ORTHOSIS_MARKERS.some(m => line.includes(m))) continue;
    if (ORTHOSIS_EXCLUDE.some(w => line.includes(w))) continue;
    const name = cleanDeviceName(line);
    if (name.length >= 3 && name.length <= 30) found.push(name);
  }
  return uniq(found);
}

// 処方装具名の抽出（明示キーワード → 病名行からの分離 → 書類全体の装具名候補）
function extractPrescriptions(lines: string[], devicesFromDiagnosis: string[]): string[] {
  // "装具" 単体は "装具依頼伝票" などに誤マッチするため除外し、より具体的なキーワードのみ使用
  const byKeyword = extractAllAfterKeyword(lines, ['処方装具名', '処方装具', '用具名', '補助具名']);
  return uniq([
    ...byKeyword,
    ...devicesFromDiagnosis,
    ...extractDeviceCandidates(lines),
  ]);
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

  // キーワード抽出とNER人名を統合し、敬称除去・妥当性チェックで絞り込む
  const patientNames = uniq(
    [
      ...extractAllAfterKeyword(lines, ['患者氏名', '患者名', '氏名', '名前', 'Name']),
      ...personNames,
      ...extractNamesNearBirthDate(lines),
    ]
      .map(trimNameValue)
      .map(cleanName)
      .filter(isValidName),
  );

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
