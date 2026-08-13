'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import RoleGuard from '@/components/RoleGuard'
import Link from 'next/link'

const supabase = createClient()

const LOCATION_NAMES = { SF: 'San Felipe', LA: 'Los Andes' }
const KIND_LABELS = {
  prestamo:   '💰 Préstamo',
  importador: '🚢 Importador',
  tarjeta:    '💳 Tarjeta',
  proveedor:  '📦 Proveedor',
  otro:       '📄 Otro',
}

const hoyISO = () => new Date().toISOString().split('T')[0]

function fmt(n) {
  return '$' + Math.round(n || 0).toLocaleString('es-CL')
}

function fmtFecha(iso) {
  if (!iso) return null
  return new Date(iso + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })
}

// Ordena por vencimiento: primero los que tienen fecha (más próxima arriba), luego los sin fecha
function porVencimiento(a, b) {
  if (!a.due_date && !b.due_date) return 0
  if (!a.due_date) return 1
  if (!b.due_date) return -1
  return a.due_date.localeCompare(b.due_date)
}

export default function PendientesPage() {
  const [cuentas, setCuentas]     = useState([])   // compras + gastos por pagar (normalizados)
  const [pasivos, setPasivos]     = useState([])   // liabilities por pagar
  const [loading, setLoading]     = useState(true)
  const [pagandoId, setPagandoId] = useState(null)
  const [abonandoId, setAbonandoId] = useState(null)  // id del pasivo con el form de abono abierto
  const [montoAbono, setMontoAbono] = useState('')

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setLoading(true)
    const [{ data: locs }, { data: compras }, { data: gastos }, { data: liabs }] = await Promise.all([
      supabase.from('locations').select('id, short_code'),
      supabase.from('purchases')
        .select('id, date, total, due_date, location_id, suppliers(name)')
        .eq('payment_status', 'por_pagar'),
      supabase.from('operating_expenses')
        .select('id, expense_date, amount_total, due_date, location_id, supplier, description')
        .eq('payment_status', 'por_pagar'),
      supabase.from('liabilities')
        .select('*')
        .eq('status', 'por_pagar'),
    ])

    const locMap = {}
    ;(locs || []).forEach(l => { locMap[l.id] = l.short_code })

    // Normaliza compras y gastos a una forma común
    const deCompras = (compras || []).map(c => ({
      key:     'compra-' + c.id,
      source:  'compra',
      id:      c.id,
      titulo:  c.suppliers?.name || 'Proveedor',
      sub:     'Compra',
      // purchases.total es NETO; lo que se paga es con IVA
      amount:  parseFloat(c.total || 0) * 1.19,
      loc:     locMap[c.location_id] || null,
      due_date: c.due_date,
      fecha:   c.date,
    }))
    const deGastos = (gastos || []).map(g => ({
      key:     'gasto-' + g.id,
      source:  'gasto',
      id:      g.id,
      titulo:  g.supplier || g.description || 'Gasto',
      sub:     g.description && g.supplier ? g.description : 'Gasto',
      amount:  parseFloat(g.amount_total || 0),
      loc:     locMap[g.location_id] || null,
      due_date: g.due_date,
      fecha:   g.expense_date,
    }))

    setCuentas([...deCompras, ...deGastos].sort(porVencimiento))
    setPasivos((liabs || []).sort((a, b) => parseFloat(b.amount) - parseFloat(a.amount)))
    setLoading(false)
  }

  async function marcarPagado(item) {
    const ok = window.confirm(`¿Marcar como pagado?\n\n${item.titulo}\n${fmt(item.amount)}\n\nDesaparecerá de la lista de pendientes.`)
    if (!ok) return
    setPagandoId(item.key)
    const table = item.source === 'compra' ? 'purchases' : 'operating_expenses'
    await supabase.from(table).update({ payment_status: 'pagado', paid_date: hoyISO() }).eq('id', item.id)
    setPagandoId(null)
    setCuentas(prev => prev.filter(c => c.key !== item.key))
  }

  // Paga un pasivo, total o parcialmente. Registra el abono con su fecha,
  // baja el saldo (liabilities.amount) y, si llega a 0, lo marca pagado y lo
  // saca de la lista. Si queda saldo, se mantiene con lo que falta.
  async function pagarPasivo(l, montoRaw) {
    const saldo = parseFloat(l.amount || 0)
    const monto = Math.round(parseFloat(montoRaw) || 0)
    if (!(monto > 0)) { alert('Ingresa un monto mayor a 0.'); return }
    if (monto > saldo) { alert(`El abono ($${monto.toLocaleString('es-CL')}) no puede superar el saldo (${fmt(saldo)}).`); return }

    const nuevoSaldo = saldo - monto
    const quedaSaldado = nuevoSaldo <= 0
    const ok = window.confirm(
      quedaSaldado
        ? `¿Pagar el total de ${l.creditor}?\n\n${fmt(monto)}\n\nDesaparecerá de la lista.`
        : `¿Registrar abono a ${l.creditor}?\n\nAbono: ${fmt(monto)}\nSaldo restante: ${fmt(nuevoSaldo)}`
    )
    if (!ok) return

    setPagandoId('pasivo-' + l.id)
    // 1. Registrar el abono (historial + flujo de caja)
    await supabase.from('liability_payments').insert({ liability_id: l.id, amount: monto, paid_date: hoyISO() })
    // 2. Actualizar el saldo del pasivo
    await supabase.from('liabilities').update({
      amount:    quedaSaldado ? 0 : nuevoSaldo,
      status:    quedaSaldado ? 'pagado' : 'por_pagar',
      paid_date: quedaSaldado ? hoyISO() : null,
      updated_at: new Date().toISOString(),
    }).eq('id', l.id)

    setPagandoId(null)
    setAbonandoId(null)
    setMontoAbono('')
    if (quedaSaldado) {
      setPasivos(prev => prev.filter(p => p.id !== l.id))
    } else {
      setPasivos(prev => prev.map(p => p.id === l.id ? { ...p, amount: nuevoSaldo } : p))
    }
  }

  const totalCuentas = cuentas.reduce((s, c) => s + c.amount, 0)
  const totalPasivos = pasivos.reduce((s, p) => s + parseFloat(p.amount || 0), 0)
  const totalGeneral = totalCuentas + totalPasivos
  const hoy = hoyISO()

  return (
    <RoleGuard allowedRoles={['admin', 'admin_supremo']}>
      <main className="min-h-screen bg-gray-950 p-4 md:p-8">
        <div className="max-w-2xl mx-auto flex flex-col gap-6">

          {/* Header */}
          <div>
            <h1 className="text-2xl font-bold text-white">💸 Pendientes de pago</h1>
            <p className="text-gray-500 text-sm mt-1">Todo lo que The House debe: compras y gastos a crédito + créditos grandes</p>
          </div>

          {/* Resumen */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-gray-900 rounded-2xl p-4 border border-orange-500/30 sm:col-span-1">
              <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Total por pagar</p>
              <p className="text-3xl font-bold text-orange-400">{fmt(totalGeneral)}</p>
            </div>
            <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
              <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Cuentas (prov./gastos)</p>
              <p className="text-xl font-bold text-white">{fmt(totalCuentas)}</p>
              <p className="text-gray-600 text-xs mt-1">{cuentas.length} pendiente{cuentas.length !== 1 ? 's' : ''}</p>
            </div>
            <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
              <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Créditos grandes</p>
              <p className="text-xl font-bold text-white">{fmt(totalPasivos)}</p>
              <p className="text-gray-600 text-xs mt-1">{pasivos.length} pasivo{pasivos.length !== 1 ? 's' : ''}</p>
            </div>
          </div>

          {loading ? (
            <p className="text-gray-500 text-sm">Cargando...</p>
          ) : (
            <>
              {/* ── Cuentas por pagar (compras + gastos) ── */}
              <section className="flex flex-col gap-3">
                <h2 className="text-white font-semibold flex items-center gap-2">
                  📦 Cuentas por pagar
                  <span className="text-gray-500 text-sm font-normal">proveedores y gastos</span>
                </h2>
                {cuentas.length === 0 ? (
                  <div className="bg-gray-900 rounded-2xl p-6 border border-gray-800 text-center">
                    <p className="text-gray-500 text-sm">No hay compras ni gastos marcados como "por pagar".</p>
                    <p className="text-gray-600 text-xs mt-1">
                      Al registrar una factura a crédito en <Link href="/compras/nuevo" className="text-orange-400 hover:underline">Compras</Link> o{' '}
                      <Link href="/gastos/nuevo" className="text-orange-400 hover:underline">Gastos</Link>, marca "Por pagar" y aparecerá acá.
                    </p>
                  </div>
                ) : (
                  cuentas.map(item => {
                    const vencido = item.due_date && item.due_date < hoy
                    return (
                      <div key={item.key} className={`bg-gray-900 rounded-2xl p-4 border ${vencido ? 'border-red-500/40' : 'border-gray-800'} flex items-center justify-between gap-3`}>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-white font-semibold truncate">{item.titulo}</p>
                            {item.loc && <span className="bg-gray-800 text-gray-400 text-xs px-1.5 py-0.5 rounded shrink-0">{item.loc}</span>}
                          </div>
                          <p className="text-gray-500 text-xs mt-0.5">
                            {item.sub}
                            {item.due_date
                              ? <> · vence {fmtFecha(item.due_date)}{vencido && <span className="text-red-400 font-medium"> (vencida)</span>}</>
                              : <> · sin fecha de vencimiento</>}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span className="text-white font-bold">{fmt(item.amount)}</span>
                          <button
                            onClick={() => marcarPagado(item)}
                            disabled={pagandoId === item.key}
                            className="text-xs text-green-400 border border-green-500/30 rounded-lg px-2 py-1 hover:bg-green-500/10 transition disabled:opacity-50"
                          >
                            {pagandoId === item.key ? '...' : '✓ Pagado'}
                          </button>
                        </div>
                      </div>
                    )
                  })
                )}
              </section>

              {/* ── Créditos grandes (pasivos) ── */}
              <section className="flex flex-col gap-3">
                <h2 className="text-white font-semibold flex items-center gap-2">
                  🏦 Créditos grandes
                  <span className="text-gray-500 text-sm font-normal">préstamos, importador, tarjeta</span>
                </h2>
                {pasivos.length === 0 ? (
                  <div className="bg-gray-900 rounded-2xl p-6 border border-gray-800 text-center">
                    <p className="text-gray-500 text-sm">No hay créditos grandes pendientes.</p>
                  </div>
                ) : (
                  pasivos.map(l => {
                    const orig = parseFloat(l.original_amount || l.amount)
                    const abonado = orig - parseFloat(l.amount || 0)
                    const procesando = pagandoId === 'pasivo-' + l.id
                    return (
                      <div key={l.id} className={`bg-gray-900 rounded-2xl p-4 border ${l.is_overdue ? 'border-red-500/40' : 'border-gray-800'} flex flex-col gap-3`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-white font-semibold truncate">{l.creditor}</p>
                              {l.is_overdue && <span className="bg-red-500/20 text-red-400 text-xs px-1.5 py-0.5 rounded shrink-0">Vencido</span>}
                            </div>
                            <p className="text-gray-500 text-xs mt-0.5">
                              {KIND_LABELS[l.kind] || l.kind}
                              {l.due_date && <> · vence {fmtFecha(l.due_date)}</>}
                            </p>
                            {abonado > 0 && (
                              <p className="text-green-500/80 text-xs mt-1">Abonado {fmt(abonado)} de {fmt(orig)}</p>
                            )}
                            {l.notes && <p className="text-gray-600 text-xs mt-1 italic">{l.notes}</p>}
                          </div>
                          <div className="text-right shrink-0">
                            <span className="text-white font-bold block">{fmt(l.amount)}</span>
                            <span className="text-gray-600 text-xs">saldo</span>
                          </div>
                        </div>

                        {abonandoId === l.id ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              autoFocus
                              value={montoAbono}
                              onChange={e => setMontoAbono(e.target.value)}
                              placeholder="Monto del abono $"
                              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg p-2 text-white text-sm"
                            />
                            <button
                              onClick={() => pagarPasivo(l, montoAbono)}
                              disabled={procesando}
                              className="text-xs text-white bg-orange-500 hover:bg-orange-600 rounded-lg px-3 py-2 font-semibold transition disabled:opacity-50"
                            >
                              {procesando ? '...' : 'Abonar'}
                            </button>
                            <button
                              onClick={() => { setAbonandoId(null); setMontoAbono('') }}
                              className="text-xs text-gray-400 hover:text-white px-2 py-2"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => { setAbonandoId(l.id); setMontoAbono('') }}
                              disabled={procesando}
                              className="text-xs text-orange-400 border border-orange-500/30 rounded-lg px-2 py-1 hover:bg-orange-500/10 transition disabled:opacity-50"
                            >
                              ＋ Abonar
                            </button>
                            <button
                              onClick={() => pagarPasivo(l, l.amount)}
                              disabled={procesando}
                              className="text-xs text-green-400 border border-green-500/30 rounded-lg px-2 py-1 hover:bg-green-500/10 transition disabled:opacity-50"
                            >
                              {procesando ? '...' : '✓ Pagar todo'}
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </section>

              <p className="text-gray-600 text-xs">
                Las compras se muestran con IVA (lo que efectivamente se paga). En la base se guardan en neto.
              </p>
            </>
          )}

        </div>
      </main>
    </RoleGuard>
  )
}
