/**
 * merma.js — Reporte de merma (consumo teórico vs real) por insumo.
 *
 * Idea: comparar lo que las recetas dicen que DEBISTE consumir según lo vendido
 * (consumo teórico) contra lo que REALMENTE saliste del inventario
 * (inv inicial + compras − inv final). La diferencia es merma: desperdicio,
 * robo, mal porcionado o error de conteo.
 *
 *   merma_qty   = consumo_real − consumo_teorico   (en unidades del insumo)
 *   merma_valor = merma_qty × avg_cost             (neto, sin IVA)
 *
 * merma positiva  → consumiste MÁS de lo que la receta predice (desperdicio/robo)
 * merma negativa  → consumiste MENOS (receta exagerada, sub-conteo, o no calza nombre)
 *
 * Espejo de foodcost.js: usa los dos conteos `cierre_mes` que enmarcan el mes.
 */

// Normaliza nombres para cruzar ventas (nombre Justo) con products.name
function normalize(s) {
  return (s || '')
    .toString()
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // saca acentos
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Suma `qty` de un insumo a un mapa, explotando sub-recetas a ingredientes base.
 * Si el insumo es preparado (aparece en insumo_recipes), se reemplaza por sus
 * ingredientes; si no, se acumula tal cual. `depth` evita ciclos infinitos.
 *
 * Se usa en AMBOS lados para que todo se compare al nivel de ingrediente base:
 *  - teórico: receta → (blend) → cortes + grasa
 *  - real:    lo que cuentas como "blend" cuenta como cortes + grasa
 * Así, comprar cortes + contar blend cuadra solo (el blend es solo cortes molidos).
 */
function addExploded(map, insumoId, qty, subMap, depth = 0) {
  if (depth > 6) { // tope de seguridad ante recetas circulares
    map[insumoId] = (map[insumoId] || 0) + qty
    return
  }
  const sub = subMap[insumoId]
  if (sub && sub.length > 0) {
    for (const sr of sub) {
      addExploded(map, sr.ingredient_id, qty * parseFloat(sr.quantity), subMap, depth + 1)
    }
  } else {
    map[insumoId] = (map[insumoId] || 0) + qty
  }
}

/**
 * getMermaForMonth(locId, year, month, supabase)
 *
 * Retorna:
 *   { ok: true, desde, hasta,
 *     insumos: [{ insumo_id, name, unit, real, teorico, merma_qty, merma_valor, merma_pct }],
 *     totalTeoricoValor, totalRealValor, totalMermaValor,
 *     ventasNetas, mermaPctVentas, mermaPctTeorico,
 *     coberturaPct, unidadesVendidas, unidadesCubiertas, productosSinReceta }
 *   { ok: false, error }
 */
export async function getMermaForMonth(locId, year, month, supabase) {
  if (!locId) return { ok: false, error: 'Local no definido.' }

  // ── 1. Conteos que enmarcan el mes (ventana ±1 mes, igual que foodcost) ────
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
    return { ok: false, error: 'Necesitas 2 conteos de cierre de mes que enmarquen este período.' }
  }
  const countInicial = counts[0]
  const countFinal   = counts[counts.length - 1]

  // ── 2. Consumo real por insumo: inv inicial + compras − inv final ──────────
  const [{ data: itemsFinal }, { data: itemsInicial }, { data: comprasItems }, { data: subRecetas }] =
    await Promise.all([
      supabase.from('inventory_count_items').select('quantity, insumo_id').eq('count_id', countFinal.id),
      supabase.from('inventory_count_items').select('quantity, insumo_id').eq('count_id', countInicial.id),
      supabase.from('purchase_items')
        .select('insumo_id, quantity, purchases!inner(location_id, date)')
        .eq('purchases.location_id', locId)
        .gte('purchases.date', countInicial.date)
        .lte('purchases.date', countFinal.date),
      supabase.from('insumo_recipes').select('insumo_id, ingredient_id, quantity'),
    ])

  // Sub-recetas agrupadas por insumo preparado (ej: Blend → cortes + grasa)
  const subMap = {}
  for (const sr of (subRecetas || [])) {
    if (!subMap[sr.insumo_id]) subMap[sr.insumo_id] = []
    subMap[sr.insumo_id].push(sr)
  }

  // Real, explotando preparados a base: lo que cuentas como "blend" cuenta como
  // cortes + grasa, igual que el teórico → comprar cortes y contar blend cuadra.
  const real = {} // insumo_id (base) → unidades consumidas realmente
  for (const it of (itemsInicial || [])) addExploded(real, it.insumo_id, +parseFloat(it.quantity), subMap)
  for (const it of (comprasItems || [])) addExploded(real, it.insumo_id, +parseFloat(it.quantity), subMap)
  for (const it of (itemsFinal   || [])) addExploded(real, it.insumo_id, -parseFloat(it.quantity), subMap)

  // ── 3. Ventas del período: unidades vendidas por producto ──────────────────
  const { data: ventaProductos } = await supabase
    .from('sales_top_products')
    .select('product_name, units_sold, sales_periods!inner(location_id, period_start, period_end)')
    .eq('sales_periods.location_id', locId)
    .gte('sales_periods.period_start', countInicial.date)
    .lte('sales_periods.period_end', countFinal.date)

  const unidadesPorProducto = {} // nombre normalizado → unidades
  let unidadesVendidas = 0
  for (const vp of (ventaProductos || [])) {
    const key = normalize(vp.product_name)
    unidadesPorProducto[key] = (unidadesPorProducto[key] || 0) + (vp.units_sold || 0)
    unidadesVendidas += vp.units_sold || 0
  }

  const { data: ventasData } = await supabase
    .from('sales_periods')
    .select('total_sales')
    .eq('location_id', locId)
    .gte('period_start', countInicial.date)
    .lte('period_end', countFinal.date)
  const ventasNetas = (ventasData || []).reduce((s, v) => s + parseFloat(v.total_sales), 0) / 1.19

  // ── 4. Recetas + productos para el consumo teórico ─────────────────────────
  const [{ data: products }, { data: recipes }, { data: insumos }, { data: costs }] =
    await Promise.all([
      supabase.from('products').select('id, name').eq('active', true),
      supabase.from('recipes').select('product_id, insumo_id, quantity'),
      supabase.from('insumos').select('id, name, unit'),
      supabase.from('insumo_costs').select('insumo_id, avg_cost').eq('location_id', locId),
    ])

  // Mapa nombre normalizado → product_id
  const nombreAProductId = {}
  for (const p of (products || [])) nombreAProductId[normalize(p.name)] = p.id

  // Recetas agrupadas por producto
  const recetasPorProducto = {}
  for (const r of (recipes || [])) {
    if (!recetasPorProducto[r.product_id]) recetasPorProducto[r.product_id] = []
    recetasPorProducto[r.product_id].push(r)
  }

  // ── 5. Consumo teórico + cobertura ─────────────────────────────────────────
  const teorico = {} // insumo_id → unidades que debiste consumir
  let unidadesCubiertas = 0
  const productosSinReceta = [] // { name, units } no calzaron o no tienen receta

  for (const [nombreNorm, unidades] of Object.entries(unidadesPorProducto)) {
    const productId = nombreAProductId[nombreNorm]
    const receta = productId ? recetasPorProducto[productId] : null
    if (!receta || receta.length === 0) {
      productosSinReceta.push({ name: nombreNorm, units: unidades })
      continue
    }
    unidadesCubiertas += unidades
    for (const r of receta) {
      addExploded(teorico, r.insumo_id, unidades * parseFloat(r.quantity), subMap)
    }
  }

  // ── 6. Armar tabla por insumo (unión de real ∪ teórico) ────────────────────
  const insumoMap = Object.fromEntries((insumos || []).map(i => [i.id, i]))
  const costMap   = Object.fromEntries((costs || []).map(c => [c.insumo_id, parseFloat(c.avg_cost) || 0]))

  const todosIds = [...new Set([...Object.keys(real), ...Object.keys(teorico)])]
  const filas = todosIds.map(id => {
    const realQty    = real[id] || 0
    const teoricoQty = teorico[id] || 0
    const mermaQty   = realQty - teoricoQty
    const avgCost    = costMap[id] || 0
    return {
      insumo_id:   id,
      name:        insumoMap[id]?.name || '(insumo desconocido)',
      unit:        insumoMap[id]?.unit || '',
      real:        realQty,
      teorico:     teoricoQty,
      merma_qty:   mermaQty,
      merma_valor: mermaQty * avgCost,
      merma_pct:   teoricoQty > 0 ? (mermaQty / teoricoQty) * 100 : null,
    }
  })

  // Sin teórico (ninguna receta lo usa) → no es merma medible. Va a una lista
  // aparte: consumo directo (ej: mantequilla a ojo) o receta faltante.
  const insumosMerma = filas
    .filter(f => f.teorico > 0)
    .sort((a, b) => Math.abs(b.merma_valor) - Math.abs(a.merma_valor))
  const consumoDirecto = filas
    .filter(f => f.teorico === 0 && f.real !== 0)
    .map(f => ({ insumo_id: f.insumo_id, name: f.name, unit: f.unit, real: f.real, valor: f.merma_valor }))
    .sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor))

  // Totales solo sobre lo medible (teórico > 0)
  const totalTeoricoValor = insumosMerma.reduce((s, f) => s + f.teorico * (costMap[f.insumo_id] || 0), 0)
  const totalRealValor    = insumosMerma.reduce((s, f) => s + f.real    * (costMap[f.insumo_id] || 0), 0)
  const totalMermaValor   = totalRealValor - totalTeoricoValor
  const consumoDirectoValor = consumoDirecto.reduce((s, f) => s + f.valor, 0)

  return {
    ok: true,
    desde: countInicial.date,
    hasta: countFinal.date,
    insumos: insumosMerma,
    consumoDirecto,
    consumoDirectoValor,
    totalTeoricoValor,
    totalRealValor,
    totalMermaValor,
    ventasNetas,
    mermaPctVentas:  ventasNetas > 0 ? (totalMermaValor / ventasNetas) * 100 : null,
    mermaPctTeorico: totalTeoricoValor > 0 ? (totalMermaValor / totalTeoricoValor) * 100 : null,
    coberturaPct:    unidadesVendidas > 0 ? (unidadesCubiertas / unidadesVendidas) * 100 : 0,
    unidadesVendidas,
    unidadesCubiertas,
    productosSinReceta: productosSinReceta.sort((a, b) => b.units - a.units),
  }
}
