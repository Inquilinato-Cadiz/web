#!/usr/bin/env node
// Descarga del Registro de Turismo de Andalucía (OpenRTA, CC BY 4.0) las
// viviendas de uso turístico y apartamentos turísticos de los 45 municipios de
// la provincia de Cádiz, quita los datos de contacto, reproyecta las
// coordenadas a WGS84 y escribe:
//   public/data/municipios/<slug>.geojson  (uno por municipio; lo carga el mapa)
//   src/data/municipios.json               (índice: nombres, totales y límites)
//   src/data/stats.json                    (cifras de la provincia y de cada municipio)
//
// La API ignora page/offset y corta en 10.000 registros, así que se pide
// municipio a municipio; ninguno se acerca a ese límite.
// Uso: node scripts/fetch-openrta.mjs
import { writeFile, mkdir, rm } from "node:fs/promises";
import proj4 from "proj4";

const API = "https://datos.juntadeandalucia.es/api/v0/openrta";
const PROVINCE = "CÁDIZ";
// [nombre tal y como lo espera la API (mayúsculas, sin acentos salvo CÁDIZ, artículo detrás), nombre para mostrar]
const MUNICIPIOS = [
  ["ALCALA DE LOS GAZULES", "Alcalá de los Gazules"], ["ALCALA DEL VALLE", "Alcalá del Valle"], ["ALGAR", "Algar"],
  ["ALGECIRAS", "Algeciras"], ["ALGODONALES", "Algodonales"], ["ARCOS DE LA FRONTERA", "Arcos de la Frontera"],
  ["BARBATE", "Barbate"], ["BARRIOS, LOS", "Los Barrios"], ["BENALUP-CASAS VIEJAS", "Benalup-Casas Viejas"],
  ["BENAOCAZ", "Benaocaz"], ["BORNOS", "Bornos"], ["BOSQUE, EL", "El Bosque"], ["CÁDIZ", "Cádiz"],
  ["CASTELLAR DE LA FRONTERA", "Castellar de la Frontera"], ["CHICLANA DE LA FRONTERA", "Chiclana de la Frontera"],
  ["CHIPIONA", "Chipiona"], ["CONIL DE LA FRONTERA", "Conil de la Frontera"], ["ESPERA", "Espera"],
  ["GASTOR, EL", "El Gastor"], ["GRAZALEMA", "Grazalema"], ["JEREZ DE LA FRONTERA", "Jerez de la Frontera"],
  ["JIMENA DE LA FRONTERA", "Jimena de la Frontera"], ["LINEA DE LA CONCEPCION, LA", "La Línea de la Concepción"],
  ["MEDINA-SIDONIA", "Medina-Sidonia"], ["OLVERA", "Olvera"], ["PATERNA DE RIVERA", "Paterna de Rivera"],
  ["PRADO DEL REY", "Prado del Rey"], ["PUERTO DE SANTA MARIA, EL", "El Puerto de Santa María"],
  ["PUERTO REAL", "Puerto Real"], ["PUERTO SERRANO", "Puerto Serrano"], ["ROTA", "Rota"], ["SAN FERNANDO", "San Fernando"],
  ["SAN JOSE DEL VALLE", "San José del Valle"], ["SAN MARTIN DEL TESORILLO", "San Martín del Tesorillo"],
  ["SAN ROQUE", "San Roque"], ["SANLUCAR DE BARRAMEDA", "Sanlúcar de Barrameda"], ["SETENIL DE LAS BODEGAS", "Setenil de las Bodegas"],
  ["TARIFA", "Tarifa"], ["TORRE ALHAQUIME", "Torre Alháquime"], ["TREBUJENA", "Trebujena"], ["UBRIQUE", "Ubrique"],
  ["VEJER DE LA FRONTERA", "Vejer de la Frontera"], ["VILLALUENGA DEL ROSARIO", "Villaluenga del Rosario"],
  ["VILLAMARTIN", "Villamartín"], ["ZAHARA DE LA SIERRA", "Zahara de la Sierra"],
];
const TYPES = { "Vivienda de uso turístico": "VUT", "Apartamento turístico": "AT" };
const UTM30 = "+proj=utm +zone=30 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs";
// Un punto a más de esta distancia del centro del municipio es una coordenada errónea del registro.
const MAX_KM_FROM_CENTER = 30;

