# 🚀 NRAI Voice Assistant - Deployment Guide

## Deployment Options

### Option 1: Direct Node.js Deployment

#### Prerequisites
- Node.js 18+ installed
- PM2 for process management (optional)
- NGINX for reverse proxy (optional)

#### Steps

1. **Clone the repository**
```bash
git clone https://github.com/your-org/nrai-voice-assistant.git
cd nrai-voice-assistant
```

2. **Install dependencies**
```bash
npm ci --only=production
```

3. **Configure environment**
```bash
cp .env.example .env
# Edit .env with your Azure credentials
nano .env
```

4. **Start with PM2** (recommended for production)
```bash
# Install PM2 globally
npm install -g pm2

# Start application
pm2 start server.js --name nrai-voice-assistant

# Save PM2 configuration
pm2 save

# Set up PM2 to start on boot
pm2 startup
```

5. **Configure NGINX** (optional)
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Option 2: Docker Deployment

#### Prerequisites
- Docker and Docker Compose installed

#### Steps

1. **Clone the repository**
```bash
git clone https://github.com/your-org/nrai-voice-assistant.git
cd nrai-voice-assistant
```

2. **Configure environment**
```bash
cp .env.example .env
# Edit .env with your Azure credentials
nano .env
```

3. **Build and run with Docker Compose**
```bash
# Build and start
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

### Option 3: Azure App Service Deployment

#### Prerequisites
- Azure CLI installed
- Azure subscription

#### Steps

1. **Create Azure resources**
```bash
# Login to Azure
az login

# Create resource group
az group create --name nrai-rg --location eastus

# Create App Service plan
az appservice plan create \
  --name nrai-plan \
  --resource-group nrai-rg \
  --sku B1 \
  --is-linux

# Create Web App
az webapp create \
  --resource-group nrai-rg \
  --plan nrai-plan \
  --name nrai-voice-assistant \
  --runtime "NODE|18-lts"
```

2. **Configure application settings**
```bash
az webapp config appsettings set \
  --resource-group nrai-rg \
  --name nrai-voice-assistant \
  --settings \
    AZURE_AGENT_ENDPOINT="your-endpoint" \
    AZURE_AGENT_ID="your-agent-id" \
    AZURE_API_KEY="your-api-key" \
    AZURE_REGION="swedencentral" \
    NODE_ENV="production"
```

3. **Deploy using Git**
```bash
# Configure deployment credentials
az webapp deployment user set \
  --user-name <username> \
  --password <password>

# Get Git URL
az webapp deployment source config-local-git \
  --resource-group nrai-rg \
  --name nrai-voice-assistant

# Add Azure remote and push
git remote add azure <git-url-from-previous-command>
git push azure main
```

## SSL/HTTPS Configuration

### For production deployment, HTTPS is required for:
- Microphone access in browsers
- Secure API communication
- Better SEO and trust

### Using Let's Encrypt with Certbot

1. **Install Certbot**
```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install certbot python3-certbot-nginx

# CentOS/RHEL
sudo yum install certbot python3-certbot-nginx
```

2. **Obtain certificate**
```bash
sudo certbot --nginx -d your-domain.com
```

3. **Auto-renewal**
```bash
# Test renewal
sudo certbot renew --dry-run

# Add to crontab for auto-renewal
0 0,12 * * * /usr/bin/certbot renew --quiet
```

## Monitoring and Logging

### Health Monitoring

1. **UptimeRobot** - Free monitoring service
   - Add monitor for: https://your-domain.com/api/health
   - Set check interval: 5 minutes
   - Alert contacts: Your email/SMS

2. **Azure Application Insights** (if using Azure)
```javascript
// Add to server.js
import { ApplicationInsights } from '@azure/monitor-opentelemetry-node';

const appInsights = new ApplicationInsights({
  connectionString: process.env.APPLICATIONINSIGHTS_CONNECTION_STRING
});
appInsights.start();
```

### Log Management

1. **PM2 Logs**
```bash
# View logs
pm2 logs nrai-voice-assistant

