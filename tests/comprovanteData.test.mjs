import test from "node:test";
import assert from "node:assert/strict";
import { motivoDataInvalida } from "../lib/comprovanteData.js";

const agora = new Date("2026-11-04T15:00:00Z"); // 12:00 em Brasília

test("comprovante de hoje vale", () => assert.equal(motivoDataInvalida("2026-11-04", agora), null));
test("sem data visível vale (dia em que chegou)", () => assert.equal(motivoDataInvalida(null, agora), null));
test("comprovante de ontem não vale", () => assert.match(motivoDataInvalida("2026-11-03", agora), /03\/11\/2026/));
test("comprovante de semana passada não vale", () => assert.ok(motivoDataInvalida("2026-10-29", agora)));
test("23h30 em Brasília ainda é o mesmo dia", () => assert.equal(motivoDataInvalida("2026-11-04", new Date("2026-11-05T02:30:00Z")), null));
test("01h em Brasília de 05/11: o de 04/11 já é antigo", () => assert.ok(motivoDataInvalida("2026-11-04", new Date("2026-11-05T04:00:00Z"))));
