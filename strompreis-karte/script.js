const API_BASE = "https://spot.utilitarian.io/electricity";
const MAP_JSON_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";
const MAP_TSV_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.tsv";
const DISPLAY_TIMEZONE = "Europe/Berlin";
const HISTORY_LENGTH_DAYS = 30;

const COUNTRY_CONFIG = [
  { code: "DE", name: "Deutschland", zones: ["DE_LU"], mapNames: ["Germany"] },
  { code: "AT", name: "Oesterreich", zones: ["AT"], mapNames: ["Austria"] },
  { code: "FR", name: "Frankreich", zones: ["FR"], mapNames: ["France"] },
  { code: "BE", name: "Belgien", zones: ["BE"], mapNames: ["Belgium"] },
  { code: "NL", name: "Niederlande", zones: ["NL"], mapNames: ["Netherlands"] },
  { code: "PL", name: "Polen", zones: ["PL"], mapNames: ["Poland"] },
  { code: "EE", name: "Estland", zones: ["EE"], mapNames: ["Estonia"] },
  { code: "LT", name: "Litauen", zones: ["LT"], mapNames: ["Lithuania"] },
  { code: "LV", name: "Lettland", zones: ["LV"], mapNames: ["Latvia"] },
  { code: "FI", name: "Finnland", zones: ["FI"], mapNames: ["Finland"] },
  { code: "ES", name: "Spanien", zones: ["ES"], mapNames: ["Spain"] },
  { code: "PT", name: "Portugal", zones: ["PT"], mapNames: ["Portugal"] },
  { code: "SE", name: "Schweden", zones: ["SE1", "SE2", "SE3", "SE4"], mapNames: ["Sweden"] },
  { code: "DK", name: "Daenemark", zones: ["DK1", "DK2"], mapNames: ["Denmark"] },
  { code: "NO", name: "Norwegen", zones: ["NO1", "NO2", "NO3", "NO4", "NO5"], mapNames: ["Norway"] },
  {
    code: "IT",
    name: "Italien",
    zones: ["IT-NORTH", "IT-CENTRE_NORTH", "IT-CENTRE_SOUTH", "IT-SOUTH", "IT-SICILY", "IT-SARDINIA", "IT-CALABRIA"],
    mapNames: ["Italy"],
  },
];

const EUROPE_MAP_NAMES = new Set([
  "Albania",
  "Austria",
  "Belarus",
  "Belgium",
  "Bosnia and Herz.",
  "Bulgaria",
  "Croatia",
  "Czechia",
  "Denmark",
  "Estonia",
  "Finland",
  "France",
  "Germany",
  "Greece",
  "Hungary",
  "Iceland",
  "Ireland",
  "Italy",
  "Latvia",
  "Lithuania",
  "Luxembourg",
  "Moldova",
  "Montenegro",
  "Netherlands",
  "Norway",
  "Poland",
  "Portugal",
  "Romania",
  "Serbia",
  "Slovakia",
  "Slovenia",
  "Spain",
  "Sweden",
  "Switzerland",
  "Ukraine",
  "United Kingdom",
]);

const mapSvg = d3.select("#europe-map");
const historyChartSvg = d3.select("#history-chart");
const intradayChartSvg = d3.select("#intraday-chart");
const tooltip = document.getElementById("map-tooltip");
const countryGrid = document.getElementById("country-grid");
const refreshButton = document.getElementById("refresh-button");

const statusBanner = document.getElementById("status-banner");
const asOfValue = document.getElementById("as-of-value");
const lowestValue = document.getElementById("lowest-value");
const highestValue = document.getElementById("highest-value");
const coverageValue = document.getElementById("coverage-value");
const countryCount = document.getElementById("country-count");

const detailTitle = document.getElementById("detail-title");
const detailCopy = document.getElementById("detail-copy");
const detailAverage = document.getElementById("detail-average");
const detailMinimum = document.getElementById("detail-minimum");
const detailMaximum = document.getElementById("detail-maximum");
const detailZones = document.getElementById("detail-zones");
const historyRange = document.getElementById("history-range");
const intradayRange = document.getElementById("intraday-range");

const yearlyZoneCache = new Map();

