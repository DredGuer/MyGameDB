// Parseur JSON tolérant : essaie un parse direct, puis extrait un bloc
// ```json``` ou le premier objet {...} équilibré si le modèle a entouré la
// réponse de texte/markdown. Utile pour Gemini/OpenAI/Mistral ; Claude passe
// par tool-use forcé et n'en a pas besoin.
function extractJsonFromText(text) {
    try {
        return JSON.parse(text);
    } catch (e) { /* on tente une extraction plus tolérante ci-dessous */ }

    const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenceMatch) {
        try { return JSON.parse(fenceMatch[1]); } catch (e) {}
    }

    const start = text.indexOf('{');
    if (start !== -1) {
        let depth = 0;
        for (let i = start; i < text.length; i++) {
            if (text[i] === '{') depth++;
            else if (text[i] === '}') {
                depth--;
                if (depth === 0) {
                    try { return JSON.parse(text.slice(start, i + 1)); } catch (e) { break; }
                }
            }
        }
    }
    throw new Error("Réponse du LLM illisible : aucun JSON valide trouvé.");
}

module.exports = { extractJsonFromText };
