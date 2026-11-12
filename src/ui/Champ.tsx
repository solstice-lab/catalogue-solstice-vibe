"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { evaluerSaisie, formatDuType, FORMATS, programmerMarquage, type EtatSaisie, type NomFormat } from "./champs";

// Les types qui se tapent reçoivent la barre d'insertion. Les autres (date,
// fichier, nombre, mot de passe…) gardent leur forme native : leur contrôle
// se voit déjà, et la barre d'un mot de passe suivrait la largeur du texte en
// clair, pas celle des points.
const TYPES_SAISIE = new Set(["text", "email", "tel", "search", "url"]);

type ProprietesSaisie = InputHTMLAttributes<HTMLInputElement> & {
  /** Format contrôlé ; par défaut, celui du type (`email`, `tel`, `url`). */
  format?: NomFormat;
  /** Jamais le « prochain champ » de la page : un filtre de tableau ne se remplit pas. */
  horsProchain?: boolean;
  /** Message de format à afficher dans le libellé, ou `null` quand la saisie est acceptée. */
  onValidite?: (message: string | null) => void;
  /** Classe de l'enveloppe .ed (`className`, lui, reste sur l'input). */
  classeEnveloppe?: string;
};

/**
 * Saisie sans cadre de la charte « registre » : du texte dans sa cellule,
 * signalé par une barre d'insertion (.car) placée juste après la valeur grâce
 * à un miroir invisible (.mir). Pâle au repos, couleur d'accent et qui respire sur
 * le seul prochain champ vide de la page, effacée pendant la saisie (le vrai
 * curseur prend le relais), verte ou rouge selon le format. Le 22/10/2026,
 * une appli livrée avec des inputs nus avait des champs invisibles au repos :
 * tout input qui se tape passe par ici (tests/champs-sans-cadre.test.ts).
 * Une saisie en lecture seule ou désactivée ne porte pas de barre : pas de
 * barre, pas de saisie.
 */
export function Saisie({
  format: formatDemande,
  horsProchain = false,
  onValidite,
  classeEnveloppe,
  ...props
}: ProprietesSaisie) {
  const refInput = useRef<HTMLInputElement>(null);
  const refFocus = useRef(false);
  const controle = props.value !== undefined;
  const nomFormat = formatDemande ?? formatDuType(props.type);
  // Saisie non contrôlée (defaultValue, formulaire envoyé par server action) :
  // la valeur se suit ici, c'est elle qui place la barre.
  const [valeurLibre, setValeurLibre] = useState(() => String(props.defaultValue ?? ""));
  const valeur = controle ? String(props.value ?? "") : valeurLibre;
  // Une valeur reçue d'un envoi refusé se juge dès l'affichage, comme à la sortie du champ.
  const [etat, setEtat] = useState<EtatSaisie>(() => evaluerSaisie(valeur, nomFormat, "sortie"));
  const etatAffiche: EtatSaisie = valeur.trim() === "" ? "neutre" : etat;
  const message = etatAffiche === "invalide" && nomFormat ? FORMATS[nomFormat].message : null;
  const vide = valeur === "";

  const refValidite = useRef(onValidite);
  useEffect(() => {
    refValidite.current = onValidite;
  });
  useEffect(() => {
    refValidite.current?.(message);
  }, [message]);

  // Un champ vidé (envoi réussi, remise à zéro par le parent) redevient
  // candidat : l'accent revient sur le premier champ vide de la page. Pas
  // l'inverse : remplir un champ ne déplace l'accent qu'à sa sortie, sans quoi
  // il sauterait au champ suivant dès la première frappe.
  useEffect(() => {
    if (vide) programmerMarquage();
  }, [vide]);

  useEffect(() => {
    const input = refInput.current;
    const formulaire = input?.form;
    // Relit la valeur que le DOM porte vraiment : texte tapé avant
    // l'hydratation ou restauré par le navigateur au retour arrière, et
    // remise à zéro du formulaire par React 19 après une server action
    // réussie, qui ne passe par aucun événement de saisie.
    const relire = () => {
      if (!input) return;
      if (!controle) setValeurLibre(input.value);
      setEtat(evaluerSaisie(input.value, nomFormat, "sortie"));
      // Un autoFocus posé avant l'hydratation n'a pas déclenché onFocus.
      if (document.activeElement === input) {
        refFocus.current = true;
        document.body.classList.add("is-typing");
      }
      programmerMarquage();
    };
    const surRemise = () => setTimeout(relire);
    const auMontage = setTimeout(relire);
    formulaire?.addEventListener("reset", surRemise);
    return () => {
      clearTimeout(auMontage);
      formulaire?.removeEventListener("reset", surRemise);
      // Un champ retiré pendant la saisie (modale fermée) ne déclenche pas
      // toujours blur : sans ceci, plus rien ne respirerait dans la page.
      if (refFocus.current) document.body.classList.remove("is-typing");
      programmerMarquage();
    };
  }, [controle, nomFormat]);

  const classes = [
    "ed",
    vide && "is-empty",
    etatAffiche === "valide" && "is-valid",
    etatAffiche === "invalide" && "is-invalid",
    (props.readOnly || props.disabled) && "ro",
    classeEnveloppe,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={classes} data-prochain={horsProchain ? "non" : undefined}>
      <span className="mir" aria-hidden="true">
        {valeur}
      </span>
      <i className="car" aria-hidden="true" />
      <input
        {...props}
        ref={refInput}
        aria-invalid={etatAffiche === "invalide" ? true : props["aria-invalid"]}
        // Sans libellé visible (filtre de tableau), le message passe dans l'infobulle.
        title={message && !onValidite ? message : props.title}
        onChange={(evenement) => {
          if (!controle) setValeurLibre(evenement.target.value);
          setEtat(evaluerSaisie(evenement.target.value, nomFormat, "frappe"));
          props.onChange?.(evenement);
        }}
        onFocus={(evenement) => {
          refFocus.current = true;
          document.body.classList.add("is-typing");
          props.onFocus?.(evenement);
        }}
        onBlur={(evenement) => {
          refFocus.current = false;
          document.body.classList.remove("is-typing");
          setEtat(evaluerSaisie(evenement.target.value, nomFormat, "sortie"));
          programmerMarquage();
          props.onBlur?.(evenement);
        }}
      />
    </span>
  );
}

