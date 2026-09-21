/* ============================================================
   APEX RENTAL — script.js
   SIMULATION RP UNIQUEMENT — localStorage n'est pas un système
   sécurisé de production, il sert uniquement à simuler des
   comptes/réservations dans le cadre du jeu de rôle.
   ============================================================ */

/* ============================================================
   1. DONNÉES CENTRALISÉES
   ============================================================ */

/* Les catégories de véhicules vivent dans la table Supabase
   "vehicle_categories" (code, label, tarifs) — le Directeur (grade 10)
   ou l'admin peuvent en ajouter de nouvelles depuis admin/flotte.html.
   On les met en cache après le premier chargement de chaque page. */
let _categoriesCache = null;

function mapCategoryRow(row) {
    return {
        code: row.code,
        label: row.label,
        price4h: Number(row.price_4h),
        price24h: Number(row.price_24h),
        price7d: Number(row.price_7d),
        depositMin: Number(row.deposit_min),
        depositMax: Number(row.deposit_max)
    };
}

async function getAllCategories() {
    if (_categoriesCache) return _categoriesCache;
    const { data, error } = await supabaseClient.from("vehicle_categories").select("*").order("code");
    if (error) {
        console.error("getAllCategories:", error);
        return [];
    }
    _categoriesCache = data.map(mapCategoryRow);
    return _categoriesCache;
}

/* Réservé au Directeur (grade 10) / admin côté interface — la table
   est aussi protégée par RLS côté Supabase. */
async function addVehicleCategory(data) {
    const code = data.code.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "");
    const { error } = await supabaseClient.from("vehicle_categories").insert({
        code: code,
        label: data.label,
        price_4h: data.price4h || 0,
        price_24h: data.price24h || 0,
        price_7d: data.price7d || 0,
        deposit_min: data.depositMin || 0,
        deposit_max: data.depositMax || 0
    });
    if (error) {
        return { ok: false, error: error.code === "23505" ? "Ce code de catégorie existe déjà." : error.message };
    }
    _categoriesCache = null; // force un rechargement au prochain getAllCategories()
    return { ok: true, code: code };
}

/* Réservé au Directeur (grade 10) / admin. Les véhicules qui utilisaient
   cette catégorie ne sont pas supprimés — leur libellé s'affichera juste
   comme le code brut tant qu'ils ne sont pas réassignés. */
async function deleteVehicleCategory(code) {
    const { error } = await supabaseClient.from("vehicle_categories").delete().eq("code", code);
    if (error) {
        return { ok: false, error: error.message };
    }
    _categoriesCache = null;
    return { ok: true };
}

function getEffectivePricing(categoryCode) {
    const cat = _categoriesCache && _categoriesCache.find(function (c) { return c.code === categoryCode; });
    if (cat) return cat;
    return { price4h: 0, price24h: 0, price7d: 0, depositMin: 0, depositMax: 0 };
}

const DELIVERY_ZONES = [
    { code: "agence", label: "Retrait en agence", price: 0 },
    { code: "los-santos", label: "Los Santos", price: 500 },
    { code: "vinewood", label: "Vinewood", price: 750 },
    { code: "sandy-shores", label: "Sandy Shores", price: 2000 },
    { code: "paleto-bay", label: "Paleto Bay", price: 3000 }
];

const INSURANCE_LEVELS = [
    { code: "basic", label: "Basic", price: 0, desc: "Protection minimale." },
    { code: "apex-cover", label: "Apex Cover", price: 500, desc: "Protection renforcée." },
    { code: "apex-full-cover", label: "Apex Full Cover", price: 1200, desc: "Protection maximale proposée par APEX." }
];

/* Les véhicules vivent maintenant dans la table Supabase "vehicles"
   (voir supabase/schema.sql + supabase/seed-vehicles.sql). Plus besoin
   de tableau statique ni de calques de surcharge : on lit/écrit
   directement la vraie donnée. */

function mapVehicleRow(row) {
    return {
        id: row.id,
        name: row.name,
        category: row.category,
        power: row.power,
        topSpeed: row.top_speed,
        accel: row.accel,
        braking: row.braking,
        transmission: row.transmission,
        fuel: row.fuel,
        seats: row.seats,
        trunk: row.trunk,
        price4h: Number(row.price_4h),
        price24h: Number(row.price_24h),
        price7d: Number(row.price_7d),
        deposit: Number(row.deposit),
        status: row.status,
        available: row.status === "available",
        image: row.image_url || "",
        popularity: row.popularity
    };
}

function slugify(str) {
    return str.toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
}

async function getAllVehicles() {
    await getAllCategories(); // garantit que les libellés de catégorie sont disponibles
    const { data, error } = await supabaseClient.from("vehicles").select("*").order("name");
    if (error) {
        console.error("getAllVehicles:", error);
        return [];
    }
    return data.map(mapVehicleRow);
}

async function getVehicleById(id) {
    await getAllCategories();
    const { data, error } = await supabaseClient.from("vehicles").select("*").eq("id", id).maybeSingle();
    if (error || !data) return null;
    return mapVehicleRow(data);
}

async function addCustomVehicle(data) {
    const pricing = getEffectivePricing(data.category);
    const id = slugify(data.name) + "-" + Date.now().toString(36);

    const { error } = await supabaseClient.from("vehicles").insert({
        id: id,
        name: data.name,
        category: data.category,
        power: data.power || 0,
        top_speed: data.topSpeed || 0,
        accel: data.accel || "—",
        braking: data.braking || "Correct",
        transmission: data.transmission || "Automatique",
        fuel: data.fuel || "Essence",
        seats: data.seats || 4,
        trunk: data.trunk || 300,
        status: "available",
        popularity: 0,
        image_url: data.image || "",
        price_4h: data.price4h || pricing.price4h,
        price_24h: data.price24h || pricing.price24h,
        price_7d: data.price7d || pricing.price7d,
        deposit: data.deposit || pricing.depositMax
    });

    if (error) {
        console.error("addCustomVehicle:", error);
        return null;
    }
    return id;
}

async function updateVehicleFields(id, fields) {
    const row = {};
    if (fields.name !== undefined) row.name = fields.name;
    if (fields.category !== undefined) row.category = fields.category;
    if (fields.power !== undefined) row.power = fields.power;
    if (fields.topSpeed !== undefined) row.top_speed = fields.topSpeed;
    if (fields.accel !== undefined) row.accel = fields.accel;
    if (fields.braking !== undefined) row.braking = fields.braking;
    if (fields.transmission !== undefined) row.transmission = fields.transmission;
    if (fields.fuel !== undefined) row.fuel = fields.fuel;
    if (fields.seats !== undefined) row.seats = fields.seats;
    if (fields.trunk !== undefined) row.trunk = fields.trunk;
    if (fields.price4h !== undefined) row.price_4h = fields.price4h;
    if (fields.price24h !== undefined) row.price_24h = fields.price24h;
    if (fields.price7d !== undefined) row.price_7d = fields.price7d;
    if (fields.deposit !== undefined) row.deposit = fields.deposit;
    if (fields.image !== undefined) row.image_url = fields.image;
    if (fields.popularity !== undefined) row.popularity = fields.popularity;

    const { error } = await supabaseClient.from("vehicles").update(row).eq("id", id);
    if (error) console.error("updateVehicleFields:", error);
}

async function deleteVehicle(id) {
    const { error } = await supabaseClient.from("vehicles").delete().eq("id", id);
    if (error) console.error("deleteVehicle:", error);
}

function getCategoryLabel(code) {
    const cat = _categoriesCache && _categoriesCache.find(function (c) { return c.code === code; });
    return cat ? cat.label : code;
}

/* ============================================================
   1bis. GESTION DE FLOTTE (statut stocké directement en base)
   ============================================================ */

const VEHICLE_STATUSES = [
    { code: "available", label: "Disponible", badge: "badge-available" },
    { code: "reserved", label: "Réservé", badge: "badge-maintenance" },
    { code: "preparation", label: "Préparation", badge: "badge-maintenance" },
    { code: "rented", label: "En location", badge: "badge-rented" },
    { code: "maintenance", label: "Maintenance", badge: "badge-maintenance" },
    { code: "unavailable", label: "Indisponible", badge: "badge-unavailable" }
];

async function setVehicleStatus(vehicleId, statusCode) {
    const { error } = await supabaseClient.from("vehicles").update({ status: statusCode }).eq("id", vehicleId);
    if (error) console.error("setVehicleStatus:", error);
}

function getStatusMeta(code) {
    return VEHICLE_STATUSES.find(function (s) { return s.code === code; }) || VEHICLE_STATUSES[0];
}

/* ============================================================
   1quater. EMPLOYÉS
   ============================================================ */

const EMPLOYEE_GRADES = [
    { level: 10, code: "director", label: "Directeur" },
    { level: 9, code: "deputy-director", label: "Directeur Adjoint" },
    { level: 8, code: "apex-manager", label: "APEX Manager" },
    { level: 7, code: "fleet-manager", label: "Fleet Manager" },
    { level: 6, code: "rental-manager", label: "Rental Manager" },
    { level: 5, code: "rental-advisor", label: "Rental Advisor" },
    { level: 4, code: "delivery-agent", label: "Delivery Agent" },
    { level: 3, code: "recovery-agent", label: "Recovery Agent" },
    { level: 2, code: "preparation-agent", label: "Preparation Agent" },
    { level: 1, code: "trainee", label: "Trainee" }
];

/* Un admin ne peut pas créer de compte de connexion pour quelqu'un
   d'autre depuis le navigateur (ça déconnecterait sa propre session
   et le remplacerait par le nouveau compte — Supabase n'expose
   volontairement aucune clé "admin" côté client). La personne doit
   d'abord créer SON PROPRE compte via inscription.html ; l'admin la
   retrouve ensuite par e-mail et la promeut employé/entreprise. */
