import type { AttendeeRegistration } from "../types/auth";

export type RegistrationErrors = Partial<Record<keyof AttendeeRegistration | "confirmPassword", string>>;

export function passwordValidation(password: string): string | undefined {
  const characters = Array.from(password);
  // Count UTF-8 bytes without requiring native encoding APIs.
  const bytes = characters.reduce((total, character) => {
    const point = character.codePointAt(0)!;
    return total + (point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4);
  }, 0);
  if (characters.length < 8) return "Use at least 8 characters for your password.";
  if (bytes > 72) return "This password is too long. Shorten it and try again.";
}

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

  const passwordError = passwordValidation(input.password);
  if (passwordError) errors.password = passwordError;

  if (!confirmPassword) errors.confirmPassword = "Confirm your password.";
  else if (input.password !== confirmPassword) errors.confirmPassword = "Passwords don't match.";

  return errors;
}
