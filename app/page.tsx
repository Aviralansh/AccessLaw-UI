"use client"

import type React from "react"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Loader2, Send, FileText, Download, Edit } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: Date
}

interface DocumentField {
  [key: string]: string
}

export default function AccessLawChat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isGeneratingDoc, setIsGeneratingDoc] = useState(false)
  const [showDocumentDialog, setShowDocumentDialog] = useState(false)
  const [documentFields, setDocumentFields] = useState<DocumentField>({})
  const [documentType, setDocumentType] = useState("")
  const [currentQuery, setCurrentQuery] = useState("")
  const [currentResponse, setCurrentResponse] = useState("")
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const { toast } = useToast()

  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight
    }
  }, [messages])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMessage])
    setCurrentQuery(input.trim())
    setInput("")
    setIsLoading(true)

    try {
      // First, search for relevant documents
      const searchResponse = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_HF_TOKEN}`,
        },
        body: JSON.stringify({
          query: userMessage.content,
          top_k: 3,
          include_scores: true,
        }),
      })

      if (!searchResponse.ok) {
        throw new Error("Search request failed")
      }

      const searchData = await searchResponse.json()
      const context = searchData.results.map((result: any) => result.content).join("\n\n")

      // Then, get AI response using the context
      const chatResponse = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [
            {
              role: "system",
              content: `You are AccessLaw, an AI assistant specialized in Indian law. Use the following legal context to provide accurate, helpful responses about Indian legal matters. Always cite relevant sections, acts, or case law when applicable.

Context from legal documents:
${context}

