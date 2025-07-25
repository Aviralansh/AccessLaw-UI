from jinja2 import Environment, FileSystemLoader
import pdfkit
import os
import json
from datetime import datetime
from typing import Dict, Any

# Setup Jinja2 environment
template_dir = os.path.join(os.path.dirname(__file__), 'legal_doc')
env = Environment(loader=FileSystemLoader(template_dir))

def generate_document_html(document_type: str, data: Dict[str, Any]) -> str:
    """Generates HTML content for a legal document based on its type and provided data."""
    template_name = f"{document_type}.j2"
    try:
        template = env.get_template(template_name)
        return template.render(data)
    except Exception as e:
        raise ValueError(f"Error rendering template {template_name}: {e}")

def generate_pdf_from_html(html_content: str, filename: str) -> bytes:
    """Converts HTML content to a PDF byte string."""
    try:
        # Ensure wkhtmltopdf is in the PATH or specify its path
        # config = pdfkit.configuration(wkhtmltopdf='/usr/local/bin/wkhtmltopdf') # Uncomment and modify if wkhtmltopdf is not in PATH
        options = {
            'page-size': 'A4',
            'margin-top': '20mm',
            'margin-right': '20mm',
            'margin-bottom': '20mm',
            'margin-left': '20mm',
            'encoding': "UTF-8",
            'enable-local-file-access': None # Required for local file access (e.g., CSS)
        }
        pdf_bytes = pdfkit.from_string(html_content, False, options=options)
        return pdf_bytes
    except Exception as e:
        raise RuntimeError(f"Error generating PDF: {e}")

def detect_document_type_from_query(query: str, response: str) -> str:
    """
    (Placeholder) Detects the document type based on the query and AI response.
    In a real application, this would involve an LLM call or more sophisticated logic.
    """
    query_lower = query.lower()
    response_lower = response.lower()

    if "rental agreement" in query_lower or "lease agreement" in query_lower or "rent" in response_lower:
        return "rental_agreement"
    elif "legal notice" in query_lower or "notice period" in query_lower or "demand letter" in query_lower:
        return "legal_notice"
    elif "fir" in query_lower or "first information report" in query_lower or "police complaint" in query_lower:
        return "fir_draft"
    elif "rti application" in query_lower or "right to information" in query_lower:
        return "rti_application"
    elif "affidavit" in query_lower or "sworn statement" in query_lower:
        return "affidavit"
    else:
        return "legal_notice" # Default fallback

def get_template_fields(document_type: str) -> Dict[str, str]:
    """
    (Placeholder) Returns a dictionary of expected fields for a given document type.
    In a real application, this would be dynamically generated or loaded from a schema.
    """
    schemas = {
        "legal_notice": {
            "sender_name": "Sender's Full Name",
            "sender_address": "Sender's Full Address",
            "recipient_name": "Recipient's Full Name",
            "recipient_address": "Recipient's Full Address",
            "date": "Date (YYYY-MM-DD)",
            "subject": "Subject of the Notice",
            "incident_date": "Date of Incident (YYYY-MM-DD)",
            "incident_description": "Detailed Description of Incident",
            "relief_requested": "Specific Relief/Action Requested",
            "legal_basis": "Legal Basis for the Claim",
            "signature": "Sender's Name for Signature",
        },
        "rental_agreement": {
            "landlord_name": "Landlord's Name",
            "landlord_address": "Landlord's Address",
            "tenant_name": "Tenant's Name",
            "tenant_address": "Tenant's Address",
            "property_address": "Rental Property Address",
            "rent_amount": "Monthly Rent Amount",
            "security_deposit": "Security Deposit Amount",
            "lease_start_date": "Lease Start Date (YYYY-MM-DD)",
            "lease_end_date": "Lease End Date (YYYY-MM-DD)",
            "terms_and_conditions": "Key Terms and Conditions",
        },
        "fir_draft": {
            "complainant_name": "Complainant's Name",
            "complainant_address": "Complainant's Address",
            "incident_date": "Date of Incident (YYYY-MM-DD)",
            "incident_time": "Time of Incident (HH:MM)",
            "incident_location": "Location of Incident",
            "offense_description": "Description of Offense",
            "accused_details": "Details of Accused (if known)",
            "witness_details": "Witness Details (if any)",
            "police_station": "Police Station Name",
        },
        "rti_application": {
            "applicant_name": "Applicant's Name",
            "applicant_address": "Applicant's Address",
            "public_authority_name": "Public Authority Name",
            "public_authority_address": "Public Authority Address",
            "subject_matter": "Subject Matter of Information",
            "period_of_information": "Period for Information",
            "details_of_information": "Specific Details of Information Required",
            "declaration": "Declaration by Applicant",
            "date": "Date of Application (YYYY-MM-DD)",
        },
        "affidavit": {
            "deponent_name": "Deponent's Name",
            "deponent_address": "Deponent's Address",
            "deponent_age": "Deponent's Age",
            "deponent_occupation": "Deponent's Occupation",
            "statement_of_facts": "Statement of Facts",
            "date": "Date (YYYY-MM-DD)",
            "place": "Place",
        },
    }
    return schemas.get(document_type, {})

