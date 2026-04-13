'use client'

import { useState } from 'react'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'

const supabase = createClient()

export default function ImportarVentas() {
  const [tab, setTab] = useState('justo')

  return (
    <main className="min-h-screen bg-gray-950 p-4 md:p-8">
      <div className="max-w-3xl mx-auto">

        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">📥 Importar Ventas</h1>
            <p className="text-gray-500 text-sm mt-1">Sube los archivos de cada plataforma</p>
          </div>
          <Link href="/ventas" className="text-gray-400 hover:text-white text-sm transition">
            Ver dashboard →
          </Link>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 bg-gray-900 p-1 rounded-xl border border-gray-800">
          {[
            { key: 'justo', label: '📊 Justo Hub' },
            { key: 'peya', label: '🛵 PedidosYa' },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${
                tab === t.key
                  ? 'bg-orange-500 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'justo' && <ImportadorJusto />}
        {tab === 'peya' && <ImportadorPeya />}

      </div>
    </main>
  )
}

// ─── IMPORTADOR JUSTO HUB ───────────────────────────────────────────────────

function ImportadorJusto() {
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
        } catch (err) { reject(err) }
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
        if (!wb.SheetNames.includes(hoja)) throw new Error(`No se encontró la hoja "${hoja}"`)
      }
      setWorkbook(wb)
      setPreview(procesarJustoHub(wb))
    } catch (err) { setError(err.message) }
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
    const porFecha = Object.fromEntries(entradasPorFecha.filter(([f]) => f.startsWith(mesPrincipal)))

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
    const diasUnicos = Object.keys(porFecha).length
    const descuentosLocal = descuentos.filter(r => r['Local'] === nombreLocal)
    const totalDescuentos = descuentosLocal.reduce((sum, r) => sum + parseFloat(r['Monto'] || 0), 0)
    const cuentasConDescuento = new Set(descuentosLocal.map(r => r['Id Cuenta'])).size
    const subtotalBruto = cerradas.reduce((sum, r) => sum + parseFloat(r['Subtotal'] || 0), 0)
    const topProductos = ranking.map((r, i) => ({
      rank: i + 1,
      product_name: r['Producto'] || r['Nombre'] || '',
      unit_price: Math.round(parseFloat(r['Precio unitario'] || 0)),
      units_sold: parseInt(r['Unidades vendidas'] || r['Cantidad'] || 0),
      total_sold: Math.round(parseFloat(r['Total vendido'] || r['Total'] || 0)),
    })).filter(p => p.product_name && p.units_sold > 0)

    return {
      locCode,
      period_start: Object.keys(porFecha).sort()[0],
      period_end: Object.keys(porFecha).sort().slice(-1)[0],
      total_sales: Math.round(totalSales),
      total_orders: totalOrders,
      avg_ticket: totalOrders > 0 ? Math.round(totalSales / totalOrders) : 0,
      daily_avg: Math.round(diasUnicos > 0 ? totalSales / diasUnicos : 0),
      delivery_sales: Math.round(deliverySales),
      delivery_orders: deliveryOrders,
      delivery_avg_ticket: deliveryOrders > 0 ? Math.round(deliverySales / deliveryOrders) : 0,
      presencial_sales: Math.round(presencialData.sales),
      presencial_orders: presencialData.orders,
      presencial_avg_ticket: presencialData.orders > 0 ? Math.round(presencialData.sales / presencialData.orders) : 0,
      total_discounts: Math.round(totalDescuentos),
      discount_pct: Math.round(subtotalBruto > 0 ? (totalDescuentos / subtotalBruto) * 10000 : 0) / 100,
      orders_with_discount: cuentasConDescuento,
      voided_orders: todasAnuladas.length,
      voided_amount: Math.round(todasAnuladas.reduce((sum, r) => sum + parseFloat(r['Subtotal con descuento'] || 0), 0)),
      best_day_date: fechasOrdenadas[0]?.[0] || null,
      best_day_amount: fechasOrdenadas[0] ? Math.round(fechasOrdenadas[0][1]) : 0,
      worst_day_date: fechasOrdenadas[fechasOrdenadas.length - 1]?.[0] || null,
      worst_day_amount: fechasOrdenadas[fechasOrdenadas.length - 1] ? Math.round(fechasOrdenadas[fechasOrdenadas.length - 1][1]) : 0,
      porCanal, porDia, topProductos,
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
        const { data: existe } = await supabase
          .from('sales_periods').select('id')
          .eq('period_start', locData.period_start)
          .eq('period_end', locData.period_end)
          .eq('location_id', locId).single()
        if (existe) throw new Error(`Ya existe un período para ${locData.locCode} en estas fechas`)

        const { data: period, error: periodError } = await supabase
          .from('sales_periods').insert({
            period_start: locData.period_start, period_end: locData.period_end,
            location_id: locId, total_sales: locData.total_sales,
            total_orders: locData.total_orders, avg_ticket: locData.avg_ticket,
            daily_avg: locData.daily_avg, delivery_sales: locData.delivery_sales,
            delivery_orders: locData.delivery_orders, delivery_avg_ticket: locData.delivery_avg_ticket,
            presencial_sales: locData.presencial_sales, presencial_orders: locData.presencial_orders,
            presencial_avg_ticket: locData.presencial_avg_ticket, total_discounts: locData.total_discounts,
            discount_pct: locData.discount_pct, orders_with_discount: locData.orders_with_discount,
            voided_orders: locData.voided_orders, voided_amount: locData.voided_amount,
            best_day_date: locData.best_day_date, best_day_amount: locData.best_day_amount,
            worst_day_date: locData.worst_day_date, worst_day_amount: locData.worst_day_amount,
          }).select().single()
        if (periodError) throw periodError

        for (const [channel, data] of Object.entries(locData.porCanal)) {
          await supabase.from('sales_by_channel').insert({
            period_id: period.id, location_id: locId, channel,
            sales: Math.round(data.sales), orders: data.orders,
            avg_ticket: data.orders > 0 ? Math.round(data.sales / data.orders) : 0,
            pct_of_location: locData.total_sales > 0 ? Math.round((data.sales / locData.total_sales) * 10000) / 100 : 0,
          })
        }
        for (let i = 0; i < 7; i++) {
          const dia = locData.porDia[i]
          if (dia.orders === 0) continue
          await supabase.from('sales_by_weekday').insert({
            period_id: period.id, weekday: i, sales: Math.round(dia.sales),
            orders: dia.orders, avg_ticket: dia.orders > 0 ? Math.round(dia.sales / dia.orders) : 0,
          })
        }
        for (const p of locData.topProductos) {
          await supabase.from('sales_top_products').insert({ period_id: period.id, ...p })
        }
      }
      setSuccess(true)
      setPreview(null)
      setWorkbook(null)
    } catch (err) { setError(err.message) }
    setGuardando(false)
  }

  const diasSemana = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
  const ambos = preview ? {
    total_sales: preview.sf.total_sales + preview.la.total_sales,
    total_orders: preview.sf.total_orders + preview.la.total_orders,
    delivery_sales: preview.sf.delivery_sales + preview.la.delivery_sales,
    presencial_sales: preview.sf.presencial_sales + preview.la.presencial_sales,
    total_discounts: preview.sf.total_discounts + preview.la.total_discounts,
    voided_orders: preview.sf.voided_orders + preview.la.voided_orders,
    voided_amount: preview.sf.voided_amount + preview.la.voided_amount,
    porDia: preview.sf.porDia.map((d, i) => ({ sales: d.sales + preview.la.porDia[i].sales, orders: d.orders + preview.la.porDia[i].orders })),
    topProductos: preview.sf.topProductos,
  } : null

  return (
    <div className="flex flex-col gap-4">
      {!preview && !success && (
        <div className="bg-gray-900 rounded-2xl p-6 border border-gray-800">
          <label className="flex flex-col items-center gap-3 cursor-pointer">
            <span className="text-4xl">📊</span>
            <span className="text-white font-semibold">Seleccionar Excel mensual</span>
            <span className="text-gray-500 text-sm">Exportado desde Justo Hub (.xlsx)</span>
            <input type="file" accept=".xlsx,.xls" onChange={handleArchivo} className="hidden" />
            <span className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-semibold transition">
              {loading ? 'Procesando...' : 'Elegir archivo'}
            </span>
          </label>
        </div>
      )}

      {error && <div className="bg-red-950 border border-red-800 text-red-300 rounded-xl p-4">❌ {error}</div>}

      {success && (
        <div className="bg-green-900 border border-green-700 text-green-300 rounded-xl p-4">
          <p className="font-semibold">✅ SF y LA guardados correctamente</p>
          <button onClick={() => setSuccess(false)} className="text-green-400 text-sm mt-2 underline">Importar otro período</button>
        </div>
      )}

      {preview && ambos && (
        <>
          <div className="bg-gray-900 rounded-2xl p-4 border border-orange-500">
            <p className="text-orange-400 text-xs uppercase tracking-wide mb-1">Período — Ambos locales</p>
            <p className="text-white font-bold text-lg">
              {new Date(preview.sf.period_start + 'T12:00:00').toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })}
            </p>
            <p className="text-gray-500 text-sm">{preview.sf.period_start} → {preview.sf.period_end}</p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Ventas totales', value: `$${ambos.total_sales.toLocaleString('es-CL')}`, color: 'text-white' },
              { label: 'Órdenes', value: ambos.total_orders, color: 'text-white' },
              { label: 'Ticket promedio', value: `$${ambos.total_orders > 0 ? Math.round(ambos.total_sales / ambos.total_orders).toLocaleString('es-CL') : 0}`, color: 'text-green-400' },
              { label: 'Promedio diario', value: `$${Math.round((preview.sf.daily_avg + preview.la.daily_avg)).toLocaleString('es-CL')}`, color: 'text-blue-400' },
            ].map(kpi => (
              <div key={kpi.label} className="bg-gray-900 rounded-xl p-3 border border-gray-800">
                <p className="text-gray-400 text-xs mb-1">{kpi.label}</p>
                <p className={`font-bold ${kpi.color}`}>{kpi.value}</p>
              </div>
            ))}
          </div>

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

          <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
            <h3 className="text-white font-semibold mb-3">Descuentos y anulaciones</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-gray-400 text-xs mb-1">Total descuentos</p>
                <p className="text-red-400 font-bold">${ambos.total_discounts.toLocaleString('es-CL')}</p>
              </div>
              <div>
                <p className="text-gray-400 text-xs mb-1">Anulaciones</p>
                <p className="text-red-400 font-bold">{ambos.voided_orders} órdenes</p>
                <p className="text-gray-500 text-xs">${ambos.voided_amount.toLocaleString('es-CL')} potencial perdido</p>
              </div>
            </div>
          </div>

          <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
            <h3 className="text-white font-semibold mb-3">Por día de semana</h3>
            <div className="flex flex-col gap-2">
              {ambos.porDia.map((dia, i) => (
                <div key={i} className="flex justify-between items-center">
                  <span className="text-gray-400 text-sm w-24">{diasSemana[i]}</span>
                  <div className="flex-1 mx-3 bg-gray-800 rounded-full h-2">
                    <div className="bg-orange-500 h-2 rounded-full"
                      style={{ width: `${Math.max(...ambos.porDia.map(d => d.sales)) > 0 ? (dia.sales / Math.max(...ambos.porDia.map(d => d.sales))) * 100 : 0}%` }} />
                  </div>
                  <span className="text-white text-sm w-28 text-right">${Math.round(dia.sales).toLocaleString('es-CL')}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={() => { setPreview(null); setWorkbook(null) }}
              className="flex-1 bg-gray-800 hover:bg-gray-700 text-white rounded-xl p-3 font-semibold transition">
              Cancelar
            </button>
            <button onClick={guardarPeriodo} disabled={guardando}
              className="flex-1 bg-orange-500 hover:bg-orange-600 text-white rounded-xl p-3 font-semibold transition disabled:opacity-50">
              {guardando ? 'Guardando...' : 'Guardar período'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ─── IMPORTADOR PEDIDOSYA ────────────────────────────────────────────────────

function ImportadorPeya() {
  const [archivo, setArchivo] = useState(null)
  const [preview, setPreview] = useState(null)
  const [loading, setLoading] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState(null)

  // Formulario PDF (ingreso manual)
  const [pdf, setPdf] = useState({
    period_start: '',
    period_end: '',
    net_sales: '',
    commission: '',
    plus_charges: '',
    reimbursements: '',
    taxes: '',
    total_settled: '',
  })

  async function handleArchivo(e) {
    const file = e.target.files[0]
    if (!file) return
    setLoading(true)
    setError(null)
    setPreview(null)

    try {
      const data = await file.arrayBuffer()
      const wb = XLSX.read(data, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(ws)

      if (rows.length === 0) throw new Error('El archivo no tiene datos')

      setArchivo(file.name)
      const resultado = procesarPeya(rows)
      setPreview(resultado)

      // Autocompletar fechas del formulario PDF
      setPdf(prev => ({
        ...prev,
        period_start: resultado.period_start,
        period_end: resultado.period_end,
        net_sales: resultado.net_sales_total,
      }))
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }

  function procesarPeya(rows) {
    // Detectar nombres de columnas clave
    const firstRow = rows[0]
    const cols = Object.keys(firstRow)

    const colSucursal = cols.find(c => c.toLowerCase().includes('sucursal'))
    const colFecha = cols.find(c => c.toLowerCase().includes('fecha'))
    const colBruto = cols.find(c => c.toLowerCase().includes('bruto'))
    const colNeto = cols.find(c => c.toLowerCase().includes('neto de la venta') || c.toLowerCase().includes('monto neto'))
    const colComision = cols.find(c => c.toLowerCase().includes('servicio ventas pedidoya ($)') || c.toLowerCase().includes('servicio ventas pedidoy'))
    const colPlus = cols.find(c => c.toLowerCase().includes('plus'))
    const colDescLocal = cols.find(c => c.toLowerCase().includes('descuento otorgado por el local'))
    const colDescPeya = cols.find(c => c.toLowerCase().includes('desc') && c.toLowerCase().includes('peya'))

    // Mapear sucursales a locales
    const mapLocal = (sucursal) => {
      if (!sucursal) return null
      const s = sucursal.toLowerCase()
      if (s.includes('san felipe')) return 'SF'
      if (s.includes('los andes')) return 'LA'
      return null
    }

    // Detectar período
    const fechas = rows
      .map(r => new Date(r[colFecha]))
      .filter(d => !isNaN(d))
      .sort((a, b) => a - b)
    const period_start = fechas[0]?.toISOString().split('T')[0]
    const period_end = fechas[fechas.length - 1]?.toISOString().split('T')[0]

    // Agrupar por local
    const porLocal = { SF: { gross: 0, net: 0, commission: 0, plus: 0, desc_local: 0, desc_peya: 0, orders: 0 },
                       LA: { gross: 0, net: 0, commission: 0, plus: 0, desc_local: 0, desc_peya: 0, orders: 0 } }

    for (const row of rows) {
      const loc = mapLocal(row[colSucursal])
      if (!loc) continue
      porLocal[loc].gross += parseFloat(row[colBruto] || 0)
      porLocal[loc].net += parseFloat(row[colNeto] || 0)
      porLocal[loc].commission += parseFloat(row[colComision] || 0)
      porLocal[loc].plus += parseFloat(row[colPlus] || 0)
      porLocal[loc].desc_local += parseFloat(row[colDescLocal] || 0)
      porLocal[loc].desc_peya += parseFloat(row[colDescPeya] || 0)
      porLocal[loc].orders += 1
    }

    const net_sales_total = Math.round(porLocal.SF.net + porLocal.LA.net)
    const commission_total = Math.round(Math.abs(porLocal.SF.commission) + Math.abs(porLocal.LA.commission))
    const plus_total = Math.round(Math.abs(porLocal.SF.plus) + Math.abs(porLocal.LA.plus))

    return {
      period_start,
      period_end,
      net_sales_total,
      commission_total,
      plus_total,
      porLocal,
      rows_count: rows.length,
    }
  }

  async function guardarLiquidacion() {
    if (!preview) return
    setGuardando(true)
    setError(null)

    try {
      const { data: locations } = await supabase.from('locations').select('id, short_code')
      const locationMap = {}
      for (const loc of locations) locationMap[loc.short_code] = loc.id

      for (const locCode of ['SF', 'LA']) {
        const d = preview.porLocal[locCode]
        const locId = locationMap[locCode]

        await supabase.from('platform_settlements').insert({
          platform: 'pedidosya',
          period_start: preview.period_start,
          period_end: preview.period_end,
          location_id: locId,
          gross_sales: Math.round(d.gross),
          net_sales: Math.round(d.net),
          local_discounts: Math.round(Math.abs(d.desc_local)),
          peya_discounts: Math.round(Math.abs(d.desc_peya)),
          commission: Math.round(Math.abs(d.commission)),
          commission_pct: d.net > 0 ? Math.round((Math.abs(d.commission) / d.net) * 10000) / 100 : 0,
          plus_charges: Math.round(Math.abs(d.plus)),
          reimbursements: pdf.reimbursements ? Math.round(parseFloat(pdf.reimbursements)) : 0,
          taxes: pdf.taxes ? Math.round(parseFloat(pdf.taxes)) : 0,
          total_settled: pdf.total_settled ? Math.round(parseFloat(pdf.total_settled)) : 0,
          orders_count: d.orders,
          pdf_net_sales: pdf.net_sales ? Math.round(parseFloat(pdf.net_sales)) : null,
          pdf_total_settled: pdf.total_settled ? Math.round(parseFloat(pdf.total_settled)) : null,
        })
      }

      setSuccess(true)
      setPreview(null)
      setArchivo(null)
    } catch (err) {
      setError(err.message)
    }
    setGuardando(false)
  }

  function updatePdf(field, value) {
    setPdf(prev => ({ ...prev, [field]: value }))
  }

  return (
    <div className="flex flex-col gap-4">

      {!success && (
        <>
          {/* Upload Excel */}
          <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
            <h3 className="text-white font-semibold mb-3">1. Excel semanal de órdenes</h3>
            <label className="flex items-center gap-3 cursor-pointer">
              <span className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition">
                {loading ? 'Procesando...' : archivo ? '✅ ' + archivo : 'Elegir archivo .xls'}
              </span>
              <input type="file" accept=".xlsx,.xls" onChange={handleArchivo} className="hidden" />
              {archivo && <span className="text-gray-500 text-xs">Cambiar archivo</span>}
            </label>
          </div>

          {/* Preview del Excel */}
          {preview && (
            <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
              <h3 className="text-white font-semibold mb-3">Resumen del Excel</h3>
              <p className="text-gray-500 text-xs mb-3">{preview.period_start} → {preview.period_end} · {preview.rows_count} órdenes</p>
              <div className="grid grid-cols-2 gap-4">
                {['SF', 'LA'].map(loc => (
                  <div key={loc}>
                    <p className="text-orange-400 text-xs font-semibold mb-2">{loc === 'SF' ? 'San Felipe' : 'Los Andes'}</p>
                    <div className="flex flex-col gap-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-gray-400">Ventas netas</span>
                        <span className="text-white">${Math.round(preview.porLocal[loc].net).toLocaleString('es-CL')}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Comisión PeYa</span>
                        <span className="text-red-400">-${Math.round(Math.abs(preview.porLocal[loc].commission)).toLocaleString('es-CL')}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Cargos Plus</span>
                        <span className="text-red-400">-${Math.round(Math.abs(preview.porLocal[loc].plus)).toLocaleString('es-CL')}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">% comisión efectiva</span>
                        <span className="text-yellow-400">
                          {preview.porLocal[loc].net > 0
                            ? ((Math.abs(preview.porLocal[loc].commission) / preview.porLocal[loc].net) * 100).toFixed(1)
                            : 0}%
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Órdenes</span>
                        <span className="text-white">{preview.porLocal[loc].orders}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Datos del PDF */}
          <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
            <h3 className="text-white font-semibold mb-1">2. Datos del PDF de liquidación</h3>
            <p className="text-gray-500 text-xs mb-4">Ingresa los valores del estado de cuenta semanal de PedidosYa</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-gray-400 text-xs mb-1 block">Fecha inicio</label>
                <input type="date" value={pdf.period_start} onChange={e => updatePdf('period_start', e.target.value)}
                  className="bg-gray-800 border border-gray-700 rounded-lg p-2 text-white text-sm w-full" />
              </div>
              <div>
                <label className="text-gray-400 text-xs mb-1 block">Fecha fin</label>
                <input type="date" value={pdf.period_end} onChange={e => updatePdf('period_end', e.target.value)}
                  className="bg-gray-800 border border-gray-700 rounded-lg p-2 text-white text-sm w-full" />
              </div>
              {[
                { key: 'net_sales', label: 'Ventas netas (PDF)' },
                { key: 'reimbursements', label: 'Reintegros' },
                { key: 'taxes', label: 'Impuestos (IVA)' },
                { key: 'total_settled', label: 'Total liquidado' },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-gray-400 text-xs mb-1 block">{f.label}</label>
                  <input type="number" value={pdf[f.key]} onChange={e => updatePdf(f.key, e.target.value)}
                    placeholder="$0"
                    className="bg-gray-800 border border-gray-700 rounded-lg p-2 text-white text-sm w-full" />
                </div>
              ))}
            </div>

            {/* Resumen del PDF */}
            {pdf.total_settled && (
              <div className="mt-4 bg-gray-800 rounded-xl p-3">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 text-sm">Total liquidado</span>
                  <span className="text-green-400 font-bold">${parseInt(pdf.total_settled).toLocaleString('es-CL')}</span>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {error && <div className="bg-red-950 border border-red-800 text-red-300 rounded-xl p-4">❌ {error}</div>}

      {success && (
        <div className="bg-green-900 border border-green-700 text-green-300 rounded-xl p-4">
          <p className="font-semibold">✅ Liquidación PedidosYa guardada</p>
          <button onClick={() => { setSuccess(false); setPdf({ period_start: '', period_end: '', net_sales: '', commission: '', plus_charges: '', reimbursements: '', taxes: '', total_settled: '' }) }}
            className="text-green-400 text-sm mt-2 underline">Importar otra semana</button>
        </div>
      )}

      {!success && preview && (
        <button onClick={guardarLiquidacion} disabled={guardando || !pdf.period_start || !pdf.period_end}
          className="bg-orange-500 hover:bg-orange-600 text-white rounded-xl p-3 font-semibold transition disabled:opacity-50">
          {guardando ? 'Guardando...' : 'Guardar liquidación'}
        </button>
      )}

    </div>
  )
}