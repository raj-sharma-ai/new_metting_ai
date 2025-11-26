#aa main code che ho bhai  badhu thatu tu aama j 
#this import for fastapi and other libraries
from fastapi import FastAPI, File, UploadFile, HTTPException, BackgroundTasks

#this import for fastapi middleware and response
from fastapi.middleware.cors import CORSMiddleware

#this import for fastapi file response
from fastapi.responses import FileResponse


from fastapi import FastAPI, WebSocket, WebSocketDisconnect



#this import for pydantic base model and typing
from pydantic import BaseModel


#this import for typing
from typing import Optional, List


import os

#uuid for unique id
import uuid


#shutil for file operations coz we are using it for file operations
import shutil
from pathlib import Path
from datetime import datetime
import aiosqlite

from langchain_huggingface import HuggingFaceEndpoint, ChatHuggingFace
from dotenv import load_dotenv
import json


from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.pdfgen import canvas


#httpx for http requests
import httpx

load_dotenv()

app = FastAPI(title="AI Meeting Transcriber API")

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)




# ADD THIS TO YOUR EXISTING main.py (after line 64)

import wave
import io
from collections import defaultdict

# Store for streaming audio chunks
streaming_sessions = defaultdict(lambda: {
    'chunks': [],
    'chunk_count': 0,
    'start_time': None
})

@app.websocket("/ws/stream/{meeting_id}")
async def stream_audio_websocket(websocket: WebSocket, meeting_id: str):
    """
    WebSocket endpoint for real-time audio streaming and transcription
    """
    await websocket.accept()
    print(f"🎙️ WebSocket connected for meeting: {meeting_id}")
    
    session = streaming_sessions[meeting_id]
    session['start_time'] = datetime.now()
    
    try:
        while True:
            # Receive audio chunk from Electron app
            chunk_data = await websocket.receive_bytes()
            
            if not chunk_data:
                continue
            
            session['chunks'].append(chunk_data)
            session['chunk_count'] += 1
            
            print(f"📦 Received chunk #{session['chunk_count']} ({len(chunk_data)} bytes)")
            
            # Process every 10 seconds (adjust based on your needs)
            if session['chunk_count'] % 10 == 0:  # ~10 seconds of audio
                try:
                    # Combine chunks into single audio file
                    combined_audio = b''.join(session['chunks'])
                    
                    # Create temporary WAV file
                    temp_audio_path = UPLOAD_DIR / f"stream_{meeting_id}_{session['chunk_count']}.wav"
                    
                    with wave.open(str(temp_audio_path), 'wb') as wf:
                        wf.setnchannels(1)  # Mono
                        wf.setsampwidth(2)  # 16-bit
                        wf.setframerate(16000)  # 16kHz
                        wf.writeframes(combined_audio)
                    
                    # Transcribe the audio chunk
                    partial_transcript, partial_speakers = await transcribe_audio(
                        str(temp_audio_path), 
                        meeting_id
                    )
                    
                    # Save partial transcript to database
                    async with get_db() as db:
                        # Check if meeting exists
                        cursor = await db.execute(
                            "SELECT meeting_id, transcript, speakers_json FROM meetings WHERE meeting_id = ?",
                            (meeting_id,)
                        )
                        existing = await cursor.fetchone()
                        
                        if existing:
                            # Update existing meeting - append transcript and merge speakers
                            existing_transcript = existing['transcript'] or ""
                            existing_speakers = json.loads(existing['speakers_json'] or '[]')
                            
                            # Append new transcript
                            updated_transcript = existing_transcript + " " + partial_transcript if existing_transcript else partial_transcript
                            
                            # Merge speakers data
                            updated_speakers = existing_speakers + partial_speakers
                            
                            await db.execute(
                                """
                                UPDATE meetings 
                                SET transcript = ?, 
                                    speakers_json = ?
                                WHERE meeting_id = ?
                                """,
                                (updated_transcript.strip(), json.dumps(updated_speakers), meeting_id)
                            )
                        else:
                            # Create new meeting entry
                            await db.execute(
                                """
                                INSERT INTO meetings (
                                    meeting_id, title, transcript, speakers_json, created_at
                                ) VALUES (?, ?, ?, ?, ?)
                                """,
                                (
                                    meeting_id,
                                    f"Streaming Meeting {meeting_id}",
                                    partial_transcript,
                                    json.dumps(partial_speakers),
                                    datetime.now().isoformat()
                                )
                            )
                        
                        await db.commit()
                        print(f"💾 Saved partial transcript to database for chunk #{session['chunk_count']}")
                    
                    # Send partial transcript back to client
                    await websocket.send_json({
                        "type": "partial_transcript",
                        "chunk_id": session['chunk_count'],
                        "text": partial_transcript,
                        "speakers": partial_speakers,
                        "timestamp": datetime.now().isoformat()
                    })
                    
                    print(f"✅ Sent partial transcript for chunk #{session['chunk_count']}")
                    
                    # Clean up temp file
                    if temp_audio_path.exists():
                        os.remove(temp_audio_path)
                    
                    # Clear processed chunks to save memory
                    session['chunks'] = []
                    
                except Exception as e:
                    print(f"❌ Error processing audio chunk: {str(e)}")
                    await websocket.send_json({
                        "type": "error",
                        "message": f"Transcription error: {str(e)}"
                    })
            
            # Send heartbeat every 30 chunks
            if session['chunk_count'] % 30 == 0:
                await websocket.send_json({
                    "type": "heartbeat",
                    "chunks_received": session['chunk_count'],
                    "duration": str(datetime.now() - session['start_time'])
                })
    
    except WebSocketDisconnect:
        print(f"🔌 WebSocket disconnected for meeting: {meeting_id}")
        
        # Finalize meeting on disconnect
        try:
            # Get all transcripts for this meeting
            async with get_db() as db:
                db.row_factory = aiosqlite.Row
                cursor = await db.execute(
                    """
                    SELECT meeting_id, title, transcript, speakers_json, created_at, duration
                    FROM meetings WHERE meeting_id = ?
                    """,
                    (meeting_id,)
                )
                row = await cursor.fetchone()
                
                if row:
                    meeting_data = dict(row)
                    transcript = meeting_data['transcript']
                    speakers_data = json.loads(meeting_data['speakers_json'] or '[]')
                    
                    if transcript and transcript.strip():
                        # Generate final summary
                        print(f"📝 Generating summary for meeting: {meeting_id}")
                        final_summary = await generate_summary(transcript, speakers_data)
                        
                        # Update meeting with final summary
                        await db.execute(
                            "UPDATE meetings SET summary = ? WHERE meeting_id = ?",
                            (final_summary, meeting_id)
                        )
                        await db.commit()
                        
                        meeting_data['summary'] = final_summary
                        meeting_data['speakers'] = speakers_data
                        
                        # Generate PDF report
                        print(f"📄 Generating PDF report for meeting: {meeting_id}")
                        pdf_path = REPORTS_DIR / f"{meeting_id}_report.pdf"
                        generate_pdf_report(meeting_data, str(pdf_path))
                        
                        # Send to Slack (if configured)
                        if SLACK_WEBHOOK_URL:
                            print(f"📤 Sending to Slack for meeting: {meeting_id}")
                            await send_to_slack(meeting_data, str(pdf_path))
                        
                        print(f"✅ Final summary, PDF, and Slack notification completed for meeting: {meeting_id}")
                    else:
                        print(f"⚠️ No transcript found for meeting: {meeting_id}")
                else:
                    print(f"⚠️ Meeting not found in database: {meeting_id}")
        except Exception as e:
            print(f"❌ Error finalizing meeting: {str(e)}")
            import traceback
            traceback.print_exc()
        
        # Clean up session
        if meeting_id in streaming_sessions:
            del streaming_sessions[meeting_id]
    
    except Exception as e:
        print(f"❌ WebSocket error: {str(e)}")
        await websocket.close()


