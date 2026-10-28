// ==================== STATE ====================
let currentUser = null;
let isGuestMode = true;
let userSettings = null;
let recipes = [];
let searchTerm = '';
let searchTimeout = null;
let currentSort = 'date';
let currentOrder = 'desc';
let expandedRecipeId = null;
let selectedRecipeIds = new Set();
let editingRecipeId = null;
let isEditingAction = false;
let recipesSubscription = null;

// ==================== ПРИМЕР СТРУКТУРЫ ДЛЯ ИИ ====================
const recipeExample = {
    "name": "Суп из консервированной рыбы с плавленым сыром",
    "servings": 4,
    "activeTime": "10-12 мин",
    "totalTime": "~20 мин",
    "ingredients": [
        { "name": "Рыбные консервы в масле/томате", "quantity": 480, "unit": "г" },
        { "name": "Картофель", "quantity": 600, "unit": "г" },
        { "name": "Лук репчатый", "quantity": 100, "unit": "г" },
        { "name": "Зелёный лук", "quantity": 30, "unit": "г" },
        { "name": "Плавленый сыр", "quantity": 125, "unit": "г" },
        { "name": "Лавровый лист", "quantity": 2, "unit": "шт" },
        { "name": "Перец чёрный горошком", "quantity": 5, "unit": "шт" },
        { "name": "Соль", "quantity": 0, "unit": "по вкусу" },
        { "name": "Вода", "quantity": 2000, "unit": "мл" }
    ],
    "steps": [
        "Поставьте 2 л воды закипать.",
        "Картофель нарежьте мелким кубиком 1,5–2 см. Закиньте в кипяток, добавьте лук. Варите 12 мин.",
        "Добавьте консервы вместе с жидкостью, лавр, перец, плавленый сыр. Варите 3–5 мин, пока сыр не растворится. Посолите по вкусу.",
        "При подаче — зелёный лук."
    ],
    "notes": "Соль добавляйте осторожно: консервы солёные."
};
const recipeExampleText = JSON.stringify(recipeExample, null, 2);

