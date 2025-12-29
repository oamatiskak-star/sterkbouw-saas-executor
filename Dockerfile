# Stage 1: Node.js AO Executor
FROM node:22-slim AS node-builder

WORKDIR /app

RUN apt-get update && apt-get install -y unzip && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm install
COPY . .
RUN unzip -o sterkcalc-monteur.zip -d /app && rm sterkcalc-monteur.zip

# Stage 2: Python AI Engine
FROM python:3.11-slim AS python-builder

WORKDIR /ai-engine

RUN apt-get update && apt-get install -y \
    poppler-utils tesseract-ocr tesseract-ocr-nld \
    libgl1 libglib2.0-0 libsm6 libxext6 libxrender-dev \
    libmagic-dev && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY src/ ./src/

# KRITIEKE FIX: Maak __init__.py bestanden
RUN find /ai-engine/src -type d -exec touch {}/__init__.py \;

# Stage 3: Final image met beide services
FROM node:22-slim

RUN apt-get update && apt-get install -y \
    python3.11 python3-pip python3-venv python3-full \
    poppler-utils tesseract-ocr tesseract-ocr-nld \
    libgl1 libglib2.0-0 libsm6 libxext6 libxrender-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=node-builder /app /app
COPY --from=python-builder /ai-engine /ai-engine

RUN mkdir -p /tmp/uploads /tmp/processed /tmp/cache /ai-logs
RUN pip3 install --break-system-packages --no-cache-dir -r /ai-engine/requirements.txt

# CORRECT START SCRIPT - gebruik cat i.p.v. echo met multiline
RUN cat > /start.sh << 'EOF'
#!/bin/bash
set -e

echo "🚀 Starting SterkBouw Multi-Service Container"

# Start AI Engine
echo "Starting AI Engine on port 8000..."
cd /ai-engine
export PYTHONPATH=/ai-engine:$PYTHONPATH
python -m src.main --host 0.0.0.0 --port 8000 &
AI_PID=$!

# Wacht tot AI Engine start
sleep 5

# Start AO Executor
echo "Starting AO Executor on port 3000..."
cd /app
if [ -f "ao.js" ]; then
    node ao.js &
    NODE_PID=$!
    echo "AO Executor started"
else
    echo "⚠️  ao.js not found, continuing without AO Executor"
    NODE_PID=""
fi

# Wacht op beide processen
if [ -n "$NODE_PID" ]; then
    wait $AI_PID $NODE_PID
else
    wait $AI_PID
fi
EOF

RUN chmod +x /start.sh

EXPOSE 3000 8000
CMD ["/start.sh"]
