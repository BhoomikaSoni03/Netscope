# Node.js — use alpine for small image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Install dependencies first (layer caching)
COPY package*.json ./
RUN npm install --omit=dev

# Copy source code
COPY . .

# Expose port
EXPOSE 5001

# Start the app
CMD ["node", "src/app.js"]
