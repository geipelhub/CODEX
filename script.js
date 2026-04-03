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

const supabaseClient = createSupabaseClient();
let entries = [];

initializeApp();

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    const formData = new FormData(form);
    const entry = createEntry({
      name: formData.get("name"),
      oldTariffName: formData.get("oldTariffName"),
      oldWorkPrice: formData.get("oldWorkPrice"),
      oldBasePrice: formData.get("oldBasePrice"),
      newTariffName: formData.get("newTariffName"),
      newWorkPrice: formData.get("newWorkPrice"),
      newBasePrice: formData.get("newBasePrice"),
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
      "Im gemeinsamen Modus sollte das Leeren besser direkt in Supabase oder nur mit Admin-Logik erfolgen.",
      "error"
    );
    return;
  }

  entries = [];
  persistEntries();
  renderEntries();
  showMessage("Lokales Leaderboard geleert.", "success");
});

function createEntry(data) {
  const oldWorkPriceCents = parseCurrencyValue(data.oldWorkPrice);
  const oldBasePriceEuro = parseCurrencyValue(data.oldBasePrice);
  const newWorkPriceCents = parseCurrencyValue(data.newWorkPrice);
  const newBasePriceEuro = parseCurrencyValue(data.newBasePrice);

  const oldAnnualCost =
    (ANNUAL_CONSUMPTION_KWH * oldWorkPriceCents) / 100 + oldBasePriceEuro;
  const newAnnualCost =
    (ANNUAL_CONSUMPTION_KWH * newWorkPriceCents) / 100 + newBasePriceEuro;
  const annualSavings = oldAnnualCost - newAnnualCost;

  return {
    id: crypto.randomUUID(),
    name: String(data.name).trim(),
    oldTariffName: String(data.oldTariffName).trim(),
    newTariffName: String(data.newTariffName).trim(),
    oldWorkPriceCents,
    oldBasePriceEuro,
    newWorkPriceCents,
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
  await refreshEntries();

  if (supabaseClient) {
    subscribeToRealtimeUpdates();
  }
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
    old_work_price_cents: entry.oldWorkPriceCents,
    old_base_price_euro: entry.oldBasePriceEuro,
    new_tariff_name: entry.newTariffName,
    new_work_price_cents: entry.newWorkPriceCents,
    new_base_price_euro: entry.newBasePriceEuro,
    old_annual_cost: entry.oldAnnualCost,
    new_annual_cost: entry.newAnnualCost,
    annual_savings: entry.annualSavings,
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
    oldWorkPriceCents: Number(row.old_work_price_cents),
    oldBasePriceEuro: Number(row.old_base_price_euro),
    newTariffName: row.new_tariff_name,
    newWorkPriceCents: Number(row.new_work_price_cents),
    newBasePriceEuro: Number(row.new_base_price_euro),
    oldAnnualCost: Number(row.old_annual_cost),
    newAnnualCost: Number(row.new_annual_cost),
    annualSavings: Number(row.annual_savings),
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
      workPriceCents: entry.oldWorkPriceCents,
      basePriceEuro: entry.oldBasePriceEuro,
    });

    fillTariffCell(row.querySelector(".new-cell"), {
      tariffName: entry.newTariffName,
      workPriceCents: entry.newWorkPriceCents,
      basePriceEuro: entry.newBasePriceEuro,
    });

    leaderboardBody.appendChild(rowFragment);
  });
}

function fillTariffCell(cell, tariff) {
  cell.innerHTML = `
    <strong>${escapeHtml(tariff.tariffName)}</strong>
    <span>${formatNumber(tariff.workPriceCents)} ct/kWh</span><br />
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
