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
} from 'react-native';
import { DocumentScanner } from './utils/DocumentScanner';
import { parseKarteText } from './utils/karteParser';
import { saveRecord } from './utils/fileStorage';
import { KarteForm } from './components/KarteForm';
import { KarteData } from './types';

type AppState = 'idle' | 'scanning' | 'review' | 'saving' | 'done';

const EMPTY_KARTE: KarteData = {
  patientName: '',
  birthDate: '',
  gender: '',
  diagnosis: '',
  doctor: '',
  prescription: '',
  rawText: '',
};

export default function App() {
  const [appState, setAppState] = useState<AppState>('idle');
  const [karteData, setKarteData] = useState<KarteData>(EMPTY_KARTE);
  const [pageImages, setPageImages] = useState<string[]>([]);
  const [savedPdfPath, setSavedPdfPath] = useState('');

  async function handleScan() {
    try {
      setAppState('scanning');
      const result = await DocumentScanner.scan();

      const parsed = parseKarteText(result.texts);
      setKarteData(parsed);
      setPageImages(result.pageImages);
      setAppState('review');
    } catch (err: any) {
      setAppState('idle');
      if (err?.code !== 'CANCELLED') {
        Alert.alert('スキャンエラー', err?.message ?? '不明なエラー');
      }
    }
  }

  async function handleSave() {
    try {
      setAppState('saving');
      const record = await saveRecord(karteData, pageImages);
      setSavedPdfPath(record.pdfPath);
      setAppState('done');
    } catch (err: any) {
      setAppState('review');
      Alert.alert('保存エラー', err?.message ?? '保存に失敗しました');
    }
  }

  function handleReset() {
    setKarteData(EMPTY_KARTE);
    setPageImages([]);
    setSavedPdfPath('');
    setAppState('idle');
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>カルテスキャン</Text>
        {appState === 'review' && (
          <TouchableOpacity onPress={handleReset} style={styles.resetBtn}>
            <Text style={styles.resetText}>やり直す</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.body}>

        {/* 待機画面 */}
        {appState === 'idle' && (
          <View style={styles.center}>
            <Text style={styles.description}>
              カルテをカメラでスキャンし、{'\n'}OCRで自動入力します。
            </Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={handleScan}>
              <Text style={styles.primaryBtnText}>スキャン開始</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* スキャン中 */}
        {appState === 'scanning' && (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#2563EB" />
            <Text style={styles.statusText}>スキャン・OCR処理中…</Text>
          </View>
        )}

        {/* 確認フォーム */}
        {appState === 'review' && (
          <View style={styles.flex}>
            <ScrollView
              style={styles.flex}
              contentContainerStyle={styles.formContent}>
              <KarteForm data={karteData} onChange={setKarteData} />
            </ScrollView>
            <View style={styles.actionBar}>
              <TouchableOpacity style={styles.primaryBtn} onPress={handleSave}>
                <Text style={styles.primaryBtnText}>保存する</Text>
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
              PDFとメタデータを保存しました。
            </Text>
            <Text style={styles.pathText} numberOfLines={3}>
              {savedPdfPath}
            </Text>
            <TouchableOpacity
              style={[styles.primaryBtn, { marginTop: 24 }]}
              onPress={handleReset}>
              <Text style={styles.primaryBtnText}>最初に戻る</Text>
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
});
