// Connexion WebSocket avec reconnexion automatique (backoff 1s→2s→4s→8s→15s max).
// Dispatch les événements broadcastés par le backend (voir backend/src/ws/hub.js)
// vers des handlers enregistrés par app.js — permet une sync temps réel entre
// tous les onglets/appareils ouverts sur l'app.

const wsHandlers = {};
let wsSocket = null;
let wsReconnectDelay = 1000;
const WS_MAX_DELAY = 15000;

function onWsEvent(type, handler) {
    (wsHandlers[type] ||= []).push(handler);
}

function setWsStatus(connected) {
    const dot = document.getElementById('ws-status-dot');
    if (!dot) return;
    dot.className = connected
        ? 'inline-block w-2 h-2 rounded-full bg-emerald-500'
        : 'inline-block w-2 h-2 rounded-full bg-rose-500 animate-pulse';
    dot.title = connected ? 'Connecté en temps réel' : 'Déconnecté — reconnexion en cours...';
}

function showSyncToast() {
    const existing = document.getElementById('sync-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'sync-toast';
    toast.className = 'fixed top-6 left-1/2 -translate-x-1/2 z-[10000] bg-slate-800 border border-indigo-500/40 shadow-2xl px-4 py-2 rounded-lg pointer-events-none';
    toast.innerHTML = '<p class="text-indigo-300 text-xs font-medium">🔄 Mise à jour depuis un autre appareil</p>';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 1800);
}

function connectWs() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    wsSocket = new WebSocket(`${protocol}//${window.location.host}/ws`);

    wsSocket.onopen = () => {
        wsReconnectDelay = 1000;
        setWsStatus(true);
    };

    wsSocket.onmessage = (event) => {
        let message;
        try { message = JSON.parse(event.data); } catch (e) { return; }

        // Le client à l'origine de l'action a déjà mis à jour son propre DOM
        // après la réponse HTTP — on ignore l'écho pour éviter un double-refresh.
        if (message.originClientId === CLIENT_ID) return;

        showSyncToast();
        (wsHandlers[message.type] || []).forEach((handler) => handler(message.data));
    };

    wsSocket.onclose = () => {
        setWsStatus(false);
        setTimeout(connectWs, wsReconnectDelay);
        wsReconnectDelay = Math.min(wsReconnectDelay * 2, WS_MAX_DELAY);
    };

    wsSocket.onerror = () => {
        wsSocket.close();
    };
}
