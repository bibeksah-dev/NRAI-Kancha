#!/bin/bash

# NRAI Voice Assistant - Production Deployment Script
# Automated deployment with health checks and rollback support

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
APP_NAME="nrai-voice-assistant"
DEPLOY_ENV=${1:-production}
HEALTH_CHECK_URL="http://localhost:3001/api/health"
MAX_HEALTH_ATTEMPTS=10
HEALTH_CHECK_INTERVAL=5

# Functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_dependencies() {
    log_info "Checking dependencies..."
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed"
        exit 1
    fi
    
    # Check npm
    if ! command -v npm &> /dev/null; then
        log_error "npm is not installed"
        exit 1
    fi
    
    # Check PM2
    if ! command -v pm2 &> /dev/null; then
        log_warn "PM2 not found. Installing globally..."
        npm install -g pm2
    fi
    
    # Check Docker (optional)
    if command -v docker &> /dev/null; then
        log_info "Docker detected - container deployment available"
        DOCKER_AVAILABLE=true
    else
        log_warn "Docker not found - using PM2 deployment"
        DOCKER_AVAILABLE=false
    fi
    
    log_info "✓ All required dependencies found"
}

install_packages() {
    log_info "Installing npm packages..."
    
    # Clean install for production
    rm -rf node_modules package-lock.json
    
    if [ "$DEPLOY_ENV" = "production" ]; then
        npm ci --only=production
    else
        npm install
    fi
    
    log_info "✓ Packages installed"
}

setup_environment() {
    log_info "Setting up environment..."
    
    # Check for .env file
    if [ ! -f .env ]; then
        if [ -f .env.example ]; then
            log_warn ".env not found. Creating from .env.example..."
            cp .env.example .env
            log_error "Please edit .env with your Azure credentials before continuing"
            exit 1
        else
            log_error ".env file not found"
            exit 1
        fi
    fi
    
    # Load environment variables
    export $(cat .env | grep -v '^#' | xargs)
    
    # Validate required variables
    required_vars=("AZURE_AGENT_ENDPOINT" "AZURE_AGENT_ID" "AZURE_API_KEY" "AZURE_REGION")
    for var in "${required_vars[@]}"; do
        if [ -z "${!var}" ]; then
            log_error "Required environment variable $var is not set"
            exit 1
        fi
    done
    
    log_info "✓ Environment configured"
}

setup_ssl() {
    log_info "Setting up SSL certificates..."
    
    SSL_DIR="./ssl"
    
    if [ ! -d "$SSL_DIR" ]; then
        mkdir -p "$SSL_DIR"
    fi
    
    if [ ! -f "$SSL_DIR/cert.pem" ] || [ ! -f "$SSL_DIR/key.pem" ]; then
        log_warn "SSL certificates not found. Generating self-signed certificates..."
        
        openssl req -x509 -newkey rsa:4096 -keyout "$SSL_DIR/key.pem" -out "$SSL_DIR/cert.pem" \
            -days 365 -nodes -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"
        
        log_info "✓ Self-signed SSL certificates generated"
        log_warn "For production, replace with proper SSL certificates"
    else
        log_info "✓ SSL certificates found"
    fi
}

create_directories() {
    log_info "Creating necessary directories..."
    
    directories=("logs" "temp" "uploads" "backups")
    
    for dir in "${directories[@]}"; do
        if [ ! -d "$dir" ]; then
            mkdir -p "$dir"
            log_info "  Created: $dir/"
        fi
    done
    
    log_info "✓ Directories ready"
}

backup_current() {
    log_info "Creating backup of current deployment..."
    
    BACKUP_DIR="./backups/backup_$(date +%Y%m%d_%H%M%S)"
    
    if pm2 list | grep -q "$APP_NAME"; then
        mkdir -p "$BACKUP_DIR"
        
        # Save PM2 configuration
        pm2 save
        
        # Backup important files
        cp -r public "$BACKUP_DIR/" 2>/dev/null || true
        cp -r services "$BACKUP_DIR/" 2>/dev/null || true
        cp *.js "$BACKUP_DIR/" 2>/dev/null || true
        cp .env "$BACKUP_DIR/" 2>/dev/null || true
        
        log_info "✓ Backup created at: $BACKUP_DIR"
    else
        log_info "No existing deployment to backup"
    fi
}

