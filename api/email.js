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
      mode,
      instruction,
      originalEmail,
      senderName,
      clientName,
      tone,
      length,
      emojis,
      recipientRegion,
      industry,
      versions,
    } = req.body || {};

    const safeMode = mode === "reply" ? "reply" : "compose";
    const safeInstruction = typeof instruction === "string" ? instruction.trim() : "";
    const safeOriginalEmail = typeof originalEmail === "string" ? originalEmail.trim() : "";
    const safeSenderName = typeof senderName === "string" ? senderName.trim() : "";
    const safeClientName = typeof clientName === "string" ? clientName.trim() : "";
    const safeVersions = Math.min(3, Math.max(1, Number(versions) || 1));

    if (!safeInstruction || !safeSenderName || !safeClientName || (safeMode === "reply" && !safeOriginalEmail)) {
      return res.status(400).json({ error: "Faltan campos obligatorios" });
    }

    const systemPrompt = `Eres un asistente experto en redacción de correos profesionales en español B2B.

Reglas obligatorias:
- Responde EXCLUSIVAMENTE en JSON válido.
- No agregues texto fuera del JSON.
- Usa este formato JSON EXACTO:
{
  "versions": [
    {
      "subject": "string",
      "body": "string"
    }
  ]
}
- El arreglo "versions" debe incluir exactamente la cantidad solicitada.
- En cada "body" usa saludo "Hola, {NombreCliente}:" y cierre:

Atentamente,
{NombreRemitente}`;

    const modePrompt = safeMode === "reply"
      ? `El usuario recibió el siguiente email:
---
${safeOriginalEmail}
---

Redacta una respuesta profesional basada en ese mensaje,
considerando también la instrucción adicional del usuario.
Aplica el tono, extensión y configuración seleccionada.`
      : "";

    const businessContext = `
### BUSINESS CONTEXT (STRICT)

Recipient Region: ${recipientRegion || "Not specified"}
Industry: ${industry || "General"}

Adapt the email to:
- cultural norms of the region
- expected professionalism level
- industry-specific vocabulary
- business etiquette typical of that market

This context has priority over stylistic creativity.
`;

    const userPrompt = `
${businessContext}

### EMAIL REQUEST
Instruction: ${safeInstruction}

### PARAMETERS
Tone: ${tone || "Automatic"}
Length: ${length || "Automatic"}
Emojis: ${emojis || "Automatic"}

Sender Name: ${safeSenderName || "El equipo"}
Recipient Name: ${safeClientName || ""}
`;

    const finalUserPrompt = `${safeMode === "reply" ? `${modePrompt}\n\n` : ""}${userPrompt}

Genera ${safeVersions} versiones claramente diferentes entre sí.
Cada versión debe tener un enfoque distinto.

Versión 1: Más directa y ejecutiva.
Versión 2: Más diplomática y empática.
Versión 3: Más formal y estructurada.

No repitas frases.
No uses estructuras similares.
Cada versión debe sentirse redactada por una persona diferente.

Si se solicitan 2 versiones, devuelve solo la versión 1 y la 2.
Si se solicita 1 versión, devuelve solo la versión 1.`;

    const upstreamResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.ORTO}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        temperature: 0.3,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "email_versions_response",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                versions: {
                  type: "array",
                  minItems: safeVersions,
                  maxItems: safeVersions,
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      subject: { type: "string" },
                      body: { type: "string" },
                    },
                    required: ["subject", "body"],
                  },
                },
              },
              required: ["versions"],
            },
          },
        },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: finalUserPrompt },
        ],
      }),
    });

    if (!upstreamResponse.ok) {
      const errorText = await upstreamResponse.text();
      console.error("OpenAI upstream error:", errorText);
      return res.status(502).json({ error: "No se pudo generar el email" });
    }

    const data = await upstreamResponse.json();
    const content = data?.choices?.[0]?.message?.content?.trim();
    if (!content) {
      return res.status(502).json({ error: "No se pudo generar el email" });
    }

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      return res.status(502).json({ error: "Formato inválido recibido del modelo" });
    }

    const responseVersions = Array.isArray(parsed?.versions) ? parsed.versions.slice(0, safeVersions) : [];
    const normalizedVersions = responseVersions
      .map((item) => ({
        subject: typeof item?.subject === "string" ? item.subject.trim() : "",
        body: typeof item?.body === "string" ? item.body.trim() : "",
      }))
      .filter((item) => item.subject && item.body);

    if (normalizedVersions.length !== safeVersions) {
      return res.status(502).json({ error: "Cantidad de versiones inválida" });
    }

    return res.status(200).json({ versions: normalizedVersions });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Error interno" });
  }
}
