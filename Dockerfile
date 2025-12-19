FROM node:22

RUN apt-get update && apt-get install -y git

WORKDIR /app
COPY . .
RUN npm install

CMD ["node", "executor/ao.js"]
