// ============================================
// BACKEND - Node.js Server (cuando se ejecuta con Node)
// ============================================

if (typeof window === 'undefined') {
    // Estamos en Node.js
    require('dotenv').config();
    const express = require('express');
    const cors = require('cors');
    const OpenAI = require('openai');
    const path = require('path');

    const app = express();
    const PORT = process.env.PORT || 3000;

    // Middleware
    app.use(cors());
    app.use(express.json());
    app.use(express.static(__dirname));

    // Configurar OpenAI
    const openai = new OpenAI({
        apiKey: process.env.ORTO
    });

    // Endpoint para corrección de texto
    app.post('/api/check', async (req, res) => {
        try {
            const { text } = req.body;
            
            if (!text) {
                return res.status(400).json({ error: 'El texto es requerido' });
            }
            
            const completion = await openai.chat.completions.create({
                model: "gpt-4",
                messages: [
                    {
                        role: "system",
                        content: `Eres un corrector ortográfico y gramatical experto en español. 
                        Tu tarea es:
                        1. Corregir errores ortográficos, gramaticales, de puntuación y acentuación
                        2. Mejorar el estilo cuando sea necesario
                        3. Proporcionar el texto corregido
                        4. Listar todas las correcciones realizadas
                        
                        Responde SIEMPRE en formato JSON con esta estructura exacta:
                        {
                            "correctedText": "texto corregido completo",
                            "corrections": [
                                {
                                    "original": "palabra/frase original",
                                    "corrected": "palabra/frase corregida",
                                    "type": "spelling|grammar|punctuation|accent|style",
                                    "explanation": "breve explicación de la corrección"
                                }
                            ]
                        }
                        
                        Si no hay errores, devuelve el texto original y un array vacío de correcciones.`
                    },
                    {
                        role: "user",
                        content: text
                    }
                ],
                temperature: 0.3,
                response_format: { type: "json_object" }
            });
            
            const result = JSON.parse(completion.choices[0].message.content);
            
            // Agregar estadísticas
            const words = text.trim().split(/\s+/).length;
            const chars = text.length;
            
            result.stats = {
                words,
                chars,
                corrections: result.corrections.length
            };
            
            res.json(result);
            
        } catch (error) {
            console.error('Error:', error);
            res.status(500).json({ 
                error: 'Error al procesar el texto',
                message: error.message 
            });
        }
    });

    // Health check
    app.get('/api/health', (req, res) => {
        res.json({ status: 'ok' });
    });

    // Servir index.html
    app.get('/', (req, res) => {
        res.sendFile(path.join(__dirname, 'index.html'));
    });

    app.listen(PORT, () => {
        console.log(`🚀 Orto corriendo en http://localhost:${PORT}`);
    });
}

// ============================================
// FRONTEND - Browser JavaScript
// ============================================

