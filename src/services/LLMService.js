class LLMService {
  constructor() {
    this.provider = localStorage.getItem('twist_llm_provider') || 'gemini';
    this.apiKey = localStorage.getItem('twist_api_key') || '';
    this.modelName = localStorage.getItem('twist_model_name') || 'gemini-1.5-flash';
    this.endpointUrl = localStorage.getItem('twist_api_url') || '';
    this.sttUrl = localStorage.getItem('twist_stt_url') || '';
  }

  setCredentials(provider, apiKey, modelName, endpointUrl, sttUrl = '') {
    this.provider = provider;
    this.apiKey = apiKey;
    this.modelName = modelName;
    this.endpointUrl = endpointUrl;
    this.sttUrl = sttUrl;
    
    localStorage.setItem('twist_llm_provider', provider);
    localStorage.setItem('twist_api_key', apiKey);
    localStorage.setItem('twist_model_name', modelName);
    localStorage.setItem('twist_api_url', endpointUrl);
    localStorage.setItem('twist_stt_url', sttUrl);
  }

  isConfigured() {
    if (this.provider === 'local') return true; 
    return this.apiKey && this.apiKey.length > 5;
  }

  async getReaction(systemPrompt, transcriptChunk, base64Image = null, recentContext = "") {
    if (!this.isConfigured()) return null;

    let userPrompt = `Live transcript: "${transcriptChunk}"`;
    if (recentContext) {
       userPrompt = `Recent Swarm Context (what other personas just said):\n------\n${recentContext}\n------\n\n${userPrompt}`;
    }
    userPrompt += `\nReact to this as your persona if it warrants a comment. Keep it under 2 sentences. If it's too boring to comment on, just output the exact word "skip".`;

    try {
      if (this.provider === 'gemini') {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.modelName || 'gemini-1.5-flash'}:generateContent?key=${this.apiKey}`;
        
        const contentsParts = [{ text: userPrompt }];
        if (base64Image) {
           const base64Data = base64Image.split(',')[1]; // Remove data:image/jpeg;base64,
           contentsParts.push({
             inline_data: { mime_type: "image/jpeg", data: base64Data }
           });
        }

        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: { text: systemPrompt } },
            contents: [{ parts: contentsParts }],
            generationConfig: { temperature: 0.7, maxOutputTokens: 80 }
          })
        });
        const data = await response.json();
        if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
          return this.cleanResponse(data.candidates[0].content.parts[0].text);
        }
      } 
      else if (this.provider === 'local') {
        const url = this.endpointUrl || 'http://localhost:11434/api/chat';
        
        const messagePayload = { role: 'user', content: userPrompt };
        if (base64Image) {
           messagePayload.images = [base64Image.split(',')[1]];
        }

        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: this.modelName || 'llama3',
            messages: [
              { role: 'system', content: systemPrompt },
              messagePayload
            ],
            stream: false
          })
        });
        const data = await response.json();
        if (data.message && data.message.content) {
          return this.cleanResponse(data.message.content);
        }
      }
      else {
        // OpenAI / Grok
        const url = this.endpointUrl || 'https://api.x.ai/v1/chat/completions';
        
        let messageContent = userPrompt;
        if (base64Image) {
           messageContent = [
             { type: "text", text: userPrompt },
             { type: "image_url", image_url: { url: base64Image } }
           ];
        }

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`
          },
          body: JSON.stringify({
            model: this.modelName || 'grok-beta',
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: messageContent }
            ],
            temperature: 0.7,
            max_tokens: 80
          })
        });
        const data = await response.json();
        if (data.choices && data.choices.length > 0) {
          return this.cleanResponse(data.choices[0].message.content);
        }
      }
      return null;
    } catch (e) {
      console.error(`LLM Error (${this.provider}):`, e);
      return null;
    }
  }
  async transcribeAudio(audioBlob) {
     if (!this.isConfigured()) return "";
     
     try {
         if (this.provider === 'gemini') {
             const base64Audio = await new Promise((resolve) => {
                 const reader = new FileReader();
                 reader.readAsDataURL(audioBlob);
                 reader.onloadend = () => resolve(reader.result.split(',')[1] || "");
             });
             
             if (!base64Audio) return "";

             const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.modelName || 'gemini-1.5-flash'}:generateContent?key=${this.apiKey}`;
             const response = await fetch(url, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                      contents: [{
                          parts: [
                              { text: "Transcribe the spoken audio precisely. Only return the true transcript. If no words are spoken, return empty string." },
                              { inline_data: { mime_type: audioBlob.type || "audio/webm", data: base64Audio } }
                          ]
                      }],
                      generationConfig: { temperature: 0.1 }
                  })
             });
             
             if (!response.ok) {
                 const errText = await response.text();
                 window.dispatchEvent(new CustomEvent('twist_debug', { detail: `Gemini STT Error: ${response.status} ${errText}` }));
                 return "";
             }
             
             const data = await response.json();
             return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
         } else {
             // Use explicit STT URL or fallback to local/OpenAI defaults
             let baseUrl = this.sttUrl;
             if (!baseUrl) {
                 if (this.provider === 'local') {
                     baseUrl = 'http://localhost:8000/v1/audio/transcriptions';
                 } else {
                     baseUrl = this.endpointUrl ? this.endpointUrl.replace('/chat/completions', '/audio/transcriptions') : 'https://api.openai.com/v1/audio/transcriptions';
                 }
             }

             window.dispatchEvent(new CustomEvent('twist_debug', { detail: `STT Request: ${baseUrl}` }));

             const formData = new FormData();
             formData.append('file', audioBlob, 'audio.webm');
             formData.append('model', 'whisper-1');
             
             const headers = {};
             if (this.provider !== 'local') {
                 headers['Authorization'] = `Bearer ${this.apiKey}`;
             }

             const response = await fetch(baseUrl, {
                  method: 'POST',
                  headers: headers,
                  body: formData
             });
             
             if (!response.ok) {
                 const errText = await response.text();
                 window.dispatchEvent(new CustomEvent('twist_debug', { detail: `OpenAI STT Error: ${response.status} ${errText}` }));
                 return "";
             }
             
             const data = await response.json();
             return data.text?.trim() || "";
         }
     } catch(e) {
         window.dispatchEvent(new CustomEvent('twist_debug', { detail: `Transcription Catch Error: ${e.message}` }));
         console.error("Transcription Error:", e);
         return "";
     }
  }

  cleanResponse(text) {
    const cleanText = text.trim().replace(/^"|"$/g, '');
    if (cleanText.toLowerCase().includes('skip')) return null;
    return cleanText;
  }
}

export const llmService = new LLMService();
