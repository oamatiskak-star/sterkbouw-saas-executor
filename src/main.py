import os
import logging
from datetime import datetime
from contextlib import asynccontextmanager
from typing import List, Dict, Any, Optional

import uvicorn
from fastapi import FastAPI, HTTPException, UploadFile, File, Form, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from core.document_processor import DocumentProcessor, ProjectContext, get_document_processor
from database.supabase_client import SupabaseClient, get_supabase_client
from utils.file_handler import FileHandler, get_file_handler

# Configure logging
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[
        logging.FileHandler("ai_engine.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Global instances
document_processor = None
supabase_client = None
file_handler = None

# Task storage (in production use Redis)
task_store = {}

class TaskStatus(BaseModel):
    task_id: str
    status: str  # pending, processing, completed, failed
    progress: float = Field(ge=0.0, le=1.0)
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    estimated_completion: Optional[datetime] = None

class AnalysisRequest(BaseModel):
    file_paths: List[str]
    project_context: ProjectContext

class AnalysisResponse(BaseModel):
    task_id: str
    status: str
    message: str
    estimated_time: int  # seconds

class CalculationResponse(BaseModel):
    calculation_id: str
    project_id: str
    calculation_data: Dict[str, Any]
    created_at: datetime
    version: str
    total_cost: float
    currency: str = "EUR"

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan manager for startup/shutdown events"""
    global document_processor, supabase_client, file_handler
    
    # Startup
    logger.info("🚀 Starting SterkBouw AI Engine")
    
    try:
        # Initialize components
        supabase_client = get_supabase_client()
        document_processor = get_document_processor()
        file_handler = get_file_handler()
        
        # Test connections
        await supabase_client.test_connection()
        logger.info("✅ All components initialized successfully")
        
        yield
        
    except Exception as e:
        logger.error(f"❌ Startup failed: {e}")
        raise
        
    finally:
        # Shutdown
        logger.info("👋 Shutting down SterkBouw AI Engine")
        # Cleanup code here

# Create FastAPI app
app = FastAPI(
    title="SterkBouw AI Engine",
    description="AI-powered document analysis and cost calculation engine",
    version="1.0.0",
    lifespan=lifespan
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Health check endpoint
@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "sterkbouw-ai-engine",
        "version": "1.0.0",
        "timestamp": datetime.now().isoformat(),
        "components": {
            "supabase": "connected" if supabase_client else "disconnected",
            "document_processor": "ready" if document_processor else "not_ready",
            "file_handler": "ready" if file_handler else "not_ready"
        }
    }

@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "SterkBouw AI Engine",
        "version": "1.0.0",
        "endpoints": {
            "health": "/health",
            "analyze": "/api/v1/analyze",
            "upload": "/api/v1/upload",
            "tasks": "/api/v1/tasks/{task_id}/status",
            "calculations": "/api/v1/calculations/{project_id}"
        },
        "documentation": "/docs"
    }

@app.post("/api/v1/analyze", response_model=AnalysisResponse)
async def analyze_documents(
    request: AnalysisRequest,
    background_tasks: BackgroundTasks
):
    """
    Analyze documents and generate cost calculation
    
    - **file_paths**: List of document file paths
    - **project_context**: Project information and context
    """
    try:
        task_id = f"task_{datetime.now().strftime('%Y%m%d%H%M%S')}_{hash(str(request.file_paths)) % 10000:04d}"
        
        # Store task
        task_store[task_id] = TaskStatus(
            task_id=task_id,
            status="pending",
            progress=0.0,
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        
        # Start processing in background
        background_tasks.add_task(
            process_documents_task,
            task_id,
            request.file_paths,
            request.project_context
        )
        
        logger.info(f"📊 Analysis task created: {task_id} for project {request.project_context.project_id}")
        
        return AnalysisResponse(
            task_id=task_id,
            status="pending",
            message="Document analysis started",
            estimated_time=len(request.file_paths) * 30  # 30 seconds per file
        )
        
    except Exception as e:
        logger.error(f"Analysis request failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

async def process_documents_task(task_id: str, file_paths: List[str], project_context: ProjectContext):
    """Background task for document processing"""
    try:
        task = task_store[task_id]
        task.status = "processing"
        task.updated_at = datetime.now()
        
        logger.info(f"🔄 Processing task {task_id}: {len(file_paths)} files")
        
        # Process documents
        result = await document_processor.process_document_batch(
            file_paths=file_paths,
            project_context=project_context
        )
        
        # Update task
        task.status = "completed"
        task.progress = 1.0
        task.result = result
        task.updated_at = datetime.now()
        
        logger.info(f"✅ Task {task_id} completed successfully")
        
    except Exception as e:
        logger.error(f"❌ Task {task_id} failed: {e}")
        
        task = task_store.get(task_id)
        if task:
            task.status = "failed"
            task.error = str(e)
            task.updated_at = datetime.now()

@app.get("/api/v1/tasks/{task_id}/status")
async def get_task_status(task_id: str):
    """Get the status of a processing task"""
    task = task_store.get(task_id)
    
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    return {
        "task_id": task.task_id,
        "status": task.status,
        "progress": task.progress,
        "result": task.result,
        "error": task.error,
        "created_at": task.created_at.isoformat(),
        "updated_at": task.updated_at.isoformat()
    }

@app.post("/api/v1/upload")
async def upload_file(
    file: UploadFile = File(...),
    project_id: str = Form(...),
    file_type: str = Form("document")
):
    """
    Upload a file for processing
    
    - **file**: The file to upload
    - **project_id**: Project identifier
    - **file_type**: Type of file (document, drawing, report, etc.)
    """
    try:
        # Save uploaded file
        temp_file_path = f"/tmp/{file.filename}"
        
        with open(temp_file_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)
        
        # Process file info
        file_info = await file_handler.save_uploaded_file(
            file_content=content,
            original_filename=file.filename,
            project_id=project_id
        )
        
        # Upload to Supabase storage
        storage_path = await supabase_client.upload_file(
            file_path=temp_file_path,
            project_id=project_id,
            file_type=file_type,
            metadata={
                "original_filename": file.filename,
                "content_type": file.content_type,
                "size": len(content)
            }
        )
        
        # Cleanup temp file
        os.unlink(temp_file_path)
        
        logger.info(f"📁 File uploaded: {file.filename} for project {project_id}")
        
        return {
            "success": True,
            "file_id": storage_path,
            "file_name": file.filename,
            "file_size": len(content),
            "project_id": project_id,
            "download_url": await supabase_client.get_file_url(storage_path)
        }
        
    except Exception as e:
        logger.error(f"File upload failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/v1/calculations/{project_id}")
async def get_project_calculations(project_id: str):
    """Get all calculations for a project"""
    try:
        calculations = await supabase_client.get_project_calculations(project_id)
        
        if not calculations:
            raise HTTPException(status_code=404, detail="No calculations found for this project")
        
        return {
            "project_id": project_id,
            "calculations": calculations,
            "total_calculations": len(calculations),
            "latest_calculation": calculations[0] if calculations else None
        }
        
    except Exception as e:
        logger.error(f"Failed to get calculations: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/v1/feasibility")
async def generate_feasibility_report(
    project_id: str,
    analysis_results: Optional[List[Dict[str, Any]]] = None
):
    """Generate feasibility report for a project"""
    try:
        if not analysis_results:
            # Get analysis results from database
            analyses = await supabase_client.get_document_analyses(project_id)
            analysis_results = [analysis["analysis_data"] for analysis in analyses]
        
        report = await document_processor.generate_feasibility_report(
            project_id=project_id,
            analysis_results=analysis_results
        )
        
        return {
            "success": True,
            "report_type": "feasibility",
            "project_id": project_id,
            "report": report,
            "generated_at": datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Feasibility report generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/v1/savings")
async def generate_savings_report(
    project_id: str,
    calculation_id: Optional[str] = None
):
    """Generate savings analysis report"""
    try:
        # Get calculation
        if calculation_id:
            calculation = await supabase_client.get_calculation(calculation_id)
        else:
            calculations = await supabase_client.get_project_calculations(project_id)
            calculation = calculations[0] if calculations else None
        
        if not calculation:
            raise HTTPException(status_code=404, detail="No calculation found")
        
        # Generate savings report
        project_context = ProjectContext(
            project_id=project_id,
            project_type=calculation.get("calculation_data", {}).get("project_type", "unknown")
        )
        
        report = await document_processor.generate_savings_report(
            calculation=calculation["calculation_data"],
            project_context=project_context
        )
        
        return {
            "success": True,
            "report_type": "savings",
            "project_id": project_id,
            "calculation_id": calculation["id"],
            "report": report,
            "generated_at": datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Savings report generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/v1/stabu/prices/{category}")
async def get_stabu_prices(category: str):
    """Get STABU prices for a specific category"""
    try:
        prices = await supabase_client.get_stabu_prices_by_category(category)
        
        return {
            "category": category,
            "prices": [price.dict() for price in prices],
            "count": len(prices)
        }
        
    except Exception as e:
        logger.error(f"Failed to get STABU prices: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/v1/stabu/search")
async def search_stabu_prices(search_term: str, limit: int = 20):
    """Search STABU prices"""
    try:
        prices = await supabase_client.search_stabu_prices(search_term, limit)
        
        return {
            "search_term": search_term,
            "results": [price.dict() for price in prices],
            "count": len(prices)
        }
        
    except Exception as e:
        logger.error(f"STABU search failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Error handlers
@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": exc.detail,
            "path": request.url.path,
            "timestamp": datetime.now().isoformat()
        }
    )

@app.exception_handler(Exception)
async def general_exception_handler(request, exc):
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal server error",
            "message": str(exc),
            "path": request.url.path,
            "timestamp": datetime.now().isoformat()
        }
    )

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=int(os.getenv("AI_ENGINE_PORT", 8000)),
        reload=os.getenv("NODE_ENV", "development") == "development"
    )
