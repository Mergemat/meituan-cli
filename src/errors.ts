/** A mistake the caller can fix. Printed as one line with no stack, so agents read it cheaply. */
export class UserError extends Error {}

/** Meituan refused the cart because a dish needs add-ons (必选小料) that only its app can choose. */
export class AppOnlyError extends UserError {}
