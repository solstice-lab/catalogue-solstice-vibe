/**
 * Zone en cours de chargement : barres pleines qui pulsent à la place d'un
 * blanc (aplat, sans dégradé : charte « registre »).
 * Utilisé par les `loading.tsx` et partout où des données se font attendre.
 */
export function Squelette({ lignes = 3 }: { lignes?: number }) {
  return (
    <div className="sl-squelette" aria-busy="true" aria-label="Chargement">
      {Array.from({ length: lignes }).map((_, index) => (
        <span key={index} />
      ))}
    </div>
  );
}
