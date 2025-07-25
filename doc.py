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
from pydantic import BaseModel, Field
from fastapi import HTTPException

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
    pdf_content: Optional[bytes] = Field(None, description="Base64 encoded PDF content")
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
                'keywords': ['fir', 'police', 'complaint', 'crime', 'theft', 'fraud', 'assault', 'harassment', 'criminal', 'case', 'lodge']
            },
            'legal_notice': {
                'template': 'legal_notice.j2',
                'name': 'Legal Notice',
                'keywords': ['notice', 'legal notice', 'demand', 'breach', 'contract', 'payment', 'dispute', 'warning', 'violation']
            },
            'affidavit': {
                'template': 'affidavit.j2',
                'name': 'Affidavit',
                'keywords': ['affidavit', 'sworn statement', 'declaration', 'oath', 'verify', 'certify', 'attest', 'affirm']
            },
            'rental_agreement': {
                'template': 'rental_aggreement.j2',
                'name': 'Rental Agreement',
                'keywords': ['rent', 'rental', 'lease', 'tenant', 'landlord', 'property', 'accommodation', 'housing']
            },
            'rti_application': {
                'template': 'rti_application.j2',
                'name': 'RTI Application',
                'keywords': ['rti', 'right to information', 'information', 'government', 'public records', 'transparency']
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
                # Count occurrences of each keyword with higher weight for exact matches
                if keyword.lower() in combined_text:
                    # Give higher score for exact keyword matches
                    score += combined_text.count(keyword.lower()) * 2
                    # Additional score for word boundaries
                    import re
                    if re.search(r'\b' + re.escape(keyword.lower()) + r'\b', combined_text):
                        score += 3
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
                'station_address': '[Police Station Address]',
                'complainant_name': '[Your Full Name]',
                'parent_name': '[Father\'s/Mother\'s Name]',
                'complainant_address': '[Your Complete Address]',
                'incident_type': self._extract_incident_type(query, response),
                'incident_date_time': self._extract_or_default(response, 'date', '[Date and Time of Incident]'),
                'incident_location': self._extract_or_default(response, 'location', '[Location of Incident]'),
                'incident_description': self._generate_incident_description(query, response),
                'complainant_contact': '[Your Contact Number]',
                'submission_date': current_date
            })
        
        elif document_type == 'legal_notice':
            template_fields.update({
                'recipient_name': '[Recipient Full Name]',
                'recipient_address': '[Recipient Complete Address]',
                'notice_date': current_date,
                'subject': self._extract_subject(query, response),
                'sender_name': '[Your Full Name]',
                'sender_address': '[Your Complete Address]',
                'notice_content': self._generate_notice_content(query, response),
                'resolution_days': '30',
                'sender_contact': '[Your Contact Details]'
            })
        
        elif document_type == 'affidavit':
            template_fields.update({
                'name': '[Your Full Name]',
                'age': '[Your Age]',
                'parent_name': '[Father\'s/Mother\'s Name]',
                'address': '[Your Complete Address]',
                'declaration_statement': self._generate_declaration(query, response),
                'purpose': self._extract_purpose(query, response),
                'place': '[Place]',
                'date': current_date
            })
        
        elif document_type == 'rental_agreement':
            template_fields.update({
                'agreement_date': current_date,
                'landlord_name': '[Landlord Full Name]',
                'landlord_address': '[Landlord Complete Address]',
                'tenant_name': '[Tenant Full Name]',
                'tenant_address': '[Tenant Complete Address]',
                'property_address': '[Property Complete Address]',
                'rent_amount': '[Monthly Rent Amount]',
                'deposit_amount': '[Security Deposit Amount]',
                'duration_months': '11',
                'start_date': '[Agreement Start Date]',
                'other_terms': self._generate_rental_terms(query, response)
            })
        
        elif document_type == 'rti_application':
            template_fields.update({
                'department_name': self._extract_department(query, response),
                'department_address': '[Department Complete Address]',
                'applicant_name': '[Your Full Name]',
                'parent_name': '[Father\'s/Mother\'s Name]',
                'applicant_address': '[Your Complete Address]',
                'information_requested': self._generate_rti_request(query, response),
                'period': '[Time Period for Information]',
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
            'cheating': 'Cheating and Fraud',
            'assault': 'Assault',
            'harassment': 'Harassment',
            'domestic violence': 'Domestic Violence',
            'cybercrime': 'Cybercrime',
            'fake case': 'False Case/Complaint',
            'defamation': 'Defamation',
            'extortion': 'Extortion',
            'bribery': 'Bribery',
            'corruption': 'Corruption'
        }
        
        combined_text = f"{query} {response}".lower()
        for keyword, incident_type in incident_keywords.items():
            if keyword in combined_text:
                return incident_type
        
        return 'General Legal Complaint'

    def _generate_incident_description(self, query: str, response: str) -> str:
        """Generate incident description based on query and response"""
        # Extract key points from the query and response
        description = f"Based on the circumstances described in the query: {query[:300]}..."
        if len(response) > 100:
            # Extract relevant legal context from response
            response_excerpt = response[:400] + "..." if len(response) > 400 else response
            description += f"\n\nRelevant legal context: {response_excerpt}"
        description += "\n\n[Please provide detailed description of the incident including date, time, location, persons involved, and sequence of events]"
        return description

    def _extract_subject(self, query: str, response: str) -> str:
        """Extract subject for legal notice"""
        query_lower = query.lower()
        if 'payment' in query_lower or 'money' in query_lower or 'dues' in query_lower:
            return 'Non-payment of dues and recovery of amount'
        elif 'contract' in query_lower or 'agreement' in query_lower:
            return 'Breach of contract and specific performance'
        elif 'property' in query_lower:
            return 'Property dispute and possession rights'
        elif 'defamation' in query_lower:
            return 'Defamation and damage to reputation'
        elif 'harassment' in query_lower:
            return 'Harassment and mental agony'
        else:
            return 'Legal matter requiring immediate attention'

    def _generate_notice_content(self, query: str, response: str) -> str:
        """Generate notice content"""
        content = f"This legal notice is served upon you regarding the matter described as follows:\n\n"
        content += f"Issue/Grievance: {query}\n\n"
        
        # Extract key legal points from response
        if len(response) > 200:
            content += f"Legal Context: Based on applicable laws and legal provisions, {response[:300]}...\n\n"
        
        content += "You are hereby called upon to take immediate corrective action and resolve this matter amicably. "
        content += "Failure to comply with this notice within the stipulated time will compel me to initiate appropriate legal proceedings against you at your risk, cost, and consequences.\n\n"
        content += "[Please specify exact demands, actions required, and consequences of non-compliance]"
        
        return content

    def _generate_declaration(self, query: str, response: str) -> str:
        """Generate declaration statement for affidavit"""
        declaration = f"the facts and circumstances related to the matter described as: {query[:200]}... are true and correct to the best of my knowledge and belief."
        if 'legal' in response.lower():
            declaration += " I have been advised of my legal rights and obligations in this matter."
        return declaration

    def _extract_purpose(self, query: str, response: str) -> str:
        """Extract purpose for affidavit"""
        query_lower = query.lower()
        if 'court' in query_lower:
            return 'court proceedings and legal documentation'
        elif 'application' in query_lower:
            return 'application submission and verification'
        elif 'employment' in query_lower:
            return 'employment and professional purposes'
        elif 'property' in query_lower:
            return 'property documentation and verification'
        else:
            return 'legal documentation and verification purposes'

    def _generate_rental_terms(self, query: str, response: str) -> str:
        """Generate rental agreement terms"""
        terms = "1. The tenant shall use the property only for residential purposes.\n"
        terms += "2. The tenant shall maintain the property in good condition and bear the cost of any damages.\n"
        terms += "3. No subletting or assignment without landlord's prior written consent.\n"
        terms += "4. Monthly rent to be paid by 5th of every month without fail.\n"
        terms += "5. Electricity, water, and other utility charges to be borne by the tenant.\n"
        terms += "6. The landlord has the right to inspect the property with prior notice.\n"
        terms += "7. Either party can terminate the agreement with one month's prior notice."
        return terms

    def _extract_department(self, query: str, response: str) -> str:
        """Extract government department for RTI"""
        departments = {
            'education': 'Department of Education',
            'school': 'Department of Education', 
            'health': 'Department of Health and Family Welfare',
            'hospital': 'Department of Health and Family Welfare',
            'transport': 'Department of Transport',
            'police': 'Police Department',
            'municipal': 'Municipal Corporation',
            'tax': 'Income Tax Department',
            'passport': 'Passport Office',
            'election': 'Election Commission',
            'railway': 'Ministry of Railways',
            'postal': 'Department of Posts'
        }
        
        combined_text = f"{query} {response}".lower()
        for keyword, dept in departments.items():
            if keyword in combined_text:
                return dept
        
        return '[Relevant Government Department/Office]'

    def _generate_rti_request(self, query: str, response: str) -> str:
        """Generate RTI information request"""
        request = f"I seek the following information under the Right to Information Act, 2005:\n\n"
        request += f"1. Information related to: {query[:200]}...\n"
        request += f"2. All relevant documents, records, files, and correspondence related to the above matter\n"
        request += f"3. Copies of applicable policies, guidelines, rules, and regulations\n"
        request += f"4. Details of officials/officers responsible for handling such matters\n"
        request += f"5. Any other relevant information that may assist in understanding the matter"
        
        if 'complaint' in query.lower():
            request += f"\n6. Status and action taken on any complaints filed in this regard"
        
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
            
            generation_time = (datetime.now() - start_time).total_seconds()
            
            # If dry_run, just return the template fields
            if request.dry_run:
                return DocumentGenerationResponse(
                    success=True,
                    document_type=self.document_types[document_type]['name'],
                    template_fields=template_fields,
                    generation_time=generation_time
                )
            
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
