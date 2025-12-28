"""
Executor - AI Document Analysis and Cost Calculation Engine

This package provides intelligent document analysis for construction projects,
extracting data from drawings, reports, and permits to generate STABU-based cost calculations.
"""

__version__ = "0.1.0"
__author__ = "Bouw Calculatie Platform"
__email__ = "info@bouwcalculatie.nl"

from .core.document_processor import DocumentProcessor, get_document_processor
from .core.ai_orchestrator import AIOrchestrator, get_ai_orchestrator
from .database.supabase_client import SupabaseClient, get_supabase_client
from .utils.file_handler import FileHandler, get_file_handler

__all__ = [
    "DocumentProcessor",
    "get_document_processor",
    "AIOrchestrator",
    "get_ai_orchestrator",
    "SupabaseClient",
    "get_supabase_client",
    "FileHandler",
    "get_file_handler",
]
