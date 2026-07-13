const { extractJsonFromText } = require('./jsonExtractor');

async function callMistral(apiKey, model, systemPrompt, userContent) {
    const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + apiKey
        },
        body: JSON.stringify({
            model,
            response_format: { type: 'json_object' },
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userContent }
            ]
        })
    });
    if (!res.ok) throw new Error(`Mistral a répondu ${res.status} : ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    if (!text) throw new Error("Mistral n'a renvoyé aucun texte exploitable.");
    return extractJsonFromText(text);
}

module.exports = { callMistral };
