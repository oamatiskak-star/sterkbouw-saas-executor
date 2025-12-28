import logging
import asyncio
from typing import Dict, List, Optional, Any
from pathlib import Path
import tempfile

from pydantic import BaseModel, Field
import cv2
import numpy as np
from PIL import Image
import pdf2image

from ..core.document_processor import DocumentType
from ..core.ai_orchestrator import AIOrchestrator
from ..models.vision_client import VisionClient

logger = logging.getLogger(__name__)


class DrawingElement(BaseModel):
    element_type: str
    location: Dict[str, float]  # x, y, width, height
    dimensions: Optional[Dict[str, float]] = None  # lengte, breedte, hoogte
    quantity: int = 1
    material: Optional[str] = None
    layer: Optional[str] = None
    confidence: float = Field(ge=0.0, le=1.0)


class DrawingMetadata(BaseModel):
    drawing_type: str  # plattegrond, gevel, doorsnede, detail
    scale: Optional[str] = None
    units: str = "mm"
    orientation: Optional[str] = None
    creation_date: Optional[str] = None
    author: Optional[str] = None
    title: Optional[str] = None
    software: Optional[str] = None


class DrawingAnalysisResult(BaseModel):
    metadata: DrawingMetadata
    elements: List[DrawingElement]
    total_area: Optional[float] = None
    total_volume: Optional[float] = None
    element_count: int = 0
    warnings: List[str] = Field(default_factory=list)
    suggestions: List[str] = Field(default_factory=list)
    processing_time: float


