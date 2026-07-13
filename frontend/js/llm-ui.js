// Modales de configuration LLM + affichage/interaction des recommandations IA.
// Contrairement à l'ancienne version front-end, la clé API n'est plus jamais
// manipulée ici : seuls le fournisseur et le modèle sont modifiables (la clé
// vit exclusivement dans le fichier .env du serveur).

const LLM_PROVIDER_LABELS = {
    gemini: 'Google Gemini',
    claude: 'Anthropic Claude',
    openai: 'OpenAI ChatGPT',
    mistral: 'Mistral AI'
};

const RECO_CATEGORY_META = {
    coeur_de_cible: { label: '🔥 Le Cœur de Cible', subtitle: 'Les Yeux Fermés — alignement parfait avec tes goûts' },
    peripherique: { label: '🌤️ Le Périphérique', subtitle: 'Les Challengers — un twist qui teste tes limites' },
    exotique: { label: "🌀 L'Exotique Hors Cadre", subtitle: 'La Tangente — rupture assumée, coup de foudre potentiel' }
};

async function openLlmSettingsModal() {
    const settings = await api.getLlmSettings();

    const providerOptions = Object.entries(LLM_PROVIDER_LABELS).map(([val, label]) => {
        const info = settings.availableProviders.find(p => p.provider === val);
        const badge = info?.hasApiKey ? ' ✅' : ' ⚠️ pas de clé';
        return `<option value="${val}" ${val === settings.provider ? 'selected' : ''}>${label}${badge}</option>`;
    }).join('');

    openModal(`
        <h3 class="text-xl font-bold text-indigo-300 mb-4">⚙️ Configurer l'IA</h3>
        <div class="space-y-3">
            <div>
                <label class="text-xs text-slate-400">Fournisseur</label>
                <select id="llm-provider-select" class="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-sm">${providerOptions}</select>
            </div>
            <div>
                <label class="text-xs text-slate-400">Modèle</label>
                <input type="text" id="llm-model-input" value="${escapeHtml(settings.model)}" class="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-sm font-mono">
            </div>
            <p class="text-[10px] text-slate-500">
                ${settings.hasApiKey
                    ? '✅ Une clé API est configurée pour ce fournisseur (côté serveur, jamais visible ici).'
                    : "⚠️ Aucune clé API configurée pour ce fournisseur. Ajoute-la dans le fichier .env du serveur (LLM_API_KEY_" + settings.provider.toUpperCase() + ") puis redémarre le serveur."}
            </p>
            <div class="border-t border-slate-700 pt-3">
                <button id="btn-test-llm-connection" onclick="testLlmConnection()" class="w-full bg-slate-700 hover:bg-slate-600 text-white py-2 rounded text-sm font-medium">🔌 Tester la connexion</button>
                <p id="llm-test-result" class="text-xs mt-2"></p>
            </div>
        </div>
        <div class="flex justify-end gap-2 mt-5">
            <button onclick="closeModal()" class="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded text-sm">Annuler</button>
            <button onclick="saveLlmSettings()" class="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded text-sm">Enregistrer</button>
        </div>
    `);
}

async function saveLlmSettings() {
    const provider = document.getElementById('llm-provider-select').value;
    const model = document.getElementById('llm-model-input').value.trim();
    await api.setLlmSettings(provider, model);
    closeModal();
}

// Teste la connexion au fournisseur LLM ACTUELLEMENT enregistré (pas le
// select non sauvegardé de la modale) — envoie un prompt minimal et vérifie
// la réponse, plus fiable qu'un simple contrôle de présence de clé.
async function testLlmConnection() {
    const btn = document.getElementById('btn-test-llm-connection');
    const resultEl = document.getElementById('llm-test-result');
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = '⏳ Test en cours...';
    resultEl.textContent = '';
    try {
        const result = await api.testLlmConnection();
        if (result.success) {
            resultEl.innerHTML = `<span class="text-emerald-400">✅ Connexion réussie (${result.provider}, ${result.model}, ${result.latencyMs}ms).</span>`;
        } else {
            resultEl.innerHTML = `<span class="text-rose-400">❌ Échec : ${escapeHtml(result.message)}</span>`;
        }
    } catch (err) {
        resultEl.innerHTML = `<span class="text-rose-400">❌ Erreur : ${escapeHtml(err.message)}</span>`;
    } finally {
        btn.disabled = false;
        btn.textContent = original;
    }
}

