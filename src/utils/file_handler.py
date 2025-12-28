import logging
import os
import tempfile
import shutil
from typing import Dict, List, Optional, Any, Tuple
from pathlib import Path
import mimetypes
import asyncio

import aiofiles
import PyPDF2
from PIL import Image
import pdf2image
import pytesseract
from pydantic import BaseModel

logger = logging.getLogger(__name__)


class FileInfo(BaseModel):
    filename: str
    file_path: str
    file_size: int
    mime_type: str
    extension: str
    is_valid: bool = True
    validation_errors: List[str] = []


class ConversionResult(BaseModel):
    success: bool
    output_path: Optional[str] = None
    error: Optional[str] = None
    conversion_type: str


class FileHandler:
    """Handelt bestandsuploads, conversie en extractie"""
    
    def __init__(self, temp_dir: Optional[str] = None):
        self.temp_dir = temp_dir or tempfile.gettempdir()
        self.supported_extensions = {
            'image': ['.jpg', '.jpeg', '.png', '.tiff', '.bmp', '.gif'],
            'document': ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.txt'],
            'drawing': ['.dwg', '.dxf', '.ifc', '.rvt', '.skp'],
            'archive': ['.zip', '.rar', '.7z']
        }
        
        # Maak werk directories
        self.upload_dir = os.path.join(self.temp_dir, "uploads")
        self.processed_dir = os.path.join(self.temp_dir, "processed")
        self.cache_dir = os.path.join(self.temp_dir, "cache")
        
        for directory in [self.upload_dir, self.processed_dir, self.cache_dir]:
            os.makedirs(directory, exist_ok=True)
        
        logger.info(f"FileHandler initialized with temp dir: {self.temp_dir}")
    
    async def save_uploaded_file(
        self,
        file_content: bytes,
        original_filename: str,
        project_id: Optional[str] = None
    ) -> FileInfo:
        """
        Sla een geüpload bestand op
        
        Args:
            file_content: Bestand inhoud als bytes
            original_filename: Originele bestandsnaam
            project_id: Optioneel project ID voor organisatie
            
        Returns:
            FileInfo met bestandsinformatie
        """
        try:
            # Valideer bestand
            file_info = await self._validate_file(file_content, original_filename)
            
            if not file_info.is_valid:
                return file_info
            
            # Genereer een veilige bestandsnaam
            safe_filename = self._generate_safe_filename(original_filename)
            
            # Maak project subdirectory
            if project_id:
                project_dir = os.path.join(self.upload_dir, project_id)
                os.makedirs(project_dir, exist_ok=True)
                save_path = os.path.join(project_dir, safe_filename)
            else:
                save_path = os.path.join(self.upload_dir, safe_filename)
            
            # Sla het bestand op
            async with aiofiles.open(save_path, 'wb') as f:
                await f.write(file_content)
            
            # Update file info
            file_info.file_path = save_path
            file_info.file_size = len(file_content)
            
            logger.info(f"File saved: {save_path} ({file_info.file_size} bytes)")
            return file_info
            
        except Exception as e:
            logger.error(f"Error saving uploaded file: {e}")
            return FileInfo(
                filename=original_filename,
                file_path="",
                file_size=0,
                mime_type="application/octet-stream",
                extension="",
                is_valid=False,
                validation_errors=[str(e)]
            )
    
    async def _validate_file(self, file_content: bytes, filename: str) -> FileInfo:
        """Valideer een geüpload bestand"""
        errors = []
        
        # Basis informatie
        extension = Path(filename).suffix.lower()
        mime_type = mimetypes.guess_type(filename)[0] or "application/octet-stream"
        
        # Check bestandsgrootte (max 100MB)
        max_size = 100 * 1024 * 1024  # 100MB
        file_size = len(file_content)
        
        if file_size == 0:
            errors.append("File is empty")
        elif file_size > max_size:
            errors.append(f"File too large ({file_size} > {max_size} bytes)")
        
        # Check extensie
        if not extension:
            errors.append("No file extension")
        else:
            # Check of extensie ondersteund wordt
            supported = False
            for category, exts in self.supported_extensions.items():
                if extension in exts:
                    supported = True
                    break
            
            if not supported:
                errors.append(f"Unsupported file extension: {extension}")
        
        # Check op gevaarlijke bestanden
        dangerous_extensions = ['.exe', '.bat', '.cmd', '.sh', '.php', '.js']
        if extension in dangerous_extensions:
            errors.append(f"Potentially dangerous file type: {extension}")
        
        return FileInfo(
            filename=filename,
            file_path="",
            file_size=file_size,
            mime_type=mime_type,
            extension=extension,
            is_valid=len(errors) == 0,
            validation_errors=errors
        )
    
    def _generate_safe_filename(self, filename: str) -> str:
        """Genereer een veilige bestandsnaam"""
        import re
        from datetime import datetime
        
        # Haal basisnaam zonder pad
        basename = Path(filename).name
        
        # Verwijder onveilige karakters
        safe_name = re.sub(r'[^\w\-\.]', '_', basename)
        
        # Voeg timestamp toe voor uniekheid
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        name_without_ext = Path(safe_name).stem
        extension = Path(safe_name).suffix
        
        return f"{name_without_ext}_{timestamp}{extension}"
    
    async def extract_text(self, file_path: str) -> str:
        """
        Extraheer tekst uit een bestand
        
        Args:
            file_path: Pad naar het bestand
            
        Returns:
            Geëxtraheerde tekst
        """
        try:
            extension = Path(file_path).suffix.lower()
            
            if extension == '.pdf':
                return await self._extract_text_from_pdf(file_path)
            elif extension in ['.jpg', '.jpeg', '.png', '.tiff', '.bmp']:
                return await self._extract_text_from_image(file_path)
            elif extension in ['.doc', '.docx']:
                return await self._extract_text_from_doc(file_path)
            elif extension in ['.txt']:
                return await self._extract_text_from_txt(file_path)
            else:
                logger.warning(f"Text extraction not supported for {extension}")
                return ""
                
        except Exception as e:
            logger.error(f"Error extracting text from {file_path}: {e}")
            return ""
    
    async def _extract_text_from_pdf(self, file_path: str) -> str:
        """Extraheer tekst uit PDF"""
        try:
            text = ""
            
            # Probeer eerst met PyPDF2
            with open(file_path, 'rb') as file:
                pdf_reader = PyPDF2.PdfReader(file)
                
                for page_num in range(len(pdf_reader.pages)):
                    page = pdf_reader.pages[page_num]
                    page_text = page.extract_text()
                    
                    if page_text:
                        text += page_text + "\n"
            
            # Als PyPDF2 weinig tekst vindt, probeer OCR
            if len(text.strip()) < 100:
                logger.info(f"PDF has little text, trying OCR: {file_path}")
                ocr_text = await self._ocr_pdf(file_path)
                if ocr_text:
                    text = ocr_text
            
            return text
            
        except Exception as e:
            logger.error(f"PDF text extraction failed: {e}")
            return ""
    
    async def _ocr_pdf(self, file_path: str) -> str:
        """Voer OCR uit op PDF met pytesseract"""
        try:
            # Converteer PDF naar images
            images = pdf2image.convert_from_path(file_path, dpi=200)
            
            text_parts = []
            for i, image in enumerate(images):
                # Sla image tijdelijk op
                with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as tmp:
                    image.save(tmp.name, 'JPEG', quality=90)
                    
                    # Voer OCR uit
                    page_text = pytesseract.image_to_string(Image.open(tmp.name))
                    text_parts.append(page_text)
                
                # Cleanup
                os.unlink(tmp.name)
            
            return "\n".join(text_parts)
            
        except Exception as e:
            logger.error(f"PDF OCR failed: {e}")
            return ""
    
    async def _extract_text_from_image(self, file_path: str) -> str:
        """Extraheer tekst uit image met OCR"""
        try:
            # Voer OCR uit
            text = pytesseract.image_to_string(Image.open(file_path))
            return text
            
        except Exception as e:
            logger.error(f"Image OCR failed: {e}")
            return ""
    
    async def _extract_text_from_doc(self, file_path: str) -> str:
        """Extraheer tekst uit Word documenten"""
        try:
            # In productie: gebruik python-docx of andere library
            # Voor nu: simpele fallback
            logger.warning(f"Word document extraction not fully implemented for {file_path}")
            return f"Word document: {Path(file_path).name}"
            
        except Exception as e:
            logger.error(f"Word document extraction failed: {e}")
            return ""
    
    async def _extract_text_from_txt(self, file_path: str) -> str:
        """Lees tekst uit tekstbestand"""
        try:
            async with aiofiles.open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                return await f.read()
        except Exception as e:
            logger.error(f"Text file reading failed: {e}")
            return ""
    
    async def convert_to_image(
        self,
        file_path: str,
        output_format: str = 'jpg',
        dpi: int = 150
    ) -> ConversionResult:
        """
        Converteer een bestand naar image formaat
        
        Args:
            file_path: Pad naar bronbestand
            output_format: Output formaat (jpg, png)
            dpi: DPI voor conversie
            
        Returns:
            ConversionResult
        """
        try:
            extension = Path(file_path).suffix.lower()
            
            if extension == '.pdf':
                return await self._convert_pdf_to_image(file_path, output_format, dpi)
            elif extension in ['.dwg', '.dxf']:
                return await self._convert_cad_to_image(file_path, output_format, dpi)
            else:
                error = f"Conversion to image not supported for {extension}"
                logger.warning(error)
                return ConversionResult(
                    success=False,
                    error=error,
                    conversion_type=f"to_{output_format}"
                )
                
        except Exception as e:
            logger.error(f"Conversion to image failed: {e}")
            return ConversionResult(
                success=False,
                error=str(e),
                conversion_type=f"to_{output_format}"
            )
    
    async def _convert_pdf_to_image(
        self,
        file_path: str,
        output_format: str,
        dpi: int
    ) -> ConversionResult:
        """Converteer PDF naar image"""
        try:
            # Converteer alle pagina's
            images = pdf2image.convert_from_path(file_path, dpi=dpi)
            
            # Sla eerste pagina op als image
            if images:
                output_filename = f"{Path(file_path).stem}_page1.{output_format}"
                output_path = os.path.join(self.processed_dir, output_filename)
                
                images[0].save(output_path, output_format.upper(), quality=95)
                
                return ConversionResult(
                    success=True,
                    output_path=output_path,
                    conversion_type="pdf_to_image"
                )
            else:
                return ConversionResult(
                    success=False,
                    error="No pages found in PDF",
                    conversion_type="pdf_to_image"
                )
            
        except Exception as e:
            logger.error(f"PDF to image conversion failed: {e}")
            return ConversionResult(
                success=False,
                error=str(e),
                conversion_type="pdf_to_image"
            )
    
    async def _convert_cad_to_image(
        self,
        file_path: str,
        output_format: str,
        dpi: int
    ) -> ConversionResult:
        """Converteer CAD bestand naar image"""
        try:
            # In productie: gebruik ODA File Converter of Teigha
            # Voor nu: return error
            error = f"CAD to image conversion not implemented for {Path(file_path).suffix}"
            logger.warning(error)
            
            return ConversionResult(
                success=False,
                error=error,
                conversion_type="cad_to_image"
            )
            
        except Exception as e:
            logger.error(f"CAD to image conversion failed: {e}")
            return ConversionResult(
                success=False,
                error=str(e),
                conversion_type="cad_to_image"
            )
    
    async def extract_metadata(self, file_path: str) -> Dict[str, Any]:
        """
        Extraheer metadata van een bestand
        
        Args:
            file_path: Pad naar het bestand
            
        Returns:
            Dict met metadata
        """
        try:
            from PIL import Image as PILImage
            import PyPDF2
            
            metadata = {
                "filename": Path(file_path).name,
                "file_size": os.path.getsize(file_path),
                "created": os.path.getctime(file_path),
                "modified": os.path.getmtime(file_path),
                "extension": Path(file_path).suffix.lower(),
                "mime_type": mimetypes.guess_type(file_path)[0] or "unknown"
            }
            
            # Bestandsspecifieke metadata
            extension = metadata["extension"]
            
            if extension in ['.jpg', '.jpeg', '.png', '.tiff', '.bmp']:
                # Image metadata
                with PILImage.open(file_path) as img:
                    metadata.update({
                        "image_width": img.width,
                        "image_height": img.height,
                        "image_mode": img.mode,
                        "image_format": img.format
                    })
                    
                    # EXIF data indien beschikbaar
                    if hasattr(img, '_getexif') and img._getexif():
                        exif = img._getexif()
                        metadata["exif"] = {
                            "camera": exif.get(271),
                            "date_taken": exif.get(36867),
                            "orientation": exif.get(274)
                        }
            
            elif extension == '.pdf':
                # PDF metadata
                with open(file_path, 'rb') as file:
                    pdf_reader = PyPDF2.PdfReader(file)
                    
                    metadata.update({
                        "pdf_pages": len(pdf_reader.pages),
                        "pdf_author": pdf_reader.metadata.get('/Author', ''),
                        "pdf_title": pdf_reader.metadata.get('/Title', ''),
                        "pdf_creator": pdf_reader.metadata.get('/Creator', ''),
                        "pdf_producer": pdf_reader.metadata.get('/Producer', ''),
                        "pdf_encrypted": pdf_reader.is_encrypted
                    })
            
            elif extension in ['.dwg', '.dxf']:
                # CAD metadata
                metadata.update({
                    "cad_type": "AutoCAD" if extension == '.dwg' else "Drawing Exchange Format",
                    "note": "CAD metadata extraction requires specialized libraries"
                })
            
            return metadata
            
        except Exception as e:
            logger.error(f"Metadata extraction failed for {file_path}: {e}")
            return {
                "filename": Path(file_path).name,
                "error": str(e)
            }
    
    async def create_thumbnail(
        self,
        file_path: str,
        size: Tuple[int, int] = (200, 200),
        quality: int = 85
    ) -> Optional[str]:
        """
        Maak een thumbnail van een bestand
        
        Args:
            file_path: Pad naar bronbestand
            size: Thumbnail afmetingen (width, height)
            quality: JPEG kwaliteit (1-100)
            
        Returns:
            Pad naar thumbnail of None
        """
        try:
            from PIL import Image as PILImage
            
            extension = Path(file_path).suffix.lower()
            
            # Converteer naar image indien nodig
            if extension == '.pdf':
                # Gebruik eerste pagina van PDF
                images = pdf2image.convert_from_path(file_path, dpi=100)
                if not images:
                    return None
                image = images[0]
            elif extension in ['.jpg', '.jpeg', '.png', '.tiff', '.bmp']:
                image = PILImage.open(file_path)
            else:
                # Niet ondersteund
                return None
            
            # Maak thumbnail
            image.thumbnail(size, PILImage.Resampling.LANCZOS)
            
            # Sla op
            thumb_filename = f"thumb_{Path(file_path).stem}.jpg"
            thumb_path = os.path.join(self.cache_dir, thumb_filename)
            
            # Converteer naar RGB indien nodig
            if image.mode in ('RGBA', 'LA', 'P'):
                # Voeg witte achtergrond toe voor transparante afbeeldingen
                background = PILImage.new('RGB', image.size, (255, 255, 255))
                if image.mode == 'P':
                    image = image.convert('RGBA')
                background.paste(image, mask=image.split()[-1] if image.mode == 'RGBA' else None)
                image = background
            
            image.save(thumb_path, 'JPEG', quality=quality)
            
            return thumb_path
            
        except Exception as e:
            logger.error(f"Thumbnail creation failed for {file_path}: {e}")
            return None
    
    def get_file_category(self, file_path: str) -> str:
        """
        Bepaal de categorie van een bestand
        
        Args:
            file_path: Pad naar het bestand
            
        Returns:
            Categorie (image, document, drawing, archive, other)
        """
        extension = Path(file_path).suffix.lower()
        
        for category, extensions in self.supported_extensions.items():
            if extension in extensions:
                return category
        
        return "other"
    
    async def cleanup_old_files(self, max_age_hours: int = 24):
        """
        Verwijder oude tijdelijke bestanden
        
        Args:
            max_age_hours: Maximum leeftijd in uren
        """
        import time
        
        try:
            current_time = time.time()
            max_age_seconds = max_age_hours * 3600
            
            for directory in [self.upload_dir, self.processed_dir, self.cache_dir]:
                if os.path.exists(directory):
                    for filename in os.listdir(directory):
                        file_path = os.path.join(directory, filename)
                        
                        try:
                            # Check file age
                            file_age = current_time - os.path.getmtime(file_path)
                            
                            if file_age > max_age_seconds:
                                os.remove(file_path)
                                logger.debug(f"Cleaned up old file: {file_path}")
                        except Exception as e:
                            logger.warning(f"Could not cleanup {file_path}: {e}")
            
            logger.info(f"Cleanup completed for files older than {max_age_hours} hours")
            
        except Exception as e:
            logger.error(f"Cleanup failed: {e}")
    
    def get_available_formats(self) -> Dict[str, List[str]]:
        """
        Toon ondersteunde bestandsformaten
        
        Returns:
            Dict met categorieën en formaten
        """
        return self.supported_extensions.copy()


# Factory functie
def get_file_handler(temp_dir: Optional[str] = None) -> FileHandler:
    """Factory om FileHandler instantie te maken"""
    return FileHandler(temp_dir)
