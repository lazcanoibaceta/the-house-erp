'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import RoleGuard from '@/components/RoleGuard'
import { computeProjection, MESES_CORTO } from '@/lib/proyeccion'

const supabase = createClient()

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const fmt = n => '$' + Math.round(n || 0).toLocaleString('es-CL')
const fmtK = n => '$' + (Math.round((n || 0) / 1000) / 1000).toFixed(1).replace('.', ',') + 'M'
const tkey = (loc, y, m) => `${loc}-${y}-${m}`

export default function ProyeccionPage() {
  const [loading, setLoading] = useState(true)
  const [locs, setLocs] = useState([])
  const [proj, setProj] = useState({})          // { SF: projection, LA: projection }
  const [actuals, setActuals] = useState({})     // { SF: {'2026-7': sales}, LA: {...} }
  const [sel, setSel] = useState('SF')
  const [growth, setGrowth] = useState({ SF: 8, LA: 8 })
  const [drafts, setDrafts] = useState({})       // tkey -> string (objetivo editable)
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState('')

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setLoading(true)
    const [{ data: locations }, { data: sp }, { data: tg }] = await Promise.all([
      supabase.from('locations').select('id, short_code'),
      supabase.from('sales_periods').select('period_start, total_sales, source, location_id'),
      supabase.from('sales_targets').select('*'),
    ])
    setLocs(locations || [])

    const projByLoc = {}, actualsByLoc = {}, draftInit = {}
    for (const loc of locations || []) {
      const rows = (sp || []).filter(r => r.location_id === loc.id)
      const periods = rows.map(r => ({
        year: +r.period_start.slice(0, 4), month: +r.period_start.slice(5, 7),
        sales: +r.total_sales, source: r.source,
      }))
      const p = computeProjection(periods)
      projByLoc[loc.short_code] = p
      actualsByLoc[loc.short_code] = {}
      periods.forEach(pr => { actualsByLoc[loc.short_code][`${pr.year}-${pr.month}`] = pr.sales })

      // Inicializar objetivos: guardado si existe, si no proyección × (1+crecimiento)
      if (p) {
        const saved = {}
        ;(tg || []).filter(t => t.location_id === loc.id).forEach(t => { saved[`${t.period_year}-${t.period_month}`] = t.target_amount })
        p.forecast.forEach(f => {
          const k = `${f.year}-${f.month}`
          const val = saved[k] != null ? saved[k] : Math.round(f.expected * (1 + (growth[loc.short_code] || 0) / 100))
          draftInit[tkey(loc.short_code, f.year, f.month)] = String(val)
        })
      }
    }
    setProj(projByLoc); setActuals(actualsByLoc); setDrafts(draftInit)
    setLoading(false)
  }

  // Rellena los objetivos del local seleccionado = proyección × (1+crecimiento)
  function aplicarCrecimiento(loc) {
    const p = proj[loc]; if (!p) return
    const g = (growth[loc] || 0) / 100
    setDrafts(prev => {
      const next = { ...prev }
      p.forecast.forEach(f => { next[tkey(loc, f.year, f.month)] = String(Math.round(f.expected * (1 + g))) })
      return next
    })
    setSavedMsg('')
  }

  async function guardar(loc) {
    const p = proj[loc]; const locId = locs.find(l => l.short_code === loc)?.id
    if (!p || !locId) return
    setSaving(true); setSavedMsg('')
    const rows = p.forecast.map(f => ({
      location_id: locId, period_year: f.year, period_month: f.month,
      target_amount: Math.round(parseFloat(drafts[tkey(loc, f.year, f.month)]) || 0),
      updated_at: new Date().toISOString(),
    })).filter(r => r.target_amount > 0)
    const { error } = await supabase.from('sales_targets').upsert(rows, { onConflict: 'location_id,period_year,period_month' })
    setSaving(false)
    setSavedMsg(error ? 'Error al guardar: ' + error.message : `✅ ${rows.length} objetivos guardados para ${loc}`)
  }

  // ── Datos para render ────────────────────────────────────────────────────
  const esAmbos = sel === 'AMBOS'
  const locsShow = esAmbos ? ['SF', 'LA'] : [sel]
  const anyProj = locsShow.every(l => proj[l])

  // Filas de la tabla de proyección (12 meses). En Ambos, suma SF+LA.
  const baseFc = proj[locsShow[0]]?.forecast || []
  const rows = baseFc.map((f, i) => {
    let expected = 0, low = 0, high = 0, objetivo = 0, real = 0, hayReal = false
    for (const l of locsShow) {
      const ff = proj[l].forecast[i]
      expected += ff.expected; low += ff.low; high += ff.high
      objetivo += Math.round(parseFloat(drafts[tkey(l, ff.year, ff.month)]) || 0)
      const r = actuals[l]?.[`${ff.year}-${ff.month}`]
      if (r != null) { real += r; hayReal = true }
    }
    return { year: f.year, month: f.month, expected, low, high, objetivo, real, hayReal }
  })

  const totalProy = rows.reduce((s, r) => s + r.expected, 0)
  const totalObj = rows.reduce((s, r) => s + r.objetivo, 0)

  return (
    <RoleGuard allowedRoles={['admin', 'admin_supremo']}>
      <main className="min-h-screen bg-gray-950 p-4 md:p-8">
        <div className="max-w-3xl mx-auto flex flex-col gap-6">

          <div>
            <h1 className="text-2xl font-bold text-white">🎯 Proyección y objetivos</h1>
            <p className="text-gray-500 text-sm mt-1">Ventas totales (c/IVA) · próximos 12 meses por estacionalidad</p>
          </div>

          {/* Toggle local */}
          <div className="flex rounded-lg overflow-hidden border border-gray-700 self-start">
            {['SF', 'LA', 'AMBOS'].map(code => (
              <button key={code} onClick={() => { setSel(code); setSavedMsg('') }}
                className={`px-4 py-1.5 text-sm font-bold transition ${sel === code ? 'bg-orange-500 text-white' : 'bg-gray-900 text-gray-500 hover:text-gray-300'}`}>
                {code === 'SF' ? 'San Felipe' : code === 'LA' ? 'Los Andes' : 'Ambos'}
              </button>
            ))}
          </div>

          {loading ? (
            <p className="text-gray-500 text-sm">Cargando...</p>
          ) : !anyProj ? (
            <p className="text-gray-400 text-sm">No hay suficientes datos históricos para proyectar este local.</p>
          ) : (
            <>
              {/* Resumen del cálculo (solo local individual) */}
              {!esAmbos && (() => {
                const p = proj[sel]
                return (
                  <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 flex flex-col gap-3">
                    <div className="grid grid-cols-3 gap-3">
                      <div><p className="text-gray-500 text-xs">Nivel de tendencia</p><p className="text-white font-bold">{fmt(p.baseLevel)}</p><p className="text-gray-600 text-xs">promedio mensual</p></div>
                      <div><p className="text-gray-500 text-xs">Rango típico</p><p className="text-white font-bold">±{Math.round(p.bandPct * 100)}%</p><p className="text-gray-600 text-xs">variación mes a mes</p></div>
                      <div><p className="text-gray-500 text-xs">Meses usados</p><p className="text-white font-bold">{p.monthsUsed}</p><p className="text-gray-600 text-xs">datos limpios</p></div>
                    </div>

                    {/* Estacionalidad mini-barras */}
                    <div>
                      <p className="text-gray-400 text-xs mb-2">Estacionalidad (1,00 = mes promedio)</p>
                      <div className="flex items-end gap-1 h-20">
                        {Array.from({ length: 12 }, (_, m) => {
                          const v = p.index[m + 1]
                          const h = Math.max(6, Math.min(100, v * 55))
                          const alto = v >= 1.08, bajo = v <= 0.92
                          return (
                            <div key={m} className="flex-1 flex flex-col items-center gap-1">
                              <div className={`w-full rounded-t ${alto ? 'bg-green-500/70' : bajo ? 'bg-red-500/60' : 'bg-gray-600'}`} style={{ height: `${h}%` }} title={`${MESES[m]}: ${v.toFixed(2)}`} />
                              <span className="text-[9px] text-gray-500">{MESES_CORTO[m]}</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    {p.excluded.length > 0 && (
                      <p className="text-gray-600 text-xs">
                        No se consideraron (para no sesgar): {p.excluded.map(e => `${MESES_CORTO[e.month - 1]} ${e.year} (${e.motivo})`).join(' · ')}.
                      </p>
                    )}
                  </div>
                )
              })()}

              {/* Control de crecimiento (solo local individual) */}
              {!esAmbos && (
                <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 flex flex-wrap items-center gap-3">
                  <span className="text-gray-300 text-sm">Objetivo = proyección</span>
                  <div className="flex items-center gap-1">
                    <span className="text-gray-500">+</span>
                    <input type="number" value={growth[sel]} onChange={e => setGrowth({ ...growth, [sel]: e.target.value === '' ? '' : Number(e.target.value) })}
                      className="w-16 bg-gray-800 border border-gray-700 rounded-lg p-2 text-white text-sm text-center" />
                    <span className="text-gray-500">%</span>
                  </div>
                  <button onClick={() => aplicarCrecimiento(sel)} className="text-sm text-orange-400 border border-orange-500/30 rounded-lg px-3 py-1.5 hover:bg-orange-500/10 transition">
                    Aplicar a los 12 meses
                  </button>
                  <span className="text-gray-600 text-xs">Puedes ajustar cada mes en la tabla.</span>
                </div>
              )}

              {/* Tabla de proyección */}
              <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-gray-500 text-xs border-b border-gray-800">
                        <th className="text-left p-3 font-medium">Mes</th>
                        <th className="text-right p-3 font-medium">Proyección</th>
                        <th className="text-right p-3 font-medium">Rango</th>
                        <th className="text-right p-3 font-medium">Objetivo</th>
                        <th className="text-right p-3 font-medium">Real</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(r => {
                        const cumpl = r.hayReal && r.objetivo > 0 ? Math.round(r.real / r.objetivo * 100) : null
                        return (
                          <tr key={`${r.year}-${r.month}`} className="border-b border-gray-800/50 last:border-0">
                            <td className="p-3 text-white">{MESES_CORTO[r.month - 1]} {r.year}</td>
                            <td className="p-3 text-right text-gray-300">{fmt(r.expected)}</td>
                            <td className="p-3 text-right text-gray-600 text-xs whitespace-nowrap">{fmtK(r.low)}–{fmtK(r.high)}</td>
                            <td className="p-3 text-right">
                              {esAmbos ? (
                                <span className="text-orange-400 font-medium">{fmt(r.objetivo)}</span>
                              ) : (
                                <input type="number" value={drafts[tkey(sel, r.year, r.month)] ?? ''}
                                  onChange={e => setDrafts({ ...drafts, [tkey(sel, r.year, r.month)]: e.target.value })}
                                  className="w-28 bg-gray-800 border border-gray-700 rounded-lg p-1.5 text-white text-sm text-right" />
                              )}
                            </td>
                            <td className="p-3 text-right">
                              {r.hayReal ? (
                                <span className="text-white">{fmt(r.real)} {cumpl != null && <span className={cumpl >= 100 ? 'text-green-400' : 'text-red-400'}>({cumpl}%)</span>}</span>
                              ) : <span className="text-gray-700">—</span>}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-gray-700 font-semibold">
                        <td className="p-3 text-white">Total 12 meses</td>
                        <td className="p-3 text-right text-gray-300">{fmt(totalProy)}</td>
                        <td className="p-3"></td>
                        <td className="p-3 text-right text-orange-400">{fmt(totalObj)}</td>
                        <td className="p-3"></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Guardar (solo local individual) */}
              {!esAmbos && (
                <div className="flex items-center gap-3">
                  <button onClick={() => guardar(sel)} disabled={saving}
                    className="bg-orange-500 hover:bg-orange-600 text-white rounded-xl px-5 py-2.5 font-semibold transition disabled:opacity-50">
                    {saving ? 'Guardando...' : `Guardar objetivos de ${sel === 'SF' ? 'San Felipe' : 'Los Andes'}`}
                  </button>
                  {savedMsg && <span className="text-sm text-gray-300">{savedMsg}</span>}
                </div>
              )}

              {/* Backtest: qué tan bien pega el modelo en los últimos meses */}
              {!esAmbos && proj[sel].fit.length > 0 && (
                <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
                  <p className="text-gray-400 text-sm font-medium mb-3">¿Qué tan bien predice? — últimos meses: real vs modelo</p>
                  <div className="flex flex-col gap-2">
                    {proj[sel].fit.map(f => {
                      const err = f.expected > 0 ? Math.round((f.actual - f.expected) / f.expected * 100) : 0
                      return (
                        <div key={`${f.year}-${f.month}`} className="flex items-center justify-between text-sm">
                          <span className="text-gray-400 w-24">{MESES_CORTO[f.month - 1]} {f.year}{f.esOutlier ? ' ⚡' : f.esParcial ? ' ½' : ''}</span>
                          <span className="text-gray-500 text-xs">modelo {fmt(f.expected)}</span>
                          <span className="text-white">real {fmt(f.actual)}</span>
                          <span className={`w-14 text-right ${Math.abs(err) <= 12 ? 'text-green-400' : 'text-yellow-400'}`}>{err > 0 ? '+' : ''}{err}%</span>
                        </div>
                      )
                    })}
                  </div>
                  <p className="text-gray-600 text-xs mt-2">⚡ = evento excluido · ½ = mes parcial (no cuentan para el modelo).</p>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </RoleGuard>
  )
}
