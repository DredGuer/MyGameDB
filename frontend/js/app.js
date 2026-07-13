// Logique de rendu et handlers CRUD. Portage direct de l'ancien frontend
// sql.js : le HTML généré reste identique, seul l'accès aux données change
// (fetch réseau via api.js au lieu de requêtes SQL synchrones in-memory).

// État des filtres
let searchQuery = '';
let statusFilter = 'all';
let sortBy = 'title';

// Tri individuel par console : surcharge le tri global (sortBy) pour une
// console précise si l'utilisateur en choisit un depuis la carte elle-même.
// Clé = console_id, valeur = 'title'|'hours'|'rating'|'date'. Persisté pour
// survivre à un rechargement de page.
let consoleSortOverrides = JSON.parse(localStorage.getItem('game_db_console_sort_overrides') || '{}');
function setConsoleSortOverride(consoleId, value) {
    if (value === '__global__') {
        delete consoleSortOverrides[consoleId];
    } else {
        consoleSortOverrides[consoleId] = value;
    }
    localStorage.setItem('game_db_console_sort_overrides', JSON.stringify(consoleSortOverrides));
    render();
}

// Consoles repliées (accordéon) : Set de console_id, persisté pour survivre
// à un rechargement de page et à un re-render (une console repliée le reste
// après une mutation ailleurs dans l'app).
let collapsedConsoles = new Set(JSON.parse(localStorage.getItem('game_db_collapsed_consoles') || '[]'));
function toggleConsoleCollapsed(consoleId) {
    const isNowCollapsed = !collapsedConsoles.has(consoleId);
    if (isNowCollapsed) {
        collapsedConsoles.add(consoleId);
    } else {
        collapsedConsoles.delete(consoleId);
    }
    localStorage.setItem('game_db_collapsed_consoles', JSON.stringify([...collapsedConsoles]));

    // Bascule directement dans le DOM déjà rendu, sans passer par render() :
    // un re-render complet vide puis reconstruit toute la page, ce qui fait
    // brièvement remonter le scroll (page plus courte pendant la reconstruction)
    // même en restaurant la position après coup — d'où un "flash" visuel.
    const body = document.getElementById(`console-body-${consoleId}`);
    const arrow = document.getElementById(`console-arrow-${consoleId}`);
    if (body) body.classList.toggle('hidden', isNowCollapsed);
    if (arrow) arrow.classList.toggle('-rotate-90', isNowCollapsed);
}

// Base de conversion heures -> jours (réglable, reste une préférence d'affichage
// locale au navigateur — cohérent avec l'ancienne version)
let hoursPerDay = parseFloat(localStorage.getItem('game_db_hours_per_day')) || 8;
function toDays(hours) {
    return (hours / hoursPerDay).toFixed(1);
}

let userBirthdate = null;

// Caches pour retrouver les données sans ré-échapper du HTML dans des onclick
let familiesCache = {};
let consolesCache = {};
let gamesCache = {};

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = (str === null || str === undefined) ? '' : String(str);
    return div.innerHTML;
}

function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' o';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' Ko';
    return (bytes / (1024 * 1024)).toFixed(2) + ' Mo';
}

// --- Modal générique ---
function openModal(html) {
    document.getElementById('modal-body').innerHTML = html;
    document.getElementById('modal-overlay').classList.remove('hidden');
}
function closeModal() {
    document.getElementById('modal-overlay').classList.add('hidden');
}

// --- Initialisation ---
async function initApp() {
    document.getElementById('modal-overlay').addEventListener('click', closeModal);

    const birthdateSetting = await api.getBirthdate();
    userBirthdate = birthdateSetting.value;

    bindFilterEvents();
    bindWsHandlers();
    connectWs();
    await render();
    initSteamButton();
}

// Affiche le bouton de synchronisation Steam seulement si STEAM_API_KEY/STEAM_ID
// sont configurés côté serveur (jamais de formulaire de credentials ici).
async function initSteamButton() {
    try {
        const status = await api.getSteamStatus();
        if (status.configured) {
            document.getElementById('btn-steam-sync').classList.remove('hidden');
            document.getElementById('btn-steam-sync').classList.add('flex');
        }
    } catch (e) { /* endpoint indisponible, tant pis, le bouton reste caché */ }
}
async function syncSteam() {
    const btn = document.getElementById('btn-steam-sync');
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = '⏳ Synchronisation en cours...';
    try {
        const report = await api.syncSteam();
        alert(`Synchronisation Steam terminée : ${report.created} créé(s), ${report.updated} mis à jour, ${report.skipped} inchangé(s)${report.errors ? `, ${report.errors} erreur(s)` : ''}.`);
        render();
    } catch (err) {
        alert('Erreur lors de la synchronisation Steam : ' + err.message);
    } finally {
        btn.disabled = false;
        btn.textContent = original;
    }
}

function bindFilterEvents() {
    document.getElementById('search-input').addEventListener('input', (e) => {
        searchQuery = e.target.value.trim().toLowerCase();
        render();
    });
    document.getElementById('filter-status').addEventListener('change', (e) => {
        statusFilter = e.target.value;
        render();
    });
    document.getElementById('sort-by').addEventListener('change', (e) => {
        sortBy = e.target.value;
        render();
    });

    const hpdInput = document.getElementById('hours-per-day-input');
    hpdInput.value = hoursPerDay;
    hpdInput.addEventListener('change', (e) => {
        let val = parseFloat(e.target.value);
        if (!val || val <= 0) val = 8;
        hoursPerDay = val;
        localStorage.setItem('game_db_hours_per_day', String(val));
        render();
    });

    const birthdateInput = document.getElementById('birthdate-input');
    birthdateInput.value = userBirthdate || '';
    birthdateInput.addEventListener('change', async (e) => {
        userBirthdate = e.target.value || null;
        await api.setBirthdate(userBirthdate);
        render();
    });

    document.getElementById('form-family').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('family-name').value.trim();
        if (!name) return;
        try {
            await api.createFamily(name);
            document.getElementById('family-name').value = '';
            render();
        } catch (err) {
            alert(err.code === 'CONFLICT' ? 'Cette famille existe déjà !' : err.message);
        }
    });

    document.getElementById('form-console').addEventListener('submit', async (e) => {
        e.preventDefault();
        const familyId = document.getElementById('console-family-select').value;
        const name = document.getElementById('console-name').value.trim();
        if (!name || !familyId) return;
        try {
            await api.createConsole(name, familyId);
            document.getElementById('console-name').value = '';
            render();
        } catch (err) {
            alert(err.code === 'CONFLICT' ? 'Cette console existe déjà !' : err.message);
        }
    });

    document.getElementById('form-game').addEventListener('submit', async (e) => {
        e.preventDefault();
        const consoleId = document.getElementById('game-console').value;
        const title = document.getElementById('game-title').value.trim();
        const hours = parseInt(document.getElementById('game-hours').value, 10) || 0;
        const completed = document.getElementById('game-completed').checked;
        const platformType = document.getElementById('game-platform').value;
        if (!consoleId || !title) return;

        try {
            await api.createGame({ console_id: consoleId, title, hours, completed, platform_type: platformType });
        } catch (err) {
            if (err.code === 'CONFLICT') {
                if (!confirm('Un jeu du même titre existe déjà (peut-être sur une autre plateforme). Créer quand même une fiche séparée ? Pour ajouter cette plateforme à la fiche existante à la place, ouvre le jeu existant et utilise "+ Ajouter" dans sa section Plateformes.')) return;
                await api.createGame({ console_id: consoleId, title, hours, completed, platform_type: platformType, allowDuplicate: true });
            } else {
                alert(err.message);
                return;
            }
        }
        document.getElementById('game-title').value = '';
        document.getElementById('game-hours').value = '';
        document.getElementById('game-completed').checked = false;
        render();
    });
}