# Alternative: HTTP endpoint for uploading complete audio file
@app.post("/api/upload-audio/{meeting_id}")
async def upload_audio_chunk(
    meeting_id: str,
    file: UploadFile = File(...),
    chunk_index: int = 0
):
    """
    HTTP endpoint for uploading audio chunks (alternative to WebSocket)
    Useful if WebSocket connection is unstable
    """
    try:
        # Save chunk
        chunk_path = UPLOAD_DIR / f"{meeting_id}_chunk_{chunk_index}.wav"
        
        with open(chunk_path, "wb") as f:
            content = await file.read()
            f.write(content)
        
        # Transcribe
        transcript, speakers = await transcribe_audio(str(chunk_path), meeting_id)
        
        # Store partial transcript in database
        async with get_db() as db:
            # Check if meeting exists
            cursor = await db.execute(
                "SELECT meeting_id FROM meetings WHERE meeting_id = ?",
                (meeting_id,)
            )
            existing = await cursor.fetchone()
            
            if existing:
                # Update existing meeting
                await db.execute(
                    """
                    UPDATE meetings 
                    SET transcript = transcript || ?, 
                        speakers_json = ?
                    WHERE meeting_id = ?
                    """,
                    (transcript, json.dumps(speakers), meeting_id)
                )
            else:
                # Create new meeting
                await db.execute(
                    """
                    INSERT INTO meetings (
                        meeting_id, title, transcript, speakers_json, created_at
                    ) VALUES (?, ?, ?, ?, ?)
                    """,
                    (
                        meeting_id,
                        "Streaming Meeting",
                        transcript,
                        json.dumps(speakers),
                        datetime.now().isoformat()
                    )
                )
            
            await db.commit()
        
        # Clean up chunk file
        os.remove(chunk_path)
        
        return {
            "success": True,
            "chunk_index": chunk_index,
            "transcript": transcript,
            "speakers": speakers
        }
    
    except Exception as e:
        print(f"❌ Error uploading audio chunk: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/finalize-meeting/{meeting_id}")
