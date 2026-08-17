import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const plan = JSON.parse(await readFile(path.join(root, "data/plan.json"), "utf8"));
const broker = JSON.parse(await readFile(path.join(root, "data/broker.json"), "utf8"));
const controls = JSON.parse(
  await readFile(path.join(root, "data/content-controls.json"), "utf8"),
);

function controlledHttpsUrl(raw, { trailingSlash = false } = {}) {
  const parsed = new URL(raw);
  if (
    parsed.protocol !== "https:" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.search !== "" ||
    parsed.hash !== ""
  ) {
    throw new Error(`Controlled HTTPS URL is invalid: ${raw}`);
  }
  if (trailingSlash && !parsed.pathname.endsWith("/")) parsed.pathname += "/";
  return parsed.toString();
}

const baseUrl = controlledHttpsUrl(
  process.env.FXD_SITE_URL ?? "https://preview.invalid/",
  { trailingSlash: true },
);
const applicationEndpoint = process.env.FXD_APPLICATION_ENDPOINT
  ? controlledHttpsUrl(process.env.FXD_APPLICATION_ENDPOINT)
  : "";
const applicationEndpointOrigin = applicationEndpoint
  ? new URL(applicationEndpoint).origin
  : "";
const contact = "fx_dream@flh.works";
const termsVersion = "FXD-APPLICATION-TERMS-20260818-v3";
const privacyVersion = "FXD-APPLICATION-PRIVACY-20260818-v2";

if (
  plan.plans.length !== 2 ||
  plan.plans[0].name !== "PRO SYSTEM" ||
  plan.plans[0].contract_base_price_jpy !== 1_000_000 ||
  plan.plans[1].name !== "PRIVATE IMPLEMENTATION" ||
  plan.plans[1].contract_base_price_jpy !== 2_000_000 ||
  plan.difference_rule !== "SUPPORT_ONLY" ||
  [
    "purchase_enabled",
    "quote_enabled",
    "payment_enabled",
    "contract_enabled",
    "delivery_enabled",
    "guarantee_activation_enabled",
    "public_permission",
  ].some((key) => plan[key] !== false)
) {
  throw new Error("Controlled plan object is invalid");
}

if (
  broker.registration_url !== "https://my.traders-trust.com/ja/links/go/2491" ||
  broker.status !== "OWNER_SCOPED_DECISION" ||
  broker.placement_section !== 7
) {
  throw new Error("Controlled broker link is invalid");
}

const expectedVisibleSections = [1, 2, 3, 4, 5, 7, 11, 12, 14, 15, 16, 17, 18];
const expectedBlockedSections = [6, 8, 9, 10, 13];
const visibleSections = controls.sections
  .filter((item) => item.render)
  .map((item) => item.id);
const blockedSections = controls.sections
  .filter((item) => !item.render)
  .map((item) => item.id);

if (
  controls.section_count !== 18 ||
  controls.rendered_section_count !== 13 ||
  JSON.stringify(visibleSections) !== JSON.stringify(expectedVisibleSections) ||
  JSON.stringify(blockedSections) !== JSON.stringify(expectedBlockedSections)
) {
  throw new Error("Controlled section visibility is invalid");
}

const sectionControls = new Map(
  controls.sections.map((item) => [item.id, item]),
);

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function money(value) {
  return `¥${new Intl.NumberFormat("en-US").format(value)}`;
}