// Rafraîchit la vue courante quand un événement WebSocket arrive d'un autre
// client — full re-render (cohérent avec le pattern déjà en place, volume de
// données modeste pour un usage mono-utilisateur/multi-appareils).
function bindWsHandlers() {
    const events = [
        'family:created', 'family:updated', 'family:deleted',
        'console:created', 'console:updated', 'console:deleted',
        'game:created', 'game:updated', 'game:deleted', 'game:platform-changed',
        'genre:created', 'genre:deleted', 'game:genre-changed',
        'screenshot:created', 'screenshot:updated', 'screenshot:deleted',
        'cover:updated', 'settings:updated'
    ];
    events.forEach(evt => onWsEvent(evt, () => render()));

    onWsEvent('recommendations:generated', () => renderRecommendations());
    onWsEvent('recommendations:feedback-updated', () => renderRecommendations());
    onWsEvent('db:restored', () => window.location.reload());
}

// --- IMPORT / EXPORT ---
function exportDB() {
    window.location.href = api.exportSqliteUrl();
}
function exportMarkdown() {
    window.location.href = api.exportMarkdownUrl();
}
async function importDB(input) {
    const file = input.files[0];
    if (!file) return;
    try {
        await api.restoreBackup(file);
        alert('Base de données SQLite importée avec succès !');
        window.location.reload();
    } catch (err) {
        alert("Erreur lors de l'import : " + err.message);
    }
    input.value = '';
}

// --- CRUD : Famille ---
function editFamily(id) {
    const name = familiesCache[id];
    if (name === undefined) return;
    openModal(`
        <h3 class="text-xl font-bold text-indigo-300 mb-4">Modifier la famille</h3>
        <label class="text-xs text-slate-400">Nom</label>
        <input type="text" id="modal-family-name" value="${escapeHtml(name)}" class="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-sm mb-4">
        <div class="flex justify-between gap-2">
            <button onclick="deleteFamily(${id})" class="bg-rose-600 hover:bg-rose-500 text-white px-4 py-2 rounded text-sm">🗑️ Supprimer</button>
            <div class="flex gap-2">
                <button onclick="closeModal()" class="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded text-sm">Annuler</button>
                <button onclick="saveFamilyEdit(${id})" class="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded text-sm">Enregistrer</button>
            </div>
        </div>
    `);
}
async function saveFamilyEdit(id) {
    const name = document.getElementById('modal-family-name').value.trim();
    if (!name) return;
    try {
        await api.updateFamily(id, name);
        closeModal();
        render();
    } catch (err) {
        alert(err.code === 'CONFLICT' ? 'Ce nom de famille existe déjà !' : err.message);
    }
}
async function deleteFamily(id) {
    if (!confirm('Supprimer cette famille supprimera aussi TOUTES ses consoles et TOUS ses jeux associés. Confirmer ?')) return;
    await api.deleteFamily(id);
    closeModal();
    render();
}

// --- CRUD : Console ---
async function editConsole(id) {
    const c = consolesCache[id];
    if (!c) return;
    const families = await api.getFamilies();
    const optionsHtml = families.map(f => `<option value="${f.id}" ${f.id === c.familyId ? 'selected' : ''}>${escapeHtml(f.name)}</option>`).join('');

    const periods = await api.getConsoleOwnershipPeriods(id);
    const periodsHtml = periods.map(p => `
        <div class="flex items-center justify-between bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-xs">
            <span class="text-slate-300">${p.date_start || '?'} → ${p.date_end || 'en cours'}</span>
            <button onclick="deleteConsoleOwnershipPeriod(${p.id}, ${id})" class="text-rose-400 hover:text-rose-300">🗑️</button>
        </div>
    `).join('');

    openModal(`
        <h3 class="text-xl font-bold text-indigo-300 mb-4">Modifier la console</h3>
        <label class="text-xs text-slate-400">Famille</label>
        <select id="modal-console-family" class="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-sm mb-3">${optionsHtml}</select>
        <label class="text-xs text-slate-400">Nom</label>
        <input type="text" id="modal-console-name" value="${escapeHtml(c.name)}" class="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-sm mb-4">

        <div class="border-t border-slate-700 pt-3 mb-4">
            <label class="text-xs text-slate-400 block mb-2">📅 Dates de possession de la console</label>
            <p class="text-[10px] text-slate-500 mb-2">Plusieurs périodes possibles si tu as revendu/racheté la machine.</p>
            <div class="space-y-1 mb-2">${periodsHtml || '<p class="text-slate-500 text-xs italic">Aucune période enregistrée.</p>'}</div>
            <div class="flex gap-2 items-end">
                <div class="flex-1">
                    <label class="text-[10px] text-slate-500">Acquise le</label>
                    <input type="date" id="new-period-console-start" class="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs">
                </div>
                <div class="flex-1">
                    <label class="text-[10px] text-slate-500">Cédée le (optionnel)</label>
                    <input type="date" id="new-period-console-end" class="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs">
                </div>
                <button onclick="addConsoleOwnershipPeriod(${id})" class="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded text-xs whitespace-nowrap">+ Ajouter</button>
            </div>
        </div>

        <div class="flex justify-between gap-2">
            <button onclick="deleteConsole(${id})" class="bg-rose-600 hover:bg-rose-500 text-white px-4 py-2 rounded text-sm">🗑️ Supprimer</button>
            <div class="flex gap-2">
                <button onclick="closeModal()" class="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded text-sm">Annuler</button>
                <button onclick="saveConsoleEdit(${id})" class="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded text-sm">Enregistrer</button>
            </div>
        </div>
    `);
}
async function addConsoleOwnershipPeriod(consoleId) {
    const start = document.getElementById('new-period-console-start').value;
    const end = document.getElementById('new-period-console-end').value || null;
    if (!start) { alert("Renseigne au moins une date d'acquisition."); return; }
    await api.addConsoleOwnershipPeriod(consoleId, start, end);
    render();
    editConsole(consoleId);
}
async function deleteConsoleOwnershipPeriod(periodId, consoleId) {
    await api.deleteConsoleOwnershipPeriod(periodId);
    render();
    editConsole(consoleId);
}
async function saveConsoleEdit(id) {
    const name = document.getElementById('modal-console-name').value.trim();
    const familyId = document.getElementById('modal-console-family').value;
    if (!name || !familyId) return;
    try {
        await api.updateConsole(id, name, familyId);
        closeModal();
        render();
    } catch (err) {
        alert(err.code === 'CONFLICT' ? 'Ce nom de console existe déjà !' : err.message);
    }
}
async function deleteConsole(id) {
    if (!confirm('Supprimer cette console supprimera aussi TOUS ses jeux associés. Confirmer ?')) return;
    await api.deleteConsole(id);
    closeModal();
    render();
}

