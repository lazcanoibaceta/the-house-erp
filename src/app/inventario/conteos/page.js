'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useLocation } from '@/hooks/useLocation'
const supabase = createClient()

export default function HistorialConteos() {
  const { locationCode, locationId, loading: locationLoading } = useLocation()
  const [conteos, setConteos] = useState([])
  const [conteoSeleccionado, setConteoSeleccionado] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingItems, setLoadingItems] = useState(false)

  useEffect(() => {
    if (!locationId) return
    fetchConteos()
  }, [locationId])

  async function fetchConteos() {
    const { data } = await supabase
      .from('inventory_counts')
      .select('*')
      .eq('location_id', locationId)
      .order('date', { ascending: false })
    setConteos(data || [])
    setLoading(false)
  }

  async function verDetalle(conteo) {
    setConteoSeleccionado(conteo)
    setLoadingItems(true)

    const { data } = await supabase
      .from('inventory_count_items')
      .select('quantity, insumos(name, unit, avg_cost)')
      .eq('count_id', conteo.id)
      .order('insumos(name)')

    setItems(data || [])
    setLoadingItems(false)
  }

  function cerrarDetalle() {
    setConteoSeleccionado(null)
    setItems([])
  }

  function valoracionTotal() {
    return items.reduce((sum, item) => {
      const avgCost = item.insumos?.avg_cost || 0
      return sum + (item.quantity * avgCost)
    }, 0)
  }

  return (
    <main className="min-h-screen bg-gray-950 p-4 md:p-8">
      <div className="max-w-2xl mx-auto">

        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">📋 Historial de Conteos</h1>
            <p className="text-gray-500 text-sm mt-1">Conteos de {locationCode}</p>
          </div>
          <span className="bg-orange-500 text-white text-sm font-bold px-3 py-1 rounded-lg">
            {locationCode}
          </span>
        </div>

        {loading || locationLoading ? (
          <p className="text-gray-500">Cargando...</p>
        ) : conteos.length === 0 ? (
          <p className="text-gray-500">No hay conteos registrados todavía.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {conteos.map((conteo) => (
              <button
                key={conteo.id}
                onClick={() => verDetalle(conteo)}
                className="bg-gray-900 rounded-2xl p-4 border border-gray-800 hover:border-orange-500 transition text-left w-full"
              >
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-white font-semibold">
                      {new Date(conteo.date + 'T12:00:00').toLocaleDateString('es-CL', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </p>
                    {conteo.notes && (
                      <p className="text-gray-500 text-sm mt-1">{conteo.notes}</p>
                    )}
                  </div>
                  <span className="text-orange-400 text-sm">Ver →</span>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Modal detalle */}
        {conteoSeleccionado && (
          <div className="fixed inset-0 bg-black/70 flex items-end md:items-center justify-center z-50 p-4">
            <div className="bg-gray-900 rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col border border-gray-800">

              <div className="p-4 border-b border-gray-800 flex justify-between items-center">
                <div>
                  <p className="text-white font-semibold">
                    {new Date(conteoSeleccionado.date + 'T12:00:00').toLocaleDateString('es-CL', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </p>
                  {conteoSeleccionado.notes && (
                    <p className="text-gray-500 text-sm">{conteoSeleccionado.notes}</p>
                  )}
                </div>
                <button onClick={cerrarDetalle} className="text-gray-400 hover:text-white text-xl">✕</button>
              </div>

              <div className="overflow-y-auto flex-1 p-4">
                {loadingItems ? (
                  <p className="text-gray-500">Cargando...</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {items.map((item, i) => (
                      <div key={i} className="flex justify-between items-center py-2 border-b border-gray-800 last:border-0">
                        <div>
                          <p className="text-white text-sm">{item.insumos?.name}</p>
                          <p className="text-gray-500 text-xs">{item.quantity} {item.insumos?.unit}</p>
                        </div>
                        <p className="text-gray-300 text-sm">
                          ${(item.quantity * (item.insumos?.avg_cost || 0)).toLocaleString('es-CL', { maximumFractionDigits: 0 })}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="p-4 border-t border-gray-800 flex justify-between items-center">
                <span className="text-gray-400 text-sm">Valoración total</span>
                <span className="text-white font-bold text-lg">
                  ${valoracionTotal().toLocaleString('es-CL', { maximumFractionDigits: 0 })}
                </span>
              </div>

            </div>
          </div>
        )}

      </div>
    </main>
  )
}