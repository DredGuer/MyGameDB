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
