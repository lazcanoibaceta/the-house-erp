'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

const supabase = createClient()

export default function SubRecetas() {
  const [insumos, setInsumos] = useState([])
  const [subRecetasMap, setSubRecetasMap] = useState({}) // insumo_id → [{id, ingredient_id, quantity, nombre}]

  // Formulario
  const [insumoId, setInsumoId] = useState('')       // el insumo preparado a editar
  const [lineas, setLineas] = useState([{ ingredient_id: '', quantity: '' }])
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    const [{ data: ins }, { data: subs }] = await Promise.all([
      supabase.from('insumos').select('id, name, unit').order('name'),
      supabase.from('insumo_recipes').select('id, insumo_id, ingredient_id, quantity, insumos!insumo_recipes_ingredient_id_fkey(name, unit)'),
    ])

    setInsumos(ins || [])

    // Agrupar sub-recetas por insumo_id
    const map = {}
    ;(subs || []).forEach(sr => {
      if (!map[sr.insumo_id]) map[sr.insumo_id] = []
      map[sr.insumo_id].push({
        id: sr.id,
        ingredient_id: sr.ingredient_id,
        quantity: sr.quantity,
        nombre: sr.insumos?.name,
        unit: sr.insumos?.unit,
      })
    })
    setSubRecetasMap(map)
  }

  // Cargar sub-receta existente en el formulario
  function cargarEdicion(insumoId) {
    setInsumoId(insumoId)
    const existentes = subRecetasMap[insumoId] || []
    setLineas(
      existentes.length > 0
        ? existentes.map(sr => ({ ingredient_id: sr.ingredient_id, quantity: sr.quantity }))
        : [{ ingredient_id: '', quantity: '' }]
    )
    window.scrollTo(0, 0)
  }

  function addLinea() {
    setLineas([...lineas, { ingredient_id: '', quantity: '' }])
  }

  function removeLinea(i) {
    setLineas(lineas.filter((_, idx) => idx !== i))
  }

  function updateLinea(i, field, value) {
    const updated = [...lineas]
    updated[i][field] = value
    setLineas(updated)
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!insumoId) return
    setSaving(true)

    const validas = lineas.filter(l => l.ingredient_id && l.quantity)

    // 1. Borrar sub-receta anterior de este insumo
    await supabase.from('insumo_recipes').delete().eq('insumo_id', insumoId)

    // 2. Insertar nuevas líneas
    if (validas.length > 0) {
      await supabase.from('insumo_recipes').insert(
        validas.map(l => ({
          insumo_id: insumoId,
          ingredient_id: l.ingredient_id,
          quantity: parseFloat(l.quantity),
        }))
      )
    }

    await fetchData()
    setSuccess(true)
    setSaving(false)
    setTimeout(() => setSuccess(false), 2500)
  }

  const insumoSeleccionado = insumos.find(i => i.id === insumoId)
  const insumosConSubReceta = Object.keys(subRecetasMap)
  const insumosSinSubReceta = insumos.filter(i => !insumosConSubReceta.includes(i.id))

  return (
    <main className="min-h-screen bg-gray-950 p-4 md:p-8">
      <div className="max-w-2xl mx-auto flex flex-col gap-8">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white">🧪 Sub-recetas de Insumos</h1>
          <p className="text-gray-500 text-sm mt-1">
            Define los ingredientes de salsas u otros insumos preparados en el local
          </p>
        </div>

        {/* Formulario */}
        <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
          <div className="p-4 border-b border-gray-800">
            <h2 className="text-white font-semibold">
              {insumoId ? `Editando: ${insumoSeleccionado?.name}` : 'Seleccionar insumo'}
            </h2>
          </div>

          <form onSubmit={handleSave} className="p-4 flex flex-col gap-4">

            {success && (
              <div className="bg-green-900 text-green-300 rounded-xl p-3 text-sm font-semibold">
                ✅ Sub-receta guardada
              </div>
            )}

            {/* Selector de insumo preparado */}
            <div>
              <label className="text-gray-400 text-xs mb-1 block">Insumo preparado</label>
              <select
                value={insumoId}
                onChange={e => {
                  setInsumoId(e.target.value)
                  const existentes = subRecetasMap[e.target.value] || []
                  setLineas(
                    existentes.length > 0
                      ? existentes.map(sr => ({ ingredient_id: sr.ingredient_id, quantity: sr.quantity }))
                      : [{ ingredient_id: '', quantity: '' }]
                  )
                }}
                required
                className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-white text-sm"
              >
                <option value="">Seleccionar insumo...</option>
                {insumos.map(i => (
                  <option key={i.id} value={i.id}>
                    {i.name} ({i.unit}){insumosConSubReceta.includes(i.id) ? ' ✓' : ''}
                  </option>
                ))}
              </select>
              {insumoSeleccionado && (
                <p className="text-gray-600 text-xs mt-1">
                  Las cantidades de ingredientes son por 1 {insumoSeleccionado.unit} de {insumoSeleccionado.name}
                </p>
              )}
            </div>

            {/* Líneas de ingredientes */}
            <div className="flex flex-col gap-2">
              <label className="text-gray-400 text-xs">Ingredientes</label>

              {lineas.map((linea, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <select
                    value={linea.ingredient_id}
                    onChange={e => updateLinea(i, 'ingredient_id', e.target.value)}
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-lg p-2 text-white text-sm"
                  >
                    <option value="">Seleccionar ingrediente...</option>
                    {insumos
                      .filter(ins => ins.id !== insumoId) // no puede ser ingrediente de sí mismo
                      .map(ins => (
                        <option key={ins.id} value={ins.id}>{ins.name} ({ins.unit})</option>
                      ))}
                  </select>
                  <input
                    type="number"
                    placeholder="Cantidad"
                    value={linea.quantity}
                    onChange={e => updateLinea(i, 'quantity', e.target.value)}
                    step="0.001"
                    className="w-28 bg-gray-800 border border-gray-700 rounded-lg p-2 text-white text-sm"
                  />
                  {lineas.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeLinea(i)}
                      className="text-red-400 hover:text-red-300 text-lg leading-none"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}

              <button
                type="button"
                onClick={addLinea}
                className="text-gray-500 text-sm border border-dashed border-gray-700 rounded-lg p-2 hover:bg-gray-800 transition"
              >
                + Agregar ingrediente
              </button>
            </div>

            <button
              type="submit"
              disabled={saving || !insumoId}
              className="bg-orange-500 hover:bg-orange-600 text-white rounded-xl p-3 font-semibold text-sm transition disabled:opacity-50"
            >
              {saving ? 'Guardando...' : 'Guardar sub-receta'}
            </button>
          </form>
        </div>

        {/* Lista de insumos con sub-receta definida */}
        {insumosConSubReceta.length > 0 && (
          <div>
            <h2 className="text-lg font-bold text-white mb-3">✅ Con sub-receta definida</h2>
            <div className="flex flex-col gap-3">
              {insumosConSubReceta.map(id => {
                const ins = insumos.find(i => i.id === id)
                const subs = subRecetasMap[id] || []
                return (
                  <div key={id} className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
                    <div className="p-4 flex items-center justify-between">
                      <div>
                        <p className="text-white font-medium">{ins?.name}</p>
                        <p className="text-gray-500 text-xs mt-0.5">
                          {subs.length} ingrediente{subs.length !== 1 ? 's' : ''} · por 1 {ins?.unit}
                        </p>
                      </div>
                      <button
                        onClick={() => cargarEdicion(id)}
                        className="text-orange-400 text-sm hover:text-orange-300"
                      >
                        ✏️ Editar
                      </button>
                    </div>
                    <div className="px-4 pb-4 flex flex-col gap-1">
                      {subs.map((sr, i) => (
                        <div key={i} className="flex justify-between text-sm text-gray-400">
                          <span>{sr.nombre}</span>
                          <span>{sr.quantity} {sr.unit}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Lista de insumos sin sub-receta (que podrían necesitarla) */}
        {insumosSinSubReceta.length > 0 && (
          <div>
            <h2 className="text-lg font-bold text-white mb-1">⬜ Sin sub-receta</h2>
            <p className="text-gray-600 text-xs mb-3">Solo relevante para insumos que se preparan en el local</p>
            <div className="flex flex-wrap gap-2">
              {insumosSinSubReceta.map(i => (
                <button
                  key={i.id}
                  onClick={() => cargarEdicion(i.id)}
                  className="bg-gray-900 border border-gray-800 text-gray-400 text-xs px-3 py-1.5 rounded-lg hover:border-orange-500 hover:text-white transition"
                >
                  {i.name}
                </button>
              ))}
            </div>
          </div>
        )}

      </div>
    </main>
  )
}
