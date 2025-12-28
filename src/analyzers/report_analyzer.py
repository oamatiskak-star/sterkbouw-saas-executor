import logging
import asyncio
from typing import Dict, List, Optional, Any
from pathlib import Path
import re

from pydantic import BaseModel, Field
import pandas as pd

from ..core.document_processor import DocumentType
from ..core.ai_orchestrator import AIOrchestrator
from ..utils.file_handler import FileHandler

logger = logging.getLogger(__name__)


class ReportFinding(BaseModel):
    category: str
    description: str
    severity: str  # low, medium, high, critical
    location: Optional[str] = None
    recommendation: Optional[str] = None
    confidence: float = Field(ge=0.0, le=1.0)


class ReportMetadata(BaseModel):
    report_type: str
    author: Optional[str] = None
    date: Optional[str] = None
    client: Optional[str] = None
    reference_number: Optional[str] = None
    pages: Optional[int] = None
    summary: Optional[str] = None


class ReportAnalysisResult(BaseModel):
    metadata: ReportMetadata
    findings: List[ReportFinding]
    key_figures: Dict[str, Any]
    risks: List[str]
    opportunities: List[str]
    processing_time: float
    confidence: float


class ReportAnalyzer:
    """Analyseert verschillende soorten rapporten (taxatie, asbest, etc.)"""
    
    def __init__(self, ai_orchestrator: AIOrchestrator):
        self.ai_orchestrator = ai_orchestrator
        self.file_handler = FileHandler()
        
        # Configuratie per rapport type
        self.report_configs = {
            DocumentType.TAXATION_REPORT: {
                "target_data": [
                    "property_value",
                    "construction_year",
                    "surface_area",
                    "building_condition",
                    "defects",
                    "market_comparison"
                ],
                "critical_fields": ["property_value", "surface_area"]
            },
            DocumentType.ASBESTOS_REPORT: {
                "target_data": [
                    "asbestos_locations",
                    "asbestos_types",
                    "condition",
                    "risk_assessment",
                    "removal_requirements",
                    "cost_estimate"
                ],
                "critical_fields": ["asbestos_locations", "risk_assessment"]
            },
            DocumentType.OTHER: {
                "target_data": ["general_info", "key_points", "conclusions"],
                "critical_fields": []
            }
        }
        
        logger.info("ReportAnalyzer initialized")
    
    async def analyze(
        self,
        file_path: str,
        document_type: DocumentType,
        context: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Analyseer een rapport bestand
        
        Args:
            file_path: Pad naar het rapport bestand
            document_type: Type rapport
            context: Optionele context informatie
            
        Returns:
            Analyse resultaten
        """
        logger.info(f"Starting report analysis: {file_path} ({document_type})")
        
        try:
            # Extraheer tekst uit het rapport
            text_content = await self._extract_text(file_path, document_type)
            
            if not text_content:
                raise ValueError(f"Could not extract text from {file_path}")
            
            # Analyseer op basis van rapport type
            if document_type == DocumentType.TAXATION_REPORT:
                result = await self._analyze_taxation_report(text_content, context)
            elif document_type == DocumentType.ASBESTOS_REPORT:
                result = await self._analyze_asbestos_report(text_content, context)
            else:
                result = await self._analyze_general_report(text_content, document_type, context)
            
            logger.info(f"Report analysis complete: {len(result.get('findings', []))} findings")
            return result
            
        except Exception as e:
            logger.error(f"Error analyzing report {file_path}: {e}")
            raise
    
    async def _extract_text(self, file_path: str, document_type: DocumentType) -> str:
        """Extraheer tekst uit het rapport bestand"""
        try:
            # Gebruik de file handler voor tekst extractie
            text = await self.file_handler.extract_text(file_path)
            
            if not text or len(text.strip()) < 100:
                # Probeer AI-gebaseerde extractie als fallback
                logger.warning(f"Regular text extraction insufficient for {file_path}, using AI")
                text = await self._extract_text_with_ai(file_path, document_type)
            
            return text
            
        except Exception as e:
            logger.error(f"Text extraction failed for {file_path}: {e}")
            return ""
    
    async def _extract_text_with_ai(self, file_path: str, document_type: DocumentType) -> str:
        """Gebruik AI voor tekst extractie"""
        try:
            # Voor PDFs en images, gebruik vision AI
            if file_path.lower().endswith(('.pdf', '.jpg', '.jpeg', '.png')):
                # In productie: gebruik vision client
                # Voor nu: simpele fallback
                return f"Content from {Path(file_path).name}"
            
            # Voor andere bestanden, gebruik file handler
            return await self.file_handler.extract_text(file_path)
            
        except Exception as e:
            logger.error(f"AI text extraction failed: {e}")
            return ""
    
    async def _analyze_taxation_report(
        self,
        text_content: str,
        context: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Analyseer een taxatierapport"""
        try:
            # Structuur de analyse met AI
            prompt = f"""
            Analyze this property valuation report and extract key information:
            
            {text_content[:5000]}  # Limiteer voor token beperkingen
            
            Extract the following information:
            
            1. PROPERTY INFORMATION:
               - Address/location
               - Construction year
               - Type of property
               - Surface areas (gross, net, plot)
               - Number of rooms/bathrooms
            
            2. VALUATION DETAILS:
               - Market value
               - Valuation method used
               - Valuation date
               - Market comparison properties
            
            3. CONDITION ASSESSMENT:
               - Overall condition (good, fair, poor)
               - Specific defects/issues
               - Renovation needs
               - Maintenance status
            
            4. KEY FIGURES:
               - Value per m2
               - Depreciation percentage
               - Remaining economic lifespan
            
            5. RISKS AND OPPORTUNITIES:
               - Market risks
               - Regulatory risks
               - Development opportunities
            
            Format the response as JSON with these sections.
            """
            
            response = await self.ai_orchestrator._extract_text(
                {
                    "analysis_type": "text_extraction",
                    "input_data": prompt,
                    "context": {"response_format": "json"}
                }
            )
            
            extracted_data = response.get("extracted_data", {})
            
            # Genereer findings op basis van geëxtraheerde data
            findings = await self._generate_taxation_findings(extracted_data)
            
            # Identificeer risico's
            risks = self._identify_taxation_risks(extracted_data, context)
            
            # Identificeer kansen
            opportunities = self._identify_taxation_opportunities(extracted_data, context)
            
            # Bereken confidence
            confidence = self._calculate_taxation_confidence(extracted_data)
            
            result = {
                "metadata": ReportMetadata(
                    report_type="taxation_report",
                    summary=extracted_data.get("summary", "Property valuation report")
                ),
                "findings": findings,
                "key_figures": extracted_data.get("key_figures", {}),
                "risks": risks,
                "opportunities": opportunities,
                "confidence": confidence,
                "extracted_data": extracted_data
            }
            
            return result
            
        except Exception as e:
            logger.error(f"Taxation report analysis failed: {e}")
            return await self._analyze_general_report(text_content, DocumentType.TAXATION_REPORT, context)
    
    async def _generate_taxation_findings(self, extracted_data: Dict) -> List[ReportFinding]:
        """Genereer findings voor taxatierapport"""
        findings = []
        
        try:
            # Check op property value
            property_value = extracted_data.get("valuation_details", {}).get("market_value")
            if property_value:
                findings.append(ReportFinding(
                    category="valuation",
                    description=f"Market value: €{property_value:,.2f}",
                    severity="high",
                    confidence=0.9
                ))
            
            # Check op conditie
            condition = extracted_data.get("condition_assessment", {}).get("overall_condition")
            if condition:
                severity = "medium"
                if condition.lower() in ["poor", "bad"]:
                    severity = "high"
                elif condition.lower() in ["excellent", "very good"]:
                    severity = "low"
                
                findings.append(ReportFinding(
                    category="condition",
                    description=f"Overall condition: {condition}",
                    severity=severity,
                    confidence=0.8
                ))
            
            # Check op defecten
            defects = extracted_data.get("condition_assessment", {}).get("specific_defects", [])
            for defect in defects[:5]:  # Limiteer tot top 5
                findings.append(ReportFinding(
                    category="defects",
                    description=defect,
                    severity="medium",
                    recommendation="Consider repair in renovation planning",
                    confidence=0.7
                ))
            
            # Check op surface area
            surface_area = extracted_data.get("property_information", {}).get("surface_area")
            if surface_area:
                findings.append(ReportFinding(
                    category="measurements",
                    description=f"Surface area: {surface_area} m²",
                    severity="low",
                    confidence=0.9
                ))
            
            return findings
            
        except Exception as e:
            logger.error(f"Error generating taxation findings: {e}")
            return []
    
    def _identify_taxation_risks(
        self,
        extracted_data: Dict,
        context: Optional[Dict[str, Any]] = None
    ) -> List[str]:
        """Identificeer risico's in taxatierapport"""
        risks = []
        
        try:
            condition = extracted_data.get("condition_assessment", {}).get("overall_condition", "").lower()
            
            if condition in ["poor", "bad", "very poor"]:
                risks.append("Poor building condition may require significant renovation investment")
            
            # Check op depreciation
            depreciation = extracted_data.get("key_figures", {}).get("depreciation_percentage", 0)
            if depreciation > 50:
                risks.append(f"High depreciation ({depreciation}%) indicates significant value loss")
            
            # Check op economic lifespan
            lifespan = extracted_data.get("key_figures", {}).get("remaining_economic_lifespan", 0)
            if lifespan < 10:
                risks.append(f"Short remaining economic lifespan ({lifespan} years)")
            
            return risks
            
        except Exception as e:
            logger.error(f"Error identifying taxation risks: {e}")
            return []
    
    def _identify_taxation_opportunities(
        self,
        extracted_data: Dict,
        context: Optional[Dict[str, Any]] = None
    ) -> List[str]:
        """Identificeer kansen in taxatierapport"""
        opportunities = []
        
        try:
            condition = extracted_data.get("condition_assessment", {}).get("overall_condition", "").lower()
            
            if condition in ["good", "excellent", "very good"]:
                opportunities.append("Good condition reduces immediate renovation needs")
            
            # Check op value per m2
            value_per_m2 = extracted_data.get("key_figures", {}).get("value_per_m2", 0)
            area = extracted_data.get("property_information", {}).get("surface_area", 0)
            
            if value_per_m2 > 0 and area > 0:
                market_avg = 3000  # Placeholder - in productie: haal uit database
                if value_per_m2 < market_avg * 0.8:
                    opportunities.append(f"Below market value (€{value_per_m2}/m² vs avg €{market_avg}/m²)")
                elif value_per_m2 > market_avg * 1.2:
                    opportunities.append(f"Above market value indicates premium property")
            
            return opportunities
            
        except Exception as e:
            logger.error(f"Error identifying taxation opportunities: {e}")
            return []
    
    def _calculate_taxation_confidence(self, extracted_data: Dict) -> float:
        """Bereken confidence score voor taxatie analyse"""
        confidence = 0.5
        
        # Check op aanwezigheid van kritieke velden
        critical_fields = ["market_value", "surface_area", "overall_condition"]
        present_fields = 0
        
        for field in critical_fields:
            if self._find_in_dict(extracted_data, field):
                present_fields += 1
        
        if present_fields >= 2:
            confidence += 0.3
        elif present_fields >= 1:
            confidence += 0.1
        
        # Hoger bij meer data
        total_fields = self._count_fields(extracted_data)
        if total_fields > 10:
            confidence += 0.1
        elif total_fields > 5:
            confidence += 0.05
        
        return min(0.95, max(0.3, confidence))
    
    async def _analyze_asbestos_report(
        self,
        text_content: str,
        context: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Analyseer een asbestrapport"""
        try:
            prompt = f"""
            Analyze this asbestos report and extract critical information:
            
            {text_content[:5000]}
            
            Extract the following:
            
            1. ASBESTOS LOCATIONS:
               - List all locations where asbestos was found
               - Type of asbestos at each location
               - Condition (good, damaged, friable)
               - Quantity/area
            
            2. RISK ASSESSMENT:
               - Risk level for each location (low, medium, high)
               - Exposure risk
               - Recommendations (monitor, encapsulate, remove)
            
            3. SAMPLING DETAILS:
               - Number of samples taken
               - Analysis method
               - Laboratory information
               - Date of inspection
            
            4. LEGAL REQUIREMENTS:
               - Removal deadlines
               - Safety requirements
               - Reporting obligations
            
            5. COST ESTIMATES:
               - Estimated removal costs
               - Encapsulation costs
               - Monitoring costs
            
            Return as JSON.
            """
            
            response = await self.ai_orchestrator._extract_text(
                {
                    "analysis_type": "text_extraction",
                    "input_data": prompt,
                    "context": {"response_format": "json"}
                }
            )
            
            extracted_data = response.get("extracted_data", {})
            
            # Genereer findings
            findings = await self._generate_asbestos_findings(extracted_data)
            
            # Identificeer risico's
            risks = self._identify_asbestos_risks(extracted_data)
            
            # Bereken confidence
            confidence = self._calculate_asbestos_confidence(extracted_data)
            
            result = {
                "metadata": ReportMetadata(
                    report_type="asbestos_report",
                    summary=extracted_data.get("summary", "Asbestos inspection report")
                ),
                "findings": findings,
                "key_figures": {
                    "locations_found": len(extracted_data.get("asbestos_locations", [])),
                    "high_risk_locations": sum(1 for loc in extracted_data.get("asbestos_locations", []) 
                                             if loc.get("risk_level") == "high")
                },
                "risks": risks,
                "opportunities": ["Consider removal during renovation for cost efficiency"],
                "confidence": confidence,
                "extracted_data": extracted_data
            }
            
            return result
            
        except Exception as e:
            logger.error(f"Asbestos report analysis failed: {e}")
            return await self._analyze_general_report(text_content, DocumentType.ASBESTOS_REPORT, context)
    
    async def _generate_asbestos_findings(self, extracted_data: Dict) -> List[ReportFinding]:
        """Genereer findings voor asbestrapport"""
        findings = []
        
        try:
            locations = extracted_data.get("asbestos_locations", [])
            
            for location in locations:
                risk_level = location.get("risk_level", "unknown").lower()
                condition = location.get("condition", "unknown").lower()
                
                severity = "medium"
                if risk_level == "high" or condition in ["damaged", "friable"]:
                    severity = "high"
                elif risk_level == "low" and condition == "good":
                    severity = "low"
                
                recommendation = location.get("recommendation", "Monitor condition")
                
                findings.append(ReportFinding(
                    category="asbestos",
                    description=f"Asbestos found at {location.get('location', 'unknown location')}: "
                               f"{location.get('type', 'unknown type')} - {condition} condition",
                    severity=severity,
                    location=location.get("location"),
                    recommendation=recommendation,
                    confidence=0.8
                ))
            
            # Voeg algemene finding toe
            if locations:
                total_locations = len(locations)
                high_risk_count = sum(1 for loc in locations if loc.get("risk_level") == "high")
                
                findings.append(ReportFinding(
                    category="summary",
                    description=f"Found asbestos at {total_locations} locations, "
                               f"{high_risk_count} with high risk",
                    severity="high" if high_risk_count > 0 else "medium",
                    recommendation="Plan asbestos removal before renovation work",
                    confidence=0.9
                ))
            
            return findings
            
        except Exception as e:
            logger.error(f"Error generating asbestos findings: {e}")
            return []
    
    def _identify_asbestos_risks(self, extracted_data: Dict) -> List[str]:
        """Identificeer risico's in asbestrapport"""
        risks = []
        
        try:
            locations = extracted_data.get("asbestos_locations", [])
            
            for location in locations:
                risk_level = location.get("risk_level", "").lower()
                condition = location.get("condition", "").lower()
                
                if risk_level == "high":
                    risks.append(f"High risk asbestos at {location.get('location')} - immediate action required")
                elif condition in ["damaged", "friable"]:
                    risks.append(f"Damaged asbestos at {location.get('location')} - potential exposure risk")
            
            # Check op legal requirements
            legal_req = extracted_data.get("legal_requirements", {})
            if legal_req.get("removal_deadline"):
                risks.append(f"Removal deadline: {legal_req['removal_deadline']}")
            
            return risks
            
        except Exception as e:
            logger.error(f"Error identifying asbestos risks: {e}")
            return []
    
    def _calculate_asbestos_confidence(self, extracted_data: Dict) -> float:
        """Bereken confidence score voor asbest analyse"""
        confidence = 0.5
        
        locations = extracted_data.get("asbestos_locations", [])
        
        if locations:
            confidence += 0.2
        
        # Check op risk assessment aanwezig
        if extracted_data.get("risk_assessment"):
            confidence += 0.1
        
        # Check op cost estimates
        if extracted_data.get("cost_estimates"):
            confidence += 0.1
        
        return min(0.95, max(0.3, confidence))
    
    async def _analyze_general_report(
        self,
        text_content: str,
        document_type: DocumentType,
        context: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Analyseer een algemeen rapport"""
        try:
            prompt = f"""
            Analyze this document and extract key information for construction costing:
            
            Document type: {document_type}
            Content: {text_content[:3000]}
            
            Extract:
            1. Key information relevant to construction
            2. Measurements and quantities mentioned
            3. Materials specified
            4. Requirements or restrictions
            5. Dates and deadlines
            
            Also assess:
            - Overall relevance to construction project
            - Urgency of information
            - Potential impact on costs
            
            Return as JSON.
            """
            
            response = await self.ai_orchestrator._extract_text(
                {
                    "analysis_type": "text_extraction",
                    "input_data": prompt,
                    "context": {"response_format": "json"}
                }
            )
            
            extracted_data = response.get("extracted_data", {})
            
            # Genereer algemene findings
            findings = await self._generate_general_findings(extracted_data, document_type)
            
            result = {
                "metadata": ReportMetadata(
                    report_type=str(document_type),
                    summary=extracted_data.get("summary", f"{document_type} report")
                ),
                "findings": findings,
                "key_figures": extracted_data.get("key_figures", {}),
                "risks": extracted_data.get("risks", []),
                "opportunities": extracted_data.get("opportunities", []),
                "confidence": 0.6,
                "extracted_data": extracted_data
            }
            
            return result
            
        except Exception as e:
            logger.error(f"General report analysis failed: {e}")
            return self._create_fallback_result(document_type, str(e))
    
    async def _generate_general_findings(
        self,
        extracted_data: Dict,
        document_type: DocumentType
    ) -> List[ReportFinding]:
        """Genereer algemene findings"""
        findings = []
        
        try:
            # Voeg een algemene finding toe
            key_info = extracted_data.get("key_information", "No specific information extracted")
            
            findings.append(ReportFinding(
                category="general",
                description=f"Document analyzed: {document_type}. Key info: {key_info[:200]}...",
                severity="medium",
                confidence=0.7
            ))
            
            # Voeg findings toe voor specifieke data
            if extracted_data.get("measurements"):
                findings.append(ReportFinding(
                    category="measurements",
                    description="Measurements found in document",
                    severity="low",
                    confidence=0.6
                ))
            
            if extracted_data.get("materials"):
                findings.append(ReportFinding(
                    category="materials",
                    description="Materials specified in document",
                    severity="low",
                    confidence=0.6
                ))
            
            return findings
            
        except Exception as e:
            logger.error(f"Error generating general findings: {e}")
            return []
    
    def _create_fallback_result(
        self,
        document_type: DocumentType,
        error_message: str
    ) -> Dict[str, Any]:
        """Creëer een fallback resultaat bij analyse fout"""
        return {
            "metadata": ReportMetadata(
                report_type=str(document_type),
                summary=f"Analysis failed: {error_message}"
            ),
            "findings": [
                ReportFinding(
                    category="error",
                    description=f"Analysis failed: {error_message}",
                    severity="high",
                    confidence=0.1
                )
            ],
            "key_figures": {},
            "risks": ["Document analysis failed - manual review required"],
            "opportunities": [],
            "confidence": 0.1,
            "extracted_data": {"error": error_message}
        }
    
    def _find_in_dict(self, data: Dict, search_key: str) -> bool:
        """Recursief zoek naar een key in een dict"""
        if search_key in data:
            return True
        
        for value in data.values():
            if isinstance(value, dict):
                if self._find_in_dict(value, search_key):
                    return True
            elif isinstance(value, list):
                for item in value:
                    if isinstance(item, dict) and self._find_in_dict(item, search_key):
                        return True
        
        return False
    
    def _count_fields(self, data: Dict) -> int:
        """Tel aantal velden in dict"""
        count = 0
        
        for key, value in data.items():
            count += 1
            if isinstance(value, dict):
                count += self._count_fields(value)
            elif isinstance(value, list):
                for item in value:
                    if isinstance(item, dict):
                        count += self._count_fields(item)
        
        return count
