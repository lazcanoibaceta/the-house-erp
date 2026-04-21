'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useLocation } from '@/hooks/useLocation'
import Link from 'next/link'

const supabase = createClient()

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

export default function Home() {
  const { locationCode, locationId, loading: locationLoading } = useLocation()
  const [kpis, setKpis] = useState(null)
  const [periodo, setPeriodo] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!locationId) return
    fetchKpis()
  }, [locationId])

  async function fetchKpis() {
    setLoading(true)

    // 1. Último período de ventas del local
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

    // 2. Compras del mismo período (food cost)
    const { data: compras } = await supabase
      .from('purchases')
      .select('total')
      .eq('location_id', locationId)
      .gte('date', p.period_start)
      .lte('date', p.period_end)

    const totalCompras = (compras || []).reduce((s, c) => s + parseFloat(c.total), 0)
    const ventasNetas = parseFloat(p.total_sales) / 1.19
    const foodCost = ventasNetas > 0 ? (totalCompras / ventasNetas) * 100 : null

    // 3. Costo laboral del mismo mes
    const mes = new Date(p.period_start + 'T12:00:00').getMonth() + 1
    const anio = new Date(p.period_start + 'T12:00:00').getFullYear()

    const { data: labor } = await supabase
      .from('labor_costs')
      .select('amount')
      .eq('location_id', locationId)
      .eq('period_year', anio)
      .eq('period_month', mes)
      .single()

    const laborCost = labor ? (parseFloat(labor.amount) / ventasNetas) * 100 : null
    const primeCost = foodCost !== null && laborCost !== null ? foodCost + laborCost : null

    setKpis({
      foodCost,
      laborCost,
      primeCost,
      avgTicket: parseFloat(p.avg_ticket),
      discountPct: parseFloat(p.discount_pct),
      totalCompras,
      ventasNetas,
    })
    setLoading(false)
  }

  function colorFoodCost(v) {
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
    if (v <= 6) return 'text-green-400'
    if (v <= 10) return 'text-yellow-400'
    return 'text-red-400'
  }

  const periodoLabel = periodo
    ? `${MESES[new Date(periodo.period_start + 'T12:00:00').getMonth()]} ${new Date(periodo.period_start + 'T12:00:00').getFullYear()}`
    : null

  return (
    <main className="min-h-screen bg-gray-950 p-4 md:p-8">
      <div className="max-w-4xl mx-auto">

        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Panel principal</h1>
            <p className="text-gray-500 text-sm mt-1">
              {periodoLabel ? `Basado en ${periodoLabel}` : 'Cargando datos...'}
            </p>
          </div>
          <span className="bg-orange-500 text-white text-sm font-bold px-3 py-1 rounded-lg">
            {locationCode}
          </span>
        </div>

        {/* KPIs */}
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

            {/* Food Cost */}
            <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800">
              <p className="text-gray-400 text-xs uppercase tracking-wide mb-2">Food Cost</p>
              {kpis?.foodCost != null ? (
                <>
                  <p className={`text-3xl font-bold ${colorFoodCost(kpis.foodCost)}`}>
                    {kpis.foodCost.toFixed(1)}<span className="text-lg ml-1">%</span>
                  </p>
                  <p className="text-gray-600 text-xs mt-2">Meta 28–32% · aprox. compras/ventas</p>
                </>
              ) : (
                <>
                  <p className="text-3xl font-bold text-gray-600">—</p>
                  <p className="text-gray-600 text-xs mt-2">Sin compras registradas</p>
                </>
              )}
            </div>

            {/* Labor Cost */}
            <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800">
              <p className="text-gray-400 text-xs uppercase tracking-wide mb-2">Labor Cost</p>
              {kpis?.laborCost != null ? (
                <>
                  <p className={`text-3xl font-bold ${colorLabor(kpis.laborCost)}`}>
                    {kpis.laborCost.toFixed(1)}<span className="text-lg ml-1">%</span>
                  </p>
                  <p className="text-gray-600 text-xs mt-2">Meta 25–30%</p>
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

            {/* Prime Cost */}
            <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800">
              <p className="text-gray-400 text-xs uppercase tracking-wide mb-2">Prime Cost</p>
              {kpis?.primeCost != null ? (
                <>
                  <p className={`text-3xl font-bold ${colorPrime(kpis.primeCost)}`}>
                    {kpis.primeCost.toFixed(1)}<span className="text-lg ml-1">%</span>
                  </p>
                  <p className="text-gray-600 text-xs mt-2">Meta &lt;60% · food + labor</p>
                </>
              ) : (
                <>
                  <p className="text-3xl font-bold text-gray-600">—</p>
                  <p className="text-gray-600 text-xs mt-2">Requiere food + labor</p>
                </>
              )}
            </div>

            {/* Ticket Promedio */}
            <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800">
              <p className="text-gray-400 text-xs uppercase tracking-wide mb-2">Ticket Promedio</p>
              {kpis?.avgTicket != null ? (
                <>
                  <p className="text-3xl font-bold text-green-400">
                    ${Math.round(kpis.avgTicket).toLocaleString('es-CL')}
                  </p>
                  <p className="text-gray-600 text-xs mt-2">{periodo?.total_orders?.toLocaleString('es-CL')} pedidos · con IVA</p>
                </>
              ) : (
                <p className="text-3xl font-bold text-gray-600">—</p>
              )}
            </div>

            {/* Descuentos */}
            <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800">
              <p className="text-gray-400 text-xs uppercase tracking-wide mb-2">Descuentos</p>
              {kpis?.discountPct != null ? (
                <>
                  <p className={`text-3xl font-bold ${colorDiscount(kpis.discountPct)}`}>
                    {kpis.discountPct.toFixed(1)}<span className="text-lg ml-1">%</span>
                  </p>
                  <p className="text-gray-600 text-xs mt-2">
                    ${(periodo?.total_discounts / 1000).toFixed(0)}k · meta bajar a 6%
                  </p>
                </>
              ) : (
                <p className="text-3xl font-bold text-gray-600">—</p>
              )}
            </div>

            {/* Retención */}
            <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800">
              <p className="text-gray-400 text-xs uppercase tracking-wide mb-2">Retención 60 días</p>
              <p className="text-3xl font-bold text-gray-600">—</p>
              <p className="text-gray-600 text-xs mt-2">Pendiente módulo clientes</p>
            </div>

          </div>
        )}

        {/* Módulos */}
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
