import type { DocumentDetectionResult, TextLine } from 'expo-smart-scan';
import { useState } from 'react';
import { Image, StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { colors } from './theme';

interface Props {
  uri: string;
  aspectRatio: number;
  lines: readonly TextLine[];
  document: DocumentDetectionResult | null;
}

/** Draws OCR boxes over the image. Coordinates are normalized, so only the width matters. */
export function OcrOverlay({ uri, aspectRatio, lines, document }: Props) {
  const [width, setWidth] = useState(0);
  const height = width / aspectRatio;
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const quad = document?.quad;
  const docBox = quad && {
    left: Math.min(quad.topLeft.x, quad.bottomLeft.x) * width,
    top: Math.min(quad.topLeft.y, quad.topRight.y) * height,
    width:
      (Math.max(quad.topRight.x, quad.bottomRight.x) -
        Math.min(quad.topLeft.x, quad.bottomLeft.x)) *
      width,
    height:
      (Math.max(quad.bottomLeft.y, quad.bottomRight.y) -
        Math.min(quad.topLeft.y, quad.topRight.y)) *
      height,
  };

  return (
    <View style={[styles.frame, { aspectRatio }]} onLayout={onLayout}>
      <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="contain" />
      {docBox && <View pointerEvents="none" style={[styles.document, docBox]} />}
      {width > 0 &&
        lines.map((line, i) => (
          <View
            key={i}
            pointerEvents="none"
            style={[
              styles.box,
              {
                left: line.box.x * width,
                top: line.box.y * height,
                width: line.box.width * width,
                height: line.box.height * height,
                opacity: 0.35 + 0.65 * line.confidence,
              },
            ]}
          />
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  // Height-bound so the results stay above the fold; width follows the aspect ratio.
  frame: {
    height: 380,
    maxWidth: '100%',
    alignSelf: 'center',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  box: {
    position: 'absolute',
    borderWidth: 1.5,
    borderColor: colors.accent,
    backgroundColor: 'rgba(56, 189, 248, 0.08)',
    borderRadius: 3,
  },
  document: {
    position: 'absolute',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.success,
    borderRadius: 4,
  },
});
