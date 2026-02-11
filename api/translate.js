export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  try {
    const { text, targetLang } = req.body || {};
    const safeText = typeof text === "string" ? text.trim() : "";

    const langMap = {
      en: "English",
      fr: "French",
      de: "German",
    };

    const targetLanguage = langMap[targetLang];

    if (!safeText || !targetLanguage) {
      return res.status(400).json({ error: "Solicitud inválida" });
    }

    const systemPrompt = "You are a professional business email translator. Return only the translated email text with original formatting preserved.";
    const userPrompt = `Translate the following email to ${targetLanguage}. Keep professional tone and formatting.\n\n${safeText}`;

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
    const translatedText = data?.choices?.[0]?.message?.content?.trim();

    if (!translatedText) {
      return res.status(502).json({ error: "La traducción llegó vacía" });
    }

    return res.status(200).json({ text: translatedText });
  } catch (err) {
    console.error("Translate endpoint error:", err);
    return res.status(500).json({ error: "Error interno" });
  }
}
