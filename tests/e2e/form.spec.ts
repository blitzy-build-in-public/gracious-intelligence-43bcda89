/**
 * `tests/e2e/form.spec.ts` — WT-07: the enquiry form's three states, its per-field messages, its
 * consent rule, its honeypot, its in-flight, confirmation and error states, its fifteen-second
 * abort, and its network discipline (AAP 0.4.4, 0.8.2, 0.8.3, 0.9.3, 0.13.1).
 *
 * Every case runs in all four browser configurations and asserts the state that configuration
 * really produces, so no case is bypassed: `live` renders the form and runs the submission flows,
 * `mailto` renders the address link alone, and `default` and `screens` render the fallback notice.
 * A case whose full flow needs the form still proves something in the other three: that the state
 * machine issued no request to the enquiry endpoint, which is the invariant that would break first
 * if a form were ever rendered without somewhere to post (AAP 0.9.3, rule W-2).
 *
 * Copy independence. The content specification that owns this page's strings was not available to
 * this build, so the strings may still be the project's placeholder marker (AAP 0.7.7, 0.16.2).
 * Nothing here asserts what the form says. It asserts relations instead: that a label resolves to
 * a control, that a message region is non-empty and belongs to its own field, that the submit's
 * accessible name changes while a request is in flight, that a confirmation region appears and has
 * words in it. The only literals are the plan's own stubbed endpoint, the plan's own example
 * address, the abort window `src/lib/form.ts` exports, and the value `'1'` typed into each text
 * control (rules W-1, B-4).
 *
 * The form's field names are not fixed by the plan, so none is written here: every name, id and
 * control position is read from the DOM at run time, and an ambiguous probe fails with a message
 * naming the page and the ambiguity rather than guessing (rule W-1).
 *
 * Rules honoured here. W-2 — a static build, three states, and one POST target, stubbed. B-1 — the
 * journey may reach the page's own origin and the configured endpoint origin and nothing else, and
 * the endpoint is always intercepted so no third party is ever contacted. B-2 — the two values
 * below are the plan's documented example stubs, not credentials. B-3 — the consent target and the
 * "messages are text, never colour alone" requirement are asserted rather than assumed. B-4 — the
 * confirmation, the error, the address link and the fallback notice are the four designed
 * outcomes and each is asserted where its configuration produces it. W-1 — no template string,
 * field name or place name appears in this file.
 */

import { test, expect } from '@playwright/test';
import type { Locator, Page, Request } from '@playwright/test';

/** The enquiry endpoint the `live` configuration configures, and the only host this file names. */
const ENDPOINT = 'https://forms.example/enquiry';

/** The contact address the `live` and `mailto` configurations configure (AAP 0.13.2). */
const CONTACT_EMAIL = 'hello@site.example';

/** How long a submission may run before the island aborts it, as `src/lib/form.ts` declares it. */
const ABORT_MS = 15_000;

/** The endpoint's origin, derived rather than restated so this file names one address only. */
const ENDPOINT_ORIGIN = new URL(ENDPOINT).origin;

/** The value every visible text control is filled with: non-empty, and a valid site count. */
const TYPED_VALUE = '1';

/**
 * The one well-formed address a valid enquiry carries.
 *
 * The site count accepts {@link TYPED_VALUE}, but the e-mail field has a shape rule of its own
 * (AAP 0.8.2), so it takes an address that satisfies it rather than the number every other field
 * takes. A case that wants the address refused overrides it by the field's own discovered name.
 */
const VALID_EMAIL = 'someone@example.com';

/** Which of the three states each Playwright project's build selects (AAP 0.9.3, 0.13.2). */
const STATE_BY_CONFIGURATION = {
  default: 'fallback',
  mailto: 'mailto',
  live: 'form',
  screens: 'fallback',
} as const;

/** The four browser configurations `playwright.config.ts` declares, in its own order. */
const CONFIGURATIONS = ['default', 'live', 'mailto', 'screens'] as const;

/** One of the four browser configurations. */
type Configuration = (typeof CONFIGURATIONS)[number];

