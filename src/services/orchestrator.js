import { TWIST_PERSONAS, generateMockPersonaReaction } from './personas';
import { llmService } from './LLMService';

class TwistOrchestrator {
  constructor() {
    this.listeners = [];
    this.isProcessing = false;
    this.lastRunTimes = {}; // Persona ID -> Timestamp
    this.swarmMemory = []; // Stores recent artifacts for context
  }

  subscribe(listener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  emit(event) {
    this.listeners.forEach(l => l(event));
  }

  async analyzeChunk(transcriptChunk, isSimulation = false, base64Image = null) {
    if (this.isProcessing || transcriptChunk.length < 10) return;
    this.isProcessing = true;
    this.emit({ type: 'state_updated', message: 'Analyzing live segment...' });

    try {
      const now = Date.now();
      const recentContextString = this.swarmMemory.map(m => `${m.personaName}: "${m.content}"`).join('\n');
      
      const executionPromises = TWIST_PERSONAS.map(async (persona) => {
        // Cooldown mechanism (e.g. 5 seconds per persona to avoid spam)
        const lastRun = this.lastRunTimes[persona.id] || 0;
        if (now - lastRun < 8000 && !isSimulation) {
           return { persona, artifact: null }; 
        }

        const thinkingDelay = isSimulation ? 800 + Math.random() * 2000 : 0;
        this.emit({ type: 'agent_thinking', agentId: persona.id, message: `Analyzing...` });
        
        if (thinkingDelay > 0) await new Promise(r => setTimeout(r, thinkingDelay));

        let reactionText = null;
        
        if (llmService.isConfigured() && !isSimulation) {
           reactionText = await llmService.getReaction(persona.prompt, transcriptChunk, base64Image, recentContextString);
        } else {
           // Fallback to mock
           const mock = generateMockPersonaReaction(persona.id, transcriptChunk);
           reactionText = mock ? mock.content : null;
        }

        if (reactionText) {
           this.lastRunTimes[persona.id] = Date.now();
        }

        return { 
          persona, 
          artifact: reactionText ? { title: persona.role, content: reactionText } : null 
        };
      });

      const results = await Promise.all(executionPromises);

      for (const { persona, artifact } of results) {
        if (artifact) {
          const finalArtifact = {
            ...artifact,
            id: `art_${Date.now()}_${Math.random().toString(36).substring(7)}`,
            personaId: persona.id,
            personaName: persona.name,
            timestamp: Date.now()
          };
          
          this.swarmMemory.push({ personaName: persona.name, content: finalArtifact.content });
          if (this.swarmMemory.length > 8) this.swarmMemory.shift(); // Keep last 8 interactions for deeper persona arguments

          this.emit({ type: 'artifact_generated', agentId: persona.id, payload: finalArtifact });
        } else {
           this.emit({ type: 'agent_quiet', agentId: persona.id });
        }
      }
    } catch (error) {
       console.error("TwistOrchestrator Pipeline Error:", error);
       this.emit({ type: 'error', message: 'Pipeline failure.' });
    } finally {
       this.isProcessing = false;
       this.emit({ type: 'state_updated', message: 'Listening...' });
    }
  }
}

export const twistOrchestrator = new TwistOrchestrator();
