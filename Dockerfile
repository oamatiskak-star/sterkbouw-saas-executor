FROM node:22

WORKDIR /app

COPY package*.json ./
RUN npm install

# Kopieer ALLES (inclusief zip)
COPY . .

# ⬇️ MONTEUR ZIP UITPAKKEN (DIT ONTBRAK)
RUN apt-get update \
 && apt-get install -y unzip \
 && unzip -o sterkcalc-monteur.zip -d /app/monteur \
 && rm sterkcalc-monteur.zip

CMD ["node", "ao.js"]
