import { NextResponse } from "next/server"

export async function POST(req: Request) {
  try {
    const { query, response, document_type, user_details } = await req.json()

    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL
    const hfToken = process.env.NEXT_PUBLIC_HF_TOKEN

    if (!backendUrl || !hfToken) {
      return NextResponse.json({ error: "Backend URL or HuggingFace Token not configured" }, { status: 500 })
    }

    const docResponse = await fetch(`${backendUrl}/doc/gen-doc`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${hfToken}`,
      },
      body: JSON.stringify({
        query,
        response,
        document_type,
        user_details,
      }),
    })

    if (!docResponse.ok) {
      const errorText = await docResponse.text() // Read as text if not OK
      console.error("Backend document generation error:", errorText)
      return NextResponse.json(
        { error: errorText || "Backend document generation failed" },
        { status: docResponse.status },
      )
    }

    const result = await docResponse.json()
    return NextResponse.json(result)
  } catch (error) {
    console.error("Error in generate-document API route:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
