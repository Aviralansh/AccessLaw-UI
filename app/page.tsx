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
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Send, Settings, Moon, Sun, Clock, Database, X, FileText } from "lucide-react"
import ReactMarkdown from "react-markdown"
import { ChevronDown, ChevronUp } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

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

interface DocumentFields {
  [key: string]: string
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
  const [expandedSources, setExpandedSources] = useState<Record<string, boolean>>({})
  const [generatingDoc, setGeneratingDoc] = useState(false)
  const [showDocDialog, setShowDocDialog] = useState(false)
  const [documentFields, setDocumentFields] = useState<DocumentFields>({})
  const [detectedDocType, setDetectedDocType] = useState<string>("")
  const [currentQuery, setCurrentQuery] = useState("")
  const [currentResponse, setCurrentResponse] = useState("")

  const scrollToBottom = () => {
    // Only auto-scroll if user is already at the bottom or it's a new message
    const isAtBottom =
      messagesEndRef.current && messagesEndRef.current.getBoundingClientRect().bottom <= window.innerHeight + 100

    if (isAtBottom || messages.length <= 1) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }
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

  const stopStreaming = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null

      // Update the last message to mark it as no longer streaming
      setMessages((prev) => {
        const lastMessage = prev[prev.length - 1]
        if (lastMessage && lastMessage.type === "assistant" && lastMessage.isStreaming) {
          return [
            ...prev.slice(0, -1),
            { ...lastMessage, isStreaming: false, content: lastMessage.content + " [Response stopped]" },
          ]
        }
        return prev
      })

