# Usamos una imagen ligera de Python
FROM python:3.11-slim

# Establecemos el directorio de trabajo
WORKDIR /app

# Copiamos el archivo de dependencias (por ahora usaremos pyproject.toml directamente)
# Más adelante configuraremos un requirements.txt o usaremos pip install .
COPY pyproject.toml /app/

# Instalamos las dependencias
RUN pip install --no-cache-dir .

# Copiamos el resto del código fuente
COPY . /app

# Exponemos el puerto obligatorio para Hugging Face Spaces
EXPOSE 7860

# Comando para iniciar el servidor (apuntaremos a un archivo main que crearemos luego)
CMD ["uvicorn", "src.api.main:app", "--host", "0.0.0.0", "--port", "7860"]