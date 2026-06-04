import api from './axios'

export const filesAPI = {
  // Upload file
  uploadFile: async (file) => {
    const formData = new FormData()
    formData.append('file', file)
    
    const response = await api.post('/files/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    })
    return response.data
  },

  // Get file URL
  getFileUrl: (filename) => {
    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1'
    return `${API_URL}/files/${filename}`
  },
}

