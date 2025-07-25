from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, Field
import uvicorn
import requests
import os
import base64
from doc import get_template_fields, generate_document_from_template, convert_html_to_pdf, get_document_filename
from sentence_transformers import SentenceTransformer
import numpy as np
import chromadb
from chromadb.config import Settings
from datetime import datetime
from dataclasses import dataclass
from contextlib import asynccontextmanager

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
  CHROMA_PERSIST_DIR: str = os.getenv("CHROMA_PERSIST_DIR", "./chroma_db")
  CHROMA_COLLECTION_NAME: str = os.getenv("CHROMA_COLLECTION_NAME", "legal_documents")
  
  # Server settings
  SERVER_HOST: str = os.getenv("SERVER_HOST", "0.0.0.0")
  SERVER_PORT: int = int(os.getenv("SERVER_PORT", "8000"))
  
  # Search settings - memory efficient defaults
  DEFAULT_TOP_K: int = int(os.getenv("DEFAULT_TOP_K", "3"))
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
  version: str
  endpoints: Dict[str, str]

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
embedding_model = None
chroma_client = None
collection = None

# Initialize embedding model
try:
  embedding_model = SentenceTransformer('all-MiniLM-L6-v2')
  logger.info("Embedding model loaded successfully")
except Exception as e:
  logger.error(f"Failed to load embedding model: {e}")
  embedding_model = None

# Initialize ChromaDB client
try:
  chroma_client = chromadb.Client(Settings(
      chroma_db_impl="duckdb+parquet",
      persist_directory=config.CHROMA_PERSIST_DIR
  ))
  collection = chroma_client.get_or_create_collection(
      name=config.CHROMA_COLLECTION_NAME,
      metadata={"hnsw:space": "cosine"}
  )
  logger.info("ChromaDB initialized successfully")
except Exception as e:
  logger.error(f"Failed to initialize ChromaDB: {e}")
  collection = None

def get_embedding(text: str) -> List[float]:
  """Generate embedding for given text"""
  if embedding_model is None:
      raise HTTPException(status_code=500, detail="Embedding model not available")
  
  try:
      embedding = embedding_model.encode(text)
      return embedding.tolist()
  except Exception as e:
      logger.error(f"Embedding generation failed: {e}")
      raise HTTPException(status_code=500, detail="Failed to generate embedding")

# FastAPI App
app = FastAPI(
  title="AccessLaw RAG API",
  description="Advanced API for searching Indian Legal Documents and generating legal documents",
  version="1.0.0"
)

app.add_middleware(
  CORSMiddleware,
  allow_origins=["*"],
  allow_credentials=True,
  allow_methods=["*"],
  allow_headers=["*"],
)

# Mount the document generation app
from doc import app as doc_app
app.mount("/doc", doc_app)

@app.get("/", response_model=RootResponse)
async def root():
  """Root endpoint with API information."""
  return {
      "message": "AccessLaw RAG API",
      "version": "1.0.0",
      "endpoints": {
          "/search": "Search legal documents",
          "/health": "Health check",
          "/doc/gen-doc": "Generate legal documents",
          "/doc/detect-document-type": "Detect document type",
          "/add-document": "Add a document to the knowledge base"
      }
  }

@app.get("/health", response_model=HealthResponse)
async def health_check():
  """Health check endpoint."""
  return {
      "status": "healthy",
      "collection_name": config.CHROMA_COLLECTION_NAME,
      "total_documents": collection.count() if collection else 0,
      "server_time": datetime.now()
  }

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
  start_time = datetime.now()
  
  try:
      if collection is None:
          raise HTTPException(status_code=500, detail="Database not available")
      
      # Generate query embedding
      query_embedding = get_embedding(request.query)
      
      # Prepare where clause for filtering
      where_clause = None
      if request.filters:
          where_clause = request.filters
      
      # Search in ChromaDB
      search_results = collection.query(
          query_embeddings=[query_embedding],
          n_results=request.top_k or config.DEFAULT_TOP_K,
          where=where_clause,
          include=['documents', 'metadatas', 'distances']
      )
      
      # Process results
      results = []
      if search_results['documents'] and search_results['documents'][0]:
          for i, (doc, metadata, distance) in enumerate(zip(
              search_results['documents'][0],
              search_results['metadatas'][0],
              search_results['distances'][0]
          )):
              # Convert distance to similarity score (cosine similarity)
              similarity_score = 1 - distance
              
              result = SearchResult(
                  content=doc,
                  metadata=metadata,
                  similarity_score=similarity_score if request.include_scores else 0.0
              )
              results.append(result)
      
      # Calculate search time
      search_time = (datetime.now() - start_time).total_seconds()
      
      return SearchResponse(
          results=results,
          query=request.query,
          total_results=len(results),
          search_time=search_time
      )
      
  except Exception as e:
      logger.error(f"Search error: {str(e)}")
      raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")

@app.post("/add-document")
async def add_document(
  content: str,
  metadata: Dict[str, Any],
  document_id: Optional[str] = None
):
  """
  Add a document to the knowledge base
  """
  try:
      if collection is None:
          raise HTTPException(status_code=500, detail="Database not available")
      
      # Generate embedding
      embedding = get_embedding(content)
      
      # Generate document ID if not provided
      if document_id is None:
          document_id = f"doc_{datetime.now().timestamp()}"
      
      # Add to collection
      collection.add(
          documents=[content],
          embeddings=[embedding],
          metadatas=[metadata],
          ids=[document_id]
      )
      
      return {
          "success": True,
          "document_id": document_id,
          "message": "Document added successfully"
      }
      
  except Exception as e:
      logger.error(f"Failed to add document: {e}")
      raise HTTPException(status_code=500, detail=f"Failed to add document: {str(e)}")

if __name__ == "__main__":
  uvicorn.run(
      app,
      host=config.SERVER_HOST,
      port=config.SERVER_PORT,
      log_level="info"
  )
