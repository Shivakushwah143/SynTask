# Bug Fixes Summary

## Issues Fixed

### 1. Login.jsx - setLoading TypeError
**Error:** `TypeError: useUIStore.getState(...).setLoading is not a function`

**Root Cause:** The `useUIStore` was missing the `setLoading` function that Login.jsx was trying to call.

**Fix Applied:** Added `setLoading` function to `frontend/src/store/uiStore.js`
```javascript
// Global Loading State
isLoading: false,
setLoading: (loading) => set({ isLoading: loading }),
```

**File Modified:** `frontend/src/store/uiStore.js`

---

### 2. Avatar Upload - 404 Not Found & CORS Error
**Error:** 
- `GET http://localhost:8000/uploads/avatars/... 404 (Not Found)`
- `net::ERR_BLOCKED_BY_RESPONSE.NotSameOrigin`

**Root Cause:** 
1. Nginx configuration was missing a proxy rule for `/uploads/` path
2. Backend was setting `Cross-Origin-Resource-Policy: same-origin` header which blocked cross-origin access to uploaded files

**Fixes Applied:**

#### a) Added nginx proxy rule for uploads
**File Modified:** `frontend/nginx.conf`
```nginx
# Uploads proxy - forward /uploads requests to backend
location /uploads/ {
    proxy_pass http://localhost:8000/uploads/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_buffering off;
    proxy_read_timeout 300s;
    proxy_connect_timeout 75s;
}
```

#### b) Fixed CORS headers for uploaded files
**File Modified:** `backend/app/main.py`
```python
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()")
    response.headers.setdefault("Cross-Origin-Opener-Policy", "same-origin")
    # Allow cross-origin access to uploaded files (images, documents)
    if request.url.path.startswith("/uploads/") or request.url.path.startswith("/api/v1/files/"):
        response.headers.setdefault("Cross-Origin-Resource-Policy", "cross-origin")
    else:
        response.headers.setdefault("Cross-Origin-Resource-Policy", "same-origin")
    return response
```

---

### 3. Clients Page - 403 Forbidden Error
**Error:** `GET http://localhost:8000/api/v1/clients/ 403 (Forbidden)`

**Root Cause:** The user making the request doesn't have the required permissions (Admin, Manager, Lead, or Super Admin role) to view clients.

**Fix Applied:** Improved error handling in `frontend/src/pages/Clients.jsx` to provide better user feedback
```javascript
const loadClients = useCallback(async () => {
    try {
      setLoading(true)
      const params = {}
      if (statusFilter) params.status_filter = statusFilter
      const data = await clientsAPI.listClients(params)
      setClients(data.clients || [])
    } catch (error) {
      console.error('Error loading clients:', error)
      if (error.response?.status === 403) {
        toast.error('You do not have permission to view clients. Please contact your administrator.')
      } else if (error.response?.status === 401) {
        toast.error('Please login to view clients')
      } else {
        toast.error('Failed to load clients')
      }
      setClients([])
    } finally {
      setLoading(false)
    }
  }, [statusFilter])
```

**File Modified:** `frontend/src/pages/Clients.jsx`

**Note:** This is a permission issue. The user needs to have one of these roles:
- Admin
- Manager  
- Lead
- Super Admin

If the user should have access, check their role in the database or user management panel.

---

## Deployment Instructions

### Frontend Changes
1. Rebuild the frontend:
   ```bash
   cd frontend
   npm run build
   ```

2. Deploy the updated frontend files to your server

3. Update nginx configuration:
   ```bash
   # Copy the updated nginx.conf to your server
   # Test nginx configuration
   sudo nginx -t
   
   # Reload nginx
   sudo systemctl reload nginx
   ```

### Backend Changes
1. Deploy the updated backend code:
   ```bash
   cd backend
   # Restart the backend service
   # If using systemd:
   sudo systemctl restart syntask-backend
   
   # If using Docker:
   docker-compose restart backend
   ```

2. Verify the backend is running:
   ```bash
   curl http://localhost:8000/health
   ```

---

## Verification Steps

### 1. Test Login
- Navigate to `/login`
- Try logging in with valid credentials
- Verify no console errors about `setLoading`

### 2. Test Avatar Upload
- Go to Settings page
- Try uploading an avatar image
- Verify the image loads correctly without CORS errors
- Check browser console for any errors

### 3. Test Clients Page
- Navigate to `/clients`
- If you have proper permissions, clients should load
- If you get 403, you'll see a helpful error message
- Check user role in database if access is needed

---

## Additional Notes

### For 403 Forbidden on Clients:
If users should have access to clients but are getting 403:

1. **Check user role in database:**
   ```javascript
   // In MongoDB
   db.users.find({ email: "user@example.com" }, { email: 1, role: 1, company_id: 1 })
   ```

2. **Valid roles for client access:**
   - `admin`
   - `manager`
   - `lead`
   - `super_admin`

3. **Create demo admin if needed:**
   ```bash
   cd backend
   python create_demo_admin.py
   ```

### For Avatar Upload Issues:
- Ensure the `uploads/avatars/` directory exists and has proper permissions
- Check that the backend can write to the uploads directory
- Verify the file size is under 5MB limit

---

## Files Modified

1. `frontend/src/store/uiStore.js` - Added setLoading function
2. `frontend/nginx.conf` - Added uploads proxy rule
3. `backend/app/main.py` - Fixed CORS headers for uploaded files
4. `frontend/src/pages/Clients.jsx` - Improved error handling

## Backend Endpoint Reference

The clients endpoint requires authentication and specific roles:
- **Endpoint:** `GET /api/v1/clients/`
- **Authentication:** Required (JWT token)
- **Allowed Roles:** Admin, Manager, Lead, Super Admin
- **Dependency:** `get_current_company_admin_or_lead`

Avatar upload endpoint:
- **Endpoint:** `POST /api/v1/auth/upload-avatar`
- **Authentication:** Required
- **Max Size:** 5MB
- **Allowed Types:** image/jpeg, image/png, image/gif, image/webp