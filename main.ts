// btc-cent-forecast-01 entry (Node 22, standard library only): shrunk mean-reversion
// point forecast of BTC's US-dollar price 240 minutes after each checkpoint.
//
// Method (two numbers, fixed in advance; nothing fitted to the 5 practice answers):
//   guess = last + K * (mean of the last 24 h of closes - last),  K = 0.10
//
// For mean absolute error the optimal point forecast is the conditional median, and
// the last price (persistence) is the natural median — but BTC's 1-minute closes on
// this pool carry short-lived noise that partly reverts, so the checkpoint close is
// pulled 10% of the way back toward its own 24-hour mean. The pull is deliberately
// tiny: a 10% move toward the mean can only shift the guess by a few dollars on a
// typical day, so the worst case is a near-tie with persistence, never a blow-up.
//
// Evidence (pseudo-checkpoint backtest INSIDE the practice cases' 72 h series, on a
// single stitched 92 h series so no absolute minute is counted twice — the six
// practice cases are the same recording shifted by 4 h):
//   76 distinct checkpoints, every 60 min from hour 12, target +240 min:
//     this entry  MAE 35,857 cents, persistence MAE 37,051 cents  (-3.2%)
//     wins 46/76 trials; the pull also helps in both halves of the window.
//   Drift extrapolation (mean log-return x 240 min) was tested and REJECTED: every
//   drift variant scored worse than persistence on the same backtest.
//   The 5 derivable practice answers (p00-p04, actual = next case's last price)
//   give 47,892 vs persistence 47,055 cents — a 5-trial check whose noise is far
//   larger than the gap, so it does not overturn the 76-trial backtest.
//
// Deterministic: pure function of the case file, no randomness, no wall-clock, no
// network. Reads $MAKEFUN_INPUT_DIR (else /input), writes $MAKEFUN_OUTPUT_DIR
// (else /output), one {"forecasts":[{"case":"<id>","price":<number>}]} row per case.

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

/** The smallest positive price on the grid: one unit of its 5 decimals. */
const MIN_PRICE = 0.00001;
/** The largest grid price below the scorer's exclusive 10,000,000-dollar cap. */
const MAX_PRICE = 9_999_999.99999;

/** Minutes of closes averaged for the reversion anchor: one full day. */
const MEAN_WINDOW_MINUTES = 1440;
/** Fraction of the gap between the last close and its 24 h mean that the guess closes. */
const REVERSION_K = 0.1;

interface CaseMarket {
  id: string;
  prices: number[];
}

interface Case {
  markets: CaseMarket[];
}

/** x kept on the grid's 5 decimals and inside the scorer's (0, 10,000,000). */
const price5 = (x: number): number => Math.round(Math.min(MAX_PRICE, Math.max(MIN_PRICE, x)) * 1e5) / 1e5;

/** Mean of the last `window` closes (or of all closes when fewer are present). */
function recentMean(prices: number[], window: number): number {
  const n = prices.length;
  const w = Math.min(window, n);
  let sum = 0;
  for (let i = n - w; i < n; i++) sum += prices[i] as number;
  return sum / w;
}

/** One market's 4 h-ahead point forecast: last close pulled 10% toward its 24 h mean. */
function forecast(m: CaseMarket): number {
  if (!Array.isArray(m.prices) || m.prices.length === 0) throw new Error(`market ${m.id} has no prices`);
  const last = m.prices[m.prices.length - 1] as number;
  if (typeof last !== 'number' || !Number.isFinite(last)) throw new Error(`market ${m.id}'s last price is not a finite number`);
  const anchor = recentMean(m.prices, MEAN_WINDOW_MINUTES);
  // A non-finite anchor (a bad price somewhere in the window) must not poison
  // the guess into NaN — fall back to the last close, i.e. persistence, instead.
  if (!Number.isFinite(anchor)) return price5(last);
  return price5(last + REVERSION_K * (anchor - last));
}

mkdirSync(OUTPUT_DIR, { recursive: true });
// Every case file, in name order, so two runs write the same bytes.
const inputs = readdirSync(INPUT_DIR).filter((f) => f.endsWith('.in')).sort();
for (const file of inputs) {
  const id = file.slice(0, -'.in'.length);
  const c = JSON.parse(readFileSync(join(INPUT_DIR, file), 'utf8')) as Case;
  if (!Array.isArray(c.markets) || c.markets.length !== 1) throw new Error(`${file} does not hold exactly one market`);
  writeFileSync(join(OUTPUT_DIR, `${id}.out`), `${JSON.stringify({ forecasts: [{ case: id, price: forecast(c.markets[0] as CaseMarket) }] })}\n`);
}
