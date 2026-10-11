import { describe, expect, it } from "vitest";
import { compile, evaluate, formatDiagnostics, formMessage, initialState } from "./index";
import type { UiNode, UiState } from "./types";

/** The message of the spec's first root, a Form. */
function message(source: string, state?: UiState): string {
  const result = compile(source);
  if (result.program === null) throw new Error(formatDiagnostics(result.diagnostics));
  const { roots, diagnostics } = evaluate(result.program, state ?? initialState(result.program));
  expect(diagnostics).toEqual([]);
  const form: UiNode = roots[0];
  expect(form.type).toBe("Form");
  return formMessage(form);
}

describe("formMessage", () => {
  it("lists every field at any depth in document order", () => {
    expect(
      message(`$name = "Ada"
$size = "M"
$notes = "Ring first"
Form([
  Card("Order", [
    Row([Input($name, label: "Name"), Select($size, ["S", "M", "L"], label: "Size")]),
    Tabs(["More"], [Stack([Text("Anything else?"), TextArea($notes, label: "Notes")])])
  ]),
  Button("Reset", Set($name, ""))
], submit: "Order")`),
    ).toBe("Name: Ada\nSize: M\nNotes: Ring first");
  });

  it("labels unlabeled fields with their state name", () => {
    expect(
      message(`$tier = "Pro"
$when = "2026-10-09"
Form([Choice($tier, ["Basic", "Pro"]), DateInput($when)])`),
    ).toBe("tier: Pro\nwhen: 2026-10-09");
  });

  it("does not add a colon after a question or colon label", () => {
    expect(
      message(`$who = "Me"
$when = "Soon"
Form([Input($who, label: "Who should subscribe?"), Input($when, label: "Deadline:")])`),
    ).toBe("Who should subscribe? Me\nDeadline: Soon");
  });

  it("writes empty values as a dash", () => {
    expect(
      message(`$name = "  "
$size = null
$tags = []
$stars = 0
Form([Input($name, label: "Name"), Select($size, ["S"], label: "Size"), Checklist($tags, ["a"], label: "Tags"), Rating($stars, label: "Rating")])`),
    ).toBe("Name: —\nSize: —\nTags: —\nRating: —");
  });

  it("joins lists, says Yes/No for booleans and formats numbers", () => {
    expect(
      message(`$tags = ["api", "web"]
$items = ["milk", "eggs"]
$notify = true
$public = false
$budget = 1234.567
$seats = 3
$stars = 4
Form([
  Checklist($tags, ["api", "web", "cli"], label: "Areas"),
  ListEditor($items, label: "Shopping"),
  Toggle($notify, "Notify me"),
  Toggle($public, "Public"),
  Slider($budget, 0, 5000, label: "Budget"),
  Stepper($seats, label: "Seats"),
  Rating($stars, label: "Rating")
])`),
    ).toBe("Areas: api, web\nShopping: milk, eggs\nNotify me: Yes\nPublic: No\nBudget: 1,234.57\nSeats: 3\nRating: 4");
  });

  it("is empty for a form without fields", () => {
    expect(message(`Form([Text("Nothing to ask")])`)).toBe("");
  });
});