def fill_template_fields_with_llm(query: str, response: str, document_type: str) -> Dict[str, str]:
    """
    (Placeholder) Fills template fields using an LLM based on query and response.
    This function would typically make an API call to an LLM.
    For demonstration, it returns dummy data.
    """
    # In a real scenario, this would involve an LLM call to extract entities
    # For now, we'll return a dummy filled dictionary
    print(f"LLM filling fields for {document_type} based on query: {query} and response: {response}")
    
    # Dummy data for demonstration
    if document_type == "legal_notice":
        return {
            "sender_name": "John Doe",
            "sender_address": "123 Main St, Anytown",
            "recipient_name": "Jane Smith",
            "recipient_address": "456 Oak Ave, Otherville",
            "date": datetime.now().strftime("%Y-%m-%d"),
            "subject": "Regarding breach of contract",
            "incident_date": "2023-01-15",
            "incident_description": "Failure to deliver goods as per agreement dated 2023-01-01.",
            "relief_requested": "Immediate delivery of goods or full refund.",
            "legal_basis": "Breach of contract under Indian Contract Act, 1872.",
            "signature": "John Doe",
        }
    elif document_type == "rental_agreement":
        return {
            "landlord_name": "Mr. Sharma",
            "landlord_address": "789 Pine Ln, City",
            "tenant_name": "Ms. Priya Singh",
            "tenant_address": "101 Maple Dr, Town",
            "property_address": "Flat No. 404, Green Apartments, New Delhi",
            "rent_amount": "INR 15,000",
            "security_deposit": "INR 30,000",
            "lease_start_date": "2024-03-01",
            "lease_end_date": "2025-02-28",
            "terms_and_conditions": "Tenant responsible for utilities. No pets allowed.",
        }
    elif document_type == "fir_draft":
        return {
            "complainant_name": "Rahul Kumar",
            "complainant_address": "H.No. 123, Sector 10, Noida",
            "incident_date": "2024-07-20",
            "incident_time": "14:30",
            "incident_location": "Market Road, Near SBI Bank",
            "offense_description": "Theft of mobile phone from my pocket while walking in the market.",
            "accused_details": "Unknown person, male, approximately 30 years old, wearing a blue shirt.",
            "witness_details": "No direct witnesses.",
            "police_station": "Noida Sector 20 Police Station",
        }
    elif document_type == "rti_application":
        return {
            "applicant_name": "Anjali Devi",
            "applicant_address": "Village & Post - Rampur, Dist. - Lucknow",
            "public_authority_name": "Office of the District Magistrate",
            "public_authority_address": "District Collectorate, Lucknow",
            "subject_matter": "Information regarding village development funds",
            "period_of_information": "Financial years 2020-21 to 2023-24",
            "details_of_information": "Details of funds allocated and utilized for road construction in Rampur village, including contractor details and expenditure reports.",
            "declaration": "I declare that the information sought does not fall under the exemptions of the RTI Act.",
            "date": datetime.now().strftime("%Y-%m-%d"),
        }
    elif document_type == "affidavit":
        return {
            "deponent_name": "Suresh Sharma",
            "deponent_address": "Flat 5B, Ganga Apartments, Pune",
            "deponent_age": "45",
            "deponent_occupation": "Engineer",
            "statement_of_facts": "I, Suresh Sharma, solemnly affirm that the property located at Flat 5B, Ganga Apartments, Pune, is my sole and absolute property, free from all encumbrances.",
            "date": datetime.now().strftime("%Y-%m-%d"),
            "place": "Pune",
        }
    return {}
