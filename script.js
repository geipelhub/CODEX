const ANNUAL_CONSUMPTION_KWH = 3500;
const STORAGE_KEY = "stromspar-leaderboard";

const form = document.getElementById("savings-form");
const leaderboardBody = document.getElementById("leaderboard-body");
const rowTemplate = document.getElementById("row-template");
const emptyState = document.getElementById("empty-state");
const entryCount = document.getElementById("entry-count");
const resetBoardButton = document.getElementById("reset-board");
const formMessage = document.getElementById("form-message");
const syncModeBadge = document.getElementById("sync-mode-badge");
const adminStatus = document.getElementById("admin-status");
const adminLoginButton = document.getElementById("admin-login-button");
const adminLogoutButton = document.getElementById("admin-logout-button");
const adminClearButton = document.getElementById("admin-clear-button");
const actionsHead = document.getElementById("actions-head");

const supabaseClient = createSupabaseClient();
const appConfig = window.APP_CONFIG || {};
const adminEmail = appConfig.adminEmail || "";
let entries = [];
let isAdmin = false;

initializeApp();

document.getElementById("old-tariff-type").addEventListener("change", () => {
  updateTariffInputs("old");
});

document.getElementById("new-tariff-type").addEventListener("change", () => {
  updateTariffInputs("new");
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    const formData = new FormData(form);
    const entry = createEntry({
      name: formData.get("name"),
      oldTariffName: formData.get("oldTariffName"),
      oldTariffType: formData.get("oldTariffType"),
      oldWorkPrice: formData.get("oldWorkPrice"),
      oldBasePrice: formData.get("oldBasePrice"),
      oldMarkup: formData.get("oldMarkup"),
      newTariffName: formData.get("newTariffName"),
      newTariffType: formData.get("newTariffType"),
      newWorkPrice: formData.get("newWorkPrice"),
      newBasePrice: formData.get("newBasePrice"),
      newMarkup: formData.get("newMarkup"),
    });

    if (supabaseClient) {
      await saveEntryToSupabase(entry);
      await refreshEntries();
      showMessage("Eintrag gespeichert und mit dem gemeinsamen Leaderboard synchronisiert.", "success");
    } else {
      entries.push(entry);
      sortEntries();
      persistEntries();
      renderEntries();
      showMessage("Eintrag lokal gespeichert.", "success");
    }

    form.reset();
    document.getElementById("name").focus();
  } catch (error) {
    showMessage(error.message || "Der Eintrag konnte nicht gespeichert werden.", "error");
  }
});

resetBoardButton.addEventListener("click", async () => {
  const confirmed = window.confirm(
    "Willst du das Leaderboard wirklich leeren?"
  );

  if (!confirmed) {
    return;
  }

  if (supabaseClient) {
    showMessage(
      "Im gemeinsamen Modus braucht das Leeren Admin-Rechte.",
      "error"
    );
    return;
  }

  entries = [];
  persistEntries();
  renderEntries();
  showMessage("Lokales Leaderboard geleert.", "success");
});

adminLoginButton.addEventListener("click", async () => {
  if (!supabaseClient || !adminEmail) {
    showMessage("Admin-Login ist nur mit Supabase und hinterlegter Admin-E-Mail verfuegbar.", "error");
    return;
  }

  const { error } = await supabaseClient.auth.signInWithOtp({
    email: adminEmail,
    options: {
      emailRedirectTo: window.location.href,
    },
  });

  if (error) {
    showMessage(`Admin-Login konnte nicht gestartet werden: ${error.message}`, "error");
    return;
  }

  showMessage(`Admin-Login-Link wurde an ${adminEmail} geschickt.`, "success");
});

adminLogoutButton.addEventListener("click", async () => {
  if (!supabaseClient) {
    return;
  }

  await supabaseClient.auth.signOut();
  showMessage("Admin wurde abgemeldet.", "success");
});

adminClearButton.addEventListener("click", async () => {
  const confirmed = window.confirm("Wirklich alle Eintraege loeschen?");

  if (!confirmed) {
    return;
  }

  try {
    await deleteAllEntriesFromSupabase();
    await refreshEntries();
    showMessage("Alle Eintraege wurden geloescht.", "success");
  } catch (error) {
    showMessage(error.message || "Loeschen fehlgeschlagen.", "error");
  }
});

