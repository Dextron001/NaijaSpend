# Build stage for client
FROM node:22-alpine AS client-builder

WORKDIR /app/client
ENV NODE_OPTIONS=--max-old-space-size=1536

# Copy client package files
COPY client/package.json client/package-lock.json ./

# Install client dependencies
RUN npm ci --only=production

# Copy client source files
COPY client/ ./

# Build the client
RUN npm run build

# Production stage
FROM node:22-alpine AS production

WORKDIR /app

# Copy server package files
COPY server/package.json server/package-lock.json ./
COPY package.json package-lock.json ./

# Install server dependencies
RUN npm ci --only=production

# Copy server source files
COPY server/ ./server/

# Copy built client files to server/public
COPY --from=client-builder /app/client/dist ./server/public/

# Create data directory
RUN mkdir -p ./server/data

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Expose port
EXPOSE 3000

# Start the server
CMD ["node", "server/index.js"]
