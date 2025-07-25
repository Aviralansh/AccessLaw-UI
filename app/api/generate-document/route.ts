import { NextResponse } from "next/server"

export const maxDuration = 30

export async function POST(req: Request) {
  try {
    const { query, response, document_type, user_details } = await req.json()

    if (!process.env.NEXT_PUBLIC_BACKEND_URL || !process.env.NEXT_PUBLIC_HF_TOKEN) {
      return NextResponse.json({ error: "Backend URL or Hugging Face Token not configured." }, { status: 500 })
    }

    const backendResponse = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/doc/gen-doc`, {
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
      const errorData = await backendResponse.json()
      return NextResponse.json(
        { error: `Backend document generation failed: ${errorData.detail || backendResponse.statusText}` },
        { status: backendResponse.status },
      )
    }

    const result = await backendResponse.json()
    return NextResponse.json(result)
  } catch (error) {
    console.error("Error in generate-document API route:", error)
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ error: "An unknown error occurred" }, { status: 500 })
  }
}
