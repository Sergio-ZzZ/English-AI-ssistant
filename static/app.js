document.addEventListener("DOMContentLoaded", () => {
    // Referencias al DOM
    const statusIndicator = document.getElementById('connection-status');
    const micBtn = document.getElementById('mic-btn');
    const micIcon = document.getElementById('mic-icon');
    const chatContainer = document.getElementById('chat-container');
    const feedbackCard = document.getElementById('feedback-card');
    const grammarExplanation = document.getElementById('grammar-explanation');
    const vocabSuggestions = document.getElementById('vocab-suggestions');

    // Variables de Estado
    let ws;
    let mediaRecorder;
    let audioChunks = [];
    let isRecording = false;

    // 1. Conexión al WebSocket
    function connectWebSocket() {
        // En producción (Hugging Face), cambiar a wss://tu-dominio
        ws = new WebSocket('wss://english-ai-ssistant.onrender.com/ws/chat');
        
        // Importante: le decimos al navegador que la data binaria la maneje como Blob
        ws.binaryType = "blob"; 

        ws.onopen = () => {
            statusIndicator.textContent = 'Online';
            statusIndicator.classList.replace('offline', 'online');
            console.log("[WebSocket] Conectado exitosamente.");
        };

        ws.onmessage = async (event) => {
            // Caso A: Recibimos audio binario de la IA (edge-tts)
            if (event.data instanceof Blob) {
                console.log("[WebSocket] Fragmento de audio recibido.");
                playAudioChunk(event.data);
                return;
            }

            // Caso B: Recibimos texto (JSON del feedback o señales de control)
            try {
                const response = JSON.parse(event.data);
                
                if (response.error) {
                    addMessageToChat('system', `Error: ${response.error}`);
                } else if (response.type === "end_of_audio") {
                    console.log("[WebSocket] IA terminó de hablar.");
                    // Aquí podríamos reiniciar automáticamente el micro para "Manos libres"
                } else if (response.conversational_response) {
                    // Actualizamos la UI con los datos de Pydantic
                    addMessageToChat('ai', response.conversational_response);
                    updateFeedbackCard(response);
                }
            } catch (e) {
                console.error("[WebSocket] Error parseando JSON:", e);
            }
        };

        ws.onclose = () => {
            statusIndicator.textContent = 'Disconnected';
            statusIndicator.classList.replace('online', 'offline');
            console.log("[WebSocket] Conexión cerrada. Intentando reconectar en 3s...");
            setTimeout(connectWebSocket, 3000);
        };
    }

    // 2. Control del Micrófono (MediaRecorder API)
    async function toggleRecording() {
        if (isRecording) {
            // Detener grabación
            mediaRecorder.stop();
            micBtn.classList.remove('recording');
            micBtn.innerHTML = '<span id="mic-icon">🎙️</span> Start Conversation';
            isRecording = false;
            addMessageToChat('system', 'Audio sent. Waiting for AI...');
        } else {
            // Iniciar grabación
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
                
                mediaRecorder.ondataavailable = (event) => {
                    if (event.data.size > 0) audioChunks.push(event.data);
                };

                mediaRecorder.onstop = () => {
                    // Empaquetamos los chunks y los mandamos por WebSocket al backend
                    const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(audioBlob);
                        console.log(`[Mic] Audio enviado al servidor (${audioBlob.size} bytes).`);
                    }
                    audioChunks = []; // Limpiamos para la próxima vez
                    
                    // Apagamos la luz del micrófono para liberar memoria
                    stream.getTracks().forEach(track => track.stop());
                };

                mediaRecorder.start();
                micBtn.classList.add('recording');
                micBtn.innerHTML = '<span id="mic-icon">⏹️</span> Listening...';
                isRecording = true;
            } catch (err) {
                console.error("[Mic] Permisos de micrófono denegados:", err);
                alert("Please allow microphone access to use Vocalis-AI.");
            }
        }
    }

    // 3. Funciones Auxiliares de UI
    function addMessageToChat(sender, text) {
        const div = document.createElement('div');
        div.classList.add('message', `${sender}-msg`);
        div.textContent = text;
        chatContainer.appendChild(div);
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    function updateFeedbackCard(data) {
        if (data.grammar_corrections.length > 0) {
            feedbackCard.classList.remove('hidden');
            const correction = data.grammar_corrections[0]; // Mostramos el primer error
            grammarExplanation.innerHTML = `<strong>Error:</strong> "${correction.original_phrase}"<br><strong>Correcto:</strong> "${correction.corrected_phrase}"<br><em>${correction.explanation}</em>`;
        } else {
            feedbackCard.classList.add('hidden');
        }

        if (data.suggested_vocabulary) {
            vocabSuggestions.innerHTML = '';
            data.suggested_vocabulary.forEach(word => {
                const span = document.createElement('span');
                span.textContent = word;
                vocabSuggestions.appendChild(span);
            });
        }
    }

    function playAudioChunk(blob) {
        const audioUrl = URL.createObjectURL(blob);
        const audio = new Audio(audioUrl);
        audio.play().catch(e => console.error("Error reproduciendo audio:", e));
    }

    // Inicialización
    connectWebSocket();
    micBtn.addEventListener('click', toggleRecording);
});