'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { useLocation } from '@/hooks/useLocation'

const supabase = createClient()

export default function Inventario() {
  const { locationCode } = useLocation()
  const [insumos, setInsumos] = useState([])
  const [nombre, setNombre] = useState('')
  const [unidad, setUnidad] = useState('')
  const [stockMinimo, setStockMinimo] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetchInsumos()
  }, [])

  async function fetchInsumos() {
    const { data, error } = await supabase
      .from('insumos')
      .select('*')
      .order('name')
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

  const insumosStockBajo = insumos.filter(i => i.stock <= i.min_stock)

  return (
    <main className="min-h-screen bg-gray-950 p-4 md:p-8">
      <div className="max-w-2xl mx-auto">

        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">📦 Inventario</h1>
          <span className="bg-orange-500 text-white text-sm font-bold px-3 py-1 rounded-lg">
            {locationCode}
          </span>
        </div>

        <Link href="/inventario/conteo">
          <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 hover:border-orange-500 transition cursor-pointer mb-6">
            <h2 className="font-semibold text-white">📋 Hacer conteo de inventario</h2>
            <p className="text-gray-500 text-sm mt-1">Registra el stock actual de tus insumos</p>
          </div>
        </Link>

        {/* Alerta stock bajo */}
        {insumosStockBajo.length > 0 && (
          <div className="bg-red-950 border border-red-800 rounded-2xl p-4 mb-6">
            <p className="text-red-400 font-semibold mb-2">⚠️ {insumosStockBajo.length} insumo{insumosStockBajo.length > 1 ? 's' : ''} con stock bajo</p>
            <div className="flex flex-col gap-1">
              {insumosStockBajo.map(i => (
                <p key={i.id} className="text-red-300 text-sm">
                  {i.name} — {i.stock} {i.unit} (mín: {i.min_stock})
                </p>
              ))}
            </div>
          </div>
        )}

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