function createEntry(data) {
  const oldTariffType = parseTariffType(data.oldTariffType);
  const oldTariffMetrics = resolveTariffMetrics({
    tariffType: oldTariffType,
    workPrice: data.oldWorkPrice,
    markup: data.oldMarkup,
  });
  const oldBasePriceEuro = parseCurrencyValue(data.oldBasePrice);
  const newTariffType = parseTariffType(data.newTariffType);
  const newTariffMetrics = resolveTariffMetrics({
    tariffType: newTariffType,
    workPrice: data.newWorkPrice,
    markup: data.newMarkup,
  });
  const newBasePriceEuro = parseCurrencyValue(data.newBasePrice);

  const oldAnnualCost =
    (ANNUAL_CONSUMPTION_KWH * oldTariffMetrics.effectiveWorkPriceCents) / 100 + oldBasePriceEuro;
  const newAnnualCost =
    (ANNUAL_CONSUMPTION_KWH * newTariffMetrics.effectiveWorkPriceCents) / 100 + newBasePriceEuro;
  const annualSavings = oldAnnualCost - newAnnualCost;

  return {
    id: crypto.randomUUID(),
    name: String(data.name).trim(),
    oldTariffName: String(data.oldTariffName).trim(),
    oldTariffType,
    oldMarketPriceCents: oldTariffMetrics.marketPriceCents,
    oldMarkupCents: oldTariffMetrics.markupCents,
    oldEstimated: oldTariffMetrics.isEstimate,
    newTariffName: String(data.newTariffName).trim(),
    newTariffType,
    newMarketPriceCents: newTariffMetrics.marketPriceCents,
    newMarkupCents: newTariffMetrics.markupCents,
    newEstimated: newTariffMetrics.isEstimate,
    oldWorkPriceCents: oldTariffMetrics.effectiveWorkPriceCents,
    oldBasePriceEuro,
    newWorkPriceCents: newTariffMetrics.effectiveWorkPriceCents,
    newBasePriceEuro,
    oldAnnualCost,
    newAnnualCost,
    annualSavings,
    createdAt: new Date().toISOString(),
  };
}

function parseCurrencyValue(rawValue) {
  const normalized = String(rawValue).replace(",", ".").trim();
  const parsedValue = Number.parseFloat(normalized);

  if (Number.isNaN(parsedValue) || parsedValue < 0) {
    throw new Error("Ungueltiger Preiswert.");
  }

  return parsedValue;
}

function parseTariffType(rawValue) {
  return rawValue === "dynamic" ? "dynamic" : "fixed";
}

function resolveTariffMetrics({ tariffType, workPrice, markup }) {
  const primaryPrice = parseCurrencyValue(workPrice);

  if (tariffType === "dynamic") {
    const markupCents = parseCurrencyValue(markup || "0");
    return {
      marketPriceCents: primaryPrice,
      markupCents,
      effectiveWorkPriceCents: primaryPrice + markupCents,
      isEstimate: true,
    };
  }

  return {
    marketPriceCents: null,
    markupCents: 0,
    effectiveWorkPriceCents: primaryPrice,
    isEstimate: false,
  };
}

function createSupabaseClient() {
  const appConfig = window.APP_CONFIG || {};

  if (!appConfig.supabaseUrl || !appConfig.supabaseAnonKey) {
    syncModeBadge.textContent = "Lokaler Browser-Modus";
    return null;
  }

  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    syncModeBadge.textContent = "Lokaler Browser-Modus";
    return null;
  }

  syncModeBadge.textContent = "Gemeinsames Live-Leaderboard";
  return window.supabase.createClient(
    appConfig.supabaseUrl,
    appConfig.supabaseAnonKey
  );
}

function sortEntries() {
  entries.sort((left, right) => {
    if (right.annualSavings !== left.annualSavings) {
      return right.annualSavings - left.annualSavings;
    }

    return left.createdAt.localeCompare(right.createdAt);
  });
}

function persistEntries() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function loadEntries() {
  const rawEntries = localStorage.getItem(STORAGE_KEY);

  if (!rawEntries) {
    return [];
  }

  try {
    const parsedEntries = JSON.parse(rawEntries);
    return Array.isArray(parsedEntries) ? parsedEntries : [];
  } catch {
    return [];
  }
}

async function initializeApp() {
  updateTariffInputs("old");
  updateTariffInputs("new");
  await initializeAdminSession();
  await refreshEntries();

  if (supabaseClient) {
    subscribeToRealtimeUpdates();
  }
}

async function initializeAdminSession() {
  updateAdminUi();

  if (!supabaseClient) {
    return;
  }

  const {
    data: { session },
  } = await supabaseClient.auth.getSession();

  setAdminState(session);

  supabaseClient.auth.onAuthStateChange((_event, sessionSnapshot) => {
    setAdminState(sessionSnapshot);
  });
}

async function refreshEntries() {
  if (supabaseClient) {
    entries = await loadEntriesFromSupabase();
  } else {
    entries = loadEntries();
  }

  renderEntries();
}

