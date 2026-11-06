/*
 * La liste déclarative de l'assembleur (outils/assembler.mjs) : pour chaque
 * unité qu'une copie client peut ne pas garder, les fichiers à supprimer et,
 * dans chaque fichier partagé du socle, le texte à retirer ou à remplacer.
 *
 * Mécanisme tranché par la personne responsable du projet le 2026-10-20 :
 * une liste ici, aucun marqueur dans le code de l'appli : l'assembleur n'y lit
 * que les extraits de cette liste. Précisé le 2026-10-26 : seuls sont permis
 * les commentaires qui bornent un bloc (« Brique X … » à l'ouverture, « Fin de
 * la brique X. » à la fermeture) et disent pourquoi il est là. Ils ne font que
 * servir de `de` et de `a` à un `bloc` de cette liste, qui reste seule à dire
 * quoi retirer. Quand la brique est prise, ils restent dans le code de
 * l'appli, où ils disent d'où vient le bloc. Aucune autre balise de début ou
 * de fin de brique. Le risque connu de ce choix est que la liste s'écarte du
 * code ; deux garde-fous le tiennent :
 *   - l'assembleur échoue fort si un extrait n'existe pas, ou existe plusieurs
 *     fois dans son fichier (il ne saurait pas lequel retirer) ;
 *   - tests/assembleur.test.ts assemble des combinaisons de briques, vérifie
 *     les imports, tape le typecheck de l'appli assemblée, et relit chaque
 *     extrait de la liste contre le catalogue.
 *
 * Les extraits sont comparés fins de ligne normalisées (« \n »). Un extrait
 * qui s'étend sur plusieurs lignes est écrit tel quel, indentation comprise :
 * un fichier reformaté fait échouer l'assemblage au lieu de le fausser.
 */

// Les constructeurs de la liste. Trois gestes, rien d'autre :
//   ligne   : retire la ligne qui contient l'extrait (une occurrence exacte) ;
//   bloc    : retire, ou remplace par `par`, les lignes qui vont de celle qui
//             contient `de` à celle où finit la première occurrence de `a`
//             après lui (`de` : une occurrence exacte) ;
//   remplace: remplace un extrait (une occurrence exacte) par un autre.
// Les `remplace` passent avant les `ligne` et `bloc` : un texte réécrit à
// l'intérieur d'un bloc que retire une autre unité ne fait pas échouer
// l'assemblage. Ils ne doivent donc pas toucher le texte que `de` et `a` d'un
// bloc retrouvent.
const ligne = (fichier, extrait) => ({ geste: "ligne", fichier, extrait });
const bloc = (fichier, de, a, par) => ({ geste: "bloc", fichier, de, a, par });
const remplace = (fichier, extrait, par) => ({ geste: "remplace", fichier, extrait, par });
// Hors des gestes, une unité peut déclarer ses paquets npm (`dependances`) :
// retirée, elle les emporte de package.json et du verrou (retirerLesDependances
// d'outils/assembler.mjs).

// Le test d'une migration : `it` ou `describe` se retire de son titre à sa
// dernière ligne, passée en `a`.
const FIN_IT = "\n  });";

// Ce que l'assembleur ne copie jamais : la vie du catalogue lui-même. Une
// entrée qui finit par « / » désigne un dossier.
export const EXCLUS_DU_CATALOGUE = [
  // Une fiche projet écrite dans le catalogue (skill solstice-nouvelle-appli)
  // décrit le catalogue, pas l'appli du client, qui reçoit la sienne par --fiche.
  "PROJET.md",
  "README.md",
  "outils/",
  // La skill de l'assembleur : elle nomme outils/, absent de l'appli assemblée
  // (le client reçoit un dépôt, pas l'outil).
  ".claude/skills/creer-appli/",
  // Même raison pour l'agent qui relit la blueprint avant l'assemblage : il cite
  // outils/. Copié, il a mis main au rouge après l'arrivée de l'agent
  // et celle du verrou des renvois, verts chacun de leur côté. Les autres
  // agents relisent le code de l'appli et restent.
  ".claude/agents/relecteur-blueprint.md",
  ".claude/worktrees/",
  // Verrouillent l'assembleur : sans objet dans une copie qui ne l'a pas.
  "tests/assembleur.test.ts",
  "tests/aide-assemblage.ts",
  // Verrouillent l'outil de mise à jour (outils/mettre-a-jour.mjs), absent de
  // l'appli ; le second, sans assemblage, tourne avec npm test.
  "tests/mettre-a-jour.test.ts",
  "tests/mettre-a-jour-migrations.test.ts",
  // Verrouille l'outil des adaptations (outils/adaptations.mjs), absent de
  // l'appli ; il assemble une appli, mais une seule : il tourne avec npm test.
  "tests/adaptations.test.ts",
  // Verrouille l'outil des issues de la section 9 (outils/creer-issues.mjs),
  // absent de l'appli : sans lui, ce test ne trouverait rien à importer.
  "tests/creer-issues.test.ts",
  // Verrouille le job qui lance le test de l'assembleur (assemblage.yml).
  "tests/assemblage-ci.test.ts",
  // Prouve le build du socle sans base et lance le test de l'assembleur :
  // une copie n'a ni l'assembleur ni de quoi le lancer.
  ".github/workflows/assemblage.yml",
  // La licence et les fichiers de communauté du dépôt public : le client
  // reçoit une livraison sous son contrat, pas la MIT du catalogue (le texte
  // de celle-ci part dans le NOTICE que l'assembleur écrit, comme son avis
  // l'exige), et CONTRIBUTING.md décrit le circuit du catalogue, pas celui de
  // son appli.
  "LICENSE",
  "CONTRIBUTING.md",
  "SECURITY.md",
  ".github/ISSUE_TEMPLATE/",
  ".github/pull_request_template.md",
  // Les captures d'écran illustrent le README du catalogue, absent de l'appli :
  // copiées, elles y seraient orphelines.
  "docs/captures/",
];

// Ce que le socle porte mais qu'une appli ne reçoit que sur une option
// explicite de l'assembleur. Dependabot : sans personne pour
// l'entretenir après la livraison, il ouvrait une PR de mise à jour par
// semaine que personne ne fusionnait. Le catalogue garde le sien.
export const OPTIONS_DU_SOCLE = {
  dependabot: [".github/dependabot.yml"],
};

