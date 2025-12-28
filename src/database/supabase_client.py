import logging
import os
from typing import Dict, List, Optional, Any
from datetime import datetime
import json

from supabase import create_client, Client
from pydantic import BaseModel
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

# Laad environment variabelen
load_dotenv()


class CalculationVersion(BaseModel):
    version_id: str
    project_id: str
    calculation_data: Dict[str, Any]
    created_at: datetime
    created_by: Optional[str] = None
    is_active: bool = True


class DocumentAnalysisRecord(BaseModel):
    id: str
    project_id: str
    document_id: str
    analysis_data: Dict[str, Any]
    created_at: datetime
    confidence_score: float


class STABUPrice(BaseModel):
    code: str
    description: str
    unit: str
    price: float
    category: str
    subcategory: Optional[str] = None
    valid_from: datetime
    valid_to: Optional[datetime] = None
    source: str


class SupabaseClient:
    """Client voor interactie met Supabase database"""
    
    def __init__(self):
        self.supabase_url = os.getenv("SUPABASE_URL")
        self.supabase_key = os.getenv("SUPABASE_SERVICE_KEY")
        
        if not self.supabase_url or not self.supabase_key:
            raise ValueError("Supabase URL en Service Key moeten geconfigureerd zijn in .env")
        
        self.client: Client = create_client(self.supabase_url, self.supabase_key)
        logger.info("Supabase client initialized")
    
    async def test_connection(self) -> bool:
        """Test de database connectie"""
        try:
            # Simpele query om connectie te testen
            response = self.client.table("calculations").select("count", count="exact").limit(1).execute()
            logger.info("Supabase connection test successful")
            return True
        except Exception as e:
            logger.error(f"Supabase connection test failed: {e}")
            return False
    
    # CALCULATION MANAGEMENT
    async def insert_calculation(
        self,
        project_id: str,
        calculation_data: Dict[str, Any],
        version: str = "1.0",
        created_by: Optional[str] = None
    ) -> str:
        """Voeg een nieuwe calculatie toe aan de database"""
        try:
            calculation_id = f"calc_{datetime.now().strftime('%Y%m%d%H%M%S')}_{project_id}"
            
            data = {
                "id": calculation_id,
                "project_id": project_id,
                "version": version,
                "calculation_data": calculation_data,
                "created_at": datetime.now().isoformat(),
                "created_by": created_by,
                "is_active": True
            }
            
            response = self.client.table("calculations").insert(data).execute()
            
            if response.data:
                logger.info(f"Calculation {calculation_id} inserted for project {project_id}")
                return calculation_id
            else:
                raise Exception("No data returned from insert")
                
        except Exception as e:
            logger.error(f"Error inserting calculation: {e}")
            raise
    
    async def get_calculation(self, calculation_id: str) -> Optional[Dict[str, Any]]:
        """Haal een calculatie op bij ID"""
        try:
            response = self.client.table("calculations").select("*").eq("id", calculation_id).execute()
            
            if response.data:
                return response.data[0]
            return None
            
        except Exception as e:
            logger.error(f"Error getting calculation {calculation_id}: {e}")
            return None
    
    async def get_project_calculations(self, project_id: str) -> List[Dict[str, Any]]:
        """Haal alle calculaties op voor een project"""
        try:
            response = self.client.table("calculations").select("*").eq("project_id", project_id).order("created_at", desc=True).execute()
            return response.data
        except Exception as e:
            logger.error(f"Error getting calculations for project {project_id}: {e}")
            return []
    
    async def update_calculation(
        self,
        calculation_id: str,
        updates: Dict[str, Any]
    ) -> bool:
        """Update een bestaande calculatie"""
        try:
            updates["updated_at"] = datetime.now().isoformat()
            
            response = self.client.table("calculations").update(updates).eq("id", calculation_id).execute()
            
            success = bool(response.data)
            if success:
                logger.info(f"Calculation {calculation_id} updated")
            return success
            
        except Exception as e:
            logger.error(f"Error updating calculation {calculation_id}: {e}")
            return False
    
    async def deactivate_calculation(self, calculation_id: str) -> bool:
        """Deactiveer een calculatie (soft delete)"""
        return await self.update_calculation(calculation_id, {"is_active": False})
    
    # DOCUMENT ANALYSIS MANAGEMENT
    async def insert_document_analysis(
        self,
        project_id: str,
        document_id: str,
        analysis_result: Dict[str, Any]
    ) -> str:
        """Sla document analyse resultaten op"""
        try:
            analysis_id = f"ana_{datetime.now().strftime('%Y%m%d%H%M%S')}_{document_id}"
            
            data = {
                "id": analysis_id,
                "project_id": project_id,
                "document_id": document_id,
                "analysis_data": analysis_result,
                "confidence_score": analysis_result.get("confidence_score", 0.0),
                "created_at": datetime.now().isoformat()
            }
            
            response = self.client.table("document_analyses").insert(data).execute()
            
            if response.data:
                logger.info(f"Document analysis {analysis_id} inserted")
                return analysis_id
            else:
                raise Exception("No data returned from insert")
                
        except Exception as e:
            logger.error(f"Error inserting document analysis: {e}")
            raise
    
    async def get_document_analyses(self, project_id: str) -> List[Dict[str, Any]]:
        """Haal alle document analyses op voor een project"""
        try:
            response = self.client.table("document_analyses").select("*").eq("project_id", project_id).order("created_at", desc=True).execute()
            return response.data
        except Exception as e:
            logger.error(f"Error getting document analyses for project {project_id}: {e}")
            return []
    
    # STABU PRICE MANAGEMENT
    async def get_stabu_price(self, code: str) -> Optional[STABUPrice]:
        """Haal STABU prijs op bij code"""
        try:
            response = self.client.table("stabu_prices").select("*").eq("code", code).eq("is_active", True).execute()
            
            if response.data:
                data = response.data[0]
                return STABUPrice(**data)
            return None
            
        except Exception as e:
            logger.error(f"Error getting STABU price for code {code}: {e}")
            return None
    
    async def get_stabu_prices_by_category(self, category: str) -> List[STABUPrice]:
        """Haal alle STABU prijzen op voor een categorie"""
        try:
            response = self.client.table("stabu_prices").select("*").eq("category", category).eq("is_active", True).order("code").execute()
            
            prices = []
            for item in response.data:
                try:
                    prices.append(STABUPrice(**item))
                except Exception as e:
                    logger.warning(f"Error parsing STABU price {item.get('code')}: {e}")
            
            return prices
            
        except Exception as e:
            logger.error(f"Error getting STABU prices for category {category}: {e}")
            return []
    
    async def search_stabu_prices(
        self,
        search_term: str,
        limit: int = 20
    ) -> List[STABUPrice]:
        """Zoek STABU prijzen op beschrijving of code"""
        try:
            response = self.client.table("stabu_prices").select("*").ilike("description", f"%{search_term}%").or_(f"code.ilike.%{search_term}%").eq("is_active", True).limit(limit).execute()
            
            prices = []
            for item in response.data:
                try:
                    prices.append(STABUPrice(**item))
                except Exception as e:
                    logger.warning(f"Error parsing STABU price {item.get('code')}: {e}")
            
            return prices
            
        except Exception as e:
            logger.error(f"Error searching STABU prices for '{search_term}': {e}")
            return []
    
    # PROJECT MANAGEMENT
    async def create_project(
        self,
        project_data: Dict[str, Any],
        created_by: str
    ) -> str:
        """Maak een nieuw project aan"""
        try:
            project_id = f"proj_{datetime.now().strftime('%Y%m%d%H%M%S')}"
            
            data = {
                "id": project_id,
                **project_data,
                "created_by": created_by,
                "created_at": datetime.now().isoformat(),
                "status": "draft"
            }
            
            response = self.client.table("projects").insert(data).execute()
            
            if response.data:
                logger.info(f"Project {project_id} created")
                return project_id
            else:
                raise Exception("No data returned from insert")
                
        except Exception as e:
            logger.error(f"Error creating project: {e}")
            raise
    
    async def get_project(self, project_id: str) -> Optional[Dict[str, Any]]:
        """Haal een project op bij ID"""
        try:
            response = self.client.table("projects").select("*").eq("id", project_id).execute()
            
            if response.data:
                return response.data[0]
            return None
            
        except Exception as e:
            logger.error(f"Error getting project {project_id}: {e}")
            return None
    
    async def update_project(
        self,
        project_id: str,
        updates: Dict[str, Any]
    ) -> bool:
        """Update een project"""
        try:
            updates["updated_at"] = datetime.now().isoformat()
            
            response = self.client.table("projects").update(updates).eq("id", project_id).execute()
            
            success = bool(response.data)
            if success:
                logger.info(f"Project {project_id} updated")
            return success
            
        except Exception as e:
            logger.error(f"Error updating project {project_id}: {e}")
            return False
    
    # FILE STORAGE
    async def upload_file(
        self,
        file_path: str,
        project_id: str,
        file_type: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> str:
        """Upload een bestand naar Supabase Storage"""
        try:
            from pathlib import Path
            
            file_name = Path(file_path).name
            storage_path = f"{project_id}/{file_type}/{file_name}"
            
            with open(file_path, 'rb') as f:
                file_content = f.read()
            
            # Upload naar storage
            response = self.client.storage.from_("project-documents").upload(
                file=file_content,
                path=storage_path,
                file_options={"content-type": self._get_content_type(file_path)}
            )
            
            # Haal publieke URL op
            url = self.client.storage.from_("project-documents").get_public_url(storage_path)
            
            # Sla metadata op in database
            file_record = {
                "project_id": project_id,
                "file_name": file_name,
                "storage_path": storage_path,
                "file_type": file_type,
                "file_size": len(file_content),
                "url": url,
                "metadata": metadata or {},
                "uploaded_at": datetime.now().isoformat()
            }
            
            self.client.table("project_files").insert(file_record).execute()
            
            logger.info(f"File {file_name} uploaded to {storage_path}")
            return storage_path
            
        except Exception as e:
            logger.error(f"Error uploading file {file_path}: {e}")
            raise
    
    async def get_file_url(self, storage_path: str) -> Optional[str]:
        """Haal publieke URL van een bestand op"""
        try:
            url = self.client.storage.from_("project-documents").get_public_url(storage_path)
            return url
        except Exception as e:
            logger.error(f"Error getting file URL for {storage_path}: {e}")
            return None
    
    # HELPER METHODS
    def _get_content_type(self, file_path: str) -> str:
        """Bepaal content type op basis van bestandsextensie"""
        extension = file_path.lower().split('.')[-1]
        
        content_types = {
            'pdf': 'application/pdf',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'png': 'image/png',
            'dwg': 'image/vnd.dwg',
            'dxf': 'image/vnd.dxf',
            'ifc': 'application/ifc',
            'rvt': 'application/revit',
            'doc': 'application/msword',
            'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'xls': 'application/vnd.ms-excel',
            'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }
        
        return content_types.get(extension, 'application/octet-stream')


# Factory functie voor dependency injection
def get_supabase_client() -> SupabaseClient:
    """Factory om SupabaseClient instantie te maken"""
    return SupabaseClient()
