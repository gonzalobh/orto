// ============================================================
// email.js — Pipeline de 3 agentes
// Agente 1: Redactor   → genera el email con tono específico
// Agente 2: Localizador → adapta al país
// Agente 3: Validador  → verifica tu/usted y coherencia regional
// Las versiones se generan en PARALELO (Promise.all)
// ============================================================

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

async function callOpenAI({ model = "gpt-4o", temperature = 0.3, systemPrompt, userPrompt, jsonMode = false }) {
  const body = {
    model,
    temperature,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  };

  if (jsonMode) {
    body.response_format = { type: "json_object" };
  }

  const response = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.ORTO}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return data?.choices?.[0]?.message?.content?.trim() ?? "";
}

// ─────────────────────────────────────────────
// DEFINICIÓN DE TONOS
// Cada tono fuerza cambios estructurales concretos:
// asunto, apertura, verbos, cierre, longitud.
// ─────────────────────────────────────────────
const TONE_SPECS = {

  neutro: {
    temperature: 0.3,
    prompt: `
TONO: NEUTRO — informativo y profesional, sin carga emocional.

ASUNTO: Descriptivo y neutral. Ej: "Actualización sobre su pedido", "Estado de su solicitud"
APERTURA: Ir directo al hecho. Ej: "Le escribimos para informarle que..."
CUERPO: Exponer los hechos en orden. Sin disculpas, sin urgencia, sin drama.
VERBOS: "informar", "comunicar", "notificar", "indicar"
CIERRE: Neutro y disponible. Ej: "Quedamos a su disposición para cualquier consulta."
DESPEDIDA: "Atentamente," / "Saludos,"

PROHIBIDO en este tono:
- Disculpas ("lamentamos", "lo sentimos", "pedimos disculpas")
- Urgencia ("urgente", "inmediatamente", "a la brevedad")
- Frases emocionales ("entendemos su frustración", "valoramos su paciencia")
- Compromisos concretos de fechas

LONGITUD: Concisa. Solo los hechos necesarios.
`
  },

  cordial: {
    temperature: 0.5,
    prompt: `
TONO: CORDIAL — empático, cálido, orientado a preservar la relación.

ASUNTO: Empático y personal. Ej: "Una actualización importante sobre su pedido", "Queremos mantenerle informado"
APERTURA: Empezar reconociendo al cliente. Ej: "Antes que nada, queremos agradecerle su paciencia..." / "Nos ponemos en contacto con usted para compartirle una actualización importante..."
CUERPO:
  1. Reconocer el inconveniente con empatía genuina
  2. Explicar la situación con honestidad
  3. Mostrar que se está trabajando en ello
  4. Ofrecer alternativas o compensación si aplica
VERBOS: "lamentamos", "entendemos", "valoramos", "agradecemos", "acompañamos"
CIERRE: Cálido y comprometido. Ej: "Estamos aquí para lo que necesite. Su satisfacción es nuestra prioridad."
DESPEDIDA: "Con un cordial saludo," / "Afectuosamente,"

PROHIBIDO en este tono:
- Lenguaje frío o técnico ("le notificamos", "comunicamos")
- Frases genéricas sin emoción ("quedamos a su disposición")
- Urgencia o presión

LONGITUD: Moderada. Suficiente para que el cliente sienta que hay una persona real detrás.
`
  },

  firme: {
    temperature: 0.3,
    prompt: `
TONO: FIRME — directo, claro, orientado a la acción. Sin rodeos ni excusas.

ASUNTO: Directo y orientado a acción. Ej: "Retraso en su pedido: próximos pasos", "Acción requerida: pedido pendiente"
APERTURA: Ir al punto sin introducción. La primera frase debe contener el mensaje principal.
  Ej: "Su pedido lleva dos semanas de retraso y a la fecha no contamos con una fecha de entrega confirmada."
CUERPO:
  1. El problema claramente enunciado (sin eufemismos)
  2. Lo que se está haciendo al respecto
  3. Qué necesita saber o hacer el cliente
VERBOS: "necesitamos", "requerimos", "confirmamos", "actuamos", "esperamos"
CIERRE: Concreto con próximo paso. Ej: "Le contactaremos en cuanto tengamos una fecha confirmada. Si tiene preguntas urgentes, puede escribirnos directamente."
DESPEDIDA: "Saludos," / sin despedida elaborada

PROHIBIDO en este tono:
- Disculpas excesivas o vagas ("lamentamos los inconvenientes")
- Frases de relleno ("quedamos atentos a cualquier consulta")
- Lenguaje pasivo ("podría ser que", "es posible que")
- Suavizadores innecesarios

LONGITUD: Breve y densa. Cada frase debe tener un propósito.
`
  },

  urgente: {
    temperature: 0.4,
    prompt: `
TONO: URGENTE — comunica prioridad e inmediatez. El receptor debe sentir que esto requiere atención ahora.

ASUNTO: Debe incluir "Urgente" o indicador de prioridad. Ej: "URGENTE: Actualización sobre su pedido", "Acción inmediata requerida — pedido #[X]"
APERTURA: La primera frase debe establecer la urgencia y el problema simultáneamente.
  Ej: "Le contactamos de manera urgente en relación con su pedido, que acumula dos semanas de retraso sin fecha de entrega confirmada."
CUERPO:
  1. El problema con su gravedad (2 semanas es mucho — nombrarlo directamente)
  2. La acción inmediata que se está tomando
  3. Lo que el cliente debe hacer o esperar en las próximas horas/días
  4. Un plazo concreto aunque sea aproximado
VERBOS: "actuamos", "escalamos", "priorizamos", "contactamos ahora", "resolveremos antes de"
CIERRE: Con compromiso de tiempo concreto. Ej: "Le daremos una actualización antes del [día/fecha]. Si no recibe noticias, contáctenos directamente a [canal]."
DESPEDIDA: Sin adornos. "Saludos," o nada.

PROHIBIDO en este tono:
- Frases pasivas o genéricas ("quedamos atentos")
- Suavizadores ("podría ser posible", "quizás")
- Apertura de cortesía larga antes del problema
- Disculpas que diluyan la urgencia

LONGITUD: Moderada. Suficiente para transmitir acción, no tan larga que diluya la urgencia.
`
  }
};

