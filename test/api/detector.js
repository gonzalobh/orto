export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { text } = req.body;

  if (!text) {
    return res.status(400).json({ error: "No text provided" });
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.ORTO}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `
Eres un analista experto en detección de tono artificial en textos en español.

Devuelve SIEMPRE JSON con este formato:

{
  "ai_score": number,
  "detected_patterns": [],
  "why_it_sounds_ai": "",
  "human_version": ""
}
`
          },
          {
            role: "user",
            content: text
          }
        ],
        temperature: 0.7
      })
    });

    const data = await response.json();
    const content = data.choices[0].message.content;

    res.status(200).json(JSON.parse(content));

  } catch (error) {
    res.status(500).json({ error: "Error processing request" });
  }
}
