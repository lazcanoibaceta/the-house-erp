'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useLocation } from '@/hooks/useLocation'
import RoleGuard from '@/components/RoleGuard'

const supabase = createClient()

export default function Costeo() {
  const { locationCode, locationId, loading: locationLoading } = useLocation()
  const [productos, setProductos] = useState([])
  const [loading, setLoading] = useState(true)
  const [updatedAt, setUpdatedAt] = useState(null)
  const [recalculando, setRecalculando] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editingPrice, setEditingPrice] = useState('')
  const [savingId, setSavingId] = useState(null)
  const [precioEditado, setPrecioEditado] = useState(false)

  useEffect(() => {
    if (!locationId) return
    loadCache()
  }, [locationId])

  // ── Cargar desde caché ────────────────────────────────────────────────────
  async function loadCache() {
    setLoading(true)
    const { data } = await supabase
      .from('costeo_cache')
      .select('productos, updated_at')
      .eq('location_id', locationId)
      .single()

    if (data) {
      setProductos(data.productos)
      setUpdatedAt(new Date(data.updated_at))
    } else {
      setProductos([])
      setUpdatedAt(null)
    }
    setLoading(false)
  }

  // ── Cálculo completo (puede tardar) ───────────────────────────────────────
  async function calcularCosteo() {
    const { data: products } = await supabase
      .from('products')
      .select('*')
      .eq('active', true)
      .order('name')

    const { data: recipes } = await supabase
      .from('recipes')
      .select('product_id, quantity, insumo_id')

    const insumoIds = [...new Set((recipes || []).map(r => r.insumo_id))]
    const costosPorInsumo = {}

    for (const insumoId of insumoIds) {
      const { data: ultimas } = await supabase
        .from('purchase_items')
        .select('unit_price, quantity, purchases!inner(location_id)')
        .eq('insumo_id', insumoId)
        .eq('purchases.location_id', locationId)
        .order('created_at', { ascending: false })
        .limit(5)

      if (ultimas && ultimas.length > 0) {
        const totalQty   = ultimas.reduce((s, i) => s + parseFloat(i.quantity), 0)
        const totalCosto = ultimas.reduce((s, i) => s + parseFloat(i.quantity) * parseFloat(i.unit_price), 0)
        costosPorInsumo[insumoId] = totalQty > 0 ? totalCosto / totalQty : 0
      } else {
        costosPorInsumo[insumoId] = 0
      }
    }

    // Sub-recetas (salsas caseras)
    const { data: subRecetas } = await supabase
      .from('insumo_recipes')
      .select('insumo_id, ingredient_id, quantity')

    if (subRecetas && subRecetas.length > 0) {
      const subMap = {}
      subRecetas.forEach(sr => {
        if (!subMap[sr.insumo_id]) subMap[sr.insumo_id] = []
        subMap[sr.insumo_id].push(sr)
      })
      for (const [insumoId, ingredientes] of Object.entries(subMap)) {
        const costoCalculado = ingredientes.reduce((s, sr) =>
          s + parseFloat(sr.quantity) * (costosPorInsumo[sr.ingredient_id] || 0), 0)
        if (costoCalculado > 0 || costosPorInsumo[insumoId] === 0)
          costosPorInsumo[insumoId] = costoCalculado
      }
    }

    return (products || []).map(product => {
      const ingredientes = (recipes || []).filter(r => r.product_id === product.id)
      const sinReceta    = ingredientes.length === 0
      const costo        = ingredientes.reduce((s, r) => s + r.quantity * (costosPorInsumo[r.insumo_id] || 0), 0)
      const sinCompras   = !sinReceta && costo === 0
      const precioConIva = parseFloat(product.sale_price) || 0
      const precioNeto   = precioConIva / 1.19
      const margen       = precioNeto > 0 ? ((precioNeto - costo) / precioNeto) * 100 : 0
      const foodCost     = precioNeto > 0 ? (costo / precioNeto) * 100 : 0
      return { ...product, precioNeto, costo_calculado: costo, margen, foodCost, sinReceta, sinCompras }
    })
  }

  async function recalcularYGuardar() {
    setRecalculando(true)
    const resultado = await calcularCosteo()
    const ahora = new Date().toISOString()
    await supabase.from('costeo_cache').upsert(
      { location_id: locationId, productos: resultado, updated_at: ahora },
      { onConflict: 'location_id' }
    )
    setProductos(resultado)
    setUpdatedAt(new Date(ahora))
    setPrecioEditado(false)
    setRecalculando(false)
  }

  // ── Edición de precio ─────────────────────────────────────────────────────
  async function guardarPrecio(productId) {
    const nuevo = parseFloat(editingPrice)
    if (!nuevo || nuevo <= 0) return
    setSavingId(productId)
    await supabase.from('products').update({ sale_price: nuevo }).eq('id', productId)
    setEditingId(null)
    setEditingPrice('')
    setSavingId(null)
    setPrecioEditado(true)
    // Actualizar estado local optimistamente
    setProductos(prev => prev.map(p => {
      if (p.id !== productId) return p
      const precioNeto = nuevo / 1.19
      return {
        ...p,
        sale_price:      nuevo,
        precioNeto,
        margen:   precioNeto > 0 ? ((precioNeto - p.costo_calculado) / precioNeto) * 100 : 0,
        foodCost: precioNeto > 0 ? (p.costo_calculado / precioNeto) * 100 : 0,
      }
    }))
  }

  // ── Helpers de color ──────────────────────────────────────────────────────
  function colorMargen(m)    { return m >= 70 ? 'text-green-400' : m >= 60 ? 'text-yellow-400' : 'text-red-400' }
  function colorFoodCost(fc) { return fc <= 32 ? 'text-green-400' : fc <= 40 ? 'text-yellow-400' : 'text-red-400' }

  // Comisión PedidosYa aprox: puntos % a restar al margen food para estimar el margen en delivery
  const PEYA_COMISION = 25

  // ── Estado del caché ──────────────────────────────────────────────────────
  const diasDesdeUpdate = updatedAt
    ? Math.floor((new Date() - updatedAt) / (1000 * 60 * 60 * 24))
    : null
  const caducado = diasDesdeUpdate === null || diasDesdeUpdate > 7

  function labelFecha() {
    if (!updatedAt) return null
    if (diasDesdeUpdate === 0) return 'Actualizado hoy'
    if (diasDesdeUpdate === 1) return 'Actualizado ayer'
    return `Actualizado hace ${diasDesdeUpdate} días`
  }

  const productosConDatos = productos.filter(p => !p.sinReceta && !p.sinCompras)
  const promedioFoodCost  = productosConDatos.length > 0
    ? productosConDatos.reduce((s, p) => s + p.foodCost, 0) / productosConDatos.length
    : 0

  return (
    <RoleGuard allowedRoles={['admin_supremo', 'admin']}>
    <main className="min-h-screen bg-gray-950 p-4 md:p-8">
      <div className="max-w-4xl mx-auto">

        {/* Header */}
        <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white">💰 Costeo y Margen</h1>
            <p className="text-gray-500 text-sm mt-1">Basado en últimas 5 compras de {locationCode}</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {/* Badge fecha */}
            {labelFecha() && (
              <span className={`text-xs px-2 py-1 rounded-lg ${caducado ? 'bg-orange-900/40 text-orange-400' : 'bg-gray-800 text-gray-500'}`}>
                {caducado ? '⚠️ ' : ''}{labelFecha()}
              </span>
            )}

            {/* Botón recalcular */}
            <button
              onClick={recalcularYGuardar}
              disabled={recalculando || locationLoading}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition disabled:opacity-50 ${
                caducado || precioEditado
                  ? 'bg-orange-500 hover:bg-orange-600 text-white'
                  : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
              }`}
            >
              {recalculando ? '⏳ Calculando...' : '🔄 Recalcular'}
            </button>

            <span className="bg-orange-500 text-white text-sm font-bold px-3 py-1 rounded-lg">
              {locationCode}
            </span>
          </div>
        </div>

        {/* Aviso si caducado o precio editado */}
        {(caducado || precioEditado) && !recalculando && (
          <div className="bg-orange-950/40 border border-orange-800/50 rounded-xl px-4 py-3 mb-5 text-sm text-orange-300 flex items-center gap-2">
            <span>⚠️</span>
            <span>
              {precioEditado
                ? 'Editaste un precio — recalcula para ver los nuevos márgenes.'
                : `Los datos tienen ${diasDesdeUpdate === null ? 'que calcularse por primera vez' : `${diasDesdeUpdate} días`}. Recalcula para tener costos más precisos.`
              }
            </span>
          </div>
        )}

        {/* Sin caché todavía */}
        {!loading && !locationLoading && productos.length === 0 && !recalculando && (
          <div className="bg-gray-900 rounded-2xl border border-gray-800 p-10 text-center">
            <p className="text-4xl mb-3">📊</p>
            <p className="text-white font-semibold mb-1">Sin datos calculados aún</p>
            <p className="text-gray-500 text-sm mb-5">Presiona "Recalcular" para generar el costeo por primera vez</p>
            <button
              onClick={recalcularYGuardar}
              className="bg-orange-500 hover:bg-orange-600 text-white px-6 py-2.5 rounded-xl font-semibold transition"
            >
              Calcular ahora →
            </button>
          </div>
        )}

        {/* Loading */}
        {(loading || locationLoading || recalculando) && (
          <div className="bg-gray-900 rounded-2xl border border-gray-800 p-8 text-center">
            <p className="text-gray-500 text-sm animate-pulse">
              {recalculando ? 'Calculando costos... esto puede tomar unos segundos ⏳' : 'Cargando...'}
            </p>
          </div>
        )}

        {/* Contenido */}
        {!loading && !locationLoading && !recalculando && productos.length > 0 && (
          <>
            {/* Resumen */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
                <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Productos</p>
                <p className="text-3xl font-bold text-white">{productos.length}</p>
                <p className="text-gray-600 text-xs mt-1">{productosConDatos.length} con datos completos</p>
              </div>
              <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
                <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Food Cost Promedio</p>
                <p className={`text-3xl font-bold ${colorFoodCost(promedioFoodCost)}`}>
                  {promedioFoodCost.toFixed(1)}<span className="text-lg ml-1">%</span>
                </p>
                <p className="text-gray-600 text-xs mt-1">Meta 28–32% · precio neto</p>
              </div>
              <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
                <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Sobre meta (&gt;32%)</p>
                <p className="text-3xl font-bold text-red-400">
                  {productosConDatos.filter(p => p.foodCost > 32).length}
                </p>
                <p className="text-gray-600 text-xs mt-1">Productos sobre meta</p>
              </div>
              <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
                <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Sin datos</p>
                <p className="text-3xl font-bold text-gray-500">
                  {productos.filter(p => p.sinReceta || p.sinCompras).length}
                </p>
                <p className="text-gray-600 text-xs mt-1">Sin receta o sin compras</p>
              </div>
            </div>

            {/* Tabla */}
            <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="text-left text-gray-400 font-medium p-4">Producto</th>
                      <th className="text-right text-gray-400 font-medium p-4">Precio c/IVA</th>
                      <th className="text-right text-gray-400 font-medium p-4">Precio neto</th>
                      <th className="text-right text-gray-400 font-medium p-4">Costo</th>
                      <th className="text-right text-gray-400 font-medium p-4">Food Cost</th>
                      <th className="text-right text-gray-400 font-medium p-4">Margen food</th>
                      <th className="text-right text-gray-400 font-medium p-4" title="Margen food menos 25% de comisión PedidosYa">Margen delivery</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productos.map((p, i) => (
                      <tr key={p.id} className={`border-b border-gray-800 last:border-0 ${i % 2 === 0 ? '' : 'bg-gray-900/50'}`}>
                        <td className="p-4 text-white">
                          {p.name}
                          {p.sinReceta  && <span className="ml-2 text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">sin receta</span>}
                          {p.sinCompras && <span className="ml-2 text-xs bg-yellow-900/50 text-yellow-400 px-2 py-0.5 rounded-full">sin compras</span>}
                        </td>

                        {/* Precio c/IVA — editable */}
                        <td className="p-4 text-right">
                          {editingId === p.id ? (
                            <div className="flex items-center justify-end gap-1">
                              <input
                                type="number"
                                value={editingPrice}
                                onChange={e => setEditingPrice(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter')  guardarPrecio(p.id)
                                  if (e.key === 'Escape') { setEditingId(null); setEditingPrice('') }
                                }}
                                autoFocus
                                className="w-24 bg-gray-800 border border-orange-500 rounded-lg px-2 py-1 text-white text-sm text-right"
                              />
                              <button onClick={() => guardarPrecio(p.id)} disabled={savingId === p.id}
                                className="text-green-400 hover:text-green-300 text-xs px-1">✓</button>
                              <button onClick={() => { setEditingId(null); setEditingPrice('') }}
                                className="text-gray-500 hover:text-gray-300 text-xs px-1">✕</button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-end gap-2 group">
                              <span className="text-gray-500">${parseFloat(p.sale_price).toLocaleString('es-CL')}</span>
                              <button
                                onClick={() => { setEditingId(p.id); setEditingPrice(p.sale_price) }}
                                className="text-gray-700 hover:text-orange-400 opacity-0 group-hover:opacity-100 transition text-xs"
                                title="Editar precio"
                              >✏️</button>
                            </div>
                          )}
                        </td>

                        <td className="p-4 text-right text-gray-300">
                          ${Math.round(p.precioNeto).toLocaleString('es-CL')}
                        </td>
                        <td className="p-4 text-right text-gray-300">
                          {p.sinReceta || p.sinCompras
                            ? <span className="text-gray-600">—</span>
                            : `$${p.costo_calculado.toLocaleString('es-CL', { maximumFractionDigits: 0 })}`
                          }
                        </td>
                        <td className={`p-4 text-right font-semibold ${p.sinReceta || p.sinCompras ? 'text-gray-600' : colorFoodCost(p.foodCost)}`}>
                          {p.sinReceta || p.sinCompras ? '—' : `${p.foodCost.toFixed(1)}%`}
                        </td>
                        <td className={`p-4 text-right font-semibold ${p.sinReceta || p.sinCompras ? 'text-gray-600' : colorMargen(p.margen)}`}>
                          {p.sinReceta || p.sinCompras ? '—' : `${p.margen.toFixed(1)}%`}
                        </td>
                        <td className="p-4 text-right text-gray-400">
                          {p.sinReceta || p.sinCompras ? '—' : `${(p.margen - PEYA_COMISION).toFixed(1)}%`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <p className="text-gray-600 text-xs mt-3">
              <span className="text-gray-400">Margen food</span> = margen bruto sobre venta neta, solo costo de insumos (antes de packaging y comisiones).{' '}
              <span className="text-gray-400">Margen delivery</span> = margen food − 25% (comisión aprox. PedidosYa), para dimensionar cuánto deja cada producto vendido por la app.
            </p>
          </>
        )}

      </div>
    </main>
    </RoleGuard>
  )
}
