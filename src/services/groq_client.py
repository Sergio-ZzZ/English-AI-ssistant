import json
from typing import Optional
from groq import AsyncGroq
from pydantic import ValidationError

from src.models.schemas import PedagogicalFeedback
from src.core.prompts import get_system_prompt

class GroqService:
    def __init__(self, api_key: str):
        """
        Inicializa el cliente asíncrono de Groq.
        """
        self.client = AsyncGroq(api_key=api_key)
        # Aquí definimos el modelo correcto y actual
        self.model = "llama-3.3-70b-versatile"

    async def analyze_input(self, user_message: str) -> Optional[PedagogicalFeedback]:
        """
        Envía el mensaje del usuario a Groq, fuerza la salida a JSON 
        y devuelve el modelo validado por Pydantic.
        """
        try:
            response = await self.client.chat.completions.create(
                model=self.model,  # ✅ Cambio crítico: usamos la variable de la clase
                messages=[
                    {"role": "system", "content": get_system_prompt()},
                    {"role": "user", "content": user_message}
                ],
                response_format={"type": "json_object"},  # Groq Native JSON mode
                temperature=0.3, # Baja temperatura para respuestas deterministas
            )
            
            raw_json = response.choices[0].message.content
            
            # Pydantic v2 convierte y valida el string directamente en nuestro objeto
            if raw_json:
                return PedagogicalFeedback.model_validate_json(raw_json)
            return None
            
        except ValidationError as e:
            # Si el modelo alucina un formato incorrecto, evitamos que la app explote
            print(f"[GroqService] Error de validación de Pydantic: {e}")
            return None
        except Exception as e:
            # Fallos de red o de la API de Groq
            print(f"[GroqService] Error de conexión: {e}")
            return None