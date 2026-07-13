// Accès HTTP pur à l'API Web Steam. Suit le pattern de ../llm/llmClient.js :
// credentials lus uniquement depuis process.env, jamais stockés en base ni
// exposés via l'API HTTP (voir hasSteamCredentials, qui ne renvoie qu'un booléen).
function hasSteamCredentials() {
    return Boolean(process.env.STEAM_API_KEY) && Boolean(process.env.STEAM_ID);
}

// Renvoie la liste des jeux possédés : [{ appid, name, playtime_forever (minutes) }, ...]
async function fetchOwnedGames() {
    const apiKey = process.env.STEAM_API_KEY;
    const steamId = process.env.STEAM_ID;
    if (!apiKey || !steamId) {
        const err = new Error('STEAM_API_KEY et STEAM_ID doivent être renseignés dans .env pour synchroniser Steam.');
        err.code = 'STEAM_NO_CREDENTIALS';
        throw err;
    }

    const url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${encodeURIComponent(apiKey)}&steamid=${encodeURIComponent(steamId)}&include_appinfo=true&include_played_free_games=true&format=json`;
    const res = await fetch(url);
    if (!res.ok) {
        const err = new Error(`Steam API a répondu ${res.status}.`);
        err.code = 'STEAM_API_ERROR';
        throw err;
    }
    const json = await res.json();
    return json.response?.games || [];
}

module.exports = { hasSteamCredentials, fetchOwnedGames };
