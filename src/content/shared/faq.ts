/**
 * One entry in the site's FAQ accordion.
 *
 * A question must read as a self-contained sentence: the accordion renders it as the disclosure
 * summary, and a screen-reader user hears the question and then the answer with nothing in between.
 * An answer must stand alone as a paragraph for the same reason, so no answer may depend on the
 * wording of the question above it. The array below is the single definition shared by the home page
 * and the contact page; the sovereignty page keeps its own ten questions in its own module and
 * imports this module's type only, never this array.
 */
export interface FaqItem {
  question: string;
  answer: string;
}

/**
 * The site's six FAQ entries, in the order the content specification gives them.
 *
 * Each string is the designated placeholder rather than copy: the content specification holding the
 * questions and answers was not available to this build, so nothing is invented here and no template
 * text is borrowed. The launch guard refuses to let a live build publish a page that carries this
 * marker, which keeps the gap visible to the owner instead of shipping it.
 */
export const faq: FaqItem[] = [
  { question: "TO BE PROVIDED", answer: "TO BE PROVIDED" },
  { question: "TO BE PROVIDED", answer: "TO BE PROVIDED" },
  { question: "TO BE PROVIDED", answer: "TO BE PROVIDED" },
  { question: "TO BE PROVIDED", answer: "TO BE PROVIDED" },
  { question: "TO BE PROVIDED", answer: "TO BE PROVIDED" },
  { question: "TO BE PROVIDED", answer: "TO BE PROVIDED" },
];
