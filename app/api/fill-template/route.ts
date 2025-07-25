import { type NextRequest, NextResponse } from "next/server"
import { createOpenAI } from "@ai-sdk/openai"
import { generateText } from "ai"

const openai = createOpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL,
    "X-Title": "AccessLaw RAG Chat",
  },
})

export async function POST(request: NextRequest) {
  try {
    const { query, response, documentType } = await request.json()

    if (!query || !response || !documentType) {
      return NextResponse.json({ error: "Missing required fields: query, response, or documentType" }, { status: 400 })
    }

    // Get template fields from backend first
    const templateResponse = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/doc/get-template`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.HF_TOKEN}`,
      },
      body: JSON.stringify({
        document_type: documentType,
      }),
    })

    if (!templateResponse.ok) {
      const errorText = await templateResponse.text() // Read as text if not OK
      throw new Error(
        `Failed to get template: ${templateResponse.status} - ${errorText || templateResponse.statusText}`,
      )
    }

    const templateData = await templateResponse.json()
    const templateFields = templateData.template_fields || {}

    // Define a prompt to instruct the LLM to extract fields
    const prompt = `You are an expert legal assistant. Based on the user's query, the AI's response, and the specified legal document type, extract all relevant information to fill out the fields for the document.
    
    The document type is: "${documentType}".
    
    User Query: "${query}"
    
    AI Response: "${response}"
    
    Please provide the extracted information as a JSON object where keys are the field names (in snake_case, e.g., "party_name", "address", "date_of_incident") and values are the extracted data. If a field cannot be confidently extracted, leave its value as an empty string.
    
    Example for a "legal_notice" document:
    {
      "sender_name": "John Doe",
      "sender_address": "123 Main St, Anytown",
      "recipient_name": "Jane Smith",
      "recipient_address": "456 Oak Ave, Othertown",
      "date_of_notice": "2023-10-26",
      "subject": "Regarding unpaid rent",
      "details_of_claim": "Ms. Smith has failed to pay rent for the months of August, September, and October 2023, totaling $3000.",
      "action_demanded": "Payment of $3000 within 7 days.",
      "consequences": "Legal action will be initiated if payment is not received.",
      "signature": ""
    }
    
    Example for an "fir_draft" document:
    {
      "complainant_name": "Rahul Sharma",
      "complainant_address": "Flat 101, Green Apartments, Delhi",
      "complainant_contact": "9876543210",
      "incident_date": "2023-10-25",
      "incident_time": "14:30",
      "incident_location": "Market Road, Near Central Park",
      "facts_of_incident": "While walking, my phone was snatched by two individuals on a motorcycle. They fled towards the highway.",
      "stolen_items": "One iPhone 13, black, serial number ABC123XYZ",
      "witness_details": "None",
      "requested_action": "Investigation and recovery of stolen property."
    }
    
    Now, extract the fields for the "${documentType}" document based on the provided context:
    `

    const { text } = await generateText({
      model: openai("deepseek-ai/deepseek-coder"), // Using DeepSeek Coder for structured output
      prompt: prompt,
      temperature: 0.2, // Keep temperature low for factual extraction
    })

    let filledFields: Record<string, string> = {}
    try {
      // Attempt to parse the JSON output from the LLM
      // The LLM might wrap the JSON in markdown code blocks, so try to extract it
      const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/)
      if (jsonMatch && jsonMatch[1]) {
        filledFields = JSON.parse(jsonMatch[1])
      } else {
        filledFields = JSON.parse(text) // Fallback if not wrapped in markdown
      }
    } catch (parseError) {
      console.error("Failed to parse LLM response as JSON:", parseError)
      // Fallback: If parsing fails, create basic fields with placeholder values
      Object.keys(templateFields).forEach((field) => {
        filledFields[field] = `[Enter ${field.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}]`
      })
    }

    // Merge with template fields to ensure all fields are present
    const finalFields = { ...templateFields, ...filledFields }

    return NextResponse.json({
      success: true,
      fields: finalFields,
      documentType,
    })
  } catch (error) {
    console.error("Fill template error:", error)
    return NextResponse.json(
      { error: `Failed to fill template: ${error instanceof Error ? error.message : "Unknown error"}` },
      { status: 500 },
    )
  }
}
