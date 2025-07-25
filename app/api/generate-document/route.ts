import { type NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest) {
  try {
    const { query, response, document_type, user_details } = await req.json()

    // Call the FastAPI backend for document generation - Updated endpoint
    const backendResponse = await fetch("https://aviralansh-accesslaw-doc.hf.space/gen-doc", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        response,
        document_type,
        user_details: user_details || {},
      }),
    })

    if (!backendResponse.ok) {
      const errorText = await backendResponse.text()
      console.error("Backend API error:", errorText)
      throw new Error(`Backend API error: ${backendResponse.status}`)
    }

    const result = await backendResponse.json()

    return NextResponse.json({
      success: result.success,
      document_type: result.document_type,
      filename: result.filename,
      pdf_content: Buffer.from(result.pdf_content).toString("base64"),
      template_fields: result.template_fields,
      generation_time: result.generation_time,
    })
  } catch (error) {
    console.error("Document generation error:", error)
    return NextResponse.json({ error: "Failed to generate document" }, { status: 500 })
  }
}
