import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const dist = path.join(root, "dist");
const baseUrl = "https://preview.invalid/";
const brokerUrl = "https://my.traders-trust.com/ja/links/go/2491";
const contact = "fx_dream@flh.works";
const termsVersion = "FXD-APPLICATION-TERMS-20260818-v3";
const privacyVersion = "FXD-APPLICATION-PRIVACY-20260818-v2";

async function text(relativePath) {
  return readFile(path.join(dist, relativePath), "utf8");
}

async function walk(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    const relativePath = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) {
      result.push(...(await walk(path.join(directory, entry.name), relativePath)));
    } else {
      result.push(relativePath);
    }
  }
  return result.sort();
}

function occurrences(value, needle) {
  return value.split(needle).length - 1;
}

function attribute(tag, name) {
  return tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] ?? null;
}

function controlTag(html, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return html.match(
    new RegExp(`<(?:input|select|textarea)\\b[^>]*\\bname="${escaped}"[^>]*>`, "i"),
  )?.[0];
}

const [
  home,
  application,
  received,
  terms,
  privacy,
  notFound,
  applicationJs,
  receivedJs,
  plan,
  broker,
] = await Promise.all([
  text("index.html"),
  text("apply/index.html"),
  text("apply/received/index.html"),
  text("terms/index.html"),
  text("privacy/index.html"),
  text("404.html"),
  text("assets/application.js"),
  text("assets/received.js"),
  readFile(path.join(root, "data/plan.json"), "utf8").then(JSON.parse),
  readFile(path.join(root, "data/broker.json"), "utf8").then(JSON.parse),
]);

const htmlByPath = new Map([
  ["index.html", home],
  ["apply/index.html", application],
  ["apply/received/index.html", received],
  ["terms/index.html", terms],
  ["privacy/index.html", privacy],
  ["404.html", notFound],
]);

test("build emits the complete portable static tree without legacy LP files", async () => {
  const paths = await walk(dist);
  const required = [
    ".nojekyll",
    "404.html",
    "apply/index.html",
    "apply/received/index.html",
    "assets/application.js",
    "assets/favicon.svg",
    "assets/received.js",
    "assets/styles.css",
    "index.html",
    "privacy/index.html",
    "robots.txt",
    "terms/index.html",
  ];

  for (const requiredPath of required) {
    assert.ok(paths.includes(requiredPath), `missing ${requiredPath}`);
    assert.ok((await stat(path.join(dist, requiredPath))).isFile());
  }
  assert.equal((await stat(path.join(dist, ".nojekyll"))).size, 0);
  assert.equal(
    paths.some((file) => /^c[1-6]\.png$/i.test(file)),
    false,
    "legacy testimonial/claim images must not ship",
  );
  assert.equal(paths.includes("index.html.html"), false);
  assert.equal(paths.some((file) => file.endsWith(".map")), false);
});

test("formal publication stop remains visible in metadata and controlled data", async () => {
  assert.equal(await text("robots.txt"), "User-agent: *\nDisallow: /\n");
  for (const [relativePath, html] of htmlByPath) {
    assert.match(
      html,
      /<meta name="robots" content="noindex,nofollow(?:,noarchive)?">/,
      `${relativePath} must remain noindex`,
    );
  }
  assert.match(home, /data-public-permission="false"/);
  for (const gate of [
    "purchase_enabled",
    "quote_enabled",
    "payment_enabled",
    "contract_enabled",
    "delivery_enabled",
    "guarantee_activation_enabled",
    "public_permission",
  ]) {
    assert.equal(plan[gate], false, `${gate} must remain false`);
  }
});

