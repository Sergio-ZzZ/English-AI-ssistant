import pytest
from unittest.mock import patch, AsyncMock
from src.services.groq_client import GroqService
from src.services.tts_client import TTSService

@pytest.mark.asyncio
async def test_groq_service_valid_response():
    """Prueba que el GroqService procesa y valida correctamente un JSON válido del LLM."""
    # Instanciamos el servicio con una llave de mentira
    service = GroqService(api_key="fake_api_key_123")
    
    # 1. Preparamos el Mock que imita la estructura de respuesta exacta de Groq
    mock_response = AsyncMock()
    mock_response.choices = [AsyncMock()]
    mock_response.choices[0].message.content = '{"conversational_response": "Hi there!", "grammar_corrections": [], "suggested_vocabulary": ["Test", "Mock", "Code"]}'
    
    # 2. Interceptamos el método 'create' del cliente de Groq
    with patch.object(service.client.chat.completions, 'create', return_value=mock_response) as mock_create:
        result = await service.analyze_input("Hello")
        
        # 3. Verificamos que Pydantic hizo su trabajo con los datos falsos
        assert result is not None
        assert result.conversational_response == "Hi there!"
        assert len(result.suggested_vocabulary) == 3
        # Aseguramos que la función fue llamada exactamente una vez
        mock_create.assert_called_once()


@pytest.mark.asyncio
async def test_tts_service_stream():
    """Prueba que el generador asíncrono de voz produce fragmentos de bytes crudos."""
    service = TTSService()
    
    # 1. Simulamos el stream asíncrono que normalmente devuelve edge-tts
    async def mock_edge_stream():
        yield {"type": "audio", "data": b"audio_bytes_1"}
        yield {"type": "audio", "data": b"audio_bytes_2"}
        yield {"type": "WordBoundary", "offset": 100} # Simulamos metadatos que debemos ignorar
        
    # 2. Interceptamos la clase Communicate nativa de edge_tts
    with patch("edge_tts.Communicate.stream", return_value=mock_edge_stream()):
        chunks = []
        # Iteramos sobre nuestro servicio
        async for chunk in service.stream_audio("Test text"):
            chunks.append(chunk)
            
        # 3. Verificamos que solo extrajo los bytes de audio e ignoró lo demás
        assert len(chunks) == 2
        assert chunks[0] == b"audio_bytes_1"
        assert chunks[1] == b"audio_bytes_2"