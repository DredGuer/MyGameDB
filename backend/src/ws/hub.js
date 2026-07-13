// Registre unique des connexions WebSocket + diffusion d'événements.
// Pas de "rooms" : usage mono-utilisateur, un seul canal global, tous les
// clients connectés (onglets/appareils) reçoivent tous les événements.

const clients = new Set();

function attach(wss) {
    wss.on('connection', (socket) => {
        clients.add(socket);
        socket.on('close', () => clients.delete(socket));
        socket.on('error', () => clients.delete(socket));
    });
}

// event: string ("game:created", "family:updated", ...)
// payload: objet minimal (généralement juste des IDs) — le client refait un
// GET ciblé pour récupérer les données à jour.
// originClientId: si fourni, permet au client émetteur de s'auto-ignorer
// (évite un double rafraîchissement sur celui qui vient d'agir).
function broadcast(event, payload, originClientId) {
    const message = JSON.stringify({ type: event, data: payload, originClientId, ts: Date.now() });
    for (const socket of clients) {
        if (socket.readyState === socket.OPEN) {
            socket.send(message);
        }
    }
}

module.exports = { attach, broadcast };
