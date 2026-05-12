/**
 * _calcularDesdeConteos(countInicial, countFinal, locId, supabase)
 *
 * Núcleo del cálculo: recibe los dos conteos ya resueltos y hace las queries
 * de compras y ventas. Usado por getFoodCost y getFoodCostForMonth.
 */
async function _calcularDesdeConteos(countInicial, countFinal, locId, supabase) {
  const [{ data: itemsFinal }, { data: itemsInicial }] = await Promise.all([
    supabase.from('inventory_count_items').select('quantity, insumos(avg_cost)').eq('count_id', countFinal.id),
    supabase.from('inventory_count_items').select('quantity, insumos(avg_cost)').eq('count_id', countInicial.id),
  ])

  const invFinal   = (itemsFinal   || []).reduce((s, i) => s + i.quantity * (i.insumos?.avg_cost || 0), 0)
  const invInicial = (itemsInicial || []).reduce((s, i) => s + i.quantity * (i.insumos?.avg_cost || 0), 0)

  const { data: comprasData } = await supabase
    .from('purchases')
    .select('total')
    .eq('location_id', locId)
    .gte('date', countInicial.date)
    .lte('date', countFinal.date)

  const totalCompras = (comprasData || []).reduce((s, c) => s + parseFloat(c.total), 0)

  const { data: ventasData } = await supabase
    .from('sales_periods')
    .select('total_sales')
    .eq('location_id', locId)
    .gte('period_start', countInicial.date)
    .lte('period_end',   countFinal.date)

  const ventasNetas = (ventasData || []).reduce((s, v) => s + parseFloat(v.total_sales), 0) / 1.19

  if (ventasNetas === 0) {
    return { ok: false, error: 'Sin ventas registradas en el período entre los dos conteos.' }
  }

  const costoMercaderia = invInicial + totalCompras - invFinal
  const value           = (costoMercaderia / ventasNetas) * 100

  return {
    ok: true,
    value,
    invInicial,
    compras: totalCompras,
    invFinal,
    ventasNetas,
    costoMercaderia,
    desde: countInicial.date,
    hasta: countFinal.date,
  }
}

/**
 * getFoodCost(locId, supabase)
 *
 * Calcula el Food Cost usando los dos conteos de cierre de mes más recientes
 * del local. Usado en el home dashboard.
 *
 * Retorna:
 *   { ok: true,  value, invInicial, compras, invFinal, ventasNetas, costoMercaderia, desde, hasta }
 *   { ok: false, error: string }
 */
export async function getFoodCost(locId, supabase) {
  if (!locId) return { ok: false, error: 'Local no definido.' }

  const { data: counts } = await supabase
    .from('inventory_counts')
    .select('id, date')
    .eq('location_id', locId)
    .eq('count_type', 'cierre_mes')
    .order('date', { ascending: false })
    .limit(2)

  if (!counts || counts.length < 2) {
    return { ok: false, error: 'Necesitas al menos 2 conteos de cierre de mes.' }
  }

  return _calcularDesdeConteos(counts[1], counts[0], locId, supabase)
}

/**
 * getFoodCostForMonth(locId, year, month, supabase)
 *
 * Calcula el Food Cost para un mes calendario específico buscando los conteos
 * de cierre de mes que delimitan ese mes (uno antes/en el mes, otro al final/después).
 *
 * Busca en una ventana de ±1 mes, toma el más antiguo como inicial
 * y el más reciente como final.
 *
 * Retorna igual que getFoodCost.
 */
export async function getFoodCostForMonth(locId, year, month, supabase) {
  if (!locId) return { ok: false, error: 'Local no definido.' }

  // Ventana: desde el 1 del mes anterior hasta el último día del mes siguiente
  const prevYear  = month === 1  ? year - 1 : year
  const prevMonth = month === 1  ? 12       : month - 1
  const nextYear  = month === 12 ? year + 1 : year
  const nextMonth = month === 12 ? 1        : month + 1
  const lastDayNext = new Date(nextYear, nextMonth, 0).getDate()

  const windowStart = `${prevYear}-${String(prevMonth).padStart(2, '0')}-01`
  const windowEnd   = `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(lastDayNext).padStart(2, '0')}`

  const { data: counts } = await supabase
    .from('inventory_counts')
    .select('id, date')
    .eq('location_id', locId)
    .eq('count_type', 'cierre_mes')
    .gte('date', windowStart)
    .lte('date', windowEnd)
    .order('date', { ascending: true })

  if (!counts || counts.length < 2) {
    return { ok: false, error: 'No hay conteos de cierre de mes para este período.' }
  }

  const countInicial = counts[0]
  const countFinal   = counts[counts.length - 1]

  return _calcularDesdeConteos(countInicial, countFinal, locId, supabase)
}
