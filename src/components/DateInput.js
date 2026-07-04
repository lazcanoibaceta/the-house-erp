'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Campo de fecha en formato chileno dd-mm-aaaa.
 *
 * El input nativo type="date" muestra la fecha según el idioma del NAVEGADOR
 * (mm/dd/aaaa si está en inglés), no según la página. Acá se escribe siempre
 * dd-mm-aaaa (con guiones automáticos) y el botón 📅 abre el calendario nativo.
 *
 * `value` y `onChange` siguen usando ISO (aaaa-mm-dd), igual que el input
 * nativo, así que las páginas y la base de datos no cambian.
 */

function isoToCl(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}-${m}-${y}`
}

function clToIso(text) {
  const m = text.match(/^(\d{2})-(\d{2})-(\d{4})$/)
  if (!m) return null
  const iso = `${m[3]}-${m[2]}-${m[1]}`
  const date = new Date(iso + 'T00:00:00')
  // getDate() distinto = fecha inexistente tipo 31-02 (JS la "corrige" solo)
  if (isNaN(date.getTime()) || date.getDate() !== parseInt(m[1], 10)) return null
  return iso
}

export default function DateInput({ value, onChange, required, className }) {
  const [text, setText] = useState(isoToCl(value))
  const pickerRef = useRef(null)

  // Sincroniza si el valor cambia desde afuera (ej: abrir modal de edición)
  useEffect(() => {
    if (clToIso(text) !== (value || null)) setText(isoToCl(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  function handleText(raw) {
    const digits = raw.replace(/\D/g, '').slice(0, 8)
    let out = digits
    if (digits.length > 4)      out = `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4)}`
    else if (digits.length > 2) out = `${digits.slice(0, 2)}-${digits.slice(2)}`
    setText(out)
    const iso = clToIso(out)
    if (iso) onChange(iso)
    else if (out === '') onChange('')
  }

  return (
    <div className={`relative ${className || ''}`}>
      <input
        type="text"
        inputMode="numeric"
        placeholder="dd-mm-aaaa"
        value={text}
        onChange={e => handleText(e.target.value)}
        onBlur={() => { if (text && !clToIso(text)) setText(isoToCl(value)) }}
        required={required}
        pattern="\d{2}-\d{2}-\d{4}"
        title="Fecha en formato dd-mm-aaaa"
        className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 pr-9 text-white placeholder-gray-500"
      />
      <button
        type="button"
        aria-label="Abrir calendario"
        onClick={() => pickerRef.current?.showPicker?.()}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
      >
        📅
      </button>
      {/* Input nativo oculto: solo aporta el calendario del navegador */}
      <input
        ref={pickerRef}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        value={value || ''}
        onChange={e => { onChange(e.target.value); setText(isoToCl(e.target.value)) }}
        className="absolute right-2 bottom-0 w-px h-px opacity-0 pointer-events-none"
      />
    </div>
  )
}
