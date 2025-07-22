FROM node:18-alpine

WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install dependencies using npm install instead of npm ci
# since we don't have a package-lock.json file
RUN npm install --only=production

# Copy all source files
COPY . .

# Build the Next.js application
RUN npm run build

# Expose port 7860 (required for HuggingFace Spaces)
EXPOSE 7860

# Start the application on port 7860
CMD ["npm", "start", "--", "-p", "7860"]