/** One of the three states `/contact` can render. */
type EnquiryState = (typeof STATE_BY_CONFIGURATION)[Configuration];

/** The selector that addresses the form's named controls, in DOM order. */
const CONTROL = 'input[name], textarea[name], select[name]';

/** The project this case is running under, resolved per test from the Playwright project name. */
let configuration: Configuration;

/** The state that project's build selects, so a case can assert the state it actually meets. */
let state: EnquiryState;

test.beforeEach(() => {
  const name = test.info().project.name;
  if (!(CONFIGURATIONS as readonly string[]).includes(name)) {
    throw new Error(
      `form.spec.ts: Playwright project "${name}" is not one of ${CONFIGURATIONS.join(', ')}. The four names are the contract with playwright.config.ts, and a case cannot say which state /contact renders without one of them.`,
    );
  }
  configuration = name as Configuration;
  state = STATE_BY_CONFIGURATION[configuration];
});

/** One named control of the enquiry form, as the DOM describes it. */
interface ControlInfo {
  /** Position among the form's named controls, in DOM order. */
  readonly index: number;
  /** The control's `name` attribute. */
  readonly name: string;
  /** `input`'s type, or the tag name for a textarea or a select. */
  readonly type: string;
  /** Whether the control lays out a box, so a person can reach it. */
  readonly rendered: boolean;
  /** The `placeholder` attribute, or the empty string. */
  readonly placeholder: string;
  /** The visible text of the `<label for>` that names this control, trimmed. */
  readonly labelText: string;
  /** Whether any label resolves to this control at all. */
  readonly hasLabel: boolean;
}

/** What the form's own markup says about its controls, read from the built page. */
interface FormProbe {
  /** The form element. */
  readonly form: Locator;
  /** Its submit control. */
  readonly submit: Locator;
  /** Every named control, in DOM order. */
  readonly controls: readonly ControlInfo[];
  /** A control by its `name` attribute. */
  readonly byName: ReadonlyMap<string, ControlInfo>;
  /** The one `input[type="email"]`. */
  readonly email: ControlInfo;
  /** The one checkbox: the consent control. */
  readonly consent: ControlInfo;
  /** The one named control that lays out no box: the honeypot. */
  readonly honeypot: ControlInfo;
}

/** Counts the requests that reach the enquiry endpoint, so a case can assert on the count. */
interface EndpointTracker {
  /** How many requests have addressed {@link ENDPOINT} so far. */
  count(): number;
}

/** Locates one control of a probed form by its recorded position. */
function controlAt(form: Locator, control: ControlInfo): Locator {
  return form.locator(CONTROL).nth(control.index);
}

/** Starts counting the requests that address the enquiry endpoint on this page. */
function trackEndpoint(page: Page): EndpointTracker {
  let count = 0;
  page.on('request', (request: Request): void => {
    if (request.url() === ENDPOINT) {
      count += 1;
    }
  });
  return { count: (): number => count };
}

/** Fails unless exactly one candidate was found, naming the page and the ambiguity otherwise. */
function singleOrFail(candidates: readonly ControlInfo[], what: string): ControlInfo {
  if (candidates.length !== 1) {
    throw new Error(
      `form.spec.ts: the ${configuration} build's /contact has ${candidates.length} candidates for ${what}, and exactly one is expected. The probe will not guess which one the case means.`,
    );
  }
  return candidates[0];
}

/**
 * Reads the form's controls out of the page and resolves the three the cases depend on.
 *
 * The names, ids and positions are discovered here rather than written down, because the plan
 * fixes the form's behaviour and not its field names. The honeypot is the named control that lays
 * out no box; the e-mail field is the one `input[type="email"]`; the consent control is the one
 * checkbox. Any of those resolving to zero or to more than one candidate is a failure that names
 * the page and the ambiguity, never a fallback guess.
 */