test("draft canonical URLs, language and local asset paths are controlled", () => {
  const expectedCanonicals = new Map([
    ["index.html", baseUrl],
    ["apply/index.html", `${baseUrl}apply/`],
    ["apply/received/index.html", `${baseUrl}apply/received/`],
    ["terms/index.html", `${baseUrl}terms/`],
    ["privacy/index.html", `${baseUrl}privacy/`],
    ["404.html", baseUrl],
  ]);

  for (const [relativePath, html] of htmlByPath) {
    assert.match(html, /^<!doctype html>\n<html lang="en">/);
    assert.ok(
      html.includes(`<link rel="canonical" href="${expectedCanonicals.get(relativePath)}">`),
      `wrong canonical URL in ${relativePath}`,
    );
    assert.match(html, /<meta name="referrer" content="no-referrer">/);
    assert.doesNotMatch(html, /(?:href|action)="[^"]*njpw000\.chatgpt\.site/i);
  }

  assert.match(home, /href="\.\/assets\/styles\.css"/);
  assert.match(application, /href="\.\.\/assets\/styles\.css"/);
  assert.match(received, /src="\.\.\/\.\.\/assets\/received\.js" defer/);
  assert.match(terms, /href="\.\.\/assets\/styles\.css"/);
  assert.match(privacy, /href="\.\.\/assets\/styles\.css"/);
});

test("home renders exactly the approved 13 sections and excludes blocked sections", () => {
  const renderedSections = [...home.matchAll(/data-section-id="S(\d{2})"/g)].map(
    (match) => Number(match[1]),
  );
  assert.deepEqual(renderedSections, [1, 2, 3, 4, 5, 7, 11, 12, 14, 15, 16, 17, 18]);
  assert.equal(new Set(renderedSections).size, renderedSections.length);

  for (const blocked of [6, 8, 9, 10, 13]) {
    assert.doesNotMatch(home, new RegExp(`(?:id="section-${blocked}"|data-section-id="S${blocked.toString().padStart(2, "0")}")`));
  }
  for (const allowed of renderedSections) {
    assert.match(home, new RegExp(`id="section-${allowed}-title"`));
  }
});

test("controlled plans retain exact prices, identical core content and support-only difference", () => {
  assert.equal(plan.currency, "JPY");
  assert.equal(plan.difference_rule, "SUPPORT_ONLY");
  assert.deepEqual(
    plan.plans.map(({ name, contract_base_price_jpy, core_product_payload }) => ({
      name,
      contract_base_price_jpy,
      core_product_payload,
    })),
    [
      {
        name: "PRO SYSTEM",
        contract_base_price_jpy: 1_000_000,
        core_product_payload: "IDENTICAL",
      },
      {
        name: "PRIVATE IMPLEMENTATION",
        contract_base_price_jpy: 2_000_000,
        core_product_payload: "IDENTICAL",
      },
    ],
  );
  assert.equal(plan.plans[0].support.written_support_duration, "90 days");
  assert.equal(plan.plans[0].support.initial_reply_target_japanese_business_days, 3);
  assert.equal(
    plan.plans[0].support.remote_installation_assistance,
    "normally not included",
  );
  assert.equal(
    plan.plans[1].support.written_support_duration,
    "ongoing while service remains available",
  );
  assert.equal(plan.plans[1].support.initial_reply_target_japanese_business_days, 1);
  assert.equal(
    plan.plans[1].support.remote_installation_assistance,
    "conditional when the manual does not resolve the issue",
  );
  assert.equal(
    Object.values(plan.core_parity_rules).every(
      (value) => value === "IDENTICAL" || value.includes("NO_PLAN_DIFFERENCE"),
    ),
    true,
  );

  assert.match(home, /data-difference-rule="SUPPORT_ONLY"/);
  assert.match(home, /Both plans provide the same core product content\. The difference is support only\./);
  assert.match(home, /<p class="price">¥1,000,000<\/p>/);
  assert.match(home, /<p class="price">¥2,000,000<\/p>/);
  assert.match(home, /Standard written technical support for 90 days\./);
  assert.match(home, /Priority written technical support, ongoing while the product and relevant support service remain available\./);
  assert.match(home, /normally within 3 Japanese business days/);
  assert.match(home, /normally within 1 Japanese business day/);
  assert.match(home, /Remote installation assistance is not normally included\./);
  assert.match(home, /Conditional remote installation assistance when the manual does not resolve the issue\./);
  assert.match(terms, /JPY 1,000,000 for PRO SYSTEM and JPY 2,000,000 for PRIVATE IMPLEMENTATION/);
});

