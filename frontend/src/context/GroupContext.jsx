import { createContext, useCallback, useContext, useState } from 'react'

const KEY = 'dcsmart_analytics_grupo'
const GroupContext = createContext(null)

export function GroupProvider({ children }) {
  const [grupo, setGrupoState] = useState(() => localStorage.getItem(KEY) || '')

  const setGrupo = useCallback((g) => {
    if (g) localStorage.setItem(KEY, g)
    else localStorage.removeItem(KEY)
    setGrupoState(g || '')
  }, [])

  return (
    <GroupContext.Provider value={{ grupo, setGrupo }}>
      {children}
    </GroupContext.Provider>
  )
}

export function useGroup() {
  return useContext(GroupContext)
}