// --- Gestion des styles de jeu (tags) ---
async function manageGenres() {
    const genres = await api.getGenres();
    const listHtml = genres.map(g => `
        <div class="flex items-center justify-between bg-slate-900 border border-slate-700 rounded px-3 py-2">
            <span class="text-sm text-slate-200">${escapeHtml(g.name)} <span class="text-xs text-slate-500">(${g.usage_count} jeu${g.usage_count > 1 ? 'x' : ''})</span></span>
            <button onclick="deleteGenre(${g.id})" class="text-rose-400 hover:text-rose-300 text-xs">🗑️</button>
        </div>
    `).join('');

    openModal(`
        <h3 class="text-xl font-bold text-indigo-300 mb-4">🏷️ Gérer les styles de jeu</h3>
        <div class="space-y-2 mb-4 max-h-64 overflow-y-auto">${listHtml || '<p class="text-slate-500 text-sm italic">Aucun style défini.</p>'}</div>
        <div class="flex gap-2">
            <input type="text" id="manage-new-genre-name" placeholder="Nouveau style (ex: Roguelike)" class="flex-1 bg-slate-900 border border-slate-600 rounded px-3 py-2 text-sm">
            <button onclick="createGenreStandalone()" class="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded text-sm">Ajouter</button>
        </div>
        <div class="flex justify-end mt-4">
            <button onclick="closeModal()" class="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded text-sm">Fermer</button>
        </div>
    `);
}
async function createGenreStandalone() {
    const input = document.getElementById('manage-new-genre-name');
    const name = input.value.trim();
    if (!name) return;
    try {
        await api.createGenre(name);
        manageGenres();
    } catch (err) {
        alert(err.code === 'CONFLICT' ? 'Ce style existe déjà !' : err.message);
    }
}
async function deleteGenre(id) {
    if (!confirm("Supprimer ce style ? Il sera retiré de tous les jeux qui l'utilisaient.")) return;
    await api.deleteGenre(id);
    render();
    manageGenres();
}
async function toggleGameGenre(gameId, genreId, isActive) {
    if (isActive) {
        await api.removeGameGenre(gameId, genreId);
    } else {
        await api.addGameGenre(gameId, genreId);
    }
    render();
    editGame(gameId);
}
async function addNewGenreInline(gameId) {
    const input = document.getElementById('new-genre-name');
    const name = input.value.trim();
    if (!name) return;
    try {
        const genre = await api.createGenre(name);
        await api.addGameGenre(gameId, genre.id);
        render();
        editGame(gameId);
    } catch (err) {
        alert(err.code === 'CONFLICT' ? 'Ce style existe déjà ! Sélectionne-le directement dans la liste des tags.' : err.message);
    }
}

