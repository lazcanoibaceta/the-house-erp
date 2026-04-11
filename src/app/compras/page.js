'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
const supabase = createClient()

export default function Compras() {
  const [suppliers, setSuppliers] = useState([])
  const [insumos, setInsumos] = useState([])
  const [supplierId, setSupplierId] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [items, setItems] = useState([{ insumo_id: '', quantity: '', unit_price: '' }])
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    async function fetchData() {
      const { data: s } = await supabase.from('suppliers').select('*').order('name')
      const { data: i } = await supabase.from('insumos').select('*').order('name')
      setSuppliers(s || [])
      setInsumos(i || [])
    }
    fetchData()
  }, [])

  function addItem() {
    setItems([...items, { insumo_id: '', quantity: '', unit_price: '' }])
  }

  function removeItem(index) {
    setItems(items.filter((_, i) => i !== index))
  }

  function updateItem(index, field, value) {
    const updated = [...items]
    updated[index][field] = value
    setItems(updated)
  }

  function getTotal() {
    return items.reduce((sum, item) => {
      return sum + (parseFloat(item.quantity) || 0) * (parseFloat(item.unit_price) || 0)
    }, 0)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)

    const total = getTotal()

    // 1. Crear la compra
    const { data: purchase, error: purchaseError } = await supabase
      .from('purchases')
      .insert({ supplier_id: supplierId, date, total })
      .select()
      .single()

    if (purchaseError) {
      console.error(purchaseError)
      setLoading(false)
      return
    }

    // 2. Insertar items y actualizar stock + costo promedio
    for (const item of items) {
      if (!item.insumo_id || !item.quantity || !item.unit_price) continue

      const qty = parseFloat(item.quantity)
      const price = parseFloat(item.unit_price)

      // Insertar item de compra
      await supabase.from('purchase_items').insert({
        purchase_id: purchase.id,
        insumo_id: item.insumo_id,
        quantity: qty,
        unit_price: price,
      })

      // Obtener stock y costo actual del insumo
      const { data: insumo } = await supabase
        .from('insumos')
        .select('stock, avg_cost')
        .eq('id', item.insumo_id)
        .single()

      const currentStock = parseFloat(insumo.stock) || 0
      const currentCost = parseFloat(insumo.avg_cost) || 0

      // Calcular nuevo costo promedio ponderado
      const newStock = currentStock + qty
      const newAvgCost = ((currentStock * currentCost) + (qty * price)) / newStock

      // Actualizar insumo
      await supabase
        .from('insumos')
        .update({ stock: newStock, avg_cost: newAvgCost })
        .eq('id', item.insumo_id)

      // Registrar movimiento
      await supabase.from('stock_movements').insert({
        insumo_id: item.insumo_id,
        type: 'entrada',
        quantity: qty,
        reason: `Compra a proveedor`,
      })
    }

    setSuccess(true)
    setItems([{ insumo_id: '', quantity: '', unit_price: '' }])
    setSupplierId('')
    setLoading(false)
    setTimeout(() => setSuccess(false), 3000)
  }

  return (
    <main className="min-h-screen bg-gray-100 p-6">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">🛒 Registrar Compra</h1>

      {success && (
        <div className="bg-green-100 text-green-700 rounded-xl p-3 mb-4 font-semibold">
          ✅ Compra registrada correctamente
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">

        {/* Proveedor y fecha */}
        <div className="bg-white rounded-2xl p-4 shadow flex flex-col gap-3">
          <select
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            required
            className="border rounded-lg p-2 text-gray-700"
          >
            <option value="">Seleccionar proveedor...</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>

          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            className="border rounded-lg p-2 text-gray-700"
          />
        </div>

        {/* Items */}
        <div className="bg-white rounded-2xl p-4 shadow flex flex-col gap-3">
          <h2 className="font-semibold text-gray-700">Productos comprados</h2>

          {items.map((item, index) => (
            <div key={index} className="flex flex-col gap-2 border-b pb-3">
              <select
                value={item.insumo_id}
                onChange={(e) => updateItem(index, 'insumo_id', e.target.value)}
                required
                className="border rounded-lg p-2 text-gray-700"
              >
                <option value="">Seleccionar insumo...</option>
                {insumos.map((i) => (
                  <option key={i.id} value={i.id}>{i.name}</option>
                ))}
              </select>

              <div className="flex gap-2">
                <input
                  type="number"
                  placeholder="Cantidad"
                  value={item.quantity}
                  onChange={(e) => updateItem(index, 'quantity', e.target.value)}
                  required
                  className="border rounded-lg p-2 text-gray-700 w-1/2"
                />
                <input
                  type="number"
                  placeholder="Precio unitario"
                  value={item.unit_price}
                  onChange={(e) => updateItem(index, 'unit_price', e.target.value)}
                  required
                  className="border rounded-lg p-2 text-gray-700 w-1/2"
                />
              </div>

              {items.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeItem(index)}
                  className="text-red-400 text-sm text-right"
                >
                  Eliminar
                </button>
              )}
            </div>
          ))}

          <button
            type="button"
            onClick={addItem}
            className="text-gray-500 text-sm border border-dashed border-gray-300 rounded-lg p-2 hover:bg-gray-50"
          >
            + Agregar producto
          </button>
        </div>

        {/* Total */}
        <div className="bg-white rounded-2xl p-4 shadow flex justify-between items-center">
          <span className="font-semibold text-gray-700">Total factura</span>
          <span className="text-xl font-bold text-gray-800">
            ${getTotal().toLocaleString('es-CL')}
          </span>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="bg-gray-800 text-white rounded-xl p-3 font-semibold hover:bg-gray-700 transition"
        >
          {loading ? 'Guardando...' : 'Registrar compra'}
        </button>
      </form>
    </main>
  )
}