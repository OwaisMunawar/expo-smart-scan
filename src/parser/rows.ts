import type { TextLine } from '../types';

/**
 * Re-assembles visual rows from OCR observations.
 *
 * Vision and ML Kit often return the description and the price of a receipt row as two
 * separate observations, because the dot leaders or whitespace between them look like
 * a column gap. Observations whose vertical centres overlap are merged left to right,
 * separated by two spaces so column boundaries stay visible to the parser.
 */
export function groupIntoRows(lines: readonly TextLine[]): string[] {
  const boxed = lines.filter((l) => l.text.trim().length > 0 && l.box.height > 0);
  if (boxed.length === 0) {
    return [];
  }

  const heights = boxed.map((l) => l.box.height).sort((a, b) => a - b);
  const medianHeight = heights[Math.floor(heights.length / 2)]!;
  const tolerance = medianHeight * 0.5;

  const sorted = [...boxed].sort(
    (a, b) => a.box.y + a.box.height / 2 - (b.box.y + b.box.height / 2)
  );

  const rows: { centre: number; members: TextLine[] }[] = [];
  for (const line of sorted) {
    const centre = line.box.y + line.box.height / 2;
    const row = rows[rows.length - 1];
    if (row && Math.abs(centre - row.centre) <= tolerance) {
      row.members.push(line);
      row.centre =
        row.members.reduce((sum, m) => sum + m.box.y + m.box.height / 2, 0) / row.members.length;
    } else {
      rows.push({ centre, members: [line] });
    }
  }

  return rows.map((row) =>
    row.members
      .sort((a, b) => a.box.x - b.box.x)
      .map((m) => m.text.trim())
      .join('  ')
  );
}
