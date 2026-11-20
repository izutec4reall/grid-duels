import { Button } from "@/client/components/ui/button";

/** One choice among a few, as a row of pressed/unpressed buttons. */
export function ChoiceGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  testIdPrefix,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  testIdPrefix: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <Button
          key={o.value}
          type="button"
          size="sm"
          variant={o.value === value ? "default" : "outline"}
          aria-pressed={o.value === value}
          data-testid={`${testIdPrefix}-${o.value}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </Button>
      ))}
    </div>
  );
}
