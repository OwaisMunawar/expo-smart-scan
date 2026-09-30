import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { OcrOverlay } from './src/OcrOverlay';
import { ResultPanel } from './src/ResultPanel';
import { colors } from './src/theme';
import { useScan, type EngineChoice } from './src/useScan';

function Button({
  title,
  onPress,
  primary,
}: {
  title: string;
  onPress: () => unknown;
  primary?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        primary && styles.primary,
        pressed && { opacity: 0.7 },
      ]}>
      <Text style={[styles.buttonText, primary && { color: colors.background }]}>{title}</Text>
    </Pressable>
  );
}

const ENGINES: EngineChoice[] = ['auto', 'heuristic'];

export default function App() {
  return (
    <SafeAreaProvider>
      <Scanner />
    </SafeAreaProvider>
  );
}

function Scanner() {
  const { state, engine, setEngine, capabilities, pickFromLibrary, loadSample } = useScan();
  const fm = capabilities.foundationModels;
  const image = state.status === 'idle' ? null : state.image;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Smart Scan</Text>
        <Text style={styles.subtitle}>
          Foundation Models:{' '}
          <Text style={{ color: fm === 'available' ? colors.success : colors.warning }}>
            {fm}
            {capabilities.foundationModelsReason ? ` (${capabilities.foundationModelsReason})` : ''}
          </Text>
        </Text>

        <View style={styles.segment}>
          {ENGINES.map((e) => (
            <Pressable
              key={e}
              onPress={() => setEngine(e)}
              style={[styles.segmentItem, engine === e && styles.segmentActive]}>
              <Text style={[styles.segmentText, engine === e && { color: colors.text }]}>{e}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.row}>
          <Button title="Use sample receipt" primary onPress={loadSample} />
          <Button title="Pick from library" onPress={pickFromLibrary} />
        </View>

        {image && (
          <OcrOverlay
            uri={image.uri}
            aspectRatio={image.width / image.height}
            lines={state.status === 'done' ? state.result.lines : []}
            document={state.status === 'done' ? state.document : null}
          />
        )}

        {state.status === 'scanning' && <ActivityIndicator color={colors.accent} />}
        {state.status === 'error' && <Text style={styles.error}>{state.message}</Text>}
        {state.status === 'done' && <ResultPanel result={state.result} />}
        {state.status === 'idle' && (
          <Text style={styles.hint}>
            Everything runs on device. Pick a photo of a receipt, or try the bundled sample.
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, gap: 14, paddingBottom: 48 },
  title: { color: colors.text, fontSize: 28, fontWeight: '800' },
  subtitle: { color: colors.muted, fontSize: 14, marginTop: -8 },
  row: { flexDirection: 'row', gap: 10 },
  button: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  primary: { backgroundColor: colors.accent, borderColor: colors.accent },
  buttonText: { color: colors.text, fontWeight: '600' },
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 3,
  },
  segmentItem: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8 },
  segmentActive: { backgroundColor: colors.border },
  segmentText: { color: colors.muted, fontWeight: '600', textTransform: 'capitalize' },
  error: { color: colors.danger },
  hint: { color: colors.muted, fontSize: 14, lineHeight: 20 },
});