// --- CRUD : Jeu ---
// `id` ici est un game_platform_id (identifie l'instance cliquée dans le
// tableau) : on en tire le gameId réel pour la fiche jeu et les sous-ressources
// (genres, screenshots, jaquettes), et platformInstanceId pour les heures/statut.
async function editGame(platformInstanceId) {
    const cached = gamesCache[platformInstanceId];
    if (!cached) return;
    const gameId = cached.gameId;
    const g = cached;

    const screenshots = await api.getScreenshots(gameId);
    const allGenres = await api.getGenres();
    const activeGenreIds = new Set(await api.getGameGenres(gameId));

    const genreChipsHtml = allGenres.map(genre => {
        const isActive = activeGenreIds.has(genre.id);
        return `<button onclick="toggleGameGenre(${gameId}, ${genre.id}, ${isActive})" class="px-2.5 py-1 rounded-full text-xs border transition ${isActive ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-900 border-slate-600 text-slate-400 hover:border-indigo-500'}">${escapeHtml(genre.name)}</button>`;
    }).join(' ');

    const platforms = await api.getGamePlatforms(gameId);
    const consoles = await api.getConsoles();
    const linkedConsoleIds = new Set(platforms.map(p => p.console_id));
    const availableConsoles = consoles.filter(c => !linkedConsoleIds.has(c.id));

    const platformsHtml = platforms.map(p => `
        <div class="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 space-y-1.5">
            <div class="flex items-center justify-between">
                <span class="text-sm font-medium text-slate-200">🕹️ ${escapeHtml(p.console_name)}</span>
                <button onclick="removeGamePlatform(${gameId}, ${p.id})" class="text-rose-400 hover:text-rose-300 text-xs">🗑️ Retirer</button>
            </div>
            <div class="grid grid-cols-3 gap-2">
                <div>
                    <label class="text-[10px] text-slate-500">Heures</label>
                    <input type="number" id="platform-hours-${p.id}" value="${p.hours}" min="0" class="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs font-mono">
                </div>
                <div>
                    <label class="text-[10px] text-slate-500">Support</label>
                    <select id="platform-type-${p.id}" class="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs">
                        <option value="Physique" ${p.platform_type === 'Physique' ? 'selected' : ''}>📀 Physique</option>
                        <option value="Dématérialisé" ${p.platform_type === 'Dématérialisé' ? 'selected' : ''}>☁️ Dématérialisé</option>
                    </select>
                </div>
                <div class="flex items-end">
                    <label class="flex items-center gap-1.5 cursor-pointer text-xs bg-slate-800 border border-slate-600 h-[26px] px-2 rounded select-none w-full">
                        <input type="checkbox" id="platform-completed-${p.id}" class="w-3.5 h-3.5 rounded accent-indigo-500" ${p.completed ? 'checked' : ''}>
                        <span>Terminé</span>
                    </label>
                </div>
            </div>
            <button onclick="savePlatformInstance(${gameId}, ${p.id})" class="w-full bg-indigo-600/80 hover:bg-indigo-500 text-white py-1 rounded text-xs">💾 Enregistrer cette plateforme</button>
        </div>
    `).join('');

    const addPlatformHtml = availableConsoles.length > 0 ? `
        <div class="flex gap-2 items-end mt-2">
            <div class="flex-1">
                <label class="text-[10px] text-slate-500">Ajouter une plateforme</label>
                <select id="new-platform-console" class="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-xs">
                    ${availableConsoles.map(c => `<option value="${c.id}">[${escapeHtml(c.family_name)}] ${escapeHtml(c.name)}</option>`).join('')}
                </select>
            </div>
            <button onclick="addGamePlatformInline(${gameId})" class="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded text-xs whitespace-nowrap">+ Ajouter</button>
        </div>
    ` : '<p class="text-slate-500 text-[10px] italic mt-2">Toutes les plateformes existantes sont déjà rattachées à ce jeu.</p>';

    const coverBlock = (side, path) => path
        ? `<div class="relative">
                <img src="/uploads/${path}" class="w-full h-32 object-cover rounded-lg border border-slate-600">
                <button onclick="removeCover(${gameId}, '${side}')" class="absolute top-1 right-1 bg-rose-600 hover:bg-rose-500 text-white text-xs w-6 h-6 rounded-full leading-none">✕</button>
           </div>`
        : `<label class="flex items-center justify-center h-32 border-2 border-dashed border-slate-600 rounded-lg cursor-pointer hover:border-indigo-500 text-slate-500 text-xs text-center px-2">
                + Ajouter
                <input type="file" accept="image/*" class="hidden" onchange="handleCoverUpload(${gameId}, '${side}', this)">
           </label>`;

    const screenshotsGridHtml = screenshots.map(ss => `
        <div class="bg-slate-900 rounded-lg border border-slate-700 overflow-hidden">
            <img src="/uploads/${ss.image_path}" class="w-full h-24 object-cover" alt="Screenshot">
            <div class="p-2 space-y-1">
                <input type="text" id="ss-title-${ss.id}" value="${escapeHtml(ss.title || '')}" placeholder="Titre" class="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs">
                <textarea id="ss-desc-${ss.id}" rows="2" placeholder="Description" class="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs">${escapeHtml(ss.description || '')}</textarea>
                <div class="flex justify-between items-center gap-1">
                    <button onclick="deleteScreenshot(${ss.id}, ${gameId})" class="text-rose-400 hover:text-rose-300 text-xs">🗑️ Suppr.</button>
                    <button onclick="saveScreenshotCaption(${ss.id}, this)" class="text-indigo-400 hover:text-indigo-300 text-xs font-medium">💾 Enreg.</button>
                </div>
            </div>
        </div>
    `).join('');

    openModal(`
        <h3 class="text-xl font-bold text-indigo-300 mb-4">Modifier le jeu</h3>
        <div class="space-y-3">
            <div>
                <label class="text-xs text-slate-400">Titre</label>
                <input type="text" id="modal-game-title" value="${escapeHtml(g.title)}" class="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-sm">
            </div>

            <div class="grid grid-cols-2 gap-3">
                <div>
                    <label class="text-xs text-slate-400 block mb-1">🎨 Jaquette avant</label>
                    ${coverBlock('front', g.coverFront)}
                </div>
                <div>
                    <label class="text-xs text-slate-400 block mb-1">🎨 Jaquette arrière</label>
                    ${coverBlock('back', g.coverBack)}
                </div>
            </div>

            <div class="border-t border-slate-700 pt-3">
                <div class="flex items-center justify-between mb-2">
                    <label class="text-xs text-slate-400">🏷️ Styles de jeu (combinables)</label>
                    <button id="btn-autodetect-genre-${gameId}" onclick="autoDetectGenre(${gameId})" class="bg-fuchsia-600 hover:bg-fuchsia-500 text-white px-2.5 py-1 rounded text-xs whitespace-nowrap">🤖 Auto-détecter le style</button>
                </div>
                <div class="flex flex-wrap gap-1.5 mb-2">${genreChipsHtml || '<span class="text-slate-500 text-xs italic">Aucun style défini — crée-en un ci-dessous.</span>'}</div>
                <div class="flex gap-2">
                    <input type="text" id="new-genre-name" placeholder="Nouveau style..." class="flex-1 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs">
                    <button onclick="addNewGenreInline(${gameId})" class="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1 rounded text-xs whitespace-nowrap">+ Créer et taguer</button>
                </div>
            </div>

            <div class="border-t border-slate-700 pt-3">
                <label class="text-xs text-slate-400 block mb-2">🕹️ Plateformes possédées</label>
                <p class="text-[10px] text-slate-500 mb-2">Un même jeu peut être possédé sur plusieurs plateformes (ex: PC et mobile) — heures et statut sont suivis séparément par plateforme.</p>
                <div class="space-y-2 mb-2">${platformsHtml || '<p class="text-slate-500 text-xs italic">Aucune plateforme enregistrée.</p>'}</div>
                ${addPlatformHtml}
            </div>

            <div>
                <label class="text-xs text-slate-400">Note globale (/10)</label>
                <input type="number" id="modal-game-rating" value="${g.rating === null || g.rating === undefined ? '' : g.rating}" min="0" max="10" placeholder="—" class="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-sm font-mono">
            </div>
            <div>
                <label class="text-xs text-slate-400">Notes / Commentaires</label>
                <textarea id="modal-game-notes" rows="3" class="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-sm">${escapeHtml(g.notes || '')}</textarea>
            </div>

            <div class="border-t border-slate-700 pt-3">
                <label class="text-xs text-slate-400 block mb-2">📸 Screenshots (${screenshots.length})</label>
                ${screenshots.length > 0 ? `<div class="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">${screenshotsGridHtml}</div>` : ''}
                <div class="bg-slate-900/50 border border-dashed border-slate-600 rounded-lg p-3 space-y-2">
                    <p class="text-xs text-slate-400">+ Ajouter un screenshot</p>
                    <input type="file" id="new-screenshot-file" accept="image/*" class="w-full text-xs text-slate-400">
                    <input type="text" id="new-screenshot-title" placeholder="Titre (optionnel)" class="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs">
                    <textarea id="new-screenshot-desc" rows="2" placeholder="Description (optionnelle)" class="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs"></textarea>
                    <button onclick="addScreenshot(${gameId})" class="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-1.5 rounded text-xs font-medium">Ajouter le screenshot</button>
                </div>
            </div>
        </div>
        <div class="flex justify-between gap-2 mt-5">
            <button onclick="deleteGame(${gameId})" class="bg-rose-600 hover:bg-rose-500 text-white px-4 py-2 rounded text-sm">🗑️ Supprimer le jeu</button>
            <div class="flex gap-2">
                <button onclick="closeModal()" class="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded text-sm">Annuler</button>
                <button onclick="saveGameEdit(${gameId})" class="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded text-sm">Enregistrer</button>
            </div>
        </div>
    `);
}
async function saveGameEdit(gameId) {
    const title = document.getElementById('modal-game-title').value.trim();
    const ratingRaw = document.getElementById('modal-game-rating').value;
    const rating = ratingRaw === '' ? null : Math.max(0, Math.min(10, parseInt(ratingRaw, 10)));
    const notes = document.getElementById('modal-game-notes').value.trim();

    if (!title) { alert('Le titre ne peut pas être vide.'); return; }

    await api.updateGame(gameId, { title, rating, notes });
    closeModal();
    render();
}