async function loadEntriesFromSupabase() {
  const { data, error } = await supabaseClient
    .from("leaderboard_entries")
    .select("*")
    .order("annual_savings", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) {
    showMessage(
      "Supabase konnte nicht gelesen werden. Die App bleibt verfuegbar, aber pruefe URL, Key und Tabellenstruktur.",
      "error"
    );
    return [];
  }

  return data.map(mapSupabaseRowToEntry);
}

async function saveEntryToSupabase(entry) {
  const payload = {
    id: entry.id,
    name: entry.name,
    old_tariff_name: entry.oldTariffName,
    old_tariff_type: entry.oldTariffType,
    old_work_price_cents: entry.oldWorkPriceCents,
    old_market_price_cents: entry.oldMarketPriceCents,
    old_markup_cents: entry.oldMarkupCents,
    old_base_price_euro: entry.oldBasePriceEuro,
    new_tariff_name: entry.newTariffName,
    new_tariff_type: entry.newTariffType,
    new_work_price_cents: entry.newWorkPriceCents,
    new_market_price_cents: entry.newMarketPriceCents,
    new_markup_cents: entry.newMarkupCents,
    new_base_price_euro: entry.newBasePriceEuro,
    old_annual_cost: entry.oldAnnualCost,
    new_annual_cost: entry.newAnnualCost,
    annual_savings: entry.annualSavings,
    estimated: entry.oldEstimated || entry.newEstimated,
    created_at: entry.createdAt,
  };

  const { error } = await supabaseClient
    .from("leaderboard_entries")
    .insert(payload);

  if (error) {
    throw new Error(
      "Speichern im gemeinsamen Leaderboard fehlgeschlagen. Bitte Supabase-Setup pruefen."
    );
  }
}

async function deleteEntryFromSupabase(id) {
  const { error } = await supabaseClient
    .from("leaderboard_entries")
    .delete()
    .eq("id", id);

  if (error) {
    throw new Error("Eintrag konnte nicht geloescht werden. Admin-Login pruefen.");
  }
}

async function deleteAllEntriesFromSupabase() {
  const { error } = await supabaseClient
    .from("leaderboard_entries")
    .delete()
    .not("id", "is", null);

  if (error) {
    throw new Error("Leaderboard konnte nicht geleert werden. Admin-Login pruefen.");
  }
}

function subscribeToRealtimeUpdates() {
  supabaseClient
    .channel("leaderboard-live")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "leaderboard_entries" },
      async () => {
        await refreshEntries();
      }
    )
    .subscribe();
}

function mapSupabaseRowToEntry(row) {
  return {
    id: row.id,
    name: row.name,
    oldTariffName: row.old_tariff_name,
    oldTariffType: row.old_tariff_type || "fixed",
    oldWorkPriceCents: Number(row.old_work_price_cents),
    oldMarketPriceCents: row.old_market_price_cents === null ? null : Number(row.old_market_price_cents),
    oldMarkupCents: row.old_markup_cents === null ? 0 : Number(row.old_markup_cents),
    oldBasePriceEuro: Number(row.old_base_price_euro),
    newTariffName: row.new_tariff_name,
    newTariffType: row.new_tariff_type || "fixed",
    newWorkPriceCents: Number(row.new_work_price_cents),
    newMarketPriceCents: row.new_market_price_cents === null ? null : Number(row.new_market_price_cents),
    newMarkupCents: row.new_markup_cents === null ? 0 : Number(row.new_markup_cents),
    newBasePriceEuro: Number(row.new_base_price_euro),
    oldAnnualCost: Number(row.old_annual_cost),
    newAnnualCost: Number(row.new_annual_cost),
    annualSavings: Number(row.annual_savings),
    estimated: Boolean(row.estimated),
    createdAt: row.created_at,
  };
}

