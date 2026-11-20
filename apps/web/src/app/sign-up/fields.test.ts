import { describe, expect, it } from "vitest";
import { checkSignUpFields } from "./fields";

const valid = { name: "Ana", email: "ana@example.com", password: "12345678" };

describe("checkSignUpFields", () => {
  it("accepts valid fields", () => {
    expect(checkSignUpFields(valid)).toEqual({});
  });

  it("rejects an empty or whitespace-only name, and one over 80 characters", () => {
    expect(checkSignUpFields({ ...valid, name: "   " }).name).toBe("nameRequired");
    expect(checkSignUpFields({ ...valid, name: "a".repeat(81) }).name).toBe("nameRequired");
    expect(checkSignUpFields({ ...valid, name: "a".repeat(80) }).name).toBeUndefined();
  });

  it("rejects an empty or malformed email", () => {
    expect(checkSignUpFields({ ...valid, email: "" }).email).toBe("emailInvalid");
    expect(checkSignUpFields({ ...valid, email: "ana@" }).email).toBe("emailInvalid");
    expect(checkSignUpFields({ ...valid, email: " ana@example.com " }).email).toBeUndefined();
  });

  it("requires a password of 8 to 128 characters, spaces included", () => {
    expect(checkSignUpFields({ ...valid, password: "1234567" }).password).toBe("passwordLength");
    expect(checkSignUpFields({ ...valid, password: "a".repeat(129) }).password).toBe("passwordLength");
    expect(checkSignUpFields({ ...valid, password: "a".repeat(128) }).password).toBeUndefined();
    expect(checkSignUpFields({ ...valid, password: "        " }).password).toBeUndefined();
  });

  it("reports every wrong field at once", () => {
    expect(Object.keys(checkSignUpFields({ name: "", email: "x", password: "" }))).toHaveLength(3);
  });
});
