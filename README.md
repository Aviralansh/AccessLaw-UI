---
title: AccessLaw RAG Chat
emoji: ⚖️
colorFrom: black
colorTo: white
sdk: docker
app_port: 7860
pinned: false
license: mit
---

# AccessLaw RAG Chat

A professional retro-themed chat application for legal document search and analysis using RAG (Retrieval-Augmented Generation) with OpenRouter's DeepSeek model.

## Features

- 🔍 **RAG Integration**: Connects to HuggingFace RAG API for legal document search
- 🤖 **AI Responses**: Streaming responses from OpenRouter's DeepSeek model
- 🎨 **Retro Theme**: Professional black/white design with monospace fonts
- 🌙 **Dark Mode**: Toggle between light and dark themes
- ⚙️ **Configurable**: Adjustable query parameters (top_k, rerank, scores)
- 📊 **Performance Metrics**: Shows RAG and total response times
- 📚 **Source Citations**: Displays legal sources with metadata
- 📱 **Responsive**: Works on all screen sizes

## Usage

1. Enter your legal question in the chat input
2. Adjust query parameters in the settings panel if needed
3. View streaming AI responses with source citations
4. Toggle between light and dark modes
5. Monitor response times and performance metrics

## Configuration

The application requires the following environment variables:
- `OPENROUTER_API_KEY`: Your OpenRouter API key for AI responses
- `NEXT_PUBLIC_SITE_URL`: The URL of your deployed application

## Technology Stack

- **Frontend**: Next.js 14 with TypeScript
- **Styling**: Tailwind CSS with custom retro theme
- **AI Integration**: OpenRouter API with DeepSeek model
- **RAG**: Custom HuggingFace API for legal document search
- **Markdown**: React Markdown for formatted responses

## License

MIT License - feel free to modify and use for your projects.
\`\`\`

```markdown type="markdown" project="undefined" file="HUGGINGFACE_DEPLOYMENT_GUIDE.md"
[v0-no-op-code-block-prefix]# Complete HuggingFace Spaces Deployment Guide

This guide will walk you through deploying the AccessLaw RAG Chat application to HuggingFace Spaces step by step.

## Prerequisites

Before starting, make sure you have:
- A HuggingFace account (free)
- An OpenRouter API key
- Git installed on your computer (optional but recommended)
- The project files ready

## Step 1: Create HuggingFace Account

