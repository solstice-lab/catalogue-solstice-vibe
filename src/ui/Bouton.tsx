import type { ButtonHTMLAttributes } from "react";

export function Bouton({
  variante = "primaire",
  className,
  ...props
}: {
  variante?: "primaire" | "secondaire" | "danger";
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={["sl-bouton", `sl-bouton--${variante}`, className].filter(Boolean).join(" ")}
    />
  );
}
