import os
import json
import logging
from typing import Dict, List, Optional, Any
from datetime import datetime
from pathlib import Path
from jinja2 import Environment, FileSystemLoader, Template
from reportlab.lib.pagesizes import letter, A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.pdfgen import canvas
import re
from io import BytesIO
import openai
from pydantic import BaseModel, Field

# Configure logging
logger = logging.getLogger(__name__)

class DocumentGenerationRequest(BaseModel):
    query: str = Field(..., description="Original user query")
    response: str = Field(..., description="AI response/context")
    document_type: Optional[str] = Field(None, description="Specific document type to generate")
    user_details: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Additional user details")

class DocumentGenerationResponse(BaseModel):
    success: bool
    document_type: str
    filename: str
    pdf_content: bytes = Field(..., description="Base64 encoded PDF content")
    template_fields: Dict[str, str]
    generation_time: float

class LegalDocumentGenerator:
    def __init__(self, templates_dir: str = "legal_doc"):
        self.templates_dir = Path(templates_dir)
        self.jinja_env = Environment(
            loader=FileSystemLoader(self.templates_dir),
            trim_blocks=True,
            lstrip_blocks=True
        )
        
        # Document type mapping
        self.document_types = {
            'fir': {
                'template': 'fir_draft.j2',
                'name': 'FIR Draft',
                'keywords': ['fir', 'police', 'complaint', 'crime', 'theft', 'fraud', 'assault', 'harassment']
            },
            'legal_notice': {
                'template': 'legal_notice.j2',
                'name': 'Legal Notice',
                'keywords': ['notice', 'legal notice', 'demand', 'breach', 'contract', 'payment', 'dispute']
            },
            'affidavit': {
                'template': 'affidavit.j2',
                'name': 'Affidavit',
                'keywords': ['affidavit', 'sworn statement', 'declaration', 'oath', 'verify', 'certify']
            },
            'rental_agreement': {
                'template': 'rental_aggreement.j2',
                'name': 'Rental Agreement',
                'keywords': ['rent', 'rental', 'lease', 'tenant', 'landlord', 'property', 'accommodation']
            },
            'rti_application': {
                'template': 'rti_application.j2',
                'name': 'RTI Application',
                'keywords': ['rti', 'right to information', 'information', 'government', 'public records']
            }
        }
        
        # Initialize styles for PDF generation
        self.styles = getSampleStyleSheet()
        self._setup_custom_styles()
    
    def _setup_custom_styles(self):
        """Setup custom styles for PDF generation"""
        # Title style
        self.styles.add(ParagraphStyle(
            name='CustomTitle',
            parent=self.styles['Title'],
            fontSize=16,
            spaceAfter=20,
            alignment=TA_CENTER,
            fontName='Helvetica-Bold'
        ))
        
        # Header style
        self.styles.add(ParagraphStyle(
            name='CustomHeader',
            parent=self.styles['Heading1'],
            fontSize=12,
            spaceAfter=12,
            fontName='Helvetica-Bold'
        ))
        
        # Body style
        self.styles.add(ParagraphStyle(
            name='CustomBody',
            parent=self.styles['Normal'],
            fontSize=11,
            spaceAfter=8,
            alignment=TA_JUSTIFY,
            fontName='Helvetica'
        ))
        
        # Signature style
        self.styles.add(ParagraphStyle(
            name='Signature',
            parent=self.styles['Normal'],
            fontSize=11,
            spaceAfter=6,
            alignment=TA_LEFT,
            fontName='Helvetica'
        ))

    def detect_document_type(self, query: str, response: str) -> str:
        """
        Detect the most appropriate document type based on query and response content
        """
        combined_text = f"{query} {response}".lower()
        
        # Score each document type based on keyword matches
        scores = {}
        for doc_type, config in self.document_types.items():
            score = 0
            for keyword in config['keywords']:
                # Count occurrences of each keyword
                score += combined_text.count(keyword.lower())
            scores[doc_type] = score
        
        # Return the document type with highest score, default to legal_notice if no clear match
        if max(scores.values()) == 0:
            return 'legal_notice'  # Default fallback
        
        return max(scores, key=scores.get)

    def extract_template_fields(self, query: str, response: str, document_type: str) -> Dict[str, str]:
        """
        Extract and generate template fields using AI-powered analysis
        """
        template_fields = {}
        current_date = datetime.now().strftime("%d/%m/%Y")
        
        # Common fields for all documents
        template_fields.update({
            'date': current_date,
            'place': 'New Delhi',  # Default, can be customized
        })
        
        # Document-specific field extraction
        if document_type == 'fir':
            template_fields.update({
                'police_station': self._extract_or_default(response, 'police station', 'Local Police Station'),
                'station_address': 'Police Station Address',
                'complainant_name': '[Your Name]',
                'parent_name': '[Father\'s/Mother\'s Name]',
                'complainant_address': '[Your Address]',
                'incident_type': self._extract_incident_type(query, response),
                'incident_date_time': self._extract_or_default(response, 'date', '[Date and Time of Incident]'),
                'incident_location': self._extract_or_default(response, 'location', '[Location of Incident]'),
                'incident_description': self._generate_incident_description(query, response),
                'complainant_contact': '[Your Contact Number]',
                'submission_date': current_date
            })
        
        elif document_type == 'legal_notice':
            template_fields.update({
                'recipient_name': '[Recipient Name]',
                'recipient_address': '[Recipient Address]',
                'notice_date': current_date,
                'subject': self._extract_subject(query, response),
                'sender_name': '[Your Name]',
                'sender_address': '[Your Address]',
                'notice_content': self._generate_notice_content(query, response),
                'resolution_days': '30',
                'sender_contact': '[Your Contact Details]'
            })
        
        elif document_type == 'affidavit':
            template_fields.update({
                'name': '[Your Name]',
                'age': '[Your Age]',
                'parent_name': '[Father\'s/Mother\'s Name]',
                'address': '[Your Address]',
                'declaration_statement': self._generate_declaration(query, response),
                'purpose': self._extract_purpose(query, response),
                'place': '[Place]',
                'date': current_date
            })
        
        elif document_type == 'rental_agreement':
            template_fields.update({
                'agreement_date': current_date,
                'landlord_name': '[Landlord Name]',
                'landlord_address': '[Landlord Address]',
                'tenant_name': '[Tenant Name]',
                'tenant_address': '[Tenant Address]',
                'property_address': '[Property Address]',
                'rent_amount': '[Monthly Rent Amount]',
                'deposit_amount': '[Security Deposit Amount]',
                'duration_months': '11',
                'start_date': '[Start Date]',
                'other_terms': self._generate_rental_terms(query, response)
            })
        
        elif document_type == 'rti_application':
            template_fields.update({
                'department_name': self._extract_department(query, response),
                'department_address': '[Department Address]',
                'applicant_name': '[Your Name]',
                'parent_name': '[Father\'s/Mother\'s Name]',
                'applicant_address': '[Your Address]',
                'information_requested': self._generate_rti_request(query, response),
                'period': '[Time Period]',
                'preferred_format': 'Hard Copy',
                'applicant_contact': '[Your Contact Details]',
                'date': current_date
            })
        
        return template_fields

    def _extract_or_default(self, text: str, keyword: str, default: str) -> str:
        """Extract information based on keyword or return default"""
        # Simple extraction logic - can be enhanced with NLP
        text_lower = text.lower()
        if keyword.lower() in text_lower:
            # Try to extract the relevant part
            sentences = text.split('.')
            for sentence in sentences:
                if keyword.lower() in sentence.lower():
                    return sentence.strip()[:100] + "..." if len(sentence) > 100 else sentence.strip()
        return default

    def _extract_incident_type(self, query: str, response: str) -> str:
        """Extract incident type from query and response"""
        incident_keywords = {
            'theft': 'Theft',
            'fraud': 'Fraud',
            'assault': 'Assault',
            'harassment': 'Harassment',
            'cheating': 'Cheating',
            'domestic violence': 'Domestic Violence',
            'cybercrime': 'Cybercrime'
        }
        
        combined_text = f"{query} {response}".lower()
        for keyword, incident_type in incident_keywords.items():
            if keyword in combined_text:
                return incident_type
        
        return 'General Complaint'

    def _generate_incident_description(self, query: str, response: str) -> str:
        """Generate incident description based on query and response"""
        # Extract key points from the response
        description = f"Based on the circumstances described: {query[:200]}..."
        if len(response) > 100:
            description += f"\n\nAdditional details: {response[:300]}..."
        return description

    def _extract_subject(self, query: str, response: str) -> str:
        """Extract subject for legal notice"""
        # Try to identify the main issue
        if 'payment' in query.lower() or 'money' in query.lower():
            return 'Non-payment of dues'
        elif 'contract' in query.lower() or 'agreement' in query.lower():
            return 'Breach of contract'
        elif 'property' in query.lower():
            return 'Property dispute'
        else:
            return 'Legal matter requiring attention'

    def _generate_notice_content(self, query: str, response: str) -> str:
        """Generate notice content"""
        content = f"This notice is served upon you regarding the matter described as follows:\n\n"
        content += f"Issue: {query}\n\n"
        content += f"Based on legal provisions and circumstances: {response[:400]}..."
        content += f"\n\nYou are hereby called upon to take immediate corrective action to resolve this matter."
        return content

    def _generate_declaration(self, query: str, response: str) -> str:
        """Generate declaration statement for affidavit"""
        return f"the facts and circumstances related to: {query[:200]}... are true and correct to the best of my knowledge and belief."

    def _extract_purpose(self, query: str, response: str) -> str:
        """Extract purpose for affidavit"""
        if 'court' in query.lower():
            return 'court proceedings'
        elif 'application' in query.lower():
            return 'application submission'
        else:
            return 'legal documentation purposes'

    def _generate_rental_terms(self, query: str, response: str) -> str:
        """Generate rental agreement terms"""
        terms = "1. The tenant shall use the property only for residential purposes.\n"
        terms += "2. The tenant shall maintain the property in good condition.\n"
        terms += "3. No subletting without landlord's written consent.\n"
        terms += "4. Rent to be paid by 5th of every month.\n"
        terms += "5. Any damages to be borne by the tenant."
        return terms

    def _extract_department(self, query: str, response: str) -> str:
        """Extract government department for RTI"""
        departments = {
            'education': 'Department of Education',
            'health': 'Department of Health',
            'transport': 'Department of Transport',
            'police': 'Police Department',
            'municipal': 'Municipal Corporation'
        }
        
        combined_text = f"{query} {response}".lower()
        for keyword, dept in departments.items():
            if keyword in combined_text:
                return dept
        
        return '[Relevant Government Department]'

    def _generate_rti_request(self, query: str, response: str) -> str:
        """Generate RTI information request"""
        request = f"I seek the following information under the RTI Act, 2005:\n\n"
        request += f"1. Information related to: {query}\n"
        request += f"2. Relevant documents, records, and correspondence\n"
        request += f"3. Any policies or guidelines applicable to this matter\n"
        request += f"4. Details of officials responsible for this matter"
        return request

    def generate_pdf(self, template_content: str, document_type: str, filename: str) -> bytes:
        """
        Generate PDF from template content
        """
        buffer = BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            rightMargin=72,
            leftMargin=72,
            topMargin=72,
            bottomMargin=18
        )
        
        # Build the document content
        story = []
        
        # Add title
        doc_name = self.document_types[document_type]['name']
        title = Paragraph(doc_name.upper(), self.styles['CustomTitle'])
        story.append(title)
        story.append(Spacer(1, 20))
        
        # Process template content
        lines = template_content.split('\n')
        for line in lines:
            line = line.strip()
            if not line:
                story.append(Spacer(1, 6))
                continue
            
            # Check if line is a header (starts with specific patterns)
            if line.startswith('To,') or line.startswith('Subject:') or line.startswith('Date:'):
                para = Paragraph(line, self.styles['CustomHeader'])
            elif line.startswith('Sincerely,') or line.startswith('(Signature)') or line.startswith('Name:'):
                para = Paragraph(line, self.styles['Signature'])
            else:
                para = Paragraph(line, self.styles['CustomBody'])
            
            story.append(para)
            story.append(Spacer(1, 6))
        
        # Build PDF
        doc.build(story)
        buffer.seek(0)
        return buffer.getvalue()

    def generate_document(self, request: DocumentGenerationRequest) -> DocumentGenerationResponse:
        """
        Main method to generate legal document
        """
        start_time = datetime.now()
        
        try:
            # Detect document type if not specified
            document_type = request.document_type or self.detect_document_type(request.query, request.response)
            
            # Validate document type
            if document_type not in self.document_types:
                raise ValueError(f"Unsupported document type: {document_type}")
            
            # Extract template fields
            template_fields = self.extract_template_fields(request.query, request.response, document_type)
            
            # Merge with user-provided details
            if request.user_details:
                template_fields.update(request.user_details)
            
            # Load and render template
            template_name = self.document_types[document_type]['template']
            template = self.jinja_env.get_template(template_name)
            rendered_content = template.render(**template_fields)
            
            # Generate filename
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"{document_type}_{timestamp}.pdf"
            
            # Generate PDF
            pdf_content = self.generate_pdf(rendered_content, document_type, filename)
            
            generation_time = (datetime.now() - start_time).total_seconds()
            
            return DocumentGenerationResponse(
                success=True,
                document_type=self.document_types[document_type]['name'],
                filename=filename,
                pdf_content=pdf_content,
                template_fields=template_fields,
                generation_time=generation_time
            )
            
        except Exception as e:
            logger.error(f"Document generation error: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Document generation failed: {str(e)}")

    def get_available_document_types(self) -> Dict[str, Dict[str, Any]]:
        """Get list of available document types"""
        return {
            doc_type: {
                'name': config['name'],
                'keywords': config['keywords']
            }
            for doc_type, config in self.document_types.items()
        }
