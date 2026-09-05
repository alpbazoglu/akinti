/**
 * Structured feedback (PRODUCT_V2 §4, "Structured feedback").
 *
 * A comment composer with three optional prompts: what worked, a note on
 * pitch or timing, and one thing to try. The three answers are written into
 * the comment body as three labelled lines, so a structured comment is a real
 * comment everywhere else in the product — searchable, quotable, deletable,
 * and readable by anything that has never heard of this format.
 *
 * `comments` stores a single `body` column, so this is the whole mechanism.
 * There is no hidden field and nothing is dropped: what the writer typed is
 * exactly what the body contains.
 */

export const FEEDBACK_FIELDS = [
  { key: "worked", label: "What worked", placeholder: "The second verse sits right on the beat." },
  { key: "note", label: "Pitch or timing", placeholder: "The chorus runs a little flat." },
  { key: "try", label: "One thing to try", placeholder: "Take the last line down an octave." },
] as const;

export type FeedbackKey = (typeof FEEDBACK_FIELDS)[number]["key"];

export type FeedbackFields = Partial<Record<FeedbackKey, string>>;

export interface FeedbackLine {
  key: FeedbackKey;
  label: string;
  value: string;
}

const LABEL_BY_KEY: Record<FeedbackKey, string> = {
  worked: FEEDBACK_FIELDS[0].label,
  note: FEEDBACK_FIELDS[1].label,
  try: FEEDBACK_FIELDS[2].label,
};

/**
 * Turn the answered prompts into a comment body. Unanswered prompts leave no
 * trace: an empty "One thing to try" is not a line saying nothing.
 */
export function composeFeedback(fields: FeedbackFields): string {
  return FEEDBACK_FIELDS.map(({ key, label }) => {
    const value = (fields[key] ?? "").trim();
    return value.length > 0 ? `${label}: ${value}` : null;
  })
    .filter((line): line is string => line !== null)
    .join("\n");
}

/**
 * Read a body back as structured feedback, or `null` when it is an ordinary
 * comment. Every non-empty line must be one of the three prompts, so a
 * comment that merely happens to start with "What worked: " and then rambles
 * is still shown as prose rather than being reshaped into a form.
 */
export function parseFeedback(body: string): FeedbackLine[] | null {
  const lines = body
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) return null;

  const parsed: FeedbackLine[] = [];
  for (const line of lines) {
    const entry = FEEDBACK_FIELDS.find(({ label }) =>
      line.toLowerCase().startsWith(`${label.toLowerCase()}:`),
    );
    if (!entry) return null;
    const value = line.slice(entry.label.length + 1).trim();
    if (value.length === 0) return null;
    if (parsed.some((item) => item.key === entry.key)) return null;
    parsed.push({ key: entry.key, label: LABEL_BY_KEY[entry.key], value });
  }
  return parsed;
}
