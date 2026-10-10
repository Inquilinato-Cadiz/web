// Recursos públicos, en vivo desde Sindicadas. Si falla, deja un aviso.
type Resource = {
  id: string;
  title: string;
  kind: string;
  kind_name: string;
  body: string | null;
  url: string | null;
  file_url: string | null;
  file_name: string | null;
  file_size: number | null;
  image_url: string | null;
  published_at: string;
};

// En desarrollo se puede apuntar a un Sindicadas local: PUBLIC_RECURSOS_SOURCE=http://localhost:3000/recursos.json
const SOURCE = import.meta.env.PUBLIC_RECURSOS_SOURCE ?? "https://sindicadas.inquilinatocadiz.org/recursos.json";
// Encabezado de cada grupo, en el mismo orden que en Sindicadas. Un tipo nuevo va al final con su nombre en singular.
const KINDS: Record<string, string> = { guide: "Guías", document: "Modelos de documento", video: "Vídeos", link: "Enlaces", faq: "Preguntas frecuentes" };
const ORDER = Object.keys(KINDS);
// Por encima de esto el texto se pliega tras «Leer más».
const LONG_BODY = 400;

const el = (tag: string, className: string, text?: string) => {
  const node = document.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  return node;
};

const icon = (name: string) => Object.assign(el("i", `fa-solid ${name}`), { ariaHidden: "true" });

const size = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toLocaleString("es-ES", { maximumFractionDigits: 1 })} MB`);

const extension = (name: string) => name.split(".").pop()?.toUpperCase() ?? "";

const button = (href: string, className: string, iconName: string, label: string, event: string) => {
  const a = el("a", `brut brut-hover display inline-flex items-center gap-2 px-4 py-2 text-lg ${className}`) as HTMLAnchorElement;
  a.href = href;
  a.dataset.umamiEvent = event;
  a.append(icon(iconName), label);
  return a;
};

const render = (resource: Resource) => {
  const article = el("article", "reveal is-in brut flex flex-col bg-white md:flex-row");
  article.id = resource.id;

  if (resource.image_url) {
    const img = el("img", "aspect-[3/2] w-full border-b-3 border-ink object-cover md:aspect-auto md:w-64 md:border-r-3 md:border-b-0") as HTMLImageElement;
    img.src = resource.image_url;
    img.alt = "";
    img.loading = "lazy";
    article.append(img);
  }

  const body = el("div", "min-w-0 flex-1 p-5 md:p-6");
  body.append(el("h3", "display text-2xl md:text-3xl", resource.title));

  if (resource.body) {
    const text = el("p", "whitespace-pre-line leading-relaxed", resource.body);
    if (resource.body.length > LONG_BODY) {
      const details = el("details", "mt-3");
      const summary = el("summary", "cursor-pointer font-mono text-sm uppercase tracking-widest text-brand-dark", "Leer más");
      details.append(summary, text);
      body.append(details);
    } else {
      text.classList.add("mt-3");
      body.append(text);
    }
  }

  const actions = el("div", "mt-5 flex flex-wrap gap-3");
  if (resource.file_url && resource.file_name) {
    const label = `Descargar ${extension(resource.file_name)}${resource.file_size ? ` · ${size(resource.file_size)}` : ""}`;
    actions.append(button(resource.file_url, "bg-brand !text-white", "fa-download", label, "recursos-descargar"));
  }
  if (resource.url) {
    const link = button(resource.url, "bg-white", "fa-arrow-up-right-from-square", resource.kind === "video" ? "Ver vídeo" : "Abrir enlace", "recursos-enlace");
    Object.assign(link, { target: "_blank", rel: "noopener" });
    actions.append(link);
  }
  if (actions.childElementCount > 0) body.append(actions);

  article.append(body);
  return article;
};

const section = (title: string, resources: Resource[]) => {
  const node = el("section", "");
  node.append(el("h2", "display text-4xl md:text-5xl", title));
  const list = el("div", "mt-6 space-y-6");
  list.append(...resources.map(render));
  node.append(list);
  return node;
};

document.querySelectorAll<HTMLElement>("[data-recursos]").forEach(async (root) => {
  const list = root.querySelector<HTMLElement>("[data-recursos-list]")!;
  const status = root.querySelector<HTMLElement>("[data-recursos-status]")!;
  try {
    const res = await fetch(SOURCE);
    if (!res.ok) throw new Error(String(res.status));
    const resources = (await res.json()) as Resource[];
    if (resources.length === 0) {
      status.textContent = "Todavía no hay recursos publicados. Mientras tanto, prueba las utilidades o escríbenos.";
      return;
    }
    const kinds = [...new Set(resources.map((r) => r.kind))].sort((a, b) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99));
    list.replaceChildren(...kinds.map((kind) => {
      const group = resources.filter((r) => r.kind === kind);
      return section(KINDS[kind] ?? group[0].kind_name, group);
    }));
    status.remove();
    if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
  } catch {
    status.textContent = "No hemos podido cargar los recursos. Vuelve a intentarlo en un rato.";
  }
});

export {};
