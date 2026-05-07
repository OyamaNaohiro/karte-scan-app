import { KarteData } from '../types';

// キーワードの前後に出現する値を抽出する汎用関数
function extractAfterKeyword(lines: string[], keywords: string[]): string {
  for (const line of lines) {
    for (const kw of keywords) {
      if (line.includes(kw)) {
        // "氏名：山田太郎" → "山田太郎"
        const colonIdx = line.search(/[：:]/);
        if (colonIdx !== -1) {
          const value = line.slice(colonIdx + 1).trim();
          if (value) return value;
        }
        // 次の行に値がある場合
        const kwIdx = lines.indexOf(line);
        if (kwIdx + 1 < lines.length) {
          const next = lines[kwIdx + 1].trim();
          if (next && !next.match(/^[ぁ-んァ-ン一-龥a-zA-Z]+[：:]/)) {
            return next;
          }
        }
      }
    }
  }
  return '';
}

// 生年月日を正規表現で検出（和暦・西暦対応）
function extractBirthDate(text: string): string {
  const patterns = [
    /生年月日[：:\s]*(\d{4}[年\/\-]\d{1,2}[月\/\-]\d{1,2}日?)/,
    /生年月日[：:\s]*((?:昭和|平成|令和)\d+年\d{1,2}月\d{1,2}日)/,
    /(?:昭和|平成|令和)(\d+)年(\d{1,2})月(\d{1,2})日生/,
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

// 病名・診断名抽出（複数病名対応）
function extractDiagnosis(lines: string[]): string {
  const diagKeywords = ['病名', '診断名', '診断', '傷病名', '主病名', 'Diagnosis'];
  const found: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const kw of diagKeywords) {
      if (line.includes(kw)) {
        const colonIdx = line.search(/[：:]/);
        if (colonIdx !== -1) {
          const val = line.slice(colonIdx + 1).trim();
          if (val) found.push(val);
        }
        // 続く行も取り込む（箇条書き対応）
        let j = i + 1;
        while (j < lines.length && j <= i + 3) {
          const next = lines[j].trim();
          if (next && !next.match(/^[^\s]{1,6}[：:]/)) {
            found.push(next);
            j++;
          } else break;
        }
        break;
      }
    }
  }
  return found.join('、');
}

// 処方装具名の抽出
function extractPrescription(lines: string[]): string {
  const keywords = ['処方', '処方装具', '装具', '器具', '用具', '補助具'];
  return extractAfterKeyword(lines, keywords);
}

// 住所の抽出（キーワードマッチ → 正規表現 → NLTagger地名フォールバック）
function extractAddress(lines: string[], fullText: string, placeNames: string[]): string {
  const byKeyword = extractAfterKeyword(lines, ['住所', '住居', 'ご住所', '居住地', '現住所', '連絡先住所']);
  if (byKeyword) return byKeyword;

  // 〒xxx-xxxx から始まる住所パターン
  const postalMatch = fullText.match(/〒?\d{3}[-－]\d{4}[\s\S]{1,60}?(?=[(\r\n]|$)/m);
  if (postalMatch) return postalMatch[0].trim();

  // 都道府県から始まる住所パターン
  const prefMatch = fullText.match(/[東京都大阪府京都府北海道][^\n]{4,40}[町村丁目号棟]/);
  if (prefMatch) return prefMatch[0].trim();

  // NLTagger の地名候補をフォールバックとして使用
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

  const nameByKeyword = extractAfterKeyword(lines, ['氏名', '患者名', '患者氏名', '名前', 'Name']);
  const patientName = nameByKeyword || personNames[0] || '';

  const birthDate = extractBirthDate(fullText);
  const gender = extractGender(fullText);
  const address = extractAddress(lines, fullText, placeNames);
  const diagnosis = extractDiagnosis(lines);
  const doctor = extractAfterKeyword(lines, ['担当医', '主治医', '医師名', '担当医師', 'Dr.']);
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
