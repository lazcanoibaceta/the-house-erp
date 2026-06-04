'use client'

import { useState, useEffect } from 'react'
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
            { key: 'justo', label: '📊 Justo' },
            { key: 'peya', label: '🛵 PedidosYa' },
            { key: 'mp', label: '💳 MercadoPago' },
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
        {tab === 'mp' && <ImportadorMercadoPago />}

      </div>
    </main>
  )
}

// ─── IMPORTADOR JUSTO API ────────────────────────────────────────────────────

function ImportadorJusto() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [preview, setPreview] = useState(null)
  const [periodDates, setPeriodDates] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [success, setSuccess] = useState(null) // null | 'guardado' | 'actualizado'
  const [error, setError] = useState(null)
  const [ultimosPeriodos, setUltimosPeriodos] = useState(null)

  useEffect(() => {
    async function fetchUltimos() {
      const { data } = await supabase
        .from('sales_periods')
        .select('period_start, period_end, location_id, locations(short_code)')
        .order('period_end', { ascending: false })
        .limit(4)
      if (data && data.length > 0) setUltimosPeriodos(data)
    }
    fetchUltimos()
  }, [success])

  async function previsualizar() {
    setCargando(true)
    setError(null)
    setPreview(null)
    try {
      const res = await fetch('/api/justo/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, month }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      setPreview({ sf: json.sf, la: json.la })
      setPeriodDates({ period_start: json.period_start, period_end: json.period_end })
    } catch (err) {
      setError(err.message)
    }
    setCargando(false)
  }

  async function guardarPeriodo() {
    if (!preview || !periodDates) return
    setGuardando(true)
    setError(null)
    try {
      const { data: locations } = await supabase.from('locations').select('id, short_code')
      const locationMap = {}
      for (const loc of locations) locationMap[loc.short_code] = loc.id

      let huboActualizacion = false

      for (const locData of [preview.sf, preview.la]) {
        const locId = locationMap[locData.locCode]

        const periodFields = {
          period_start: periodDates.period_start,
          period_end: periodDates.period_end,
          source: 'justo_api',
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
          avg_prep_minutes: locData.avg_prep_minutes,
          pct_orders_on_time: locData.pct_orders_on_time,
          packaging_cost: locData.packaging_cost,
        }

        const { data: existe } = await supabase
          .from('sales_periods').select('id')
          .eq('period_start', periodDates.period_start)
          .eq('location_id', locId).single()

        let periodId
        if (existe) {
          huboActualizacion = true
          periodId = existe.id
          await supabase.from('sales_periods').update(periodFields).eq('id', periodId)
          await Promise.all([
            supabase.from('sales_top_products').delete().eq('period_id', periodId),
            supabase.from('sales_by_channel').delete().eq('period_id', periodId),
            supabase.from('sales_by_weekday').delete().eq('period_id', periodId),
            supabase.from('sales_by_payment_method').delete().eq('period_id', periodId),
            supabase.from('sales_by_discount').delete().eq('period_id', periodId),
          ])
        } else {
          const { data: period, error: periodError } = await supabase
            .from('sales_periods').insert(periodFields).select().single()
          if (periodError) throw periodError
          periodId = period.id
        }

        for (const [channel, data] of Object.entries(locData.porCanal)) {
          await supabase.from('sales_by_channel').insert({
            period_id: periodId, location_id: locId, channel,
            sales: Math.round(data.sales), orders: data.orders,
            avg_ticket: data.orders > 0 ? Math.round(data.sales / data.orders) : 0,
            pct_of_location: locData.total_sales > 0 ? Math.round((data.sales / locData.total_sales) * 10000) / 100 : 0,
          })
        }
        for (let i = 0; i < 7; i++) {
          const dia = locData.porDia[i]
          if (dia.orders === 0) continue
          await supabase.from('sales_by_weekday').insert({
            period_id: periodId, weekday: i, sales: Math.round(dia.sales),
            orders: dia.orders, avg_ticket: dia.orders > 0 ? Math.round(dia.sales / dia.orders) : 0,
          })
        }
        for (const p of locData.topProductos) {
          await supabase.from('sales_top_products').insert({ period_id: periodId, ...p })
        }
        for (const [method, data] of Object.entries(locData.porPago)) {
          await supabase.from('sales_by_payment_method').insert({
            period_id: periodId, location_id: locId,
            payment_method: method,
            amount: Math.round(data.amount),
            orders_count: data.orders,
          })
        }
        for (const [name, data] of Object.entries(locData.porDescuento)) {
          await supabase.from('sales_by_discount').insert({
            period_id: periodId, location_id: locId,
            discount_name: name,
            discounted_amount: Math.round(data.amount),
            orders_count: data.orders,
          })
        }
      }
      setSuccess(huboActualizacion ? 'actualizado' : 'guardado')
      setPreview(null)
    } catch (err) { setError(err.message) }
    setGuardando(false)
  }

  const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
  const diasSemana = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo']
  const PLATAFORMA_LABEL = { justo: 'Justo', pedidosya: 'PedidosYa', pos: 'Presencial' }

  const ambos = preview ? {
    total_sales: preview.sf.total_sales + preview.la.total_sales,
    total_orders: preview.sf.total_orders + preview.la.total_orders,
    total_discounts: preview.sf.total_discounts + preview.la.total_discounts,
    voided_orders: preview.sf.voided_orders + preview.la.voided_orders,
    voided_amount: preview.sf.voided_amount + preview.la.voided_amount,
    porDia: preview.sf.porDia.map((d, i) => ({
      sales: d.sales + preview.la.porDia[i].sales,
      orders: d.orders + preview.la.porDia[i].orders,
    })),
    porCanal: Object.entries(preview.sf.porCanal).reduce((acc, [ch, d]) => {
      acc[ch] = {
        sales: d.sales + (preview.la.porCanal[ch]?.sales || 0),
        orders: d.orders + (preview.la.porCanal[ch]?.orders || 0),
      }
      return acc
    }, {}),
  } : null

  return (
    <div className="flex flex-col gap-4">

      {/* Últimos períodos */}
      {ultimosPeriodos && (() => {
        const vistos = new Set()
        const unicos = ultimosPeriodos.filter(p => {
          const key = `${p.period_start}_${p.period_end}`
          if (vistos.has(key)) return false
          vistos.add(key)
          return true
        })
        return (
          <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
            <p className="text-gray-400 text-xs uppercase tracking-wide mb-2">Últimos meses importados</p>
            <div className="flex flex-col gap-1">
              {unicos.map((p, i) => (
                <div key={i} className="flex justify-between items-center">
                  <span className={`text-sm ${i === 0 ? 'text-white font-semibold' : 'text-gray-400'}`}>
                    {new Date(p.period_start + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}
                    {' → '}
                    {new Date(p.period_end + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                  {i === 0 && <span className="text-xs bg-orange-900/50 text-orange-400 px-2 py-0.5 rounded-full">último</span>}
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      {/* Selector de mes */}
      {!preview && !success && (
        <div className="bg-gray-900 rounded-2xl p-6 border border-gray-800">
          <p className="text-white font-semibold mb-4">Seleccionar mes a importar</p>
          <div className="flex gap-3 mb-5">
            <select
              value={month}
              onChange={e => setMonth(Number(e.target.value))}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
            >
              {MESES.map((m, i) => (
                <option key={i} value={i + 1}>{m}</option>
              ))}
            </select>
            <select
              value={year}
              onChange={e => setYear(Number(e.target.value))}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
            >
              {[now.getFullYear() - 1, now.getFullYear()].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <button
            onClick={previsualizar}
            disabled={cargando}
            className="w-full bg-orange-500 hover:bg-orange-600 text-white rounded-xl p-3 font-semibold transition disabled:opacity-50"
          >
            {cargando ? 'Consultando API de Justo...' : 'Previsualizar mes'}
          </button>
        </div>
      )}

      {error && <div className="bg-red-950 border border-red-800 text-red-300 rounded-xl p-4">❌ {error}</div>}

      {success && (
        <div className="bg-green-900 border border-green-700 text-green-300 rounded-xl p-4">
          <p className="font-semibold">
            {success === 'actualizado' ? '🔄 SF y LA actualizados correctamente' : '✅ SF y LA guardados correctamente'}
          </p>
          <button onClick={() => setSuccess(null)} className="text-green-400 text-sm mt-2 underline">
            Importar otro período
          </button>
        </div>
      )}

      {preview && ambos && periodDates && (
        <>
          {/* Encabezado período */}
          <div className="bg-gray-900 rounded-2xl p-4 border border-orange-500">
            <p className="text-orange-400 text-xs uppercase tracking-wide mb-1">Período — Ambos locales</p>
            <p className="text-white font-bold text-lg">{MESES[month - 1]} {year}</p>
            <p className="text-gray-500 text-sm">{periodDates.period_start} → {periodDates.period_end}</p>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Ventas totales', value: `$${ambos.total_sales.toLocaleString('es-CL')}`, color: 'text-white' },
              { label: 'Órdenes', value: ambos.total_orders, color: 'text-white' },
              { label: 'Ticket promedio', value: `$${ambos.total_orders > 0 ? Math.round(ambos.total_sales / ambos.total_orders).toLocaleString('es-CL') : 0}`, color: 'text-green-400' },
              { label: 'Prom. diario', value: `$${Math.round((preview.sf.daily_avg + preview.la.daily_avg)).toLocaleString('es-CL')}`, color: 'text-blue-400' },
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

          {/* Por plataforma */}
          <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
            <h3 className="text-white font-semibold mb-3">Por plataforma</h3>
            <div className="flex flex-col gap-2">
              {Object.entries(ambos.porCanal).map(([ch, d]) => (
                <div key={ch} className="flex justify-between items-center">
                  <span className="text-gray-300 text-sm">{PLATAFORMA_LABEL[ch] || ch}</span>
                  <div className="flex gap-3 text-sm">
                    <span className="text-gray-500">{d.orders} órd.</span>
                    <span className="text-white font-semibold">${Math.round(d.sales).toLocaleString('es-CL')}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Descuentos y anulaciones */}
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

          {/* Por día de semana */}
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

          {/* Tiempo de preparación */}
          {preview.sf.avg_prep_minutes !== null && (
            <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
              <h3 className="text-white font-semibold mb-3">Tiempo de preparación</h3>
              <div className="grid grid-cols-2 gap-4">
                {[preview.sf, preview.la].map(loc => (
                  <div key={loc.locCode}>
                    <p className="text-orange-400 text-xs font-semibold mb-1">{loc.locCode === 'SF' ? 'San Felipe' : 'Los Andes'}</p>
                    {loc.avg_prep_minutes !== null ? (
                      <>
                        <p className={`font-bold ${loc.avg_prep_minutes <= 0 ? 'text-green-400' : 'text-yellow-400'}`}>
                          {loc.avg_prep_minutes > 0 ? `+${loc.avg_prep_minutes}` : loc.avg_prep_minutes} min promedio
                        </p>
                        <p className="text-gray-500 text-xs">{loc.pct_orders_on_time}% a tiempo</p>
                      </>
                    ) : <p className="text-gray-500 text-xs">Sin datos</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Métodos de pago */}
          {Object.keys(preview.sf.porPago).length > 0 && (
            <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
              <h3 className="text-white font-semibold mb-3">Métodos de pago — ambos locales</h3>
              <div className="flex flex-col gap-2">
                {Object.entries(
                  Object.entries({ ...preview.sf.porPago, ...preview.la.porPago }).reduce((acc, [method, d]) => {
                    if (!acc[method]) acc[method] = { amount: 0, orders: 0 }
                    acc[method].amount += d.amount
                    acc[method].orders += d.orders
                    return acc
                  }, {})
                ).sort((a, b) => b[1].amount - a[1].amount).map(([method, d]) => (
                  <div key={method} className="flex justify-between items-center">
                    <span className="text-gray-300 text-sm">{method}</span>
                    <div className="flex gap-3 text-sm">
                      <span className="text-gray-500">{d.orders} pagos</span>
                      <span className="text-white font-semibold">${Math.round(d.amount).toLocaleString('es-CL')}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Descuentos por promoción */}
          {Object.keys(preview.sf.porDescuento).length > 0 && (
            <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
              <h3 className="text-white font-semibold mb-3">Descuentos por promoción — ambos locales</h3>
              <div className="flex flex-col gap-2">
                {Object.entries(
                  [...Object.entries(preview.sf.porDescuento), ...Object.entries(preview.la.porDescuento)]
                    .reduce((acc, [name, d]) => {
                      if (!acc[name]) acc[name] = { amount: 0, orders: 0 }
                      acc[name].amount += d.amount
                      acc[name].orders += d.orders
                      return acc
                    }, {})
                ).sort((a, b) => b[1].amount - a[1].amount).map(([name, d]) => (
                  <div key={name} className="flex justify-between items-center">
                    <span className="text-gray-300 text-sm">{name}</span>
                    <div className="flex gap-3 text-sm">
                      <span className="text-gray-500">{d.orders} usos</span>
                      <span className="text-red-400 font-semibold">-${Math.round(d.amount).toLocaleString('es-CL')}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Acciones */}
          <div className="flex gap-3">
            <button
              onClick={() => setPreview(null)}
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
  const [ultimosPeriodos, setUltimosPeriodos] = useState(null)

  useEffect(() => {
    async function fetchUltimos() {
      const { data } = await supabase
        .from('platform_settlements')
        .select('period_start, period_end, location_id, locations(short_code)')
        .eq('platform', 'pedidosya')
        .order('period_end', { ascending: false })
        .limit(4)
      if (data && data.length > 0) setUltimosPeriodos(data)
    }
    fetchUltimos()
  }, [success])

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
      // range:1 salta la fila 0 (super-encabezados de grupo) y usa fila 1 como headers reales
      const rows = XLSX.utils.sheet_to_json(ws, { range: 1 })

      if (rows.length === 0) throw new Error('El archivo no tiene datos')

      setArchivo(file.name)
      const resultado = procesarPeya(rows)
      setPreview(resultado)

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
    // Parsear fecha DD/MM/YYYY (formato PedidosYa Chile)
    function parseFecha(val) {
      if (!val) return new Date(NaN)
      if (typeof val === 'string' && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(val)) {
        const [d, m, y] = val.split('/')
        return new Date(`${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`)
      }
      return new Date(val)
    }

    // Mapear nombre de local a código
    const mapLocal = (val) => {
      if (!val) return null
      const s = val.toString().toLowerCase()
      if (s.includes('san felipe')) return 'SF'
      if (s.includes('andes')) return 'LA'
      return null
    }

    // Detectar período desde columna "Fecha del pedido"
    const fechas = rows
      .map(r => parseFecha(r['Fecha del pedido']))
      .filter(d => !isNaN(d))
      .sort((a, b) => a - b)
    const period_start = fechas[0]?.toISOString().split('T')[0]
    const period_end = fechas[fechas.length - 1]?.toISOString().split('T')[0]

    // Acumular por local
    const porLocal = {
      SF: { gross: 0, net: 0, commission: 0, plus: 0, desc_local: 0, desc_peya: 0, orders: 0 },
      LA: { gross: 0, net: 0, commission: 0, plus: 0, desc_local: 0, desc_peya: 0, orders: 0 },
    }

    for (const row of rows) {
      const loc = mapLocal(row['Local'])
      if (!loc) continue

      porLocal[loc].gross       += parseFloat(row['Total del pedido'] || 0)
      porLocal[loc].net         += parseFloat(row['Total pagado por el usuario'] || 0)
      porLocal[loc].commission  += parseFloat(row['Comisión por pedido'] || 0)
      porLocal[loc].plus        += parseFloat(row['Costo por pedido plus'] || 0)
      porLocal[loc].desc_local  += parseFloat(row['Descuento en productos subsidiado por el local'] || 0)
                                 + parseFloat(row['Cupón pagado por el local'] || 0)
      porLocal[loc].desc_peya   += parseFloat(row['Descuento al usuario pagado por PedidosYa'] || 0)
      porLocal[loc].orders      += 1
    }

    const net_sales_total = Math.round(porLocal.SF.net + porLocal.LA.net)
    const commission_total = Math.round(porLocal.SF.commission + porLocal.LA.commission)
    const plus_total = Math.round(porLocal.SF.plus + porLocal.LA.plus)

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

      // Categoría para el gasto de comisión (entra al P&L)
      const { data: catCom } = await supabase
        .from('expense_categories').select('id').eq('name', 'Comisiones').single()

      let huboActualizacion = false

      for (const locCode of ['SF', 'LA']) {
        const d = preview.porLocal[locCode]
        const locId = locationMap[locCode]

        const settlementFields = {
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
        }

        // Protección re-importación: si ya existe esta semana+local, actualiza en vez de duplicar
        const { data: settleExiste } = await supabase
          .from('platform_settlements').select('id')
          .eq('platform', 'pedidosya')
          .eq('period_start', preview.period_start)
          .eq('location_id', locId)
        if (settleExiste && settleExiste.length > 0) {
          huboActualizacion = true
          await supabase.from('platform_settlements').update(settlementFields).eq('id', settleExiste[0].id)
        } else {
          await supabase.from('platform_settlements').insert(settlementFields)
        }

        // Gasto de comisión PedidosYa = Comisión por pedido + Cargos Plus.
        // El monto liquidado incluye IVA → amount_total = total deducido, neto = /1.19.
        const comisionTotal = Math.round(Math.abs(d.commission) + Math.abs(d.plus))
        if (comisionTotal > 0 && catCom?.id) {
          const gastoFields = {
            location_id: locId,
            category_id: catCom.id,
            supplier: 'PedidosYa',
            description: `Comisión PedidosYa ${preview.period_start} a ${preview.period_end}`,
            amount_net: Math.round(comisionTotal / 1.19),
            amount_total: comisionTotal,
            has_iva: true,
            document_type: 'factura',
            document_number: null,
            expense_date: preview.period_end,
            payment_method: 'transferencia',
            notes: 'Generado automáticamente desde la liquidación PedidosYa (comisión + cargos plus, IVA incluido).',
          }
          // Mismo criterio: actualiza el gasto de la semana si ya existía
          const { data: gastoExiste } = await supabase
            .from('operating_expenses').select('id')
            .eq('location_id', locId)
            .eq('category_id', catCom.id)
            .eq('supplier', 'PedidosYa')
            .eq('expense_date', preview.period_end)
          if (gastoExiste && gastoExiste.length > 0) {
            await supabase.from('operating_expenses').update(gastoFields).eq('id', gastoExiste[0].id)
          } else {
            await supabase.from('operating_expenses').insert(gastoFields)
          }
        }
      }

      setSuccess(huboActualizacion ? 'actualizado' : true)
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

      {/* Últimos períodos guardados */}
      {ultimosPeriodos && (() => {
        // Deduplicar por period_start+period_end (SF y LA comparten mismas fechas)
        const vistos = new Set()
        const unicos = ultimosPeriodos.filter(p => {
          const key = `${p.period_start}_${p.period_end}`
          if (vistos.has(key)) return false
          vistos.add(key)
          return true
        })
        return (
          <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
            <p className="text-gray-400 text-xs uppercase tracking-wide mb-2">Últimas semanas importadas</p>
            <div className="flex flex-col gap-1">
              {unicos.map((p, i) => (
                <div key={i} className="flex justify-between items-center">
                  <span className={`text-sm ${i === 0 ? 'text-white font-semibold' : 'text-gray-400'}`}>
                    {new Date(p.period_start + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}
                    {' → '}
                    {new Date(p.period_end + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                  {i === 0 && <span className="text-xs bg-orange-900/50 text-orange-400 px-2 py-0.5 rounded-full">último</span>}
                </div>
              ))}
            </div>
          </div>
        )
      })()}

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
                            ? ((preview.porLocal[loc].commission / preview.porLocal[loc].net) * 100).toFixed(1)
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
          <p className="font-semibold">
            {success === 'actualizado'
              ? '🔄 Semana ya existía — liquidación y gasto actualizados (sin duplicar)'
              : '✅ Liquidación guardada + gasto de comisión creado (SF y LA)'}
          </p>
          <button onClick={() => { setSuccess(false); setPdf({ period_start: '', period_end: '', net_sales: '', commission: '', plus_charges: '', reimbursements: '', taxes: '', total_settled: '' }) }}
            className="text-green-400 text-sm mt-2 underline">Importar otra semana</button>
        </div>
      )}

      {/* Gasto de comisión que se creará en el P&L */}
      {!success && preview && (
        <div className="bg-gray-900 rounded-2xl p-4 border border-orange-500/40">
          <h3 className="text-white font-semibold mb-1">Gasto de comisión que se creará</h3>
          <p className="text-gray-500 text-xs mb-3">
            Comisión + cargos plus, por local, categoría Comisiones. Entra a Resultados.
            Se asume que el monto liquidado <span className="text-white">incluye IVA</span> (neto = total ÷ 1,19).
          </p>
          <div className="grid grid-cols-2 gap-4">
            {['SF', 'LA'].map(loc => {
              const d = preview.porLocal[loc]
              const total = Math.round(Math.abs(d.commission) + Math.abs(d.plus))
              return (
                <div key={loc}>
                  <p className="text-orange-400 text-xs font-semibold mb-1">{loc === 'SF' ? 'San Felipe' : 'Los Andes'}</p>
                  <p className="text-white font-bold">${Math.round(total / 1.19).toLocaleString('es-CL')} <span className="text-gray-500 text-xs font-normal">neto</span></p>
                  <p className="text-gray-500 text-xs">${total.toLocaleString('es-CL')} c/IVA</p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {!success && preview && (
        <button onClick={guardarLiquidacion} disabled={guardando || !pdf.period_start || !pdf.period_end}
          className="bg-orange-500 hover:bg-orange-600 text-white rounded-xl p-3 font-semibold transition disabled:opacity-50">
          {guardando ? 'Guardando...' : 'Guardar liquidación + gasto'}
        </button>
      )}

    </div>
  )
}

// ─── IMPORTADOR MERCADOPAGO (comisión prorrateada por ventas tarjeta) ─────────

function ImportadorMercadoPago() {
  const now = new Date()
  const [year, setYear]   = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [netTotal, setNetTotal]     = useState('')   // neto de la factura MercadoPago
  const [docNumber, setDocNumber]   = useState('')
  const [preview, setPreview]   = useState(null)
  const [calculando, setCalculando] = useState(false)
  const [guardando, setGuardando]   = useState(false)
  const [success, setSuccess]   = useState(false)
  const [yaExiste, setYaExiste] = useState(false)
  const [error, setError]       = useState(null)

  const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
  const mm = String(month).padStart(2, '0')
  const periodStart = `${year}-${mm}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const expenseDate = `${year}-${mm}-${String(lastDay).padStart(2, '0')}`

  async function calcularProrrateo() {
    const neto = parseFloat(netTotal)
    if (!neto || neto <= 0) { setError('Ingresa el monto neto de la factura.'); return }
    setCalculando(true)
    setError(null)
    setPreview(null)
    setSuccess(false)
    try {
      const { data: locations } = await supabase.from('locations').select('id, short_code')
      const locMap = Object.fromEntries((locations || []).map(l => [l.short_code, l.id]))

      // Ventas con Tarjeta por local en el mes (única base que procesa MercadoPago)
      const { data: pagos } = await supabase
        .from('sales_by_payment_method')
        .select('amount, location_id, period_id, sales_periods!inner(period_start)')
        .eq('payment_method', 'Tarjeta')
        .eq('sales_periods.period_start', periodStart)

      // Dedupe: sales_by_payment_method puede tener filas duplicadas →
      // tomar una sola fila Tarjeta por período antes de sumar.
      const tarjetaPorLocal = { SF: 0, LA: 0 }
      const periodosVistos = new Set()
      for (const p of (pagos || [])) {
        if (periodosVistos.has(p.period_id)) continue
        periodosVistos.add(p.period_id)
        if (p.location_id === locMap.SF) tarjetaPorLocal.SF += p.amount || 0
        else if (p.location_id === locMap.LA) tarjetaPorLocal.LA += p.amount || 0
      }
      const totalTarjeta = tarjetaPorLocal.SF + tarjetaPorLocal.LA
      if (totalTarjeta === 0) {
        throw new Error(`No hay ventas con Tarjeta importadas para ${MESES[month - 1]} ${year}. Importa primero las ventas de Justo.`)
      }

      // ¿Ya se cargó esta comisión este mes? (evita duplicar en el P&L)
      const { data: catCom } = await supabase.from('expense_categories').select('id').eq('name', 'Comisiones').single()
      const { data: existentes } = await supabase
        .from('operating_expenses')
        .select('id')
        .eq('category_id', catCom?.id)
        .eq('supplier', 'Mercado Pago')
        .gte('expense_date', periodStart)
        .lte('expense_date', expenseDate)
      setYaExiste((existentes || []).length > 0)

      const filas = ['SF', 'LA'].map(code => {
        const tarjeta = tarjetaPorLocal[code]
        const share   = tarjeta / totalTarjeta
        const net     = Math.round(neto * share)
        return { code, tarjeta, share, net, total: Math.round(net * 1.19) }
      })

      setPreview({ filas, totalTarjeta, neto, categoryId: catCom?.id, locMap })
    } catch (err) {
      setError(err.message)
    }
    setCalculando(false)
  }

  async function guardarGastos() {
    if (!preview) return
    setGuardando(true)
    setError(null)
    try {
      const rows = preview.filas.map(f => ({
        location_id: preview.locMap[f.code],
        category_id: preview.categoryId || null,
        supplier: 'Mercado Pago',
        description: `Comisión MercadoPago ${MESES[month - 1]} ${year} (prorrateo ${(f.share * 100).toFixed(1)}% ventas tarjeta)`,
        amount_net: f.net,
        amount_total: f.total,
        has_iva: true,
        document_type: 'factura',
        document_number: docNumber || null,
        expense_date: expenseDate,
        payment_method: 'transferencia',
        notes: `Prorrateo automático sobre $${preview.totalTarjeta.toLocaleString('es-CL')} de ventas tarjeta del mes.`,
      }))
      const { error: insErr } = await supabase.from('operating_expenses').insert(rows)
      if (insErr) throw insErr
      setSuccess(true)
      setPreview(null)
    } catch (err) {
      setError(err.message)
    }
    setGuardando(false)
  }

  return (
    <div className="flex flex-col gap-4">

      <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 text-sm text-gray-400">
        La factura de MercadoPago es un solo total de la empresa. El sistema lo reparte entre SF y LA
        en proporción a las <span className="text-white font-medium">ventas con Tarjeta</span> de cada local
        (lo único que procesa MercadoPago) y crea un gasto por local en la categoría <span className="text-white font-medium">Comisiones</span>.
      </div>

      {!success && (
        <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 flex flex-col gap-3">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-gray-400 text-xs mb-1 block">Mes</label>
              <select value={month} onChange={e => { setMonth(Number(e.target.value)); setPreview(null) }}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm">
                {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div className="w-28">
              <label className="text-gray-400 text-xs mb-1 block">Año</label>
              <select value={year} onChange={e => { setYear(Number(e.target.value)); setPreview(null) }}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm">
                {[now.getFullYear() - 1, now.getFullYear()].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-gray-400 text-xs mb-1 block">Monto neto factura (sin IVA)</label>
              <input type="number" value={netTotal} onChange={e => { setNetTotal(e.target.value); setPreview(null) }}
                placeholder="$191.055" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" />
            </div>
            <div className="flex-1">
              <label className="text-gray-400 text-xs mb-1 block">N° factura (opcional)</label>
              <input type="text" value={docNumber} onChange={e => setDocNumber(e.target.value)}
                placeholder="2747776" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" />
            </div>
          </div>
          <button onClick={calcularProrrateo} disabled={calculando}
            className="bg-orange-500 hover:bg-orange-600 text-white rounded-xl p-3 font-semibold transition disabled:opacity-50">
            {calculando ? 'Calculando...' : 'Calcular prorrateo'}
          </button>
        </div>
      )}

      {error && <div className="bg-red-950 border border-red-800 text-red-300 rounded-xl p-4">❌ {error}</div>}

      {success && (
        <div className="bg-green-900 border border-green-700 text-green-300 rounded-xl p-4">
          <p className="font-semibold">✅ Comisión MercadoPago cargada a gastos (SF y LA)</p>
          <button onClick={() => { setSuccess(false); setNetTotal(''); setDocNumber('') }}
            className="text-green-400 text-sm mt-2 underline">Cargar otro mes</button>
        </div>
      )}

      {preview && (
        <>
          {yaExiste && (
            <div className="bg-yellow-950/40 border border-yellow-800/50 text-yellow-300 rounded-xl p-3 text-sm">
              ⚠️ Ya existe una comisión MercadoPago cargada para {MESES[month - 1]} {year}. Si guardas, quedará duplicada en el P&L.
            </div>
          )}
          <div className="bg-gray-900 rounded-2xl p-4 border border-orange-500">
            <p className="text-orange-400 text-xs uppercase tracking-wide mb-3">
              Prorrateo {MESES[month - 1]} {year} · base ${preview.totalTarjeta.toLocaleString('es-CL')} ventas tarjeta
            </p>
            <div className="grid grid-cols-2 gap-4">
              {preview.filas.map(f => (
                <div key={f.code} className="bg-gray-800/60 rounded-xl p-3">
                  <p className="text-orange-400 text-sm font-semibold mb-1">{f.code === 'SF' ? 'San Felipe' : 'Los Andes'}</p>
                  <p className="text-gray-500 text-xs">Tarjeta: ${f.tarjeta.toLocaleString('es-CL')} ({(f.share * 100).toFixed(1)}%)</p>
                  <p className="text-white font-bold text-lg mt-1">${f.net.toLocaleString('es-CL')} <span className="text-gray-500 text-xs font-normal">neto</span></p>
                  <p className="text-gray-500 text-xs">${f.total.toLocaleString('es-CL')} c/IVA</p>
                </div>
              ))}
            </div>
            <p className="text-gray-500 text-xs mt-3">Se crearán 2 gastos tipo factura con fecha {expenseDate}, categoría Comisiones.</p>
          </div>

          <div className="flex gap-3">
            <button onClick={() => setPreview(null)}
              className="flex-1 bg-gray-800 hover:bg-gray-700 text-white rounded-xl p-3 font-semibold transition">Cancelar</button>
            <button onClick={guardarGastos} disabled={guardando}
              className="flex-1 bg-orange-500 hover:bg-orange-600 text-white rounded-xl p-3 font-semibold transition disabled:opacity-50">
              {guardando ? 'Guardando...' : 'Guardar gastos'}
            </button>
          </div>
        </>
      )}

    </div>
  )
}