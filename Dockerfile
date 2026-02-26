FROM node:20-slim

# Install Chromium dependencies for Puppeteer
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-noto-cjk \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Tell Puppeteer to use installed Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Install dev dependencies for build, then build, then clean up
COPY . .
RUN npm ci && npm run build && npm prune --omit=dev

# Create data directory
RUN mkdir -p /app/data/logs

ENV NODE_ENV=production
ENV PORT=3211

EXPOSE 3211

VOLUME ["/app/data"]

CMD ["node", "server/index.js"]
