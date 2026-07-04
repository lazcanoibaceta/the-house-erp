'use client'

import { useState, useEffect } from 'react'

export function useLocation() {
  const [locationCode, setLocationCode] = useState('SF')
  const [locationId, setLocationId] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    function readLocation() {
      const saved = localStorage.getItem('location') || 'SF'
      setLocationCode(saved)
    }
    readLocation()
    // 'locationChanged' = cambio en esta pestaña; 'storage' = cambio en OTRA
    // pestaña del mismo navegador (antes quedaban desincronizadas)
    window.addEventListener('locationChanged', readLocation)
    window.addEventListener('storage', readLocation)
    return () => {
      window.removeEventListener('locationChanged', readLocation)
      window.removeEventListener('storage', readLocation)
    }
  }, [])

  useEffect(() => {
    if (!locationCode) return

    async function fetchLocationId() {
      setLoading(true)
      const { createClient } = await import('@/lib/supabase')
      const supabase = createClient()
      const { data } = await supabase
        .from('locations')
        .select('id')
        .eq('short_code', locationCode)
        .single()

      if (data) setLocationId(data.id)
      setLoading(false)
    }

    fetchLocationId()
  }, [locationCode])

  return { locationCode, locationId, loading }
}