async function promoteClientToEmployee(email, gradeCode, phone) {
    const { data: profile, error } = await supabaseClient.from("profiles").select("*").eq("email", email).maybeSingle();
    if (error || !profile) {
        return { ok: false, error: "Aucun compte trouvé avec cet e-mail. La personne doit d'abord créer un compte via la page Inscription." };
    }
    if (profile.role !== "client") {
        return { ok: false, error: "Ce compte a déjà un rôle particulier (" + profile.role + ")." };
    }
    const updateFields = { role: "employee", grade_code: gradeCode };
    if (phone) updateFields.phone = phone;
    const { error: updateError } = await supabaseClient.from("profiles").update(updateFields).eq("id", profile.id);
    if (updateError) {
        return { ok: false, error: updateError.message };
    }
    return { ok: true };
}

async function promoteClientToBusiness(email, companyName, requestId) {
    const { data: profile, error } = await supabaseClient.from("profiles").select("*").eq("email", email).maybeSingle();
    if (error || !profile) {
        return { ok: false, error: "Aucun compte trouvé avec cet e-mail. La personne doit d'abord créer un compte via la page Inscription." };
    }
    const { error: updateError } = await supabaseClient
        .from("profiles")
        .update({ club_tier: "entreprise", business_name: companyName })
        .eq("id", profile.id);
    if (updateError) {
        return { ok: false, error: updateError.message };
    }
    if (requestId) {
        await supabaseClient.from("business_requests").update({ account_user_id: profile.id }).eq("id", requestId);
    }
    return { ok: true, userId: profile.id };
}

async function getEmployeeUsers() {
    const { data, error } = await supabaseClient.from("profiles").select("*").eq("role", "employee");
    if (error) {
        console.error("getEmployeeUsers:", error);
        return [];
    }
    return data.map(function (p) {
        return { id: p.id, firstName: p.first_name, lastName: p.last_name, email: p.email, phone: p.phone, gradeCode: p.grade_code };
    });
}

/* "Retirer" un employé le rétrograde en client normal — on ne peut
   pas supprimer son compte de connexion depuis le navigateur. */
async function demoteEmployeeToClient(userId) {
    const { error } = await supabaseClient.from("profiles").update({ role: "client", grade_code: null }).eq("id", userId);
    if (error) console.error("demoteEmployeeToClient:", error);
}

async function setEmployeeGrade(userId, gradeCode) {
    const { error } = await supabaseClient.from("profiles").update({ grade_code: gradeCode }).eq("id", userId);
    if (error) console.error("setEmployeeGrade:", error);
}

function getGradeMeta(code) {
    return EMPLOYEE_GRADES.find(function (g) { return g.code === code; }) || EMPLOYEE_GRADES[EMPLOYEE_GRADES.length - 1];
}

/* ============================================================
   1quater-bis. PERMISSIONS PAR GRADE
   ============================================================ */

/* Chaque capacité peut être vue ("view") et/ou modifiée ("edit")
   par un grade donné. "page" indique le fichier admin correspondant
   quand il existe déjà (utilisé pour la sidebar) ; les capacités
   sans page (missions terrain) sont prévues pour des pages futures. */
const CAPABILITIES = [
    { key: "reservations", label: "Gérer les réservations", page: "reservations.html" },
    { key: "preparation", label: "Préparer les véhicules", page: null },
    { key: "livraisons", label: "Effectuer les livraisons", page: null },
    { key: "recuperation", label: "Récupérer les véhicules", page: null },
    { key: "inspections", label: "Réaliser les inspections", page: null },
    { key: "incidents", label: "Gérer les incidents", page: "incidents.html" },
    { key: "flotte", label: "Gérer la flotte", page: "flotte.html" },
    { key: "prix", label: "Gérer les prix", page: "prix.html" },
    { key: "employes", label: "Gérer les employés", page: "employes.html" },
    { key: "clients", label: "Gérer les clients", page: "clients.html" },
    { key: "finances", label: "Gérer les finances", page: "finances.html" },
    { key: "abonnements", label: "Gérer les abonnements", page: "abonnements.html" },
    { key: "entreprises", label: "Gérer les entreprises", page: "entreprises.html" },
    { key: "medias", label: "Gérer les demandes Media", page: "medias.html" },
    { key: "statistiques", label: "Gérer les statistiques", page: "statistiques.html" }
];

const MANAGEMENT_CAPABILITIES = ["flotte", "prix", "employes", "clients", "finances", "abonnements", "entreprises", "medias", "incidents", "statistiques"];
const OPERATIONAL_CAPABILITIES = ["reservations", "preparation", "livraisons", "recuperation", "inspections"];

/* Permissions par défaut tant que l'admin n'a rien configuré pour
   ce grade : les grades élevés (niveau 6+) gèrent, les agents
   (niveau < 6) opèrent sur le terrain. Purement indicatif — l'admin
   peut tout réajuster depuis admin/permissions.html. */
function getDefaultGradePermissions(gradeCode) {
    const level = getGradeMeta(gradeCode).level;
    const perms = {};
    CAPABILITIES.forEach(function (c) {
        const canManage = level >= 6 && MANAGEMENT_CAPABILITIES.indexOf(c.key) !== -1;
        const canOperate = level < 6 && OPERATIONAL_CAPABILITIES.indexOf(c.key) !== -1;
        perms[c.key] = { view: canManage || canOperate, edit: canManage || canOperate };
    });
    return perms;
}

function getGradePermissions(gradeCode) {
    const all = storageGet(STORAGE_KEYS.GRADE_PERMISSIONS, {});
    return all[gradeCode] || getDefaultGradePermissions(gradeCode);
}

function setGradePermissions(gradeCode, perms) {
    const all = storageGet(STORAGE_KEYS.GRADE_PERMISSIONS, {});
    all[gradeCode] = perms;
    storageSet(STORAGE_KEYS.GRADE_PERMISSIONS, all);
}

/* Vérifie l'accès d'un utilisateur à une capacité donnée.
   mode : "view" ou "edit". Les admins ont toujours accès à tout,
   les clients n'ont jamais accès au back office. */
function userHasPermission(user, capabilityKey, mode) {
    if (!user) return false;
    if (user.role === "admin") return true;
    if (user.role !== "employee") return false;
    // Le Directeur (grade 10) a exactement les mêmes accès qu'un admin,
    // quelle que soit la configuration des permissions par grade.
    if (getGradeMeta(user.gradeCode).level === 10) return true;
    const perms = getGradePermissions(user.gradeCode);
    return !!(perms[capabilityKey] && perms[capabilityKey][mode]);
}

/* Formate en direct un champ téléphone au format (xxx) xxx-xxxx */
function formatPhoneInput(inputEl) {
    inputEl.addEventListener("input", function () {
        const digits = inputEl.value.replace(/\D/g, "").slice(0, 10);
        let formatted = digits;
        if (digits.length > 6) {
            formatted = "(" + digits.slice(0, 3) + ") " + digits.slice(3, 6) + "-" + digits.slice(6);
        } else if (digits.length > 3) {
            formatted = "(" + digits.slice(0, 3) + ") " + digits.slice(3);
        } else if (digits.length > 0) {
            formatted = "(" + digits;
        }
        inputEl.value = formatted;
    });
}

/* ============================================================
   1quinquies. INCIDENTS
   ============================================================ */

const INCIDENT_STATUSES = ["OUVERT", "EN COURS", "RÉSOLU", "CLOS"];

/* ============================================================
   1quinquies-bis. STATUTS DE RÉSERVATION (dont validation paiement)
   ============================================================ */

const RESERVATION_STATUS_META = {
    pending: { label: "En attente de paiement", badge: "badge-maintenance" },
    confirmed: { label: "Payée", badge: "badge-available" },
    active: { label: "En cours", badge: "badge-rented" },
    completed: { label: "Terminée", badge: "badge-available" },
    cancelled: { label: "Annulée", badge: "badge-unavailable" }
};

function getReservationStatusMeta(status) {
    return RESERVATION_STATUS_META[status] || RESERVATION_STATUS_META.pending;
}

/* ============================================================
   3ter. MODALE DE DÉTAILS D'UNE RÉSERVATION (client + admin)
   ============================================================ */

/* ============================================================
   3bis-2. MODALE DE CONFIRMATION (remplace confirm() natif)
   ============================================================ */

function showConfirmModal(message) {
    return new Promise(function (resolve) {
        let overlay = document.getElementById("appConfirmOverlay");
        if (!overlay) {
            overlay = document.createElement("div");
            overlay.id = "appConfirmOverlay";
            overlay.className = "modal-overlay";
            overlay.innerHTML =
                '<div class="modal" style="max-width:420px;">' +
                '  <p id="appConfirmMessage" style="color:var(--apex-white); font-size:14px; line-height:1.6;"></p>' +
                '  <div class="mt-3" style="display:flex; gap:10px; justify-content:flex-end;">' +
                '    <button type="button" class="btn btn-outline btn-sm" id="appConfirmCancel">Annuler</button>' +
                '    <button type="button" class="btn btn-primary btn-sm" id="appConfirmOk">Confirmer</button>' +
                '  </div>' +
                '</div>';
            document.body.appendChild(overlay);
        }

        document.getElementById("appConfirmMessage").textContent = message;
        overlay.classList.add("open");

        const okBtn = document.getElementById("appConfirmOk");
        const cancelBtn = document.getElementById("appConfirmCancel");

        function cleanup(result) {
            overlay.classList.remove("open");
            okBtn.removeEventListener("click", onOk);
            cancelBtn.removeEventListener("click", onCancel);
            overlay.removeEventListener("click", onOverlayClick);
            resolve(result);
        }
        function onOk() { cleanup(true); }
        function onCancel() { cleanup(false); }
        function onOverlayClick(e) { if (e.target === overlay) cleanup(false); }

        okBtn.addEventListener("click", onOk);
        cancelBtn.addEventListener("click", onCancel);
        overlay.addEventListener("click", onOverlayClick);
    });
}

function ensureReservationDetailsModal() {
    let overlay = document.getElementById("reservationDetailsOverlay");
    if (overlay) return overlay;

    overlay = document.createElement("div");
    overlay.id = "reservationDetailsOverlay";
    overlay.className = "modal-overlay";
    overlay.innerHTML =
        '<div class="modal">' +
        '  <button type="button" class="modal-close" id="closeReservationDetailsBtn">&times;</button>' +
        '  <h2 class="section-title" style="font-size:20px;" id="reservationDetailsTitle">Détails de la réservation</h2>' +
        '  <div id="reservationDetailsBody" class="mt-3"></div>' +
        '</div>';
    document.body.appendChild(overlay);

    overlay.addEventListener("click", function (e) {
        if (e.target === overlay) overlay.classList.remove("open");
    });
    document.getElementById("closeReservationDetailsBtn").addEventListener("click", function () {
        overlay.classList.remove("open");
    });

    return overlay;
}

