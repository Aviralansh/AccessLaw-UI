import { generateText } from "ai"
import { openai } from "@ai-sdk/openai"
import { NextResponse } from "next/server"
import { z } from "zod"

export const maxDuration = 30

const documentSchemas: { [key: string]: z.ZodObject<any> } = {
  legal_notice: z.object({
    sender_name: z.string().describe("Name of the sender"),
    sender_address: z.string().describe("Address of the sender"),
    recipient_name: z.string().describe("Name of the recipient"),
    recipient_address: z.string().describe("Address of the recipient"),
    date: z.string().describe("Date of the notice (YYYY-MM-DD)"),
    subject: z.string().describe("Subject of the legal notice"),
    incident_date: z.string().describe("Date of the incident (YYYY-MM-DD)"),
    incident_description: z.string().describe("Detailed description of the incident"),
    relief_requested: z.string().describe("Specific relief or action requested"),
    legal_basis: z.string().describe("Legal basis for the claim"),
    signature: z.string().describe("Name of the sender for signature"),
  }),
  rental_agreement: z.object({
    landlord_name: z.string().describe("Name of the landlord"),
    landlord_address: z.string().describe("Address of the landlord"),
    tenant_name: z.string().describe("Name of the tenant"),
    tenant_address: z.string().describe("Address of the tenant"),
    property_address: z.string().describe("Address of the rental property"),
    rent_amount: z.string().describe("Monthly rent amount"),
    security_deposit: z.string().describe("Security deposit amount"),
    lease_start_date: z.string().describe("Lease start date (YYYY-MM-DD)"),
    lease_end_date: z.string().describe("Lease end date (YYYY-MM-DD)"),
    terms_and_conditions: z.string().describe("Key terms and conditions of the agreement"),
  }),
  fir_draft: z.object({
    complainant_name: z.string().describe("Name of the complainant"),
    complainant_address: z.string().describe("Address of the complainant"),
    incident_date: z.string().describe("Date of the incident (YYYY-MM-DD)"),
    incident_time: z.string().describe("Time of the incident (HH:MM)"),
    incident_location: z.string().describe("Location where the incident occurred"),
    offense_description: z.string().describe("Detailed description of the offense"),
    accused_details: z.string().describe("Details of the accused, if known"),
    witness_details: z.string().describe("Details of any witnesses, if any"),
    police_station: z.string().describe("Name of the police station"),
  }),
  rti_application: z.object({
    applicant_name: z.string().describe("Name of the applicant"),
    applicant_address: z.string().describe("Address of the applicant"),
    public_authority_name: z.string().describe("Name of the Public Authority"),
    public_authority_address: z.string().describe("Address of the Public Authority"),
    subject_matter: z.string().describe("Subject matter of the information requested"),
    period_of_information: z.string().describe("Period for which information is requested"),
    details_of_information: z.string().describe("Specific details of the information required"),
    declaration: z.string().describe("Declaration by the applicant"),
    date: z.string().describe("Date of application (YYYY-MM-DD)"),
  }),
  affidavit: z.object({
    deponent_name: z.string().describe("Name of the deponent"),
    deponent_address: z.string().describe("Address of the deponent"),
    deponent_age: z.string().describe("Age of the deponent"),
    deponent_occupation: z.string().describe("Occupation of the deponent"),
    statement_of_facts: z.string().describe("Detailed statement of facts being affirmed"),
    date: z.string().describe("Date of affidavit (YYYY-MM-DD)"),
    place: z.string().describe("Place where affidavit is sworn"),
  }),
}

export async function POST(req: Request) {
  try {
    const { query, response, documentType } = await req.json()

    const schema = documentSchemas[documentType]
    if (!schema) {
      return NextResponse.json({ error: "Invalid document type" }, { status: 400 })
    }

    const { object: filledFields } = await generateText({
      model: openai("gpt-4o"),
      prompt: `Based on the following user query and AI response, extract the relevant information to fill the fields for a ${documentType.replace("_", " ")}.
      
      User Query: ${query}
      AI Response: ${response}
      
      Extract the following fields. If a field is not explicitly mentioned or cannot be inferred, leave it as an empty string. Ensure dates are in YYYY-MM-DD format and times in HH:MM format.`,
      schema: schema,
    })

    return NextResponse.json({ fields: filledFields })
  } catch (error) {
    console.error("Error filling template with LLM:", error)
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ error: "An unknown error occurred" }, { status: 500 })
  }
}
