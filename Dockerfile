# Stage 1: Node.js AO Executor
FROM node:22-slim AS node-builder

WORKDIR /app

# Install unzip for Monteur
RUN apt-get update && apt-get install -y unzip && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --only=production

COPY . .

# Extract Monteur zip
RUN if [ -f "sterkcalc-monteur.zip" ]; then \
        unzip -o sterkcalc-monteur.zip -d /app && rm sterkcalc-monteur.zip; \
    fi

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

# Maak __init__.py bestanden voor alle directories
RUN find /ai-engine/src -type d -exec touch {}/__init__.py \;

# Stage 3: Final image with both services
FROM debian:bookworm-slim

# Install Python, Node.js and shared dependencies
RUN apt-get update && apt-get install -y \
    python3.11 \
    python3-pip \
    nodejs \
    npm \
    poppler-utils \
    tesseract-ocr \
    tesseract-ocr-nld \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    curl \
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

# Create health check endpoint for Railway
RUN echo '#!/bin/bash\n\
if curl -f http://localhost:8000/health 2>/dev/null; then\n\
    exit 0\n\
elif curl -f http://localhost:3000/health 2>/dev/null; then\n\
    exit 0\n\
elif curl -f http://localhost:3000/ping 2>/dev/null; then\n\
    exit 0\n\
else\n\
    # Check if processes are running\n\
    if pgrep -f "src.main" > /dev/null || pgrep -f "ao.js" > /dev/null; then\n\
        exit 0\n\
    else\n\
        exit 1\n\
    fi\n\
fi' > /healthcheck.sh && chmod +x /healthcheck.sh

# Create improved start script
RUN echo '#!/bin/bash\n\
set -e\n\
\n\
echo "🚀 Starting SterkBouw Multi-Service Container"\n\
\n\
# Start AI Engine (Python) on port 8000\n\
echo "📡 Starting AI Engine on port 8000..."\n\
cd /ai-engine\n\
export PYTHONPATH=/ai-engine:$PYTHONPATH\n\
\n\
if [ -f "src/main.py" ]; then\n\
    python -m src.main --host 0.0.0.0 --port 8000 > /ai-logs/python.log 2>&1 &\n\
    AI_PID=$!\n\
    echo "✅ AI Engine started (PID: $AI_PID)"\n\
else\n\
    echo "❌ ERROR: src/main.py not found in /ai-engine/src/"\n\
    ls -la /ai-engine/src/\n\
    exit 1\n\
fi\n\
\n\
# Wait for AI Engine to start\n\
sleep 3\n\
\n\
# Start AO Executor (Node) on port 3000\n\
echo "🔧 Starting AO Executor on port 3000..."\n\
cd /app\n\
if [ -f "ao.js" ]; then\n\
    node ao.js > /ai-logs/node.log 2>&1 &\n\
    NODE_PID=$!\n\
    echo "✅ AO Executor started (PID: $NODE_PID)"\n\
else\n\
    echo "⚠️  WARNING: ao.js not found, skipping Node.js service"\n\
    NODE_PID=""\n\
fi\n\
\n\
echo "🎉 Container started successfully!"\n\
echo "📊 Ports: 8000 (AI Engine), 3000 (AO Executor)"\n\
\n\
# Keep container alive\n\
if [ -n "$NODE_PID" ]; then\n\
    wait $AI_PID $NODE_PID\n\
else\n\
    wait $AI_PID\n\
fi' > /start.sh && chmod +x /start.sh

# Expose both ports
EXPOSE 3000 8000

# Default command
CMD ["/start.sh"]
