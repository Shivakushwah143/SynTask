/**
 * PM2 Ecosystem Configuration for Frontend
 * Production-ready configuration for React frontend
 */
module.exports = {
  apps: [{
    name: 'task-management-frontend',
    // Run Node directly instead of a PowerShell wrapper.
    // This is more stable and avoids the "ENOTFOUND -l" errors
    // coming from `npx serve -l 3000` inside PowerShell.
    script: 'server.js',
    cwd: 'C:\\apps\\task-management\\frontend',
    interpreter: 'node',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: 'logs\\frontend-error.log',
    out_file: 'logs\\frontend-out.log',
    log_file: 'logs\\frontend-combined.log',
    time: true,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    merge_logs: true,
    // Advanced settings
    min_uptime: '10s',
    max_restarts: 10,
    restart_delay: 4000
  }]
}

