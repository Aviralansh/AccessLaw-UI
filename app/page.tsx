"use client"

import type React from "react"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Send, Settings, Moon, Sun, Clock, Database } from "lucide-react"
import ReactMarkdown from "react-markdown"

interface RAGResult {
  content: string
  metadata: {
    document_id: string
    title: string
    section_number?: string
    document_type: string
    legal_source: string
    source_category: string
  }
  similarity_score: number
}

interface RAGResponse {
  results: RAGResult[]
  query: string
  total_results: number
  search_time: number
}

interface Message {
  id: string
  type: "user" | "assistant"
  content: string
  timestamp: Date
  ragResponse?: RAGResponse
  totalTime?: number
  isStreaming?: boolean
  isSearching?: boolean
}

interface QueryParams {
  top_k: number
  rerank: boolean
  include_scores: boolean
  filters: Record<string, any>
}

export default function LegalRAGChat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [darkMode, setDarkMode] = useState(true)
  const [queryParams, setQueryParams] = useState<QueryParams>({
    top_k: 3,
    rerank: false,
    include_scores: false,
    filters: {},
  })

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  useEffect(() => {
    // Set dark mode by default on initial load
    document.documentElement.classList.add("dark")
  }, [])

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add("dark")
    } else {
      document.documentElement.classList.remove("dark")
    }
  }, [darkMode])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return

    const userMessage: Message = {
      id: Date.now().toString(),
      type: "user",
      content: input.trim(),
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInput("")
    setIsLoading(true)

    const startTime = Date.now()

    // Create assistant message with loading state immediately
    const assistantMessageId = (Date.now() + 1).toString()
    const assistantMessage: Message = {
      id: assistantMessageId,
      type: "assistant",
      content: "",
      timestamp: new Date(),
      isStreaming: true,
      isSearching: true,
    }

    setMessages((prev) => [...prev, assistantMessage])

    try {
      // Step 1: Query RAG API
      const ragResponse = await fetch("https://aviralansh-accesslaw.hf.space/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: userMessage.content,
          ...queryParams,
        }),
      })

      if (!ragResponse.ok) {
        throw new Error("RAG API request failed")
      }

      const ragData: RAGResponse = await ragResponse.json()

      // Update message with RAG response but keep searching state
      setMessages((prev) => prev.map((msg) => (msg.id === assistantMessageId ? { ...msg, ragResponse: ragData } : msg)))

      // Step 2: Send to OpenRouter with streaming
      const context = ragData.results
        .map(
          (result) =>
            `Source: ${result.metadata.title} (${result.metadata.legal_source} - ${result.metadata.document_type})\nContent: ${result.content}`,
        )
        .join("\n\n")

      const prompt = `Based on the following legal documents, please provide a comprehensive answer to the user's question: "${userMessage.content}"

Legal Context:
${context}

Please provide a detailed, accurate response based on the legal sources provided. Cite the specific sections and sources in your response.`

      abortControllerRef.current = new AbortController()

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: prompt,
        }),
        signal: abortControllerRef.current.signal,
      })

      if (!response.ok) {
        throw new Error("OpenRouter API request failed")
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      let streamedContent = ""
      let firstTokenReceived = false

      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value)
          const lines = chunk.split("\n")

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6)
              if (data === "[DONE]") continue

              try {
                const parsed = JSON.parse(data)
                if (parsed.content) {
                  if (!firstTokenReceived) {
                    firstTokenReceived = true
                    // Stop the searching animation when first token is received
                    setMessages((prev) =>
                      prev.map((msg) => (msg.id === assistantMessageId ? { ...msg, isSearching: false } : msg)),
                    )
                  }
                  streamedContent += parsed.content
                  setMessages((prev) =>
                    prev.map((msg) => (msg.id === assistantMessageId ? { ...msg, content: streamedContent } : msg)),
                  )
                }
              } catch (e) {
                // Ignore parsing errors for partial chunks
              }
            }
          }
        }
      }

      const endTime = Date.now()
      const totalTime = endTime - startTime

      // Update final message
      setMessages((prev) =>
        prev.map((msg) => (msg.id === assistantMessageId ? { ...msg, isStreaming: false, totalTime } : msg)),
      )
    } catch (error) {
      console.error("Error:", error)
      const errorMessage: Message = {
        id: (Date.now() + 2).toString(),
        type: "assistant",
        content: "Sorry, I encountered an error while processing your request. Please try again.",
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
      abortControllerRef.current = null
    }
  }

  const LoadingAnimation = () => (
    <div className="flex items-center space-x-1">
      <div className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></div>
      <div className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></div>
      <div className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></div>
    </div>
  )

  const CyclingLoadingText = () => {
    const [currentIndex, setCurrentIndex] = useState(0)
    const [isVisible, setIsVisible] = useState(true)
    const loadingTexts = ["Searching legal documents...", "Diving deep in laws...", "Thinking...", "More documents..."]

    useEffect(() => {
      const interval = setInterval(() => {
        setIsVisible(false)
        setTimeout(() => {
          setCurrentIndex((prev) => (prev + 1) % loadingTexts.length)
          setIsVisible(true)
        }, 200) // Half of the transition duration
      }, 2000) // Change text every 2 seconds

      return () => clearInterval(interval)
    }, [])

    return (
      <span className={`transition-opacity duration-400 ease-in-out ${isVisible ? "opacity-100" : "opacity-0"}`}>
        {loadingTexts[currentIndex]}
      </span>
    )
  }

  return (
    <div
      className={`min-h-screen transition-all duration-500 ease-in-out ${darkMode ? "dark bg-black text-white" : "bg-white text-black"}`}
    >
      <div className="container mx-auto max-w-4xl h-screen flex flex-col">
        {/* Header */}
        <header className="border-b border-current/20 p-4 transition-all duration-300 ease-in-out">
          <div className="flex items-center justify-between">
            <div className="transition-all duration-300 ease-in-out">
              <h1 className="text-2xl font-mono font-bold hover:scale-105 transition-transform duration-200">
                AccessLaw RAG
              </h1>
              <p className="text-sm font-mono opacity-70 transition-opacity duration-300">
                Legal Document Search & Analysis
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowSettings(!showSettings)}
                className="font-mono transition-all duration-200 hover:scale-110 hover:bg-current/10"
              >
                <Settings
                  className={`w-4 h-4 transition-transform duration-300 ${showSettings ? "rotate-90" : "rotate-0"}`}
                />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDarkMode(!darkMode)}
                className="font-mono transition-all duration-200 hover:scale-110 hover:bg-current/10"
              >
                <div className="relative w-4 h-4">
                  <Sun
                    className={`w-4 h-4 absolute transition-all duration-500 ${darkMode ? "opacity-0 rotate-90 scale-0" : "opacity-100 rotate-0 scale-100"}`}
                  />
                  <Moon
                    className={`w-4 h-4 absolute transition-all duration-500 ${darkMode ? "opacity-100 rotate-0 scale-100" : "opacity-0 -rotate-90 scale-0"}`}
                  />
                </div>
              </Button>
            </div>
          </div>
        </header>

        {/* Settings Panel */}
        <div
          className={`transition-all duration-500 ease-in-out overflow-hidden ${showSettings ? "max-h-96 opacity-100" : "max-h-0 opacity-0"}`}
        >
          <Card className="m-4 border-current/20 transform transition-all duration-300 ease-in-out">
            <CardHeader>
              <CardTitle className="font-mono text-lg">Query Parameters</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="transition-all duration-200 hover:scale-105">
                  <Label className="font-mono text-sm">Top K Results</Label>
                  <Select
                    value={queryParams.top_k.toString()}
                    onValueChange={(value) => setQueryParams((prev) => ({ ...prev, top_k: Number.parseInt(value) }))}
                  >
                    <SelectTrigger className="font-mono transition-all duration-200 hover:border-current/40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1</SelectItem>
                      <SelectItem value="3">3</SelectItem>
                      <SelectItem value="5">5</SelectItem>
                      <SelectItem value="10">10</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center space-x-2 transition-all duration-200 hover:scale-105">
                    <Switch
                      checked={queryParams.rerank}
                      onCheckedChange={(checked) => setQueryParams((prev) => ({ ...prev, rerank: checked }))}
                    />
                    <Label className="font-mono text-sm">Rerank Results</Label>
                  </div>
                  <div className="flex items-center space-x-2 transition-all duration-200 hover:scale-105">
                    <Switch
                      checked={queryParams.include_scores}
                      onCheckedChange={(checked) => setQueryParams((prev) => ({ ...prev, include_scores: checked }))}
                    />
                    <Label className="font-mono text-sm">Include Scores</Label>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-12 animate-fade-in">
              <h2 className="text-xl font-mono mb-2 animate-slide-up">Welcome to AccessLaw RAG</h2>
              <p className="font-mono opacity-70 animate-slide-up" style={{ animationDelay: "200ms" }}>
                Ask any question about Indian legal documents
              </p>
            </div>
          )}

          {messages.map((message, index) => (
            <div
              key={message.id}
              className={`flex ${message.type === "user" ? "justify-end" : "justify-start"} animate-slide-in-up`}
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <div
                className={`max-w-3xl ${message.type === "user" ? "bg-current/10" : "bg-current/5"} rounded-lg p-4 border border-current/20 transition-all duration-300 ease-in-out hover:shadow-lg hover:scale-[1.02] hover:border-current/30`}
              >
                {message.type === "user" ? (
                  <p className="font-mono text-sm transition-all duration-200">{message.content}</p>
                ) : (
                  <div className="space-y-4">
                    {message.isStreaming && message.isSearching ? (
                      <div className="flex items-center space-x-2 font-mono text-sm opacity-70 animate-pulse">
                        <LoadingAnimation />
                        <CyclingLoadingText />
                      </div>
                    ) : message.isStreaming && !message.content ? (
                      <div className="flex items-center space-x-2 font-mono text-sm opacity-70 animate-pulse">
                        <LoadingAnimation />
                        <span className="animate-fade-in">Generating response...</span>
                      </div>
                    ) : (
                      <>
                        <div className="font-mono text-sm animate-fade-in">
                          <ReactMarkdown
                            className="prose prose-sm max-w-none dark:prose-invert prose-headings:font-mono prose-p:font-mono prose-li:font-mono prose-code:font-mono prose-pre:font-mono prose-blockquote:font-mono"
                            components={{
                              h1: ({ children }) => (
                                <h1 className="text-lg font-bold mb-2 font-mono transition-all duration-200 hover:text-current/80">
                                  {children}
                                </h1>
                              ),
                              h2: ({ children }) => (
                                <h2 className="text-base font-bold mb-2 font-mono transition-all duration-200 hover:text-current/80">
                                  {children}
                                </h2>
                              ),
                              h3: ({ children }) => (
                                <h3 className="text-sm font-bold mb-1 font-mono transition-all duration-200 hover:text-current/80">
                                  {children}
                                </h3>
                              ),
                              p: ({ children }) => (
                                <p className="mb-2 font-mono leading-relaxed transition-all duration-200">{children}</p>
                              ),
                              ul: ({ children }) => (
                                <ul className="list-disc list-inside mb-2 font-mono transition-all duration-200">
                                  {children}
                                </ul>
                              ),
                              ol: ({ children }) => (
                                <ol className="list-decimal list-inside mb-2 font-mono transition-all duration-200">
                                  {children}
                                </ol>
                              ),
                              li: ({ children }) => (
                                <li className="mb-1 font-mono transition-all duration-200 hover:text-current/80">
                                  {children}
                                </li>
                              ),
                              code: ({ children, className }) => {
                                const isInline = !className
                                return isInline ? (
                                  <code className="bg-current/10 px-1 py-0.5 rounded text-xs font-mono transition-all duration-200 hover:bg-current/20">
                                    {children}
                                  </code>
                                ) : (
                                  <pre className="bg-current/5 p-3 rounded border border-current/20 overflow-x-auto mb-2 transition-all duration-200 hover:bg-current/10 hover:border-current/30">
                                    <code className="font-mono text-xs">{children}</code>
                                  </pre>
                                )
                              },
                              blockquote: ({ children }) => (
                                <blockquote className="border-l-2 border-current/30 pl-3 italic font-mono mb-2 transition-all duration-200 hover:border-current/50">
                                  {children}
                                </blockquote>
                              ),
                              strong: ({ children }) => (
                                <strong className="font-bold font-mono transition-all duration-200">{children}</strong>
                              ),
                              em: ({ children }) => (
                                <em className="italic font-mono transition-all duration-200">{children}</em>
                              ),
                            }}
                          >
                            {message.content}
                          </ReactMarkdown>
                          {message.isStreaming && (
                            <span className="inline-block w-2 h-4 bg-current ml-1 animate-pulse"></span>
                          )}
                        </div>

                        {message.ragResponse && (
                          <div
                            className="space-y-3 pt-4 border-t border-current/20 animate-slide-in-up"
                            style={{ animationDelay: "300ms" }}
                          >
                            <div className="flex items-center space-x-4 text-xs font-mono opacity-70 transition-all duration-200 hover:opacity-100">
                              <div className="flex items-center space-x-1 transition-all duration-200 hover:scale-105">
                                <Database className="w-3 h-3 animate-pulse" />
                                <span>RAG: {message.ragResponse.search_time.toFixed(2)}s</span>
                              </div>
                              {message.totalTime && (
                                <div className="flex items-center space-x-1 transition-all duration-200 hover:scale-105">
                                  <Clock className="w-3 h-3 animate-pulse" />
                                  <span>Total: {(message.totalTime / 1000).toFixed(2)}s</span>
                                </div>
                              )}
                              <span className="transition-all duration-200 hover:scale-105">
                                {message.ragResponse.total_results} sources
                              </span>
                            </div>

                            <div className="space-y-2">
                              <h4 className="font-mono text-sm font-bold transition-all duration-200 hover:text-current/80">
                                Sources:
                              </h4>
                              {message.ragResponse.results.map((result, index) => (
                                <div
                                  key={index}
                                  className="text-xs font-mono space-y-1 transition-all duration-200 hover:bg-current/5 p-2 rounded animate-slide-in-right"
                                  style={{ animationDelay: `${index * 100}ms` }}
                                >
                                  <div className="flex items-center space-x-2">
                                    <Badge
                                      variant="outline"
                                      className="font-mono text-xs transition-all duration-200 hover:scale-105 hover:bg-current/10"
                                    >
                                      {result.metadata.legal_source}
                                    </Badge>
                                    <span className="opacity-70 transition-all duration-200 hover:opacity-100">
                                      {result.metadata.title}
                                      {result.metadata.section_number && ` - Section ${result.metadata.section_number}`}
                                    </span>
                                  </div>
                                  {queryParams.include_scores && (
                                    <div className="opacity-50 transition-all duration-200 hover:opacity-70">
                                      Similarity: {(result.similarity_score * 100).toFixed(1)}%
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t border-current/20 p-4 transition-all duration-300 ease-in-out">
          <form onSubmit={handleSubmit} className="flex space-x-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Someone filed fake case on me, what should I do?"
              disabled={isLoading}
              className="font-mono flex-1 transition-all duration-200 focus:scale-[1.02] hover:border-current/40"
            />
            <Button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="font-mono transition-all duration-200 hover:scale-110 disabled:scale-100 hover:shadow-lg"
            >
              <Send
                className={`w-4 h-4 transition-all duration-300 ${isLoading ? "animate-pulse" : "hover:translate-x-1"}`}
              />
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
