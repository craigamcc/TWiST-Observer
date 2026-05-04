import os
import tempfile
import time
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import mlx_whisper
import uvicorn

app = FastAPI(
    title="TWiST Specialist STT Server",
    description="Dedicated high-quality local Audio-to-Text bridge using MLX Whisper.",
    version="1.0.0"
)

# Enable CORS for browser access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration - using the "specialist" model mentioned in the local catalogue
# Optimized for Large v3 Turbo on Apple Silicon
DEFAULT_MODEL = "mlx-community/whisper-large-v3-turbo"

@app.get("/")
def read_root():
    return {
        "status": "online",
        "service": "TWiST Specialist STT",
        "model": DEFAULT_MODEL,
        "platform": "Apple Silicon (MLX)"
    }

@app.post("/v1/audio/transcriptions")
async def transcribe(file: UploadFile = File(...)):
    """
    OpenAI-compatible transcription endpoint.
    Expects a multipart form-data upload with an 'audio' file.
    """
    # 1. Create a temporary file to hold the upload
    suffix = os.path.splitext(file.filename)[1] if file.filename else ".webm"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    print(f"[{time.strftime('%H:%M:%S')}] Received audio: {len(content)} bytes. Transcribing...")

    try:
        # 2. Run inference using the specialized high-quality model
        # Note: mlx_whisper handles Apple Silicon bare-metal acceleration
        result = mlx_whisper.transcribe(
            tmp_path, 
            path_or_hf_repo=DEFAULT_MODEL,
            verbose=False
        )
        
        # 3. Format result to OpenAI standards
        text = result.get("text", "").strip()
        print(f"[{time.strftime('%H:%M:%S')}] Transcript: {text[:60]}...")
        
        return {"text": text}

    except Exception as e:
        print(f"Error during transcription: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")
    
    finally:
        # 4. Clean up the temp file
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

if __name__ == "__main__":
    print(f"🚀 Starting TWiST Specialist STT Server on port 8000...")
    print(f"📦 Model: {DEFAULT_MODEL}")
    uvicorn.run(app, host="0.0.0.0", port=8000)
