import { createRequire } from "node:module";

// One wording table for every finding any collector can emit.
// `say` is the plain statement, `why` is what it means for a visitor,
// `decide` is what someone has to choose or arrange, and `rank` orders
// findings by consequence (1 first).
// tests/wording.test.mjs fails when a collector can emit a type missing here.
export const wording = {
  // Collection
  "collection:skipped": {
    say: "Some pages could not be checked",
    why: "The page did not load, or loaded without a visible main heading, so nothing on it was measured.",
    decide: "Confirm whether these pages should be live.",
    rank: 1,
  },
  "collection:error": {
    say: "Part of the check did not complete",
    why: "The result for these pages is unknown, not good.",
    decide: "Run the check again before relying on this report.",
    rank: 2,
  },

  // Performance and cache
  "performance:poor": {
    say: "Pages load slowly",
    why: "Google's test scores these pages below 50 out of 100. Visitors wait noticeably before they can read or tap.",
    decide: "Decide whether to investigate speed before anything else.",
    rank: 2,
  },
  "performance:needs-work": {
    say: "Pages load slower than they could",
    why: "Google's test scores these pages between 50 and 89 out of 100.",
    rank: 4,
  },
  "cache:slow-uncached": {
    say: "Pages are slow when they are not already stored by the server",
    why: "The first visitor after a change, and anyone on a rarely visited page, waits several times longer than everyone else.",
    decide:
      "Ask whoever manages hosting how pages are cached and for how long.",
    rank: 3,
  },

  // Accessibility: named rules
  "axe:color-contrast": {
    say: "Some text is hard to read against its background",
    why: "People with low vision, and anyone on a phone in daylight, struggle to read it.",
    decide:
      "Choose whether to adjust the colours that fail, including brand colours.",
    rank: 2,
  },
  "axe:image-alt": {
    say: "Some images have no text description",
    why: "A screen reader announces nothing useful for them, so blind visitors miss the content.",
    decide: "Someone who knows the content needs to write the descriptions.",
    rank: 2,
  },
  "axe:link-name": {
    say: "Some links have no readable name",
    why: "A screen reader says only “link”, so the visitor cannot tell where it goes.",
    rank: 2,
  },
  "axe:button-name": {
    say: "Some buttons have no readable name",
    why: "A screen reader says only “button”, so the visitor cannot tell what it does.",
    rank: 2,
  },
  "axe:label": {
    say: "Some form fields have no label",
    why: "Visitors using a screen reader cannot tell what to type in them.",
    rank: 2,
  },
  "axe:select-name": {
    say: "Some drop-down menus have no label",
    why: "Visitors using a screen reader cannot tell what the menu chooses.",
    rank: 2,
  },
  "axe:input-image-alt": {
    say: "Some image buttons have no text description",
    why: "A screen reader cannot say what the button does.",
    rank: 2,
  },
  "axe:label-content-name-mismatch": {
    say: "Some controls are announced with a different name from the one shown",
    why: "People who use voice control say what they see, and the control does not respond.",
    rank: 3,
  },
  "axe:html-has-lang": {
    say: "The page does not state its language",
    why: "Screen readers may read it with the wrong pronunciation.",
    rank: 3,
  },
  "axe:html-lang-valid": {
    say: "The page states a language code that does not exist",
    why: "Screen readers may read it with the wrong pronunciation.",
    rank: 3,
  },
  "axe:document-title": {
    say: "The page has no title",
    why: "Browser tabs, bookmarks and screen readers have nothing to call it.",
    rank: 2,
  },
  "axe:frame-title": {
    say: "Some embedded content has no title",
    why: "A screen reader cannot say what the embedded video, map or form is.",
    rank: 3,
  },
  "axe:meta-viewport": {
    say: "The page stops visitors zooming in",
    why: "People who need larger text cannot enlarge it on a phone.",
    rank: 2,
  },
  "axe:list": {
    say: "Some lists are built incorrectly",
    why: "A screen reader may not announce them as lists or may miscount the items.",
    rank: 4,
  },
  "axe:listitem": {
    say: "Some list items sit outside a list",
    why: "A screen reader may not announce them as a list.",
    rank: 4,
  },
  "axe:link-in-text-block": {
    say: "Some links in text are marked only by colour",
    why: "People who cannot tell the colours apart cannot see that they are links.",
    rank: 3,
  },
  "axe:nested-interactive": {
    say: "Some controls are placed inside other controls",
    why: "Keyboard and screen reader users may not be able to reach or use the inner one.",
    rank: 2,
  },
  "axe:scrollable-region-focusable": {
    say: "A scrolling area cannot be reached with the keyboard",
    why: "People who do not use a mouse cannot scroll it to read the rest.",
    rank: 2,
  },
  "axe:bypass": {
    say: "There is no way to skip past the repeated header",
    why: "Keyboard users must tab through the whole menu on every page.",
    rank: 3,
  },
  "axe:duplicate-id-aria": {
    say: "Some labels point at more than one element",
    why: "A screen reader may announce the wrong label for a field.",
    rank: 3,
  },
  "axe:video-caption": {
    say: "Some videos have no captions",
    why: "Deaf visitors, and anyone with the sound off, miss what is said.",
    decide: "Decide who will provide captions.",
    rank: 2,
  },
  "axe:target-size": {
    say: "Some buttons or links are too small to tap reliably",
    why: "Visitors on a phone, or with limited dexterity, hit the wrong thing.",
    rank: 3,
  },

  // Accessibility: every other rule, by the kind of problem
  "axe-kind:aria": {
    say: "Some accessibility labelling in the code is incorrect",
    why: "Screen readers may announce parts of the page wrongly or skip them.",
    rank: 3,
  },
  "axe-kind:color": {
    say: "Some content relies on colour that not everyone can see",
    why: "People with low vision or colour blindness may miss it.",
    rank: 3,
  },
  "axe-kind:forms": {
    say: "Some form fields are not properly labelled",
    why: "Visitors using a screen reader or autofill cannot tell what each field is for.",
    rank: 2,
  },
  "axe-kind:keyboard": {
    say: "Some parts of the page are hard to use without a mouse",
    why: "People who navigate by keyboard cannot reach or operate them.",
    rank: 2,
  },
  "axe-kind:language": {
    say: "The language of some content is not stated correctly",
    why: "Screen readers may read it with the wrong pronunciation.",
    rank: 3,
  },
  "axe-kind:name-role-value": {
    say: "Some controls have no readable name",
    why: "A screen reader cannot say what they are or what they do.",
    rank: 2,
  },
  "axe-kind:parsing": {
    say: "Some of the page's code is malformed",
    why: "Assistive technology may misread the affected parts.",
    rank: 4,
  },
  "axe-kind:semantics": {
    say: "Some headings or page regions are not marked up as such",
    why: "Screen reader users cannot jump around the page by its structure.",
    rank: 3,
  },
  "axe-kind:sensory-and-visual-cues": {
    say: "Some content cannot be resized or seen comfortably",
    why: "People who need larger text or a different layout cannot adjust it.",
    rank: 3,
  },
  "axe-kind:structure": {
    say: "Some lists or groups are built incorrectly",
    why: "A screen reader may announce them in a confusing way.",
    rank: 4,
  },
  "axe-kind:tables": {
    say: "Some tables do not identify their headings",
    why: "A screen reader cannot say which column or row a value belongs to.",
    rank: 3,
  },
  "axe-kind:text-alternatives": {
    say: "Some images or media have no text description",
    why: "Visitors who cannot see them get nothing in their place.",
    rank: 2,
  },
  "axe-kind:time-and-media": {
    say: "Some moving, timed or audio content cannot be paused or read",
    why: "People who need more time, or who cannot hear, miss it.",
    rank: 2,
  },

  // Security
  "header:strict-transport-security": {
    say: "Browsers are not told to always use the secure connection",
    why: "On shared Wi-Fi a visitor can be pushed onto an insecure copy of the site.",
    decide: "Ask whoever manages hosting to add the missing security headers.",
    rank: 3,
  },
  "header:content-security-policy": {
    say: "The site does not limit which scripts may run on it",
    why: "If a third-party script is tampered with, nothing stops it running for every visitor.",
    decide: "Ask whoever manages hosting to add the missing security headers.",
    rank: 3,
  },
  "header:x-content-type-options": {
    say: "Browsers are left to guess the type of some files",
    why: "A wrongly guessed file can be run as a script. This is a one-line hosting setting.",
    decide: "Ask whoever manages hosting to add the missing security headers.",
    rank: 4,
  },
  "header:referrer-policy": {
    say: "The site does not control what it tells other sites about its visitors",
    why: "Full page addresses can be passed on when a visitor follows a link out.",
    decide: "Ask whoever manages hosting to add the missing security headers.",
    rank: 4,
  },
  "redirect:not-https": {
    say: "The insecure address does not send visitors to the secure one",
    why: "Someone typing the address without https may stay on an unencrypted connection.",
    decide: "Ask whoever manages hosting to redirect http to https.",
    rank: 2,
  },
  "form:insecure": {
    say: "A form sends what visitors type over an unencrypted connection",
    why: "Anything entered can be read in transit.",
    decide: "Fix before launch.",
    rank: 1,
  },
  "tls:problem": {
    say: "The security certificate has a problem",
    why: "Browsers may warn visitors away from the site.",
    decide: "Ask whoever manages hosting to renew or correct the certificate.",
    rank: 1,
  },
  "email:spf-missing": {
    say: "The domain does not say which servers may send its email",
    why: "Messages from the site's forms are more likely to land in spam, and others can more easily fake the address.",
    decide: "Ask whoever manages the domain to add an SPF record.",
    rank: 3,
  },
  "email:dmarc-missing": {
    say: "The domain has no policy for email that fails its checks",
    why: "Faked messages using the domain are harder for recipients to reject.",
    decide: "Ask whoever manages the domain to add a DMARC record.",
    rank: 3,
  },

  // Discovery
  "discovery:http-status": {
    say: "A listed page does not load normally",
    why: "Visitors and search engines get an error or are sent elsewhere.",
    decide: "Confirm whether this page should exist.",
    rank: 1,
  },
  "discovery:noindex": {
    say: "Search engines are told not to list these pages",
    why: "They will not appear in search results.",
    decide:
      "Confirm this is intended. It is right for a preview, wrong for a launched site.",
    rank: 2,
  },
  "discovery:title-missing": {
    say: "Some pages have no title",
    why: "Search results and browser tabs have nothing to show for them.",
    rank: 2,
  },
  "discovery:canonical-missing": {
    say: "Some pages do not state their preferred address",
    why: "Search engines may treat copies of the page as competing pages.",
    rank: 4,
  },
  "discovery:canonical-multiple": {
    say: "Some pages state more than one preferred address",
    why: "Search engines cannot tell which one to list.",
    rank: 3,
  },
  "discovery:sharing-missing": {
    say: "Links shared on social media or in messages will look bare",
    why: "The title, description or picture that makes a shared link inviting is missing.",
    decide:
      "Someone needs to choose the description and image for these pages.",
    rank: 4,
  },
  "discovery:broken-links": {
    say: "Some links on these pages lead nowhere",
    why: "Visitors who follow them reach an error page.",
    decide: "Each broken link needs fixing or removing.",
    rank: 2,
  },
  "discovery:not-in-sitemap": {
    say: "Some pages are missing from the list the site gives search engines",
    why: "They may be found late or not at all.",
    rank: 4,
  },

  // Watch
  "watch:no-baseline": {
    say: "This is the first look at the site, so there is nothing to compare it with yet",
    why: "Once these pictures are accepted, later checks report only what has changed.",
    decide:
      "Look through the captures and confirm the site is as it should be.",
    rank: 1,
  },
  "watch:capture-failed": {
    say: "A page could not be captured",
    why: "The page did not load or settle, so it has not been checked.",
    decide: "Open the page and see whether it is working.",
    rank: 1,
  },
  "watch:changed": {
    say: "A page looks different from the accepted version",
    why: "Something visible has changed since the site was last reviewed.",
    decide:
      "Say whether each change is intended. If it is, it becomes the new normal.",
    rank: 2,
  },
  "watch:dimensions": {
    say: "A page has become longer or shorter",
    why: "Content has been added, removed or has stopped loading.",
    decide:
      "Say whether each change is intended. If it is, it becomes the new normal.",
    rank: 2,
  },
  "watch:small-change": {
    say: "A page has a very small visual difference",
    why: "Less than a thousandth of the page differs. This is usually a rotating image, a date or a rendering difference.",
    rank: 5,
  },
  "watch:assertion-visible": {
    say: "Something that should be on the page is missing",
    why: "A part of the page this project relies on is no longer visible.",
    decide: "Find out what removed it.",
    rank: 1,
  },
  "watch:assertion-script": {
    say: "A script the site depends on is no longer loaded",
    why: "Whatever it provided, such as a survey, booking tool or analytics, has stopped working.",
    decide: "Find out what removed it.",
    rank: 1,
  },
  "watch:assertion-listing": {
    say: "An item that should be listed is missing",
    why: "Recent content is not appearing where visitors look for it.",
    decide: "Find out why the listing is not updating.",
    rank: 1,
  },
  "watch:assertion-style": {
    say: "A part of the page has lost its layout",
    why: "It still exists but is no longer displayed the way it was designed.",
    decide: "Find out what removed its styling.",
    rank: 1,
  },
  "watch:assertion-attribute": {
    say: "A piece of page information has changed",
    why: "Something set deliberately, such as the title shown when the page is shared, no longer matches.",
    decide: "Confirm whether the change is intended.",
    rank: 2,
  },
  "watch:new-finding": {
    say: "The site check found something it did not find last time",
    why: "A problem has appeared since the site was last reviewed.",
    rank: 2,
  },
  "watch:resolved-finding": {
    say: "Something the site check found last time has gone",
    why: "An earlier problem is no longer present.",
    rank: 5,
  },
  "watch:site-check-incomplete": {
    say: "The accompanying site check did not complete",
    why: "Accessibility, security and discovery were not compared this time.",
    decide: "Run the watch again.",
    rank: 2,
  },

  // Inventory
  "inventory:incomplete": {
    say: "The list of pages is not complete",
    why: "The crawl stopped at a limit or the site refused some requests, so there are pages this list does not include.",
    decide:
      "Decide whether to run it again later or work from this partial list.",
    rank: 1,
  },
  "inventory:errors": {
    say: "Some addresses return an error",
    why: "Visitors and search engines following these addresses reach an error page.",
    decide: "Each one needs a decision: restore it, redirect it or let it go.",
    rank: 2,
  },
  "inventory:redirects": {
    say: "Some addresses send visitors on to a different address",
    why: "These are existing redirects. A rebuilt site has to keep them or old links will break.",
    rank: 4,
  },
  "inventory:capture-failed": {
    say: "Some pages could not be pictured",
    why: "They are in the list but have no screenshot to review.",
    rank: 3,
  },
  "inventory:history-absent": {
    say: "Some addresses recorded earlier were not found this time",
    why: "They may have been removed, or may simply not be linked from anywhere now.",
    decide: "Check these before assuming they are gone.",
    rank: 3,
  },

  // Redirect check
  "redirect-check:failed": {
    say: "Some old addresses do not end up where the plan says",
    why: "Visitors and search engines following old links would reach the wrong page or an error.",
    decide: "For each one, fix the site or change the plan.",
    rank: 1,
  },
  "redirect-check:partial-map": {
    say: "Some pages have no decision yet, so they were not checked",
    why: "Only pages with a decision are covered by this result.",
    decide: "Finish the remaining page decisions.",
    rank: 2,
  },

  // Release
  "release:failed": {
    say: "The rehearsal did not complete",
    why: "The release has not been shown to apply and reverse cleanly.",
    decide: "Do not release until the cause is understood.",
    rank: 1,
  },
  "release:form-failed": {
    say: "A form test did not pass",
    why: "A message sent through a form might not arrive, or a failure might not be shown to the visitor.",
    decide: "Fix before launch.",
    rank: 1,
  },

  // Investigation
  "maximum:partial": {
    say: "The investigation could not collect everything it set out to",
    why: "Some pages or journeys failed, so conclusions cover only what was collected.",
    rank: 2,
  },
  "maximum:answered": {
    say: "The investigation recorded a result",
    why: "See the measurements below.",
    rank: 2,
  },
  "maximum:unresolved": {
    say: "The question is not yet answered",
    why: "The measurements were too variable, incomplete or mixed with other differences to name a cause.",
    decide: "Decide whether to test another suspected cause.",
    rank: 2,
  },
};

const require = createRequire(import.meta.url);
let kinds;
// Group the long tail of accessibility rules by the kind of problem they describe.
export function axeKind(rule) {
  if (!kinds) {
    kinds = new Map();
    for (const r of require("axe-core").getRules())
      kinds.set(r.ruleId, r.tags.find((t) => t.startsWith("cat."))?.slice(4));
  }
  return kinds.get(rule);
}
const impactRank = { critical: 1, serious: 2, moderate: 3, minor: 4 };

// Never throws: an unknown type still reads sensibly, and the test catches it.
export function describe(type, { impact } = {}) {
  let entry = wording[type];
  if (!entry && type.startsWith("axe:"))
    entry = wording[`axe-kind:${axeKind(type.slice(4))}`];
  if (!entry)
    return {
      say: `The check reported “${type.split(":").pop()}”`,
      why: "See the detail below.",
      rank: 3,
      known: false,
    };
  return {
    ...entry,
    rank: impact
      ? Math.min(entry.rank, impactRank[impact] ?? entry.rank)
      : entry.rank,
    known: true,
  };
}