// Enregistre les heures/statut/support d'une instance de plateforme précise,
// puis rouvre la modale (comportement cohérent avec les autres sous-actions
// de la modale d'édition : ownership periods, screenshots...).
async function savePlatformInstance(gameId, platformInstanceId) {
    const hours = parseInt(document.getElementById(`platform-hours-${platformInstanceId}`).value, 10) || 0;
    const completed = document.getElementById(`platform-completed-${platformInstanceId}`).checked;
    const platformType = document.getElementById(`platform-type-${platformInstanceId}`).value;

    const wasCompleted = (gamesCache[platformInstanceId] && gamesCache[platformInstanceId].completed) || 0;
    const result = await api.updateGamePlatform(gameId, platformInstanceId, { hours, completed, platform_type: platformType });
    render();
    editGame(platformInstanceId);

    if (!wasCompleted && result.completed) {
        const title = gamesCache[platformInstanceId] ? gamesCache[platformInstanceId].title : '';
        celebrateCompletion(title);
    }
}
async function addGamePlatformInline(gameId) {
    const consoleId = document.getElementById('new-platform-console').value;
    if (!consoleId) return;
    const newInstance = await api.addGamePlatform(gameId, { console_id: consoleId, hours: 0, completed: false, platform_type: 'Physique' });
    // render() doit être attendu : il repeuple gamesCache, dont editGame a
    // besoin pour résoudre la nouvelle instance (sinon cache pas encore prêt).
    await render();
    editGame(newInstance.id);
}
async function removeGamePlatform(gameId, platformInstanceId) {
    if (!confirm('Retirer cette plateforme du jeu ? Les heures/statut associés à cette plateforme seront perdus.')) return;
    await api.removeGamePlatform(gameId, platformInstanceId);
    render();
    // La modale ne peut plus être adressée par l'instance retirée : on la ferme.
    closeModal();
}

// --- Petit effet WOUAHHH : célébration à la complétion d'un jeu ---
function celebrateCompletion(title) {
    const colors = ['#818cf8', '#34d399', '#fbbf24', '#f87171', '#60a5fa', '#f472b6', '#a78bfa'];
    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.inset = '0';
    container.style.pointerEvents = 'none';
    container.style.zIndex = '9997';
    document.body.appendChild(container);

    for (let i = 0; i < 70; i++) {
        const piece = document.createElement('div');
        piece.className = 'confetti-piece';
        const color = colors[Math.floor(Math.random() * colors.length)];
        const left = Math.random() * 100;
        const size = 6 + Math.random() * 8;
        const duration = 2 + Math.random() * 1.5;
        const delay = Math.random() * 0.4;
        const isCircle = Math.random() > 0.5;
        piece.style.left = left + 'vw';
        piece.style.width = size + 'px';
        piece.style.height = size + 'px';
        piece.style.background = color;
        piece.style.borderRadius = isCircle ? '50%' : '2px';
        piece.style.animationDuration = duration + 's';
        piece.style.animationDelay = delay + 's';
        container.appendChild(piece);
    }
    setTimeout(() => container.remove(), 4200);

    const toast = document.createElement('div');
    toast.className = 'celebration-toast bg-slate-800 border border-emerald-500/40 shadow-2xl px-6 py-4 rounded-xl';
    toast.innerHTML = `<p class="text-emerald-400 font-bold text-lg whitespace-nowrap">🏆 ${escapeHtml(title)} — Terminé ! Bravo !</p>`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3100);
}
async function deleteGame(id) {
    if (!confirm('Supprimer ce jeu ?')) return;
    await api.deleteGame(id);
    closeModal();
    render();
}

// --- Jaquettes (avant / arrière) ---
async function handleCoverUpload(gameId, side, input) {
    const file = input.files[0];
    if (!file) return;
    try {
        await api.uploadCover(gameId, side, file);
        render();
        editGame(gameId);
    } catch (e) {
        alert("Erreur lors de l'envoi de l'image.");
    }
    input.value = '';
}
async function removeCover(gameId, side) {
    if (!confirm('Supprimer cette jaquette ?')) return;
    await api.deleteCover(gameId, side);
    render();
    editGame(gameId);
}

// --- Screenshots ---
async function addScreenshot(gameId) {
    const fileInput = document.getElementById('new-screenshot-file');
    const titleInput = document.getElementById('new-screenshot-title');
    const descInput = document.getElementById('new-screenshot-desc');
    const file = fileInput.files[0];
    if (!file) { alert("Choisis d'abord une image."); return; }

    try {
        await api.addScreenshot(gameId, file, titleInput.value.trim(), descInput.value.trim());
        render();
        editGame(gameId);
    } catch (e) {
        alert("Erreur lors de l'envoi de l'image.");
    }
}
async function saveScreenshotCaption(ssId, btnEl) {
    const title = document.getElementById(`ss-title-${ssId}`).value.trim();
    const description = document.getElementById(`ss-desc-${ssId}`).value.trim();
    await api.updateScreenshot(ssId, title, description);
    const original = btnEl.textContent;
    btnEl.textContent = '✅ Enregistré';
    setTimeout(() => { btnEl.textContent = original; }, 1200);
}
async function deleteScreenshot(ssId, gameId) {
    if (!confirm('Supprimer ce screenshot ?')) return;
    await api.deleteScreenshot(ssId);
    render();
    editGame(gameId);
}

