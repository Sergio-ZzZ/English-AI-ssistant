import logging
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)

class Settings(BaseSettings):
    """
    Clase central para manejar las variables de entorno usando Pydantic.
    Si falta alguna de estas variables, la aplicación fallará al inicio 
    en lugar de fallar silenciosamente en producción.
    """
    GROQ_API_KEY: str

    # Le indicamos a Pydantic que lea las variables desde el archivo .env
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

# Instanciamos la configuración para poder importarla en cualquier parte del proyecto
try:
    settings = Settings()
    logger.info("Variables de entorno cargadas correctamente.")
except Exception as e:
    logger.critical(f"Error crítico al cargar variables de entorno: {e}")
    raise