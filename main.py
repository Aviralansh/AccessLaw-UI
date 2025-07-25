import os
import logging
from typing import List, Dict, Optional, Any
from datetime import datetime
from dataclasses import dataclass
from contextlib import asynccontextmanager
import base64

# FastAPI components
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, Field
import uvicorn

# Import the enhanced embedder and document generator
from embedd_constitution import EnhancedLegalDocumentEmbedder
from doc import DocumentGenerator

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Configuration
@dataclass
class Config:
    # ChromaDB settings
    DATA_ROOT: str = os.getenv("DATA_ROOT", "/data")
    CHROMA_PERSIST_DIR: str = os.getenv("CHROMA_PERSIST_DIR", "./legal_chroma_db")
    CHROMA_COLLECTION_NAME: str = os.getenv("CHROMA_COLLECTION_NAME", "indian_laws_v2")
    
    # Server settings
    SERVER_HOST: str = os.getenv("SERVER_HOST", "0.0.0.0")
    SERVER_PORT: int = int(os.getenv("SERVER_PORT", "7860"))
    
    # Search settings - memory efficient defaults
    DEFAULT_TOP_K: int = int(os.getenv("DEFAULT_TOP_K", "2"))
    MAX_TOP_K: int = int(os.getenv("MAX_TOP_K", "10"))

config = Config()

# Pydantic models for API requests/responses
class SearchRequest(BaseModel):
    query: str = Field(..., description="The search query text")
    top_k: Optional[int] = Field(default=3, description="Number of results to return (max 10)", le=10, ge=1)
    rerank: Optional[bool] = Field(default=False, description="Whether to use reranking (memory intensive)")
    filters: Optional[Dict[str, Any]] = Field(default=None, description="Optional metadata filters")
    include_scores: Optional[bool] = Field(default=False, description="Whether to include similarity scores")

class SearchResult(BaseModel):
    content: str
    metadata: Dict[str, Any]
    similarity_score: float
    rerank_score: Optional[float] = None
    combined_score: Optional[float] = None
    scores: Optional[Dict[str, float]] = None
    
class RootResponse(BaseModel):
    message: str
    status: str

class SearchResponse(BaseModel):
    results: List[SearchResult]
    query: str
    total_results: int
    search_time: float

class HealthResponse(BaseModel):
    status: str
    collection_name: str
    total_documents: int
    server_time: datetime

class DocumentTypesResponse(BaseModel):
    document_types: Dict[str, Dict[str, Any]]
    total_types: int

class DetectDocumentTypeRequest(BaseModel):
    query: str = Field(..., description="User query")
    response: str = Field(..., description="AI response")

class DetectDocumentTypeResponse(BaseModel):
    detected_type: str
    document_name: str
    confidence: str

class DocumentRequest(BaseModel):
    query: str
    response: str
    document_type: Optional[str] = None
    user_details: Optional[Dict[str, str]] = None
    dry_run: bool = False

class DocumentTypeRequest(BaseModel):
    query: str
    response: str

# Global instances
embedder = None
doc_generator = None

# Lifespan context manager for startup/shutdown
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    global embedder, doc_generator
    logger.info("Starting Enhanced Legal Search API...")
    
    try:
        embedder = EnhancedLegalDocumentEmbedder(
            data_root=config.DATA_ROOT,
            collection_name=config.CHROMA_COLLECTION_NAME,
            persist_directory=config.CHROMA_PERSIST_DIR
        )
        
        # Initialize document generator
        doc_generator = DocumentGenerator()
        
        # Get collection info
        collection_stats = embedder.get_collection_stats()
        total_docs = collection_stats.get('total_chunks', 0)
        
        logger.info(f"Enhanced Legal Search Service initialized with {total_docs} document chunks")
        logger.info("Document generation service initialized")
        
    except Exception as e:
        logger.error(f"Failed to initialize services: {str(e)}")
        raise RuntimeError(f"Service initialization failed: {str(e)}")
    
    logger.info("API startup complete")
    yield
    
    # Shutdown
    logger.info("Shutting down Enhanced Legal Search API...")
    embedder = None
    doc_generator = None
    logger.info("API shutdown complete")

# FastAPI App
app = FastAPI(
    title="AccessLaw Document Generator API",
    description="Advanced API for searching Indian Legal Documents and generating legal documents",
    version="2.1.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/", response_model=RootResponse)
