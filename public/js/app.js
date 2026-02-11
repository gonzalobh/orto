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
                    <span class="suggestion-original">${correction.original}</span>
                    <span class="suggestion-arrow">→</span>
                    <span class="suggestion-corrected">${correction.corrected}</span>
                </div>
                ${correction.explanation ? `<p class="suggestion-explanation">${correction.explanation}</p>` : ''}
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
