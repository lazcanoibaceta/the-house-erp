'use client'

import { useState } from 'react'
import * as XLSX from 'xlsx'

function serialToDateKey(serial) {
  const ms = Math.round((Math.floor(serial) - 25569) * 86400 * 1000)
  return new Date(ms).toISOString().split('T')[0]
}

function serialToTime(serial) {
  const fraction = serial - Math.floor(serial)
  const mins = Math.round(fraction * 24 * 60)
  const h = Math.floor(mins / 60).toString().padStart(2, '0')
  const m = (mins % 60).toString().padStart(2, '0')
  return `${h}:${m}`
}

function formatDate(dateKey, opts) {
  return new Date(dateKey + 'T12:00:00Z').toLocaleDateString('es-CL', opts)
}

export default function Repartidores() {
  const [datos, setDatos] = useState(null)
  const [archivo, setArchivo] = useState('')
  const [asignaciones, setAsignaciones] = useState({})
  const [inputsAbiertos, setInputsAbiertos] = useState({})
  const [error, setError] = useState(null)

  function procesarExcel(file) {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })

        const validas = rows.filter(r => r['Estado'] !== 'Anulada' && r['Despacho'] > 0)

        const byDay = {}
        for (const row of validas) {
          const dateKey = serialToDateKey(row['Fecha de creación'])
          if (!byDay[dateKey]) byDay[dateKey] = { conRepartidor: [], sinRepartidor: [] }
          if (row['Repartidor']) {
            byDay[dateKey].conRepartidor.push(row)
          } else {
            byDay[dateKey].sinRepartidor.push(row)
          }
        }

        const repartidores = [...new Set(rows.map(r => r['Repartidor']).filter(Boolean))]

        setDatos({ byDay, repartidores })
        setAsignaciones({})
        setInputsAbiertos({})
        setError(null)
      } catch (err) {
        setError('Error al procesar el archivo: ' + err.message)
      }
    }
    reader.readAsArrayBuffer(file)
  }

  function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    setArchivo(file.name)
    procesarExcel(file)
  }

  function asignar(idCuenta, repartidor) {
    const nombre = repartidor.trim()
    if (!nombre) return
    setAsignaciones(prev => ({ ...prev, [idCuenta]: nombre }))
    setInputsAbiertos(prev => ({ ...prev, [idCuenta]: false }))
    if (!datos.repartidores.includes(nombre)) {
      setDatos(prev => ({ ...prev, repartidores: [...prev.repartidores, nombre] }))
    }
  }

  function desasignar(idCuenta) {
    setAsignaciones(prev => { const n = { ...prev }; delete n[idCuenta]; return n })
    setInputsAbiertos(prev => { const n = { ...prev }; delete n[idCuenta]; return n })
  }

  function toggleInput(idCuenta) {
    setInputsAbiertos(prev => ({ ...prev, [idCuenta]: !prev[idCuenta] }))
  }

  if (!datos) {
    return (
      <main className="min-h-screen bg-gray-950 p-4 md:p-8">
        <div className="max-w-2xl mx-auto">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-white">Repartidores</h1>
            <p className="text-gray-500 text-sm mt-1">Sube el Excel de Justo Hub para ver los despachos del día</p>
          </div>
          <div className="bg-gray-900 rounded-2xl p-8 border border-gray-800">
            <label className="flex flex-col items-center gap-3 cursor-pointer">
              <span className="text-4xl">📋</span>
              <span className="text-white font-semibold">Seleccionar Excel de Justo Hub</span>
              <span className="text-gray-500 text-sm text-center">
                Exportado desde "Ventas" en Justo Hub (.xlsx)<br />
                Puede ser de un día o varios días
              </span>
              <input type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" />
              <span className="bg-orange-500 hover:bg-orange-600 text-white px-5 py-2 rounded-lg text-sm font-semibold transition">
                Elegir archivo
              </span>
            </label>
          </div>
          {error && (
            <div className="mt-4 bg-red-950 border border-red-800 text-red-300 rounded-xl p-4">❌ {error}</div>
          )}
        </div>
      </main>
    )
  }

  const dias = Object.keys(datos.byDay).sort()

  // Construir vista por repartidor
  const byRepartidor = {}
  for (const dateKey of dias) {
    const dia = datos.byDay[dateKey]
    for (const row of dia.conRepartidor) {
      const name = row['Repartidor']
      if (!byRepartidor[name]) byRepartidor[name] = { total: 0, days: {} }
      if (!byRepartidor[name].days[dateKey]) byRepartidor[name].days[dateKey] = { total: 0, orders: 0 }
      byRepartidor[name].total += row['Despacho']
      byRepartidor[name].days[dateKey].total += row['Despacho']
      byRepartidor[name].days[dateKey].orders++
    }
    for (const row of dia.sinRepartidor) {
      const asignado = asignaciones[row['Id Cuenta']]
      if (asignado) {
        if (!byRepartidor[asignado]) byRepartidor[asignado] = { total: 0, days: {} }
        if (!byRepartidor[asignado].days[dateKey]) byRepartidor[asignado].days[dateKey] = { total: 0, orders: 0 }
        byRepartidor[asignado].total += row['Despacho']
        byRepartidor[asignado].days[dateKey].total += row['Despacho']
        byRepartidor[asignado].days[dateKey].orders++
      }
    }
  }

  const repartidoresOrdenados = Object.entries(byRepartidor).sort((a, b) => b[1].total - a[1].total)
  const totalGeneral = repartidoresOrdenados.reduce((s, [, d]) => s + d.total, 0)

  const todosSinAsignar = dias.flatMap(d =>
    datos.byDay[d].sinRepartidor.map(r => ({ ...r, _dateKey: d }))
  )
  const pendientes = todosSinAsignar.filter(r => !asignaciones[r['Id Cuenta']])

  const periodoLabel = dias.length === 1
    ? formatDate(dias[0], { weekday: 'long', day: 'numeric', month: 'long' })
    : `${formatDate(dias[0], { day: 'numeric', month: 'short' })} – ${formatDate(dias[dias.length - 1], { day: 'numeric', month: 'short', year: 'numeric' })}`

  return (
    <main className="min-h-screen bg-gray-950 p-4 md:p-8 print:bg-white print:p-0 print:min-h-0">
      <style>{`
        @media print {
          @page { size: 80mm auto; margin: 4mm 6mm; }
          nav, .no-print { display: none !important; }
          body { font-family: 'Courier New', monospace; font-size: 11px; color: #000; }
        }
      `}</style>

      <div className="max-w-2xl mx-auto print:max-w-none">

        {/* Header — oculto al imprimir */}
        <div className="mb-6 flex items-center justify-between no-print">
          <div>
            <h1 className="text-2xl font-bold text-white">Repartidores</h1>
            <p className="text-gray-500 text-sm mt-0.5 truncate max-w-xs">{archivo}</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => window.print()}
              className="bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white text-sm px-4 py-2 rounded-lg transition"
            >
              Imprimir
            </button>
            <button
              onClick={() => { setDatos(null); setArchivo('') }}
              className="text-gray-400 hover:text-white text-sm transition"
            >
              Cargar otro →
            </button>
          </div>
        </div>

        {/* Encabezado de impresión — solo visible al imprimir */}
        <div className="hidden print:block text-center mb-3 border-b border-black pb-2">
          <p className="font-bold text-sm uppercase tracking-wide">Despachos Repartidores</p>
          <p className="text-xs mt-0.5">{periodoLabel}</p>
          <p className="text-xs text-gray-600">{archivo}</p>
        </div>

        {/* Total general — solo impresión */}
        <div className="hidden print:flex justify-between font-bold text-sm border-b border-black pb-1 mb-3">
          <span>TOTAL GENERAL</span>
          <span>${totalGeneral.toLocaleString('es-CL')}</span>
        </div>

        {/* Período — pantalla */}
        <div className="mb-4 no-print">
          <p className="text-orange-400 text-xs uppercase tracking-wide">{periodoLabel}</p>
          <p className="text-gray-500 text-xs mt-0.5">{repartidoresOrdenados.length} repartidor{repartidoresOrdenados.length !== 1 ? 'es' : ''} · ${totalGeneral.toLocaleString('es-CL')} total</p>
        </div>

        {/* Tarjetas por repartidor */}
        {repartidoresOrdenados.length > 0 && (
          <div className="space-y-3 mb-6 print:space-y-0">
            {repartidoresOrdenados.map(([name, data]) => {
              const totalOrders = Object.values(data.days).reduce((s, d) => s + d.orders, 0)
              const dayEntries = Object.entries(data.days).sort(([a], [b]) => a.localeCompare(b))
              const multipleDays = dayEntries.length > 1

              return (
                <div
                  key={name}
                  className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden print:bg-white print:border print:border-black print:rounded-none print:mb-2"
                >
                  {/* Fila principal del repartidor */}
                  <div className="flex items-center justify-between px-4 py-3 print:px-0 print:py-1">
                    <div className="flex items-center gap-3 print:gap-0">
                      <div className="w-10 h-10 rounded-full bg-orange-900/60 flex items-center justify-center text-orange-400 font-bold text-lg shrink-0 print:hidden">
                        {name.charAt(0)}
                      </div>
                      <div>
                        <p className="text-white font-bold text-lg leading-tight print:text-black print:text-sm print:font-bold print:uppercase">
                          {name}
                        </p>
                        <p className="text-gray-500 text-xs print:text-gray-700">
                          {totalOrders} despacho{totalOrders !== 1 ? 's' : ''}
                          {multipleDays && ` · ${dayEntries.length} días`}
                        </p>
                      </div>
                    </div>
                    <span className="text-green-400 font-bold text-2xl print:text-black print:text-base print:font-bold">
                      ${data.total.toLocaleString('es-CL')}
                    </span>
                  </div>

                  {/* Desglose por día (solo si hay más de un día) */}
                  {multipleDays && (
                    <div className="border-t border-gray-800 print:border-t print:border-dashed print:border-gray-400">
                      {dayEntries.map(([dateKey, dayData]) => (
                        <div
                          key={dateKey}
                          className="flex items-center justify-between px-4 py-2 border-b border-gray-800/50 last:border-0 print:px-2 print:py-0.5 print:border-0"
                        >
                          <span className="text-gray-400 text-sm print:text-gray-700 print:text-xs">
                            {formatDate(dateKey, { weekday: 'short', day: 'numeric', month: 'short' })}
                            <span className="text-gray-600 ml-2 print:text-gray-500">
                              {dayData.orders} desp.
                            </span>
                          </span>
                          <span className="text-white text-sm print:text-black print:text-xs">
                            ${dayData.total.toLocaleString('es-CL')}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Pie de impresión */}
        <div className="hidden print:block text-center text-xs text-gray-500 border-t border-dashed border-gray-400 pt-2 mt-2">
          {new Date().toLocaleString('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
        </div>

        {/* Lista sin asignar — oculta al imprimir */}
        {todosSinAsignar.length > 0 && (
          <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden mb-6 no-print">
            <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
              <h3 className="text-white font-semibold">Sin repartidor asignado</h3>
              {pendientes.length > 0 && (
                <span className="text-xs bg-yellow-900/50 text-yellow-400 px-2 py-0.5 rounded-full">
                  {pendientes.length} pendiente{pendientes.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>

            {todosSinAsignar.map(row => {
              const asignado = asignaciones[row['Id Cuenta']]
              const inputAbierto = inputsAbiertos[row['Id Cuenta']]

              return (
                <div
                  key={row['Id Cuenta']}
                  className={`px-4 py-3 border-b border-gray-800 last:border-0 transition ${asignado ? 'opacity-50' : ''}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-white text-sm font-medium truncate">
                        {row['Cliente'] || 'Sin nombre'}
                      </p>
                      <p className="text-gray-500 text-xs mt-0.5">
                        {formatDate(row['_dateKey'], { weekday: 'short', day: 'numeric', month: 'short' })}
                        {' · '}{serialToTime(row['Fecha de creación'])}
                        {' · '}{row['Cuenta']}
                        {' · '}{row['Plataforma']}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-yellow-400 font-semibold">${row['Despacho'].toLocaleString('es-CL')}</span>

                      {asignado ? (
                        <div className="flex items-center gap-1">
                          <span className="text-green-400 text-xs bg-green-900/30 px-2 py-1 rounded-lg">{asignado}</span>
                          <button onClick={() => desasignar(row['Id Cuenta'])} className="text-gray-600 hover:text-gray-400 text-xs">✕</button>
                        </div>
                      ) : inputAbierto ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            list={`reps-${row['Id Cuenta']}`}
                            placeholder="Nombre repartidor"
                            autoFocus
                            className="bg-gray-800 border border-orange-500 text-white text-xs rounded-lg px-2 py-1.5 w-36 outline-none"
                            onKeyDown={e => {
                              if (e.key === 'Enter') asignar(row['Id Cuenta'], e.target.value)
                              if (e.key === 'Escape') toggleInput(row['Id Cuenta'])
                            }}
                            onChange={e => {
                              if (datos.repartidores.includes(e.target.value)) {
                                asignar(row['Id Cuenta'], e.target.value)
                              }
                            }}
                          />
                          <datalist id={`reps-${row['Id Cuenta']}`}>
                            {datos.repartidores.map(r => <option key={r} value={r} />)}
                          </datalist>
                          <button onClick={() => toggleInput(row['Id Cuenta'])} className="text-gray-600 hover:text-gray-400 text-xs">✕</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => toggleInput(row['Id Cuenta'])}
                          className="bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded-lg px-2 py-1.5 transition"
                        >
                          Asignar →
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

      </div>
    </main>
  )
}
