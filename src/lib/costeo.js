/**
 * costeo.js — cálculo de costos de insumos para Costeo y Recetas.
 *
 * Fuente de verdad única para ambas pestañas:
 *   - El costo de un insumo "base" es el promedio ponderado de sus ÚLTIMAS 5 compras
 *     en el local seleccionado. Si no tiene compras en ese local, cae al promedio
 *     global (últimas 5 de cualquier local) para no quedar en $0.
 *   - El costo de una sub-receta (insumo preparado: blend, salsas caseras) se ARMA
 *     desde sus ingredientes, nunca desde una compra directa. Soporta anidación
 *     (ej: Goma dentro de Salsa Big Mc).
 */

/** Promedio ponderado del costo unitario a partir de ítems de compra. */
function avgUltimas5(items) {
  if (!items || items.length === 0) return { cost: 0, hasPurchases: false }
  const totalQty   = items.reduce((s, i) => s + parseFloat(i.quantity), 0)
  const totalCosto = items.reduce((s, i) => s + parseFloat(i.quantity) * parseFloat(i.unit_price), 0)
  return { cost: totalQty > 0 ? totalCosto / totalQty : 0, hasPurchases: true }
}

/**
 * Construye un resolvedor de costos con memoización y soporte de anidación.
 * Retorna una función resolve(insumoId) → { cost, incompleto }.
 *  - incompleto = true si el insumo (o alguno de sus ingredientes) no tiene compras.
 *
 * Para insumos preparados (blend, salsas) considera AMBAS formas de ingreso:
 *   1. Si la sub-receta está completa (todos sus cortes/ingredientes tienen compras),
 *      usa ese costo armado desde los ingredientes.
 *   2. Si la sub-receta está incompleta pero el insumo tiene compras directas
 *      (ej: el blend cargado entero), usa esas compras directas.
 * Así la transición "blend entero → por corte" nunca rompe el costeo.
 */
function buildResolver(costosBase, subMap, baseMeta) {
  const cache = {}

  function resolve(id, stack = new Set()) {
    if (cache[id]) return cache[id]
    if (stack.has(id)) {
      // Ciclo en las sub-recetas: cortar para no caer en loop infinito.
      const r = { cost: 0, incompleto: true }
      cache[id] = r
      return r
    }

    let res
    if (subMap[id]) {
      // Es sub-receta: costo = suma de sus ingredientes.
      stack.add(id)
      let cost = 0
      let incompleto = false
      for (const sr of subMap[id]) {
        const ing = resolve(sr.ingredient_id, stack)
        cost += parseFloat(sr.quantity) * ing.cost
        if (ing.incompleto) incompleto = true
      }
      stack.delete(id)

      if (incompleto && baseMeta[id]?.hasPurchases) {
        // Cortes incompletos, pero hay compra directa del preparado → usarla.
        res = { cost: costosBase[id] || 0, incompleto: false }
      } else {
        res = { cost, incompleto }
      }
    } else {
      // Insumo base: costo desde compras.
      res = { cost: costosBase[id] || 0, incompleto: !baseMeta[id]?.hasPurchases }
    }

    cache[id] = res
    return res
  }

  return resolve
}

/**
 * getCostosPorInsumo(locationId, supabase)
 *
 * Calcula el costo de todos los insumos referenciados por recetas o sub-recetas.
 *
 * Retorna:
 *   {
 *     costos: { [insumoId]: number },           // costo unitario resuelto
 *     meta:   { [insumoId]: { incompleto, esSubReceta, usedFallback } },
 *   }
 */
export async function getCostosPorInsumo(locationId, supabase) {
  const [{ data: recipes }, { data: subRecetas }] = await Promise.all([
    supabase.from('recipes').select('insumo_id'),
    supabase.from('insumo_recipes').select('insumo_id, ingredient_id, quantity'),
  ])

  // Mapa de sub-recetas: insumo preparado → ingredientes
  const subMap = {}
  ;(subRecetas || []).forEach(sr => {
    if (!subMap[sr.insumo_id]) subMap[sr.insumo_id] = []
    subMap[sr.insumo_id].push(sr)
  })

  // Todos los insumos referenciados (en recetas de productos o en sub-recetas)
  const referenced = new Set()
  ;(recipes || []).forEach(r => referenced.add(r.insumo_id))
  ;(subRecetas || []).forEach(sr => {
    referenced.add(sr.insumo_id)
    referenced.add(sr.ingredient_id)
  })

  // Costo directo (desde compras) de TODOS los insumos referenciados.
  // Incluye los preparados (blend/salsas): si se cargan enteros sirve de fallback
  // cuando la sub-receta por cortes está incompleta.
  const costosBase = {}
  const baseMeta = {}
  for (const id of referenced) {
    const { data: enLocal } = await supabase
      .from('purchase_items')
      .select('unit_price, quantity, purchases!inner(location_id)')
      .eq('insumo_id', id)
      .eq('purchases.location_id', locationId)
      .order('created_at', { ascending: false })
      .limit(5)

    let items = enLocal
    let usedFallback = false
    if (!items || items.length === 0) {
      // Sin compras en este local → usar las últimas 5 de cualquier local
      const { data: global } = await supabase
        .from('purchase_items')
        .select('unit_price, quantity')
        .eq('insumo_id', id)
        .order('created_at', { ascending: false })
        .limit(5)
      items = global
      usedFallback = !!(items && items.length)
    }

    const { cost, hasPurchases } = avgUltimas5(items)
    costosBase[id] = cost
    baseMeta[id] = { hasPurchases, usedFallback }
  }

  // Resolver costos (sub-recetas armadas desde sus ingredientes, con anidación)
  const resolve = buildResolver(costosBase, subMap, baseMeta)

  const costos = {}
  const meta = {}
  for (const id of referenced) {
    const r = resolve(id)
    costos[id] = r.cost
    meta[id] = {
      incompleto:   r.incompleto,
      esSubReceta:  !!subMap[id],
      usedFallback: baseMeta[id]?.usedFallback || false,
    }
  }

  return { costos, meta }
}

/**
 * costoReceta(ingredientes, costos)
 *
 * Costo total de una receta (lista de { insumo_id, quantity }) usando el mapa
 * de costos resueltos. Retorna { costo, incompleto }.
 */
export function costoReceta(ingredientes, costos, meta = {}) {
  let costo = 0
  let incompleto = false
  for (const r of ingredientes || []) {
    costo += parseFloat(r.quantity) * (costos[r.insumo_id] || 0)
    if (meta[r.insumo_id]?.incompleto) incompleto = true
  }
  return { costo, incompleto }
}
