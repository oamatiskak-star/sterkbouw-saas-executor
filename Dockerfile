FROM node:22

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# ⬇️ BESTAAND – PDF map
COPY executor/pdf /app/pdf

# ⬇️ TOEGEVOEGD – MONTEUR ZIP UITPAKKEN
RUN unzip -o sterkcalc-monteur.zip -d /app/monteur

CMD ["node", "ao.js"]