let countryData = [];
let selectedCountryCode = null;
let mapFeatures = [];
let nameById = new Map();

refreshButton.addEventListener("click", () => {
  yearlyZoneCache.clear();
  loadDashboard();
});

loadDashboard();

async function loadDashboard() {
  try {
    setStatus("is-loading", "Spotpreisdaten und Kartengeometrie werden geladen.");

    const [mapBundle, todaysCountries] = await Promise.all([
      loadMapGeometries(),
      loadTodayCountryData(),
    ]);

    mapFeatures = mapBundle.features;
    nameById = mapBundle.nameById;
    countryData = todaysCountries;

    renderSummary();
    renderCountryGrid();
    renderMap();

    const defaultCountry =
      countryData.find((country) => country.code === selectedCountryCode && country.hasData) ||
      countryData.find((country) => country.code === "DE" && country.hasData) ||
      countryData.find((country) => country.hasData);

    if (defaultCountry) {
      await selectCountry(defaultCountry.code);
    } else {
      renderEmptyDetail("Heute konnten keine Spotpreisdaten fuer die hinterlegten Laender geladen werden.");
    }

    setStatus("is-success", `Live-Daten fuer ${formatDateLong(new Date())} geladen.`);
  } catch (error) {
    console.error(error);
    renderSummary(true);
    renderCountryGrid();
    renderMap();
    renderEmptyDetail("Die Visualisierung konnte nicht geladen werden. Bitte spaeter erneut versuchen.");
    setStatus("is-error", "Fehler beim Laden der Spotpreisdaten oder der Karte.");
  }
}

async function loadMapGeometries() {
  if (mapFeatures.length > 0 && nameById.size > 0) {
    return { features: mapFeatures, nameById };
  }

  const [topology, names] = await Promise.all([
    fetchJson(MAP_JSON_URL),
    d3.tsv(MAP_TSV_URL),
  ]);

  const countries = topojson.feature(topology, topology.objects.countries);
  const namesMap = new Map(names.map((row) => [String(row.id), row.name]));
  const filteredFeatures = countries.features.filter((feature) =>
    EUROPE_MAP_NAMES.has(namesMap.get(String(feature.id)))
  );

  return { features: filteredFeatures, nameById: namesMap };
}

async function loadTodayCountryData() {
  const todayKey = getDateKey(new Date());

  return Promise.all(
    COUNTRY_CONFIG.map(async (country) => {
      const zoneResults = await Promise.all(
        country.zones.map(async (zone) => {
          try {
            const entries = await fetchJson(`${API_BASE}/${zone}/latest/`);
            const todaysEntries = entries.filter((entry) => getDateKey(new Date(entry.timestamp)) === todayKey);

            return {
              zone,
              points: todaysEntries.map((entry) => ({
                timestamp: entry.timestamp,
                value: Number(entry.value),
              })),
            };
          } catch (error) {
            console.warn(`Zone ${zone} konnte nicht geladen werden`, error);
            return { zone, points: [] };
          }
        })
      );

      return buildCountrySnapshot(country, zoneResults);
    })
  );
}

function buildCountrySnapshot(country, zoneResults) {
  const hourlyMap = new Map();

  zoneResults.forEach((zoneResult) => {
    zoneResult.points.forEach((point) => {
      const current = hourlyMap.get(point.timestamp) || [];
      current.push(point.value);
      hourlyMap.set(point.timestamp, current);
    });
  });

  const intraday = Array.from(hourlyMap.entries())
    .map(([timestamp, values]) => ({ timestamp, value: average(values) }))
    .sort((left, right) => new Date(left.timestamp) - new Date(right.timestamp));

  const values = intraday.map((point) => point.value);
  const hasData = values.length > 0;

  return {
    ...country,
    hasData,
    intraday,
    average: hasData ? average(values) : null,
    min: hasData ? Math.min(...values) : null,
    max: hasData ? Math.max(...values) : null,
    zoneCountWithData: zoneResults.filter((zoneResult) => zoneResult.points.length > 0).length,
  };
}

