from typing import List
from pydantic import BaseModel, Field

class GrammarCorrection(BaseModel):
    original_phrase: str = Field(..., description="La frase exacta con el error que dijo el usuario.")
    corrected_phrase: str = Field(..., description="La forma correcta de decirlo.")
    explanation: str = Field(..., description="Breve explicación pedagógica de la regla gramatical.")

class PedagogicalFeedback(BaseModel):
    conversational_response: str = Field(..., description="Canal A: La respuesta natural en texto para sintetizar.")
    grammar_corrections: List[GrammarCorrection] = Field(default_factory=list, description="Canal B: Errores detectados.")
    suggested_vocabulary: List[str] = Field(default_factory=list, description="3 palabras avanzadas para mejorar el inglés técnico.")