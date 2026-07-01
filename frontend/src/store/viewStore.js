import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useViewStore = create(
  persist(
    (set) => ({
      view: 'list',
      setView: (view) => set({ view }),
    }),
    {
      name: 'syntask-task-view',
    }
  )
)
