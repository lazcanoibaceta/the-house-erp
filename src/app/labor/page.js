'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useLocation } from '@/hooks/useLocation'

const supabase = createClient()

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

export default function Labor() {
  const { locationCode, locationId, loading: locationLoading } = useLocation()

  const now = new Date()
  const [formMes, setFormMes] = useState(now.getMonth() + 1)
  const [formAnio, setFormAnio] = useState(now.getFullYear())
  const [formAmount, setFormAmount] = useState('')
  const [formNotes, setFormNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)

  const [registros, setRegistros] = useState([])
  const [loading, setLoading] = useState(true)
  const [editandoId, setEditandoId] = useState(null)

  useEffect(() => {
    if (!locationId) return
    fetchRegistros()
  }, [locationId])

  async function fetchRegistros() {
    setLoading(true)
    const { data } = await supabase
      .from('labor_costs')
      .select('*')
      .eq('location_id', locationId)
      .order('period_year', { ascending: false })
      .order('period_month', { ascending: false })
    setRegistros(data || [])
    setLoading(false)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!locationId || !formAmount) return
    setSaving(true)

    // Upsert: si ya existe el mes, sobreescribe
    const { error } = await supabase
      .from('labor_costs')
      .upsert({
        ...(editandoId ? { id: editandoId } : {}),
        location_id: locationId,
        period_year: formAnio,
        period_month: formMes,
        amount: parseFloat(formAmount),
        notes: formNotes || null,
      }, { onConflict: 'location_id,period_year,period_month' })

    if (error) { console.error(error); setSaving(false); return }

    setSuccess(true)
    setFormAmount('')
    setFormNotes('')
    setEditandoId(null)
    await fetchRegistros()
    setSaving(false)
    setTimeout(() => setSuccess(false), 2500)
  }

  function cargarEdicion(r) {
    setEditandoId(r.id)
    setFormMes(r.period_month)
    setFormAnio(r.period_year)
    setFormAmount(r.amount)
    setFormNotes(r.notes || '')
    window.scrollTo(0, 0)
  }

  function cancelarEdicion() {
    setEditandoId(null)
    setFormAmount('')
    setFormNotes('')
  }

  // Calcular % respecto a ventas del mismo período si hay datos
  // (simple referencia, calculado client-side si el usuario quiere)

  return (
    <main className="min-h-screen bg-gray-950 p-4 md:p-8">
      <div className="max-w-xl mx-auto flex flex-col gap-8">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">👥 Costo Laboral</h1>
            <p className="text-gray-500 text-sm mt-1">Remuneraciones de {locationCode}</p>
          </div>
          <span className="bg-orange-500 text-white text-sm font-bold px-3 py-1 rounded-lg">
            {locationCode}
          </span>
        </div>

        {/* Formulario */}
        <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
          <div className="p-4 border-b border-gray-800">
            <h2 className="text-white font-semibold">
              {editandoId ? '✏️ Editar registro' : '+ Cargar mes'}
            </h2>
          </div>

          <form onSubmit={handleSubmit} className="p-4 flex flex-col gap-4">

            {success && (
              <div className="bg-green-900 text-green-300 rounded-xl p-3 text-sm font-semibold">
                ✅ Guardado correctamente
              </div>
            )}

            {/* Mes y año */}
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-gray-400 text-xs mb-1 block">Mes</label>
                <select
                  value={formMes}
                  onChange={e => setFormMes(parseInt(e.target.value))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-white text-sm"
                >
                  {MESES.map((m, i) => (
                    <option key={i} value={i + 1}>{m}</option>
                  ))}
                </select>
              </div>
              <div className="w-28">
                <label className="text-gray-400 text-xs mb-1 block">Año</label>
                <input
                  type="number"
                  value={formAnio}
                  onChange={e => setFormAnio(parseInt(e.target.value))}
                  min="2024"
                  max="2030"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-white text-sm"
                />
              </div>
            </div>

            {/* Monto total */}
            <div>
              <label className="text-gray-400 text-xs mb-1 block">
                Total remuneraciones del mes ($)
              </label>
              <input
                type="number"
                value={formAmount}
                onChange={e => setFormAmount(e.target.value)}
                placeholder="Incluir sueldos + cotizaciones empleador"
                required
                className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-white text-sm"
              />
              {formAmount && (
                <p className="text-gray-600 text-xs mt-1">
                  ${parseFloat(formAmount).toLocaleString('es-CL', { maximumFractionDigits: 0 })}
                </p>
              )}
            </div>

            {/* Notas */}
            <div>
              <label className="text-gray-400 text-xs mb-1 block">Notas (opcional)</label>
              <input
                type="text"
                value={formNotes}
                onChange={e => setFormNotes(e.target.value)}
                placeholder="Ej: incluye aguinaldo, bono, etc."
                className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-white text-sm"
              />
            </div>

            <p className="text-gray-600 text-xs">
              Si ya existe un registro para ese mes y local, se sobreescribirá.
            </p>

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={saving || locationLoading}
                className="flex-1 bg-orange-500 hover:bg-orange-600 text-white rounded-xl p-3 font-semibold text-sm transition disabled:opacity-50"
              >
                {saving ? 'Guardando...' : editandoId ? 'Guardar cambios' : 'Guardar'}
              </button>
              {editandoId && (
                <button
                  type="button"
                  onClick={cancelarEdicion}
                  className="px-4 bg-gray-800 text-gray-400 hover:text-white rounded-xl text-sm transition"
                >
                  Cancelar
                </button>
              )}
            </div>
          </form>
        </div>

        {/* Historial */}
        <div>
          <h2 className="text-lg font-bold text-white mb-3">Historial</h2>

          {loading || locationLoading ? (
            <p className="text-gray-500 text-sm">Cargando...</p>
          ) : registros.length === 0 ? (
            <p className="text-gray-600 text-sm">No hay registros para {locationCode} todavía.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {registros.map(r => (
                <div key={r.id} className="bg-gray-900 rounded-2xl p-4 border border-gray-800 flex items-center justify-between">
                  <div>
                    <p className="text-white font-semibold">
                      {MESES[r.period_month - 1]} {r.period_year}
                    </p>
                    {r.notes && <p className="text-gray-500 text-xs mt-0.5">{r.notes}</p>}
                  </div>
                  <div className="flex items-center gap-4">
                    <p className="text-white font-bold">
                      ${parseFloat(r.amount).toLocaleString('es-CL', { maximumFractionDigits: 0 })}
                    </p>
                    <button
                      onClick={() => cargarEdicion(r)}
                      className="text-orange-400 text-sm hover:text-orange-300 transition"
                    >
                      ✏️
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </main>
  )
}