function showReservationDetails(r, clientLabel) {
    const overlay = ensureReservationDetailsModal();
    document.getElementById("reservationDetailsTitle").textContent = "Détails de la réservation";
    const meta = getReservationStatusMeta(r.status);
    const insurance = INSURANCE_LEVELS.find(function (i) { return i.code === r.insurance; });
    const delivery = DELIVERY_ZONES.find(function (z) { return z.code === r.delivery; });
    const tierLabel = r.appliedClubTier ? (CLUB_TIER_INFO[r.appliedClubTier] || {}).label : null;

    document.getElementById("reservationDetailsBody").innerHTML =
        '<div class="summary-row"><span>Référence</span><span>' + r.reference + '</span></div>' +
        (clientLabel ? '<div class="summary-row"><span>Client</span><span>' + clientLabel + '</span></div>' : '') +
        '<div class="summary-row"><span>Véhicule</span><span>' + r.vehicleName + '</span></div>' +
        '<div class="summary-row"><span>Départ</span><span>' + r.startDate + ' à ' + r.startTime + '</span></div>' +
        '<div class="summary-row"><span>Retour</span><span>' + r.endDate + ' à ' + r.endTime + '</span></div>' +
        '<div class="summary-row"><span>Assurance</span><span>' + (insurance ? insurance.label : r.insurance) + ' — ' + (r.insurancePrice > 0 ? r.insurancePrice.toLocaleString("fr-FR") + " $" : "Inclus/Offerte") + '</span></div>' +
        '<div class="summary-row"><span>Livraison</span><span>' + (delivery ? delivery.label : r.delivery) + ' — ' + (r.deliveryPrice > 0 ? r.deliveryPrice.toLocaleString("fr-FR") + " $" : "Gratuit") + '</span></div>' +
        '<div class="summary-row"><span>Prix location</span><span>' +
        (r.rentalDiscountPercent > 0 ? '<span style="text-decoration:line-through; color:rgba(184,188,194,0.5); margin-right:6px;">' + (r.rentalBasePrice || r.rentalPrice).toLocaleString("fr-FR") + ' $</span>' : '') +
        r.rentalPrice.toLocaleString("fr-FR") + ' $</span></div>' +
        (tierLabel ? '<div class="summary-row"><span>Avantages appliqués</span><span class="text-red">' + tierLabel + (r.rentalDiscountPercent > 0 ? ' (-' + r.rentalDiscountPercent + '%)' : '') + '</span></div>' : '') +
        '<div class="summary-row total"><span>TOTAL</span><span class="value">' + r.total.toLocaleString("fr-FR") + ' $</span></div>' +
        '<div class="summary-row"><span>Caution</span><span>' + r.deposit.toLocaleString("fr-FR") + ' $</span></div>' +
        '<div class="summary-row"><span>Statut</span><span><span class="badge ' + meta.badge + '">' + meta.label + '</span></span></div>' +
        '<div class="summary-row"><span>Créée le</span><span>' + isoToLocalDateKey(r.createdAt) + '</span></div>';

    overlay.classList.add("open");
}

const MEDIA_STATUS_META = {
    new: { label: "Nouvelle", badge: "badge-maintenance" },
    in_progress: { label: "En cours de traitement", badge: "badge-maintenance" },
    resolved: { label: "Traitée", badge: "badge-available" }
};

function getMediaStatusMeta(status) {
    return MEDIA_STATUS_META[status] || MEDIA_STATUS_META.new;
}

function showMediaRequestDetails(m, clientLabel) {
    const overlay = ensureReservationDetailsModal();
    document.getElementById("reservationDetailsTitle").textContent = "Détails de la demande Media";
    const meta = getMediaStatusMeta(m.status);

    document.getElementById("reservationDetailsBody").innerHTML =
        (clientLabel ? '<div class="summary-row"><span>Client</span><span>' + clientLabel + '</span></div>' : '') +
        '<div class="summary-row"><span>Projet</span><span>' + m.projectName + '</span></div>' +
        '<div class="summary-row"><span>Type</span><span>' + (m.projectType || '—') + '</span></div>' +
        '<div class="summary-row"><span>Date</span><span>' + (m.date || '—') + '</span></div>' +
        '<div class="summary-row"><span>Durée</span><span>' + (m.duration || '—') + '</span></div>' +
        '<div class="summary-row"><span>Véhicules souhaités</span><span>' + (m.vehicleCount || '—') + ' — ' + (m.vehicleTypes || '—') + '</span></div>' +
        '<div class="summary-row"><span>Lieu</span><span>' + (m.location || '—') + '</span></div>' +
        '<div class="summary-row"><span>Livraison souhaitée</span><span>' + (m.needsDelivery ? 'Oui' : 'Non') + '</span></div>' +
        '<div class="summary-row"><span>Chauffeur souhaité</span><span>' + (m.needsDriver ? 'Oui' : 'Non') + '</span></div>' +
        '<div class="summary-row"><span>Budget</span><span>' + (m.budget ? Number(m.budget).toLocaleString("fr-FR") + " $" : '—') + '</span></div>' +
        '<div class="summary-row" style="flex-direction:column; align-items:flex-start; gap:4px;"><span>Description</span><span class="text-silver" style="font-size:12px;">' + (m.description || '—') + '</span></div>' +
        '<div class="summary-row"><span>Statut</span><span><span class="badge ' + meta.badge + '">' + meta.label + '</span></span></div>' +
        '<div class="summary-row"><span>Envoyée le</span><span>' + isoToLocalDateKey(m.createdAt) + '</span></div>';

    overlay.classList.add("open");
}

async function updateReservationStatus(reference, status) {
    const { error } = await supabaseClient.from("reservations").update({ status: status }).eq("reference", reference);
    if (error) console.error("updateReservationStatus:", error);
}

/* Suppression définitive d'une réservation — réservée au Directeur
   (grade 10) et à l'admin côté interface (voir canManageClubTiers). */
async function deleteReservation(reference) {
    const { error } = await supabaseClient.from("reservations").delete().eq("reference", reference);
    if (error) {
        console.error("deleteReservation:", error);
        return { ok: false, error: error.message };
    }
    return { ok: true };
}

function mapIncidentRow(row) {
    return {
        reference: row.reference,
        reservationRef: row.reservation_ref || "",
        vehicleId: row.vehicle_id,
        vehicleName: row.vehicle_name,
        description: row.description,
        estimatedDamage: Number(row.estimated_damage || 0),
        appliedCost: row.applied_cost !== null ? Number(row.applied_cost) : null,
        status: row.status,
        createdAt: row.created_at
    };
}

async function getIncidents() {
    const { data, error } = await supabaseClient.from("incidents").select("*").order("created_at", { ascending: false });
    if (error) {
        console.error("getIncidents:", error);
        return [];
    }
    return data.map(mapIncidentRow);
}

async function createIncident(data) {
    // La référence (INC-année-000x) est générée automatiquement par
    // la colonne "reference" de la table (valeur par défaut).
    const { data: inserted, error } = await supabaseClient.from("incidents").insert({
        reservation_ref: data.reservationRef || "",
        vehicle_id: data.vehicleId,
        vehicle_name: data.vehicleName,
        description: data.description,
        estimated_damage: data.estimatedDamage || 0,
        status: "OUVERT"
    }).select().single();

    if (error) {
        console.error("createIncident:", error);
        return null;
    }
    return inserted.reference;
}

async function updateIncidentStatus(reference, status) {
    const { error } = await supabaseClient.from("incidents").update({ status: status }).eq("reference", reference);
    if (error) console.error("updateIncidentStatus:", error);
}

/* ============================================================
   1sexies. ABONNEMENTS (APEX CLUB / APEX BLACK)
   ============================================================ */

async function setUserClubTier(userId, tier) {
    const { error } = await supabaseClient.from("profiles").update({ club_tier: tier }).eq("id", userId);
    if (error) {
        console.error("setUserClubTier:", error);
        return { ok: false, error: error.message };
    }
    return { ok: true };
}

/* Réduction individuelle (0 à 100%), en plus de la réduction liée à
   l'abonnement — réservée à l'admin/Directeur côté interface, protégée
   par la même policy RLS que le reste du profil. */
async function setUserCustomDiscount(userId, percent) {
    const clamped = Math.max(0, Math.min(100, percent));
    const { error } = await supabaseClient.from("profiles").update({ custom_discount: clamped }).eq("id", userId);
    if (error) {
        console.error("setUserCustomDiscount:", error);
        return { ok: false, error: error.message };
    }
    return { ok: true };
}

/* ============================================================
   1sexies-bis. GRADES CLIENTS (pour options futures)
   ============================================================ */

async function getClientGrades() {
    const { data, error } = await supabaseClient.from("client_grades").select("label").order("label");
    if (error) {
        console.error("getClientGrades:", error);
        return [];
    }
    return data.map(function (row) { return row.label; });
}

async function addClientGrade(label) {
    const { error } = await supabaseClient.from("client_grades").insert({ label: label });
    if (error && error.code !== "23505") console.error("addClientGrade:", error); // 23505 = doublon, ignoré
}

async function deleteClientGrade(label) {
    await supabaseClient.from("client_grades").delete().eq("label", label);
    // Retire ce grade des clients qui l'avaient déjà.
    await supabaseClient.from("profiles").update({ client_grade: "" }).eq("client_grade", label);
}

async function setUserClientGrade(userId, grade) {
    const { error } = await supabaseClient.from("profiles").update({ client_grade: grade }).eq("id", userId);
    if (error) console.error("setUserClientGrade:", error);
}

/* ============================================================
   1sexies-ter. GRADES ENTREPRISE (pour options futures)
   ============================================================ */

