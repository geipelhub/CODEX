const DEFAULT_ANNUAL_CONSUMPTION_KWH = 3500;
const STORAGE_KEY = "stromspar-leaderboard";
const SETTINGS_STORAGE_KEY = "stromspar-leaderboard-settings";
const ADMIN_PASSWORD_STORAGE_KEY = "leaderboard-admin-password";
const H0_DAILY_LOAD_PROFILE_WEIGHTS = [
  36, 30, 27, 25, 24, 27, 34, 42, 39, 35, 33, 33,
  34, 33, 32, 34, 39, 46, 53, 57, 54, 47, 41, 35,
].map((value) => value / 890);

const form = document.getElementById("savings-form");
const leaderboardBody = document.getElementById("leaderboard-body");
const rowTemplate = document.getElementById("row-template");
const emptyState = document.getElementById("empty-state");
const entryCount = document.getElementById("entry-count");
const resetBoardButton = document.getElementById("reset-board");
const formMessage = document.getElementById("form-message");
const syncModeBadge = document.getElementById("sync-mode-badge");
const consumptionSummary = document.getElementById("consumption-summary");
const annualConsumptionInput = document.getElementById("annual-consumption");
const entryConsumptionInput = document.getElementById("entry-consumption");
const sortModeSummary = document.getElementById("sort-mode-summary");
const sortModeButtons = Array.from(document.querySelectorAll("[data-sort-mode]"));
const adminStatus = document.getElementById("admin-status");
const adminPasswordInput = document.getElementById("admin-password");
const adminLoginButton = document.getElementById("admin-login-button");
const adminLogoutButton = document.getElementById("admin-logout-button");
const adminClearButton = document.getElementById("admin-clear-button");
const actionsHead = document.getElementById("actions-head");
const adminToggleButton = document.getElementById("admin-toggle");
const adminPanel = document.getElementById("admin");

const supabaseClient = createSupabaseClient();

let entries = [];
let isAdmin = false;
let adminPassword = sessionStorage.getItem(ADMIN_PASSWORD_STORAGE_KEY) || "";
let uiSettings = loadUiSettings();

initializeApp();

adminToggleButton.addEventListener("click", () => {
  const isHidden = adminPanel.classList.toggle("is-hidden");
  adminToggleButton.setAttribute("aria-expanded", String(!isHidden));
});

annualConsumptionInput.addEventListener("input", () => {
  const fallbackConsumption = parsePositiveInteger(
    annualConsumptionInput.value,
    DEFAULT_ANNUAL_CONSUMPTION_KWH
  );
  uiSettings.defaultConsumption = fallbackConsumption;
  entryConsumptionInput.value = String(fallbackConsumption);
  updateUiState();
  persistUiSettings();
});

sortModeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    uiSettings.sortMode = button.dataset.sortMode === "percent" ? "percent" : "absolute";
    updateUiState();
    renderEntries();
    persistUiSettings();
  });
});

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
      annualConsumption: formData.get("annualConsumption"),
      oldTariffName: formData.get("oldTariffName"),
      oldTariffType: formData.get("oldTariffType"),
      oldWorkPrice: formData.get("oldWorkPrice"),
      oldBasePrice: formData.get("oldBasePrice"),
      oldMarkup: formData.get("oldMarkup"),
      oldHourlyPrices: formData.get("oldHourlyPrices"),
      newTariffName: formData.get("newTariffName"),
      newTariffType: formData.get("newTariffType"),
      newWorkPrice: formData.get("newWorkPrice"),
      newBasePrice: formData.get("newBasePrice"),
      newMarkup: formData.get("newMarkup"),
      newHourlyPrices: formData.get("newHourlyPrices"),
    });

    if (supabaseClient) {
      await saveEntryToSupabase(entry);
      await refreshEntries();
      showMessage("Eintrag gespeichert und mit dem gemeinsamen Leaderboard synchronisiert.", "success");
    } else {
      entries.push(entry);
      persistEntries();
      renderEntries();
      showMessage("Eintrag lokal gespeichert.", "success");
    }

    form.reset();
    entryConsumptionInput.value = String(uiSettings.defaultConsumption);
    updateTariffInputs("old");
    updateTariffInputs("new");
    document.getElementById("name").focus();
  } catch (error) {
    showMessage(error.message || "Der Eintrag konnte nicht gespeichert werden.", "error");
  }
});

