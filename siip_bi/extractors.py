import os
import json
from google import genai
from google.genai import types
from dotenv import load_dotenv

load_dotenv()
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

def extract_structured_input(document_text: str, schema_type):
    """Uses Gemini to extract rigid JSON data matching the given schema."""
    response = client.models.generate_content(
        model='gemini-2.5-flash',
        contents=f"Extract the relevant compliance parameters accurately from this text:\n\n{document_text}",
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=schema_type,
            temperature=0.0
        ),
    )
    return json.loads(response.text)