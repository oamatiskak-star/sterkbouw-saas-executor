import logging
import os
from enum import Enum
from typing import Dict, List, Optional, Any, Union
import asyncio

import openai
from anthropic import Anthropic, AsyncAnthropic
import google.generativeai as genai
from pydantic import BaseModel, Field
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

# Laad environment variabelen
load_dotenv()


class LLMProvider(str, Enum):
    OPENAI = "openai"
    ANTHROPIC = "anthropic"
    GEMINI = "gemini"
    AZURE = "azure"


class LLMConfig(BaseModel):
    provider: LLMProvider
    model: str
    temperature: float = Field(default=0.1, ge=0.0, le=2.0)
    max_tokens: Optional[int] = None
    top_p: float = Field(default=1.0, ge=0.0, le=1.0)
    frequency_penalty: float = Field(default=0.0, ge=-2.0, le=2.0)
    presence_penalty: float = Field(default=0.0, ge=-2.0, le=2.0)


class LLMResponse(BaseModel):
    content: str
    model: str
    provider: LLMProvider
    usage: Optional[Dict[str, int]] = None
    finish_reason: Optional[str] = None
    processing_time: float


class LLMClient:
    """Client voor interactie met verschillende LLM providers"""
    
    def __init__(self):
        self._initialize_clients()
        self.default_configs = self._get_default_configs()
        logger.info("LLMClient initialized")
    
    def _initialize_clients(self):
        """Initialiseer alle LLM clients"""
        # OpenAI
        openai_api_key = os.getenv("OPENAI_API_KEY")
        if openai_api_key:
            openai.api_key = openai_api_key
            self.openai_client = openai.AsyncOpenAI()
        else:
            logger.warning("OPENAI_API_KEY not found in environment")
            self.openai_client = None
        
        # Anthropic
        anthropic_api_key = os.getenv("ANTHROPIC_API_KEY")
        if anthropic_api_key:
            self.anthropic_client = AsyncAnthropic(api_key=anthropic_api_key)
        else:
            logger.warning("ANTHROPIC_API_KEY not found in environment")
            self.anthropic_client = None
        
        # Google Gemini
        gemini_api_key = os.getenv("GEMINI_API_KEY")
        if gemini_api_key:
            genai.configure(api_key=gemini_api_key)
            self.gemini_client = genai
        else:
            logger.warning("GEMINI_API_KEY not found in environment")
            self.gemini_client = None
        
        # Azure OpenAI
        azure_openai_key = os.getenv("AZURE_OPENAI_KEY")
        azure_openai_endpoint = os.getenv("AZURE_OPENAI_ENDPOINT")
        if azure_openai_key and azure_openai_endpoint:
            self.azure_client = openai.AsyncAzureOpenAI(
                api_key=azure_openai_key,
                api_version="2023-12-01-preview",
                azure_endpoint=azure_openai_endpoint
            )
        else:
            logger.warning("Azure OpenAI credentials not found")
            self.azure_client = None
    
    def _get_default_configs(self) -> Dict[LLMProvider, LLMConfig]:
        """Default configuraties per provider"""
        return {
            LLMProvider.OPENAI: LLMConfig(
                provider=LLMProvider.OPENAI,
                model="gpt-4-turbo-preview",
                temperature=0.1,
                max_tokens=2000
            ),
            LLMProvider.ANTHROPIC: LLMConfig(
                provider=LLMProvider.ANTHROPIC,
                model="claude-3-opus-20240229",
                temperature=0.1,
                max_tokens=2000
            ),
            LLMProvider.GEMINI: LLMConfig(
                provider=LLMProvider.GEMINI,
                model="gemini-pro",
                temperature=0.1,
                max_tokens=2000
            ),
            LLMProvider.AZURE: LLMConfig(
                provider=LLMProvider.AZURE,
                model="gpt-4",
                temperature=0.1,
                max_tokens=2000
            )
        }
    
    async def complete(
        self,
        prompt: str,
        provider: Optional[LLMProvider] = None,
        config: Optional[LLMConfig] = None,
        system_prompt: Optional[str] = None,
        response_format: Optional[str] = None
    ) -> LLMResponse:
        """
        Voer een compleetion uit met de gekozen provider
        
        Args:
            prompt: De prompt om te versturen
            provider: Specifieke provider (auto-select als None)
            config: Aangepaste configuratie
            system_prompt: Optionele system prompt
            response_format: Gewenst response format ('json' of None)
            
        Returns:
            LLMResponse met het antwoord
        """
        import time
        start_time = time.time()
        
        try:
            # Bepaal provider
            if provider is None:
                provider = await self._select_best_provider(prompt)
            
            # Gebruik config of default
            if config is None:
                config = self.default_configs.get(provider)
                if config is None:
                    raise ValueError(f"No default config for provider {provider}")
            
            logger.info(f"Starting LLM completion with {provider} ({config.model})")
            
            # Route naar de juiste handler
            if provider == LLMProvider.OPENAI:
                response = await self._complete_openai(prompt, config, system_prompt, response_format)
            elif provider == LLMProvider.ANTHROPIC:
                response = await self._complete_anthropic(prompt, config, system_prompt, response_format)
            elif provider == LLMProvider.GEMINI:
                response = await self._complete_gemini(prompt, config, system_prompt, response_format)
            elif provider == LLMProvider.AZURE:
                response = await self._complete_azure(prompt, config, system_prompt, response_format)
            else:
                raise ValueError(f"Unsupported provider: {provider}")
            
            processing_time = time.time() - start_time
            
            return LLMResponse(
                content=response["content"],
                model=config.model,
                provider=provider,
                usage=response.get("usage"),
                finish_reason=response.get("finish_reason"),
                processing_time=processing_time
            )
            
        except Exception as e:
            logger.error(f"LLM completion failed: {e}")
            
            # Probeer fallback provider
            if provider != LLMProvider.OPENAI and self.openai_client:
                logger.info("Trying OpenAI as fallback")
                try:
                    fallback_config = self.default_configs[LLMProvider.OPENAI]
                    response = await self._complete_openai(prompt, fallback_config, system_prompt, response_format)
                    
                    processing_time = time.time() - start_time
                    
                    return LLMResponse(
                        content=response["content"],
                        model=fallback_config.model,
                        provider=LLMProvider.OPENAI,
                        usage=response.get("usage"),
                        finish_reason=response.get("finish_reason"),
                        processing_time=processing_time
                    )
                except Exception as fallback_error:
                    logger.error(f"Fallback also failed: {fallback_error}")
            
            raise
    
    async def _select_best_provider(self, prompt: str) -> LLMProvider:
        """
        Selecteer de beste provider voor de gegeven prompt
        
        Heuristiek:
        - OpenAI GPT-4: Algemeen, goed met JSON, redelijke prijs
        - Anthropic Claude: Langere context, beter met complexe redenering
        - Gemini: Goed met vision, gratis tier
        - Azure: Enterprise requirements
        """
        prompt_length = len(prompt)
        
        # Voor JSON responses
        if "json" in prompt.lower() or "format as json" in prompt.lower():
            return LLMProvider.OPENAI
        
        # Voor zeer lange prompts
        if prompt_length > 8000:
            return LLMProvider.ANTHROPIC  # Claude heeft grotere context
        
        # Voor complexe redenering
        complex_keywords = ["analyze", "reason", "explain", "compare", "evaluate"]
        if any(keyword in prompt.lower() for keyword in complex_keywords):
            return LLMProvider.ANTHROPIC
        
        # Default naar OpenAI
        return LLMProvider.OPENAI
    
    async def _complete_openai(
        self,
        prompt: str,
        config: LLMConfig,
        system_prompt: Optional[str],
        response_format: Optional[str]
    ) -> Dict[str, Any]:
        """OpenAI completion"""
        if not self.openai_client:
            raise ValueError("OpenAI client not initialized")
        
        messages = []
        
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        
        messages.append({"role": "user", "content": prompt})
        
        # Prepare request parameters
        params = {
            "model": config.model,
            "messages": messages,
            "temperature": config.temperature,
            "max_tokens": config.max_tokens,
            "top_p": config.top_p,
            "frequency_penalty": config.frequency_penalty,
            "presence_penalty": config.presence_penalty,
        }
        
        # Add response format if requested
        if response_format == "json":
            params["response_format"] = {"type": "json_object"}
        
        try:
            response = await self.openai_client.chat.completions.create(**params)
            
            return {
                "content": response.choices[0].message.content,
                "usage": {
                    "prompt_tokens": response.usage.prompt_tokens,
                    "completion_tokens": response.usage.completion_tokens,
                    "total_tokens": response.usage.total_tokens
                } if response.usage else None,
                "finish_reason": response.choices[0].finish_reason
            }
            
        except Exception as e:
            logger.error(f"OpenAI completion error: {e}")
            raise
    
    async def _complete_anthropic(
        self,
        prompt: str,
        config: LLMConfig,
        system_prompt: Optional[str],
        response_format: Optional[str]
    ) -> Dict[str, Any]:
        """Anthropic Claude completion"""
        if not self.anthropic_client:
            raise ValueError("Anthropic client not initialized")
        
        try:
            # Prepare messages
            messages = [{"role": "user", "content": prompt}]
            
            # Prepare request
            request_params = {
                "model": config.model,
                "messages": messages,
                "temperature": config.temperature,
                "max_tokens": config.max_tokens or 2000,
            }
            
            # Add system prompt if provided
            if system_prompt:
                request_params["system"] = system_prompt
            
            response = await self.anthropic_client.messages.create(**request_params)
            
            content = ""
            for content_block in response.content:
                if content_block.type == "text":
                    content += content_block.text
            
            # Voor JSON responses, vraag Claude om JSON formaat
            if response_format == "json" and not content.strip().startswith("{"):
                # Voeg JSON instructie toe en probeer opnieuw
                json_prompt = f"{prompt}\n\nPlease respond with valid JSON only."
                return await self._complete_anthropic(json_prompt, config, system_prompt, None)
            
            return {
                "content": content,
                "usage": {
                    "input_tokens": response.usage.input_tokens,
                    "output_tokens": response.usage.output_tokens
                },
                "finish_reason": response.stop_reason
            }
            
        except Exception as e:
            logger.error(f"Anthropic completion error: {e}")
            raise
    
    async def _complete_gemini(
        self,
        prompt: str,
        config: LLMConfig,
        system_prompt: Optional[str],
        response_format: Optional[str]
    ) -> Dict[str, Any]:
        """Google Gemini completion"""
        if not self.gemini_client:
            raise ValueError("Gemini client not initialized")
        
        try:
            # Combine system prompt with user prompt
            full_prompt = ""
            if system_prompt:
                full_prompt += f"{system_prompt}\n\n"
            full_prompt += prompt
            
            # Select model
            if "vision" in config.model.lower() or "gemini-pro-vision" in config.model.lower():
                model = self.gemini_client.GenerativeModel(config.model)
                # Voor vision, moeten we images meegeven - niet ondersteund in deze functie
                raise ValueError("Vision models require image input")
            else:
                model = self.gemini_client.GenerativeModel(config.model)
            
            # Configure generation
            generation_config = {
                "temperature": config.temperature,
                "top_p": config.top_p,
                "max_output_tokens": config.max_tokens,
            }
            
            response = await model.generate_content_async(
                full_prompt,
                generation_config=generation_config
            )
            
            return {
                "content": response.text,
                "usage": {
                    "prompt_token_count": response.usage_metadata.prompt_token_count,
                    "candidates_token_count": response.usage_metadata.candidates_token_count,
                    "total_token_count": response.usage_metadata.total_token_count
                } if hasattr(response, 'usage_metadata') else None,
                "finish_reason": response.candidates[0].finish_reason if response.candidates else None
            }
            
        except Exception as e:
            logger.error(f"Gemini completion error: {e}")
            raise
    
    async def _complete_azure(
        self,
        prompt: str,
        config: LLMConfig,
        system_prompt: Optional[str],
        response_format: Optional[str]
    ) -> Dict[str, Any]:
        """Azure OpenAI completion"""
        if not self.azure_client:
            raise ValueError("Azure OpenAI client not initialized")
        
        messages = []
        
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        
        messages.append({"role": "user", "content": prompt})
        
        # Azure heeft iets andere parameters
        params = {
            "model": config.model,
            "messages": messages,
            "temperature": config.temperature,
            "max_tokens": config.max_tokens,
            "top_p": config.top_p,
            "frequency_penalty": config.frequency_penalty,
            "presence_penalty": config.presence_penalty,
        }
        
        if response_format == "json":
            params["response_format"] = {"type": "json_object"}
        
        try:
            response = await self.azure_client.chat.completions.create(**params)
            
            return {
                "content": response.choices[0].message.content,
                "usage": {
                    "prompt_tokens": response.usage.prompt_tokens,
                    "completion_tokens": response.usage.completion_tokens,
                    "total_tokens": response.usage.total_tokens
                } if response.usage else None,
                "finish_reason": response.choices[0].finish_reason
            }
            
        except Exception as e:
            logger.error(f"Azure OpenAI completion error: {e}")
            raise
    
    async def batch_complete(
        self,
        prompts: List[str],
        provider: Optional[LLMProvider] = None,
        config: Optional[LLMConfig] = None,
        max_concurrent: int = 5
    ) -> List[LLMResponse]:
        """
        Voer meerdere completions parallel uit
        
        Args:
            prompts: Lijst van prompts
            provider: Provider om te gebruiken
            config: Configuratie
            max_concurrent: Maximum aantal parallelle requests
            
        Returns:
            Lijst van LLMResponses
        """
        semaphore = asyncio.Semaphore(max_concurrent)
        
        async def process_with_semaphore(prompt: str) -> LLMResponse:
            async with semaphore:
                return await self.complete(prompt, provider, config)
        
        tasks = [process_with_semaphore(prompt) for prompt in prompts]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Verwerk resultaten
        processed_results = []
        for result in results:
            if isinstance(result, Exception):
                logger.error(f"Batch completion failed: {result}")
                processed_results.append(LLMResponse(
                    content=f"Error: {str(result)}",
                    model="error",
                    provider=provider or LLMProvider.OPENAI,
                    processing_time=0.0
                ))
            else:
                processed_results.append(result)
        
        return processed_results
    
    async def extract_json(
        self,
        text: str,
        schema: Optional[Dict[str, Any]] = None,
        provider: Optional[LLMProvider] = None
    ) -> Dict[str, Any]:
        """
        Extraheer gestructureerde JSON uit tekst
        
        Args:
            text: Invoer tekst
            schema: Optioneel JSON schema voor validatie
            provider: Specifieke provider
            
        Returns:
            Gestructureerde JSON data
        """
        import json
        
        prompt = f"""
        Extract structured information from the following text and return it as valid JSON.
        
        Text:
        {text}
        
        """
        
        if schema:
            prompt += f"\n\nUse this JSON schema:\n{json.dumps(schema, indent=2)}"
        
        prompt += "\n\nReturn only the JSON object, no other text."
        
        response = await self.complete(
            prompt=prompt,
            provider=provider or LLMProvider.OPENAI,
            response_format="json"
        )
        
        try:
            # Parse JSON response
            json_data = json.loads(response.content)
            return json_data
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse JSON from response: {e}")
            # Probeer JSON te extraheren uit de tekst
            json_match = re.search(r'\{.*\}', response.content, re.DOTALL)
            if json_match:
                try:
                    return json.loads(json_match.group())
                except:
                    pass
            
            raise ValueError(f"Could not extract valid JSON from response: {response.content[:200]}")
    
    async def classify_text(
        self,
        text: str,
        categories: List[str],
        provider: Optional[LLMProvider] = None
    ) -> Dict[str, float]:
        """
        Classificeer tekst in gegeven categorieën
        
        Args:
            text: Te classificeren tekst
            categories: Lijst van mogelijke categorieën
            provider: Specifieke provider
            
        Returns:
            Dict met scores per categorie
        """
        categories_str = ", ".join(categories)
        
        prompt = f"""
        Classify the following text into these categories: {categories_str}
        
        Text:
        {text}
        
        For each category, provide a score from 0.0 to 1.0 indicating how well the text fits.
        Return as JSON with categories as keys and scores as values.
        """
        
        response = await self.complete(
            prompt=prompt,
            provider=provider or LLMProvider.OPENAI,
            response_format="json"
        )
        
        try:
            scores = json.loads(response.content)
            
            # Normaliseer scores
            total = sum(scores.values())
            if total > 0:
                normalized = {cat: score/total for cat, score in scores.items()}
            else:
                normalized = {cat: 1.0/len(categories) for cat in categories}
            
            return normalized
            
        except Exception as e:
            logger.error(f"Classification failed: {e}")
            # Return uniform scores als fallback
            return {cat: 1.0/len(categories) for cat in categories}


# Factory functie
def get_llm_client() -> LLMClient:
    """Factory om LLMClient instantie te maken"""
    return LLMClient()