function renderSummary(hasError = false) {
  if (hasError || countryData.length === 0) {
    asOfValue.textContent = "-";
    lowestValue.textContent = "-";
    highestValue.textContent = "-";
    coverageValue.textContent = "-";
    countryCount.textContent = "0 Laender";
    return;
  }

  const available = countryData.filter((country) => country.hasData);
  const lowest = available.reduce((best, current) => (!best || current.average < best.average ? current : best), null);
  const highest = available.reduce((best, current) => (!best || current.average > best.average ? current : best), null);

  asOfValue.textContent = formatDateLong(new Date());
  lowestValue.textContent = lowest ? `${lowest.name} ${formatEuroPerMwh(lowest.average)}` : "-";
  highestValue.textContent = highest ? `${highest.name} ${formatEuroPerMwh(highest.average)}` : "-";
  coverageValue.textContent = `${available.length} von ${COUNTRY_CONFIG.length}`;
  countryCount.textContent = `${available.length} Laender`;
}

function renderCountryGrid() {
  countryGrid.innerHTML = "";

  [...countryData]
    .sort((left, right) => {
      if (left.hasData && right.hasData) {
        return left.average - right.average;
      }

      if (left.hasData) {
        return -1;
      }

      if (right.hasData) {
        return 1;
      }

      return left.name.localeCompare(right.name, "de");
    })
    .forEach((country) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "country-chip";
      button.dataset.countryCode = country.code;
      button.disabled = !country.hasData;

      if (country.code === selectedCountryCode) {
        button.classList.add("is-active");
      }

      button.innerHTML = `
        <span>${country.name}</span>
        <strong>${country.hasData ? formatEuroPerMwh(country.average) : "Keine Daten"}</strong>
      `;

      if (country.hasData) {
        button.addEventListener("click", () => selectCountry(country.code));
      }

      countryGrid.appendChild(button);
    });
}

function renderMap() {
  mapSvg.selectAll("*").remove();

  if (mapFeatures.length === 0) {
    return;
  }

  const projection = d3.geoMercator().fitExtent([[38, 22], [922, 650]], {
    type: "FeatureCollection",
    features: mapFeatures,
  });
  const path = d3.geoPath(projection);
  const available = countryData.filter((country) => country.hasData);
  const minValue = d3.min(available, (country) => country.average) ?? 0;
  const maxValue = d3.max(available, (country) => country.average) ?? 1;
  const colorScale = d3.scaleSequential().domain([maxValue, minValue || maxValue + 1]).interpolator(d3.interpolateRdYlGn);

  mapSvg
    .append("rect")
    .attr("x", 0)
    .attr("y", 0)
    .attr("width", 960)
    .attr("height", 680)
    .attr("rx", 28)
    .attr("fill", "#edf4f7");

  mapSvg
    .append("g")
    .selectAll("path")
    .data(mapFeatures)
    .join("path")
    .attr("d", path)
    .attr("class", (feature) => getMapClass(feature))
    .attr("fill", (feature) => {
      const country = getCountryForFeature(feature);
      return !country || !country.hasData ? "#d7e1e7" : colorScale(country.average);
    })
    .attr("stroke", (feature) => (featureHasData(feature) ? "#f8fbfc" : "#b7c8d1"))
    .attr("stroke-width", (feature) => (selectedCountryCode && getCountryForFeature(feature)?.code === selectedCountryCode ? 3 : 1.1))
    .style("cursor", (feature) => (featureHasData(feature) ? "pointer" : "default"))
    .on("mouseenter", handleFeatureEnter)
    .on("mousemove", handleFeatureMove)
    .on("mouseleave", handleFeatureLeave)
    .on("click", async (_, feature) => {
      const country = getCountryForFeature(feature);

      if (country?.hasData) {
        await selectCountry(country.code);
      }
    });
}