// Les briques : un dossier de src/briques/, ses tests, et ses extraits des
// fichiers partagés (étapes de migration, variables de .env.example). Une
// brique ne se retire qu'entière. `exige` : ce dont elle a besoin pour
// tourner ; « donnees » (la base, voir DONNEES) vient d'office, une autre
// brique doit être choisie avec elle, et c'est la seule qu'elle
// puisse importer (tests/assembleur.test.ts le verrouille). Une brique qui
// lit la base sans se brancher sur le socle (echeances, calendrier,
// validation, import-lot, notifications) arrive à brancher : le module métier
// de l'appli, écrit sur le patron dossiers, l'appelle (son README, « La
// brancher »). `entraine` : les briques qu'elle fait garder d'office, choisies ou
// non, quand une obligation les rend inséparables d'elle ; l'assembleur le dit
// dans sa sortie et dans le premier commit de l'appli, et vérifie leurs
// propres exigences.
export const BRIQUES = {
  echeances: {
    exige: ["donnees"],
    fichiers: [
      "src/briques/echeances/",
      "tests/echeances-calcul.test.ts",
      "tests/echeances-isolement.test.ts",
      "tests/echeances-requete.test.ts",
    ],
    retraits: [],
  },
  calendrier: {
    exige: ["donnees"],
    fichiers: ["src/briques/calendrier/", "tests/calendrier-calcul.test.ts", "tests/calendrier-isolement.test.ts"],
    retraits: [],
  },
  validation: {
    exige: ["donnees"],
    fichiers: [
      "src/briques/validation/",
      "tests/validation.test.ts",
      "tests/validation-cycle.test.ts",
      "tests/validation-isolement.test.ts",
    ],
    retraits: [
      bloc(
        "src/lib/db/migrations.ts",
        "  {\n    // File de la brique validation.",
        "await pool.query(`CREATE INDEX IF NOT EXISTS propositions_groupe_idx ON propositions (groupe);`);\n    },\n  },"
      ),
      // Sa source de l'export des données d'une personne (brique rgpd).
      ligne(
        "src/config/donnees-personnelles.ts",
        'import { SOURCES_VALIDATION } from "@/briques/validation/donnees-personnelles";'
      ),
      ligne("src/config/donnees-personnelles.ts", "  ...SOURCES_VALIDATION,"),
      ligne("tests/rgpd-export.test.ts", 'const TYPE = "test-rgpd-export";'),
      ligne("tests/rgpd-export.test.ts", "  await query(`DELETE FROM propositions WHERE type = $1`, [TYPE]);"),
      bloc(
        "tests/rgpd-export.test.ts",
        "  // Le demandeur d'une demande d'achat n'est que dans le contenu JSON de la",
        '"propositions").lignes).toEqual([]);' + FIN_IT
      ),
    ],
  },
  "import-lot": {
    exige: ["donnees"],
    fichiers: [
      "src/briques/import-lot/",
      "tests/import-lot.test.ts",
      "tests/import-lot-dates.test.ts",
      "tests/import-lot-ecrans.test.ts",
      "tests/import-lot-format.test.ts",
      "tests/import-lot-isolement.test.ts",
      "tests/import-lot-lecture.test.ts",
      "tests/import-lot-validation.test.ts",
    ],
    retraits: [
      bloc(
        "src/lib/db/migrations.ts",
        "  {\n    // Brique import-lot :",
        "CREATE INDEX IF NOT EXISTS import_lot_lignes_lot_idx ON import_lot_lignes (lot_id, ordre);\n      `);\n    },\n  },"
      ),
      bloc(
        "tests/migrations.test.ts",
        'describe("migrations de la brique import-lot"',
        "    expect(index).toHaveLength(2);\n  });\n});"
      ),
      // Sa source de l'export des données d'une personne (brique rgpd).
      ligne(
        "src/config/donnees-personnelles.ts",
        'import { SOURCES_IMPORT_LOT } from "@/briques/import-lot/donnees-personnelles";'
      ),
      ligne("src/config/donnees-personnelles.ts", "  ...SOURCES_IMPORT_LOT,"),
      ligne(
        "tests/rgpd-export.test.ts",
        "  await query(`DELETE FROM import_lots WHERE nom_fichier = 'test-rgpd-export.csv'`);"
      ),
      bloc(
        "tests/rgpd-export.test.ts",
        "  it(\"sort les lignes d'un fichier importé où l'adresse figure\"",
        'nom_fichier: "test-rgpd-export.csv", numero: 2 })]);' + FIN_IT
      ),
    ],
  },
  // Ses variables partent avec elle : une copie qui ne l'a pas ne
  // garde pas une clé Resend à renseigner pour rien.
  mails: {
    // Ni base ni session : la connexion par code l'appelle avant l'une et
    // l'autre, et un site sans base peut envoyer un mail de contact.
    exige: [],
    fichiers: ["src/briques/mails/", "tests/mails.test.ts", "tests/mails-isolement.test.ts"],
    retraits: [
      bloc(".env.example", "# Brique mails (src/briques/mails/).", "# Fin de la brique mails."),
      bloc("render.yaml", "      # Brique mails (src/briques/mails/).", "      # Fin de la brique mails."),
      // Son traitement et son sous-traitant dans la politique de confidentialité.
      ligne("src/lib/confidentialite.ts", 'import { TRAITEMENTS_MAILS } from "@/briques/mails/confidentialite";'),
      ligne("src/lib/confidentialite.ts", "  ...TRAITEMENTS_MAILS,"),
      ligne("src/lib/confidentialite.ts", '    mails: { baseLegale: "", duree: "", destinataires: "" },'),
      ligne("src/lib/confidentialite.ts", '    resend: "",'),
      // Sa note dans l'export des données d'une personne (brique rgpd).
      bloc("src/config/donnees-personnelles.ts", '  {\n    quoi: "E-mails envoyés",', "  },"),
    ],
  },
  // Prévenir par mail à jour fixe : l'envoi passe par la brique mails, le
  // journal des envois vit en base. L'appli la branche sur son module métier
  // par une liaison et une route (README, « La brancher »).
  notifications: {
    exige: ["donnees", "mails"],
    fichiers: [
      "src/briques/notifications/",
      "tests/notifications.test.ts",
      "tests/notifications-jour.test.ts",
      "tests/notifications-route.test.ts",
      "tests/notifications-isolement.test.ts",
    ],
    retraits: [
      bloc(
        "src/lib/db/migrations.ts",
        "  {\n    // Brique notifications :",
        "ON notifications_envois (destinataire);`\n      );\n    },\n  },"
      ),
      bloc(".env.example", "# Brique notifications (src/briques/notifications/).", "# Fin de la brique notifications."),
      bloc(
        "render.yaml",
        "      # Brique notifications (src/briques/notifications/).",
        "      # Fin de la brique notifications."
      ),
      // Son traitement dans la politique de confidentialité.
      ligne(
        "src/lib/confidentialite.ts",
        'import { TRAITEMENTS_NOTIFICATIONS } from "@/briques/notifications/confidentialite";'
      ),
      ligne("src/lib/confidentialite.ts", "  ...TRAITEMENTS_NOTIFICATIONS,"),
      bloc(
        "src/lib/confidentialite.ts",
        "    // Une durée surchargée dans `durees` se règle aussi dans conservationMois",
        '    notifications: { baseLegale: "", duree: "", destinataires: "" },'
      ),
      // Sa source de l'export des données d'une personne (brique rgpd ; sans
      // elle, le registre part, ces retraits se sautent).
      ligne(
        "src/config/donnees-personnelles.ts",
        'import { SOURCES_NOTIFICATIONS } from "@/briques/notifications/donnees-personnelles";'
      ),
      ligne("src/config/donnees-personnelles.ts", "  ...SOURCES_NOTIFICATIONS,"),
      ligne(
        "src/config/donnees-personnelles.ts",
        '  notifications_lancements: "Les jours où chaque branchement de notifications a envoyé (brique notifications).",'
      ),
    ],
  },
  // Sans base : une vitrine se met en ligne aussi.
  // render.yaml est l'adaptateur Render, le job deployer de ci.yml le cœur.
  // `hebergeur` : le nom qu'écrit l'assembleur dans les mentions légales (voir
  // remplissagesDeLEnTete). Seul un adaptateur qui sait quel hébergeur il
  // configure le déclare : sans la brique, ou pour un adaptateur remplacé à la
  // main, le champ reste « À compléter ».
  deploiement: {
    exige: [],
    fichiers: ["src/briques/deploiement/", "render.yaml", "tests/deploiement.test.ts"],
    hebergeur: "Render Services, Inc.",
    retraits: [
      bloc(
        ".github/workflows/ci.yml",
        "  # Brique déploiement (src/briques/deploiement/).",
        "  # Fin de la brique déploiement."
      ),
      bloc(
        ".github/workflows/ci.yml",
        "#    La brique déploiement (job deployer, en fin de fichier) coupe cet",
        "#    auto-déploiement et ne met en ligne qu'après la vérification."
      ),
      // Le lieu de l'hébergeur dans la politique de confidentialité :
      // sans la brique, il se remplit dans la configuration. Et Cloudflare,
      // que Render place devant le site : sans la brique, rien ne dit qu'il
      // y est.
      ligne(
        "src/lib/confidentialite.ts",
        'import { LIEUX_DEPLOIEMENT, SOUS_TRAITANTS_DEPLOIEMENT } from "@/briques/deploiement/confidentialite";'
      ),
      ligne("src/lib/confidentialite.ts", "  ...LIEUX_DEPLOIEMENT,"),
      ligne("src/lib/confidentialite.ts", "      ...SOUS_TRAITANTS_DEPLOIEMENT,"),
      ligne("src/lib/confidentialite.ts", "    // Brique déploiement : Cloudflare, que Render place devant le site."),
      ligne("src/lib/confidentialite.ts", '    cloudflare: "",'),
      bloc(
        "src/lib/confidentialite.ts",
        "    // Ignoré avec la brique déploiement : le lieu se lit alors dans sa",
        "    // configuration (LIEUX_DEPLOIEMENT), pas ici."
      ),
    ],
  },
  // Le formulaire de contact d'une vitrine. Le message part par
  // la brique mails ; la limite d'envois par adresse IP vit en base, d'où la
  // base sans connexion (et sans les écrans du patron dossiers, voir
  // PATRON_DOSSIERS).
  contact: {
    exige: ["donnees", "mails"],
    fichiers: [
      "src/briques/contact/",
      "src/app/contact/",
      "tests/contact.test.ts",
      "tests/contact-isolement.test.ts",
      "tests/contact-page.test.ts",
    ],
    retraits: [
      bloc(
        "src/lib/db/migrations.ts",
        "  {\n    // Brique contact :",
        "recu_le TIMESTAMPTZ NOT NULL DEFAULT now()\n        );\n      `);\n    },\n  },"
      ),
      bloc(".env.example", "# Brique contact (src/briques/contact/).", "# Fin de la brique contact."),
      bloc("render.yaml", "      # Brique contact (src/briques/contact/).", "      # Fin de la brique contact."),
      ligne(
        "tests/gardes-acces.test.ts",
        '"contact/page.tsx": "le formulaire de contact public, protégé par ses filtres anti-spam (brique contact)",'
      ),
      // Ouverte sans session dans la brique comptes : sans elle, ces retraits
      // se sautent (leurs fichiers sont partis avec comptes).
      ligne("src/briques/comptes/protection.ts", "  // Brique contact : le formulaire public d'une vitrine."),
      ligne("src/briques/comptes/protection.ts", '  "/contact",'),
      // La page du sitemap, que la brique comptes ait réécrit la liste
      // ou non : son remplace ne touche pas ces deux lignes.
      ligne("src/lib/referencement.ts", "    // Brique contact : le formulaire public d'une vitrine."),
      ligne("src/lib/referencement.ts", '    "/contact",'),
      bloc(
        "tests/comptes-proxy.test.ts",
        "  // Brique contact : un visiteur sans compte écrit depuis /contact",
        "  // Fin de la brique contact."
      ),
      // Son traitement dans la politique de confidentialité.
      ligne("src/lib/confidentialite.ts", 'import { TRAITEMENTS_CONTACT } from "@/briques/contact/confidentialite";'),
      ligne("src/lib/confidentialite.ts", "  ...TRAITEMENTS_CONTACT,"),
      ligne("src/lib/confidentialite.ts", '    contact: { baseLegale: "", duree: "", destinataires: "" },'),
      // Sa note dans l'export des données d'une personne (brique rgpd).
      bloc("src/config/donnees-personnelles.ts", '  {\n    quoi: "Messages du formulaire de contact",', "  },"),
    ],
  },
  // La session en base, la protection des routes, /connexion et
  // les droits (exiger, peut, visiblePour). src/config/acces.ts, comptes.ts et
  // effets-comptes.ts sont les fichiers que l'appli remplit, mais ils importent les types de la
  // brique : ils partent avec elle. Les écrans du patron dossiers l'exigent,
  // chacune de leurs pages appelant exiger (PATRON_DOSSIERS).
  comptes: {
    // `connexion` : la brique qui porte la connexion, donc l'entrée que
    // l'en-tête de la blueprint règle (remplissagesDeLEntree). Une blueprint qui
    // la règle sans que la brique soit gardée est refusée.
    connexion: true,
    // mails : la connexion par code, méthode par défaut, envoie son code par
    // e-mail, et celle par lien son lien. Sans elle, seuls Google ou Microsoft
    // vaudraient en production.
    exige: ["donnees", "mails"],
    // rgpd : une appli qui a des comptes garde des données personnelles, et
    // doit pouvoir répondre à une demande d'accès ou d'effacement (RGPD
    // art. 15, 17, 20). Décidé par la personne responsable du projet : la
    // recommandation de la skill creer-appli ne suffisait pas.
    entraine: ["rgpd"],
    fichiers: [
      "src/briques/comptes/",
      "src/config/acces.ts",
      "src/config/comptes.ts",
      "src/app/connexion/",
      "tests/roles.test.ts",
      "tests/gardes-acces.test.ts",
      "tests/comptes-isolement.test.ts",
      "tests/comptes-session.test.ts",
      "tests/comptes-proxy.test.ts",
      "tests/comptes-code-email.test.ts",
      "tests/comptes-lien-email.test.ts",
      "tests/comptes-administration.test.ts",
      // Le test-verrou du menu : il lit les droits, que seule la brique porte.
      "tests/navigation.test.ts",
      "tests/comptes-google.test.ts",
      "tests/comptes-microsoft.test.ts",
      // Le registre des effets de comptes : ce que les autres unités font d'un
      // compte désactivé, réactivé ou effacé. Chacune y retire son entrée.
      "src/config/effets-comptes.ts",
      "tests/comptes-effets.test.ts",
      "tests/aide-session.ts",
      "tests/aide-comptes.ts",
      // Les cookies et en-têtes simulés de tous les tests, et le rôle qu'ils
      // jouent : hors de la brique, aucun code ne lit un cookie, et le
      // formulaire de contact passe ses en-têtes en paramètre.
      "tests/setup.ts",
      "tests/aide-cookies.ts",
    ],
    retraits: [
      // --- protection des routes : sans la brique, le proxy ne pose que la CSP
      ligne("src/proxy.ts", 'import { protegerLaRoute } from "@/briques/comptes/protection";'),
      bloc(
        "src/proxy.ts",
        "  // Brique comptes : sans session, la requête part vers /connexion.",
        "  // Fin de la brique comptes."
      ),
      // --- comptes et sessions en base (le fichier part avec la base, que la
      // brique exige ; le retrait vaut si la base reste un jour sans elle)
      bloc(
        "src/lib/db/migrations.ts",
        "  {\n    // Brique comptes : les comptes et leurs sessions.",
        "CREATE INDEX IF NOT EXISTS sessions_utilisateur_id_idx ON sessions (utilisateur_id);`);\n    },\n  },"
      ),
      bloc(
        "src/lib/db/migrations.ts",
        "  {\n    // Brique comptes : les demandes de code de connexion par",
        "CREATE INDEX IF NOT EXISTS codes_connexion_essais_cree_le_idx ON codes_connexion_essais (cree_le);`);\n    },\n  },"
      ),
      bloc(
        "src/lib/db/migrations.ts",
        "  {\n    // Brique comptes : l'administration des comptes dans l'appli,",
        "CONSTRAINT domaines_admis_minuscules_check CHECK (domaine = lower(btrim(domaine)))\n        );\n      `);\n    },\n  },"
      ),
      // --- variables : ni secret ni premier admin à déclarer pour rien
      bloc(".env.example", "# Brique comptes (src/briques/comptes/).", "# Fin de la brique comptes."),
      bloc("render.yaml", "      # Brique comptes (src/briques/comptes/).", "      # Fin de la brique comptes."),
      // Le test de la CSP de production n'a plus de démo à écarter.
      bloc(
        "tests/en-tetes-securite.test.ts",
        "  // Brique comptes : sa méthode démo refuse la production dès le proxy",
        "  // Fin de la brique comptes."
      ),
      bloc(
        "tests/deploiement.test.ts",
        "  it(\"fait générer AUTH_SECRET par l'hébergeur",
        "generateValue: true/);\n  });"
      ),
      // --- bandeau de session
      ligne("src/app/layout.tsx", 'import { BandeauSession } from "@/briques/comptes/BandeauSession";'),
      ligne("src/app/layout.tsx", "<BandeauSession />"),
      bloc(
        "src/app/globals.css",
        "/* Bandeau de session (src/briques/comptes/BandeauSession.tsx)",
        ".bandeau-session-actions {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 8px;\n}"
      ),
      // Sans droits, plus aucune entrée de menu n'a de garde.
      ligne("src/lib/navigation.ts", 'import { visiblePour } from "@/briques/comptes/roles";'),
      bloc(
        "src/lib/navigation.ts",
        "// Le garde d'affichage d'une entrée",
        "// l'accueil, déclare son garde (tests/navigation.test.ts le verrouille).",
        "// La navigation vit en UN seul endroit : chaque écran d'outil la passe à AppLayout."
      ),
      // Le fichier de préparation des tests part avec la brique.
      ligne("vitest.config.ts", "    // Simule next/headers (cookies de la requête) pour tous les tests."),
      ligne("vitest.config.ts", '    setupFiles: ["tests/setup.ts"],'),
      // Sans connexion, aucune page n'est derrière : le verrou n'a plus d'objet,
      // et l'accueil, public, revient au sitemap.
      ligne("tests/referencement.test.ts", 'import { estOuverte } from "@/briques/comptes/protection";'),
      bloc(
        "tests/referencement.test.ts",
        'describe("verrou des pages publiques : jamais une page derrière connexion',
        "\n});"
      ),
      remplace(
        "src/lib/referencement.ts",
        "   * (tests/referencement.test.ts le verrouille). Avec la brique comptes, une\n   * page publique entre aussi dans ROUTES_OUVERTES de la brique (et OUVERTS\n   * de tests/gardes-acces.test.ts), et l'accueil n'en est pas une.\n",
        "   * (tests/referencement.test.ts le verrouille).\n"
      ),
      remplace(
        "src/lib/referencement.ts",
        "  // Sans l'accueil : la brique comptes le met derrière la connexion. Une\n  // appli sans elle reçoit aussi « / » de l'assembleur. Une page par ligne :\n  // une brique qui en ajoute une la retire avec elle.\n  pagesPubliques: [\n    \"/mentions-legales\",",
        '  // Une page par ligne : une brique qui en ajoute une la retire avec elle.\n  pagesPubliques: [\n    "/",\n    "/mentions-legales",'
      ),
      // Ses traitements dans la politique de confidentialité.
      ligne("src/lib/confidentialite.ts", 'import { TRAITEMENTS_COMPTES } from "@/briques/comptes/confidentialite";'),
      ligne("src/lib/confidentialite.ts", "  ...TRAITEMENTS_COMPTES,"),
      ligne("src/lib/confidentialite.ts", '    comptes: { baseLegale: "", duree: "", destinataires: "" },'),
      ligne("src/lib/confidentialite.ts", '    "connexion-code": { baseLegale: "", duree: "", destinataires: "" },'),
      ligne(
        "src/lib/confidentialite.ts",
        '    // Lu seulement si "lien-email" est dans METHODES (src/config/comptes.ts).'
      ),
      ligne("src/lib/confidentialite.ts", '    "connexion-lien": { baseLegale: "", duree: "", destinataires: "" },'),
      ligne("src/lib/confidentialite.ts", '    // Lu seulement si "google" est dans METHODES (src/config/comptes.ts).'),
      ligne("src/lib/confidentialite.ts", '    "connexion-google": { baseLegale: "", duree: "", destinataires: "" },'),
      ligne(
        "src/lib/confidentialite.ts",
        '    // Lu seulement si "microsoft" est dans METHODES (src/config/comptes.ts).'
      ),
      ligne(
        "src/lib/confidentialite.ts",
        '    "connexion-microsoft": { baseLegale: "", duree: "", destinataires: "" },'
      ),
    ],
  },
  // L'export des données d'une personne, par elle-même
  // (/mes-donnees) ou par l'admin pour une adresse donnée
  // (/donnees-personnelles), et leur effacement, par l'admin seul
  // (/donnees-personnelles). Ses droits et ses pages appellent exiger : elle
  // exige comptes. Chaque unité décrit ses sources chez elle, et
  // src/config/donnees-personnelles.ts, qui part avec la brique, les
  // rassemble ; chaque unité y retire sa ligne quand elle part.
  rgpd: {
    exige: ["donnees", "comptes"],
    fichiers: [
      "src/briques/rgpd/",
      "src/config/donnees-personnelles.ts",
      "src/app/mes-donnees/",
      "src/app/donnees-personnelles/",
      // La purge des données au terme de leur durée de conservation.
      "scripts/purger-donnees.ts",
      "tests/rgpd-export.test.ts",
      "tests/rgpd-effacement.test.ts",
      "tests/rgpd-routes.test.ts",
      "tests/rgpd-isolement.test.ts",
      "tests/rgpd-purge.test.ts",
    ],
    retraits: [
      // Ses droits (les retraits se sautent sans comptes : acces.ts part avec elle).
      ligne("src/config/acces.ts", 'import { ACTIONS_RGPD } from "@/briques/rgpd/actions";'),
      ligne("src/config/acces.ts", "  ...ACTIONS_RGPD,"),
      bloc(
        "src/config/acces.ts",
        "  // Chacun télécharge ses propres données ; l'admin, celles de n'importe",
        '  "donnees.effacer": ["admin"],'
      ),
      ligne(
        "src/lib/navigation.ts",
        '{ libelle: "Mes données", href: "/mes-donnees", visible: visiblePour("mes-donnees.exporter") },'
      ),
      ligne(
        "src/lib/navigation.ts",
        '{ libelle: "Données personnelles", href: "/donnees-personnelles", visible: visiblePour("donnees.exporter") },'
      ),
      // Le renvoi de la politique de confidentialité vers /mes-donnees.
      bloc(
        "src/app/confidentialite/page.tsx",
        "        {/* Brique rgpd : la personne connectée télécharge elle-même ses données. */}",
        "        {/* Fin de la brique rgpd. */}"
      ),
    ],
  },
  // Qui a créé, modifié ou supprimé quoi, et quand. L'auteur est
  // la personne de la session et un compte de la table utilisateurs, d'où
  // comptes ; l'écran /journal et l'historique se gardent par ses droits.
  journal: {
    exige: ["donnees", "comptes"],
    // Branchée sur le patron dossiers, que la brique comptes garde,
    // et, avec gestion-comptes, sur les gestes de /comptes.
    fichiers: [
      "src/briques/journal/",
      "src/app/journal/",
      "tests/journal.test.ts",
      "tests/journal-dossiers.test.ts",
      "tests/journal-evenements.test.ts",
      "tests/journal-isolement.test.ts",
    ],
    retraits: [
      bloc(
        "src/lib/db/migrations.ts",
        "  {\n    // Brique journal :",
        "FOR EACH ROW EXECUTE FUNCTION journal_audit_refuser_modification();\n      `);\n    },\n  },"
      ),
      // L'action « export » (l'export de l'admin, brique rgpd), ajoutée après.
      bloc(
        "src/lib/db/migrations.ts",
        "  {\n    // Brique journal, action « export » :",
        "        $$;\n      `);\n    },\n  },"
      ),
      // --- le droit de lire le journal (acces.ts part avec la brique comptes :
      // sans elle, ces retraits se sautent)
      ligne("src/config/acces.ts", 'import { ACTIONS_JOURNAL } from "@/briques/journal/evenements";'),
      ligne("src/config/acces.ts", "  ...ACTIONS_JOURNAL,"),
      ligne("src/config/acces.ts", "  // Le journal dit qui a fait quoi : il se lit par l'admin (brique journal)."),
      ligne("src/config/acces.ts", '  "journal.consulter": ["admin"],'),
      ligne(
        "src/lib/navigation.ts",
        '{ libelle: "Journal", href: "/journal", visible: visiblePour("journal.consulter") },'
      ),
      // --- l'historique de la fiche dossier (patron, parti sans la brique comptes)
      ligne("src/app/dossiers/[slug]/page.tsx", 'import { HistoriqueFiche } from "@/briques/journal/HistoriqueFiche";'),
      ligne("src/app/dossiers/[slug]/page.tsx", '<HistoriqueFiche entite="dossiers" entiteId={dossier.id} />'),
      // --- les écritures des dossiers redeviennent de simples requêtes, sans
      // transaction ni trace (la couche données reste avec la base)
      remplace(
        "src/lib/db/dossiers.ts",
        'import { query, queryOne, transaction } from "./client";',
        'import { query, queryOne } from "./client";'
      ),
      bloc(
        "src/lib/db/dossiers.ts",
        "// Brique journal : chaque écriture des dossiers",
        "// Fin de la brique journal."
      ),
      bloc(
        "src/lib/db/dossiers.ts",
        "  // Brique journal : la création se trace",
        "  // Fin de la brique journal.",
        "  return (await query<Dossier>(INSERTION, parametres(champs)))[0];"
      ),
      bloc(
        "src/lib/db/dossiers.ts",
        "  // Brique journal : l'état d'avant",
        "  // Fin de la brique journal.",
        "  return (await query<Dossier>(MISE_A_JOUR, [id, ...parametres(champs)]))[0];"
      ),
      bloc(
        "src/lib/db/dossiers.ts",
        "  // Brique journal : une ligne par dossier supprimé",
        "  // Fin de la brique journal.",
        "  await query(SUPPRESSION, [ids]);"
      ),
      // --- les gestes de l'écran /comptes redeviennent sans trace (ces fichiers
      // partent avec la brique gestion-comptes : sans elle, ces retraits se
      // sautent). Les tests du branchement vivent dans ceux de l'écran, qui
      // importent ses actions : un fichier de tests propre au journal les
      // garderait dans une copie sans l'écran.
      bloc(
        "tests/gestion-comptes.test.ts",
        "// Brique journal : les gestes de /comptes se tracent",
        "// Fin de la brique journal."
      ),
      bloc(
        "tests/gestion-comptes.test.ts",
        "// Brique journal : qui a donné le rôle d'administration",
        "// Fin de la brique journal."
      ),
      bloc("src/app/comptes/actions.ts", "// Brique journal : chaque geste se trace", "// Fin de la brique journal."),
      bloc(
        "src/app/comptes/actions.ts",
        "// Brique journal : la personne que le garde a rendue",
        "// Fin de la brique journal."
      ),
      // La personne rendue par le garde ne sert plus qu'à la trace.
      remplace(
        "src/app/comptes/actions.ts",
        '  const personne = await exiger("comptes.administrer");\n  // Sans adresse publique',
        '  await exiger("comptes.administrer");\n  // Sans adresse publique'
      ),
      remplace("src/app/comptes/actions.ts", "      : null,\n    tracer(personne)\n  );", "      : null\n  );"),
      remplace(
        "src/app/comptes/actions.ts",
        '  const personne = await exiger("comptes.administrer");\n  return retour(await changerRole(entier(id), texte(role), contexteDeLAppli(), tracer(personne)));',
        '  await exiger("comptes.administrer");\n  return retour(await changerRole(entier(id), texte(role)));'
      ),
      // Désactiver et réactiver gardent la personne : elle est l'auteur que
      // reçoivent les effets du registre des effets de comptes, journal ou non.
      remplace(
        "src/app/comptes/actions.ts",
        '  const personne = await exiger("comptes.administrer");\n  return retour(await ouvrirDomaine(texte(domaine), contexteDeLAppli(), tracer(personne)));',
        '  await exiger("comptes.administrer");\n  return retour(await ouvrirDomaine(texte(domaine)));'
      ),
      remplace(
        "src/app/comptes/actions.ts",
        '  const personne = await exiger("comptes.administrer");\n  return retour(await fermerDomaine(texte(domaine), contexteDeLAppli(), tracer(personne)));',
        '  await exiger("comptes.administrer");\n  return retour(await fermerDomaine(texte(domaine)));'
      ),
      // --- la désactivation, la réactivation et l'effacement d'un compte ne se
      // tracent plus : son entrée du registre des effets de comptes (le
      // fichier part avec la brique comptes, que celle-ci exige)
      ligne("src/config/effets-comptes.ts", 'import { EFFETS_JOURNAL } from "@/briques/journal/effets-comptes";'),
      bloc("src/config/effets-comptes.ts", "  // Le journal en dernier", "  EFFETS_JOURNAL,"),
      // --- l'effacement des données d'une personne (ces fichiers partent avec
      // la brique rgpd : sans elle, ces retraits se sautent)
      bloc(
        "tests/rgpd-routes.test.ts",
        "    // Brique journal : la trace d'un effacement retient le compte",
        "    // Fin de la brique journal."
      ),
      bloc(
        "tests/rgpd-routes.test.ts",
        "  // Brique journal : l'anonymisation du compte se trace",
        "  // Fin de la brique journal."
      ),
      bloc(
        "tests/rgpd-routes.test.ts",
        "  // Brique journal : l'export de l'admin se trace",
        "  // Fin de la brique journal."
      ),
      // --- sa description de traitement (politique de confidentialité)
      ligne("src/lib/confidentialite.ts", 'import { TRAITEMENTS_JOURNAL } from "@/briques/journal/confidentialite";'),
      ligne("src/lib/confidentialite.ts", "  ...TRAITEMENTS_JOURNAL,"),
      ligne("src/lib/confidentialite.ts", '    journal: { baseLegale: "", duree: "", destinataires: "" },'),
      // --- sa source de l'export des données d'une personne (brique rgpd ;
      // sans elle, le registre et le test partent, ces retraits se sautent)
      ligne(
        "src/config/donnees-personnelles.ts",
        'import { SOURCES_JOURNAL } from "@/briques/journal/donnees-personnelles";'
      ),
      ligne("src/config/donnees-personnelles.ts", "  ...SOURCES_JOURNAL,"),
      ligne(
        "tests/rgpd-export.test.ts",
        "  await query(`DELETE FROM journal_audit WHERE entite = 'test_rgpd_journal'`);"
      ),
      bloc(
        "tests/rgpd-export.test.ts",
        "  // Le journal désigne son auteur par son compte, jamais par son adresse : il",
        'champs: ["client"] })]);' + FIN_IT
      ),
      // --- le nettoyage des comptes des tests (le fichier part avec la brique
      // comptes, que celle-ci exige)
      bloc(
        "tests/aide-comptes.ts",
        "  // Brique journal : chaque ligne désigne",
        'await query("DELETE FROM journal_audit");'
      ),
    ],
  },
  // L'écran /comptes, niveau 3 des droits (un client gère ses
  // comptes sans toucher à la configuration). Les règles et leur étape de
  // migration sont dans comptes (administration.ts), qui les garde sans
  // appelant quand l'écran part : la colonne gere_par_l_appli reste à faux,
  // domaines_admis vide, et c'est exactement le niveau 2.
  "gestion-comptes": {
    exige: ["donnees", "comptes"],
    // Branchée sur la navigation et la configuration des droits.
    fichiers: [
      "src/briques/gestion-comptes/",
      "src/app/comptes/",
      "tests/gestion-comptes.test.ts",
      "tests/gestion-comptes-isolement.test.ts",
    ],
    retraits: [
      // Sans la brique comptes, acces.ts et ces retraits partent avec elle.
      ligne("src/config/acces.ts", 'import { ACTIONS_GESTION_COMPTES } from "@/briques/gestion-comptes/domaine";'),
      ligne("src/config/acces.ts", "  ...ACTIONS_GESTION_COMPTES,"),
      bloc(
        "src/config/acces.ts",
        "  // L'écran /comptes (brique gestion-comptes)",
        '  "comptes.administrer": ["admin"],'
      ),
      ligne(
        "src/lib/navigation.ts",
        '{ libelle: "Comptes", href: "/comptes", visible: visiblePour("comptes.administrer") },'
      ),
      // Ce que l'écran ajoute au traitement « Comptes et connexion » :
      // sans lui, aucun admin ne crée de compte ni ne fixe un rôle.
      bloc(
        "src/briques/comptes/confidentialite.ts",
        "    // Cette ligne et la dernière précision viennent de l'écran /comptes",
        "l'indication que ce rôle est fixé dans l'appli.\","
      ),
      ligne(
        "src/briques/comptes/confidentialite.ts",
        '"Un administrateur peut créer un compte pour une adresse avant toute connexion, et prévenir la personne par un e-mail d\'information (voir « Envoi des e-mails »).",'
      ),
      // Ce que les gestes de l'écran ajoutent au traitement du journal (le
      // fichier part avec la brique journal : sans elle, ces retraits se sautent).
      remplace(
        "src/briques/journal/confidentialite.ts",
        "une fiche, ou administré un compte, et quand.",
        "une fiche, et quand."
      ),
      ligne(
        "src/briques/journal/confidentialite.ts",
        "\"Pour chaque geste d'administration des comptes (invitation, rôle, désactivation, domaine ouvert ou fermé) : le compte de son auteur, la date et l'heure, le compte concerné, désigné par son numéro, ou le domaine, et le nom des champs changés.\","
      ),
      remplace(
        "src/briques/journal/confidentialite.ts",
        '    personnes:\n      "Les personnes qui ont un compte et modifient des fiches, et celles dont un administrateur a créé ou modifié le compte, ou exporté les données.",',
        '    personnes:\n      "Les personnes qui ont un compte et modifient des fiches, et celles dont un administrateur a exporté les données.",'
      ),
    ],
  },
  // Des groupes de personnes (une coloc, une association) qu'on crée ou
  // rejoint par un code, et l'accès unique qui isole leurs fiches. Arrive
  // branchée (pages, droits, menu, registres) ; le module métier de l'appli
  // rattache ses tables à un espace (README, « La brancher »). Comptes pour
  // qui est connecté et les effets d'un compte désactivé, mails pour les
  // invitations.
  espaces: {
    exige: ["donnees", "comptes", "mails"],
    fichiers: [
      "src/briques/espaces/",
      "src/app/espace/",
      "src/config/espaces.ts",
      // Le registre des effets d'un départ d'espace, que les modules de
      // l'appli remplissent : il importe le type de la brique, il part avec elle.
      "src/config/effets-espaces.ts",
      "tests/aide-espaces.ts",
      "tests/espaces.test.ts",
      "tests/espaces-acces.test.ts",
      "tests/espaces-departs.test.ts",
      "tests/espaces-effets.test.ts",
      "tests/espaces-invitations.test.ts",
      "tests/espaces-isolation.test.ts",
      "tests/espaces-isolement.test.ts",
      "tests/espaces-saisie.test.ts",
    ],
    retraits: [
      bloc(
        "src/lib/db/migrations.ts",
        "  {\n    // Brique espaces :",
        "ON espaces_essais_code (utilisateur_id, essaye_le);`\n      );\n    },\n  },"
      ),
      // --- son droit et son entrée de menu (ces fichiers partent avec la
      // brique comptes, qu'elle exige)
      ligne("src/config/acces.ts", 'import { ACTIONS_ESPACES } from "@/briques/espaces/domaine";'),
      ligne("src/config/acces.ts", "  ...ACTIONS_ESPACES,"),
      bloc(
        "src/config/acces.ts",
        "  // Créer un espace, le rejoindre, le voir, le quitter (brique espaces)",
        '  "espaces.participer": ["membre", "admin"],'
      ),
      ligne("src/lib/navigation.ts", 'import { majuscule } from "@/briques/espaces/reglages";'),
      ligne("src/lib/navigation.ts", 'import { ESPACES } from "@/config/espaces";'),
      ligne(
        "src/lib/navigation.ts",
        '{ libelle: majuscule(ESPACES.vocabulaire.mon), href: "/espace", visible: visiblePour("espaces.participer") },'
      ),
      // --- son entrée du registre des effets de comptes
      ligne("src/config/effets-comptes.ts", 'import { EFFETS_ESPACES } from "@/briques/espaces/effets-comptes";'),
      bloc("src/config/effets-comptes.ts", "  // Brique espaces : terminer les adhésions", "  EFFETS_ESPACES,"),
      // --- ses sources de l'export des données d'une personne (brique rgpd,
      // gardée d'office avec comptes)
      ligne(
        "src/config/donnees-personnelles.ts",
        'import { SOURCES_ESPACES } from "@/briques/espaces/donnees-personnelles";'
      ),
      ligne("src/config/donnees-personnelles.ts", "  ...SOURCES_ESPACES,"),
      bloc(
        "src/config/donnees-personnelles.ts",
        "  espaces_invitations:",
        "pour les plafonds d'envoi (brique espaces), sans l'adresse invitée.\","
      ),
      // --- sa description de traitement (politique de confidentialité)
      ligne("src/lib/confidentialite.ts", 'import { TRAITEMENTS_ESPACES } from "@/briques/espaces/confidentialite";'),
      ligne("src/lib/confidentialite.ts", "  ...TRAITEMENTS_ESPACES,"),
      ligne("src/lib/confidentialite.ts", '    espaces: { baseLegale: "", duree: "", destinataires: "" },'),
      // --- le nettoyage des comptes des tests (le fichier part avec la brique
      // comptes, qu'elle exige)
      bloc("tests/aide-comptes.ts", "  // Brique espaces : une adhésion désigne", "  // Fin de la brique espaces."),
    ],
  },
};

