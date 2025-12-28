import logging
from typing import Dict, List, Optional, Any
from enum import Enum
import asyncio

from pydantic import BaseModel, Field
from ..models.llm_client import LLMClient, LLMProvider
from ..models.vision_client import VisionClient

logger = logging.getLogger(__name__)


class AnalysisType(str, Enum):
    DOCUMENT_CLASSIFICATION = "document_classification"
    TEXT_EXTRACTION = "text_extraction"
    DRAWING_ANALYSIS = "drawing_analysis"
    COST_ESTIMATION = "cost_estimation"
    FEASIBILITY_ANALYSIS = "feasibility_analysis"
    RISK_ASSESSMENT = "risk_assessment"


class AIRequest(BaseModel):
    analysis_type: AnalysisType
    input_data: Any
    context: Optional[Dict[str, Any]] = None
    provider_preference: Optional[LLMProvider] = None


class AIResponse(BaseModel):
    success: bool
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    processing_time: float
    provider_used: str
    confidence_score: float = Field(ge=0.0, le=1.0)


class AIOrchestrator:
    """Orkestreert verschillende AI modellen voor optimale resultaten"""
    
    def __init__(self):
        self.llm_client = LLMClient()
        self.vision_client = VisionClient()
        
        # Configuration for task routing
        self.task_routing = {
            AnalysisType.DOCUMENT_CLASSIFICATION: {
                "primary": LLMProvider.OPENAI,
                "fallback": LLMProvider.ANTHROPIC
            },
            AnalysisType.TEXT_EXTRACTION: {
                "primary": LLMProvider.ANTHROPIC,
                "fallback": LLMProvider.OPENAI
            },
            AnalysisType.DRAWING_ANALYSIS: {
                "primary": LLMProvider.GEMINI,  # Gemini is goed met vision
                "fallback": LLMProvider.OPENAI
            },
            AnalysisType.COST_ESTIMATION: {
                "primary": LLMProvider.OPENAI,  # GPT-4 is goed met getallen
                "fallback": LLMProvider.ANTHROPIC
            },
            AnalysisType.FEASIBILITY_ANALYSIS: {
                "primary": LLMProvider.ANTHROPIC,  # Claude is goed met lange analyses
                "fallback": LLMProvider.OPENAI
            }
        }
        
        logger.info("AIOrchestrator initialized")
    
    async def analyze(self, request: AIRequest) -> AIResponse:
        """
        Voer AI analyse uit met automatische provider selectie en fallback
        
        Args:
            request: AIRequest met type en input
            
        Returns:
            AIResponse met resultaten
        """
        import time
        start_time = time.time()
        
        try:
            logger.info(f"Starting {request.analysis_type} analysis")
            
            # Route naar de juiste handler
            handler = self._get_handler(request.analysis_type)
            result = await handler(request)
            
            processing_time = time.time() - start_time
            
            return AIResponse(
                success=True,
                result=result,
                processing_time=processing_time,
                provider_used=request.provider_preference or "auto",
                confidence_score=result.get("confidence", 0.8)
            )
            
        except Exception as e:
            logger.error(f"Error in AI analysis: {e}")
            
            # Probeer fallback als er een voorkeur was
            if request.provider_preference and request.provider_preference != LLMProvider.OPENAI:
                logger.info("Trying OpenAI as fallback")
                try:
                    request.provider_preference = LLMProvider.OPENAI
                    handler = self._get_handler(request.analysis_type)
                    result = await handler(request)
                    
                    processing_time = time.time() - start_time
                    
                    return AIResponse(
                        success=True,
                        result=result,
                        processing_time=processing_time,
                        provider_used="openai_fallback",
                        confidence_score=result.get("confidence", 0.7)
                    )
                except Exception as fallback_error:
                    logger.error(f"Fallback also failed: {fallback_error}")
            
            processing_time = time.time() - start_time
            return AIResponse(
                success=False,
                error=str(e),
                processing_time=processing_time,
                provider_used="none",
                confidence_score=0.0
            )
    
    def _get_handler(self, analysis_type: AnalysisType):
        """Get the appropriate handler for the analysis type"""
        handlers = {
            AnalysisType.DOCUMENT_CLASSIFICATION: self._classify_document,
            AnalysisType.TEXT_EXTRACTION: self._extract_text,
            AnalysisType.DRAWING_ANALYSIS: self._analyze_drawing,
            AnalysisType.COST_ESTIMATION: self._estimate_costs,
            AnalysisType.FEASIBILITY_ANALYSIS: self._analyze_feasibility,
            AnalysisType.RISK_ASSESSMENT: self._assess_risks,
        }
        return handlers.get(analysis_type, self._generic_analysis)
    
    async def _classify_document(self, request: AIRequest) -> Dict[str, Any]:
        """Classificeer document type"""
        from ..core.document_processor import DocumentType
        
        # Gebruik vision voor beeldbestanden, text voor andere
        if isinstance(request.input_data, str) and request.input_data.endswith(('.png', '.jpg', '.jpeg', '.pdf')):
            classification = await self.vision_client.classify_document(request.input_data)
        else:
            prompt = f"""
            Classificeer het volgende document. Kies uit:
            1. drawing (bouwtekening, plattegrond, detailtekening)
            2. taxation_report (taxatierapport, waardebepaling)
            3. asbestos_report (asbestrapport, inventarisatie)
            4. permit (omgevingsvergunning, bouwvergunning)
            5. environmental_permit (milieuvoorziening, MER)
            6. other (overig)
            
            Document informatie: {request.input_data}
            
            Geef alleen het type terug, geen uitleg.
            """
            
            response = await self.llm_client.complete(
                prompt=prompt,
                provider=request.provider_preference or LLMProvider.OPENAI,
                temperature=0.1
            )
            
            classification = response.strip().lower()
        
        # Map naar DocumentType enum
        type_map = {
            "drawing": DocumentType.DRAWING,
            "taxation": DocumentType.TAXATION_REPORT,
            "asbestos": DocumentType.ASBESTOS_REPORT,
            "permit": DocumentType.PERMIT,
            "environmental": DocumentType.ENVIRONMENTAL_PERMIT,
            "other": DocumentType.OTHER
        }
        
        for key, doc_type in type_map.items():
            if key in classification:
                return {
                    "document_type": doc_type.value,
                    "confidence": 0.9,
                    "raw_classification": classification
                }
        
        return {
            "document_type": DocumentType.OTHER.value,
            "confidence": 0.5,
            "raw_classification": classification
        }
    
    async def _extract_text(self, request: AIRequest) -> Dict[str, Any]:
        """Extraheer gestructureerde tekst uit documenten"""
        prompt = f"""
        Extraheer alle relevante informatie uit het volgende document voor bouwkosten calculatie.
        Structureer de informatie volgens deze categorieën:
        1. Algemene informatie (locatie, type gebouw, jaar)
        2. Constructie elementen (muren, vloeren, daken)
        3. Materialen genoemde materialen)
        4. Afmetingen (oppervlakten, volumes, afmetingen)
        5. Bijzonderheden (speciale eisen, beperkingen)
        6. Data (data, termijnen, voorwaarden)
        
        Document: {request.input_data}
        
        Geef het antwoord als JSON met de bovenstaande categorieën als keys.
        """
        
        response = await self.llm_client.complete(
            prompt=prompt,
            provider=request.provider_preference or LLMProvider.ANTHROPIC,
            temperature=0.1,
            response_format="json"
        )
        
        return {
            "extracted_data": response,
            "confidence": 0.85,
            "structure_verified": True
        }
    
    async def _analyze_drawing(self, request: AIRequest) -> Dict[str, Any]:
        """Analyseer tekeningen en extract bouwinformatie"""
        # Gebruik vision AI voor beeldanalyse
        drawing_analysis = await self.vision_client.analyze_drawing(request.input_data)
        
        # Gebruik LLM om de vision output te structureren
        structure_prompt = f"""
        Structureer de volgende tekeninganalyse voor STABU calculatie:
        
        {drawing_analysis}
        
        Categoriseer de elementen volgens STABU hoofdstukken:
        1. Voorbereiding en algemeen
        2. Grondwerk
        3. Betonwerk
        4. Metselwerk
        5. Hout- en kunststofbouw
        6. etc.
        
        Voor elk element, geef:
        - Type element
        - Afmetingen
        - Geschatte hoeveelheid
        - Material suggesties
        """
        
        structured_analysis = await self.llm_client.complete(
            prompt=structure_prompt,
            provider=request.provider_preference or LLMProvider.GEMINI,
            temperature=0.1,
            response_format="json"
        )
        
        return {
            "drawing_analysis": drawing_analysis,
            "structured_elements": structured_analysis,
            "confidence": 0.8,
            "elements_detected": len(structured_analysis.get("elements", []))
        }
    
    async def _estimate_costs(self, request: AIRequest) -> Dict[str, Any]:
        """Schat kosten op basis van geëxtraheerde data"""
        prompt = f"""
        Schat de bouwkosten op basis van de volgende informatie.
        Gebruik Nederlandse eenheidsprijzen voor 2024.
        
        Project informatie: {request.input_data}
        
        Geef een gedetailleerde kostenberekening met:
        1. Kosten per eenheid (m2, m3, stuks)
        2. Totale kosten per categorie
        3. BTW berekening (21%)
        4. Onvoorziene kosten (5-10%)
        5. Totale projectkosten
        
        Format: JSON met keys: categories, unit_costs, totals, vat, contingencies, grand_total
        """
        
        response = await self.llm_client.complete(
            prompt=prompt,
            provider=request.provider_preference or LLMProvider.OPENAI,
            temperature=0.1,
            response_format="json"
        )
        
        return {
            "cost_estimation": response,
            "confidence": 0.75,
            "currency": "EUR",
            "year": 2024
        }
    
    async def _analyze_feasibility(self, request: AIRequest) -> Dict[str, Any]:
        """Voer haalbaarheidsanalyse uit"""
        prompt = f"""
        Voer een complete haalbaarheidsanalyse uit voor het volgende bouwproject:
        
        {request.input_data}
        
        Beoordeel:
        1. Technische haalbaarheid
        2. Financiële haalbaarheid (ROI, break-even)
        3. Juridische haalbaarheid (vergunningen, regelgeving)
        4. Tijdsplanning haalbaarheid
        5. Risico analyse
        
        Geef voor elke categorie een score van 1-10 en gedetailleerde motivatie.
        Eindig met een algemene aanbeveling (doorgaan, aanpassen, stoppen).
        """
        
        response = await self.llm_client.complete(
            prompt=prompt,
            provider=request.provider_preference or LLMProvider.ANTHROPIC,
            temperature=0.3,
            max_tokens=2000
        )
        
        return {
            "feasibility_analysis": response,
            "confidence": 0.8,
            "recommendation": self._extract_recommendation(response)
        }
    
    async def _assess_risks(self, request: AIRequest) -> Dict[str, Any]:
        """Beoordeel risico's van het project"""
        prompt = f"""
        Identificeer en beoordeel risico's voor het volgende bouwproject:
        
        {request.input_data}
        
        Categoriseer risico's als:
        - Hoog (directe impact op kosten/tijd)
        - Medium (mogelijke impact)
        - Laag (beperkte impact)
        
        Geef voor elk risico:
        1. Kans van optreden (1-5)
        2. Impact score (1-5)
        3. Mitigatie strategie
        
        Eindig met top 5 kritieke risico's.
        """
        
        response = await self.llm_client.complete(
            prompt=prompt,
            provider=request.provider_preference or LLMProvider.OPENAI,
            temperature=0.2,
            response_format="json"
        )
        
        return {
            "risk_assessment": response,
            "confidence": 0.85,
            "critical_risks": self._extract_critical_risks(response)
        }
    
    async def _generic_analysis(self, request: AIRequest) -> Dict[str, Any]:
        """Generieke analyse handler"""
        prompt = f"""
        Voer een analyse uit op de volgende data:
        
        Analyse type: {request.analysis_type}
        Context: {request.context}
        Input: {request.input_data}
        
        Geef een gestructureerd antwoord met de belangrijkste bevindingen.
        """
        
        response = await self.llm_client.complete(
            prompt=prompt,
            provider=request.provider_preference or LLMProvider.OPENAI,
            temperature=0.3
        )
        
        return {
            "analysis": response,
            "confidence": 0.7
        }
    
    async def classify_document_type(self, file_path: str) -> Any:
        """Classificeer document type (publieke interface)"""
        request = AIRequest(
            analysis_type=AnalysisType.DOCUMENT_CLASSIFICATION,
            input_data=file_path
        )
        
        response = await self.analyze(request)
        
        if response.success:
            return response.result.get("document_type", "other")
        else:
            logger.warning(f"Document classification failed: {response.error}")
            return "other"
    
    async def generate_feasibility_report(
        self,
        analysis_results: List[Any],
        project_id: str
    ) -> Dict[str, Any]:
        """Genereer een haalbaarheidsrapport"""
        request = AIRequest(
            analysis_type=AnalysisType.FEASIBILITY_ANALYSIS,
            input_data={
                "project_id": project_id,
                "analyses": analysis_results
            }
        )
        
        response = await self.analyze(request)
        
        if response.success:
            return response.result
        else:
            raise Exception(f"Feasibility report generation failed: {response.error}")
    
    def _extract_recommendation(self, analysis_text: str) -> str:
        """Extraheer aanbeveling uit analyse tekst"""
        import re
        patterns = [
            r"aanbeveling:?\s*([^\n]+)",
            r"conclusie:?\s*([^\n]+)",
            r"recommendation:?\s*([^\n]+)",
            r"(doorgaan|aanpassen|stoppen|verder|stop)",
        ]
        
        for pattern in patterns:
            match = re.search(pattern, analysis_text, re.IGNORECASE)
            if match:
                return match.group(1).strip()
        
        return "Nader onderzoek vereist"
    
    def _extract_critical_risks(self, risk_data: Dict) -> List[Dict]:
        """Extraheer kritieke risico's uit risico data"""
        if not isinstance(risk_data, dict):
            return []
        
        risks = risk_data.get("risks", [])
        if not risks:
            return []
        
        # Sorteer op risico score (kans * impact)
        sorted_risks = sorted(
            risks,
            key=lambda x: x.get("probability", 1) * x.get("impact", 1),
            reverse=True
        )
        
        return sorted_risks[:5]


# Factory functie
def get_ai_orchestrator() -> AIOrchestrator:
    """Factory om AIOrchestrator instantie te maken"""
    return AIOrchestrator()
