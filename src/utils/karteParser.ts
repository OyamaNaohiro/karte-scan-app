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
        // コロンで始まる場合: "：山田太郎" → "山田太郎"
        const colonMatch = afterKw.match(/^[：:]\s*(.*)/);
        if (colonMatch && colonMatch[1].trim()) return colonMatch[1].trim();
        // スペースなし or スペース区切りで直接続く値
        return afterKw;
      }

      // 同行に値がない場合のみ次行を確認
      const lineIdx = lines.indexOf(line);
      if (lineIdx + 1 < lines.length) {
        const next = lines[lineIdx + 1].trim();
        // 次行が別のキーワード行なら使わない
        if (next && !isKeywordLine(next)) return next;
      }
    }
  }
  return '';
}

// キーワード行かどうか判定（"住所 ..." "病名：..." など）
function isKeywordLine(line: string): boolean {
  return /^[ぁ-んァ-ン一-龥Ａ-ｚa-zA-Z]{1,8}[：:\s　]/.test(line);
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

// 病名・依頼内容抽出
function extractDiagnosis(lines: string[]): string {
  const diagKeywords = ['病名', '診断名', '診断', '傷病名', '主病名', 'Diagnosis', '依頼内容'];
  const found: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const kw of diagKeywords) {
      if (!line.includes(kw)) continue;

      const kwPos = line.indexOf(kw);
      const afterKw = line.slice(kwPos + kw.length).trim();
      const colonMatch = afterKw.match(/^[：:・]\s*(.*)/);
      const sameLineVal = colonMatch ? colonMatch[1].trim() : afterKw.replace(/^[・\s]+/, '').trim();
      if (sameLineVal) found.push(sameLineVal);

      // 続く行も取り込む（箇条書き対応）
      let j = i + 1;
      while (j < lines.length && j <= i + 4) {
        const next = lines[j].trim();
        if (next && !isKeywordLine(next) && next !== line) {
          found.push(next);
          j++;
        } else break;
      }
      break;
    }
    if (found.length > 0) break;
  }
  return found.join('、');
}

// 処方装具名の抽出
function extractPrescription(lines: string[]): string {
  return extractAfterKeyword(lines, ['処方', '処方装具', '装具名', '装具', '器具', '用具', '補助具', 'コルセット']);
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

// メイン解析関数
export function parseKarteText(
  rawTexts: string[],
  personNames: string[] = [],
  placeNames: string[] = [],
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
  const diagnosis = extractDiagnosis(lines);
  const doctor = extractAfterKeyword(lines, ['担当医', '主治医', '医師名', '担当医師', 'Dr.', 'Dr ']);
  const prescription = extractPrescription(lines);

  return {
    patientName,
    birthDate,
    gender,
    address,
    diagnosis,
    doctor,
    prescription,
    rawText: fullText,
  };
}
