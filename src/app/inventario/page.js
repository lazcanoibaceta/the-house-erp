'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

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
    <main className="min-h-screen bg-gray-100 p-6">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">📦 Inventario</h1>

      <Link href="/inventario/conteo">
        <div className="bg-white rounded-2xl p-4 shadow hover:shadow-md transition cursor-pointer mb-6">
          <h2 className="font-semibold text-gray-700">📋 Hacer conteo de inventario</h2>
          <p className="text-gray-400 text-sm mt-1">Registra el stock actual de tus insumos</p>
        </div>
      </Link>

      {/* Formulario */}
      <div className="bg-white rounded-2xl p-4 shadow mb-6">
        <h2 className="font-semibold text-gray-700 mb-4">Agregar insumo</h2>
        <form onSubmit={agregarInsumo} className="flex flex-col gap-3">
          <input
            type="text"
            placeholder="Nombre (ej: Carne)"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            required
            className="border rounded-lg p-2 text-gray-700"
          />
          <input
            type="text"
            placeholder="Unidad (ej: kg, un, lt)"
            value={unidad}
            onChange={(e) => setUnidad(e.target.value)}
            required
            className="border rounded-lg p-2 text-gray-700"
          />
          <input
            type="number"
            placeholder="Stock mínimo"
            value={stockMinimo}
            onChange={(e) => setStockMinimo(e.target.value)}
            required
            className="border rounded-lg p-2 text-gray-700"
          />
          <button
            type="submit"
            disabled={loading}
            className="bg-gray-800 text-white rounded-lg p-2 font-semibold hover:bg-gray-700 transition"
          >
            {loading ? 'Guardando...' : 'Agregar insumo'}
          </button>
        </form>
      </div>

      {/* Lista */}
      {insumos.length === 0 ? (
        <p className="text-gray-400">No hay insumos registrados todavía.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {insumos.map((insumo) => (
            <div key={insumo.id} className="bg-white rounded-2xl p-4 shadow flex justify-between items-center">
              <div>
                <h2 className="font-semibold text-gray-700">{insumo.name}</h2>
                <p className="text-sm text-gray-400">Stock: {insumo.stock} {insumo.unit}</p>
              </div>
              {insumo.stock <= insumo.min_stock && (
                <span className="text-red-500 text-sm font-semibold">⚠️ Stock bajo</span>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  )
}