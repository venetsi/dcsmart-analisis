FROM node:20-slim
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY index.js ./
COPY lib/ ./lib/
COPY reglas/ ./reglas/
COPY series/ ./series/
CMD ["node", "index.js"]
