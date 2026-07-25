// utils/avatarUrl.js
export const getAvatarUrl = (path, version = '') => {
  if (!path) return null;
  
  try {
    const basePath = String(path);
    
    // Get API URL from environment
    const apiOrigin = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';
    
    let url;
    
    // If it's already a full URL
    if (basePath.startsWith('http://') || basePath.startsWith('https://')) {
      url = basePath;
    } 
    // If it starts with /uploads/ - serve directly from backend
    else if (basePath.startsWith('/uploads/')) {
      url = `${apiOrigin}${basePath}`;
    }
    // If it's a relative path
    else {
      // Ensure it starts with /
      const cleanPath = basePath.startsWith('/') ? basePath : `/${basePath}`;
      // Check if it should be in avatars folder
      if (cleanPath.includes('avatar')) {
        url = `${apiOrigin}/uploads/avatars/${cleanPath.split('/').pop()}`;
      } else {
        url = `${apiOrigin}${cleanPath}`;
      }
    }
    
    // Add version for cache busting
    if (!version) return url;
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}v=${encodeURIComponent(version)}`;
    
  } catch (error) {
    console.error('Error constructing avatar URL:', error);
    return null;
  }
};