import { OpenAIStream, StreamingTextResponse } from "ai"
import { createOpenAI } from "@ai-sdk/openai"
import { type NextRequest, NextResponse } from "next/server"

// Create an OpenAI API client (that's compatible with OpenRouter)
const openai = createOpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL, // Optional: for OpenRouter to display your app name
    "X-Title": "AccessLaw RAG Chat", // Optional: for OpenRouter to display your app name
  },
})

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json()

    const response = await openai.chat.completions.create({
      model: "mistralai/mistral-7b-instruct", // You can change this to 'mistralai/mixtral-8x7b-instruct' or 'google/gemini-pro' or 'deepseek-ai/deepseek-coder'
      stream: true,
      messages,
    })

    const stream = OpenAIStream(response)
    return new StreamingTextResponse(stream)
  } catch (error) {
    console.error("Chat API error:", error)
    return NextResponse.json({ error: "Failed to process request" }, { status: 500 })
  }
}
