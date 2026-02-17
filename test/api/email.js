// ============================================================
// email.js — Pipeline de 4 agentes
// Agente 1: Redactor   → genera el email base con hint de longitud
// Agente 2: Longitud   → ajusta y refuerza breve / detallado / completo
// Agente 3: Localizador → adapta al país
// Agente 4: Validador  → verifica tu/usted y coherencia regional
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
// Genera el email base con suficiente contenido
// según la longitud solicitada.
// ─────────────────────────────────────────────
async function agentRedactor({ mode, instruction, originalEmail, senderName, clientName, senderRole, recipientRole, formalityPreference, persona, length }) {

  const PERSONAS = {
    directa: "Escribe de forma directa, ejecutiva y sin rodeos.",
    empatica: "Escribe de forma diplomática, empática y considerada.",
    formal: "Escribe de forma estructurada, formal y protocolar.",
  };

  const LENGTH_HINTS = {
    breve: `
LONGITUD OBJETIVO: BREVE
- Genera un email corto con solo la idea principal.
- Cuerpo: 3 a 5 líneas máximo.
- No desarrolles argumentos secundarios.
- Sin bullets ni numeración.
`,
    detallado: `
LONGITUD OBJETIVO: DETALLADO
- Genera un email con contexto suficiente.
- Cuerpo: 6 a 10 líneas.
- Incluye: contexto del problema, impacto, acción requerida y próximos pasos.
- Sin bullets ni numeración.
`,
    completo: `
LONGITUD OBJETIVO: COMPLETO
- Genera un email exhaustivo y bien desarrollado.
- Cuerpo: 12 a 18 líneas mínimo.
- Desarrolla TODOS estos elementos por separado:
  1. Contexto detallado del problema con ejemplos o datos concretos
  2. Impacto específico en la operación
  3. Historial o patrón del problema
  4. Acción requerida con urgencia
  5. Próximos pasos concretos y plazos
  6. Consecuencias si no se actúa
- Usa párrafos separados o bullets para organizar.
- NO comprimas la información — desarrolla cada punto con detalle.
`,
  };

  const systemPrompt = `
Eres un redactor experto de emails profesionales.
${PERSONAS[persona] || PERSONAS.directa}

TU ÚNICA TAREA: Redactar el contenido del email correctamente con la longitud indicada.

REGLAS DE LONGITUD (OBLIGATORIO):
${LENGTH_HINTS[length] || LENGTH_HINTS.detallado}

REGLAS DE FORMALIDAD:
- Si la preferencia es "tu": usa TÚ/TE/TU en todo el email sin excepción.
- Si la preferencia es "usted": usa USTED/LE/SU en todo el email sin excepción.
- Si la preferencia es "auto": decide como lo haría un profesional real según los roles y contexto.
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
Longitud requerida: ${length}

Genera el email completo cumpliendo estrictamente la longitud indicada.
`;

  const raw = await callOpenAI({ systemPrompt, userPrompt, temperature: 0.4, jsonMode: true });

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
// AGENTE 2: Longitud
// Verifica y corrige la longitud si el Redactor
// no cumplió exactamente la especificación.
// ─────────────────────────────────────────────
async function agentLongitud({ subject, body, length }) {

  const LENGTH_SPECS = {
    breve: `
BREVE:
- Cuerpo: 3 a 5 líneas máximo (sin contar saludo ni despedida).
- Si tiene más líneas: elimina lo que no sea esencial hasta cumplir el límite.
- Frases cortas y directas. Sin bullets.
`,
    detallado: `
DETALLADO:
- Cuerpo: 6 a 10 líneas (sin contar saludo ni despedida).
- Si tiene menos: agrega contexto o detalle relevante.
- Si tiene más: consolida sin perder ideas clave.
`,
    completo: `
COMPLETO:
- Cuerpo: 12 a 18 líneas mínimo (sin contar saludo ni despedida).
- Si tiene menos de 12 líneas: EXPANDE desarrollando más cada punto.
  * Agrega antecedentes concretos.
  * Desarrolla el impacto con más detalle.
  * Incluye próximos pasos específicos con plazos.
  * Añade consecuencias si no se toma acción.
- Usa párrafos separados o bullets para organizar.
- NO comprimas — el objetivo es un email completo y exhaustivo.
`,
  };

  const systemPrompt = `
Eres un editor especializado en controlar la longitud de emails profesionales.

TU ÚNICA TAREA: Verificar que el email cumpla exactamente con la especificación de longitud y corregirlo si no cumple.
NO cambies el significado, el tono, la formalidad (tu/usted) ni el idioma.
NO cambies el asunto salvo que sea imprescindible.
Conserva nombres, fechas, números y hechos.

ESPECIFICACIÓN DE LONGITUD OBLIGATORIA:
${LENGTH_SPECS[length] || LENGTH_SPECS.detallado}

Responde SOLO con JSON válido:
{ "subject": "string", "body": "string" }
`;

  const userPrompt = `
Email a verificar y ajustar:

Asunto: ${subject}

Cuerpo:
${body}

Verifica si cumple la especificación de longitud "${length}" y corrígelo si es necesario.
`;

  const raw = await callOpenAI({ systemPrompt, userPrompt, temperature: 0.2, jsonMode: true });

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Agente Longitud: JSON inválido");
  }

  return {
    subject: typeof parsed.subject === "string" ? parsed.subject.trim() : subject,
    body: typeof parsed.body === "string" ? parsed.body.trim() : body,
  };
}

// ─────────────────────────────────────────────
// AGENTE 3: Localizador
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
- Evita: muletillas ("po", "cachai"), tono demasiado cálido o demasiado frío.
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
// AGENTE 4: Validador
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

2. INCOHERENCIA REGIONAL (${region}):
   - Detecta si hay expresiones claramente incorrectas para ${region}.
   - Solo corrige las expresiones evidentemente fuera de lugar.
   - No sobre-corrijas ni cambies el estilo general.

NO cambies el significado, la longitud ni la estructura del email.
Si el email está bien, devuélvelo exactamente igual.

Responde SOLO con JSON válido:
{ "subject": "string", "body": "string", "corrections": "string" }
`;

  const userPrompt = `
Asunto: ${subject}

Cuerpo:
${body}

Preferencia de formalidad: ${formalityPreference}
Región: ${region}

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
    return { subject, body, corrections: "Validación omitida" };
  }

  return {
    subject: typeof parsed.subject === "string" ? parsed.subject.trim() : subject,
    body: typeof parsed.body === "string" ? parsed.body.trim() : body,
    corrections: typeof parsed.corrections === "string" ? parsed.corrections.trim() : "Sin correcciones",
  };
}

// ─────────────────────────────────────────────
// PIPELINE COMPLETO para una versión
// ─────────────────────────────────────────────
async function runPipeline({ mode, instruction, originalEmail, senderName, clientName, senderRole, recipientRole, formalityPreference, length, region, persona }) {

  const draft = await agentRedactor({
    mode, instruction, originalEmail,
    senderName, clientName, senderRole, recipientRole,
    formalityPreference, persona, length,
  });

  const adjusted = await agentLongitud({
    subject: draft.subject,
    body: draft.body,
    length,
  });

  const localized = await agentLocalizador({
    subject: adjusted.subject,
    body: adjusted.body,
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
      formality, formalidad, length, versions,
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

    const rawLength = typeof length === "string" ? length.trim().toLowerCase() : "detallado";
    const safeLength = ["breve", "detallado", "completo"].includes(rawLength) ? rawLength : "detallado";

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
        length: safeLength,
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