// ==================== AUTH ====================
function showAuthModal() {
    document.getElementById('authModal').style.display = 'flex';
    const st = document.getElementById('authStatus');
    st.textContent = '';
    st.className = 'status-message';
    document.getElementById('loginEmail').value = '';
    document.getElementById('loginPassword').value = '';
}
function hideAuthModal() {
    document.getElementById('authModal').style.display = 'none';
    isEditingAction = false;
    editingRecipeId = null;
}
function showAuthStatus(msg, type) {
    const el = document.getElementById('authStatus');
    el.textContent = msg;
    el.className = 'status-message status-' + type;
}
async function loginUser() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    if (!email || !password) { showAuthStatus('Заполните все поля', 'error'); return; }
    try {
        await auth.signInWithEmailAndPassword(email, password);
        hideAuthModal();
        showStatus('Успешный вход', 'success');
        if (isEditingAction) {
            if (editingRecipeId) openEditForm(editingRecipeId);
            else openAddForm();
        }
    } catch (e) { showAuthStatus(getErrorMessage(e), 'error'); }
}
async function registerUser() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    if (!email || !password) { showAuthStatus('Заполните все поля', 'error'); return; }
    if (password.length < 6) { showAuthStatus('Пароль должен быть не менее 6 символов', 'error'); return; }
    try {
        await auth.createUserWithEmailAndPassword(email, password);
        hideAuthModal();
        showStatus('Аккаунт создан', 'success');
    } catch (e) { showAuthStatus(getErrorMessage(e), 'error'); }
}
function logoutUser() {
    if (currentUser) auth.signOut();
    currentUser = null;
    userSettings = null;
    isGuestMode = true;
    isEditingAction = false;
    editingRecipeId = null;
    selectedRecipeIds.clear();
    updateUIForAuthState();
    showStatus('Гостевой режим', 'info');
}
function checkAuthBeforeEdit(callback, id = null) {
    if (isGuestMode) {
        isEditingAction = true;
        editingRecipeId = id;
        showAuthModal();
    } else {
        callback(id);
    }
}
function getErrorMessage(error) {
    switch (error.code) {
        case 'auth/invalid-email': return 'Неверный формат email';
        case 'auth/user-disabled': return 'Пользователь заблокирован';
        case 'auth/user-not-found': return 'Пользователь не найден';
        case 'auth/wrong-password': return 'Неверный пароль';
        case 'auth/invalid-login-credentials': return 'Неверный email или пароль';
        case 'auth/email-already-in-use': return 'Email уже используется';
        case 'auth/weak-password': return 'Пароль слишком простой';
        case 'auth/network-request-failed': return 'Ошибка сети';
        default: return error.message || 'Произошла ошибка';
    }
}
function updateUIForAuthState() {
    const logoutBtn = document.getElementById('logoutBtn');
    const loginBtn = document.getElementById('loginBtnMain');
    const modeIndicator = document.getElementById('modeIndicator');
    const modeIcon = document.getElementById('modeIcon');
    const modeText = document.getElementById('modeText');
    const userInfo = document.getElementById('userInfo');
    const addBtn = document.getElementById('addRecipeBtn');

    if (isGuestMode) {
        logoutBtn.style.display = 'none';
        loginBtn.style.display = 'flex';
        modeIndicator.classList.remove('mode-authorized');
        modeIndicator.classList.add('mode-guest');
        modeIcon.className = 'fas fa-user';
        modeText.textContent = 'Гость';
        userInfo.textContent = 'Гостевой доступ';
        addBtn.innerHTML = '<i class="fas fa-lock"></i> Войдите для редактирования';
        addBtn.classList.remove('btn-success');
        addBtn.classList.add('btn-secondary');
    } else {
        logoutBtn.style.display = 'flex';
        loginBtn.style.display = 'none';
        modeIndicator.classList.remove('mode-guest');
        modeIndicator.classList.add('mode-authorized');
        modeIcon.className = 'fas fa-user-check';
        modeText.textContent = 'Редакт.';
        userInfo.textContent = `Пользователь: ${currentUser?.email || ''}`;
        addBtn.innerHTML = '<i class="fas fa-plus"></i> Добавить рецепт';
        addBtn.classList.remove('btn-secondary');
        addBtn.classList.add('btn-success');
    }
}

