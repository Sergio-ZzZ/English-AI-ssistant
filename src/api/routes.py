import io
import json
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import edge_tts

from src.services.groq_client import GroqService # o tu cliente LLM
from src.services.transcription_client import TranscriptionService # Whisper Groq

router = APIRouter()
logger = logging.getLogger(__name__)

VOICE = "en-US-JennyNeural"  # Voz natural de alta calidad

@router.websocket("/ws/chat")
async def websocket_chat_endpoint(
    websocket: WebSocket,
    # Inyecta tus servicios inicializados aquí
):
    await websocket.accept()
    logger.info("[WebSocket] Cliente conectado.")
    
    # Inicialización de servicios (o usa tus instancias globales/dependencias)
    import os
    groq_service = GroqService(api_key=os.getenv("GROQ_API_KEY", ""))
    whisper_service = TranscriptionService(api_key=os.getenv("GROQ_API_KEY", ""))

    try:
        while True:
            # 1. Recibir audio binario del micrófono
            audio_bytes = await websocket.receive_bytes()
            logger.info(f"[WebSocket] Audio recibido ({len(audio_bytes)} bytes).")

            # 2. Transcripción con Whisper en Groq
            user_text = await whisper_service.transcribe_audio(audio_bytes)
            if not user_text or not user_text.strip():
                continue
            
            logger.info(f"[Whisper] Usuario dijo: '{user_text}'")

            # 3. Razonamiento y Feedback Pedagógico (Groq LLaMA)
            feedback = await groq_service.analyze_input(user_text)
            if not feedback:
                await websocket.send_text(json.dumps({"error": "Failed to analyze input."}))
                continue

            # 4. Enviar JSON estructurado al frontend (Canal B + texto Canal A)
            await websocket.send_text(feedback.model_dump_json())

            # 5. Generar audio con edge-tts y enviarlo al frontend (Canal A de voz)
            text_to_speak = feedback.conversational_response
            communicate = edge_tts.Communicate(text=text_to_speak, voice=VOICE)
            
            audio_buffer = bytearray()
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    audio_buffer.extend(chunk["data"])

            # Enviamos el archivo de audio completo como binario
            if len(audio_buffer) > 0:
                await websocket.send_bytes(bytes(audio_buffer))
                logger.info(f"[TTS] Audio de respuesta enviado ({len(audio_buffer)} bytes).")

            # 6. Notificar fin de audio
            await websocket.send_text(json.dumps({"type": "end_of_audio"}))

    except WebSocketDisconnect:
        logger.info("[WebSocket] Cliente desconectado.")
    except Exception as e:
        logger.error(f"[WebSocket] Error inesperado: {e}", exc_info=True)