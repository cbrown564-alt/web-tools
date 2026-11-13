import { chromium } from "playwright";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { zipSync, strToU8 } from "fflate";
import { formFixture } from "./form-fixture.mjs";
import { sha, writeJson } from "./files.mjs";
export function docxFixture(marker) {
  return Buffer.from(
    zipSync(
      {
        "[Content_Types].xml": strToU8(
          '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
        ),
        "_rels/.rels": strToU8(
          '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
        ),
        "word/document.xml": strToU8(
          `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>SYNTHETIC TEST ATTACHMENT ${marker}</w:t></w:r></w:p></w:body></w:document>`,
        ),
      },
      { level: 6 },
    ),
  );
}
export const defaultFormProfile = {
  version: 1,
  isolated: true,
  requestPath: "/submit",
  inboxPath: "/inbox",
  recipient: "local-capture-inbox",
  stateAttribute: "data-state",
  successState: "received",
  failureState: "failed",
  nativeValidation: true,
  maxAttachmentBytes: 8192,
  selectors: {
    form: "form",
    name: "#person",
    email: "#email",
    company: "#company",
    message: "#message",
    marker: "#marker",
    attachment: "#attachment",
    submit: "button[type=submit]",
    feedback: "#feedback",
  },
};
export function validateFormProfile(p, projectId) {
  if (p?.version !== 1 || p.projectId !== projectId || p.isolated !== true)
    throw Error(
      "Profile must identify this project and an isolated local test environment",
    );
  const u = new URL(p.baseUrl);
  if (
    !["http:", "https:"].includes(u.protocol) ||
    !["127.0.0.1", "localhost", "[::1]"].includes(u.hostname) ||
    u.username ||
    u.password ||
    u.search ||
    u.hash ||
    u.pathname !== "/"
  )
    throw Error("Form profiles support plain loopback origins only");
  for (const key of ["requestPath", "inboxPath"]) {
    const v = p[key];
    if (
      typeof v !== "string" ||
      !v.startsWith("/") ||
      v.startsWith("//") ||
      new URL(v, u).pathname !== v
    )
      throw Error(
        "Profile endpoints must be absolute paths without queries or fragments",
      );
  }
  for (const key of [
    "recipient",
    "stateAttribute",
    "successState",
    "failureState",
  ])
    if (typeof p[key] !== "string" || !p[key].trim())
      throw Error(`Missing profile ${key}`);
  for (const key of ["form", "name", "email", "message", "submit", "feedback"])
    if (typeof p.selectors?.[key] !== "string" || !p.selectors[key].trim())
      throw Error(`Missing form selector ${key}`);
  for (const key of ["company", "attachment", "marker"])
    if (
      p.selectors[key] !== undefined &&
      p.selectors[key] !== null &&
      typeof p.selectors[key] !== "string"
    )
      throw Error("Invalid optional form selector");
  if (
    p.selectors.attachment &&
    (!Number.isInteger(p.maxAttachmentBytes) ||
      p.maxAttachmentBytes < 2048 ||
      p.maxAttachmentBytes > 5000000)
  )
    throw Error("Attachment limit must be 2048–5000000 bytes");
  return { ...p, baseUrl: u.origin };
}
const requireThat = (condition, message) => {
  if (!condition) throw Error(message);
};
export async function runFormRehearsal(
  project,
  out,
  { wrongRecipient = false, profile } = {},
) {
  const configured = Boolean(profile);
  if (profile) profile = validateFormProfile(profile, project.id);
  const service = profile
    ? { base: profile.baseUrl.replace(/\/$/, ""), close: async () => {} }
    : await formFixture(project, { wrongRecipient });
  const p = profile || defaultFormProfile,
    s = p.selectors,
    base = service.base,
    requestUrl = new URL(p.requestPath, base).href,
    matchRequest = (url) =>
      url.origin === base && url.pathname === p.requestPath;
  let browser;
  const rows = [],
    markers = [];
  try {
    browser = await chromium.launch();
    await mkdir(resolve(out, "forms"));
  } catch (error) {
    await browser?.close();
    await service.close();
    throw error;
  }
  service.messages?.set("unrelated-existing-record", {
    marker: "unrelated-existing-record",
    message: "Preserve this unrelated fixture record",
  });
  async function inbox(marker, method = "GET") {
    const response = await fetch(
      new URL(p.inboxPath, base).href + "?marker=" + encodeURIComponent(marker),
      { method, redirect: "error", signal: AbortSignal.timeout(10000) },
    );
    if (!response.ok) throw Error(`Capture service HTTP ${response.status}`);
    const text = await response.text();
    if (text.length > 1000000)
      throw Error("Capture service response exceeds limit");
    return JSON.parse(text);
  }
  const scope = configured
    ? "Configured isolated local form and capture adapter; not a production or staff-mailbox test"
    : "Local synthetic form and local capture inbox; no staff email or production form was tested";
  try {
    for (const device of ["desktop", "mobile"])
      for (const mode of [
        "success",
        "no-attachment",
        "validation",
        "network",
        "server",
        "malformed",
        "lost-response",
        "oversized",
        "disallowed",
      ]) {
        const marker = `WEBTOOLS-TEST-${randomUUID()}`;
        markers.push(marker);
        const row = {
          device,
          mode,
          marker,
          state: "failed",
          receiptVerified: false,
          cleanupVerified: false,
        };
        rows.push(row);
        if (
          (mode === "validation" && !p.nativeValidation) ||
          (["no-attachment", "oversized", "disallowed"].includes(mode) &&
            !s.attachment)
        ) {
          row.state = "not-applicable";
          row.reason = "Not supported by this form profile";
          continue;
        }
        const context = await browser.newContext({
          viewport:
            device === "mobile"
              ? { width: 390, height: 844 }
              : { width: 1440, height: 1000 },
          reducedMotion: "reduce",
        });
        try {
          let blocked = 0;
          await context.route("**/*", (route) =>
            new URL(route.request().url()).origin === base
              ? route.continue()
              : (blocked++, route.abort()),
          );
          const page = await context.newPage();
          await page.goto(base);
          if (s.marker)
            await page
              .locator(s.marker)
              .evaluate((node, value) => (node.value = value), marker);
          await page.locator(s.name).fill("Fictional release test");
          await page.locator(s.email).fill("test@example.invalid");
          if (s.company)
            await page
              .locator(s.company)
              .fill(device === "mobile" ? "" : "Synthetic Company");
          await page
            .locator(s.message)
            .fill(marker + " Synthetic form delivery rehearsal");
          const attachment = docxFixture(marker),
            invalid = ["oversized", "disallowed"].includes(mode);
          if (s.attachment && mode !== "no-attachment")
            await page.locator(s.attachment).setInputFiles({
              name: mode === "disallowed" ? "test.exe" : "test.docx",
              mimeType:
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              buffer:
                mode === "oversized"
                  ? Buffer.alloc(p.maxAttachmentBytes + 1)
                  : attachment,
            });
          if (
            ["network", "server", "malformed", "lost-response"].includes(mode)
          )
            await page.route(matchRequest, async (route) => {
              if (mode === "lost-response") {
                await route.fetch({ maxRedirects: 0 });
                return route.abort();
              }
              if (mode === "network")
                return route.abort("internetdisconnected");
              return route.fulfill({
                status: mode === "server" ? 503 : 200,
                contentType: "text/html",
                body: "Unavailable fixture",
              });
            });
          if (mode === "validation") {
            let submissions = 0;
            page.on("request", (req) => {
              if (matchRequest(new URL(req.url()))) submissions++;
            });
            await page.locator(s.name).fill("");
            await page.locator(s.email).fill("not-an-email");
            await page.locator(s.submit).click();
            requireThat(
              (await page
                .locator(s.form)
                .evaluate((f) => !f.checkValidity())) && submissions === 0,
              "Invalid required fields were submitted",
            );
            await page.locator(s.name).fill("Fictional release test");
            await page.locator(s.email).fill("test@example.invalid");
            row.validationVerified = true;
          }
          const waitState = () =>
            page.waitForFunction(
              ({ selector, attribute, success, failure }) =>
                [success, failure].includes(
                  document.querySelector(selector)?.getAttribute(attribute),
                ),
              {
                selector: s.form,
                attribute: p.stateAttribute,
                success: p.successState,
                failure: p.failureState,
              },
            );
          await page.locator(s.submit).click();
          await waitState();
          const expectFailure = ![
            "success",
            "no-attachment",
            "validation",
          ].includes(mode);
          requireThat(
            (await page.locator(s.form).getAttribute(p.stateAttribute)) ===
              (expectFailure ? p.failureState : p.successState),
            "Unexpected confirmation state",
          );
          if (expectFailure) {
            requireThat(
              (await page.locator(s.message).inputValue()) ===
                marker + " Synthetic form delivery rehearsal",
              "Entered message was lost",
            );
            requireThat(
              await page.locator(s.submit).isEnabled(),
              "Retry is disabled",
            );
            requireThat(
              await page
                .locator(s.feedback)
                .evaluate((n) => n === document.activeElement),
              "Error feedback did not receive focus",
            );
            const prior = await inbox(marker);
            requireThat(
              prior.messages.length === (mode === "lost-response" ? 1 : 0),
              "Unexpected delivery before retry",
            );
            await page.unroute(matchRequest);
            if (mode === "lost-response") {
              row.deliveryFoundAfterResponseLoss = true;
              row.retrySuppressed = true;
            } else {
              if (invalid)
                await page.locator(s.attachment).setInputFiles({
                  name: "test.docx",
                  mimeType:
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                  buffer: attachment,
                });
              await page.locator(s.submit).click();
              await page.waitForFunction(
                ({ selector, attribute, success }) =>
                  document.querySelector(selector)?.getAttribute(attribute) ===
                  success,
                {
                  selector: s.form,
                  attribute: p.stateAttribute,
                  success: p.successState,
                },
              );
              requireThat(
                (await page.locator(s.form).getAttribute(p.stateAttribute)) ===
                  p.successState,
                "Manual retry did not recover",
              );
              row.retryVerified = true;
            }
          }
          const delivered = await inbox(marker);
          requireThat(
            delivered.messages.length === 1,
            "Expected exactly one captured receipt",
          );
          const receipt = delivered.messages[0];
          requireThat(
            receipt.recipient === p.recipient,
            "Wrong capture inbox recipient",
          );
          requireThat(
            receipt.marker === marker && receipt.message.includes(marker),
            "Receipt marker mismatch",
          );
          requireThat(
            receipt.name === "Fictional release test" &&
              receipt.email === "test@example.invalid",
            "Receipt identity mismatch",
          );
          requireThat(
            receipt.company ===
              (s.company && device === "desktop" ? "Synthetic Company" : ""),
            "Optional company field mismatch",
          );
          const hasAttachment = s.attachment && mode !== "no-attachment";
          requireThat(
            hasAttachment
              ? receipt.attachments.length === 1 &&
                  receipt.attachments[0].sha256 === sha(attachment)
              : receipt.attachments.length === 0,
            "Attachment receipt mismatch",
          );
          requireThat(blocked === 0, "Form attempted an external request");
          row.receiptVerified = true;
          row.receipt = {
            recipient: receipt.recipient,
            receivedAt: receipt.receivedAt,
            attachmentSha256: receipt.attachments[0]?.sha256,
            attachmentBytes: receipt.attachments[0]?.bytes,
          };
          row.screenshot = `forms/${device}-${mode}.png`;
          const capture = await page.screenshot({
            path: resolve(out, row.screenshot),
            fullPage: true,
          });
          row.capture = {
            file: row.screenshot,
            sha256: sha(capture),
            url: base,
            viewport: page.viewportSize(),
            capturedAt: new Date().toISOString(),
            scope: "Full local test page",
          };
          row.state = "passed";
        } catch (error) {
          row.error = error.message;
        } finally {
          await context.close();
          try {
            await inbox(marker, "DELETE");
            const remaining = await inbox(marker);
            row.cleanupVerified = remaining.messages.length === 0;
          } catch (error) {
            row.cleanupError = error.message;
          }
          if (!row.cleanupVerified) {
            row.state = "failed";
            row.error = "Test record cleanup failed";
          }
          await writeJson(resolve(out, "form-results.json"), {
            version: 1,
            tool: "form-rehearsal",
            projectId: project.id,
            scope,
            rows,
          });
        }
      }
    return {
      version: 1,
      tool: "form-rehearsal",
      projectId: project.id,
      scope,
      mode: configured ? "configured-local" : "fixture",
      state: rows.every((r) => ["passed", "not-applicable"].includes(r.state))
        ? "passed"
        : "failed",
      browser: browser.version(),
      rows,
      cleanupVerified: rows
        .filter((r) => r.state !== "not-applicable")
        .every((r) => r.cleanupVerified),
      unrelatedRecordPreserved: service.messages
        ? service.messages.has("unrelated-existing-record")
        : null,
    };
  } finally {
    if (service.messages)
      for (const marker of markers) service.messages.delete(marker);
    await browser.close();
    await service.close();
  }
}
