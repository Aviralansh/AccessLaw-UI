import os
import json
import logging
import base64
from typing import Dict, List, Optional, Any
from datetime import datetime
from pathlib import Path
from jinja2 import Environment, FileSystemLoader
from weasyprint import HTML, CSS
from weasyprint.text.fonts import FontConfiguration
import re

# Configure logging
logger = logging.getLogger(__name__)

class DocumentGenerationRequest(BaseModel):
    query: str = Field(..., description="Original user query")
    response: str = Field(..., description="AI response/context")
    document_type: Optional[str] = Field(None, description="Specific document type to generate")
    user_details: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Additional user details")
    dry_run: Optional[bool] = Field(False, description="If true, only return template fields without generating PDF")

class DocumentGenerationResponse(BaseModel):
    success: bool
    document_type: str
    filename: Optional[str] = None
    pdf_content: Optional[str] = Field(None, description="Base64 encoded PDF content")
    template_fields: Dict[str, str]
    generation_time: float

class DocumentGenerator:
    def __init__(self):
        self.template_dir = "legal_doc"
        self.env = Environment(loader=FileSystemLoader(self.template_dir))
        
        # Document type mappings
        self.doc_types = {
            "rti_application": "rti_application.j2",
            "fir_draft": "fir_draft.j2", 
            "legal_notice": "legal_notice.j2",
            "affidavit": "affidavit.j2",
            "rental_agreement": "rental_aggreement.j2"
        }
        
        # Default field mappings for each document type
        self.default_fields = {
            "rti_application": {
                "applicant_name": "[Your Name]",
                "applicant_address": "[Your Address]",
                "applicant_phone": "[Your Phone]",
                "applicant_email": "[Your Email]",
                "pio_name": "[Public Information Officer Name]",
                "department_name": "[Department/Office Name]",
                "department_address": "[Department Address]",
                "information_requested": "[Describe the information you are seeking]",
                "purpose": "[Purpose for seeking information]",
                "date": datetime.now().strftime("%Y-%m-%d"),
                "place": "[Your City]"
            },
            "fir_draft": {
                "complainant_name": "[Your Name]",
                "complainant_address": "[Your Address]",
                "complainant_phone": "[Your Phone]",
                "police_station": "[Police Station Name]",
                "incident_date": "[Date of Incident]",
                "incident_time": "[Time of Incident]",
                "incident_place": "[Place of Incident]",
                "accused_name": "[Accused Person Name]",
                "accused_address": "[Accused Address if known]",
                "incident_description": "[Detailed description of the incident]",
                "witnesses": "[Names and addresses of witnesses if any]",
                "date": datetime.now().strftime("%Y-%m-%d"),
                "place": "[Your City]"
            },
            "legal_notice": {
                "sender_name": "[Your Name]",
                "sender_address": "[Your Address]",
                "sender_phone": "[Your Phone]",
                "sender_email": "[Your Email]",
                "recipient_name": "[Recipient Name]",
                "recipient_address": "[Recipient Address]",
                "subject": "[Subject of the Notice]",
                "facts": "[Statement of facts and circumstances]",
                "demand": "[Your demands/requirements]",
                "time_limit": "[Time limit for compliance, e.g., 15 days]",
                "consequences": "[Consequences of non-compliance]",
                "date": datetime.now().strftime("%Y-%m-%d"),
                "place": "[Your City]"
            },
            "affidavit": {
                "deponent_name": "[Your Name]",
                "deponent_age": "[Your Age]",
                "deponent_occupation": "[Your Occupation]",
                "deponent_address": "[Your Address]",
                "case_details": "[Case number and court details if applicable]",
                "statement_facts": "[Statement of facts under oath]",
                "purpose": "[Purpose of the affidavit]",
                "date": datetime.now().strftime("%Y-%m-%d"),
                "place": "[Your City]"
            },
            "rental_agreement": {
                "landlord_name": "[Landlord Name]",
                "landlord_address": "[Landlord Address]",
                "landlord_phone": "[Landlord Phone]",
                "tenant_name": "[Tenant Name]",
                "tenant_address": "[Tenant Address]",
                "tenant_phone": "[Tenant Phone]",
                "property_address": "[Property Address]",
                "property_description": "[Property Description]",
                "rent_amount": "[Monthly Rent Amount]",
                "security_deposit": "[Security Deposit Amount]",
                "lease_start_date": "[Lease Start Date]",
                "lease_duration": "[Lease Duration, e.g., 11 months]",
                "terms_conditions": "[Additional terms and conditions]",
                "date": datetime.now().strftime("%Y-%m-%d"),
                "place": "[City]"
            }
        }

    def detect_document_type(self, query: str, response: str) -> str:
        """Detect document type based on query and response content"""
        text = (query + " " + response).lower()
        
        # Keywords for different document types
        keywords = {
            "rti_application": ["rti", "right to information", "information", "government", "public information"],
            "fir_draft": ["fir", "police", "complaint", "crime", "incident", "theft", "fraud", "assault"],
            "legal_notice": ["notice", "legal notice", "demand", "breach", "contract", "violation"],
            "affidavit": ["affidavit", "sworn statement", "oath", "depose", "court", "verification"],
            "rental_agreement": ["rent", "rental", "lease", "tenant", "landlord", "property", "agreement"]
        }
        
        scores = {}
        for doc_type, words in keywords.items():
            score = sum(1 for word in words if word in text)
            scores[doc_type] = score
        
        # Return the document type with highest score, default to legal_notice
        return max(scores.items(), key=lambda x: x[1])[0] if max(scores.values()) > 0 else "legal_notice"

    def extract_fields_from_content(self, query: str, response: str, doc_type: str) -> dict:
        """Extract relevant fields from query and response content"""
        fields = self.default_fields[doc_type].copy()
        
        # Simple extraction logic - can be enhanced with NLP
        text = query + " " + response
        
        # Extract names (basic pattern matching)
        name_patterns = [
            r"my name is ([A-Za-z\s]+)",
            r"i am ([A-Za-z\s]+)",
            r"name: ([A-Za-z\s]+)"
        ]
        
        for pattern in name_patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                name = match.group(1).strip().title()
                if "name" in fields:
                    for field_key in fields:
                        if "name" in field_key and fields[field_key] == f"[{field_key.replace('_', ' ').title()}]":
                            fields[field_key] = name
                            break
        
        # Extract dates
        date_patterns = [
            r"on (\d{1,2}[/-]\d{1,2}[/-]\d{2,4})",
            r"date: (\d{1,2}[/-]\d{1,2}[/-]\d{2,4})"
        ]
        
        for pattern in date_patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                date = match.group(1)
                for field_key in fields:
                    if "date" in field_key and "incident" in field_key:
                        fields[field_key] = date
                        break
        
        # Extract amounts (for rental agreements)
        if doc_type == "rental_agreement":
            amount_patterns = [
                r"rent.*?(\d+)",
                r"amount.*?(\d+)",
                r"rs\.?\s*(\d+)"
            ]
            
            for pattern in amount_patterns:
                match = re.search(pattern, text, re.IGNORECASE)
                if match:
                    amount = match.group(1)
                    if fields.get("rent_amount") == "[Monthly Rent Amount]":
                        fields["rent_amount"] = f"Rs. {amount}"
                    break
        
        return fields

    def generate_document(self, request: DocumentGenerationRequest) -> DocumentGenerationResponse:
        """Generate legal document based on query and response"""
        
        # Detect document type if not provided
        doc_type = request.document_type or self.detect_document_type(request.query, request.response)
        
        # Get template
        if doc_type not in self.doc_types:
            doc_type = "legal_notice"  # fallback
        
        template_file = self.doc_types[doc_type]
        
        # Extract fields from content
        fields = self.extract_fields_from_content(request.query, request.response, doc_type)
        
        # Override with user-provided details
        if request.user_details:
            fields.update(request.user_details)
        
        # If dry run, just return the fields
        if request.dry_run:
            return DocumentGenerationResponse(
                success=True,
                document_type=doc_type,
                template_fields=fields,
                generation_time=0.0
            )
        
        try:
            template = self.env.get_template(template_file)
            html_content = template.render(**fields)
            
            # Generate PDF
            font_config = FontConfiguration()
            html_doc = HTML(string=html_content)
            
            # Basic CSS for styling
            css = CSS(string="""
                @page {
                    size: A4;
                    margin: 1in;
                }
                body {
                    font-family: 'Times New Roman', serif;
                    font-size: 12pt;
                    line-height: 1.5;
                    color: #000;
                }
                .header {
                    text-align: center;
                    font-weight: bold;
                    margin-bottom: 20px;
                    text-decoration: underline;
                }
                .content {
                    text-align: justify;
                    margin-bottom: 15px;
                }
                .signature {
                    margin-top: 40px;
                    text-align: right;
                }
                .date-place {
                    margin-top: 30px;
                }
            """)
            
            pdf_bytes = html_doc.write_pdf(font_config=font_config, stylesheets=[css])
            pdf_base64 = base64.b64encode(pdf_bytes).decode('utf-8')
            
            # Generate filename
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"{doc_type}_{timestamp}.pdf"
            
            generation_time = (datetime.now() - datetime.now()).total_seconds()  # Placeholder for actual timing
            
            return DocumentGenerationResponse(
                success=True,
                document_type=doc_type,
                filename=filename,
                pdf_content=pdf_base64,
                template_fields=fields,
                generation_time=generation_time
            )
            
        except Exception as e:
            logger.error(f"Document generation error: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Document generation failed: {str(e)}")

    def get_available_document_types(self) -> Dict[str, Dict[str, Any]]:
        """Get list of available document types"""
        return {
            doc_type: {
                'name': doc_type.replace('_', ' ').title(),
                'keywords': []
            }
            for doc_type in self.doc_types.keys()
        }
