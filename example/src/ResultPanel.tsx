import type { ReceiptExtractionResult } from 'expo-smart-scan';
import { StyleSheet, Text, View } from 'react-native';

import { colors, mono } from './theme';

const ENGINE_LABEL: Record<ReceiptExtractionResult['engine'], string> = {
  'foundation-models': 'Foundation Models',
  heuristic: 'Heuristic parser',
};

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, tone ? { color: tone } : null]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

export function ResultPanel({ result }: { result: ReceiptExtractionResult }) {
  const { receipt } = result;
  const money = (n: number | null) =>
    n === null ? '-' : `${n.toFixed(2)}${receipt.currency ? ` ${receipt.currency}` : ''}`;

  return (
    <View style={styles.container}>
      <View style={styles.stats}>
        <Stat
          label="Engine"
          value={ENGINE_LABEL[result.engine]}
          tone={result.engine === 'foundation-models' ? colors.success : colors.accent}
        />
        <Stat label="Total time" value={`${result.durationMs} ms`} />
        <Stat label="OCR" value={`${result.ocrDurationMs} ms`} />
        <Stat label="Lines" value={String(result.lines.length)} />
      </View>

      {result.fallbackReason && (
        <Text style={styles.note}>Fallback reason: {result.fallbackReason}</Text>
      )}
      {result.warnings.map((w) => (
        <Text key={w} style={[styles.note, { color: colors.warning }]}>
          {w}
        </Text>
      ))}

      <View style={styles.card}>
        <Text style={styles.merchant}>{receipt.merchant ?? 'Unknown merchant'}</Text>
        <Text style={styles.meta}>{receipt.date ?? 'No date'}</Text>
        {receipt.lineItems.map((item, i) => (
          <View key={i} style={styles.itemRow}>
            <Text style={styles.item} numberOfLines={1}>
              {item.quantity && item.quantity > 1 ? `${item.quantity} x ` : ''}
              {item.description}
            </Text>
            <Text style={styles.amount}>{item.amount.toFixed(2)}</Text>
          </View>
        ))}
        <View style={styles.divider} />
        <View style={styles.itemRow}>
          <Text style={styles.meta}>Tax</Text>
          <Text style={styles.meta}>{money(receipt.tax)}</Text>
        </View>
        <View style={styles.itemRow}>
          <Text style={styles.total}>Total</Text>
          <Text style={styles.total}>{money(receipt.total)}</Text>
        </View>
      </View>

      <Text style={styles.section}>receipt JSON</Text>
      <Text style={styles.json} selectable>
        {JSON.stringify(receipt, null, 2)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stat: {
    flexGrow: 1,
    flexBasis: '45%',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  statLabel: { color: colors.muted, fontSize: 12 },
  statValue: { color: colors.text, fontSize: 16, fontWeight: '600', marginTop: 2 },
  note: { color: colors.muted, fontSize: 13 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    gap: 6,
  },
  merchant: { color: colors.text, fontSize: 18, fontWeight: '700' },
  meta: { color: colors.muted, fontSize: 14 },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  item: { color: colors.text, fontSize: 15, flexShrink: 1 },
  amount: { color: colors.text, fontSize: 15, fontFamily: mono },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: 4 },
  total: { color: colors.text, fontSize: 17, fontWeight: '700' },
  section: { color: colors.muted, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 },
  json: {
    color: colors.text,
    fontFamily: mono,
    fontSize: 12,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 12,
  },
});
