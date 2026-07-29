import { describe, expect, it } from "vitest";

import {
  checkDuePlausibility,
  classifyRecurrence,
  computeInternalDueDate,
  defaultLeadDays,
  expandRecurrence,
  findDatesInText,
} from "@/lib/domain/dates";

describe("findDatesInText — fully specified dates only", () => {
  const isos = (text: string) => findDatesInText(text).map((date) => date.iso);

  it("reads a long-form American date", () => {
    expect(isos("The report is due January 31, 2027 without exception.")).toEqual(["2027-01-31"]);
  });

  it("reads an abbreviated month with a trailing period", () => {
    expect(isos("Due Jan. 31, 2027.")).toEqual(["2027-01-31"]);
  });

  it("reads a long-form date with an ordinal suffix and no comma", () => {
    expect(isos("Payable on March 1st 2026 by transfer.")).toEqual(["2026-03-01"]);
  });

  it("reads a day-first date", () => {
    expect(isos("Submitted 31 January 2027 to the funder.")).toEqual(["2027-01-31"]);
  });

  it("reads an ISO date", () => {
    expect(isos("Period ends 2027-01-31 at midnight.")).toEqual(["2027-01-31"]);
  });

  it("reads a US numeric date as month/day/year", () => {
    expect(isos("Invoice dated 1/31/2027 was received.")).toEqual(["2027-01-31"]);
  });

  it("reads a two-digit numeric date", () => {
    expect(isos("Effective 12/01/2026.")).toEqual(["2026-12-01"]);
  });

  it("returns the matched wording and index alongside the ISO date", () => {
    const text = "The final report is due January 31, 2027.";
    const [found] = findDatesInText(text);

    expect(found.iso).toBe("2027-01-31");
    expect(found.text).toBe("January 31, 2027");
    expect(text.slice(found.index, found.index + found.text.length)).toBe("January 31, 2027");
  });

  it("returns every date in the order it appears", () => {
    expect(
      isos("From March 1, 2026 through February 28, 2027, and again on 2028-01-15."),
    ).toEqual(["2026-03-01", "2027-02-28", "2028-01-15"]);
  });

  it("ignores a bare year", () => {
    expect(findDatesInText("The 2027 fiscal year begins soon.")).toEqual([]);
  });

  it("ignores a month and year with no day", () => {
    expect(findDatesInText("Reports are due in January 2027.")).toEqual([]);
    expect(findDatesInText("The award closes February 2028 and is final.")).toEqual([]);
  });

  it("ignores a month with no year", () => {
    expect(findDatesInText("Due January 31 of the following year.")).toEqual([]);
  });

  it("rejects an invalid month name", () => {
    expect(findDatesInText("Filed Smarch 12, 2027 by the recipient.")).toEqual([]);
    expect(findDatesInText("Filed Foober 12, 2027 by the recipient.")).toEqual([]);
  });

  it("rejects an out-of-range day", () => {
    expect(findDatesInText("Due January 45, 2027.")).toEqual([]);
    expect(findDatesInText("Due 45 January 2027.")).toEqual([]);
  });

  it("rejects an out-of-range numeric month", () => {
    expect(findDatesInText("Dated 13/05/2027.")).toEqual([]);
  });

  it("rejects an out-of-range ISO month or day", () => {
    expect(findDatesInText("Dated 2027-13-05.")).toEqual([]);
    expect(findDatesInText("Dated 2027-05-45.")).toEqual([]);
  });

  it("rejects years outside a sane award window", () => {
    expect(findDatesInText("Signed January 31, 1899.")).toEqual([]);
    expect(findDatesInText("Signed January 31, 2999.")).toEqual([]);
  });

  it("returns nothing for text with no dates at all", () => {
    expect(findDatesInText("The Grantee shall retain all records.")).toEqual([]);
  });

  it("does not treat a section number as a date", () => {
    expect(findDatesInText("See Section 3.1 and Article 5.2 of this Agreement.")).toEqual([]);
  });

  it("rejects a day that does not exist in that month", () => {
    // A structurally well-formed date that is not a real calendar date must
    // never become a deadline.
    expect(findDatesInText("Due February 30, 2027.")).toEqual([]);
    expect(findDatesInText("Due April 31, 2027.")).toEqual([]);
    expect(findDatesInText("Due 2027-02-29.")).toEqual([]);
  });

  it("accepts 29 February in a leap year but not in a common year", () => {
    expect(findDatesInText("Due February 29, 2028.").map((d) => d.iso)).toEqual(["2028-02-29"]);
    expect(findDatesInText("Due February 29, 2027.")).toEqual([]);
  });
});

