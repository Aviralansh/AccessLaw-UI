import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { query, response, document_type, user_details } = body

    // Forward the request to the Python backend
    const backendResponse = await fetch("https://aviralansh-accesslaw-doc.hf.space/gen-doc", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.NEXT_PUBLIC_HF_TOKEN}`,
      },
      body: JSON.stringify({
        query,
        response,
        document_type,
        user_details,
      }),
    })

    if (!backendResponse.ok) {
      throw new Error(`Backend request failed: ${backendResponse.status}`)
    }

    const result = await backendResponse.json()

    return NextResponse.json(result)
  } catch (error) {
    console.error("Document generation error:", error)
    return NextResponse.json({ error: "Failed to generate document" }, { status: 500 })
  }
}