async def root():
    """Root endpoint with API information."""
    return {
        "message": "AccessLaw Document Generator API",
        "status": "active"
    }

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint."""
    if not embedder:
        raise HTTPException(status_code=503, detail="Service not initialized")
    
    try:
        collection_info = embedder.get_collection_stats()
        return HealthResponse(
            status="healthy",
            collection_name=config.CHROMA_COLLECTION_NAME,
            total_documents=collection_info.get("total_chunks", 0),
            server_time=datetime.now()
        )
    except Exception as e:
        logger.error(f"Health check error: {str(e)}")
        return HealthResponse(
            status="error",
            collection_name=config.CHROMA_COLLECTION_NAME,
            total_documents=0,
            server_time=datetime.now()
        )

@app.post("/search", response_model=SearchResponse)
async def search_documents(request: SearchRequest):
    """
    Enhanced search for legal documents using semantic similarity and optional reranking.
    
    This endpoint provides advanced search capabilities including:
    - Semantic similarity search using BGE embeddings
    - Optional cross-encoder reranking for improved relevance (memory intensive)
    - Legal document structure-aware chunking
    - Optional metadata filtering
    """
    if not embedder:
        raise HTTPException(status_code=503, detail="Service not initialized")
    
    start_time = datetime.now()
    
    try:
        # Use the embedder's enhanced_query method directly
        results = embedder.enhanced_query(
            query_text=request.query,
            n_results=request.top_k or config.DEFAULT_TOP_K,
            rerank=request.rerank or False,
            filter_metadata=request.filters,
            include_scores=request.include_scores or False
        )
        
        search_time = (datetime.now() - start_time).total_seconds()
        
        # Format response
        formatted_results = [
            SearchResult(
                content=result['text'],
                metadata=result['metadata'],
                similarity_score=result['similarity_score'],
                rerank_score=result.get('rerank_score'),
                combined_score=result.get('combined_score'),
                scores=result.get('scores')
            )
            for result in results
        ]
        
        logger.info(f"Search completed in {search_time:.3f}s, found {len(formatted_results)} results, asked: {request.query}")
        
        return SearchResponse(
            results=formatted_results,
            query=request.query,
            total_results=len(formatted_results),
            search_time=search_time
        )
        
    except Exception as e:
        logger.error(f"Search error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")

@app.get("/collection/info")
async def get_collection_info():
    """
    Get detailed information about the legal document collection.
    """
    if not embedder:
        raise HTTPException(status_code=503, detail="Service not initialized")
    
    try:
        stats = embedder.get_collection_stats()
        return {
            "name": config.CHROMA_COLLECTION_NAME,
            "document_count": stats.get('total_chunks', 0),
            "document_types": stats.get('document_types', {}),
            "legal_sources": stats.get('legal_sources', {}),
            "status": "active"
        }
    except Exception as e:
        logger.error(f"Error getting collection info: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get collection info: {str(e)}")

@app.get("/collection/stats")
async def get_collection_stats():
    """
    Get detailed statistics about the legal document collection.
    """
    if not embedder:
        raise HTTPException(status_code=503, detail="Service not initialized")
    
    try:
        return embedder.get_collection_stats()
    except Exception as e:
        logger.error(f"Error getting collection stats: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get collection stats: {str(e)}")

# Document Generation Endpoints

@app.get("/document-types", response_model=DocumentTypesResponse)
async def get_document_types():
    """
    Get available document types for generation.
    """
    if not doc_generator:
        raise HTTPException(status_code=503, detail="Document generation service not initialized")
    
    try:
        doc_types = doc_generator.get_available_document_types()
        return DocumentTypesResponse(
            document_types=doc_types,
            total_types=len(doc_types)
        )
    except Exception as e:
        logger.error(f"Error getting document types: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get document types: {str(e)}")

@app.post("/gen-doc")
async def generate_document(request: DocumentRequest):
    """
    Generate legal document based on query and response context.
    
    This endpoint:
    - Analyzes the query and response to determine appropriate document type
    - Extracts relevant information to fill template fields
    - Generates a PDF document using Jinja2 templates
    - Returns the document with metadata
    """
    if not doc_generator:
        raise HTTPException(status_code=503, detail="Document generation service not initialized")
    
    try:
        logger.info(f"Generating document for query: {request.query[:100]}...")
        
        result = doc_generator.generate_document(
            query=request.query,
            response=request.response,
            doc_type=request.document_type,
            user_details=request.user_details,
            dry_run=request.dry_run
        )
        
        logger.info(f"Document generated successfully: {result.document_type} in {result.generation_time:.2f}s")
        
        return result
        
    except Exception as e:
        logger.error(f"Document generation error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Document generation failed: {str(e)}")

@app.post("/gen-doc/download")
async def download_generated_document(request: DocumentRequest):
    """
    Generate and download legal document as PDF.
    """
    if not doc_generator:
        raise HTTPException(status_code=503, detail="Document generation service not initialized")
    
    try:
        result = doc_generator.generate_document(
            query=request.query,
            response=request.response,
            doc_type=request.document_type,
            user_details=request.user_details,
            dry_run=request.dry_run
        )
        
        return Response(
            content=result.pdf_content,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename={result.filename}",
                "Content-Type": "application/pdf"
            }
        )
        
    except Exception as e:
        logger.error(f"Document download error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Document download failed: {str(e)}")

@app.post("/detect-document-type")
async def detect_document_type(request: DocumentTypeRequest):
    """
    Detect the type of legal document needed based on query and response
    """
    try:
        detected_type = doc_generator.detect_document_type(request.query, request.response)
        doc_info = doc_generator.document_types[detected_type]
        
        # Calculate confidence based on keyword matches
        combined_text = f"{request.query} {request.response}".lower()
        keyword_matches = sum(1 for keyword in doc_info['keywords'] if keyword.lower() in combined_text)
        confidence = "high" if keyword_matches >= 2 else "medium" if keyword_matches >= 1 else "low"
        
        return DetectDocumentTypeResponse(
            detected_type=detected_type,
            document_name=doc_info['name'],
            confidence=confidence
        )
        
    except Exception as e:
        logger.error(f"Document type detection error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Document type detection failed: {str(e)}")

if __name__ == "__main__":
    uvicorn.run(
        app,
        host=config.SERVER_HOST,
        port=config.SERVER_PORT,
        log_level="info"
    )