async function openRecommendationHistoryModal() {
    const rows = await api.getRecommendationHistory();

    const listHtml = rows.map(r => `
        <div class="flex items-center justify-between bg-slate-900 border border-slate-700 rounded px-3 py-2">
            <span class="text-sm text-slate-200">${escapeHtml(r.title)}</span>
            <span class="text-xs text-slate-500 font-mono">${(r.match_score !== null && r.match_score !== undefined) ? r.match_score + '%' : '—'} · ${escapeHtml(r.first_seen || '')}</span>
        </div>
    `).join('');

    openModal(`
        <h3 class="text-xl font-bold text-indigo-300 mb-1">📜 Historique des recommandations</h3>
        <p class="text-xs text-slate-500 mb-4">Tous les jeux déjà proposés par l'IA depuis le début. Ils ne sont plus reproposés lors des futures générations tant qu'ils restent ici.</p>
        <div class="space-y-2 mb-4 max-h-96 overflow-y-auto">${listHtml || '<p class="text-slate-500 text-sm italic">Aucun historique pour le moment.</p>'}</div>
        <div class="flex justify-between gap-2">
            ${rows.length > 0 ? `<button onclick="clearRecommendationHistory()" class="bg-rose-600 hover:bg-rose-500 text-white px-4 py-2 rounded text-sm">🗑️ Vider l'historique</button>` : '<span></span>'}
            <button onclick="closeModal()" class="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded text-sm">Fermer</button>
        </div>
    `);
}

async function clearRecommendationHistory() {
    if (!confirm("Vider tout l'historique des recommandations ? Le LLM pourra à nouveau proposer d'anciens jeux.")) return;
    await api.clearRecommendationHistory();
    openRecommendationHistoryModal();
}

// --- Modale Recommandations IA (contenu autrefois affiché en pleine page,
// maintenant dans sa propre modale — voir #reco-modal-overlay/#reco-modal-body
// dans index.html, plus large que la modale générique pour la grille de cartes) ---
function openRecommendationsModal() {
    document.getElementById('reco-modal-body').innerHTML = `
        <div class="space-y-4">
            <div class="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 class="text-xl font-semibold text-slate-200">🤖 Recommandations IA</h2>
                    <p class="text-xs text-slate-400">Analyse ta collection et propose 9 jeux personnalisés en 3 tiers (Cœur de Cible, Périphérique, Exotique), avec un score de correspondance ajustable. Les jeux déjà proposés ne sont jamais repris.</p>
                </div>
                <div class="flex gap-2">
                    <button onclick="openLlmSettingsModal()" class="bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm px-4 py-2 rounded whitespace-nowrap">⚙️ Configurer l'IA</button>
                    <button onclick="openRecommendationHistoryModal()" class="bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm px-4 py-2 rounded whitespace-nowrap">📜 Historique</button>
                    <button id="btn-generate-recommendations" onclick="generateRecommendations()" class="bg-indigo-600 hover:bg-indigo-500 text-white text-sm px-4 py-2 rounded whitespace-nowrap">✨ Recommander</button>
                </div>
            </div>
            <p id="recommendations-status" class="text-xs text-indigo-300"></p>
            <div id="recommendations-container" class="space-y-6">
                <p class="text-slate-500 text-sm italic">Aucune recommandation pour le moment. Clique sur ✨ Recommander pour lancer une première analyse.</p>
            </div>
            <div class="border-t border-slate-700 pt-4 space-y-2">
                <label class="text-xs text-slate-400">Autre précision (langage naturel, ex : "le jeu à 88% a l'air cool mais le temps réel me stresse en ce moment")</label>
                <textarea id="recommendations-global-feedback" rows="2" class="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-sm"></textarea>
                <button id="btn-refine-recommendations" onclick="refineRecommendations()" class="w-full bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-sm py-2 rounded font-medium">🔄 Affiner</button>
            </div>
            <div class="flex justify-end pt-2">
                <button onclick="closeRecommendationsModal()" class="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded text-sm">Fermer</button>
            </div>
        </div>
    `;
    document.getElementById('reco-modal-overlay').classList.remove('hidden');
    renderRecommendations();
}
function closeRecommendationsModal() {
    document.getElementById('reco-modal-overlay').classList.add('hidden');
}

function setRecommendationsLoading(isLoading, message) {
    const btnReco = document.getElementById('btn-generate-recommendations');
    const btnRefine = document.getElementById('btn-refine-recommendations');
    if (btnReco) btnReco.disabled = isLoading;
    if (btnRefine) btnRefine.disabled = isLoading;
    const status = document.getElementById('recommendations-status');
    if (status) status.textContent = isLoading ? (message || '⏳ Analyse en cours...') : '';
}

function showRecommendationsError(err) {
    const container = document.getElementById('recommendations-container');
    if (container) {
        container.innerHTML = `<div class="bg-rose-500/10 border border-rose-500/30 rounded-xl p-4 text-sm text-rose-300">⚠️ ${escapeHtml(err.message || String(err))}</div>`;
    }
}

async function generateRecommendations() {
    setRecommendationsLoading(true);
    try {
        await api.generateRecommendations();
        await renderRecommendations();
    } catch (err) {
        showRecommendationsError(err);
    } finally {
        setRecommendationsLoading(false);
    }
}

async function refineRecommendations() {
    const globalFeedbackEl = document.getElementById('recommendations-global-feedback');
    const userNote = globalFeedbackEl ? globalFeedbackEl.value.trim() : '';

    setRecommendationsLoading(true, '⏳ Recalibrage en cours...');
    try {
        await api.refineRecommendations(userNote);
        if (globalFeedbackEl) globalFeedbackEl.value = '';
        await renderRecommendations();
    } catch (err) {
        showRecommendationsError(err);
    } finally {
        setRecommendationsLoading(false);
    }
}

async function updateRecommendationFeedback(id, field, value) {
    await api.updateRecommendationFeedback(id, field, value);
}

function scoreColorClasses(score) {
    if (score >= 70) return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    if (score >= 40) return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
}

function recommendationCardHtml(r) {
    const scoreClasses = scoreColorClasses(r.match_score);
    const scoreIcon = r.match_score >= 70 ? '🎯' : (r.match_score >= 40 ? '📊' : '📉');
    const linkHtml = r.info_url
        ? `<a href="${escapeHtml(r.info_url)}" target="_blank" rel="noopener" class="text-indigo-400 hover:text-indigo-300 text-xs font-medium">🔗 Voir la fiche</a>`
        : '';
    const adjustedScore = r.user_feedback_score ?? 0;
    return `
        <div class="bg-slate-800 border ${scoreClasses.split(' ').find(c => c.startsWith('border-'))} rounded-xl p-4 space-y-3">
            <div class="flex items-start justify-between gap-2">
                <h4 class="font-semibold text-slate-100">${escapeHtml(r.title)}</h4>
                <span class="whitespace-nowrap px-2.5 py-0.5 rounded-full text-xs font-semibold border ${scoreClasses}">${scoreIcon} ${r.match_score}%</span>
            </div>
            <p class="text-sm text-slate-400">${escapeHtml(r.reason || '')}</p>
            ${linkHtml}
            <div class="border-t border-slate-700 pt-3 space-y-2">
                <label class="text-xs text-slate-400 flex items-center justify-between">
                    <span>Ajuster le score</span>
                    <span id="reco-score-val-${r.id}" class="font-mono">${adjustedScore > 0 ? '+' : ''}${adjustedScore}%</span>
                </label>
                <input type="range" min="-100" max="100" value="${adjustedScore}"
                    oninput="document.getElementById('reco-score-val-${r.id}').textContent = (this.value > 0 ? '+' : '') + this.value + '%'; updateRecommendationFeedback(${r.id}, 'user_feedback_score', parseInt(this.value, 10))"
                    class="w-full accent-indigo-500">
                <label class="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                    <input type="checkbox" ${r.user_disliked_style ? 'checked' : ''} class="accent-indigo-500"
                        onchange="updateRecommendationFeedback(${r.id}, 'user_disliked_style', this.checked ? 1 : 0)">
                    Le style visuel me déplaît (-50%)
                </label>
                <label class="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                    <input type="checkbox" ${r.user_already_done ? 'checked' : ''} class="accent-indigo-500"
                        onchange="updateRecommendationFeedback(${r.id}, 'user_already_done', this.checked ? 1 : 0)">
                    Déjà fait
                </label>
            </div>
        </div>
    `;
}

async function renderRecommendations() {
    const container = document.getElementById('recommendations-container');
    if (!container) return;

    const list = await api.getRecommendations();
    if (list.length === 0) {
        container.innerHTML = `<p class="text-slate-500 text-sm italic">Aucune recommandation pour le moment. Clique sur ✨ Recommander pour lancer une première analyse.</p>`;
        return;
    }

    const groups = { coeur_de_cible: [], peripherique: [], exotique: [], _autre: [] };
    list.forEach(r => {
        (groups[r.category] || groups._autre).push(r);
    });

    let html = '';
    ['coeur_de_cible', 'peripherique', 'exotique'].forEach(cat => {
        if (groups[cat].length === 0) return;
        const meta = RECO_CATEGORY_META[cat];
        html += `
            <div class="space-y-3">
                <div>
                    <h3 class="text-lg font-bold text-slate-100">${meta.label} <span class="text-xs font-normal text-slate-500">(${groups[cat].length} jeu${groups[cat].length > 1 ? 'x' : ''})</span></h3>
                    <p class="text-xs text-slate-500">${meta.subtitle}</p>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    ${groups[cat].map(recommendationCardHtml).join('')}
                </div>
            </div>
        `;
    });
    if (groups._autre.length > 0) {
        html += `
            <div class="space-y-3">
                <h3 class="text-lg font-bold text-slate-100">🎲 Autres suggestions</h3>
                <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    ${groups._autre.map(recommendationCardHtml).join('')}
                </div>
            </div>
        `;
    }

    container.innerHTML = html;
}

// --- Modale "État des connexions" : vue d'ensemble LLM + Steam avec test à la demande ---
async function openConnectionsStatusModal() {
    const [llmSettings, steamStatus] = await Promise.all([
        api.getLlmSettings(),
        api.getSteamStatus().catch(() => null)
    ]);

    const llmBadge = llmSettings.hasApiKey
        ? '<span class="text-emerald-400">✅ Clé configurée</span>'
        : '<span class="text-amber-400">⚠️ Pas de clé</span>';

    const steamConfigured = steamStatus?.configured;
    const steamBadge = steamConfigured
        ? '<span class="text-emerald-400">✅ Configuré</span>'
        : '<span class="text-amber-400">⚠️ Non configuré</span>';

    const steamLastSync = steamStatus?.lastSyncAt
        ? `Dernière synchro : ${new Date(steamStatus.lastSyncAt).toLocaleString('fr-FR')}`
        : 'Aucune synchronisation effectuée pour le moment.';
    const steamLastError = steamStatus?.lastSyncError
        ? `<p class="text-rose-400 text-[10px] mt-1">Dernière erreur : ${escapeHtml(steamStatus.lastSyncError)}</p>`
        : '';

    openModal(`
        <h3 class="text-xl font-bold text-indigo-300 mb-4">🔌 État des connexions</h3>
        <div class="space-y-4">
            <div class="bg-slate-900 border border-slate-700 rounded-lg p-3">
                <div class="flex items-center justify-between mb-1">
                    <span class="text-sm font-semibold text-slate-200">🤖 IA (${escapeHtml(llmSettings.provider)})</span>
                    ${llmBadge}
                </div>
                <p class="text-[10px] text-slate-500 mb-2">Modèle : ${escapeHtml(llmSettings.model)}</p>
                <button id="btn-status-test-llm" onclick="testLlmConnectionFromStatus()" class="w-full bg-slate-700 hover:bg-slate-600 text-white py-1.5 rounded text-xs font-medium">🔌 Tester la connexion</button>
                <p id="status-llm-test-result" class="text-xs mt-2"></p>
            </div>

            <div class="bg-slate-900 border border-slate-700 rounded-lg p-3">
                <div class="flex items-center justify-between mb-1">
                    <span class="text-sm font-semibold text-slate-200">🎮 Steam</span>
                    ${steamBadge}
                </div>
                <p class="text-[10px] text-slate-500 mb-1">${escapeHtml(steamLastSync)}</p>
                ${steamLastError}
                ${steamConfigured
                    ? `<button id="btn-status-test-steam" onclick="testSteamConnectionFromStatus()" class="w-full bg-slate-700 hover:bg-slate-600 text-white py-1.5 rounded text-xs font-medium mt-2">🔌 Tester la connexion</button>
                       <p id="status-steam-test-result" class="text-xs mt-2"></p>`
                    : `<p class="text-[10px] text-slate-500 mt-2">Renseigne STEAM_API_KEY et STEAM_ID dans le fichier .env du serveur pour activer la synchronisation.</p>`}
            </div>
        </div>
        <div class="flex justify-end mt-5">
            <button onclick="closeModal()" class="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded text-sm">Fermer</button>
        </div>
    `);
}

async function testLlmConnectionFromStatus() {
    const btn = document.getElementById('btn-status-test-llm');
    const resultEl = document.getElementById('status-llm-test-result');
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = '⏳ Test en cours...';
    try {
        const result = await api.testLlmConnection();
        resultEl.innerHTML = result.success
            ? `<span class="text-emerald-400">✅ Connexion réussie (${result.model}, ${result.latencyMs}ms).</span>`
            : `<span class="text-rose-400">❌ ${escapeHtml(result.message)}</span>`;
    } catch (err) {
        resultEl.innerHTML = `<span class="text-rose-400">❌ Erreur : ${escapeHtml(err.message)}</span>`;
    } finally {
        btn.disabled = false;
        btn.textContent = original;
    }
}

async function testSteamConnectionFromStatus() {
    const btn = document.getElementById('btn-status-test-steam');
    const resultEl = document.getElementById('status-steam-test-result');
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = '⏳ Test en cours...';
    try {
        const result = await api.testSteamConnection();
        resultEl.innerHTML = result.success
            ? `<span class="text-emerald-400">✅ Connexion réussie (${result.gameCount} jeu(x) détecté(s), ${result.latencyMs}ms).</span>`
            : `<span class="text-rose-400">❌ ${escapeHtml(result.message)}</span>`;
    } catch (err) {
        resultEl.innerHTML = `<span class="text-rose-400">❌ Erreur : ${escapeHtml(err.message)}</span>`;
    } finally {
        btn.disabled = false;
        btn.textContent = original;
    }
}

// Auto-détection du style d'un jeu via le LLM (bouton dans la modale editGame)
async function autoDetectGenre(gameId) {
    const btn = document.getElementById('btn-autodetect-genre-' + gameId);
    const originalLabel = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = '⏳...'; }

    try {
        await api.autoDetectGenre(gameId);
        await render();
        await editGame(gameId);
    } catch (err) {
        alert('Erreur lors de la détection automatique : ' + (err.message || err));
        if (btn) { btn.disabled = false; btn.textContent = originalLabel; }
    }
}
