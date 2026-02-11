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

    if (!safeSubject || !safeBody) {
      return res.status(400).json({ error: "Solicitud inválida" });
    }

    const targetLanguage = safeLanguage || "English";
    const systemPrompt =
      "Eres un traductor profesional de emails. Responde únicamente con JSON válido.";
    const userPrompt = `Traduce el asunto y el cuerpo al idioma solicitado.\nMantén formato original.\nMantén emojis.\nNo agregues explicaciones.\nDevuelve JSON válido.\n\nIdioma: ${targetLanguage}\n\nAsunto:\n${safeSubject}\n\nCuerpo:\n${safeBody}\n\nFormato de salida obligatorio:\n{\n  \"translatedSubject\": \"...\",\n  \"translatedBody\": \"...\"\n}`;

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
      throw new Error(`OpenAI request failed (${upstreamResponse.status}): ${errorText}`);
    }

    const data = await upstreamResponse.json();
    const rawContent = data?.choices?.[0]?.message?.content;

    const translatedPayload =
      typeof rawContent === "string"
        ? rawContent.trim()
        : Array.isArray(rawContent)
          ? rawContent
              .map((part) => (typeof part?.text === "string" ? part.text : ""))
              .join("")
              .trim()
          : "";

    if (!translatedPayload) {
      throw new Error("Empty translation payload from OpenAI");
    }

    const normalizedPayload = translatedPayload
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();

    let parsed;

    try {
      parsed = JSON.parse(normalizedPayload);
    } catch {
      const jsonMatch = normalizedPayload.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("Invalid translation JSON format");
      }

      parsed = JSON.parse(jsonMatch[0]);
    }

    const translatedSubject =
      typeof parsed?.translatedSubject === "string" ? parsed.translatedSubject.trim() : "";
    const translatedBody =
      typeof parsed?.translatedBody === "string" ? parsed.translatedBody.trim() : "";

    if (!translatedSubject || !translatedBody) {
      throw new Error("Translated subject/body missing in response");
    }

    return res.status(200).json({
      translatedSubject,
      translatedBody,
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    console.error("Translate endpoint error:", details);

    return res.status(500).json({
      error: "Translation failed",
      details,
    });
  }
}
