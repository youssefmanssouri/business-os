"use client";

import React, { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Zap, AlertCircle, Loader2 } from "lucide-react";
import { registerAction } from "@/lib/actions";

function RegisterForm() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{
    name?: string[];
    email?: string[];
    password?: string[];
    confirmPassword?: string[];
  }>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    // Client-side instant validation
    const errors: {
      name?: string[];
      email?: string[];
      password?: string[];
      confirmPassword?: string[];
    } = {};

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();

    if (!trimmedName) {
      errors.name = ["Full name is required"];
    } else if (trimmedName.length < 2) {
      errors.name = ["Full name must be at least 2 characters"];
    }

    if (!trimmedEmail) {
      errors.email = ["Email is required"];
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      errors.email = ["Please provide a valid email address"];
    }

    if (!password) {
      errors.password = ["Password is required"];
    } else if (password.length < 8) {
      errors.password = ["Password must be at least 8 characters"];
    }

    if (!confirmPassword) {
      errors.confirmPassword = ["Please confirm your password"];
    } else if (password !== confirmPassword) {
      errors.confirmPassword = ["Passwords do not match"];
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setLoading(true);

    try {
      const res = await registerAction({
        name: trimmedName,
        email: trimmedEmail,
        password,
        confirmPassword,
      });

      if (res.success) {
        router.push("/");
        router.refresh();
      } else {
        if (res.errors) {
          setFieldErrors(
            res.errors as {
              name?: string[];
              email?: string[];
              password?: string[];
              confirmPassword?: string[];
            }
          );
        }
        setError(res.error || "Registration failed. Please review your details and try again.");
      }
    } catch {
      setError("An unexpected network or server error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-50 px-4 py-8 dark:bg-neutral-950">
      <div className="w-full max-w-md space-y-6 text-center">
        {/* Brand */}
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 shadow-md">
            <Zap className="h-6 w-6 text-emerald-400 fill-emerald-400" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-white">
            Create your account
          </h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Start using BusinessOS
          </p>
        </div>

        {/* Register Card */}
        <Card className="p-6 text-left shadow-2xl">
          {error && (
            <div
              role="alert"
              className="mb-4 flex items-center gap-2 rounded-xl bg-rose-500/10 border border-rose-500/30 p-3 text-xs text-rose-700 dark:text-rose-400"
            >
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <label
                htmlFor="name"
                className="text-xs font-semibold text-neutral-700 dark:text-neutral-300"
              >
                Full name
              </label>
              <Input
                id="name"
                name="name"
                type="text"
                required
                autoComplete="name"
                placeholder="John Doe"
                value={name}
                disabled={loading}
                aria-invalid={Boolean(fieldErrors.name)}
                aria-describedby={fieldErrors.name ? "name-error" : undefined}
                onChange={(e) => {
                  setName(e.target.value);
                  if (fieldErrors.name) {
                    setFieldErrors((prev) => ({ ...prev, name: undefined }));
                  }
                }}
              />
              {fieldErrors.name?.[0] && (
                <p id="name-error" className="text-xs text-rose-600 dark:text-rose-400">
                  {fieldErrors.name[0]}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="email"
                className="text-xs font-semibold text-neutral-700 dark:text-neutral-300"
              >
                Email address
              </label>
              <Input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="name@company.com"
                value={email}
                disabled={loading}
                aria-invalid={Boolean(fieldErrors.email)}
                aria-describedby={fieldErrors.email ? "email-error" : undefined}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (fieldErrors.email) {
                    setFieldErrors((prev) => ({ ...prev, email: undefined }));
                  }
                }}
              />
              {fieldErrors.email?.[0] && (
                <p id="email-error" className="text-xs text-rose-600 dark:text-rose-400">
                  {fieldErrors.email[0]}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="password"
                className="text-xs font-semibold text-neutral-700 dark:text-neutral-300"
              >
                Password
              </label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="new-password"
                placeholder="••••••••"
                value={password}
                disabled={loading}
                aria-invalid={Boolean(fieldErrors.password)}
                aria-describedby={fieldErrors.password ? "password-error" : undefined}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (fieldErrors.password) {
                    setFieldErrors((prev) => ({ ...prev, password: undefined }));
                  }
                }}
              />
              {fieldErrors.password?.[0] ? (
                <p id="password-error" className="text-xs text-rose-600 dark:text-rose-400">
                  {fieldErrors.password[0]}
                </p>
              ) : (
                <p className="text-[11px] text-neutral-400">
                  Must be at least 8 characters
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="confirmPassword"
                className="text-xs font-semibold text-neutral-700 dark:text-neutral-300"
              >
                Confirm password
              </label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                required
                autoComplete="new-password"
                placeholder="••••••••"
                value={confirmPassword}
                disabled={loading}
                aria-invalid={Boolean(fieldErrors.confirmPassword)}
                aria-describedby={fieldErrors.confirmPassword ? "confirmPassword-error" : undefined}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (fieldErrors.confirmPassword) {
                    setFieldErrors((prev) => ({ ...prev, confirmPassword: undefined }));
                  }
                }}
              />
              {fieldErrors.confirmPassword?.[0] && (
                <p id="confirmPassword-error" className="text-xs text-rose-600 dark:text-rose-400">
                  {fieldErrors.confirmPassword[0]}
                </p>
              )}
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full gap-2 bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-200 mt-2"
              size="default"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Creating account...</span>
                </>
              ) : (
                <span>Create Account</span>
              )}
            </Button>
          </form>

          <div className="mt-6 border-t border-neutral-100 pt-4 text-center dark:border-neutral-800">
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Already have an account?{" "}
              <Link
                href="/login"
                className="font-semibold text-neutral-900 underline underline-offset-4 hover:text-neutral-700 dark:text-neutral-100 dark:hover:text-neutral-300 transition-colors"
              >
                Sign in
              </Link>
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 flex items-center justify-center" />
      }
    >
      <RegisterForm />
    </Suspense>
  );
}
