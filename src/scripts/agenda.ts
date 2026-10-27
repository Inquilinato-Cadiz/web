// Próximas convocatorias públicas, en vivo desde Sindicadas. Si falla, deja el enlace de respaldo.
type AgendaEvent = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  kind: string;
  kind_name: string;
  location: string | null;
  modality?: "in_person" | "online" | "hybrid";
  online_url?: string | null;
  description: string | null;
};

// En desarrollo se puede apuntar a un Sindicadas local: PUBLIC_AGENDA_SOURCE=http://localhost:3000/agenda.json
const SOURCE = import.meta.env.PUBLIC_AGENDA_SOURCE ?? "https://sindicadas.inquilinatocadiz.org/agenda.json";
const TZ = "Europe/Madrid";
const fmt = (date: Date, options: Intl.DateTimeFormatOptions) => date.toLocaleString("es-ES", { timeZone: TZ, ...options });

const el = (tag: string, className: string, text?: string) => {
  const node = document.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  return node;
};

const render = (event: AgendaEvent, full: boolean) => {
  const start = new Date(event.starts_at);
  const li = el("li", "reveal is-in brut flex gap-5 bg-white p-5 md:gap-7 md:p-6");

  const date = el("div", "display w-14 shrink-0 text-center leading-none md:w-20");
  date.append(el("div", "text-5xl text-brand md:text-6xl", fmt(start, { day: "numeric" })), el("div", "mt-1 text-lg", fmt(start, { month: "short" }).replace(".", "")));
  li.append(date);

  const body = el("div", "min-w-0 flex-1");
  const when = event.all_day ? fmt(start, { weekday: "long" }) : `${fmt(start, { weekday: "long" })} · ${fmt(start, { hour: "2-digit", minute: "2-digit" })}`;
  body.append(el("p", "font-mono text-xs uppercase tracking-widest text-neutral-600", `${when} · ${event.kind_name}`));
  body.append(el("h3", "display mt-1 text-2xl md:text-3xl", event.title));
  const online = event.modality === "online" || event.modality === "hybrid";
  const place = event.modality === "online" ? "Online" : [event.location, event.modality === "hybrid" ? "online" : null].filter(Boolean).join(" y ");
  if (place) {
    const where = el("p", "mt-1 text-neutral-700");
    const icon = event.modality === "online" ? "fa-video" : "fa-location-dot";
    where.append(Object.assign(el("i", `fa-solid ${icon} mr-1`), { ariaHidden: "true" }), place.charAt(0).toUpperCase() + place.slice(1));
    body.append(where);
  }
  if (online && event.online_url) {
    const link = Object.assign(el("a", "mt-1 inline-block underline decoration-2 underline-offset-4", "Enlace para conectarse"), { href: event.online_url, target: "_blank", rel: "noopener" });
    body.append(link);
  }
  if (full && event.description) body.append(el("p", "mt-3 whitespace-pre-line leading-relaxed", event.description));
  li.append(body);
  return li;
};

document.querySelectorAll<HTMLElement>("[data-agenda]").forEach(async (root) => {
  const list = root.querySelector<HTMLElement>("[data-agenda-list]")!;
  const status = root.querySelector<HTMLElement>("[data-agenda-status]")!;
  const limit = Number(root.dataset.limit) || Infinity;
  const full = root.dataset.full === "true";
  try {
    const res = await fetch(SOURCE);
    if (!res.ok) throw new Error(String(res.status));
    const events = ((await res.json()) as AgendaEvent[]).slice(0, limit);
    if (events.length === 0) {
      if (root.dataset.hideEmpty === "true") root.closest<HTMLElement>("[data-agenda-section]")?.remove();
      status.textContent = "No hay convocatorias públicas ahora mismo. Síguenos en redes para enterarte de la próxima.";
      return;
    }
    list.replaceChildren(...events.map((e) => render(e, full)));
    status.remove();
  } catch {
    status.innerHTML = 'No hemos podido cargar la agenda. Consúltala en <a href="https://sindicadas.inquilinatocadiz.org/agenda" class="underline decoration-2 underline-offset-4">sindicadas.inquilinatocadiz.org/agenda</a>.';
  }
});

export {};
