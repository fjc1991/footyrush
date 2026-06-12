import type { MatchEvent } from "./types";

function hashPick(str: string, poolSize: number): number {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i);
    h = h >>> 0;
  }
  return h % poolSize;
}

type Pool = string[];

const en: Record<MatchEvent["code"], Pool | ((e: MatchEvent) => string)> = {
  kickoff: [
    "The whistle goes. {home} v {away} is underway.",
    "{home} kick us off here — {away} ready to press from the off.",
    "We are under way. {home} vs {away} — let's see what these squads are made of.",
    "And we're off. Can {away} make an early statement against {home}?",
    "Both sides look sharp in the warm-up. The referee gets things started."
  ],
  chance: [
    "{manager} carve open a route to goal — {player} blazes it over.",
    "Good work from {player} but the keeper was alert.",
    "{player} cuts inside and tries their luck — just wide.",
    "A half-chance for {manager}. {player} couldn't convert from there.",
    "{player} gets a sight of goal and drags it across the face.",
    "The crowd holds its breath — {player} gets the ball but can't find the finish.",
    "{manager} threatening here. {player} links the play nicely but the final ball is lacking."
  ],
  save: [
    "{player} forces a sharp stop. The keeper earns their wages there.",
    "Brilliant from the goalkeeper — {player} must have thought they had it.",
    "{player} rifles one goalward and the keeper parries it away.",
    "What a reflex save! {player} had that going in, surely.",
    "{manager} attack brilliantly — {player} set up the chance perfectly but the keeper was equal to it.",
    "Denied! {player} rattles the shot in and the keeper tips it round the post.",
    "The bar keeps it out after a swerving effort from {player}."
  ],
  goal: [
    "GOAL! {player} slots it home for {manager}. Brilliant finish.",
    "IT'S IN! {player} doesn't miss from there. {manager} ahead!",
    "GOAL! A stunning strike from {player} leaves the keeper rooted.",
    "The net ripples! {player} with a composed finish for {manager}.",
    "GET IN! {player} pokes it through — {manager} take the lead.",
    "SCORE! {player} capitalises on the defensive error — {manager} are celebrating.",
    "GOAL! {player} finds the top corner. Unstoppable. {manager} in front."
  ],
  injury: [
    "{manager} have a real problem. {player} clutches their hamstring.",
    "Play stopped. {player} is down and needs treatment — looks serious.",
    "Oh no. {player} can't continue for {manager}. The physio rushes on.",
    "{player} pulls up sharply — {manager} will need to reshuffle.",
    "Terrible luck. {player} limps off, face like thunder.",
    "That doesn't look good. {player} signals to the bench — they need to come off."
  ],
  substitution: [
    "{player} comes on to replace {off} for {manager}.",
    "The change is made: {off} makes way for {player}.",
    "{manager} react quickly — {player} gets the board and comes on for {off}.",
    "Fresh legs for {manager}. {off} done their bit; {player} takes over.",
    "{off} limps towards the touchline as {player} strips off to come on."
  ],
  red_card: [
    "RED CARD! {player} is off. {manager} down to ten men.",
    "SENT OFF! The referee shows no hesitation — {player} is walking.",
    "{player} sees red after a lunging challenge. {manager} will have to adjust.",
    "Shocking tackle from {player} — straight red. {manager} in serious trouble.",
    "The referee has had enough. {player} is given their marching orders.",
    "Controversy! {player} goes for {manager} — red card shown, no argument."
  ],
  near_miss: [
    "What a near thing! {player} clips the outside of the post.",
    "{player} bends one onto the woodwork — so close for {manager}.",
    "Off the crossbar! {player} curls a peach of a shot — nearly.",
    "The keeper had that covered but {player} still managed to find the frame.",
    "Millimetres! {player}'s effort clips the far post and spins away."
  ],
  half_time: [
    "The referee brings the first half to a close. It's {homeGoals}-{awayGoals} at the break.",
    "Half-time. Managers will have their say — the score reads {homeGoals}-{awayGoals}.",
    "Interval. The players troop off with it level at {homeGoals}-{awayGoals}.",
    "45 minutes gone. Plenty to ponder in the dressing rooms. It stands at {homeGoals}-{awayGoals}."
  ],
  full_time: [
    "Full-time whistle. The final score is {homeGoals}-{awayGoals}.",
    "That's it! A thrilling match ends {homeGoals}-{awayGoals}.",
    "And there it is. The referee blows for time — {homeGoals}-{awayGoals} the final.",
    "Game over. {homeGoals}-{awayGoals}. Points confirmed.",
    "It's all done here. The scoreboard reads {homeGoals}-{awayGoals}."
  ]
};