/**
 * Champ de formulaire : libellé en petites capitales, saisie sans cadre et
 * texte d'aide optionnel. `format` contrôle la saisie (SIREN, code postal,
 * date jj/mm/aaaa…) ; un refus ajoute son message au libellé, jamais le rouge
 * seul.
 */
export function Champ({
  label,
  aide,
  format,
  type,
  ...props
}: { label: string; aide?: string; format?: NomFormat } & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  const [message, setMessage] = useState<string | null>(null);
  const seTape = TYPES_SAISIE.has(type ?? "text");
  return (
    <div className="sl-champ">
      <label className="sl-champ-label" htmlFor={id}>
        {label}
        {/* Région présente dès l'affichage : une région live insérée avec son
            texte n'est pas toujours annoncée par les lecteurs d'écran. */}
        <span className="sl-champ-msg" role="status">
          {message && ` · ${message}`}
        </span>
      </label>
      {seTape ? (
        <Saisie id={id} type={type} format={format} onValidite={setMessage} {...props} />
      ) : (
        <input id={id} type={type} {...props} />
      )}
      {aide && <span className="sl-champ-aide">{aide}</span>}
    </div>
  );
}

export function ChampSelect({
  label,
  aide,
  options,
  ...props
}: {
  label: string;
  aide?: string;
  options: { valeur: string; libelle: string }[];
} & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  return (
    <div className="sl-champ">
      <label className="sl-champ-label" htmlFor={id}>
        {label}
      </label>
      <select id={id} {...props}>
        {options.map((option) => (
          <option key={option.valeur} value={option.valeur}>
            {option.libelle}
          </option>
        ))}
      </select>
      {aide && <span className="sl-champ-aide">{aide}</span>}
    </div>
  );
}

export function ChampTexteLong({
  label,
  aide,
  ...props
}: { label: string; aide?: string } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <div className="sl-champ">
      <label className="sl-champ-label" htmlFor={id}>
        {label}
      </label>
      <textarea id={id} rows={4} {...props} />
      {aide && <span className="sl-champ-aide">{aide}</span>}
    </div>
  );
}

/**
 * Case à cocher, son libellé sur la même ligne (« Prévenir par e-mail »).
 * `Champ type="checkbox"` mettait le libellé au-dessus, en petites capitales,
 * et la case dans le cadre d'un champ de saisie.
 */
export function ChampCase({
  label,
  aide,
  ...props
}: { label: string; aide?: string } & Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const id = useId();
  return (
    <div className="sl-champ-case">
      <input id={id} type="checkbox" {...props} />
      <label htmlFor={id}>{label}</label>
      {aide && <span className="sl-champ-aide">{aide}</span>}
    </div>
  );
}

/**
 * Champ piège anti-robot (formulaire public, brique contact) : un champ
 * texte qu'un robot remplit et qu'un humain ne voit pas. Hors de l'écran plutôt
 * qu'en `type="hidden"` ou `display: none`, que les robots savent sauter ;
 * masqué aux lecteurs d'écran et sauté à la tabulation, pour qu'aucun visiteur
 * ne le remplisse par mégarde. Le serveur refuse en silence tout envoi où il
 * n'est pas vide.
 */
export function ChampPiege({ name }: { name: string }) {
  const id = useId();
  return (
    <div className="sl-champ-piege" aria-hidden="true">
      <label htmlFor={id}>Site web</label>
      <input id={id} type="text" name={name} tabIndex={-1} autoComplete="off" defaultValue="" />
    </div>
  );
}
