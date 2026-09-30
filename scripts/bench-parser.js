// Times parseReceipt on the sample receipt's text. Run with `npm run bench`.
const { performance } = require('node:perf_hooks');

const { parseReceipt } = require('../.bench/parser');

const LINES = [
  'HARBOR STREET COFFEE',
  '112 Harbor St, Portland OR',
  'Tel (503) 555-0142',
  '03/14/2026  08:41 AM',
  'Order #4471  Server: Maya',
  'Oat Latte  5.25',
  '2 x Butter Croissant  7.00',
  'Drip Coffee 12oz  3.10',
  'Blueberry Muffin  3.75',
  'Loyalty Discount  1.00-',
  'Subtotal  18.10',
  'Sales Tax 8.5%  1.54',
  'TOTAL  $19.64',
  'VISA ****4412  19.64',
  'Thank you - see you soon!',
];

const WARMUP = 500;
const RUNS = 5000;

for (let i = 0; i < WARMUP; i++) parseReceipt(LINES);

const samples = [];
for (let i = 0; i < RUNS; i++) {
  const start = performance.now();
  parseReceipt(LINES);
  samples.push(performance.now() - start);
}
samples.sort((a, b) => a - b);
const pct = (p) => samples[Math.floor((samples.length - 1) * p)].toFixed(3);

console.log(`parseReceipt x${RUNS} (${LINES.length} lines), node ${process.version}`);
console.log(`median ${pct(0.5)} ms   p95 ${pct(0.95)} ms   p99 ${pct(0.99)} ms`);
console.log(JSON.stringify(parseReceipt(LINES)));