describe("checkDuePlausibility", () => {
  const award = { startDate: "2026-03-01", endDate: "2027-02-28" };

  it("accepts any date when the award period is unknown", () => {
    expect(checkDuePlausibility("1999-01-01", { startDate: null, endDate: null })).toEqual({
      plausible: true,
      reason: null,
    });
  });

  it("accepts a date inside the award period", () => {
    expect(checkDuePlausibility("2026-09-30", award).plausible).toBe(true);
  });

  it("accepts a closeout date shortly after the award period ends", () => {
    expect(checkDuePlausibility("2027-04-30", award).plausible).toBe(true);
    expect(checkDuePlausibility("2028-02-28", award).plausible).toBe(true);
  });

  it("accepts a date modestly before the award period begins", () => {
    expect(checkDuePlausibility("2025-12-01", award).plausible).toBe(true);
  });

  it("rejects a date far before the award period begins", () => {
    // The classic "2016 transcribed for 2026" failure.
    const verdict = checkDuePlausibility("2016-04-30", award);
    expect(verdict.plausible).toBe(false);
    expect(verdict.reason).toContain("before the award period begins");
    expect(verdict.reason).toContain("2026-03-01");
  });

  it("rejects a date far beyond the award period end", () => {
    const verdict = checkDuePlausibility("2035-01-01", award);
    expect(verdict.plausible).toBe(false);
    expect(verdict.reason).toContain("far beyond the end of the award period");
    expect(verdict.reason).toContain("2027-02-28");
  });

  it("allows a long records-retention style date within the trailing grace", () => {
    // Retention and final audits genuinely run years past the end date.
    expect(checkDuePlausibility("2030-01-01", award).plausible).toBe(true);
  });

  it("checks only the end date when no start date is known", () => {
    expect(checkDuePlausibility("2000-01-01", { startDate: null, endDate: "2027-02-28" }).plausible).toBe(
      true,
    );
    expect(checkDuePlausibility("2040-01-01", { startDate: null, endDate: "2027-02-28" }).plausible).toBe(
      false,
    );
  });

  it("checks only the start date when no end date is known", () => {
    expect(checkDuePlausibility("2040-01-01", { startDate: "2026-03-01", endDate: null }).plausible).toBe(
      true,
    );
    expect(checkDuePlausibility("2000-01-01", { startDate: "2026-03-01", endDate: null }).plausible).toBe(
      false,
    );
  });
});

describe("defaultLeadDays", () => {
  it("gives long-running work a longer runway", () => {
    expect(defaultLeadDays("audit", "medium")).toBe(60);
    expect(defaultLeadDays("renewal_continuation", "medium")).toBe(60);
    expect(defaultLeadDays("closeout", "medium")).toBe(45);
  });

  it("gives routine reporting three weeks", () => {
    expect(defaultLeadDays("reporting", "medium")).toBe(21);
    expect(defaultLeadDays("financial", "medium")).toBe(21);
  });

  it("gives quick tasks a short runway", () => {
    expect(defaultLeadDays("communications_branding", "medium")).toBe(7);
    expect(defaultLeadDays("records_retention", "medium")).toBe(7);
  });

  it("falls back to two weeks for a category with no specific rule", () => {
    expect(defaultLeadDays("other", "medium")).toBe(14);
    expect(defaultLeadDays("allowable_cost", "medium")).toBe(14);
    expect(defaultLeadDays("restricted_use", "medium")).toBe(14);
  });

  it("raises a critical item to at least 30 days", () => {
    expect(defaultLeadDays("communications_branding", "critical")).toBe(30);
    expect(defaultLeadDays("other", "critical")).toBe(30);
  });

  it("never shortens a critical item that already needs longer", () => {
    expect(defaultLeadDays("audit", "critical")).toBe(60);
  });

  it("caps a low-priority item at a week", () => {
    expect(defaultLeadDays("audit", "low")).toBe(7);
    expect(defaultLeadDays("reporting", "low")).toBe(7);
  });

  it("never lengthens a low-priority item that is already short", () => {
    expect(defaultLeadDays("communications_branding", "low")).toBe(7);
  });
});

