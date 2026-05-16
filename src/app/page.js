'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
function monthLabel(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z')
  return `${MESES[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

function GrowthBadge({ pct }) {
  if (pct === null || pct === undefined) return null
  const up = pct >= 0
  return (
    <span className={`text-xs font-semibold ${up ? 'text-green-400' : 'text-red-400'}`}>
      {up ? '↑' : '↓'} {Math.abs(pct)}% vs mes anterior
    </span>
  )
}

export default function Home() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      try {
        const { data: locs } = await supabase.from('locations').select('id, short_code')
        const sf = locs?.find(l => l.short_code === 'SF')
        const la = locs?.find(l => l.short_code === 'LA')
        if (!sf || !la) { setLoading(false); return }

        const [{ data: sfP }, { data: laP }] = await Promise.all([
          supabase.from('sales_periods').select('id, period_start, total_orders, avg_ticket, avg_prep_minutes').eq('location_id', sf.id).order('period_start', { ascending: false }).limit(2),
          supabase.from('sales_periods').select('id, period_start, total_orders, avg_ticket, avg_prep_minutes').eq('location_id', la.id).order('period_start', { ascending: false }).limit(2),
        ])

        const sfCur = sfP?.[0], sfPrev = sfP?.[1]
        const laCur = laP?.[0], laPrev = laP?.[1]

        const [{ data: sfProd }, { data: laProd }] = await Promise.all([
          sfCur ? supabase.from('sales_top_products').select('product_name, units_sold').eq('period_id', sfCur.id).order('units_sold', { ascending: false }).limit(10) : Promise.resolve({ data: [] }),
          laCur ? supabase.from('sales_top_products').select('product_name, units_sold').eq('period_id', laCur.id).order('units_sold', { ascending: false }).limit(10) : Promise.resolve({ data: [] }),
        ])

        const productMap = {}
        for (const p of sfProd || []) {
          if (!productMap[p.product_name]) productMap[p.product_name] = { name: p.product_name, sf: 0, la: 0 }
          productMap[p.product_name].sf = p.units_sold
        }
        for (const p of laProd || []) {
          if (!productMap[p.product_name]) productMap[p.product_name] = { name: p.product_name, sf: 0, la: 0 }
          productMap[p.product_name].la = p.units_sold
        }
        const topProducts = Object.values(productMap)
          .map(p => ({ ...p, total: p.sf + p.la }))
          .sort((a, b) => b.total - a.total)
          .slice(0, 5)

        const sfGrowth = sfPrev?.total_orders
          ? Math.round(((sfCur.total_orders - sfPrev.total_orders) / sfPrev.total_orders) * 100)
          : null
        const laGrowth = laPrev?.total_orders
          ? Math.round(((laCur.total_orders - laPrev.total_orders) / laPrev.total_orders) * 100)
          : null

        const sfTicketDiff = sfPrev?.avg_ticket ? sfCur.avg_ticket - sfPrev.avg_ticket : null
        const laTicketDiff = laPrev?.avg_ticket ? laCur.avg_ticket - laPrev.avg_ticket : null

        const sfPrepDiff = (sfPrev?.avg_prep_minutes != null && sfCur?.avg_prep_minutes != null)
          ? Math.round(sfCur.avg_prep_minutes - sfPrev.avg_prep_minutes)
          : null
        const laPrepDiff = (laPrev?.avg_prep_minutes != null && laCur?.avg_prep_minutes != null)
          ? Math.round(laCur.avg_prep_minutes - laPrev.avg_prep_minutes)
          : null

        const period = sfCur?.period_start || laCur?.period_start
        setData({ sfCur, laCur, sfGrowth, laGrowth, sfTicketDiff, laTicketDiff, sfPrepDiff, laPrepDiff, topProducts, period })
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-950 p-4 md:p-8">
        <div className="max-w-2xl mx-auto space-y-4 animate-pulse">
          <div className="h-7 bg-gray-800 rounded-xl w-40" />
          <div className="grid grid-cols-2 gap-3">
            <div className="h-40 bg-gray-900 rounded-2xl" />
            <div className="h-40 bg-gray-900 rounded-2xl" />
          </div>
          <div className="h-72 bg-gray-900 rounded-2xl" />
        </div>
      </main>
    )
  }

  if (!data) {
    return (
      <main className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <img src="/logo.png" alt="The House" width={140} className="object-contain mx-auto mb-6 opacity-60"
            onError={e => { e.target.style.display = 'none' }} />
          <p className="text-gray-500 text-sm">No hay datos disponibles aún.</p>
        </div>
      </main>
    )
  }

  const { sfCur, laCur, sfGrowth, laGrowth, sfTicketDiff, laTicketDiff, sfPrepDiff, laPrepDiff, topProducts, period } = data
  const sfOrders = sfCur?.total_orders || 0
  const laOrders = laCur?.total_orders || 0
  const sfWins = sfOrders > laOrders
  const laWins = laOrders > sfOrders
  const maxUnits = Math.max(...topProducts.map(p => Math.max(p.sf, p.la)), 1)

  return (
    <main className="min-h-screen bg-gray-950 p-4 md:p-8">
      <div className="max-w-2xl mx-auto space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-white font-bold text-xl">The House</h1>
            <p className="text-gray-500 text-sm capitalize">{monthLabel(period)}</p>
          </div>
          <img
            src="/logo.png"
            alt="The House"
            className="h-8 object-contain opacity-50"
            onError={e => { e.target.style.display = 'none' }}
          />
        </div>

        {/* SF vs LA */}
        <div className="grid grid-cols-2 gap-3">

          {/* San Felipe */}
          <div className={`bg-gray-900 rounded-2xl p-4 border transition ${sfWins ? 'border-orange-500' : 'border-gray-800'}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-orange-400 text-[11px] font-bold uppercase tracking-widest">San Felipe</span>
              {sfWins && <span className="text-base">👑</span>}
            </div>
            <p className="text-white font-bold text-4xl leading-none">{sfOrders.toLocaleString('es-CL')}</p>
            <p className="text-gray-600 text-xs mt-1 mb-3">órdenes</p>
            <GrowthBadge pct={sfGrowth} />
            <div className="mt-3 space-y-1.5">
              <p className="text-gray-500 text-xs flex items-center gap-1">
                Ticket prom. <span className="text-white font-semibold">${(sfCur?.avg_ticket || 0).toLocaleString('es-CL')}</span>
                {sfTicketDiff !== null && (
                  <span className={`text-[10px] font-bold ${sfTicketDiff > 0 ? 'text-green-400' : sfTicketDiff < 0 ? 'text-red-400' : 'text-gray-500'}`}>
                    {sfTicketDiff > 0 ? '↑' : sfTicketDiff < 0 ? '↓' : ''}
                  </span>
                )}
              </p>
              {sfCur?.avg_prep_minutes != null && (
                <p className="text-gray-500 text-xs flex items-center gap-1">
                  Prep. prom. <span className="text-white font-semibold">{Math.round(sfCur.avg_prep_minutes)} min</span>
                  {sfPrepDiff !== null && (
                    <span className={`text-[10px] font-bold ${sfPrepDiff < 0 ? 'text-green-400' : sfPrepDiff > 0 ? 'text-red-400' : 'text-gray-500'}`}>
                      {sfPrepDiff < 0 ? '↓' : sfPrepDiff > 0 ? '↑' : ''}
                    </span>
                  )}
                  {sfPrepDiff !== null && sfPrepDiff !== 0 && (
                    <span className={`text-[10px] ${sfPrepDiff < 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {Math.abs(sfPrepDiff)}m
                    </span>
                  )}
                </p>
              )}
            </div>
          </div>

          {/* Los Andes */}
          <div className={`bg-gray-900 rounded-2xl p-4 border transition ${laWins ? 'border-sky-500' : 'border-gray-800'}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sky-400 text-[11px] font-bold uppercase tracking-widest">Los Andes</span>
              {laWins && <span className="text-base">👑</span>}
            </div>
            <p className="text-white font-bold text-4xl leading-none">{laOrders.toLocaleString('es-CL')}</p>
            <p className="text-gray-600 text-xs mt-1 mb-3">órdenes</p>
            <GrowthBadge pct={laGrowth} />
            <div className="mt-3 space-y-1.5">
              <p className="text-gray-500 text-xs flex items-center gap-1">
                Ticket prom. <span className="text-white font-semibold">${(laCur?.avg_ticket || 0).toLocaleString('es-CL')}</span>
                {laTicketDiff !== null && (
                  <span className={`text-[10px] font-bold ${laTicketDiff > 0 ? 'text-green-400' : laTicketDiff < 0 ? 'text-red-400' : 'text-gray-500'}`}>
                    {laTicketDiff > 0 ? '↑' : laTicketDiff < 0 ? '↓' : ''}
                  </span>
                )}
              </p>
              {laCur?.avg_prep_minutes != null && (
                <p className="text-gray-500 text-xs flex items-center gap-1">
                  Prep. prom. <span className="text-white font-semibold">{Math.round(laCur.avg_prep_minutes)} min</span>
                  {laPrepDiff !== null && (
                    <span className={`text-[10px] font-bold ${laPrepDiff < 0 ? 'text-green-400' : laPrepDiff > 0 ? 'text-red-400' : 'text-gray-500'}`}>
                      {laPrepDiff < 0 ? '↓' : laPrepDiff > 0 ? '↑' : ''}
                    </span>
                  )}
                  {laPrepDiff !== null && laPrepDiff !== 0 && (
                    <span className={`text-[10px] ${laPrepDiff < 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {Math.abs(laPrepDiff)}m
                    </span>
                  )}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Top 5 productos */}
        {topProducts.length > 0 && (
          <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-semibold">Top 5 del mes</h2>
              <div className="flex items-center gap-3 text-[11px] text-gray-500">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-orange-500 inline-block" />SF
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-sky-500 inline-block" />LA
                </span>
              </div>
            </div>

            <div className="space-y-4">
              {topProducts.map((p, i) => (
                <div key={p.name}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-gray-600 text-xs w-4 shrink-0">{i + 1}</span>
                      <span className="text-white text-sm font-medium truncate">{p.name}</span>
                    </div>
                    <span className="text-gray-500 text-xs shrink-0 ml-2">{p.total.toLocaleString('es-CL')} uds</span>
                  </div>

                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-orange-400 text-[10px] w-4 shrink-0">SF</span>
                    <div className="flex-1 bg-gray-800 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-orange-500 h-2 rounded-full"
                        style={{ width: `${Math.max((p.sf / maxUnits) * 100, p.sf > 0 ? 2 : 0)}%` }}
                      />
                    </div>
                    <span className="text-gray-600 text-[10px] w-7 text-right shrink-0">{p.sf}</span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="text-sky-400 text-[10px] w-4 shrink-0">LA</span>
                    <div className="flex-1 bg-gray-800 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-sky-500 h-2 rounded-full"
                        style={{ width: `${Math.max((p.la / maxUnits) * 100, p.la > 0 ? 2 : 0)}%` }}
                      />
                    </div>
                    <span className="text-gray-600 text-[10px] w-7 text-right shrink-0">{p.la}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </main>
  )
}
