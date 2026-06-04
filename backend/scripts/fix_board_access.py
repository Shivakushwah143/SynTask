"""Fix project board access checks"""
import re

file_path = r"C:\Users\Administrator\Documents\task management\backend\app\api\v1\endpoints\projects.py"

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Pattern to match the old access check block
old_pattern = r'''    check_company_access\(current_user, project\.company_id\)
    
    # Check if user has access to this project
    if current_user\.role not in \[UserRole\.ADMIN, UserRole\.SUPER_ADMIN\]:
        if current_user\.role == UserRole\.EMPLOYEE:
            # Employees can access projects assigned to their lead
            employee = await Employee\.get\(current_user\.id\)
            if not employee or not employee\.lead_id or project\.assigned_to != employee\.lead_id:
                raise HTTPException\(
                    status_code=http_status\.HTTP_403_FORBIDDEN,
                    detail="You don't have access to this project"
                \)
        else:
            # Leads can access projects assigned to them
            if project\.assigned_to != str\(current_user\.id\):
                raise HTTPException\(
                    status_code=http_status\.HTTP_403_FORBIDDEN,
                    detail="You don't have access to this project"
                \)'''

# New block
new_block = '''    # Use centralized hierarchical access check
    await ensure_project_access_for_user(project, current_user)'''

# Count occurrences
count = len(re.findall(old_pattern, content))
print(f"Found {count} occurrences of old access check")

# Replace all occurrences
content = re.sub(old_pattern, new_block, content)

# Write back
with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("File updated successfully!")

