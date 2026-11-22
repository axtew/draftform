import * as v from "valibot";
import { describe, expectTypeOf, test } from "vitest";
import * as z from "zod";

import { type Form, type FormSchema, type StandardSchemaV1, useForm } from "../..";

const initial = { email: "", password: "", repeat: "", plan: "free", remember: false };

type SignUp = typeof initial;

describe("a schema must fit the form", () => {
  test("zod and valibot schemas of the form's shape, refines included", () => {
    useForm({
      initial,
      schema: z
        .object({
          email: z.email(),
          password: z.string().min(8),
          repeat: z.string(),
          plan: z.string(),
          remember: z.boolean(),
        })
        .refine((data) => data.password === data.repeat, { path: ["repeat"] }),
    });
    useForm({
      initial,
      schema: v.pipe(
        v.object({
          email: v.pipe(v.string(), v.email()),
          password: v.string(),
          repeat: v.string(),
        }),
        v.forward(
          v.partialCheck([["password"], ["repeat"]], (data) => data.password === data.repeat),
          ["repeat"],
        ),
      ),
    });
  });

  test("some of the fields, a narrower type, optional and nullable fields are fine", () => {
    useForm({ initial, schema: z.object({ email: z.email() }) });
    useForm({ initial, schema: z.object({ plan: z.enum(["free", "pro"]) }) });
    useForm({ initial, schema: z.object({ remember: z.literal(true) }) });
    useForm({ initial, schema: z.object({ email: z.string().optional() }) });
    useForm({
      initial: { phone: null as string | null },
      schema: z.object({ phone: z.string().nullable() }),
    });
    useForm({ initial, schema: undefined });
  });

  test("a field of another type is an error", () => {
    // @ts-expect-error: remember is a boolean
    useForm({ initial, schema: z.object({ remember: z.string() }) });
    // @ts-expect-error: the same with valibot
    useForm({ initial, schema: v.object({ email: v.number() }) });
  });

  test("a schema of another form is an error", () => {
    // @ts-expect-error: no field in common
    useForm({ initial, schema: z.object({ title: z.string(), pages: z.number() }) });
    // @ts-expect-error: not an object schema at all
    useForm({ initial, schema: z.string() });
  });

  test("a schema does not change the form's type", () => {
    const form = useForm({ initial, schema: z.object({ plan: z.enum(["free", "pro"]) }) });

    expectTypeOf(form).toEqualTypeOf<Form<SignUp>>();
    expectTypeOf(form.values.plan).toEqualTypeOf<string>();
  });
});

describe("the types", () => {
  test("FormSchema is a Standard Schema over some of the fields", () => {
    expectTypeOf<FormSchema<{ email: string }>>().toEqualTypeOf<
      StandardSchemaV1<{ email?: string | undefined }, unknown>
    >();
  });

  test("formError is a message or null", () => {
    const form = useForm({ initial });

    expectTypeOf(form.formError).toEqualTypeOf<string | null>();
  });
});
