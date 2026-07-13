// Appel serveur -> serveur : le header CORS spécial nécessaire pour un appel
// depuis un navigateur n'est plus requis ici (ce n'était qu'un contournement
// pour l'ancienne architecture 100% front-end).
async function callClaude(apiKey, model, systemPrompt, userContent, toolSchema) {
    const tool = toolSchema || {
        name: 'submit_json',
        description: 'Soumets la réponse structurée.',
        input_schema: { type: 'object', properties: {}, additionalProperties: true }
    };

    const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
            model,
            max_tokens: 4096,
            system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
            tools: [tool],
            tool_choice: { type: 'tool', name: tool.name },
            messages: [{ role: 'user', content: userContent }]
        })
    });
    if (!res.ok) throw new Error(`Claude a répondu ${res.status} : ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    const toolUse = (data.content || []).find(b => b.type === 'tool_use');
    if (!toolUse) throw new Error("Claude n'a renvoyé aucun appel d'outil exploitable.");
    return toolUse.input;
}

module.exports = { callClaude };
