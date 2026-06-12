import { en } from "./en";
import { es } from "./es";
import { fr } from "./fr";
import { pt } from "./pt";

export const dictionaries = { en, es, fr, pt };

export type Locale = keyof typeof dictionaries;

export function getDictionary(locale: string) {
  return dictionaries[(locale as Locale) in dictionaries ? (locale as Locale) : "en"];
}