// --- Dashboard de statistiques globales ---
async function renderDashboard() {
    const dash = document.getElementById('dashboard-stats');
    const breakdown = document.getElementById('dashboard-breakdown');

    const stats = await api.getDashboardStats();
    const heavyStorage = stats.dbSizeBytes > 4 * 1024 * 1024;

    // Pastille "En ce moment" : dernière instance touchée (ajoutée ou
    // complétée), toutes plateformes confondues — un repère rapide façon
    // "quelle cartouche est encore dans la console", pas un simple total.
    const recent = stats.recentActivity;
    const recentBadge = recent ? `
        <div class="flex items-center gap-2.5 rounded-full bg-slate-900/60 border border-indigo-500/30 pl-1 pr-4 py-1 w-fit">
            <span class="flex items-center justify-center w-7 h-7 rounded-full bg-indigo-500/15 text-sm">🎮</span>
            <div class="leading-tight">
                <p class="text-[10px] uppercase tracking-wider text-indigo-300/80 font-semibold">En ce moment</p>
                <p class="text-xs text-slate-200"><span class="font-semibold">${escapeHtml(recent.title)}</span> <span class="text-slate-500">·</span> ${escapeHtml(recent.console_name)} ${recent.completed ? '· ✅' : ''}</p>
            </div>
        </div>
    ` : '';

    // Hiérarchie en deux niveaux : une tuile héro (heures totales, le vrai
    // chiffre qui résume "combien j'ai joué") + une grille de tuiles
    // secondaires plus discrètes, au lieu de 5 tuiles au poids identique.
    dash.innerHTML = `
        <div class="md:col-span-2 bg-gradient-to-br from-indigo-600/20 via-slate-800 to-slate-800 p-5 rounded-2xl border border-indigo-500/30 flex flex-col justify-between gap-3">
            <div>
                <p class="text-xs text-indigo-300/80 uppercase tracking-wider font-semibold">Heures totales</p>
                <p class="font-mono text-4xl font-bold text-white tabular-nums leading-tight">${stats.totalHours}<span class="text-lg text-indigo-300/70 ml-1">h</span></p>
                <p class="text-xs text-slate-400 mt-1">≈ ${toDays(stats.totalHours)} j de jeu (base ${hoursPerDay}h/j)</p>
            </div>
            ${recentBadge}
        </div>
        <div class="bg-slate-800 p-4 rounded-xl border border-slate-700">
            <p class="text-xs text-slate-400">Complétion</p>
            <p class="font-mono text-2xl font-bold text-emerald-400 tabular-nums">${stats.completionPct}%</p>
            <p class="text-xs text-slate-500">${stats.completedCount}/${stats.totalGames} jeux</p>
        </div>
        <div class="bg-slate-800 p-4 rounded-xl border border-slate-700">
            <p class="text-xs text-slate-400">Jeu le + chronophage</p>
            <p class="text-base font-bold text-amber-400 truncate">${stats.topGame ? escapeHtml(stats.topGame.title) : '—'}</p>
            <p class="text-xs text-slate-500 font-mono">${stats.topGame ? stats.topGame.hours + ' h' : ''}</p>
        </div>
        <div class="bg-slate-800 p-4 rounded-xl border border-slate-700">
            <p class="text-xs text-slate-400">Collection</p>
            <p class="font-mono text-2xl font-bold text-slate-200 tabular-nums">${stats.totalGames}</p>
            <p class="text-xs text-slate-500">jeux enregistrés</p>
        </div>
        <div class="bg-slate-800 p-4 rounded-xl border ${heavyStorage ? 'border-amber-500/50' : 'border-slate-700'}">
            <p class="text-xs text-slate-400">Poids de la base</p>
            <p class="font-mono text-2xl font-bold tabular-nums ${heavyStorage ? 'text-amber-400' : 'text-slate-200'}">${formatBytes(stats.dbSizeBytes)}</p>
            <p class="text-xs text-slate-500">${heavyStorage ? '⚠️ Pense à exporter le .sqlite' : 'stockage local'}</p>
        </div>
    `;

    const famHours = await api.getFamilyBreakdown();
    if (famHours.length > 1 && stats.totalHours > 0) {
        const maxH = Math.max(...famHours.map(r => r.hours), 1);
        let barsHtml = `<div class="bg-slate-800 p-4 rounded-xl border border-slate-700 space-y-2"><p class="text-xs text-slate-400 mb-2">Répartition des heures par famille</p>`;
        famHours.forEach(({ name, hours }) => {
            const widthPct = Math.round((hours / maxH) * 100);
            barsHtml += `
                <div class="flex items-center gap-3">
                    <span class="text-xs text-slate-300 w-28 truncate">${escapeHtml(name)}</span>
                    <div class="flex-1 bg-slate-900 rounded-full h-3 overflow-hidden">
                        <div class="bg-indigo-500 h-3 rounded-full" style="width:${widthPct}%"></div>
                    </div>
                    <span class="text-xs text-slate-400 font-mono tabular-nums w-24 text-right">${hours} h <span class="text-slate-600">(${toDays(hours)}j)</span></span>
                </div>
            `;
        });
        barsHtml += `</div>`;
        breakdown.innerHTML = barsHtml;
    } else {
        breakdown.innerHTML = '';
    }

    await renderGenreStats();
    await renderAgeGenreAnalysis();
}

async function renderGenreStats() {
    const container = document.getElementById('dashboard-genre-stats');
    if (!container) return;
    const rows = await api.getGenreBreakdown();
    if (rows.length === 0) {
        container.innerHTML = '';
        return;
    }
    const maxH = Math.max(...rows.map(r => r.total_hours), 1);
    let html = `<div class="bg-slate-800 p-4 rounded-xl border border-slate-700 space-y-2">
        <p class="text-xs text-slate-400 mb-2">🏷️ Répartition des heures par style de jeu</p>`;
    rows.forEach(({ name, game_count, total_hours }) => {
        const widthPct = Math.round((total_hours / maxH) * 100);
        html += `
            <div class="flex items-center gap-3">
                <span class="text-xs text-slate-300 w-28 truncate">${escapeHtml(name)}</span>
                <div class="flex-1 bg-slate-900 rounded-full h-3 overflow-hidden">
                    <div class="bg-fuchsia-500 h-3 rounded-full" style="width:${widthPct}%"></div>
                </div>
                <span class="text-xs text-slate-400 font-mono w-28 text-right">${total_hours} h <span class="text-slate-600">(${game_count} jeu${game_count > 1 ? 'x' : ''})</span></span>
            </div>
        `;
    });
    html += `</div>`;
    container.innerHTML = html;
}

