/*
 * Logique des champs sans cadre de la charte « registre » (composant Saisie
 * de Champ.tsx) : formats contrôlés et « prochain champ » de la page.
 * Portage du composant SL du modèle de web app Solstice Lab. Séparée du
 * composant pour se tester sans navigateur.
 */

type Format = {
  /** La saisie est au bon format. */
  ok: (valeur: string) => boolean;
  /** Elle peut encore le devenir : pas de rouge pendant la frappe tant que c'est vrai. */
  partiel: (valeur: string) => boolean;
  /** Ajouté au libellé quand la saisie est refusée. */
  message: string;
};

// Chiffres sans les espaces ni les points qui les groupent (« 123 456 789 »).
const chiffres = (valeur: string) => valeur.replace(/[\s.]/g, "");
// Nombre saisi à la française : « 4 280,5 ».
const estNombre = (valeur: string) => /^\d[\d\s]*([.,]\d+)?$/.test(valeur.trim());
const nombrePartiel = (valeur: string) => /^[\d\s]*([.,]\d*)?$/.test(valeur);
const lireNombre = (valeur: string) => {
  const nombre = parseFloat(valeur.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(nombre) ? nombre : 0;
};

function dateReelle(valeur: string): boolean {
  const morceaux = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(valeur.trim());
  if (!morceaux) return false;
  const [jour, mois, annee] = [Number(morceaux[1]), Number(morceaux[2]), Number(morceaux[3])];
  const date = new Date(annee, mois - 1, jour);
  return date.getFullYear() === annee && date.getMonth() === mois - 1 && date.getDate() === jour;
}

// Une date tapée en entier (jj/mm/aaaa) n'a plus rien à attendre : le 31/02
// est refusé dès sa dernière frappe.
const datePartielle = (valeur: string) =>
  valeur.trim().length < 10 && /^\d{0,2}(\/\d{0,2}(\/\d{0,4})?)?$/.test(valeur.trim());

export const FORMATS = {
  siren: {
    ok: (v) => /^\d{9}$/.test(chiffres(v)),
    partiel: (v) => /^\d{0,9}$/.test(chiffres(v)),
    message: "9 chiffres attendus",
  },
  cp: {
    ok: (v) => /^\d{5}$/.test(v.trim()),
    partiel: (v) => /^\d{0,5}$/.test(v.trim()),
    message: "5 chiffres attendus",
  },
  email: {
    ok: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()),
    partiel: (v) => /^[^\s@]*(@[^\s@]*)?$/.test(v.trim()),
    message: "adresse incomplète",
  },
  tel: {
    ok: (v) => /^(0\d{9}|\+33\d{9})$/.test(chiffres(v)),
    partiel: (v) => /^\+?\d{0,12}$/.test(chiffres(v)),
    message: "10 chiffres, ou +33 et 9 chiffres",
  },
  date: {
    ok: dateReelle,
    partiel: datePartielle,
    message: "date réelle au format jj/mm/aaaa",
  },
  int: {
    ok: (v) => /^\d+$/.test(chiffres(v)) && Number(chiffres(v)) > 0,
    partiel: (v) => /^\d*$/.test(chiffres(v)),
    message: "nombre entier attendu",
  },
  num: {
    ok: (v) => estNombre(v) && lireNombre(v) > 0,
    partiel: nombrePartiel,
    message: "nombre attendu",
  },
  pct: {
    ok: (v) => estNombre(v) && lireNombre(v) <= 100,
    partiel: (v) => nombrePartiel(v) && lireNombre(v) <= 100,
    message: "entre 0 et 100",
  },
  split: {
    ok: (v) => {
      const parts = v.split("/").map((part) => part.trim());
      return (
        parts.length > 1 &&
        parts.every((part) => /^\d+$/.test(part)) &&
        parts.reduce((total, part) => total + Number(part), 0) === 100
      );
    },
    partiel: (v) => /^[\d\s/]*$/.test(v),
    message: "parts séparées par /, total 100",
  },
  url: {
    ok: (v) => {
      try {
        const adresse = new URL(v.trim());
        return ["http:", "https:"].includes(adresse.protocol) && adresse.hostname.includes(".");
      } catch {
        return false;
      }
    },
    partiel: (v) => /^h(t(t(p(s?(:(\/(\/.*)?)?)?)?)?)?)?$/i.test(v.trim()) || /^https?:\/\/\S*$/i.test(v.trim()),
    message: "adresse commençant par http:// ou https://",
  },
} satisfies Record<string, Format>;