async function probeEnquiryForm(page: Page): Promise<FormProbe> {
  const form = page.locator('[data-enquiry-form]');
  const submit = form.locator('button[type="submit"]');

  const controls = await form.evaluate((element): ControlInfo[] => {
    const named = Array.from(
      element.querySelectorAll<HTMLElement>('input[name], textarea[name], select[name]'),
    );

    return named.map((control, index): ControlInfo => {
      const box = control.getBoundingClientRect();
      const style = window.getComputedStyle(control);
      const id = control.id;
      const label = id === '' ? null : document.querySelector(`label[for="${CSS.escape(id)}"]`);

      return {
        index,
        name: control.getAttribute('name') ?? '',
        type:
          control.tagName === 'INPUT'
            ? (control as HTMLInputElement).type
            : control.tagName.toLowerCase(),
        rendered:
          box.width > 0 &&
          box.height > 0 &&
          style.visibility !== 'hidden' &&
          style.display !== 'none',
        placeholder: control.getAttribute('placeholder') ?? '',
        labelText: (label?.textContent ?? '').trim(),
        hasLabel: label !== null,
      };
    });
  });

  const byName = new Map<string, ControlInfo>();
  for (const control of controls) {
    byName.set(control.name, control);
  }

  return {
    form,
    submit,
    controls,
    byName,
    email: singleOrFail(
      controls.filter((control): boolean => control.type === 'email'),
      'the e-mail field',
    ),
    consent: singleOrFail(
      controls.filter((control): boolean => control.type === 'checkbox'),
      'the consent checkbox',
    ),
    honeypot: singleOrFail(
      controls.filter((control): boolean => !control.rendered),
      'the hidden honeypot',
    ),
  };
}

/**
 * Fills every control a person can reach as a valid enquiry, and returns what was typed.
 *
 * Every visible text control takes {@link TYPED_VALUE}, which is non-empty for each required field
 * and a whole number of at least one for the optional site count, except the e-mail field, which
 * takes {@link VALID_EMAIL} because it has a shape rule of its own (AAP 0.8.2). Overrides replace
 * one field's value by its discovered name, which is how a case makes exactly one thing wrong. The
 * honeypot is left untouched here because it is not reachable; a case that wants a bot's submission
 * sets it itself.
 */
async function fillValidEnquiry(
  probe: FormProbe,
  options: { readonly overrides?: Readonly<Record<string, string>>; readonly consent?: boolean } = {},
): Promise<ReadonlyMap<string, string>> {
  const typed = new Map<string, string>();
  const overrides = options.overrides ?? {};

  for (const control of probe.controls) {
    if (!control.rendered) {
      continue;
    }

    const locator = controlAt(probe.form, control);

    if (control.type === 'checkbox') {
      if (options.consent !== false) {
        await locator.check();
      }
      continue;
    }

    const value = overrides[control.name] ?? (control.type === 'email' ? VALID_EMAIL : TYPED_VALUE);
    await locator.fill(value);
    typed.set(control.name, value);
  }

  return typed;
}

/**
 * The page's enquiry region: the section in `main` that is neither the page top nor the questions.
 *
 * The three states render in that middle region — the form block, the address link or the fallback
 * notice — so a case can address it without a string and without depending on which one is there.
 */
function enquiryRegion(page: Page): Locator {
  return page
    .locator('main > section')
    .filter({ hasNot: page.locator('h1') })
    .filter({ hasNot: page.locator('[data-faq-item]') });
}

/** The address link to the configured contact address, anywhere in the document. */
function contactLinks(page: Page): Locator {
  return page.locator(`a[href="mailto:${CONTACT_EMAIL}"]`);
}

/**
 * Asserts the state a configuration that does not render the form is supposed to show, and that no
 * form exists to post from.
 *
 * `mailto` shows the address link and the same address in the footer; `default` and `screens` show
 * the fallback notice and no address link anywhere. Both are designed states of the same machine,
 * so a case whose flow needs the form still proves this one rather than standing down (AAP 0.9.3,
 * rule B-4).
 */
