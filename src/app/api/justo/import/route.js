import { NextResponse } from 'next/server'

const JUSTO_TOKEN = process.env.JUSTO_API_TOKEN
const STORES = {
  SF: 'fosfQ4Myj8YFdz54P',
  LA: 'Rzyd4DNbrRHCwugpY',
}

async function fetchAllTabs(storeId, fromDate, toDate) {
  const tabs = []
  let page = 1
  while (true) {
    const url = `https://api.service.getjusto.com/v3/tabs/${storeId}/tabs?fromDate=${fromDate}&toDate=${toDate}&limit=100&page=${page}&sortBy=createdAt&sortType=asc`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${JUSTO_TOKEN}` },
      cache: 'no-store',
    })
    const json = await res.json()
    if (!json.success) throw new Error(json.error?.message || 'Error al consultar API de Justo')
    tabs.push(...json.data.items)
    if (!json.data.hasNextPage) break
    page++
  }
  return tabs
}

// Costo de packaging por unidad vendida según nombre de producto
function getPackagingPerUnit(productName) {
  const n = productName.toLowerCase().trim()

  // Hamburguesas: caja $198 + papel $50 + papel alum $52 + pocillo $17 + sticker $20 = $337
  if (
    n.includes('burger') || n.includes('bacon') || n === 'big house' ||
    n.includes('oklahoma') || n.includes('hawaiian') || n.includes('sweet berry') ||
    n.includes('cuarto') || n === 'cheese' || n.includes('cheesinillo')
  ) return 337

  // Papitas Solas XL: básica $269 + 2 pocillos $34 = $303
  if (n.includes('solas') && n.includes('xl')) return 303

  // Papitas The House: básica $269 + 2 pocillos $34 = $303
  if (n.includes('the house') && n.includes('papita')) return 303

  // Papitas Solas (regular): básica $269 + 1 pocillo $17 = $286
  if (n.includes('solas')) return 286

  // Papitas básicas sin pocillo (Golden, Bulldog, Chihuahua, cualquier tamaño): $269
  if (n.includes('papita') || n.startsWith('papa')) return 269

  // Chicken Pop / Chicken Pops: bowl kraft $106 + pocillo $17 = $123
  if (n.includes('chicken pop')) return 123

  // Aritos de Cebolla: bowl kraft $106 + pocillo $17 = $123
  if (n.includes('arito') || n.includes('cebolla')) return 123

  // Chicken Fingers: 2 pocillos $34
  if (n.includes('chicken finger')) return 34

  // Bebidas, helados, otros
  return 0
}

function calcularAgregados(tabs, locCode) {
  const activas = tabs.filter(t => !t.cancelledAt && t.closedAt)
  const canceladas = tabs.filter(t => t.cancelledAt)

  // Excluir costo de despacho — es ingreso de Justo/repartidor, no del local
  const foodSales = (tab) => {
    const deliveryFee = (tab.items || [])
      .filter(i => i.type === 'deliveryFee')
      .reduce((s, i) => s + (i.price || 0), 0)
    return (tab.totalPrice || 0) - deliveryFee
  }

  const total_sales = activas.reduce((s, t) => s + foodSales(t), 0)
  const total_orders = activas.length

  // Ventas por plataforma (source: 'justo', 'pedidosya', 'pos')
  const porCanal = {}
  for (const tab of activas) {
    const src = tab.source || 'otros'
    if (!porCanal[src]) porCanal[src] = { sales: 0, orders: 0 }
    porCanal[src].sales += foodSales(tab)
    porCanal[src].orders += 1
  }

  // Delivery = cualquier orden que llegó por delivery (justo + pedidosya con deliveryType delivery)
  const deliveryTabs = activas.filter(t => t.deliveryType === 'delivery')
  const delivery_sales = deliveryTabs.reduce((s, t) => s + foodSales(t), 0)
  const delivery_orders = deliveryTabs.length

  const presencialData = porCanal['pos'] || { sales: 0, orders: 0 }

  // Ventas por día (para mejor/peor día y promedio diario)
  const porFecha = {}
  const porDia = Array(7).fill(null).map(() => ({ sales: 0, orders: 0 }))
  for (const tab of activas) {
    const fecha = new Date(tab.createdAt)
    const key = fecha.toISOString().split('T')[0]
    porFecha[key] = (porFecha[key] || 0) + foodSales(tab)
    const diaSemana = (fecha.getDay() + 6) % 7 // 0=Lun, 6=Dom
    porDia[diaSemana].sales += foodSales(tab)
    porDia[diaSemana].orders += 1
  }

  const fechasOrdenadas = Object.entries(porFecha).sort((a, b) => b[1] - a[1])
  const diasUnicos = Object.keys(porFecha).length

  // Descuentos (sobre precio de comida, sin despacho)
  const total_discounts = activas.reduce((s, t) => s + (t.discountsAmount || 0), 0)
  const ventas_brutas = activas.reduce((s, t) => s + (t.totalPriceBeforeDiscounts || t.totalPrice || 0), 0)
  const orders_with_discount = activas.filter(t => (t.discountsAmount || 0) > 0).length

  // Top productos (agrupados por nombre)
  const productMap = {}
  for (const tab of activas) {
    for (const item of (tab.items || [])) {
      if (item.type !== 'product') continue
      const name = item.productName
      if (!productMap[name]) {
        productMap[name] = { product_name: name, unit_price: item.unitPrice || 0, units_sold: 0, total_sold: 0 }
      }
      productMap[name].units_sold += item.amount || 0
      productMap[name].total_sold += item.price || 0
    }
  }
  const topProductos = Object.values(productMap)
    .sort((a, b) => b.total_sold - a.total_sold)
    .map((p, i) => ({
      rank: i + 1,
      product_name: p.product_name,
      unit_price: Math.round(p.unit_price),
      units_sold: p.units_sold,
      total_sold: Math.round(p.total_sold),
    }))

  // Costo total de packaging del período
  const packagingCost = topProductos.reduce(
    (sum, p) => sum + p.units_sold * getPackagingPerUnit(p.product_name), 0
  )

  // Tiempo real de preparación: desde que ingresó la orden hasta que se marcó lista
  const tabsConTiempo = activas.filter(t => t.createdAt && t.readyToPickupAt)
  let avg_prep_minutes = null
  let pct_orders_on_time = null
  if (tabsConTiempo.length > 0) {
    const preps = tabsConTiempo.map(t =>
      (new Date(t.readyToPickupAt) - new Date(t.createdAt)) / 60000
    )
    avg_prep_minutes = Math.round(preps.reduce((s, d) => s + d, 0) / preps.length)
    // % órdenes listas antes de lo prometido (solo las que tienen mustBeReadyAt)
    const conPromesa = tabsConTiempo.filter(t => t.mustBeReadyAt)
    pct_orders_on_time = conPromesa.length > 0
      ? Math.round((conPromesa.filter(t => new Date(t.readyToPickupAt) <= new Date(t.mustBeReadyAt)).length / conPromesa.length) * 10000) / 100
      : null
  }

  // Métodos de pago (de tab.payments[])
  const porPago = {}
  for (const tab of activas) {
    for (const pmt of (tab.payments || [])) {
      if (pmt.voidedAt) continue
      const method = pmt.paymentMethodName || 'Otro'
      if (!porPago[method]) porPago[method] = { amount: 0, orders: 0 }
      porPago[method].amount += pmt.amount || 0
      porPago[method].orders += 1
    }
  }

  // Descuentos por nombre (quién subsidia cada promoción)
  const porDescuento = {}
  for (const tab of activas) {
    for (const disc of (tab.discounts || [])) {
      if (disc.voidedAt) continue
      const name = disc.discountMethodName || 'Descuento'
      if (!porDescuento[name]) porDescuento[name] = { amount: 0, orders: 0 }
      porDescuento[name].amount += disc.discountedAmount || 0
      porDescuento[name].orders += 1
    }
  }

  return {
    locCode,
    total_sales: Math.round(total_sales),
    total_orders,
    avg_ticket: total_orders > 0 ? Math.round(total_sales / total_orders) : 0,
    daily_avg: diasUnicos > 0 ? Math.round(total_sales / diasUnicos) : 0,
    delivery_sales: Math.round(delivery_sales),
    delivery_orders,
    delivery_avg_ticket: delivery_orders > 0 ? Math.round(delivery_sales / delivery_orders) : 0,
    presencial_sales: Math.round(presencialData.sales),
    presencial_orders: presencialData.orders,
    presencial_avg_ticket: presencialData.orders > 0 ? Math.round(presencialData.sales / presencialData.orders) : 0,
    total_discounts: Math.round(total_discounts),
    discount_pct: ventas_brutas > 0 ? Math.round((total_discounts / ventas_brutas) * 10000) / 100 : 0,
    orders_with_discount,
    voided_orders: canceladas.length,
    voided_amount: Math.round(canceladas.reduce((s, t) => s + foodSales(t), 0)),
    best_day_date: fechasOrdenadas[0]?.[0] || null,
    best_day_amount: fechasOrdenadas[0] ? Math.round(fechasOrdenadas[0][1]) : 0,
    worst_day_date: fechasOrdenadas[fechasOrdenadas.length - 1]?.[0] || null,
    worst_day_amount: fechasOrdenadas[fechasOrdenadas.length - 1]
      ? Math.round(fechasOrdenadas[fechasOrdenadas.length - 1][1])
      : 0,
    avg_prep_minutes,
    pct_orders_on_time,
    packaging_cost: Math.round(packagingCost),
    porCanal,
    porDia,
    porPago,
    porDescuento,
    topProductos,
  }
}

export async function POST(request) {
  try {
    if (!JUSTO_TOKEN) throw new Error('JUSTO_API_TOKEN no configurado en el servidor')

    const { year, month } = await request.json()
    if (!year || !month) throw new Error('Se requiere year y month')

    const mm = String(month).padStart(2, '0')
    // Chile es UTC-3 permanente → medianoche Santiago = 03:00 UTC
    // fromDate: 1er día del mes 00:00 Santiago = 03:00 UTC
    // toDate: 1er día del mes siguiente 00:00 Santiago - 1s = día anterior 02:59:59 UTC
    const nextMonth = month === 12 ? 1 : month + 1
    const nextYear = month === 12 ? year + 1 : year
    const nextMm = String(nextMonth).padStart(2, '0')
    const fromDate = `${year}-${mm}-01T03:00:00.000Z`
    const toDate = `${nextYear}-${nextMm}-01T02:59:59.000Z`
    const lastDay = new Date(year, month, 0).getDate()

    const [tabsSF, tabsLA] = await Promise.all([
      fetchAllTabs(STORES.SF, fromDate, toDate),
      fetchAllTabs(STORES.LA, fromDate, toDate),
    ])

    const sf = calcularAgregados(tabsSF, 'SF')
    const la = calcularAgregados(tabsLA, 'LA')

    return NextResponse.json({ success: true, sf, la, period_start: `${year}-${mm}-01`, period_end: `${year}-${mm}-${lastDay}` })
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