// ─────────────────────────────────────────────
// AGENTE 1: Redactor
// ─────────────────────────────────────────────
async function agentRedactor({ mode, instruction, originalEmail, senderName, clientName, senderRole, recipientRole, formalityPreference, tone, persona }) {

  const PERSONAS = {
    directa: "Enfoque ejecutivo: ve directo al punto, sin introducciones largas.",
    empatica: "Enfoque relacional: muestra comprensión antes de presentar el problema o solicitud.",
    formal: "Enfoque estructurado: organiza el email con claridad, párrafo por párrafo.",
  };

  const toneSpec = TONE_SPECS[tone] || TONE_SPECS.neutro;

  const systemPrompt = `
Eres un redactor experto de emails profesionales en español.
${PERSONAS[persona] || PERSONAS.directa}

════════════════════════════════════════
INSTRUCCIONES DE TONO — OBLIGATORIO CUMPLIR
El tono determina TODO: el asunto, la apertura, los verbos, el cierre y la longitud.
Debes seguir estas instrucciones al pie de la letra. No uses un tono genérico.

${toneSpec.prompt}
════════════════════════════════════════

REGLAS DE FORMALIDAD:
- "tu": usa TÚ/TE/TU en todo el email sin excepción.
- "usted": usa USTED/LE/SU en todo el email sin excepción.
- "auto": decide según el contexto. Clientes y contactos nuevos → USTED. Compañeros → TÚ. En caso de duda → USTED.
- NUNCA mezcles tú y usted.

Responde SOLO con JSON válido:
{ "subject": "string", "body": "string" }
`;

  const replyContext = mode === "reply"
    ? `\nEl usuario recibió este email y debe responderlo:\n---\n${originalEmail}\n---\n`
    : "";

  const userPrompt = `
${replyContext}
Instrucción: ${instruction}
Remitente: ${senderName}${senderRole ? ` (${senderRole})` : ""}
Destinatario: ${clientName}${recipientRole ? ` (${recipientRole})` : ""}
Preferencia de formalidad: ${formalityPreference}
Tono requerido: ${tone.toUpperCase()}

Genera el email siguiendo EXACTAMENTE las instrucciones de tono indicadas arriba.
`;

  const raw = await callOpenAI({
    systemPrompt,
    userPrompt,
    temperature: toneSpec.temperature,
    jsonMode: true
  });

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Agente Redactor: JSON inválido");
  }

  return {
    subject: typeof parsed.subject === "string" ? parsed.subject.trim() : "",
    body: typeof parsed.body === "string" ? parsed.body.trim() : "",
  };
}

