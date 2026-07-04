'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useLocation } from '@/hooks/useLocation'
import { useRole } from '@/hooks/useRole'
import DateInput from '@/components/DateInput'

const supabase = createClient()

const LOCATION_NAMES = { SF: 'San Felipe', LA: 'Los Andes' }

export default function Conteo() {
  const { locationCode, loading: locationLoading } = useLocation()

  // Local EXPLÍCITO del formulario (mismo fix que compras/nuevo): parte con el
  // local activo pero queda fijado acá, visible y editable — evita guardar el
  // conteo en el local equivocado si el toggle cambió en otra pestaña
  const [locations, setLocations] = useState([])
  const [formLoc, setFormLoc] = useState('')

  const [insumos, setInsumos] = useState([])
  const [counts, setCounts] = useState({})
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [countType, setCountType] = useState('cierre_mes')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const formLocId = locations.find(l => l.short_code === formLoc)?.id || null

  useEffect(() => {
    async function fetchInsumos() {
      const { data } = await supabase.from('insumos').select('*').order('name')
      setInsumos(data || [])
    }
    fetchInsumos()
    supabase.from('locations').select('id, short_code').then(({ data }) => setLocations(data || []))
  }, [])

  // Inicializa el local del formulario con el local activo (solo una vez)
  useEffect(() => {
    if (!locationLoading && !formLoc && locationCode) setFormLoc(locationCode)
  }, [locationLoading, locationCode, formLoc])

  // Cajeros: local SIEMPRE fijo al suyo, aunque el rol cargue después
  const { role, locationCode: roleLocationCode } = useRole()
  const esCajero = role === 'cajero' && !!roleLocationCode
  useEffect(() => {
    if (esCajero && formLoc !== roleLocationCode) setFormLoc(roleLocationCode)
  }, [esCajero, roleLocationCode, formLoc])

  function updateCount(id, value) {
    setCounts({ ...counts, [id]: value })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!formLocId) return

    // Aviso si ya hay un cierre de mes cercano (±5 días) en este local:
    // dos cierres pegados distorsionan el food cost y la merma
    if (countType === 'cierre_mes') {
      const d = new Date(date + 'T00:00:00')
      const desde = new Date(d.getTime() - 5 * 86400000).toISOString().split('T')[0]
      const hasta = new Date(d.getTime() + 5 * 86400000).toISOString().split('T')[0]
      const { data: cercanos } = await supabase
        .from('inventory_counts')
        .select('date')
        .eq('location_id', formLocId)
        .eq('count_type', 'cierre_mes')
        .gte('date', desde)
        .lte('date', hasta)
      if (cercanos && cercanos.length > 0) {
        const ok = window.confirm(
          `⚠️ Ya existe un conteo de cierre de mes en ${LOCATION_NAMES[formLoc]} con fecha ${cercanos[0].date}.\n\n` +
          `¿Seguro que quieres guardar OTRO cierre de mes el ${date}? Dos cierres pegados distorsionan el food cost.`
        )
        if (!ok) return
      }
    }

    setLoading(true)

    const { data: count, error } = await supabase
      .from('inventory_counts')
      .insert({ date, notes, location_id: formLocId, count_type: countType })
      .select()
      .single()

    if (error) {
      console.error(error)
      setLoading(false)
      return
    }

    const items = Object.entries(counts)
      .filter(([_, qty]) => qty !== '' && qty !== null)
      .map(([insumo_id, quantity]) => ({
        count_id: count.id,
        insumo_id,
        quantity: parseFloat(quantity),
      }))

    if (items.length > 0) {
      await supabase.from('inventory_count_items').insert(items)

      for (const item of items) {
        await supabase
          .from('insumos')
          .update({ stock: item.quantity })
          .eq('id', item.insumo_id)
      }
    }

    setSuccess(true)
    setCounts({})
    setNotes('')
    setLoading(false)
    setTimeout(() => setSuccess(false), 3000)
  }

  return (
    <main className="min-h-screen bg-gray-950 p-4 md:p-8">
      <div className="max-w-2xl mx-auto">

        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">📋 Conteo de Inventario</h1>
            <p className="text-gray-500 text-sm mt-1">Ingresa solo los insumos que contaste. Los demás no se modifican.</p>
          </div>
          {esCajero ? (
            <span className="bg-orange-500 text-white text-sm font-bold px-3 py-1.5 rounded-lg">
              {LOCATION_NAMES[formLoc] || formLoc}
            </span>
          ) : (
            <div className="flex rounded-lg overflow-hidden border border-gray-700">
              {['SF', 'LA'].map(code => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setFormLoc(code)}
                  className={`px-3 py-1.5 text-sm font-bold transition ${
                    formLoc === code ? 'bg-orange-500 text-white' : 'bg-gray-900 text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {LOCATION_NAMES[code]}
                </button>
              ))}
            </div>
          )}
        </div>

        {success && (
          <div className="bg-green-900 text-green-300 rounded-xl p-3 mb-4 font-semibold">
            ✅ Conteo guardado correctamente
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">

          <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 flex flex-col gap-3">
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-gray-400 text-xs mb-1 block">Fecha</label>
                <DateInput value={date} onChange={setDate} required />
              </div>
              <div className="flex-1">
                <label className="text-gray-400 text-xs mb-1 block">Tipo de conteo</label>
                <select
                  value={countType}
                  onChange={(e) => setCountType(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-white text-sm"
                >
                  <option value="cierre_mes">Cierre de mes</option>
                  <option value="seguimiento">Seguimiento</option>
                </select>
              </div>
            </div>
            <input
              type="text"
              placeholder="Notas (opcional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg p-2 text-white placeholder-gray-500"
            />
          </div>

          <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 flex flex-col gap-2">
            <h2 className="font-semibold text-white mb-2">Insumos</h2>
            {insumos.map((insumo) => (
              <div key={insumo.id} className="flex items-center justify-between gap-3 border-b border-gray-800 py-2 last:border-0">
                <div>
                  <p className="text-white font-medium">{insumo.name}</p>
                  <p className="text-gray-500 text-xs">Stock actual: {insumo.stock} {insumo.unit}</p>
                </div>
                <input
                  type="number"
                  placeholder="0"
                  value={counts[insumo.id] || ''}
                  onChange={(e) => updateCount(insumo.id, e.target.value)}
                  className="bg-gray-800 border border-gray-700 rounded-lg p-2 text-white w-24 text-right"
                />
              </div>
            ))}
          </div>

          <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 flex justify-between items-center">
            <span className="text-gray-400 text-sm">Insumos contados</span>
            <span className="font-bold text-white">
              {Object.values(counts).filter(v => v !== '').length} / {insumos.length}
            </span>
          </div>

          <button
            type="submit"
            disabled={loading || !formLocId}
            className="bg-orange-500 hover:bg-orange-600 text-white rounded-xl p-3 font-semibold transition disabled:opacity-50"
          >
            {loading ? 'Guardando...' : `Guardar conteo en ${LOCATION_NAMES[formLoc] || '...'}`}
          </button>

        </form>
      </div>
    </main>
  )
}