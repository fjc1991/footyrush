export interface ProfileExperienceCopy {
  savedTitle: string;
  savedBody: string;
  choiceSavedTitle: string;
  choiceSavedBody: string;
  saveErrorTitle: string;
  saveErrorBody: string;
  lastSaved: string;
  progress: (count: number, total: number) => string;
  reminderEyebrow: string;
  reminderTitle: string;
  reminderBody: string;
  reminderBenefits: [string, string, string];
  reminderPrivacy: string;
  reminderPrimary: string;
  reminderLater: string;
}

const copy: Record<string, ProfileExperienceCopy> = {
  en: {
    savedTitle: "Preferences saved",
    savedBody: "Your My home profile is up to date.",
    choiceSavedTitle: "Choice saved",
    choiceSavedBody: "Your communication and data choice is up to date.",
    saveErrorTitle: "We could not save that",
    saveErrorBody: "Please check your connection and try again.",
    lastSaved: "Last saved",
    progress: (count, total) => `${count} of ${total} optional details added`,
    reminderEyebrow: "Personalise your game",
    reminderTitle: "Help shape your next season",
    reminderBody: "Tell us what you love so future FootyRush updates can focus on the clubs, players, leagues and modes that matter to you.",
    reminderBenefits: [
      "Smarter club, player and challenge recommendations",
      "Early access to relevant modes and features",
      "Better kits, themes and historical content"
    ],
    reminderPrivacy: "Everything is optional. Your choices never change match odds, and you can clear them at any time.",
    reminderPrimary: "Personalise my game",
    reminderLater: "Maybe next month"
  },
  es: {
    savedTitle: "Preferencias guardadas",
    savedBody: "Tu perfil de Mi inicio está actualizado.",
    choiceSavedTitle: "Elección guardada",
    choiceSavedBody: "Tus preferencias de comunicación y datos están actualizadas.",
    saveErrorTitle: "No pudimos guardarlo",
    saveErrorBody: "Comprueba tu conexión e inténtalo de nuevo.",
    lastSaved: "Último guardado",
    progress: (count, total) => `${count} de ${total} datos opcionales añadidos`,
    reminderEyebrow: "Personaliza tu juego",
    reminderTitle: "Ayuda a dar forma a tu próxima temporada",
    reminderBody: "Cuéntanos qué te gusta para que las próximas novedades de FootyRush se centren en los clubes, jugadores, ligas y modos que te importan.",
    reminderBenefits: [
      "Mejores recomendaciones de clubes, jugadores y retos",
      "Acceso anticipado a modos y funciones relevantes",
      "Mejores equipaciones, temas y contenido histórico"
    ],
    reminderPrivacy: "Todo es opcional. Tus elecciones nunca cambian las probabilidades de los partidos y puedes borrarlas cuando quieras.",
    reminderPrimary: "Personalizar mi juego",
    reminderLater: "Quizá el mes que viene"
  },
  fr: {
    savedTitle: "Préférences enregistrées",
    savedBody: "Votre profil Mon accueil est à jour.",
    choiceSavedTitle: "Choix enregistré",
    choiceSavedBody: "Vos choix de communication et de données sont à jour.",
    saveErrorTitle: "Enregistrement impossible",
    saveErrorBody: "Vérifiez votre connexion puis réessayez.",
    lastSaved: "Dernier enregistrement",
    progress: (count, total) => `${count} informations facultatives sur ${total} ajoutées`,
    reminderEyebrow: "Personnalisez votre jeu",
    reminderTitle: "Façonnez votre prochaine saison",
    reminderBody: "Dites-nous ce que vous aimez afin que les prochaines nouveautés FootyRush privilégient les clubs, joueurs, ligues et modes qui vous intéressent.",
    reminderBenefits: [
      "De meilleures recommandations de clubs, joueurs et défis",
      "Un accès anticipé aux modes et fonctions pertinents",
      "De meilleurs maillots, thèmes et contenus historiques"
    ],
    reminderPrivacy: "Tout est facultatif. Vos choix ne changent jamais les probabilités des matchs et peuvent être effacés à tout moment.",
    reminderPrimary: "Personnaliser mon jeu",
    reminderLater: "Peut-être le mois prochain"
  },
  pt: {
    savedTitle: "Preferências guardadas",
    savedBody: "O teu perfil Minha página está atualizado.",
    choiceSavedTitle: "Escolha guardada",
    choiceSavedBody: "As tuas escolhas de comunicação e dados estão atualizadas.",
    saveErrorTitle: "Não foi possível guardar",
    saveErrorBody: "Verifica a ligação e tenta novamente.",
    lastSaved: "Última gravação",
    progress: (count, total) => `${count} de ${total} detalhes opcionais adicionados`,
    reminderEyebrow: "Personaliza o teu jogo",
    reminderTitle: "Ajuda a moldar a tua próxima época",
    reminderBody: "Diz-nos do que gostas para que as próximas novidades do FootyRush se foquem nos clubes, jogadores, ligas e modos importantes para ti.",
    reminderBenefits: [
      "Melhores recomendações de clubes, jogadores e desafios",
      "Acesso antecipado a modos e funcionalidades relevantes",
      "Melhores equipamentos, temas e conteúdo histórico"
    ],
    reminderPrivacy: "Tudo é opcional. As tuas escolhas nunca alteram as probabilidades dos jogos e podem ser apagadas a qualquer momento.",
    reminderPrimary: "Personalizar o meu jogo",
    reminderLater: "Talvez no próximo mês"
  }
};

export function getProfileExperienceCopy(locale: string): ProfileExperienceCopy {
  return copy[locale.slice(0, 2)] ?? copy.en;
}
