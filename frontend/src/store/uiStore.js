import { create } from 'zustand'

export const useUIStore = create((set) => ({
  loading: false,
  setLoading: (value) => set({ loading: value }),
}))

export default useUIStore
