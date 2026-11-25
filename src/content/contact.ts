// src/content/contact.ts — A6's page copy plus every A8 form string (AAP 0.7.2, 0.8.2).
//
// This is the only content module whose strings drive an interactive surface. `ContactForm.astro`
// receives the object below as `copy`, and `src/lib/form.ts` returns field keys that the component
// maps onto `form.messages` — so message wording lives here and never in the logic module.
//
// Nothing configured appears in this file: the form endpoint, the contact address and the live
// flag reach the form as props resolved by `src/lib/env.ts`, never as content, so this module
// stays a leaf that names no host and holds no configured value (Rule B-2, AAP 0.7.2).

import type { HeroCopy, Link, PageMeta } from './global.ts';
import type { FaqItem } from './shared/faq.ts';
import { faq } from './shared/faq.ts';

/**
 * A field's empty-or-invalid message, keyed exactly as `src/lib/form.ts` reports the error.
 *
 * The keys are the contract between the two modules: the logic module returns a key, the component
 * looks it up here, and no message text is duplicated into either of them. Each message is rendered
 * as text beside its own field and never as colour, a border or a tooltip alone (Rule B-3).
 */
export interface FormMessages {
  /** The name field was empty after trimming. */
  nameEmpty: string;
  /** The work-email field was empty. */
  emailEmpty: string;
  /** The work-email field was filled but is not one well-formed address: a local part, an at
   * sign and a dotted domain. */
  emailInvalid: string;
  /** The company field was empty. */
  companyEmpty: string;
  /** The manufacturing-sites field was filled with something other than a whole number of 1 or
   * more. */
  sitesInvalid: string;
  /** The consent checkbox was not ticked. */
  consentMissing: string;
}

/**
 * Every string the enquiry form renders, plus the copy for its non-default states.
 *
 * A label here is the visible, persistent label set above its field and wired to it by
 * `for`/`id`; a placeholder never stands in for one, because a placeholder disappears as soon as
 * the user types and leaves the field without an accessible name (AAP 0.6.4). The field names
 * themselves are not copy and appear nowhere in this module (AAP 0.7.3).
 */
export interface FormCopy {
  /** The six visible labels, in the order the form renders its fields. */
  labels: {
    /** Above the name input. */
    name: string;
    /** Above the work-email input. */
    email: string;
    /** Above the company input. */
    company: string;
    /** Above the manufacturing-sites input. */
    sites: string;
    /** Above the message textarea. */
    message: string;
    /** The consent checkbox's own accessible name, which sits beside the checkbox itself. */
    consent: string;
  };
  /** A supplementary required marker; every required field also carries `required` and `aria-required`. */
  requiredMarker: string;
  /** The consent statement that sits beside the checkbox; `labels.consent` is the checkbox's own name. */
  consentLabel: string;
  /** The privacy page linked from inside the consent statement: same-site, `/privacy`. */
  privacyLink: Link;
  /** The submit button's label in its resting state. */
  submitLabel: string;
  /** The submit button's label while a request is in flight (AAP 0.4.4). */
  sendingLabel: string;
  /** The heading shown in place of the form once a submission succeeds. */
  confirmationHeading: string;
  /** The text shown under that heading. */
  confirmationText: string;
  /**
   * One message for every failure the submission can meet — a non-2xx response, a network error and
   * the 15-second abort alike — shown with the entered values kept. It never describes a response,
   * a status code or a field name, because none of those reaches the user (AAP 0.4.4).
   */
  errorText: string;
  /** The link label used when no endpoint is configured but a contact address is (AAP 0.9.3, Rule W-2). */
  mailtoLabel: string;
  /** The text used when neither an endpoint nor a contact address is configured (AAP 0.9.3). */
  fallbackText: string;
  /** The six validation messages, keyed to the errors `src/lib/form.ts` reports. */
  messages: FormMessages;
}

/**
 * The copy for `/contact`: its metadata, its page top, the enquiry form and the shared questions.
 *
 * There is deliberately no contact-area heading or line, because A6 defines none: the contact row
 * renders the address alone, as a mailto link, and only when a contact address has been configured
 * for the build. That address is a prop, so a second owner of the configured value cannot appear
 * here (AAP 0.7.2).
 */
export interface ContactCopy {
  /** A8's title and description for this page. */
  meta: PageMeta;
  /** A6's top block, carrying the page-top illustration every route uses. */
  hero: HeroCopy;
  /** The enquiry form's copy. */
  form: FormCopy;
  /** The six shared questions, imported rather than copied so the two pages cannot drift. */
  faq: FaqItem[];
}

/**
 * `/contact`'s copy.
 *
 * The content specification that owns A6 and A8 was not available to this build, so every string
 * those sections supply carries the project's placeholder marker rather than invented, borrowed or
 * paraphrased text (AAP 0.7.7); the launch guard refuses to publish a page carrying the marker, so
 * the gap stays visible instead of shipping (AAP 0.9.5, WT-10). The five values the AAP itself
 * fixes are set exactly: the sending label, the mailto label, the fallback text (AAP 0.4.4), the
 * page-top illustration and the privacy link's same-site target.
 */
export const contact: ContactCopy = {
  meta: {
    title: 'TO BE PROVIDED',
    description: 'TO BE PROVIDED',
  },
  hero: {
    heading: 'TO BE PROVIDED',
    text: 'TO BE PROVIDED',
    illustration: 'top',
  },
  form: {
    labels: {
      name: 'TO BE PROVIDED',
      email: 'TO BE PROVIDED',
      company: 'TO BE PROVIDED',
      sites: 'TO BE PROVIDED',
      message: 'TO BE PROVIDED',
      consent: 'TO BE PROVIDED',
    },
    requiredMarker: 'TO BE PROVIDED',
    consentLabel: 'TO BE PROVIDED',
    privacyLink: { label: 'TO BE PROVIDED', href: '/privacy' },
    submitLabel: 'TO BE PROVIDED',
    sendingLabel: 'Sending',
    confirmationHeading: 'TO BE PROVIDED',
    confirmationText: 'TO BE PROVIDED',
    errorText: 'TO BE PROVIDED',
    mailtoLabel: 'Email us',
    fallbackText: 'Contact details to follow',
    messages: {
      nameEmpty: 'TO BE PROVIDED',
      emailEmpty: 'TO BE PROVIDED',
      emailInvalid: 'TO BE PROVIDED',
      companyEmpty: 'TO BE PROVIDED',
      sitesInvalid: 'TO BE PROVIDED',
      consentMissing: 'TO BE PROVIDED',
    },
  },
  faq,
};
