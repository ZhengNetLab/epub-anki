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
  /** IPA or pinyin etc.; empty for phrases where it doesn't apply. */
  phonetic: string
  /** Part of speech, short Chinese/English abbreviation such as "n." */
  pos: string
  /** Concise Chinese meaning in this context. */
  meaning: string
  /** One-sentence Chinese note on usage/nuance in this sentence; may be empty. */
  note: string
  /** Chinese translation of the whole sentence. */
  translation: string
}
