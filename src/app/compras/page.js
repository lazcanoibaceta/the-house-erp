'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
const supabase = createClient()

export default function Compras() {
  const [suppliers, setSuppliers] = useState([])
  const [insumos, setInsumos] = useState([])
  const [supplierId, setSupplierId] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [items, setItems] = useState([{ insumo_id: '', quantity: '', total_price: '' }])
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
    setItems([...items, { insumo_id: '', quantity: '', total_price: '' }])
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
      return sum + (parseFloat(item.total_price) || 0)
    }, 0)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)

    const total = getTotal()

    console.log('enviando fecha:', date)

    const { data: purchase, error: purchaseError } = await supabase
      .from('purchases')
      .insert({ supplier_id: supplierId, date:date, total:total })
      .select()
      .single()

      console.log('purchase result:', purchase)
      console.log('purchase error:', purchaseError)

    if (purchaseError) {
      console.error(purchaseError)
      setLoading(false)
      return
    }

    for (const item of items) {
      if (!item.insumo_id || !item.quantity || !item.total_price) continue

      const qty = parseFloat(item.quantity)
      const totalPrice = parseFloat(item.total_price)
      const price = totalPrice / qty // precio por unidad calculado

      await supabase.from('purchase_items').insert({
        purchase_id: purchase.id,
        insumo_id: item.insumo_id,
        quantity: qty,
        unit_price: price,
      })

      const { data: insumo } = await supabase
        .from('insumos')
        .select('stock, avg_cost')
        .eq('id', item.insumo_id)
        .single()

      const currentStock = parseFloat(insumo.stock) || 0
      const currentCost = parseFloat(insumo.avg_cost) || 0

      const newStock = currentStock + qty
      const newAvgCost = ((currentStock * currentCost) + (qty * price)) / newStock

      await supabase
        .from('insumos')
        .update({ stock: newStock, avg_cost: newAvgCost })
        .eq('id', item.insumo_id)

      await supabase.from('stock_movements').insert({
        insumo_id: item.insumo_id,
        type: 'entrada',
        quantity: qty,
        reason: 'Compra a proveedor',
      })
    }

    setSuccess(true)
    setItems([{ insumo_id: '', quantity: '', total_price: '' }])
    setSupplierId('')
    setLoading(false)
    setTimeout(() => setSuccess(false), 3000)
  }

  return (
    <main className="min-h-screen bg-gray-950 p-4 md:p-8">
      <div className="max-w-2xl mx-auto">

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">🛒 Registrar Compra</h1>
        </div>

        {success && (
          <div className="bg-green-900 text-green-300 rounded-xl p-3 mb-4 font-semibold">
            ✅ Compra registrada correctamente
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">

          <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 flex flex-col gap-3">
            <select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              required
              className="bg-gray-800 border border-gray-700 rounded-lg p-2 text-white"
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
              className="bg-gray-800 border border-gray-700 rounded-lg p-2 text-white"
            />
          </div>

          <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 flex flex-col gap-3">
            <h2 className="font-semibold text-white">Productos comprados</h2>

            {items.map((item, index) => (
              <div key={index} className="flex flex-col gap-2 border-b border-gray-800 pb-3">
                <select
                  value={item.insumo_id}
                  onChange={(e) => updateItem(index, 'insumo_id', e.target.value)}
                  required
                  className="bg-gray-800 border border-gray-700 rounded-lg p-2 text-white"
                >
                  <option value="">Seleccionar insumo...</option>
                  {insumos.map((i) => (
                    <option key={i.id} value={i.id}>{i.name}</option>
                  ))}
                </select>

                <div className="flex gap-2">
                  <input
                    type="number"
                    placeholder="Cantidad (kg, un, lt)"
                    value={item.quantity}
                    onChange={(e) => updateItem(index, 'quantity', e.target.value)}
                    required
                    className="bg-gray-800 border border-gray-700 rounded-lg p-2 text-white w-1/2"
                  />
                  <input
                    type="number"
                    placeholder="Valor neto total ($)"
                    value={item.total_price}
                    onChange={(e) => updateItem(index, 'total_price', e.target.value)}
                    required
                    className="bg-gray-800 border border-gray-700 rounded-lg p-2 text-white w-1/2"
                  />
                </div>

                {item.quantity && item.total_price && (
                  <p className="text-gray-500 text-xs">
                    Precio por unidad: ${(parseFloat(item.total_price) / parseFloat(item.quantity)).toLocaleString('es-CL', { maximumFractionDigits: 0 })}
                  </p>
                )}

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
              className="text-gray-500 text-sm border border-dashed border-gray-700 rounded-lg p-2 hover:bg-gray-800"
            >
              + Agregar producto
            </button>
          </div>

          <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800 flex justify-between items-center">
            <span className="font-semibold text-white">Total factura</span>
            <span className="text-xl font-bold text-white">
              ${getTotal().toLocaleString('es-CL')}
            </span>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="bg-orange-500 hover:bg-orange-600 text-white rounded-xl p-3 font-semibold transition disabled:opacity-50"
          >
            {loading ? 'Guardando...' : 'Registrar compra'}
          </button>

        </form>
      </div>
    </main>
  )
}