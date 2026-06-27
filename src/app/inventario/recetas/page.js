'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useLocation } from '@/hooks/useLocation'
import { getCostosPorInsumo } from '@/lib/costeo'
import Link from 'next/link'
import RoleGuard from '@/components/RoleGuard'

const supabase = createClient()

export default function Recetas() {
  const { locationCode, locationId } = useLocation()
  const [products, setProducts]     = useState([])
  const [insumos, setInsumos]       = useState([])
  const [recetasMap, setRecetasMap] = useState({}) // product_id → [{insumo_id, quantity, nombre, unit}]
  const [costos, setCostos]         = useState({}) // insumo_id → costo (últimas 5 compras + sub-recetas)

  const [productId, setProductId]   = useState('')
  const [lineas, setLineas]         = useState([{ insumo_id: '', quantity: '' }])
  const [saving, setSaving]         = useState(false)
  const [success, setSuccess]       = useState(false)

  useEffect(() => {
    fetchData()
  }, [])

  // Costos por local (mismo cálculo que la pestaña de Costeo)
  useEffect(() => {
    if (!locationId) return
    getCostosPorInsumo(locationId, supabase).then(({ costos }) => setCostos(costos))
  }, [locationId])

  async function fetchData() {
    const [{ data: prods }, { data: ins }, { data: recs }] = await Promise.all([
      supabase.from('products').select('id, name, category, sale_price, active').order('name'),
      supabase.from('insumos').select('id, name, unit').order('name'),
      supabase.from('recipes').select('id, product_id, insumo_id, quantity, insumos(name, unit, avg_cost)'),
    ])

    setProducts(prods || [])
    setInsumos(ins || [])

    const map = {}
    ;(recs || []).forEach(r => {
      if (!map[r.product_id]) map[r.product_id] = []
      map[r.product_id].push({
        insumo_id: r.insumo_id,
        quantity:  r.quantity,
        nombre:    r.insumos?.name,
        unit:      r.insumos?.unit,
        avg_cost:  r.insumos?.avg_cost ?? 0,
      })
    })
    setRecetasMap(map)
  }

  function cargarEdicion(pid) {
    setProductId(pid)
    const existentes = recetasMap[pid] || []
    setLineas(
      existentes.length > 0
        ? existentes.map(r => ({ insumo_id: r.insumo_id, quantity: String(r.quantity) }))
        : [{ insumo_id: '', quantity: '' }]
    )
    window.scrollTo(0, 0)
  }

  function addLinea() {
    setLineas([...lineas, { insumo_id: '', quantity: '' }])
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
    if (!productId) return
    setSaving(true)

    const validas = lineas.filter(l => l.insumo_id && l.quantity)

    // Borrar receta anterior y reinsertar
    await supabase.from('recipes').delete().eq('product_id', productId)

    if (validas.length > 0) {
      await supabase.from('recipes').insert(
        validas.map(l => ({
          product_id: productId,
          insumo_id:  l.insumo_id,
          quantity:   parseFloat(l.quantity),
        }))
      )
    }

    await fetchData()
    setSuccess(true)
    setSaving(false)
    setTimeout(() => setSuccess(false), 2500)
  }

  async function toggleActivo(productId, activo) {
    await supabase.from('products').update({ active: activo }).eq('id', productId)
    await fetchData()
  }

  const productoSeleccionado = products.find(p => p.id === productId)
  const activos              = products.filter(p => p.active)
  const archivados           = products.filter(p => !p.active)
  const productsConReceta    = Object.keys(recetasMap).filter(pid => activos.find(p => p.id === pid))
  const productsSinReceta    = activos.filter(p => !productsConReceta.includes(p.id))

  return (
    <RoleGuard allowedRoles={['admin_supremo']}>
    <main className="min-h-screen bg-gray-950 p-4 md:p-8">
      <div className="max-w-2xl mx-auto flex flex-col gap-8">

        {/* Header */}
        <div>
          <Link href="/inventario" className="text-gray-500 text-sm hover:text-gray-300 mb-1 inline-block">
            ← Inventario
          </Link>
          <h1 className="text-2xl font-bold text-white">🍔 Recetas de Productos</h1>
          <p className="text-gray-500 text-sm mt-1">
            Edita los insumos y gramajes de cada producto
            {locationCode && <> · costos según últimas 5 compras de <span className="text-gray-400 font-medium">{locationCode}</span></>}
          </p>
        </div>

        {/* Formulario editor */}
        <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
          <div className="p-4 border-b border-gray-800">
            <h2 className="text-white font-semibold">
              {productId ? `Editando: ${productoSeleccionado?.name}` : 'Seleccionar producto'}
            </h2>
          </div>

          <form onSubmit={handleSave} className="p-4 flex flex-col gap-4">

            {success && (
              <div className="bg-green-900 text-green-300 rounded-xl p-3 text-sm font-semibold">
                ✅ Receta guardada
              </div>
            )}

            {/* Selector de producto */}
            <div>
              <label className="text-gray-400 text-xs mb-1 block">Producto</label>
              <select
                value={productId}
                onChange={e => {
                  const pid = e.target.value
                  setProductId(pid)
                  const existentes = recetasMap[pid] || []
                  setLineas(
                    existentes.length > 0
                      ? existentes.map(r => ({ insumo_id: r.insumo_id, quantity: String(r.quantity) }))
                      : [{ insumo_id: '', quantity: '' }]
                  )
                }}
                required
                className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-white text-sm"
              >
                <option value="">Seleccionar producto...</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name}{productsConReceta.includes(p.id) ? ' ✓' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Líneas de insumos */}
            <div className="flex flex-col gap-2">
              <label className="text-gray-400 text-xs">Ingredientes</label>

              {lineas.map((linea, i) => {
                const insumoSel = insumos.find(ins => ins.id === linea.insumo_id)
                return (
                  <div key={i} className="flex gap-2 items-center">
                    <select
                      value={linea.insumo_id}
                      onChange={e => updateLinea(i, 'insumo_id', e.target.value)}
                      className="flex-1 bg-gray-800 border border-gray-700 rounded-lg p-2 text-white text-sm"
                    >
                      <option value="">Seleccionar insumo...</option>
                      {insumos.map(ins => (
                        <option key={ins.id} value={ins.id}>{ins.name} ({ins.unit})</option>
                      ))}
                    </select>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        placeholder="Cant."
                        value={linea.quantity}
                        onChange={e => updateLinea(i, 'quantity', e.target.value)}
                        step="0.001"
                        min="0"
                        className="w-24 bg-gray-800 border border-gray-700 rounded-lg p-2 text-white text-sm"
                      />
                      {insumoSel && (
                        <span className="text-gray-500 text-xs w-8 shrink-0">{insumoSel.unit}</span>
                      )}
                    </div>
                    {lineas.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeLinea(i)}
                        className="text-red-400 hover:text-red-300 text-xl leading-none px-1"
                      >
                        ×
                      </button>
                    )}
                  </div>
                )
              })}

              <button
                type="button"
                onClick={addLinea}
                className="text-gray-500 text-sm border border-dashed border-gray-700 rounded-lg p-2 hover:bg-gray-800 transition"
              >
                + Agregar insumo
              </button>
            </div>

            <button
              type="submit"
              disabled={saving || !productId}
              className="bg-orange-500 hover:bg-orange-600 text-white rounded-xl p-3 font-semibold text-sm transition disabled:opacity-50"
            >
              {saving ? 'Guardando...' : 'Guardar receta'}
            </button>
          </form>
        </div>

        {/* Productos con receta */}
        {productsConReceta.length > 0 && (
          <div>
            <h2 className="text-lg font-bold text-white mb-3">
              ✅ Con receta ({productsConReceta.length})
            </h2>
            <div className="flex flex-col gap-3">
              {productsConReceta.map(pid => {
                const prod = products.find(p => p.id === pid)
                const recs = recetasMap[pid] || []
                return (
                  <div key={pid} className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
                    <div className="p-4 flex items-center justify-between">
                      <div>
                        <p className="text-white font-medium">{prod?.name}</p>
                        <p className="text-gray-500 text-xs mt-0.5">
                          {recs.length} insumo{recs.length !== 1 ? 's' : ''}
                          {prod?.category ? ` · ${prod.category}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => cargarEdicion(pid)}
                          className="text-orange-400 text-sm hover:text-orange-300"
                        >
                          ✏️ Editar
                        </button>
                        <button
                          onClick={() => toggleActivo(pid, false)}
                          className="text-gray-600 hover:text-red-400 text-xs transition"
                          title="Archivar producto"
                        >
                          Archivar
                        </button>
                      </div>
                    </div>
                    <div className="px-4 pb-4 flex flex-col gap-1">
                      {recs.map((r, i) => {
                        const costoUnit = costos[r.insumo_id] ?? r.avg_cost
                        return (
                          <div key={i} className="flex justify-between text-sm text-gray-400">
                            <span>{r.nombre}</span>
                            <div className="flex items-center gap-3 tabular-nums">
                              <span className="text-gray-500">{r.quantity} {r.unit}</span>
                              <span className="text-gray-400">
                                ${Math.round(r.quantity * costoUnit).toLocaleString('es-CL')}
                              </span>
                            </div>
                          </div>
                        )
                      })}
                      {recs.length > 0 && (
                        <div className="flex justify-between text-sm font-semibold text-white border-t border-gray-800 mt-1 pt-1">
                          <span>Costo total</span>
                          <span className="tabular-nums">
                            ${Math.round(recs.reduce((s, r) => s + r.quantity * (costos[r.insumo_id] ?? r.avg_cost), 0)).toLocaleString('es-CL')}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Productos sin receta */}
        {productsSinReceta.length > 0 && (
          <div>
            <h2 className="text-lg font-bold text-white mb-1">
              ⬜ Sin receta ({productsSinReceta.length})
            </h2>
            <p className="text-gray-600 text-xs mb-3">Haz clic para agregar su receta</p>
            <div className="flex flex-wrap gap-2">
              {productsSinReceta.map(p => (
                <div key={p.id} className="flex items-center gap-1">
                  <button
                    onClick={() => cargarEdicion(p.id)}
                    className="bg-gray-900 border border-gray-800 text-gray-400 text-xs px-3 py-1.5 rounded-lg hover:border-orange-500 hover:text-white transition"
                  >
                    {p.name}
                  </button>
                  <button
                    onClick={() => toggleActivo(p.id, false)}
                    className="text-gray-700 hover:text-red-400 text-xs transition px-1"
                    title="Archivar"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Productos archivados */}
        {archivados.length > 0 && (
          <div>
            <h2 className="text-base font-semibold text-gray-600 mb-2">
              Archivados ({archivados.length})
            </h2>
            <div className="flex flex-wrap gap-2">
              {archivados.map(p => (
                <div key={p.id} className="flex items-center gap-1.5 bg-gray-900/50 border border-gray-800 rounded-lg px-3 py-1.5">
                  <span className="text-gray-600 text-xs">{p.name}</span>
                  <button
                    onClick={() => toggleActivo(p.id, true)}
                    className="text-gray-600 hover:text-green-400 text-xs transition"
                    title="Restaurar"
                  >
                    ↩
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </main>
    </RoleGuard>
  )
}