const BUSINESS_GRADES = ["Standard", "Partenaire", "VIP"];

function mapBusinessRequestRow(row) {
    return {
        id: row.id,
        companyName: row.company_name,
        managerName: row.manager_name,
        email: row.email,
        phone: row.phone,
        fleetSize: row.fleet_size,
        message: row.message,
        status: row.status,
        grade: row.grade,
        accountUserId: row.account_user_id,
        createdAt: row.created_at
    };
}

async function submitBusinessRequest(data) {
    const { error } = await supabaseClient.from("business_requests").insert({
        company_name: data.companyName,
        manager_name: data.managerName,
        email: data.email,
        phone: data.phone || "",
        fleet_size: data.fleetSize || 1,
        message: data.message || ""
    });
    return { ok: !error, error: error ? error.message : null };
}

async function getBusinessRequests() {
    const { data, error } = await supabaseClient.from("business_requests").select("*").order("created_at", { ascending: false });
    if (error) {
        console.error("getBusinessRequests:", error);
        return [];
    }
    return data.map(mapBusinessRequestRow);
}

async function setBusinessRequestGrade(id, grade) {
    const { error } = await supabaseClient.from("business_requests").update({ grade: grade }).eq("id", id);
    if (error) console.error("setBusinessRequestGrade:", error);
}

async function setBusinessRequestStatus(id, status) {
    const { error } = await supabaseClient.from("business_requests").update({ status: status }).eq("id", id);
    if (error) console.error("setBusinessRequestStatus:", error);
}

function mapMediaRequestRow(row) {
    return {
        id: row.id,
        userId: row.user_id,
        projectName: row.project_name,
        projectType: row.project_type,
        date: row.event_date,
        duration: row.duration,
        vehicleCount: row.vehicle_count,
        vehicleTypes: row.vehicle_types,
        location: row.location,
        needsDelivery: row.needs_delivery,
        needsDriver: row.needs_driver,
        budget: row.budget,
        description: row.description,
        status: row.status,
        createdAt: row.created_at
    };
}

async function submitMediaRequest(data) {
    const { error } = await supabaseClient.from("media_requests").insert({
        user_id: data.userId,
        project_name: data.projectName,
        project_type: data.projectType,
        event_date: data.date || null,
        duration: data.duration || "",
        vehicle_count: data.vehicleCount || null,
        vehicle_types: data.vehicleTypes || "",
        location: data.location || "",
        needs_delivery: data.needsDelivery === "oui",
        needs_driver: data.needsDriver === "oui",
        budget: data.budget || null,
        description: data.description || ""
    });
    return { ok: !error, error: error ? error.message : null };
}

async function getMediaRequestsForUser(userId) {
    const { data, error } = await supabaseClient.from("media_requests").select("*").eq("user_id", userId).order("created_at", { ascending: false });
    if (error) {
        console.error("getMediaRequestsForUser:", error);
        return [];
    }
    return data.map(mapMediaRequestRow);
}

async function setMediaRequestStatus(id, status) {
    const { error } = await supabaseClient.from("media_requests").update({ status: status }).eq("id", id);
    if (error) console.error("setMediaRequestStatus:", error);
}

/* Réservé au Directeur (grade 10) / admin côté interface, et
   protégé par RLS côté Supabase (is_admin_or_director). */
async function deleteMediaRequest(id) {
    const { error } = await supabaseClient.from("media_requests").delete().eq("id", id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
}

async function getMediaRequests() {
    const { data, error } = await supabaseClient.from("media_requests").select("*").order("created_at", { ascending: false });
    if (error) {
        console.error("getMediaRequests:", error);
        return [];
    }
    return data.map(mapMediaRequestRow);
}

/* ============================================================
   1octies. ÉCRITURES FINANCIÈRES (ex : réparations d'incidents)
   ============================================================ */

function mapFinanceEntryRow(row) {
    return { key: row.key, type: row.type, label: row.label, amount: Number(row.amount), createdAt: row.created_at };
}

async function getFinanceEntries() {
    const { data, error } = await supabaseClient.from("finance_entries").select("*").order("created_at", { ascending: false });
    if (error) {
        console.error("getFinanceEntries:", error);
        return [];
    }
    return data.map(mapFinanceEntryRow);
}

/* Ajoute ou met à jour (par clé unique) une écriture financière,
   pour éviter les doublons si l'admin réapplique un montant. */
async function upsertFinanceEntry(key, entry) {
    const { error } = await supabaseClient.from("finance_entries").upsert({
        key: key,
        type: entry.type,
        label: entry.label,
        amount: entry.amount
    });
    if (error) console.error("upsertFinanceEntry:", error);
}

/* Applique un coût de réparation à un incident : met à jour l'incident
   ET crée automatiquement l'écriture financière correspondante. */
async function applyIncidentRepairCost(reference, amount) {
    const { data: incident, error } = await supabaseClient.from("incidents").select("*").eq("reference", reference).maybeSingle();
    if (error || !incident) return;

    await supabaseClient.from("incidents").update({ applied_cost: amount, status: "RÉSOLU" }).eq("reference", reference);

    await upsertFinanceEntry("incident_" + reference, {
        type: "incident_repair",
        label: "Réparation " + incident.vehicle_name + " (" + reference + ")",
        amount: amount
    });
}

/* ============================================================
   1nonies. COMPTABILITÉ (sous-catégorie de Finances)
   Paie employé, primes, impôts, charges diverses... — toutes ces
   écritures viennent en déduction du chiffre d'affaires.
   ============================================================ */

const ACCOUNTING_CATEGORIES = [
    { code: "paie", label: "Paie employé" },
    { code: "prime", label: "Prime" },
    { code: "impot", label: "Impôt" },
    { code: "charge", label: "Charge diverse" },
    { code: "achat", label: "Achat / Matériel" },
    { code: "autre", label: "Autre" }
];

function mapAccountingEntryRow(row) {
    return {
        id: row.id,
        category: row.category,
        employeeId: row.employee_id || "",
        employeeName: row.employee_name || "",
        label: row.label,
        amount: Number(row.amount),
        date: row.entry_date,
        createdAt: row.created_at
    };
}

async function getAccountingEntries() {
    const { data, error } = await supabaseClient.from("accounting_entries").select("*").order("entry_date", { ascending: false });
    if (error) {
        console.error("getAccountingEntries:", error);
        return [];
    }
    return data.map(mapAccountingEntryRow);
}

async function addAccountingEntry(data) {
    const { error } = await supabaseClient.from("accounting_entries").insert({
        category: data.category,
        employee_id: data.employeeId || null,
        employee_name: data.employeeName || "",
        label: data.label,
        amount: data.amount,
        entry_date: data.date || todayLocalKey()
    });
    if (error) console.error("addAccountingEntry:", error);
}

async function removeAccountingEntry(id) {
    const { error } = await supabaseClient.from("accounting_entries").delete().eq("id", id);
    if (error) console.error("removeAccountingEntry:", error);
}

function getAccountingCategoryLabel(code) {
    const cat = ACCOUNTING_CATEGORIES.find(function (c) { return c.code === code; });
    return cat ? cat.label : code;
}

/* Taux d'imposition (% du CA) — réglage unique, modifiable par le
   Directeur (grade 10) / admin, lisible par tout le staff. */
async function getTaxRate() {
    const { data, error } = await supabaseClient.from("finance_settings").select("tax_rate").eq("id", 1).maybeSingle();
    if (error || !data) return 0;
    return Number(data.tax_rate);
}

async function setTaxRate(rate) {
    const { error } = await supabaseClient.from("finance_settings").upsert({ id: 1, tax_rate: rate });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
}

/* ============================================================
   1septies. SIDEBAR ADMIN COMMUNE
   ============================================================ */

const ADMIN_NAV_LINKS = [
    { href: "dashboard.html", label: "Tableau de bord", capability: null },
    {
        label: "Clients & Réservations",
        group: true,
        children: [
            { href: "reservations.html", label: "Réservations", capability: "reservations" },
            { href: "nouvelle-reservation.html", label: "Nouvelle réservation", capability: "reservations", requireEdit: true },
            { href: "calendrier.html", label: "Calendrier", capability: "reservations" },
            { href: "clients.html", label: "Clients", capability: "clients" },
            { href: "abonnements.html", label: "Abonnements", capability: "abonnements" },
            { href: "entreprises.html", label: "Entreprise", capability: "entreprises" },
            { href: "medias.html", label: "Demandes Media", capability: "medias" }
        ]
    },
    {
        label: "Gestion",
        group: true,
        children: [
            { href: "flotte.html", label: "Flotte", capability: "flotte" },
            { href: "prix.html", label: "Prix", capability: "prix" },
            { href: "employes.html", label: "Employés", capability: "employes" },
            { href: "incidents.html", label: "Incidents", capability: "incidents" },
            { href: "finances.html", label: "Finances", capability: "finances" },
            { href: "statistiques.html", label: "Statistiques", capability: "statistiques" }
        ]
    },
    { href: "permissions.html", label: "Permissions", capability: "admin-only" }
];

function canSeeAdminLink(user, link) {
    if (link.capability === null) return true;
    if (link.capability === "admin-only") return user && isDirectorOrAdmin(user);
    return userHasPermission(user, link.capability, link.requireEdit ? "edit" : "view");
}

function renderAdminSidebar(activeHref) {
    const mount = document.getElementById("admin-sidebar");
    if (!mount) return;
    const user = getCurrentUser();

    const itemsHTML = ADMIN_NAV_LINKS.map(function (item) {
        if (item.group) {
            const visibleChildren = item.children.filter(function (c) { return canSeeAdminLink(user, c); });
            if (!visibleChildren.length) return "";

            const isOpen = visibleChildren.some(function (c) { return c.href === activeHref; });
            return (
                '<div class="sidebar-group' + (isOpen ? " open" : "") + '">' +
                '  <button type="button" class="sidebar-group-toggle">' +
                '    <span>' + item.label + '</span>' +
                '    <span class="sidebar-group-arrow">▾</span>' +
                '  </button>' +
                '  <div class="sidebar-submenu">' +
                visibleChildren.map(function (c) {
                    const active = c.href === activeHref ? " active" : "";
                    return '<a href="' + c.href + '" class="' + active.trim() + '">' + c.label + '</a>';
                }).join("") +
                '  </div>' +
                '</div>'
            );
        }
        if (!canSeeAdminLink(user, item)) return "";
        const active = item.href === activeHref ? " active" : "";
        return '<a href="' + item.href + '" class="' + active.trim() + '">' + item.label + '</a>';
    }).join("");

    mount.innerHTML =
        '<nav class="sidebar-nav">' + itemsHTML + '</nav>' +
        '<button type="button" class="sidebar-logout" id="sidebarLogoutBtn">Déconnexion</button>';

    mount.querySelectorAll(".sidebar-group-toggle").forEach(function (btn) {
        btn.addEventListener("click", function () {
            btn.closest(".sidebar-group").classList.toggle("open");
        });
    });

    document.getElementById("sidebarLogoutBtn").addEventListener("click", logoutUser);
}

/* ============================================================
   1septies-bis. ESPACE CLIENT — SIDEBAR ET ABONNEMENT
   ============================================================ */

const CLIENT_NAV_LINKS = [
    { href: "dashboard.html", label: "Tableau de bord" },
    { href: "abonnement.html", label: "Mon abonnement" }
];

function renderClientSidebar(activeHref) {
    const mount = document.getElementById("client-sidebar");
    if (!mount) return;
    mount.innerHTML =
        '<nav class="sidebar-nav">' +
        CLIENT_NAV_LINKS.map(function (link) {
            const active = link.href === activeHref ? " active" : "";
            return '<a href="' + link.href + '" class="' + active.trim() + '">' + link.label + '</a>';
        }).join("") +
        '</nav>' +
        '<button type="button" class="sidebar-logout" id="sidebarLogoutBtn">Déconnexion</button>';

    document.getElementById("sidebarLogoutBtn").addEventListener("click", logoutUser);
}

const CLUB_TIER_INFO = {
    "none": { label: "Standard", pricePerWeek: 0, perks: [], rentalDiscount: 0, freeDelivery: false, freeInsurance: false },
    "apex-club": {
        label: "Apex Club", pricePerWeek: 15000, rentalDiscount: 0.10, freeDelivery: true, freeInsurance: true,
        perks: ["Livraison gratuite", "Assurance prise en charge", "Réservation prioritaire", "10% de réduction sur les locations", "Préparation prioritaire", "Accès aux véhicules CLUB", "Frais de récupération réduits"]
    },
    "apex-black": {
        label: "Apex Black", pricePerWeek: 35000, rentalDiscount: 0.20, freeDelivery: true, freeInsurance: true,
        perks: ["Livraison gratuite", "Assurance prise en charge", "Priorité maximale", "20% de réduction sur les locations", "Accès aux véhicules PRESTIGE", "Préparation prioritaire", "Récupération gratuite", "Véhicules exclusifs", "Conditions commerciales personnalisées"]
    },
    "entreprise": { label: "Entreprise", pricePerWeek: 0, perks: ["Compte rattaché à une entreprise APEX BUSINESS"], rentalDiscount: 0, freeDelivery: false, freeInsurance: false }
};

/* Surcharges appliquées par le Directeur (grade 10) sur les paliers
   VIP : prix, réduction, livraison/assurance offertes, avantages. */
async function setClubTierOverride(tierCode, values) {
    const { error } = await supabaseClient.from("club_tier_config").upsert({
        tier: tierCode,
        price_per_week: values.pricePerWeek,
        rental_discount: values.rentalDiscount,
        free_delivery: values.freeDelivery,
        free_insurance: values.freeInsurance,
        perks: values.perks
    });
    if (error) {
        console.error("setClubTierOverride:", error);
        return { ok: false, error: error.message };
    }
    return { ok: true };
}

async function getEffectiveClubTierInfo(tierCode) {
    const base = CLUB_TIER_INFO[tierCode] || CLUB_TIER_INFO.none;
    if (tierCode === "none") return base;

    const { data: row, error } = await supabaseClient.from("club_tier_config").select("*").eq("tier", tierCode).maybeSingle();
    if (error || !row) return base;

    return Object.assign({}, base, {
        pricePerWeek: Number(row.price_per_week),
        rentalDiscount: Number(row.rental_discount),
        freeDelivery: row.free_delivery,
        freeInsurance: row.free_insurance,
        perks: row.perks && row.perks.length ? row.perks : base.perks
    });
}

/* Seul le Directeur (grade 10) ou un compte admin peut modifier
   les paliers VIP (prix et avantages). */
function canManageClubTiers(user) {
    if (!user) return false;
    if (user.role === "admin") return true;
    return user.role === "employee" && getGradeMeta(user.gradeCode).level === 10;
}

/* Alias générique : réservé au Directeur (grade 10) et à l'admin,
   pour toute action sensible (suppression définitive, etc.). */
function isDirectorOrAdmin(user) {
    return canManageClubTiers(user);
}

/* Renvoie le lundi (00:00) de la semaine d'une date donnée,
   au format YYYY-MM-DD, pour regrouper les dépenses par semaine. */
function getWeekStartKey(dateStr) {
    const d = new Date(dateStr);
    const day = d.getDay();
    const diffToMonday = (day === 0 ? -6 : 1) - day;
    const monday = new Date(d);
    monday.setDate(d.getDate() + diffToMonday);
    monday.setHours(0, 0, 0, 0);
    return toLocalDateKey(monday);
}

function formatWeekLabel(weekStartKey) {
    const start = new Date(weekStartKey);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const fmt = function (d) { return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }); };
    return "Semaine du " + fmt(start) + " au " + fmt(end);
}