function renderEntries() {
  sortEntries();
  leaderboardBody.innerHTML = "";

  emptyState.hidden = entries.length > 0;
  entryCount.textContent = `${entries.length} Eintraege`;

  entries.forEach((entry, index) => {
    const rowFragment = rowTemplate.content.cloneNode(true);
    const row = rowFragment.querySelector("tr");

    row.querySelector(".rank-cell").textContent = `#${index + 1}`;
    row.querySelector(".name-cell").textContent = entry.name;
    row.querySelector(".old-total-cell").textContent = formatEuro(entry.oldAnnualCost);
    row.querySelector(".new-total-cell").textContent = formatEuro(entry.newAnnualCost);
    row.querySelector(".savings-cell").textContent = formatEuro(entry.annualSavings);

    fillTariffCell(row.querySelector(".old-cell"), {
      tariffName: entry.oldTariffName,
      tariffType: entry.oldTariffType,
      workPriceCents: entry.oldWorkPriceCents,
      marketPriceCents: entry.oldMarketPriceCents,
      markupCents: entry.oldMarkupCents,
      basePriceEuro: entry.oldBasePriceEuro,
    });

    fillTariffCell(row.querySelector(".new-cell"), {
      tariffName: entry.newTariffName,
      tariffType: entry.newTariffType,
      workPriceCents: entry.newWorkPriceCents,
      marketPriceCents: entry.newMarketPriceCents,
      markupCents: entry.newMarkupCents,
      basePriceEuro: entry.newBasePriceEuro,
    });

    const actionsCell = row.querySelector(".actions-cell");

    if (isAdmin && supabaseClient) {
      actionsCell.hidden = false;
      actionsCell.querySelector(".delete-entry-button").addEventListener("click", async () => {
        const confirmed = window.confirm(`Eintrag von ${entry.name} wirklich loeschen?`);

        if (!confirmed) {
          return;
        }

        try {
          await deleteEntryFromSupabase(entry.id);
          await refreshEntries();
          showMessage(`Eintrag von ${entry.name} geloescht.`, "success");
        } catch (error) {
          showMessage(error.message || "Eintrag konnte nicht geloescht werden.", "error");
        }
      });
    }

    leaderboardBody.appendChild(rowFragment);
  });
}

function fillTariffCell(cell, tariff) {
  const dynamicDetails =
    tariff.tariffType === "dynamic"
      ? `
        <span>${formatNumber(tariff.marketPriceCents)} ct/kWh Boersenpreis</span><br />
        <span>${formatNumber(tariff.markupCents)} ct/kWh Aufschlag</span><br />
        <span>${formatNumber(tariff.workPriceCents)} ct/kWh geschaetzt effektiv</span><br />
        <span class="tariff-badge estimate">Schaetzung</span>
      `
      : `
        <span>${formatNumber(tariff.workPriceCents)} ct/kWh</span><br />
        <span class="tariff-badge">Festpreis</span>
      `;

  cell.innerHTML = `
    <strong>${escapeHtml(tariff.tariffName)}</strong>
    ${dynamicDetails}
    <br />
    <span>${formatEuro(tariff.basePriceEuro)} Grundpreis</span>
  `;
}

function formatEuro(value) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatNumber(value) {
  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function showMessage(message, type) {
  formMessage.hidden = false;
  formMessage.textContent = message;
  formMessage.className = `form-message is-${type}`;
}

function updateTariffInputs(prefix) {
  const tariffType = document.getElementById(`${prefix}-tariff-type`).value;
  const label = document.querySelector(`[data-role="price-label"][data-tariff="${prefix}"] span`);
  const extraFields = document.getElementById(`${prefix}-dynamic-fields`);
  const markupInput = document.getElementById(`${prefix}-markup`);
  const workPriceInput = document.getElementById(`${prefix}-work-price`);

  if (tariffType === "dynamic") {
    label.textContent = prefix === "old"
      ? "Alter Boersenpreis-Durchschnitt (ct/kWh)"
      : "Neuer Boersenpreis-Durchschnitt (ct/kWh)";
    workPriceInput.placeholder = "8.50";
    markupInput.required = true;
    extraFields.classList.remove("hidden");
    return;
  }

  label.textContent = prefix === "old"
    ? "Alter Arbeitspreis (ct/kWh)"
    : "Neuer Arbeitspreis (ct/kWh)";
  workPriceInput.placeholder = prefix === "old" ? "40.50" : "31.20";
  markupInput.required = false;
  markupInput.value = "";
  extraFields.classList.add("hidden");
}

function setAdminState(session) {
  const sessionEmail = session?.user?.email || "";
  isAdmin = Boolean(sessionEmail && adminEmail && sessionEmail === adminEmail);
  updateAdminUi(sessionEmail);
  renderEntries();
}

function updateAdminUi(sessionEmail = "") {
  if (!supabaseClient) {
    adminStatus.textContent = "Admin nur im Live-Modus";
    adminLoginButton.hidden = true;
    adminLogoutButton.hidden = true;
    adminClearButton.hidden = true;
    actionsHead.hidden = true;
    return;
  }

  if (isAdmin) {
    adminStatus.textContent = `Angemeldet als ${sessionEmail}`;
    adminLoginButton.hidden = true;
    adminLogoutButton.hidden = false;
    adminClearButton.hidden = false;
    actionsHead.hidden = false;
    return;
  }

  adminStatus.textContent = adminEmail
    ? `Nicht angemeldet. Admin: ${adminEmail}`
    : "Nicht angemeldet";
  adminLoginButton.hidden = false;
  adminLogoutButton.hidden = true;
  adminClearButton.hidden = true;
  actionsHead.hidden = true;
}
