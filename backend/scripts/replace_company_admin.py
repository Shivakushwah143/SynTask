"""Replace all company_admin references with admin"""
import os
import re

# Files to update
files_to_update = [
    "backend/app/api/dependencies.py",
    "backend/app/api/v1/endpoints/dashboard.py",
    "backend/app/api/v1/endpoints/users.py",
    "backend/app/api/v1/endpoints/projects.py",
    "backend/app/api/v1/endpoints/tickets.py",
    "backend/app/api/v1/endpoints/calendar.py",
    "backend/app/api/v1/endpoints/timesheet.py",
    "backend/app/api/v1/endpoints/chat.py",
    "backend/app/api/v1/endpoints/time_tracking.py",
]

replacements = [
    # String literals
    (r'"company_admin"', '"admin"'),
    (r"'company_admin'", "'admin'"),
    # Enum references
    (r'UserRole\.COMPANY_ADMIN', 'UserRole.ADMIN'),
    # Function names (keep for backward compatibility)
    # (r'get_current_company_admin', 'get_current_admin'),
]

def replace_in_file(filepath):
    """Replace company_admin with admin in a file"""
    full_path = os.path.join("C:\\Users\\Administrator\\Documents\\task management", filepath)
    
    if not os.path.exists(full_path):
        print(f"❌ Not found: {filepath}")
        return
    
    with open(full_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    original_content = content
    
    for pattern, replacement in replacements:
        content = re.sub(pattern, replacement, content)
    
    if content != original_content:
        with open(full_path, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"✅ Updated: {filepath}")
    else:
        print(f"⏭️  No changes: {filepath}")

if __name__ == "__main__":
    print("Replacing company_admin with admin...\n")
    for file in files_to_update:
        replace_in_file(file)
    print("\n✅ Done!")