/* ============================================================
   1septies-quater. RÉSERVATIONS (table Supabase "reservations")
   ============================================================ */

function mapReservationRow(row) {
    return {
        reference: row.reference,
        userId: row.user_id,
        vehicleId: row.vehicle_id,
        vehicleName: row.vehicle_name,
        startDate: row.start_date,
        startTime: (row.start_time || "").slice(0, 5),
        endDate: row.end_date,
        endTime: (row.end_time || "").slice(0, 5),
        insurance: row.insurance,
        insurancePrice: Number(row.insurance_price || 0),
        delivery: row.delivery,
        deliveryPrice: Number(row.delivery_price || 0),
        rentalPrice: Number(row.rental_price),
        rentalBasePrice: row.rental_base_price !== null ? Number(row.rental_base_price) : null,
        appliedClubTier: row.applied_club_tier || "",
        rentalDiscountPercent: Number(row.rental_discount_percent || 0),
        deliverySavings: Number(row.delivery_savings || 0),
        insuranceSavings: Number(row.insurance_savings || 0),
        total: Number(row.total),
        deposit: Number(row.deposit),
        status: row.status,
        createdAt: row.created_at
    };
}

async function getAllReservations() {
    const { data, error } = await supabaseClient.from("reservations").select("*").order("created_at", { ascending: false });
    if (error) {
        console.error("getAllReservations:", error);
        return [];
    }
    return data.map(mapReservationRow);
}

async function getReservationsForUser(userId) {
    const { data, error } = await supabaseClient
        .from("reservations")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
    if (error) {
        console.error("getReservationsForUser:", error);
        return [];
    }
    return data.map(mapReservationRow);
}

/* Crée la réservation en base et renvoie sa référence générée
   (AR-2026-0001...) via la fonction SQL dédiée, ou null en cas d'échec. */
async function createReservation(fields) {
    const { data: reference, error: refError } = await supabaseClient.rpc("generate_reservation_reference");
    if (refError || !reference) {
        console.error("generate_reservation_reference:", refError);
        return null;
    }

    const { error } = await supabaseClient.from("reservations").insert({
        reference: reference,
        user_id: fields.userId,
        vehicle_id: fields.vehicleId,
        vehicle_name: fields.vehicleName,
        start_date: fields.startDate,
        start_time: fields.startTime,
        end_date: fields.endDate,
        end_time: fields.endTime,
        insurance: fields.insurance,
        insurance_price: fields.insurancePrice,
        delivery: fields.delivery,
        delivery_price: fields.deliveryPrice,
        rental_price: fields.rentalPrice,
        rental_base_price: fields.rentalBasePrice,
        applied_club_tier: fields.appliedClubTier,
        rental_discount_percent: fields.rentalDiscountPercent,
        delivery_savings: fields.deliverySavings,
        insurance_savings: fields.insuranceSavings,
        total: fields.total,
        deposit: fields.deposit,
        status: "pending"
    });

    if (error) {
        console.error("createReservation:", error);
        return null;
    }
    return reference;
}

/* Regroupe les réservations d'un client par semaine, triées de la
   plus récente à la plus ancienne, avec le détail de chaque dépense. */
async function getClientWeeklySpending(userId) {
    const { data, error } = await supabaseClient
        .from("reservations")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

    if (error) {
        console.error("getClientWeeklySpending:", error);
        return [];
    }
    const reservations = data.map(mapReservationRow);

    const weeks = {};
    reservations.forEach(function (r) {
        const key = getWeekStartKey(r.createdAt);
        if (!weeks[key]) weeks[key] = [];
        weeks[key].push(r);
    });

    return Object.keys(weeks)
        .sort(function (a, b) { return new Date(b) - new Date(a); })
        .map(function (key) {
            const items = weeks[key].sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });
            const total = items.reduce(function (sum, r) { return sum + r.total; }, 0);
            return { weekStartKey: key, label: formatWeekLabel(key), items: items, total: total };
        });
}

/* ============================================================
   1septies-ter. CALENDRIER DE DISPONIBILITÉ
   ============================================================ */

/* Couleur affichée pour une réservation selon l'abonnement du
   client qui l'a faite. Apex Club/Black : fond noir + accent. */
const TIER_CALENDAR_STYLE = {
    "none": { bg: "#1F7A4D", color: "#F5F5F5", label: "Standard" },
    "entreprise": { bg: "#1D4ED8", color: "#F5F5F5", label: "Entreprise" },
    "apex-club": { bg: "#0B0B0D", color: "#F5F5F5", border: "2px solid #C8102E", label: "Apex Club" },
    "apex-black": { bg: "#0B0B0D", color: "#F5F5F5", border: "2px solid #D4AF37", label: "Apex Black" }
};