async function expectAlternativeState(page: Page): Promise<void> {
  await expect(page.locator('[data-enquiry-form]')).toHaveCount(0);
  await expect(page.locator('[data-enquiry-block]')).toHaveCount(0);

  if (state === 'mailto') {
    const link = contactLinks(page).first();
    await expect(link).toBeVisible();
    await expect(link).toHaveText(/\S/);

    const footerAddress = page.locator(`footer a[href="mailto:${CONTACT_EMAIL}"]`).first();
    await expect(footerAddress).toBeVisible();
    await expect(footerAddress).toHaveText(CONTACT_EMAIL);
    return;
  }

  await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0);

  const region = enquiryRegion(page).first();
  await expect(region).toBeVisible();
  await expect(region).toHaveText(/\S/);
}

/**
 * The invariant every case keeps in the three configurations that render no form: the designed
 * alternative is on the page and nothing was sent to the enquiry endpoint.
 */
async function expectNoFormAndNoRequest(page: Page, endpoint: EndpointTracker): Promise<void> {
  await expectAlternativeState(page);
  expect(
    endpoint.count(),
    `the ${configuration} build renders no enquiry form, so no request may reach the enquiry endpoint`,
  ).toBe(0);
}

test('[WT-07] the contact page renders the state its configuration selects — default | mailto | live | screens', async ({
  page,
}) => {
  const endpoint = trackEndpoint(page);
  await page.goto('/contact');

  if (state !== 'form') {
    await expectNoFormAndNoRequest(page, endpoint);
    return;
  }

  await expect(page.locator('[data-enquiry-form]')).toHaveCount(1);
  await expect(page.locator('[data-enquiry-block]')).toHaveCount(1);
  await expect(page.locator('[data-enquiry-form]')).toBeVisible();

  const probe = await probeEnquiryForm(page);

  /*
   * Every label names a control that exists, and its text is not empty. A label pointing at an id
   * the markup dropped leaves its control with no accessible name, which is the defect this
   * asserts against rather than any particular wording (AAP 0.6.4, rule B-3).
   */
  const labels = await page.evaluate(() =>
    Array.from(document.querySelectorAll('label[for]')).map((label) => {
      const target = label.getAttribute('for') ?? '';
      return {
        target,
        resolves: target !== '' && document.getElementById(target) !== null,
        text: (label.textContent ?? '').trim(),
      };
    }),
  );

  expect(labels.length, 'the form state must label its controls').toBeGreaterThan(0);
  for (const label of labels) {
    expect(label.resolves, `the label for "${label.target}" must resolve to a control`).toBe(true);
    expect(label.text.length, `the label for "${label.target}" must carry words`).toBeGreaterThan(0);
  }

  for (const control of probe.controls) {
    if (!control.rendered) {
      continue;
    }
    expect(
      control.hasLabel && control.labelText.length > 0,
      control.placeholder === ''
        ? `control "${control.name}" must be named by a visible label`
        : `control "${control.name}" carries a placeholder, and a placeholder may never be its only label (AAP 0.6.4)`,
    ).toBe(true);
  }

  await expect(page.locator('[data-enquiry-form] input[type="email"]')).toHaveCount(1);
  await expect(page.locator('[data-enquiry-form] input[type="checkbox"]')).toHaveCount(1);
  expect(
    probe.controls.filter((control): boolean => !control.rendered).length,
    'exactly one hidden honeypot, and no second control a person cannot reach',
  ).toBe(1);
  await expect(controlAt(probe.form, probe.honeypot)).toBeHidden();

  /*
   * The consent control meets WCAG 2.2's 24 by 24 target. The design reference draws no checkbox,
   * so the box is a state this file has to check rather than inherit (AAP 0.6.4, rule B-3).
   */
  const consentBox = await controlAt(probe.form, probe.consent).boundingBox();
  expect(consentBox, 'the consent control must lay out a box').not.toBeNull();
  expect(consentBox?.width ?? 0, 'the consent control must be at least 24 CSS px wide').toBeGreaterThanOrEqual(24);
  expect(consentBox?.height ?? 0, 'the consent control must be at least 24 CSS px tall').toBeGreaterThanOrEqual(24);

  await expect(probe.submit).toBeEnabled();
  expect(endpoint.count(), 'loading /contact must not post anything').toBe(0);
});

