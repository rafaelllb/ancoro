# Multi-stage build for Ancoro Frontend
# Stage 1: Build the application
FROM node:18-slim AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code and config files
COPY . .

# Build argument for environment (default: demo)
ARG BUILD_MODE=demo
ARG VITE_API_URL
ARG VITE_APP_ENV=demo
ARG VITE_DEMO_MODE=true
ARG VITE_SHOW_ENV_INDICATOR=true

# Create .env file from build args (Vite needs this at build time)
RUN echo "VITE_API_URL=${VITE_API_URL}" > .env && \
    echo "VITE_APP_ENV=${VITE_APP_ENV}" >> .env && \
    echo "VITE_DEMO_MODE=${VITE_DEMO_MODE}" >> .env && \
    echo "VITE_SHOW_ENV_INDICATOR=${VITE_SHOW_ENV_INDICATOR}" >> .env

# Build the application (skip electron compilation, just Vite build)
RUN npx vite build --mode ${BUILD_MODE}

# Stage 2: Serve with nginx
FROM nginx:alpine

# Copy built assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 80
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
