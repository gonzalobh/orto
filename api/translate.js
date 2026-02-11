export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  try {
    const { subject, body, language } = req.body || {};
    const safeSubject = typeof subject === "string" ? subject.trim() : "";
    const safeBody = typeof body === "string" ? body.trim() : "";
    const safeLanguage = typeof language === "string" ? language.trim() : "";

    if (!safeSubject || !safeBody || !safeLanguage) {
      return res.status(400).json({ error: "Solicitud inválida" });
    }

    const systemPrompt = "Eres un traductor profesional de emails. Responde únicamente con JSON válido.";
    const userPrompt = `Traduce el asunto y el cuerpo al idioma solicitado.\nMantén formato original.\nMantén emojis.\nNo agregues explicaciones.\nDevuelve JSON válido.\n\nIdioma: ${safeLanguage}\n\nAsunto:\n${safeSubject}\n\nCuerpo:\n${safeBody}\n\nFormato de salida obligatorio:\n{\n  \"translatedSubject\": \"...\",\n  \"translatedBody\": \"...\"\n}`;

    const upstreamResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.ORTO}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        temperature: 0.2,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!upstreamResponse.ok) {
      const errorText = await upstreamResponse.text();
      console.error("OpenAI translate upstream error:", errorText);
      return res.status(502).json({ error: "No se pudo traducir el email" });
    }

    const data = await upstreamResponse.json();
    const translatedPayload = data?.choices?.[0]?.message?.content?.trim();

    if (!translatedPayload) {
      return res.status(502).json({ error: "La traducción llegó vacía" });
    }

    let parsed;
    try {
      parsed = JSON.parse(translatedPayload);
    } catch (parseError) {
      console.error("Translate parse error:", parseError, translatedPayload);
      return res.status(502).json({ error: "Formato de traducción inválido" });
    }

    const translatedSubject = typeof parsed?.translatedSubject === "string" ? parsed.translatedSubject.trim() : "";
    const translatedBody = typeof parsed?.translatedBody === "string" ? parsed.translatedBody.trim() : "";

    if (!translatedSubject || !translatedBody) {
      return res.status(502).json({ error: "La traducción llegó vacía" });
    }

    return res.status(200).json({ translatedSubject, translatedBody });
  } catch (err) {
    console.error("Translate endpoint error:", err);
    return res.status(500).json({ error: "Error interno" });
  }
}
