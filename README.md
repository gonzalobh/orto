# Orto - Corrector Ortográfico con IA

Corrector ortográfico minimalista en español con inteligencia artificial.

## 🚀 Deploy en Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/tu-usuario/orto)

## 📋 Configuración

1. Haz fork de este repositorio
2. Conecta tu cuenta de GitHub con Vercel
3. Importa el proyecto en Vercel
4. **IMPORTANTE:** Añade la variable de entorno en Vercel:
   - Variable: `ORTO`
   - Value: Tu API key de OpenAI (ej: `sk-...`)
5. Deploy automático

## 🔑 Variable de Entorno Requerida

En Vercel → Settings → Environment Variables:

```
ORTO = sk-tu-api-key-de-openai
```

## 📁 Estructura del Proyecto

```
orto/
├── api/
│   └── check.js       # Serverless function para OpenAI
├── index.html         # Frontend completo
├── package.json       # Dependencias
└── vercel.json        # Configuración de Vercel
```

## 🛠️ Tecnologías

- **Frontend**: HTML, CSS, JavaScript vanilla
- **Backend**: Vercel Serverless Functions
- **IA**: OpenAI GPT-4

## 💡 Características

- ✨ Corrección ortográfica y gramatical
- 🎯 Detección de errores de acentuación
- 📝 Sugerencias con explicaciones
- 🎨 Diseño minimalista (blanco, gris, negro)
- 📊 Estadísticas en tiempo real
- 📋 Copiar texto corregido
- ⌨️ Atajo: Ctrl/Cmd + Enter

## 📝 Licencia

MIT
