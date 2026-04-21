import { useState, useEffect, useRef } from 'react';
import { Square, Settings, MonitorUp, Layout, FileVideo, Upload } from 'lucide-react';
import { TWIST_PERSONAS } from './services/personas';
import { twistOrchestrator } from './services/orchestrator';
import { audioService } from './services/AudioService';
import { llmService } from './services/LLMService';
import SineWave from './components/SineWave';

function App() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isEnhancedView, setIsEnhancedView] = useState(true);
  const [transcript, setTranscript] = useState([]);
  const [artifacts, setArtifacts] = useState([]);
  const [thinkingAgents, setThinkingAgents] = useState(new Set());
  const [debugMsg, setDebugMsg] = useState('');
  
  // Storage for video mode
  const [videoMode, setVideoMode] = useState(null); // 'stream', 'demo', or 'local'
  
  // Settings State
  const [showSettings, setShowSettings] = useState(false);
  const [apiProvider, setApiProvider] = useState(llmService.provider || 'gemini');
  const [apiKey, setApiKey] = useState(llmService.apiKey || '');
  const [apiUrl, setApiUrl] = useState(llmService.endpointUrl || '');
  const [apiModel, setApiModel] = useState(llmService.modelName || 'gemini-1.5-flash');
  const [sttUrl, setSttUrl] = useState(llmService.sttUrl || '');

  const endOfFeedRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  
  const handleSaveSettings = () => {
    llmService.setCredentials(apiProvider, apiKey, apiModel, apiUrl, sttUrl);
    setShowSettings(false);
  };

  useEffect(() => {
    const unsubArtifact = twistOrchestrator.subscribe((event) => {
      if (event.type === 'agent_thinking') {
        setThinkingAgents(prev => new Set(prev).add(event.agentId));
      } else if (event.type === 'agent_quiet') {
        setThinkingAgents(prev => {
          const next = new Set(prev);
          next.delete(event.agentId);
          return next;
        });
      } else if (event.type === 'artifact_generated') {
        setThinkingAgents(prev => {
          const next = new Set(prev);
          next.delete(event.agentId);
          return next;
        });
        setArtifacts(prev => [...prev, event.payload]);
        setTimeout(() => endOfFeedRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      }
    });

    const handleDebug = (e) => {
        setDebugMsg(e.detail);
        setTimeout(() => setDebugMsg(''), 10000); // clear after 10s
    };
    window.addEventListener('twist_debug', handleDebug);

    return () => {
       unsubArtifact();
       window.removeEventListener('twist_debug', handleDebug);
    };
  }, []);

  const stopAll = () => {
     audioService.stop();
     if (videoRef.current) {
        videoRef.current.pause();
        if (videoRef.current.srcObject) {
           videoRef.current.srcObject.getTracks().forEach(track => track.stop());
        }
        videoRef.current.srcObject = null;
        videoRef.current.src = "";
     }
     setIsPlaying(false);
     setVideoMode(null);
  };

  const startAnalysisLoop = (audioStream) => {
    setTranscript([]);
    setArtifacts([]);
    setIsPlaying(true);
    
    const onTranscriptChunk = (chunk, isFinal) => {
      if (isFinal && chunk) {
        setTranscript(prev => [...prev.slice(-4), chunk]); 
        
        let base64Image = null;
        if (videoRef.current && canvasRef.current) {
            const video = videoRef.current;
            const canvas = canvasRef.current;
            if (video.videoWidth > 0) {
                canvas.width = 640;
                canvas.height = (video.videoHeight / video.videoWidth) * 640;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                base64Image = canvas.toDataURL('image/jpeg', 0.6); 
            }
        }
        twistOrchestrator.analyzeChunk(chunk, false, base64Image); 
      }
    };

    const onStateChange = (state) => {
      if (state === 'LISTENING') setIsPlaying(true);
    };

    if (audioStream) {
      audioService.start(audioStream, onTranscriptChunk, onStateChange);
    } else {
      console.warn("No audio stream available for transcription.");
    }
  };

  const handleStartScreenShare = async () => {
      audioService.initContext(); // MUST be synchronous to user click
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        if (videoRef.current) {
           videoRef.current.srcObject = stream;
           videoRef.current.muted = true; // explicitly mute to prevent echo
           
           try { await videoRef.current.play(); } catch (err) { console.error(err); }
        }
        stream.getVideoTracks()[0].onended = stopAll;
        
        setVideoMode('stream');
        startAnalysisLoop(stream);
      } catch (e) {
         console.warn("Screen share cancelled", e);
      }
  };

  const handleStartDemo = async () => {
      audioService.initContext(); // MUST be synchronous to user click
      if (videoRef.current) {
         videoRef.current.src = "/demo.mp4";
         videoRef.current.muted = false; // ensure sound plays for local files
         
         videoRef.current.onplaying = () => {
             videoRef.current.onplaying = null; // Unbind
             setVideoMode('demo');
             startAnalysisLoop(videoRef.current);
         };
         try { await videoRef.current.play(); } catch (err) { console.error(err); }
      }
  };

  const handleFileUpload = async (e) => {
      audioService.initContext(); // MUST be synchronous to user action
      const file = e.target.files[0];
      if (file && videoRef.current) {
         videoRef.current.src = URL.createObjectURL(file);
         videoRef.current.muted = false; // ensure sound plays for local files
         
         videoRef.current.onplaying = () => {
             videoRef.current.onplaying = null; // Unbind
             setVideoMode('local');
             startAnalysisLoop(videoRef.current);
         };
         try { await videoRef.current.play(); } catch (err) { console.error(err); }
      }
  };

  return (
    <>
      <header className="header">
        {debugMsg && (
            <div style={{ position: 'fixed', top: 10, left: '50%', transform: 'translateX(-50%)', background: '#ef4444', color: 'white', padding: '1rem', borderRadius: '8px', zIndex: 9999, fontWeight: 'bold', maxWidth: '80%' }}>
                {debugMsg}
            </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem'}}>
           <h1>TWiST Observer</h1>
           <button className="icon-btn" onClick={() => setIsEnhancedView(!isEnhancedView)} title="Toggle Layout">
             <Layout size={20} />
             {isEnhancedView ? 'Enhanced' : 'Clean'}
           </button>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem'}}>
          <div className="status-badge">
            <div className="status-indicator" style={{ background: isPlaying ? '#34d399' : '#f87171' }} />
            {isPlaying ? 'System Active' : 'Offline'}
          </div>
          <button className="icon-btn" onClick={() => setShowSettings(true)}>
            <Settings size={20} />
          </button>
        </div>
      </header>

      {showSettings && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2>LLM Settings</h2>
            <p style={{ color: '#94a3b8', marginBottom: '1rem', fontSize: '0.9rem' }}>Configure your preferred AI Provider.</p>
            
            <label>Provider</label>
            <select 
               value={apiProvider} 
               onChange={e => {
                 setApiProvider(e.target.value);
                 if (e.target.value === 'gemini') { setApiModel('gemini-1.5-flash'); setApiUrl(''); }
                 if (e.target.value === 'local') { setApiModel('llama3'); setApiUrl('http://localhost:11434/api/chat'); setApiKey(''); }
                 if (e.target.value === 'openai') { setApiModel('grok-beta'); setApiUrl('https://api.x.ai/v1/chat/completions'); }
               }}
               style={{ width: '100%', padding: '0.75rem', marginBottom: '1rem', background: 'rgba(255,255,255,0.05)', color: 'white', border: '1px solid var(--border-color)', borderRadius: '6px'}}
            >
              <option value="gemini">Google Gemini (Default)</option>
              <option value="local">Ollama (Local Models)</option>
              <option value="openai">Grok / OpenAI Compatible</option>
            </select>

            {apiProvider !== 'local' && (
              <>
                <label>API Key</label>
                <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="Enter API Key here..." />
              </>
            )}
            
            {(apiProvider === 'local' || apiProvider === 'openai') && (
              <>
                <label>Endpoint URL</label>
                <input type="text" value={apiUrl} onChange={e => setApiUrl(e.target.value)} placeholder="URL..." />
              </>
            )}
            
            <label>Model Name</label>
            <input type="text" value={apiModel} onChange={e => setApiModel(e.target.value)} placeholder="e.g. gemini-1.5-flash or llama3" />

            {apiProvider === 'local' && (
              <>
                <label>Local STT Endpoint (Whisper)</label>
                <input type="text" value={sttUrl} onChange={e => setSttUrl(e.target.value)} placeholder="http://localhost:8080/v1/audio/transcriptions" />
                <p style={{ color: '#64748b', fontSize: '0.8rem', marginTop: '0.2rem' }}>Required for Local Mode if not using Gemini.</p>
              </>
            )}
            
            <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem' }}>
               <button 
                  onClick={() => {
                    setApiProvider('local');
                    setApiModel('qwen-3.5-7b');
                    setApiUrl('http://localhost:11434/api/chat');
                    setSttUrl('http://localhost:8080/v1/audio/transcriptions');
                    setApiKey('');
                  }}
                  style={{ flex: 1, padding: '0.5rem', fontSize: '0.8rem', background: 'rgba(255,255,255,0.05)', border: '1px dashed #64748b' }}
               >
                 Preset: Ollama + Whisper
               </button>
            </div>
            
            <div className="modal-actions">
              <button onClick={() => setShowSettings(false)}>Cancel</button>
              <button className="primary" onClick={handleSaveSettings}>Save</button>
            </div>
          </div>
        </div>
      )}

      <div className={`layout ${isEnhancedView ? 'enhanced' : 'clean'}`}>
        {/* Left Pane: Stream */}
        <div className="stream-pane">
          <div className="video-placeholder" style={{ background: isPlaying ? '#000' : '' }}>
            <video 
               ref={videoRef} 
               autoPlay 
               muted={videoMode === 'stream'}
               controls={videoMode === 'demo' || videoMode === 'local'}
               style={{ width: '100%', height: '100%', objectFit: 'contain', display: isPlaying ? 'block' : 'none' }} 
               crossOrigin="anonymous"
            />
            <canvas ref={canvasRef} style={{ display: 'none' }} />

            {!isPlaying && (
              <div className="video-overlay" style={{ display: 'flex', gap: '2rem' }}>
                
                <div style={{ textAlign: 'center' }}>
                  <button className="play-button" onClick={handleStartScreenShare}>
                    <MonitorUp size={32} />
                  </button>
                  <div style={{ marginTop: '1rem', color: '#fff', opacity: 0.8 }}>Live Share Tab</div>
                </div>

                <div style={{ textAlign: 'center' }}>
                  <button className="play-button" onClick={handleStartDemo} style={{ background: '#f59e0b', boxShadow: '0 0 20px rgba(245, 158, 11, 0.4)' }}>
                    <FileVideo size={32} />
                  </button>
                  <div style={{ marginTop: '1rem', color: '#fff', opacity: 0.8 }}>Load Demo File</div>
                </div>

                <div style={{ textAlign: 'center' }}>
                  <input type="file" accept="video/*" ref={fileInputRef} onChange={handleFileUpload} style={{ display: 'none' }} />
                  <button className="play-button" onClick={() => fileInputRef.current?.click()} style={{ background: '#8b5cf6', boxShadow: '0 0 20px rgba(139, 92, 246, 0.4)' }}>
                    <Upload size={32} />
                  </button>
                  <div style={{ marginTop: '1rem', color: '#fff', opacity: 0.8 }}>Upload VCR Mode</div>
                </div>

              </div>
            )}
            
            {isPlaying && (
               <button 
                  onClick={stopAll}
                  style={{ position: 'absolute', top: 10, right: 10, background: 'rgba(0,0,0,0.5)', border: 'none', borderRadius: '8px', padding: '0.5rem', color: '#ff4444', cursor: 'pointer', zIndex: 10 }}
               >
                 Stop
               </button>
            )}
          </div>

          {isEnhancedView && (
            <div className="transcript-box">
              <div className="transcript-header">
                <span>Live Transcription (Digital Audio)</span>
              </div>
              <div className="transcript-content">
                {transcript.map((text, i) => (
                  <p key={i} style={{ opacity: i === transcript.length - 1 ? 1 : 0.5, margin: '0.5rem 0' }}>
                    {text}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Pane: Swarm */}
        {isEnhancedView && (
          <div className="sidebar">
            <div className="sidebar-header">
              <h3>Intelligence Swarm</h3>
              <div className="personas-status">
                {TWIST_PERSONAS.map(p => {
                  const isActive = thinkingAgents.has(p.id);
                  return (
                    <div className="persona-container" key={p.id}>
                      <div 
                        className={`persona-avatar ${isActive ? 'thinking' : ''}`}
                        style={{ border: `2px solid ${p.color}`, backgroundImage: `url(${p.avatar})` }}
                        title={p.name}
                      />
                      <div className="sine-container">
                        <SineWave active={isActive} color={p.color} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="feed-container">
              {artifacts.length === 0 && (
                 <div style={{ textAlign: 'center', color: '#64748b', marginTop: '2rem' }}>
                   Observer is analyzing the stream...
                 </div>
              )}
              
              {artifacts.map(art => {
                const p = TWIST_PERSONAS.find(x => x.id === art.personaId);
                return (
                  <div key={art.id} className="artifact-card" style={{ borderLeftColor: p?.color || '#3b82f6' }}>
                    <div className="artifact-header" style={{ color: p?.color }}>
                      <img src={p?.avatar} className="small-avatar" alt={p?.name} />
                      <span className="artifact-name">{p?.name}</span>
                      <span className="artifact-title">{art.title}</span>
                    </div>
                    <div className="artifact-content">
                      {art.content}
                    </div>
                  </div>
                );
              })}
              <div ref={endOfFeedRef} />
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default App;