// Les profils de départ : trois points de départ qui simplifient le choix des
// briques au cadrage, plutôt qu'un choix parmi toutes et leurs exigences. La skill
// creer-appli propose le profil d'abord, puis les briques en plus ; l'assembleur
// le lit dans l'en-tête de la blueprint (`profil:`) et en déduit les briques,
// auxquelles --briques ajoute. Le manifeste de l'appli note la liste réelle des
// briques, jamais le profil : outils/mettre-a-jour.mjs n'a rien à savoir des
// profils, et un profil qui change ici ne change pas une appli déjà assemblée.
//   briques   : ce que le profil garde, avec ce que ces briques exigent ; ce
//               qu'elles entraînent (rgpd avec comptes) vient d'office, et la
//               sortie de l'assembleur le dit ;
//   permises  : les seules briques qui peuvent s'y ajouter, quand le profil
//               borne sa liste ; absent, toute brique du catalogue ;
//   proposees : les briques que la skill propose en plus, si le besoin les demande ;
//   personnesParReseau : combien de personnes au plus se connectent dans la même
//               heure depuis un même réseau (bureau, école, événement), quand
//               la blueprint ne répond pas (LIMITES_PAR_RESEAU de
//               src/config/comptes.ts). N'est écrit que si la brique comptes
//               est gardée : la vitrine, sans connexion, porte 20 pour qu'une
//               brique ajoutée après coup parte du même défaut, mais l'assembleur
//               ne l'écrit nulle part.
export const PROFILS = {
  // Un site sans connexion ni données gardées, son contenu écrit dans le code.
  // Une brique qui connecte ou garde des fiches en ferait une autre appli :
  // refusée plutôt que de laisser croire à une vitrine. contact garde la base
  // pour sa limite d'envois, sans connexion.
  vitrine: {
    briques: [],
    permises: ["mails", "contact", "deploiement"],
    proposees: ["mails", "contact", "deploiement"],
    personnesParReseau: 20,
  },
  // Une appli à comptes pour les personnes de l'organisation. Son module métier
  // s'écrit dans l'appli sur le patron dossiers ; les briques qu'il appelle se
  // choisissent entité par entité au cadrage (skill creer-appli, étape 1).
  "outil-interne": {
    // Cent : un bureau où cinquante personnes se connectent le lundi matin, sur
    // un même réseau, aurait épuisé les vingt demandes par heure d'une appli
    // grand public.
    briques: ["comptes", "mails"],
    proposees: [],
    personnesParReseau: 100,
  },
  // Un outil interne ouvert à des personnes extérieures : un admin y gère les
  // comptes et les invitations (/comptes). espaces si le besoin est des groupes
  // (une coloc, une association) qui ne voient que leurs fiches.
  portail: {
    briques: ["comptes", "mails", "gestion-comptes"],
    proposees: ["espaces"],
    personnesParReseau: 20,
  },
};

