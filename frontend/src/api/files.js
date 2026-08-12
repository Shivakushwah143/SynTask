import api from './axios'

// Must match backend/app/api/v1/endpoints/files.py GENERAL_UPLOAD_MAX_SIZE (200 MB)
export const MAX_UPLOAD_SIZE = 200 * 1024 * 1024

const stripTrailingZero = (value) => value.replace(/\.0$/, '')

export const formatFileSize = (bytes) => {
  if (!bytes && bytes !== 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${stripTrailingZero((bytes / 1024).toFixed(1))} KB`
  if (bytes < 1024 * 1024 * 1024) return `${stripTrailingZero((bytes / 1024 / 1024).toFixed(1))} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

export const getUploadErrorMessage = (error) => {
  const detail = error?.response?.data?.detail
  if (typeof detail === 'string' && detail) return detail
  if (error?.response?.status === 413) {
    return `File is too large. Maximum allowed size is ${formatFileSize(MAX_UPLOAD_SIZE)}.`
  }
  return 'Failed to upload file. Please try again.'
}

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
    const API_URL = import.meta.env.VITE_API_URL || '/api/v1'
    return `${API_URL}/files/${filename}`
  },
}

