import logging
from groq import AsyncGroq
from typing import Optional

logger = logging.getLogger(__name__)

class TranscriptionService:
    def __init__(self, api_key: str):
        """
        Inicializa el cliente asíncrono para Whisper a través de Groq.
        """
        self.client = AsyncGroq(api_key=api_key)
        # Usamos el modelo Whisper Large v3 de Groq para costo $0 y alta velocidad
        self.model = "whisper-large-v3"
        logger.info(f"TranscriptionService inicializado con: {self.model}")

    async def transcribe_audio(self, audio_bytes: bytes) -> Optional[str]:
        """
        Recibe bytes de audio (WebM/WAV) del WebSocket y los envía a Groq para su transcripción.
        """
        logger.debug(f"Recibidos {len(audio_bytes)} bytes de audio para transcribir.")
        
        try:
            # Groq espera una tupla (nombre_archivo, bytes) para simular la subida de un archivo
            file_tuple = ("audio.webm", audio_bytes)
            
            response = await self.client.audio.transcriptions.create(
                file=file_tuple,
                model=self.model,
                response_format="json",
                language="en", # Forzamos a que espere inglés para mejorar la precisión
            )
            
            transcribed_text = response.text
            logger.info(f"Transcripción exitosa: '{transcribed_text}'")
            return transcribed_text
            
        except Exception as e:
            logger.error(f"Fallo crítico en la transcripción de audio: {e}", exc_info=True)
            return None