/** Two-sided 97.5% Student t quantiles for small degrees of freedom (95% interval). */
const T975 = [NaN, 12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228]

/**
 * Least-squares line through (x, y) with the standard error of its slope.
 * @param {!Array<number>} xs
 * @param {!Array<number>} ys
 * @return {{slope: number, standardError: number, lowerBound: number, points: number}}
 *   `lowerBound` is the lower end of the 95% confidence interval of the slope.
 */
export function fitSlope (xs, ys) {
  const n = xs.length
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  const sxx = xs.reduce((s, x) => s + (x - mx) ** 2, 0)
  const slope = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / sxx
  const intercept = my - slope * mx
  const residual = ys.reduce((s, y, i) => s + (y - (intercept + slope * xs[i])) ** 2, 0)
  const degrees = n - 2
  const standardError = degrees > 0 ? Math.sqrt(residual / degrees / sxx) : Infinity
  const quantile = T975[Math.min(degrees, T975.length - 1)] ?? 1.96
  return { slope, standardError, lowerBound: slope - quantile * standardError, points: n }
}
