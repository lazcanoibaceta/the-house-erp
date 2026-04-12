'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
const supabase = createClient()

export default function Inventario() {
  const [insumos, setInsumos] = useState([])
  const [nombre, setNombre] = useState('')
  const [unidad, setUnidad] = useState('')
  const [stockMinimo, setStockMinimo] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetchInsumos()
  }, [])

  async function fetchInsumos() {
    const { data, error } = await supabase.from('insumos').select('*')
    if (error) console.error(error)
    else setInsumos(data)
  }

  async function agregarInsumo(e) {
    e.preventDefault()
    setLoading(true)
    const { error } = await supabase.from('insumos').insert({
      name: nombre,
      unit: unidad,
      stock: 0,
      min_stock: parseFloat(stockMinimo),
    })
    if (error) console.error(error)
    else {
      setNombre('')
      setUnidad('')
      setStockMinimo('')
      fetchInsumos()
    }
    setLoading(false)
  }

 return (
    <main className="min-h-screen bg-gray-950 p-4 md:p-8">
      <div className="max-w-2xl mx-auto">

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">📦 Inventario</h1>
        </div>

        <Link href="/inventario/conteo">
          <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 hover:border-orange-500 transition cursor-pointer mb-6">
            <h2 className="font-semibold text-white">📋 Hacer conteo de inventario</h2>
            <p className="text-gray-500 text-sm mt-1">Registra el stock actual de tus insumos</p>
          </div>
        </Link>

        {/* Formulario */}
        <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 mb-6">
          <h2 className="font-semibold text-white mb-4">Agregar insumo</h2>
          <form onSubmit={agregarInsumo} className="flex flex-col gap-3">
            <input
              type="text"
              placeholder="Nombre (ej: Carne)"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              required
              className="bg-gray-800 border border-gray-700 rounded-lg p-2 text-white placeholder-gray-500"
            />
            <input
              type="text"
              placeholder="Unidad (ej: kg, un, lt)"
              value={unidad}
              onChange={(e) => setUnidad(e.target.value)}
              required
              className="bg-gray-800 border border-gray-700 rounded-lg p-2 text-white placeholder-gray-500"
            />
            <input
              type="number"
              placeholder="Stock mínimo"
              value={stockMinimo}
              onChange={(e) => setStockMinimo(e.target.value)}
              required
              className="bg-gray-800 border border-gray-700 rounded-lg p-2 text-white placeholder-gray-500"
            />
            <button
              type="submit"
              disabled={loading}
              className="bg-orange-500 hover:bg-orange-600 text-white rounded-lg p-2 font-semibold transition disabled:opacity-50"
            >
              {loading ? 'Guardando...' : 'Agregar insumo'}
            </button>
          </form>
        </div>

        {/* Lista */}
        {insumos.length === 0 ? (
          <p className="text-gray-500">No hay insumos registrados todavía.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {insumos.map((insumo) => (
              <div key={insumo.id} className="bg-gray-900 rounded-2xl p-4 border border-gray-800 flex justify-between items-center">
                <div>
                  <h2 className="font-semibold text-white">{insumo.name}</h2>
                  <p className="text-sm text-gray-500">Stock: {insumo.stock} {insumo.unit}</p>
                </div>
                {insumo.stock <= insumo.min_stock && (
                  <span className="text-red-400 text-sm font-semibold">⚠️ Stock bajo</span>
                )}
              </div>
            ))}
          </div>
        )}

      </div>
    </main>
  )
}