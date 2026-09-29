/** Words of a task text in order, without punctuation. */
export function focusWords(text: string) {
  return text.match(/[\p{L}\p{N}]+(?:[-‐'’][\p{L}\p{N}]+)*/gu) ?? []
}