test('[WT-07] an empty submit reports a message beside each invalid field, focuses the first one, and sends nothing — default | mailto | live | screens', async ({
  page,
}) => {
  const endpoint = trackEndpoint(page);
  await page.goto('/contact');

  if (state !== 'form') {
    await expectNoFormAndNoRequest(page, endpoint);
    return;
  }

  const probe = await probeEnquiryForm(page);
  await probe.submit.click();

  await expect
    .poll(async () => probe.form.locator('[aria-invalid="true"]').count(), {
      message: 'submitting an empty form must mark every field whose rule failed as invalid',
    })
    .toBeGreaterThanOrEqual(2);

  /*
   * Each invalid control is described by its own message region, that region is rendered, it has
   * words, and it lives in the same group as its control and no other invalid control.
   *
   * The messages are compared by the region each field points at rather than by their text,
   * because the content layer this build was given still carries one placeholder marker for every
   * message, so two correct messages read identically today. What has to hold whatever the copy is
   * is that a field owns a region of its own instead of every field sharing one generic sentence,
   * which is exactly the defect a text comparison would be used to catch.
   */
  const invalid = await probe.form.evaluate((element) => {
    const controls = Array.from(element.querySelectorAll<HTMLElement>('[aria-invalid="true"]'));

    return controls.map((control) => {
      const describedBy = control.getAttribute('aria-describedby') ?? '';
      const message =
        describedBy === '' ? null : element.querySelector<HTMLElement>(`[id="${describedBy}"]`);

      let group: HTMLElement | null = control.parentElement;
      while (group !== null && (message === null || !group.contains(message))) {
        group = group.parentElement;
      }

      return {
        name: control.getAttribute('name') ?? '',
        describedBy,
        messageText: (message?.textContent ?? '').trim(),
        messageRendered: message !== null && message.getBoundingClientRect().height > 0,
        groupInvalidCount:
          group === null ? 0 : group.querySelectorAll('[aria-invalid="true"]').length,
        title: control.getAttribute('title') ?? '',
      };
    });
  });

  const regions = new Set<string>();

  for (const field of invalid) {
    expect(
      field.describedBy.length,
      `the invalid field "${field.name}" must be described by a message element`,
    ).toBeGreaterThan(0);
    expect(
      field.messageRendered,
      `the message for "${field.name}" must be rendered beside its field, never only in a title`,
    ).toBe(true);
    expect(
      field.messageText.length,
      `the message for "${field.name}" must carry words, so it never rests on colour alone (rule B-3)`,
    ).toBeGreaterThan(0);
    expect(
      field.groupInvalidCount,
      `the message for "${field.name}" must sit with its own field alone, not in a block shared with another invalid field`,
    ).toBe(1);
    expect(
      field.title,
      `the invalid field "${field.name}" must not deliver its message through a title attribute`,
    ).toBe('');

    regions.add(field.describedBy);
  }

  expect(
    regions.size,
    'each invalid field must own its own message region, so no single message can stand in for all of them',
  ).toBe(invalid.length);

  /*
   * Focus moves to the first field whose rule failed, in the order the form renders its controls,
   * so a keyboard or screen-reader user is taken to the first thing to fix (rule B-3).
   */
  const focus = await probe.form.evaluate((element) => {
    const first = element.querySelector('[aria-invalid="true"]');
    const active = document.activeElement;
    return {
      firstInvalidName: first?.getAttribute('name') ?? '',
      focusedName: active?.getAttribute('name') ?? '',
      focusedInsideForm: active !== null && element.contains(active),
    };
  });

  expect(focus.focusedInsideForm, 'focus must move into the form after a refused submit').toBe(true);
  expect(
    focus.focusedName,
    'focus must land on the first field that failed, not on the submit or nowhere',
  ).toBe(focus.firstInvalidName);

  await expect(probe.form.locator('[data-enquiry-error]')).toBeHidden();
  expect(endpoint.count(), 'a submission whose fields failed must not be sent').toBe(0);
});

