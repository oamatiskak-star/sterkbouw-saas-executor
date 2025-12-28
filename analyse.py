#!/usr/bin/env python3
"""
AI Analyse module voor CAD/PDF bestanden
Automatische detectie van oppervlakte, type werk, etc.
"""

import os
import sys
import json
import re
from pathlib import Path
import PyPDF2
import fitz  # PyMuPDF
import pandas as pd
from typing import Dict, List, Any
import math

class CADAnalyzer:
    def __init__(self):
        self.results = {
            'oppervlakte_m2': 0,
            'aantal_kamers': 0,
            'bouwjaar': None,
            'project_type': 'onbekend',
            'detecties': []
        }
    
    def analyze_file(self, file_path: str) -> Dict[str, Any]:
        """Analyseer een CAD/PDF bestand"""
        ext = os.path.splitext(file_path)[1].lower()
        
        if ext == '.pdf':
            return self._analyze_pdf(file_path)
        elif ext in ['.dwg', '.dxf']:
            return self._analyze_cad(file_path)
        elif ext in ['.jpg', '.jpeg', '.png']:
            return self._analyze_image(file_path)
        else:
            return self._analyze_generic(file_path)
    
    def _analyze_pdf(self, file_path: str) -> Dict[str, Any]:
        """Analyseer PDF bestanden (plattegronden, tekeningen)"""
        print(f"Analyzing PDF: {file_path}")
        
        try:
            with open(file_path, 'rb') as file:
                pdf_reader = PyPDF2.PdfReader(file)
                text = ""
                for page in pdf_reader.pages:
                    text += page.extract_text()
                
                # Zoek naar oppervlakte patronen
                oppervlakte = self._extract_area(text)
                
                # Zoek naar bouwjaar
                bouwjaar = self._extract_year(text)
                
                # Detecteer type werk
                project_type = self._detect_project_type(text)
                
                # Tel kamer-aanduidingen
                kamers = self._count_rooms(text)
                
                self.results = {
                    'oppervlakte_m2': oppervlakte,
                    'aantal_kamers': kamers,
                    'bouwjaar': bouwjaar,
                    'project_type': project_type,
                    'detecties': ['pdf_geanalyseerd'],
                    'bestand': os.path.basename(file_path)
                }
                
        except Exception as e:
            print(f"PDF analyse fout: {e}")
            self.results['error'] = str(e)
        
        return self.results
    
    def _analyze_cad(self, file_path: str) -> Dict[str, Any]:
        """Analyseer CAD bestanden (DWG, DXF)"""
        print(f"Analyzing CAD: {file_path}")
        
        # Voor nu basis detectie - zou uitgebreid kunnen worden met ezdxf
        self.results = {
            'oppervlakte_m2': 0,
            'aantal_kamers': 0,
            'bouwjaar': None,
            'project_type': 'cad_bestand',
            'detecties': ['cad_detectie_vereist_extra_tools'],
            'bestand': os.path.basename(file_path)
        }
        
        return self.results
    
    def _analyze_image(self, file_path: str) -> Dict[str, Any]:
        """Analyseer afbeeldingen van plattegronden"""
        print(f"Analyzing image: {file_path}")
        
        # Basis detectie voor afbeeldingen
        self.results = {
            'oppervlakte_m2': 0,
            'aantal_kamers': 0,
            'bouwjaar': None,
            'project_type': 'afbeelding_analyse',
            'detecties': ['image_analysis_required'],
            'bestand': os.path.basename(file_path)
        }
        
        return self.results
    
    def _analyze_generic(self, file_path: str) -> Dict[str, Any]:
        """Analyseer andere bestandstypes"""
        file_size = os.path.getsize(file_path)
        
        self.results = {
            'oppervlakte_m2': 0,
            'aantal_kamers': 0,
            'bouwjaar': None,
            'project_type': 'onbekend',
            'detecties': [f'bestandstype_niet_ondersteund_{os.path.splitext(file_path)[1]}'],
            'bestand_grootte': file_size,
            'bestand': os.path.basename(file_path)
        }
        
        return self.results
    
    def _extract_area(self, text: str) -> float:
        """Extraheer oppervlakte uit tekst"""
        patterns = [
            r'(\d+[,.]?\d*)\s*m²',
            r'(\d+[,.]?\d*)\s*m2',
            r'oppervlakte[\s:]*(\d+[,.]?\d*)',
            r'area[\s:]*(\d+[,.]?\d*)',
            r'(\d+[,.]?\d*)\s*vierkante meter'
        ]
        
        for pattern in patterns:
            matches = re.findall(pattern, text, re.IGNORECASE)
            if matches:
                try:
                    # Neem het grootste gevonden oppervlakte
                    areas = [float(match.replace(',', '.')) for match in matches]
                    return max(areas)
                except:
                    pass
        
        return 0
    
    def _extract_year(self, text: str) -> int:
        """Extraheer bouwjaar uit tekst"""
        year_patterns = [
            r'bouwjaar[\s:]*(\d{4})',
            r'constructie[\s:]*(\d{4})',
            r'(\d{4})[\s-]*bouw',
            r'year[\s:]*(\d{4})'
        ]
        
        for pattern in year_patterns:
            matches = re.findall(pattern, text, re.IGNORECASE)
            if matches:
                try:
                    years = [int(match) for match in matches]
                    # Neem het oudste jaar (waarschijnlijk bouwjaar)
                    return min(years)
                except:
                    pass
        
        # Zoek naar 4-cijferige jaren in tekst
        year_matches = re.findall(r'\b(19\d{2}|20\d{2})\b', text)
        if year_matches:
            try:
                return int(min(year_matches))
            except:
                pass
        
        return None
    
    def _detect_project_type(self, text: str) -> str:
        """Detecteer type project uit tekst"""
        text_lower = text.lower()
        
        type_mapping = {
            'nieuwbouw': ['nieuwbouw', 'new construction', 'new build'],
            'transformatie': ['transformatie', 'transformatie', 'renovatie', 'verbouwing', 'renovation'],
            'renovatie': ['renovatie', 'opknappen', 'refurbishment'],
            'uitbreiding': ['uitbreiding', 'extension', 'aanbouw'],
            'slopen': ['sloop', 'demolition', 'afbreken']
        }
        
        for project_type, keywords in type_mapping.items():
            for keyword in keywords:
                if keyword in text_lower:
                    return project_type
        
        return 'onbekend'
    
    def _count_rooms(self, text: str) -> int:
        """Tel aantal kamers uit tekst"""
        room_patterns = [
            r'kamer\s+(\d+)',
            r'room\s+(\d+)',
            r'(\d+)\s+slaapkamer',
            r'(\d+)\s+bedroom',
            r'woonoppervlak',
            r'wonen'
        ]
        
        # Eenvoudige telling op basis van kamer-aanduidingen
        room_count = 0
        for pattern in room_patterns:
            matches = re.findall(pattern, text, re.IGNORECASE)
            if matches:
                try:
                    for match in matches:
                        if match.isdigit():
                            room_count += int(match)
                        else:
                            room_count += 1
                except:
                    room_count += len(matches)
        
        return max(room_count, 0)

def main():
    """Hoofdfunctie voor command line gebruik"""
    if len(sys.argv) < 2:
        print("Usage: python analyse.py <file_path>")
        sys.exit(1)
    
    file_path = sys.argv[1]
    
    if not os.path.exists(file_path):
        print(f"Bestand niet gevonden: {file_path}")
        sys.exit(1)
    
    analyzer = CADAnalyzer()
    result = analyzer.analyze_file(file_path)
    
    # Output als JSON
    print(json.dumps(result, indent=2))

if __name__ == "__main__":
    main()