// ==================== THEME ====================
function switchTheme(theme, save = true) {
    const valid = ['arch', 'rosepine'];
    if (!valid.includes(theme)) theme = 'arch';
    document.body.classList.remove('theme-arch', 'theme-rosepine');
    document.body.classList.add('theme-' + theme);
    document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
    const btn = document.querySelector(`.theme-btn[data-theme="${theme}"]`);
    if (btn) btn.classList.add('active');
    const nameEl = document.getElementById('themeName');
    if (nameEl) nameEl.textContent = theme === 'arch' ? 'Arch Linux' : 'Rosé Pine';
    localStorage.setItem('recipeTheme', theme);
    if (!isGuestMode && userSettings && save) {
        userSettings.theme = theme;
        saveUserSettings();
    }
}
function loadSavedTheme() {
    const saved = localStorage.getItem('recipeTheme') || 'arch';
    switchTheme(saved, false);
}
async function loadUserSettings() {
    if (!currentUser) return;
    try {
        const doc = await db.collection('userSettings').doc(currentUser.uid).get();
        if (doc.exists) {
            userSettings = doc.data();
            if (userSettings.theme) switchTheme(userSettings.theme, false);
        }
    } catch (e) { console.error(e); }
}
async function saveUserSettings() {
    if (!currentUser || !userSettings) return;
    try {
        await db.collection('userSettings').doc(currentUser.uid).set({
            ...userSettings,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    } catch (e) { console.error(e); }
}

// ==================== INIT ====================
document.addEventListener('DOMContentLoaded', () => {
    loadSavedTheme();
    updateExampleDisplay();
    setupEventListeners();

    auth.onAuthStateChanged(async user => {
        if (user) {
            currentUser = user;
            isGuestMode = false;
            await loadUserSettings();
        } else {
            currentUser = null;
            isGuestMode = true;
            isEditingAction = false;
            editingRecipeId = null;
        }
        updateUIForAuthState();
        subscribeToRecipes();
    });
});

function subscribeToRecipes() {
    if (recipesSubscription) recipesSubscription();
    recipesSubscription = db.collection('recipes').onSnapshot(snapshot => {
        recipes = [];
        snapshot.forEach(doc => recipes.push({ id: doc.id, ...doc.data() }));
        [...selectedRecipeIds].forEach(id => {
            if (!recipes.find(r => r.id === id)) selectedRecipeIds.delete(id);
        });
        updateRecipesDisplay();
    }, err => {
        console.error('Ошибка подписки:', err);
        showStatus('Ошибка загрузки данных', 'error');
    });
}

// ==================== LISTENERS ====================
function setupEventListeners() {
    document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            switchTheme(this.getAttribute('data-theme'));
        });
    });

    document.getElementById('loginBtnMain')?.addEventListener('click', showAuthModal);
    document.getElementById('logoutBtn')?.addEventListener('click', logoutUser);
    document.getElementById('loginBtn')?.addEventListener('click', loginUser);
    document.getElementById('registerBtn')?.addEventListener('click', registerUser);
    document.getElementById('cancelAuthBtn')?.addEventListener('click', hideAuthModal);
    document.getElementById('closeAuthModal')?.addEventListener('click', hideAuthModal);

    const searchInput = document.getElementById('searchInput');
    searchInput?.addEventListener('input', e => performSearch(e.target.value));
    document.getElementById('clearSearchBtn')?.addEventListener('click', () => {
        searchInput.value = '';
        searchTerm = '';
        updateRecipesDisplay();
    });

    document.querySelectorAll('.sort-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const field = this.getAttribute('data-sort');
            if (currentSort === field) {
                currentOrder = currentOrder === 'asc' ? 'desc' : 'asc';
            } else {
                currentSort = field;
                currentOrder = field === 'name' ? 'asc' : 'desc';
            }
            updateSortButtons();
            updateRecipesDisplay();
        });
    });

    document.getElementById('addRecipeBtn')?.addEventListener('click', () => checkAuthBeforeEdit(openAddForm));
    document.getElementById('saveRecipeBtn')?.addEventListener('click', saveRecipe);
    document.getElementById('cancelAddBtn')?.addEventListener('click', closeAllForms);
    document.getElementById('addSampleTemplateBtn')?.addEventListener('click', insertExampleTemplate);
    document.getElementById('copyExampleBtn')?.addEventListener('click', copyExample);

    document.getElementById('updateRecipeBtn')?.addEventListener('click', updateRecipe);
    document.getElementById('cancelEditBtn')?.addEventListener('click', closeAllForms);
    document.getElementById('deleteRecipeBtn')?.addEventListener('click', deleteRecipe);

    document.getElementById('clearSelectionBtn')?.addEventListener('click', () => {
        selectedRecipeIds.clear();
        updateRecipesDisplay();
    });

    const authModal = document.getElementById('authModal');
    authModal?.addEventListener('click', e => {
        if (e.target === authModal) hideAuthModal();
    });

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && authModal?.style.display === 'flex') hideAuthModal();
    });
}

