'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'

const supabase = createClient()
const diasSemana = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

export default function Ventas() {
  const [periodos, setPeriodos] = useState([])   // meses únicos
  const [mesKey, setMesKey] = useState(null)     // 'YYYY-MM'
  const [loc, setLoc] = useState('AMBOS')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  // Cargar lista de meses disponibles
  useEffect(() => {
    async function fetchMeses() {
      const { data } = await supabase
        .from('sales_periods')
        .select('id, period_start, period_end, location_id, locations(short_code)')
        .order('period_start', { ascending: false })

      if (!data || data.length === 0) { setLoading(false); return }

      // Agrupar por mes
      const mesesMap = {}
      for (const p of data) {
        const key = p.period_start.substring(0, 7)
        if (!mesesMap[key]) mesesMap[key] = { key, period_start: p.period_start, period_end: p.period_end, periodos: [] }
        mesesMap[key].periodos.push(p)
      }
      const meses = Object.values(mesesMap).sort((a, b) => b.key.localeCompare(a.key))
      setPeriodos(meses)
      setMesKey(meses[0].key)
    }
    fetchMeses()
  }, [])

  // Cargar datos cuando cambia mes o local
  useEffect(() => {
    if (!mesKey || periodos.length === 0) return
    fetchData()
  }, [mesKey, loc, periodos])

  async function fetchData() {
    setLoading(true)

    const mes = periodos.find(m => m.key === mesKey)
    if (!mes) return

    const { data: locations } = await supabase.from('locations').select('id, short_code')
    const locationMap = {}
    for (const l of locations) locationMap[l.short_code] = l.id

    // Determinar qué período(s) cargar
    let periodIds = []
    if (loc === 'AMBOS') {
      periodIds = mes.periodos.map(p => p.id)
    } else {
      const locId = locationMap[loc]
      const p = mes.periodos.find(p => p.location_id === locId)
      if (p) periodIds = [p.id]
    }

    if (periodIds.length === 0) { setData(null); setLoading(false); return }

    // Cargar todos los datos en paralelo
    const [{ data: periods }, { data: canales }, { data: dias }, { data: productos }] = await Promise.all([
      supabase.from('sales_periods').select('*').in('id', periodIds),
      supabase.from('sales_by_channel').select('*').in('period_id', periodIds),
      supabase.from('sales_by_weekday').select('*').in('period_id', periodIds).order('weekday'),
      supabase.from('sales_top_products').select('*').in('period_id', periodIds).order('rank'),
    ])

    // Combinar si son múltiples períodos
    const combined = combinarPeriodos(periods || [])

    // Combinar canales
    const canalesMap = {}
    for (const c of (canales || [])) {
      const key = c.channel
      if (!canalesMap[key]) canalesMap[key] = { channel: key, sales: 0, orders: 0 }
      canalesMap[key].sales += c.sales
      canalesMap[key].orders += c.orders
    }
    const canalesCombinados = Object.values(canalesMap).map(c => ({
      ...c,
      pct_of_location: combined.total_sales > 0 ? Math.round((c.sales / combined.total_sales) * 10000) / 100 : 0
    })).sort((a, b) => b.sales - a.sales)

    // Combinar días
    const diasMap = {}
    for (const d of (dias || [])) {
      if (!diasMap[d.weekday]) diasMap[d.weekday] = { weekday: d.weekday, sales: 0, orders: 0 }
      diasMap[d.weekday].sales += d.sales
      diasMap[d.weekday].orders += d.orders
    }
    const diasCombinados = Object.values(diasMap)
      .map(d => ({ ...d, avg_ticket: d.orders > 0 ? Math.round(d.sales / d.orders) : 0 }))
      .sort((a, b) => a.weekday - b.weekday)

    // Top productos (usar el primero si hay dos, son globales)
    const productosUnicos = []
    const vistos = new Set()
    for (const p of (productos || [])) {
      if (!vistos.has(p.product_name)) {
        vistos.add(p.product_name)
        productosUnicos.push(p)
      }
    }

    // Liquidaciones PedidosYa del mes
    let settlementsQuery = supabase
      .from('platform_settlements')
      .select('*')
      .eq('platform', 'pedidosya')
      .gte('period_start', mesKey + '-01')
      .lte('period_start', mesKey + '-31')
      .order('period_start')

    if (loc !== 'AMBOS') {
      settlementsQuery = settlementsQuery.eq('location_id', locationMap[loc])
    }
    const { data: settlements } = await settlementsQuery

    setData({ periodo: combined, canales: canalesCombinados, dias: diasCombinados, productos: productosUnicos, settlements: settlements || [] })
    setLoading(false)
  }

  function combinarPeriodos(periods) {
    if (periods.length === 1) return periods[0]
    return {
      period_start: periods[0].period_start,
      period_end: periods[0].period_end,
      total_sales: periods.reduce((s, p) => s + p.total_sales, 0),
      total_orders: periods.reduce((s, p) => s + p.total_orders, 0),
      avg_ticket: Math.round(periods.reduce((s, p) => s + p.total_sales, 0) / periods.reduce((s, p) => s + p.total_orders, 0)),
      daily_avg: periods.reduce((s, p) => s + p.daily_avg, 0),
      delivery_sales: periods.reduce((s, p) => s + p.delivery_sales, 0),
      delivery_orders: periods.reduce((s, p) => s + p.delivery_orders, 0),
      delivery_avg_ticket: Math.round(periods.reduce((s, p) => s + p.delivery_sales, 0) / periods.reduce((s, p) => s + p.delivery_orders, 0)),
      presencial_sales: periods.reduce((s, p) => s + p.presencial_sales, 0),
      presencial_orders: periods.reduce((s, p) => s + p.presencial_orders, 0),
      presencial_avg_ticket: Math.round(periods.reduce((s, p) => s + p.presencial_sales, 0) / periods.reduce((s, p) => s + p.presencial_orders, 0)),
      total_discounts: periods.reduce((s, p) => s + p.total_discounts, 0),
      discount_pct: Math.round(periods.reduce((s, p) => s + p.discount_pct, 0) / periods.length * 100) / 100,
      orders_with_discount: periods.reduce((s, p) => s + p.orders_with_discount, 0),
      voided_orders: periods.reduce((s, p) => s + p.voided_orders, 0),
      voided_amount: periods.reduce((s, p) => s + p.voided_amount, 0),
      best_day_date: periods.reduce((a, p) => p.best_day_amount > a.best_day_amount ? p : a).best_day_date,
      best_day_amount: Math.max(...periods.map(p => p.best_day_amount)),
      worst_day_date: periods.reduce((a, p) => p.worst_day_amount < a.worst_day_amount ? p : a).worst_day_date,
      worst_day_amount: Math.min(...periods.map(p => p.worst_day_amount)),
    }
  }

  const maxDia = data?.dias?.length > 0 ? Math.max(...data.dias.map(d => d.sales)) : 1

  return (
    <main className="min-h-screen bg-gray-950 p-4 md:p-8">
      <div className="max-w-4xl mx-auto">

        <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-2xl font-bold text-white">📊 Ventas</h1>
          <div className="flex items-center gap-3 flex-wrap">

            {/* Selector de mes */}
            {periodos.length > 0 && (
              <select
                value={mesKey || ''}
                onChange={e => setMesKey(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-sm"
              >
                {periodos.map(m => (
                  <option key={m.key} value={m.key}>
                    {new Date(m.period_start + 'T12:00:00').toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })}
                  </option>
                ))}
              </select>
            )}

            {/* Toggle SF / LA / Ambos */}
            <div className="flex items-center bg-gray-800 rounded-lg p-1 gap-1">
              {['SF', 'LA', 'AMBOS'].map(l => (
                <button
                  key={l}
                  onClick={() => setLoc(l)}
                  className={`px-3 py-1 rounded-md text-sm font-medium transition ${
                    loc === l ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>

            <Link
              href="/ventas/importar"
              className="bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold px-3 py-1.5 rounded-lg transition"
            >
              + Importar
            </Link>
          </div>
        </div>

        {loading ? (
          <p className="text-gray-500">Cargando...</p>
        ) : !data ? (
          <div className="bg-gray-900 rounded-2xl p-8 border border-gray-800 text-center">
            <p className="text-4xl mb-3">📭</p>
            <p className="text-white font-semibold mb-1">No hay períodos importados</p>
            <p className="text-gray-500 text-sm mb-4">Sube el Excel mensual de Justo Hub para empezar</p>
            <Link href="/ventas/importar" className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-semibold transition">
              Importar ventas
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-4">

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Ventas totales', value: `$${data.periodo.total_sales.toLocaleString('es-CL')}`, color: 'text-white' },
                { label: 'Órdenes', value: data.periodo.total_orders.toLocaleString('es-CL'), color: 'text-white' },
                { label: 'Ticket promedio', value: `$${data.periodo.avg_ticket.toLocaleString('es-CL')}`, color: 'text-green-400' },
                { label: 'Promedio diario', value: `$${data.periodo.daily_avg.toLocaleString('es-CL')}`, color: 'text-blue-400' },
              ].map(kpi => (
                <div key={kpi.label} className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
                  <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">{kpi.label}</p>
                  <p className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</p>
                </div>
              ))}
            </div>

            {/* Delivery vs Presencial */}
            <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
              <h3 className="text-white font-semibold mb-3">Delivery vs Presencial</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-gray-400 text-xs mb-1">Delivery</p>
                  <p className="text-white font-bold text-lg">${data.periodo.delivery_sales.toLocaleString('es-CL')}</p>
                  <p className="text-gray-500 text-xs mt-1">{data.periodo.delivery_orders} órdenes · ticket ${data.periodo.delivery_avg_ticket?.toLocaleString('es-CL')}</p>
                  <p className="text-orange-400 text-xs mt-1">
                    {data.periodo.total_sales > 0 ? ((data.periodo.delivery_sales / data.periodo.total_sales) * 100).toFixed(1) : 0}% del total
                  </p>
                </div>
                <div>
                  <p className="text-gray-400 text-xs mb-1">Presencial</p>
                  <p className="text-white font-bold text-lg">${data.periodo.presencial_sales.toLocaleString('es-CL')}</p>
                  <p className="text-gray-500 text-xs mt-1">{data.periodo.presencial_orders} órdenes · ticket ${data.periodo.presencial_avg_ticket?.toLocaleString('es-CL')}</p>
                  <p className="text-orange-400 text-xs mt-1">
                    {data.periodo.total_sales > 0 ? ((data.periodo.presencial_sales / data.periodo.total_sales) * 100).toFixed(1) : 0}% del total
                  </p>
                </div>
              </div>
            </div>

            {/* Canales */}
            {data.canales.length > 0 && (
              <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
                <h3 className="text-white font-semibold mb-3">Por canal</h3>
                <div className="flex flex-col gap-2">
                  {data.canales.map((c, i) => (
                    <div key={i} className="flex justify-between items-center py-1 border-b border-gray-800 last:border-0">
                      <span className="text-gray-300 text-sm capitalize">{c.channel}</span>
                      <div className="text-right">
                        <span className="text-white text-sm font-semibold">${c.sales.toLocaleString('es-CL')}</span>
                        <span className="text-gray-500 text-xs ml-2">{c.pct_of_location}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Liquidaciones PedidosYa */}
            {data.settlements && data.settlements.length > 0 && (() => {
              // Agrupar por semana (period_start + period_end), sumando SF y LA si es AMBOS
              const semanaMap = {}
              for (const s of data.settlements) {
                const key = s.period_start + '_' + s.period_end
                if (!semanaMap[key]) semanaMap[key] = { period_start: s.period_start, period_end: s.period_end, gross: 0, commission: 0, plus: 0, net: 0, settled: 0, orders: 0 }
                semanaMap[key].gross      += s.gross_sales || 0
                semanaMap[key].commission += s.commission || 0
                semanaMap[key].plus       += s.plus_charges || 0
                semanaMap[key].net        += s.net_sales || 0
                semanaMap[key].settled    += s.total_settled || 0
                semanaMap[key].orders     += s.orders_count || 0
              }
              const semanas = Object.values(semanaMap).sort((a, b) => a.period_start.localeCompare(b.period_start))
              const totalGross      = semanas.reduce((s, w) => s + w.gross, 0)
              const totalCommission = semanas.reduce((s, w) => s + w.commission + w.plus, 0)
              const totalSettled    = semanas.reduce((s, w) => s + (w.settled || (w.net - w.commission - w.plus)), 0)
              const pctComision     = totalGross > 0 ? ((totalCommission / totalGross) * 100).toFixed(1) : 0

              return (
                <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
                  <div className="flex items-center gap-2 mb-4">
                    <h3 className="text-white font-semibold">Liquidaciones PedidosYa</h3>
                    <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded font-medium">🛵 PeYa</span>
                  </div>

                  {/* Resumen del mes */}
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    <div className="bg-gray-800 rounded-xl p-3">
                      <p className="text-gray-400 text-xs mb-1">Ventas brutas</p>
                      <p className="text-white font-bold">${totalGross.toLocaleString('es-CL')}</p>
                      <p className="text-gray-500 text-xs mt-1">Lo que pagaron clientes</p>
                    </div>
                    <div className="bg-gray-800 rounded-xl p-3">
                      <p className="text-gray-400 text-xs mb-1">Cobros PeYa</p>
                      <p className="text-red-400 font-bold">-${totalCommission.toLocaleString('es-CL')}</p>
                      <p className="text-gray-500 text-xs mt-1">{pctComision}% efectivo</p>
                    </div>
                    <div className="bg-gray-800 rounded-xl p-3">
                      <p className="text-gray-400 text-xs mb-1">Neto recibido</p>
                      <p className="text-green-400 font-bold">${totalSettled.toLocaleString('es-CL')}</p>
                      <p className="text-gray-500 text-xs mt-1">Lo que te depositan</p>
                    </div>
                  </div>

                  {/* Detalle por semana */}
                  <p className="text-gray-500 text-xs uppercase tracking-wide mb-2">Por semana</p>
                  <div className="flex flex-col gap-1">
                    {semanas.map((s, i) => {
                      const cobros = s.commission + s.plus
                      const neto   = s.settled || (s.net - cobros)
                      const pct    = s.gross > 0 ? ((cobros / s.gross) * 100).toFixed(1) : 0
                      return (
                        <div key={i} className="flex justify-between items-center py-2 border-b border-gray-800 last:border-0 text-sm">
                          <div>
                            <span className="text-gray-300">
                              {new Date(s.period_start + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}
                              {' – '}
                              {new Date(s.period_end + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}
                            </span>
                            <span className="text-gray-600 text-xs ml-2">{s.orders} órdenes</span>
                          </div>
                          <div className="flex gap-4 items-center">
                            <span className="text-gray-500 text-xs">${s.gross.toLocaleString('es-CL')}</span>
                            <span className="text-red-400 text-xs">-${cobros.toLocaleString('es-CL')} <span className="text-gray-600">({pct}%)</span></span>
                            <span className="text-green-400 font-semibold">${neto.toLocaleString('es-CL')}</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })()}

            {/* Descuentos */}
            <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
              <h3 className="text-white font-semibold mb-3">Descuentos y anulaciones</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-gray-400 text-xs mb-1">Total descuentos</p>
                  <p className="text-red-400 font-bold">${data.periodo.total_discounts.toLocaleString('es-CL')}</p>
                  <p className="text-gray-500 text-xs mt-1">{data.periodo.discount_pct}% del subtotal</p>
                  <p className="text-gray-500 text-xs">{data.periodo.orders_with_discount} órdenes con descuento</p>
                </div>
                <div>
                  <p className="text-gray-400 text-xs mb-1">Anulaciones</p>
                  <p className="text-red-400 font-bold">{data.periodo.voided_orders} órdenes</p>
                  <p className="text-gray-500 text-xs mt-1">${data.periodo.voided_amount.toLocaleString('es-CL')} potencial perdido</p>
                </div>
              </div>
            </div>

            {/* Días destacados */}
            <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
              <h3 className="text-white font-semibold mb-3">Días destacados</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-gray-400 text-xs mb-1">🏆 Mejor día</p>
                  <p className="text-green-400 font-bold">${data.periodo.best_day_amount.toLocaleString('es-CL')}</p>
                  <p className="text-gray-500 text-xs mt-1">
                    {new Date(data.periodo.best_day_date + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </p>
                </div>
                <div>
                  <p className="text-gray-400 text-xs mb-1">📉 Peor día</p>
                  <p className="text-red-400 font-bold">${data.periodo.worst_day_amount.toLocaleString('es-CL')}</p>
                  <p className="text-gray-500 text-xs mt-1">
                    {new Date(data.periodo.worst_day_date + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </p>
                </div>
              </div>
            </div>

            {/* Días de semana */}
            {data.dias.length > 0 && (
              <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
                <h3 className="text-white font-semibold mb-3">Por día de semana</h3>
                <div className="flex flex-col gap-2">
                  {data.dias.map(dia => (
                    <div key={dia.weekday} className="flex justify-between items-center">
                      <span className="text-gray-400 text-sm w-24">{diasSemana[dia.weekday]}</span>
                      <div className="flex-1 mx-3 bg-gray-800 rounded-full h-2">
                        <div
                          className="bg-orange-500 h-2 rounded-full transition-all"
                          style={{ width: `${(dia.sales / maxDia) * 100}%` }}
                        />
                      </div>
                      <span className="text-white text-sm w-28 text-right">${dia.sales.toLocaleString('es-CL')}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Top productos */}
            {data.productos.length > 0 && (
              <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
                <h3 className="text-white font-semibold mb-3">Top productos</h3>
                <div className="flex flex-col gap-2">
                  {data.productos.slice(0, 10).map(p => (
                    <div key={p.id} className="flex justify-between items-center py-1 border-b border-gray-800 last:border-0">
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
            )}

          </div>
        )}
      </div>
    </main>
  )
}