const slugify = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const toDate = (s) => (s && /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : null);
// Las coordenadas llegan como texto y casi siempre con coma decimal.
const num = (v) => Number(String(v ?? "").replace(",", "."));
const median = (arr) => { const s = [...arr].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
const km = (lat1, lng1, lat2, lng2) => {
  const r = Math.PI / 180, dLat = (lat2 - lat1) * r, dLng = (lng2 - lng1) * r;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
};
const count = (arr, key) => {
  const m = new Map();
  for (const f of arr) { const k = key(f) ?? "sin dato"; m.set(k, (m.get(k) ?? 0) + 1); }
  return Object.fromEntries([...m.entries()].sort((a, b) => b[1] - a[1]));
};
const byYear = (arr) => Object.fromEntries(Object.entries(count(arr, (f) => f.properties.registered?.slice(0, 4))).sort());
const topCompanies = (holders) => [...holders.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([name, n]) => ({ name, count: n }));
const places = (arr) => arr.reduce((s, f) => s + (f.properties.places ?? 0), 0);

// La API de la Junta corta a veces la conexión a mitad de una descarga grande
// (ECONNRESET tras minutos colgada): cada petición tiene tiempo límite y se
// reintenta antes de dar por fallida la actualización entera.
async function fetchJson(url, label, attempts = 4) {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (error) {
      if (i >= attempts) throw new Error(`${label}: ${error.message} tras ${attempts} intentos`, { cause: error });
      console.warn(`${label}: ${error.message}; reintento ${i}/${attempts - 1}`);
      await new Promise((resolve) => setTimeout(resolve, 15_000 * i));
    }
  }
}

async function fetchMunicipio(api) {
  const params = new URLSearchParams({
    id: "-", object_type: "-", category: "-", group: "-", modality: "-",
    province: PROVINCE, municipality: api,
    order_by: "registration_code", mode: "ASC", format: "json", size: "10000",
  });
  const payload = await fetchJson(`${API}/search?${params}`, api);
  const rows = payload.results ?? [];
  if ((payload.total_hits ?? 0) > rows.length) throw new Error(`${api}: ${payload.total_hits} registros y la API sólo devuelve ${rows.length}`);
  return rows;
}

const lastUpdate = await fetch(`${API}/search/lastUpdateData`).then((r) => r.json()).catch(() => null);
const sourceUpdatedAt = lastUpdate?.date?.slice(0, 10) ?? null;
const generatedAt = new Date().toISOString().slice(0, 10);

await rm("public/data/municipios", { recursive: true, force: true });
await mkdir("public/data/municipios", { recursive: true });
await mkdir("src/data", { recursive: true });

const index = [];
const statsMunicipios = {};
const provinceFeatures = [];
const provinceHolders = new Map();
let provinceSkipped = 0;

