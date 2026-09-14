/**
 * Forecast accuracy metrics (spec §34).
 *
 * Pure functions over predicted-vs-actual pairs — no I/O, and no invented
 * numbers: every metric the UI shows is computed from rows where the predicted
 * hour has actually passed and an actual reading exists.
 */

export interface ForecastPair {
  timestamp: string;
  predicted: number;
  actual: number;
}

export interface AccuracyMetrics {
  /** Mean Absolute Error, in kWh. */
  mae: number;
  /** Root Mean Squared Error, in kWh (punishes large misses). */
  rmse: number;
  /**
   * Mean Absolute Percentage Error, in %. Hours where the actual value is 0
   * (solar at night) are excluded — percentage error is undefined there —
   * so `samples` can exceed the MAPE sample count.
   */
  mape: number;
  /** Number of evaluated hours (pairs with an actual value). */
  samples: number;
}

function roundMetrics(metrics: AccuracyMetrics): AccuracyMetrics {
  return {
    mae: Math.round(metrics.mae * 1000) / 1000,
    rmse: Math.round(metrics.rmse * 1000) / 1000,
    mape: Math.round(metrics.mape * 10) / 10,
    samples: metrics.samples,
  };
}

/** Computes MAE / RMSE / MAPE over the given predicted-vs-actual pairs. */
export function computeAccuracy(pairs: ForecastPair[]): AccuracyMetrics {
  if (pairs.length === 0) {
    return { mae: 0, rmse: 0, mape: 0, samples: 0 };
  }

  let absSum = 0;
  let sqSum = 0;
  let pctSum = 0;
  let pctSamples = 0;

  for (const { predicted, actual } of pairs) {
    const error = predicted - actual;
    absSum += Math.abs(error);
    sqSum += error * error;
    if (actual !== 0) {
      pctSum += (Math.abs(error) / actual) * 100;
      pctSamples += 1;
    }
  }

  const n = pairs.length;
  return roundMetrics({
    mae: absSum / n,
    rmse: Math.sqrt(sqSum / n),
    mape: pctSamples > 0 ? pctSum / pctSamples : 0,
    samples: n,
  });
}

export type AccuracyGrade = "excellent" | "good" | "fair" | "poor";

/**
 * Labels a MAPE reading. Display-only convenience — thresholds are
 * conventional for hourly energy forecasting, not spec-mandated.
 */
export function gradeAccuracy(mape: number, samples: number): AccuracyGrade {
  if (samples === 0) return "poor";
  if (mape <= 10) return "excellent";
  if (mape <= 20) return "good";
  if (mape <= 35) return "fair";
  return "poor";
}
