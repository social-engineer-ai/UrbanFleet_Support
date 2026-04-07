#!/bin/bash
# StakeholderSim — EC2 Server Setup Script
# Run this on a fresh Ubuntu 22.04/24.04 EC2 instance
# Usage: sudo bash setup-server.sh

set -e

echo "=== StakeholderSim Server Setup ==="

# Update system
echo "--- Updating system packages ---"
apt-get update && apt-get upgrade -y

# Install Node.js 22 LTS
echo "--- Installing Node.js 22 ---"
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs

# Install PM2 globally
echo "--- Installing PM2 ---"
npm install -g pm2

# Install Nginx
echo "--- Installing Nginx ---"
apt-get install -y nginx

# Install certbot for SSL
echo "--- Installing Certbot ---"
apt-get install -y certbot python3-certbot-nginx

# Create app directory
echo "--- Setting up app directory ---"
mkdir -p /opt/stakeholdersim
mkdir -p /var/log/stakeholdersim
chown -R ubuntu:ubuntu /opt/stakeholdersim /var/log/stakeholdersim

# Configure Nginx (HTTP only initially — SSL added after domain setup)
echo "--- Configuring Nginx ---"
cat > /etc/nginx/sites-available/stakeholdersim << 'NGINX'
server {
    listen 80;
    server_name _;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Proxy to Next.js
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # SSE (streaming) support — no buffering, long timeout
        proxy_buffering off;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }

    # Health check
    location /api/health {
        proxy_pass http://127.0.0.1:3000;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/stakeholdersim /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Increase Nginx worker connections for concurrent users
cat > /etc/nginx/conf.d/performance.conf << 'PERF'
# Handle 80+ concurrent connections
worker_connections 1024;

# Keep-alive
keepalive_timeout 65;

# Gzip
gzip on;
gzip_vary on;
gzip_min_length 1000;
gzip_types text/plain text/css application/json application/javascript text/xml;
PERF

nginx -t && systemctl restart nginx
systemctl enable nginx

# Configure PM2 startup
sudo -u ubuntu pm2 startup systemd -u ubuntu --hp /home/ubuntu
systemctl enable pm2-ubuntu

# Open firewall
echo "--- Configuring firewall ---"
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

echo ""
echo "=== Server setup complete ==="
echo ""
echo "Next steps:"
echo "1. Clone the repo: cd /opt/stakeholdersim && git clone https://github.com/social-engineer-ai/UrbanFleet_Support.git ."
echo "2. Create .env file (see deploy/env.example)"
echo "3. Run: bash deploy/deploy.sh"
echo "4. For SSL: sudo certbot --nginx -d yourdomain.com"
echo ""