// L'adresse IP du visiteur : pas une brique au choix. Seules la connexion
// par code (brique comptes) et la limite d'envois du formulaire de contact la
// lisent ; elle reste tant que l'une des deux reste, et un site vitrine sans
// elles ne la gardait que pour rien.
export const ADRESSE_IP = {
  conserveSiUneDe: ["comptes", "contact"],
  fichiers: ["src/lib/adresse-ip.ts", "tests/adresse-ip.test.ts"],
  retraits: [
    bloc(
      ".env.example",
      "# L'en-tête HTTP où le proxy de l'hébergeur pose l'adresse IP du visiteur",
      "IP_EN_TETE_CLIENT="
    ),
    // Avec la brique deploiement : la variable n'a plus de lecteur.
    bloc("render.yaml", "      # L'adresse IP du visiteur (src/lib/adresse-ip.ts)", "        value: cf-connecting-ip"),
    bloc(
      ".claude/skills/solstice-nouvelle-appli/socle.md",
      "- **L'adresse IP du visiteur se lit par `src/lib/adresse-ip.ts`**",
      "  visiteurs, qui bloquerait tout le monde dès qu'un seul insiste."
    ),
  ],
};

// Les écrans du patron dossiers (CLAUDE.md §3) : le modèle d'un module métier,
// à lire dans le catalogue et à copier, jamais livré à une appli. Le cas : le
// 2026-11-05, l'essai tours-de-coloc a reçu ces écrans et leur entrée
// « Dossiers » au menu, et la personne qui l'a vu a demandé ce que c'était.
// Retirés de toute copie, avec ou sans la brique comptes. La couche données du
// patron (dossiers.ts, dossiers-domaine.ts, l'import d'exemple, la table) reste
// avec la base : la retirer d'une appli déjà en ligne serait une étape de
// migration, et les briques journal, rgpd et les tests d'isolement s'y branchent.
export const PATRON_DOSSIERS = {
  fichiers: ["src/app/dossiers/"],
  retraits: [
    // Ses droits (src/config/acces.ts) n'ont rien à retirer : acces.ts part
    // avec la brique comptes, et le droit reste la référence des briques à
    // brancher (leurs README le citent).
    ligne(
      "src/lib/navigation.ts",
      '{ libelle: "Dossiers", href: "/dossiers", visible: visiblePour("dossiers.acceder") },'
    ),
  ],
};

