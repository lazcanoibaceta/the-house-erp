'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
const supabase = createClient()

export default function Conteo() {
  const [insumos, setInsumos] = useState([])
  const [counts, setCounts] = useState({})
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    async function fetchInsumos() {
      const { data } = await supabase.from('insumos').select('*').order('name')
      setInsumos(data || [])
    }
    fetchInsumos()
  }, [])

  function updateCount(id, value) {
    setCounts({ ...counts, [id]: value })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)

    // 1. Crear el conteo
    const { data: count, error } = await supabase
      .from('inventory_counts')
      .insert({ date, notes })
      .select()
      .single()

    if (error) {
      console.error(error)
      setLoading(false)
      return
    }

    // 2. Guardar solo los insumos que tienen valor ingresado
    const items = Object.entries(counts)
      .filter(([_, qty]) => qty !== '' && qty !== null)
      .map(([insumo_id, quantity]) => ({
        count_id: count.id,
        insumo_id,
        quantity: parseFloat(quantity),
      }))

    if (items.length > 0) {
      await supabase.from('inventory_count_items').insert(items)

      // 3. Actualizar stock actual de cada insumo contado
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
    <main className="min-h-screen bg-gray-100 p-6">
      <h1 className="text-2xl font-bold text-gray-800 mb-2">📋 Conteo de Inventario</h1>
      <p className="text-gray-400 text-sm mb-6">Ingresa solo los insumos que contaste. Los demás no se modifican.</p>

      {success && (
        <div className="bg-green-100 text-green-700 rounded-xl p-3 mb-4 font-semibold">
          ✅ Conteo guardado correctamente
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">

        {/* Fecha y notas */}
        <div className="bg-white rounded-2xl p-4 shadow flex flex-col gap-3">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            className="border rounded-lg p-2 text-gray-700"
          />
          <input
            type="text"
            placeholder="Notas (opcional, ej: conteo semanal)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="border rounded-lg p-2 text-gray-700"
          />
        </div>

        {/* Lista de insumos */}
        <div className="bg-white rounded-2xl p-4 shadow flex flex-col gap-2">
          <h2 className="font-semibold text-gray-700 mb-2">Insumos</h2>
          {insumos.map((insumo) => (
            <div key={insumo.id} className="flex items-center justify-between gap-3 border-b py-2 last:border-0">
              <div>
                <p className="text-gray-700 font-medium">{insumo.name}</p>
                <p className="text-gray-400 text-xs">Stock actual: {insumo.stock} {insumo.unit}</p>
              </div>
              <input
                type="number"
                placeholder="0"
                value={counts[insumo.id] || ''}
                onChange={(e) => updateCount(insumo.id, e.target.value)}
                className="border rounded-lg p-2 text-gray-700 w-24 text-right"
              />
            </div>
          ))}
        </div>

        {/* Resumen */}
        <div className="bg-white rounded-2xl p-4 shadow flex justify-between items-center">
          <span className="text-gray-500 text-sm">Insumos contados</span>
          <span className="font-bold text-gray-800">
            {Object.values(counts).filter(v => v !== '').length} / {insumos.length}
          </span>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="bg-gray-800 text-white rounded-xl p-3 font-semibold hover:bg-gray-700 transition"
        >
          {loading ? 'Guardando...' : 'Guardar conteo'}
        </button>
      </form>
    </main>
  )
}