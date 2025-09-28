/**
 * PM2 Ecosystem Configuration
 * For production deployment with clustering and monitoring
 */

module.exports = {
  apps: [
    {
      name: 'nrai-voice-assistant',
      script: './server-optimized.js',
      
      // Clustering
      instances: 'max', // Use all available CPU cores
      exec_mode: 'cluster',
      
      // Memory Management
      max_memory_restart: '450M', // Restart if memory exceeds 450MB
      
      // Logging
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: './logs/error.log',
      out_file: './logs/out.log',
      merge_logs: true,
      
      // Environment Variables
      env: {
        NODE_ENV: 'production',
        PORT: 3001
      },
      
      // Development Environment
      env_development: {
        NODE_ENV: 'development',
        PORT: 3001,
        LOG_LEVEL: 'debug'
      },
      
      // Production Environment
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001,
        LOG_LEVEL: 'info'
      },
      
      // Auto-restart
      autorestart: true,
      watch: false, // Set to true in development
      
      // Graceful Shutdown
      kill_timeout: 5000,
      listen_timeout: 3000,
      
      // Monitoring
      min_uptime: '10s',
      max_restarts: 10,
      
      // Node.js Arguments
      node_args: '--expose-gc', // Enable manual garbage collection
      
      // Advanced Features
      wait_ready: true,
      shutdown_with_message: true,
      
      // Health Check
      health_check: {
        interval: 30000, // 30 seconds
        url: 'http://localhost:3001/api/health',
        max_consecutive_failures: 3
      }
    },
    
    // Optional: Monitoring Dashboard as separate process
    {
      name: 'nrai-monitor',
      script: './monitor-server.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      env: {
        NODE_ENV: 'production',
        PORT: 3002
      }
    }
  ],
  
  // Deploy Configuration (optional)
  deploy: {
    production: {
      user: 'deploy',
      host: 'your-server.com',
      ref: 'origin/main',
      repo: 'https://github.com/your-repo/nrai-voice-assistant.git',
      path: '/var/www/nrai-voice-assistant',
      'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env production',
      'pre-deploy-local': 'npm test'
    }
  }
};