      setIsLoading(false)
    }
  }

  const detectDocumentType = async (query: string, response: string) => {
    try {
      const detectionResponse = await fetch("https://aviralansh-accesslaw-doc.hf.space/detect-document-type", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query,
          response,
        }),
      })

      if (detectionResponse.ok) {
        const result = await detectionResponse.json()
        return result.detected_type
      }
    } catch (error) {
      console.error("Document type detection error:", error)
    }
    return "legal_notice" // fallback
  }

  const getTemplateFields = async (query: string, response: string, docType: string) => {
    try {
      const fieldsResponse = await fetch("https://aviralansh-accesslaw-doc.hf.space/gen-doc", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query,
          response,
          document_type: docType,
          dry_run: true, // Just get the fields, don't generate PDF
        }),
      })

      if (fieldsResponse.ok) {
        const result = await fieldsResponse.json()
        return result.template_fields || {}
      }
    } catch (error) {
      console.error("Template fields error:", error)
    }
    return {}
  }

  const openDocumentDialog = async () => {
    // Get the last user message and assistant response
    const lastAssistantMessage = messages.filter((m) => m.type === "assistant" && !m.isStreaming).pop()
    const lastUserMessage = messages.filter((m) => m.type === "user").pop()

    if (!lastAssistantMessage || !lastUserMessage) {
      return
    }

    const query = lastUserMessage.content
    const response = lastAssistantMessage.content

    setCurrentQuery(query)
    setCurrentResponse(response)

    // Detect document type and get template fields
    const docType = await detectDocumentType(query, response)
    const fields = await getTemplateFields(query, response, docType)

    setDetectedDocType(docType)
    setDocumentFields(fields)
    setShowDocDialog(true)
  }

  const generateDocument = async () => {
    setGeneratingDoc(true)

    try {
      const docResponse = await fetch("/api/generate-document", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: currentQuery,
          response: currentResponse,
          document_type: detectedDocType,
          user_details: documentFields,
        }),
      })

      if (!docResponse.ok) {
        throw new Error("Document generation failed")
      }

      const result = await docResponse.json()

      // Create download link
      const blob = new Blob([Uint8Array.from(atob(result.pdf_content), (c) => c.charCodeAt(0))], {
        type: "application/pdf",
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = result.filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      setShowDocDialog(false)
    } catch (error) {
      console.error("Document generation error:", error)
    } finally {
      setGeneratingDoc(false)
    }
  }

  const handleFieldChange = (fieldName: string, value: string) => {
    setDocumentFields((prev) => ({
      ...prev,
      [fieldName]: value,
    }))
  }

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
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
      // Step 1: Query RAG API - Updated endpoint
      const ragResponse = await fetch("https://aviralansh-accesslaw-doc.hf.space/search", {
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

  // Get the last assistant message that's not streaming
  const lastAssistantMessage = messages.filter((m) => m.type === "assistant" && !m.isStreaming).pop()
  const hasCompletedResponse = lastAssistantMessage && !lastAssistantMessage.isStreaming

  return (
    <TooltipProvider>
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
                <Tooltip>
                  <TooltipTrigger asChild>
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
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="font-mono text-xs">Configure search parameters and query options</p>
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
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
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="font-mono text-xs">Toggle between light and dark theme modes</p>
                  </TooltipContent>
                </Tooltip>
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
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center space-x-2">
                            <Switch
                              checked={queryParams.rerank}
                              onCheckedChange={(checked) => setQueryParams((prev) => ({ ...prev, rerank: checked }))}
                            />
                            <Label className="font-mono text-sm cursor-pointer">Rerank Results</Label>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="font-mono text-xs">
                            Reorder search results using advanced ranking algorithms for better relevance
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <div className="flex items-center space-x-2 transition-all duration-200 hover:scale-105">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center space-x-2">
                            <Switch
                              checked={queryParams.include_scores}
                              onCheckedChange={(checked) =>
                                setQueryParams((prev) => ({ ...prev, include_scores: checked }))
                              }
                            />
                            <Label className="font-mono text-sm cursor-pointer">Include Scores</Label>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="font-mono text-xs">
                            Display similarity scores showing how well each source matches your query
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 flex flex-col">
            {messages.length === 0 ? (
              // Centered welcome content when no messages
              <div className="flex-1 flex flex-col items-center justify-center space-y-8 animate-fade-in">
                <div className="text-center">
                  <h2 className="text-xl font-mono mb-2 animate-slide-up">Welcome to AccessLaw RAG</h2>
                  <p className="font-mono opacity-70 animate-slide-up" style={{ animationDelay: "200ms" }}>
                    Ask any question about Indian legal documents
                  </p>
                </div>

                {/* Centered input form */}
                <div className="w-full max-w-2xl animate-slide-up" style={{ animationDelay: "400ms" }}>
                  <form onSubmit={handleSubmit} className="flex space-x-2">
                    <Input
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder="Someone filed fake case on me, what should I do?"
                      disabled={isLoading}
                      className="font-mono flex-1 transition-all duration-200 focus:scale-[1.02] hover:border-current/40"
                    />
                    <Button
                      type="button"
                      onClick={isLoading ? stopStreaming : handleSubmit}
                      disabled={!isLoading && !input.trim()}
                      className="font-mono transition-all duration-200 hover:scale-110 disabled:scale-100 hover:shadow-lg"
                    >
                      {isLoading ? (
                        <X className="w-4 h-4 transition-all duration-300 animate-pulse" />
                      ) : (
                        <Send className="w-4 h-4 transition-all duration-300 hover:translate-x-1" />
                      )}
                    </Button>
                  </form>
                </div>
              </div>
            ) : (
              // Regular message list when messages exist
              <>
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
                                      <p className="mb-2 font-mono leading-relaxed transition-all duration-200">
                                        {children}
                                      </p>
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
                                      <strong className="font-bold font-mono transition-all duration-200">
                                        {children}
                                      </strong>
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
                                    <div className="flex items-center justify-between">
                                      <h4 className="font-mono text-sm font-bold transition-all duration-200 hover:text-current/80">
                                        Sources:
                                      </h4>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() =>
                                          setExpandedSources((prev) => ({
                                            ...prev,
                                            [message.id]: !prev[message.id],
                                          }))
                                        }
                                        className="font-mono text-xs h-6 px-2 transition-all duration-200 hover:scale-105"
                                      >
                                        {expandedSources[message.id] ? (
                                          <>
                                            <ChevronUp className="w-3 h-3 mr-1" />
                                            Hide
                                          </>
                                        ) : (
                                          <>
                                            <ChevronDown className="w-3 h-3 mr-1" />
                                            Show
                                          </>
                                        )}
                                      </Button>
                                    </div>

                                    {expandedSources[message.id] && (
                                      <div className="space-y-2 animate-slide-in-up">
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
                                                {result.metadata.section_number &&
                                                  ` - Section ${result.metadata.section_number}`}
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
                                    )}
                                  </div>
                                </div>
                              )}

                              {/* Generate Document Button - Only show for the last completed assistant message */}
                              {message === lastAssistantMessage && !message.isStreaming && (
                                <div className="mt-4 pt-3 border-t border-current/20">
                                  <Dialog open={showDocDialog} onOpenChange={setShowDocDialog}>
                                    <DialogTrigger asChild>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={openDocumentDialog}
                                        className="font-mono text-xs transition-all duration-200 hover:scale-105 bg-transparent"
                                      >
                                        <FileText className="w-3 h-3 mr-1" />
                                        Generate Legal Document
                                      </Button>
                                    </DialogTrigger>
                                    <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                                      <DialogHeader>
                                        <DialogTitle className="font-mono">Generate Legal Document</DialogTitle>
                                        <DialogDescription className="font-mono text-sm">
                                          Review and edit the document details before generating the PDF. Fields marked
                                          with placeholders (e.g., [Your Name]) need to be filled in.
                                        </DialogDescription>
                                      </DialogHeader>

                                      <div className="space-y-4">
                                        <div>
                                          <Label className="font-mono text-sm font-bold">Document Type</Label>
                                          <p className="font-mono text-sm text-muted-foreground capitalize">
                                            {detectedDocType.replace("_", " ")}
                                          </p>
                                        </div>

                                        <div className="space-y-3">
                                          <Label className="font-mono text-sm font-bold">Document Fields</Label>
                                          <div className="grid gap-3">
                                            {Object.entries(documentFields).map(([fieldName, fieldValue]) => (
                                              <div key={fieldName} className="space-y-1">
                                                <Label className="font-mono text-xs capitalize">
                                                  {fieldName.replace(/_/g, " ")}
                                                </Label>
                                                {fieldName.includes("description") ||
                                                fieldName.includes("content") ||
                                                fieldName.includes("statement") ||
                                                fieldName.includes("terms") ||
                                                fieldName.includes("requested") ? (
                                                  <Textarea
                                                    value={fieldValue}
                                                    onChange={(e) => handleFieldChange(fieldName, e.target.value)}
                                                    className="font-mono text-xs min-h-[80px]"
                                                    placeholder={`Enter ${fieldName.replace(/_/g, " ")}`}
                                                  />
                                                ) : (
                                                  <Input
                                                    value={fieldValue}
                                                    onChange={(e) => handleFieldChange(fieldName, e.target.value)}
                                                    className="font-mono text-xs"
                                                    placeholder={`Enter ${fieldName.replace(/_/g, " ")}`}
                                                  />
                                                )}
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      </div>

                                      <DialogFooter>
                                        <Button
                                          variant="outline"
                                          onClick={() => setShowDocDialog(false)}
                                          className="font-mono"
                                        >
                                          Cancel
                                        </Button>
                                        <Button
                                          onClick={generateDocument}
                                          disabled={generatingDoc}
                                          className="font-mono"
                                        >
                                          {generatingDoc ? (
                                            <>
                                              <LoadingAnimation />
                                              <span className="ml-2">Generating...</span>
                                            </>
                                          ) : (
                                            <>
                                              <FileText className="w-4 h-4 mr-2" />
                                              Generate PDF
                                            </>
                                          )}
                                        </Button>
                                      </DialogFooter>
                                    </DialogContent>
                                  </Dialog>
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
              </>
            )}
          </div>

          {/* Input - Only show when messages exist */}
          {messages.length > 0 && (
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
                  type="button"
                  onClick={isLoading ? stopStreaming : handleSubmit}
                  disabled={!isLoading && !input.trim()}
                  className="font-mono transition-all duration-200 hover:scale-110 disabled:scale-100 hover:shadow-lg"
                >
                  {isLoading ? (
                    <X className="w-4 h-4 transition-all duration-300 animate-pulse" />
                  ) : (
                    <Send className="w-4 h-4 transition-all duration-300 hover:translate-x-1" />
                  )}
                </Button>
              </form>
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  )
}