test("recommended broker link is singular, hardened, optional and bounded", () => {
  assert.equal(broker.registration_url, brokerUrl);
  assert.equal(broker.status, "OWNER_SCOPED_DECISION");
  assert.equal(broker.placement_section, 7);
  assert.equal(occurrences(home, brokerUrl), 1);

  const link = home.match(new RegExp(`<a\\b[^>]*href="${brokerUrl.replaceAll("/", "\\/")}"[^>]*>`))?.[0];
  assert.ok(link, "broker registration link is missing");
  assert.equal(attribute(link, "target"), "_blank");
  assert.equal(attribute(link, "rel"), "noopener noreferrer nofollow");
  assert.equal(attribute(link, "referrerpolicy"), "no-referrer");
  assert.equal(
    attribute(link, "aria-label"),
    "Visit Traders Trust registration (opens in a new tab)",
  );

  assert.match(home, /Optional broker registration/);
  assert.match(home, /Using Traders Trust is optional\./);
  assert.match(home, /Broker registration and brokerage services are separate from FX-DREAM\./);
  assert.match(home, /Availability and account approval depend on Traders Trust, your country of residence or citizenship, and applicable law\./);
  assert.match(home, /FX-DREAM does not guarantee broker services, trading conditions, platform access, or investment outcomes\./);
  assert.match(home, /Do I have to use Traders Trust\?/);
  assert.match(home, /No\. Traders Trust is the recommended optional reference broker\./);
  assert.match(terms, /Broker registration and brokerage services form a separate third-party relationship\./);
});

test("legacy form, LINE funnel and superseded performance claims are absent", () => {
  const allHtml = [...htmlByPath.values()].join("\n");
  const prohibited = [
    /docs\.google\.com\/forms/i,
    /forms\.gle/i,
    /line\.me/i,
    /lin\.ee/i,
    /line:\/\//i,
    /5万円/,
    /300万円/,
    /5万[^<\n]{0,80}300万/,
    /guaranteed profit/i,
    /guaranteed win rate/i,
    /automatically places trades/i,
  ];
  for (const pattern of prohibited) assert.doesNotMatch(allHtml, pattern);

  for (const html of htmlByPath.values()) {
    for (const anchor of html.matchAll(/<a\b[^>]*\bhref="([^"]+)"[^>]*>/g)) {
      const href = anchor[1];
      const isAllowedExternal =
        href === brokerUrl || href === baseUrl || href === `mailto:${contact}`;
      assert.ok(
        isAllowedExternal || href.startsWith("./") || href.startsWith("../") || href.startsWith("#"),
        `unexpected anchor destination: ${href}`,
      );
    }
  }
});

