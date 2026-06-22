FROM mcr.microsoft.com/playwright:v1.44.0-focal

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

RUN npm run build:client

EXPOSE 10000

CMD ["npx", "tsx", "src/server.ts"]
