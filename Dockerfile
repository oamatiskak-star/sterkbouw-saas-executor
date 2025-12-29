# Stage 1: Node.js AO Executor
FROM node:22-slim AS node-builder

WORKDIR /app

# Install unzip for Monteur
RUN apt-get update && apt-get install -y unzip && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install

COPY . .

# Extract Monteur zip
RUN unzip -o sterkcalc-monteur.zip -d /app && rm sterkcalc-monteur.zip

# Stage 2: Python AI Engine
FROM python:3.11-slim AS python-builder

WORKDIR /ai-engine

# Install system dependencies for AI engine 
RUN apt-get update && apt-get install -y \
    poppler-utils \
    tesseract-ocr \
    tesseract-ocr-nld \
    libgl1 \                   
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libmagic-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY src/ ./src/

# FIX: Maak __init__.py bestanden voor alle directories
RUN find /ai-engine/src -type d -exec touch {}/__init__.py \;

# Stage 3: Final image with both services
FROM node:22-slim

# Install Python and shared dependencies
RUN apt-get update && apt-get install -y \
    python3.11 \
    python3-pip \
    python3-venv \
    python3-full \
    poppler-utils \
    tesseract-ocr \
    tesseract-ocr-nld \
    libgl1 \                    
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy Node.js AO Executor from stage 1
COPY --from=node-builder /app /app

# Copy Python AI Engine from stage 2
COPY --from=python-builder /ai-engine /ai-engine

# Create directories for AI Engine
RUN mkdir -p /tmp/uploads /tmp/processed /tmp/cache /ai-logs

# Install Python dependencies in final image
RUN pip3 install --break-system-packages --no-cache-dir -r /ai-engine/requirements.txt

# Create start script
RUN echo '#!/bin/bash\n\
set -e\n\
echo "🚀 Starting SterkBouw Multi-Service Container"\n\
\n\
# Start AI Engine (Python) on port 8000\n\
echo "Starting AI Engine on port 8000..."\n\
cd /ai-engine\n\
export PYTHONPATH=/ai-engine:$PYTHONPATH\n\
python -m src.main --host 0.0.0.0 --port 8000 &\n\
AI_PID=\$!\n\
\n\
# Wait for AI Engine to start\n\
sleep 5\n\
\n\
# Start AO Executor (Node) on port 3000\n\
echo "Starting AO Executor on port 3000..."\n\
cd /app\n\
node ao.js &\n\
NODE_PID=\$!\n\
\n\
# Wait for both processes\n\
trap "kill \$AI_PID \$NODE_PID" EXIT\n\
wait \$AI_PID \$NODE_PID\n\
' > /start.sh && chmod +x /start.sh

# Expose both ports
EXPOSE 3000 8000

# Health check for AO Executor
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/ping', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start both services
CMD ["/start.sh"]