test("application form contains the exact controlled fields and policy acknowledgements", () => {
  const expectedNames = [
    "ack_age",
    "ack_application",
    "ack_manual",
    "ack_risk",
    "ack_terms",
    "applicant_type",
    "broker",
    "company_name",
    "country",
    "email",
    "full_name",
    "intended_use",
    "mt4_experience",
    "operating_environment",
    "plan",
    "privacy_version",
    "submission_token",
    "terms_version",
    "third_party_payment",
    "website",
  ];
  const actualNames = [
    ...application.matchAll(/<(?:input|select|textarea)\b[^>]*\bname="([^"]+)"[^>]*>/g),
  ]
    .map((match) => match[1])
    .sort();
  assert.deepEqual(actualNames, expectedNames);

  for (const name of [
    "applicant_type",
    "full_name",
    "email",
    "country",
    "plan",
    "mt4_experience",
    "operating_environment",
    "intended_use",
    "third_party_payment",
    "ack_manual",
    "ack_risk",
    "ack_application",
    "ack_terms",
    "ack_age",
  ]) {
    assert.match(controlTag(application, name) ?? "", /\brequired\b/, `${name} is not required`);
  }
  assert.doesNotMatch(controlTag(application, "company_name") ?? "", /\brequired\b/);
  assert.doesNotMatch(controlTag(application, "broker") ?? "", /\brequired\b/);
  assert.match(controlTag(application, "intended_use") ?? "", /\bminlength="10"/);
  assert.match(controlTag(application, "intended_use") ?? "", /\bmaxlength="1000"/);
  assert.match(controlTag(application, "operating_environment") ?? "", /\bmaxlength="300"/);
  assert.match(controlTag(application, "submission_token") ?? "", /\bvalue=""/);
  assert.match(
    controlTag(application, "terms_version") ?? "",
    new RegExp(`\\bvalue="${termsVersion}"`),
  );
  assert.match(
    controlTag(application, "privacy_version") ?? "",
    new RegExp(`\\bvalue="${privacyVersion}"`),
  );
  assert.match(application, /<form\b[^>]*id="purchase-application"[^>]*action="#"[^>]*method="post"/);
  assert.match(application, /id="form-status" hidden role="alert"/);
  assert.match(application, /id="application-submit" type="submit" disabled/);
  assert.match(application, /<script src="\.\.\/assets\/application\.js" defer><\/script>/);
  assert.match(application, /Applications remain subject to identity, eligibility, sanctions, fraud-prevention, jurisdiction, and compliance review/);
  assert.match(application, /this application is not acceptance, an invoice, a payment instruction, a contract, delivery, or guarantee activation/i);
});

