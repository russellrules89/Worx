#!/bin/bash

# Exit script immediately if any individual command fails
set -e

echo "=========================================================="
echo " LAUNCHING PLATFORM ENGINE FOR RUSSELL STONE              "
echo " Target Administrative Node: russellrules89@gmail.com    "
echo "=========================================================="

# 1. Update system dependencies
echo "[1/5] Updating OS core libraries..."
sudo apt-get update -y && sudo apt-get upgrade -y
sudo apt-get install python3-pip python3-venv git curl -y

# 2. Establish isolated deployment directories
echo "[2/5] Setting up virtual environment..."
PROJECT_DIR="/opt/labor_backed_currency"
sudo mkdir -p $PROJECT_DIR
sudo chown -R $USER:$USER $PROJECT_DIR
cd $PROJECT_DIR

# 3. Write requirements package manifest
echo "[3/5] Pinning production package dependencies..."
cat << EOF > requirements.txt
Flask==3.0.2
stripe==8.3.0
PyJWT==2.8.0
web3==6.15.1
gunicorn==21.2.0
EOF

# Initialize and activate Python virtual environment
python3 -m venv venv
source venv/bin/activate
pip3 install --upgrade pip
pip3 install -r requirements.txt

# 4. Generate system service configuration daemon
echo "[4/5] Constructing systemd background runner service..."
sudo cat << EOF | sudo tee /etc/systemd/system/labor_platform.service
[Unit]
Description=Labor Backed Currency Backend Web Server
After=network.target

[Service]
User=$USER
WorkingDirectory=$PROJECT_DIR
ExecStart=$PROJECT_DIR/venv/bin/gunicorn --workers 3 --bind 0.0.0.0:4242 main:app
Restart=always

[Install]
WantedBy=multi-user.target
EOF

# 5. Reload processes and launch application server live
echo "[5/5] Executing live application reload..."
sudo systemctl daemon-reload
sudo systemctl enable labor_platform.service
sudo systemctl restart labor_platform.service

echo "=========================================================="
echo " DEPLOYMENT COMMAND ROUTINE COMPLETE                     "
echo " Live Engine Status: Running on Port 4242                "
echo " Verification Ping Active at: http://127.0.0.1:4242      "
echo "=========================================================="
