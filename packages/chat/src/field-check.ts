/** 106: one field's check on a form card; `transient` means the check itself couldn't run, shown but never blocking. */
/** `note` (107): a line the tool says about the input as edited, shown beside a passing check. */
export type FieldCheck = { field?: string; message?: string; transient?: boolean; note?: string };

export const CHECK_FAILED: FieldCheck = { message: "Couldn't check that just now.", transient: true };
