const { extractJsonFromText } = require('./jsonExtractor');

async function callOpenAI(apiKey, model, systemPrompt, userContent) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
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
    if (!res.ok) throw new Error(`OpenAI a répondu ${res.status} : ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    if (!text) throw new Error("OpenAI n'a renvoyé aucun texte exploitable.");
    return extractJsonFromText(text);
}

module.exports = { callOpenAI };
