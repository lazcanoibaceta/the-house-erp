'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

// Caché en memoria para no re-fetchear en cada navegación
let _cached = null

export function clearRoleCache() {
  _cached = null
}

export function useRole() {
  const [state, setState] = useState(
    _cached || { role: null, locationCode: null, loading: true }
  )

  useEffect(() => {
    if (_cached) {
      setState(_cached)
      return
    }

    async function fetchRole() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        _cached = { role: null, locationCode: null, loading: false }
        setState(_cached)
        return
      }

      const { data } = await supabase
        .from('user_profiles')
        .select('role, location_code')
        .eq('user_id', user.id)
        .single()

      _cached = {
        role:         data?.role         || null,
        locationCode: data?.location_code || null,
        loading:      false,
      }
      setState(_cached)
    }

    fetchRole()
  }, [])

  return state
}
