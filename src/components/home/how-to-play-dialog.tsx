import { Dialog, DialogClose, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const STEPS = [
  { emoji: "🧩", text: "Every round shows an emoji sequence — decode what it means." },
  { emoji: "⌨️", text: "Type your answer in the chat box. Faster correct guesses score more." },
  { emoji: "🤫", text: "Once you're right, you move to a private winners' chat — nobody still guessing sees the answer." },
  { emoji: "🏆", text: "After the last round, see final scores plus awards for speed, accuracy, and the biggest comeback." },
];

// Uncontrolled Dialog — unlike identity-fields.tsx's avatar picker, there's
// no external trigger to sync open state with, so no useState needed here.
export function HowToPlayDialog() {
  return (
    <Dialog>
      {/* DialogTrigger renders a <button>, which sizes to its content (not
          full-width like the <p> this replaced) — center it explicitly
          rather than relying on text-center doing nothing on an inline
          element. */}
      <div className="text-center">
        <DialogTrigger className="text-xs font-semibold text-ink-muted underline underline-offset-2">
          how to play
        </DialogTrigger>
      </div>

      <DialogContent
        showCloseButton={false}
        className="w-[calc(100%-2rem)] max-w-sm gap-0 rounded-[20px] border-[2.5px] border-ink bg-surface p-4 shadow-paper ring-0"
      >
        <div className="flex items-center justify-between">
          <DialogTitle className="font-heading text-2xl font-bold text-ink">how to play</DialogTitle>
          <DialogClose
            aria-label="Close"
            className="flex size-7 items-center justify-center rounded-lg border-2 border-ink text-xs font-extrabold text-ink"
          >
            ✕
          </DialogClose>
        </div>

        <ul className="mt-3.5 space-y-3">
          {STEPS.map((step) => (
            <li key={step.text} className="flex items-start gap-2.5 text-sm font-semibold text-ink">
              <span className="text-lg leading-none" aria-hidden>
                {step.emoji}
              </span>
              <span>{step.text}</span>
            </li>
          ))}
        </ul>

        <DialogClose className="doodle-pop mt-3.5 w-full bg-sun py-2.5 text-center font-heading text-lg font-bold text-ink">
          got it
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}
