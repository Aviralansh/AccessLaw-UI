import { type NextRequest, NextResponse } from "next/server"

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
      throw new Error(`Failed to get template: ${templateResponse.statusText}`)
    }

    const templateData = await templateResponse.json()
    const templateFields = templateData.template_fields || {}

    // Create prompt for LLM to fill template fields
    const fieldsList = Object.keys(templateFields).join(", ")

    const prompt = `You are a legal document assistant. Based on the user's query and the AI response provided, extract and fill the following template fields for a ${documentType.replace("_", " ")} document.

User Query: "${query}"

AI Response: "${response}"

Template Fields to Fill: ${fieldsList}

Instructions:
1. Extract relevant information from the query and response to fill each field
2. Use proper formatting (dates, names, addresses, etc.)
3. If information is not available, use placeholder text like "[Enter Your Name]"
4. For dates, use format like "January 15, 2024"
5. For addresses, include complete address format
6. Return ONLY a JSON object with field names as keys and filled values as values

Example format:
{
  "applicant_name": "John Doe",
  "applicant_address": "123 Main Street, City, State - 123456",
  "date": "January 15, 2024",
  "subject": "Request for Information"
}

Fill the template fields now:`

    // Call OpenRouter API with DeepSeek
    const openRouterResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
        "X-Title": "AccessLaw RAG Chat",
      },
      body: JSON.stringify({
        model: "deepseek/deepseek-chat",
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.1,
        max_tokens: 1000,
      }),
    })

    if (!openRouterResponse.ok) {
      throw new Error(`OpenRouter API failed: ${openRouterResponse.statusText}`)
    }

    const openRouterData = await openRouterResponse.json()
    const llmResponse = openRouterData.choices?.[0]?.message?.content

    if (!llmResponse) {
      throw new Error("No response from LLM")
    }

    // Parse LLM response as JSON
    let filledFields = {}
    try {
      // Extract JSON from response (in case there's extra text)
      const jsonMatch = llmResponse.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        filledFields = JSON.parse(jsonMatch[0])
      } else {
        filledFields = JSON.parse(llmResponse)
      }
    } catch (parseError) {
      console.error("Failed to parse LLM response as JSON:", parseError)
      // Fallback: create basic fields with placeholder values
      filledFields = Object.keys(templateFields).reduce(
        (acc, field) => {
          acc[field] = `[Enter ${field.replace("_", " ").replace(/\b\w/g, (l) => l.toUpperCase())}]`
          return acc
        },
        {} as Record<string, string>,
      )
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
