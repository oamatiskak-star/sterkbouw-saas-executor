FROM node:22

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# ⬇️ DIT IS DE FIX
COPY executor/pdf /app/pdf

CMD ["node", "ao.js"]
