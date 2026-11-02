import { Squelette } from "@/ui";

export default function Chargement() {
  return (
    <main className="sl-page">
      <div className="sl-carte">
        <Squelette lignes={4} />
      </div>
    </main>
  );
}
