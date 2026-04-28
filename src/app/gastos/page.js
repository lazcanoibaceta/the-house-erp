'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useLocation } from '@/hooks/useLocation'
import Link from 'next/link'

const supabase = createClient()

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
]

export default function Gastos() {
  const { locationCode, locationId, loading: locationLoading } = useLocation()

  const now = new Date()
  const [mes, setMes] = useState(now.getMonth() + 1)
  const [anio, setAnio] = useState(now.getFullYear())
  const [categoriaFiltro, setCategoriaFiltro] = useState('')

  const [gastos, setGastos] = useState([])
  const [categorias, setCategorias] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('expense_categories').select('*').order('name').then(({ data }) => {
      setCategorias(data || [])
    })
  }, [])

  useEffect(() => {
    if (locationLoading) return
    if (!locationId) {
      setLoading(false)
      return
    }
    fetchGastos()
  }, [locationId, locationLoading, mes, anio, categoriaFiltro])

  async function fetchGastos() {
    setLoading(true)

    const desde = `${anio}-${String(mes).padStart(2, '0')}-01`
    const lastDay = new Date(anio, mes, 0).getDate()
    const hasta = `${anio}-${String(mes).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

    let query = supabase
      .from('operating_expenses')
      .select('*, expense_categories(name)')
      .eq('location_id', locationId)
      .gte('expense_date', desde)
      .lte('expense_date', hasta)
      .order('expense_date', { ascending: false })

    if (categoriaFiltro) {
      query = query.eq('category_id', categoriaFiltro)
    }

    const { data } = await query
    setGastos(data || [])
    setLoading(false)
  }

  function navegarMes(dir) {
    let m = mes + dir
    let a = anio
    if (m > 12) { m = 1; a++ }
    if (m < 1) { m = 12; a-- }
    setMes(m)
    setAnio(a)
  }

  const totalMes = gastos.reduce((sum, g) => sum + parseFloat(g.amount_net), 0)

  // Agrupar por categoría para el resumen
  const porCategoria = gastos.reduce((acc, g) => {
    const cat = g.expense_categories?.name || 'Sin categoría'
    acc[cat] = (acc[cat] || 0) + parseFloat(g.amount_net)
    return acc
  }, {})

  return (
    <main className="min-h-screen bg-gray-950 p-4 md:p-8">
      <div className="max-w-2xl mx-auto flex flex-col gap-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">📊 Gastos Operativos</h1>
            <p className="text-gray-500 text-sm mt-1">Gastos de {locationCode}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="bg-orange-500 text-white text-sm font-bold px-3 py-1 rounded-lg">
              {locationCode}
            </span>
            <Link
              href="/gastos/nuevo"
              className="bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
            >
              + Nuevo
            </Link>
          </div>
        </div>

        {/* Selector de mes */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => navegarMes(-1)}
            className="text-gray-400 hover:text-white w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-800 transition"
          >
            ←
          </button>
          <span className="text-white font-semibold text-lg min-w-[140px] text-center">
            {MESES[mes - 1]} {anio}
          </span>
          <button
            onClick={() => navegarMes(1)}
            className="text-gray-400 hover:text-white w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-800 transition"
          >
            →
          </button>
        </div>

        {/* Resumen del mes */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
            <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Total neto del mes</p>
            <p className="text-3xl font-bold text-white">
              ${totalMes.toLocaleString('es-CL', { maximumFractionDigits: 0 })}
            </p>
            <p className="text-gray-600 text-xs mt-1">{gastos.length} registro{gastos.length !== 1 ? 's' : ''}</p>
          </div>

          {/* Breakdown por categoría */}
          <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
            <p className="text-gray-400 text-xs uppercase tracking-wide mb-2">Por categoría</p>
            {Object.keys(porCategoria).length === 0 ? (
              <p className="text-gray-600 text-sm">Sin datos</p>
            ) : (
              <div className="flex flex-col gap-1">
                {Object.entries(porCategoria)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 4)
                  .map(([cat, total]) => (
                    <div key={cat} className="flex justify-between items-center">
                      <span className="text-gray-400 text-xs truncate">{cat}</span>
                      <span className="text-gray-300 text-xs font-medium ml-2">
                        ${total.toLocaleString('es-CL', { maximumFractionDigits: 0 })}
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>

        {/* Filtro categoría */}
        <select
          value={categoriaFiltro}
          onChange={(e) => setCategoriaFiltro(e.target.value)}
          className="bg-gray-900 border border-gray-800 rounded-xl p-2.5 text-gray-300 text-sm"
        >
          <option value="">Todas las categorías</option>
          {categorias.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        {/* Lista de gastos */}
        {loading || locationLoading ? (
          <p className="text-gray-500">Cargando...</p>
        ) : !locationId ? (
          <div className="bg-yellow-950 border border-yellow-800 rounded-2xl p-4 text-center">
            <p className="text-yellow-400 font-semibold">⚠️ Selecciona un local específico</p>
            <p className="text-yellow-600 text-sm mt-1">Los gastos se registran por local. Elige SF o LA en el menú de arriba.</p>
          </div>
        ) : gastos.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-600">No hay gastos registrados para este período.</p>
            <Link href="/gastos/nuevo" className="text-orange-400 text-sm mt-2 inline-block hover:underline">
              Registrar el primero →
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {gastos.map(g => (
              <div key={g.id} className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-white font-medium text-sm">
                        {g.expense_categories?.name || 'Sin categoría'}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        g.document_type === 'factura'
                          ? 'bg-blue-900/50 text-blue-400'
                          : g.document_type === 'boleta'
                          ? 'bg-gray-800 text-gray-400'
                          : 'bg-gray-800 text-gray-500'
                      }`}>
                        {g.document_type || 'sin doc'}
                      </span>
                    </div>
                    {g.supplier && (
                      <p className="text-gray-500 text-xs mt-0.5">{g.supplier}</p>
                    )}
                    {g.description && (
                      <p className="text-gray-600 text-xs mt-0.5 truncate">{g.description}</p>
                    )}
                  </div>
                  <div className="text-right ml-3 shrink-0">
                    <p className="text-white font-bold">
                      ${parseFloat(g.amount_net).toLocaleString('es-CL', { maximumFractionDigits: 0 })}
                    </p>
                    <p className="text-gray-600 text-xs">
                      {new Date(g.expense_date + 'T12:00:00').toLocaleDateString('es-CL', {
                        day: 'numeric', month: 'short'
                      })}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    </main>
  )
}
