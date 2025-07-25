import { OpenAIStream, StreamingTextResponse } from "ai"
import { createOpenAI } from "@ai-sdk/openai"

// Create an OpenAI API client (that's compatible with OpenRouter)
const openai = createOpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL, // Optional: for OpenRouter to display your app name
    "X-Title": "AccessLaw RAG Chat", // Optional: for OpenRouter to display your app name
  },
})

export async function POST(req: Request) {
  const { messages } = await req.json()

  const response = await openai.chat.completions.create({
    model: "mistralai/mistral-7b-instruct", // You can change this to 'mistralai/mixtral-8x7b-instruct' or 'google/gemini-pro' or 'deepseek-ai/deepseek-coder'
    stream: true,
    messages,
  })

  const stream = OpenAIStream(response)
  return new StreamingTextResponse(stream)
}
