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

# FIX: Maak __init__.py bestanden
RUN find /ai-engine/src -type d -exec touch {}/__init__.py \;

# Stage 3: Final image
FROM node:22-slim

# Installeer Python in de finale image
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

# Copy from builders
COPY --from=node-builder /app /app
COPY --from=python-builder /ai-engine /ai-engine

RUN mkdir -p /tmp/uploads /tmp/processed /tmp/cache /ai-logs

# Installeer Python dependencies in de finale image
RUN pip3 install --break-system-packages --no-cache-dir -r /ai-engine/requirements.txt

# Maak start script
RUN echo '#!/bin/bash\n\
set -e\n\
echo "🚀 Starting SterkBouw Multi-Service Container"\n\
\n\
# Start AI Engine\n\
echo "Starting AI Engine on port 8000..."\n\
cd /ai-engine\n\
export PYTHONPATH=/ai-engine:$PYTHONPATH\n\
python -m src.main --host 0.0.0.0 --port 8000 &\n\
AI_PID=$!\n\
\n\
sleep 5\n\
\n\
# Start AO Executor\n\
echo "Starting AO Executor on port 3000..."\n\
cd /app\n\
if [ -f "ao.js" ]; then\n\
    node ao.js &\n\
    NODE_PID=$!\n\
    echo "AO Executor started"\n\
else\n\
    echo "⚠️  ao.js not found, continuing without AO Executor"\n\
    NODE_PID=""\n\
fi\n\
\n\
# Wait for processes\n\
if [ -n "$NODE_PID" ]; then\n\
    wait $AI_PID $NODE_PID\n\
else\n\
    wait $AI_PID\n\
fi\n\
' > /start.sh && chmod +x /start.sh

EXPOSE 3000 8000
CMD ["/start.sh"]