test('[WT-07] a malformed address is refused at the e-mail field and a corrected one is sent — default | mailto | live | screens', async ({
  page,
}) => {
  const endpoint = trackEndpoint(page);
  await page.goto('/contact');

  if (state !== 'form') {
    await expectNoFormAndNoRequest(page, endpoint);
    return;
  }

  const probe = await probeEnquiryForm(page);
  await fillValidEnquiry(probe, { overrides: { [probe.email.name]: 'not-an-email' } });

  const emailControl = controlAt(probe.form, probe.email);
  await probe.submit.click();

  await expect(emailControl).toHaveAttribute('aria-invalid', 'true');
  await expect(emailControl).toBeFocused();

  const describedBy = await emailControl.getAttribute('aria-describedby');
  expect(describedBy, 'the refused e-mail field must point at its own message').not.toBeNull();

  const message = probe.form.locator(`[id="${describedBy ?? ''}"]`);
  await expect(message).toBeVisible();
  await expect(message).toHaveText(/\S/);
  expect(endpoint.count(), 'a malformed address must not be sent').toBe(0);

  await page.route(ENDPOINT, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }),
  );

  await emailControl.fill(VALID_EMAIL);
  await Promise.all([page.waitForRequest(ENDPOINT), probe.submit.click()]);

  expect(endpoint.count(), 'a corrected enquiry must reach the endpoint exactly once').toBe(1);
  await expect(page.locator('[data-enquiry-confirmation]')).toBeVisible();
  await expect(page.locator('[data-enquiry-confirmation]')).toHaveText(/\S/);
});

test('[WT-07] the consent box is required before anything is sent — default | mailto | live | screens', async ({
  page,
}) => {
  const endpoint = trackEndpoint(page);
  await page.goto('/contact');

  if (state !== 'form') {
    await expectNoFormAndNoRequest(page, endpoint);
    return;
  }

  const probe = await probeEnquiryForm(page);
  await fillValidEnquiry(probe, { consent: false });

  const consentControl = controlAt(probe.form, probe.consent);
  await probe.submit.click();

  await expect(consentControl).toHaveAttribute('aria-invalid', 'true');
  await expect(consentControl).toBeFocused();
  await expect(probe.form.locator('[aria-invalid="true"]')).toHaveCount(1);

  const describedBy = await consentControl.getAttribute('aria-describedby');
  expect(describedBy, 'the unticked consent box must point at its own message').not.toBeNull();

  const message = probe.form.locator(`[id="${describedBy ?? ''}"]`);
  await expect(message).toBeVisible();
  await expect(message).toHaveText(/\S/);
  await expect(message).toHaveAttribute('role', 'alert');
  expect(endpoint.count(), 'an enquiry without consent must not be sent').toBe(0);

  await page.route(ENDPOINT, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }),
  );

  await consentControl.check();
  await Promise.all([page.waitForRequest(ENDPOINT), probe.submit.click()]);

  expect(endpoint.count(), 'the same enquiry with consent must reach the endpoint exactly once').toBe(1);
});

test('[WT-07] a filled honeypot sends nothing and still shows the confirmation — default | mailto | live | screens', async ({
  page,
}) => {
  const endpoint = trackEndpoint(page);
  await page.goto('/contact');

  if (state !== 'form') {
    await expectNoFormAndNoRequest(page, endpoint);
    return;
  }

  const probe = await probeEnquiryForm(page);
  await fillValidEnquiry(probe);

  /*
   * A bot fills every field the markup names, including the one a person cannot reach. Its value is
   * set on the element rather than typed, because the control is deliberately not reachable by any
   * action a user could take (AAP 0.4.4).
   */
  await controlAt(probe.form, probe.honeypot).evaluate((element) => {
    (element as HTMLInputElement).value = 'bot';
  });

  await probe.submit.click();

  const confirmation = page.locator('[data-enquiry-confirmation]');
  await expect(confirmation).toBeVisible();
  await expect(confirmation).toHaveText(/\S/);
  await expect(probe.form).toBeHidden();
  expect(
    endpoint.count(),
    'a submission that fills the honeypot must be shown the confirmation and never sent, so a bot learns nothing',
  ).toBe(0);
});