test("application JavaScript fails closed without a configured intake endpoint", () => {
  assert.match(applicationJs, /^const APPLICATION_ENDPOINT = "";/);
  assert.doesNotMatch(applicationJs, /njpw000\.chatgpt\.site|flhworks\.github\.io/);
  assert.match(applicationJs, /const endpointIsConfigured/);
  assert.match(applicationJs, /Application submission is not active in this review build/);
  assert.match(applicationJs, /crypto\.getRandomValues\(values\)/);
  assert.match(applicationJs, /token\.value = randomHex\(32\)/);
  assert.match(applicationJs, /new URLSearchParams\(\)/);
  assert.match(applicationJs, /new FormData\(form\)/);
  assert.match(applicationJs, /method: "POST"/);
  assert.match(applicationJs, /Accept: "application\/json"/);
  assert.match(applicationJs, /"Content-Type": "application\/x-www-form-urlencoded;charset=UTF-8"/);
  assert.match(applicationJs, /credentials: "omit"/);
  assert.match(applicationJs, /mode: "cors"/);
  assert.match(applicationJs, /redirect: "error"/);
  assert.match(applicationJs, /referrerPolicy: "no-referrer"/);
  assert.doesNotMatch(applicationJs, /credentials:\s*"(?:include|same-origin)"/);
  assert.doesNotMatch(applicationJs, /\bAuthorization\b|\bBearer\s+/i);
  assert.match(applicationJs, /location\.assign\(`\.\/received\/\?reference=/);
  assert.doesNotMatch(applicationJs, /location\.(?:assign|replace)\(`?https?:\/\//);
  assert.ok(applicationJs.includes("/^FXD-A-\\d{8}-[A-Z0-9]{10}$/"));

  for (const code of [
    "request-too-large",
    "invalid-form",
    "required-fields",
    "company-name-required",
    "acknowledgements-required",
    "rate-limited",
    "storage-failed",
    "submission-conflict",
    "policy-version-outdated",
    "intake-unavailable",
  ]) {
    assert.match(applicationJs, new RegExp(`"${code}"`));
  }
});

test("receipt and policy pages preserve reference, version and contact controls", () => {
  assert.match(received, /<div class="reference-box" id="application-reference"/);
  assert.match(received, /Keep your Form A reference\./);
  assert.match(received, /If acknowledgement email is enabled for the live service/);
  assert.match(received, /Do not submit a duplicate application\./);
  assert.match(received, /The receipt confirms Form A only\. It is not approval, an invoice, a contract, a payment instruction, delivery, or guarantee activation\./);
  assert.match(receivedJs, /\^FXD-A-\\d\{8\}-\[A-Z0-9\]\{10\}\$/);
  assert.match(receivedJs, /: "Recorded"/);

  assert.equal(occurrences(application, termsVersion), 1);
  assert.equal(occurrences(terms, termsVersion), 1);
  assert.equal(occurrences(application, privacyVersion), 1);
  assert.equal(occurrences(privacy, privacyVersion), 1);
  assert.match(terms, new RegExp(`Version: ${termsVersion}`));
  assert.match(privacy, new RegExp(`Version: ${privacyVersion}`));
  assert.match(terms, new RegExp(`mailto:${contact}`));
  assert.match(privacy, new RegExp(`mailto:${contact}`));
  assert.match(received, new RegExp(`mailto:${contact}`));
  assert.match(privacy, /scheduled for deletion or anonymization within 180 days/);
  assert.match(privacy, /public contracting-entity identity will be displayed before public application intake is enabled/);
});

test("security metadata prevents embedded, credential-bearing or direct-payment behavior", () => {
  const allHtml = [...htmlByPath.values()].join("\n");
  const allBuiltText = `${allHtml}\n${applicationJs}\n${receivedJs}`;

  for (const [relativePath, html] of htmlByPath) {
    assert.match(html, /default-src 'self'/, `${relativePath} lacks default-src`);
    assert.match(html, /base-uri 'none'/, `${relativePath} lacks base-uri protection`);
    assert.match(html, /form-action 'self'/, `${relativePath} lacks form-action protection`);
    assert.match(html, /frame-ancestors 'none'/, `${relativePath} lacks frame protection`);
    assert.match(html, /object-src 'none'/, `${relativePath} lacks object-src protection`);
    for (const scriptTag of html.matchAll(/<script\b[^>]*>/g)) {
      assert.match(scriptTag[0], /\bsrc="[^"]+"/i, `${relativePath} contains an inline script`);
    }
  }
  assert.equal(
    [...htmlByPath.values()].every((html) =>
      html.includes(`connect-src 'self';`),
    ),
    true,
  );
  assert.doesNotMatch(allBuiltText, /njpw000\.chatgpt\.site|flhworks\.github\.io/);
  assert.doesNotMatch(allBuiltText, /-----BEGIN [A-Z ]*PRIVATE KEY-----/);
  assert.doesNotMatch(allBuiltText, /\b(?:sk|ghp|github_pat)_[A-Za-z0-9_-]{20,}\b/);
  assert.doesNotMatch(allBuiltText, /\bT[1-9A-HJ-NP-Za-km-z]{33}\b/);
  assert.doesNotMatch(allBuiltText, /\b0x[a-fA-F0-9]{40}\b/);
  assert.doesNotMatch(allBuiltText, /(?:bitcoin|ethereum|tron|usdt):/i);
  assert.doesNotMatch(allHtml, /<img\b[^>]*(?:wallet|qr(?:code)?)[^>]*>/i);
  assert.doesNotMatch(allHtml, /<form\b[^>]*action="https?:\/\//i);
  assert.doesNotMatch(allHtml, /<a\b[^>]*href="[^"]*(?:pay|checkout|wallet|invoice)[^"]*"/i);
});

test("IDs and same-page accessibility references are internally consistent", () => {
  for (const [relativePath, html] of htmlByPath) {
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
    assert.equal(new Set(ids).size, ids.length, `${relativePath} contains duplicate IDs`);
    const idSet = new Set(ids);
    for (const match of html.matchAll(/\baria-labelledby="([^"]+)"/g)) {
      for (const referencedId of match[1].split(/\s+/)) {
        assert.ok(idSet.has(referencedId), `${relativePath} references missing #${referencedId}`);
      }
    }
    for (const match of html.matchAll(/<a\b[^>]*href="#([^"]+)"/g)) {
      assert.ok(idSet.has(match[1]), `${relativePath} links to missing #${match[1]}`);
    }
  }
});
