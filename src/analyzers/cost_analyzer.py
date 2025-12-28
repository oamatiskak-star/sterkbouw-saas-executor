# src/analyzers/cost_analyzer.py
import logging
import asyncio
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP

from pydantic import BaseModel, Field
import numpy as np

from ..core.document_processor import DocumentType
from ..core.ai_orchestrator import AIOrchestrator

logger = logging.getLogger(__name__)


class CostItem(BaseModel):
    """Individueel kosten item"""
    item_code: str
    description: str
    unit: str
    quantity: float
    unit_price: Decimal
    total_price: Decimal
    category: str  # materiaal, arbeid, machine, overhead
    subcategory: Optional[str] = None
    source: Optional[str] = None  # STABU, eigen, leverancier
    confidence: float = Field(ge=0.0, le=1.0)
    notes: List[str] = Field(default_factory=list)


class CostBreakdown(BaseModel):
    """Gedetailleerde kosten breakdown"""
    material_costs: List[CostItem]
    labor_costs: List[CostItem]
    equipment_costs: List[CostItem]
    overhead_costs: List[CostItem]
    subtotals: Dict[str, Decimal]
    vat_percentage: Decimal = Field(default=Decimal('0.21'))
    vat_amount: Decimal
    total_excl_vat: Decimal
    total_incl_vat: Decimal


class CostAnalysisResult(BaseModel):
    """Resultaat van kosten analyse"""
    project_name: str
    reference_number: Optional[str] = None
    date_created: datetime
    base_currency: str = "EUR"
    
    # Invoer data
    drawing_elements: Optional[List[Dict]] = None
    report_findings: Optional[List[Dict]] = None
    
    # Kosten data
    breakdown: CostBreakdown
    cost_per_m2: Optional[Decimal] = None
    cost_per_m3: Optional[Decimal] = None
    
    # Analyse resultaten
    risk_assessment: Dict[str, Any]
    saving_opportunities: List[str]
    price_comparison: Optional[Dict[str, Any]] = None
    
    # Validatie
    validation_warnings: List[str]
    confidence_score: float = Field(ge=0.0, le=1.0)
    
    # Metadata
    assumptions: List[str]
    data_sources: List[str]
    last_updated: datetime


