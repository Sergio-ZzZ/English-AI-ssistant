import logging
import edge_tts
from typing import AsyncGenerator

# 1. Mantenemos el estándar de logs profesional
logger = logging.getLogger(__name__)

class TTSService:
    def __init__(self, voice: str = "en-US-AriaNeural"):
        """
        Inicializa el cliente de síntesis de voz.
        Por defecto usamos una voz neuronal en inglés muy natural.
        """
        self.voice = voice
        logger.info(f"TTSService inicializado con la voz: {self.voice}")

    async def stream_audio(self, text: str) -> AsyncGenerator[bytes, None]:
        """
        Recibe el texto del Canal A (conversacional) y genera fragmentos 
        (chunks) de audio asíncronamente.
        """
        # Logueamos solo los primeros 30 caracteres para no saturar la consola
        logger.debug(f"Iniciando síntesis de voz para el texto: '{text[:30]}...'")
        
        try:
            communicate = edge_tts.Communicate(text, self.voice)
            
            # Iteramos sobre el stream asíncrono que nos devuelve edge-tts
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    # Usamos 'yield' para enviar los bytes crudos a medida que se generan
                    yield chunk["data"]
                    
            logger.debug("Síntesis de voz completada exitosamente.")
            
        except Exception as e:
            logger.error(f"Fallo crítico en la síntesis de voz (edge-tts): {e}", exc_info=True)
            # Aquí sí levantamos la excepción (raise) porque si el audio falla, 
            # el WebSocket debe saberlo para cerrar la conexión con gracia.
            raise