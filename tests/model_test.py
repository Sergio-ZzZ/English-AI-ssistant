import pytest
from pydantic import ValidationError
from src.models.schemas import GrammarCorrection, PedagogicalFeedback

def test_pedagogical_feedback_valid():
    """Prueba que el modelo se inicializa correctamente con datos válidos."""
    data = {
        "conversational_response": "That's a great approach!",
        "grammar_corrections": [
            {
                "original_phrase": "I has a question",
                "corrected_phrase": "I have a question",
                "explanation": "Con el pronombre 'I' se usa 'have' en presente simple, no 'has'."
            }
        ],
        "suggested_vocabulary": ["Inquire", "Query", "Consult"]
    }
    
    feedback = PedagogicalFeedback(**data)
    assert feedback.conversational_response == "That's a great approach!"
    assert len(feedback.grammar_corrections) == 1
    assert len(feedback.suggested_vocabulary) == 3

def test_pedagogical_feedback_missing_required_field():
    """Prueba que Pydantic lanza un error si falta el Canal A (respuesta conversacional)."""
    data = {
        "grammar_corrections": [],
        "suggested_vocabulary": ["Algorithm", "Deployment"]
    }
    
    with pytest.raises(ValidationError):
        PedagogicalFeedback(**data)