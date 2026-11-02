import { useId } from "react";
import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

/** Champ de saisie avec label en petites capitales et texte d'aide optionnel. */
export function Champ({
  label,
  aide,
  ...props
}: { label: string; aide?: string } & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div className="sl-champ">
      <label className="sl-champ-label" htmlFor={id}>
        {label}
      </label>
      <input id={id} {...props} />
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
