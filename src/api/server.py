import logging
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from src.api.routes import router # Asegúrate de que esta ruta coincida con tu proyecto

# Instanciamos el logger para este archivo
logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Vocalis-AI")

# 1. Montar la carpeta "static" para que FastAPI pueda servir tus CSS, JS y el Manifest
app.mount("/static", StaticFiles(directory="static"), name="static")

# 2. Crear una ruta para la raíz ("/") que devuelva tu cliente PWA (index.html)
@app.get("/")
async def serve_frontend():
    return FileResponse("static/index.html")

# 3. Tu router de WebSockets (Canal de audio y JSON)
app.include_router(router) 

# 4. Health Check para monitoreo
@app.get("/health")
async def health_check():
    """
    Endpoint HTTP básico para verificar que el servidor está vivo y 
    listo para aceptar conexiones de WebSockets.
    """
    logger.info("Health check solicitado.")
    return {"status": "ok", "message": "Vocalis-AI server is running."}