function getTierCalendarStyle(tier) {
    return TIER_CALENDAR_STYLE[tier] || TIER_CALENDAR_STYLE.none;
}

/* Lundi 00:00 de la semaine contenant refDate (objet Date). */
function getWeekMonday(refDate) {
    const d = new Date(refDate);
    const day = d.getDay();
    const diffToMonday = (day === 0 ? -6 : 1) - day;
    d.setDate(d.getDate() + diffToMonday);
    d.setHours(0, 0, 0, 0);
    return d;
}

/* Les 7 dates (Date objects) de la semaine commençant à monday. */
function getWeekDates(monday) {
    const dates = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        dates.push(d);
    }
    return dates;
}

/* Construit une clé YYYY-MM-DD à partir de la date LOCALE d'un objet
   Date, sans passer par toISOString() (qui convertit en UTC et peut
   décaler la date d'un jour selon le fuseau horaire de la personne). */
function toLocalDateKey(d) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return year + "-" + month + "-" + day;
}

function toDateKey(d) {
    return toLocalDateKey(d);
}

function todayLocalKey() {
    return toLocalDateKey(new Date());
}

/* Convertit un timestamp ISO (UTC, tel que renvoyé par Supabase) en
   date locale YYYY-MM-DD, pour comparer/afficher des "jours" cohérents
   avec le fuseau horaire de la personne plutôt qu'en UTC. */
function isoToLocalDateKey(isoString) {
    return toLocalDateKey(new Date(isoString));
}

/* Vrai si une réservation (déjà chargée) couvre cette date. */
function reservationCoversDate(reservation, dateKey) {
    return dateKey >= reservation.startDate && dateKey <= reservation.endDate;
}

/* Récupère en UNE requête toutes les réservations (non annulées)
   qui chevauchent une plage de dates [startKey, endKey] — à filtrer
   ensuite jour par jour côté client avec reservationCoversDate().
   filters : { vehicleId } ou { userId } (optionnels). */
async function getReservationsOverlappingRange(filters, startKey, endKey) {
    let query = supabaseClient
        .from("reservations")
        .select("*")
        .neq("status", "cancelled")
        .lte("start_date", endKey)
        .gte("end_date", startKey);

    if (filters && filters.vehicleId) query = query.eq("vehicle_id", filters.vehicleId);
    if (filters && filters.userId) query = query.eq("user_id", filters.userId);

    const { data, error } = await query;
    if (error) {
        console.error("getReservationsOverlappingRange:", error);
        return [];
    }
    return data.map(mapReservationRow);
}

/* Réservations (non annulées) d'un véhicule couvrant une date donnée
   (une seule journée) — pratique pour une vérification ponctuelle. */
async function getReservationsForVehicleOnDate(vehicleId, dateKey) {
    const list = await getReservationsOverlappingRange({ vehicleId: vehicleId }, dateKey, dateKey);
    return list.filter(function (r) { return reservationCoversDate(r, dateKey); });
}

/* Réservations (non annulées) d'un client couvrant une date donnée. */
async function getReservationsForClientOnDate(userId, dateKey) {
    const list = await getReservationsOverlappingRange({ userId: userId }, dateKey, dateKey);
    return list.filter(function (r) { return reservationCoversDate(r, dateKey); });
}

/* ============================================================
   2. STORAGE HELPERS (SIMULATION RP UNIQUEMENT)
   ============================================================ */

const STORAGE_KEYS = {
    USERS: "apex_users",
    SESSION: "apex_session",
    RESERVATIONS: "apex_reservations",
    CONTRACTS: "apex_contracts",
    INVOICES: "apex_invoices",
    RESERVATION_SEQ: "apex_reservation_seq",
    INVOICE_SEQ: "apex_invoice_seq",
    SUPPORT_TICKETS: "apex_support_tickets",
    CONTACT_MESSAGES: "apex_contact_messages",
    BUSINESS_REQUESTS: "apex_business_requests",
    MEDIA_REQUESTS: "apex_media_requests",
    VEHICLE_STATUS: "apex_vehicle_status",
    PRICING_OVERRIDES: "apex_pricing_overrides",
    EMPLOYEES: "apex_employees",
    INCIDENTS: "apex_incidents",
    INCIDENT_SEQ: "apex_incident_seq",
    CUSTOM_VEHICLES: "apex_custom_vehicles",
    VEHICLE_OVERRIDES: "apex_vehicle_overrides",
    DELETED_VEHICLES: "apex_deleted_vehicles",
    CLIENT_GRADES: "apex_client_grades",
    FINANCE_ENTRIES: "apex_finance_entries",
    GRADE_PERMISSIONS: "apex_grade_permissions",
    ACCOUNTING_ENTRIES: "apex_accounting_entries",
    CLUB_TIER_OVERRIDES: "apex_club_tier_overrides"
};

function storageGet(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : (fallback !== undefined ? fallback : null);
    } catch (e) {
        return fallback !== undefined ? fallback : null;
    }
}

function storageSet(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
}

function nextSequence(seqKey, prefix) {
    const current = storageGet(seqKey, 0) + 1;
    storageSet(seqKey, current);
    const year = new Date().getFullYear();
    return prefix + "-" + year + "-" + String(current).padStart(4, "0");
}

/* ============================================================
   3. AUTHENTIFICATION — SUPABASE
   ============================================================ */

const SUPABASE_URL = "https://rirhriodmtqyhimsekag.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJpcmhyaW9kbXRxeWhpbXNla2FnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk0MjE3NTMsImV4cCI6MjEwNDk5Nzc1M30.DnciNWC4_A97sBD7RGKY0otj4hcN1ylgFcVWS5hlPxc";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* Les comptes employés/entreprise créés depuis le back office
   restent en localStorage jusqu'à la Phase 3 de la migration —
   ces deux fonctions ne concernent qu'EUX, pas la connexion. */
function getUsers() {
    return storageGet(STORAGE_KEYS.USERS, []);
}

function findUserByEmail(email) {
    return getUsers().find(function (u) { return u.email.toLowerCase() === email.toLowerCase(); });
}

let _supabaseUser = null;   // profil de l'utilisateur Supabase connecté (ou null)
let _sessionPromise = null; // évite de relancer plusieurs fois la même requête

function mapProfileToUser(authUser, profile) {
    return {
        id: profile.id,
        email: authUser.email,
        username: profile.username,
        firstName: profile.first_name,
        lastName: profile.last_name,
        phone: profile.phone,
        role: profile.role,
        gradeCode: profile.grade_code,
        clubTier: profile.club_tier,
        customDiscount: Number(profile.custom_discount || 0),
        clientGrade: profile.client_grade,
        businessName: profile.business_name
    };
}

/* Récupère (une seule fois par page) la session Supabase active
   et le profil associé. Doit être terminé (await) avant d'utiliser
   getCurrentUser() ou requireAuth() de façon fiable. */
function initSupabaseSession() {
    if (_sessionPromise) return _sessionPromise;

    _sessionPromise = (async function () {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) {
            _supabaseUser = null;
            return null;
        }
        const { data: profile, error } = await supabaseClient
            .from("profiles")
            .select("*")
            .eq("id", session.user.id)
            .single();

        if (error || !profile) {
            _supabaseUser = null;
            return null;
        }
        _supabaseUser = mapProfileToUser(session.user, profile);
        return _supabaseUser;
    })();

    return _sessionPromise;
}

async function registerUser(data) {
    const { data: signUpData, error } = await supabaseClient.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
            data: {
                first_name: data.firstName,
                last_name: data.lastName,
                phone: data.phone
            }
        }
    });

    if (error) {
        return { ok: false, error: error.message };
    }
    if (!signUpData.session) {
        // La confirmation par e-mail est activée côté Supabase : pas de
        // session immédiate. Voir la note dans supabase/schema.sql.
        return { ok: false, error: "Compte créé, mais une confirmation par e-mail est requise avant de pouvoir se connecter. Désactive 'Confirm email' dans Supabase > Authentication > Providers si ce n'est pas voulu ici." };
    }

    _sessionPromise = null;
    _supabaseUser = null;
    const user = await initSupabaseSession();
    return { ok: true, user: user };
}

/* "identifier" peut être un e-mail ou un identifiant prénom.nom —
   on résout l'identifiant vers son e-mail avant de tenter la connexion. */
async function loginUser(identifier, password) {
    let email = identifier.trim();

    if (email.indexOf("@") === -1) {
        const { data: resolvedEmail, error: resolveError } = await supabaseClient.rpc("get_email_by_username", { p_username: email.toLowerCase() });
        if (resolveError || !resolvedEmail) {
            return { ok: false, error: "Identifiant introuvable." };
        }
        email = resolvedEmail;
    }

    const { error } = await supabaseClient.auth.signInWithPassword({ email: email, password: password });
    if (error) {
        return { ok: false, error: "Identifiant/e-mail ou mot de passe incorrect." };
    }
    _sessionPromise = null;
    _supabaseUser = null;
    const user = await initSupabaseSession();
    return { ok: true, user: user };
}

/* ============================================================
   3bis. MES INFORMATIONS (profil, identifiant, e-mail, mot de passe)
   ============================================================ */

async function updateOwnProfile(fields) {
    const row = {};
    if (fields.firstName !== undefined) row.first_name = fields.firstName;
    if (fields.lastName !== undefined) row.last_name = fields.lastName;
    if (fields.phone !== undefined) row.phone = fields.phone;

    const { error } = await supabaseClient.from("profiles").update(row).eq("id", _supabaseUser.id);
    if (error) return { ok: false, error: error.message };

    _sessionPromise = null;
    _supabaseUser = null;
    await initSupabaseSession();
    return { ok: true };
}

async function updateOwnUsername(newUsername) {
    const clean = newUsername.trim().toLowerCase();
    const { error } = await supabaseClient.from("profiles").update({ username: clean }).eq("id", _supabaseUser.id);
    if (error) {
        if (error.code === "23505") return { ok: false, error: "Cet identifiant est déjà pris." };
        return { ok: false, error: error.message };
    }
    _sessionPromise = null;
    _supabaseUser = null;
    await initSupabaseSession();
    return { ok: true };
}

