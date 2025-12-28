import asyncio
import logging
from enum import Enum
from pathlib import Path
from typing import Dict, List, Optional, Any
from datetime import datetime

from pydantic import BaseModel, Field
from .ai_orchestrator import AIOrchestrator
from ..analyzers.drawing_analyzer import DrawingAnalyzer
from ..analyzers.report_analyzer import ReportAnalyzer
from ..analyzers.permit_analyzer import PermitAnalyzer
from ..analyzers.cost_analyzer import CostAnalyzer
from ..database.supabase_client import SupabaseClient
from ..utils.file_handler import FileHandler

logger = logging.getLogger(__name__)


class DocumentType(str, Enum):
    DRAWING = "drawing"
    TAXATION_REPORT = "taxation_report"
    ASBESTOS_REPORT = "asbestos_report"
    PERMIT = "permit"
    ENVIRONMENTAL_PERMIT = "environmental_permit"
    OTHER = "other"


class UploadedDocument(BaseModel):
    id: str
    filename: str
    file_path: str
    document_type: DocumentType
    file_size: int
    upload_date: datetime
    metadata: Dict[str, Any] = Field(default_factory=dict)


class DocumentAnalysisResult(BaseModel):
    document_id: str
    document_type: DocumentType
    analysis_summary: str
    extracted_data: Dict[str, Any]
    confidence_score: float
    processing_time: float
    warnings: List[str] = Field(default_factory=list)
    recommendations: List[str] = Field(default_factory=list)


class ProjectContext(BaseModel):
    project_id: str
    project_type: str
    location: Optional[str] = None
    building_type: Optional[str] = None
    existing_structure: bool = False
    special_requirements: List[str] = Field(default_factory=list)