// ─────────────────────────────────────────────
// AGENTE 2: Localizador
// ─────────────────────────────────────────────
async function agentLocalizador({ subject, body, region }) {

  const REGION_SPECS = {
    Spain: `
País objetivo: ESPAÑA
- Usa español peninsular (es-ES).
- Saludo natural: "Buenos días", "Buenas tardes", "Estimado/a".
- Cierre natural: "Un saludo", "Quedamos a su disposición", "Atentamente".
- Tono: directo, conciso, profesional. Menos efusivo que LATAM.
- Vocabulario: "ordenador" si aplica, "móvil", "presupuesto".
- Evita: "cordialmente", tono latinoamericano cálido.
- No uses vosotros salvo que el email se dirija claramente a un grupo.
`,
    Mexico: `
País objetivo: MÉXICO
- Usa español mexicano profesional estándar.
- Saludo natural: "Estimado/a", "Buen día".
- Cierre natural: "Quedamos atentos", "Saludos cordiales", "Quedo a sus órdenes".
- Tono: relacional pero formal, con cortesía natural mexicana.
- Vocabulario: "computadora", "celular", "cotización".
- Evita: jerga ("wey", "órale"), tono peninsular ("un saludo", "ordenador").
`,
    Argentina: `
País objetivo: ARGENTINA
- Usa español argentino profesional.
- Si el email es cercano/informal: puedes usar voseo moderado (vos/tenés/podés).
- Si el email es formal: usa usted sin voseo.
- Saludo natural: "Estimado/a", "Buen día".
- Cierre natural: "Saludos", "Quedo a disposición", "Cordialmente".
- Evita: lunfardo, "che", tono demasiado peninsular.
`,
    Chile: `
País objetivo: CHILE
- Usa español chileno profesional y sobrio.
- Saludo natural: "Estimado/a", "Junto con saludar".
- Cierre natural: "Saludos", "Quedamos atentos".
- Tono: directo y respetuoso.
- Vocabulario: "computador", "celular", "cotización".
- Evita: muletillas ("po", "cachai").
`,
    Colombia: `
País objetivo: COLOMBIA
- Usa español colombiano profesional.
- Saludo natural: "Estimado/a", "Cordial saludo".
- Cierre natural: "Cordialmente", "Quedo atento/a", "Saludos".
- Tono: formal, respetuoso y cordial.
- Vocabulario: "computador", "celular", "cotización".
- Evita: expresiones peninsulares, tono demasiado informal.
`,
  };

  const regionSpec = REGION_SPECS[region];
  if (!regionSpec) return { subject, body };

  const systemPrompt = `
Eres un experto en localización cultural de emails profesionales en español.

TU ÚNICA TAREA: Adaptar el vocabulario, saludos, despedidas y expresiones al país objetivo.
NO cambies el significado, la longitud, el tono ni la formalidad (tu/usted) del email.
NO agregues ni elimines información.
Localiza de forma SUTIL — debe sonar natural, no una caricatura del país.
PROHIBIDO: muletillas, estereotipos, jerga callejera.

ESPECIFICACIÓN REGIONAL:
${regionSpec}

Responde SOLO con JSON válido:
{ "subject": "string", "body": "string" }
`;

  const userPrompt = `
Asunto: ${subject}

Cuerpo:
${body}

Localiza para ${region}.
`;

  const raw = await callOpenAI({ systemPrompt, userPrompt, temperature: 0.15, jsonMode: true });

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { subject, body };
  }

  return {
    subject: typeof parsed.subject === "string" ? parsed.subject.trim() : subject,
    body: typeof parsed.body === "string" ? parsed.body.trim() : body,
  };
}

// ─────────────────────────────────────────────
// AGENTE 3: Validador (gpt-4o-mini — bajo costo)
// ─────────────────────────────────────────────
async function agentValidador({ subject, body, formalityPreference, region }) {

  const systemPrompt = `
Eres un corrector final de emails profesionales en español.

TU ÚNICA TAREA: Verificar y corregir dos problemas:

1. MEZCLA DE FORMALIDAD:
   - Detecta si el email mezcla "tú/te/tu" con "usted/le/su".
   - Si hay mezcla: unifica al modo predominante (preferido: ${formalityPreference}).
   - Si no hay mezcla: no cambies nada.

2. INCOHERENCIA REGIONAL (${region || "neutro"}):
   - Corrige solo expresiones evidentemente fuera de lugar para la región.
   - No sobre-corrijas.

Si el email está bien, devuélvelo exactamente igual.

Responde SOLO con JSON válido:
{ "subject": "string", "body": "string" }
`;

  const userPrompt = `
Asunto: ${subject}
Cuerpo: ${body}
Formalidad: ${formalityPreference}
Región: ${region || "no especificada"}
`;

  const raw = await callOpenAI({
    model: "gpt-4o-mini",
    systemPrompt,
    userPrompt,
    temperature: 0.1,
    jsonMode: true,
  });

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { subject, body };
  }

  return {
    subject: typeof parsed.subject === "string" ? parsed.subject.trim() : subject,
    body: typeof parsed.body === "string" ? parsed.body.trim() : body,
  };
}