async function renderAgeGenreAnalysis() {
    const container = document.getElementById('dashboard-age-genre');
    if (!container) return;

    if (!userBirthdate) {
        container.innerHTML = `
            <div class="bg-slate-800 p-4 rounded-xl border border-dashed border-slate-700 text-center">
                <p class="text-sm text-slate-400">🎂 Renseigne ta date de naissance (en haut) pour activer l'analyse "styles de jeu par âge".</p>
            </div>
        `;
        return;
    }

    const stats = await api.getAgeGenreAnalysis();
    if (!stats || Object.keys(stats.buckets).length === 0) {
        container.innerHTML = `
            <div class="bg-slate-800 p-4 rounded-xl border border-dashed border-slate-700 text-center">
                <p class="text-sm text-slate-400">Pas encore assez de données datées pour cette analyse. Ajoute des dates de possession sur tes jeux ou tes consoles.</p>
            </div>
        `;
        return;
    }

    const sortedLabels = Object.keys(stats.buckets).sort((a, b) => stats.buckets[a].start - stats.buckets[b].start);

    let html = `<div class="bg-slate-800 p-4 rounded-xl border border-slate-700 space-y-4">
        <p class="text-xs text-slate-400">🎂 Styles de jeu par tranche d'âge</p>`;

    sortedLabels.forEach(label => {
        const bucket = stats.buckets[label];
        const genreEntries = Object.entries(bucket.genres).sort((a, b) => b[1] - a[1]);
        const maxGenreHours = Math.max(...genreEntries.map(e => e[1]), 1);

        html += `<div>
            <div class="flex items-center justify-between mb-1.5">
                <span class="text-sm font-semibold text-indigo-300">${label}</span>
                <span class="text-xs text-slate-500 font-mono">${bucket.totalHours} h</span>
            </div>
            <div class="space-y-1 pl-2 border-l-2 border-slate-700">`;

        genreEntries.forEach(([gname, h]) => {
            const widthPct = Math.round((h / maxGenreHours) * 100);
            html += `
                <div class="flex items-center gap-2">
                    <span class="text-xs text-slate-400 w-28 truncate">${escapeHtml(gname)}</span>
                    <div class="flex-1 bg-slate-900 rounded-full h-2.5 overflow-hidden">
                        <div class="bg-emerald-500 h-2.5 rounded-full" style="width:${widthPct}%"></div>
                    </div>
                    <span class="text-xs text-slate-500 font-mono w-12 text-right">${h} h</span>
                </div>
            `;
        });

        html += `</div></div>`;
    });

    if (stats.estimatedCount > 0) {
        html += `<p class="text-[10px] text-slate-500 italic">≈ ${stats.estimatedCount} jeu(x) sans date propre : âge estimé via la console ou la date d'ajout.</p>`;
    }
    if (stats.excludedCount > 0) {
        html += `<p class="text-[10px] text-amber-500 italic">⚠️ ${stats.excludedCount} jeu(x) exclu(s) : date antérieure à la naissance renseignée.</p>`;
    }

    html += `</div>`;
    container.innerHTML = html;
}

