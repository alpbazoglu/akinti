import { describe, expect, it } from "vitest";

import { translateFieldErrors, translateValidationMessage } from "./translate";

/** A tiny stand-in translator, independent of the real `next-intl` mock, so this test exercises `translate.ts` in isolation. */
function fakeTranslator(messages: Record<string, string>): (key: string, values?: Record<string, unknown>) => string {
  return (key, values) => {
    const message = messages[key];
    if (message === undefined) throw new Error(`Missing message: ${key}`);
    if (!values) return message;
    return Object.entries(values).reduce((acc, [name, value]) => acc.replaceAll(`{${name}}`, String(value)), message);
  };
}

describe("translateValidationMessage", () => {
  it("translates a plain validation key", () => {
    const t = fakeTranslator({ "validation.usernameMin": "Kullanıcı adı en az 3 karakter olmalı" });
    expect(translateValidationMessage(t, "validation.usernameMin")).toBe(
      "Kullanıcı adı en az 3 karakter olmalı",
    );
  });

  it("translates a key with an interpolated param (colon suffix)", () => {
    const t = fakeTranslator({ "validation.duetTooManyTurns": "En fazla {value} tur olabilir." });
    expect(translateValidationMessage(t, "validation.duetTooManyTurns:12")).toBe(
      "En fazla 12 tur olabilir.",
    );
  });

  it("passes through a message that isn't one of our keys (Zod's own defaults)", () => {
    const t = fakeTranslator({});
    expect(translateValidationMessage(t, "Invalid input")).toBe("Invalid input");
  });

  it("passes through an arbitrary caught-error message from a superRefine fallback", () => {
    const t = fakeTranslator({});
    expect(translateValidationMessage(t, "Segments overlap at index 2")).toBe(
      "Segments overlap at index 2",
    );
  });

  it("falls back to the raw message if the key is missing from messages (never throws)", () => {
    const t = fakeTranslator({});
    expect(translateValidationMessage(t, "validation.notARealKey")).toBe("validation.notARealKey");
  });
});

describe("translateFieldErrors", () => {
  it("translates every message in every field, preserving field names", () => {
    const t = fakeTranslator({
      "validation.usernameMin": "Kullanıcı adı en az 3 karakter olmalı",
      "validation.passwordMin": "Şifre en az 8 karakter olmalı",
    });
    const result = translateFieldErrors(t, {
      username: ["validation.usernameMin"],
      password: ["validation.passwordMin"],
    });
    expect(result).toEqual({
      username: ["Kullanıcı adı en az 3 karakter olmalı"],
      password: ["Şifre en az 8 karakter olmalı"],
    });
  });

  it("leaves an undefined field's messages as undefined", () => {
    const t = fakeTranslator({ "validation.usernameMin": "x" });
    const result = translateFieldErrors(t, { username: undefined });
    expect(result.username).toBeUndefined();
  });

  it("passes through non-key messages unchanged alongside translated ones", () => {
    const t = fakeTranslator({ "validation.usernameMin": "Kullanıcı adı en az 3 karakter olmalı" });
    const result = translateFieldErrors(t, {
      username: ["validation.usernameMin"],
      segments: ["Some raw superRefine error"],
    });
    expect(result.username).toEqual(["Kullanıcı adı en az 3 karakter olmalı"]);
    expect(result.segments).toEqual(["Some raw superRefine error"]);
  });
});
