const MODE_PROMPTS = {
  improve:
    "Mejora la claridad y redacción del siguiente texto sin cambiar su significado. Mantén el idioma original.",
  expand:
    "Expande el siguiente texto agregando más detalle y claridad sin cambiar su intención. Mantén el idioma original.",
  simplify:
    "Simplifica y reduce el siguiente texto haciéndolo más breve y claro sin cambiar su significado. Mantén el idioma original.",
};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  try {
    const { text, mode } = req.body || {};
    const safeText = typeof text === "string" ? text.trim() : "";
    const safeMode = typeof mode === "string" ? mode.trim() : "";

    if (!safeText || safeText.length < 4 || !MODE_PROMPTS[safeMode]) {
      return res.status(400).json({ error: "Solicitud inválida" });
    }

    const systemPrompt =
      "Eres un editor profesional de textos. Sigue exactamente las instrucciones y responde solo con el resultado final.";
    const userPrompt = `${MODE_PROMPTS[safeMode]}\n\nInstrucciones obligatorias:\n- No agregues explicaciones.\n- Devuelve solo el texto final.\n- Mantén el idioma original.\n- Mantén exactamente el mismo uso de mayúsculas y minúsculas que el texto original.\n\nTexto:\n${safeText}`;

    const upstreamResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.ORTO}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        temperature: 0.3,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!upstreamResponse.ok) {
      const errorText = await upstreamResponse.text();
      console.error("Improve endpoint upstream error:", errorText);
      return res.status(502).json({ error: "No se pudo procesar el texto" });
    }

    const data = await upstreamResponse.json();
    const rawContent = data?.choices?.[0]?.message?.content;
    const improvedText =
      typeof rawContent === "string"
        ? rawContent.trim()
        : Array.isArray(rawContent)
          ? rawContent
              .map((part) => (typeof part?.text === "string" ? part.text : ""))
              .join("")
              .trim()
          : "";

    if (!improvedText) {
      return res.status(502).json({ error: "Respuesta inválida del modelo" });
    }

    return res.status(200).json({ improvedText });
  } catch (error) {
    console.error("Improve endpoint error:", error);
    return res.status(500).json({ error: "Error interno" });
  }
}
