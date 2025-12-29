import sys
import os
import traceback

print("🚀 Python AI Engine starting...", file=sys.stderr)
print(f"Python version: {sys.version}", file=sys.stderr)
print(f"Current directory: {os.getcwd()}", file=sys.stderr)
print(f"AI Engine files: {os.listdir('.')}", file=sys.stderr)

try:
    import logging
    from datetime import datetime
    from contextlib import asynccontextmanager
    from typing import List, Dict, Any, Optional

    import uvicorn
    from fastapi import FastAPI, HTTPException, UploadFile, File, Form, BackgroundTasks
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import JSONResponse
    from pydantic import BaseModel, Field
    
    print("✅ Basic imports successful", file=sys.stderr)
    
    # Probeer de lokale imports
    try:
        from .core.document_processor import DocumentProcessor, ProjectContext, get_document_processor
        print("✅ .core.document_processor import successful", file=sys.stderr)
    except ImportError as e:
        print(f"❌ .core.document_processor import failed: {e}", file=sys.stderr)
        # Probeer absolute import
        from core.document_processor import DocumentProcessor, ProjectContext, get_document_processor
        print("✅ core.document_processor import successful", file=sys.stderr)
    
    try:
        from .database.supabase_client import SupabaseClient, get_supabase_client
        print("✅ .database.supabase_client import successful", file=sys.stderr)
    except ImportError as e:
        print(f"❌ .database.supabase_client import failed: {e}", file=sys.stderr)
        from database.supabase_client import SupabaseClient, get_supabase_client
        print("✅ database.supabase_client import successful", file=sys.stderr)
    
    try:
        from .utils.file_handler import FileHandler, get_file_handler
        print("✅ .utils.file_handler import successful", file=sys.stderr)
    except ImportError as e:
        print(f"❌ .utils.file_handler import failed: {e}", file=sys.stderr)
        from utils.file_handler import FileHandler, get_file_handler
        print("✅ utils.file_handler import successful", file=sys.stderr)
    
except Exception as e:
    print(f"❌ CRITICAL: Import failed with error: {e}", file=sys.stderr)
    print("Traceback:", file=sys.stderr)
    traceback.print_exc(file=sys.stderr)
    # Exit with error code
    sys.exit(1)

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

print("✅ All imports completed successfully", file=sys.stderr)

# Rest van je code blijft hetzelfde vanaf hier...
# [De rest van je main.py code hier]

# Onder aan het bestand, voeg toe:
if __name__ == "__main__":
    print("🔧 Starting AI Engine server...", file=sys.stderr)
    try:
        uvicorn.run(
            app,
            host="0.0.0.0",
            port=int(os.getenv("AI_ENGINE_PORT", "8000")),
            reload=os.getenv("NODE_ENV", "development") == "development",
            log_level="info"
        )
    except Exception as e:
        print(f"❌ Server startup failed: {e}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)
