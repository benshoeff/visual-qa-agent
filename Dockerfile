FROM mcr.microsoft.com/playwright:v1.44.0-focal AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --include=dev
COPY . .
RUN npm run build:client

FROM mcr.microsoft.com/playwright:v1.44.0-focal
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY . .
EXPOSE 10000
CMD ["npx", "tsx", "src/server.ts"]