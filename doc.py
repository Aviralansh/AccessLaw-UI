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

def extract_template_fields(template_content: str) -> Dict[str, str]:
    """
    Extract template fields from Jinja2 template
    """
    # Find all template variables in the format {{ variable_name }}
    pattern = r'\{\{\s*([^}]+)\s*\}\}'
    matches = re.findall(pattern, template_content)
    
    fields = {}
    for match in matches:
        field_name = match.strip()
        # Remove any filters or default values
        if '|' in field_name:
            field_name = field_name.split('|')[0].strip()
        if 'default(' in field_name:
            field_name = re.sub(r'\s*default$$[^)]*$$', '', field_name).strip()
        
        fields[field_name] = ""
    
    return fields

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
async def get_template_fields(request: TemplateRequest):
    """
    Get template fields for a specific document type
    """
    try:
        template_file = f"{request.document_type}.j2"
        
        try:
            template = template_env.get_template(template_file)
            template_content = template.source
            fields = extract_template_fields(template_content)
            
            return {
                "success": True,
                "document_type": request.document_type,
                "template_fields": fields
            }
        except jinja2.TemplateNotFound:
            raise HTTPException(status_code=404, detail=f"Template for {request.document_type} not found")
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get template fields: {str(e)}")

@app.post("/gen-doc")
async def generate_document(request: DocumentRequest):
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
        
        # Configure PDF options
        options = {
            'page-size': 'A4',
            'margin-top': '0.75in',
            'margin-right': '0.75in',
            'margin-bottom': '0.75in',
            'margin-left': '0.75in',
            'encoding': "UTF-8",
            'no-outline': None,
            'enable-local-file-access': None
        }
        
        # Generate PDF
        pdf_content = pdfkit.from_string(html_content, False, options=options)
        
        # Encode PDF to base64
        pdf_base64 = base64.b64encode(pdf_content).decode('utf-8')
        
        # Generate filename
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"{request.document_type}_{timestamp}.pdf"
        
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