async def finalize_meeting(meeting_id: str):
    """
    Finalize meeting - generate summary and PDF report
    """
    try:
        # Get meeting data
        async with get_db() as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute(
                """
                SELECT meeting_id, title, transcript, speakers_json, created_at, duration
                FROM meetings
                WHERE meeting_id = ?
                """,
                (meeting_id,)
            )
            row = await cursor.fetchone()
            
            if not row:
                raise HTTPException(status_code=404, detail="Meeting not found")
            
            meeting_data = dict(row)
            meeting_data['speakers'] = json.loads(meeting_data.pop('speakers_json') or '[]')
        
        # Generate final summary
        summary = await generate_summary(
            meeting_data['transcript'],
            meeting_data['speakers']
        )
        
        # Update database
        async with get_db() as db:
            await db.execute(
                "UPDATE meetings SET summary = ? WHERE meeting_id = ?",
                (summary, meeting_id)
            )
            await db.commit()
        
        meeting_data['summary'] = summary
        
        # Generate PDF report
        pdf_path = REPORTS_DIR / f"{meeting_id}_report.pdf"
        generate_pdf_report(meeting_data, str(pdf_path))
        
        # Send to Slack (if configured)
        if SLACK_WEBHOOK_URL:
            await send_to_slack(meeting_data, str(pdf_path))
        
        return {
            "success": True,
            "meeting_id": meeting_id,
            "summary": summary,
            "pdf_available": pdf_path.exists()
        }
    
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error finalizing meeting: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# Health check for WebSocket
@app.get("/ws/health")
async def websocket_health():
    """Check if WebSocket is ready"""
    return {
        "websocket_available": True,
        "active_sessions": len(streaming_sessions),
        "backend_version": "1.0.0"
    }

# Configuration
# MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
# OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
SLACK_WEBHOOK_URL = os.getenv("SLACK_WEBHOOK_URL")
UPLOAD_DIR = Path("uploads")
REPORTS_DIR = Path("reports")

UPLOAD_DIR.mkdir(exist_ok=True)
REPORTS_DIR.mkdir(exist_ok=True)


def ensure_ffmpeg_available() -> str:
    existing = shutil.which("ffmpeg")
    if existing:
        print(f"Using FFmpeg at {existing}")
        return existing

    try:
        import imageio_ffmpeg  # type: ignore

        packaged_path = Path(imageio_ffmpeg.get_ffmpeg_exe())
        alias_path = packaged_path.with_name("ffmpeg.exe")

        if not alias_path.exists():
            shutil.copy2(packaged_path, alias_path)

        ffmpeg_dir = str(alias_path.parent)
        os.environ["PATH"] = ffmpeg_dir + os.pathsep + os.environ.get("PATH", "")
        os.environ.setdefault("FFMPEG_BINARY", str(alias_path))

        resolved = shutil.which("ffmpeg")
        if resolved:
            print(f"Configured FFmpeg from imageio-ffmpeg at {resolved}")
            return resolved

        raise FileNotFoundError("ffmpeg executable alias could not be resolved")
    except Exception as exc:  # pragma: no cover - defensive
        raise RuntimeError(
            "FFmpeg is required for audio processing but was not found. "
            "Install FFmpeg and ensure it is on your system PATH."
        ) from exc


ensure_ffmpeg_available()

# SQLite Configuration
SQLITE_DB_PATH = os.getenv("SQLITE_DB_PATH", "meetings.db")
DB_INIT_SQL = """
CREATE TABLE IF NOT EXISTS meetings (
    meeting_id TEXT PRIMARY KEY,
    title TEXT,
    transcript TEXT,
    summary TEXT,
    speakers_json TEXT,
    created_at TEXT,
    file_name TEXT,
    duration TEXT
);
"""

def get_db():
    return aiosqlite.connect(SQLITE_DB_PATH)

@app.on_event("startup")
async def startup_event():
    # Ensure FFmpeg and DB are ready
    ensure_ffmpeg_available()
    async with get_db() as db:
        await db.execute(DB_INIT_SQL)
        await db.commit()

