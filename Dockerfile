FROM node:22-slim AS node-builder

WORKDIR /app

RUN apt-get update && apt-get install -y unzip && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --only=production

COPY . .

RUN if [ -f "sterkcalc-monteur.zip" ]; then unzip -o sterkcalc-monteur.zip -d /app && rm sterkcalc-monteur.zip; fi

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

RUN find /ai-engine/src -type d -exec touch {}/__init__.py \;

FROM python:3.11-slim

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

WORKDIR /app

COPY --from=node-builder /app /app
COPY --from=python-builder /ai-engine /ai-engine
COPY --from=node-builder /usr/local/bin/node /usr/local/bin/node

CMD ["node", "executor.js"]