const es: Record<MatchEvent["code"], Pool | ((e: MatchEvent) => string)> = {
  kickoff: [
    "El árbitro pita. ¡Comienza {home} vs {away}!",
    "¡Arrancamos! {home} frente a {away} en este apasionante duelo.",
    "El silbato suena y el balón empieza a rodar. ¡{home} contra {away}!"
  ],
  chance: [
    "{manager} crea peligro — {player} no logra conectar con el remate.",
    "Gran jugada de {player}, pero el portero estuvo atento.",
    "{player} se va por dentro e intenta el disparo — fuera por poco."
  ],
  save: [
    "¡Parada fenomenal! {player} pensaba que era gol.",
    "El portero vuela y despeja el disparo de {player}.",
    "¡Qué reflejos! {player} no podía creerlo."
  ],
  goal: [
    "¡GOOOOOL! {player} marca para {manager}. ¡Qué definición!",
    "¡GOLAZO! {player} no perdonó desde ahí. {manager} se pone por delante.",
    "¡La red se mueve! {player} con una volea de lujo para {manager}."
  ],
  injury: [
    "{manager} tienen un problema serio. {player} se toca el muslo.",
    "Se detiene el juego. {player} no puede continuar — parece grave.",
    "Mala suerte. {player} pide el cambio, visiblemente dolorido."
  ],
  substitution: [
    "{player} entra al campo en sustitución de {off} para {manager}.",
    "Se produce el cambio: {off} cede su lugar a {player}.",
    "{off} se retira entre aplausos; entra {player} para {manager}."
  ],
  red_card: [
    "¡TARJETA ROJA! {player} se va a los vestuarios. {manager} con diez.",
    "¡Expulsado! El árbitro no dudó — {player} debe abandonar el campo.",
    "Entrada brutal de {player} — roja directa. {manager} en apuros."
  ],
  near_miss: [
    "¡Qué ocasión! {player} golpea el poste.",
    "Al larguero va el disparo de {player}. ¡Por muy poco!",
    "Milímetros de distancia. {player} rozó el gol para {manager}."
  ],
  half_time: [
    "El árbitro pita el descanso. Marcador: {homeGoals}-{awayGoals}.",
    "Descanso. Los técnicos tienen trabajo — {homeGoals}-{awayGoals} al descanso."
  ],
  full_time: [
    "Pitido final. El resultado definitivo es {homeGoals}-{awayGoals}.",
    "¡Termina el partido! {homeGoals}-{awayGoals} en el marcador.",
    "Todo ha concluido. Marcador final: {homeGoals}-{awayGoals}."
  ]
};

const fr: Record<MatchEvent["code"], Pool | ((e: MatchEvent) => string)> = {
  kickoff: [
    "Le coup d'envoi est donné. {home} contre {away}, c'est parti !",
    "L'arbitre siffle — {home} affronte {away} sur cette belle affiche.",
    "Et c'est parti ! {home} vs {away}, les deux équipes se regardent."
  ],
  chance: [
    "{manager} se projettent vers l'avant — {player} ne parvient pas à conclure.",
    "Belle action de {player}, mais le gardien veille au grain.",
    "{player} se retourne et tente sa chance — le cuir passe à côté."
  ],
  save: [
    "Quelle parade ! {player} pensait avoir marqué.",
    "Le gardien s'envole pour repousser la frappe de {player}.",
    "Réflexes impressionnants ! {player} n'en revient pas."
  ],
  goal: [
    "BUUUT ! {player} conclut pour {manager}. Quelle finition !",
    "C'EST DEDANS ! {player} ne rate pas ça. {manager} devant !",
    "Le filet tremble ! {player} d'une frappe superbe pour {manager}."
  ],
  injury: [
    "{manager} ont un problème. {player} se tient la cuisse.",
    "Arrêt de jeu. {player} ne peut pas continuer — ça semble sérieux.",
    "Mauvaise nouvelle. {player} demande à sortir, grimaçant de douleur."
  ],
  substitution: [
    "{player} entre en jeu et remplace {off} pour {manager}.",
    "Le changement est effectué : {off} laisse sa place à {player}.",
    "{off} quitte la pelouse ; {player} entre pour {manager}."
  ],
  red_card: [
    "CARTON ROUGE ! {player} prend sa douche. {manager} réduit à dix.",
    "Expulsé ! L'arbitre ne s'est pas posé de questions pour {player}.",
    "Tacle assassin de {player} — rouge direct. {manager} en grande difficulté."
  ],
  near_miss: [
    "Quelle occasion ! {player} touche le poteau.",
    "La barre transversale repousse le tir de {player}. Si près !",
    "À quelques centimètres ! {player} a bien failli inscrire ce but."
  ],
  half_time: [
    "L'arbitre siffle la pause. Score à la mi-temps : {homeGoals}-{awayGoals}.",
    "Mi-temps. Les coaches vont pouvoir s'exprimer — {homeGoals}-{awayGoals} au tableau."
  ],
  full_time: [
    "Coup de sifflet final. Score définitif : {homeGoals}-{awayGoals}.",
    "C'est terminé ! Le tableau affiche {homeGoals}-{awayGoals}.",
    "Fin du match. Le score final est {homeGoals}-{awayGoals}."
  ]
};