function head({ title, description, prefix, canonical, receipt = false }) {
  const robots = receipt ? "noindex,nofollow,noarchive" : "noindex,nofollow";
  const connectSource = applicationEndpointOrigin
    ? ` 'self' ${applicationEndpointOrigin}`
    : " 'self'";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="robots" content="${robots}">
  <meta name="referrer" content="no-referrer">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; base-uri 'none'; connect-src${connectSource}; font-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data:; object-src 'none'; script-src 'self'; style-src 'self'">
  <link rel="canonical" href="${canonical}">
  <link rel="icon" href="${prefix}assets/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="${prefix}assets/styles.css">
  <title>${escapeHtml(title)}</title>
</head>`;
}

function header(prefix, note, compact = false) {
  const isHome = prefix === "./" && !compact;
  const href = isHome ? "#section-1" : prefix;
  const ariaLabel = isHome ? "Go to page introduction" : "Return to FX-DREAM";
  return `<header class="site-header${compact ? " compact-header" : ""}">
  <a class="wordmark" href="${href}" aria-label="${ariaLabel}">
    <span class="wordmark-mark" aria-hidden="true">FX</span><span>FX-DREAM</span>
  </a>
  <p class="header-note">${note}</p>
</header>`;
}

function footer(prefix) {
  return `<footer>
  <p>FX-DREAM · Japanese-Developed MT4 Trading System</p>
  <p><a href="${prefix}privacy/">Privacy</a> · <a href="${prefix}terms/">Application terms</a> · <a href="mailto:${contact}">${contact}</a> · Manual trading · Risk applies</p>
</footer>`;
}

function applicationFooter(prefix) {
  return `<footer>
  <p>FX-DREAM · Purchase eligibility review</p>
  <p><a href="${prefix}privacy/">Privacy</a> · <a href="${prefix}terms/">Application terms</a> · <a href="mailto:${contact}">${contact}</a></p>
</footer>`;
}

function section(id, eyebrow, body, extra = "", hideHeading = false) {
  const control = sectionControls.get(id);
  if (!control || !control.render) {
    throw new Error(`Rendered section ${id} is absent or blocked`);
  }

  const heading = hideHeading
    ? ""
    : `<h2 id="section-${id}-title">${escapeHtml(control.title)}</h2>`;

  return `<section id="section-${id}" class="section ${extra}" data-section-id="${escapeHtml(control.key)}" data-sentence-ids="${escapeHtml(control.sentence_ids.join(" "))}" data-visibility="${escapeHtml(control.visibility)}" data-claims="${escapeHtml(control.claims.join(" "))}" data-pars="${escapeHtml(control.pars.join(" "))}" aria-labelledby="section-${id}-title">
  <div class="section-index" aria-hidden="true">${String(id).padStart(2, "0")}</div>
  <div class="section-content">${eyebrow ? `<p class="eyebrow">${eyebrow}</p>` : ""}${heading}${body}</div>
</section>`;
}

const [pro, privatePlan] = plan.plans;
const home = `${head({
  title: "FX-DREAM | Japanese-Developed MT4 Trading System",
  description: "Apply for eligibility review for FX-DREAM, a Japanese-developed discretionary MT4 support product.",
  prefix: "./",
  canonical: baseUrl,
})}
<body>
<a class="skip-link" href="#main-content">Skip to main content</a>
<div class="control-bar" aria-label="Purchase application status" data-public-permission="false">
  <span>Purchase applications</span><span>Review before payment</span><span>Manual decision support</span><span>No guaranteed returns</span>
</div>
${header("./", "International purchase application<br>Eligibility review required")}
<main id="main-content">
${section(1, "", `<p class="kicker">Japanese-Developed MT4 Trading System</p>
<h1 id="section-1-title">A disciplined MT4 workflow, built around your judgment.</h1>
<p class="hero-lede">Discretionary MT4 support—not an automated trading EA. You review the information, make the final trading decision, and place every order yourself.</p>
<div class="hero-actions" aria-label="Purchase application action"><a class="primary-button" href="./apply/">Apply for purchase review</a><p>Application is the first review step. Do not send payment until you receive a verified, time-limited official quotation.</p></div>
<p class="risk-line">Trading involves substantial risk. No profit, win rate, or trading outcome is guaranteed.</p>`, "hero", true)}
${section(2, "Positioning", `<p class="large-copy">FX-DREAM is Japanese-developed and shaped around disciplined design, clear documentation, and deliberate manual decision-making.</p>
<p>Its positioning reflects attention to structure and practical use; it does not claim measurable superiority or a guaranteed result.</p>`)}
${section(3, "A clearer manual workflow", `<div class="two-column"><p class="large-copy">Trading setups can become fragmented when information, tools, settings, and instructions are handled separately.</p><div><p>FX-DREAM is designed to bring those elements into a documented manual workflow for review and decision support.</p><p>The intended change is clearer process—not faster wealth, automatic execution, or a promised outcome.</p></div></div>`)}
${section(4, "Scope", `<div class="scope-grid"><article><p class="mini-label">What it is</p><p>A discretionary-trading support product built around MT4 indicators, tools, templates or settings, and manuals.</p><p class="muted">Exact delivered inventory will appear only in a release-bound package manifest and current manuals.</p></article><article><p class="mini-label">What it is not</p><p>It does not automate orders, provide trade advice, make entry or exit decisions, choose lot size, or manage an account.</p></article></div>
<p class="licence-note">Standard licence: one registered live account, one registered operating environment, and the purchaser or an approved company user.</p>`)}
${section(5, "Operating model", `<ol class="steps"><li><span>01</span>Review the available information.</li><li><span>02</span>Apply your own judgment and risk controls.</li><li><span>03</span>Place and manage orders manually.</li></ol><p>Signals and tools support this process; they do not replace your decision-making.</p>`)}
${section(7, "Availability", `<p class="large-copy">Availability depends on the released product, the applicable manual, and the relevant MT4 and broker environment.</p>
<p>Actual use is limited to the instruments, timeframes, environments, and jurisdictions confirmed in current release documentation.</p>
<aside class="broker-card" aria-labelledby="recommended-broker-title" data-broker-registration="traders-trust"><div class="broker-card-copy"><p class="mini-label">Optional broker registration</p><h3 id="recommended-broker-title">${escapeHtml(broker.card_title)}</h3><p>${escapeHtml(broker.recommendation_copy)}</p><p>${escapeHtml(broker.choice_copy)}</p><p class="broker-boundary">${escapeHtml(broker.availability_copy)}</p></div><div class="broker-link-action"><a class="secondary-button broker-link" href="${broker.registration_url}" target="_blank" rel="noopener noreferrer nofollow" referrerpolicy="no-referrer" aria-label="${escapeHtml(broker.new_tab_accessible_label)}">${escapeHtml(broker.link_label)}</a><p>${escapeHtml(broker.link_note)}</p></div></aside>`)}
${section(11, "Two plans · one core product", `<p class="large-copy" data-plan-object-id="${escapeHtml(plan.object_id)}" data-difference-rule="SUPPORT_ONLY">Both plans provide the same core product content. The difference is support only.</p>
<div class="plan-grid"><article class="plan-card"><p class="mini-label">${pro.name}</p><p class="price">${money(pro.contract_base_price_jpy)}</p><p class="price-note">Fixed base price (JPY)</p><ul><li>Same core product content.</li><li>Standard written technical support for 90 days.</li><li>Initial reply target: normally within 3 Japanese business days.</li><li>Remote installation assistance is not normally included.</li></ul><a class="plan-link" href="./apply/?plan=PRO%20SYSTEM">Apply for PRO SYSTEM</a></article><article class="plan-card plan-card-featured"><p class="mini-label">${privatePlan.name}</p><p class="price">${money(privatePlan.contract_base_price_jpy)}</p><p class="price-note">Fixed base price (JPY)</p><ul><li>Same core product content.</li><li>Priority written technical support, ongoing while the product and relevant support service remain available.</li><li>Initial reply target: normally within 1 Japanese business day.</li><li>Conditional remote installation assistance when the manual does not resolve the issue.</li></ul><a class="plan-link" href="./apply/?plan=PRIVATE%20IMPLEMENTATION">Apply for PRIVATE IMPLEMENTATION</a></article></div>
<p class="licence-note">Both plans include the same core product. The difference is the level, priority, and duration of human support.</p>`)}
${section(12, "Support boundary", `<p class="large-copy">The core product is identical in both plans; support level, priority, and duration create the price difference.</p><div class="support-grid"><p>Support is written by default. Live English voice coaching, continuous real-time support, trading advice, account management, and general computer repair are not included.</p><p>Japanese business days are Monday through Friday in Japan, excluding Japanese national holidays and separately announced closure days, with time calculated in JST / UTC+9.</p><p>Initial reply targets are service targets, not guaranteed resolution times.</p></div>`)}
${section(14, "Fixed JPY base prices", `<p class="large-copy">The fixed base prices are ${money(pro.contract_base_price_jpy)} for ${pro.name} and ${money(privatePlan.contract_base_price_jpy)} for ${privatePlan.name}.</p><p>An approved applicant receives a separate official USDT TRC20 quotation tied to the application and valid for 30 minutes. No wallet address or payment instruction is issued at the initial application stage.</p>`)}
${section(15, "Controlled purchase process", `<div class="flow" aria-label="Future controlled process stages">${["Application","Eligibility & compliance review","Restricted official quotation","Payment verification","Separate contract confirmation","Secure delivery"].map((item, index) => `<div class="flow-item"><span>${String(index + 1).padStart(2, "0")}</span>${item}</div>`).join("")}</div><div class="rule-list"><p>An application is not an acceptance, invoice, or contract.</p><p>A customer-submitted payment report is not payment approval or contract formation.</p><p>Contract formation requires separate confirmation after the required approval, receipt, verification, and compliance checks.</p><p>The normal delivery target, after contract formation, is within two Japanese business days. This is a target, not an absolute deadline; delays may occur with notice.</p></div><p class="licence-note">The initial form accepts an application only. Human review remains between every material stage, and customer submission alone cannot approve payment, form a contract, release delivery, or activate a guarantee.</p>`)}
${section(16, "Primary questions", `<div class="faq-list"><details><summary>Is FX-DREAM an automated trading EA?</summary><p>No. It supports discretionary trading, and you make the final decision and place and manage orders yourself.</p></details><details><summary>What is included?</summary><p>Controlled categories are indicators, tools, templates or settings, and manuals. Exact inventory will be stated only in a release-bound manifest and current manuals.</p></details><details><summary>Which instruments, timeframes, and environments are supported?</summary><p>Availability depends on the released product, current manuals, and the relevant MT4 and broker environment. Universal availability is not promised.</p></details><details><summary>${escapeHtml(broker.faq_question)}</summary><p>${escapeHtml(broker.faq_answer)}</p></details><details><summary>How do the two plans differ?</summary><p>The core product is identical. PRO SYSTEM provides 90 days of standard written support with an initial reply target of three Japanese business days. PRIVATE IMPLEMENTATION provides priority written support, ongoing while the product and relevant support service remain available, with an initial reply target of one Japanese business day and conditional remote installation assistance when the manual does not resolve the issue.</p></details><details><summary>Do reply targets guarantee resolution?</summary><p>No. They are targets for the initial reply, not guaranteed resolution times.</p></details><details><summary>Can I apply or pay through this page?</summary><p>You can submit an application for eligibility review. You cannot pay at this stage. Approved applicants receive separate versioned terms and a verified time-limited quotation before any transfer.</p></details></div>`)}
${section(17, "Persistent boundaries", `<div class="boundary-grid"><article><p class="mini-label">Risk</p><p>Trading involves substantial risk. You may lose some or all funds committed to trading. No profit, win rate, trading outcome, or customer result is guaranteed.</p></article><article><p class="mini-label">Decision</p><p>FX-DREAM is discretionary support—not automated trading, investment advice, a trade-decision service, lot-size decision service, or account management.</p></article><article><p class="mini-label">Availability</p><p>Access is limited to eligible applicants in supported jurisdictions and remains subject to a released package, current manuals, and the relevant environment.</p></article><article><p class="mini-label">Data and security</p><p>Any future process must use data minimization, protected access, retention and deletion controls, and an incident-response path. Never provide passwords, authentication codes, recovery material, or other credentials.</p></article></div><p class="licence-note">Standard licence: one registered live account, one registered operating environment, and the purchaser or an approved company user. Support is written by default, and initial reply targets do not guarantee resolution.</p>`)}
${section(18, "Application", `<div class="final-cta"><div><p class="large-copy">Ready to begin the purchase review?</p><p>The initial application requests eligibility review only. It is not acceptance, an invoice, a contract, a payment instruction, delivery, or guarantee activation. Availability remains limited to eligible applicants in supported jurisdictions.</p></div><a class="primary-button" href="./apply/">Start purchase application</a></div>`)}
</main>
${footer("./")}
</body>
</html>`;

const application = `${head({
  title: "Purchase Application | FX-DREAM",
  description: "Apply for eligibility review for the FX-DREAM Japanese-developed MT4 trading system.",
  prefix: "../",
  canonical: `${baseUrl}apply/`,
})}
<body>
<a class="skip-link" href="#application-form">Skip to the application form</a>
${header("../", "Purchase eligibility review", true)}
<main class="subpage-main">
<section class="subpage-hero"><p class="eyebrow">Purchase application</p><h1>Start with an eligibility review.</h1><p class="large-copy">Tell us about your intended use and MT4 environment. This form is an application for review—not an invoice, payment instruction, or sales contract.</p><div class="notice-card"><strong>Do not send payment or credentials.</strong><p>We do not request passwords, MT4 login credentials, wallet seed phrases, private keys, authentication codes, or identity-document images in this initial application.</p></div></section>
<section class="application-section" id="application-form"><div class="application-intro"><p class="eyebrow">Form A · Initial review</p><h2>Your application</h2><p>Required fields are marked with an asterisk. Applications remain subject to identity, eligibility, sanctions, fraud-prevention, jurisdiction, and compliance review before any payment instruction is issued.</p></div>
<div id="form-status" hidden role="alert"></div>
<form class="application-form" id="purchase-application" action="#" method="post">
<input name="submission_token" type="hidden" value=""><input name="terms_version" type="hidden" value="${termsVersion}"><input name="privacy_version" type="hidden" value="${privacyVersion}">
<div class="honeypot" aria-hidden="true"><label for="website">Website</label><input id="website" name="website" tabindex="-1" autocomplete="off"></div>
<fieldset><legend>Applicant</legend><div class="field-grid"><label>Applicant type *<select name="applicant_type" required><option value="individual">Individual</option><option value="company">Company</option></select></label><label>Full legal name *<input name="full_name" required maxlength="120" autocomplete="name"></label><label>Company name (required for company applications)<input name="company_name" maxlength="160" autocomplete="organization"></label><label>Email address *<input name="email" type="email" required maxlength="254" autocomplete="email"><span class="field-hint">Used for the Form A receipt and later review correspondence.</span></label><label>Country or region of residence / registration *<input name="country" required maxlength="120" autocomplete="country-name"></label></div></fieldset>
<fieldset><legend>Product and environment</legend><div class="field-grid"><label>Requested plan *<select name="plan" required><option value="PRO SYSTEM">PRO SYSTEM — JPY 1,000,000</option><option value="PRIVATE IMPLEMENTATION">PRIVATE IMPLEMENTATION — JPY 2,000,000</option></select></label><label>MT4 experience *<select name="mt4_experience" required><option value="" selected disabled>Select one</option><option value="new">New to MT4</option><option value="under-1-year">Less than 1 year</option><option value="1-3-years">1–3 years</option><option value="3-plus-years">More than 3 years</option></select></label><label>Broker (if already selected)<input name="broker" maxlength="120"><span class="field-hint">${escapeHtml(broker.application_hint)}</span></label><label class="field-wide">Intended Windows / MT4 operating environment *<textarea name="operating_environment" required maxlength="300" rows="3" placeholder="Example: Windows 11, desktop PC, MT4 build and broker if known"></textarea></label><label class="field-wide">Intended use *<textarea name="intended_use" required minlength="10" maxlength="1000" rows="5" placeholder="Describe how you expect to use FX-DREAM in your own discretionary trading workflow."></textarea></label><label>Planned payment source *<select name="third_party_payment" required><option value="no">My own / applicant-owned source</option><option value="review-required">A third-party source may be involved</option></select></label></div></fieldset>
<fieldset class="acknowledgement-list"><legend>Required acknowledgements</legend><label><input type="checkbox" name="ack_manual" required><span>I understand that FX-DREAM supports discretionary manual trading and does not place or manage trades for me.</span></label><label><input type="checkbox" name="ack_risk" required><span>I understand that trading involves substantial risk and that no profit, win rate, or trading outcome is guaranteed.</span></label><label><input type="checkbox" name="ack_application" required><span>I understand that this application is not acceptance, an invoice, a payment instruction, a contract, delivery, or guarantee activation.</span></label><label><input type="checkbox" name="ack_terms" required><span>I have read and accept the <a href="../terms/">application terms</a> and <a href="../privacy/">privacy notice</a>.</span></label><label><input type="checkbox" name="ack_age" required><span>I am at least 18 years old and legally able to apply.</span></label></fieldset>
<button class="primary-button" id="application-submit" type="submit" disabled>Submit purchase application</button><p class="form-footnote">Submission creates a review record only. If approved, any official quotation and payment instructions will be provided separately and will be time-limited.</p>
</form><noscript><div class="form-error">JavaScript is required for secure application submission. Contact ${contact} without sending credentials or payment information.</div></noscript></section>
</main>
${applicationFooter("../")}
<script src="../assets/application.js" defer></script>
</body></html>`;

const received = `${head({
  title: "Application Received | FX-DREAM",
  description: "FX-DREAM purchase application receipt.",
  prefix: "../../",
  canonical: `${baseUrl}apply/received/`,
  receipt: true,
})}
<body><main class="confirmation-page"><section class="confirmation-card"><p class="eyebrow">Application received</p><h1>Thank you. Your review record is ready.</h1><p class="large-copy">Save the reference below. FX-DREAM will review the application before any quotation, payment instruction, or contract confirmation is sent.</p><div class="reference-box" id="application-reference" aria-label="Application reference">Recorded</div><div class="notice-card"><strong>Keep your Form A reference.</strong><p>The on-screen reference confirms that the application was recorded. If acknowledgement email is enabled for the live service, delivery may take a few minutes. Keep this reference and contact <a href="mailto:${contact}">${contact}</a> if needed. Do not submit a duplicate application.</p><p>The receipt confirms Form A only. It is not approval, an invoice, a contract, a payment instruction, delivery, or guarantee activation.</p></div><div class="notice-card"><strong>Do not send payment yet.</strong><p>A wallet address, QR code, or payment amount shown outside a later verified official quotation must not be used.</p></div><a class="secondary-button" href="../../">Return to FX-DREAM</a></section></main><script src="../../assets/received.js" defer></script></body></html>`;

const terms = `${head({title:"Application Terms | FX-DREAM",description:"Terms governing the initial FX-DREAM purchase application.",prefix:"../",canonical:`${baseUrl}terms/`})}<body>${header("../", "Application terms · 18 August 2026", true)}<main class="policy-page"><article><p class="eyebrow">Application terms</p><h1>Initial purchase review only</h1><p>These terms govern the submission and review of an initial FX-DREAM purchase application. They do not by themselves create a sales contract, invoice, payment obligation, delivery obligation, support entitlement, or refund-guarantee entitlement.</p><h2>1. Product and plans</h2><p>FX-DREAM is a discretionary MT4 support product. It is not an automated trading EA and does not provide investment advice, account management, or guaranteed results. The current fixed base prices are JPY 1,000,000 for PRO SYSTEM and JPY 2,000,000 for PRIVATE IMPLEMENTATION. Both plans receive the same core product; the difference is support only.</p><h2>2. Review and eligibility</h2><p>Every application may be accepted, declined, paused, or returned for clarification. Availability is limited to eligible applicants in supported jurisdictions and may require identity, company, sanctions, fraud-prevention, payment-source, and wallet review.</p><h2>3. Third-party broker environment</h2><p>${escapeHtml(broker.terms_copy)}</p><h2>4. No payment at application</h2><p>Do not send funds when submitting this form. Approved applicants may later receive separate official terms and a time-limited USDT TRC20 quotation. An expired quotation cannot be reused. Payment instructions are valid only when tied to the applicant, plan, quotation identifier, stated amount, network, and validity period.</p><h2>5. Contract formation and delivery</h2><p>A sales contract forms only after application approval, complete receipt and verification of funds, required compliance clearance, and a separate contract-confirmation notice from FX-DREAM. Delivery occurs separately through a controlled delivery process.</p><h2>6. Trading risk</h2><p>Trading involves substantial risk. You may lose some or all funds committed to trading. No profit, win rate, customer result, or trading outcome is guaranteed. You remain responsible for every trading decision, order, position, and risk control.</p><h2>7. Accurate information and prohibited data</h2><p>Applicants must provide accurate information and must not submit passwords, private keys, seed phrases, authentication codes, MT4 credentials, or identity-document images through the initial form. Third-party payment sources require review before any transfer.</p><h2>8. Later operative terms</h2><p>Before any binding acceptance or payment instruction, the approved applicant will receive the seller identity, applicable supported jurisdiction, operative sales and licence terms, payment and delivery conditions, privacy information, and any applicable conditional guarantee terms. Those later versioned documents govern the sale if a contract is formed.</p><h2>9. Application contact</h2><p>Use <a href="mailto:${contact}">${contact}</a> for Form A corrections or withdrawal requests and include the application reference. This email address is not a payment channel. A payment request is valid only if it is later provided through the separate verified official-quotation process described above.</p><p class="policy-version">Version: ${termsVersion}</p><p><a href="../apply/">Return to the application</a></p></article></main></body></html>`;

const privacy = `${head({title:"Application Privacy Notice | FX-DREAM",description:"How FX-DREAM handles initial purchase-application data.",prefix:"../",canonical:`${baseUrl}privacy/`})}<body>${header("../", "Privacy notice · 18 August 2026", true)}<main class="policy-page"><article><p class="eyebrow">Application privacy notice</p><h1>Data minimization from the first contact.</h1><p>This notice covers the initial FX-DREAM purchase-application form. The form collects only the information needed to identify and contact the applicant, understand the requested plan and intended environment, and perform an initial eligibility review.</p><h2>Data collected</h2><p>Applicant type, name, company name when applicable, email address, country or region, requested plan, MT4 experience, intended operating environment, broker when supplied, intended use, third-party payment disclosure, acknowledgements, submission time, and pseudonymous anti-abuse signals are recorded.</p><h2>Data not requested here</h2><p>Do not submit identity-document images, account passwords, MT4 credentials, private keys, wallet seed phrases, authentication codes, or payment transaction identifiers in the initial form.</p><h2>Purposes</h2><p>Data is used to review eligibility and jurisdiction, contact the applicant, prevent abuse and fraud, maintain an application audit trail, and prepare any later compliance review. Submission data is not used to authorize payment, delivery, or guarantee activation.</p><h2>Storage, access, and retention</h2><p>Application records are stored in controlled infrastructure and limited to authorized FX-DREAM operations personnel. Rejected, withdrawn, or inactive initial applications are scheduled for deletion or anonymization within 180 days unless a longer period is reasonably required for security, disputes, compliance, or law. Contracted-customer records are governed by the later operative privacy and contract documents.</p><h2>Processors and international handling</h2><p>Hosting and security providers may process application data to operate this service. When transactional email delivery is enabled, the email-delivery provider processes the applicant email address and the minimal Form A receipt content. Any later identity, sanctions, company, or wallet screening uses separate disclosed providers and is not performed by this initial form. Cross-border handling and provider details will be disclosed before any later verification step.</p><h2>Requests and complaints</h2><p>Email <a href="mailto:${contact}">${contact}</a> with the application reference to request access, correction, withdrawal, or deletion. Do not send credentials, identity-document images, private keys, wallet seed phrases, or authentication codes by email. The public contracting-entity identity will be displayed before public application intake is enabled.</p><p class="policy-version">Version: ${privacyVersion}</p><p><a href="../apply/">Return to the application</a></p></article></main></body></html>`;

const notFound = `${head({title:"Page not found | FX-DREAM",description:"The requested FX-DREAM page was not found.",prefix:"./",canonical:baseUrl,receipt:true})}<body><main class="confirmation-page"><section class="confirmation-card"><p class="eyebrow">Page not found</p><h1>This page is unavailable.</h1><p><a class="secondary-button" href="${baseUrl}">Return to FX-DREAM</a></p></section></main></body></html>`;

await rm(dist, { recursive: true, force: true });
for (const directory of ["assets", "apply/received", "terms", "privacy"]) {
  await mkdir(path.join(dist, directory), { recursive: true });
}
await Promise.all([
  cp(path.join(root, "assets/styles.css"), path.join(dist, "assets/styles.css")),
  cp(path.join(root, "assets/received.js"), path.join(dist, "assets/received.js")),
  cp(path.join(root, "assets/favicon.svg"), path.join(dist, "assets/favicon.svg")),
]);
const applicationScript = (
  await readFile(path.join(root, "assets/application.js"), "utf8")
).replace(
  '"__FXD_APPLICATION_ENDPOINT__"',
  JSON.stringify(applicationEndpoint),
);
await Promise.all([
  writeFile(path.join(dist, "index.html"), home),
  writeFile(path.join(dist, "apply/index.html"), application),
  writeFile(path.join(dist, "apply/received/index.html"), received),
  writeFile(path.join(dist, "terms/index.html"), terms),
  writeFile(path.join(dist, "privacy/index.html"), privacy),
  writeFile(path.join(dist, "404.html"), notFound),
  writeFile(path.join(dist, "assets/application.js"), applicationScript),
  writeFile(path.join(dist, ".nojekyll"), ""),
  writeFile(path.join(dist, "robots.txt"), "User-agent: *\nDisallow: /\n"),
]);

console.log("Built FX-DREAM portable static draft");