1. **Go to HuggingFace**
   - Visit [https://huggingface.co](https://huggingface.co)
   - Click "Sign Up" in the top right corner

2. **Complete Registration**
   - Enter your email, username, and password
   - Verify your email address
   - Complete your profile setup

## Step 2: Get OpenRouter API Key

1. **Visit OpenRouter**
   - Go to [https://openrouter.ai](https://openrouter.ai)
   - Click "Sign In" or "Get Started"

2. **Create Account/Login**
   - Sign up with Google, GitHub, or email
   - Complete the registration process

3. **Get API Key**
   - Once logged in, go to your dashboard
   - Click on "API Keys" or "Keys" section
   - Click "Create Key" or "New Key"
   - Copy the API key (starts with `sk-or-v1-...`)
   - **IMPORTANT**: Save this key securely - you won't see it again!

## Step 3: Create New HuggingFace Space

1. **Navigate to Spaces**
   - Go to [https://huggingface.co/spaces](https://huggingface.co/spaces)
   - Click the "Create new Space" button

2. **Configure Your Space**
   - **Space name**: Enter `legal-rag-chat` (or your preferred name)
   - **License**: Choose "MIT" (recommended)
   - **Select the SDK**: Choose "Docker" (very important!)
   - **Hardware**: Select "CPU basic" (free tier)
   - **Visibility**: Choose "Public" or "Private" based on your preference
   - Click "Create Space"

3. **Initial Setup Complete**
   - You'll be redirected to your new Space
   - You'll see a mostly empty repository with just a README.md

## Step 4: Prepare Project Files

Create a new folder on your computer for the deployment and add these files:

### 4.1 Create package.json
\`\`\`json
{
  "name": "legal-rag-chat",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "next": "14.0.0",
    "react": "^18",
    "react-dom": "^18",
    "react-markdown": "^9.0.1",
    "@types/node": "^20",
    "@types/react": "^18",
    "@types/react-dom": "^18",
    "autoprefixer": "^10.0.1",
    "postcss": "^8",
    "tailwindcss": "^3.3.0",
    "typescript": "^5",
    "lucide-react": "^0.294.0",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.0.0",
    "tailwind-merge": "^2.0.0"
  }
}
\`\`\`

### 4.2 Create Dockerfile
\`\`\`dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy all source files
COPY . .

# Build the Next.js application
RUN npm run build

# Expose port 7860 (required for HuggingFace Spaces)
EXPOSE 7860

# Start the application on port 7860
CMD ["npm", "start", "--", "-p", "7860"]
\`\`\`

### 4.3 Create requirements.txt
\`\`\`txt
# This file is required for HuggingFace Spaces Docker deployment
# Actual dependencies are managed by package.json for Node.js applications
\`\`\`

### 4.4 Create next.config.js
\`\`\`javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  experimental: {
    serverComponentsExternalPackages: [],
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

module.exports = nextConfig
\`\`\`

### 4.5 Create .dockerignore
\`\`\`
node_modules
.next
.git
.env*
README.md
.dockerignore
Dockerfile
\`\`\`

### 4.6 Create README.md with HuggingFace Configuration

Create a `README.md` file with the required HuggingFace frontmatter:

\`\`\`markdown
---
title: AccessLaw RAG Chat
emoji: ⚖️
colorFrom: black
colorTo: white
sdk: docker
app_port: 7860
pinned: false
license: mit
---

# AccessLaw RAG Chat

A professional retro-themed chat application for legal document search and analysis using RAG (Retrieval-Augmented Generation) with OpenRouter's DeepSeek model.

## Features

- 🔍 RAG Integration for legal document search
- 🤖 Streaming AI responses
- 🎨 Professional retro theme
- 🌙 Dark mode support
- ⚙️ Configurable query parameters
- 📊 Performance metrics
- 📚 Source citations

## Usage

Enter your legal question and get AI-powered responses with source citations from Indian legal documents.
\`\`\`

**Important Notes about the README.md:**
- The frontmatter (content between `---`) is required by HuggingFace
- `sdk: docker` tells HuggingFace this is a Docker-based application
- `app_port: 7860` specifies the port (must match your Dockerfile)
- `emoji: ⚖️` sets the emoji for your Space
- `colorFrom` and `colorTo` set the gradient colors for your Space card

### 4.7 Copy All Application Files
Copy all the application files from the previous code project:
- `app/` folder with all its contents
- `components/` folder
- `lib/` folder
- `tailwind.config.ts`
- `tsconfig.json`
- `postcss.config.js`

## Step 5: Set Up Environment Variables

1. **Go to Your Space Settings**
   - In your HuggingFace Space, click on "Settings" tab
   - Scroll down to find "Variables and secrets" section

2. **Add Environment Variables**
   - Click "New secret" button
   - Add the first secret:
     - **Name**: `OPENROUTER_API_KEY`
     - **Value**: Your OpenRouter API key (the one you copied earlier)
     - Click "Save"
   
   - Click "New secret" again for the second variable:
     - **Name**: `NEXT_PUBLIC_SITE_URL`
     - **Value**: `https://YOUR_USERNAME-legal-rag-chat.hf.space` 
       (Replace YOUR_USERNAME with your actual HuggingFace username)
     - Click "Save"

## Step 6: Upload Files to HuggingFace

You have two options for uploading files:

### Option A: Using Git (Recommended)

1. **Clone Your Space Repository**
   \`\`\`bash
   git clone https://huggingface.co/spaces/YOUR_USERNAME/legal-rag-chat
   cd legal-rag-chat
   \`\`\`

2. **Copy Project Files**
   - Copy all your prepared files into this folder
   - Make sure you have all the files from Step 4

3. **Commit and Push**
   \`\`\`bash
   git add .
   git commit -m "Initial deployment of Legal RAG Chat"
   git push
   \`\`\`

### Option B: Using Web Interface

1. **Upload Files One by One**
   - In your Space, click "Files" tab
   - Click "Add file" → "Upload files"
   - Drag and drop or select your files
   - **Important**: Upload files in this order:
     1. `Dockerfile`
     2. `requirements.txt`
     3. `package.json`
     4. `next.config.js`
     5. All other files and folders

2. **Create Folders**
   - For folders like `app/`, `components/`, etc.:
   - Click "Add file" → "Create a new file"
   - Type the path like `app/page.tsx`
   - Paste the file content
   - Click "Commit new file"

## Step 7: Monitor Deployment

1. **Check Build Logs**
   - Go to your Space
   - Click on "Logs" tab
   - You'll see the Docker build process in real-time

2. **Build Process Steps**
   The build will go through these stages:
   \`\`\`
   Building Docker image...
   → Installing Node.js dependencies
   → Building Next.js application
   → Starting the server
   → Application ready on port 7860
   \`\`\`

3. **Build Time**
   - Initial build: 5-10 minutes
   - Subsequent builds: 2-5 minutes (due to caching)

## Step 8: Test Your Deployment

1. **Wait for "Running" Status**
   - Your Space status should change from "Building" to "Running"
   - You'll see a green "Running" badge

2. **Access Your Application**
   - Click on your Space URL or the "Open in new tab" button
   - Your application should load with the retro chat interface

3. **Test Functionality**
   - Try asking a legal question like: "What does Indian law say about contracts?"
   - Verify that:
     - RAG search works (connects to your HuggingFace API)
     - AI responses stream properly
     - Dark mode toggle works
     - Settings panel opens
     - Sources are displayed correctly

## Step 9: Troubleshooting Common Issues

### Build Fails

**Problem**: Docker build fails
**Solutions**:
1. Check that `Dockerfile` is exactly as provided
2. Ensure `package.json` has all required dependencies
3. Verify file structure is correct

### Application Won't Start

**Problem**: Build succeeds but app doesn't load
**Solutions**:
1. Check environment variables are set correctly
2. Verify port 7860 is used in Dockerfile
3. Check logs for specific error messages

### API Errors

**Problem**: RAG or OpenRouter API calls fail
**Solutions**:
1. Verify `OPENROUTER_API_KEY` is set correctly
2. Check that your HuggingFace RAG API is accessible
3. Test API endpoints independently

### Environment Variable Issues

**Problem**: Environment variables not working
**Solutions**:
1. Make sure variables are added as "secrets" not "variables"
2. Restart your Space after adding variables
3. Check variable names match exactly (case-sensitive)

## Step 10: Updating Your Deployment

### Using Git
\`\`\`bash
# Make changes to your local files
git add .
git commit -m "Update: description of changes"
git push
\`\`\`

### Using Web Interface
- Edit files directly in the HuggingFace interface
- Each change will trigger a new build

## Step 11: Advanced Configuration

### Custom Domain (Pro Feature)
- HuggingFace Pro users can set custom domains
- Go to Settings → Custom domain

### Hardware Upgrades
- For better performance, upgrade to CPU or GPU instances
- Go to Settings → Hardware

### Private Spaces
- Make your Space private in Settings → Visibility

## Final Checklist

Before going live, verify:
- ✅ Space is "Running" status
- ✅ Application loads without errors
- ✅ Can ask questions and get responses
- ✅ RAG search returns results
- ✅ AI responses stream properly
- ✅ Dark mode works
- ✅ Settings panel functions
- ✅ Sources are displayed
- ✅ Response times are shown

## Getting Help

If you encounter issues:

1. **Check Logs**: Always start with the "Logs" tab in your Space
2. **HuggingFace Community**: Post in HuggingFace forums
3. **Documentation**: Check HuggingFace Spaces documentation
4. **GitHub Issues**: Report bugs in the project repository

## Security Notes

- Never commit API keys to Git
- Use HuggingFace secrets for sensitive data
- Regularly rotate your API keys
- Monitor usage to avoid unexpected charges

Your Legal RAG Chat application should now be successfully deployed and accessible to users worldwide!
