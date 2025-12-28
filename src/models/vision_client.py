import logging
import asyncio
from typing import Dict, List, Optional, Any, Tuple
from pathlib import Path
import tempfile

import cv2
import numpy as np
from PIL import Image
import pdf2image
import pytesseract
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


class VisionElement(BaseModel):
    element_type: str
    bbox: Tuple[int, int, int, int]  # x, y, width, height
    confidence: float = Field(ge=0.0, le=1.0)
    dimensions: Optional[Dict[str, float]] = None
    properties: Dict[str, Any] = Field(default_factory=dict)


class DrawingAnalysis(BaseModel):
    elements: List[VisionElement]
    metadata: Dict[str, Any]
    scale: Optional[str] = None
    units: str = "mm"
    confidence: float = Field(ge=0.0, le=1.0)
    warnings: List[str] = Field(default_factory=list)


class VisionClient:
    """Client voor computer vision taken: tekeninganalyse, OCR, etc."""
    
    def __init__(self):
        # Configuratie voor verschillende detectie methoden
        self.config = {
            "line_detection": {
                "min_line_length": 30,
                "max_line_gap": 10,
                "threshold": 50
            },
            "rectangle_detection": {
                "min_area": 100,
                "max_aspect_ratio": 10,
                "epsilon_factor": 0.02
            },
            "text_detection": {
                "min_width": 10,
                "max_width": 200,
                "min_height": 5,
                "max_height": 50
            },
            "circle_detection": {
                "min_radius": 5,
                "max_radius": 100,
                "param1": 50,
                "param2": 30
            }
        }
        
        logger.info("VisionClient initialized")
    
    async def analyze_drawing(self, image_path: str) -> Dict[str, Any]:
        """
        Analyseer een bouwtekening en extraheer elementen
        
        Args:
            image_path: Pad naar de tekening (PDF, JPG, PNG, etc.)
            
        Returns:
            Analyse resultaten met gedetecteerde elementen
        """
        try:
            logger.info(f"Analyzing drawing: {image_path}")
            
            # Converteer naar image indien nodig
            image_paths = await self._convert_to_images(image_path)
            
            if not image_paths:
                raise ValueError(f"Could not convert {image_path} to images")
            
            # Analyseer eerste pagina
            image = cv2.imread(image_paths[0])
            if image is None:
                raise ValueError(f"Could not load image: {image_paths[0]}")
            
            # Voorverwerking
            processed = self._preprocess_image(image)
            
            # Voer verschillende detecties uit
            lines = await self._detect_lines(processed)
            rectangles = await self._detect_rectangles(processed)
            circles = await self._detect_circles(processed)
            text_regions = await self._detect_text_regions(processed)
            
            # Classificeer elementen
            classified_elements = await self._classify_elements(
                lines, rectangles, circles, text_regions
            )
            
            # Detecteer schaal en metadata
            scale = await self._detect_scale(image_paths[0], classified_elements)
            metadata = await self._extract_metadata(image_paths[0])
            
            # Bereken confidence
            confidence = self._calculate_confidence(classified_elements, metadata)
            
            result = DrawingAnalysis(
                elements=classified_elements,
                metadata=metadata,
                scale=scale,
                units="mm",
                confidence=confidence,
                warnings=self._generate_warnings(classified_elements, metadata)
            )
            
            # Cleanup temp files
            for temp_path in image_paths:
                if temp_path != image_path:  # Niet het origineel verwijderen
                    try:
                        Path(temp_path).unlink()
                    except:
                        pass
            
            logger.info(f"Drawing analysis complete: {len(classified_elements)} elements found")
            return result.dict()
            
        except Exception as e:
            logger.error(f"Drawing analysis failed: {e}")
            raise
    
    async def classify_document(self, image_path: str) -> str:
        """
        Classificeer document type via vision analysis
        
        Args:
            image_path: Pad naar het document
            
        Returns:
            Document type classification
        """
        try:
            # Laad image
            image = cv2.imread(image_path)
            if image is None:
                return "unknown"
            
            # Voorverwerking
            processed = self._preprocess_image(image)
            
            # Detecteer kenmerken
            lines = await self._detect_lines(processed)
            rectangles = await self._detect_rectangles(processed)
            text_regions = await self._detect_text_regions(processed)
            
            # Heuristiek voor classificatie
            line_count = len(lines)
            rect_count = len(rectangles)
            text_count = len(text_regions)
            
            # Tekening: veel lijnen, weinig tekst
            if line_count > 50 and text_count < 20:
                return "drawing"
            
            # Rapport: veel tekst, weinig lijnen
            if text_count > 30 and line_count < 10:
                # Controleer op tabel structuren
                if rect_count > 5:
                    return "report"
                return "document"
            
            # Factuur/offerte: gemiddeld tekst, enkele lijnen
            if 10 < text_count < 50 and 5 < line_count < 20:
                return "invoice"
            
            return "unknown"
            
        except Exception as e:
            logger.error(f"Document classification failed: {e}")
            return "unknown"
    
    async def extract_text(self, image_path: str, language: str = "nld") -> str:
        """
        Extraheer tekst uit een image met OCR
        
        Args:
            image_path: Pad naar de image
            language: OCR taal (nld, eng, etc.)
            
        Returns:
            Geëxtraheerde tekst
        """
        try:
            # Laad image
            image = Image.open(image_path)
            
            # Configureer Tesseract
            pytesseract.pytesseract.tesseract_cmd = r'/usr/bin/tesseract'
            
            # Extraheer tekst
            text = pytesseract.image_to_string(image, lang=language)
            
            logger.info(f"Text extraction complete: {len(text)} characters")
            return text.strip()
            
        except Exception as e:
            logger.error(f"Text extraction failed: {e}")
            return ""
    
    async def detect_tables(self, image_path: str) -> List[Dict[str, Any]]:
        """
        Detecteer tabellen in een document
        
        Args:
            image_path: Pad naar het document
            
        Returns:
            Lijst van gedetecteerde tabellen
        """
        try:
            image = cv2.imread(image_path)
            if image is None:
                return []
            
            processed = self._preprocess_image(image)
            
            # Detecteer horizontale en verticale lijnen
            horizontal = await self._detect_horizontal_lines(processed)
            vertical = await self._detect_vertical_lines(processed)
            
            # Vind tabel structuren
            tables = await self._find_table_structures(horizontal, vertical)
            
            return tables
            
        except Exception as e:
            logger.error(f"Table detection failed: {e}")
            return []
    
    # === PRIVATE METHODS ===
    
    async def _convert_to_images(self, file_path: str) -> List[str]:
        """Converteer bestand naar images voor analyse"""
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
                
            elif file_ext in ['.jpg', '.jpeg', '.png', '.tiff', '.bmp']:
                # Al een image
                image_paths.append(file_path)
                
            elif file_ext in ['.dwg', '.dxf']:
                # CAD files - in productie zouden we een converter gebruiken
                logger.warning(f"CAD file conversion not implemented for {file_ext}")
                return []
                
            else:
                logger.warning(f"Unsupported file format: {file_ext}")
                return []
            
            return image_paths
            
        except Exception as e:
            logger.error(f"File conversion failed: {e}")
            return []
    
    def _preprocess_image(self, image: np.ndarray) -> np.ndarray:
        """Voorverwerk image voor betere analyse"""
        try:
            # Converteer naar grijswaarden
            if len(image.shape) == 3:
                gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            else:
                gray = image
            
            # Verwijder ruis
            denoised = cv2.fastNlMeansDenoising(gray, h=10)
            
            # Verhoog contrast
            clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
            enhanced = clahe.apply(denoised)
            
            # Binariseer voor lijn detectie
            _, binary = cv2.threshold(enhanced, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
            
            return binary
            
        except Exception as e:
            logger.warning(f"Image preprocessing failed: {e}")
            return image
    
    async def _detect_lines(self, image: np.ndarray) -> List[Dict[str, Any]]:
        """Detecteer lijnen in de image"""
        lines = []
        
        try:
            # Edge detection
            edges = cv2.Canny(image, 50, 150, apertureSize=3)
            
            # Hough Line Transform
            hough_lines = cv2.HoughLinesP(
                edges,
                rho=1,
                theta=np.pi/180,
                threshold=self.config["line_detection"]["threshold"],
                minLineLength=self.config["line_detection"]["min_line_length"],
                maxLineGap=self.config["line_detection"]["max_line_gap"]
            )
            
            if hough_lines is not None:
                for line in hough_lines:
                    x1, y1, x2, y2 = line[0]
                    length = np.sqrt((x2 - x1)**2 + (y2 - y1)**2)
                    
                    lines.append({
                        "type": "line",
                        "points": [(x1, y1), (x2, y2)],
                        "length": float(length),
                        "angle": np.degrees(np.arctan2(y2 - y1, x2 - x1)),
                        "bbox": (min(x1, x2), min(y1, y2), abs(x2 - x1), abs(y2 - y1))
                    })
            
            return lines
            
        except Exception as e:
            logger.warning(f"Line detection failed: {e}")
            return []
    
    async def _detect_rectangles(self, image: np.ndarray) -> List[Dict[str, Any]]:
        """Detecteer rechthoeken in de image"""
        rectangles = []
        
        try:
            # Zoek contouren
            contours, _ = cv2.findContours(image, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            
            for contour in contours:
                # Benader contour met polygoon
                epsilon = self.config["rectangle_detection"]["epsilon_factor"] * cv2.arcLength(contour, True)
                approx = cv2.approxPolyDP(contour, epsilon, True)
                
                # Controleer of het een rechthoek is (4 hoeken)
                if len(approx) == 4:
                    x, y, w, h = cv2.boundingRect(approx)
                    area = w * h
                    
                    # Filter op minimale grootte
                    if area >= self.config["rectangle_detection"]["min_area"]:
                        aspect_ratio = w / h if h > 0 else 0
                        
                        # Filter op extreme aspect ratios
                        if aspect_ratio <= self.config["rectangle_detection"]["max_aspect_ratio"]:
                            rectangles.append({
                                "type": "rectangle",
                                "bbox": (x, y, w, h),
                                "area": float(area),
                                "aspect_ratio": float(aspect_ratio),
                                "center": (x + w // 2, y + h // 2)
                            })
            
            return rectangles
            
        except Exception as e:
            logger.warning(f"Rectangle detection failed: {e}")
            return []
    
    async def _detect_circles(self, image: np.ndarray) -> List[Dict[str, Any]]:
        """Detecteer cirkels in de image"""
        circles = []
        
        try:
            # Gaussian blur voor betere detectie
            blurred = cv2.GaussianBlur(image, (5, 5), 0)
            
            # Hough Circle Transform
            detected_circles = cv2.HoughCircles(
                blurred,
                cv2.HOUGH_GRADIENT,
                dp=1,
                minDist=20,
                param1=self.config["circle_detection"]["param1"],
                param2=self.config["circle_detection"]["param2"],
                minRadius=self.config["circle_detection"]["min_radius"],
                maxRadius=self.config["circle_detection"]["max_radius"]
            )
            
            if detected_circles is not None:
                detected_circles = np.uint16(np.around(detected_circles))
                
                for circle in detected_circles[0, :]:
                    x, y, radius = circle[0], circle[1], circle[2]
                    
                    circles.append({
                        "type": "circle",
                        "center": (int(x), int(y)),
                        "radius": int(radius),
                        "diameter": int(radius * 2),
                        "area": float(np.pi * radius ** 2),
                        "bbox": (x - radius, y - radius, radius * 2, radius * 2)
                    })
            
            return circles
            
        except Exception as e:
            logger.warning(f"Circle detection failed: {e}")
            return []
    
    async def _detect_text_regions(self, image: np.ndarray) -> List[Dict[str, Any]]:
        """Detecteer tekst regio's"""
        text_regions = []
        
        try:
            # Zoek contouren
            contours, _ = cv2.findContours(image, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            
            for contour in contours:
                x, y, w, h = cv2.boundingRect(contour)
                
                # Filter op tekst-achtige afmetingen
                cfg = self.config["text_detection"]
                if (cfg["min_width"] <= w <= cfg["max_width"] and 
                    cfg["min_height"] <= h <= cfg["max_height"]):
                    
                    aspect_ratio = w / h if h > 0 else 0
                    
                    text_regions.append({
                        "type": "text_region",
                        "bbox": (x, y, w, h),
                        "area": w * h,
                        "aspect_ratio": aspect_ratio,
                        "is_dimension": self._is_dimension_indicator(w, h, aspect_ratio)
                    })
            
            return text_regions
            
        except Exception as e:
            logger.warning(f"Text region detection failed: {e}")
            return []
    
    async def _detect_horizontal_lines(self, image: np.ndarray) -> List[Dict[str, Any]]:
        """Detecteer horizontale lijnen (voor tabel detectie)"""
        horizontal = []
        
        try:
            # Specifieke kernel voor horizontale lijnen
            horizontal_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (40, 1))
            
            # Morphologische operaties
            horizontal_lines = cv2.morphologyEx(image, cv2.MORPH_OPEN, horizontal_kernel, iterations=2)
            
            # Zoek contouren
            contours, _ = cv2.findContours(horizontal_lines, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            
            for contour in contours:
                x, y, w, h = cv2.boundingRect(contour)
                if w > 100 and h < 20:  # Breed maar niet hoog
                    horizontal.append({
                        "bbox": (x, y, w, h),
                        "length": w,
                        "is_table_line": True
                    })
            
            return horizontal
            
        except Exception as e:
            logger.warning(f"Horizontal line detection failed: {e}")
            return []
    
    async def _detect_vertical_lines(self, image: np.ndarray) -> List[Dict[str, Any]]:
        """Detecteer verticale lijnen (voor tabel detectie)"""
        vertical = []
        
        try:
            # Specifieke kernel voor verticale lijnen
            vertical_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, 40))
            
            # Morphologische operaties
            vertical_lines = cv2.morphologyEx(image, cv2.MORPH_OPEN, vertical_kernel, iterations=2)
            
            # Zoek contouren
            contours, _ = cv2.findContours(vertical_lines, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            
            for contour in contours:
                x, y, w, h = cv2.boundingRect(contour)
                if h > 100 and w < 20:  # Hoog maar niet breed
                    vertical.append({
                        "bbox": (x, y, w, h),
                        "length": h,
                        "is_table_line": True
                    })
            
            return vertical
            
        except Exception as e:
            logger.warning(f"Vertical line detection failed: {e}")
            return []
    
    async def _find_table_structures(self, horizontal: List, vertical: List) -> List[Dict[str, Any]]:
        """Vind tabel structuren op basis van horizontale en verticale lijnen"""
        tables = []
        
        try:
            # Groepeer horizontale lijnen die dicht bij elkaar liggen
            horizontal_groups = self._group_lines(horizontal, axis='y', threshold=20)
            vertical_groups = self._group_lines(vertical, axis='x', threshold=20)
            
            # Vind snijpunten tussen groepen
            for h_group in horizontal_groups:
                for v_group in vertical_groups:
                    # Bepaal tabel regio
                    x_min = min(v["bbox"][0] for v in v_group)
                    x_max = max(v["bbox"][0] + v["bbox"][2] for v in v_group)
                    y_min = min(h["bbox"][1] for h in h_group)
                    y_max = max(h["bbox"][1] + h["bbox"][3] for h in h_group)
                    
                    # Alleen als het een redelijke grootte heeft
                    width = x_max - x_min
                    height = y_max - y_min
                    
                    if width > 100 and height > 100:
                        tables.append({
                            "bbox": (x_min, y_min, width, height),
                            "rows": len(h_group),
                            "columns": len(v_group),
                            "cells": len(h_group) * len(v_group)
                        })
            
            return tables
            
        except Exception as e:
            logger.warning(f"Table structure detection failed: {e}")
            return []
    
    async def _classify_elements(
        self,
        lines: List[Dict],
        rectangles: List[Dict],
        circles: List[Dict],
        text_regions: List[Dict]
    ) -> List[VisionElement]:
        """Classificeer gedetecteerde elementen als bouwelementen"""
        elements = []
        
        # Classificeer lijnen
        for line in lines:
            length = line.get("length", 0)
            angle = line.get("angle", 0)
            
            if length > 200:
                element_type = "wall"
            elif 50 < length <= 200:
                element_type = "beam"
            else:
                element_type = "detail_line"
            
            elements.append(VisionElement(
                element_type=element_type,
                bbox=line["bbox"],
                confidence=0.8,
                properties={
                    "length": length,
                    "angle": angle,
                    "is_structural": element_type in ["wall", "beam"]
                }
            ))
        
        # Classificeer rechthoeken
        for rect in rectangles:
            area = rect.get("area", 0)
            aspect_ratio = rect.get("aspect_ratio", 1)
            
            if aspect_ratio > 5:
                element_type = "wall_section"
            elif aspect_ratio < 0.2:
                element_type = "column"
            elif area > 10000:
                element_type = "room"
            elif area > 1000:
                element_type = "window"
            else:
                element_type = "opening"
            
            elements.append(VisionElement(
                element_type=element_type,
                bbox=rect["bbox"],
                confidence=0.7,
                properties={
                    "area": area,
                    "aspect_ratio": aspect_ratio,
                    "center": rect.get("center", (0, 0))
                }
            ))
        
        # Classificeer cirkels
        for circle in circles:
            radius = circle.get("radius", 0)
            
            if radius > 30:
                element_type = "column_circular"
            else:
                element_type = "hole"
            
            elements.append(VisionElement(
                element_type=element_type,
                bbox=circle["bbox"],
                confidence=0.6,
                properties={
                    "radius": radius,
                    "diameter": circle.get("diameter", 0),
                    "area": circle.get("area", 0)
                }
            ))
        
        # Classificeer tekst regio's
        for text in text_regions:
            if text.get("is_dimension", False):
                element_type = "dimension"
            else:
                element_type = "annotation"
            
            elements.append(VisionElement(
                element_type=element_type,
                bbox=text["bbox"],
                confidence=0.5,
                properties={
                    "area": text.get("area", 0),
                    "aspect_ratio": text.get("aspect_ratio", 0)
                }
            ))
        
        return elements
    
    async def _detect_scale(self, image_path: str, elements: List[VisionElement]) -> Optional[str]:
        """Detecteer schaal van de tekening"""
        try:
            # Zoek naar schaalbalk of dimension annotaties
            dimension_elements = [e for e in elements if e.element_type == "dimension"]
            
            if dimension_elements:
                # Gebruik meest voorkomende dimensie als referentie
                return "1:100"  # Placeholder - in productie: analyseer werkelijke maten
            
            # Controleer metadata in image
            with Image.open(image_path) as img:
                # Check EXIF data
                if hasattr(img, '_getexif') and img._getexif():
                    exif = img._getexif()
                    # Zoek naar schaal informatie
                    pass
            
            return None
            
        except Exception as e:
            logger.warning(f"Scale detection failed: {e}")
            return None
    
    async def _extract_metadata(self, image_path: str) -> Dict[str, Any]:
        """Extraheer metadata uit image"""
        metadata = {
            "filename": Path(image_path).name,
            "format": Path(image_path).suffix.lower(),
            "has_exif": False
        }
        
        try:
            with Image.open(image_path) as img:
                metadata.update({
                    "size": img.size,
                    "mode": img.mode,
                    "format": img.format
                })
                
                # EXIF data
                if hasattr(img, '_getexif') and img._getexif():
                    exif = img._getexif()
                    metadata["has_exif"] = True
                    
                    # Belangrijke EXIF tags
                    important_tags = {
                        271: "camera",
                        272: "model",
                        306: "datetime",
                        274: "orientation",
                        282: "x_resolution",
                        283: "y_resolution"
                    }
                    
                    exif_data = {}
                    for tag, name in important_tags.items():
                        if tag in exif:
                            exif_data[name] = exif[tag]
                    
                    metadata["exif"] = exif_data
            
        except Exception as e:
            logger.warning(f"Metadata extraction failed: {e}")
        
        return metadata
    
    def _calculate_confidence(self, elements: List[VisionElement], metadata: Dict) -> float:
        """Bereken confidence score voor de analyse"""
        confidence = 0.5
        
        # Hoger bij meer elementen
        element_count = len(elements)
        if element_count > 50:
            confidence += 0.3
        elif element_count > 20:
            confidence += 0.2
        elif element_count > 10:
            confidence += 0.1
        
        # Hoger bij structuurelementen
        structural_count = sum(1 for e in elements if e.properties.get("is_structural", False))
        if structural_count > 5:
            confidence += 0.1
        
        # Hoger bij aanwezige metadata
        if metadata.get("has_exif", False):
            confidence += 0.05
        
        return min(0.95, max(0.3, confidence))
    
    def _generate_warnings(self, elements: List[VisionElement], metadata: Dict) -> List[str]:
        """Genereer waarschuwingen op basis van analyse"""
        warnings = []
        
        if len(elements) < 5:
            warnings.append("Weinig elementen gedetecteerd - mogelijk lage beeldkwaliteit")
        
        structural_elements = [e for e in elements if e.properties.get("is_structural", False)]
        if len(structural_elements) == 0:
            warnings.append("Geen structuurelementen gedetecteerd - mogelijk geen bouwtekening")
        
        if not metadata.get("has_exif", False):
            warnings.append("Geen EXIF metadata beschikbaar - beperkte informatie")
        
        return warnings
    
    def _is_dimension_indicator(self, width: int, height: int, aspect_ratio: float) -> bool:
        """Check of een regio een maataanduiding is"""
        # Dimensies zijn meestal lang en smal
        return 3.0 < aspect_ratio < 10.0 and width > 50
    
    def _group_lines(self, lines: List[Dict], axis: str = 'x', threshold: int = 20) -> List[List[Dict]]:
        """Groepeer lijnen die dicht bij elkaar liggen"""
        if not lines:
            return []
        
        # Sorteer op de gespecificeerde as
        if axis == 'x':
            lines.sort(key=lambda l: l["bbox"][0])
        else:  # 'y'
            lines.sort(key=lambda l: l["bbox"][1])
        
        groups = []
        current_group = [lines[0]]
        
        for i in range(1, len(lines)):
            current_line = lines[i]
            last_line = current_group[-1]
            
            # Bepaal afstand
            if axis == 'x':
                dist = abs(current_line["bbox"][0] - last_line["bbox"][0])
            else:
                dist = abs(current_line["bbox"][1] - last_line["bbox"][1])
            
            if dist <= threshold:
                current_group.append(current_line)
            else:
                groups.append(current_group)
                current_group = [current_line]
        
        if current_group:
            groups.append(current_group)
        
        return groups


# Factory functie
def get_vision_client() -> VisionClient:
    """Factory om VisionClient instantie te maken"""
    return VisionClient()
