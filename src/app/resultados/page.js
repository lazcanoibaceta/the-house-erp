'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { getFoodCostForMonth } from '@/lib/foodcost'
import Link from 'next/link'
import RoleGuard from '@/components/RoleGuard'

const supabase = createClient()
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

// ── Helpers de color ───────────────────────────────────────────────────────────
function colorPct(v, thresholds) {
  if (v == null) return 'text-gray-500'
  if (v <= thresholds[0]) return 'text-green-400'
  if (v <= thresholds[1]) return 'text-yellow-400'
  return 'text-red-400'
}
function colorResultado(v) {
  if (v == null) return 'text-gray-500'
  if (v >= 15) return 'text-green-400'
  if (v >= 5)  return 'text-yellow-400'
  return 'text-red-400'
}
function fmt(n) {
  if (n == null) return '—'
  return '$' + Math.round(n).toLocaleString('es-CL')
}
function pct(n) {
  if (n == null) return '—'
  return n.toFixed(1) + '%'
}

export default function Resultados() {
  const [loc, setLoc] = useState('SF')
  const [mesKey, setMesKey] = useState(null)           // 'YYYY-MM'
  const [mesesDisponibles, setMesesDisponibles] = useState([])
  const [locIds, setLocIds] = useState({})             // { SF: uuid, LA: uuid }
  const [datos, setDatos] = useState(null)
  const [loading, setLoading] = useState(false)

  // ── 1. Init ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      const [{ data: locs }, { data: ventas }] = await Promise.all([
        supabase.from('locations').select('id, short_code'),
        supabase.from('sales_periods').select('period_start').order('period_start', { ascending: false }),
      ])
      const map = {}
      for (const l of locs || []) map[l.short_code] = l.id
      setLocIds(map)

      const mesesSet = new Set((ventas || []).map(p => p.period_start.substring(0, 7)))
      const meses = [...mesesSet].sort((a, b) => b.localeCompare(a))
      setMesesDisponibles(meses)
      if (meses.length > 0) setMesKey(meses[0])
    }
    init()
  }, [])

  // ── 2. Recalcular cuando cambia mes o local ──────────────────────────────────
  useEffect(() => {
    if (!mesKey || !locIds.SF) return
    calcular()
  }, [mesKey, loc, locIds])

  async function calcular() {
    setLoading(true)
    const [year, month] = mesKey.split('-').map(Number)
    const locsToCalc = loc === 'AMBOS' ? ['SF', 'LA'] : [loc]

    const result = {}
    await Promise.all(
      locsToCalc.map(async code => {
        result[code] = await calcularLocal(locIds[code], year, month)
      })
    )
    setDatos(result)
    setLoading(false)
  }

  async function calcularLocal(locId, year, month) {
    if (!locId) return { error: 'Local sin configurar.' }

    const desde   = `${year}-${String(month).padStart(2, '0')}-01`
    const lastDay = new Date(year, month, 0).getDate()
    const hasta   = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

    // Ventas + ticket + descuentos
    const { data: ventasData } = await supabase
      .from('sales_periods')
      .select('total_sales, total_orders, total_discounts, packaging_cost')
      .eq('location_id', locId)
      .gte('period_start', desde)
      .lte('period_start', hasta)

    const totalSales     = (ventasData || []).reduce((s, v) => s + parseFloat(v.total_sales || 0), 0)
    const ventasNetas    = totalSales / 1.19
    const totalOrders    = (ventasData || []).reduce((s, v) => s + parseInt(v.total_orders  || 0), 0)
    const totalDiscounts = (ventasData || []).reduce((s, v) => s + parseFloat(v.total_discounts || 0), 0)
    const packagingTotal = (ventasData || []).reduce((s, v) => s + parseFloat(v.packaging_cost || 0), 0)
    const avgTicket      = totalOrders > 0 ? totalSales / totalOrders : null
    const discountPct    = totalSales  > 0 ? (totalDiscounts / totalSales) * 100 : null

    // Food Cost del mes
    const fc = await getFoodCostForMonth(locId, year, month, supabase)

    // Labor del mes
    const { data: laborData } = await supabase
      .from('labor_costs')
      .select('amount')
      .eq('location_id', locId)
      .eq('period_year', year)
      .eq('period_month', month)
      .single()

    const laborAmount = laborData ? parseFloat(laborData.amount) : null

    // Gastos operativos del mes
    const { data: gastosData } = await supabase
      .from('operating_expenses')
      .select('amount_net')
      .eq('location_id', locId)
      .gte('expense_date', desde)
      .lte('expense_date', hasta)

    const gastosTotal = gastosData && gastosData.length > 0
      ? gastosData.reduce((s, g) => s + parseFloat(g.amount_net || 0), 0)
      : null

    return { ventasNetas, totalSales, totalOrders, totalDiscounts, packagingTotal, avgTicket, discountPct, fc, laborAmount, gastosTotal, year, month }
  }

  // ── Helpers de presentación ──────────────────────────────────────────────────
  function mesLabel(key) {
    const [y, m] = key.split('-').map(Number)
    return `${MESES[m - 1]} ${y}`
  }

  // Para "Ambos": combinar SF + LA
  function combinarDatos(sf, la) {
    const totalSales     = (sf?.totalSales     || 0) + (la?.totalSales     || 0)
    const ventas         = (sf?.ventasNetas    || 0) + (la?.ventasNetas    || 0)
    const totalOrders    = (sf?.totalOrders    || 0) + (la?.totalOrders    || 0)
    const totalDisc      = (sf?.totalDiscounts || 0) + (la?.totalDiscounts || 0)
    const avgTicket      = totalOrders > 0 ? totalSales / totalOrders : null
    const discountPct    = totalSales  > 0 ? (totalDisc / totalSales) * 100 : null

    const packaging  = (sf?.packagingTotal || 0) + (la?.packagingTotal || 0)

    const fcOk    = sf?.fc?.ok && la?.fc?.ok
    const fcCosto = fcOk ? (sf.fc.costoMercaderia || 0) + (la.fc.costoMercaderia || 0) : null
    const fcValue = fcOk && ventas > 0 ? (fcCosto / ventas) * 100 : null
    const labor   = sf?.laborAmount != null || la?.laborAmount != null
      ? (sf?.laborAmount || 0) + (la?.laborAmount || 0) : null
    const gastos  = sf?.gastosTotal != null || la?.gastosTotal != null
      ? (sf?.gastosTotal || 0) + (la?.gastosTotal || 0) : null
    const fcError = !sf?.fc?.ok ? sf?.fc?.error : !la?.fc?.ok ? la?.fc?.error : null

    return {
      ventasNetas: ventas, totalSales, totalOrders, totalDiscounts: totalDisc, avgTicket, discountPct,
      packagingTotal: packaging,
      fc: fcOk ? { ok: true, costoMercaderia: fcCosto, value: fcValue } : { ok: false, error: fcError },
      laborAmount: labor, gastosTotal: gastos,
    }
  }

  // Datos que se muestran según el toggle
  const datosVista = (() => {
    if (!datos) return null
    if (loc === 'AMBOS') return combinarDatos(datos.SF, datos.LA)
    return datos[loc] || null
  })()

  // Resumen P&L + KPIs
  const resumen = (() => {
    if (!datosVista) return null
    const { ventasNetas, fc, laborAmount, gastosTotal, packagingTotal, avgTicket, discountPct, totalOrders } = datosVista
    if (!ventasNetas) return null

    const fcMonto        = fc?.ok ? fc.costoMercaderia : null
    const packagingMonto = packagingTotal ?? 0
    const laborPct       = laborAmount != null ? (laborAmount / ventasNetas) * 100 : null
    const primeCost      = fcMonto != null && laborAmount != null
      ? ((fcMonto + laborAmount) / ventasNetas) * 100 : null

    const resultado  = ventasNetas - (fcMonto || 0) - packagingMonto - (laborAmount || 0) - (gastosTotal || 0)
    const allPresent = fcMonto != null && laborAmount != null && gastosTotal != null

    return {
      ventasNetas, fcMonto, totalOrders, avgTicket, discountPct,
      fcPct:     fc?.ok  ? fc.value   : null,
      fcError:  !fc?.ok  ? fc?.error  : null,
      fcDesde:   fc?.ok  ? fc.desde   : null,
      fcHasta:   fc?.ok  ? fc.hasta   : null,
      packagingMonto,
      packagingPct: ventasNetas > 0 ? (packagingMonto / ventasNetas) * 100 : 0,
      laborAmount, laborPct, primeCost,
      gastosPct: gastosTotal != null ? (gastosTotal / ventasNetas) * 100 : null,
      resultado:    allPresent ? resultado : null,
      resultadoPct: allPresent ? (resultado / ventasNetas) * 100 : null,
      allPresent,
    }
  })()

  return (
    <RoleGuard allowedRoles={['admin_supremo', 'admin']}>
    <main className="min-h-screen bg-gray-950 p-4 md:p-8">
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">📊 Estado de Resultados</h1>
          <p className="text-gray-500 text-sm mt-1">Resultado financiero mensual</p>
        </div>

        {/* Controles: mes + toggle local */}
        <div className="flex gap-3 mb-6 flex-wrap">
          <select
            value={mesKey || ''}
            onChange={e => setMesKey(e.target.value)}
            className="bg-gray-900 border border-gray-800 rounded-xl px-3 py-2 text-white text-sm flex-1 min-w-0"
          >
            {mesesDisponibles.map(k => (
              <option key={k} value={k}>{mesLabel(k)}</option>
            ))}
          </select>

          <div className="flex items-center bg-gray-900 border border-gray-800 rounded-xl p-1 gap-1 shrink-0">
            {['SF', 'LA', 'AMBOS'].map(l => (
              <button
                key={l}
                onClick={() => setLoc(l)}
                className={`px-3 py-1 rounded-lg text-sm font-medium transition ${
                  loc === l ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        {/* ── KPIs ── */}
        {resumen && !loading && (
          <div className="space-y-3 mb-6">

            {/* Prime Cost */}
            <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800 flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex-1">
                <p className="text-gray-400 text-xs uppercase tracking-widest mb-1">Prime Cost</p>
                {resumen.primeCost != null ? (
                  <p className={`text-5xl font-black ${colorPct(resumen.primeCost, [60, 68])}`}>
                    {resumen.primeCost.toFixed(1)}<span className="text-2xl font-semibold ml-1 opacity-70">%</span>
                  </p>
                ) : (
                  <p className="text-5xl font-black text-gray-700">—</p>
                )}
                <p className="text-gray-600 text-xs mt-2">Food + Labor · meta ≤60%</p>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:gap-6 sm:border-l sm:border-gray-800 sm:pl-6 shrink-0">
                <div>
                  <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Food Cost</p>
                  {resumen.fcPct != null ? (
                    <p className={`text-2xl font-bold ${colorPct(resumen.fcPct, [32, 38])}`}>
                      {resumen.fcPct.toFixed(1)}<span className="text-sm ml-0.5">%</span>
                    </p>
                  ) : (
                    <p className="text-2xl font-bold text-gray-700">—</p>
                  )}
                  <p className="text-gray-600 text-xs mt-0.5">meta ≤32%</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Labor Cost</p>
                  {resumen.laborPct != null ? (
                    <p className={`text-2xl font-bold ${colorPct(resumen.laborPct, [30, 35])}`}>
                      {resumen.laborPct.toFixed(1)}<span className="text-sm ml-0.5">%</span>
                    </p>
                  ) : (
                    <div>
                      <p className="text-2xl font-bold text-gray-700">—</p>
                      <Link href="/labor" className="text-orange-400 text-xs hover:underline">Cargar →</Link>
                    </div>
                  )}
                  {resumen.laborPct != null && <p className="text-gray-600 text-xs mt-0.5">meta ≤30%</p>}
                </div>
              </div>
            </div>

            {/* Ventas, Ticket, Descuentos */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800">
                <p className="text-gray-400 text-xs uppercase tracking-widest mb-2">Ventas Netas</p>
                <p className="text-2xl font-bold text-white">
                  ${Math.round(resumen.ventasNetas / 1000).toLocaleString('es-CL')}k
                </p>
                <p className="text-gray-600 text-xs mt-2">{mesLabel(mesKey)}</p>
              </div>

              <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800">
                <p className="text-gray-400 text-xs uppercase tracking-widest mb-2">Ticket Promedio</p>
                {resumen.avgTicket != null ? (
                  <>
                    <p className="text-2xl font-bold text-white">
                      ${Math.round(resumen.avgTicket).toLocaleString('es-CL')}
                    </p>
                    <p className="text-gray-600 text-xs mt-2">
                      {resumen.totalOrders?.toLocaleString('es-CL')} pedidos
                    </p>
                  </>
                ) : (
                  <p className="text-2xl font-bold text-gray-700">—</p>
                )}
              </div>

              <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800">
                <p className="text-gray-400 text-xs uppercase tracking-widest mb-2">Descuentos</p>
                {resumen.discountPct != null ? (
                  <>
                    <p className={`text-2xl font-bold ${colorPct(resumen.discountPct, [6, 10])}`}>
                      {resumen.discountPct.toFixed(1)}<span className="text-sm ml-0.5">%</span>
                    </p>
                    <p className="text-gray-600 text-xs mt-2">meta ≤6%</p>
                  </>
                ) : (
                  <p className="text-2xl font-bold text-gray-700">—</p>
                )}
              </div>
            </div>

          </div>
        )}

        {/* ── P&L ── */}
        {loading ? (
          <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6 animate-pulse">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex justify-between py-3 border-b border-gray-800 last:border-0">
                <div className="h-4 bg-gray-800 rounded w-1/3" />
                <div className="h-4 bg-gray-800 rounded w-1/4" />
              </div>
            ))}
          </div>
        ) : !resumen ? (
          <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6 text-center text-gray-500">
            Selecciona un mes para ver el resultado
          </div>
        ) : (
          <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">

            <FilaResultado
              label="Ventas Netas"
              monto={resumen.ventasNetas}
              pctValor={100}
              pctColor="text-gray-400"
              destacado
            />

            {resumen.fcError ? (
              <FilaError
                label="Food Cost"
                error={resumen.fcError}
                linkLabel="Ir a conteo"
                linkHref="/inventario/conteo"
              />
            ) : (
              <FilaResultado
                label="Food Cost"
                sublabel={resumen.fcDesde ? `${fmtFecha(resumen.fcDesde)} – ${fmtFecha(resumen.fcHasta)}` : null}
                monto={resumen.fcMonto}
                pctValor={resumen.fcPct}
                pctColor={colorPct(resumen.fcPct, [32, 38])}
                negativo
              />
            )}

            <FilaResultado
              label="Packaging"
              monto={resumen.packagingMonto}
              pctValor={resumen.packagingPct}
              pctColor={colorPct(resumen.packagingPct, [4, 5])}
              negativo
            />

            {datosVista?.laborAmount == null ? (
              <FilaError
                label="Costo Laboral"
                error="No ingresado para este mes"
                linkLabel="Ir a Labor"
                linkHref="/labor"
              />
            ) : (
              <FilaResultado
                label="Costo Laboral"
                monto={datosVista.laborAmount}
                pctValor={resumen.laborPct}
                pctColor={colorPct(resumen.laborPct, [30, 35])}
                negativo
              />
            )}

            {datosVista?.gastosTotal == null ? (
              <FilaError
                label="Gastos Operativos"
                error="Sin gastos registrados este mes"
                linkLabel="Ver gastos"
                linkHref="/gastos"
              />
            ) : (
              <FilaResultado
                label="Gastos Operativos"
                monto={datosVista.gastosTotal}
                pctValor={resumen.gastosPct}
                pctColor={colorPct(resumen.gastosPct, [10, 15])}
                linkHref="/gastos"
                negativo
              />
            )}

            <div className="border-t-2 border-gray-700 mx-4" />

            {!resumen.allPresent ? (
              <div className="px-5 py-4 flex items-center justify-between">
                <span className="text-gray-500 text-sm">Resultado</span>
                <span className="text-gray-600 text-sm">Completa los datos faltantes</span>
              </div>
            ) : (
              <FilaResultado
                label="Resultado"
                monto={resumen.resultado}
                pctValor={resumen.resultadoPct}
                pctColor={colorResultado(resumen.resultadoPct)}
                destacado
                grande
              />
            )}
          </div>
        )}

        {/* Aviso si Ambos con datos incompletos */}
        {loc === 'AMBOS' && datos && (!datos.SF?.ventasNetas || !datos.LA?.ventasNetas) && (
          <p className="text-yellow-600 text-xs mt-3 text-center">
            ⚠️ {!datos.SF?.ventasNetas ? 'SF' : 'LA'} no tiene ventas registradas para este mes.
          </p>
        )}

      </div>
    </main>
    </RoleGuard>
  )
}

// ── Sub-componentes ────────────────────────────────────────────────────────────

function FilaResultado({ label, sublabel, monto, pctValor, pctColor, negativo = false, destacado = false, grande = false, linkHref = null }) {
  return (
    <div className={`flex items-center justify-between px-5 py-4 border-b border-gray-800 last:border-0 ${destacado ? 'bg-gray-800/40' : ''}`}>
      <div>
        <div className="flex items-center gap-2">
          <p className={`${grande ? 'text-base font-bold text-white' : destacado ? 'font-semibold text-white' : 'text-gray-300'} text-sm`}>
            {negativo && <span className="text-gray-600 mr-1">−</span>}
            {label}
          </p>
          {linkHref && (
            <Link href={linkHref} className="text-gray-600 hover:text-orange-400 text-xs transition">Ver →</Link>
          )}
        </div>
        {sublabel && <p className="text-gray-600 text-xs mt-0.5">{sublabel}</p>}
      </div>
      <div className="text-right">
        <p className={`${grande ? 'text-lg font-bold' : 'text-sm font-semibold'} ${pctColor}`}>
          {fmt(monto)}
        </p>
        <p className={`text-xs ${pctColor}`}>{pct(pctValor)}</p>
      </div>
    </div>
  )
}

function FilaError({ label, error, linkLabel, linkHref }) {
  return (
    <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
      <div>
        <p className="text-gray-500 text-sm">
          <span className="text-gray-600 mr-1">−</span>{label}
        </p>
        <p className="text-yellow-700 text-xs mt-0.5">{error}</p>
      </div>
      <Link href={linkHref} className="text-orange-500 hover:text-orange-400 text-xs underline shrink-0 ml-3">
        {linkLabel} →
      </Link>
    </div>
  )
}

function fmtFecha(d) {
  return new Date(d + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
}