# Pydantic Models
class TranscriptionResponse(BaseModel):
    meeting_id: str
    transcript: str
    summary: str
    speakers: List[dict]
    created_at: str

class QuestionRequest(BaseModel):
    meeting_id: str
    question: str

class QuestionResponse(BaseModel):
    answer: str
    context: str

# Helper Functions
# async def transcribe_audio(file_path: str, meeting_id: str):
#     """Transcribe audio using Whisper with speaker diarization simulation"""
#     try:
#         print(f"Transcribing audio for meeting {meeting_id}...")
#         result = whisper_model.transcribe(
#             file_path,
#             language="en",
#             task="transcribe",
#             verbose=False
#         )
        
#         # Simulate speaker diarization (in production, use pyannote.audio)
#         # For demo, we'll split by sentences and alternate speakers
#         transcript_text = result["text"]
#         segments = result.get("segments", [])
        
#         # Create speaker-labeled segments
#         speakers_data = []
#         speaker_names = ["Speaker 1", "Speaker 2", "Speaker 3", "Speaker 4"]
        
#         for i, segment in enumerate(segments):
#             speaker = speaker_names[i % len(speaker_names)]
#             speakers_data.append({
#                 "speaker": speaker,
#                 "text": segment["text"],
#                 "start": segment["start"],
#                 "end": segment["end"]
#             })
        
#         return transcript_text, speakers_data
#     except Exception as e:
#         print(f"Error in transcription: {str(e)}")
#         raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")



# aa main che ho dhyan se dekhna hai 
# async def transcribe_audio(file_path: str, meeting_id: str):
#     """Transcribe audio using Whisper – switch speaker when one finishes speaking"""
#     try:
#         print(f"Transcribing audio for meeting {meeting_id}...")

#         # Step 1: Transcribe
#         result = whisper_model.transcribe(
#             file_path,
#             language="en",
#             task="transcribe",
#             verbose=False
#         )

#         transcript_text = result["text"]
#         segments = result.get("segments", [])

#         # Step 2: Speaker setup
#         speakers_data = []
#         speaker_names = ["Speaker 1", "Speaker 2"]
#         speaker_index = 0

#         # Step 3: Logic – whenever sentence ends, next speaker takes over
#         for i, segment in enumerate(segments):
#             text = segment["text"].strip()
#             start = segment["start"]
#             end = segment["end"]

#             # If the current text ends with punctuation (meaning full sentence)
#             # then switch to next speaker for next segment
#             if i > 0:
#                 prev_text = segments[i - 1]["text"].strip()
#                 if prev_text.endswith((".", "!", "?", "…")):
#                     speaker_index = (speaker_index + 1) % len(speaker_names)

#             speaker = speaker_names[speaker_index]

#             speakers_data.append({
#                 "speaker": speaker,
#                 "text": text,
#                 "start": start,
#                 "end": end
#             })

#         # Step 4: Return output
#         return transcript_text, speakers_data

#     except Exception as e:
#         print(f"Error in transcription: {str(e)}")
#         raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")


import assemblyai as aai
from fastapi import HTTPException

# Set your API key (Free: https://www.assemblyai.com/dashboard/signup)
aai.settings.api_key = "b8d6c120888b4fd8af5b1611faebbb59"

async def transcribe_audio(file_path: str, meeting_id: str):
    """Transcribe with REAL speaker detection using AssemblyAI"""
    try:
        print(f"🎤 Transcribing audio for meeting {meeting_id}...")
        
        # Configure transcription with speaker detection
        config = aai.TranscriptionConfig(
            speaker_labels=True,  # Enable speaker detection
            language_code="en"
        )
        
        # Upload and transcribe
        transcriber = aai.Transcriber()
        transcript = transcriber.transcribe(file_path, config=config)
        
        if transcript.status == aai.TranscriptStatus.error:
            raise Exception(f"Transcription failed: {transcript.error}")
        
        # Process speakers
        speakers_data = []
        full_text = ""
        
        for utterance in transcript.utterances:
            speaker = f"Speaker {utterance.speaker}"
            text = utterance.text
            start = utterance.start / 1000  # Convert ms to seconds
            end = utterance.end / 1000
            
            speakers_data.append({
                "speaker": speaker,
                "text": text,
                "start": start,
                "end": end
            })
            
            full_text += f"{text} "
        
        # Check if only one speaker
        unique_speakers = set(item["speaker"] for item in speakers_data)
        
        if len(unique_speakers) == 1:
            for item in speakers_data:
                item["speaker"] = "Speaker 1"
            print("✅ Only one speaker detected")
        else:
            print(f"✅ {len(unique_speakers)} speakers detected")
        
        return full_text.strip(), speakers_data
        
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")