const pt: Record<MatchEvent["code"], Pool | ((e: MatchEvent) => string)> = {
  kickoff: [
    "O árbitro apita! Começa {home} vs {away}!",
    "Bola rolando! {home} enfrenta {away} nesta partida.",
    "E lá vamos nós! {home} contra {away} — que espetáculo nos espera!"
  ],
  chance: [
    "{manager} ameaça — {player} não consegue finalizar.",
    "Boa jogada de {player}, mas o goleiro estava bem posicionado.",
    "{player} entra pela esquerda e chuta — por pouco!"
  ],
  save: [
    "Que defesa incrível! {player} achava que tinha feito o gol.",
    "O goleiro voa e evita o gol de {player}. Sensacional!",
    "Reflexo impressionante! {player} não acreditou naquela defesa."
  ],
  goal: [
    "GOOOOL! {player} marca para {manager}. Que finalização!",
    "GOLAÇO! {player} não desperdiçou. {manager} na frente!",
    "A rede balança! {player} com um chute de placa para {manager}."
  ],
  injury: [
    "{manager} têm um problema sério. {player} segura a coxa.",
    "Jogo parado. {player} não pode continuar — parece grave.",
    "Que azar. {player} pede substituição com dor no rosto."
  ],
  substitution: [
    "{player} entra no lugar de {off} para {manager}.",
    "Mudança feita: {off} abre espaço para {player}.",
    "{off} sai entre aplausos; {player} entra para {manager}."
  ],
  red_card: [
    "CARTÃO VERMELHO! {player} está fora. {manager} com dez.",
    "Expulso! O árbitro não teve dúvidas — {player} vai para o chuveiro.",
    "Entrada dura de {player} — vermelho direto. {manager} em apuros."
  ],
  near_miss: [
    "Que chance! {player} acerta o poste.",
    "Na trave! O chute de {player} por muito pouco não entrou.",
    "Milímetros! {player} quase fez um golaço para {manager}."
  ],
  half_time: [
    "O árbitro apita o intervalo. Placar: {homeGoals}-{awayGoals}.",
    "Intervalo. Tempo para os técnicos falarem — {homeGoals}-{awayGoals}."
  ],
  full_time: [
    "Apito final! Placar definitivo: {homeGoals}-{awayGoals}.",
    "Acabou! O placar mostra {homeGoals}-{awayGoals}.",
    "Fim de jogo. Resultado final: {homeGoals}-{awayGoals}."
  ]
};

const localeMap: Record<string, typeof en> = { en, es, fr, pt };

function resolve(pool: Pool | ((e: MatchEvent) => string), event: MatchEvent): string {
  if (typeof pool === "function") return pool(event);
  const template = pool[hashPick(event.id, pool.length)];
  return template ?? pool[0] ?? "";
}

function fill(template: string, event: MatchEvent): string {
  const home = String(event.params.home ?? "");
  const away = String(event.params.away ?? "");
  const manager = String(event.params.manager ?? "");
  const off = String(event.params.off ?? "");
  const homeGoals = String(event.params.homeGoals ?? "");
  const awayGoals = String(event.params.awayGoals ?? "");
  const player = event.playerName ?? "";
  return template
    .replace(/{home}/g, home)
    .replace(/{away}/g, away)
    .replace(/{manager}/g, manager)
    .replace(/{player}/g, player)
    .replace(/{off}/g, off)
    .replace(/{homeGoals}/g, homeGoals)
    .replace(/{awayGoals}/g, awayGoals);
}

export function renderCommentary(event: MatchEvent, locale = "en"): string {
  const dict = localeMap[locale] ?? en;
  const pool = dict[event.code];
  if (!pool) return fill(resolve(en[event.code] ?? en.chance, event), event);
  return fill(resolve(pool, event), event);
}