Guidelines:
- Provide clear, actionable legal guidance
- Cite specific laws, sections, and precedents
- Explain legal procedures step-by-step
- Mention when professional legal consultation is recommended
- Use simple language while maintaining legal accuracy`,
            },
            {
              role: "user",
              content: userMessage.content,
            },
          ],
        }),
      })

      if (!chatResponse.ok) {
        throw new Error("Chat request failed")
      }

      const reader = chatResponse.body?.getReader()
      if (!reader) throw new Error("No response body")

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "",
        timestamp: new Date(),
      }

      setMessages((prev) => [...prev, assistantMessage])

      let fullResponse = ""
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = new TextDecoder().decode(value)
        const lines = chunk.split("\n")

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6)
            if (data === "[DONE]") continue

            try {
              const parsed = JSON.parse(data)
              const content = parsed.choices?.[0]?.delta?.content || ""
              if (content) {
                fullResponse += content
                setMessages((prev) =>
                  prev.map((msg) => (msg.id === assistantMessage.id ? { ...msg, content: fullResponse } : msg)),
                )
              }
            } catch (e) {
              // Ignore parsing errors for streaming data
            }
          }
        }
      }

      setCurrentResponse(fullResponse)
    } catch (error) {
      console.error("Chat error:", error)
      toast({
        title: "Error",
        description: "Failed to get response. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleGenerateDocument = async () => {
    if (!currentQuery || !currentResponse) {
      toast({
        title: "Error",
        description: "No conversation available for document generation.",
        variant: "destructive",
      })
      return
    }

    setIsGeneratingDoc(true)
    setIsAnalyzing(true)

    try {
      // Step 1: Detect document type
      const detectResponse = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/doc/detect-document-type`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_HF_TOKEN}`,
        },
        body: JSON.stringify({
          query: currentQuery,
          response: currentResponse,
        }),
      })

      if (!detectResponse.ok) {
        throw new Error("Document type detection failed")
      }

      const detectData = await detectResponse.json()
      const detectedType = detectData.detected_type

      setDocumentType(detectedType)

      // Step 2: Fill template fields using LLM
      const fillResponse = await fetch("/api/fill-template", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: currentQuery,
          response: currentResponse,
          documentType: detectedType,
        }),
      })

      if (!fillResponse.ok) {
        throw new Error("Template filling failed")
      }

      const fillData = await fillResponse.json()
      setDocumentFields(fillData.fields || {})
      setShowDocumentDialog(true)
    } catch (error) {
      console.error("Document generation error:", error)
      toast({
        title: "Error",
        description: `Document generation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        variant: "destructive",
      })
    } finally {
      setIsGeneratingDoc(false)
      setIsAnalyzing(false)
    }
  }

  const handleFieldChange = (fieldName: string, value: string) => {
    setDocumentFields((prev) => ({
      ...prev,
      [fieldName]: value,
    }))
  }

  const handleConfirmGeneration = async () => {
    try {
      const generateResponse = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/doc/gen-doc`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_HF_TOKEN}`,
        },
        body: JSON.stringify({
          query: currentQuery,
          response: currentResponse,
          document_type: documentType,
          user_details: documentFields,
        }),
      })

      if (!generateResponse.ok) {
        throw new Error("Document generation failed")
      }

      const generateData = await generateResponse.json()

      if (generateData.success && generateData.pdf_content) {
        // Create download link
        const byteCharacters = atob(generateData.pdf_content)
        const byteNumbers = new Array(byteCharacters.length)
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i)
        }
        const byteArray = new Uint8Array(byteNumbers)
        const blob = new Blob([byteArray], { type: "application/pdf" })
        const url = URL.createObjectURL(blob)

        const link = document.createElement("a")
        link.href = url
        link.download = generateData.filename || "legal_document.pdf"
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)

        toast({
          title: "Success",
          description: "Legal document generated and downloaded successfully!",
        })
      }

      setShowDocumentDialog(false)
    } catch (error) {
      console.error("Final generation error:", error)
      toast({
        title: "Error",
        description: `Failed to generate document: ${error instanceof Error ? error.message : "Unknown error"}`,
        variant: "destructive",
      })
    }
  }

  const formatFieldName = (fieldName: string) => {
    return fieldName
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ")
  }

  const lastAssistantMessage = messages.filter((m) => m.role === "assistant").pop()
  const isResponseComplete = lastAssistantMessage && !isLoading

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-4xl mx-auto">
        <Card className="h-[80vh] flex flex-col shadow-xl border-0 bg-white/80 backdrop-blur-sm">
          <CardHeader className="border-b bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-t-lg">
            <CardTitle className="text-2xl font-bold text-center">AccessLaw - Indian Legal AI Assistant</CardTitle>
            <p className="text-blue-100 text-center text-sm">
              Get expert guidance on Indian legal matters with AI-powered document generation
            </p>
          </CardHeader>

          <CardContent className="flex-1 flex flex-col p-0">
            <ScrollArea className="flex-1 p-6" ref={scrollAreaRef}>
              <div className="space-y-4">
                {messages.length === 0 && (
                  <div className="text-center text-gray-500 mt-8">
                    <FileText className="mx-auto h-12 w-12 mb-4 text-gray-400" />
                    <h3 className="text-lg font-semibold mb-2">Welcome to AccessLaw</h3>
                    <p className="text-sm">
                      Ask any question about Indian law, legal procedures, or get help with legal documents.
                    </p>
                  </div>
                )}

                {messages.map((message) => (
                  <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[80%] rounded-lg p-4 ${
                        message.role === "user" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-900 border"
                      }`}
                    >
                      <div className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</div>
                      <div className={`text-xs mt-2 ${message.role === "user" ? "text-blue-100" : "text-gray-500"}`}>
                        {message.timestamp.toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                ))}

                {isLoading && (
                  <div className="flex justify-start">
                    <div className="bg-gray-100 rounded-lg p-4 border">
                      <div className="flex items-center space-x-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="text-sm text-gray-600">AccessLaw is thinking...</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>

            <div className="border-t p-4 bg-gray-50">
              {isResponseComplete && (
                <div className="mb-4 flex justify-center">
                  <Button
                    onClick={handleGenerateDocument}
                    disabled={isGeneratingDoc}
                    className="bg-green-600 hover:bg-green-700 text-white"
                  >
                    {isAnalyzing ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <FileText className="mr-2 h-4 w-4" />
                        Generate Legal Document
                      </>
                    )}
                  </Button>
                </div>
              )}

              <form onSubmit={handleSubmit} className="flex space-x-2">
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask about Indian law, legal procedures, or document requirements..."
                  disabled={isLoading}
                  className="flex-1"
                />
                <Button type="submit" disabled={isLoading || !input.trim()}>
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </form>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={showDocumentDialog} onOpenChange={setShowDocumentDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <Edit className="mr-2 h-5 w-5" />
              Review Document Details
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Please review and edit the document details below before generating the final PDF:
            </p>

            {Object.entries(documentFields).map(([fieldName, fieldValue]) => (
              <div key={fieldName} className="space-y-2">
                <Label htmlFor={fieldName} className="text-sm font-medium">
                  {formatFieldName(fieldName)}
                </Label>
                {fieldName.includes("address") || fieldName.includes("description") || fieldName.includes("details") ? (
                  <Textarea
                    id={fieldName}
                    value={fieldValue}
                    onChange={(e) => handleFieldChange(fieldName, e.target.value)}
                    className="min-h-[80px]"
                  />
                ) : (
                  <Input
                    id={fieldName}
                    value={fieldValue}
                    onChange={(e) => handleFieldChange(fieldName, e.target.value)}
                  />
                )}
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDocumentDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleConfirmGeneration} className="bg-blue-600 hover:bg-blue-700">
              <Download className="mr-2 h-4 w-4" />
              Generate PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
