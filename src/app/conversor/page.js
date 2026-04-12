'use client'

import { useState } from 'react'

const PRECIO_CHEESEBURGUER = 6490

const mensajes = [
  (n) => `Eso es ${n} cheeseburguer, compadre. ¿En serio vas a gastar eso?`,
  (n) => `${n} cheeseburguer. Tu colesterol te lo agradece.`,
  (n) => `Podrías comer ${n} cheeseburguer. Piénsalo bien.`,
  (n) => `${n} cheeseburguer. La vida es corta, cómelas todas.`,
  (n) => `Eso equivale a ${n} cheeseburguer. Prioridades, amigo.`,
  (n) => `${n} cheeseburguer. ¿Y todavía dudas en comprarlo?`,
  (n) => `Con eso te comes ${n} cheeseburguer. Respeto.`,
  (n) => `${n} cheeseburguer. Tu yo del futuro te odia.`,
  (n) => `Eso son ${n} cheeseburguer. La economía chilena te lo cobra.`,
  (n) => `${n} cheeseburguer. Eso es todo lo que necesitas saber.`,
]

export default function Conversor() {
  const [valor, setValor] = useState('')
  const [resultado, setResultado] = useState(null)
  const [mensaje, setMensaje] = useState('')

  function calcular() {
    const num = parseFloat(valor)
    if (!num || num <= 0) return

    const burgers = Math.ceil(num / PRECIO_CHEESEBURGUER)
    setResultado(burgers)
    const randomMensaje = mensajes[Math.floor(Math.random() * mensajes.length)]
    setMensaje(randomMensaje(burgers.toLocaleString('es-CL')))
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') calcular()
  }

  return (
    <main className="min-h-screen bg-gray-950 p-4 md:p-8 flex items-center justify-center">
      <div className="max-w-md w-full mx-auto">

        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">🍔 Conversor</h1>
          <p className="text-gray-500 text-sm">¿Cuántas cheeseburguer vale eso?</p>
        </div>

        <div className="bg-gray-900 rounded-2xl p-6 border border-gray-800">
          <label className="text-gray-400 text-sm mb-2 block">Ingresa un valor en pesos</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
              <input
                type="number"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="ej: 50000"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-7 pr-3 py-3 text-white placeholder-gray-600 outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <button
              onClick={calcular}
              className="bg-orange-500 hover:bg-orange-600 text-white rounded-lg px-4 font-semibold transition"
            >
              →
            </button>
          </div>

          {resultado !== null && (
            <div className="mt-6 text-center">
              <p className="text-6xl font-black text-orange-400 mb-2">
                {resultado.toLocaleString('es-CL')}
              </p>
              <p className="text-gray-300 text-lg font-semibold mb-3">cheeseburguer</p>
              <p className="text-gray-500 text-sm italic">{mensaje}</p>
              <p className="text-gray-700 text-xs mt-4">
                1 cheeseburguer = ${PRECIO_CHEESEBURGUER.toLocaleString('es-CL')}
              </p>
            </div>
          )}
        </div>

      </div>
    </main>
  )
}