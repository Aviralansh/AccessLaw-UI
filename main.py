from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any
import base64
import os
from doc import generate_document_html, generate_pdf_from_html, detect_document_type_from_query, get_template_fields, fill_template_fields_with_llm

app = FastAPI()

class SearchQuery(BaseModel):
    query: str
    top_k: int = 3
    rerank: bool = False
    include_scores: bool = False
    filters: Dict[str, Any] = {}

class DocumentGenerationRequest(BaseModel):
    query: str
    response: str
    document_type: str
    user_details: Dict[str, str]

class DocumentTypeDetectionRequest(BaseModel):
    query: str
    response: str

class FillTemplateRequest(BaseModel):
    query: str
    response: str
    documentType: str

@app.post("/search")
async def search_rag(search_query: SearchQuery):
    """
    (Placeholder) Simulates a RAG search.
    In a real application, this would query a RAG system (e.g., using Haystack, LlamaIndex).
    """
    print(f"Received search query: {search_query.query}")
    # Dummy RAG response
    dummy_results = [
        {
            "content": "Section 10 of the Indian Contract Act, 1872 states that all agreements are contracts if they are made by the free consent of parties competent to contract, for a lawful consideration and with a lawful object, and are not hereby expressly declared to be void.",
            "metadata": {
                "document_id": "ICA-1872-S10",
                "title": "Indian Contract Act, 1872",
                "section_number": "10",
                "document_type": "Act",
                "legal_source": "Statute",
                "source_category": "Primary Law"
            },
            "similarity_score": 0.95
        },
        {
            "content": "A legal notice is a formal written communication between parties. It is a way to inform the recipient that the sender is contemplating legal action against them.",
            "metadata": {
                "document_id": "LN-Guide-001",
                "title": "Guide to Legal Notices",
                "document_type": "Guide",
                "legal_source": "Legal Blog",
                "source_category": "Secondary Law"
            },
            "similarity_score": 0.88
        }
    ]
    return {
        "results": dummy_results[:search_query.top_k],
        "query": search_query.query,
        "total_results": len(dummy_results),
        "search_time": 0.15 # Simulated search time
    }

@app.post("/doc/detect-document-type")
async def detect_doc_type(request: DocumentTypeDetectionRequest):
    """Detects the type of legal document based on query and response."""
    detected_type = detect_document_type_from_query(request.query, request.response)
    return {"detected_type": detected_type}

@app.post("/doc/get-template-fields")
async def get_fields(document_type: str):
    """Returns the expected fields for a given document type."""
    fields = get_template_fields(document_type)
    return {"fields": fields}

@app.post("/doc/fill-template-with-llm")
async def fill_template(request: FillTemplateRequest):
    """Fills template fields using an LLM based on query and response."""
    filled_fields = fill_template_fields_with_llm(request.query, request.response, request.documentType)
    return {"fields": filled_fields}

@app.post("/doc/gen-doc")
async def generate_document(request: DocumentGenerationRequest):
    """Generates a legal document (PDF) based on the detected type and filled fields."""
    try:
        html_content = generate_document_html(request.document_type, request.user_details)
        
        # Generate a dynamic filename
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"{request.document_type}_{timestamp}.pdf"
        
        pdf_bytes = generate_pdf_from_html(html_content, filename)
        
        return {
            "filename": filename,
            "pdf_content": base64.b64encode(pdf_bytes).decode('utf-8')
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {e}")
