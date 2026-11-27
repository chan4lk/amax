type Owner = (strings: TemplateStringsArray, ...values: any[]) => PromiseLike<unknown>;

export const tracked = (category: "dev" | "uat" | "prod" = "uat") => ({ name: "Test release", category, startDate: "2026-10-01", targetDate: "2026-12-31" });

export const verify = (owner: Owner, ...keys: string[]) => owner`update delivery.proposal set phase = 'verified' where key = any(${keys})`;
