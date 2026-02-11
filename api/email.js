export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  let streamClosed = false;
  let sseMode = false;

  const closeStream = () => {
    if (streamClosed) return;
    streamClosed = true;
    try { res.end(); } catch {}
  };

  const writeEvent = (payload) => {
    if (streamClosed) return;
    try {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    } catch {}
  };

  try {
    const { instruction, senderName, clientName } = req.body || {};
    const safeInstruction = typeof instruction === "string" ? instruction.trim() : "";
    const safeSenderName = typeof senderName === "string" ? senderName.trim() : "";
    const safeClientName = typeof clientName === "string" ? clientName.trim() : "";

    if (!safeInstruction || !safeSenderName || !safeClientName) {
      return res.status(400).json({ error: "Faltan campos obligatorios" });
    }

    const systemPrompt = `Eres un asistente experto en redacción de correos profesionales en español.

Reglas obligatorias:
- Devuelve SOLO el email final.
- No expliques nada.
- No uses comillas.
- Incluye asunto.
- Usa saludo: Hola, {NombreCliente}:
- Tono profesional y claro.
- Termina con:

Atentamente,
{NombreRemitente}`;

    const userPrompt = `INSTRUCCION:
<<<
${safeInstruction}
>>>

REMITENTE: ${safeSenderName}
DESTINATARIO: ${safeClientName}`;

    const upstreamResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.ORTO}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        stream: true,
        temperature: 0.4,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
      }),
    });

    if (!upstreamResponse.ok || !upstreamResponse.body) {
      const errorText = await upstreamResponse.text();
      console.error("OpenAI upstream error:", errorText);
      return res.status(502).json({ error: "No se pudo generar el email" });
    }

    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    sseMode = true;
    res.flushHeaders?.();
    res.write(":\n\n");

    const reader = upstreamResponse.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let collectedText = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;

        const data = trimmed.replace(/^data:\s*/, "");
        if (data === "[DONE]") break;

        try {
          const parsed = JSON.parse(data);
          const chunk = parsed?.choices?.[0]?.delta?.content || "";

          if (chunk) {
            collectedText += chunk;
            writeEvent({ type: "chunk", text: chunk });
          }
        } catch (err) {
          console.error("Stream parse error:", err);
        }
      }
    }

    if (!collectedText.trim()) {
      writeEvent({ type: "error", message: "No se pudo generar el email. Intenta nuevamente." });
      writeEvent({ type: "done" });
      return;
    }

    writeEvent({ type: "done" });
  } catch (err) {
    console.error(err);

    if (!sseMode) {
      return res.status(500).json({ error: "Error interno" });
    }

    writeEvent({ type: "error", message: "No se pudo generar el email. Intenta nuevamente." });
    closeStream();
  } finally {
    closeStream();
  }
}