async function updateOwnEmail(newEmail) {
    const { error } = await supabaseClient.auth.updateUser({ email: newEmail });
    if (error) return { ok: false, error: error.message };
    // Selon la configuration Supabase, un e-mail de confirmation peut être
    // requis avant que le changement soit effectif des deux côtés.
    return { ok: true };
}

async function updateOwnPassword(newPassword) {
    const { error } = await supabaseClient.auth.updateUser({ password: newPassword });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
}

async function logoutUser() {
    await supabaseClient.auth.signOut();
    _supabaseUser = null;
    _sessionPromise = null;
    navigateWithFade(getRelativePath("index.html"));
}

/* Synchrone : ne renvoie une valeur fiable qu'après un premier
   `await initSupabaseSession()` (ou `await requireAuth()`) sur la page. */
function getCurrentUser() {
    return _supabaseUser;
}

async function requireAuth() {
    await initSupabaseSession();
    if (!_supabaseUser) {
        window.location.href = getRelativePath("connexion.html");
        return null;
    }
    return _supabaseUser;
}

/* ============================================================
   6bis. THÈME DYNAMIQUE SELON L'ABONNEMENT
   Change la couleur d'accent du site (boutons, liens actifs,
   badges...) selon le palier VIP du client connecté.
   ============================================================ */

const TIER_THEME_COLORS = {
    "none": { accent: "#C8102E", accentDark: "#9C0C24", accentRgb: "200, 16, 46", cursor: "red" },
    "apex-club": { accent: "#C8102E", accentDark: "#9C0C24", accentRgb: "200, 16, 46", cursor: "red" },
    "entreprise": { accent: "#1D4ED8", accentDark: "#1741A6", accentRgb: "29, 78, 216", cursor: "blue" },
    "apex-black": { accent: "#D4AF37", accentDark: "#A6842A", accentRgb: "212, 175, 55", cursor: "gold" }
};

function applyTierTheme() {
    const user = getCurrentUser();
    const tier = (user && user.clubTier) || "none";
    const theme = TIER_THEME_COLORS[tier] || TIER_THEME_COLORS.none;

    document.documentElement.style.setProperty("--apex-red", theme.accent);
    document.documentElement.style.setProperty("--apex-red-dark", theme.accentDark);
    document.documentElement.style.setProperty("--apex-red-rgb", theme.accentRgb);

    document.body.classList.remove("cursor-red", "cursor-blue", "cursor-gold");
    document.body.classList.add("cursor-" + theme.cursor);
}

function navigateWithFade(href) {
    document.body.classList.remove("page-loaded");
    document.body.classList.add("page-exit");
    setTimeout(function () {
        window.location.href = href;
    }, 180);
}

/* ============================================================
   4. CHEMINS RELATIFS (pages dans client/ et admin/)
   ============================================================ */

function isNestedPage() {
    return window.location.pathname.includes("/client/") || window.location.pathname.includes("/admin/");
}

function getRelativePath(path) {
    return isNestedPage() ? "../" + path : path;
}

/* ============================================================
   5. HEADER / FOOTER INJECTÉS
   ============================================================ */

function apexIconImg(sizePx) {
    const base = getRelativePath("");
    return '<img src="' + base + 'assets/logo/apex-icon.png" alt="APEX RENTAL" style="height:' + sizePx + 'px; width:auto; display:block;">';
}

const NAV_LINKS = [
    { href: "index.html", label: "Accueil" },
    { href: "vehicules.html", label: "Véhicules" },
    { href: "services.html", label: "Services" },
    { href: "club.html", label: "Apex Club" },
    { href: "business.html", label: "Business" },
    { href: "media.html", label: "Media" },
    { href: "faq.html", label: "FAQ" }
];

function currentPageName() {
    const parts = window.location.pathname.split("/");
    return parts[parts.length - 1] || "index.html";
}

function renderHeader() {
    const mount = document.getElementById("site-header");
    if (!mount) return;

    const base = getRelativePath("");
    const current = currentPageName();
    const user = getCurrentUser();

    const navHTML = NAV_LINKS.map(function (link) {
        const active = link.href === current ? " active" : "";
        return '<a href="' + base + link.href + '" class="' + active.trim() + '">' + link.label + '</a>';
    }).join("");

    const isClient = user && user.role === "client";
    const isStaff = user && (user.role === "admin" || user.role === "employee");

    const mobileNavHTML = NAV_LINKS.map(function (link) {
        return '<a href="' + base + link.href + '">' + link.label + '</a>';
    }).join("") + (isClient
        ? '<a href="' + base + 'client/dashboard.html">Mon espace</a><a href="' + base + 'profil.html">Mes informations</a>'
        : (isStaff
            ? '<a href="' + base + 'admin/dashboard.html">Mon compte</a><a href="' + base + 'profil.html">Mes informations</a>'
            : '<a href="' + base + 'connexion.html">Connexion</a>'));

    const actionsHTML = isClient
        ? '<a href="' + base + 'profil.html" class="btn btn-outline btn-sm">Mes informations</a>' +
          '<a href="' + base + 'client/dashboard.html" class="btn btn-outline btn-sm">Mon espace</a>' +
          '<a href="' + base + 'vehicules.html" class="btn btn-primary btn-sm">Réserver</a>'
        : (isStaff
            ? '<a href="' + base + 'profil.html" class="btn btn-outline btn-sm">Mes informations</a>' +
              '<a href="' + base + 'admin/dashboard.html" class="btn btn-outline btn-sm">Mon compte</a>' +
              '<a href="' + base + 'vehicules.html" class="btn btn-primary btn-sm">Réserver</a>'
            : '<a href="' + base + 'connexion.html" class="btn btn-outline btn-sm">Connexion</a>' +
              '<a href="' + base + 'vehicules.html" class="btn btn-primary btn-sm">Réserver</a>');

    mount.innerHTML =
        '<header class="site-header" id="mainHeader">' +
        '  <div class="container header-inner">' +
        '    <a href="' + base + 'index.html" class="logo">' + apexIconImg(34) +
        '    </a>' +
        '    <nav class="main-nav">' + navHTML + '</nav>' +
        '    <div class="header-actions">' +
        '      ' + actionsHTML +
        '      <button class="burger" id="burgerBtn" aria-label="Menu"><span></span><span></span><span></span></button>' +
        '    </div>' +
        '  </div>' +
        '  <div class="mobile-nav" id="mobileNav">' + mobileNavHTML + '</div>' +
        '</header>';

    const burger = document.getElementById("burgerBtn");
    const mobileNav = document.getElementById("mobileNav");
    if (burger && mobileNav) {
        burger.addEventListener("click", function () {
            mobileNav.classList.toggle("open");
        });
    }

    window.addEventListener("scroll", function () {
        const header = document.getElementById("mainHeader");
        if (!header) return;
        if (window.scrollY > 12) {
            header.classList.add("scrolled");
        } else {
            header.classList.remove("scrolled");
        }
    });
}

function renderFooter() {
    const mount = document.getElementById("site-footer");
    if (!mount) return;
    const base = getRelativePath("");
    const year = new Date().getFullYear();

    mount.innerHTML =
        '<footer class="site-footer">' +
        '  <div class="container footer-grid">' +
        '    <div class="footer-col">' +
        '      <a href="' + base + 'index.html" class="logo">' + apexIconImg(30) +
        '        <span class="logo-text"><span class="base">APEX</span> <span class="accent">RENTAL</span></span>' +
        '      </a>' +
        '      <p class="footer-desc">Votre route. Votre choix. Votre véhicule.</p>' +
        '    </div>' +
        '    <div class="footer-col">' +
        '      <h4>Navigation</h4>' +
        '      <ul>' +
        '        <li><a href="' + base + 'vehicules.html">Véhicules</a></li>' +
        '        <li><a href="' + base + 'club.html">Apex Club</a></li>' +
        '        <li><a href="' + base + 'business.html">Business</a></li>' +
        '        <li><a href="' + base + 'media.html">Media</a></li>' +
        '      </ul>' +
        '    </div>' +
        '    <div class="footer-col">' +
        '      <h4>Services</h4>' +
        '      <ul>' +
        '        <li><a href="' + base + 'vehicules.html?cat=SPORT">Apex Sport</a></li>' +
        '        <li><a href="' + base + 'vehicules.html?cat=PRESTIGE">Apex Prestige</a></li>' +
        '        <li><a href="' + base + 'tarifs.html">Tarifs</a></li>' +
        '      </ul>' +
        '    </div>' +
        '    <div class="footer-col">' +
        '      <h4>Support</h4>' +
        '      <ul>' +
        '        <li><a href="' + base + 'faq.html">FAQ</a></li>' +
        '        <li><a href="' + base + 'contact.html">Contact</a></li>' +
        '        <li><a href="' + base + 'connexion.html">Connexion</a></li>' +
        '      </ul>' +
        '    </div>' +
        '  </div>' +
        '  <p class="footer-bottom">© ' + year + ' APEX RENTAL — Location de véhicule — Intro.</p>' +
        '</footer>';
}

/* ============================================================
   6. ANIMATIONS UTILITAIRES
   ============================================================ */

function initScrollReveal() {
    const items = document.querySelectorAll(".reveal");
    if (!items.length) return;
    const observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
            if (entry.isIntersecting) {
                entry.target.classList.add("visible");
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.15 });
    items.forEach(function (item) { observer.observe(item); });
}

function animateCounter(el, target, duration) {
    const start = 0;
    const startTime = performance.now();
    function tick(now) {
        const progress = Math.min((now - startTime) / duration, 1);
        const value = Math.floor(start + (target - start) * progress);
        el.textContent = value.toLocaleString("fr-FR");
        if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
}

function initCounters() {
    const counters = document.querySelectorAll("[data-counter]");
    if (!counters.length) return;
    const observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
            if (entry.isIntersecting) {
                const target = parseInt(entry.target.getAttribute("data-counter"), 10);
                animateCounter(entry.target, target, 900);
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.3 });
    counters.forEach(function (c) { observer.observe(c); });
}

