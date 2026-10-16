/** What each role is for, in words a volunteer can read, and which console pages it opens.
 *
 *  This is the one place that says it. The console's navigation, the volunteer's
 *  own desk and the form an admin uses to assign a role all read from here, so
 *  they cannot drift apart. It describes; it does not authorise. What a role can
 *  actually do is decided by the database policies that name it, and the pages
 *  below ask the database who the person is rather than trusting this list.
 *
 *  Plain JavaScript so scripts/test-roles.mjs can check it against the console.
 *
 *  The honest part: a role opens a page only if there is something real behind it.
 *  "Moderator" and "editor" are shown with what they will do when the thing they
 *  look after is open, and today it is not. Saying so is better than a console
 *  that looks busy and does nothing.
 */

/** The four roles an admin may assign from the user portal. */
export const VOLUNTEER_ROLES = ['reviewer', 'moderator', 'editor', 'translator'];

export const ROLE_INFO = {
  translator: {
    name: 'Language reviewer',
    short: 'Reads translations and approves them, or corrects them first.',
    purposeHint: 'e.g. Hindi review',
    can: [
      'Open the translation desk and read each lesson beside its English source.',
      'Correct a draft and mark it reviewed, in the language you were given.',
    ],
    cannot: [
      'Publish a language you were not given, or approve a page you have not read.',
      'Change the English lesson, or see any learner.',
    ],
    pages: ['/admin/desk', '/admin/translations'],
    today: 'Live. Machine drafts wait here until a person reads them; nothing reaches a learner before then.',
  },
  reviewer: {
    name: 'Assessment reviewer',
    short: 'Bands written answers for the certificate assessment.',
    purposeHint: 'e.g. E7 written answers',
    can: ['Read answers from the review queue, without the learner’s name, and band them against the published rubric.'],
    cannot: ['Revoke or edit a certificate, see who wrote an answer, or change the rubric.'],
    pages: ['/admin/desk', '/admin/certification'],
    today: 'The queue is open to you. Certification itself stays closed until two reviewers agree on twenty samples.',
  },
  moderator: {
    name: 'Moderator',
    short: 'Reads posts in rooms and Ask Doubts before they are visible.',
    purposeHint: 'e.g. Ask Doubts',
    can: ['Approve, hide or escalate posts in the sections you were given.'],
    cannot: ['Open a section, see a private message (there are none), or remove a person.'],
    pages: ['/admin/desk'],
    today: 'Nothing to moderate yet: rooms and Ask Doubts are closed until the child-safety conditions hold. Your queue appears here the day they open.',
  },
  editor: {
    name: 'Editor',
    short: 'Corrects and improves lessons.',
    purposeHint: 'e.g. Explorer lessons',
    can: ['Read the weekly freshness report and propose a correction on the project’s public repository.'],
    cannot: ['Publish a change on your own: an owner merges it, so every correction is reviewed and dated.'],
    pages: ['/admin/desk'],
    today: 'Corrections go through the public repository for now. The freshness report is linked from your desk.',
  },
  sub_admin: {
    name: 'Sub-admin',
    short: 'One specialist task, for a set time.',
    purposeHint: '',
    can: ['Work the queue for the one task you were given.'],
    cannot: ['Anything outside that task. Access ends on the date shown.'],
    pages: ['/admin/desk', '/admin/decisions'],
    today: 'Live.',
  },
  admin: {
    name: 'Admin',
    short: 'Owns one surface end to end.',
    purposeHint: '',
    can: ['Everything in the console except what is reserved to an owner.'],
    cannot: ['Delete, change owners, or move money or policy. Those are proposed, and an owner decides.'],
    pages: ['/admin', '/admin/decisions', '/admin/people', '/admin/users', '/admin/sections', '/admin/analytics', '/admin/sky', '/admin/certification', '/admin/translations', '/admin/desk'],
    today: 'Live.',
  },
  super_admin: {
    name: 'Owner',
    short: 'Everything, including deletion, roles, money and policy.',
    purposeHint: '',
    can: ['All of it.'],
    cannot: ['Remove the last owner, or appoint one alone: a second owner must confirm.'],
    pages: ['/admin', '/admin/decisions', '/admin/people', '/admin/users', '/admin/sections', '/admin/analytics', '/admin/sky', '/admin/certification', '/admin/translations', '/admin/desk'],
    today: 'Live.',
  },
};

/** Every console tab, with the roles that may open it. An owner or an admin may open all of them. */
export const ADMIN_TABS = [
  { href: '/admin', label: 'Overview', roles: ['*staff'] },
  { href: '/admin/desk', label: 'My desk', roles: ['*staff'] },
  { href: '/admin/decisions', label: 'Decisions', roles: ['sub_admin'] },
  { href: '/admin/people', label: 'People & roles', roles: [] },
  { href: '/admin/users', label: 'Users', roles: [] },
  { href: '/admin/sections', label: 'Sections', roles: [] },
  { href: '/admin/analytics', label: 'Analytics', roles: [] },
  { href: '/admin/sky', label: 'Sky', roles: [] },
  { href: '/admin/certification', label: 'Certification', roles: ['reviewer'] },
  { href: '/admin/translations', label: 'Translations', roles: ['translator', 'editor'] },
];

/** Which tabs a person with these roles sees. `roles` is a list of role names; owner and admin see everything. */
export function tabsFor(roles) {
  const held = new Set(roles ?? []);
  const all = held.has('super_admin') || held.has('admin');
  return ADMIN_TABS.filter((t) => all || t.roles.some((r) => (r === '*staff' ? held.size > 0 : held.has(r))));
}

/** May someone holding `roles` open a page that allows `allow`?
 *  allow: 'admin' (owner or admin), 'staff' (anyone holding any role), or a list of extra roles.
 *  @param {string[]} roles @param {'admin'|'staff'|string[]} [allow] */
export function mayOpen(roles, allow = 'admin') {
  const held = new Set(roles ?? []);
  if (held.has('super_admin') || held.has('admin')) return true;
  if (allow === 'staff') return held.size > 0;
  if (Array.isArray(allow)) return allow.some((r) => held.has(r));
  return false;
}
