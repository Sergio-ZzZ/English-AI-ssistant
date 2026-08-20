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

    // Máquina de Estados (FSM)
    const STATES = {
        IDLE: 'IDLE',
        WAITING_SPEECH: 'WAITING_SPEECH',
        SPEAKING: 'SPEAKING',
        PROCESSING: 'PROCESSING',
        AI_TALKING: 'AI_TALKING',
        PAUSED: 'PAUSED'
    };
    let currentState = STATES.IDLE;

    let ws = null;
    let mediaRecorder = null;
    let audioChunks = [];
    
    // Motor Central de Web Audio API (El corazón de la solución)
    let audioContext = null;
    let currentAudioSource = null; // Para controlar la voz de la IA
    
    let analyser = null;
    let microphone = null;
    let stream = null;
    let silenceTimer = null;
    let animationFrameId = null;
    let hasUserSpokenInTurn = false; 

    function setAppState(newState, labelText = '') {
        currentState = newState;
        console.log(`[FSM] Estado -> ${newState}`);
        if (callStateLabel && labelText) callStateLabel.textContent = labelText;
    }

    function getSupportedMimeType() {
        const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/aac'];
        for (const type of types) {
            if (MediaRecorder.isTypeSupported(type)) return type;
        }
        return '';
    }

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
        };

        ws.onmessage = async (event) => {
            // A. RECIBIR AUDIO (Ahora usamos AudioContext)
            if (event.data instanceof Blob) {
                console.log(`[Audio] Recibido blob de IA: ${event.data.size} bytes`);
                playAiVoicePro(event.data);
                return;
            }

            // B. RECIBIR JSON
            try {
                const response = JSON.parse(event.data);
                
                // FAIL-SAFE: Si el backend dice que terminó pero nunca nos mandó audio
                if (response.type === "end_of_audio") {
                    if (currentState === STATES.PROCESSING) {
                        console.warn("[FSM] El backend terminó pero no reprodujimos audio. Forzando turno.");
                        startListeningTurn();
                    }
                    return;
                }

                if (response.error) {
                    addMessageToChat('system', `⚠️ ${response.error}`);
                    if (currentState === STATES.PROCESSING || currentState === STATES.AI_TALKING) {
                        startListeningTurn();
                    }
                } else if (response.conversational_response) {
                    addMessageToChat('ai', response.conversational_response);
                    updateFeedbackCard(response);
                }
            } catch (e) {
                console.error("Error JSON:", e);
            }
        };

        ws.onclose = () => {
            statusBadge.className = 'status-badge offline';
            statusText.textContent = 'Disconnected';
            setTimeout(connectWebSocket, 3000);
        };
    }

    // EL NUEVO REPRODUCTOR PROFESIONAL (Web Audio API)
    async function playAiVoicePro(blob) {
        setAppState(STATES.AI_TALKING, 'Vocalis is speaking...');
        stopMicrophone();

        try {
            // 1. Convertir el Blob en un Buffer que el navegador entienda
            const arrayBuffer = await blob.arrayBuffer();
            
            // 2. Decodificar el audio a la fuerza
            const decodedAudio = await audioContext.decodeAudioData(arrayBuffer);
            
            // 3. Crear una fuente de reproducción
            currentAudioSource = audioContext.createBufferSource();
            currentAudioSource.buffer = decodedAudio;
            currentAudioSource.connect(audioContext.destination);

            // 4. Qué hacer cuando termine de hablar
            currentAudioSource.onended = () => {
                console.log("[Audio] Finalizó la voz de la IA con éxito.");
                currentAudioSource = null;
                if (currentState === STATES.AI_TALKING) {
                    startListeningTurn();
                }
            };

            // 5. ¡Reproducir!
            currentAudioSource.start(0);

        } catch (error) {
            console.error("[Audio] Error CRÍTICO decodificando audio:", error);
            addMessageToChat('system', '⚠️ Audio format error. Resuming call...');
            if (currentState === STATES.AI_TALKING) {
                startListeningTurn();
            }
        }
    }

    async function startListeningTurn() {
        if (currentState === STATES.PAUSED || currentState === STATES.IDLE) return;

        setAppState(STATES.WAITING_SPEECH, 'Listening... (Speak when ready)');
        hasUserSpokenInTurn = false; 

        try {
            // Iniciar o reactivar el contexto de audio
            if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
            if (audioContext.state === 'suspended') await audioContext.resume();

            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mimeType = getSupportedMimeType();
            mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
            audioChunks = [];

            mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunks.push(e.data); };

            mediaRecorder.onstop = () => {
                if (hasUserSpokenInTurn && audioChunks.length > 0 && ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(new Blob(audioChunks, { type: mimeType || 'audio/webm' }));
                    setAppState(STATES.PROCESSING, 'Thinking...');
                } else if (currentState !== STATES.PAUSED && currentState !== STATES.IDLE) {
                    startListeningTurn();
                }
                audioChunks = [];
                stopStreamTracks();
            };

            analyser = audioContext.createAnalyser();
            analyser.minDecibels = -55;
            microphone = audioContext.createMediaStreamSource(stream);
            microphone.connect(analyser);

            const dataArray = new Uint8Array(analyser.frequencyBinCount);

            function monitorVoiceActivity() {
                if (currentState !== STATES.WAITING_SPEECH && currentState !== STATES.SPEAKING) return;

                analyser.getByteFrequencyData(dataArray);
                let isSpeaking = dataArray.some(v => v > 15); // Umbral de sensibilidad

                if (isSpeaking) {
                    if (!hasUserSpokenInTurn) {
                        hasUserSpokenInTurn = true;
                        setAppState(STATES.SPEAKING, 'Listening to you...');
                    }
                    if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null; }
                } else {
                    if (hasUserSpokenInTurn && !silenceTimer) {
                        silenceTimer = setTimeout(() => {
                            if (mediaRecorder && mediaRecorder.state === 'recording') mediaRecorder.stop();
                        }, 1300);
                    }
                }
                animationFrameId = requestAnimationFrame(monitorVoiceActivity);
            }

            mediaRecorder.start();
            monitorVoiceActivity();

        } catch (err) {
            console.error("Microphone error:", err);
            addMessageToChat('system', '❌ Microphone permission denied.');
            endCall();
        }
    }

    function stopMicrophone() {
        if (mediaRecorder && mediaRecorder.state === 'recording') mediaRecorder.stop();
        stopStreamTracks();
    }

    function stopStreamTracks() {
        if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
        if (animationFrameId) { cancelAnimationFrame(animationFrameId); animationFrameId = null; }
        if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null; }
    }

    async function startCall() {
        // Inicializamos el motor de audio en el primer click del usuario para evitar bloqueos
        if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
        if (audioContext.state === 'suspended') await audioContext.resume();

        startBtn.classList.add('hidden');
        activeCallBtns.classList.remove('hidden');
        voiceVisualizer.classList.remove('hidden');
        
        addMessageToChat('system', '📞 Call connected. Speak when you are ready!');
        startListeningTurn();
    }

    function pauseCall() {
        if (currentState !== STATES.PAUSED) {
            setAppState(STATES.PAUSED, 'Call Paused');
            pauseIcon.textContent = '▶️';
            pauseLabel.textContent = 'Resume';
            stopMicrophone();
            if (currentAudioSource) currentAudioSource.stop(); // Corta a la IA si está hablando
        } else {
            pauseIcon.textContent = '⏸️';
            pauseLabel.textContent = 'Pause';
            startListeningTurn();
        }
    }

    function endCall() {
        setAppState(STATES.IDLE);
        stopMicrophone();
        if (currentAudioSource) currentAudioSource.stop();

        startBtn.classList.remove('hidden');
        activeCallBtns.classList.add('hidden');
        voiceVisualizer.classList.add('hidden');
        pauseIcon.textContent = '⏸️';
        pauseLabel.textContent = 'Pause';
    }

    function addMessageToChat(sender, text) {
        const div = document.createElement('div');
        div.classList.add('message', `${sender}-msg`);
        div.textContent = text;
        chatContainer.appendChild(div);
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    function updateFeedbackCard(data) {
        if (data.grammar_corrections && data.grammar_corrections.length > 0) {
            feedbackCard.classList.remove('hidden');
            const c = data.grammar_corrections[0];
            grammarExplanation.innerHTML = `<strong>Mistake:</strong> "${c.original_phrase}"<br><strong>Better:</strong> "${c.corrected_phrase}"<br><em>${c.explanation}</em>`;
        }
    }

    if (startBtn) startBtn.addEventListener('click', startCall);
    if (pauseBtn) pauseBtn.addEventListener('click', pauseCall);
    if (endBtn) endBtn.addEventListener('click', endCall);
    if (closeFeedbackBtn) closeFeedbackBtn.addEventListener('click', () => feedbackCard.classList.add('hidden'));

    connectWebSocket();
});