#This is new summary function this is very good and it is working fine,we can use this function for summary generation okay
async def generate_summary(transcript: str, speakers_data: List[dict]):
    """Generate meeting summary using Hugging Face LLM"""
    try:
        if not transcript.strip():
            raise HTTPException(status_code=400, detail="Transcript is empty. Cannot generate summary.")

        formatted_transcript = "\n".join([
            f"[{s['speaker']}]: {s['text']}" for s in speakers_data
        ])

        # summary_prompt = (
        #     "You are an expert meeting summarizer. Summarize the following transcript into clear, structured bullet points.\n"
        #     "Include these sections:\n"
        #     "1. **Context** – Briefly describe the main topic and purpose of the meeting.\n"
        #     "2. **Key Points Discussed** – Highlight the major arguments, ideas, or issues covered.\n"
        #     "3. **Decisions / Consensus Reached** – Note any conclusions or agreements.\n"
        #     "4. **Action Items** – List follow-up tasks, responsible persons (if mentioned), and next steps.\n"
        #     "5. **Overall Outcome** – Give a short summary of the final tone or result of the meeting.\n\n"
        #     "Keep the language concise and professional.\n\n"
        #     f"Transcript:\n{formatted_transcript}"
        # )

        summary_prompt = (
    "You are a highly reliable meeting summarizer. "
    "Your job is to convert the transcript into a precise and structured summary "
    "WITHOUT adding any information that is not explicitly mentioned.\n\n"

    "Follow this exact format:\n\n"

    "1. **Context**\n"
    "- Brief description of what the meeting was about and who was involved.\n\n"

    "2. **Key Points Discussed**\n"
    "- Bullet points of important discussions, arguments, or explanations.\n\n"

    "3. **Decisions / Agreements**\n"
    "- Only include decisions actually mentioned in the transcript.\n"
    "- If no decision was made, write: ‘No explicit decisions made.’\n\n"

    "4. **Action Items**\n"
    "- List follow-up tasks with owner names if mentioned.\n"
    "- If owner is not mentioned, write: ‘(Owner not specified)’\n\n"

    "5. **Overall Outcome / Tone**\n"
    "- One short paragraph describing the overall result and tone.\n\n"

    "Rules:\n"
    "- DO NOT fabricate information.\n"
    "- Keep it concise, factual, and professional.\n"
    "- Maintain clear bullet points.\n"
    "- Only use details from the transcript.\n\n"

    f"Transcript:\n{formatted_transcript}"
)


        # HF_TOKEN = os.getenv("Hugging_Face_Api")
        # endpoint = HuggingFaceEndpoint(
        #     repo_id="meta-llama/Llama-3-70b-instruct",
        #     task="conversational",
        #     huggingfacehub_api_token=HF_TOKEN,
        #     temperature=0.3,
        #     max_new_tokens=600,
        # )
        HF_TOKEN = os.getenv("HUGGINGFACEHUB_API_TOKEN")

        endpoint = HuggingFaceEndpoint(
            repo_id="meta-llama/Llama-3.1-8B-Instruct",
            task="conversational",
            huggingfacehub_api_token=HF_TOKEN,

            temperature=0.1,            # ultra-stable, less hallucination
            top_p=0.9,                  # balanced creativity + control
            top_k=40,                   # avoids random tokens
            max_new_tokens=1200,        # longer, useful answers
            repetition_penalty=1.15,    # avoids repeating sentences
            stop_sequences=["</s>"],    # stops safely

            # Very important for consistent chat behaviour
            return_full_text=False,     
        )


        llm_model = ChatHuggingFace(llm=endpoint)

        import asyncio
        response = await asyncio.to_thread(llm_model.invoke, summary_prompt)

        return getattr(response, "content", str(response))

    except Exception as e:
        print(f"Error generating summary: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Summary generation failed: {str(e)}")