export type NomFormat = keyof typeof FORMATS;

export type EtatSaisie = "neutre" | "valide" | "invalide";

/**
 * Pendant la frappe, une saisie incomplète mais plausible reste neutre : du
 * rouge dès la première lettre d'un e-mail sanctionnerait chaque champ. À la
 * sortie, tout ce qui n'est pas au format passe au rouge. Un champ vide reste
 * neutre : l'obligatoire se contrôle à l'envoi, pas à la sortie du champ.
 */
export function evaluerSaisie(valeur: string, format: NomFormat | undefined, phase: "frappe" | "sortie"): EtatSaisie {
  if (!format || valeur.trim() === "") return "neutre";
  const regle: Format = FORMATS[format];
  if (regle.ok(valeur)) return "valide";
  return phase === "frappe" && regle.partiel(valeur) ? "neutre" : "invalide";
}

/** Le format qu'un type d'input porte de lui-même, quand l'appelant n'en précise pas. */
export function formatDuType(type: string | undefined): NomFormat | undefined {
  if (type === "email" || type === "tel" || type === "url") return type;
  return undefined;
}

/**
 * Le prochain champ à remplir : le premier champ vide de la page, et lui seul.
 * Un seul accent et une seule animation par page, même sur un formulaire long.
 */
export function indexDuProchain(champs: { vide: boolean; candidat: boolean }[]): number {
  return champs.findIndex((champ) => champ.vide && champ.candidat);
}

/* ---- Comportement de page (navigateur seulement) ---- */

let observateur: IntersectionObserver | null = null;
let observe: Element | null = null;
let marquagePrevu = false;

// Relance l'animation : deux respirations, puis la barre reste allumée.
function respirer() {
  const prochain = document.querySelector<HTMLElement>(".ed.is-next");
  if (!prochain) return;
  prochain.classList.remove("breathe");
  void prochain.offsetWidth;
  prochain.classList.add("breathe");
}

/**
 * Pose `is-next` sur le prochain champ de toute la page. Il respire quand il
 * arrive à l'écran. Une saisie marquée `data-prochain="non"` (filtre de
 * tableau), désactivée ou en lecture seule n'est jamais le prochain champ.
 */
export function marquerProchain() {
  const saisies = Array.from(document.querySelectorAll<HTMLElement>(".ed"));
  const index = indexDuProchain(
    saisies.map((saisie) => {
      const input = saisie.querySelector("input");
      return {
        vide: !input || input.value === "",
        candidat: Boolean(input) && saisie.dataset.prochain !== "non" && !input?.disabled && !input?.readOnly,
      };
    })
  );
  saisies.forEach((saisie, i) => {
    saisie.classList.toggle("is-next", i === index);
    if (i !== index) saisie.classList.remove("breathe");
  });
  const prochain = index === -1 ? null : saisies[index];
  if (!observateur && "IntersectionObserver" in window) {
    observateur = new IntersectionObserver(
      (entrees) => entrees.forEach((entree) => entree.isIntersecting && respirer()),
      { threshold: 1 }
    );
  }
  if (observateur && prochain !== observe) {
    if (observe) observateur.unobserve(observe);
    observe = prochain;
    if (prochain) observateur.observe(prochain);
  }
  respirer();
}

/**
 * Marque le prochain champ à l'image suivante, une fois React passé : un
 * rendu réécrit l'attribut class de l'enveloppe, et un marquage fait avant
 * lui serait perdu. Plusieurs appels dans la même image n'en font qu'un.
 */
export function programmerMarquage() {
  if (marquagePrevu || typeof window === "undefined") return;
  marquagePrevu = true;
  requestAnimationFrame(() => {
    marquagePrevu = false;
    marquerProchain();
  });
}