for (const [api, name] of MUNICIPIOS) {
  const slug = slugify(name);
  const rows = (await fetchMunicipio(api)).filter((r) => TYPES[r.objects_type_id]);

  // Titulares: la Junta ya anonimiza a las personas físicas ("-"); sólo llegan nombres de empresas.
  const holders = new Map();
  for (const r of rows) {
    const h = (r.holder ?? "").trim();
    if (h && h !== "-") holders.set(h, (holders.get(h) ?? 0) + 1);
  }

  const candidates = [];
  let skipped = 0;
  for (const r of rows) {
    const x = num(r.coord_x), y = num(r.coord_y);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x === 0 || y === 0 || String(r.srid) !== "25830") { skipped++; continue; }
    const [lng, lat] = proj4(UTM30, "EPSG:4326", [x, y]);
    // Fuera de la provincia: coordenadas erróneas en el registro.
    if (lat < 35.9 || lat > 37.0 || lng < -6.6 || lng > -5.1) { skipped++; continue; }
    candidates.push({ r, lng, lat });
  }
  const cLat = median(candidates.map((c) => c.lat)), cLng = median(candidates.map((c) => c.lng));

  const features = [];
  for (const { r, lng, lat } of candidates) {
    if (km(lat, lng, cLat, cLng) > MAX_KM_FROM_CENTER) { skipped++; continue; }
    const holder = (r.holder ?? "").trim();
    const isCompany = holder && holder !== "-";
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [Number(lng.toFixed(6)), Number(lat.toFixed(6))] },
      properties: {
        id: r.registration_code,
        type: TYPES[r.objects_type_id],
        group: r.group ?? null,
        address: [r.establishment_address, r.floor && `piso ${r.floor}`, r.door && `puerta ${r.door}`].filter(Boolean).join(", "),
        postal_code: r.postal_code ?? null,
        places: r.tot_gen_places ?? null,
        units: r.tot_gen_ua ?? null,
        registered: toDate(r.registration_date),
        catastro: r.catastral_ref ?? null,
        holder: isCompany ? holder : null,
        holder_count: isCompany ? holders.get(holder) : null,
      },
    });
  }

  const lngs = features.map((f) => f.geometry.coordinates[0]), lats = features.map((f) => f.geometry.coordinates[1]);
  const bbox = features.length ? [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)] : null;
  const municipio = { slug, name, total: features.length, places: places(features), source_updated_at: sourceUpdatedAt };
  await writeFile(`public/data/municipios/${slug}.geojson`, JSON.stringify({ type: "FeatureCollection", municipio, features }));
  index.push({ slug, name, total: municipio.total, places: municipio.places, bbox });
  statsMunicipios[slug] = {
    name, total: municipio.total, places: municipio.places, skipped_without_valid_coordinates: skipped,
    by_type: count(features, (f) => f.properties.type),
    by_group: count(features, (f) => f.properties.group),
    by_postal_code: count(features, (f) => f.properties.postal_code),
    by_year: byYear(features),
    companies: topCompanies(holders),
    individuals_count: features.filter((f) => !f.properties.holder).length,
  };
  provinceFeatures.push(...features);
  for (const [h, n] of holders) provinceHolders.set(h, (provinceHolders.get(h) ?? 0) + n);
  provinceSkipped += skipped;
  console.log(`${name}: ${features.length} alojamientos (${skipped} descartados)`);
}

index.sort((a, b) => a.name.localeCompare(b.name, "es"));
await writeFile("src/data/municipios.json", JSON.stringify({
  generated_at: generatedAt, source_updated_at: sourceUpdatedAt,
  total: provinceFeatures.length, places: places(provinceFeatures), municipios: index,
}, null, 2) + "\n");

const stats = {
  generated_at: generatedAt,
  source_updated_at: sourceUpdatedAt,
  province: {
    total: provinceFeatures.length,
    places: places(provinceFeatures),
    skipped_without_valid_coordinates: provinceSkipped,
    by_type: count(provinceFeatures, (f) => f.properties.type),
    by_group: count(provinceFeatures, (f) => f.properties.group),
    by_year: byYear(provinceFeatures),
    companies: topCompanies(provinceHolders),
    individuals_count: provinceFeatures.filter((f) => !f.properties.holder).length,
    by_municipio: [...index].sort((a, b) => b.total - a.total).map(({ slug, name, total, places }) => ({ slug, name, total, places })),
  },
  municipios: statsMunicipios,
};
await writeFile("src/data/stats.json", JSON.stringify(stats, null, 2) + "\n");
console.log(`Provincia: ${stats.province.total} alojamientos (${provinceSkipped} descartados) · ${stats.province.places} plazas · fuente actualizada ${sourceUpdatedAt}`);
