/**
 * L'emblème Solstice Lab : un hexagone évidé fait de six polygones, repris tel
 * quel du site (charte « registre »). Il prend la couleur du texte qui
 * l'entoure (`currentColor`) : l'en-tête le passe en blanc au survol, la
 * signature le garde aux couleurs de l'agence. Interne au kit, jamais exporté :
 * on ne redessine pas le logo, et l'ancienne pastille à anneau ne revient pas.
 */
export function Embleme({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 448 500" aria-hidden focusable="false">
      <g fill="currentColor">
        <polygon points="363.68 314.52 447.49 362.9 447.49 137.1 363.68 185.48" />
        <polygon points="0.51 362.9 84.32 314.51 84.32 185.48 0.51 137.1" />
        <polygon points="237.97 0 237.97 96.77 349.71 161.29 433.52 112.9" />
        <polygon points="210.03 0 14.48 112.9 98.29 161.29 210.03 96.77" />
        <polygon points="14.48 387.1 210.03 500 210.03 403.23 98.29 338.71" />
        <polygon points="237.97 403.23 237.97 500 433.52 387.1 349.71 338.71" />
      </g>
    </svg>
  );
}
