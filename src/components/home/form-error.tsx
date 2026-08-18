"use client";

import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface FormErrorProps {
  message: string | null;
}

/** Renders the top-level message from an Edge Function's error envelope.
 * Field-level messages are shown inline next to their own input instead —
 * this is only for the general "something went wrong" line. */
export function FormError({ message }: FormErrorProps) {
  if (!message) return null;
  return (
    <Alert variant="destructive" className="border-2 border-coral">
      <AlertCircle className="size-4" aria-hidden />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
