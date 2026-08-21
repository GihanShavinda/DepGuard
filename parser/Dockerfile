# DepGuard parser service — Node 20, container host ready
FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY . .
# $PORT is provided by the platform (Render). Falls back to 3001 locally.
ENV PORT=3001
EXPOSE 3001
CMD ["node", "src/index.js"]