async function selectCountry(countryCode) {
  selectedCountryCode = countryCode;
  renderCountryGrid();
  renderMap();

  const country = countryData.find((entry) => entry.code === countryCode);

  if (!country) {
    return;
  }

  detailTitle.textContent = country.name;
  detailCopy.textContent = "Tagesschnitt aus den heute verfuegbaren Day-Ahead-Stundenwerten. Der 30-Tage-Verlauf wird aus den historischen Tageswerten der hinterlegten Preiszonen berechnet.";
  detailAverage.textContent = formatEuroPerMwh(country.average);
  detailMinimum.textContent = formatEuroPerMwh(country.min);
  detailMaximum.textContent = formatEuroPerMwh(country.max);
  detailZones.textContent = `${country.zoneCountWithData}/${country.zones.length}`;
  intradayRange.textContent = `${country.intraday.length} Stundenwerte`;

  renderLineChart(historyChartSvg, [], {
    yLabel: "Laedt Verlauf...",
    emptyMessage: "Historischer Verlauf wird geladen.",
  });
  renderLineChart(intradayChartSvg, country.intraday, {
    yLabel: "EUR/MWh",
    tickFormatter: (point) => formatHour(point.timestamp),
    emptyMessage: "Heute liegen noch keine Stundenwerte vor.",
  });

  const history = await loadCountryHistory(country);
  historyRange.textContent =
    history.length > 0
      ? `${formatDateShort(history[0].date)} bis ${formatDateShort(history[history.length - 1].date)}`
      : "-";

  renderLineChart(historyChartSvg, history, {
    yLabel: "EUR/MWh",
    tickFormatter: (point) => formatDateShort(point.date),
    emptyMessage: "Keine historischen Daten verfuegbar.",
  });
}

async function loadCountryHistory(country) {
  const zoneSeries = await Promise.all(
    country.zones.map(async (zone) => {
      if (!yearlyZoneCache.has(zone)) {
        yearlyZoneCache.set(zone, loadZoneHistory(zone));
      }

      return yearlyZoneCache.get(zone);
    })
  );

  const dailyMap = new Map();

  zoneSeries.forEach((series) => {
    series.forEach((entry) => {
      const current = dailyMap.get(entry.date) || [];
      current.push(entry.value);
      dailyMap.set(entry.date, current);
    });
  });

  return Array.from(dailyMap.entries())
    .map(([date, values]) => ({ date, value: average(values) }))
    .sort((left, right) => new Date(left.date) - new Date(right.date))
    .slice(-HISTORY_LENGTH_DAYS);
}

async function loadZoneHistory(zone) {
  const currentYear = new Date().getFullYear();
  const entries = await fetchJson(`${API_BASE}/${zone}/${currentYear}/`);
  const byDate = new Map();

  entries.forEach((entry) => {
    const date = getDateKey(new Date(entry.timestamp));
    const current = byDate.get(date) || [];
    current.push(Number(entry.value));
    byDate.set(date, current);
  });

  return Array.from(byDate.entries()).map(([date, values]) => ({ date, value: average(values) }));
}

