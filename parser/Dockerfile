# DepGuard parser service — Node 20
FROM node:20-alpine

WORKDIR /app

# Install deps first (better layer caching)
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# Copy source
COPY src ./src

ENV PARSER_PORT=3001
EXPOSE 3001

CMD ["node", "src/index.js"]
