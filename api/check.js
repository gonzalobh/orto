const OpenAI = require('openai');

const openai = new OpenAI({
    apiKey: process.env.ORTO
});

module.exports = async (req, res) => {
    // Configurar CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Manejar preflight request
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

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
        
        res.status(200).json(result);
        
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ 
            error: 'Error al procesar el texto',
            message: error.message 
        });
    }
};
