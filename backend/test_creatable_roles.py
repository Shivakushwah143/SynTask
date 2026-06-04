"""Test creatable roles endpoint"""
import requests

# Test with Super Admin token
url = "http://127.0.0.1:8000/api/v1/users/creatable-roles"

# First login to get token
login_url = "http://127.0.0.1:8000/api/v1/auth/login"
login_data = {
    "email": "admin@synzent.ai",
    "password": "Admin@123"
}

try:
    # Login
    login_response = requests.post(login_url, json=login_data)
    print(f"Login Status: {login_response.status_code}")
    
    if login_response.status_code == 200:
        token_data = login_response.json()
        access_token = token_data.get('access_token')
        user_data = token_data.get('user', {})
        
        print(f"User: {user_data.get('first_name')} {user_data.get('last_name')}")
        print(f"Role: {user_data.get('role')}")
        print(f"Token: {access_token[:20]}...")
        
        # Test creatable roles
        headers = {"Authorization": f"Bearer {access_token}"}
        roles_response = requests.get(url, headers=headers)
        
        print(f"\nCreatable Roles Status: {roles_response.status_code}")
        print(f"Response: {roles_response.json()}")
    else:
        print(f"Login failed: {login_response.text}")
        
except Exception as e:
    print(f"Error: {e}")

