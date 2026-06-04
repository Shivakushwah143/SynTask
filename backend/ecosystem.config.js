/**
 * PM2 Ecosystem Configuration for Backend
 * Production-ready configuration for FastAPI backend
 */
module.exports = {
  apps: [{
    name: 'task-management-backend',
    script: 'venv\\Scripts\\python.exe',
    args: '-m uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 2',
    cwd: 'C:\\apps\\task-management\\backend',
    interpreter: 'none',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PYTHONUNBUFFERED: '1'
    },
    error_file: 'logs\\backend-error.log',
    out_file: 'logs\\backend-out.log',
    log_file: 'logs\\backend-combined.log',
    time: true,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    merge_logs: true,
    // Restart on file changes (disabled in production)
    ignore_watch: ['node_modules', 'logs', 'uploads', '.git'],
    // Advanced settings
    min_uptime: '10s',
    max_restarts: 10,
    restart_delay: 4000
  }]
}

