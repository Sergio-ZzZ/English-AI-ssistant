import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from src.services.groq_client import GroqService
from src.services.tts_client import TTSService
from src.services.transcription_client import TranscriptionService
from src.core.config import settings  # <-- Importamos la llave de forma segura

logger = logging.getLogger(__name__)
router = APIRouter()

groq_service = GroqService(api_key=settings.GROQ_API_KEY)
transcription_service = TranscriptionService(api_key=settings.GROQ_API_KEY)
tts_service = TTSService()

@router.websocket("/ws/chat")
async def chat_endpoint(websocket: WebSocket):
    """
    Endpoint principal para la comunicación en tiempo real.
    Maneja el audio binario entrante, la transcripción, el razonamiento y el streaming de salida.
    """
    await websocket.accept()
    logger.info("Cliente conectado al Canal de Chat de Voz.")

    try:
        while True:
            # 1. Recibimos audio binario crudo desde el micrófono
            audio_bytes = await websocket.receive_bytes()
            logger.debug("Audio binario recibido, iniciando transcripción...")

            # 2. Transcripción (Whisper)
            user_message = await transcription_service.transcribe_audio(audio_bytes)
            
            if not user_message:
                await websocket.send_json({"error": "No se pudo transcribir el audio."})
                continue

            # 3. El Cerebro (Llama 3): Analizar el texto transcrito
            feedback = await groq_service.analyze_input(user_message)

            if not feedback:
                await websocket.send_json({"error": "La IA no pudo procesar el mensaje."})
                continue

            # 4. Canal B (Feedback Estructurado): Enviar el JSON a la UI
            await websocket.send_json(feedback.model_dump())
            
            # 5. Canal A (La Boca): Streaming asíncrono de audio de vuelta
            text_to_speak = feedback.conversational_response
            async for audio_chunk in tts_service.stream_audio(text_to_speak):
                await websocket.send_bytes(audio_chunk)
            
            # 6. Señal de finalización
            await websocket.send_json({"type": "end_of_audio"})

    except WebSocketDisconnect:
        logger.info("El usuario cerró la conexión del micrófono.")
    except Exception as e:
        logger.error(f"Fallo crítico en el WebSocket: {e}", exc_info=True)
        if websocket.client_state.name != "DISCONNECTED":
            await websocket.close()