/* ============================================================
   7. RENDU DES VÉHICULES (silhouette SVG + carte)
   ============================================================ */

function vehicleSilhouetteSVG() {
    return '<svg viewBox="0 0 400 180" xmlns="http://www.w3.org/2000/svg">' +
        '<ellipse cx="200" cy="150" rx="150" ry="10" fill="#000" opacity="0.35"/>' +
        '<path d="M40 120 C40 95 70 90 100 85 L140 55 C155 45 175 40 200 40 C230 40 255 48 275 62 L305 88 C335 92 365 98 365 120 L365 130 L40 130 Z" fill="rgba(184,188,194,0.12)" stroke="#B8BCC2" stroke-width="2"/>' +
        '<path d="M150 60 C165 50 180 47 200 47 C222 47 242 53 258 64 L250 82 L158 82 Z" fill="#0B0B0D" opacity="0.6"/>' +
        '<path d="M60 108 H340" stroke="#C8102E" stroke-width="2" opacity="0.7"/>' +
        '<circle cx="110" cy="130" r="22" fill="#0B0B0D" stroke="#B8BCC2" stroke-width="2"/>' +
        '<circle cx="110" cy="130" r="9" fill="#24262A"/>' +
        '<circle cx="300" cy="130" r="22" fill="#0B0B0D" stroke="#B8BCC2" stroke-width="2"/>' +
        '<circle cx="300" cy="130" r="9" fill="#24262A"/>' +
        '</svg>';
}

function fleetIllustrationSVG() {
    return '<svg viewBox="0 0 400 200" xmlns="http://www.w3.org/2000/svg" style="width:100%; height:100%;">' +
        '<ellipse cx="200" cy="168" rx="170" ry="10" fill="#000" opacity="0.35"/>' +
        '<g opacity="0.5" transform="translate(60,10) scale(0.85)">' +
        '  <rect x="30" y="70" width="220" height="50" rx="10" fill="#24262A" stroke="#B8BCC2" stroke-width="1.5"/>' +
        '  <rect x="60" y="45" width="130" height="35" rx="8" fill="#0B0B0D"/>' +
        '  <circle cx="75" cy="122" r="16" fill="#0B0B0D" stroke="#B8BCC2" stroke-width="1.5"/>' +
        '  <circle cx="210" cy="122" r="16" fill="#0B0B0D" stroke="#B8BCC2" stroke-width="1.5"/>' +
        '</g>' +
        '<g transform="translate(90,50)">' +
        '  <rect x="20" y="70" width="240" height="55" rx="12" fill="#24262A" stroke="#B8BCC2" stroke-width="2"/>' +
        '  <rect x="55" y="42" width="150" height="40" rx="9" fill="#0B0B0D"/>' +
        '  <path d="M55 82 H260" stroke="#C8102E" stroke-width="2" opacity="0.7"/>' +
        '  <circle cx="68" cy="128" r="19" fill="#0B0B0D" stroke="#B8BCC2" stroke-width="2"/>' +
        '  <circle cx="68" cy="128" r="7" fill="#24262A"/>' +
        '  <circle cx="222" cy="128" r="19" fill="#0B0B0D" stroke="#B8BCC2" stroke-width="2"/>' +
        '  <circle cx="222" cy="128" r="7" fill="#24262A"/>' +
        '</g>' +
        '<g transform="translate(310,30)">' +
        '  <circle r="24" cx="0" cy="0" fill="#0B0B0D" stroke="#C8102E" stroke-width="2"/>' +
        '  <text x="0" y="5" text-anchor="middle" font-size="18" fill="#F5F5F5" font-family="sans-serif">B2B</text>' +
        '</g>' +
        '</svg>';
}

function mediaIllustrationSVG() {
    return '<svg viewBox="0 0 400 200" xmlns="http://www.w3.org/2000/svg" style="width:100%; height:100%;">' +
        '<ellipse cx="200" cy="168" rx="160" ry="10" fill="#000" opacity="0.35"/>' +
        '<path d="M180 165 L200 110 L220 165" stroke="#B8BCC2" stroke-width="2" fill="none"/>' +
        '<path d="M160 165 L200 110 L240 165" stroke="#B8BCC2" stroke-width="2" fill="none" opacity="0.6"/>' +
        '<g transform="translate(150,60)">' +
        '  <rect x="0" y="0" width="90" height="55" rx="6" fill="#24262A" stroke="#B8BCC2" stroke-width="2"/>' +
        '  <rect x="90" y="12" width="30" height="30" rx="4" fill="#0B0B0D" stroke="#B8BCC2" stroke-width="1.5"/>' +
        '  <circle cx="25" cy="27" r="15" fill="#0B0B0D" stroke="#C8102E" stroke-width="2"/>' +
        '  <circle cx="25" cy="27" r="7" fill="#C8102E" opacity="0.7"/>' +
        '</g>' +
        '<path d="M280 40 L340 20 L340 120 L280 90 Z" fill="#C8102E" opacity="0.08"/>' +
        '<circle cx="285" cy="55" r="10" fill="#24262A" stroke="#C8102E" stroke-width="2"/>' +
        '<g transform="translate(60,120)">' +
        '  <rect x="0" y="10" width="70" height="45" rx="4" fill="#0B0B0D" stroke="#B8BCC2" stroke-width="2"/>' +
        '  <path d="M0 20 L70 10 L70 20 L0 30 Z" fill="#C8102E" opacity="0.8"/>' +
        '</g>' +
        '</svg>';
}

/* Affiche la vraie photo du véhicule si l'admin en a uploadé une
   (stockée en base64 dans localStorage), sinon la silhouette SVG. */
function vehicleMediaHTML(v) {
    if (v.image) {
        return '<img src="' + v.image + '" alt="' + v.name + '">';
    }
    return vehicleSilhouetteSVG();
}

/* Redimensionne et compresse une image uploadée avant de la stocker
   en base64 dans localStorage (pour ne pas exploser le quota).
   callback(dataUrl) est appelé une fois prêt. */
function readImageAsCompressedDataURL(file, callback, maxWidth) {
    maxWidth = maxWidth || 1920;
    const reader = new FileReader();
    reader.onload = function (e) {
        const img = new Image();
        img.onload = function () {
            const scale = Math.min(1, maxWidth / img.width);
            const canvas = document.createElement("canvas");
            canvas.width = img.width * scale;
            canvas.height = img.height * scale;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            callback(canvas.toDataURL("image/jpeg", 1.0));
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function renderVehicleCard(v) {
    const base = getRelativePath("");
    const statusBadge = v.available
        ? '<span class="badge badge-available">Disponible</span>'
        : '<span class="badge badge-rented">Indisponible</span>';

    return (
        '<div class="vehicle-card" data-id="' + v.id + '" data-category="' + v.category + '" data-price="' + v.price24h + '" data-seats="' + v.seats + '" data-transmission="' + v.transmission + '" data-power="' + v.power + '" data-available="' + v.available + '">' +
        '  <div class="vehicle-media">' + vehicleMediaHTML(v) +
        (v.popularity >= 90 ? '<span class="vehicle-badge">Populaire</span>' : '') +
        '  </div>' +
        '  <div class="vehicle-body">' +
        '    <span class="vehicle-cat">' + getCategoryLabel(v.category) + '</span>' +
        '    <h3 class="vehicle-name">' + v.name + '</h3>' +
        '    <div class="vehicle-specs">' +
        '      <span>⚡ ' + v.power + ' hp</span>' +
        '      <span>👤 ' + v.seats + '</span>' +
        '      <span>⚙ ' + (v.transmission === "Manuelle" ? "MAN" : "AUTO") + '</span>' +
        '    </div>' +
        '    <div class="vehicle-footer">' +
        '      <div class="vehicle-price">' +
        '        <span class="label">À partir de</span>' +
        '        <span class="amount">' + v.price24h.toLocaleString("fr-FR") + ' $<span> / 24h</span></span>' +
        '      </div>' +
        '      ' + statusBadge +
        '    </div>' +
        '    <a href="' + base + 'vehicule.html?id=' + v.id + '" class="btn btn-outline btn-sm btn-block mt-2">Voir le véhicule</a>' +
        '  </div>' +
        '</div>'
    );
}

function renderVehicleGrid(container, list) {
    if (!container) return;
    if (!list.length) {
        container.innerHTML = '<p class="text-silver text-center">Aucun véhicule ne correspond à ta recherche.</p>';
        return;
    }
    container.innerHTML = list.map(renderVehicleCard).join("");
}

/* ============================================================
   8. INITIALISATION COMMUNE
   ============================================================ */

/* Fondu en sortie avant de quitter la page, fondu en entrée à
   l'arrivée — donne une impression de transition fluide entre
   les pages sur un site multi-pages classique. */
function initPageTransitions() {
    requestAnimationFrame(function () {
        document.body.classList.add("page-loaded");
    });

    // Si l'utilisateur revient en arrière (bfcache), on s'assure
    // que la page est bien visible et pas figée en fondu de sortie.
    window.addEventListener("pageshow", function () {
        document.body.classList.remove("page-exit");
        document.body.classList.add("page-loaded");
    });

    document.addEventListener("click", function (e) {
        const link = e.target.closest("a[href]");
        if (!link) return;

        const href = link.getAttribute("href");
        if (!href) return;

        // On ignore les ancres, liens externes, mailto/tel, nouvel onglet,
        // et les clics avec touche modificatrice (ouverture dans un autre onglet).
        if (href.charAt(0) === "#") return;
        if (href.indexOf("http://") === 0 || href.indexOf("https://") === 0) return;
        if (href.indexOf("mailto:") === 0 || href.indexOf("tel:") === 0) return;
        if (link.target === "_blank") return;
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;

        e.preventDefault();
        document.body.classList.remove("page-loaded");
        document.body.classList.add("page-exit");
        setTimeout(function () {
            window.location.href = href;
        }, 180);
    });
}

document.addEventListener("DOMContentLoaded", async function () {
    await initSupabaseSession();
    applyTierTheme();
    renderHeader();
    if (currentPageName() === "faq.html") {
        renderFooter();
    }
    initScrollReveal();
    initCounters();
    initPageTransitions();
});
