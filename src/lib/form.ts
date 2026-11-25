// src/lib/form.ts — the enquiry form's pure validation and submission logic (AAP 0.8.1, 0.8.2, 0.8.3).
//
// `ContactForm.astro` is this module's only consumer. It hands in the values it read from the five
// validated controls and receives field keys back, and the wording those keys resolve to lives in
// `src/content/contact.ts`, so no message sentence is authored here (rule W-1, rule B-4). The
// endpoint arrives as an argument rather than through `src/lib/env.ts`, so no configured value is
// inlined into the island's bundle (rule B-2), and the module touches no DOM, creates no timer and
// performs no request other than the one submission it is asked to send (rule B-1).

import type { FormCopy } from '../content/contact.ts';

/**
 * How long a submission may run before the island aborts it, in milliseconds.
 *
 * Fifteen seconds is fixed by the request (AAP 0.4.4) and is not a tunable. The island arms its own
 * `AbortController` with this value and clears its timer in a `finally`, so this module never creates
 * a timer or a controller; the abort that `AbortSignal` produces arrives here as one of the failures
 * reported as a plain `false`.
 */
export const ABORT_MS = 15_000;

/**
 * The five controls whose values are validated, each named exactly as the control's `name` and `id`
 * attribute spells it.
 *
 * The form renders six labelled controls and submits all of them, but only these five carry a rule:
 * the role and message controls are labelled and sent without one (AAP 0.8.2). The union therefore
 * has no member for either of them, and its members must stay in step with the attributes the
 * controls carry, because `aria-invalid` and `aria-describedby` are wired from these keys.
 */
export type FieldKey = 'name' | 'email' | 'company' | 'sites' | 'consent';

/**
 * A validation message, named by the key it is looked up under in the form's copy.
 *
 * The union is read off `FormCopy['messages']` rather than restated, so `src/content/contact.ts`
 * stays the single owner of the six message strings: renaming or removing one there becomes a
 * compile error here instead of a key that resolves to nothing at runtime. The import is type-only,
 * so it is erased at build time and `src/lib` gains no runtime dependency on `src/content`.
 */
export type MessageKey = keyof FormCopy['messages'];

/**
 * The values one submission attempt is validated against.
 *
 * Every member is a string exactly as its control supplied it — untrimmed, unparsed — except
 * `consent`, which is the checkbox's own checked state. Trimming belongs to the rules below, so the
 * caller never has to decide what a value means before it is validated.
 */
export interface EnquiryValues {
  name: string;
  email: string;
  company: string;
  sites: string;
  consent: boolean;
}

/**
 * One validation failure: the control it belongs to and the copy key that describes it.
 *
 * A failure carries keys and never a sentence, so this module authors no user-visible text (rule
 * W-1) and every message stays editable in the content layer. Failures are returned in the order the
 * form renders its controls, so the first entry is the field focus moves to (rule B-3).
 */
export interface FieldError {
  field: FieldKey;
  messageKey: MessageKey;
}

/**
 * `local@domain.tld`: a local part of letters, digits and the common `_%+-` characters in
 * dot-separated runs, then a domain of dot-separated labels each starting and ending with a letter
 * or digit and a final label of two or more letters.
 *
 * One well-formed address and nothing else, so a space, a comma, a second address or a domain
 * without a dot all fail — which is what makes a pasted list of two addresses invalid rather than
 * silently accepted. It is at least as strict as the pattern the build applies to the configured
 * contact address, so a value accepted here cannot be one a build then rejects.
 */
const EMAIL_PATTERN =
  /^[A-Za-z0-9_%+-]+(?:\.[A-Za-z0-9_%+-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,}$/;

/**
 * A whole number of manufacturing sites: digits only, with no sign, separator, decimal point or
 * exponent. The count is compared against 1 separately, because `0` has this shape and is not a
 * site count.
 */
const SITE_COUNT_PATTERN = /^\d+$/;

/**
 * The message each control reports when its own rule fails, as a copy key.
 *
 * Keys, never sentences: the island looks each one up in the form's copy, and the six strings stay
 * in `src/content/contact.ts` (AAP 0.8.2). One entry is only a default — `email` has two rules and
 * therefore two possible keys, so this holds the empty-field key while `validateFields` reports the
 * separate malformed-address key for a field that was filled.
 */
export const FIELD_MESSAGES: Readonly<Record<FieldKey, MessageKey>> = {
  name: 'nameEmpty',
  email: 'emailEmpty',
  company: 'companyEmpty',
  sites: 'sitesInvalid',
  consent: 'consentMissing',
};

/**
 * Validates one submission attempt, returning every failure in form order and `[]` when the values
 * are complete and well formed.
 *
 * Called once, on submit: there is no validation as the user types, no debounce and no side effect,
 * and the same values always produce the same list (AAP 0.8.2). The checks run in the order the form
 * renders its controls, so a caller can focus the first entry and a user meets the messages in the
 * order they meet the fields (rule B-3). The optional field's rule applies only when it holds
 * something, so leaving the site count blank is valid and filling it wrongly is not.
 */
export function validateFields(values: EnquiryValues): FieldError[] {
  const errors: FieldError[] = [];

  if (values.name.trim() === '') {
    errors.push({ field: 'name', messageKey: FIELD_MESSAGES.name });
  }

  const email = values.email.trim();
  if (email === '') {
    errors.push({ field: 'email', messageKey: FIELD_MESSAGES.email });
  } else if (!EMAIL_PATTERN.test(email)) {
    errors.push({ field: 'email', messageKey: 'emailInvalid' });
  }

  if (values.company.trim() === '') {
    errors.push({ field: 'company', messageKey: FIELD_MESSAGES.company });
  }

  const sites = values.sites.trim();
  if (sites !== '' && (!SITE_COUNT_PATTERN.test(sites) || Number(sites) < 1)) {
    errors.push({ field: 'sites', messageKey: FIELD_MESSAGES.sites });
  }

  if (values.consent !== true) {
    errors.push({ field: 'consent', messageKey: FIELD_MESSAGES.consent });
  }

  return errors;
}

// The honeypot is deliberately absent from this module's surface: the island reads its own hidden
// field and, when it is filled, shows the confirmation without asking this module to send anything.

/**
 * Sends one enquiry to the endpoint it is given and reports whether the endpoint accepted it.
 *
 * `true` means the response carried a success status; anything else — a rejection status, a network
 * failure or the caller's abort — is `false`, and those three are deliberately indistinguishable,
 * because the island shows one error message and keeps the entered values whatever the cause (AAP
 * 0.4.4, rule B-4). The response is judged by its status alone and its body is never read, so no
 * server wording, status number or field name can reach the page.
 *
 * The function never throws and never rejects: every failure is caught and returned as `false`, so a
 * caller has a single outcome to handle. The only header added is the one asking for a JSON answer;
 * the browser supplies the multipart boundary itself. No cookie or auth header accompanies the
 * request, because the endpoint is a public address and the site holds no session (rule W-2).
 */
export async function submitEnquiry(
  endpoint: string,
  formData: FormData,
  signal: AbortSignal,
): Promise<boolean> {
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      body: formData,
      headers: { Accept: 'application/json' },
      signal,
    });
    return response.ok;
  } catch {
    return false;
  }
}