async def answer_question(meeting_id: str, question: str):
    """Answer questions about the meeting using GPT-4"""
    try:
        # Retrieve meeting from SQLite
        async with get_db() as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute(
                """
                SELECT transcript, speakers_json
                FROM meetings
                WHERE meeting_id = ?
                """,
                (meeting_id,),
            )
            row = await cursor.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Meeting not found")
            meeting = dict(row)
        
        transcript = meeting["transcript"]
        speakers_data = meeting.get("speakers", [])
        
        # Format transcript
        formatted_transcript = "\n".join([
            f"[{s['speaker']}]: {s['text']}" for s in speakers_data
        ])
        
        prompt = f"""Based on this meeting transcript, answer the following question:

Transcript:
{formatted_transcript}

Question: {question}

Provide a clear, specific answer based only on the information in the transcript. If the answer is not in the transcript, say so."""

        HF_TOKEN = os.getenv("HUGGINGFACEHUB_API_TOKEN")

        endpoint = HuggingFaceEndpoint(
            repo_id="openai/gpt-oss-120b",
            task="conversational",
            huggingfacehub_api_token=HF_TOKEN,
            temperature=0.3,
        )

        llm_model = ChatHuggingFace(llm=endpoint)

        question_prompt = (
            "You are an AI assistant answering questions about a meeting. "
            "Use only the provided transcript to answer the user's question."
            "If the answer is not present, respond with 'Information not available in the transcript.'\n\n"
            f"Transcript:\n{formatted_transcript}\n\nQuestion: {question}"
        )

        response = llm_model.invoke(question_prompt)
        answer = getattr(response, "content", str(response))
        
        # Find relevant context
        context_parts = []
        for speaker_data in speakers_data:
            if any(word.lower() in speaker_data['text'].lower() for word in question.split()):
                context_parts.append(f"[{speaker_data['speaker']}]: {speaker_data['text']}")
        
        context = "\n".join(context_parts[:3]) if context_parts else "No specific context found"
        
        return answer, context
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error answering question: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Q&A failed: {str(e)}")

# def generate_pdf_report(meeting_data: dict, output_path: str):
#     """Generate a professional PDF report"""
#     try:
#         doc = SimpleDocTemplate(output_path, pagesize=letter)
#         styles = getSampleStyleSheet()
#         story = []
        
#         # Custom styles
#         title_style = ParagraphStyle(
#             'CustomTitle',
#             parent=styles['Heading1'],
#             fontSize=24,
#             textColor='#1a1a1a',
#             spaceAfter=30,
#             alignment=TA_CENTER
#         )
        
#         heading_style = ParagraphStyle(
#             'CustomHeading',
#             parent=styles['Heading2'],
#             fontSize=14,
#             textColor='#2c3e50',
#             spaceAfter=12,
#             spaceBefore=12
#         )
        
#         # Title
#         story.append(Paragraph("📋 Meeting Transcript Report", title_style))
#         story.append(Spacer(1, 0.2*inch))
        
#         # Meeting Info
#         story.append(Paragraph(f"<b>Meeting ID:</b> {meeting_data['meeting_id']}", styles['Normal']))
#         story.append(Paragraph(f"<b>Date:</b> {meeting_data['created_at']}", styles['Normal']))
#         story.append(Paragraph(f"<b>Duration:</b> {meeting_data.get('duration', 'N/A')}", styles['Normal']))
#         story.append(Spacer(1, 0.3*inch))
        
#         # Summary Section
#         story.append(Paragraph("Meeting Summary", heading_style))
#         summary_lines = meeting_data['summary'].split('\n')
#         for line in summary_lines:
#             if line.strip():
#                 story.append(Paragraph(line, styles['Normal']))
#                 story.append(Spacer(1, 0.1*inch))
        
#         story.append(Spacer(1, 0.3*inch))
        
#         # Speakers Section
#         story.append(Paragraph("Speakers & Transcript", heading_style))
#         for speaker_data in meeting_data.get('speakers', [])[:20]:  # Limit to first 20 segments
#             speaker_text = f"<b>[{speaker_data['speaker']}]</b>: {speaker_data['text']}"
#             story.append(Paragraph(speaker_text, styles['Normal']))
#             story.append(Spacer(1, 0.1*inch))
        
#         # Build PDF
#         doc.build(story)
#         print(f"PDF generated successfully: {output_path}")
#     except Exception as e:
#         print(f"Error generating PDF: {str(e)}")
#         