# Clear logs
pm2 flush

# Log rotation
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

2. **Docker Logs**
```bash
# View logs
docker-compose logs -f

# Export logs
docker-compose logs > logs.txt
```

## Performance Optimization

### 1. Enable Gzip Compression
```javascript
// Add to server.js
import compression from 'compression';
app.use(compression());
```

### 2. Static File Caching
```nginx
location ~* \.(css|js|jpg|jpeg|png|gif|ico|svg)$ {
    expires 30d;
    add_header Cache-Control "public, immutable";
}
```

### 3. CDN Configuration
- Use CloudFlare or Azure CDN for static assets
- Configure cache rules for /public directory

### 4. Database Connection Pooling (if using database)
```javascript
const pool = {
    min: 2,
    max: 10,
    idleTimeoutMillis: 30000
};
```

## Security Hardening

### 1. Security Headers
```javascript
import helmet from 'helmet';
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
        },
    },
}));
```

### 2. Rate Limiting
```javascript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
});

app.use('/api', limiter);
```

### 3. Input Validation
```javascript
import { body, validationResult } from 'express-validator';

app.post('/api/chat', [
    body('message').isString().isLength({ min: 1, max: 1000 }),
    body('sessionId').optional().isUUID()
], (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    // Process request
});
```

## Backup and Recovery

### 1. Session Data Backup
```bash
# Backup sessions (if using Redis)
redis-cli --rdb /backup/sessions.rdb

# Restore
redis-cli --rdb /backup/sessions.rdb
```

### 2. Configuration Backup
```bash
# Backup script
#!/bin/bash
DATE=$(date +%Y%m%d)
tar -czf backup-$DATE.tar.gz .env docker-compose.yml
aws s3 cp backup-$DATE.tar.gz s3://your-backup-bucket/
```

## Scaling Strategies

### Horizontal Scaling

1. **Load Balancer Configuration**
```nginx
upstream nrai_backend {
    least_conn;
    server 127.0.0.1:3001;
    server 127.0.0.1:3002;
    server 127.0.0.1:3003;
}

server {
    location / {
        proxy_pass http://nrai_backend;
    }
}
```

2. **Docker Swarm**
```bash
# Initialize swarm
docker swarm init

# Deploy stack
docker stack deploy -c docker-compose.yml nrai

# Scale service
docker service scale nrai_nrai-voice-assistant=3
```

### Vertical Scaling

- Increase server resources (CPU/RAM)
- Optimize Node.js memory limits:
```bash
node --max-old-space-size=4096 server.js
```

## Troubleshooting

### Common Issues

1. **Port already in use**
```bash
# Find process using port
lsof -i :3001
# Kill process
kill -9 <PID>
```

2. **Memory leaks**
```bash
# Monitor memory usage
pm2 monit

# Heap snapshot
node --inspect server.js
```

3. **SSL certificate issues**
```bash
# Check certificate
openssl s_client -connect your-domain.com:443 -servername your-domain.com

# Renew certificate
certbot renew --force-renewal
```

## Maintenance

### Regular Tasks

- **Daily**: Check health endpoint, review error logs
- **Weekly**: Review performance metrics, check disk space
- **Monthly**: Update dependencies, review security alerts
- **Quarterly**: Full backup, disaster recovery test

### Update Procedure

1. **Test in staging**
```bash
git checkout -b staging
npm update
npm test
```

2. **Deploy with zero downtime**
```bash
# Using PM2
pm2 reload nrai-voice-assistant

# Using Docker
docker-compose up -d --no-deps --build nrai-voice-assistant
```

## Support

For issues or questions:
- Check logs: `pm2 logs` or `docker-compose logs`
- Health status: `curl http://localhost:3001/api/health`
- Documentation: [README.md](README.md)
- Issues: GitHub Issues

---

**Remember**: Always test in staging before deploying to production! 🚀