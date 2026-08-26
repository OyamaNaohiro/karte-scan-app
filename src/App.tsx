import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ScrollView,
  Image,
} from 'react-native';
import { DocumentScanner } from './utils/DocumentScanner';
import { parseKarteText } from './utils/karteParser';
import { saveRecord, savePdfOnly } from './utils/fileStorage';
import { KarteForm, NerCandidates } from './components/KarteForm';
import { RecordList } from './components/RecordList';
import { RecordDetail } from './components/RecordDetail';
import { SummaryScreen } from './components/SummaryScreen';
import { DeliveryCalendarScreen } from './components/DeliveryCalendarScreen';
import { KarteData, KarteCandidates, SavedRecord } from './types';

type AppState =
  | 'idle'
  | 'scanning'
  | 'review'
  | 'pdf-review'
  | 'saving'
  | 'done'
  | 'list'
  | 'detail'
  | 'summary'
  | 'delivery';
type ScanMode = 'ocr' | 'pdf' | 'ocr-silent';

// 1枚（1書類）分の確認用データ
interface ReviewDoc {
  karteData: KarteData;
  candidates: KarteCandidates;
  ner: NerCandidates;
  image: string; // base64
}

export default function App() {
  const [appState, setAppState] = useState<AppState>('idle');
  // OCR確認フロー: 1枚ごとに分類した書類の配列と現在位置
  const [documents, setDocuments] = useState<ReviewDoc[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  // PDF変換フロー: 1枚=1PDFとして扱う画像配列
  const [pdfImages, setPdfImages] = useState<string[]>([]);
  const [savedCount, setSavedCount] = useState(0);
  const [selectedRecord, setSelectedRecord] = useState<SavedRecord | null>(null);
  // 記録詳細をどこから開いたか（戻り先の判定用）
  const [detailFrom, setDetailFrom] = useState<'list' | 'delivery'>('list');
  // この保存フローでPDFを生成するか（無音モードはPDFなし）
  const [keepPdf, setKeepPdf] = useState(true);

  async function handleScan(mode: ScanMode) {
    try {
      setAppState('scanning');
      // 無音・手動モードはPDFを残さない記録専用
      const silent = mode === 'ocr-silent';
      setKeepPdf(!silent);
      const result = silent
        ? await DocumentScanner.scanManual()
        : await DocumentScanner.scan();

      if (!result.pages || result.pages.length === 0) {
        setAppState('idle');
        Alert.alert('スキャン', '書類が読み取れませんでした。');
        return;
      }

      if (mode === 'ocr' || mode === 'ocr-silent') {
        const docs: ReviewDoc[] = result.pages.map(p => {
          const parsed = parseKarteText(
            p.texts,
            p.personNames,
            p.placeNames,
            p.organizationNames,
          );
          return {
            karteData: parsed.data,
            candidates: parsed.candidates,
            ner: {
              personNames: p.personNames,
              placeNames: p.placeNames,
              organizationNames: p.organizationNames,
            },
            image: p.image,
          };
        });
        setDocuments(docs);
        setCurrentIndex(0);
        setAppState('review');
      } else {
        setPdfImages(result.pages.map(p => p.image));
        setAppState('pdf-review');
      }
    } catch (err: any) {
      setAppState('idle');
      if (err?.code !== 'CANCELLED') {
        Alert.alert('スキャンエラー', err?.message ?? '不明なエラー');
      }
    }
  }

  // 現在の書類の抽出データを更新
  function updateCurrentKarte(updated: KarteData) {
    setDocuments(docs =>
      docs.map((d, i) => (i === currentIndex ? { ...d, karteData: updated } : d)),
    );
  }

  // 現在の書類を保存し、次の書類へ or 完了
  async function handleSaveCurrent() {
    const doc = documents[currentIndex];
    if (!doc) return;
    try {
      setAppState('saving');
      await saveRecord(doc.karteData, [doc.image], { pdf: keepPdf });
      const isLast = currentIndex + 1 >= documents.length;
      if (isLast) {
        setSavedCount(documents.length);
        setAppState('done');
      } else {
        setCurrentIndex(currentIndex + 1);
        setAppState('review');
      }
    } catch (err: any) {
      setAppState('review');
      Alert.alert('保存エラー', err?.message ?? '保存に失敗しました');
    }
  }

  // すべての書類を確認せずまとめて保存（自動分類結果のまま）
  async function handleSaveAllDocuments() {
    try {
      setAppState('saving');
      for (const doc of documents) {
        await saveRecord(doc.karteData, [doc.image], { pdf: keepPdf });
      }
      setSavedCount(documents.length);
      setAppState('done');
    } catch (err: any) {
      setAppState('review');
      Alert.alert('保存エラー', err?.message ?? '保存に失敗しました');
    }
  }

  // PDF変換: 1枚ごとに個別のPDFとして保存
  async function handleSavePdfAll() {
    try {
      setAppState('saving');
      for (const img of pdfImages) {
        await savePdfOnly([img]);
      }
      setSavedCount(pdfImages.length);
      setAppState('done');
    } catch (err: any) {
      setAppState('pdf-review');
      Alert.alert('保存エラー', err?.message ?? '保存に失敗しました');
    }
  }

  function handleReset() {
    setDocuments([]);
    setCurrentIndex(0);
    setPdfImages([]);
    setSavedCount(0);
    setKeepPdf(true);
    setAppState('idle');
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.header}>
        {appState === 'detail' ? (
          <TouchableOpacity
            onPress={() => setAppState(detailFrom)}
            style={styles.resetBtn}>
            <Text style={styles.resetText}>
              {detailFrom === 'delivery' ? '‹ 納品カレンダー' : '‹ 一覧'}
            </Text>
          </TouchableOpacity>
        ) : appState === 'summary' || appState === 'delivery' ? (
          <TouchableOpacity onPress={() => setAppState('list')} style={styles.resetBtn}>
            <Text style={styles.resetText}>‹ 一覧</Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.headerTitle}>
            {appState === 'list'
              ? '保存済み記録'
              : appState === 'review' && documents.length > 0
              ? `確認 ${currentIndex + 1} / ${documents.length}`
              : 'カルテスキャン'}
          </Text>
        )}
        {appState === 'summary' && (
          <Text style={styles.headerTitle}>金額の集計</Text>
        )}
        {appState === 'delivery' && (
          <Text style={styles.headerTitle}>納品カレンダー</Text>
        )}
        {(appState === 'review' || appState === 'pdf-review') && (
          <TouchableOpacity onPress={handleReset} style={styles.resetBtn}>
            <Text style={styles.resetText}>やり直す</Text>
          </TouchableOpacity>
        )}
        {(appState === 'list' || appState === 'detail') && (
          <TouchableOpacity onPress={handleReset} style={styles.resetBtn}>
            <Text style={styles.resetText}>閉じる</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.body}>

        {/* 待機画面 */}
        {appState === 'idle' && (
          <View style={styles.center}>
            <Text style={styles.description}>
              スキャンの種類を選択してください。
            </Text>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => handleScan('ocr')}>
              <Text style={styles.primaryBtnText}>カルテスキャン（OCR）</Text>
              <Text style={styles.btnSubText}>テキスト抽出・編集あり</Text>
            </TouchableOpacity>
            <View style={styles.btnSpacer} />
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => handleScan('ocr-silent')}>
              <Text style={styles.secondaryBtnText}>記録のみ（無音・手動）</Text>
              <Text style={styles.btnSubTextDark}>
                シャッター音なし・PDFは残さない
              </Text>
            </TouchableOpacity>
            <View style={styles.btnSpacer} />
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => handleScan('pdf')}>
              <Text style={styles.secondaryBtnText}>書類をPDFに変換</Text>
              <Text style={styles.btnSubTextDark}>そのままPDF保存</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.linkBtn}
              onPress={() => setAppState('list')}>
              <Text style={styles.linkBtnText}>保存済みの記録を見る</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* 保存済み一覧 */}
        {appState === 'list' && (
          <RecordList
            onSelect={record => {
              setSelectedRecord(record);
              setDetailFrom('list');
              setAppState('detail');
            }}
            onOpenSummary={() => setAppState('summary')}
            onOpenDeliveryCalendar={() => setAppState('delivery')}
          />
        )}

        {/* 金額の集計 */}
        {appState === 'summary' && <SummaryScreen />}

        {/* 納品カレンダー */}
        {appState === 'delivery' && (
          <DeliveryCalendarScreen
            onSelectRecord={record => {
              setSelectedRecord(record);
              setDetailFrom('delivery');
              setAppState('detail');
            }}
          />
        )}

        {/* 記録詳細 */}
        {appState === 'detail' && selectedRecord && (
          <RecordDetail
            record={selectedRecord}
            onDeleted={() => {
              setSelectedRecord(null);
              setAppState(detailFrom);
            }}
          />
        )}

        {/* スキャン中 */}
        {appState === 'scanning' && (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#2563EB" />
            <Text style={styles.statusText}>スキャン・OCR処理中…</Text>
          </View>
        )}

        {/* 確認フォーム（1枚ずつ） */}
        {appState === 'review' && documents[currentIndex] && (
          <View style={styles.flex}>
            {documents.length > 1 && (
              <View style={styles.progressBar}>
                <Text style={styles.progressText}>
                  書類 {currentIndex + 1} / {documents.length} 枚
                </Text>
              </View>
            )}
            <ScrollView
              style={styles.flex}
              contentContainerStyle={styles.formContent}>
              <KarteForm
                data={documents[currentIndex].karteData}
                onChange={updateCurrentKarte}
                candidates={documents[currentIndex].candidates}
                ner={documents[currentIndex].ner}
              />
              <View style={styles.previewSection}>
                <Text style={styles.previewTitle}>スキャン画像プレビュー</Text>
                <Image
                  source={{
                    uri: `data:image/jpeg;base64,${documents[currentIndex].image}`,
                  }}
                  style={styles.previewImage}
                  resizeMode="contain"
                />
              </View>
            </ScrollView>
            <View style={styles.actionBar}>
              <TouchableOpacity style={styles.primaryBtn} onPress={handleSaveCurrent}>
                <Text style={styles.primaryBtnText}>
                  {currentIndex + 1 >= documents.length
                    ? '保存して完了'
                    : '保存して次へ'}
                </Text>
              </TouchableOpacity>
              {documents.length > 1 && (
                <TouchableOpacity
                  style={styles.secondaryActionBtn}
                  onPress={handleSaveAllDocuments}>
                  <Text style={styles.secondaryActionText}>
                    チェックせず全{documents.length}件を保存（あとで編集）
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* PDF確認画面（1枚=1PDF） */}
        {appState === 'pdf-review' && (
          <View style={styles.flex}>
            <ScrollView
              style={styles.flex}
              contentContainerStyle={styles.formContent}>
              <Text style={styles.previewTitle}>
                スキャン画像の確認（{pdfImages.length}枚）
              </Text>
              {pdfImages.map((b64: string, i: number) => (
                <View key={i}>
                  <Text style={styles.pdfPageLabel}>{i + 1}枚目</Text>
                  <Image
                    source={{ uri: `data:image/jpeg;base64,${b64}` }}
                    style={styles.previewImage}
                    resizeMode="contain"
                  />
                </View>
              ))}
            </ScrollView>
            <View style={styles.actionBar}>
              <TouchableOpacity style={styles.primaryBtn} onPress={handleSavePdfAll}>
                <Text style={styles.primaryBtnText}>
                  それぞれPDFとして保存する（{pdfImages.length}件）
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* 保存中 */}
        {appState === 'saving' && (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#2563EB" />
            <Text style={styles.statusText}>PDFを生成・保存中…</Text>
          </View>
        )}

        {/* 完了画面 */}
        {appState === 'done' && (
          <View style={styles.center}>
            <Text style={styles.doneIcon}>✅</Text>
            <Text style={styles.doneTitle}>保存完了</Text>
            <Text style={styles.doneSubtitle}>
              {savedCount}件の書類を保存しました。
            </Text>
            <TouchableOpacity
              style={[styles.primaryBtn, { marginTop: 24 }]}
              onPress={handleReset}>
              <Text style={styles.primaryBtnText}>最初に戻る</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.linkBtn}
              onPress={() => setAppState('list')}>
              <Text style={styles.linkBtnText}>保存済みの記録を見る</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#111' },
  resetBtn: { padding: 6 },
  resetText: { color: '#2563EB', fontSize: 15 },
  body: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  description: {
    fontSize: 16,
    color: '#555',
    textAlign: 'center',
    lineHeight: 26,
    marginBottom: 36,
  },
  primaryBtn: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    width: '100%',
  },
  primaryBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  statusText: { marginTop: 16, fontSize: 15, color: '#555' },
  formContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24 },
  actionBar: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    backgroundColor: '#fff',
  },
  doneIcon: { fontSize: 56, marginBottom: 16 },
  doneTitle: { fontSize: 24, fontWeight: '700', color: '#111', marginBottom: 8 },
  doneSubtitle: { fontSize: 15, color: '#555', marginBottom: 12 },
  pathText: { fontSize: 11, color: '#999', textAlign: 'center', lineHeight: 18 },
  secondaryBtn: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#2563EB',
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    width: '100%',
  },
  secondaryBtnText: { color: '#2563EB', fontSize: 17, fontWeight: '700' },
  btnSubText: { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 2 },
  btnSubTextDark: { color: '#2563EB', fontSize: 12, marginTop: 2, opacity: 0.7 },
  btnSpacer: { height: 16 },
  secondaryActionBtn: {
    marginTop: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryActionText: {
    color: '#2563EB',
    fontSize: 14,
    fontWeight: '600',
  },
  progressBar: {
    backgroundColor: '#eef2ff',
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e7ff',
  },
  progressText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2563EB',
  },
  pdfPageLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#888',
    marginBottom: 4,
  },
  linkBtn: { marginTop: 24, padding: 8 },
  linkBtnText: {
    color: '#2563EB',
    fontSize: 15,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  previewSection: {
    marginTop: 24,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingTop: 16,
  },
  previewTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#333',
    marginBottom: 12,
  },
  previewImage: {
    width: '100%',
    height: 480,
    marginBottom: 16,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
  },
});
