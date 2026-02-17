// ============================================================
// email.js — Pipeline de 3 agentes
// Agente 1: Redactor   → genera el email con tono + longitud automática
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
// AGENTE 1: Redactor
// Genera el email con el tono indicado.
// La longitud la decide el agente según el contenido
// y el tipo de email — no el usuario.
// ─────────────────────────────────────────────
async function agentRedactor({ mode, instruction, originalEmail, senderName, clientName, senderRole, recipientRole, formalityPreference, tone, persona }) {

  const TONE_SPECS = {
    neutro: `
TONO: NEUTRO (estándar profesional)
- Tono equilibrado, ni frío ni cálido.
- Directo al punto sin carga emocional.
- Apropiado para la mayoría de comunicaciones profesionales.
- Longitud: la necesaria para cubrir el contenido sin más.
`,
    cordial: `
TONO: CORDIAL
- Tono cálido, empático y considerado.
- Muestra interés genuino en la relación con el destinatario.
- Suaviza los mensajes difíciles con diplomacia.
- Incluye frases de cortesía naturales (no exageradas).
- Longitud: suficiente para que no suene abrupto.
`,
    firme: `
TONO: FIRME
- Tono directo, seguro y sin ambigüedades.
- Comunica la posición claramente sin ser agresivo.
- Usa lenguaje de acción: "necesitamos", "esperamos", "requerimos".
- Sin rodeos ni justificaciones excesivas.
- Ideal para: reclamos, negociaciones, situaciones que requieren acción.
- Longitud: concisa pero completa — cada línea tiene un propósito.
`,
    urgente: `
TONO: URGENTE
- Comunica inmediatez y prioridad desde el asunto.
- El primer párrafo establece la urgencia claramente.
- Usa frases de tiempo concretas: "antes del viernes", "esta semana", "en las próximas 24 horas".
- Sin introducción larga — va directo al problema y la acción requerida.
- Cierre que refuerza la urgencia sin sonar desesperado.
- Longitud: moderada — lo suficiente para ser claro, sin dilatar el mensaje.
`,
  };

  const PERSONAS = {
    directa: "Enfoque ejecutivo: ve directo al punto, sin introducciones largas.",
    empatica: "Enfoque relacional: muestra comprensión antes de presentar el problema o solicitud.",
    formal: "Enfoque estructurado: organiza el email con claridad, párrafo por párrafo.",
  };

  const systemPrompt = `
Eres un redactor experto de emails profesionales.
${PERSONAS[persona] || PERSONAS.directa}

TU ÚNICA TAREA: Redactar un email profesional natural y efectivo.

TONO OBLIGATORIO:
${TONE_SPECS[tone] || TONE_SPECS.neutro}

LONGITUD: Decide tú la longitud apropiada según el contenido y el tono.
- Si la instrucción es simple → email corto (3-5 líneas de cuerpo).
- Si la instrucción tiene múltiples puntos → email más largo (6-12 líneas).
- Si el tono es urgente → preferir concisión.
- Si el tono es cordial → permitir algo más de desarrollo.
- NUNCA rellenes con frases vacías para alargar. Cada línea debe aportar valor.

REGLAS DE FORMALIDAD:
- Si la preferencia es "tu": usa TÚ/TE/TU en todo el email sin excepción.
- Si la preferencia es "usted": usa USTED/LE/SU en todo el email sin excepción.
- Si la preferencia es "auto": decide como lo haría un profesional real.
  * Usa USTED para: clientes, contactos nuevos, jerarquía superior, B2B formal.
  * Usa TÚ para: compañeros, contexto informal o cercano.
  * Si tienes dudas → usa USTED.
- NUNCA mezcles tú y usted en el mismo email.

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
Tono requerido: ${tone}

Genera el email.
`;

  const raw = await callOpenAI({ systemPrompt, userPrompt, temperature: 0.45, jsonMode: true });

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
// Adapta vocabulario, tono y expresiones al país.
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
- Evita: "cordialmente", "estimado cliente" genérico, tono latinoamericano cálido.
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
- Tono: directo y respetuoso, equilibrio entre claridad y formalidad.
- Vocabulario: "computador", "celular", "cotización".
- Evita: muletillas ("po", "cachai"), tono demasiado cálido o frío.
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
NO cambies el significado, la longitud ni la formalidad (tu/usted) del email.
NO agregues ni elimines información.
Localiza de forma SUTIL — debe sonar natural, no una caricatura del país.
PROHIBIDO: muletillas, estereotipos, jerga callejera o acentos escritos.

ESPECIFICACIÓN REGIONAL:
${regionSpec}

Responde SOLO con JSON válido:
{ "subject": "string", "body": "string" }
`;

  const userPrompt = `
Email a localizar:

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
    throw new Error("Agente Localizador: JSON inválido");
  }

  return {
    subject: typeof parsed.subject === "string" ? parsed.subject.trim() : subject,
    body: typeof parsed.body === "string" ? parsed.body.trim() : body,
  };
}

// ─────────────────────────────────────────────
// AGENTE 3: Validador
// Verifica mezcla tu/usted e incoherencias regionales.
// Usa gpt-4o-mini para reducir costo y latencia.
// ─────────────────────────────────────────────
async function agentValidador({ subject, body, formalityPreference, region }) {

  const systemPrompt = `
Eres un corrector final de emails profesionales en español.

TU ÚNICA TAREA: Verificar y corregir dos problemas específicos:

1. MEZCLA DE FORMALIDAD:
   - Detecta si el email mezcla "tú/te/tu" con "usted/le/su".
   - Si hay mezcla: unifica todo al modo predominante (o al preferido: ${formalityPreference}).
   - Si no hay mezcla: no cambies nada.

2. INCOHERENCIA REGIONAL (${region || "neutro"}):
   - Detecta si hay expresiones claramente incorrectas para la región.
   - Solo corrige las expresiones evidentemente fuera de lugar.
   - No sobre-corrijas ni cambies el estilo general.

NO cambies el significado, la longitud ni la estructura del email.
Si el email está bien, devuélvelo exactamente igual.

Responde SOLO con JSON válido:
{ "subject": "string", "body": "string" }
`;

  const userPrompt = `
Asunto: ${subject}

Cuerpo:
${body}

Preferencia de formalidad: ${formalityPreference}
Región: ${region || "no especificada"}

Valida y corrige si es necesario.
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
// PIPELINE COMPLETO para una versión
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
      : (typeof incomingFormalidad?.preference === "string" ? incomingFormalidad.preference.trim().toLowerCase() : "auto");
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