class DocumentProcessor:
    """Hoofdprocessor voor alle geüploade documenten"""
    
    def __init__(self, supabase_client: Optional[SupabaseClient] = None):
        self.supabase = supabase_client or SupabaseClient()
        self.ai_orchestrator = AIOrchestrator()
        self.file_handler = FileHandler()
        
        # Initialiseer alle analyzers
        self.drawing_analyzer = DrawingAnalyzer(self.ai_orchestrator)
        self.report_analyzer = ReportAnalyzer(self.ai_orchestrator)
        self.permit_analyzer = PermitAnalyzer(self.ai_orchestrator)
        self.cost_analyzer = CostAnalyzer(self.ai_orchestrator, self.supabase)
        
        self.analyzer_map = {
            DocumentType.DRAWING: self.drawing_analyzer,
            DocumentType.TAXATION_REPORT: self.report_analyzer,
            DocumentType.ASBESTOS_REPORT: self.report_analyzer,
            DocumentType.PERMIT: self.permit_analyzer,
            DocumentType.ENVIRONMENTAL_PERMIT: self.permit_analyzer,
            DocumentType.OTHER: self.report_analyzer,
        }
        
        logger.info("DocumentProcessor initialized")
    
    async def process_document_batch(
        self,
        file_paths: List[str],
        project_context: ProjectContext
    ) -> Dict[str, Any]:
        """
        Verwerk een batch van documenten asynchroon
        
        Args:
            file_paths: Lijst van bestandspaden
            project_context: Context van het project
            
        Returns:
            Geconsolideerde analyse resultaten
        """
        logger.info(f"Processing batch of {len(file_paths)} documents")
        
        # Classificeer documenten
        classified_docs = await self._classify_documents(file_paths)
        
        # Verwerk elk document parallel
        tasks = []
        for doc in classified_docs:
            task = self._process_single_document(doc, project_context)
            tasks.append(task)
        
        # Voer alle analyses parallel uit
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Verwerk resultaten en sla op
        successful_results = []
        for result in results:
            if isinstance(result, Exception):
                logger.error(f"Error processing document: {result}")
                continue
            successful_results.append(result)
        
        # Genereer geconsolideerde calculatie
        consolidated_calculation = await self._generate_consolidated_calculation(
            successful_results, project_context
        )
        
        # Sla alles op in Supabase
        await self._store_results_in_database(successful_results, consolidated_calculation, project_context)
        
        return {
            "documents_processed": len(successful_results),
            "individual_results": successful_results,
            "consolidated_calculation": consolidated_calculation,
            "project_id": project_context.project_id,
            "processing_timestamp": datetime.now().isoformat()
        }
    
    async def _classify_documents(self, file_paths: List[str]) -> List[UploadedDocument]:
        """Classificeer documenten op type"""
        classified = []
        
        for file_path in file_paths:
            doc_type = await self._detect_document_type(file_path)
            doc_id = self._generate_document_id(file_path)
            
            document = UploadedDocument(
                id=doc_id,
                filename=Path(file_path).name,
                file_path=file_path,
                document_type=doc_type,
                file_size=Path(file_path).stat().st_size,
                upload_date=datetime.now(),
                metadata={"original_path": file_path}
            )
            
            classified.append(document)
            logger.info(f"Classified {file_path} as {doc_type}")
        
        return classified
    
    async def _detect_document_type(self, file_path: str) -> DocumentType:
        """Detecteer het type document met AI"""
        filename = Path(file_path).name.lower()
        
        # Eerst op basis van bestandsnaam
        if any(ext in filename for ext in ['.dwg', '.dxf', '.ifc', '.rvt', '.pdf']):
            # Controleer of het een tekening is
            if await self._is_drawing_file(file_path):
                return DocumentType.DRAWING
        
        if 'taxatie' in filename or 'waardebepaling' in filename:
            return DocumentType.TAXATION_REPORT
        
        if 'asbest' in filename:
            return DocumentType.ASBESTOS_REPORT
        
        if 'omgevingsvergunning' in filename or 'bouwvergunning' in filename:
            return DocumentType.PERMIT
        
        if 'milieu' in filename or 'omgeving' in filename:
            return DocumentType.ENVIRONMENTAL_PERMIT
        
        # Gebruik AI voor moeilijke gevallen
        return await self.ai_orchestrator.classify_document_type(file_path)
    
    async def _is_drawing_file(self, file_path: str) -> bool:
        """Controleer of bestand een tekening is"""
        # Simpele check op bestandstype en extensie
        # In productie: gebruik vision AI om te controleren op tekeningelementen
        return True  # Placeholder
    
    def _generate_document_id(self, file_path: str) -> str:
        """Genereer een unieke ID voor het document"""
        import hashlib
        file_hash = hashlib.md5(file_path.encode()).hexdigest()[:12]
        timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
        return f"doc_{timestamp}_{file_hash}"
    
    async def _process_single_document(
        self,
        document: UploadedDocument,
        project_context: ProjectContext
    ) -> DocumentAnalysisResult:
        """Verwerk een enkel document"""
        logger.info(f"Processing document: {document.filename}")
        
        start_time = datetime.now()
        
        try:
            # Selecteer de juiste analyzer
            analyzer = self.analyzer_map.get(document.document_type, self.report_analyzer)
            
            # Voer analyse uit
            analysis_result = await analyzer.analyze(
                document.file_path,
                document.document_type,
                project_context
            )
            
            processing_time = (datetime.now() - start_time).total_seconds()
            
            result = DocumentAnalysisResult(
                document_id=document.id,
                document_type=document.document_type,
                analysis_summary=analysis_result.get("summary", ""),
                extracted_data=analysis_result.get("data", {}),
                confidence_score=analysis_result.get("confidence", 0.0),
                processing_time=processing_time,
                warnings=analysis_result.get("warnings", []),
                recommendations=analysis_result.get("recommendations", [])
            )
            
            logger.info(f"Successfully processed {document.filename} in {processing_time:.2f}s")
            return result
            
        except Exception as e:
            logger.error(f"Error processing {document.filename}: {e}")
            raise
    
    async def _generate_consolidated_calculation(
        self,
        analysis_results: List[DocumentAnalysisResult],
        project_context: ProjectContext
    ) -> Dict[str, Any]:
        """Genereer een geconsolideerde calculatie van alle analyses"""
        logger.info("Generating consolidated calculation")
        
        # Verzamel alle geëxtraheerde data
        all_data = {}
        for result in analysis_results:
            all_data[result.document_id] = result.extracted_data
        
        # Gebruik de cost analyzer om een complete calculatie te genereren
        calculation = await self.cost_analyzer.generate_calculation(
            all_data,
            project_context,
            analysis_results
        )
        
        return calculation
    
    async def _store_results_in_database(
        self,
        analysis_results: List[DocumentAnalysisResult],
        consolidated_calculation: Dict[str, Any],
        project_context: ProjectContext
    ):
        """Sla alle resultaten op in Supabase"""
        try:
            # Sla individuele document analyses op
            for result in analysis_results:
                await self.supabase.insert_document_analysis(
                    project_id=project_context.project_id,
                    analysis_result=result.dict()
                )
            
            # Sla de geconsolideerde calculatie op
            await self.supabase.insert_calculation(
                project_id=project_context.project_id,
                calculation_data=consolidated_calculation,
                version="1.0"
            )
            
            logger.info(f"Stored results for project {project_context.project_id}")
            
        except Exception as e:
            logger.error(f"Error storing results in database: {e}")
            raise
    
    async def generate_feasibility_report(
        self,
        project_id: str,
        analysis_results: List[DocumentAnalysisResult]
    ) -> Dict[str, Any]:
        """Genereer een haalbaarheidsrapport"""
        logger.info(f"Generating feasibility report for project {project_id}")
        
        report = await self.ai_orchestrator.generate_feasibility_report(
            analysis_results,
            project_id
        )
        
        return report
    
    async def generate_savings_report(
        self,
        calculation: Dict[str, Any],
        project_context: ProjectContext
    ) -> Dict[str, Any]:
        """Genereer een besparingsrapport"""
        logger.info(f"Generating savings report for project {project_context.project_id}")
        
        report = await self.cost_analyzer.generate_savings_analysis(
            calculation,
            project_context
        )
        
        return report


# Factory functie voor dependency injection
def get_document_processor() -> DocumentProcessor:
    """Factory om DocumentProcessor instantie te maken"""
    return DocumentProcessor()