// La vitrine du kit (/kit et /kit/site-vitrine) : les composants de src/ui/ sur
// des données fictives, pour qui thématise ou étend le kit dans le catalogue.
// Une appli n'a pas à la livrer à ses utilisateurs ni à la faire relire à son
// client : retirée de toute copie. Ses renvois dans les skills et les README
// qu'une appli reçoit se réécrivent ici.
export const VITRINE_DU_KIT = {
  fichiers: ["src/app/kit/"],
  retraits: [
    // Ses deux pages, ouvertes sans garde (le fichier part avec la brique
    // comptes : sans elle, ces retraits se sautent).
    ligne("tests/gardes-acces.test.ts", '"kit/page.tsx": "la vitrine du kit, sur des données fictives",'),
    ligne(
      "tests/gardes-acces.test.ts",
      '"kit/site-vitrine/page.tsx": "les composants de site vitrine du kit, sur un texte fictif",'
    ),
    // Le README de la brique comptes (parti avec elle, ces retraits se sautent) et
    // la skill de l'interface : sans la vitrine, plus de page de démonstration
    // où vérifier un thème.
    remplace(
      "src/briques/comptes/README.md",
      "qui dit « Session expirée », et `/kit`, sur des données fictives.",
      "qui dit « Session expirée »."
    ),
    ligne(".claude/skills/solstice-ui/SKILL.md", "- Démonstration : `/kit/site-vitrine`, liée depuis `/kit`."),
    bloc(
      ".claude/skills/solstice-ui/SKILL.md",
      "- Vérifier le rendu sur la page vitrine (`/kit`)",
      "  vérification par la personne qui pilote le projet.",
      "- Après thématisation, `npm run build`, puis la personne qui pilote le projet vérifie le rendu sur les écrans\n  de l'appli : ne pas lancer de navigateur pour autant."
    ),
    remplace(".claude/skills/solstice-nouvelle-appli/socle.md", "(l'accueil, `/kit`…)", "(l'accueil…)"),
  ],
};