test('[WT-07] an accepted submission posts the whole form and replaces the form with the confirmation — default | mailto | live | screens', async ({
  page,
}) => {
  const endpoint = trackEndpoint(page);
  await page.goto('/contact');

  if (state !== 'form') {
    await expectNoFormAndNoRequest(page, endpoint);
    await expect(page.locator('[data-enquiry-confirmation]')).toBeHidden();
    return;
  }

  const probe = await probeEnquiryForm(page);

  const restingName = (await probe.submit.textContent())?.trim() ?? '';

  /*
   * The response is held until the in-flight state has been asserted, so the case observes what a
   * visitor sees while the request is out — the submit out of service and saying what it is doing —
   * rather than racing a fulfilled response (AAP 0.4.4).
   */
  const gate: { release: () => void } = { release: () => {} };
  const held = new Promise<void>((resolve) => {
    gate.release = resolve;
  });

  await page.route(ENDPOINT, async (route) => {
    await held;
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });

  await fillValidEnquiry(probe);

  const inFlight = page.waitForRequest(ENDPOINT);
  await probe.submit.click();
  const request = await inFlight;

  await expect(probe.submit, 'the submit must be out of service while a request is in flight').toBeDisabled();
  await expect(probe.submit).toHaveAttribute('aria-busy', 'true');

  const busyName = (await probe.submit.textContent())?.trim() ?? '';
  expect(
    busyName,
    'the submit must say what it is doing while a request is in flight, so its accessible name changes',
  ).not.toBe(restingName);

  gate.release();

  expect(request.method(), 'the enquiry must be a POST').toBe('POST');

  const headers = request.headers();
  expect(
    headers['accept'] ?? '',
    'the POST must ask the endpoint for a JSON answer (AAP 0.8.3)',
  ).toContain('application/json');
  expect(
    headers['content-type'] ?? '',
    'the body must be multipart form data, whose boundary the browser supplies',
  ).toMatch(/^multipart\/form-data; boundary=/);

  const body = request.postDataBuffer();
  if (body === null) {
    throw new Error(
      'form.spec.ts: the accepted submission carried no readable request body, so the multipart field set cannot be checked. The body is the point of this case, and the assertion is never stood down.',
    );
  }

  const posted = body.toString('utf8');
  for (const control of probe.controls) {
    expect(
      posted,
      `the multipart body must carry the "${control.name}" field the form names`,
    ).toContain(`name="${control.name}"`);
  }
  expect(
    posted,
    'the honeypot must be submitted with the rest of the form, or a server could not tell a bot from a person',
  ).toContain(`name="${probe.honeypot.name}"`);

  const confirmation = page.locator('[data-enquiry-confirmation]');
  await expect(confirmation).toBeVisible();
  await expect(confirmation).toHaveText(/\S/);
  await expect(probe.form).toBeHidden();
  expect(endpoint.count(), 'one accepted submission is one request').toBe(1);
});

test('[WT-07] a rejected submission shows the error, keeps every value, restores the submit and publishes nothing about the response — default | mailto | live | screens', async ({
  page,
}) => {
  const endpoint = trackEndpoint(page);
  await page.goto('/contact');

  if (state !== 'form') {
    await expectNoFormAndNoRequest(page, endpoint);
    return;
  }

  const probe = await probeEnquiryForm(page);

  /* The response carries a sentinel and a server field name, neither of which may reach the page. */
  const sentinel = 'server-error-body-4c1f9a';
  const serverField = 'card_number';
  await page.route(ENDPOINT, (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: sentinel, field: serverField } }),
    }),
  );

  const typed = await fillValidEnquiry(probe);
  await probe.submit.click();

  const errorRegion = probe.form.locator('[data-enquiry-error]');
  await expect(errorRegion).toBeVisible();
  await expect(errorRegion).toHaveText(/\S/);

  for (const [name, value] of typed) {
    const control = probe.byName.get(name);
    expect(control, `the rejected submission was typed into "${name}", which must still exist`).toBeDefined();
    if (control === undefined) {
      continue;
    }
    await expect(
      controlAt(probe.form, control),
      `the value typed into "${name}" must survive a rejected submission`,
    ).toHaveValue(value);
  }

  await expect(probe.submit, 'the submit must come back into service after a failure').toBeEnabled();
  await expect(probe.form).toBeVisible();
  await expect(
    contactLinks(page).first(),
    'a configured address follows a failed submission, so the enquiry is never a dead end (rule B-4)',
  ).toBeVisible();

  const published = await page.content();
  expect(published, 'no response body may reach the page').not.toContain(sentinel);
  expect(published, 'no field name from the response may reach the page').not.toContain(serverField);
  expect(endpoint.count(), 'one rejected submission is one request').toBe(1);
});