resetBoardButton.addEventListener("click", () => {
  const confirmed = window.confirm("Willst du das lokale Leaderboard wirklich leeren?");

  if (!confirmed) {
    return;
  }

  if (supabaseClient) {
    showMessage("Im gemeinsamen Modus braucht das Leeren Admin-Rechte.", "error");
    return;
  }

  entries = [];
  persistEntries();
  renderEntries();
  showMessage("Lokales Leaderboard geleert.", "success");
});

adminLoginButton.addEventListener("click", async () => {
  if (!supabaseClient) {
    showMessage("Admin-Entsperren ist nur im Live-Modus verfuegbar.", "error");
    return;
  }

  const attemptedPassword = adminPasswordInput.value.trim();

  if (!attemptedPassword) {
    showMessage("Bitte Admin-Passwort eingeben.", "error");
    return;
  }

  const { data, error } = await supabaseClient.rpc("verify_leaderboard_admin_password", {
    admin_password_input: attemptedPassword,
  });

  if (error || !data) {
    showMessage("Admin-Passwort ist ungueltig.", "error");
    return;
  }

  adminPassword = attemptedPassword;
  isAdmin = true;
  sessionStorage.setItem(ADMIN_PASSWORD_STORAGE_KEY, adminPassword);
  adminPasswordInput.value = "";
  updateAdminUi();
  renderEntries();
  showMessage("Admin-Modus entsperrt.", "success");
});

