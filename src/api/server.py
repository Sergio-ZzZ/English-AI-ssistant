import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# IMPORTANTE: Importamos nuestro enrutador de WebSockets
from src.api.routes import router as chat_router

# 1. Configuración de logs
logging.basicConfig(
    level=logging.INFO, 
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# 2. Inicializamos la aplicación FastAPI
app = FastAPI(
    title="Vocalis-AI API",
    description="Backend asíncrono para asistente de inglés en tiempo real.",
    version="0.1.0"
)

# 3. Configuración de CORS para evitar bloqueos del navegador
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 4. Conectamos el enrutador de WebSockets a la aplicación principal
app.include_router(chat_router)

@app.get("/health")
async def health_check():
    """
    Endpoint HTTP básico para verificar que el servidor está vivo y 
    listo para aceptar conexiones de WebSockets en el puerto 7860.
    """
    logger.info("Health check solicitado.")
    return {"status": "ok", "message": "Vocalis-AI server is running."}