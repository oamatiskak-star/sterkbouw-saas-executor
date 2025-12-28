# /ai/tekening_generator.py
import torch
from diffusers import StableDiffusionPipeline, StableDiffusionControlNetPipeline, ControlNetModel
from diffusers import UniPCMultistepScheduler
from PIL import Image
import numpy as np
import cv2
import json
import os
from datetime import datetime
from typing import Dict, Any, List

class AITekeningGenerator:
    def __init__(self, model_path: str = "runwayml/stable-diffusion-v1-5"):
        """Initialiseer AI model voor tekening generatie"""
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"Using device: {self.device}")
        
        # Laad Stable Diffusion model
        self.pipe = StableDiffusionPipeline.from_pretrained(
            model_path,
            torch_dtype=torch.float16 if self.device == "cuda" else torch.float32,
            safety_checker=None
        ).to(self.device)
        
        # Speciale checkpoints voor architecturale tekeningen
        self.architecture_models = {
            "standard": "runwayml/stable-diffusion-v1-5",
            "architectural": "stabilityai/stable-diffusion-2-1",
            "detailed": "dreamlike-art/dreamlike-diffusion-1.0"
        }
        
        # Prompt templates per tekening type
        self.prompt_templates = {
            "bestek": "technical drawing, architectural blueprint, construction document, {style}, detailed specifications, NEN norms, scale {scale}, professional",
            "installatie_e": "electrical wiring diagram, electrical installation, circuit diagram, {style}, cables, switches, sockets, distribution board, technical drawing",
            "installatie_w": "plumbing diagram, water installation, sanitary drawing, {style}, pipes, valves, fixtures, drainage, technical blueprint",
            "bouw_detail": "construction detail drawing, wall section, building detail, {style}, materials annotation, dimensions, technical drawing, scale {scale}",
            "gevel": "facade elevation, architectural elevation, building facade, {style}, materials, windows, doors, scale {scale}, technical drawing",
            "plat": "floor plan, architectural plan, room layout, {style}, dimensions, furniture, doors, windows, scale {scale}"
        }
        
        # Style modifiers
        self.style_modifiers = {
            "concept": "concept sketch, rough lines, basic shapes",
            "voorlopig": "preliminary design, basic dimensions, material indications",
            "definitief": "definitive design, detailed dimensions, material specifications, technical standards",
            "uitvoering": "execution drawing, construction details, manufacturing information, precise measurements"
        }
        
    def generate_tekening(self, config: Dict[str, Any]) -> Dict[str, Any]:
        """Genereer een tekening op basis van configuratie"""
        try:
            print(f"Generating drawing with config: {config}")
            
            # Bouw prompt op
            prompt = self._build_prompt(config)
            negative_prompt = self._build_negative_prompt(config)
            
            print(f"Generated prompt: {prompt}")
            
            # Genereer afbeelding
            image = self.pipe(
                prompt=prompt,
                negative_prompt=negative_prompt,
                num_inference_steps=30,
                guidance_scale=7.5,
                width=1024,
                height=768,
                generator=torch.Generator(device=self.device).manual_seed(config.get("seed", 42))
            ).images[0]
            
            # Sla op
            output_path = self._save_image(image, config)
            
            # Genereer metadata
            metadata = self._generate_metadata(config, output_path)
            
            return {
                "success": True,
                "image_path": output_path,
                "metadata": metadata,
                "prompt_used": prompt
            }
            
        except Exception as e:
            print(f"Error generating drawing: {e}")
            return {
                "success": False,
                "error": str(e)
            }
    
    def _build_prompt(self, config: Dict[str, Any]) -> str:
        """Bouw AI prompt op basis van configuratie"""
        base_template = self.prompt_templates.get(config["type"], self.prompt_templates["bestek"])
        style = self.style_modifiers.get(config["niveau"], "detailed technical drawing")
        
        prompt = base_template.format(
            style=style,
            scale=config.get("schaal", "1:50"),
            project=config.get("project_naam", ""),
            location=config.get("locatie", "")
        )
        
        # Voeg beschrijving toe
        if config.get("beschrijving"):
            prompt += f", {config['beschrijving']}"
        
        # Voeg extra specificaties toe
        if config.get("extra_specificaties"):
            prompt += f", {config['extra_specificaties']}"
        
        # Quality modifiers
        prompt += ", high quality, professional, technical drawing, blueprint style, clean lines, accurate"
        
        return prompt
    
    def _build_negative_prompt(self, config: Dict[str, Any]) -> str:
        """Negatieve prompt voor betere resultaten"""
        negative = "blurry, low quality, distorted, messy, unrealistic, cartoon, painting, 3d render, photograph"
        
        if config["type"] in ["installatie_e", "installatie_w"]:
            negative += ", architectural drawing, facade, exterior"
        
        return negative
    
    def _save_image(self, image: Image.Image, config: Dict[str, Any]) -> str:
        """Sla gegenereerde afbeelding op"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        project_name = config["project_naam"].replace(" ", "_").lower()[:50]
        drawing_type = config["type"]
        
        filename = f"{project_name}_{drawing_type}_{timestamp}.png"
        output_dir = "./generated_drawings"
        
        os.makedirs(output_dir, exist_ok=True)
        output_path = os.path.join(output_dir, filename)
        
        image.save(output_path, format="PNG", quality=95)
        
        print(f"Image saved to: {output_path}")
        return output_path
    
    def _generate_metadata(self, config: Dict[str, Any], image_path: str) -> Dict[str, Any]:
        """Genereer metadata voor de tekening"""
        return {
            "generated_at": datetime.now().isoformat(),
            "config": config,
            "image_info": {
                "path": image_path,
                "size": os.path.getsize(image_path),
                "dimensions": "1024x768",
                "format": "PNG"
            },
            "model_used": self.architecture_models["standard"],
            "version": "1.0.0"
        }

# API endpoint voor web service
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn

app = FastAPI(title="AI Tekening Generator API")

class TekeningRequest(BaseModel):
    project_naam: str
    type: str
    niveau: str
    schaal: str = "1:50"
    locatie: str = ""
    beschrijving: str = ""
    extra_specificaties: str = ""
    seed: int = 42

# Initialiseer generator
generator = AITekeningGenerator()

@app.post("/api/generate-drawing")
async def generate_drawing(request: TekeningRequest):
    """Endpoint voor tekening generatie"""
    try:
        config = request.dict()
        result = generator.generate_tekening(config)
        
        if result["success"]:
            return {
                "success": True,
                "drawing_url": f"/generated/{os.path.basename(result['image_path'])}",
                "metadata": result["metadata"],
                "prompt": result["prompt_used"]
            }
        else:
            raise HTTPException(status_code=500, detail=result["error"])
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "ai-drawing-generator"}

if __name__ == "__main__":
    # Start de server
    print("Starting AI Drawing Generator API...")
    uvicorn.run(app, host="0.0.0.0", port=8000)