deploy_with_pm2() {
    log_info "Deploying with PM2..."
    
    # Stop existing instances
    pm2 delete "$APP_NAME" 2>/dev/null || true
    
    # Start new deployment
    if [ "$DEPLOY_ENV" = "production" ]; then
        pm2 start ecosystem.config.js --env production
    else
        pm2 start ecosystem.config.js --env development
    fi
    
    # Save PM2 configuration
    pm2 save
    
    # Setup PM2 startup script
    pm2 startup systemd -u $USER --hp $HOME 2>/dev/null || true
    
    log_info "✓ Application deployed with PM2"
}

deploy_with_docker() {
    log_info "Deploying with Docker..."
    
    # Stop existing containers
    docker-compose down 2>/dev/null || true
    
    # Build and start containers
    if [ "$DEPLOY_ENV" = "production" ]; then
        docker-compose up -d --build
    else
        docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
    fi
    
    log_info "✓ Application deployed with Docker"
}

health_check() {
    log_info "Performing health check..."
    
    attempt=1
    while [ $attempt -le $MAX_HEALTH_ATTEMPTS ]; do
        log_info "  Attempt $attempt/$MAX_HEALTH_ATTEMPTS..."
        
        if curl -f -s "$HEALTH_CHECK_URL" > /dev/null 2>&1; then
            log_info "✓ Health check passed!"
            return 0
        fi
        
        sleep $HEALTH_CHECK_INTERVAL
        attempt=$((attempt + 1))
    done
    
    log_error "Health check failed after $MAX_HEALTH_ATTEMPTS attempts"
    return 1
}

rollback() {
    log_error "Deployment failed. Rolling back..."
    
    # Find latest backup
    LATEST_BACKUP=$(ls -td backups/backup_* 2>/dev/null | head -1)
    
    if [ -n "$LATEST_BACKUP" ] && [ -d "$LATEST_BACKUP" ]; then
        log_info "Restoring from: $LATEST_BACKUP"
        
        # Stop current deployment
        pm2 delete "$APP_NAME" 2>/dev/null || true
        
        # Restore files
        cp -r "$LATEST_BACKUP"/* . 2>/dev/null || true
        
        # Restart previous version
        pm2 restart "$APP_NAME" || pm2 start ecosystem.config.js
        
        log_info "✓ Rollback completed"
    else
        log_error "No backup found for rollback"
    fi
}

setup_monitoring() {
    log_info "Setting up monitoring..."
    
    # PM2 monitoring
    pm2 install pm2-logrotate
    pm2 set pm2-logrotate:max_size 10M
    pm2 set pm2-logrotate:retain 7
    
    # Setup cron for auto-cleanup
    (crontab -l 2>/dev/null; echo "0 2 * * * cd $PWD && npm run cleanup") | crontab -
    
    log_info "✓ Monitoring configured"
}

show_status() {
    log_info "Deployment Status:"
    echo ""
    
    # PM2 status
    pm2 list
    
    echo ""
    log_info "Application URLs:"
    echo "  Main App:  http://localhost:3001"
    echo "  Dashboard: http://localhost:3001/dashboard.html"
    echo "  Health:    http://localhost:3001/api/health"
    echo "  Metrics:   http://localhost:3001/api/metrics"
    
    if [ "$DOCKER_AVAILABLE" = true ]; then
        echo ""
        log_info "Docker Containers:"
        docker-compose ps
    fi
    
    echo ""
    log_info "Logs:"
    echo "  PM2 logs:     pm2 logs"
    echo "  PM2 monitor:  pm2 monit"
}

# Main deployment process
main() {
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║     NRAI Voice Assistant - Production Deployment Script     ║"
    echo "╚════════════════════════════════════════════════════════════╝"
    echo ""
    log_info "Deployment Environment: $DEPLOY_ENV"
    echo ""
    
    # Pre-deployment checks
    check_dependencies
    setup_environment
    
    # Backup current deployment
    backup_current
    
    # Setup
    install_packages
    create_directories
    setup_ssl
    
    # Deploy
    if [ "$DOCKER_AVAILABLE" = true ] && [ "$DEPLOY_ENV" = "production" ]; then
        deploy_with_docker
    else
        deploy_with_pm2
    fi
    
    # Post-deployment
    if health_check; then
        setup_monitoring
        show_status
        
        echo ""
        log_info "🎉 Deployment successful!"
    else
        rollback
        exit 1
    fi
}

# Run main function
main

# Additional commands
echo ""
log_info "Useful Commands:"
echo "  Start:    pm2 start $APP_NAME"
echo "  Stop:     pm2 stop $APP_NAME"
echo "  Restart:  pm2 restart $APP_NAME"
echo "  Logs:     pm2 logs $APP_NAME"
echo "  Monitor:  pm2 monit"
echo "  Scale:    pm2 scale $APP_NAME 4"
