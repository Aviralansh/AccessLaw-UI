from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any
import requests
import os
import base64
from doc import get_template_fields, generate_document_from_template, convert_html_to_pdf, get_document_filename

app = FastAPI()

# Environment variables for HuggingFace API
HF_API_BASE = os.getenv("HF_API_BASE", "https://api-inference.huggingface.co/models/")
HF_TOKEN = os.getenv("HF_TOKEN") # This should be set in your HuggingFace Space secrets

if not HF_TOKEN:
    raise ValueError("HF_TOKEN environment variable not set.")

# Headers for HuggingFace API requests
HF_HEADERS = {
    "Authorization": f"Bearer {HF_TOKEN}",
    "Content-Type": "application/json"
}

# --- RAG Search Endpoint ---
class SearchRequest(BaseModel):
    query: str
    top_k: int = 3
    rerank: bool = False
    include_scores: bool = False
    filters: Dict[str, Any] = {}

class DocumentMetadata(BaseModel):
    document_id: str
    title: str
    section_number: str = None
    document_type: str
    legal_source: str
    source_category: str

class RAGResult(BaseModel):
    content: str
    metadata: DocumentMetadata
    similarity_score: float

class SearchResponse(BaseModel):
    results: List[RAGResult]
    query: str
    total_results: int
    search_time: float

@app.post("/search", response_model=SearchResponse)
async def search_documents(request: SearchRequest):
    """
    Performs a RAG search using a HuggingFace model.
    """
    model_id = "aviralansh/Legal-RAG-Model" # Replace with your actual RAG model ID
    api_url = f"{HF_API_BASE}{model_id}"

    payload = {
        "inputs": request.query,
        "parameters": {
            "top_k": request.top_k,
            "rerank": request.rerank,
            "include_scores": request.include_scores,
            "filters": request.filters
        }
    }

    try:
        response = requests.post(api_url, headers=HF_HEADERS, json=payload)
        response.raise_for_status() # Raise an exception for HTTP errors (4xx or 5xx)
        rag_data = response.json()

        # Adapt the response structure if necessary
        results = []
        for item in rag_data.get("results", []):
            metadata = item.get("metadata", {})
            results.append(RAGResult(
                content=item.get("content", ""),
                metadata=DocumentMetadata(
                    document_id=metadata.get("document_id", "N/A"),
                    title=metadata.get("title", "N/A"),
                    section_number=metadata.get("section_number"),
                    document_type=metadata.get("document_type", "N/A"),
                    legal_source=metadata.get("legal_source", "N/A"),
                    source_category=metadata.get("source_category", "N/A")
                ),
                similarity_score=item.get("similarity_score", 0.0)
            ))

        return SearchResponse(
            results=results,
            query=rag_data.get("query", request.query),
            total_results=rag_data.get("total_results", len(results)),
            search_time=rag_data.get("search_time", 0.0)
        )

    except requests.exceptions.RequestException as e:
        raise HTTPException(status_code=500, detail=f"HuggingFace API request failed: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {e}")

# --- Document Generation Endpoints ---
class DocumentRequest(BaseModel):
    query: str
    response: str
    document_type: str
    user_details: Dict[str, str] = {}
    dry_run: bool = False # To get template fields without generating PDF

class DocumentDetectionRequest(BaseModel):
    query: str
    response: str

class DocumentDetectionResponse(BaseModel):
    detected_type: str

@app.post("/doc/detect-document-type", response_model=DocumentDetectionResponse)
async def detect_document_type(request: DocumentDetectionRequest):
    """
    Detects the most suitable legal document type based on the user query and AI response.
    """
    model_id = "aviralansh/Legal-Document-Type-Detector" # Replace with your document type detection model
    api_url = f"{HF_API_BASE}{model_id}"

    prompt = f"Based on the following user query and AI response, what type of legal document is most relevant? Choose from: legal_notice, fir_draft, rti_application, affidavit, rental_agreement. If none are suitable, suggest 'other'.\n\nUser Query: {request.query}\nAI Response: {request.response}\n\nDocument Type:"

    payload = {
        "inputs": prompt,
        "parameters": {
            "max_new_tokens": 20,
            "return_full_text": False
        }
    }

    try:
        response = requests.post(api_url, headers=HF_HEADERS, json=payload)
        response.raise_for_status()
        
        # Assuming the model returns text directly, e.g., "legal_notice"
        detected_type = response.json()[0]["generated_text"].strip().lower()
        
        # Basic validation for known types
        known_types = ["legal_notice", "fir_draft", "rti_application", "affidavit", "rental_agreement"]
        if detected_type not in known_types:
            detected_type = "legal_notice" # Fallback to a default if detection is off

        return DocumentDetectionResponse(detected_type=detected_type)

    except requests.exceptions.RequestException as e:
        raise HTTPException(status_code=500, detail=f"HuggingFace document detection API request failed: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred during document type detection: {e}")

@app.post("/doc/get-template-fields")
async def get_doc_template_fields(request: DocumentRequest):
    """
    Returns the expected template fields for a given document type (dry run).
    """
    try:
        fields = get_template_fields(request.document_type)
        return {"template_fields": fields}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve template fields: {e}")

@app.post("/doc/gen-doc")
async def generate_legal_document(request: DocumentRequest):
    """
    Generates a legal document (PDF) based on the detected type and user-provided details.
    """
    try:
        # Use the user_details directly as the data for the template
        template_data = request.user_details
        
        # Generate HTML content from the Jinja2 template
        html_content = generate_document_from_template(request.document_type, template_data)
        
        # Generate a unique filename
        filename = get_document_filename(request.document_type)
        
        # Convert HTML to PDF
        pdf_path = convert_html_to_pdf(html_content, filename)
        
        # Read the generated PDF file
        with open(pdf_path, "rb") as f:
            pdf_bytes = f.read()
        
        # Encode PDF to base64
        pdf_base64 = base64.b64encode(pdf_bytes).decode('utf-8')
        
        # Clean up the generated PDF file
        os.remove(pdf_path)
        
        return {
            "success": True,
            "filename": filename,
            "pdf_content": pdf_base64
        }
    except Exception as e:
        print(f"Error during document generation: {e}")
        raise HTTPException(status_code=500, detail=f"Document generation failed: {e}")
