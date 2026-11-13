import type { AttendeeRegistration } from "../types/auth";

export type RegistrationErrors = Partial<Record<keyof AttendeeRegistration | "confirmPassword", string>>;

/** Match backend-python/security.py, including bcrypt's 72-byte UTF-8 limit. */
export function validateRegistration(
  input: AttendeeRegistration,
  confirmPassword: string,
): RegistrationErrors {
  const errors: RegistrationErrors = {};
  const name = input.full_name.trim();
  const email = input.email.trim().toLowerCase();

  if (!name) errors.full_name = "Enter your full name.";
  else if (Array.from(name).length > 120) errors.full_name = "Use at most 120 characters for your name.";

  if (Array.from(email).length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/u.test(email)) {
    errors.email = "Enter a valid email address.";
  }

  const characters = Array.from(input.password);
  // Count code points and UTF-8 bytes without relying on a native encoding module.
  const bytes = characters.reduce((total, character) => {
    const point = character.codePointAt(0)!;
    return total + (point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4);
  }, 0);
  if (characters.length < 8) errors.password = "Use at least 8 characters for your password.";
  else if (bytes > 72) errors.password = "This password is too long. Shorten it and try again.";

  if (!confirmPassword) errors.confirmPassword = "Confirm your password.";
  else if (input.password !== confirmPassword) errors.confirmPassword = "Passwords don't match.";

  return errors;
}