// ==================== DISPLAY ====================
function updateRecipesDisplay() {
    const container = document.getElementById('recipesContainer');
    if (!container) return;

    let filtered = [...recipes];

    if (searchTerm) {
        const term = searchTerm.toLowerCase();
        filtered = filtered.filter(r => {
            const nameMatch = r.name?.toLowerCase().includes(term);
            const ingMatch = r.ingredients?.some(i => i.name?.toLowerCase().includes(term));
            const stepMatch = r.steps?.some(s => s?.toLowerCase().includes(term));
            const notesMatch = r.notes?.toLowerCase().includes(term);
            return nameMatch || ingMatch || stepMatch || notesMatch;
        });
    }

    filtered = sortRecipes(filtered, currentSort, currentOrder);

    const info = document.getElementById('searchResultsInfo');
    if (searchTerm && info) {
        info.classList.remove('hidden');
        document.getElementById('resultsCount').textContent = filtered.length;
        document.getElementById('currentSearchTerm').textContent = searchTerm;
    } else if (info) {
        info.classList.add('hidden');
    }

    container.innerHTML = '';

    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="no-repairs">
                <i class="fas fa-search"></i>
                <p>${searchTerm ? `По запросу "${searchTerm}" ничего не найдено` : 'Нет рецептов. Добавьте первый!'}</p>
            </div>`;
        updateShoppingList();
        updateSelectedCount();
        return;
    }

    filtered.forEach(recipe => {
        const isExpanded = expandedRecipeId === recipe.id;
        const isSelected = selectedRecipeIds.has(recipe.id);

        const card = document.createElement('div');
        card.className = `recipe-card ${isExpanded ? 'expanded' : ''} ${isSelected ? 'selected' : ''}`;
        card.setAttribute('data-id', recipe.id);

        const ingPreview = (recipe.ingredients || []).slice(0, 5).map(i =>
            `${i.name} — ${formatAmount(i.quantity, i.unit)}`
        ).join(', ') + ((recipe.ingredients || []).length > 5 ? '…' : '');

        let nameHtml = recipe.name || 'Без названия';
        if (searchTerm) {
            const re = new RegExp(`(${escapeRegex(searchTerm)})`, 'gi');
            nameHtml = nameHtml.replace(re, '<span class="highlight">$1</span>');
        }

        card.innerHTML = `
            <div class="recipe-card-header">
                <input type="checkbox" class="recipe-checkbox" data-id="${recipe.id}" ${isSelected ? 'checked' : ''}>
                <div class="recipe-name">${nameHtml}</div>
                <div class="recipe-servings">${recipe.servings || '?'} порц.</div>
            </div>
            <div class="recipe-meta">
                ${recipe.activeTime ? `<span><i class="fas fa-fire"></i> ${recipe.activeTime}</span>` : ''}
                ${recipe.totalTime ? `<span><i class="fas fa-clock"></i> Всего: ${recipe.totalTime}</span>` : ''}
            </div>
            <div class="recipe-ingredients-preview">
                <strong>Ингредиенты:</strong> ${ingPreview || 'не указаны'}
            </div>
            ${isExpanded ? `<div class="recipe-card-details">${renderRecipeDetails(recipe)}</div>` : ''}
        `;

        const checkbox = card.querySelector('.recipe-checkbox');
        checkbox.addEventListener('click', e => {
            e.stopPropagation();
            if (checkbox.checked) selectedRecipeIds.add(recipe.id);
            else selectedRecipeIds.delete(recipe.id);
            card.classList.toggle('selected', checkbox.checked);
            updateShoppingList();
            updateSelectedCount();
        });

        card.addEventListener('click', e => {
            if (e.target.closest('input, button, .edit-recipe-btn')) return;
            expandedRecipeId = expandedRecipeId === recipe.id ? null : recipe.id;
            updateRecipesDisplay();
        });

        if (isExpanded) {
            const editBtn = card.querySelector('.edit-recipe-btn');
            if (editBtn) {
                editBtn.addEventListener('click', e => {
                    e.stopPropagation();
                    checkAuthBeforeEdit(openEditForm, recipe.id);
                });
            }
        }

        container.appendChild(card);
    });

    updateShoppingList();
    updateSelectedCount();
}

function renderRecipeDetails(recipe) {
    let html = '';

    if (recipe.ingredients?.length) {
        html += `
            <div class="details-section">
                <div class="details-title"><i class="fas fa-shopping-basket"></i> Ингредиенты</div>
                <ul class="ingredients-list">
                    ${recipe.ingredients.map(i => `
                        <li>
                            <span>${i.name || ''}</span>
                            <span class="ingredient-amount">${formatAmount(i.quantity, i.unit)}</span>
                        </li>
                    `).join('')}
                </ul>
            </div>`;
    }

    if (recipe.steps?.length) {
        html += `
            <div class="details-section">
                <div class="details-title"><i class="fas fa-list-ol"></i> Приготовление</div>
                <ol class="steps-list">
                    ${recipe.steps.map(s => `<li>${s || ''}</li>`).join('')}
                </ol>
            </div>`;
    }

    if (recipe.notes && recipe.notes.trim()) {
        html += `
            <div class="details-section">
                <div class="details-title"><i class="fas fa-sticky-note"></i> Примечания</div>
                <div class="recipe-notes">${recipe.notes}</div>
            </div>`;
    }

    html += `
        <div class="recipe-actions">
            <button class="btn btn-secondary edit-recipe-btn">
                <i class="fas fa-edit"></i> Редактировать
            </button>
        </div>`;

    return html;
}

function updateSelectedCount() {
    const wrap = document.getElementById('selectedCount');
    const num = document.getElementById('selectedCountNum');
    if (!wrap || !num) return;
    if (selectedRecipeIds.size > 0) {
        wrap.style.display = 'inline-flex';
        num.textContent = selectedRecipeIds.size;
    } else {
        wrap.style.display = 'none';
    }
}

function updateShoppingList() {
    const list = document.getElementById('shoppingList');
    const clearWrap = document.getElementById('clearSelectionWrap');
    if (!list) return;

    if (selectedRecipeIds.size === 0) {
        list.innerHTML = '<div class="no-items">Выберите рецепты (чекбоксы), чтобы сформировать список</div>';
        if (clearWrap) clearWrap.style.display = 'none';
        return;
    }

    const selected = recipes.filter(r => selectedRecipeIds.has(r.id));
    const aggregated = aggregateIngredients(selected);

    if (aggregated.length === 0) {
        list.innerHTML = '<div class="no-items">В выбранных рецептах нет ингредиентов</div>';
        if (clearWrap) clearWrap.style.display = 'block';
        return;
    }

    list.innerHTML = aggregated.map(item => `
        <div class="shopping-item">
            <span class="shopping-item-name">${item.name}</span>
            <span class="shopping-item-amount">${item.total}</span>
        </div>
    `).join('');

    if (clearWrap) clearWrap.style.display = 'block';
}

function aggregateIngredients(recipeList) {
    const map = new Map();

    recipeList.forEach(recipe => {
        (recipe.ingredients || []).forEach(ing => {
            const name = (ing.name || '').trim();
            const key = name.toLowerCase();
            if (!key) return;
            if (!map.has(key)) map.set(key, { name, amounts: [] });
            map.get(key).amounts.push({
                quantity: Number(ing.quantity) || 0,
                unit: (ing.unit || '').trim()
            });
        });
    });

    const result = [];
    map.forEach(({ name, amounts }) => {
        const numericGroups = new Map();
        const textUnits = new Set();

        amounts.forEach(({ quantity, unit }) => {
            if (quantity > 0) {
                numericGroups.set(unit, (numericGroups.get(unit) || 0) + quantity);
            } else if (unit) {
                textUnits.add(unit);
            }
        });

        const parts = [];
        numericGroups.forEach((total, unit) => parts.push(formatAmount(total, unit)));
        textUnits.forEach(t => parts.push(t));

        if (parts.length > 0) result.push({ name, total: parts.join(' + ') });
    });

    return result.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}

// ==================== FORMAT ====================
function formatAmount(qty, unit) {
    const u = (unit || '').trim();
    if (!qty) return u;
    const formatted = Number.isInteger(qty) ? qty.toString() : qty.toFixed(2).replace(/\.?0+$/, '');
    return `${formatted} ${u}`.trim();
}

// ==================== SORT & SEARCH ====================
function sortRecipes(list, sortBy, order) {
    return [...list].sort((a, b) => {
        let aV, bV;
        switch (sortBy) {
            case 'name':
                aV = (a.name || '').toLowerCase();
                bV = (b.name || '').toLowerCase();
                break;
            case 'servings':
                aV = Number(a.servings) || 0;
                bV = Number(b.servings) || 0;
                break;
            default:
                aV = a.createdAt?.seconds || 0;
                bV = b.createdAt?.seconds || 0;
        }
        let cmp = typeof aV === 'string' ? aV.localeCompare(bV) : (aV > bV ? 1 : aV < bV ? -1 : 0);
        return order === 'desc' ? -cmp : cmp;
    });
}

function updateSortButtons() {
    document.querySelectorAll('.sort-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-sort') === currentSort);
    });
}

function performSearch(term) {
    if (searchTimeout) clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        searchTerm = term.trim();
        expandedRecipeId = null;
        updateRecipesDisplay();
    }, 300);
}

// ==================== FORMS ====================
function updateExampleDisplay() {
    const el = document.getElementById('codeExampleText');
    if (el) el.textContent = recipeExampleText;
}

function insertExampleTemplate() {
    const input = document.getElementById('recipeJsonInput');
    input.value = recipeExampleText;
    input.focus();
}

function copyExample() {
    copyText(recipeExampleText)
        .then(() => showStatus('Пример скопирован', 'success'))
        .catch(() => showStatus('Не удалось скопировать', 'error'));
}

function copyText(text) {
    if (navigator.clipboard) return navigator.clipboard.writeText(text);
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    return Promise.resolve();
}

function openAddForm() {
    document.getElementById('addRecipeForm').classList.add('active');
    document.getElementById('editRecipeForm').classList.remove('active');
    document.getElementById('recipeJsonInput').value = '';
    document.getElementById('addRecipeForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function openEditForm(recipeId) {
    const recipe = recipes.find(r => r.id === recipeId);
    if (!recipe) return;
    editingRecipeId = recipeId;

    const dataToEdit = {
        name: recipe.name,
        servings: recipe.servings,
        activeTime: recipe.activeTime,
        totalTime: recipe.totalTime,
        ingredients: recipe.ingredients || [],
        steps: recipe.steps || [],
        notes: recipe.notes || ''
    };

    document.getElementById('editRecipeId').value = recipeId;
    document.getElementById('editRecipeJsonInput').value = JSON.stringify(dataToEdit, null, 2);
    document.getElementById('editRecipeForm').classList.add('active');
    document.getElementById('addRecipeForm').classList.remove('active');
    document.getElementById('editRecipeForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closeAllForms() {
    document.getElementById('addRecipeForm').classList.remove('active');
    document.getElementById('editRecipeForm').classList.remove('active');
    editingRecipeId = null;
    isEditingAction = false;
}

// ==================== PARSING ====================
function extractJson(text) {
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    return text;
}
function cleanJsonString(str) {
    str = str.replace(/^\uFEFF/, '');
    str = str.replace(/,\s*([}\]])/g, '$1');
    str = str.replace(/\/\/.*$/gm, '');
    str = str.replace(/\/\*[\s\S]*?\*\//g, '');
    return str.trim();
}
function parseRecipes(text) {
    text = cleanJsonString(extractJson(text));
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [parsed];
}
function validateRecipe(data) {
    if (!data || typeof data !== 'object') return 'Рецепт должен быть объектом';
    if (!data.name || typeof data.name !== 'string') return 'Не указано название рецепта (name)';
    if (!Array.isArray(data.ingredients)) return 'Поле ingredients должно быть массивом';
    if (data.ingredients.some(i => !i || !i.name)) return 'У каждого ингредиента должно быть имя (name)';
    if (!Array.isArray(data.steps)) return 'Поле steps должно быть массивом';
    return null;
}

// ==================== CRUD ====================
async function saveRecipe() {
    if (isGuestMode) { showStatus('Требуется авторизация', 'error'); return; }

    const text = document.getElementById('recipeJsonInput').value.trim();
    if (!text) { showStatus('Вставьте JSON рецепта', 'error'); return; }

    let recipesToSave;
    try {
        recipesToSave = parseRecipes(text);
    } catch (e) {
        showStatus('Ошибка парсинга JSON: ' + e.message, 'error');
        return;
    }

    for (const r of recipesToSave) {
        const error = validateRecipe(r);
        if (error) { showStatus('Ошибка: ' + error, 'error'); return; }
    }

    try {
        const batch = db.batch();
        recipesToSave.forEach(recipe => {
            const docRef = db.collection('recipes').doc();
            batch.set(docRef, {
                name: recipe.name.trim(),
                servings: Number(recipe.servings) || 1,
                activeTime: (recipe.activeTime || '').toString().trim(),
                totalTime: (recipe.totalTime || '').toString().trim(),
                ingredients: recipe.ingredients.map(i => ({
                    name: String(i.name).trim(),
                    quantity: Number(i.quantity) || 0,
                    unit: (i.unit || '').toString().trim()
                })),
                steps: recipe.steps.map(s => String(s).trim()).filter(Boolean),
                notes: (recipe.notes || '').toString().trim(),
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                authorUid: currentUser.uid
            });
        });
        await batch.commit();

        document.getElementById('recipeJsonInput').value = '';
        closeAllForms();
        showStatus(`Сохранено рецептов: ${recipesToSave.length}`, 'success');
    } catch (e) {
        console.error(e);
        showStatus('Ошибка сохранения: ' + e.message, 'error');
    }
}

async function updateRecipe() {
    if (isGuestMode) { showStatus('Требуется авторизация', 'error'); return; }
    const id = document.getElementById('editRecipeId').value;
    const text = document.getElementById('editRecipeJsonInput').value.trim();
    if (!id || !text) return;

    try {
        const parsed = JSON.parse(cleanJsonString(extractJson(text)));
        const recipe = Array.isArray(parsed) ? parsed[0] : parsed;
        const error = validateRecipe(recipe);
        if (error) { showStatus('Ошибка: ' + error, 'error'); return; }

        await db.collection('recipes').doc(id).update({
            name: recipe.name.trim(),
            servings: Number(recipe.servings) || 1,
            activeTime: (recipe.activeTime || '').toString().trim(),
            totalTime: (recipe.totalTime || '').toString().trim(),
            ingredients: recipe.ingredients.map(i => ({
                name: String(i.name).trim(),
                quantity: Number(i.quantity) || 0,
                unit: (i.unit || '').toString().trim()
            })),
            steps: recipe.steps.map(s => String(s).trim()).filter(Boolean),
            notes: (recipe.notes || '').toString().trim(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        closeAllForms();
        showStatus('Рецепт обновлён', 'success');
    } catch (e) {
        console.error(e);
        showStatus('Ошибка: ' + e.message, 'error');
    }
}

async function deleteRecipe() {
    if (isGuestMode) { showStatus('Требуется авторизация', 'error'); return; }
    const id = document.getElementById('editRecipeId').value;
    if (!id) return;
    if (!confirm('Удалить этот рецепт?')) return;

    try {
        await db.collection('recipes').doc(id).delete();
        selectedRecipeIds.delete(id);
        closeAllForms();
        showStatus('Рецепт удалён', 'success');
    } catch (e) {
        console.error(e);
        showStatus('Ошибка: ' + e.message, 'error');
    }
}

// ==================== UTILS ====================
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function showStatus(msg, type) {
    const el = document.getElementById('statusMessage');
    if (!el) return;
    el.textContent = msg;
    el.className = 'status-message status-' + type;
    setTimeout(() => { el.className = 'status-message'; }, 3500);
}