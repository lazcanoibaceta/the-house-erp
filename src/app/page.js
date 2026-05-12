'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useLocation } from '@/hooks/useLocation'
import Link from 'next/link'

const supabase = createClient()

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

export default function Home() {
  const { locationCode, locationId, loading: locationLoading } = useLocation()

  // KPIs operativos (del local activo)
  const [kpis, setKpis]     = useState(null)
  const [periodo, setPeriodo] = useState(null)
  const [loading, setLoading] = useState(true)

  // IDs de ambos locales (para calcular food cost de cada uno)
  const [locIds, setLocIds] = useState({})  // { SF: uuid, LA: uuid }

  // Food Cost por local: { SF: { value, invInicial, ... } | null, LA: ... }
  const [fcCaches, setFcCaches]   = useState({ SF: null, LA: null })
  const [calculando, setCalculando] = useState({ SF: false, LA: false })
  const [fcErrors, setFcErrors]     = useState({ SF: '', LA: '' })

  // 1. Cargar IDs de locales una sola vez
  useEffect(() => {
    supabase
      .from('locations')
      .select('id, short_code')
      .then(({ data }) => {
        const map = {}
        ;(data || []).forEach(l => { map[l.short_code] = l.id })
        setLocIds(map)
      })
  }, [])

  // 2. Cuando tenemos los IDs, leer caches de localStorage
  useEffect(() => {
    if (!locIds.SF || !locIds.LA) return
    const cacheSF = localStorage.getItem(`foodcost_${locIds.SF}`)
    const cacheLA = localStorage.getItem(`foodcost_${locIds.LA}`)
    setFcCaches({
      SF: cacheSF ? JSON.parse(cacheSF) : null,
      LA: cacheLA ? JSON.parse(cacheLA) : null,
    })
  }, [locIds])

  // 3. KPIs del local activo (ticket, labor, descuentos)
  useEffect(() => {
    if (!locationId) return
    fetchKpis()
  }, [locationId])

  async function fetchKpis() {
    setLoading(true)

    const { data: periodos } = await supabase
      .from('sales_periods')
      .select('*')
      .eq('location_id', locationId)
      .order('period_start', { ascending: false })
      .limit(1)

    if (!periodos || periodos.length === 0) {
      setKpis(null)
      setLoading(false)
      return
    }

    const p = periodos[0]
    setPeriodo(p)

    const mes  = new Date(p.period_start + 'T12:00:00').getMonth() + 1
    const anio = new Date(p.period_start + 'T12:00:00').getFullYear()

    const { data: labor } = await supabase
      .from('labor_costs')
      .select('amount')
      .eq('location_id', locationId)
      .eq('period_year', anio)
      .eq('period_month', mes)
      .single()

    const ventasNetas = parseFloat(p.total_sales) / 1.19
    const laborCost   = labor ? (parseFloat(labor.amount) / ventasNetas) * 100 : null

    setKpis({ laborCost, avgTicket: parseFloat(p.avg_ticket), discountPct: parseFloat(p.discount_pct), ventasNetas })
    setLoading(false)
  }

  // ── Cálculo real de Food Cost para un local específico ─────────────────────
  async function calcularFoodCost(code, locId) {
    if (!locId) return
    setCalculando(prev => ({ ...prev, [code]: true }))
    setFcErrors(prev => ({ ...prev, [code]: '' }))

    const { data: counts } = await supabase
      .from('inventory_counts')
      .select('id, date')
      .eq('location_id', locId)
      .eq('count_type', 'cierre_mes')
      .order('date', { ascending: false })
      .limit(2)

    if (!counts || counts.length < 2) {
      setFcErrors(prev => ({ ...prev, [code]: 'Necesitas 2 conteos de cierre de mes.' }))
      setCalculando(prev => ({ ...prev, [code]: false }))
      return
    }

    const countFinal   = counts[0]
    const countInicial = counts[1]

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
      setFcErrors(prev => ({ ...prev, [code]: 'Sin ventas en el período.' }))
      setCalculando(prev => ({ ...prev, [code]: false }))
      return
    }

    const costoMercaderia = invInicial + totalCompras - invFinal
    const value           = (costoMercaderia / ventasNetas) * 100

    const cache = { value, invInicial, compras: totalCompras, invFinal, ventasNetas, costoMercaderia, desde: countInicial.date, hasta: countFinal.date, calculatedAt: new Date().toISOString() }

    localStorage.setItem(`foodcost_${locId}`, JSON.stringify(cache))
    setFcCaches(prev => ({ ...prev, [code]: cache }))
    setCalculando(prev => ({ ...prev, [code]: false }))
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function colorFoodCost(v) {
    if (v == null) return 'text-gray-600'
    if (v <= 32) return 'text-green-400'
    if (v <= 38) return 'text-yellow-400'
    return 'text-red-400'
  }
  function colorLabor(v) {
    if (v <= 30) return 'text-green-400'
    if (v <= 35) return 'text-yellow-400'
    return 'text-red-400'
  }
  function colorPrime(v) {
    if (v <= 60) return 'text-green-400'
    if (v <= 68) return 'text-yellow-400'
    return 'text-red-400'
  }
  function colorDiscount(v) {
    if (v <= 6)  return 'text-green-400'
    if (v <= 10) return 'text-yellow-400'
    return 'text-red-400'
  }

  function fcPeriodoLabel(cache) {
    if (!cache) return null
    const fmt = d => new Date(d + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
    return `${fmt(cache.desde)} – ${fmt(cache.hasta)}`
  }

  const periodoLabel = periodo
    ? `${MESES[new Date(periodo.period_start + 'T12:00:00').getMonth()]} ${new Date(periodo.period_start + 'T12:00:00').getFullYear()}`
    : null

  // Prime cost usa el food cost del local activo
  const foodCostActivo = fcCaches[locationCode]?.value ?? null
  const laborCost      = kpis?.laborCost ?? null
  const primeCost      = foodCostActivo !== null && laborCost !== null ? foodCostActivo + laborCost : null

  return (
    <main className="min-h-screen bg-gray-950 p-4 md:p-8">
      <div className="max-w-4xl mx-auto">

        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Panel principal</h1>
            <p className="text-gray-500 text-sm mt-1">
              {periodoLabel ? `KPIs de ${periodoLabel}` : 'Cargando datos...'}
            </p>
          </div>
          <span className="bg-orange-500 text-white text-sm font-bold px-3 py-1 rounded-lg">
            {locationCode}
          </span>
        </div>

        {loading || locationLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-10">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-gray-900 rounded-2xl p-5 border border-gray-800 animate-pulse">
                <div className="h-3 bg-gray-800 rounded w-2/3 mb-3" />
                <div className="h-8 bg-gray-800 rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-10">

            {/* ── Food Cost SF + LA (ocupa todo el ancho) ── */}
            <div className="col-span-2 md:col-span-3 bg-gray-900 rounded-2xl p-5 border border-gray-800">
              <p className="text-gray-400 text-xs uppercase tracking-wide mb-4">Food Cost</p>
              <div className="grid grid-cols-2 gap-6">
                {['SF', 'LA'].map(code => {
                  const locId  = locIds[code]
                  const cache  = fcCaches[code]
                  const isCalc = calculando[code]
                  const err    = fcErrors[code]
                  return (
                    <div key={code}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-white text-sm font-semibold">{code === 'SF' ? 'San Felipe' : 'Los Andes'}</span>
                        <button
                          onClick={() => calcularFoodCost(code, locId)}
                          disabled={isCalc || !locId}
                          title="Recalcular con los 2 últimos cierres de mes"
                          className="text-gray-600 hover:text-orange-400 text-sm transition disabled:opacity-30"
                        >
                          {isCalc ? '⏳' : '🔄'}
                        </button>
                      </div>

                      {cache?.value != null ? (
                        <>
                          <p className={`text-3xl font-bold ${colorFoodCost(cache.value)}`}>
                            {cache.value.toFixed(1)}<span className="text-lg ml-1">%</span>
                          </p>
                          <p className="text-gray-600 text-xs mt-1">{fcPeriodoLabel(cache)}</p>
                          <div className="mt-2 flex flex-col gap-0.5 text-xs text-gray-600 border-t border-gray-800 pt-2">
                            <span>Inv. ini: ${Math.round(cache.invInicial).toLocaleString('es-CL')}</span>
                            <span>+ Compras: ${Math.round(cache.compras).toLocaleString('es-CL')}</span>
                            <span>− Inv. fin: ${Math.round(cache.invFinal).toLocaleString('es-CL')}</span>
                            <span>Ventas netas: ${Math.round(cache.ventasNetas).toLocaleString('es-CL')}</span>
                          </div>
                        </>
                      ) : err ? (
                        <>
                          <p className="text-3xl font-bold text-gray-600">—</p>
                          <p className="text-red-500 text-xs mt-1">{err}</p>
                        </>
                      ) : (
                        <>
                          <p className="text-3xl font-bold text-gray-600">—</p>
                          <button
                            onClick={() => calcularFoodCost(code, locId)}
                            disabled={isCalc || !locId}
                            className="text-orange-400 text-xs mt-1 text-left hover:underline disabled:opacity-50"
                          >
                            {isCalc ? 'Calculando...' : 'Calcular →'}
                          </button>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* ── Labor Cost ── */}
            <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800">
              <p className="text-gray-400 text-xs uppercase tracking-wide mb-2">Labor Cost</p>
              {laborCost !== null ? (
                <>
                  <p className={`text-3xl font-bold ${colorLabor(laborCost)}`}>
                    {laborCost.toFixed(1)}<span className="text-lg ml-1">%</span>
                  </p>
                  <p className="text-gray-600 text-xs mt-2">Meta 25–30% · {locationCode}</p>
                </>
              ) : (
                <>
                  <p className="text-3xl font-bold text-gray-600">—</p>
                  <Link href="/labor" className="text-orange-400 text-xs mt-2 inline-block hover:underline">
                    Cargar costo laboral →
                  </Link>
                </>
              )}
            </div>

            {/* ── Prime Cost ── */}
            <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800">
              <p className="text-gray-400 text-xs uppercase tracking-wide mb-2">Prime Cost</p>
              {primeCost !== null ? (
                <>
                  <p className={`text-3xl font-bold ${colorPrime(primeCost)}`}>
                    {primeCost.toFixed(1)}<span className="text-lg ml-1">%</span>
                  </p>
                  <p className="text-gray-600 text-xs mt-2">Meta &lt;60% · {locationCode}</p>
                </>
              ) : (
                <>
                  <p className="text-3xl font-bold text-gray-600">—</p>
                  <p className="text-gray-600 text-xs mt-2">Requiere food + labor</p>
                </>
              )}
            </div>

            {/* ── Ticket Promedio ── */}
            <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800">
              <p className="text-gray-400 text-xs uppercase tracking-wide mb-2">Ticket Promedio</p>
              {kpis?.avgTicket != null ? (
                <>
                  <p className="text-3xl font-bold text-green-400">
                    ${Math.round(kpis.avgTicket).toLocaleString('es-CL')}
                  </p>
                  <p className="text-gray-600 text-xs mt-2">
                    {periodo?.total_orders?.toLocaleString('es-CL')} pedidos · {locationCode}
                  </p>
                </>
              ) : (
                <p className="text-3xl font-bold text-gray-600">—</p>
              )}
            </div>

            {/* ── Descuentos ── */}
            <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800">
              <p className="text-gray-400 text-xs uppercase tracking-wide mb-2">Descuentos</p>
              {kpis?.discountPct != null ? (
                <>
                  <p className={`text-3xl font-bold ${colorDiscount(kpis.discountPct)}`}>
                    {kpis.discountPct.toFixed(1)}<span className="text-lg ml-1">%</span>
                  </p>
                  <p className="text-gray-600 text-xs mt-2">
                    ${(periodo?.total_discounts / 1000).toFixed(0)}k · meta 6%
                  </p>
                </>
              ) : (
                <p className="text-3xl font-bold text-gray-600">—</p>
              )}
            </div>

            {/* ── Retención ── */}
            <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800">
              <p className="text-gray-400 text-xs uppercase tracking-wide mb-2">Retención 60 días</p>
              <p className="text-3xl font-bold text-gray-600">—</p>
              <p className="text-gray-600 text-xs mt-2">Pendiente módulo clientes</p>
            </div>

          </div>
        )}

        {/* ── Módulos ── */}
        <h2 className="text-gray-400 text-sm uppercase tracking-wide mb-4">Módulos</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link href="/inventario" className="bg-gray-900 rounded-2xl p-6 border border-gray-800 hover:border-orange-500 transition">
            <p className="text-white font-semibold">📦 Inventario</p>
            <p className="text-gray-500 text-sm mt-1">Gestión de insumos y stock</p>
          </Link>
          <Link href="/compras" className="bg-gray-900 rounded-2xl p-6 border border-gray-800 hover:border-orange-500 transition">
            <p className="text-white font-semibold">🛒 Compras</p>
            <p className="text-gray-500 text-sm mt-1">Registro de compras a proveedores</p>
          </Link>
          <Link href="/ventas" className="bg-gray-900 rounded-2xl p-6 border border-gray-800 hover:border-orange-500 transition">
            <p className="text-white font-semibold">📊 Ventas</p>
            <p className="text-gray-500 text-sm mt-1">Dashboard e importación de ventas</p>
          </Link>
          <Link href="/gastos" className="bg-gray-900 rounded-2xl p-6 border border-gray-800 hover:border-orange-500 transition">
            <p className="text-white font-semibold">📝 Gastos</p>
            <p className="text-gray-500 text-sm mt-1">Gastos operativos por local</p>
          </Link>
          <Link href="/labor" className="bg-gray-900 rounded-2xl p-6 border border-gray-800 hover:border-orange-500 transition">
            <p className="text-white font-semibold">👥 Costo Laboral</p>
            <p className="text-gray-500 text-sm mt-1">Remuneraciones mensuales por local</p>
          </Link>
          <Link href="/inventario/costeo" className="bg-gray-900 rounded-2xl p-6 border border-gray-800 hover:border-orange-500 transition">
            <p className="text-white font-semibold">💰 Costeo</p>
            <p className="text-gray-500 text-sm mt-1">Margen y food cost por producto</p>
          </Link>
        </div>

      </div>
    </main>
  )
}