def generate_pdf_report(meeting_data: dict, output_path: str):
    """Generate a premium AI-styled meeting report PDF"""
    try:
        # === Setup ===
        doc = SimpleDocTemplate(output_path, pagesize=letter,
                                rightMargin=50, leftMargin=50, topMargin=60, bottomMargin=50)
        styles = getSampleStyleSheet()
        story = []

        # === Custom Styles ===
        title_style = ParagraphStyle(
            'TitleStyle',
            parent=styles['Heading1'],
            fontName='Helvetica-Bold',
            fontSize=22,
            textColor=colors.HexColor("#1E3A8A"),  # Deep blue
            alignment=1,
            spaceAfter=20
        )

        section_heading = ParagraphStyle(
            'SectionHeading',
            parent=styles['Heading2'],
            fontName='Helvetica-Bold',
            fontSize=14,
            textColor=colors.HexColor("#2563EB"),  # Light blue
            spaceBefore=12,
            spaceAfter=8
        )

        text_style = ParagraphStyle(
            'TextStyle',
            parent=styles['Normal'],
            fontName='Helvetica',
            fontSize=11,
            leading=16,
            textColor=colors.HexColor("#111827")
        )

        # === HEADER CARD ===
        header_data = [
            ["📋 Meeting Report", "", ""],
            [f"🆔 ID: {meeting_data.get('meeting_id', 'N/A')}",
             f"🕒 Date: {meeting_data.get('created_at', 'N/A')}",
             f"⏳ Duration: {meeting_data.get('duration', 'N/A')}"]
        ]
        header_table = Table(header_data, colWidths=[2.8 * inch, 2.3 * inch, 2.2 * inch])
        header_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#2563EB")),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTSIZE', (0, 0), (-1, -1), 12),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('BACKGROUND', (0, 1), (-1, 1), colors.whitesmoke),
            ('TEXTCOLOR', (0, 1), (-1, 1), colors.HexColor("#1F2937")),
            ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor("#93C5FD")),
            ('INNERGRID', (0, 0), (-1, -1), 0.25, colors.HexColor("#BFDBFE")),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ]))
        story.append(header_table)
        story.append(Spacer(1, 0.3 * inch))

        # === SUMMARY CARD ===
        story.append(Paragraph("📄 Meeting Summary", section_heading))
        summary_text = meeting_data.get('summary', 'No summary available').split('\n')
        for line in summary_text:
            if line.strip():
                story.append(Paragraph("• " + line.strip(), text_style))
                story.append(Spacer(1, 0.08 * inch))

        story.append(Spacer(1, 0.3 * inch))

        # === ACTION ITEMS ===
        if meeting_data.get('action_items'):
            story.append(Paragraph("📌 Action Items", section_heading))
            for item in meeting_data['action_items']:
                story.append(Paragraph(f"➡️ {item}", text_style))
                story.append(Spacer(1, 0.08 * inch))
            story.append(Spacer(1, 0.3 * inch))

        # === SPEAKERS SECTION ===
        story.append(Paragraph("🎙️ Speakers & Transcript", section_heading))
        for i, speaker_data in enumerate(meeting_data.get('speakers', [])[:15]):  # Limit first 15
            speaker = speaker_data.get('speaker', f"Speaker {i+1}")
            text = speaker_data.get('text', '')
            story.append(Paragraph(f"<b>{speaker}:</b> {text}", text_style))
            story.append(Spacer(1, 0.1 * inch))

        # === FOOTER ===
        def add_footer(canvas, doc):
            canvas.saveState()
            footer_text = f"Generated by Meeting.AI • {datetime.now().strftime('%Y-%m-%d %H:%M')}"
            canvas.setFont('Helvetica-Oblique', 9)
            canvas.setFillColor(colors.HexColor("#6B7280"))
            canvas.drawCentredString(letter[0] / 2, 0.5 * inch, footer_text)
            canvas.restoreState()

        # === BUILD PDF ===
        doc.build(story, onFirstPage=add_footer, onLaterPages=add_footer)
        print(f"✅ Stylish PDF generated successfully: {output_path}")

    except Exception as e:
        print(f"❌ Error generating PDF: {str(e)}")
        raise

async def send_to_slack(meeting_data: dict, pdf_path: str):  # pyright: ignore[reportUnusedParameter]
    """Send summary to Slack"""
    if not SLACK_WEBHOOK_URL:
        print("Slack webhook URL not configured")
        return
    
    try:
        message = {
            "text": f"📋 *New Meeting Summary*",
            "blocks": [
                {
                    "type": "header",
                    "text": {
                        "type": "plain_text",
                        "text": "📋 Meeting Summary Ready"
                    }
                },
                {
                    "type": "section",
                    "fields": [
                        {
                            "type": "mrkdwn",
                            "text": f"*Meeting ID:*\n{meeting_data['meeting_id']}"
                        },
                        {
                            "type": "mrkdwn",
                            "text": f"*Date:*\n{meeting_data['created_at']}"
                        }
                    ]
                },
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": f"*Summary Preview:*\n{meeting_data['summary'][:2000]}..."
                    }
                }
            ]
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.post(SLACK_WEBHOOK_URL, json=message)
            if response.status_code == 200:
                print("Successfully sent to Slack")
            else:
                print(f"Failed to send to Slack: {response.status_code}")
    except Exception as e:
        print(f"Error sending to Slack: {str(e)}")