// --- Rendu de l'interface graphique globale ---
async function render() {
    const selectFamily = document.getElementById('console-family-select');
    const selectConsole = document.getElementById('game-console');
    const mainContainer = document.getElementById('main-container');

    familiesCache = {};
    consolesCache = {};
    gamesCache = {};

    await renderDashboard();
    await renderRecommendations();

    const families = await api.getFamilies();
    const consoles = await api.getConsoles();
    // Une seule requête agrégée pour éviter le N+1 (un jeu peut avoir plusieurs tags)
    const gameGenresMap = await api.getGenresByGame();

    selectFamily.innerHTML = '<option value="">-- Sélectionner la famille --</option>';
    selectConsole.innerHTML = '<option value="">-- Sélectionner la console --</option>';

    families.forEach(f => {
        familiesCache[f.id] = f.name;
        const opt = document.createElement('option');
        opt.value = f.id;
        opt.textContent = f.name;
        selectFamily.appendChild(opt);
    });

    consoles.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = `[${c.family_name}] ${c.name}`;
        selectConsole.appendChild(opt);
    });

    if (families.length === 0) {
        mainContainer.innerHTML = `<div class="text-center text-slate-500 py-10">Aucune donnée disponible. Commencez par créer une Famille de consoles !</div>`;
        return;
    }

    mainContainer.innerHTML = '';
    const filterActive = searchQuery !== '' || statusFilter !== 'all';
    let anyRendered = false;

    const toSortParam = (val) => val === 'hours' ? 'hours' : val === 'rating' ? 'rating' : val === 'date' ? 'date_added' : 'title';
    const completedParam = statusFilter === 'completed' ? '1' : statusFilter === 'ongoing' ? '0' : undefined;

    for (const family of families) {
        const consolesOfFamily = consoles.filter(c => c.family_id === family.id);

        const consolesWithGames = [];
        for (const c of consolesOfFamily) {
            consolesCache[c.id] = { name: c.name, familyId: family.id };
            const effectiveSort = toSortParam(consoleSortOverrides[c.id] || sortBy);
            const games = await api.getGames({ console_id: c.id, search: searchQuery || undefined, completed: completedParam, sort: effectiveSort });
            consolesWithGames.push({ consoleId: c.id, consoleName: c.name, games });
        }

        const visibleConsoles = filterActive
            ? consolesWithGames.filter(c => c.games.length > 0)
            : consolesWithGames;

        if (filterActive && visibleConsoles.length === 0) continue;

        anyRendered = true;

        const familySection = document.createElement('div');
        familySection.className = 'space-y-4';
        familySection.innerHTML = `
            <div class="flex items-center justify-between border-b border-indigo-500/30 pb-2">
                <h2 class="text-2xl font-bold text-indigo-300">📁 Famille : ${escapeHtml(family.name)}</h2>
                <button onclick="editFamily(${family.id})" class="text-slate-400 hover:text-indigo-400 transition text-sm">✏️ Modifier</button>
            </div>
        `;

        const familyGrid = document.createElement('div');
        familyGrid.className = 'grid grid-cols-1 gap-6';
        familySection.appendChild(familyGrid);

        if (!filterActive && visibleConsoles.length === 0) {
            const p = document.createElement('p');
            p.className = 'text-slate-500 text-sm italic pl-2';
            p.textContent = 'Aucune console enregistrée dans cette famille.';
            familySection.appendChild(p);
        }

        for (const { consoleId, consoleName, games } of visibleConsoles) {
            const card = document.createElement('div');
            card.className = 'bg-slate-800 rounded-xl border border-slate-700 overflow-hidden shadow-lg';

            const isCollapsed = collapsedConsoles.has(consoleId);
            const consoleSortValue = consoleSortOverrides[consoleId] || '__global__';
            const consoleSortSelect = `
                <select onclick="event.stopPropagation()" onchange="setConsoleSortOverride(${consoleId}, this.value)" class="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-slate-300">
                    <option value="__global__" ${consoleSortValue === '__global__' ? 'selected' : ''}>Tri : global (${sortBy === 'hours' ? 'Heures' : sortBy === 'rating' ? 'Note' : sortBy === 'date' ? 'Date' : 'Titre'})</option>
                    <option value="title" ${consoleSortValue === 'title' ? 'selected' : ''}>Titre (A-Z)</option>
                    <option value="hours" ${consoleSortValue === 'hours' ? 'selected' : ''}>Heures (desc)</option>
                    <option value="rating" ${consoleSortValue === 'rating' ? 'selected' : ''}>Note (desc)</option>
                    <option value="date" ${consoleSortValue === 'date' ? 'selected' : ''}>Date d'ajout (récent)</option>
                </select>
            `;

            let cardHtml = `
                <div class="bg-slate-700/40 px-5 py-3 border-b border-slate-700 flex flex-wrap justify-between items-center gap-2 cursor-pointer" onclick="toggleConsoleCollapsed(${consoleId})">
                    <h3 class="font-bold text-lg text-slate-200 flex items-center gap-2">
                        <span id="console-arrow-${consoleId}" class="text-sm transition-transform ${isCollapsed ? '-rotate-90' : ''}">▼</span>
                        🕹️ ${escapeHtml(consoleName)}
                    </h3>
                    <div class="flex items-center gap-3">
                        <span class="text-xs bg-slate-900 px-2 py-1 rounded text-slate-400 font-mono">${games.length} jeu(x)</span>
                        ${games.length > 0 ? consoleSortSelect : ''}
                        <button onclick="event.stopPropagation(); editConsole(${consoleId})" class="text-slate-400 hover:text-indigo-400 transition text-sm">✏️</button>
                    </div>
                </div>
                <div id="console-body-${consoleId}" class="p-4 ${isCollapsed ? 'hidden' : ''}">
            `;

            if (games.length === 0) {
                cardHtml += `<p class="text-slate-500 text-sm italic">Aucun jeu sur cette machine.</p>`;
            } else {
                cardHtml += `
                    <div class="overflow-x-auto">
                        <table class="w-full text-left text-sm text-slate-300">
                            <thead class="text-xs uppercase bg-slate-900/50 text-slate-400 border-b border-slate-700">
                                <tr>
                                    <th class="p-3"></th>
                                    <th class="p-3">Jeu</th>
                                    <th class="p-3 text-center">Support</th>
                                    <th class="p-3 text-center">Temps</th>
                                    <th class="p-3 text-center">Note</th>
                                    <th class="p-3 text-center">Statut</th>
                                </tr>
                            </thead>
                            <tbody>
                `;

                for (const game of games) {
                    // Indexé par instance (game_platform_id), pas par game.id : un
                    // même jeu peut apparaître sous plusieurs consoles (ex: Waven
                    // sur PC et sur mobile) et écraserait sinon la 1re entrée.
                    gamesCache[game.game_platform_id] = {
                        gameId: game.id, title: game.title, hours: game.hours, completed: game.completed,
                        platformType: game.platform_type, rating: game.rating, notes: game.notes,
                        dateCompleted: game.date_completed, coverFront: game.cover_front, coverBack: game.cover_back
                    };

                    const gameGenres = gameGenresMap[game.id] || [];

                    const platformIcon = game.platform_type === 'Dématérialisé' ? '☁️' : '📀';
                    const ratingDisplay = (game.rating !== null && game.rating !== undefined)
                        ? `⭐ ${game.rating}/10`
                        : '<span class="text-slate-600">—</span>';
                    const notesIndicator = (game.notes && String(game.notes).trim())
                        ? `<span title="${escapeHtml(game.notes)}" class="cursor-help">📝</span>`
                        : '';
                    const thumbHtml = game.cover_front
                        ? `<img src="/uploads/${game.cover_front}" class="w-10 h-10 object-cover rounded border border-slate-600">`
                        : `<div class="w-10 h-10 rounded border border-slate-700 bg-slate-900 flex items-center justify-center text-slate-600 text-xs">🎮</div>`;
                    const tagsHtml = gameGenres.length
                        ? `<div class="flex flex-wrap gap-1 mt-1">${gameGenres.map(gn => `<span class="text-[10px] bg-slate-700/60 text-slate-300 px-1.5 py-0.5 rounded">${escapeHtml(gn)}</span>`).join('')}</div>`
                        : '';

                    // Liseré de statut sur le bord gauche de la ligne : l'état
                    // (terminé/en cours) se lit d'un coup d'œil sans avoir à
                    // parcourir jusqu'à la colonne Statut, même en scroll horizontal.
                    const statusStripe = game.completed ? 'border-l-2 border-l-emerald-500/70' : 'border-l-2 border-l-amber-500/50';

                    cardHtml += `
                        <tr class="${statusStripe} border-b border-slate-700/50 hover:bg-indigo-500/[0.06] cursor-pointer transition-colors group" onclick="editGame(${game.game_platform_id})">
                            <td class="p-3">${thumbHtml}</td>
                            <td class="p-3 font-medium text-slate-100 group-hover:text-white transition-colors">${escapeHtml(game.title)} ${notesIndicator}${tagsHtml}</td>
                            <td class="p-3 text-center">${platformIcon}</td>
                            <td class="p-3 text-center font-mono tabular-nums">
                                ${game.hours} h
                                <div class="text-[10px] text-slate-500 font-sans">≈ ${toDays(game.hours)} j</div>
                            </td>
                            <td class="p-3 text-center text-xs">${ratingDisplay}</td>
                            <td class="p-3 text-center">
                                ${game.completed
                                    ? '<span class="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-0.5 rounded-full text-xs font-semibold">✅ Terminé</span>'
                                    : '<span class="bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2.5 py-0.5 rounded-full text-xs font-semibold">⏳ En cours</span>'}
                            </td>
                        </tr>
                    `;
                }

                cardHtml += `</tbody></table></div>`;
            }

            cardHtml += `</div>`;
            card.innerHTML = cardHtml;
            familyGrid.appendChild(card);
        }

        mainContainer.appendChild(familySection);
    }

    if (!anyRendered && filterActive) {
        mainContainer.innerHTML = `<div class="text-center text-slate-500 py-10">Aucun résultat pour ces filtres.</div>`;
    }
}

// Lancement au chargement de la page
initApp();
