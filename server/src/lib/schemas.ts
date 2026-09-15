import { Type, type Static } from "@sinclair/typebox";

export const ISO_DATE_PATTERN = "^\\d{4}-\\d{2}-\\d{2}$";
const IsoDate = Type.String({ pattern: ISO_DATE_PATTERN, maxLength: 10 });
const Id = Type.String({ minLength: 1, maxLength: 100 });
const ShiftCode = Type.Union(["M", "A", "N", "X", "H", "AL", "ML", "SL"].map((value) => Type.Literal(value)));
const ManualShiftCode = Type.Union(["M", "A", "N", "X", "H"].map((value) => Type.Literal(value)));
const LeaveCode = Type.Union([Type.Literal("AL"), Type.Literal("ML"), Type.Literal("SL")]);

export const IdParamsSchema = Type.Object({ id: Id }, { additionalProperties: false });

export const AuthBodySchema = Type.Object({
  email: Type.String({ minLength: 3, maxLength: 254 }),
  password: Type.String({ minLength: 1, maxLength: 256 }),
}, { additionalProperties: false });

export const AccountDeleteBodySchema = Type.Object({
  password: Type.String({ minLength: 1, maxLength: 256 }),
  confirmation: Type.Literal("DELETE"),
}, { additionalProperties: false });

export const PackageBodySchema = Type.Object({
  packageId: Type.Union([Type.Literal("one"), Type.Literal("six"), Type.Literal("twelve")]),
}, { additionalProperties: false });

export const VerifyPaymentBodySchema = Type.Object({
  reference: Type.String({ minLength: 1, maxLength: 200 }),
}, { additionalProperties: false });

export const StaffBodySchema = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 120 }),
  sex: Type.Union([Type.Literal("M"), Type.Literal("F")]),
  fixedMorning: Type.Boolean(),
  nightEligible: Type.Boolean(),
  active: Type.Boolean(),
  rank: Type.String({ maxLength: 80 }),
}, { additionalProperties: false });

export const StaffPatchSchema = Type.Partial(StaffBodySchema, { additionalProperties: false });

export const StaffBulkSchema = Type.Object({
  names: Type.Array(Type.String({ minLength: 1, maxLength: 120 }), { minItems: 1, maxItems: 200 }),
}, { additionalProperties: false });

export const RulesBodySchema = Type.Object({
  minNight: Type.Integer({ minimum: 1, maximum: 50 }),
  allowTwoMaleNight: Type.Boolean(),
  minAfternoon: Type.Integer({ minimum: 1, maximum: 50 }),
  weeklyOff: Type.Integer({ minimum: 0, maximum: 6 }),
  nightBlockLengths: Type.Array(Type.Integer({ minimum: 1, maximum: 14 }), { minItems: 1, maxItems: 7 }),
  offForBlock: Type.Record(Type.String({ pattern: "^[1-9]\\d?$" }), Type.Integer({ minimum: 0, maximum: 14 }), { maxProperties: 20 }),
  hospitalName: Type.String({ maxLength: 160 }),
  wardName: Type.String({ maxLength: 160 }),
  supportRanks: Type.Array(Type.String({ minLength: 1, maxLength: 80 }), { maxItems: 50, uniqueItems: true }),
}, { additionalProperties: false });

export const RulesPatchSchema = Type.Partial(RulesBodySchema, { additionalProperties: false });

export const LeaveBodySchema = Type.Object({
  staffId: Id,
  type: LeaveCode,
  start: IsoDate,
  end: IsoDate,
}, { additionalProperties: false });

export const HolidayBodySchema = Type.Object({
  date: IsoDate,
  name: Type.String({ minLength: 1, maxLength: 120 }),
}, { additionalProperties: false });

export const RosterBodySchema = Type.Object({
  grid: Type.Record(Id, Type.Record(IsoDate, ShiftCode, { maxProperties: 62 }), { maxProperties: 200 }),
  seed: Type.String({ minLength: 1, maxLength: 200 }),
  generatedAt: Type.String({ minLength: 10, maxLength: 40 }),
  edited: Type.Boolean(),
  notes: Type.Array(Type.String({ maxLength: 500 }), { maxItems: 50 }),
}, { additionalProperties: false });

export const RosterCreateBodySchema = Type.Object({
  ...RosterBodySchema.properties,
  startDate: IsoDate,
  endDate: IsoDate,
}, { additionalProperties: false });

export const CellPatchSchema = Type.Object({
  staffId: Id,
  date: IsoDate,
  code: ManualShiftCode,
}, { additionalProperties: false });

export type AuthBody = Static<typeof AuthBodySchema>;
export type StaffBody = Static<typeof StaffBodySchema>;
export type RulesBody = Static<typeof RulesBodySchema>;
export type LeaveBody = Static<typeof LeaveBodySchema>;
export type HolidayBody = Static<typeof HolidayBodySchema>;
export type RosterBody = Static<typeof RosterBodySchema>;
export type RosterCreateBody = Static<typeof RosterCreateBodySchema>;
export type CellPatchBody = Static<typeof CellPatchSchema>;

export function isRealIsoDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function rangeDays(start: string, end: string): number {
  return Math.floor((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1;
}