// La sonde /sante d'une appli sans base : même réponse qu'une appli dont la
// base n'est pas configurée, pour que la CI et l'hébergeur lisent partout la
// même forme.
const SANTE_SANS_BASE = [
  "// Sans la brique données, l'appli n'a pas de base : la sonde répond comme",
  "// une appli dont la base n'est pas configurée.",
  "export async function GET(): Promise<Response> {",
  "  return Response.json(",
  '    { commit: process.env.COMMIT_DEPLOYE || "inconnu", base: "non-configuree" },',
  '    { headers: { "Cache-Control": "no-store" } }',
  "  );",
  "}",
].join("\n");

// La base de données (décision du 2026-10-22 : le socle ne
// suppose ni base ni connexion, un site vitrine s'assemble sans DATABASE_URL).
// Pas une brique au choix : elle est gardée dès qu'une brique gardée la
// déclare dans `exige`, et retirée sinon. Ses fichiers restent où ils sont
// (src/lib/db/…) : les déplacer aurait retouché chaque import de la base.
export const DONNEES = {
  // Les paquets npm que seule la base importe : ils partent de package.json
  // et du verrou avec elle (retirerLesDependances d'outils/assembler.mjs).
  dependances: ["pg", "@types/pg"],
  fichiers: [
    "src/lib/db/client.ts",
    // Le plus grand INTEGER : chaque brique qui le lit exige la base, il part
    // donc avec elle.
    "src/lib/db/bornes.ts",
    "src/lib/db/migrations.ts",
    "src/lib/db/schema.sql",
    "src/lib/db/dossiers.ts",
    // Le SELECT 1 de /sante ; la route, elle, reste au socle.
    "src/lib/db/sante.ts",
    "tests/sante-base.test.ts",
    // Le patron des modules métier (CLAUDE.md §3) : l'appli le copie pour
    // chaque module métier qu'elle écrit, et il lit la base. Ses écrans sont
    // dans PATRON_DOSSIERS.
    "src/lib/dossiers-domaine.ts",
    "src/lib/slug.ts",
    "src/lib/import-fusion.ts",
    "src/lib/cle-rapprochement.ts",
    "scripts/lib/cli.ts",
    "scripts/exemple-import.ts",
    "docker-compose.yml",
    "scripts/bases-locales.ts",
    "scripts/lib/bases-locales.ts",
    ".claude/skills/solstice-donnees/",
    ".claude/agents/relecteur-migrations.md",
    "tests/migrations.test.ts",
    "tests/client-pool.test.ts",
    "tests/client-ssl.test.ts",
    "tests/cli-base-visee.test.ts",
    "tests/import-fusion.test.ts",
    "tests/bases-locales.test.ts",
    "tests/slug.test.ts",
  ],
  retraits: [
    // --- /sante : sans base, la réponse d'une base non configurée, toujours 200
    ligne("src/app/sante/route.ts", 'import { etatDeLaBase } from "@/lib/db/sante";'),
    bloc(
      "src/app/sante/route.ts",
      "export async function GET(): Promise<Response> {\n  const base = await etatDeLaBase();",
      '      headers: { "Cache-Control": "no-store" },\n    }\n  );\n}',
      SANTE_SANS_BASE
    ),
    // Les tests de /sante, des mentions légales et de la confidentialité
    // vérifient qu'ils ne dépendent pas de la base ; sans elle, ces lignes
    // n'ont plus d'objet.
    ligne("tests/sante.test.ts", '  vi.stubEnv("DATABASE_URL", undefined);'),
    bloc("tests/sante.test.ts", '  it("répond de même avec une DATABASE_URL vide', FIN_IT),
    bloc(
      "tests/mentions-legales.test.ts",
      'vi.mock("@/lib/db/client", () => {',
      '  throw new Error("La page des mentions légales importe la base");\n});'
    ),
    bloc(
      "tests/confidentialite.test.ts",
      'vi.mock("@/lib/db/client", () => {',
      '  throw new Error("La page de confidentialité importe la base");\n});'
    ),
    // --- tests : sans base, ni DATABASE_URL exigé ni tests en série
    ligne("vitest.config.ts", 'import fs from "node:fs";'),
    ligne("vitest.config.ts", 'import { estBaseDeTest, nomsDesBases, urlLocale } from "./scripts/lib/bases-locales";'),
    bloc("vitest.config.ts", "/*\n * GARDE ANTI-PROD", "      commandeDesTests()\n  );\n}"),
    bloc("vitest.config.ts", "    // Chaque fichier de test qui interroge la base", "    fileParallelism: false,"),
    // --- CI : ni Postgres ni variables de base
    bloc(".github/workflows/ci.yml", "      - name: Démarrer Postgres", "          IMAGE: postgres:"),
    bloc(".github/workflows/ci.yml", "      - name: Attendre Postgres", "docker logs postgres; exit 1"),
    bloc(".github/workflows/ci.yml", "    env:\n      # Requis par les tests seulement", "      PGSSLMODE: disable"),
    bloc(
      ".github/workflows/ci.yml",
      "        # vitest.config.ts force fileParallelism: false",
      "        # échouerait sur « already exists »."
    ),
    bloc(
      ".github/workflows/ci.yml",
      "        # Vidée exprès : le build doit passer sans base",
      '          DATABASE_URL: ""'
    ),
    // --- variables et fichiers suivis
    bloc(".env.example", "# Base Postgres : en local", "# PGSSLROOTCERT="),
    // --- brique déploiement : ni base payante ni variable qui la vise
    bloc("render.yaml", "      - key: DATABASE_URL", "        value: no-verify"),
    bloc("render.yaml", "databases:", "    ipAllowList: []"),
    bloc("tests/deploiement.test.ts", "  // Le chemin d'un CA, posé seulement", '  PGSSLROOTCERT: "posée au besoin",'),
    bloc(
      "tests/deploiement.test.ts",
      "  // Sans la brique données, l'assembleur du catalogue retire ce cas avec la",
      "    expect(prod).toBe(CI.match(/IMAGE: postgres:(\\d+)/)?.[1]);\n  });"
    ),
    ligne(".gitignore", "!src/lib/db/schema.sql"),
    remplace(
      "tests/gitignore.test.ts",
      'it("laisse passer le modèle des variables et le schéma de la base", () => {\n    expect(cheminsIgnores([".env.example", "src/lib/db/schema.sql"])).toEqual([]);',
      'it("laisse passer le modèle des variables", () => {\n    expect(cheminsIgnores([".env.example"])).toEqual([]);'
    ),
  ],
};