test('[WT-07] a submission that outruns the abort window ends in the same error state with its values kept — default | mailto | live | screens', async ({
  page,
}) => {
  /* The abort window is fifteen seconds, so this case needs room beyond Playwright's default. */
  test.setTimeout(60_000);

  const endpoint = trackEndpoint(page);
  await page.goto('/contact');

  if (state !== 'form') {
    await expectNoFormAndNoRequest(page, endpoint);
    return;
  }

  const probe = await probeEnquiryForm(page);

  /*
   * The route handler never answers, which is the only way to observe the abort: the island's own
   * controller fires at ABORT_MS and the request is abandoned from the page's side.
   */
  await page.route(ENDPOINT, () => new Promise<void>(() => {}));

  const typed = await fillValidEnquiry(probe);
  const startedAt = Date.now();
  await probe.submit.click();

  const errorRegion = probe.form.locator('[data-enquiry-error]');
  await expect(errorRegion).toBeVisible({ timeout: 20_000 });
  await expect(errorRegion).toHaveText(/\S/);

  const elapsed = Date.now() - startedAt;
  expect(
    elapsed,
    'the abort must be the fifteen-second window the plan fixes, not an earlier or a later failure',
  ).toBeGreaterThanOrEqual(ABORT_MS - 500);

  for (const [name, value] of typed) {
    const control = probe.byName.get(name);
    expect(control, `the aborted submission was typed into "${name}", which must still exist`).toBeDefined();
    if (control === undefined) {
      continue;
    }
    await expect(
      controlAt(probe.form, control),
      `the value typed into "${name}" must survive the abort`,
    ).toHaveValue(value);
  }

  await expect(probe.submit, 'the submit must come back into service after the abort').toBeEnabled();
  await expect(page.locator('[data-enquiry-confirmation]')).toBeHidden();
});

test('[WT-07] no request leaves the page for any host but its own and the configured endpoint — default | mailto | live | screens', async ({
  page,
}) => {
  const seen: string[] = [];
  page.on('request', (request: Request): void => {
    seen.push(request.url());
  });

  await page.goto('/contact');

  const ownOrigin = new URL(page.url()).origin;

  if (state === 'form') {
    const probe = await probeEnquiryForm(page);
    await page.route(ENDPOINT, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }),
    );
    await fillValidEnquiry(probe);
    await Promise.all([page.waitForRequest(ENDPOINT), probe.submit.click()]);
  }

  const origins = new Set<string>();
  for (const url of seen) {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      continue;
    }
    origins.add(parsed.origin);
  }

  const offenders = [...origins].filter(
    (origin): boolean => origin !== ownOrigin && origin !== ENDPOINT_ORIGIN,
  );

  expect(
    offenders,
    'the page may reach its own origin and the configured enquiry endpoint and no other host (rule B-1)',
  ).toEqual([]);
  expect(origins.has(ownOrigin), 'the journey must load the page itself').toBe(true);
  expect(seen.length, 'the journey must have made some requests to be worth asserting on').toBeGreaterThan(0);

  if (state === 'form') {
    expect(
      origins.has(ENDPOINT_ORIGIN),
      'the accepted submission must have gone to the configured endpoint and nowhere else',
    ).toBe(true);
  }
});
