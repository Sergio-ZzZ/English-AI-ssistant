import io
import json
import logging
import traceback
import os
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import edge_tts

from src.services.groq_client import GroqService 
from src.services.transcription_client import TranscriptionService 

router = APIRouter()
logger = logging.getLogger(__name__)

# CAMBIO CLAVE 1: Usamos AriaNeural que es la voz estándar global más estable
VOICE = "en-US-AriaNeural"  

@router.websocket("/ws/chat")
async def websocket_chat_endpoint(websocket: WebSocket):
    await websocket.accept()
    logger.info("[WebSocket] Cliente conectado.")
    
    groq_service = GroqService(api_key=os.getenv("GROQ_API_KEY", ""))
    whisper_service = TranscriptionService(api_key=os.getenv("GROQ_API_KEY", ""))

    try:
        while True:
            # 1. Recibir audio
            audio_bytes = await websocket.receive_bytes()
            
            # 2. Transcripción
            user_text = await whisper_service.transcribe_audio(audio_bytes)
            
            # Si el usuario no dijo nada claro (puro ruido), reiniciamos su turno
            if not user_text or not user_text.strip():
                await websocket.send_text(json.dumps({"type": "end_of_audio"}))
                continue
            
            logger.info(f"[Whisper] Usuario: '{user_text}'")

            # 3. Razonamiento
            feedback = await groq_service.analyze_input(user_text)
            if not feedback:
                await websocket.send_text(json.dumps({"error": "Failed to analyze input."}))
                await websocket.send_text(json.dumps({"type": "end_of_audio"}))
                continue

            # 4. Enviar JSON Pedagógico
            await websocket.send_text(feedback.model_dump_json())

            # 5. Generación de Voz (BLOQUE BLINDADO)
            try:
                text_to_speak = feedback.conversational_response
                communicate = edge_tts.Communicate(text=text_to_speak, voice=VOICE)
                audio_buffer = bytearray()
                
                async for chunk in communicate.stream():
                    if chunk["type"] == "audio":
                        audio_buffer.extend(chunk["data"])

                if len(audio_buffer) > 0:
                    await websocket.send_bytes(bytes(audio_buffer))
                    logger.info(f"[TTS] Audio enviado exitosamente ({len(audio_buffer)} bytes).")
                else:
                    logger.error("[TTS] Buffer vacío.")
                    await websocket.send_text(json.dumps({"error": "TTS buffer empty."}))
                    
            except Exception as e:
                logger.error(f"[TTS] Error crítico generando audio: {e}")
                traceback.print_exc()
                await websocket.send_text(json.dumps({"error": f"Voice generation failed: {e}"}))
                
            finally:
                # CAMBIO CLAVE 2: FAIL-SAFE
                # Aunque edge-tts explote, el servidor SIEMPRE liberará el micrófono del usuario
                await websocket.send_text(json.dumps({"type": "end_of_audio"}))

    except WebSocketDisconnect:
        logger.info("[WebSocket] Cliente desconectado naturalmente.")
    except Exception as e:
        logger.error(f"[WebSocket] Error general: {e}", exc_info=True)