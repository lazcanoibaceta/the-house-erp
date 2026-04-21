'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useLocation } from '@/hooks/useLocation'

const supabase = createClient()

export default function Costeo() {
  const { locationCode, locationId, loading: locationLoading } = useLocation()
  const [productos, setProductos] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!locationId) return
    fetchCosteo()
  }, [locationId])

  async function fetchCosteo() {
    setLoading(true)

    const { data: products } = await supabase
      .from('products')
      .select('*')
      .order('name')

    const { data: recipes } = await supabase
      .from('recipes')
      .select('product_id, quantity, insumo_id')

    const insumoIds = [...new Set(recipes.map(r => r.insumo_id))]
    const costosPorInsumo = {}

    // Paso 1: costo de insumos base desde compras
    for (const insumoId of insumoIds) {
      const { data: ultimas } = await supabase
        .from('purchase_items')
        .select('unit_price, quantity, purchases!inner(location_id)')
        .eq('insumo_id', insumoId)
        .eq('purchases.location_id', locationId)
        .order('created_at', { ascending: false })
        .limit(5)

      if (ultimas && ultimas.length > 0) {
        const totalQty = ultimas.reduce((sum, i) => sum + parseFloat(i.quantity), 0)
        const totalCosto = ultimas.reduce((sum, i) => sum + parseFloat(i.quantity) * parseFloat(i.unit_price), 0)
        costosPorInsumo[insumoId] = totalQty > 0 ? totalCosto / totalQty : 0
      } else {
        costosPorInsumo[insumoId] = 0
      }
    }

    // Paso 2: costo de insumos preparados (salsas caseras) desde sub-recetas
    const { data: subRecetas } = await supabase
      .from('insumo_recipes')
      .select('insumo_id, ingredient_id, quantity')

    if (subRecetas && subRecetas.length > 0) {
      // Agrupar por insumo preparado
      const subMap = {}
      subRecetas.forEach(sr => {
        if (!subMap[sr.insumo_id]) subMap[sr.insumo_id] = []
        subMap[sr.insumo_id].push(sr)
      })

      // Calcular costo de cada insumo preparado usando los costos base
      for (const [insumoId, ingredientes] of Object.entries(subMap)) {
        const costoCalculado = ingredientes.reduce((sum, sr) => {
          return sum + (parseFloat(sr.quantity) * (costosPorInsumo[sr.ingredient_id] || 0))
        }, 0)
        // Solo sobreescribir si el cálculo da algo (para no tapar compras reales)
        if (costoCalculado > 0 || costosPorInsumo[insumoId] === 0) {
          costosPorInsumo[insumoId] = costoCalculado
        }
      }
    }

    const resultado = products.map(product => {
      const ingredientes = recipes.filter(r => r.product_id === product.id)
      const sinReceta = ingredientes.length === 0

      const costo = ingredientes.reduce((sum, r) => {
        const avgCost = costosPorInsumo[r.insumo_id] || 0
        return sum + (r.quantity * avgCost)
      }, 0)

      // Detectar si tiene receta pero todos los insumos dan $0 (sin compras cargadas)
      const sinCompras = !sinReceta && costo === 0

      // Fix IVA: el precio de venta está con IVA (19%), hay que normalizarlo a neto
      const precioConIva = parseFloat(product.sale_price) || 0
      const precioNeto = precioConIva / 1.19

      const margen = precioNeto > 0 ? ((precioNeto - costo) / precioNeto) * 100 : 0
      const foodCost = precioNeto > 0 ? (costo / precioNeto) * 100 : 0

      return { ...product, precioNeto, costo_calculado: costo, margen, foodCost, sinReceta, sinCompras }
    })

    setProductos(resultado)
    setLoading(false)
  }

  function colorMargen(margen) {
    if (margen >= 70) return 'text-green-400'
    if (margen >= 60) return 'text-yellow-400'
    return 'text-red-400'
  }

  function colorFoodCost(fc) {
    if (fc <= 32) return 'text-green-400'
    if (fc <= 40) return 'text-yellow-400'
    return 'text-red-400'
  }

  // Solo promediar productos con datos completos (con receta y con compras cargadas)
  const productosConDatos = productos.filter(p => !p.sinReceta && !p.sinCompras)
  const promedioFoodCost = productosConDatos.length > 0
    ? productosConDatos.reduce((sum, p) => sum + p.foodCost, 0) / productosConDatos.length
    : 0

  return (
    <main className="min-h-screen bg-gray-950 p-4 md:p-8">
      <div className="max-w-4xl mx-auto">

        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">💰 Costeo y Margen</h1>
            <p className="text-gray-500 text-sm mt-1">
              Basado en últimas 5 compras de {locationCode}
            </p>
          </div>
          <span className="bg-orange-500 text-white text-sm font-bold px-3 py-1 rounded-lg">
            {locationCode}
          </span>
        </div>

        {/* Resumen */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
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
        {loading || locationLoading ? (
          <p className="text-gray-500">Cargando...</p>
        ) : (
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
                    <th className="text-right text-gray-400 font-medium p-4">Margen</th>
                  </tr>
                </thead>
                <tbody>
                  {productos.map((p, i) => (
                    <tr
                      key={p.id}
                      className={`border-b border-gray-800 last:border-0 ${i % 2 === 0 ? '' : 'bg-gray-900/50'}`}
                    >
                      <td className="p-4 text-white">
                        {p.name}
                        {p.sinReceta && (
                          <span className="ml-2 text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">sin receta</span>
                        )}
                        {p.sinCompras && (
                          <span className="ml-2 text-xs bg-yellow-900/50 text-yellow-400 px-2 py-0.5 rounded-full">sin compras</span>
                        )}
                      </td>
                      <td className="p-4 text-right text-gray-500">
                        ${parseFloat(p.sale_price).toLocaleString('es-CL')}
                      </td>
                      <td className="p-4 text-right text-gray-300">
                        ${Math.round(p.precioNeto).toLocaleString('es-CL')}
                      </td>
                      <td className="p-4 text-right text-gray-300">
                        {p.sinReceta || p.sinCompras
                          ? <span className="text-gray-600">—</span>
                          : `$${p.costo_calculado.toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
                        }
                      </td>
                      <td className={`p-4 text-right font-semibold ${p.sinReceta || p.sinCompras ? 'text-gray-600' : colorFoodCost(p.foodCost)}`}>
                        {p.sinReceta || p.sinCompras ? '—' : `${p.foodCost.toFixed(1)}%`}
                      </td>
                      <td className={`p-4 text-right font-semibold ${p.sinReceta || p.sinCompras ? 'text-gray-600' : colorMargen(p.margen)}`}>
                        {p.sinReceta || p.sinCompras ? '—' : `${p.margen.toFixed(1)}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>
    </main>
  )
}