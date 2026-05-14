'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useLocation } from '@/hooks/useLocation'
import { getFoodCost } from '@/lib/foodcost'
import Link from 'next/link'

const supabase = createClient()

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

const MODULOS = [
  { href: '/inventario', label: 'Inventario', desc: 'Insumos y stock', icon: <BoxIcon /> },
  { href: '/compras',    label: 'Compras',    desc: 'Compras a proveedores', icon: <CartIcon /> },
  { href: '/ventas',     label: 'Ventas',     desc: 'Dashboard e importación', icon: <ChartIcon /> },
  { href: '/gastos',     label: 'Gastos',     desc: 'Gastos operativos', icon: <ReceiptIcon /> },
  { href: '/labor',      label: 'Costo Laboral', desc: 'Remuneraciones mensuales', icon: <PeopleIcon /> },
  { href: '/inventario/costeo', label: 'Costeo', desc: 'Margen y food cost por plato', icon: <CoinIcon /> },
]

export default function Home() {
  const { locationCode, locationId, loading: locationLoading } = useLocation()

  const [kpis, setKpis]       = useState(null)
  const [periodo, setPeriodo]  = useState(null)
  const [loading, setLoading]  = useState(true)
  const [locIds, setLocIds]    = useState({})

  const [fcCaches, setFcCaches]     = useState({ SF: null, LA: null })
  const [calculando, setCalculando] = useState({ SF: false, LA: false })
  const [fcErrors, setFcErrors]     = useState({ SF: '', LA: '' })
  const [fcDetalle, setFcDetalle]   = useState({ SF: false, LA: false })

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

  useEffect(() => {
    if (!locIds.SF || !locIds.LA) return
    const cacheSF = localStorage.getItem(`foodcost_${locIds.SF}`)
    const cacheLA = localStorage.getItem(`foodcost_${locIds.LA}`)
    setFcCaches({
      SF: cacheSF ? JSON.parse(cacheSF) : null,
      LA: cacheLA ? JSON.parse(cacheLA) : null,
    })
  }, [locIds])

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

  async function calcularFoodCost(code, locId) {
    if (!locId) return
    setCalculando(prev => ({ ...prev, [code]: true }))
    setFcErrors(prev => ({ ...prev, [code]: '' }))

    const result = await getFoodCost(locId, supabase)

    if (!result.ok) {
      setFcErrors(prev => ({ ...prev, [code]: result.error }))
      setCalculando(prev => ({ ...prev, [code]: false }))
      return
    }

    const cache = { ...result, calculatedAt: new Date().toISOString() }
    localStorage.setItem(`foodcost_${locId}`, JSON.stringify(cache))
    setFcCaches(prev => ({ ...prev, [code]: cache }))
    setCalculando(prev => ({ ...prev, [code]: false }))
  }

  function colorFoodCost(v) {
    if (v == null) return 'text-gray-500'
    if (v <= 32)   return 'text-emerald-400'
    if (v <= 38)   return 'text-amber-400'
    return 'text-red-400'
  }
  function colorLabor(v) {
    if (v <= 30)   return 'text-emerald-400'
    if (v <= 35)   return 'text-amber-400'
    return 'text-red-400'
  }
  function colorPrime(v) {
    if (v <= 60)   return 'text-emerald-400'
    if (v <= 68)   return 'text-amber-400'
    return 'text-red-400'
  }
  function colorDiscount(v) {
    if (v <= 6)    return 'text-emerald-400'
    if (v <= 10)   return 'text-amber-400'
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

  const foodCostActivo = fcCaches[locationCode]?.value ?? null
  const laborCost      = kpis?.laborCost ?? null
  const primeCost      = foodCostActivo !== null && laborCost !== null ? foodCostActivo + laborCost : null

  const isLoading = loading || locationLoading

  return (
    <main className="min-h-screen bg-gray-950 text-white">

      {/* ── Header ── */}
      <div className="border-b border-gray-800/60 bg-gray-950/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 md:px-8 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold tracking-tight">The House ERP</h1>
            <p className="text-gray-500 text-xs mt-0.5">
              {periodoLabel ? `KPIs de ${periodoLabel}` : 'Cargando datos...'}
            </p>
          </div>
          <span className="bg-orange-500/10 text-orange-400 border border-orange-500/30 text-sm font-bold px-3 py-1.5 rounded-lg">
            {locationCode || '—'}
          </span>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 md:px-8 py-8 space-y-10">

        {/* ── KPIs ── */}
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className={`bg-gray-900 rounded-2xl p-5 border border-gray-800 animate-pulse ${i === 0 ? 'col-span-2 md:col-span-4' : ''}`}>
                <div className="h-3 bg-gray-800 rounded w-1/2 mb-4" />
                <div className="h-8 bg-gray-800 rounded w-1/3" />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">

            {/* ── Fila 1: Prime Cost (protagonista) ── */}
            <div className="bg-gray-900 rounded-2xl p-6 border border-gray-800 flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex-1">
                <p className="text-gray-400 text-xs uppercase tracking-widest mb-1">Prime Cost</p>
                {primeCost !== null ? (
                  <p className={`text-5xl font-black ${colorPrime(primeCost)}`}>
                    {primeCost.toFixed(1)}<span className="text-2xl font-semibold ml-1 opacity-70">%</span>
                  </p>
                ) : (
                  <p className="text-5xl font-black text-gray-700">—</p>
                )}
                <p className="text-gray-600 text-xs mt-2">
                  {primeCost !== null ? `Meta ≤60% · ${locationCode}` : 'Requiere food cost + labor cost'}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:gap-6 sm:border-l sm:border-gray-800 sm:pl-6 shrink-0">
                <div>
                  <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Food Cost</p>
                  {foodCostActivo !== null ? (
                    <p className={`text-2xl font-bold ${colorFoodCost(foodCostActivo)}`}>
                      {foodCostActivo.toFixed(1)}<span className="text-sm ml-0.5">%</span>
                    </p>
                  ) : (
                    <p className="text-2xl font-bold text-gray-700">—</p>
                  )}
                  <p className="text-gray-600 text-xs mt-0.5">{locationCode} · meta ≤32%</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Labor Cost</p>
                  {laborCost !== null ? (
                    <p className={`text-2xl font-bold ${colorLabor(laborCost)}`}>
                      {laborCost.toFixed(1)}<span className="text-sm ml-0.5">%</span>
                    </p>
                  ) : (
                    <div>
                      <p className="text-2xl font-bold text-gray-700">—</p>
                      <Link href="/labor" className="text-orange-400 text-xs hover:underline">Cargar →</Link>
                    </div>
                  )}
                  {laborCost !== null && <p className="text-gray-600 text-xs mt-0.5">{locationCode} · meta ≤30%</p>}
                </div>
              </div>
            </div>

            {/* ── Fila 2: Food Cost SF vs LA ── */}
            <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800">
              <div className="flex items-center justify-between mb-4">
                <p className="text-gray-400 text-xs uppercase tracking-widest">Food Cost por local</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {['SF', 'LA'].map(code => {
                  const locId  = locIds[code]
                  const cache  = fcCaches[code]
                  const isCalc = calculando[code]
                  const err    = fcErrors[code]
                  const showDetalle = fcDetalle[code]
                  return (
                    <div key={code} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-white text-sm font-semibold">{code === 'SF' ? 'San Felipe' : 'Los Andes'}</span>
                        <button
                          onClick={() => calcularFoodCost(code, locId)}
                          disabled={isCalc || !locId}
                          title="Recalcular con los 2 últimos cierres de mes"
                          className="text-gray-600 hover:text-orange-400 transition disabled:opacity-30 text-base"
                        >
                          {isCalc ? '⏳' : '↻'}
                        </button>
                      </div>

                      {cache?.value != null ? (
                        <div>
                          <p className={`text-3xl font-bold ${colorFoodCost(cache.value)}`}>
                            {cache.value.toFixed(1)}<span className="text-base ml-1 opacity-70">%</span>
                          </p>
                          <p className="text-gray-600 text-xs mt-1">{fcPeriodoLabel(cache)}</p>
                          <button
                            onClick={() => setFcDetalle(prev => ({ ...prev, [code]: !prev[code] }))}
                            className="text-gray-600 text-xs hover:text-gray-400 mt-1 transition"
                          >
                            {showDetalle ? 'Ocultar detalle ↑' : 'Ver detalle ↓'}
                          </button>
                          {showDetalle && (
                            <div className="mt-2 flex flex-col gap-0.5 text-xs text-gray-600 border-t border-gray-800 pt-2">
                              <span>Inv. ini: ${Math.round(cache.invInicial).toLocaleString('es-CL')}</span>
                              <span>+ Compras: ${Math.round(cache.compras).toLocaleString('es-CL')}</span>
                              <span>− Inv. fin: ${Math.round(cache.invFinal).toLocaleString('es-CL')}</span>
                              <span>Ventas netas: ${Math.round(cache.ventasNetas).toLocaleString('es-CL')}</span>
                            </div>
                          )}
                        </div>
                      ) : err ? (
                        <div>
                          <p className="text-3xl font-bold text-gray-700">—</p>
                          <p className="text-red-400 text-xs mt-1">{err}</p>
                        </div>
                      ) : (
                        <div>
                          <p className="text-3xl font-bold text-gray-700">—</p>
                          <button
                            onClick={() => calcularFoodCost(code, locId)}
                            disabled={isCalc || !locId}
                            className="text-orange-400 text-xs mt-1 text-left hover:underline disabled:opacity-50"
                          >
                            {isCalc ? 'Calculando...' : 'Calcular →'}
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* ── Fila 3: Ventas, Ticket, Descuentos ── */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800">
                <p className="text-gray-400 text-xs uppercase tracking-widest mb-2">Ventas Netas</p>
                {kpis?.ventasNetas != null ? (
                  <>
                    <p className="text-2xl font-bold text-white">
                      ${Math.round(kpis.ventasNetas / 1000).toLocaleString('es-CL')}k
                    </p>
                    <p className="text-gray-600 text-xs mt-2">{periodoLabel} · {locationCode}</p>
                  </>
                ) : (
                  <p className="text-2xl font-bold text-gray-700">—</p>
                )}
              </div>

              <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800">
                <p className="text-gray-400 text-xs uppercase tracking-widest mb-2">Ticket Promedio</p>
                {kpis?.avgTicket != null ? (
                  <>
                    <p className="text-2xl font-bold text-white">
                      ${Math.round(kpis.avgTicket).toLocaleString('es-CL')}
                    </p>
                    <p className="text-gray-600 text-xs mt-2">
                      {periodo?.total_orders?.toLocaleString('es-CL')} pedidos
                    </p>
                  </>
                ) : (
                  <p className="text-2xl font-bold text-gray-700">—</p>
                )}
              </div>

              <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800">
                <p className="text-gray-400 text-xs uppercase tracking-widest mb-2">Descuentos</p>
                {kpis?.discountPct != null ? (
                  <>
                    <p className={`text-2xl font-bold ${colorDiscount(kpis.discountPct)}`}>
                      {kpis.discountPct.toFixed(1)}<span className="text-sm ml-0.5">%</span>
                    </p>
                    <p className="text-gray-600 text-xs mt-2">
                      ${(periodo?.total_discounts / 1000).toFixed(0)}k · meta ≤6%
                    </p>
                  </>
                ) : (
                  <p className="text-2xl font-bold text-gray-700">—</p>
                )}
              </div>
            </div>

          </div>
        )}

        {/* ── Módulos ── */}
        <div>
          <p className="text-gray-500 text-xs uppercase tracking-widest mb-4">Módulos</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {MODULOS.map(m => (
              <Link
                key={m.href}
                href={m.href}
                className="group bg-gray-900 hover:bg-gray-800 rounded-2xl p-5 border border-gray-800 hover:border-orange-500/50 transition-all duration-200"
              >
                <div className="text-orange-400 mb-3 group-hover:scale-110 transition-transform duration-200 w-fit">
                  {m.icon}
                </div>
                <p className="text-white font-semibold text-sm">{m.label}</p>
                <p className="text-gray-500 text-xs mt-0.5">{m.desc}</p>
              </Link>
            ))}
          </div>
        </div>

      </div>
    </main>
  )
}

// ── Iconos SVG ──────────────────────────────────────────────────────────────

function BoxIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/>
      <polyline points="3.29 7 12 12 20.71 7"/>
      <line x1="12" y1="22" x2="12" y2="12"/>
    </svg>
  )
}

function CartIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/>
      <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>
    </svg>
  )
}

function ChartIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/>
      <line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6"  y1="20" x2="6"  y2="14"/>
      <line x1="2"  y1="20" x2="22" y2="20"/>
    </svg>
  )
}

function ReceiptIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/>
      <line x1="8"  y1="10" x2="16" y2="10"/>
      <line x1="8"  y1="14" x2="12" y2="14"/>
    </svg>
  )
}

function PeopleIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  )
}

function CoinIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <path d="M12 6v2m0 8v2M9.5 9A2.5 2.5 0 0 1 12 6.5h.5A2.5 2.5 0 0 1 15 9a2.5 2.5 0 0 1-2 2.45V14a2 2 0 0 1-2 2h-1"/>
    </svg>
  )
}