adminLogoutButton.addEventListener("click", () => {
  adminPassword = "";
  isAdmin = false;
  adminPasswordInput.value = "";
  sessionStorage.removeItem(ADMIN_PASSWORD_STORAGE_KEY);
  updateAdminUi();
  renderEntries();
  showMessage("Admin-Modus gesperrt.", "success");
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

function initializeApp() {
  annualConsumptionInput.value = String(uiSettings.defaultConsumption);
  entryConsumptionInput.value = String(uiSettings.defaultConsumption);
  updateUiState();
  updateTariffInputs("old");
  updateTariffInputs("new");
  initializeAdminSession();
  refreshEntries().then(() => {
    if (supabaseClient) {
      subscribeToRealtimeUpdates();
    }
  });
}

function createEntry(data) {
  const annualConsumptionKwh = parsePositiveInteger(data.annualConsumption, uiSettings.defaultConsumption);

  const oldTariffType = parseTariffType(data.oldTariffType);
  const oldTariffMetrics = resolveTariffMetrics({
    tariffType: oldTariffType,
    workPrice: data.oldWorkPrice,
    markup: data.oldMarkup,
    hourlyPrices: data.oldHourlyPrices,
  });
  const oldBasePriceEuro = parseNumericValue(data.oldBasePrice);

  const newTariffType = parseTariffType(data.newTariffType);
  const newTariffMetrics = resolveTariffMetrics({
    tariffType: newTariffType,
    workPrice: data.newWorkPrice,
    markup: data.newMarkup,
    hourlyPrices: data.newHourlyPrices,
  });
  const newBasePriceEuro = parseNumericValue(data.newBasePrice);

  const oldAnnualCost =
    (annualConsumptionKwh * oldTariffMetrics.effectiveWorkPriceCents) / 100 + oldBasePriceEuro;
  const newAnnualCost =
    (annualConsumptionKwh * newTariffMetrics.effectiveWorkPriceCents) / 100 + newBasePriceEuro;
  const annualSavings = oldAnnualCost - newAnnualCost;
  const savingsPercent = oldAnnualCost > 0 ? (annualSavings / oldAnnualCost) * 100 : 0;

  return {
    id: crypto.randomUUID(),
    name: String(data.name).trim(),
    annualConsumptionKwh,
    oldTariffName: String(data.oldTariffName).trim(),
    oldTariffType,
    oldMarketPriceCents: oldTariffMetrics.marketPriceCents,
    oldMarkupCents: oldTariffMetrics.markupCents,
    oldEstimated: oldTariffMetrics.isEstimate,
    oldPriceSource: oldTariffMetrics.priceSource,
    oldHourlyPricesText: oldTariffMetrics.hourlyPricesText,
    oldAverageMarketPriceCents: oldTariffMetrics.averageMarketPriceCents,
    newTariffName: String(data.newTariffName).trim(),
    newTariffType,
    newMarketPriceCents: newTariffMetrics.marketPriceCents,
    newMarkupCents: newTariffMetrics.markupCents,
    newEstimated: newTariffMetrics.isEstimate,
    newPriceSource: newTariffMetrics.priceSource,
    newHourlyPricesText: newTariffMetrics.hourlyPricesText,
    newAverageMarketPriceCents: newTariffMetrics.averageMarketPriceCents,
    oldWorkPriceCents: oldTariffMetrics.effectiveWorkPriceCents,
    oldBasePriceEuro,
    newWorkPriceCents: newTariffMetrics.effectiveWorkPriceCents,
    newBasePriceEuro,
    oldAnnualCost,
    newAnnualCost,
    annualSavings,
    savingsPercent,
    createdAt: new Date().toISOString(),
  };
}

function parseTariffType(rawValue) {
  return rawValue === "dynamic" ? "dynamic" : "fixed";
}

function parsePositiveInteger(rawValue, fallback) {
  const normalized = String(rawValue ?? "").replace(",", ".").trim();

  if (!normalized) {
    return fallback;
  }

  const parsedValue = Number.parseFloat(normalized);

  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    throw new Error("Bitte einen gueltigen Jahresverbrauch eingeben.");
  }

  return Math.round(parsedValue);
}

function parseNumericValue(rawValue, { allowNegative = false } = {}) {
  const normalized = String(rawValue ?? "").replace(",", ".").trim();
  const parsedValue = Number.parseFloat(normalized);

  if (Number.isNaN(parsedValue)) {
    throw new Error("Ungueltiger Preiswert.");
  }

  if (!allowNegative && parsedValue < 0) {
    throw new Error("Preiswerte duerfen nicht negativ sein.");
  }

  return parsedValue;
}

function parseHourlyPriceSeries(rawValue) {
  const rawText = String(rawValue || "").trim();

  if (!rawText) {
    return [];
  }

  const tokens = rawText
    .split(/[\n;]+/)
    .map((token) => token.trim())
    .filter(Boolean);

  if (tokens.length !== 24) {
    throw new Error("Bitte genau 24 Stundenpreise fuer dynamische Tarife eingeben.");
  }

  return tokens.map((token) => parseNumericValue(token, { allowNegative: true }));
}

function resolveTariffMetrics({ tariffType, workPrice, markup, hourlyPrices }) {
  if (tariffType === "dynamic") {
    const markupCents = parseNumericValue(markup || "0");
    const parsedHourlyPrices = parseHourlyPriceSeries(hourlyPrices);

    if (parsedHourlyPrices.length === 24) {
      const weightedMarketPriceCents = calculateSlpWeightedMarketPrice(parsedHourlyPrices);
      const averageMarketPriceCents = calculateAverage(parsedHourlyPrices);

      return {
        marketPriceCents: weightedMarketPriceCents,
        averageMarketPriceCents,
        markupCents,
        effectiveWorkPriceCents: weightedMarketPriceCents + markupCents,
        isEstimate: true,
        priceSource: "slp_hourly",
        hourlyPricesText: parsedHourlyPrices.map((value) => formatNumber(value)).join("; "),
      };
    }

    const fallbackAveragePriceCents = parseNumericValue(workPrice, { allowNegative: true });
    return {
      marketPriceCents: fallbackAveragePriceCents,
      averageMarketPriceCents: fallbackAveragePriceCents,
      markupCents,
      effectiveWorkPriceCents: fallbackAveragePriceCents + markupCents,
      isEstimate: true,
      priceSource: "average_fallback",
      hourlyPricesText: "",
    };
  }

  const fixedWorkPriceCents = parseNumericValue(workPrice);
  return {
    marketPriceCents: null,
    averageMarketPriceCents: null,
    markupCents: 0,
    effectiveWorkPriceCents: fixedWorkPriceCents,
    isEstimate: false,
    priceSource: "fixed",
    hourlyPricesText: "",
  };
}

function calculateSlpWeightedMarketPrice(hourlyPrices) {
  return hourlyPrices.reduce((total, value, index) => {
    return total + value * H0_DAILY_LOAD_PROFILE_WEIGHTS[index];
  }, 0);
}

function calculateAverage(values) {
  return values.reduce((total, value) => total + value, 0) / values.length;
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
  return window.supabase.createClient(appConfig.supabaseUrl, appConfig.supabaseAnonKey);
}

function getSortedEntries() {
  return [...entries].sort((left, right) => {
    if (uiSettings.sortMode === "percent") {
      if (right.savingsPercent !== left.savingsPercent) {
        return right.savingsPercent - left.savingsPercent;
      }
    } else if (right.annualSavings !== left.annualSavings) {
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
    return Array.isArray(parsedEntries) ? parsedEntries.map(normalizeEntry) : [];
  } catch {
    return [];
  }
}

function loadUiSettings() {
  try {
    const rawSettings = localStorage.getItem(SETTINGS_STORAGE_KEY);
    const parsedSettings = rawSettings ? JSON.parse(rawSettings) : {};

    return {
      defaultConsumption: parseStoredConsumption(parsedSettings.defaultConsumption),
      sortMode: parsedSettings.sortMode === "percent" ? "percent" : "absolute",
    };
  } catch {
    return {
      defaultConsumption: DEFAULT_ANNUAL_CONSUMPTION_KWH,
      sortMode: "absolute",
    };
  }
}

function persistUiSettings() {
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(uiSettings));
}

function parseStoredConsumption(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue > 0
    ? Math.round(numericValue)
    : DEFAULT_ANNUAL_CONSUMPTION_KWH;
}

function initializeAdminSession() {
  isAdmin = Boolean(adminPassword);
  updateAdminUi();
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
      "Supabase konnte nicht gelesen werden. Bitte URL, Key und Tabellenstruktur pruefen.",
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
    annual_consumption_kwh: entry.annualConsumptionKwh,
    old_tariff_name: entry.oldTariffName,
    old_tariff_type: entry.oldTariffType,
    old_work_price_cents: entry.oldWorkPriceCents,
    old_market_price_cents: entry.oldMarketPriceCents,
    old_average_market_price_cents: entry.oldAverageMarketPriceCents,
    old_markup_cents: entry.oldMarkupCents,
    old_price_source: entry.oldPriceSource,
    old_hourly_prices_text: entry.oldHourlyPricesText,
    old_base_price_euro: entry.oldBasePriceEuro,
    new_tariff_name: entry.newTariffName,
    new_tariff_type: entry.newTariffType,
    new_work_price_cents: entry.newWorkPriceCents,
    new_market_price_cents: entry.newMarketPriceCents,
    new_average_market_price_cents: entry.newAverageMarketPriceCents,
    new_markup_cents: entry.newMarkupCents,
    new_price_source: entry.newPriceSource,
    new_hourly_prices_text: entry.newHourlyPricesText,
    new_base_price_euro: entry.newBasePriceEuro,
    old_annual_cost: entry.oldAnnualCost,
    new_annual_cost: entry.newAnnualCost,
    annual_savings: entry.annualSavings,
    savings_percent: entry.savingsPercent,
    estimated: entry.oldEstimated || entry.newEstimated,
    created_at: entry.createdAt,
  };

  const { error } = await supabaseClient.from("leaderboard_entries").insert(payload);

  if (error) {
    throw new Error("Speichern im gemeinsamen Leaderboard fehlgeschlagen. Bitte SQL-Setup erneut ausfuehren.");
  }
}

async function deleteEntryFromSupabase(id) {
  const { error } = await supabaseClient.rpc("delete_leaderboard_entry_with_password", {
    entry_id_input: id,
    admin_password_input: adminPassword,
  });

  if (error) {
    throw new Error("Eintrag konnte nicht geloescht werden. Admin-Passwort pruefen.");
  }
}

async function deleteAllEntriesFromSupabase() {
  const { error } = await supabaseClient.rpc("clear_leaderboard_with_password", {
    admin_password_input: adminPassword,
  });

  if (error) {
    throw new Error("Leaderboard konnte nicht geleert werden. Admin-Passwort pruefen.");
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

function normalizeEntry(entry) {
  const annualConsumptionKwh = Number(entry.annualConsumptionKwh || DEFAULT_ANNUAL_CONSUMPTION_KWH);
  const oldAnnualCost = Number(entry.oldAnnualCost);
  const annualSavings = Number(entry.annualSavings);
  const derivedPercent =
    oldAnnualCost > 0 ? (annualSavings / oldAnnualCost) * 100 : 0;

  return {
    ...entry,
    annualConsumptionKwh,
    oldAnnualCost,
    newAnnualCost: Number(entry.newAnnualCost),
    annualSavings,
    savingsPercent: Number.isFinite(Number(entry.savingsPercent))
      ? Number(entry.savingsPercent)
      : derivedPercent,
  };
}

function mapSupabaseRowToEntry(row) {
  return normalizeEntry({
    id: row.id,
    name: row.name,
    annualConsumptionKwh: row.annual_consumption_kwh,
    oldTariffName: row.old_tariff_name,
    oldTariffType: row.old_tariff_type || "fixed",
    oldWorkPriceCents: Number(row.old_work_price_cents),
    oldMarketPriceCents: row.old_market_price_cents === null ? null : Number(row.old_market_price_cents),
    oldAverageMarketPriceCents:
      row.old_average_market_price_cents === null ? null : Number(row.old_average_market_price_cents),
    oldMarkupCents: row.old_markup_cents === null ? 0 : Number(row.old_markup_cents),
    oldPriceSource: row.old_price_source || "fixed",
    oldHourlyPricesText: row.old_hourly_prices_text || "",
    oldBasePriceEuro: Number(row.old_base_price_euro),
    newTariffName: row.new_tariff_name,
    newTariffType: row.new_tariff_type || "fixed",
    newWorkPriceCents: Number(row.new_work_price_cents),
    newMarketPriceCents: row.new_market_price_cents === null ? null : Number(row.new_market_price_cents),
    newAverageMarketPriceCents:
      row.new_average_market_price_cents === null ? null : Number(row.new_average_market_price_cents),
    newMarkupCents: row.new_markup_cents === null ? 0 : Number(row.new_markup_cents),
    newPriceSource: row.new_price_source || "fixed",
    newHourlyPricesText: row.new_hourly_prices_text || "",
    newBasePriceEuro: Number(row.new_base_price_euro),
    oldAnnualCost: Number(row.old_annual_cost),
    newAnnualCost: Number(row.new_annual_cost),
    annualSavings: Number(row.annual_savings),
    savingsPercent: row.savings_percent === null ? null : Number(row.savings_percent),
    estimated: Boolean(row.estimated),
    createdAt: row.created_at,
  });
}

function renderEntries() {
  const sortedEntries = getSortedEntries();
  leaderboardBody.innerHTML = "";

  emptyState.hidden = sortedEntries.length > 0;
  entryCount.textContent = `${sortedEntries.length} Eintraege`;

  sortedEntries.forEach((entry, index) => {
    const rowFragment = rowTemplate.content.cloneNode(true);
    const row = rowFragment.querySelector("tr");

    row.querySelector(".rank-cell").textContent = `#${index + 1}`;
    row.querySelector(".name-cell").textContent = entry.name;
    row.querySelector(".consumption-cell").textContent = formatConsumption(entry.annualConsumptionKwh);
    row.querySelector(".old-total-cell").textContent = formatEuro(entry.oldAnnualCost);
    row.querySelector(".new-total-cell").textContent = formatEuro(entry.newAnnualCost);
    row.querySelector(".savings-cell").textContent = formatEuro(entry.annualSavings);
    row.querySelector(".savings-percent-cell").textContent = formatPercent(entry.savingsPercent);

    fillTariffCell(row.querySelector(".old-cell"), {
      tariffName: entry.oldTariffName,
      tariffType: entry.oldTariffType,
      workPriceCents: entry.oldWorkPriceCents,
      marketPriceCents: entry.oldMarketPriceCents,
      averageMarketPriceCents: entry.oldAverageMarketPriceCents,
      markupCents: entry.oldMarkupCents,
      basePriceEuro: entry.oldBasePriceEuro,
      priceSource: entry.oldPriceSource,
    });

    fillTariffCell(row.querySelector(".new-cell"), {
      tariffName: entry.newTariffName,
      tariffType: entry.newTariffType,
      workPriceCents: entry.newWorkPriceCents,
      marketPriceCents: entry.newMarketPriceCents,
      averageMarketPriceCents: entry.newAverageMarketPriceCents,
      markupCents: entry.newMarkupCents,
      basePriceEuro: entry.newBasePriceEuro,
      priceSource: entry.newPriceSource,
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
  let details = `
    <span>${formatNumber(tariff.workPriceCents)} ct/kWh</span><br />
    <span class="tariff-badge">Festpreis</span>
  `;

  if (tariff.tariffType === "dynamic") {
    const sourceLabel =
      tariff.priceSource === "slp_hourly" ? "24h SLP-gewichtet" : "Durchschnitt als Fallback";

    const averageLine =
      tariff.averageMarketPriceCents !== null
        ? `<span>${formatNumber(tariff.averageMarketPriceCents)} ct/kWh Tagesmittel</span><br />`
        : "";

    details = `
      <span>${formatNumber(tariff.marketPriceCents)} ct/kWh gewichteter Marktpreis</span><br />
      ${averageLine}
      <span>${formatNumber(tariff.markupCents)} ct/kWh Aufschlag</span><br />
      <span>${formatNumber(tariff.workPriceCents)} ct/kWh effektiv</span><br />
      <span class="tariff-badge estimate">${sourceLabel}</span>
    `;
  }

  cell.innerHTML = `
    <strong>${escapeHtml(tariff.tariffName)}</strong>
    ${details}
    <br />
    <span>${formatEuro(tariff.basePriceEuro)} Grundpreis</span>
  `;
}

function updateUiState() {
  consumptionSummary.textContent = `${formatInteger(uiSettings.defaultConsumption)} kWh/Jahr`;
  sortModeSummary.textContent =
    uiSettings.sortMode === "percent" ? "Reihung nach % Ersparnis" : "Reihung nach EUR/Jahr";

  sortModeButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.sortMode === uiSettings.sortMode);
  });
}

function updateTariffInputs(prefix) {
  const tariffType = document.getElementById(`${prefix}-tariff-type`).value;
  const label = document.querySelector(`[data-role="price-label"][data-tariff="${prefix}"] span`);
  const extraFields = document.getElementById(`${prefix}-dynamic-fields`);
  const hourlyPricesWrap = document.getElementById(`${prefix}-hourly-prices-wrap`);
  const markupInput = document.getElementById(`${prefix}-markup`);
  const hourlyPricesInput = document.getElementById(`${prefix}-hourly-prices`);
  const workPriceInput = document.getElementById(`${prefix}-work-price`);

  if (tariffType === "dynamic") {
    label.textContent =
      prefix === "old"
        ? "Alter durchschnittlicher Boersenpreis (Fallback, ct/kWh)"
        : "Neuer durchschnittlicher Boersenpreis (Fallback, ct/kWh)";
    workPriceInput.placeholder = "8.50";
    markupInput.required = true;
    extraFields.classList.remove("hidden");
    hourlyPricesWrap.classList.remove("hidden");
    hourlyPricesInput.required = false;
    return;
  }

  label.textContent =
    prefix === "old" ? "Alter Arbeitspreis (ct/kWh)" : "Neuer Arbeitspreis (ct/kWh)";
  workPriceInput.placeholder = prefix === "old" ? "40.50" : "31.20";
  markupInput.required = false;
  markupInput.value = "";
  hourlyPricesInput.required = false;
  hourlyPricesInput.value = "";
  extraFields.classList.add("hidden");
  hourlyPricesWrap.classList.add("hidden");
}

function updateAdminUi() {
  if (!supabaseClient) {
    adminStatus.textContent = "Admin nur im Live-Modus";
    adminPasswordInput.hidden = true;
    adminLoginButton.hidden = true;
    adminLogoutButton.hidden = true;
    adminClearButton.hidden = true;
    actionsHead.hidden = true;
    return;
  }

  if (isAdmin) {
    adminStatus.textContent = "Admin-Modus aktiv";
    adminPasswordInput.hidden = true;
    adminLoginButton.hidden = true;
    adminLogoutButton.hidden = false;
    adminClearButton.hidden = false;
    actionsHead.hidden = false;
    return;
  }

  adminStatus.textContent = "Nicht angemeldet";
  adminPasswordInput.hidden = false;
  adminLoginButton.hidden = false;
  adminLogoutButton.hidden = true;
  adminClearButton.hidden = true;
  actionsHead.hidden = true;
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

function formatInteger(value) {
  return new Intl.NumberFormat("de-DE", {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatConsumption(value) {
  return `${formatInteger(value)} kWh`;
}

function formatPercent(value) {
  return `${formatNumber(value)} %`;
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