function renderLineChart(svg, series, options) {
  svg.selectAll("*").remove();

  const width = 520;
  const height = 240;
  const margin = { top: 20, right: 18, bottom: 34, left: 58 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  svg.append("rect").attr("x", 0).attr("y", 0).attr("width", width).attr("height", height).attr("rx", 18).attr("fill", "#f7fbfd");

  if (!series || series.length === 0) {
    svg
      .append("text")
      .attr("x", width / 2)
      .attr("y", height / 2)
      .attr("text-anchor", "middle")
      .attr("fill", "#667b88")
      .attr("font-size", 15)
      .text(options.emptyMessage || "Keine Daten");
    return;
  }

  const yExtent = d3.extent(series, (point) => point.value);
  const yPadding = (yExtent[1] - yExtent[0] || 10) * 0.15;
  const yScale = d3.scaleLinear().domain([yExtent[0] - yPadding, yExtent[1] + yPadding]).nice().range([innerHeight, 0]);
  const xScale = d3.scaleLinear().domain([0, series.length - 1]).range([0, innerWidth]);
  const chart = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  chart
    .append("g")
    .call(d3.axisLeft(yScale).ticks(5).tickSize(-innerWidth).tickFormat((value) => `${Math.round(value)}`))
    .call((axis) => axis.select(".domain").remove())
    .call((axis) => axis.selectAll("line").attr("stroke", "#d8e4ea"))
    .call((axis) => axis.selectAll("text").attr("fill", "#617785").attr("font-size", 11));

  chart
    .append("g")
    .attr("transform", `translate(0,${innerHeight})`)
    .call(d3.axisBottom(xScale).tickValues(buildTickIndexes(series.length)).tickFormat((index) => options.tickFormatter(series[index])))
    .call((axis) => axis.select(".domain").attr("stroke", "#c7d6de"))
    .call((axis) => axis.selectAll("text").attr("fill", "#617785").attr("font-size", 11));

  const line = d3.line().x((_, index) => xScale(index)).y((point) => yScale(point.value)).curve(d3.curveMonotoneX);
  const area = d3.area().x((_, index) => xScale(index)).y0(innerHeight).y1((point) => yScale(point.value)).curve(d3.curveMonotoneX);

  chart.append("path").datum(series).attr("fill", "rgba(15, 109, 85, 0.15)").attr("d", area);
  chart.append("path").datum(series).attr("fill", "none").attr("stroke", "#0f6d55").attr("stroke-width", 3).attr("d", line);

  chart
    .selectAll("circle")
    .data(series)
    .join("circle")
    .attr("cx", (_, index) => xScale(index))
    .attr("cy", (point) => yScale(point.value))
    .attr("r", series.length > 36 ? 0 : 3)
    .attr("fill", "#0f6d55");

  svg.append("text").attr("x", margin.left).attr("y", 16).attr("fill", "#59707d").attr("font-size", 12).attr("font-weight", 700).text(options.yLabel || "");
}

function buildTickIndexes(length) {
  if (length <= 6) {
    return d3.range(length);
  }

  const step = Math.max(1, Math.floor(length / 5));
  const ticks = new Set([0, length - 1]);

  for (let index = step; index < length - 1; index += step) {
    ticks.add(index);
  }

  return Array.from(ticks).sort((left, right) => left - right);
}

function renderEmptyDetail(message) {
  detailTitle.textContent = "Land auswaehlen";
  detailCopy.textContent = message;
  detailAverage.textContent = "-";
  detailMinimum.textContent = "-";
  detailMaximum.textContent = "-";
  detailZones.textContent = "-";
  historyRange.textContent = "-";
  intradayRange.textContent = "-";
  renderLineChart(historyChartSvg, [], { emptyMessage: "Keine Verlaufsdaten vorhanden." });
  renderLineChart(intradayChartSvg, [], { emptyMessage: "Keine Stundenwerte vorhanden." });
}

function handleFeatureEnter(event, feature) {
  const country = getCountryForFeature(feature);
  const name = nameById.get(String(feature.id)) || "Unbekannt";
  tooltip.hidden = false;
  tooltip.innerHTML = country?.hasData
    ? `<strong>${country.name}</strong><span>${formatEuroPerMwh(country.average)}</span>`
    : `<strong>${name}</strong><span>Keine Daten</span>`;
  handleFeatureMove(event);
}

function handleFeatureMove(event) {
  tooltip.style.left = `${event.offsetX + 20}px`;
  tooltip.style.top = `${event.offsetY + 20}px`;
}

function handleFeatureLeave() {
  tooltip.hidden = true;
}

function getCountryForFeature(feature) {
  const featureName = nameById.get(String(feature.id));
  return countryData.find((country) => country.mapNames.includes(featureName));
}

function featureHasData(feature) {
  return Boolean(getCountryForFeature(feature)?.hasData);
}

function getMapClass(feature) {
  const country = getCountryForFeature(feature);
  const classes = ["country-shape"];

  if (country?.hasData) {
    classes.push("is-available");
  }

  if (country?.code === selectedCountryCode) {
    classes.push("is-selected");
  }

  return classes.join(" ");
}

async function fetchJson(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Request fehlgeschlagen: ${response.status}`);
  }

  return response.json();
}

function setStatus(typeClass, text) {
  statusBanner.className = `status-banner ${typeClass}`;
  statusBanner.textContent = text;
}

function getDateKey(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: DISPLAY_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatDateLong(date) {
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: DISPLAY_TIMEZONE,
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatDateShort(dateKey) {
  const date = typeof dateKey === "string" ? new Date(`${dateKey}T12:00:00`) : dateKey;
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: DISPLAY_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
  }).format(date);
}

function formatHour(timestamp) {
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: DISPLAY_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function formatEuroPerMwh(value) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }

  return `${new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)}/MWh`;
}

function average(values) {
  return values.reduce((total, value) => total + value, 0) / values.length;
}