class CostAnalyzer:
    """Analyseert en berekent kosten voor bouwprojecten"""
    
    def __init__(self, ai_orchestrator: AIOrchestrator):
        self.ai_orchestrator = ai_orchestrator
        
        # STABU 2024 eenheidsprijzen (vereenvoudigd)
        self.stabu_prices = {
            # Grondwerk (Hoofdstuk 2)
            "2.1": {"description": "Grondverzet per m3", "unit": "m3", "price": Decimal('25.00')},
            "2.2": {"description": "Ophoging zand", "unit": "m3", "price": Decimal('45.00')},
            
            # Betonwerk (Hoofdstuk 3)
            "3.1": {"description": "Fundering C20/25", "unit": "m3", "price": Decimal('145.00')},
            "3.2": {"description": "Vloer C25/30", "unit": "m3", "price": Decimal('165.00')},
            
            # Metselwerk (Hoofdstuk 4)
            "4.1": {"description": "Gevelsteen 10x20x50", "unit": "m2", "price": Decimal('85.00')},
            "4.2": {"description": "Binnenwand blokken", "unit": "m2", "price": Decimal('45.00')},
            
            # Houtwerk (Hoofdstuk 5)
            "5.1": {"description": "Draagbalk gelamineerd", "unit": "m", "price": Decimal('125.00')},
            "5.2": {"description": "Vloerbalk Vuren", "unit": "m", "price": Decimal('35.00')},
            
            # Dakwerk (Hoofdstuk 6)
            "6.1": {"description": "Dakpannen", "unit": "m2", "price": Decimal('75.00')},
            "6.2": {"description": "Isolatie dak", "unit": "m2", "price": Decimal('65.00')},
        }
        
        # Arbeidskosten per uur (2024)
        self.labor_rates = {
            "metselaar": Decimal('55.00'),
            "timmerman": Decimal('52.00'),
            "betonvlechter": Decimal('48.00'),
            "kraanmachinist": Decimal('65.00'),
            "algemeen_bouwarbeider": Decimal('42.00'),
        }
        
        # Machinekosten per dag
        self.equipment_rates = {
            "kraan_25t": Decimal('850.00'),
            "graafmachine": Decimal('450.00'),
            "betonpomp": Decimal('600.00'),
            "hoogwerker": Decimal('185.00'),
        }
        
        logger.info("CostAnalyzer initialized")
    
    async def analyze(
        self,
        drawing_analysis: Optional[Dict] = None,
        report_analysis: Optional[Dict] = None,
        context: Optional[Dict[str, Any]] = None
    ) -> CostAnalysisResult:
        """
        Analyseer kosten op basis van tekening en rapport analyses
        
        Args:
            drawing_analysis: Resultaat van DrawingAnalyzer
            report_analysis: Resultaat van ReportAnalyzer
            context: Project context (locatie, complexiteit, etc.)
            
        Returns:
            Gedetailleerde kosten analyse
        """
        logger.info("Starting cost analysis")
        
        try:
            # Extract elementen uit analyses
            elements = await self._extract_elements(drawing_analysis, report_analysis)
            
            # Classificeer elementen volgens STABU
            classified_elements = await self._classify_elements(elements, context)
            
            # Bereken hoeveelheden
            quantities = await self._calculate_quantities(classified_elements)
            
            # Bepaal eenheidsprijzen
            unit_prices = await self._determine_prices(classified_elements, context)
            
            # Bereken kosten breakdown
            breakdown = await self._calculate_breakdown(quantities, unit_prices, context)
            
            # Voeg overhead toe
            breakdown = await self._add_overhead(breakdown, context)
            
            # Bereken totaal
            total_costs = self._calculate_totals(breakdown)
            
            # Risico analyse
            risk_assessment = await self._assess_risks(breakdown, context)
            
            # Besparingsmogelijkheden
            saving_opportunities = await self._find_savings(breakdown, context)
            
            # Prijsvergelijking
            price_comparison = await self._compare_prices(breakdown, context)
            
            # Valideer resultaten
            validation_warnings = self._validate_calculation(breakdown)
            
            # Bereken confidence
            confidence_score = self._calculate_confidence(
                drawing_analysis, 
                report_analysis, 
                breakdown
            )
            
            # Creëer resultaat
            result = CostAnalysisResult(
                project_name=context.get("project_name", "Unnamed Project"),
                reference_number=context.get("reference_number"),
                date_created=datetime.now(),
                drawing_elements=drawing_analysis.get("elements") if drawing_analysis else None,
                report_findings=report_analysis.get("findings") if report_analysis else None,
                breakdown=breakdown,
                cost_per_m2=self._calculate_cost_per_m2(total_costs, context),
                cost_per_m3=self._calculate_cost_per_m3(total_costs, context),
                risk_assessment=risk_assessment,
                saving_opportunities=saving_opportunities,
                price_comparison=price_comparison,
                validation_warnings=validation_warnings,
                confidence_score=confidence_score,
                assumptions=self._list_assumptions(context),
                data_sources=self._list_data_sources(drawing_analysis, report_analysis),
                last_updated=datetime.now()
            )
            
            logger.info(f"Cost analysis complete: €{total_costs['total_incl_vat']:,.2f}")
            return result
            
        except Exception as e:
            logger.error(f"Error in cost analysis: {e}")
            raise
    
    async def _extract_elements(
        self,
        drawing_analysis: Optional[Dict],
        report_analysis: Optional[Dict]
    ) -> List[Dict]:
        """Extraheer bouwelementen uit analyses"""
        elements = []
        
        # Elementen uit tekening analyse
        if drawing_analysis and "elements" in drawing_analysis:
            for elem in drawing_analysis["elements"]:
                if isinstance(elem, dict):
                    elements.append({
                        "source": "drawing",
                        "element_type": elem.get("element_type"),
                        "dimensions": elem.get("dimensions"),
                        "material": elem.get("material"),
                        "quantity": elem.get("quantity", 1),
                        "metadata": elem.get("metadata", {})
                    })
        
        # Elementen uit rapport analyse
        if report_analysis and "findings" in report_analysis:
            for finding in report_analysis["findings"]:
                if isinstance(finding, dict):
                    elements.append({
                        "source": "report",
                        "element_type": finding.get("category"),
                        "description": finding.get("description"),
                        "severity": finding.get("severity"),
                        "recommendation": finding.get("recommendation")
                    })
        
        logger.info(f"Extracted {len(elements)} elements for cost analysis")
        return elements
    
    async def _classify_elements(
        self,
        elements: List[Dict],
        context: Optional[Dict[str, Any]]
    ) -> List[Dict]:
        """Classificeer elementen volgens STABU structuur"""
        classified_elements = []
        
        for element in elements:
            try:
                # Gebruik AI voor classificatie als beschikbaar
                if element.get("metadata", {}).get("stabu_code"):
                    # Al geclassificeerd in drawing analyzer
                    classified_elements.append(element)
                    continue
                
                # Classificeer op basis van element type
                stabu_code = self._map_to_stabu(
                    element.get("element_type"),
                    element.get("material"),
                    context
                )
                
                element["stabu_code"] = stabu_code
                element["stabu_chapter"] = stabu_code.split(".")[0] if "." in stabu_code else None
                
                classified_elements.append(element)
                
            except Exception as e:
                logger.warning(f"Failed to classify element {element.get('element_type')}: {e}")
                element["stabu_code"] = "99.9"  # Overig
                classified_elements.append(element)
        
        return classified_elements
    
    def _map_to_stabu(
        self,
        element_type: Optional[str],
        material: Optional[str],
        context: Optional[Dict[str, Any]]
    ) -> str:
        """Map element naar STABU code"""
        if not element_type:
            return "99.9"
        
        element_lower = element_type.lower()
        material_lower = (material or "").lower()
        
        # Simpele mapping (in productie: uitgebreide database)
        if any(word in element_lower for word in ["wall", "muur", "wand"]):
            if "load" in element_lower or "drag" in element_lower:
                return "3.1"  # Draagmuur
            else:
                return "4.2"  # Scheidingswand
        
        elif any(word in element_lower for word in ["window", "raam"]):
            return "7.1"  # Kozijnen en ramen
        
        elif any(word in element_lower for word in ["door", "deur"]):
            return "7.2"  # Deuren
        
        elif any(word in element_lower for word in ["floor", "vloer"]):
            if "concrete" in material_lower or "beton" in material_lower:
                return "3.2"  # Betonvloer
            else:
                return "5.3"  # Houten vloer
        
        elif any(word in element_lower for word in ["roof", "dak"]):
            return "6.1"  # Dakconstructie
        
        elif any(word in element_lower for word in ["foundation", "fundering"]):
            return "2.3"  # Fundering
        
        elif any(word in element_lower for word in ["insulation", "isolatie"]):
            return "8.1"  # Isolatie
        
        return "99.9"  # Overig
    
    async def _calculate_quantities(self, elements: List[Dict]) -> Dict[str, float]:
        """Bereken hoeveelheden per STABU code"""
        quantities = {}
        
        for element in elements:
            stabu_code = element.get("stabu_code")
            if not stabu_code:
                continue
            
            # Extract hoeveelheid uit dimensies
            quantity = self._extract_quantity(element)
            
            if stabu_code not in quantities:
                quantities[stabu_code] = 0
            
            quantities[stabu_code] += quantity
        
        return quantities
    
    def _extract_quantity(self, element: Dict) -> float:
        """Extraheer hoeveelheid uit element data"""
        # Check op expliciete hoeveelheid
        explicit_qty = element.get("quantity")
        if explicit_qty and isinstance(explicit_qty, (int, float)):
            return float(explicit_qty)
        
        # Bereken uit dimensies
        dimensions = element.get("dimensions")
        if not dimensions:
            return 1.0  # Standaard
        
        # Gebaseerd op beschikbare dimensies
        if "area" in dimensions:
            return float(dimensions["area"])
        elif "volume" in dimensions:
            return float(dimensions["volume"])
        elif "length" in dimensions:
            return float(dimensions["length"])
        elif "width" in dimensions and "height" in dimensions:
            return float(dimensions["width"]) * float(dimensions["height"])
        
        return 1.0
    
    async def _determine_prices(
        self,
        elements: List[Dict],
        context: Optional[Dict[str, Any]]
    ) -> Dict[str, Dict[str, Decimal]]:
        """Bepaal eenheidsprijzen per STABU code"""
        prices = {}
        
        for element in elements:
            stabu_code = element.get("stabu_code")
            if not stabu_code or stabu_code in prices:
                continue
            
            # Haal basisprijs uit STABU database
            base_price = self._get_stabu_price(stabu_code, element)
            
            # Pas aan op basis van context
            adjusted_price = self._adjust_price(base_price, element, context)
            
            prices[stabu_code] = {
                "unit_price": adjusted_price,
                "unit": self._get_unit_for_stabu(stabu_code),
                "description": element.get("element_type", "Unknown element"),
                "category": self._get_category_for_stabu(stabu_code)
            }
        
        return prices
    
    def _get_stabu_price(self, stabu_code: str, element: Dict) -> Decimal:
        """Haal STABU eenheidsprijs op"""
        # Zoek exacte match
        if stabu_code in self.stabu_prices:
            return Decimal(str(self.stabu_prices[stabu_code]["price"]))
        
        # Zoek op hoofdstuk
        chapter = stabu_code.split(".")[0] if "." in stabu_code else stabu_code
        for code, data in self.stabu_prices.items():
            if code.startswith(chapter + "."):
                return Decimal(str(data["price"]))
        
        # Standaard prijs gebaseerd op element type
        element_type = element.get("element_type", "").lower()
        
        if any(word in element_type for word in ["concrete", "beton"]):
            return Decimal('150.00')
        elif any(word in element_type for word in ["brick", "steen"]):
            return Decimal('85.00')
        elif any(word in element_type for word in ["wood", "hout"]):
            return Decimal('65.00')
        elif any(word in element_type for word in ["metal", "staal"]):
            return Decimal('125.00')
        
        return Decimal('100.00')  # Standaard
    
    def _adjust_price(
        self,
        base_price: Decimal,
        element: Dict,
        context: Optional[Dict[str, Any]]
    ) -> Decimal:
        """Pas prijs aan op basis van context"""
        adjusted_price = base_price
        
        # Complexiteitsfactor
        complexity = context.get("complexity", "medium")
        complexity_factors = {
            "low": Decimal('0.9'),
            "medium": Decimal('1.0'),
            "high": Decimal('1.15'),
            "very_high": Decimal('1.3')
        }
        adjusted_price *= complexity_factors.get(complexity, Decimal('1.0'))
        
        # Locatie factor
        location = context.get("location", "randstad")
        location_factors = {
            "randstad": Decimal('1.1'),
            "noord": Decimal('0.95'),
            "oost": Decimal('0.9'),
            "zuid": Decimal('0.95'),
            "west": Decimal('1.0')
        }
        adjusted_price *= location_factors.get(location, Decimal('1.0'))
        
        # Project grootte korting
        project_size = context.get("project_size", "medium")
        size_discounts = {
            "small": Decimal('1.05'),  # 5% toeslag voor klein
            "medium": Decimal('1.0'),
            "large": Decimal('0.95'),   # 5% korting voor groot
            "very_large": Decimal('0.9') # 10% korting voor zeer groot
        }
        adjusted_price *= size_discounts.get(project_size, Decimal('1.0'))
        
        # Afronden naar 2 decimalen
        return adjusted_price.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    
    def _get_unit_for_stabu(self, stabu_code: str) -> str:
        """Bepaal eenheid voor STABU code"""
        if stabu_code in self.stabu_prices:
            return self.stabu_prices[stabu_code]["unit"]
        
        # Standaard eenheden per hoofdstuk
        chapter = stabu_code.split(".")[0] if "." in stabu_code else stabu_code
        
        if chapter in ["2", "3"]:  # Grondwerk, Betonwerk
            return "m3"
        elif chapter in ["4", "6", "8"]:  # Metselwerk, Dakwerk, Isolatie
            return "m2"
        elif chapter == "5":  # Houtwerk
            return "m"
        else:
            return "stuk"
    
    def _get_category_for_stabu(self, stabu_code: str) -> str:
        """Bepaal categorie voor STABU code"""
        chapter = stabu_code.split(".")[0] if "." in stabu_code else stabu_code
        
        material_chapters = ["3", "4", "5", "7", "8"]  # Materialen
        labor_chapters = ["2", "9"]  # Grondwerk, Afwerking
        
        if chapter in material_chapters:
            return "material"
        elif chapter in labor_chapters:
            return "labor"
        else:
            return "other"
    
    async def _calculate_breakdown(
        self,
        quantities: Dict[str, float],
        prices: Dict[str, Dict[str, Decimal]],
        context: Optional[Dict[str, Any]]
    ) -> CostBreakdown:
        """Bereken gedetailleerde kosten breakdown"""
        material_items = []
        labor_items = []
        equipment_items = []
        
        # Bereken kosten per STABU code
        for stabu_code, quantity in quantities.items():
            if stabu_code not in prices:
                continue
            
            price_info = prices[stabu_code]
            unit_price = price_info["unit_price"]
            total_price = unit_price * Decimal(str(quantity))
            
            cost_item = CostItem(
                item_code=stabu_code,
                description=price_info["description"],
                unit=price_info["unit"],
                quantity=quantity,
                unit_price=unit_price,
                total_price=total_price,
                category=price_info["category"],
                source="STABU",
                confidence=0.8,
                notes=["Automatically calculated from STABU prices"]
            )
            
            # Voeg toe aan juiste categorie
            if price_info["category"] == "material":
                material_items.append(cost_item)
            elif price_info["category"] == "labor":
                labor_items.append(cost_item)
            else:
                material_items.append(cost_item)  # Standaard naar material
        
        # Voeg specifieke arbeidskosten toe
        labor_items.extend(await self._calculate_labor_costs(quantities, context))
        
        # Voeg machinekosten toe
        equipment_items.extend(await self._calculate_equipment_costs(quantities, context))
        
        # Bereken subtotalen
        subtotals = {
            "materials": sum(item.total_price for item in material_items),
            "labor": sum(item.total_price for item in labor_items),
            "equipment": sum(item.total_price for item in equipment_items)
        }
        
        # Creëer breakdown object
        breakdown = CostBreakdown(
            material_costs=material_items,
            labor_costs=labor_items,
            equipment_costs=equipment_items,
            overhead_costs=[],  # Wordt later toegevoegd
            subtotals=subtotals,
            vat_amount=Decimal('0'),  # Wordt later berekend
            total_excl_vat=sum(subtotals.values()),
            total_incl_vat=sum(subtotals.values())
        )
        
        return breakdown
    
    async def _calculate_labor_costs(
        self,
        quantities: Dict[str, float],
        context: Optional[Dict[str, Any]]
    ) -> List[CostItem]:
        """Bereken arbeidskosten"""
        labor_items = []
        
        # Schat arbeidsuren gebaseerd op hoeveelheden
        total_quantity = sum(quantities.values())
        
        # Regel van duim: 1 uur arbeid per €100 materiaal
        estimated_hours = float(total_quantity) * 0.01
        
        # Verdeel over verschillende beroepen
        labor_distribution = {
            "metselaar": Decimal('0.3'),
            "timmerman": Decimal('0.25'),
            "algemeen_bouwarbeider": Decimal('0.45')
        }
        
        for profession, percentage in labor_distribution.items():
            hours = estimated_hours * float(percentage)
            rate = self.labor_rates.get(profession, Decimal('50.00'))
            total = rate * Decimal(str(hours))
            
            labor_items.append(CostItem(
                item_code=f"LABOR_{profession.upper()}",
                description=f"{profession.title()} uren",
                unit="uur",
                quantity=hours,
                unit_price=rate,
                total_price=total,
                category="labor",
                source="tarieventabel",
                confidence=0.7,
                notes=["Geschat op basis van materiaalkosten"]
            ))
        
        return labor_items
    
    async def _calculate_equipment_costs(
        self,
        quantities: Dict[str, float],
        context: Optional[Dict[str, Any]]
    ) -> List[CostItem]:
        """Bereken machinekosten"""
        equipment_items = []
        
        # Schat equipment dagen gebaseerd op project grootte
        total_quantity = sum(quantities.values())
        
        if total_quantity > 1000:
            # Groot project
            equipment_needs = [
                ("kraan_25t", 10),
                ("graafmachine", 15),
                ("hoogwerker", 20)
            ]
        elif total_quantity > 100:
            # Middelgroot project
            equipment_needs = [
                ("kraan_25t", 5),
                ("graafmachine", 8),
                ("hoogwerker", 10)
            ]
        else:
            # Klein project
            equipment_needs = [
                ("graafmachine", 3),
                ("hoogwerker", 5)
            ]
        
        for equipment_type, days in equipment_needs:
            rate = self.equipment_rates.get(equipment_type, Decimal('300.00'))
            total = rate * Decimal(str(days))
            
            equipment_items.append(CostItem(
                item_code=f"EQP_{equipment_type.upper()}",
                description=equipment_type.replace('_', ' ').title(),
                unit="dag",
                quantity=days,
                unit_price=rate,
                total_price=total,
                category="equipment",
                source="verhuurtarieven",
                confidence=0.6,
                notes=["Geschat op basis van projectomvang"]
            ))
        
        return equipment_items
    
    async def _add_overhead(
        self,
        breakdown: CostBreakdown,
        context: Optional[Dict[str, Any]]
    ) -> CostBreakdown:
        """Voeg overhead kosten toe"""
        total_excl_overhead = breakdown.total_excl_vat
        
        # Overhead percentages
        overhead_items = []
        
        # Projectmanagement (8-12%)
        pm_percentage = Decimal('0.10')
        pm_amount = total_excl_overhead * pm_percentage
        overhead_items.append(CostItem(
            item_code="OVERHEAD_PM",
            description="Projectmanagement",
            unit="%",
            quantity=float(pm_percentage * 100),
            unit_price=pm_amount / Decimal('100'),
            total_price=pm_amount,
            category="overhead",
            source="standaard",
            confidence=0.8
        ))
        
        # Algemeen bedrijfskosten (5-8%)
        oh_percentage = Decimal('0.06')
        oh_amount = total_excl_overhead * oh_percentage
        overhead_items.append(CostItem(
            item_code="OVERHEAD_OH",
            description="Algemene bedrijfskosten",
            unit="%",
            quantity=float(oh_percentage * 100),
            unit_price=oh_amount / Decimal('100'),
            total_price=oh_amount,
            category="overhead",
            source="standaard",
            confidence=0.8
        ))
        
        # Winstmarge (8-15%)
        profit_percentage = Decimal('0.10')
        profit_amount = total_excl_overhead * profit_percentage
        overhead_items.append(CostItem(
            item_code="OVERHEAD_PROFIT",
            description="Winstmarge",
            unit="%",
            quantity=float(profit_percentage * 100),
            unit_price=profit_amount / Decimal('100'),
            total_price=profit_amount,
            category="overhead",
            source="standaard",
            confidence=0.7
        ))
        
        # Update breakdown
        breakdown.overhead_costs = overhead_items
        
        # Update totaal
        total_overhead = sum(item.total_price for item in overhead_items)
        breakdown.total_excl_vat += total_overhead
        breakdown.total_incl_vat = breakdown.total_excl_vat
        
        # Update subtotals
        breakdown.subtotals["overhead"] = total_overhead
        
        return breakdown
    
    def _calculate_totals(self, breakdown: CostBreakdown) -> Dict[str, Decimal]:
        """Bereken eindtotalen met BTW"""
        total_excl_vat = breakdown.total_excl_vat
        vat_amount = total_excl_vat * breakdown.vat_percentage
        total_incl_vat = total_excl_vat + vat_amount
        
        # Update breakdown
        breakdown.vat_amount = vat_amount
        breakdown.total_incl_vat = total_incl_vat
        
        return {
            "total_excl_vat": total_excl_vat,
            "vat_amount": vat_amount,
            "total_incl_vat": total_incl_vat
        }
    
    def _calculate_cost_per_m2(
        self,
        totals: Dict[str, Decimal],
        context: Optional[Dict[str, Any]]
    ) -> Optional[Decimal]:
        """Bereken kosten per m2"""
        area = context.get("surface_area")
        if not area:
            return None
        
        try:
            area_decimal = Decimal(str(area))
            if area_decimal > 0:
                return totals["total_incl_vat"] / area_decimal
        except:
            pass
        
        return None
    
    def _calculate_cost_per_m3(
        self,
        totals: Dict[str, Decimal],
        context: Optional[Dict[str, Any]]
    ) -> Optional[Decimal]:
        """Bereken kosten per m3"""
        volume = context.get("volume")
        if not volume:
            return None
        
        try:
            volume_decimal = Decimal(str(volume))
            if volume_decimal > 0:
                return totals["total_incl_vat"] / volume_decimal
        except:
            pass
        
        return None
    
    async def _assess_risks(
        self,
        breakdown: CostBreakdown,
        context: Optional[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Beoordeel kosten risico's"""
        risks = {
            "high_cost_items": [],
            "price_volatility": [],
            "labor_risk": None,
            "material_risk": None,
            "overall_risk_level": "medium"
        }
        
        # Identificeer hoge kosten items
        all_items = (breakdown.material_costs + breakdown.labor_costs + 
                    breakdown.equipment_costs + breakdown.overhead_costs)
        
        for item in all_items:
            if item.total_price > Decimal('5000'):
                risks["high_cost_items"].append({
                    "item": item.description,
                    "cost": float(item.total_price),
                    "percentage": float((item.total_price / breakdown.total_incl_vat) * 100)
                })
        
        # Beoordeel arbeidsrisico
        labor_percentage = float((breakdown.subtotals.get("labor", Decimal('0')) / 
                                breakdown.total_excl_vat) * 100)
        if labor_percentage > 40:
            risks["labor_risk"] = "high"
            risks["labor_percentage"] = labor_percentage
        elif labor_percentage > 30:
            risks["labor_risk"] = "medium"
            risks["labor_percentage"] = labor_percentage
        
        # Beoordeel materiaalrisico
        material_percentage = float((breakdown.subtotals.get("materials", Decimal('0')) / 
                                   breakdown.total_excl_vat) * 100)
        if material_percentage > 60:
            risks["material_risk"] = "high"
            risks["material_percentage"] = material_percentage
        
        # Bepaal overall risk level
        if risks["labor_risk"] == "high" or risks["material_risk"] == "high":
            risks["overall_risk_level"] = "high"
        elif len(risks["high_cost_items"]) > 3:
            risks["overall_risk_level"] = "medium-high"
        
        return risks
    
    async def _find_savings(
        self,
        breakdown: CostBreakdown,
        context: Optional[Dict[str, Any]]
    ) -> List[str]:
        """Vind besparingsmogelijkheden"""
        savings = []
        
        # Analyseer kosten breakdown
        labor_percentage = float((breakdown.subtotals.get("labor", Decimal('0')) / 
                                breakdown.total_excl_vat) * 100)
        
        if labor_percentage > 35:
            savings.append("Overweeg prefab elementen om arbeidskosten te reduceren")
        
        # Check op dure materialen
        material_items = sorted(breakdown.material_costs, 
                              key=lambda x: x.total_price, 
                              reverse=True)[:3]
        
        for item in material_items:
            if item.total_price > Decimal('10000'):
                savings.append(f"Onderzoek alternatieven voor {item.description} (€{item.total_price:,.2f})")
        
        # Check op overhead percentage
        overhead_total = breakdown.subtotals.get("overhead", Decimal('0'))
        overhead_percentage = float((overhead_total / breakdown.total_excl_vat) * 100)
        
        if overhead_percentage > 30:
            savings.append("Overhead percentage is hoog - optimaliseer projectmanagement")
        
        # Standaard suggesties
        savings.append("Vraag meerdere offertes aan voor grote posten")
        savings.append("Overweeg bulkinkoop voor veelgebruikte materialen")
        
        return savings
    
    async def _compare_prices(
        self,
        breakdown: CostBreakdown,
        context: Optional[Dict[str, Any]]
    ) -> Optional[Dict[str, Any]]:
        """Vergelijk prijzen met marktgemiddelden"""
        # In productie: haal data uit prijsdatabase
        # Voor nu: gebruik standaard factoren
        
        market_factors = {
            "materials": Decimal('1.0'),  # 100% van marktprijs
            "labor": Decimal('1.05'),     # 5% boven markt
            "equipment": Decimal('0.95'), # 5% onder markt
            "overhead": Decimal('1.02')   # 2% boven markt
        }
        
        comparison = {}
        
        for category, factor in market_factors.items():
            subtotal = breakdown.subtotals.get(category, Decimal('0'))
            market_value = subtotal / factor
            
            comparison[category] = {
                "calculated": float(subtotal),
                "market_average": float(market_value),
                "difference_percentage": float((1 - factor) * 100),
                "status": "above" if factor > 1 else "below"
            }
        
        return comparison
    
    def _validate_calculation(self, breakdown: CostBreakdown) -> List[str]:
        """Valideer de kostenberekening"""
        warnings = []
        
        # Check op zeer lage of hoge bedragen
        if breakdown.total_excl_vat < Decimal('1000'):
            warnings.append("Zeer laag totaalbedrag - mogelijk onvolledige analyse")
        
        if breakdown.total_excl_vat > Decimal('1000000'):
            warnings.append("Zeer hoog totaalbedrag - extra validatie aanbevolen")
        
        # Check op onevenwichtige verdeling
        subtotals = breakdown.subtotals
        total = breakdown.total_excl_vat
        
        if total > 0:
            for category, amount in subtotals.items():
                percentage = (amount / total) * 100
                
                if category == "materials" and percentage < 30:
                    warnings.append("Laag materiaalpercentage - mogelijk arbeidsintensief ontwerp")
                elif category == "labor" and percentage > 50:
                    warnings.append("Hoog arbeidspercentage - overweeg efficiency verbeteringen")
        
        # Check op items zonder beschrijving
        all_items = (breakdown.material_costs + breakdown.labor_costs + 
                    breakdown.equipment_costs + breakdown.overhead_costs)
        
        for item in all_items:
            if not item.description or item.description == "Unknown element":
                warnings.append(f"Item zonder beschrijving: {item.item_code}")
        
        return warnings
    
    def _calculate_confidence(
        self,
        drawing_analysis: Optional[Dict],
        report_analysis: Optional[Dict],
        breakdown: CostBreakdown
    ) -> float:
        """Bereken confidence score voor kostenanalyse"""
        confidence = 0.5
        
        # Hoger bij aanwezigheid van tekening analyse
        if drawing_analysis:
            drawing_conf = drawing_analysis.get("confidence", 0.5)
            confidence += drawing_conf * 0.2
        
        # Hoger bij aanwezigheid van rapport analyse
        if report_analysis:
            report_conf = report_analysis.get("confidence", 0.5)
            confidence += report_conf * 0.1
        
        # Hoger bij meer items
        total_items = (len(breakdown.material_costs) + len(breakdown.labor_costs) + 
                      len(breakdown.equipment_costs) + len(breakdown.overhead_costs))
        
        if total_items > 20:
            confidence += 0.15
        elif total_items > 10:
            confidence += 0.1
        elif total_items > 5:
            confidence += 0.05
        
        # Lager bij waarschuwingen
        warnings = self._validate_calculation(breakdown)
        if warnings:
            confidence -= len(warnings) * 0.02
        
        return max(0.1, min(0.95, confidence))
    
    def _list_assumptions(self, context: Optional[Dict[str, Any]]) -> List[str]:
        """Lijst aannames op"""
        assumptions = [
            "STABU 2024 prijzen gebruikt voor eenheidsprijzen",
            "BTW percentage: 21%",
            "Kosten gebaseerd op Nederlandse marktprijzen 2024",
            "Arbeidskosten inclusief sociale lasten"
        ]
        
        if context:
            if context.get("complexity"):
                assumptions.append(f"Complexiteitsfactor: {context['complexity']}")
            if context.get("location"):
                assumptions.append(f"Locatie factor: {context['location']}")
        
        return assumptions
    
    def _list_data_sources(
        self,
        drawing_analysis: Optional[Dict],
        report_analysis: Optional[Dict]
    ) -> List[str]:
        """Lijst databronnen op"""
        sources = ["STABU 2024 eenheidsprijzen", "Interne tarieventabellen"]
        
        if drawing_analysis:
            sources.append(f"Tekening analyse: {drawing_analysis.get('drawing_type', 'unknown')}")
        
        if report_analysis:
            sources.append(f"Rapport analyse: {report_analysis.get('metadata', {}).get('report_type', 'unknown')}")
        
        return sources
