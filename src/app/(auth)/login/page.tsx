"use client";

import React, { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Zap, ArrowRight, AlertCircle, ShieldCheck, Building2 } from "lucide-react";
import { loginAction } from "@/lib/actions";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/";

  const [email, setEmail] = useState("youssef@acmecloud.com");
  const [password, setPassword] = useState("AcmeAdmin2026!");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await loginAction({ email, password });
      if (res.success) {
        router.push(callbackUrl);
        router.refresh();
      } else {
        setError(res.error || "Authentication failed. Please check your credentials.");
      }
    } catch {
      setError("An unexpected network or server error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPreset = (presetEmail: string, presetPass: string) => {
    setEmail(presetEmail);
    setPassword(presetPass);
    setError(null);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-50 px-4 dark:bg-neutral-950">
      <div className="w-full max-w-md space-y-6 text-center">
        {/* Brand */}
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 shadow-md">
            <Zap className="h-6 w-6 text-emerald-400 fill-emerald-400" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-white">
            Sign in to BusinessOS
          </h1>
          <p className="text-xs text-neutral-500">
            Secure Multi-Tenant SaaS Workspace &bull; Enterprise Access
          </p>
        </div>

        {/* Login Card */}
        <Card className="p-6 text-left shadow-2xl">
          {error && (
            <div className="mb-4 flex items-center gap-2 rounded-xl bg-rose-500/10 border border-rose-500/30 p-3 text-xs text-rose-700 dark:text-rose-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                Work Email Address:
              </label>
              <Input
                type="email"
                required
                autoComplete="email"
                value={email}
                disabled={loading}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                  Password:
                </label>
                <span className="text-[11px] text-neutral-400">
                  Protected by bcrypt
                </span>
              </div>
              <Input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                disabled={loading}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full gap-2 bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-200"
              size="default"
            >
              <span>{loading ? "Authenticating Session..." : "Sign In to Workspace"}</span>
              <ArrowRight className="h-4 w-4" />
            </Button>
          </form>

          {/* Preset Multi-Tenant Selector for Reviewers */}
          <div className="mt-6 pt-5 border-t border-neutral-100 dark:border-neutral-800 text-xs">
            <div className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
              <span>Verified Test Accounts (Select to test):</span>
            </div>
            <div className="grid grid-cols-1 gap-2">
              <button
                type="button"
                onClick={() => handleSelectPreset("youssef@acmecloud.com", "AcmeAdmin2026!")}
                className="flex items-center justify-between rounded-xl border border-neutral-200 bg-neutral-50 p-2.5 text-left hover:bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:bg-neutral-800/80 transition-colors"
              >
                <div>
                  <div className="font-semibold text-neutral-900 dark:text-neutral-100">
                    Acme Cloud (Tenant 1 &bull; Admin)
                  </div>
                  <div className="text-[10px] text-neutral-400">youssef@acmecloud.com</div>
                </div>
                <Building2 className="h-3.5 w-3.5 text-neutral-400" />
              </button>

              <button
                type="button"
                onClick={() => handleSelectPreset("elena.rostova@apexdynamics.com", "ApexManager2026!")}
                className="flex items-center justify-between rounded-xl border border-neutral-200 bg-neutral-50 p-2.5 text-left hover:bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:bg-neutral-800/80 transition-colors"
              >
                <div>
                  <div className="font-semibold text-neutral-900 dark:text-neutral-100">
                    Apex Dynamics (Tenant 2 &bull; Manager)
                  </div>
                  <div className="text-[10px] text-neutral-400">elena.rostova@apexdynamics.com</div>
                </div>
                <Building2 className="h-3.5 w-3.5 text-neutral-400" />
              </button>
            </div>
          </div>

          <div className="relative my-4 text-center text-xs">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-neutral-200 dark:border-neutral-800" />
            </div>
            <span className="relative bg-white px-2 text-[10px] text-neutral-400 dark:bg-neutral-900">
              Enterprise SSO
            </span>
          </div>

          <Button
            type="button"
            variant="outline"
            disabled
            className="w-full gap-2 opacity-50 cursor-not-allowed"
          >
            <ShieldCheck className="h-4 w-4 text-neutral-400" />
            <span className="text-xs">SAML SSO (Managed by Enterprise IT)</span>
          </Button>
        </Card>

        <p className="text-xs text-neutral-400">
          BusinessOS Enterprise Platform &bull; Protected by HTTP-Only Session Tokens
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 flex items-center justify-center" />}>
      <LoginForm />
    </Suspense>
  );
}