if (typeof window !== 'undefined') {
    // Estamos en el navegador
    const API_URL = '/api/check';

    class OrtoApp {
        constructor() {
            this.inputText = document.getElementById('inputText');
            this.outputText = document.getElementById('outputText');
            this.outputSection = document.getElementById('outputSection');
            this.suggestionsContainer = document.getElementById('suggestionsContainer');
            this.checkBtn = document.getElementById('checkBtn');
            this.clearBtn = document.getElementById('clearBtn');
            this.copyBtn = document.getElementById('copyBtn');
            this.statsDiv = document.getElementById('stats');
            this.wordCount = document.getElementById('wordCount');
            this.charCount = document.getElementById('charCount');
            this.correctionCount = document.getElementById('correctionCount');
            
            this.initEventListeners();
        }
        
        initEventListeners() {
            this.checkBtn.addEventListener('click', () => this.checkText());
            this.clearBtn.addEventListener('click', () => this.clearText());
            this.copyBtn.addEventListener('click', () => this.copyText());
            this.inputText.addEventListener('input', () => this.updateStats());
            
            // Enter con Ctrl/Cmd para enviar
            this.inputText.addEventListener('keydown', (e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                    this.checkText();
                }
            });
        }
        
        async checkText() {
            const text = this.inputText.value.trim();
            
            if (!text) {
                alert('Por favor, escribe algo para corregir.');
                return;
            }
            
            this.setLoading(true);
            
            try {
                const response = await fetch(API_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ text })
                });
                
                if (!response.ok) {
                    throw new Error('Error al procesar el texto');
                }
                
                const data = await response.json();
                this.displayResults(data);
                
            } catch (error) {
                console.error('Error:', error);
                alert('Hubo un error al corregir el texto. Por favor, intenta de nuevo.');
            } finally {
                this.setLoading(false);
            }
        }
        
        displayResults(data) {
            const { correctedText, corrections, stats } = data;
            
            this.outputText.textContent = correctedText;
            this.outputSection.style.display = 'block';
            this.statsDiv.style.display = 'flex';
            
            // Actualizar estadísticas
            this.correctionCount.textContent = corrections.length;
            
            // Mostrar sugerencias
            this.displaySuggestions(corrections);
        }
        
        displaySuggestions(corrections) {
            this.suggestionsContainer.innerHTML = '';
            
            if (corrections.length === 0) {
                this.suggestionsContainer.innerHTML = `
                    <div class="suggestion-item" style="border-left-color: var(--success);">
                        <p style="color: var(--success); font-weight: 500;">
                            ✓ No se encontraron errores. ¡Tu texto está perfecto!
                        </p>
                    </div>
                `;
                return;
            }
            
            corrections.forEach(correction => {
                const item = document.createElement('div');
                item.className = 'suggestion-item';
                item.innerHTML = `
                    <div class="suggestion-header">
                        <span class="suggestion-type">${this.getCorrectionType(correction.type)}</span>
                    </div>
                    <div>
                        <span class="suggestion-original">${this.escapeHtml(correction.original)}</span>
                        <span class="suggestion-arrow">→</span>
                        <span class="suggestion-corrected">${this.escapeHtml(correction.corrected)}</span>
                    </div>
                    ${correction.explanation ? `<p class="suggestion-explanation">${this.escapeHtml(correction.explanation)}</p>` : ''}
                `;
                this.suggestionsContainer.appendChild(item);
            });
        }
        
        getCorrectionType(type) {
            const types = {
                'spelling': 'Ortografía',
                'grammar': 'Gramática',
                'punctuation': 'Puntuación',
                'style': 'Estilo',
                'accent': 'Acentuación'
            };
            return types[type] || 'Corrección';
        }
        
        escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
        
        updateStats() {
            const text = this.inputText.value;
            const words = text.trim().split(/\s+/).filter(w => w.length > 0).length;
            const chars = text.length;
            
            this.wordCount.textContent = words;
            this.charCount.textContent = chars;
        }
        
        clearText() {
            this.inputText.value = '';
            this.outputText.textContent = '';
            this.outputSection.style.display = 'none';
            this.statsDiv.style.display = 'none';
            this.suggestionsContainer.innerHTML = '';
            this.updateStats();
        }
        
        async copyText() {
            const text = this.outputText.textContent;
            
            try {
                await navigator.clipboard.writeText(text);
                const originalText = this.copyBtn.innerHTML;
                this.copyBtn.innerHTML = '<span style="color: var(--success);">✓ Copiado</span>';
                setTimeout(() => {
                    this.copyBtn.innerHTML = originalText;
                }, 2000);
            } catch (error) {
                alert('Error al copiar el texto');
            }
        }
        
        setLoading(isLoading) {
            this.checkBtn.disabled = isLoading;
            const btnText = this.checkBtn.querySelector('.btn-text');
            const btnLoader = this.checkBtn.querySelector('.btn-loader');
            
            if (isLoading) {
                btnText.style.display = 'none';
                btnLoader.style.display = 'block';
            } else {
                btnText.style.display = 'block';
                btnLoader.style.display = 'none';
            }
        }
    }

    // Inicializar la aplicación
    document.addEventListener('DOMContentLoaded', () => {
        new OrtoApp();
    });
}
