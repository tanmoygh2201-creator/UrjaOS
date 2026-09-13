import { describe, expect, it } from "vitest";
import {
  fieldErrors,
  signInSchema,
  signUpSchema,
} from "@/lib/validation/auth";
import { getAuthErrorMessage } from "@/lib/auth/errors";
import { sanitizeRedirect } from "@/lib/auth/redirect";
import { profileSchema } from "@/lib/validation/profile";

describe("signUpSchema", () => {
  const valid = {
    fullName: "Ada Sharma",
    email: "Ada@Example.com",
    password: "password123",
  };

  it("accepts valid input and normalizes email", () => {
    const result = signUpSchema.parse(valid);
    expect(result.email).toBe("ada@example.com");
    expect(result.fullName).toBe("Ada Sharma");
  });

  it("trims whitespace around fields", () => {
    const result = signUpSchema.parse({
      ...valid,
      fullName: "  Ada Sharma  ",
      email: "  ada@example.com  ",
    });
    expect(result.fullName).toBe("Ada Sharma");
    expect(result.email).toBe("ada@example.com");
  });

  it("rejects a too-short name", () => {
    const result = signUpSchema.safeParse({ ...valid, fullName: "A" });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid email", () => {
    const result = signUpSchema.safeParse({ ...valid, email: "not-an-email" });
    expect(result.success).toBe(false);
  });

  it("rejects passwords shorter than 8 characters", () => {
    const result = signUpSchema.safeParse({ ...valid, password: "short" });
    expect(result.success).toBe(false);
  });

  it("rejects passwords longer than 72 characters (Supabase limit)", () => {
    const result = signUpSchema.safeParse({ ...valid, password: "x".repeat(73) });
    expect(result.success).toBe(false);
  });

  it("reports one message per field via fieldErrors", () => {
    const result = signUpSchema.safeParse({
      fullName: "",
      email: "bad",
      password: "short",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = fieldErrors(result.error);
      expect(Object.keys(errors).sort()).toEqual(
        ["email", "fullName", "password"].sort()
      );
      expect(errors.email).toMatch(/valid email/i);
      expect(errors.password).toMatch(/at least 8/i);
    }
  });
});

describe("signInSchema", () => {
  it("accepts valid credentials and lowercases email", () => {
    const result = signInSchema.parse({
      email: "USER@Site.COM",
      password: "whatever",
    });
    expect(result.email).toBe("user@site.com");
  });

  it("requires a non-empty password", () => {
    const result = signInSchema.safeParse({ email: "a@b.com", password: "" });
    expect(result.success).toBe(false);
  });
});

describe("getAuthErrorMessage", () => {
  it("maps user_already_exists to a friendly message", () => {
    const msg = getAuthErrorMessage({
      message: "User already registered",
      code: "user_already_exists",
    });
    expect(msg).toMatch(/already exists/i);
  });

  it("maps invalid credentials without leaking internals", () => {
    const msg = getAuthErrorMessage({
      message: "Invalid login credentials",
      code: "invalid_credentials",
    });
    expect(msg).toMatch(/incorrect email or password/i);
    expect(msg).not.toContain("JWT");
  });

  it("maps rate limits to a friendly message", () => {
    const msg = getAuthErrorMessage({
      message: "Rate limit exceeded",
      status: 429,
    });
    expect(msg).toMatch(/too many attempts/i);
  });

  it("falls back to a generic message for unknown errors", () => {
    const msg = getAuthErrorMessage({
      message: "Some internal JWT signing key detail",
    });
    expect(msg).toBe("Something went wrong. Please try again.");
    expect(msg).not.toContain("JWT");
  });
});

describe("sanitizeRedirect", () => {
  it("allows safe relative paths", () => {
    expect(sanitizeRedirect("/dashboard")).toBe("/dashboard");
    expect(sanitizeRedirect("/analytics?range=7d")).toBe("/analytics?range=7d");
  });

  it("falls back for absolute URLs (open-redirect protection)", () => {
    expect(sanitizeRedirect("https://evil.com", "/dashboard")).toBe("/dashboard");
  });

  it("falls back for protocol-relative URLs", () => {
    expect(sanitizeRedirect("//evil.com", "/dashboard")).toBe("/dashboard");
  });

  it("falls back for backslash tricks", () => {
    expect(sanitizeRedirect("/\\evil.com", "/dashboard")).toBe("/dashboard");
    expect(sanitizeRedirect("\\evil.com", "/dashboard")).toBe("/dashboard");
  });

  it("falls back for embedded protocols", () => {
    expect(
      sanitizeRedirect("/redirect?target=https://evil.com", "/dashboard")
    ).toBe("/dashboard");
  });

  it("falls back for control characters", () => {
    expect(sanitizeRedirect("/a\nb", "/dashboard")).toBe("/dashboard");
  });

  it("returns the fallback for empty or missing values", () => {
    expect(sanitizeRedirect(null, "/dashboard")).toBe("/dashboard");
    expect(sanitizeRedirect("", "/dashboard")).toBe("/dashboard");
    expect(sanitizeRedirect(undefined, "/dashboard")).toBe("/dashboard");
  });

  it("rejects oversized values", () => {
    expect(sanitizeRedirect(`/${"a".repeat(600)}`, "/dashboard")).toBe(
      "/dashboard"
    );
  });
});

describe("profileSchema", () => {
  it("accepts a valid profile with empty phone", () => {
    const result = profileSchema.parse({ fullName: "Ada Sharma", phone: "" });
    expect(result.fullName).toBe("Ada Sharma");
  });

  it("accepts a plausible international phone number", () => {
    const result = profileSchema.parse({
      fullName: "Ada Sharma",
      phone: "+91 98765 43210",
    });
    expect(result.phone).toBe("+91 98765 43210");
  });

  it("rejects letters in phone numbers", () => {
    const result = profileSchema.safeParse({
      fullName: "Ada Sharma",
      phone: "call-me-maybe",
    });
    expect(result.success).toBe(false);
  });
});
