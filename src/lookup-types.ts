// Lookup request/result shapes.

export interface LookupRequest {
  /** Selected word or phrase. */
  word: string
  /** Sentence the word appears in. */
  sentence: string
  /** Book language (BCP 47), may be empty. */
  lang?: string
}

export interface LookupResult {
  /** Dictionary form, e.g. "run" for "ran". */
  lemma: string
  /** Part of speech, short Chinese/English abbreviation such as "n." */
  pos: string
  /** Concise Chinese meaning in this context. */
  meaning: string
  /** One-sentence Chinese note on usage/nuance in this sentence; may be empty. */
  note: string
  /** Chinese translation of the whole sentence. */
  translation: string
  /** Irregular verbs only (null otherwise; missing on older cards). */
  forms?: VerbForms | null
}

/** A verb's irregular forms; each is '' where that part is regular. */
export interface VerbForms {
  /** Irregular present-tense person forms, e.g. "du siehst, er sieht". */
  present: string
  /** Simple past (Präteritum) person forms, e.g. "ich/er sah, du sahst, wir/sie sahen, ihr saht". */
  past: string
  /** Present perfect, e.g. "hat gesehen". */
  perfect: string
}

const FORM_LABELS: Array<[keyof VerbForms, string]> = [['present', '现在时'], ['past', '过去式'], ['perfect', '现在完成时']]

/** Non-empty verb forms as [label, value] rows, for the panel, the drawer and the card back. */
export function formRows(f: VerbForms | null | undefined): Array<[string, string]> {
  if (!f) return []
  return FORM_LABELS.filter(([k]) => f[k]).map(([k, label]) => [label, f[k]])
}
