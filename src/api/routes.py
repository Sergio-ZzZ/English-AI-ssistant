import json
import os
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import edge_tts

from src.services.groq_client import GroqService
from src.services.transcription_client import TranscriptionService

router = APIRouter()
VOICE = "en-US-AriaNeural"  # Voz ultra estable

@router.websocket("/ws/chat")
async def websocket_chat_endpoint(websocket: WebSocket):
    await websocket.accept()
    print("\n🟢 [WebSocket] Cliente conectado.", flush=True)

    api_key = os.getenv("GROQ_API_KEY", "")
    groq_service = GroqService(api_key=api_key)
    whisper_service = TranscriptionService(api_key=api_key)

    try:
        while True:
            # 1. Recibir audio
            audio_bytes = await websocket.receive_bytes()
            if len(audio_bytes) < 1000:
                continue

            print(f"\n📥 [Audio] Recibidos {len(audio_bytes)} bytes.", flush=True)

            # 2. Transcripción
            print("⏳ [Whisper] Transcribiendo...", flush=True)
            user_text = await whisper_service.transcribe_audio(audio_bytes)

            if not user_text or not user_text.strip():
                print("⚠️ [Whisper] Audio ininteligible o en blanco.", flush=True)
                await websocket.send_text(json.dumps({"error": "I couldn't hear you. Try again."}))
                await websocket.send_text(json.dumps({"type": "end_of_audio"})) # Liberar frontend
                continue

            print(f"🗣️ [Usuario]: {user_text}", flush=True)

            # 3. LLM Groq
            print("🧠 [LLM] Pensando...", flush=True)
            feedback = await groq_service.analyze_input(user_text)

            if not feedback:
                await websocket.send_text(json.dumps({"error": "Failed to analyze input."}))
                await websocket.send_text(json.dumps({"type": "end_of_audio"}))
                continue

            print(f"🤖 [IA]: {feedback.conversational_response}", flush=True)
            
            # 4. Enviar JSON al cliente
            try:
                await websocket.send_text(feedback.model_dump_json())
            except Exception as json_err:
                print(f"❌ [Error JSON]: {json_err}")

            # 5. Generar audio con edge-tts
            text_to_speak = feedback.conversational_response
            
            # --- INICIO DE LOGS DE DEBUGEÓ ---
            print(f"\n[DEBUG TTS] 1. Texto a sintetizar: '{text_to_speak}'")
            
            communicate = edge_tts.Communicate(text=text_to_speak, voice=VOICE)
            audio_buffer = bytearray()
            
            try:
                async for chunk in communicate.stream():
                    if chunk["type"] == "audio":
                        audio_buffer.extend(chunk["data"])
                
                print(f"[DEBUG TTS] 2. Generación exitosa. Tamaño del buffer: {len(audio_buffer)} bytes.")
                
                if len(audio_buffer) == 0:
                    print("[DEBUG TTS] ❌ ERROR CATASTRÓFICO: El buffer de audio está vacío.")
                else:
                    await websocket.send_bytes(bytes(audio_buffer))
                    print(f"[DEBUG TTS] 3. Audio enviado por WebSocket exitosamente.")
                    
            except Exception as e:
                print(f"[DEBUG TTS] ❌ ERROR AL GENERAR AUDIO: {e}")
            # --- FIN DE LOGS DE DEBUGEÓ ---

            # 6. Notificar fin de audio
            await websocket.send_text(json.dumps({"type": "end_of_audio"}))

    except WebSocketDisconnect:
        print("🔴 [WebSocket] Desconectado.", flush=True)
    except Exception as e:
        print(f"❌ [WebSocket Error Crítico]: {e}", flush=True)