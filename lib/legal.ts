export const legalLocales = ["en", "es", "fr", "pt"] as const;

export type LegalLocale = (typeof legalLocales)[number];
export type LegalKind = "privacy" | "terms";

type LegalSection = {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
};

type LegalDocument = {
  eyebrow: string;
  title: string;
  summary: string;
  updatedLabel: string;
  updatedDate: string;
  sections: LegalSection[];
};

type LegalCopy = {
  home: string;
  homeAria: string;
  privacyLink: string;
  termsLink: string;
  contact: string;
  footer: string;
  documents: Record<LegalKind, LegalDocument>;
};

export function resolveLegalLocale(locale: string): LegalLocale {
  return legalLocales.includes(locale as LegalLocale) ? (locale as LegalLocale) : "en";
}

export const legalCopy: Record<LegalLocale, LegalCopy> = {
  en: {
    home: "Back to the game",
    homeAria: "FootyRush home",
    privacyLink: "Privacy",
    termsLink: "Terms",
    contact: "Contact support",
    footer: "© 2026 FootyRush. All rights reserved.",
    documents: {
      privacy: {
        eyebrow: "Your data",
        title: "Privacy Policy",
        summary: "How FootyRush collects, uses, and protects information when you play or create an account.",
        updatedLabel: "Effective",
        updatedDate: "23 July 2026",
        sections: [
          {
            heading: "1. Information we collect",
            paragraphs: [
              "When you create or use an account, we receive your email address, authentication-provider identifier, and any basic profile details that you choose to share through X or Supabase. We also store the manager ID you select.",
              "We record game information needed to provide FootyRush, such as drafts, squads, match results, season progress, scores, achievements, and leaderboard entries."
            ],
            bullets: [
              "Technical and security information, including a privacy-preserving hash of an IP address for guest-play limits and abuse prevention.",
              "Session data, theme, language, and temporary game progress stored in cookies or local storage on your device.",
              "If you opt in, limited product events such as selected game mode, completed drafts or competitions, broad outcome metrics, and milestone sharing. These events use a random browser identifier and, while signed in, may be linked to your internal FootyRush account ID. They do not contain your email, X profile, posts, raw IP address, player names, or free-form text.",
              "Basic device, browser, performance, and error information supplied by our hosting and error-monitoring services."
            ]
          },
          {
            heading: "2. How we use information",
            bullets: [
              "To authenticate you, maintain your manager profile, and restore saved progress.",
              "To run simulations, calculate scores, publish eligible leaderboard results, and enforce fair-play limits.",
              "To secure, troubleshoot, measure, and improve FootyRush, and to meet legal obligations."
            ]
          },
          {
            heading: "3. When information is shared",
            paragraphs: [
              "We use service providers to operate FootyRush, including Supabase for authentication and database services, Vercel for hosting and analytics, Sentry for error monitoring, and X when you choose X sign-in. They process information under their own terms and privacy notices.",
              "We may disclose information when required by law, to protect players or the service, or as part of a business transfer. We do not sell personal information and do not use it for third-party advertising."
            ]
          },
          {
            heading: "4. Retention and security",
            paragraphs: [
              "We keep account and game records for as long as needed to provide the service, maintain leaderboard integrity, resolve disputes, and meet legal requirements. Guest progress held only on your device remains until you clear it.",
              "We use reasonable technical and organisational safeguards, but no online service can guarantee absolute security."
            ]
          },
          {
            heading: "5. Your choices",
            paragraphs: [
              "You can allow or disable optional gameplay analytics at any time through Data choices in the game footer. You can also sign out, clear local game data through your browser, or disconnect FootyRush in your X account settings. To request access, correction, or deletion of your account data, contact support. We may retain limited records where required for security, leaderboard integrity, or law."
            ]
          },
          {
            heading: "6. Children and international use",
            paragraphs: [
              "FootyRush is not directed to children under 13. Do not use the service if local law does not permit you to consent to this processing. Information may be processed in countries other than your own, with protections required by applicable law."
            ]
          },
          {
            heading: "7. Changes and contact",
            paragraphs: [
              "We may update this policy as FootyRush develops. The effective date above will change when we make material updates. Questions or privacy requests can be sent to support@footyrush.app."
            ]
          }
        ]
      },
      terms: {
        eyebrow: "Playing fair",
        title: "Terms of Use",
        summary: "The rules that apply when you access FootyRush, create an account, or submit a score.",
        updatedLabel: "Effective",
        updatedDate: "22 July 2026",
        sections: [
          {
            heading: "1. Accepting these terms",
            paragraphs: [
              "By accessing or using FootyRush, you agree to these terms and the Privacy Policy. If you do not agree, do not use the service. You must be legally able to enter this agreement where you live."
            ]
          },
          {
            heading: "2. Accounts and sign-in",
            paragraphs: [
              "Keep your account and sign-in methods secure, provide accurate information, and tell us promptly about unauthorised access. You are responsible for activity on your account. X sign-in is also governed by X's terms, and availability of that sign-in method may change."
            ]
          },
          {
            heading: "3. The game and leaderboards",
            paragraphs: [
              "FootyRush is a beta football-management simulation. Match outcomes, ratings, rankings, eligibility checks, and rewards are part of the game and have no cash value. We may correct invalid, duplicated, manipulated, or technically faulty results to protect fair competition.",
              "Historical names and factual references are used to describe the simulation. FootyRush is not endorsed by, sponsored by, or affiliated with any football club, league, player, or governing body."
            ]
          },
          {
            heading: "4. Fair use",
            bullets: [
              "Do not cheat, automate play, exploit bugs, evade limits, manipulate leaderboards, or interfere with other players.",
              "Do not attempt to access another account, probe security, overload the service, or reverse engineer protected parts of FootyRush.",
              "Do not use the service unlawfully or submit harmful, deceptive, abusive, or infringing material."
            ]
          },
          {
            heading: "5. Ownership and feedback",
            paragraphs: [
              "FootyRush and its original software, interface, artwork, branding, and game systems belong to the operator or its licensors. You receive a personal, limited, revocable right to use the service. If you send feedback, you permit us to use it without restriction or payment."
            ]
          },
          {
            heading: "6. Beta availability",
            paragraphs: [
              "The service is provided on an as-available basis. Features and data may change, contain errors, or be interrupted. To the extent allowed by law, we disclaim implied warranties and are not liable for indirect or consequential loss. Nothing in these terms excludes rights or liability that cannot legally be excluded."
            ]
          },
          {
            heading: "7. Suspension, changes, and contact",
            paragraphs: [
              "We may suspend access or remove results when these terms are breached, security is at risk, or the service is discontinued. We may update these terms and will change the effective date for material updates. Questions can be sent to support@footyrush.app."
            ]
          }
        ]
      }
    }
  },
  es: {
    home: "Volver al juego",
    homeAria: "Inicio de FootyRush",
    privacyLink: "Privacidad",
    termsLink: "Términos",
    contact: "Contactar con soporte",
    footer: "© 2026 FootyRush. Todos los derechos reservados.",
    documents: {
      privacy: {
        eyebrow: "Tus datos",
        title: "Política de privacidad",
        summary: "Cómo FootyRush recopila, usa y protege la información cuando juegas o creas una cuenta.",
        updatedLabel: "En vigor desde",
        updatedDate: "23 de julio de 2026",
        sections: [
          {
            heading: "1. Información que recopilamos",
            paragraphs: [
              "Cuando creas o utilizas una cuenta, recibimos tu correo electrónico, el identificador del proveedor de autenticación y los datos básicos de perfil que decidas compartir mediante X o Supabase. También guardamos el ID de mánager que eliges.",
              "Registramos la información de juego necesaria para prestar FootyRush, como drafts, plantillas, resultados, progreso de temporada, puntuaciones, logros y posiciones en las clasificaciones."
            ],
            bullets: [
              "Información técnica y de seguridad, incluido un hash respetuoso con la privacidad de la dirección IP para limitar partidas de invitado y prevenir abusos.",
              "Datos de sesión, tema, idioma y progreso temporal guardados en cookies o almacenamiento local del dispositivo.",
              "Si das tu consentimiento, eventos limitados del producto como el modo elegido, drafts o competiciones completadas, métricas generales de resultados y el uso de compartir hitos. Usan un identificador aleatorio del navegador y, con la sesión iniciada, pueden vincularse al ID interno de tu cuenta FootyRush. No incluyen tu email, perfil o publicaciones de X, IP sin procesar, nombres de jugadores ni texto libre.",
              "Información básica del dispositivo, navegador, rendimiento y errores facilitada por nuestros servicios de alojamiento y monitorización."
            ]
          },
          {
            heading: "2. Cómo usamos la información",
            bullets: [
              "Para autenticarte, mantener tu perfil de mánager y recuperar el progreso guardado.",
              "Para ejecutar simulaciones, calcular puntuaciones, publicar resultados aptos y aplicar límites de juego limpio.",
              "Para proteger, diagnosticar, medir y mejorar FootyRush, y cumplir obligaciones legales."
            ]
          },
          {
            heading: "3. Cuándo compartimos información",
            paragraphs: [
              "Usamos proveedores para operar FootyRush, incluidos Supabase para autenticación y base de datos, Vercel para alojamiento y análisis, Sentry para monitorización de errores y X cuando eliges iniciar sesión con X. Cada uno trata información conforme a sus propios términos y avisos de privacidad.",
              "Podemos divulgar información cuando lo exija la ley, para proteger a jugadores o al servicio, o en una operación empresarial. No vendemos información personal ni la usamos para publicidad de terceros."
            ]
          },
          {
            heading: "4. Conservación y seguridad",
            paragraphs: [
              "Conservamos los datos de cuenta y juego mientras sean necesarios para prestar el servicio, preservar la integridad de las clasificaciones, resolver disputas y cumplir la ley. El progreso de invitado guardado solo en tu dispositivo permanece hasta que lo borres.",
              "Aplicamos medidas técnicas y organizativas razonables, pero ningún servicio en línea puede garantizar una seguridad absoluta."
            ]
          },
          {
            heading: "5. Tus opciones",
            paragraphs: [
              "Puedes permitir o desactivar la analítica opcional del juego en cualquier momento desde Opciones de datos en el pie del juego. También puedes cerrar sesión, borrar los datos locales desde el navegador o desconectar FootyRush en la configuración de X. Para solicitar acceso, corrección o eliminación de tus datos, contacta con soporte. Podemos conservar registros limitados por seguridad, integridad de la clasificación o exigencias legales."
            ]
          },
          {
            heading: "6. Menores y uso internacional",
            paragraphs: [
              "FootyRush no está dirigido a menores de 13 años. No uses el servicio si la legislación local no te permite consentir este tratamiento. La información puede procesarse en países distintos al tuyo con las garantías exigidas por la ley aplicable."
            ]
          },
          {
            heading: "7. Cambios y contacto",
            paragraphs: [
              "Podemos actualizar esta política a medida que FootyRush evoluciona. La fecha anterior cambiará cuando haya modificaciones importantes. Envía preguntas o solicitudes de privacidad a support@footyrush.app."
            ]
          }
        ]
      },
      terms: {
        eyebrow: "Juego limpio",
        title: "Términos de uso",
        summary: "Las reglas aplicables al acceder a FootyRush, crear una cuenta o enviar una puntuación.",
        updatedLabel: "En vigor desde",
        updatedDate: "22 de julio de 2026",
        sections: [
          {
            heading: "1. Aceptación de los términos",
            paragraphs: [
              "Al acceder o usar FootyRush aceptas estos términos y la Política de privacidad. Si no estás de acuerdo, no uses el servicio. Debes tener capacidad legal para aceptar este acuerdo donde vives."
            ]
          },
          {
            heading: "2. Cuentas e inicio de sesión",
            paragraphs: [
              "Protege tu cuenta y tus métodos de acceso, aporta información exacta y avísanos de accesos no autorizados. Eres responsable de la actividad de tu cuenta. El acceso con X también se rige por los términos de X y su disponibilidad puede cambiar."
            ]
          },
          {
            heading: "3. El juego y las clasificaciones",
            paragraphs: [
              "FootyRush es una simulación beta de gestión futbolística. Resultados, valoraciones, rangos, comprobaciones de elegibilidad y recompensas forman parte del juego y no tienen valor monetario. Podemos corregir resultados inválidos, duplicados, manipulados o afectados por fallos técnicos para proteger la competición justa.",
              "Los nombres históricos y referencias objetivas describen la simulación. FootyRush no está respaldado, patrocinado ni afiliado a ningún club, liga, jugador u organismo de fútbol."
            ]
          },
          {
            heading: "4. Uso justo",
            bullets: [
              "No hagas trampas, automatices partidas, explotes errores, eludas límites, manipules clasificaciones ni interfieras con otros jugadores.",
              "No intentes acceder a otra cuenta, probar la seguridad, sobrecargar el servicio ni aplicar ingeniería inversa a partes protegidas.",
              "No uses el servicio de forma ilícita ni envíes material dañino, engañoso, abusivo o que infrinja derechos."
            ]
          },
          {
            heading: "5. Propiedad y comentarios",
            paragraphs: [
              "FootyRush y su software, interfaz, arte, marca y sistemas de juego originales pertenecen al operador o a sus licenciantes. Recibes un derecho personal, limitado y revocable de uso. Si envías comentarios, nos permites utilizarlos sin restricciones ni pago."
            ]
          },
          {
            heading: "6. Disponibilidad beta",
            paragraphs: [
              "El servicio se ofrece según disponibilidad. Sus funciones y datos pueden cambiar, contener errores o interrumpirse. En la medida permitida por la ley, excluimos garantías implícitas y responsabilidad por pérdidas indirectas o consecuentes. Nada limita derechos o responsabilidades que no puedan excluirse legalmente."
            ]
          },
          {
            heading: "7. Suspensión, cambios y contacto",
            paragraphs: [
              "Podemos suspender el acceso o retirar resultados por incumplimiento, riesgo de seguridad o cierre del servicio. Podemos actualizar estos términos y cambiaremos la fecha para modificaciones importantes. Envía preguntas a support@footyrush.app."
            ]
          }
        ]
      }
    }
  },
  fr: {
    home: "Retour au jeu",
    homeAria: "Accueil FootyRush",
    privacyLink: "Confidentialité",
    termsLink: "Conditions",
    contact: "Contacter l’assistance",
    footer: "© 2026 FootyRush. Tous droits réservés.",
    documents: {
      privacy: {
        eyebrow: "Vos données",
        title: "Politique de confidentialité",
        summary: "La manière dont FootyRush collecte, utilise et protège les informations lorsque vous jouez ou créez un compte.",
        updatedLabel: "En vigueur le",
        updatedDate: "23 juillet 2026",
        sections: [
          {
            heading: "1. Informations collectées",
            paragraphs: [
              "Lorsque vous créez ou utilisez un compte, nous recevons votre adresse e-mail, l’identifiant du fournisseur d’authentification et les informations de profil de base que vous choisissez de partager via X ou Supabase. Nous conservons aussi l’identifiant de manager choisi.",
              "Nous enregistrons les informations de jeu nécessaires à FootyRush, notamment les drafts, équipes, résultats, progressions de saison, scores, succès et classements."
            ],
            bullets: [
              "Des informations techniques et de sécurité, dont une empreinte respectueuse de la vie privée de l’adresse IP pour limiter les parties invitées et prévenir les abus.",
              "Les données de session, le thème, la langue et la progression temporaire stockés dans des cookies ou le stockage local de votre appareil.",
              "Si vous y consentez, des événements produit limités tels que le mode choisi, les drafts ou compétitions terminés, des mesures générales de résultat et le partage d’objectifs. Ils utilisent un identifiant de navigateur aléatoire et, lorsque vous êtes connecté, peuvent être liés à l’identifiant interne de votre compte FootyRush. Ils ne contiennent ni e-mail, ni profil ou publication X, ni adresse IP brute, nom de joueur ou texte libre.",
              "Des informations de base sur l’appareil, le navigateur, les performances et les erreurs fournies par nos services d’hébergement et de suivi."
            ]
          },
          {
            heading: "2. Utilisation des informations",
            bullets: [
              "Pour vous authentifier, gérer votre profil de manager et restaurer votre progression.",
              "Pour exécuter les simulations, calculer les scores, publier les résultats admissibles et appliquer les règles de fair-play.",
              "Pour sécuriser, diagnostiquer, mesurer et améliorer FootyRush, et respecter nos obligations légales."
            ]
          },
          {
            heading: "3. Partage des informations",
            paragraphs: [
              "Nous faisons appel à des prestataires pour exploiter FootyRush : Supabase pour l’authentification et la base de données, Vercel pour l’hébergement et l’analyse, Sentry pour le suivi des erreurs, et X lorsque vous choisissez la connexion avec X. Ils traitent les données selon leurs propres conditions et avis de confidentialité.",
              "Nous pouvons divulguer des informations si la loi l’exige, pour protéger les joueurs ou le service, ou dans le cadre d’une opération commerciale. Nous ne vendons pas les données personnelles et ne les utilisons pas pour de la publicité tierce."
            ]
          },
          {
            heading: "4. Conservation et sécurité",
            paragraphs: [
              "Nous conservons les données de compte et de jeu aussi longtemps que nécessaire pour fournir le service, préserver l’intégrité des classements, résoudre les litiges et respecter la loi. La progression invitée enregistrée uniquement sur votre appareil demeure jusqu’à ce que vous l’effaciez.",
              "Nous appliquons des mesures techniques et organisationnelles raisonnables, mais aucun service en ligne ne peut garantir une sécurité absolue."
            ]
          },
          {
            heading: "5. Vos choix",
            paragraphs: [
              "Vous pouvez autoriser ou désactiver à tout moment les statistiques de jeu facultatives depuis Choix des données dans le pied de page du jeu. Vous pouvez aussi vous déconnecter, effacer les données locales depuis votre navigateur ou déconnecter FootyRush dans les réglages X. Pour demander l’accès, la rectification ou la suppression de vos données, contactez l’assistance. Certains éléments peuvent être conservés pour la sécurité, l’intégrité des classements ou la loi."
            ]
          },
          {
            heading: "6. Mineurs et utilisation internationale",
            paragraphs: [
              "FootyRush ne s’adresse pas aux enfants de moins de 13 ans. N’utilisez pas le service si la loi locale ne vous permet pas de consentir à ce traitement. Les informations peuvent être traitées dans d’autres pays avec les garanties exigées par la loi applicable."
            ]
          },
          {
            heading: "7. Modifications et contact",
            paragraphs: [
              "Cette politique peut évoluer avec FootyRush. La date ci-dessus sera modifiée en cas de changement important. Envoyez vos questions ou demandes relatives à la confidentialité à support@footyrush.app."
            ]
          }
        ]
      },
      terms: {
        eyebrow: "Jouer loyalement",
        title: "Conditions d’utilisation",
        summary: "Les règles applicables lorsque vous accédez à FootyRush, créez un compte ou envoyez un score.",
        updatedLabel: "En vigueur le",
        updatedDate: "22 juillet 2026",
        sections: [
          {
            heading: "1. Acceptation",
            paragraphs: [
              "En accédant à FootyRush ou en l’utilisant, vous acceptez ces conditions et la Politique de confidentialité. Si vous refusez, n’utilisez pas le service. Vous devez être légalement en mesure de conclure cet accord dans votre pays."
            ]
          },
          {
            heading: "2. Comptes et connexion",
            paragraphs: [
              "Protégez votre compte et vos moyens de connexion, fournissez des informations exactes et signalez rapidement tout accès non autorisé. Vous êtes responsable de l’activité de votre compte. La connexion avec X est aussi régie par les conditions de X et sa disponibilité peut changer."
            ]
          },
          {
            heading: "3. Jeu et classements",
            paragraphs: [
              "FootyRush est une simulation bêta de gestion footballistique. Résultats, notes, rangs, contrôles d’admissibilité et récompenses font partie du jeu et n’ont aucune valeur monétaire. Nous pouvons corriger les résultats invalides, dupliqués, manipulés ou affectés par un problème technique afin de préserver une compétition équitable.",
              "Les noms historiques et références factuelles servent à décrire la simulation. FootyRush n’est ni approuvé, ni sponsorisé, ni affilié à un club, une ligue, un joueur ou une instance du football."
            ]
          },
          {
            heading: "4. Usage loyal",
            bullets: [
              "Ne trichez pas, n’automatisez pas le jeu, n’exploitez pas de bugs, ne contournez pas les limites et ne manipulez pas les classements.",
              "Ne tentez pas d’accéder à un autre compte, de tester la sécurité, de surcharger le service ou de rétroconcevoir ses parties protégées.",
              "N’utilisez pas le service illégalement et ne soumettez aucun contenu nuisible, trompeur, abusif ou illicite."
            ]
          },
          {
            heading: "5. Propriété et retours",
            paragraphs: [
              "FootyRush, son logiciel original, son interface, ses créations, sa marque et ses systèmes de jeu appartiennent à l’opérateur ou à ses concédants. Vous recevez un droit d’utilisation personnel, limité et révocable. Tout retour transmis peut être utilisé sans restriction ni paiement."
            ]
          },
          {
            heading: "6. Disponibilité de la bêta",
            paragraphs: [
              "Le service est fourni selon sa disponibilité. Ses fonctions et données peuvent changer, contenir des erreurs ou être interrompues. Dans les limites permises par la loi, nous excluons les garanties implicites et la responsabilité pour les pertes indirectes. Rien n’exclut les droits ou responsabilités qui ne peuvent légalement l’être."
            ]
          },
          {
            heading: "7. Suspension, changements et contact",
            paragraphs: [
              "Nous pouvons suspendre un accès ou retirer des résultats en cas de violation, de risque de sécurité ou d’arrêt du service. Nous pouvons modifier ces conditions et changerons la date en cas de mise à jour importante. Envoyez vos questions à support@footyrush.app."
            ]
          }
        ]
      }
    }
  },
  pt: {
    home: "Voltar ao jogo",
    homeAria: "Página inicial do FootyRush",
    privacyLink: "Privacidade",
    termsLink: "Termos",
    contact: "Contactar o suporte",
    footer: "© 2026 FootyRush. Todos os direitos reservados.",
    documents: {
      privacy: {
        eyebrow: "Os seus dados",
        title: "Política de Privacidade",
        summary: "Como o FootyRush recolhe, utiliza e protege informações quando joga ou cria uma conta.",
        updatedLabel: "Em vigor desde",
        updatedDate: "23 de julho de 2026",
        sections: [
          {
            heading: "1. Informações que recolhemos",
            paragraphs: [
              "Quando cria ou utiliza uma conta, recebemos o seu endereço de e-mail, o identificador do fornecedor de autenticação e os dados básicos de perfil que optar por partilhar através do X ou do Supabase. Também guardamos o ID de treinador escolhido.",
              "Registamos as informações de jogo necessárias para disponibilizar o FootyRush, incluindo drafts, plantéis, resultados, progresso da época, pontuações, conquistas e classificações."
            ],
            bullets: [
              "Informações técnicas e de segurança, incluindo um hash da direção IP que preserva a privacidade para limitar jogos de convidados e prevenir abusos.",
              "Dados da sessão, tema, idioma e progresso temporário guardados em cookies ou no armazenamento local do dispositivo.",
              "Se der consentimento, eventos limitados do produto, como o modo escolhido, drafts ou competições concluídos, métricas gerais de resultado e partilha de marcos. Estes usam um identificador aleatório do navegador e, com sessão iniciada, podem ser ligados ao ID interno da sua conta FootyRush. Não incluem email, perfil ou publicações no X, IP em bruto, nomes de jogadores ou texto livre.",
              "Informações básicas sobre o dispositivo, navegador, desempenho e erros fornecidas pelos nossos serviços de alojamento e monitorização."
            ]
          },
          {
            heading: "2. Como utilizamos as informações",
            bullets: [
              "Para o autenticar, manter o seu perfil de treinador e restaurar o progresso guardado.",
              "Para executar simulações, calcular pontuações, publicar resultados elegíveis e aplicar limites de jogo justo.",
              "Para proteger, diagnosticar, medir e melhorar o FootyRush, e cumprir obrigações legais."
            ]
          },
          {
            heading: "3. Quando partilhamos informações",
            paragraphs: [
              "Utilizamos prestadores para operar o FootyRush, incluindo Supabase para autenticação e base de dados, Vercel para alojamento e análise, Sentry para monitorização de erros e X quando escolhe iniciar sessão com X. Estes tratam informações segundo os seus próprios termos e avisos de privacidade.",
              "Podemos divulgar informações quando exigido por lei, para proteger jogadores ou o serviço, ou numa operação empresarial. Não vendemos informações pessoais nem as utilizamos para publicidade de terceiros."
            ]
          },
          {
            heading: "4. Conservação e segurança",
            paragraphs: [
              "Mantemos os registos de conta e jogo durante o período necessário para prestar o serviço, preservar a integridade das classificações, resolver litígios e cumprir a lei. O progresso de convidado guardado apenas no dispositivo permanece até que o apague.",
              "Aplicamos salvaguardas técnicas e organizacionais razoáveis, mas nenhum serviço online pode garantir segurança absoluta."
            ]
          },
          {
            heading: "5. As suas opções",
            paragraphs: [
              "Pode permitir ou desativar a análise opcional do jogo a qualquer momento em Opções de dados no rodapé do jogo. Também pode terminar sessão, apagar dados locais no navegador ou desligar o FootyRush nas definições da sua conta X. Para pedir acesso, correção ou eliminação dos seus dados, contacte o suporte. Podemos conservar registos limitados por motivos de segurança, integridade da classificação ou obrigações legais."
            ]
          },
          {
            heading: "6. Crianças e utilização internacional",
            paragraphs: [
              "O FootyRush não se destina a menores de 13 anos. Não utilize o serviço se a legislação local não lhe permitir consentir neste tratamento. As informações podem ser tratadas noutros países, com as proteções exigidas pela legislação aplicável."
            ]
          },
          {
            heading: "7. Alterações e contacto",
            paragraphs: [
              "Podemos atualizar esta política à medida que o FootyRush evolui. A data acima será alterada quando houver mudanças importantes. Envie perguntas ou pedidos de privacidade para support@footyrush.app."
            ]
          }
        ]
      },
      terms: {
        eyebrow: "Jogo justo",
        title: "Termos de Utilização",
        summary: "As regras aplicáveis ao aceder ao FootyRush, criar uma conta ou enviar uma pontuação.",
        updatedLabel: "Em vigor desde",
        updatedDate: "22 de julho de 2026",
        sections: [
          {
            heading: "1. Aceitação dos termos",
            paragraphs: [
              "Ao aceder ou utilizar o FootyRush, aceita estes termos e a Política de Privacidade. Se não concordar, não utilize o serviço. Tem de possuir capacidade legal para celebrar este acordo no local onde reside."
            ]
          },
          {
            heading: "2. Contas e início de sessão",
            paragraphs: [
              "Proteja a sua conta e os métodos de acesso, forneça informações corretas e informe-nos rapidamente de acessos não autorizados. É responsável pela atividade da sua conta. O início de sessão com X também é regido pelos termos do X e a sua disponibilidade pode mudar."
            ]
          },
          {
            heading: "3. O jogo e as classificações",
            paragraphs: [
              "O FootyRush é uma simulação beta de gestão de futebol. Resultados, avaliações, classificações, verificações de elegibilidade e recompensas fazem parte do jogo e não têm valor monetário. Podemos corrigir resultados inválidos, duplicados, manipulados ou afetados por falhas técnicas para proteger a competição justa.",
              "Os nomes históricos e referências factuais são usados para descrever a simulação. O FootyRush não é apoiado, patrocinado nem afiliado a qualquer clube, liga, jogador ou organismo de futebol."
            ]
          },
          {
            heading: "4. Utilização justa",
            bullets: [
              "Não faça batota, automatize jogos, explore falhas, contorne limites, manipule classificações ou interfira com outros jogadores.",
              "Não tente aceder a outra conta, testar a segurança, sobrecarregar o serviço ou fazer engenharia inversa das partes protegidas do FootyRush.",
              "Não utilize o serviço ilegalmente nem envie material prejudicial, enganador, abusivo ou que viole direitos."
            ]
          },
          {
            heading: "5. Propriedade e comentários",
            paragraphs: [
              "O FootyRush e o seu software, interface, arte, marca e sistemas de jogo originais pertencem ao operador ou aos seus licenciantes. Recebe um direito pessoal, limitado e revogável de utilização. Se enviar comentários, permite-nos utilizá-los sem restrições ou pagamento."
            ]
          },
          {
            heading: "6. Disponibilidade da versão beta",
            paragraphs: [
              "O serviço é fornecido conforme disponível. As funcionalidades e os dados podem mudar, conter erros ou sofrer interrupções. Na medida permitida por lei, excluímos garantias implícitas e responsabilidade por perdas indiretas ou consequenciais. Nada exclui direitos ou responsabilidades que não possam ser legalmente excluídos."
            ]
          },
          {
            heading: "7. Suspensão, alterações e contacto",
            paragraphs: [
              "Podemos suspender o acesso ou remover resultados em caso de violação, risco de segurança ou descontinuação do serviço. Podemos atualizar estes termos e alteraremos a data quando houver mudanças importantes. Envie perguntas para support@footyrush.app."
            ]
          }
        ]
      }
    }
  }
};
