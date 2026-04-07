#!/bin/bash
set -e
exec > /var/log/stakeholdersim-setup.log 2>&1

# Install Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs nginx certbot python3-certbot-nginx sqlite3

# Install PM2
npm install -g pm2

# Create app directory
mkdir -p /opt/stakeholdersim
mkdir -p /var/log/stakeholdersim
chown -R ubuntu:ubuntu /opt/stakeholdersim /var/log/stakeholdersim

# Configure Nginx
cat > /etc/nginx/sites-available/stakeholdersim << 'NGINX'
server {
    listen 80;
    server_name _;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;

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
        proxy_buffering off;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/stakeholdersim /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx
systemctl enable nginx

echo "=== Base setup complete — app will be deployed manually with .env ==="
