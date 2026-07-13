const { extractJsonFromText } = require('./jsonExtractor');

async function callGemini(apiKey, model, systemPrompt, userContent) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: [{ role: 'user', parts: [{ text: userContent }] }],
            generationConfig: { responseMimeType: 'application/json' }
        })
    });
    if (!res.ok) throw new Error(`Gemini a répondu ${res.status} : ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("Gemini n'a renvoyé aucun texte exploitable.");
    return extractJsonFromText(text);
}

module.exports = { callGemini };
