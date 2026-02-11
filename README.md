# Orto - Corrector Ortográfico Inteligente

Corrector ortográfico minimalista con IA para español, similar a QuillBot.

## Características

- ✨ Corrección ortográfica y gramatical con IA
- 🎯 Detección de errores de acentuación
- 📝 Sugerencias de estilo
- 🔄 Interfaz minimalista en blanco, gris y negro
- 📊 Estadísticas de texto en tiempo real
- 📋 Copiar texto corregido con un clic

## Instalación

1. Descomprime el archivo ZIP

2. Instala las dependencias:
```bash
npm install
```

3. Configura tu API key de OpenAI:
   - Copia el archivo `.env.example` a `.env`
   - Añade tu API key de OpenAI en la variable `ORTO`

```env
ORTO=sk-tu-api-key-aqui
PORT=3000
```

4. Inicia el servidor:
```bash
npm start
```

5. Abre tu navegador en `http://localhost:3000`

## Uso

1. Escribe o pega tu texto en el área de entrada
2. Haz clic en "Corregir texto" o presiona **Ctrl/Cmd + Enter**
3. Revisa las correcciones sugeridas con explicaciones
4. Copia el texto corregido con un clic

## Tecnologías

- **Frontend**: HTML, CSS, JavaScript vanilla
- **Backend**: Node.js, Express
- **IA**: OpenAI GPT-4
- **Diseño**: Minimalista (blanco, gris, negro)

## Variables de Entorno

- `ORTO`: API key de OpenAI (obligatorio)
- `PORT`: Puerto del servidor (default: 3000)

## Desarrollo

Para desarrollo con auto-reload:

```bash
npm run dev
```

## Estructura del Proyecto

```
orto/
├── public/
│   ├── css/
│   │   └── style.css
│   ├── js/
│   │   └── app.js
│   └── index.html
├── server.js
├── package.json
├── .env.example
├── .gitignore
└── README.md
```

## Deployment en Vercel

1. Sube el proyecto a GitHub
2. Conecta tu repositorio en Vercel
3. Añade la variable de entorno `ORTO` en Vercel
4. Deploy automático

## Licencia

MIT
