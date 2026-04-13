'use client'

import { useState } from 'react'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'

const supabase = createClient()

export default function ImportarVentas() {
  const [preview, setPreview] = useState(null)
  const [workbook, setWorkbook] = useState(null)
  const [loading, setLoading] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState(null)

  function parsearExcel(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result)
          const wb = XLSX.read(data, { type: 'array', cellDates: true })
          resolve(wb)
        } catch (err) {
          reject(err)
        }
      }
      reader.readAsArrayBuffer(file)
    })
  }

  async function handleArchivo(e) {
    const file = e.target.files[0]
    if (!file) return
    setLoading(true)
    setError(null)
    setPreview(null)
    setSuccess(false)

    try {
      const wb = await parsearExcel(file)
      const hojasRequeridas = ['Cuentas', 'Ranking Productos', 'Descuentos']
      for (const hoja of hojasRequeridas) {
        if (!wb.SheetNames.includes(hoja)) {
          throw new Error(`No se encontró la hoja "${hoja}" en el archivo`)
        }
      }
      setWorkbook(wb)
      const resultado = procesarJustoHub(wb)
      setPreview(resultado)
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }

  function procesarLocal(cuentas, descuentos, ranking, locCode) {
    const nombreLocal = locCode === 'SF' ? 'The House - San Felipe' : 'The House - Los Andes'

    const todasCerradas = cuentas.filter(r => r['Estado'] === 'Cerrada' && r['Local'] === nombreLocal)
    const todasAnuladas = cuentas.filter(r => r['Estado'] === 'Anulada' && r['Local'] === nombreLocal)

    const porFechaRaw = {}
    for (const row of todasCerradas) {
      const f = row['Fecha de creación']
      const fecha = f instanceof Date ? f : new Date(f)
      if (!fecha || isNaN(fecha)) continue
      const key = fecha.toISOString().split('T')[0]
      if (!porFechaRaw[key]) porFechaRaw[key] = 0
      porFechaRaw[key] += parseFloat(row['Subtotal con descuento'] || 0)
    }

    const entradasPorFecha = Object.entries(porFechaRaw).sort((a, b) => a[0].localeCompare(b[0]))
    const mesesConteo = {}
    for (const [fecha] of entradasPorFecha) {
      const mes = fecha.substring(0, 7)
      mesesConteo[mes] = (mesesConteo[mes] || 0) + 1
    }
    const mesPrincipal = Object.entries(mesesConteo).sort((a, b) => b[1] - a[1])[0][0]
    const porFecha = Object.fromEntries(
      entradasPorFecha.filter(([fecha]) => fecha.startsWith(mesPrincipal))
    )

    const cerradas = todasCerradas.filter(r => {
      const f = r['Fecha de creación']
      const fecha = f instanceof Date ? f : new Date(f)
      if (!fecha || isNaN(fecha)) return false
      return porFecha[fecha.toISOString().split('T')[0]] !== undefined
    })

    const totalSales = cerradas.reduce((sum, r) => sum + parseFloat(r['Subtotal con descuento'] || 0), 0)
    const totalOrders = cerradas.length

    const porCanal = {}
    for (const row of cerradas) {
      const plataforma = (row['Plataforma'] || '').toLowerCase()
      const venta = parseFloat(row['Subtotal con descuento'] || 0)
      if (!porCanal[plataforma]) porCanal[plataforma] = { sales: 0, orders: 0 }
      porCanal[plataforma].sales += venta
      porCanal[plataforma].orders += 1
    }

    const presencialKey = Object.keys(porCanal).find(k => k.includes('presencial')) || 'venta presencial'
    const presencialData = porCanal[presencialKey] || { sales: 0, orders: 0 }
    const deliverySales = totalSales - presencialData.sales
    const deliveryOrders = totalOrders - presencialData.orders

    const porDia = Array(7).fill(null).map(() => ({ sales: 0, orders: 0 }))
    for (const row of cerradas) {
      const f = row['Fecha de creación']
      const fecha = f instanceof Date ? f : new Date(f)
      if (!fecha || isNaN(fecha)) continue
      const dia = (fecha.getDay() + 6) % 7
      porDia[dia].sales += parseFloat(row['Subtotal con descuento'] || 0)
      porDia[dia].orders += 1
    }

    const fechasOrdenadas = Object.entries(porFecha).sort((a, b) => b[1] - a[1])
    const mejorDia = fechasOrdenadas[0]
    const peorDia = fechasOrdenadas[fechasOrdenadas.length - 1]
    const diasUnicos = Object.keys(porFecha).length
    const dailyAvg = diasUnicos > 0 ? totalSales / diasUnicos : 0

    const descuentosLocal = descuentos.filter(r => r['Local'] === nombreLocal)
    const totalDescuentos = descuentosLocal.reduce((sum, r) => sum + parseFloat(r['Monto'] || 0), 0)
    const cuentasConDescuento = new Set(descuentosLocal.map(r => r['Id Cuenta'])).size
    const subtotalBruto = cerradas.reduce((sum, r) => sum + parseFloat(r['Subtotal'] || 0), 0)
    const discountPct = subtotalBruto > 0 ? (totalDescuentos / subtotalBruto) * 100 : 0

    const topProductos = ranking
      .map((r, i) => ({
        rank: i + 1,
        product_name: r['Producto'] || r['Nombre'] || '',
        unit_price: Math.round(parseFloat(r['Precio unitario'] || 0)),
        units_sold: parseInt(r['Unidades vendidas'] || r['Cantidad'] || 0),
        total_sold: Math.round(parseFloat(r['Total vendido'] || r['Total'] || 0)),
      }))
      .filter(p => p.product_name && p.units_sold > 0)

    return {
      locCode,
      period_start: Object.keys(porFecha).sort()[0],
      period_end: Object.keys(porFecha).sort().slice(-1)[0],
      total_sales: Math.round(totalSales),
      total_orders: totalOrders,
      avg_ticket: totalOrders > 0 ? Math.round(totalSales / totalOrders) : 0,
      daily_avg: Math.round(dailyAvg),
      delivery_sales: Math.round(deliverySales),
      delivery_orders: deliveryOrders,
      delivery_avg_ticket: deliveryOrders > 0 ? Math.round(deliverySales / deliveryOrders) : 0,
      presencial_sales: Math.round(presencialData.sales),
      presencial_orders: presencialData.orders,
      presencial_avg_ticket: presencialData.orders > 0 ? Math.round(presencialData.sales / presencialData.orders) : 0,
      total_discounts: Math.round(totalDescuentos),
      discount_pct: Math.round(discountPct * 100) / 100,
      orders_with_discount: cuentasConDescuento,
      voided_orders: todasAnuladas.length,
      voided_amount: Math.round(todasAnuladas.reduce((sum, r) => sum + parseFloat(r['Subtotal con descuento'] || 0), 0)),
      best_day_date: mejorDia?.[0] || null,
      best_day_amount: mejorDia ? Math.round(mejorDia[1]) : 0,
      worst_day_date: peorDia?.[0] || null,
      worst_day_amount: peorDia ? Math.round(peorDia[1]) : 0,
      porCanal,
      porDia,
      topProductos,
    }
  }

  function procesarJustoHub(wb) {
    const cuentas = XLSX.utils.sheet_to_json(wb.Sheets['Cuentas'])
    const descuentos = XLSX.utils.sheet_to_json(wb.Sheets['Descuentos'])
    const ranking = XLSX.utils.sheet_to_json(wb.Sheets['Ranking Productos'])

    return {
      sf: procesarLocal(cuentas, descuentos, ranking, 'SF'),
      la: procesarLocal(cuentas, descuentos, ranking, 'LA'),
    }
  }

  async function guardarPeriodo() {
    if (!preview) return
    setGuardando(true)
    setError(null)

    try {
      const { data: locations } = await supabase.from('locations').select('id, short_code')
      const locationMap = {}
      for (const loc of locations) locationMap[loc.short_code] = loc.id

      for (const locData of [preview.sf, preview.la]) {
        const locId = locationMap[locData.locCode]

        // Verificar duplicado
        const { data: existe } = await supabase
          .from('sales_periods')
          .select('id')
          .eq('period_start', locData.period_start)
          .eq('period_end', locData.period_end)
          .eq('location_id', locId)
          .single()

        if (existe) throw new Error(`Ya existe un período importado para ${locData.locCode} en estas fechas`)

        const { data: period, error: periodError } = await supabase
          .from('sales_periods')
          .insert({
            period_start: locData.period_start,
            period_end: locData.period_end,
            location_id: locId,
            total_sales: locData.total_sales,
            total_orders: locData.total_orders,
            avg_ticket: locData.avg_ticket,
            daily_avg: locData.daily_avg,
            delivery_sales: locData.delivery_sales,
            delivery_orders: locData.delivery_orders,
            delivery_avg_ticket: locData.delivery_avg_ticket,
            presencial_sales: locData.presencial_sales,
            presencial_orders: locData.presencial_orders,
            presencial_avg_ticket: locData.presencial_avg_ticket,
            total_discounts: locData.total_discounts,
            discount_pct: locData.discount_pct,
            orders_with_discount: locData.orders_with_discount,
            voided_orders: locData.voided_orders,
            voided_amount: locData.voided_amount,
            best_day_date: locData.best_day_date,
            best_day_amount: locData.best_day_amount,
            worst_day_date: locData.worst_day_date,
            worst_day_amount: locData.worst_day_amount,
          })
          .select()
          .single()

        if (periodError) throw periodError

        for (const [channel, data] of Object.entries(locData.porCanal)) {
          const pct = locData.total_sales > 0 ? (data.sales / locData.total_sales) * 100 : 0
          await supabase.from('sales_by_channel').insert({
            period_id: period.id,
            location_id: locId,
            channel,
            sales: Math.round(data.sales),
            orders: data.orders,
            avg_ticket: data.orders > 0 ? Math.round(data.sales / data.orders) : 0,
            pct_of_location: Math.round(pct * 100) / 100,
          })
        }

        for (let i = 0; i < 7; i++) {
          const dia = locData.porDia[i]
          if (dia.orders === 0) continue
          await supabase.from('sales_by_weekday').insert({
            period_id: period.id,
            weekday: i,
            sales: Math.round(dia.sales),
            orders: dia.orders,
            avg_ticket: dia.orders > 0 ? Math.round(dia.sales / dia.orders) : 0,
          })
        }

        for (const p of locData.topProductos) {
          await supabase.from('sales_top_products').insert({
            period_id: period.id,
            ...p,
          })
        }
      }

      setSuccess(true)
      setPreview(null)
      setWorkbook(null)
    } catch (err) {
      setError(err.message)
    }
    setGuardando(false)
  }

  const diasSemana = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

  const combinar = (sf, la) => ({
    total_sales: sf.total_sales + la.total_sales,
    total_orders: sf.total_orders + la.total_orders,
    avg_ticket: (sf.total_orders + la.total_orders) > 0
      ? Math.round((sf.total_sales + la.total_sales) / (sf.total_orders + la.total_orders)) : 0,
    daily_avg: Math.round((sf.daily_avg + la.daily_avg)),
    delivery_sales: sf.delivery_sales + la.delivery_sales,
    delivery_orders: sf.delivery_orders + la.delivery_orders,
    presencial_sales: sf.presencial_sales + la.presencial_sales,
    presencial_orders: sf.presencial_orders + la.presencial_orders,
    total_discounts: sf.total_discounts + la.total_discounts,
    discount_pct: Math.round(((sf.discount_pct + la.discount_pct) / 2) * 100) / 100,
    orders_with_discount: sf.orders_with_discount + la.orders_with_discount,
    voided_orders: sf.voided_orders + la.voided_orders,
    voided_amount: sf.voided_amount + la.voided_amount,
    best_day_amount: Math.max(sf.best_day_amount, la.best_day_amount),
    best_day_date: sf.best_day_amount >= la.best_day_amount ? sf.best_day_date : la.best_day_date,
    worst_day_amount: Math.min(sf.worst_day_amount, la.worst_day_amount),
    worst_day_date: sf.worst_day_amount <= la.worst_day_amount ? sf.worst_day_date : la.worst_day_date,
    porDia: sf.porDia.map((d, i) => ({
      sales: d.sales + la.porDia[i].sales,
      orders: d.orders + la.porDia[i].orders,
    })),
    topProductos: sf.topProductos,
  })

  return (
    <main className="min-h-screen bg-gray-950 p-4 md:p-8">
      <div className="max-w-3xl mx-auto">

        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">📥 Importar Ventas</h1>
            <p className="text-gray-500 text-sm mt-1">Sube el Excel mensual de Justo Hub</p>
          </div>
          <Link href="/ventas" className="text-gray-400 hover:text-white text-sm transition">
            Ver dashboard →
          </Link>
        </div>

        {!preview && !success && (
          <div className="bg-gray-900 rounded-2xl p-6 border border-gray-800 mb-6">
            <label className="flex flex-col items-center justify-center gap-3 cursor-pointer">
              <span className="text-4xl">📊</span>
              <span className="text-white font-semibold">Seleccionar archivo Excel</span>
              <span className="text-gray-500 text-sm">Exportado desde Justo Hub (.xlsx)</span>
              <input type="file" accept=".xlsx,.xls" onChange={handleArchivo} className="hidden" />
              <span className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-semibold transition">
                {loading ? 'Procesando...' : 'Elegir archivo'}
              </span>
            </label>
          </div>
        )}

        {error && (
          <div className="bg-red-950 border border-red-800 text-red-300 rounded-xl p-4 mb-6">❌ {error}</div>
        )}

        {success && (
          <div className="bg-green-900 border border-green-700 text-green-300 rounded-xl p-4 mb-6">
            <p className="font-semibold">✅ Período importado correctamente — SF y LA guardados</p>
            <button onClick={() => setSuccess(false)} className="text-green-400 text-sm mt-2 underline">
              Importar otro período
            </button>
          </div>
        )}

        {preview && (() => {
          const ambos = combinar(preview.sf, preview.la)
          return (
            <div className="flex flex-col gap-4">

              <div className="bg-gray-900 rounded-2xl p-4 border border-orange-500">
                <p className="text-orange-400 text-xs uppercase tracking-wide mb-1">Período detectado — Ambos locales</p>
                <p className="text-white font-bold text-lg">
                  {new Date(preview.sf.period_start + 'T12:00:00').toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })}
                </p>
                <p className="text-gray-500 text-sm">{preview.sf.period_start} → {preview.sf.period_end}</p>
              </div>

              {/* KPIs totales */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: 'Ventas totales', value: `$${ambos.total_sales.toLocaleString('es-CL')}`, color: 'text-white' },
                  { label: 'Órdenes', value: ambos.total_orders, color: 'text-white' },
                  { label: 'Ticket promedio', value: `$${ambos.avg_ticket.toLocaleString('es-CL')}`, color: 'text-green-400' },
                  { label: 'Promedio diario', value: `$${ambos.daily_avg.toLocaleString('es-CL')}`, color: 'text-blue-400' },
                ].map(kpi => (
                  <div key={kpi.label} className="bg-gray-900 rounded-xl p-3 border border-gray-800">
                    <p className="text-gray-400 text-xs mb-1">{kpi.label}</p>
                    <p className={`font-bold ${kpi.color}`}>{kpi.value}</p>
                  </div>
                ))}
              </div>

              {/* Por local */}
              <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
                <h3 className="text-white font-semibold mb-3">Por local</h3>
                <div className="grid grid-cols-2 gap-4">
                  {[preview.sf, preview.la].map(loc => (
                    <div key={loc.locCode}>
                      <p className="text-orange-400 text-xs font-semibold mb-1">{loc.locCode === 'SF' ? 'San Felipe' : 'Los Andes'}</p>
                      <p className="text-white font-bold">${loc.total_sales.toLocaleString('es-CL')}</p>
                      <p className="text-gray-500 text-xs">{loc.total_orders} órdenes · ticket ${loc.avg_ticket.toLocaleString('es-CL')}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Delivery vs Presencial */}
              <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
                <h3 className="text-white font-semibold mb-3">Canales</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-gray-400 text-xs mb-1">Delivery</p>
                    <p className="text-white font-bold">${ambos.delivery_sales.toLocaleString('es-CL')}</p>
                    <p className="text-gray-500 text-xs">{ambos.delivery_orders} órdenes</p>
                  </div>
                  <div>
                    <p className="text-gray-400 text-xs mb-1">Presencial</p>
                    <p className="text-white font-bold">${ambos.presencial_sales.toLocaleString('es-CL')}</p>
                    <p className="text-gray-500 text-xs">{ambos.presencial_orders} órdenes</p>
                  </div>
                </div>
              </div>

              {/* Descuentos */}
              <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
                <h3 className="text-white font-semibold mb-3">Descuentos y anulaciones</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-gray-400 text-xs mb-1">Total descuentos</p>
                    <p className="text-red-400 font-bold">${ambos.total_discounts.toLocaleString('es-CL')}</p>
                    <p className="text-gray-500 text-xs">{ambos.discount_pct}% del subtotal · {ambos.orders_with_discount} órdenes</p>
                  </div>
                  <div>
                    <p className="text-gray-400 text-xs mb-1">Anulaciones</p>
                    <p className="text-red-400 font-bold">{ambos.voided_orders} órdenes</p>
                    <p className="text-gray-500 text-xs">${ambos.voided_amount.toLocaleString('es-CL')} potencial perdido</p>
                  </div>
                </div>
              </div>

              {/* Por día de semana */}
              <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
                <h3 className="text-white font-semibold mb-3">Por día de semana</h3>
                <div className="flex flex-col gap-2">
                  {ambos.porDia.map((dia, i) => (
                    <div key={i} className="flex justify-between items-center">
                      <span className="text-gray-400 text-sm w-24">{diasSemana[i]}</span>
                      <div className="flex-1 mx-3 bg-gray-800 rounded-full h-2">
                        <div
                          className="bg-orange-500 h-2 rounded-full"
                          style={{ width: `${Math.max(...ambos.porDia.map(d => d.sales)) > 0 ? (dia.sales / Math.max(...ambos.porDia.map(d => d.sales))) * 100 : 0}%` }}
                        />
                      </div>
                      <span className="text-white text-sm w-28 text-right">${Math.round(dia.sales).toLocaleString('es-CL')}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Top productos */}
              <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
                <h3 className="text-white font-semibold mb-3">Top productos</h3>
                <div className="flex flex-col gap-2">
                  {ambos.topProductos.slice(0, 10).map(p => (
                    <div key={p.rank} className="flex justify-between items-center py-1 border-b border-gray-800 last:border-0">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-600 text-xs w-5">{p.rank}</span>
                        <span className="text-white text-sm">{p.product_name}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-gray-300 text-sm">${p.total_sold.toLocaleString('es-CL')}</span>
                        <span className="text-gray-500 text-xs ml-2">{p.units_sold} u.</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => { setPreview(null); setWorkbook(null) }}
                  className="flex-1 bg-gray-800 hover:bg-gray-700 text-white rounded-xl p-3 font-semibold transition"
                >
                  Cancelar
                </button>
                <button
                  onClick={guardarPeriodo}
                  disabled={guardando}
                  className="flex-1 bg-orange-500 hover:bg-orange-600 text-white rounded-xl p-3 font-semibold transition disabled:opacity-50"
                >
                  {guardando ? 'Guardando...' : 'Guardar período'}
                </button>
              </div>

            </div>
          )
        })()}

      </div>
    </main>
  )
}