describe("computeInternalDueDate", () => {
  it("never invents a preparation date when there is no due date", () => {
    expect(computeInternalDueDate(null, 21, "reporting", "high")).toBeNull();
    expect(computeInternalDueDate(null, null, "reporting", "high")).toBeNull();
  });

  it("subtracts the supplied lead days from the due date", () => {
    expect(computeInternalDueDate("2027-04-30", 21, "reporting", "high")).toBe("2027-04-09");
  });

  it("falls back to the category default when no lead is supplied", () => {
    expect(computeInternalDueDate("2027-04-30", null, "audit", "medium")).toBe("2027-03-01");
  });

  it("returns null rather than collapsing onto the due date itself", () => {
    expect(computeInternalDueDate("2027-04-30", 0, "reporting", "high")).toBeNull();
    expect(computeInternalDueDate("2027-04-30", -5, "reporting", "high")).toBeNull();
  });

  it("clamps an absurd lead time to 180 days", () => {
    expect(computeInternalDueDate("2027-04-30", 3650, "reporting", "high")).toBe("2026-11-01");
    expect(computeInternalDueDate("2027-04-30", 181, "reporting", "high")).toBe(
      computeInternalDueDate("2027-04-30", 180, "reporting", "high"),
    );
  });

  it("crosses a month and year boundary without drifting", () => {
    expect(computeInternalDueDate("2027-01-10", 21, "reporting", "high")).toBe("2026-12-20");
  });
});

describe("classifyRecurrence", () => {
  it("returns unknown for no recurrence", () => {
    expect(classifyRecurrence(null)).toBe("unknown");
    expect(classifyRecurrence("")).toBe("unknown");
  });

  it("classifies quarterly wording", () => {
    expect(classifyRecurrence("quarterly")).toBe("quarterly");
    expect(classifyRecurrence("each quarter")).toBe("quarterly");
    expect(classifyRecurrence("within 30 days of each calendar quarter")).toBe("quarterly");
  });

  it("classifies semiannual wording", () => {
    expect(classifyRecurrence("semiannual")).toBe("semiannual");
    expect(classifyRecurrence("semi-annually")).toBe("semiannual");
    expect(classifyRecurrence("twice a year")).toBe("semiannual");
    expect(classifyRecurrence("biannual")).toBe("semiannual");
    expect(classifyRecurrence("every six months")).toBe("semiannual");
  });

  it("prefers semiannual over annual for semi-annual wording", () => {
    expect(classifyRecurrence("semi-annual")).toBe("semiannual");
  });

  it("classifies monthly wording", () => {
    expect(classifyRecurrence("monthly")).toBe("monthly");
    expect(classifyRecurrence("each month")).toBe("monthly");
  });

  it("classifies annual wording", () => {
    expect(classifyRecurrence("annual")).toBe("annual");
    expect(classifyRecurrence("annually")).toBe("annual");
    expect(classifyRecurrence("yearly")).toBe("annual");
    expect(classifyRecurrence("per year")).toBe("annual");
  });

  it("returns unknown for wording a calendar cannot expand", () => {
    expect(classifyRecurrence("as requested by the funder")).toBe("unknown");
    expect(classifyRecurrence("upon completion")).toBe("unknown");
  });

  it("is case insensitive", () => {
    expect(classifyRecurrence("QUARTERLY")).toBe("quarterly");
  });
});