// ─────────────────────────────────────────────
// PIPELINE COMPLETO
// ─────────────────────────────────────────────
async function runPipeline({ mode, instruction, originalEmail, senderName, clientName, senderRole, recipientRole, formalityPreference, tone, region, persona }) {

  const draft = await agentRedactor({
    mode, instruction, originalEmail,
    senderName, clientName, senderRole, recipientRole,
    formalityPreference, tone, persona,
  });

  const localized = await agentLocalizador({
    subject: draft.subject,
    body: draft.body,
    region,
  });

  const validated = await agentValidador({
    subject: localized.subject,
    body: localized.body,
    formalityPreference,
    region,
  });

  return {
    subject: validated.subject,
    body: validated.body,
  };
}

// ─────────────────────────────────────────────
// HANDLER PRINCIPAL
// ─────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  try {
    const {
      mode, instruction, originalEmail,
      senderName, clientName, recipientRegion,
      senderRole, recipientRole,
      formality, formalidad, tone, versions,
    } = req.body || {};

    const safeMode = mode === "reply" ? "reply" : "compose";
    const safeInstruction = typeof instruction === "string" ? instruction.trim() : "";
    const safeOriginalEmail = typeof originalEmail === "string" ? originalEmail.trim() : "";
    const safeSenderName = typeof senderName === "string" ? senderName.trim() : "";
    const safeClientName = typeof clientName === "string" ? clientName.trim() : "";
    const safeVersions = Math.min(3, Math.max(1, Number(versions) || 1));
    const safeSenderRole = typeof senderRole === "string" ? senderRole.trim() : "";
    const safeRecipientRole = typeof recipientRole === "string" ? recipientRole.trim() : "";

    const incomingFormalidad = formalidad ?? formality;
    const rawFormalityPreference = typeof incomingFormalidad === "string"
      ? incomingFormalidad.trim().toLowerCase()
      : (typeof incomingFormalidad?.preference === "string"
        ? incomingFormalidad.preference.trim().toLowerCase()
        : "auto");
    const safeFormalityPreference = ["auto", "tu", "usted"].includes(rawFormalityPreference)
      ? rawFormalityPreference : "auto";

    const rawTone = typeof tone === "string" ? tone.trim().toLowerCase() : "neutro";
    const safeTone = ["neutro", "cordial", "firme", "urgente"].includes(rawTone) ? rawTone : "neutro";

    const regionMap = {
      españa: "Spain", spain: "Spain",
      méxico: "Mexico", mexico: "Mexico",
      argentina: "Argentina",
      chile: "Chile",
      colombia: "Colombia",
    };
    const rawRegion = typeof recipientRegion === "string" ? recipientRegion.trim() : "";
    const safeRegion = regionMap[rawRegion.toLowerCase()] || rawRegion || null;

    if (!safeInstruction || !safeSenderName || !safeClientName ||
      (safeMode === "reply" && !safeOriginalEmail)) {
      return res.status(400).json({ error: "Faltan campos obligatorios" });
    }

    const PERSONAS = ["directa", "empatica", "formal"];

    const pipelinePromises = Array.from({ length: safeVersions }, (_, i) =>
      runPipeline({
        mode: safeMode,
        instruction: safeInstruction,
        originalEmail: safeOriginalEmail,
        senderName: safeSenderName,
        clientName: safeClientName,
        senderRole: safeSenderRole,
        recipientRole: safeRecipientRole,
        formalityPreference: safeFormalityPreference,
        tone: safeTone,
        region: safeRegion,
        persona: PERSONAS[i] || "directa",
      })
    );

    const results = await Promise.all(pipelinePromises);

    const normalizedVersions = results
      .map((v) => ({
        subject: typeof v?.subject === "string" ? v.subject.trim() : "",
        body: typeof v?.body === "string" ? v.body.trim() : "",
      }))
      .filter((v) => v.subject && v.body);

    if (normalizedVersions.length === 0) {
      return res.status(502).json({ error: "No se pudo generar el email" });
    }

    return res.status(200).json({ versions: normalizedVersions });

  } catch (err) {
    console.error("email.js pipeline error:", err);
    return res.status(500).json({ error: "Error interno" });
  }
}
