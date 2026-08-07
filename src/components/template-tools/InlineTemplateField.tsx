import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";

export function InlineTemplateField({
  value,
  onChange,
  className = "",
  style,
  placeholder,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  style?: CSSProperties;
  placeholder?: string;
  ariaLabel: string;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const [localValue, setLocalValue] = useState(value);
  const [isComposing, setIsComposing] = useState(false);
  const isComposingRef = useRef(false);
  const lastSubmittedValueRef = useRef(value);

  useEffect(() => {
    if (isComposingRef.current) return;
    setLocalValue(value);
    lastSubmittedValueRef.current = value;
  }, [value]);

  useLayoutEffect(() => {
    const field = ref.current;
    if (!field) return;
    field.style.height = "0px";
    field.style.height = `${field.scrollHeight}px`;
  }, [localValue]);

  const submitValue = (nextValue: string) => {
    if (lastSubmittedValueRef.current === nextValue) return;
    lastSubmittedValueRef.current = nextValue;
    onChange(nextValue);
  };

  const finishComposition = (nextValue: string) => {
    isComposingRef.current = false;
    setIsComposing(false);
    setLocalValue(nextValue);
    submitValue(nextValue);
  };

  return (
    <textarea
      ref={ref}
      value={localValue}
      rows={1}
      aria-label={ariaLabel}
      placeholder={placeholder}
      className={`block max-w-full resize-none overflow-hidden border border-acidGreen/35 bg-deepIndigo/12 p-0 outline-none transition placeholder:text-current placeholder:opacity-25 focus:border-acidGreen/70 ${className}`.trim()}
      style={{
        ...style,
        font: "inherit",
        letterSpacing: "inherit",
        textAlign: "inherit",
      }}
      onCompositionStart={() => {
        isComposingRef.current = true;
        setIsComposing(true);
      }}
      onCompositionEnd={(event) => finishComposition(event.currentTarget.value)}
      onChange={(event) => {
        const nextValue = event.currentTarget.value;
        setLocalValue(nextValue);
        if (isComposingRef.current || (event.nativeEvent as InputEvent).isComposing) return;
        submitValue(nextValue);
      }}
      onKeyDown={(event) => {
        const nativeEvent = event.nativeEvent;
        const imeIsActive = isComposing
          || isComposingRef.current
          || nativeEvent.isComposing
          || nativeEvent.keyCode === 229;
        if (event.key === "Enter" && imeIsActive) event.stopPropagation();
      }}
      onBlur={(event) => {
        if (!isComposingRef.current) return;
        finishComposition(event.currentTarget.value);
      }}
    />
  );
}
