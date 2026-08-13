// Proyección de ventas por descomposición estacional (tendencia × índice de mes).
//
// Entrada: array de períodos { year, month, sales, source } de UN local.
// Salida: índice estacional por mes, nivel de tendencia, banda de rango,
//         ajuste in-sample (para ver qué tan bien pega) y proyección a futuro.
//
// Limpieza automática antes de calcular la estacionalidad:
//   - se excluye el mes de apertura (primer dato, viene a media máquina),
//   - se excluye 'fudo_parcial' (mes cortado por el cambio de sistema),
//   - se excluyen outliers > 1,6× la mediana (ej: evento del foodtruck),
//   - los meses sin dato limpio se interpolan de sus vecinos.

const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0
const median = a => {
  if (!a.length) return 0
  const s = [...a].sort((x, y) => x - y)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
const stddev = a => {
  if (a.length < 2) return 0
  const m = mean(a)
  return Math.sqrt(mean(a.map(x => (x - m) ** 2)))
}
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const keyOf = (y, m) => y * 12 + (m - 1)

export function computeProjection(periods, { horizon = 12 } = {}) {
  const orden = [...periods].sort((a, b) => keyOf(a.year, a.month) - keyOf(b.year, b.month))
  if (orden.length < 6) return null   // muy pocos datos para estacionalidad

  const excluded = []

  // 1. Fuera los meses parciales (cortados por el cambio de sistema)
  const noPartial = orden.filter(p => {
    if (p.source === 'fudo_parcial') { excluded.push({ ...p, motivo: 'parcial' }); return false }
    return true
  })

  // 2. Fuera la rampa de apertura: meses iniciales consecutivos bajo el 70% de la
  //    mediana (recién abriendo, no representan la operación en régimen)
  const med = median(noPartial.map(p => p.sales))
  let i = 0
  while (i < noPartial.length && med > 0 && noPartial[i].sales < 0.7 * med) {
    excluded.push({ ...noPartial[i], motivo: 'apertura' }); i++
  }
  const sinRamp = noPartial.slice(i)

  // 3. Outliers (eventos): ventas > 1,6× la mediana
  const umbral = med * 1.6
  const limpio = sinRamp.filter(p => {
    if (med > 0 && p.sales > umbral) { excluded.push({ ...p, motivo: 'evento/outlier' }); return false }
    return true
  })
  if (limpio.length < 6) return null

  const overallMean = mean(limpio.map(p => p.sales))

  // 3. Índice estacional crudo = promedio del mes / promedio general
  const interpolatedMonths = []
  const rawIndex = {}
  for (let m = 1; m <= 12; m++) {
    const vals = limpio.filter(p => p.month === m).map(p => p.sales)
    rawIndex[m] = vals.length ? mean(vals) / overallMean : null
  }
  // Interpolar meses sin dato limpio desde el vecino más cercano (circular)
  for (let m = 1; m <= 12; m++) {
    if (rawIndex[m] != null) continue
    interpolatedMonths.push(m)
    let prev = null, next = null
    for (let d = 1; d <= 6; d++) {
      const pm = ((m - 1 - d + 12) % 12) + 1
      const nm = ((m - 1 + d) % 12) + 1
      if (prev == null && rawIndex[pm] != null) prev = rawIndex[pm]
      if (next == null && rawIndex[nm] != null) next = rawIndex[nm]
    }
    rawIndex[m] = mean([prev, next].filter(v => v != null)) || 1
  }
  // Normalizar para que el promedio de los 12 índices sea 1
  const avgIndex = mean(Object.values(rawIndex))
  const index = {}
  for (let m = 1; m <= 12; m++) index[m] = rawIndex[m] / (avgIndex || 1)

  // 4. Nivel de tendencia = promedio desestacionalizado de los últimos ≤12 meses limpios
  const desdeReciente = [...limpio].sort((a, b) => keyOf(b.year, b.month) - keyOf(a.year, a.month))
  const ult = desdeReciente.slice(0, 12)
  const baseLevel = mean(ult.map(p => p.sales / index[p.month]))

  // 5. Banda de rango = dispersión de los residuos (real vs esperado)
  const residuos = limpio.map(p => {
    const esperado = baseLevel * index[p.month]
    return esperado > 0 ? (p.sales - esperado) / esperado : 0
  })
  // Piso de ±10%: con ~1,5-2 años de datos el modelo se sobreajusta y los
  // residuos in-sample subestiman el error real. ±10% es un mínimo honesto.
  const bandPct = clamp(stddev(residuos), 0.10, 0.30)

  // 6. Ajuste in-sample de los últimos 6 meses (para mostrar qué tan bien pega)
  const fit = orden.slice(-6).map(p => ({
    year: p.year, month: p.month, actual: p.sales,
    expected: Math.round(baseLevel * index[p.month]),
    esOutlier: excluded.some(e => e.year === p.year && e.month === p.month),
    esParcial: p.source === 'fudo_parcial',
  }))

  // 7. Proyección: desde el mes siguiente al último dato real
  const last = orden[orden.length - 1]
  const forecast = []
  for (let i = 1; i <= horizon; i++) {
    const k = keyOf(last.year, last.month) + i
    const year = Math.floor(k / 12)
    const month = (k % 12) + 1
    const expected = Math.round(baseLevel * index[month])
    forecast.push({
      year, month, expected,
      low: Math.round(expected * (1 - bandPct)),
      high: Math.round(expected * (1 + bandPct)),
    })
  }

  return {
    index, baseLevel: Math.round(baseLevel), bandPct,
    monthsUsed: limpio.length, excluded, interpolatedMonths,
    fit, forecast,
  }
}

export const MESES_CORTO = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
