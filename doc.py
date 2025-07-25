from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Dict, Any, Optional
import jinja2
import pdfkit
import base64
import os
import re
from datetime import datetime

app = FastAPI()

# Configure Jinja2 environment
template_loader = jinja2.FileSystemLoader('legal_doc')
template_env = jinja2.Environment(loader=template_loader)

class DocumentRequest(BaseModel):
    query: str
    response: str
    document_type: str = "legal_notice"
    user_details: Optional[Dict[str, Any]] = {}
    dry_run: Optional[bool] = False

class DocumentTypeRequest(BaseModel):
    query: str
    response: str

class TemplateRequest(BaseModel):
    document_type: str

def detect_document_type(query: str, response: str) -> str:
    """
    Detect the type of legal document based on query and response content
    """
    query_lower = query.lower()
    response_lower = response.lower()
    
    # RTI Application
    if any(keyword in query_lower for keyword in ['rti', 'right to information', 'information act', 'public information']):
        return "rti_application"
    
    # FIR Draft
    if any(keyword in query_lower for keyword in ['fir', 'first information report', 'police complaint', 'criminal complaint', 'file case']):
        return "fir_draft"
    
    # Affidavit
    if any(keyword in query_lower for keyword in ['affidavit', 'sworn statement', 'oath', 'declare under oath']):
        return "affidavit"
    
    # Rental Agreement
    if any(keyword in query_lower for keyword in ['rent', 'rental', 'lease', 'tenant', 'landlord', 'property agreement']):
        return "rental_agreement"
    
    # Legal Notice (default)
    return "legal_notice"

def get_template_fields(document_type: str) -> dict:
    """
    Returns a dictionary of expected fields for a given document type.
    This is used for the dry_run to inform the LLM what fields to extract.
    """
    fields = {}
    if document_type == "legal_notice":
        fields = {
            "sender_name": "",
            "sender_address": "",
            "recipient_name": "",
            "recipient_address": "",
            "date_of_notice": "",
            "subject": "",
            "details_of_claim": "",
            "action_demanded": "",
            "consequences": "",
            "signature": ""
        }
    elif document_type == "fir_draft":
        fields = {
            "complainant_name": "",
            "complainant_address": "",
            "complainant_contact": "",
            "incident_date": "",
            "incident_time": "",
            "incident_location": "",
            "facts_of_incident": "",
            "stolen_items": "",
            "witness_details": "",
            "requested_action": ""
        }
    elif document_type == "rti_application":
        fields = {
            "applicant_name": "",
            "applicant_address": "",
            "public_authority": "",
            "department": "",
            "date_of_application": "",
            "information_sought": "",
            "period_of_information": "",
            "payment_details": "",
            "signature": ""
        }
    elif document_type == "affidavit":
        fields = {
            "deponent_name": "",
            "deponent_father_name": "",
            "deponent_address": "",
            "deponent_age": "",
            "deponent_occupation": "",
            "statement_of_facts": "",
            "date_of_affidavit": "",
            "place_of_affidavit": "",
            "signature": ""
        }
    elif document_type == "rental_agreement":
        fields = {
            "landlord_name": "",
            "landlord_address": "",
            "tenant_name": "",
            "tenant_address": "",
            "property_address": "",
            "rent_amount": "",
            "security_deposit": "",
            "agreement_start_date": "",
            "agreement_end_date": "",
            "terms_and_conditions": "",
            "signature_landlord": "",
            "signature_tenant": ""
        }
    # Add more document types and their fields here
    return fields

def generate_document_from_template(document_type: str, data: dict) -> str:
    """
    Generates an HTML string from a Jinja2 template and data.
    """
    try:
        template = template_env.get_template(f'{document_type}.j2')
        html_content = template.render(data)
        return html_content
    except Exception as e:
        print(f"Error rendering template {document_type}.j2: {e}")
        raise

def convert_html_to_pdf(html_content: str, output_filename: str = "document.pdf"):
    """
    Converts an HTML string to a PDF file.
    Requires wkhtmltopdf to be installed and in your PATH.
    """
    try:
        # Ensure the output directory exists
        output_dir = "generated_documents"
        os.makedirs(output_dir, exist_ok=True)
        output_path = os.path.join(output_dir, output_filename)

        # wkhtmltopdf options
        options = {
            'page-size': 'A4',
            'margin-top': '0.75in',
            'margin-right': '0.75in',
            'margin-bottom': '0.75in',
            'margin-left': '0.75in',
            'encoding': "UTF-8",
            'no-stop-slow-scripts': True,
            'enable-local-file-access': True, # Needed if your HTML references local files (e.g., images)
        }

        # Path to wkhtmltopdf executable (adjust if not in PATH)
        # config = pdfkit.configuration(wkhtmltopdf='/usr/local/bin/wkhtmltopdf') # Example for macOS
        # pdfkit.from_string(html_content, output_path, options=options, configuration=config)
        
        # Assuming wkhtmltopdf is in PATH or configured globally
        pdfkit.from_string(html_content, output_path, options=options)
        
        return output_path
    except Exception as e:
        print(f"Error converting HTML to PDF: {e}")
        raise

def get_document_filename(document_type: str) -> str:
    """
    Generates a filename for the document based on its type.
    """
    return f"{document_type.replace('_', '-')}_{os.urandom(4).hex()}.pdf"

@app.post("/detect-document-type")
async def detect_doc_type(request: DocumentTypeRequest):
    """
    Detect the appropriate document type based on user query and AI response
    """
    try:
        detected_type = detect_document_type(request.query, request.response)
        return {
            "detected_type": detected_type,
            "confidence": 0.8  # Placeholder confidence score
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Document type detection failed: {str(e)}")

@app.post("/get-template")
async def get_template_fields_endpoint(request: TemplateRequest):
    """
    Get template fields for a specific document type
    """
    try:
        fields = get_template_fields(request.document_type)
        return {
            "success": True,
            "document_type": request.document_type,
            "template_fields": fields
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get template fields: {str(e)}")

@app.post("/gen-doc")
async def generate_document_endpoint(request: DocumentRequest):
    """
    Generate a legal document based on the query, response, and document type
    """
    try:
        # Get the appropriate template
        template_file = f"{request.document_type}.j2"
        
        try:
            template = template_env.get_template(template_file)
        except jinja2.TemplateNotFound:
            raise HTTPException(status_code=404, detail=f"Template for {request.document_type} not found")
        
        # Prepare template variables
        template_vars = {
            "current_date": datetime.now().strftime("%B %d, %Y"),
            "query": request.query,
            "response": request.response,
            **request.user_details
        }
        
        # Render the template
        html_content = template.render(**template_vars)
        
        # Generate PDF
        filename = get_document_filename(request.document_type)
        pdf_path = convert_html_to_pdf(html_content, filename)
        
        # Encode PDF to base64
        with open(pdf_path, "rb") as pdf_file:
            pdf_base64 = base64.b64encode(pdf_file.read()).decode('utf-8')
        
        return {
            "success": True,
            "document_type": request.document_type,
            "filename": filename,
            "pdf_content": pdf_base64,
            "generation_time": datetime.now().isoformat()
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Document generation failed: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