describe("expandRecurrence", () => {
  it("returns nothing without a first due date — a series cannot be invented", () => {
    expect(expandRecurrence(null, "quarterly", "2027-09-30")).toEqual([]);
    expect(expandRecurrence(null, null, null)).toEqual([]);
  });

  it("returns the single date when the recurrence cannot be classified", () => {
    expect(expandRecurrence("2027-04-30", null, "2027-09-30")).toEqual(["2027-04-30"]);
    expect(expandRecurrence("2027-04-30", "as requested", "2027-09-30")).toEqual(["2027-04-30"]);
  });

  it("returns the single date when the award end is unknown", () => {
    expect(expandRecurrence("2027-01-30", "quarterly", null)).toEqual(["2027-01-30"]);
  });

  it("expands a quarterly series to the end of the award plus a closeout window", () => {
    expect(expandRecurrence("2027-01-30", "quarterly", "2027-09-30")).toEqual([
      "2027-01-30",
      "2027-04-30",
      "2027-07-30",
      "2027-10-30",
    ]);
  });

  it("expands an annual series", () => {
    expect(expandRecurrence("2027-04-30", "annually", "2029-06-30")).toEqual([
      "2027-04-30",
      "2028-04-30",
      "2029-04-30",
    ]);
  });

  it("expands a semiannual series every six months", () => {
    expect(expandRecurrence("2026-10-30", "semiannual", "2027-08-31")).toEqual([
      "2026-10-30",
      "2027-04-30",
      "2027-10-30",
    ]);
  });

  it("expands a monthly series", () => {
    const dates = expandRecurrence("2027-01-15", "monthly", "2027-06-30");
    expect(dates[0]).toBe("2027-01-15");
    expect(dates[1]).toBe("2027-02-15");
    expect(dates).toContain("2027-06-15");
    expect(dates.every((date) => date <= "2027-10-28")).toBe(true);
  });

  it("clamps to the end of a short month — 31 January plus one month is not March", () => {
    const dates = expandRecurrence("2027-01-31", "monthly", "2027-04-30");
    expect(dates[1]).toBe("2027-02-28");
    expect(dates[1].startsWith("2027-03")).toBe(false);
  });

  it("clamps to 29 February in a leap year", () => {
    expect(expandRecurrence("2028-01-31", "monthly", "2028-03-31")[1]).toBe("2028-02-29");
  });

  it("clamps a quarterly 31st to a 30-day month", () => {
    expect(expandRecurrence("2027-01-31", "quarterly", "2027-06-30")).toEqual([
      "2027-01-31",
      "2027-04-30",
      "2027-07-30",
    ]);
  });

  it("does not make clamping sticky — a later long month keeps the earlier day", () => {
    const dates = expandRecurrence("2027-01-31", "monthly", "2027-05-31");
    expect(dates[0]).toBe("2027-01-31");
    expect(dates[1]).toBe("2027-02-28");
    // The series follows the clamped date onwards rather than restoring the 31st.
    expect(dates[2]).toBe("2027-03-28");
  });

  it("respects the occurrence cap so a malformed recurrence cannot run away", () => {
    expect(expandRecurrence("2027-01-31", "monthly", "2099-12-31")).toHaveLength(24);
    expect(expandRecurrence("2027-01-31", "monthly", "2099-12-31", 5)).toHaveLength(5);
  });

  it("returns nothing beyond the horizon when the first date is already past it", () => {
    expect(expandRecurrence("2030-01-31", "quarterly", "2027-02-28")).toEqual([]);
  });

  it("always includes the first date when it is within the horizon", () => {
    expect(expandRecurrence("2027-04-30", "quarterly", "2027-02-28")[0]).toBe("2027-04-30");
  });
});
