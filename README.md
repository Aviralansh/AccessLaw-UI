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