class DrawingAnalyzer:
    """Analyseert bouwtekeningen en extract bouwelementen"""
    
    def __init__(self, ai_orchestrator: AIOrchestrator):
        self.ai_orchestrator = ai_orchestrator
        self.vision_client = VisionClient()
        
        # Configuratie voor verschillende tekening types
        self.drawing_configs = {
            "floor_plan": {
                "target_elements": ["wall", "door", "window", "room", "column", "stairs"],
                "scale_detection": True,
                "measurement_extraction": True
            },
            "elevation": {
                "target_elements": ["facade", "window", "door", "balcony", "roof"],
                "height_measurement": True,
                "material_detection": True
            },
            "section": {
                "target_elements": ["foundation", "floor", "ceiling", "roof", "insulation"],
                "thickness_measurement": True,
                "layer_detection": True
            },
            "detail": {
                "target_elements": ["connection", "joint", "fixing", "seal"],
                "detailed_analysis": True,
                "manufacturer_info": True
            }
        }
        
        logger.info("DrawingAnalyzer initialized")
    
    async def analyze(
        self,
        file_path: str,
        document_type: DocumentType,
        context: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Analyseer een tekening bestand
        
        Args:
            file_path: Pad naar het tekening bestand
            document_type: Type document
            context: Optionele context informatie
            
        Returns:
            Analyse resultaten
        """
        logger.info(f"Starting drawing analysis: {file_path}")
        
        try:
            # Converteer naar image indien nodig
            image_paths = await self._convert_to_images(file_path)
            
            if not image_paths:
                raise ValueError(f"Could not convert {file_path} to images")
            
            # Analyseer elke pagina/image
            all_results = []
            for i, image_path in enumerate(image_paths):
                page_result = await self._analyze_image(image_path, i + 1, context)
                all_results.append(page_result)
            
            # Consolideer resultaten van alle pagina's
            consolidated_result = self._consolidate_results(all_results)
            
            # Detecteer tekening type
            drawing_type = await self._detect_drawing_type(image_paths[0], consolidated_result)
            
            # Structureer volgens STABU
            structured_elements = await self._structure_for_stabu(consolidated_result, drawing_type)
            
            # Bereken totalen
            totals = self._calculate_totals(structured_elements)
            
            # Genereer kosten schatting
            cost_estimate = await self._estimate_costs(structured_elements, context)
            
            result = {
                "drawing_type": drawing_type,
                "metadata": consolidated_result["metadata"].dict(),
                "elements": [elem.dict() for elem in structured_elements],
                "totals": totals,
                "cost_estimate": cost_estimate,
                "page_count": len(image_paths),
                "warnings": consolidated_result["warnings"],
                "suggestions": consolidated_result["suggestions"],
                "confidence": consolidated_result["confidence"]
            }
            
            logger.info(f"Drawing analysis complete: {len(structured_elements)} elements found")
            return result
            
        except Exception as e:
            logger.error(f"Error analyzing drawing {file_path}: {e}")
            raise
    
    async def _convert_to_images(self, file_path: str) -> List[str]:
        """Converteer tekening bestand naar images voor analyse"""
        file_ext = Path(file_path).suffix.lower()
        image_paths = []
        
        try:
            if file_ext == '.pdf':
                # Converteer PDF naar images
                images = pdf2image.convert_from_path(file_path, dpi=150)
                
                for i, image in enumerate(images):
                    with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as tmp:
                        image.save(tmp.name, 'JPEG', quality=90)
                        image_paths.append(tmp.name)
                
                logger.info(f"Converted PDF to {len(image_paths)} images")
                
            elif file_ext in ['.dwg', '.dxf']:
                # Voor CAD files: gebruik externe conversie
                # In productie: gebruik ODA File Converter of Teigha
                raise NotImplementedError(f"CAD file conversion for {file_ext} not yet implemented")
                
            elif file_ext in ['.jpg', '.jpeg', '.png', '.tiff', '.bmp']:
                # Al een image, kopieer naar temp file
                with tempfile.NamedTemporaryFile(suffix=file_ext, delete=False) as tmp:
                    with open(file_path, 'rb') as src:
                        tmp.write(src.read())
                    image_paths.append(tmp.name)
            
            else:
                raise ValueError(f"Unsupported file format: {file_ext}")
            
            return image_paths
            
        except Exception as e:
            logger.error(f"Error converting file to images: {e}")
            # Fallback: probeer met AI vision direct
            return [file_path]
    
    async def _analyze_image(
        self,
        image_path: str,
        page_number: int,
        context: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Analyseer een enkele image"""
        try:
            # Laad image
            image = cv2.imread(image_path)
            if image is None:
                raise ValueError(f"Could not load image: {image_path}")
            
            # Voorverwerking
            processed_image = self._preprocess_image(image)
            
            # Vision AI analyse
            vision_analysis = await self.vision_client.analyze_drawing(image_path)
            
            # Traditionele computer vision
            cv_results = self._computer_vision_analysis(processed_image)
            
            # Combineer resultaten
            combined_elements = self._combine_analysis_results(vision_analysis, cv_results)
            
            # Extract metadata
            metadata = await self._extract_metadata(image_path, vision_analysis)
            
            # Detecteer schaal
            scale = await self._detect_scale(image_path, combined_elements)
            if scale:
                metadata.scale = scale
            
            return {
                "page_number": page_number,
                "metadata": metadata,
                "elements": combined_elements,
                "scale": scale,
                "warnings": self._generate_warnings(combined_elements, metadata),
                "suggestions": self._generate_suggestions(combined_elements, context),
                "confidence": self._calculate_confidence(combined_elements, metadata)
            }
            
        except Exception as e:
            logger.error(f"Error analyzing image {image_path}: {e}")
            return {
                "page_number": page_number,
                "metadata": DrawingMetadata(drawing_type="unknown", units="mm"),
                "elements": [],
                "scale": None,
                "warnings": [f"Analysis error: {str(e)}"],
                "suggestions": [],
                "confidence": 0.0
            }
    
    def _preprocess_image(self, image: np.ndarray) -> np.ndarray:
        """Voorverwerk image voor betere analyse"""
        try:
            # Converteer naar grijswaarden
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            
            # Verwijder ruis
            denoised = cv2.fastNlMeansDenoising(gray, h=10)
            
            # Verhoog contrast
            clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
            enhanced = clahe.apply(denoised)
            
            # Binariseer (voor lijn detectie)
            _, binary = cv2.threshold(enhanced, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
            
            return binary
            
        except Exception as e:
            logger.warning(f"Image preprocessing failed: {e}")
            return image
    
    def _computer_vision_analysis(self, image: np.ndarray) -> List[DrawingElement]:
        """Traditionele computer vision analyse voor tekeningen"""
        elements = []
        
        try:
            # Detecteer lijnen (muren, deuren, etc.)
            lines = self._detect_lines(image)
            for line in lines:
                element = DrawingElement(
                    element_type="line",
                    location=line["location"],
                    dimensions=line.get("dimensions"),
                    confidence=0.7
                )
                elements.append(element)
            
            # Detecteer rechthoeken (ramen, deuren, ruimtes)
            rectangles = self._detect_rectangles(image)
            for rect in rectangles:
                element_type = self._classify_rectangle(rect)
                element = DrawingElement(
                    element_type=element_type,
                    location=rect["location"],
                    dimensions=rect.get("dimensions"),
                    confidence=0.8
                )
                elements.append(element)
            
            # Detecteer cirkels (kolommen, gaten)
            circles = self._detect_circles(image)
            for circle in circles:
                element = DrawingElement(
                    element_type="column",
                    location=circle["location"],
                    dimensions=circle.get("dimensions"),
                    confidence=0.6
                )
                elements.append(element)
            
            # Detecteer tekst (maten, notities)
            text_regions = self._detect_text_regions(image)
            for text in text_regions:
                if self._is_dimension_text(text):
                    element = DrawingElement(
                        element_type="dimension",
                        location=text["location"],
                        dimensions=text.get("value"),
                        confidence=0.9
                    )
                    elements.append(element)
            
            logger.info(f"CV analysis found {len(elements)} elements")
            return elements
            
        except Exception as e:
            logger.error(f"Computer vision analysis failed: {e}")
            return []
    
    def _detect_lines(self, image: np.ndarray) -> List[Dict]:
        """Detecteer lijnen in de tekening"""
        lines = []
        
        try:
            # Gebruik Hough Line Transform
            edges = cv2.Canny(image, 50, 150, apertureSize=3)
            hough_lines = cv2.HoughLinesP(
                edges,
                rho=1,
                theta=np.pi/180,
                threshold=50,
                minLineLength=30,
                maxLineGap=10
            )
            
            if hough_lines is not None:
                for line in hough_lines:
                    x1, y1, x2, y2 = line[0]
                    length = np.sqrt((x2 - x1)**2 + (y2 - y1)**2)
                    
                    lines.append({
                        "location": {"x1": x1, "y1": y1, "x2": x2, "y2": y2},
                        "dimensions": {"length": length},
                        "type": "wall" if length > 100 else "detail"
                    })
            
            return lines
            
        except Exception as e:
            logger.warning(f"Line detection failed: {e}")
            return []
    
    def _detect_rectangles(self, image: np.ndarray) -> List[Dict]:
        """Detecteer rechthoeken in de tekening"""
        rectangles = []
        
        try:
            # Zoek contouren
            contours, _ = cv2.findContours(image, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            
            for contour in contours:
                # Benader contour met rechthoek
                epsilon = 0.02 * cv2.arcLength(contour, True)
                approx = cv2.approxPolyDP(contour, epsilon, True)
                
                if len(approx) == 4:
                    # Rechthoek gevonden
                    x, y, w, h = cv2.boundingRect(approx)
                    area = w * h
                    
                    # Filter te kleine gebieden
                    if area > 100:
                        rectangles.append({
                            "location": {"x": x, "y": y, "width": w, "height": h},
                            "dimensions": {"width": w, "height": h, "area": area},
                            "aspect_ratio": w / h if h > 0 else 0
                        })
            
            return rectangles
            
        except Exception as e:
            logger.warning(f"Rectangle detection failed: {e}")
            return []
    
    def _detect_circles(self, image: np.ndarray) -> List[Dict]:
        """Detecteer cirkels in de tekening"""
        circles = []
        
        try:
            # Gebruik Hough Circle Transform
            detected_circles = cv2.HoughCircles(
                image,
                cv2.HOUGH_GRADIENT,
                dp=1,
                minDist=20,
                param1=50,
                param2=30,
                minRadius=5,
                maxRadius=100
            )
            
            if detected_circles is not None:
                detected_circles = np.uint16(np.around(detected_circles))
                
                for circle in detected_circles[0, :]:
                    x, y, radius = circle[0], circle[1], circle[2]
                    circles.append({
                        "location": {"x": x, "y": y, "radius": radius},
                        "dimensions": {"diameter": radius * 2, "area": np.pi * radius ** 2}
                    })
            
            return circles
            
        except Exception as e:
            logger.warning(f"Circle detection failed: {e}")
            return []
    
    def _detect_text_regions(self, image: np.ndarray) -> List[Dict]:
        """Detecteer tekst regio's"""
        # In productie: gebruik Tesseract OCR
        # Voor nu: simpele contour-gebaseerde detectie
        text_regions = []
        
        try:
            # Zoek kleine, compacte contouren die mogelijk tekst zijn
            contours, _ = cv2.findContours(image, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            
            for contour in contours:
                x, y, w, h = cv2.boundingRect(contour)
                
                # Filter op tekst-achtige vormen
                if 10 < w < 200 and 5 < h < 50 and w > h * 0.5:
                    text_regions.append({
                        "location": {"x": x, "y": y, "width": w, "height": h},
                        "area": w * h,
                        "aspect_ratio": w / h
                    })
            
            return text_regions
            
        except Exception as e:
            logger.warning(f"Text region detection failed: {e}")
            return []
    
    def _is_dimension_text(self, text_region: Dict) -> bool:
        """Check of tekst regio een maat aanduiding is"""
        # In productie: gebruik OCR om tekst te lezen
        # Voor nu: simpele heuristiek op basis van aspect ratio en locatie
        aspect_ratio = text_region.get("aspect_ratio", 0)
        return 2.0 < aspect_ratio < 10.0
    
    def _classify_rectangle(self, rectangle: Dict) -> str:
        """Classificeer een rechthoek als muur, raam, deur, etc."""
        aspect_ratio = rectangle.get("aspect_ratio", 1.0)
        area = rectangle.get("dimensions", {}).get("area", 0)
        
        if aspect_ratio > 5.0:
            return "wall"  # Lange, dunne rechthoek
        elif 0.8 < aspect_ratio < 1.2:
            if area > 5000:
                return "room"
            else:
                return "column"
        else:
            return "opening"
    
    async def _extract_metadata(self, image_path: str, vision_analysis: Dict) -> DrawingMetadata:
        """Extract metadata uit de tekening"""
        try:
            # Gebruik AI om metadata te extraheren
            prompt = f"""
            Extract metadata from this drawing analysis:
            {vision_analysis}
            
            Look for:
            1. Drawing type (floor plan, elevation, section, detail)
            2. Scale indicator
            3. Units (mm, cm, m)
            4. Orientation (north arrow, direction)
            5. Creation date
            6. Author/company
            7. Title/project name
            8. Software used
            
            Return as JSON.
            """
            
            response = await self.ai_orchestrator._extract_text(
                {
                    "analysis_type": "text_extraction",
                    "input_data": prompt
                }
            )
            
            metadata_dict = response.get("extracted_data", {})
            
            return DrawingMetadata(
                drawing_type=metadata_dict.get("drawing_type", "unknown"),
                scale=metadata_dict.get("scale"),
                units=metadata_dict.get("units", "mm"),
                orientation=metadata_dict.get("orientation"),
                creation_date=metadata_dict.get("creation_date"),
                author=metadata_dict.get("author"),
                title=metadata_dict.get("title"),
                software=metadata_dict.get("software")
            )
            
        except Exception as e:
            logger.warning(f"Metadata extraction failed: {e}")
            return DrawingMetadata(drawing_type="unknown", units="mm")
    
    async def _detect_scale(self, image_path: str, elements: List[DrawingElement]) -> Optional[str]:
        """Detecteer de schaal van de tekening"""
        try:
            # Zoek naar schaal indicator in tekening
            # In productie: gebruik AI om schaalbalk te herkennen
            # Voor nu: standaard schaal voor bouwtekeningen
            return "1:100"
            
        except Exception as e:
            logger.warning(f"Scale detection failed: {e}")
            return None
    
    def _combine_analysis_results(
        self,
        vision_analysis: Dict,
        cv_results: List[DrawingElement]
    ) -> List[DrawingElement]:
        """Combineer Vision AI en Computer Vision resultaten"""
        combined = []
        
        # Voeg vision elements toe
        vision_elements = vision_analysis.get("elements", [])
        for elem in vision_elements:
            drawing_elem = DrawingElement(
                element_type=elem.get("type", "unknown"),
                location=elem.get("location", {}),
                dimensions=elem.get("dimensions"),
                material=elem.get("material"),
                confidence=elem.get("confidence", 0.5)
            )
            combined.append(drawing_elem)
        
        # Voeg CV elements toe (als ze niet overlappen)
        for cv_elem in cv_results:
            # Check voor duplicate
            is_duplicate = False
            for vision_elem in combined:
                if self._elements_overlap(cv_elem, vision_elem):
                    is_duplicate = True
                    # Update confidence
                    vision_elem.confidence = max(vision_elem.confidence, cv_elem.confidence)
                    break
            
            if not is_duplicate:
                combined.append(cv_elem)
        
        return combined
    
    def _elements_overlap(self, elem1: DrawingElement, elem2: DrawingElement) -> bool:
        """Check of twee elementen overlappen"""
        loc1 = elem1.location
        loc2 = elem2.location
        
        if "x" in loc1 and "x" in loc2:
            # Rechthoekige elementen
            x1, y1 = loc1.get("x", 0), loc1.get("y", 0)
            w1, h1 = loc1.get("width", 0), loc1.get("height", 0)
            x2, y2 = loc2.get("x", 0), loc2.get("y", 0)
            w2, h2 = loc2.get("width", 0), loc2.get("height", 0)
            
            return not (x1 + w1 < x2 or x2 + w2 < x1 or y1 + h1 < y2 or y2 + h2 < y1)
        
        return False
    
    def _consolidate_results(self, page_results: List[Dict]) -> Dict[str, Any]:
        """Consolideer resultaten van meerdere pagina's"""
        if not page_results:
            return {
                "metadata": DrawingMetadata(drawing_type="unknown", units="mm"),
                "elements": [],
                "warnings": [],
                "suggestions": [],
                "confidence": 0.0
            }
        
        # Neem metadata van eerste pagina
        consolidated_metadata = page_results[0]["metadata"]
        
        # Combineer alle elementen
        all_elements = []
        for page in page_results:
            all_elements.extend(page["elements"])
        
        # Combineer waarschuwingen en suggesties
        all_warnings = []
        all_suggestions = []
        for page in page_results:
            all_warnings.extend(page.get("warnings", []))
            all_suggestions.extend(page.get("suggestions", []))
        
        # Bereken gemiddelde confidence
        total_confidence = sum(page.get("confidence", 0) for page in page_results)
        avg_confidence = total_confidence / len(page_results)
        
        return {
            "metadata": consolidated_metadata,
            "elements": all_elements,
            "warnings": list(set(all_warnings)),
            "suggestions": list(set(all_suggestions)),
            "confidence": avg_confidence
        }
    
    async def _detect_drawing_type(
        self,
        image_path: str,
        analysis_result: Dict
    ) -> str:
        """Detecteer het type tekening"""
        try:
            elements = analysis_result.get("elements", [])
            element_types = [elem.element_type for elem in elements]
            
            # Heuristiek voor tekening type detectie
            if any("room" in str(t).lower() for t in element_types):
                return "floor_plan"
            elif any("facade" in str(t).lower() for t in element_types):
                return "elevation"
            elif any("foundation" in str(t).lower() or "section" in str(t).lower() for t in element_types):
                return "section"
            elif any("detail" in str(t).lower() or "connection" in str(t).lower() for t in element_types):
                return "detail"
            
            # Gebruik AI voor classificatie
            prompt = f"""
            Classify this drawing based on analysis:
            {analysis_result}
            
            Choose from: floor_plan, elevation, section, detail
            
            Return only the type.
            """
            
            response = await self.ai_orchestrator._classify_document(
                {
                    "analysis_type": "document_classification",
                    "input_data": prompt
                }
            )
            
            return response.get("document_type", "floor_plan")
            
        except Exception as e:
            logger.warning(f"Drawing type detection failed: {e}")
            return "floor_plan"
    
    async def _structure_for_stabu(
        self,
        analysis_result: Dict,
        drawing_type: str
    ) -> List[DrawingElement]:
        """Structureer elementen volgens STABU classificatie"""
        try:
            elements = analysis_result.get("elements", [])
            
            prompt = f"""
            Classify these drawing elements according to STABU standards:
            
            Drawing type: {drawing_type}
            Elements: {[e.dict() for e in elements]}
            
            For each element, assign:
            1. STABU chapter (e.g., 2. Grondwerk, 3. Betonwerk, etc.)
            2. STABU element code if possible
            3. Construction type
            4. Recommended material
            
            Return as JSON list.
            """
            
            response = await self.ai_orchestrator._extract_text(
                {
                    "analysis_type": "text_extraction",
                    "input_data": prompt,
                    "context": {"response_format": "json"}
                }
            )
            
            structured_data = response.get("extracted_data", [])
            
            # Update elements with STABU info
            structured_elements = []
            for i, elem in enumerate(elements):
                if i < len(structured_data):
                    stabu_info = structured_data[i]
                    elem.material = stabu_info.get("recommended_material", elem.material)
                    # Add STABU metadata
                    elem.metadata = {
                        "stabu_chapter": stabu_info.get("stabu_chapter"),
                        "stabu_code": stabu_info.get("stabu_code"),
                        "construction_type": stabu_info.get("construction_type")
                    }
                structured_elements.append(elem)
            
            return structured_elements
            
        except Exception as e:
            logger.warning(f"STABU structuring failed: {e}")
            return analysis_result.get("elements", [])
    
    def _calculate_totals(self, elements: List[DrawingElement]) -> Dict[str, float]:
        """Bereken totalen van alle elementen"""
        totals = {
            "total_elements": len(elements),
            "total_area": 0.0,
            "total_volume": 0.0,
            "element_counts": {}
        }
        
        for elem in elements:
            # Tel element types
            elem_type = elem.element_type
            totals["element_counts"][elem_type] = totals["element_counts"].get(elem_type, 0) + 1
            
            # Bereken area indien beschikbaar
            if elem.dimensions and "area" in elem.dimensions:
                totals["total_area"] += elem.dimensions["area"]
            elif elem.dimensions and "width" in elem.dimensions and "height" in elem.dimensions:
                area = elem.dimensions["width"] * elem.dimensions["height"]
                totals["total_area"] += area
        
        return totals
    
    async def _estimate_costs(
        self,
        elements: List[DrawingElement],
        context: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Schat kosten op basis van elementen"""
        try:
            element_data = [
                {
                    "type": elem.element_type,
                    "dimensions": elem.dimensions,
                    "material": elem.material,
                    "quantity": elem.quantity
                }
                for elem in elements
            ]
            
            prompt = f"""
            Estimate construction costs for these drawing elements:
            
            Elements: {element_data}
            Project context: {context or {}}
            
            Provide cost estimate with:
            1. Cost per element type
            2. Material costs
            3. Labor costs
            4. Total per STABU chapter
            5. Overall total
            
            Use Dutch market prices 2024.
            Return as JSON.
            """
            
            response = await self.ai_orchestrator._estimate_costs(
                {
                    "analysis_type": "cost_estimation",
                    "input_data": prompt
                }
            )
            
            return response.get("cost_estimation", {})
            
        except Exception as e:
            logger.warning(f"Cost estimation failed: {e}")
            return {"error": str(e), "total": 0}
    
    def _generate_warnings(self, elements: List[DrawingElement], metadata: DrawingMetadata) -> List[str]:
        """Genereer waarschuwingen op basis van analyse"""
        warnings = []
        
        # Check op ontbrekende informatie
        if not metadata.scale:
            warnings.append("No scale detected - measurements may be inaccurate")
        
        if len(elements) < 5:
            warnings.append("Very few elements detected - check drawing quality")
        
        # Check op inconsistente eenheden
        if metadata.units not in ["mm", "cm", "m"]:
            warnings.append(f"Unusual units detected: {metadata.units}")
        
        return warnings
    
    def _generate_suggestions(
        self,
        elements: List[DrawingElement],
        context: Optional[Dict[str, Any]] = None
    ) -> List[str]:
        """Genereer suggesties voor verbetering"""
        suggestions = []
        
        # Suggesties gebaseerd op element types
        element_types = set(elem.element_type for elem in elements)
        
        if "wall" in element_types and "insulation" not in str(element_types):
            suggestions.append("Consider adding insulation specifications")
        
        if "window" in element_types and "u_value" not in str(context or ""):
            suggestions.append("Add U-value requirements for windows")
        
        if len(elements) > 50:
            suggestions.append("Consider dividing into multiple drawing sheets")
        
        return suggestions
    
    def _calculate_confidence(
        self,
        elements: List[DrawingElement],
        metadata: DrawingMetadata
    ) -> float:
        """Bereken confidence score voor de analyse"""
        confidence = 0.5  # Basis score
        
        # Hoger bij meer elementen
        element_count = len(elements)
        if element_count > 20:
            confidence += 0.2
        elif element_count > 10:
            confidence += 0.1
        
        # Hoger bij aanwezige metadata
        if metadata.scale:
            confidence += 0.1
        
        if metadata.title:
            confidence += 0.05
        
        if metadata.units in ["mm", "cm", "m"]:
            confidence += 0.05
        
        # Limiteer tussen 0 en 1
        return max(0.0, min(1.0, confidence))
