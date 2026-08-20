document.addEventListener("DOMContentLoaded", () => {
    // Referencias DOM
    const statusBadge = document.getElementById('connection-status');
    const statusText = document.getElementById('status-text');
    const chatContainer = document.getElementById('chat-container');
    const feedbackCard = document.getElementById('feedback-card');
    const closeFeedbackBtn = document.getElementById('close-feedback-btn');
    const grammarExplanation = document.getElementById('grammar-explanation');
    const vocabSuggestions = document.getElementById('vocab-suggestions');
    
    const startBtn = document.getElementById('start-call-btn');
    const activeCallBtns = document.getElementById('active-call-btns');
    const pauseBtn = document.getElementById('pause-call-btn');
    const pauseLabel = document.getElementById('pause-label');
    const pauseIcon = document.getElementById('pause-icon');
    const endBtn = document.getElementById('end-call-btn');

    const voiceVisualizer = document.getElementById('voice-visualizer');
    const callStateLabel = document.getElementById('call-state-label');

    // Máquina de Estados
    let isCallActive = false;
    let isPaused = false;
    let isAiSpeaking = false;
    let hasUserSpoken = false;

    // Conexión y Audio
    let ws = null;
    let mediaRecorder = null;
    let audioChunks = [];
    let audioContext = null;
    let analyser = null;
    let microphone = null;
    let stream = null;
    let silenceTimer = null;
    let animationFrameId = null;

    // Reproductor global persistente para evitar bloqueos en navegadores móviles
    const audioPlayer = new Audio();

    function setStatus(text) {
        if (callStateLabel) callStateLabel.textContent = text;
        console.log(`[Status] ${text}`);
    }

    function getSupportedMimeType() {
        const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/aac'];
        for (const type of types) {
            if (MediaRecorder.isTypeSupported(type)) return type;
        }
        return '';
    }

    // 1. Conexión WebSocket Dinámica
    function connectWebSocket() {
        const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = isLocalhost 
            ? `${wsProtocol}//${window.location.host}/ws/chat` 
            : `wss://english-ai-ssistant.onrender.com/ws/chat`;

        ws = new WebSocket(wsUrl);
        ws.binaryType = "blob";

        ws.onopen = () => {
            statusBadge.className = 'status-badge online';
            statusText.textContent = 'Online';
            console.log("[WS] Conectado a:", wsUrl);
        };

        ws.onmessage = async (event) => {
            // A. Recibir Audio Binario de la IA
            if (event.data instanceof Blob) {
                // --- LOG DE DEBUGEÓ ---
                console.log(`[DEBUG WS] 🟢 BLOB RECIBIDO. Tamaño: ${event.data.size} bytes, Tipo MIME: ${event.data.type}`);
                
                if (event.data.size === 0) {
                    console.error("[DEBUG WS] ❌ El Blob de audio llegó vacío (0 bytes).");
                    return;
                }
                
                playAiVoice(event.data);
                return;
            }

            // Caso B: Recibimos JSON
            try {
                const data = JSON.parse(event.data);
                if (data.error) {
                    addMessage('system', `⚠️ ${data.error}`);
                    if (isCallActive && !isPaused && !isAiSpeaking) startListeningTurn();
                } else if (data.conversational_response) {
                    addMessage('ai', data.conversational_response);
                    updateFeedback(data);
                }
            } catch (e) {
                console.error("[WS] Error parseando JSON:", e);
            }
        };

        ws.onclose = () => {
            statusBadge.className = 'status-badge offline';
            statusText.textContent = 'Disconnected';
            setTimeout(connectWebSocket, 3000);
        };
    }

    // 2. Reproducción de Audio
    function playAiVoice(blob) {
        setAppState(STATES.AI_TALKING, 'Vocalis is speaking...');
        stopMicrophone(); 

        const audioUrl = URL.createObjectURL(blob);
        audioPlayer.src = audioUrl;

        // --- LOGS DE DEBUGEÓ PARA EL REPRODUCTOR ---
        audioPlayer.onloadeddata = () => console.log("[DEBUG AUDIO] 🎵 Audio cargado en el reproductor correctamente.");
        audioPlayer.onplay = () => console.log("[DEBUG AUDIO] ▶️ Reproducción iniciada.");
        
        audioPlayer.onerror = (e) => {
            console.error("[DEBUG AUDIO] ❌ Error crítico en el reproductor de audio:", audioPlayer.error);
            if (currentState !== STATES.PAUSED && currentState !== STATES.IDLE) {
                startListeningTurn();
            }
        };

        audioPlayer.onended = () => {
            console.log("[DEBUG AUDIO] ⏹️ Reproducción finalizada naturalmente.");
            URL.revokeObjectURL(audioUrl);
            if (currentState !== STATES.PAUSED && currentState !== STATES.IDLE) {
                startListeningTurn();
            }
        };

        // Capturar promesas de reproducción
        audioPlayer.play().catch(e => {
            console.error("[DEBUG AUDIO] ❌ El navegador BLOQUEÓ la reproducción (Autoplay Policy):", e);
            if (currentState !== STATES.PAUSED && currentState !== STATES.IDLE) {
                startListeningTurn();
            }
        });
    }

    // 3. Captura con Detección de Silencio por RMS
    async function startListeningTurn() {
        if (!isCallActive || isPaused || isAiSpeaking) return;

        hasUserSpoken = false;
        setStatus('Listening... (Speak when ready)');

        try {
            if (!audioContext) {
                audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (audioContext.state === 'suspended') await audioContext.resume();

            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            
            const mimeType = getSupportedMimeType();
            mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
            audioChunks = [];

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) audioChunks.push(e.data);
            };

            mediaRecorder.onstop = () => {
                if (hasUserSpoken && audioChunks.length > 0 && ws && ws.readyState === WebSocket.OPEN) {
                    const blob = new Blob(audioChunks, { type: mimeType || 'audio/webm' });
                    console.log(`[Mic] Enviando grabación al servidor (${blob.size} bytes)...`);
                    ws.send(blob);
                    setStatus('Thinking...');
                    addMessage('system', '🎙️ Audio sent. Processing response...');
                } else {
                    console.log("[Mic] Grabación vacía o no hablada. Reiniciando...");
                    if (isCallActive && !isPaused && !isAiSpeaking) {
                        startListeningTurn();
                    }
                }
                cleanupMic();
            };

            // Configuración del analizador de volumen RMS
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 512;
            microphone = audioContext.createMediaStreamSource(stream);
            microphone.connect(analyser);

            const bufferLength = analyser.fftSize;
            const dataArray = new Float32Array(bufferLength);

            function checkAudioLevel() {
                if (!isCallActive || isPaused || isAiSpeaking || !mediaRecorder || mediaRecorder.state !== 'recording') {
                    return;
                }

                analyser.getFloatTimeDomainData(dataArray);
                
                // Cálculo de Root Mean Square (RMS)
                let sumSquares = 0.0;
                for (let i = 0; i < bufferLength; i++) {
                    sumSquares += dataArray[i] * dataArray[i];
                }
                const rms = Math.sqrt(sumSquares / bufferLength);

                const SPEECH_THRESHOLD = 0.02; // Sensibilidad de voz

                if (rms > SPEECH_THRESHOLD) {
                    if (!hasUserSpoken) {
                        hasUserSpoken = true;
                        setStatus('Listening to you...');
                    }
                    if (silenceTimer) {
                        clearTimeout(silenceTimer);
                        silenceTimer = null;
                    }
                } else {
                    // Silencio detectado solo después de haber hablado
                    if (hasUserSpoken && !silenceTimer) {
                        silenceTimer = setTimeout(() => {
                            if (mediaRecorder && mediaRecorder.state === 'recording') {
                                console.log("[VAD] 1.2s de silencio detectado. Deteniendo grabación.");
                                mediaRecorder.stop();
                            }
                        }, 1200);
                    }
                }

                animationFrameId = requestAnimationFrame(checkAudioLevel);
            }

            mediaRecorder.start();
            checkAudioLevel();

        } catch (err) {
            console.error("[Mic Error]", err);
            addMessage('system', '❌ Error al acceder al micrófono.');
            endCall();
        }
    }

    function stopRecording() {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
        }
        cleanupMic();
    }

    function cleanupMic() {
        if (stream) {
            stream.getTracks().forEach(t => t.stop());
            stream = null;
        }
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }
        if (silenceTimer) {
            clearTimeout(silenceTimer);
            silenceTimer = null;
        }
    }

    // 4. Controles de Llamada
    function startCall() {
        // Desbloqueo de audio para Safari / iOS
        audioPlayer.src = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
        audioPlayer.play().catch(() => {});

        isCallActive = true;
        isPaused = false;
        isAiSpeaking = false;

        startBtn.classList.add('hidden');
        activeCallBtns.classList.remove('hidden');
        voiceVisualizer.classList.remove('hidden');

        addMessage('system', '📞 Call started. Speak in English!');
        startListeningTurn();
    }

    function pauseCall() {
        isPaused = !isPaused;
        if (isPaused) {
            pauseIcon.textContent = '▶️';
            pauseLabel.textContent = 'Resume';
            setStatus('Call Paused');
            stopRecording();
            audioPlayer.pause();
            addMessage('system', '⏸️ Call paused.');
        } else {
            pauseIcon.textContent = '⏸️';
            pauseLabel.textContent = 'Pause';
            addMessage('system', '▶️ Call resumed.');
            startListeningTurn();
        }
    }

    function endCall() {
        isCallActive = false;
        isPaused = false;
        isAiSpeaking = false;

        stopRecording();
        audioPlayer.pause();

        startBtn.classList.remove('hidden');
        activeCallBtns.classList.add('hidden');
        voiceVisualizer.classList.add('hidden');

        pauseIcon.textContent = '⏸️';
        pauseLabel.textContent = 'Pause';
        addMessage('system', '🛑 Call ended.');
    }

    // Helpers UI
    function addMessage(sender, text) {
        const div = document.createElement('div');
        div.classList.add('message', `${sender}-msg`);
        div.textContent = text;
        chatContainer.appendChild(div);
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    function updateFeedback(data) {
        if (data.grammar_corrections && data.grammar_corrections.length > 0) {
            feedbackCard.classList.remove('hidden');
            const c = data.grammar_corrections[0];
            grammarExplanation.innerHTML = `<strong>Mistake:</strong> "${c.original_phrase}"<br><strong>Better:</strong> "${c.corrected_phrase}"<br><em>${c.explanation}</em>`;
        } else {
            feedbackCard.classList.add('hidden');
        }

        if (data.suggested_vocabulary && data.suggested_vocabulary.length > 0) {
            vocabSuggestions.innerHTML = '';
            data.suggested_vocabulary.forEach(word => {
                const span = document.createElement('span');
                span.textContent = word;
                vocabSuggestions.appendChild(span);
            });
        }
    }

    // Listeners
    if (startBtn) startBtn.addEventListener('click', startCall);
    if (pauseBtn) pauseBtn.addEventListener('click', pauseCall);
    if (endBtn) endBtn.addEventListener('click', endCall);
    if (closeFeedbackBtn) closeFeedbackBtn.addEventListener('click', () => feedbackCard.classList.add('hidden'));

    connectWebSocket();
});