// Les réécritures de toute copie, quelles que soient les briques
// choisies. Le catalogue est publié sous licence MIT, le code d'une appli
// client ne l'est pas : une copie qui dirait « MIT » serait fausse dès le
// premier assemblage (l'avis MIT du code repris du catalogue est dans le
// NOTICE de l'appli, voir avisDeLicence d'outils/assembler.mjs). npm recopie
// la licence à la racine du verrou, d'où le deuxième extrait (le nom et la version le rendent unique, des dépendances
// portent aussi « MIT ») ; il n'y recopie ni la description ni les adresses du
// dépôt. Le nom du paquet change ensuite, par retraitsDuNom.
export const NOM_DU_CATALOGUE = "catalogue-solstice-vibe";

export const RETRAITS_DU_SOCLE = [
  // Les tests de l'assembleur et de l'outil de mise à jour restent au catalogue
  // (EXCLUS_DU_CATALOGUE) : la copie perd ce qui les écarte de npm test, leur
  // script et la ligne de CLAUDE.md qui les lance, qui renverraient à des
  // fichiers qu'elle n'a pas.
  remplace(
    "package.json",
    '"test": "vitest run --exclude tests/assembleur.test.ts --exclude tests/mettre-a-jour.test.ts",\n    "test:assembleur": "vitest run tests/assembleur.test.ts tests/mettre-a-jour.test.ts"',
    '"test": "vitest run"'
  ),
  ligne(
    "CLAUDE.md",
    "DATABASE_URL=<la même> PGSSLMODE=disable npm run test:assembleur   # catalogue : si outils/ ou un extrait qu'il retire change (plus de 10 min ; la CI le lance sur chaque PR)"
  ),
  // La description et les adresses du dépôt public du catalogue : copiées,
  // elles décrivaient l'appli comme le catalogue et envoyaient ses anomalies
  // vers les tickets du catalogue. Elles suivent « version » d'un tenant, ce
  // qui laisse le JSON valide sans toucher aux champs voisins. engines reste :
  // l'appli tourne sur la même CI.
  bloc(
    "package.json",
    '"description": "',
    '"bugs": {\n    "url": "https://github.com/solstice-lab/catalogue-solstice-vibe/issues"\n  },'
  ),
  remplace("package.json", '"license": "MIT"', '"license": "UNLICENSED"'),
  remplace(
    "package-lock.json",
    `"name": "${NOM_DU_CATALOGUE}",\n      "version": "0.1.0",\n      "license": "MIT"`,
    `"name": "${NOM_DU_CATALOGUE}",\n      "version": "0.1.0",\n      "license": "UNLICENSED"`
  ),
];

