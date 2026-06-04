'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useLocation } from '@/hooks/useLocation'
import { getMermaForMonth } from '@/lib/merma'
import RoleGuard from '@/components/RoleGuard'

const supabase = createClient()
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

export default function Merma() {
  const { locationCode, locationId, loading: locationLoading } = useLocation()
  const now = new Date()
  const [year, setYear]   = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1) // mes actual; el usuario ajusta
  const [data, setData]   = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function calcular() {
    if (!locationId) return
    setLoading(true)
    setError(null)
    setData(null)
    const res = await getMermaForMonth(locationId, year, month, supabase)
    if (res.ok) setData(res)
    else setError(res.error)
    setLoading(false)
  }

  // Recalcular al cambiar de local
  useEffect(() => { if (locationId) calcular() }, [locationId]) // eslint-disable-line react-hooks/exhaustive-deps

  const clp = (n) => `${n < 0 ? '-' : ''}$${Math.abs(Math.round(n)).toLocaleString('es-CL')}`
  const qty = (n) => Number(n.toFixed(2)).toLocaleString('es-CL')

  // Color: merma positiva (consumiste de más) es mala; cuanto mayor, más roja
  function colorMerma(pct) {
    if (pct === null) return 'text-gray-500'
    if (pct <= 5 && pct >= -5) return 'text-green-400'
    if (pct <= 15) return 'text-yellow-400'
    return 'text-red-400'
  }

  return (
    <RoleGuard allowedRoles={['admin_supremo', 'admin']}>
    <main className="min-h-screen bg-gray-950 p-4 md:p-8">
      <div className="max-w-4xl mx-auto">

        {/* Header */}
        <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white">🗑️ Merma</h1>
            <p className="text-gray-500 text-sm mt-1">Consumo teórico (recetas × ventas) vs consumo real (conteos + compras)</p>
          </div>
          <span className="bg-orange-500 text-white text-sm font-bold px-3 py-1 rounded-lg">{locationCode}</span>
        </div>

        {/* Selector de período */}
        <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 mb-5 flex gap-3 items-end flex-wrap">
          <div className="flex-1 min-w-[120px]">
            <label className="text-gray-400 text-xs mb-1 block">Mes</label>
            <select value={month} onChange={e => setMonth(Number(e.target.value))}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm">
              {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div className="min-w-[100px]">
            <label className="text-gray-400 text-xs mb-1 block">Año</label>
            <select value={year} onChange={e => setYear(Number(e.target.value))}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm">
              {[now.getFullYear() - 1, now.getFullYear()].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <button onClick={calcular} disabled={loading || locationLoading}
            className="bg-orange-500 hover:bg-orange-600 text-white rounded-xl px-5 py-2 font-semibold transition disabled:opacity-50">
            {loading ? '⏳ Calculando...' : 'Calcular merma'}
          </button>
        </div>

        {error && (
          <div className="bg-orange-950/40 border border-orange-800/50 rounded-xl px-4 py-3 mb-5 text-sm text-orange-300 flex items-center gap-2">
            <span>⚠️</span><span>{error}</span>
          </div>
        )}

        {loading && (
          <div className="bg-gray-900 rounded-2xl border border-gray-800 p-8 text-center">
            <p className="text-gray-500 text-sm animate-pulse">Cruzando recetas con ventas y conteos... ⏳</p>
          </div>
        )}

        {data && !loading && (
          <>
            {/* Aviso de cobertura: clave para confiar en el número */}
            <div className={`rounded-xl px-4 py-3 mb-5 text-sm flex items-start gap-2 border ${
              data.coberturaPct >= 90 ? 'bg-green-950/30 border-green-800/40 text-green-300'
              : data.coberturaPct >= 70 ? 'bg-yellow-950/30 border-yellow-800/40 text-yellow-300'
              : 'bg-red-950/30 border-red-800/40 text-red-300'
            }`}>
              <span>{data.coberturaPct >= 90 ? '✅' : '⚠️'}</span>
              <span>
                <strong>{data.coberturaPct.toFixed(0)}% de las unidades vendidas tienen receta cargada</strong> y entraron al cálculo teórico.
                {data.coberturaPct < 90 && ' Mientras más bajo, menos confiable es la merma — carga las recetas faltantes (abajo) para mejorarlo.'}
                <span className="block text-xs opacity-70 mt-1">Período: {data.desde} → {data.hasta}</span>
              </span>
            </div>

            {/* Resumen */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
                <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Merma total</p>
                <p className={`text-2xl font-bold ${data.totalMermaValor > 0 ? 'text-red-400' : 'text-green-400'}`}>
                  {clp(data.totalMermaValor)}
                </p>
                <p className="text-gray-600 text-xs mt-1">Real − teórico, neto</p>
              </div>
              <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
                <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">% sobre ventas</p>
                <p className={`text-2xl font-bold ${colorMerma(data.mermaPctVentas)}`}>
                  {data.mermaPctVentas === null ? '—' : `${data.mermaPctVentas.toFixed(1)}%`}
                </p>
                <p className="text-gray-600 text-xs mt-1">Meta: &lt;3–5%</p>
              </div>
              <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
                <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Costo teórico</p>
                <p className="text-2xl font-bold text-white">{clp(data.totalTeoricoValor)}</p>
                <p className="text-gray-600 text-xs mt-1">Lo que debiste gastar</p>
              </div>
              <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
                <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Costo real</p>
                <p className="text-2xl font-bold text-white">{clp(data.totalRealValor)}</p>
                <p className="text-gray-600 text-xs mt-1">Lo que saliste de bodega</p>
              </div>
            </div>

            {/* Tabla por insumo */}
            <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden mb-6">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="text-left  text-gray-400 font-medium p-4">Insumo</th>
                      <th className="text-right text-gray-400 font-medium p-4">Teórico</th>
                      <th className="text-right text-gray-400 font-medium p-4">Real</th>
                      <th className="text-right text-gray-400 font-medium p-4">Merma</th>
                      <th className="text-right text-gray-400 font-medium p-4">Merma $</th>
                      <th className="text-right text-gray-400 font-medium p-4">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.insumos.map((row, i) => (
                      <tr key={row.insumo_id} className={`border-b border-gray-800 last:border-0 ${i % 2 === 0 ? '' : 'bg-gray-900/50'}`}>
                        <td className="p-4 text-white">{row.name} <span className="text-gray-600 text-xs">{row.unit}</span></td>
                        <td className="p-4 text-right text-gray-300">{qty(row.teorico)}</td>
                        <td className="p-4 text-right text-gray-300">{qty(row.real)}</td>
                        <td className={`p-4 text-right ${row.merma_qty > 0 ? 'text-red-400' : 'text-green-400'}`}>
                          {row.merma_qty > 0 ? '+' : ''}{qty(row.merma_qty)}
                        </td>
                        <td className={`p-4 text-right font-semibold ${row.merma_valor > 0 ? 'text-red-400' : 'text-green-400'}`}>
                          {row.merma_valor > 0 ? '+' : ''}{clp(row.merma_valor)}
                        </td>
                        <td className={`p-4 text-right font-semibold ${colorMerma(row.merma_pct)}`}>
                          {row.merma_pct === null ? '—' : `${row.merma_pct > 0 ? '+' : ''}${row.merma_pct.toFixed(0)}%`}
                        </td>
                      </tr>
                    ))}
                    {data.insumos.length === 0 && (
                      <tr><td colSpan={6} className="p-6 text-center text-gray-500">Sin insumos con movimiento en el período.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Consumo directo / sin receta (no es merma medible) */}
            {data.consumoDirecto?.length > 0 && (
              <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 mb-6">
                <div className="flex justify-between items-baseline mb-1">
                  <h3 className="text-white font-semibold">Consumo directo / sin receta</h3>
                  <span className="text-gray-400 text-sm">{clp(data.consumoDirectoValor)}</span>
                </div>
                <p className="text-gray-500 text-xs mb-3">
                  Insumos que se consumen pero ninguna receta los usa (ej: mantequilla a ojo). No entran a la merma.
                  Si alguno debería tener receta, cárgala.
                </p>
                <div className="flex flex-col gap-1">
                  {data.consumoDirecto.map(f => (
                    <div key={f.insumo_id} className="flex justify-between items-center text-sm">
                      <span className="text-gray-300">{f.name} <span className="text-gray-600 text-xs">{f.unit}</span></span>
                      <span className="text-gray-400">{qty(f.real)} · {clp(f.valor)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Productos vendidos sin receta (afectan la cobertura) */}
            {data.productosSinReceta.length > 0 && (
              <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
                <h3 className="text-white font-semibold mb-1">Productos vendidos sin receta calzada</h3>
                <p className="text-gray-500 text-xs mb-3">
                  Estos no entraron al teórico — o no tienen receta, o el nombre no coincide con la carta de Insumos/Recetas.
                </p>
                <div className="flex flex-col gap-1">
                  {data.productosSinReceta.slice(0, 25).map((p, i) => (
                    <div key={i} className="flex justify-between items-center text-sm">
                      <span className="text-gray-300">{p.name}</span>
                      <span className="text-gray-500">{p.units} u.</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

      </div>
    </main>
    </RoleGuard>
  )
}