# API Endpoints
@app.get("/")
async def root():
    return {
        "message": "AI Meeting Transcriber API",
        "version": "1.0.0",
        "endpoints": {
            "transcribe": "/api/transcribe",
            "question": "/api/question",
            "meetings": "/api/meetings",
            "download": "/api/download/{meeting_id}"
        }
    }

@app.post("/api/transcribe", response_model=TranscriptionResponse)
async def transcribe_meeting(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    meeting_title: Optional[str] = "Untitled Meeting"
):
    """Transcribe uploaded audio file"""
    meeting_id = str(uuid.uuid4())
    file_path = UPLOAD_DIR / f"{meeting_id}_{file.filename}"
    
    try:
        # Save uploaded file
        with open(file_path, "wb") as f:
            content = await file.read()
            f.write(content)
        
        # Transcribe audio
        transcript, speakers_data = await transcribe_audio(str(file_path), meeting_id)
        
        # Generate summary
        summary = await generate_summary(transcript, speakers_data)
        
        # Create meeting document
        meeting_data = {
            "meeting_id": meeting_id,
            "title": meeting_title,
            "transcript": transcript,
            "summary": summary,
            "speakers": speakers_data,
            "created_at": datetime.now().isoformat(),
            "file_name": file.filename,
            "duration": f"{len(speakers_data) * 5} seconds"  # Approximate
        }
        
        # Save to SQLite
        async with get_db() as db:
            await db.execute(
                """
                INSERT OR REPLACE INTO meetings (
                    meeting_id, title, transcript, summary, speakers_json,
                    created_at, file_name, duration
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    meeting_id,
                    meeting_title,
                    transcript,
                    summary,
                    json.dumps(speakers_data),
                    meeting_data["created_at"],
                    file.filename,
                    meeting_data["duration"],
                ),
            )
            await db.commit()
        
        # Generate PDF in background
        pdf_path = REPORTS_DIR / f"{meeting_id}_report.pdf"
        background_tasks.add_task(generate_pdf_report, meeting_data, str(pdf_path))
        background_tasks.add_task(send_to_slack, meeting_data, str(pdf_path))
        
        # Clean up audio file
        background_tasks.add_task(os.remove, str(file_path))
        
        return TranscriptionResponse(
            meeting_id=meeting_id,
            transcript=transcript,
            summary=summary,
            speakers=speakers_data,
            created_at=meeting_data["created_at"]
        )
    
    except Exception as e:
        # Clean up on error
        if file_path.exists():
            os.remove(file_path)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/question", response_model=QuestionResponse)
async def ask_question(request: QuestionRequest):
    """Ask a question about a meeting"""
    try:
        answer, context = await answer_question(request.meeting_id, request.question)
        return QuestionResponse(answer=answer, context=context)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/meetings")
async def list_meetings(limit: int = 10):
    """List recent meetings"""
    try:
        async with get_db() as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute(
                """
                SELECT meeting_id, title, created_at, summary
                FROM meetings
                ORDER BY datetime(created_at) DESC
                LIMIT ?
                """,
                (limit,),
            )
            rows = await cursor.fetchall()
            meetings = [dict(row) for row in rows]
            return {"meetings": meetings}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/meeting/{meeting_id}")
async def get_meeting(meeting_id: str):
    """Get meeting details"""
    try:
        async with get_db() as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute(
                """
                SELECT meeting_id, title, transcript, summary, speakers_json,
                       created_at, file_name, duration
                FROM meetings
                WHERE meeting_id = ?
                """,
                (meeting_id,),
            )
            row = await cursor.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Meeting not found")
            meeting = dict(row)
            meeting["speakers"] = json.loads(meeting.pop("speakers_json") or "[]")
            return meeting
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/download/{meeting_id}")
async def download_report(meeting_id: str):
    """Download PDF report"""
    pdf_path = REPORTS_DIR / f"{meeting_id}_report.pdf"
    
    if not pdf_path.exists():
        raise HTTPException(status_code=404, detail="Report not found")
    
    return FileResponse(
        path=str(pdf_path),
        filename=f"meeting_report_{meeting_id}.pdf",
        media_type="application/pdf"
    )

@app.delete("/api/meeting/{meeting_id}")
async def delete_meeting(meeting_id: str):
    """Delete a meeting"""
    try:
        async with get_db() as db:
            cursor = await db.execute(
                "DELETE FROM meetings WHERE meeting_id = ?",
                (meeting_id,),
            )
            await db.commit()
            if cursor.rowcount == 0:
                raise HTTPException(status_code=404, detail="Meeting not found")
        
        # Delete PDF if exists
        pdf_path = REPORTS_DIR / f"{meeting_id}_report.pdf"
        if pdf_path.exists():
            os.remove(pdf_path)
        
        return {"message": "Meeting deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

























































































































 




 