// Le nom du paquet de l'appli, dans package.json et aux deux endroits où npm
// le recopie dans le verrou. Il nomme aussi ses bases locales
// (scripts/bases-locales.ts) : resté celui du catalogue, deux applis
// assemblées sur un même poste partageaient leurs bases.
export function retraitsDuNom(nomPaquet) {
  return [
    remplace("package.json", `"name": "${NOM_DU_CATALOGUE}",`, `"name": "${nomPaquet}",`),
    remplace("package-lock.json", `{\n  "name": "${NOM_DU_CATALOGUE}",`, `{\n  "name": "${nomPaquet}",`),
    remplace(
      "package-lock.json",
      `"": {\n      "name": "${NOM_DU_CATALOGUE}",`,
      `"": {\n      "name": "${nomPaquet}",`
    ),
  ];
}

// Ce que la blueprint a déjà fait valider au cadrage et que l'appli recopiait à
// la main au premier ticket (essai de tours-de-coloc). Des `remplace` comme les
// autres : un extrait absent ou répété fait échouer l'assemblage au lieu de le
// fausser. Rien de ce qui engage la personne n'y figure : éditeur, courriel des
// droits, bases légales, durées et coordonnées de l'hébergeur se remplissent à
// la mise en ligne, par quelqu'un qui en répond.
//   nomService : le nom donné à l'appli (appli de la blueprint, ou --nom), s'il y
//                en a un ; nomme le service et la base de render.yaml. Un service
//                renommé après la création du Blueprint Render quitte le Blueprint
//                sans message, d'où le renommage dès l'assemblage. Sans nom donné,
//                le nom du dossier de sortie n'est pas un nom de service :
//                render.yaml garde sa valeur de remplacement ;
//   nomAffiche, description, sitePublic : de l'en-tête, s'ils y sont ;
//   hebergeur  : celui de la brique déploiement gardée, s'il y en a une.
// Le nom du site (REFERENCEMENT.nom) lit NOM_APP : une seule source.
export function remplissagesDeLEnTete({ nomService, nomAffiche, description, sitePublic, hebergeur }) {
  const texte = (valeur) => JSON.stringify(valeur);
  return [
    // render.yaml part avec la brique déploiement ; sans elle, ces trois
    // retouches n'ont plus de fichier et l'assembleur les saute.
    ...(nomService === undefined
      ? []
      : [
          remplace("render.yaml", "    name: mon-appli\n", `    name: ${nomService}\n`),
          remplace("render.yaml", "          name: mon-appli-db\n", `          name: ${nomService}-db\n`),
          remplace("render.yaml", "  - name: mon-appli-db\n", `  - name: ${nomService}-db\n`),
        ]),
    ...(nomAffiche === undefined
      ? []
      : [
          remplace(
            "src/lib/navigation.ts",
            'export const NOM_APP = "NOM_APP"; // à remplacer à la mise en route du projet',
            `export const NOM_APP = ${texte(nomAffiche)};`
          ),
        ]),
    ...(description === undefined
      ? []
      : [remplace("src/lib/referencement.ts", '  description: "",\n', `  description: ${texte(description)},\n`)]),
    ...(sitePublic === true
      ? [remplace("src/lib/referencement.ts", "  sitePublic: false,\n", "  sitePublic: true,\n")]
      : []),
    ...(hebergeur === undefined
      ? []
      : [
          remplace(
            "src/lib/mentions-legales.ts",
            '  hebergeur: {\n    nom: "",\n',
            `  hebergeur: {\n    nom: ${texte(hebergeur)},\n`
          ),
        ]),
  ];
}

// Les méthodes de connexion que la blueprint peut déclarer (MethodeDeConnexion
// de src/briques/comptes/methodes.ts, que tests/assembleur.test.ts relit). « demo »
// n'en fait pas partie : elle reste en local, que la blueprint la cite ou non,
// et se retire à la mise en ligne.
export const METHODES_DE_CONNEXION = ["code-email", "lien-email", "google", "microsoft"];

// Ce que src/config/comptes.ts donne sans réponse : 20 personnes par réseau et par
// heure, 30 saisies fausses. Une seule réponse règle les deux limites par IP : la
// seconde est une fois et demie la première, le rapport du défaut (20 et 30). Sur
// un réseau de 100 personnes, 30 saisies fausses par heure se dépasseraient par
// de simples fautes de frappe : la limite doit suivre le nombre de personnes.
export const PERSONNES_PAR_RESEAU_PAR_DEFAUT = 20;

export function limitesParReseau(personnes) {
  return { demandesParHeure: personnes, codesFauxParHeure: Math.ceil(personnes * 1.5) };
}

// L'entrée de l'appli, tranchée au cadrage (essai de tours-de-coloc : l'ouvrir à
// toute adresse a pris un ticket entier). La configuration est celle de la
// brique comptes : l'assembleur n'y ajoute aucune règle, il écrit des valeurs
// que la brique garde (une entrée ouverte ne donne jamais le rôle d'administration :
// refuserUneEntreeOuverteQuiAdministre, et le refus de l'assembleur en amont).
//   ouverte        : `true` ouvre l'entrée à toute adresse ; `false` est le défaut ;
//   roleParDefaut  : le rôle de qui entre sans rôle attribué (ROLE_PAR_DEFAUT) ;
//   methodes       : METHODES, « demo » toujours en dernier ;
//   personnesParReseau : LIMITES_PAR_RESEAU, la réponse à « combien de personnes
//                    au plus se connectent dans la même heure depuis un même
//                    réseau ? » (limitesParReseau en tire les deux limites).
export function remplissagesDeLEntree({ ouverte, roleParDefaut, methodes, personnesParReseau }) {
  return [
    ...(personnesParReseau === undefined || personnesParReseau === PERSONNES_PAR_RESEAU_PAR_DEFAUT
      ? []
      : [
          remplace(
            "src/config/comptes.ts",
            "export const LIMITES_PAR_RESEAU: LimitesParReseau = {\n  demandesParHeure: 20,\n  codesFauxParHeure: 30,\n};",
            `export const LIMITES_PAR_RESEAU: LimitesParReseau = {\n  demandesParHeure: ${personnesParReseau},\n  codesFauxParHeure: ${limitesParReseau(personnesParReseau).codesFauxParHeure},\n};`
          ),
        ]),
    ...(ouverte === true ? [remplace("src/config/comptes.ts", "  ouverte: false,\n", "  ouverte: true,\n")] : []),
    ...(methodes === undefined
      ? []
      : [
          remplace(
            "src/config/comptes.ts",
            'export const METHODES: readonly MethodeDeConnexion[] = ["code-email", "demo"];',
            `export const METHODES: readonly MethodeDeConnexion[] = ${JSON.stringify([...methodes, "demo"]).replaceAll(",", ", ")};`
          ),
        ]),
    ...(roleParDefaut === undefined
      ? []
      : [
          remplace(
            "src/config/acces.ts",
            'export const ROLE_PAR_DEFAUT: Role = "membre";',
            `export const ROLE_PAR_DEFAUT: Role = ${JSON.stringify(roleParDefaut)};`
          ),
        ]),
  ];
}
