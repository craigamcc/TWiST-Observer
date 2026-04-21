import { llmService } from './LLMService';

class AudioService {
  constructor() {
    this.mediaRecorder = null;
    this.isListening = false;
    this.onTranscriptChunk = null;
    this.onStateChange = null;
    
    // WebAudio contexts for flawless routing
    this.audioCtx = null;
    this.sourceNode = null;
    this.destNode = null;
  }

  // MUST BE CALLED SYNCHRONOUSLY IN CLICK HANDLER to bypass browser gesture block
  initContext() {
     if (!this.audioCtx) {
         this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
     }
     if (this.audioCtx.state === 'suspended') {
         this.audioCtx.resume();
     }
  }

  emitState(state) {
     if (this.onStateChange) this.onStateChange(state);
  }

  start(sourceElementOrStream, onTranscriptChunkCallback, onStateChangeCallback) {
    this.onTranscriptChunk = onTranscriptChunkCallback;
    this.onStateChange = onStateChangeCallback;
    this.isListening = false;
    
    if (!sourceElementOrStream) {
       window.dispatchEvent(new CustomEvent('twist_debug', { detail: 'AudioService Error: Null source provided' }));
       this.emitState('STOPPED');
       return;
    }

    try {
      this.initContext();

      if (!this.destNode) {
          this.destNode = this.audioCtx.createMediaStreamDestination();
      }
      
      let extractedStream = null;

      // Type 1: It's an HTMLVideoElement (Local VCR modes)
      if (sourceElementOrStream instanceof HTMLMediaElement) {
         if (!this.sourceNode) {
            // Can only create element source once per element
            this.sourceNode = this.audioCtx.createMediaElementSource(sourceElementOrStream);
         }
         // Connect to destination (so user hears it out loud)
         this.sourceNode.connect(this.audioCtx.destination);
         // Connect to our recorder intercept node
         this.sourceNode.connect(this.destNode);
         extractedStream = this.destNode.stream;
      } 
      // Type 2: It's a MediaStream (Live Tab Share)
      else if (sourceElementOrStream.getAudioTracks && sourceElementOrStream.getAudioTracks().length > 0) {
         const streamNode = this.audioCtx.createMediaStreamSource(sourceElementOrStream);
         // Connect directly to recorder (tab is already playing natively, no need to output to destination)
         streamNode.connect(this.destNode);
         extractedStream = this.destNode.stream;
      } else {
         window.dispatchEvent(new CustomEvent('twist_debug', { detail: 'AudioService Error: No audio tracks in source' }));
         return;
      }

      this.mediaRecorder = new MediaRecorder(extractedStream, { mimeType: 'audio/webm' });
      
      this.mediaRecorder.onstart = () => {
         this.isListening = true;
         this.emitState('LISTENING');
      };

      this.mediaRecorder.ondataavailable = async (e) => {
        if (e.data.size > 0 && this.isListening) {
           try {
              const transcript = await llmService.transcribeAudio(e.data);
              if (transcript && this.onTranscriptChunk) {
                 this.onTranscriptChunk(transcript.trim(), true);
              }
           } catch (err) {
              window.dispatchEvent(new CustomEvent('twist_debug', { detail: `Transcript fail: ${err.message}` }));
           }
        }
      };

      // Force chunks every 4 seconds
      this.mediaRecorder.start(4000);

    } catch (e) {
      window.dispatchEvent(new CustomEvent('twist_debug', { detail: `AudioService Init Fail: ${e.message}` }));
      this.emitState('STOPPED');
    }
  }

  stop() {
    this.isListening = false;
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try { this.mediaRecorder.stop(); } catch (e) { }
    }
    
    // Clean up nodes but keep audioCtx alive if needed
    if (this.sourceNode) {
       try { this.sourceNode.disconnect(); } catch(e){}
    }
    this.emitState('STOPPED');
  }
}

export const audioService = new AudioService();
